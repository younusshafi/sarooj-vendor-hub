# Procure-to-Award — frontend ↔ backend contract spec

Status: **draft for build**, 2026-06-22. Source: procurement officer requirements (see `BACKLOG.md`).
This is the interface both sides build to. **Frontend = this repo (rule 1: no schema/n8n/RPC edits).
Backend = operator** (Supabase tables, RLS, SECURITY-DEFINER RPCs, n8n emails).

Pattern reused throughout: the **rr (rental-request)** app
(`Facilities/SCC Lease Frontend Code/scc-lease-frontend`) — single-use token links via Postgres RPC,
browser writes via SECURITY-DEFINER RPC + anon key, single-use enforced by workflow state.

OMR amounts are 3-decimal. All money fields `numeric`. Empty string → `null` on write (rule 5).

---

## 0. Scope

| In scope | Out of scope (for now) |
|---|---|
| A vendor bid-entry link (MR) | PO tables + PO generation (officer raises POs manually) |
| B exclusion equalization | SR bid intake/comparison (phase 2 — needs SR bid model) |
| C per-line award **selection** (stored) | AI email-extraction (retired for these RFQs) |
| D officer→Rabia approval + lock | reviewer/verifier approval stages (Rabia only) |
| deadline extension (dashboard) | |

Auth model: **A and D are unauthenticated** (token RPCs). **B and C are in-app authenticated**
(procurement officer) → direct table upserts under RLS are acceptable; RPCs optional.

---

## 1. Backend data-model changes (operator)

### New columns
- `rfq_vendors.bid_token text unique` — per-recipient opaque token (issued at dispatch).
- `rfq_vendors.bid_submitted_at timestamptz null` — last submit time (null = not yet).
- `bid_items.brand text null` — per-line brand/make (vendor-entered).

### New tables (all keyed to a comparison)
```
comparison_equalizations            -- B: officer's per-line, per-vendor exclusion budget
  equalization_id  uuid pk
  comparison_id    uuid  -> comparisons
  rfq_item_id      uuid  -> rfq_items
  vendor_id        uuid  -> vendors
  equalization_omr numeric not null   -- added to that vendor's line for fair comparison
  note             text not null      -- what the budget covers (required)
  created_by       text
  created_at       timestamptz default now()
  unique (comparison_id, rfq_item_id, vendor_id)

comparison_awards                   -- C: which vendor wins each line
  award_id          uuid pk
  comparison_id     uuid -> comparisons
  rfq_item_id       uuid -> rfq_items
  awarded_vendor_id uuid -> vendors
  awarded_bid_id    uuid -> bids
  reason            text null         -- required when not the lowest-equalized
  created_by        text
  created_at        timestamptz default now()
  unique (comparison_id, rfq_item_id)
```

### Existing columns reused (no change)
- bid header: `bids.{payment_structure,advance_percentage,credit_days,pdc_days,payment_method,
  delivery_terms,delivery_location,delivery_lead_time_days,validity_days,vat_treatment,currency,
  quotation_reference,quotation_date,exclusions,key_conditions,notes,scope_coverage_percent,
  manufacturer_brand,subtotal_ex_vat_omr,vat_amount_omr,total_inc_vat_omr,revision,is_latest_revision,
  status,rfq_vendor_id,vendor_id,vendor_name,rfq_id,entered_by,entered_at}`
- bid line: `bid_items.{rfq_item_id,unit_price_omr,quantity_offered,total_price_omr,deviations_from_rfq,
  description,unit,sap_item_number,bid_id}`
- approval: `comparisons.{status,prepared_by,approved_by,approval_date,approved_at,decision_notes,
  selection_type}` + new `comparisons.review_token text`.

---

## 2. Workstream A — Vendor bid-entry link  (FE route + 2 token RPCs)

### Frontend route (this repo)
`/bid/$token` — public, no auth, no app chrome. Mirrors rr `rr.review.$token.tsx`.
States: loading · invalid/expired/locked · already-submitted (view-only) · valid (form) · success.

### RPC: `bid_get_by_token(p_token text) → json`
```
found:false                                  -- invalid token
{ found:true,
  locked: bool,                              -- now > deadline (read-only)
  rfq:    { rfq_id, rfq_reference, title, deadline, rfq_type, project_name },
  vendor: { vendor_id, company_name, contact_person, email_to },
  items:  [ { rfq_item_id, item_number, sap_item_number, description, quantity, unit } ],
  existing_bid: null | {                     -- latest revision, for prefill on re-open
    header: {...}, lines: [ { rfq_item_id, unit_price_omr, quantity_offered, brand,
                             deviations_from_rfq } ], revision }
}
```
Token valid while `rfqs.status='issued'`. Note `quantity`, `unit` are display-only.

### RPC: `bid_submit_by_token(p_token text, p_payload jsonb) → json`
```
p_payload = {
  header: { quotation_reference?, quotation_date?, currency?='OMR',
            payment_structure?, advance_percentage?, credit_days?, pdc_days?, payment_method?,
            delivery_terms?, delivery_location?, delivery_lead_time_days?, validity_days?,
            vat_treatment ('inclusive'|'exclusive'), scope_coverage_percent?,
            exclusions?, key_conditions?, notes? },
  lines: [ { rfq_item_id, unit_price_omr|null, quantity_offered|null, brand?, deviations_from_rfq? } ]
}
returns { ok:true, bid_id, revision } | { ok:false, error }
```
Server MUST: validate token; **reject if now > deadline**; re-validate types/ranges; compute per-line
`total_price_omr = unit_price_omr * coalesce(quantity_offered, rfq qty)`, and header
`subtotal_ex_vat_omr / vat_amount_omr / total_inc_vat_omr` from lines + `vat_treatment`; insert a NEW
`bids` row with `revision = prev+1`, set prior `is_latest_revision=false`; insert `bid_items`;
set `rfq_vendors.status='responded'`, `response_received=true`, `bid_submitted_at=now()`. **Editable
until deadline** (re-submit = new revision, last wins). Then send vendor **confirmation email** (n8n).

Lines with null `unit_price_omr` = **NQ** (partial quotes allowed).

### Email + intake (n8n, operator)
Dispatch email carries **only the link** (not the schedule); copy states quotes are accepted **only**
via the link; reply-to is no-reply/un-ingested; **disable inbound AI extraction** for these RFQs.

### Deadline extension (FE, this repo — authenticated)
Control on the RFQ detail (and/or dashboard): update `rfqs.deadline` (allowed write). Reopens links
automatically (RPC deadline check is dynamic).

---

## 3. Workstream B — Exclusion equalization  (in-app, authenticated officer)

FE (comparison screen): for each vendor line that carries a `deviations_from_rfq`/exclusion, show the
remark prominently and let the officer enter an **equalization value + required note**. Upsert into
`comparison_equalizations (comparison_id, rfq_item_id, vendor_id, equalization_omr, note, created_by)`.

Ranking: **equalized line value = `unit_price_omr*qty + equalization_omr`**. The "lowest" highlight,
the per-line award default (C), and the totals all use the **equalized** figure. The comparison view
and the exported sheet show **raw vs equalized** side by side; raw bid data is never mutated.

---

## 4. Workstream C — Per-line award selection  (in-app, authenticated officer)

FE (comparison screen): a per-row **vendor selector**, defaulting to the **lowest-equalized** vendor;
require a `reason` when the officer picks a non-lowest vendor (mirrors `selection_type=
selected_not_lowest`, but per line). Upsert into `comparison_awards (comparison_id, rfq_item_id,
awarded_vendor_id, awarded_bid_id, reason)`. Show a **split summary**: per vendor → lines + total
(equalized). No PO generation — this is the officer's worksheet to raise POs externally.

---

## 5. Workstream D — Approval (officer → Rabia)  (FE actions + 3 token RPCs)

State machine on `comparisons.status`:
`draft → pending_approval → approved` (terminal, locked) | `pending_approval → returned → pending_approval`.

### Officer "Submit for approval" (FE, authenticated)
Calls `comparison_submit_for_approval(p_comparison_id uuid, p_actor text) → {ok,error?}`:
set `status='pending_approval'`, set `prepared_by=actor`, mint `review_token`, **email Rabia** (n8n)
with link `/comparison-review/$token`. Guard: require every line awarded + every equalization noted.

### Rabia review page (FE) `/comparison-review/$token` — public, no auth (mirror rr review)
- `comparison_get_by_token(p_token) → { found, status, rfq, items_with_rates_equalizations_awards,
  bids, totals }` — `found:false`/used when not `pending_approval`.
- `comparison_decide_by_token(p_token, p_decision 'approve'|'return', p_notes) →
  { ok, error? }`:
  - **approve** → `status='approved'`, `approved_by='Rabia Vahabudeen'`, `approved_at`,
    `approval_date`; **LOCK**: comparison + `comparison_awards` + `comparison_equalizations` + bids
    become immutable (enforce in RLS/RPC: no writes when status='approved'). Notify **officer** (n8n).
  - **return** → `status='returned'`, store `decision_notes`; notify **officer**. Officer edits and
    re-submits (token re-mints or reuses per stage).

States rendered: loading · invalid/expired/used ("Response Recorded") · valid (approve/return panel)
· done.

---

## 6. Frontend routes (this repo)

| Route | Auth | Purpose |
|---|---|---|
| `/bid/$token` | none | vendor bid form (A) |
| `/comparison-review/$token` | none | Rabia approval (D) |
| existing `/rfq/$rfqId/comparison` | app | officer: equalize (B) + award (C) + submit for approval (D) |
| existing RFQ detail / dashboard | app | deadline extension (A) |

---

## 7. Validation (client = UX; RPC = authority)

- Money: `numeric ≥ 0`, stored to 3 decimals. `quantity_offered ≥ 0`. `*_days`, `*_percentage` integers ≥ 0.
  (Display trims trailing zeros via `src/lib/omr.ts` `fmtOmr` — see CLAUDE.md "Money".)
- `vat_treatment ∈ {inclusive, exclusive}`. Currency default `OMR`.
- Partial quotes allowed (null line = NQ). A submit with zero priced lines is allowed but warned.
- Deadline: RPC rejects writes when `now > rfqs.deadline`.
- B: `equalization_omr` requires a non-empty `note`. C: non-lowest award requires a `reason`.
- D submit: all lines awarded; locked state blocks all further writes.

---

## 8. Security

- Tokens (`bid_token`, `review_token`): unguessable (≥128-bit random), opaque, single per
  vendor/stage. Single-use/lock enforced **server-side by state** (rr pattern): bid link locks at
  deadline; review link dead once status ≠ `pending_approval`.
- Unauthenticated paths touch data **only** through SECURITY-DEFINER RPCs scoped by token; no broad
  anon table grants.
- Authenticated officer writes (B/C, submit, deadline) under RLS; all writes blocked when comparison
  `status='approved'`.

---

## 9. Implementation stages

Backend slices and frontend slices are built **in parallel against this contract**; frontend stubs
the RPCs until the backend slice lands, then wires through.

- **S1 (FE, ships now, no backend):** deadline-extension control on RFQ detail/dashboard
  (`rfqs.deadline` write). Self-contained, useful immediately.
- **S2 — B+C (comparison upgrades):** backend adds `comparison_equalizations` + `comparison_awards`
  (+RLS); FE adds equalization inputs, equalized ranking (reuse the green lowest highlight), per-line
  award selector + split summary. Improves today's bids regardless of intake.
- **S3 — D (approval):** backend `comparisons.review_token` + status machine + 3 RPCs + 2 emails; FE
  "Submit for approval" + `/comparison-review/$token`. Lock-on-approve.
- **S4 — A (vendor link, MR):** backend `bid_token`/`bid_submitted_at`/`bid_items.brand` + 2 RPCs +
  link-only dispatch email + vendor confirmation + retire AI inbound; FE `/bid/$token` form.
- **S5 — SR phase 2:** define SR bid model (BoQ schedule, per-line scope coverage), then apply A–D.

Each stage gated by: `tsc · lint · build · verify:contracts` + manual smoke (materials no-regress).
