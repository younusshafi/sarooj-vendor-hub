# Proposal — Subcontractor BOQ-driven RFQ (data model, lifecycle, theming)

Status: **DRAFT for approval.** Nothing here is applied yet. The user authorized new
database objects on condition that **no existing table is touched** — this design adds
new tables only and *references* existing ones (`rfqs`, `rfq_vendors`) by foreign key.

Scope: turn an uploaded BOQ (PDF/Excel, parsed by the external service) into a live
subcontractor RFQ that mirrors the existing **materials** flow:

1. **RFQ draft (officer)** — officer reviews/edits the parsed BOQ skeleton + sets column visibility.
2. **RFQ document (vendor)** — per-vendor perishable link; vendor fills rates, auto-totals,
   per-line exclusions, commercial terms, attachments; **Submit** writes to DB; link locks at
   the deadline; officer can re-open for negotiation.
3. **Comparison sheet** — each vendor's submission laid over the BOQ skeleton + equalization + award.

The crux vs materials: materials lines are a **fixed** schema (`description/qty/unit`); a BOQ is
**flexible** (Section, Location, Length, …). So the skeleton and the per-vendor submission must
store flexible columns. The existing `bids`/`bid_items` tables can't hold that and we're not
allowed to alter them — hence new `sr_*` tables.

---

## 1. Design principles

- **Additive only.** New tables are prefixed `sr_` (subcontract RFQ). They FK to `rfqs.rfq_id` and
  `rfq_vendors.rfq_vendor_id` but never alter them. Dropping the whole feature = drop the `sr_*`
  tables; materials is untouched.
- **Reuse the proven token + deadline mechanics.** The perishable per-vendor link already exists:
  `rfq_vendors.bid_token` + `rfqs.deadline` (lock when `current_date > deadline`). We do **not**
  re-invent tokens; the SR submit RPC reads the same token and deadline.
- **The source decides the columns.** The skeleton stores the parser's flexible columns verbatim,
  plus per-column metadata (visible-to-vendor, role: qty/unit/desc/internal) so the document and the
  auto-calc know which column is which.
- **Officer judgement is data, not code.** Column visibility, the finalized rows, and the
  internal/price flags are stored on the skeleton at issue time — not recomputed per render.
- **Vendor never types a total.** Line `amount = qty × unit_rate`, totals sum server-side; the
  client value is indicative (same contract as the materials bid form).
- **Security via SECURITY DEFINER RPCs**, modelled exactly on the existing `bid_*_by_token`
  functions (RLS is off project-wide; sensitive writes go through definer functions granted to anon).

---

## 2. New tables

### `sr_boq` — the issued BOQ skeleton (one per RFQ)
| column | type | notes |
|---|---|---|
| `boq_id` | uuid pk | `default gen_random_uuid()` |
| `rfq_id` | uuid | **FK → `rfqs.rfq_id`** (existing) |
| `columns` | jsonb | ordered array of column defs (see below) |
| `source_kind` | text | `'pdf'` \| `'xlsx'` |
| `source_filename` | text | original upload name |
| `scope` | text | discipline/scope line (editable) |
| `status` | text | `'draft'` \| `'issued'` \| `'closed'` |
| `created_by` | text | officer email |
| `created_at` | timestamptz | `default now()` |
| `issued_at` | timestamptz | null until issued |

`columns` element shape:
```jsonc
{ "key": "c3", "name": "Item Description", "visible": true, "role": "desc" }
// role ∈ "desc" | "qty" | "unit" | "code" | "data" | "internal"
// visible=false  → hidden from the vendor RFQ document (Budget, MR Ref, source prices…)
// role qty/unit  → drive the Amount = qty × rate auto-calc
// role internal  → never shown to vendor even if someone flips visible
```

### `sr_boq_line` — the skeleton rows
| column | type | notes |
|---|---|---|
| `line_id` | uuid pk | stable id → submissions join to this |
| `boq_id` | uuid | FK → `sr_boq` (on delete cascade) |
| `seq` | int | render order |
| `role` | text | `'ITEM'` \| `'SECTION'` \| `'NOTE'` \| `'TOTAL'` |
| `cells` | jsonb | array of strings aligned to `sr_boq.columns` |
| `incomplete` | bool | code-only item needing a description (D4/V1) |

### `sr_bid` — one per vendor submission (revisable)
| column | type | notes |
|---|---|---|
| `bid_id` | uuid pk | |
| `boq_id` | uuid | FK → `sr_boq` |
| `rfq_vendor_id` | uuid | **FK → `rfq_vendors.rfq_vendor_id`** (existing) — the vendor + their token |
| `revision` | int | increments on each resubmit |
| `is_latest` | bool | one latest revision per vendor |
| `status` | text | `'submitted'` \| `'reopened'` |
| `vat_treatment` | text | `'exclusive'` \| `'inclusive'` |
| `quotation_ref` | text | |
| `payment_terms` | text | |
| `validity_days` | int | |
| `subcontract_period` | text | |
| `exclusions` | text | overall exclusions |
| `notes` | text | |
| `subtotal_omr` | numeric(14,3) | snapshot at submit (full precision → 3dp) |
| `vat_omr` | numeric(14,3) | |
| `total_omr` | numeric(14,3) | = subtotal + vat (ties out) |
| `submitted_at` | timestamptz | |
| `reopened_until` | date | negotiation window (null = none) |
| `reopened_by` | text | officer email |
| `reopen_reason` | text | |

### `sr_bid_line` — per-line vendor entry
| column | type | notes |
|---|---|---|
| `bid_line_id` | uuid pk | |
| `bid_id` | uuid | FK → `sr_bid` (on delete cascade) |
| `line_id` | uuid | FK → `sr_boq_line` (which ITEM line) |
| `unit_rate_omr` | numeric(14,3) | vendor input; null = "no quote" |
| `amount_omr` | numeric(14,3) | computed qty × rate at submit |
| `remark` | text | per-line exclusion / clarification |

### `sr_bid_attachment` — vendor uploads
| column | type | notes |
|---|---|---|
| `attachment_id` | uuid pk | |
| `bid_id` | uuid | FK → `sr_bid` |
| `filename` | text | |
| `storage_ref` | text | Supabase Storage path or Drive URL |
| `mime` | text | |
| `size_bytes` | bigint | |
| `uploaded_at` | timestamptz | |

### `sr_bid_equalization` — the procurement "factor" (comparison stage)
The materials `comparison_equalizations` keys on `rfq_item_id` (fixed material items) and can't be
reused for flexible BOQ lines without altering it. New, parallel table:
| column | type | notes |
|---|---|---|
| `equalization_id` | uuid pk | |
| `boq_id` | uuid | FK → `sr_boq` |
| `line_id` | uuid | FK → `sr_boq_line` |
| `rfq_vendor_id` | uuid | FK → `rfq_vendors` |
| `adjustment_omr` | numeric(14,3) | +/- normalising factor for this vendor's exclusion |
| `note` | text | why (cites the vendor's remark) |
| `created_by` | text | officer |
| `created_at` | timestamptz | |
| | | unique(`line_id`,`rfq_vendor_id`) |

---

## 3. Lifecycle & RPCs (all `scc_procurement`, SECURITY DEFINER where token-gated)

**Issue (officer, authenticated)** — `sr_boq_issue(rfq_id, columns jsonb, lines jsonb)`
- Inserts `sr_boq` + `sr_boq_line` from the finalized draft; sets `status='issued'`, `issued_at`.
- Per-vendor links already exist on `rfq_vendors.bid_token` (reused). Returns `boq_id`.

**Vendor opens link (anon)** — `sr_bid_get_by_token(token)`
- Resolves `rfq_vendors` by token → `rfqs` → `sr_boq`.
- Returns: `{ found, locked, rfq, vendor, columns (visible only), lines (visible cells), existing_bid }`.
- `locked = current_date > rfqs.deadline AND (reopened_until is null OR current_date > reopened_until)`.
- Visible-only projection happens **server-side** (internal columns never leave the DB).

**Vendor submits (anon)** — `sr_bid_submit_by_token(token, payload jsonb)`
- Rejects if locked. Upserts `sr_bid` (revision++ , flips `is_latest`), writes `sr_bid_line`,
  computes `amount = qty × rate`, **full-precision subtotal → round finals 3dp, total = sub+vat**.
- Mirrors `bid_submit_by_token` exactly (same rounding contract, same revision semantics).

**Officer re-opens for negotiation (authenticated)** — `sr_bid_reopen(bid_id, until date, reason)`
- Sets `reopened_until`, `reopened_by`, `reopen_reason`, `status='reopened'`. The vendor's link works
  again until `until`; their resubmit lands as the next revision (full audit trail kept).

**Comparison (authenticated)** reads `sr_bid_line` joined to `sr_boq_line` across all latest `sr_bid`
rows for the RFQ, plus `sr_bid_equalization` adjustments → the comparison sheet. Award reuses the
existing `comparison_awards` concept (or a parallel `sr_*` award table if FK constraints require).

---

## 4. How the three views bind to this

| View | Reads | Writes |
|---|---|---|
| RFQ draft (officer) | parser service output | `sr_boq` + `sr_boq_line` (+ column visibility) on **Issue** |
| RFQ document (vendor) | `sr_bid_get_by_token` (visible projection) | `sr_bid` + `sr_bid_line` + `sr_bid_attachment` on **Submit** |
| Comparison sheet | `sr_boq_line` × `sr_bid_line` × `sr_bid_equalization` | `sr_bid_equalization`, awards |

No materials table is read or written by any of the above.

---

## 5. Theming — green (facilities) vs charcoal (procurement)

Confirmed from `src/styles.css`:
- **Green = facilities**, the **default `:root`** palette: primary `#0D3D2E`, accent `#12A67A`
  (emerald), cream `#F4F8F6` background. The officer `_app` shell currently renders this (no
  `data-theme` set).
- **Charcoal = procurement**, `[data-theme="charcoal"]`: charcoal chrome `#232227` (header/sidebar),
  crimson `#98191D` primary/accent, `#F6F4F3` background, border `#D5D3D2`.
- The existing **procurement vendor pages already use charcoal**: `bid.$token.tsx` and
  `comparison-review.$token.tsx` both wrap in `data-theme="charcoal"` and use **semantic tokens**
  (`bg-header`, `text-header-foreground`, `bg-primary`, `var(--accent)`, `border-border`).

**Problem to fix:** my sandbox `RfqDocument` hardcodes the green palette (`#1B4332`, `#2D5A40`,
`#C8DDD7`, `#E0EAE5`). That is the facilities look, wrong for a procurement document.

**Recommendation:**
1. The **RFQ document (vendor)** must mirror `bid.$token.tsx`: wrap in `data-theme="charcoal"` and
   replace every hardcoded green hex with the semantic token —
   header → `bg-header text-header-foreground`, section bars → `bg-primary text-primary-foreground`,
   borders → `border-border`/`var(--border)`, bands → `bg-secondary`/`bg-muted`, accents →
   `var(--accent)`. Then it inherits the procurement (charcoal) look automatically and stays correct
   if the palette ever changes.
2. The **officer sandbox/draft** should use semantic tokens too (it mostly does). Whether the whole
   procurement `_app` shell should switch to charcoal app-wide is a **separate decision** affecting
   every existing officer page — I would not re-theme the shell unilaterally. My recommendation: theme
   the **vendor RFQ document charcoal now** (it's vendor-facing procurement, matches the bid page);
   raise the app-shell theme as its own question.

*(This re-skin is a small, mechanical follow-up — swap hexes for tokens + add the `data-theme`
wrapper. I'll do it on your go-ahead; it doesn't change the data-model work above.)*

---

## 6. Open questions before applying

1. **Apply now or stage?** I have Supabase MCP access; on approval I can apply these as a migration to
   `scc_procurement`. Recommend applying to a throwaway first / or reviewing the exact SQL before run.
2. **Attachments storage:** Supabase Storage bucket vs the existing Drive-upload n8n path the SR flow
   already uses. Reusing the Drive path keeps one mechanism; Storage is simpler/self-contained.
3. **Award table:** reuse `comparison_awards` (materials) by adding nullable SR FKs would *touch* it —
   not allowed. So a parallel `sr_award` table. Confirm that's acceptable (one more `sr_` table).
4. **Charcoal re-skin of the RFQ document:** do it as the immediate next frontend step?

---

*One-line summary: add `sr_*` tables that hold the flexible BOQ skeleton + per-vendor submissions +
equalization, reuse the existing token/deadline mechanics and the comparison concept, touch no
materials table, and dress the vendor RFQ document in the charcoal procurement theme like the
existing bid page.*
