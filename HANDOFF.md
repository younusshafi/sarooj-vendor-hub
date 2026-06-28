# HANDOFF — Sarooj Procurement AI (session 22–27 Jun 2026)

Self-contained handoff so a fresh chat (e.g. Sonnet, post-compaction) can continue without
losing context. Read this top-to-bottom once.

---

## 0. TL;DR — current state

- A complete **procure-to-award flow** for **Materials (MR)** was built and is **live** (frontend + DB +
  n8n): vendor bid link → comparison → equalization → line-by-line award → two-step approval →
  **PO flow** (Approved → PO Pending → PO Issued, revoke-until-PO). **Subcontractor (SR) reuses the same
  comparison/award/approval engine.**
- **Several n8n workflows were edited** (bid link in dispatch emails, VAT rounding, invite URL, test-mode
  config). All **backed up** in `docs/n8n-backups/`.
- **Git:** branch `main`, **`origin/main` is at `6917a85`**, local is **10 commits ahead, NOT pushed**
  (user wants to control pushes). Working tree clean.
- **Biggest single caveat:** the user **explicitly authorized direct DB + n8n edits this session**, which
  normally violate `CLAUDE.md` rule 1 (frontend-only). Stay frontend-only by default; only touch DB/n8n
  when the user re-authorizes. Always **back up an n8n workflow before editing it**.

---

## 1. Environment & access (critical)

| Thing | Value |
|---|---|
| Frontend repo | `C:\Users\sinne\OneDrive\Projects\Sarooj\Procurement\sarooj-vendor-hub-code` |
| Stack | React 19 + Vite + TanStack Router (file-based) + Supabase-js + TS + Tailwind v4 + shadcn |
| Git remote | `github.com/younusshafi/sarooj-vendor-hub`, branch `main`, git user "Sarooj Build" |
| Production URL | **`https://procurement.scc.zavia-ai.com`** (custom domain; NOT the old `sarooj-procurement-coral`) |
| Vercel project | `sarooj-vendor-hub-code` · `prj_thXVTgOL5guQxBQFDbcLeGm9PIQ2` · team `team_kySqSOMKB1BJdPQ1Zyhtparb` (production deploy is READY/live) |
| Supabase project | **`fimfybfgjrbkcylmyekz`** ("SCC"), schema **`scc_procurement`** |
| Supabase anon key | hardcoded in `src/integrations/supabase-external/client.ts` (client sets `db:{schema:'scc_procurement'}`). RLS is **OFF project-wide** (security note). |
| DB access method | MCP `claude.ai Supabase` tools: `apply_migration` / `execute_sql` with `project_id=fimfybfgjrbkcylmyekz` |
| n8n base | `https://n8n.zavia-ai.com`, REST `/api/v1`, header `X-N8N-API-KEY` |
| n8n API key | provided by user (⚠️ **was pasted in plaintext — recommend rotating**). Reuse from prior turns / ask user. |
| App admin | **`younus.shafi.archive@gmail.com`** (the logged-in user; stored in `system_settings.admin_emails`) |
| Procurement head | **Rabia Vahabudeen** (approver) |

**n8n workflow IDs:** WF1 `RPJ9tnpmsQfVEhhU` · WF6 `REVnviNEV0ly3kgd` · WF7 `UV5UaxZ2wkxLJ8K11DRoI` ·
WF8 `IDeJjPRijKAUjVXU` · WF10 `EsLoQthHxlRBzA1E` · WF13 `P3h1q0xScdLh3k2t` · Frame Generator `3B18wGgQnfE6XdfJ`.

**n8n edit recipe (gotcha):** GET the workflow, modify nodes, `PUT /api/v1/workflows/{id}` with body
`{name, nodes, connections, settings}` — **`settings` must be whitelisted** to only:
`saveExecutionProgress, saveManualExecutions, saveDataErrorExecution, saveDataSuccessExecution,
executionTimeout, errorWorkflow, timezone, executionOrder` (extra keys → 400). PUT does not change `active`.
Supabase HTTP nodes use `authentication:none` + hardcoded `apikey`/`Authorization`/`Accept-Profile` headers.

---

## 2. Constraints & conventions (don't break these)

- **Frontend-only by default** (CLAUDE.md rule 1). DB/n8n edits require explicit user OK (granted this session).
- **`scc_procurement` schema** on every Supabase call (client default). **Key on `rfq_id`** (uuid), not `rfq_reference`.
- **`vendors` has no `email`/`contact_person` columns** — contacts live in `vendors.contacts` (jsonb[]);
  recipient address is `rfq_vendors.email_to`.
- **Empty string → null** on writes for non-text columns (rule 5).
- **Materials flows must not regress** (rule 6).
- **OMR = up to 3 decimals (baisa).** VAT rule (implemented everywhere): **compute at full precision, round only the
  final subtotal/VAT/total to 3 dp; total = subtotal + VAT (ties out).** **Display: trim trailing zeros** via the
  shared `src/lib/omr.ts` `fmtOmr` (230,000 not 230,000.000; 1,158.5 keeps baisa) — see CLAUDE.md "Money". Subtle disclaimer shown.
- **Deadline is a DATE.** Bid link locks when `current_date > rfqs.deadline`.
- **DoD gate:** `npx tsc --noEmit` · `npm run lint` · `npm run build` · `node scripts/verify_pr_contracts.mjs`.
  NOTE: `npm run lint` is **already red at baseline** (~75 pre-existing `no-explicit-any`/prettier errors in
  non-session files). Rule we followed: **don't add NEW lint errors**; tsc + build must pass.
- **Test data:** test vendors carry category `TEST_ALWAYS` (e.g. `SCC TEST — …`, vendor_ids like
  `04c194da-…`). `TEST_BATCH` vendors are filtered out of UI. When testing RPCs that write, always clean up.

---

## 3. The procure-to-award feature (the main build)

End-to-end flow (MR; SR reuses it):

```
RFQ issued → vendor opens /bid/<token> → enters rates/brand/qty/remarks → submits (revise until deadline)
  → writes bids + bid_items → officer opens Compare bids → equalizes excluded scope (B) → awards per line (C)
  → Submit for approval → Rabia opens /comparison-review/<token> → Approve (link stays live) OR Return
  → officer records PO + "Mark PO Issued" → closed. Rabia can Revoke until PO issued.
```

**Design principle:** share *logic*, not components. Token-gated public flows (bid, review) use
SECURITY-DEFINER RPCs (modeled on the `rr`/rental-request app pattern). Officer in-app actions
(equalize/award/submit/issue-PO) are authenticated. PO generation itself is **out of scope** (officer
records the PO number only).

---

## 4. Database — everything applied this session (live, `scc_procurement`)

All additive except two `comparisons_status_check` widenings. Records in `docs/applied-migrations/`.

**New tables**
- `comparison_equalizations` (equalization_id, comparison_id, rfq_item_id, vendor_id, equalization_omr,
  note, created_by, created_at; unique(comparison_id,rfq_item_id,vendor_id)) — **B**.
- `comparison_awards` (award_id, comparison_id, rfq_item_id, awarded_vendor_id, awarded_bid_id, reason,
  created_by, created_at; unique(comparison_id,rfq_item_id)) — **C**.

**New columns**
- `rfq_vendors.bid_token` (text, unique, default `replace(gen_random_uuid()::text,'-','')`, backfilled),
  `rfq_vendors.bid_submitted_at` (timestamptz) — **A/S4**.
- `bid_items.brand` (text) — **A**.
- `comparisons.review_token`, `comparisons.review_notes` — **S3**.
- `comparisons.po_number`, `po_issued_at`, `po_issued_by` — **PO flow**.

**`comparisons.status` values now:** `draft, finalised, pending_approval, returned, approved, po_issued`.

**Triggers:** `trg_eq_lock` / `trg_aw_lock` on the two eval tables → fn `tg_block_when_approved` raises if
parent `comparisons.status in ('approved','po_issued')` (locks awards/equalizations once approved).

**RPCs (all `scc_procurement`)**
- `bid_get_by_token(text)` → `{found,locked,rfq,vendor,items,existing_bid}` or `{found:false}`. SECURITY
  DEFINER, granted anon. Valid while `rfqs.status='issued'`; `locked = current_date > deadline`.
- `bid_submit_by_token(text,jsonb)` → writes a new `bids` row (revision++, is_latest_revision) + `bid_items`;
  flips `rfq_vendors` to responded; **full-precision subtotal, round finals 3dp, total=sub+vat**; rejects past
  deadline. SECURITY DEFINER, anon.
- `comparison_submit_for_approval(uuid,text)` → mints `review_token`, status `pending_approval`. anon/auth.
- `comparison_get_by_token(text)` → full review payload; **found while status in ('pending_approval','approved')**
  (so Rabia can still revoke after approval).
- `comparison_decide_by_token(text,text,text)` → `approve` (pending→approved, **keeps review_token**),
  `return` (pending→returned, clears token), `revoke` (approved→returned, clears token).
- `comparison_issue_po(uuid,text,text)` → approved→po_issued, sets PO fields, clears token. granted authenticated.
- `set_dispatch_test_mode(boolean)` → SECURITY DEFINER, **revoked from anon, granted authenticated**; checks
  caller's `auth.jwt()->>'email'` against `system_settings.admin_emails`; updates `dispatch_test_mode`.

**`system_settings` rows added:** `dispatch_test_mode`=`on`, `dispatch_test_recipients` (JSON: the 10 SCC test
vendor objects moved out of WF7, incl. their vendor_ids), `admin_emails`=`["younus.shafi.archive@gmail.com"]`.

---

## 5. n8n — changes applied this session (all backed up in `docs/n8n-backups/`, see `CHANGES.md`)

- **WF8 `IDeJjPRijKAUjVXU` + WF13 `P3h1q0xScdLh3k2t` (dispatch):** `Fetch Vendors` select now includes
  `bid_token`; `Build Email Body` appends a clickable link `…/bid/${v.bid_token}` (HTML). Verified.
- **WF10 `EsLoQthHxlRBzA1E` (`Calculate Totals`):** VAT rounding → full-precision subtotal, round only finals,
  `total = sub_ex + vat`. Verified (old per-line rounding drifted 0.278 OMR on a high-qty example; removed).
- **WF6 `REVnviNEV0ly3kgd` (`Validate Fields`):** invite emails had no working link; now always sets
  `registration_url='https://procurement.scc.zavia-ai.com/register'`. Verified.
- **WF7 `UV5UaxZ2wkxLJ8K11DRoI`:** test recipients **no longer hardcoded**. `Fetch T&Cs and DB Categories`
  query extended to `setting_key=in.(rfq_terms_and_conditions,dispatch_test_mode,dispatch_test_recipients)`;
  `Merge Vendors + Build Email Prompt` reads `$('Fetch T&Cs and DB Categories').all()` and appends the test
  recipients only when `dispatch_test_mode='on'`. **Verified structurally + logic-simulated (10 on / 0 off);
  NOT yet run through a live generation** (user must do one test SAP-upload→generate).

**WF7 is intentionally LEFT on test-recipient behavior** — user keeps test mode while testing. Go-live =
admin flips test mode OFF in Settings (no code change).

**Verification sweep done (read-only):** WF4 "schema drift" = **not a defect** (contact_person is an inbound
form field mapped into `contacts[]`, not a dead column). WF1 `OUTREACH_TEST` gate = **safe** (only queries
`categories cs.{OUTREACH_TEST}` vendors). WF6 = fixed above. WF10 VAT = was per-line, now fixed.

---

## 6. Frontend — files added/changed

**New libs (seams):** `src/lib/rfq-vendors.ts` (shared recipient/test/group helpers),
`src/lib/bid-link.ts` (bid RPC wrappers+types), `src/lib/comparison-eval.ts` (equalization/award load+save),
`src/lib/comparison-approval.ts` (approval RPC wrappers).

**New routes (public, no auth):** `src/routes/bid.$token.tsx` (vendor bid form),
`src/routes/comparison-review.$token.tsx` (Rabia approve/return/revoke).

**New components:** `src/components/comparison-award-panel.tsx` (equalize + per-line award + split summary,
`locked` when approved/po_issued), `src/components/bid-links-panel.tsx` (officer copies/emails each vendor's
bid link — manual delivery until n8n confirmation emails exist).

**Modified (key):**
- `routes/_app/rfq.$rfqId.index.tsx` — materials Vendors tab shows **recipients only when issued** +
  "Show all matched" toggle; mounts `BidLinksPanel`.
- `routes/_app/rfq.$rfqId.comparison.tsx` — mounts award panel; **Approval card** (submit / pending+link /
  approved=PO-pending+PO entry / po_issued=closed); `ApprovalStatusBadge`.
- `routes/_app/rfq.sub.$rfqId.tsx` — SR detail: passes `status`, mounts `BidLinksPanel`, "Compare & Award
  bids →" link to `/rfq/$rfqId/comparison`, read-only after issue. Tab "Frame"→"BoQ Upload".
- `components/rfq-vendor-list.tsx`, `rfq-editable-fields.tsx`, `rfq-email-editor.tsx` — SR read-only-when-issued.
- `routes/_app/settings.tsx` — **admin-only Dispatch Test Mode toggle** (TEST/LIVE badge, confirm dialog,
  `set_dispatch_test_mode` RPC).
- `routes/_app/index.tsx` — dashboard "Recent RFQs" shows "latest 5 of N · View all".
- `routes/_app/rfq.preview.tsx` — email preview renders by default (C2); send-confirm names vendors (C4).
- `lib/frame-email.ts` — schedule inserts **above** signature (C1).
- `components/vendor-form/DocumentUpload.tsx` — file limit 10→60 MB (C5).
- comparison/exportComparison — **lowest bid green** (was crimson/pink).

---

## 7. Other completed fixes / facts

- **PR sanity check (21 Jun upload):** no data loss. "7 PRs showed 5" = dashboard "Recent RFQs (latest 5)"
  cap by design; PR Tracker shows all. `rfqs.pr_numbers` is a **plural array** (RFQ↔PR is many-to-many).
- **Subcontractor app merged** into the main app (one sidebar/dashboard/tracker); standalone app can be
  decommissioned after parity.
- DB now **22 base tables, 1415 vendors**; `category_group_map` = **301 categories, 26 groups**.

---

## 8. Commits — pushed vs unpushed

Session = **26 commits** (`0a74c8d..HEAD`). **`origin/main` is at `6917a85`** (16 pushed earlier).
**10 commits are local-only (unpushed):**

```
7790950 feat: approval PO flow (Approved→PO Pending→PO Issued, revoke-until-PO)
0d7f5bc chore: post-change backup of WF7
ae42500 feat: WF7 test recipients now config-driven (Phase 3)
ed3fe0c feat: dispatch test mode → config + admin-gated toggle (Phase 1+2)
abd2eb1 fix: C1 schedule above signature + WF6 invite registration URL
1c99ecd feat: VAT rounding rule (full precision, 3dp, no drift)
77c0d1b docs: record n8n WF8/WF13 bid-link change
9a3a62c chore: backup n8n workflows before edits
c3bfddc feat: frontend finishers (dashboard count, send-confirm names, email preview, file size)
c0eca3f feat(S5): subcontractor evaluation (shared comparison) + bid-links panel
```
(Pushed earlier through `6917a85`: subcontractor merge, vendor-tab recipients, lowest-bid green, S2, S3, S4.)
Pushing `main` triggers a Vercel deploy; unverified-commit builds may need a **manual Redeploy**.

---

## 9. Repo doc index

- `HANDOFF.md` (this file) · `BACKLOG.md` (parked ideas + pending) · `SUBCONTRACTOR_MERGE_PLAN.md` ·
  `VENDOR_TAB_PLAN.md`
- `docs/PROCURE_TO_AWARD_SPEC.md` — the A/B/C/D contract spec
- `docs/PROGRESS_REPORT_2026-06-23.pdf` (+ .html) — client-facing report
- `docs/applied-migrations/` — `s2_…`, `s3_…`, `s3b_approval_po_flow.sql`, `s4_…`, `test_mode_config.md`
- `docs/backend-prompts/` — claude.ai prompts (S2, S4) if backend ever rebuilt from prompts
- `docs/n8n-backups/` — pre/post JSON snapshots + `CHANGES.md` (rollback path for every n8n edit)

---

## 10. PENDING — what's left

**Needs the USER to act**
1. Run **one live WF7 generation test** (SAP upload → generate) — only unverified n8n change.
2. **Live bid-link dispatch test** to a TEST_ALWAYS recipient (via the app Send flow; safe).
3. **Push** the 10 commits when ready.
4. In-app: log in as admin and try the **Settings → Dispatch Test Mode** toggle (positive path needs a logged-in admin JWT — only testable in-app).

**Next build items (mine, when greenlit)**
5. **Notification emails (new n8n send workflows):** vendor confirmation on bid submit; **email Rabia** the
   `/comparison-review/<review_token>` link on submit; **notify officer** on approve/return/revoke. (The
   "officer notified on approval" part of the PO requirement lives here.) These are bigger — new workflows.
6. **Negotiation/revision flows** (formal revised quote with per-item note + new link; negotiated-price log
   with channel + accept/reject confirmation + audit trail) and **add-vendor-to-issued-RFQ** — awaiting user's
   procurement sign-off.
7. **SR bid form to RFQ template** + **B2 frame presentation** (section headers vs priced lines) + **B3
   doc-type guard** — **blocked**: need the **BOQ frame line-item template** + **SR covering-email template**
   from the user.
8. **NQ auto-equalization** — awaiting user yes/no (recommended: exclude-NQ-vendor-from-total, not a magic number).

**Smaller / optional (see BACKLOG.md)**
- Finish test-mode at go-live (flip OFF) · B1 (WF12 suggest-only) · WF12 trust fixes · G1 (Frame casing
  dedup) · G2 (T&Cs Drive sharing — needs Drive access) · E1 (PR-based RFQ creation) · D1–D4 (Module 1
  onboarding validation, safe-outreach demo, refresh outreach, category-group wiring — D4 needs Rabia sign-off)
  · BoQ single-source-of-truth (parked) · adopt SR rich per-vendor status in MR vendor table.

---

## 11. How to test what's built (dev server)

`npm run dev` (was on `:5173`/`:5179`). Then:
- **Bid form:** `/(bid)/<token>` — any `rfq_vendors.bid_token`. Invalid token → error state; past-deadline → read-only.
- **Comparison/award:** open an MR RFQ with bids → **Compare bids** → equalize/award → **Save** → **Submit for
  approval** → copy the review link.
- **Approval:** open `/comparison-review/<review_token>` (incognito = "Rabia") → Approve → back on comparison
  shows **PO Pending** + PO field; enter PO + **Mark PO Issued** (closed) OR reopen review link → **Revoke**.
- **Test mode:** Settings (as admin) → toggle (confirm dialog).

When testing RPCs that write to live data, **always clean up** (delete created bid/bid_items, restore
`rfq_vendors`/`comparisons` status). Pattern used all session: do action → assert → delete/restore.

---

## 12. Gotchas cheat-sheet
- n8n PUT: whitelist `settings` keys (else 400). Back up before editing. `this.helpers.httpRequest` is **not**
  used anywhere → avoid relying on it in Code nodes.
- Supabase REST defaults to `public` schema → must send `Accept-Profile: scc_procurement` (the supabase-js
  client + existing n8n nodes already do).
- `comparisons` had a `comparisons_status_check` CHECK constraint — widening status values requires dropping/
  re-adding it (done for `pending_approval/returned/approved` and again for `po_issued`).
- RLS is OFF → anon key can read/write most tables; security for sensitive actions is in SECURITY-DEFINER RPCs
  (test-mode flip, token flows). Flag to backend operator for a real security pass.
- Lint baseline is red; only ensure no NEW errors; tsc+build must pass.
