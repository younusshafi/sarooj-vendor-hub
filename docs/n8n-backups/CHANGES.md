# n8n changes applied (live)

All edits made via the n8n public API. Backups of the pre-change workflows are the
`*_2026-06-23.json` files in this folder — restore by PUT-ing the backup's
`{name, nodes, connections, settings}` back to `/api/v1/workflows/{id}`.

## 2026-06-23 — Add vendor bid link to dispatch emails (WF8 + WF13)

Base URL: `https://procurement.scc.zavia-ai.com` (this app's production custom domain).

**WF8 — SCC WF8 RFQ Dispatch** (`IDeJjPRijKAUjVXU`) and
**WF13 — SCC WF13 Subcontractor Dispatch** (`P3h1q0xScdLh3k2t`):
1. `Fetch Vendors` node — added `bid_token` to the PostgREST `select`.
2. `Build Email Body` node — appended, before the `return`:
   ```js
   if (v.bid_token) { body += `<br><br>—<br><strong>Submit your quotation online</strong> ` +
     `(your unique, single-use link — the only way to submit your quote):<br>` +
     `<a href="https://procurement.scc.zavia-ai.com/bid/${v.bid_token}">…/bid/${v.bid_token}</a>`; }
   ```

Verified: PUT 200, both workflows still `active=true`, re-fetch shows the changes; the
email body was simulated against a real RFQ + token and renders a correct clickable link.

**Still to do (live test):** one real dispatch on a TEST RFQ (TEST_ALWAYS recipients = SCC
team) to visually confirm the received email's link — to be triggered by the officer via the
app's Send flow.

## 2026-06-24 — VAT rounding rule (WF10)

**WF10 — SCC WF10 Response Monitor** (`EsLoQthHxlRBzA1E`), `Calculate Totals` node:
changed from **round-per-line-then-sum** to **full-precision through the subtotal, round
only the finals (3 dp)**, with the grand total tying exactly to subtotal + VAT:
```js
subtotalEx += exTotalOmr;                 // full precision (was += round3(exTotalOmr))
const subtotal_ex_vat_omr = round3(subtotalEx);
const vat_amount_omr      = round3(subtotal_ex_vat_omr * 0.05);
const total_inc_vat_omr   = round3(subtotal_ex_vat_omr + vat_amount_omr); // ties out
```
Backup: `WF10_Response_Monitor_EsLoQthHxlRBzA1E_2026-06-24.json`. Same rule applied to the
bid-form RPC `bid_submit_by_token` and the frontend bid form / comparison display (computed to
3 dp; displayed via `src/lib/omr.ts` `fmtOmr` which trims trailing zeros — see CLAUDE.md "Money").
Verified: tie-out holds; a high-qty example showed the old rule drifting 0.278 OMR, now removed.

## 2026-06-24 — WF6 invite registration URL (defect fix)

**WF6 — SCC Vendor Invite Pipeline** (`REVnviNEV0ly3kgd`): the AI prompt said
"Include this registration URL: {{ $json.registration_url }}", but that field was a
caller-supplied input that was empty/retired — so invite emails had no working link.
Fix: the `Validate Fields` node now always sets
`registration_url = 'https://procurement.scc.zavia-ai.com/register'`.
Backup: `WF6_Invite_REVnviNEV0ly3kgd_2026-06-24.json`. PUT 200, active.

## 2026-06-24 — WF7 test recipients → config-driven (Phase 3)

**WF7 — SCC WF7 RFQ Agent** (`UV5UaxZ2wkxLJ8K11DRoI`). Removed the 10 hardcoded
`TEST_ALWAYS` recipients from code; they're now read from config:
1. `Fetch T&Cs and DB Categories` node — query extended to
   `setting_key=in.(rfq_terms_and_conditions,dispatch_test_mode,dispatch_test_recipients)`.
2. `Merge Vendors + Build Email Prompt` node — the hardcoded `TEST_RECIPIENTS` array is
   replaced by logic that reads `$('Fetch T&Cs and DB Categories').all()`, and appends
   recipients **only when `dispatch_test_mode = 'on'`**, parsed from `dispatch_test_recipients`.
Backup: `WF7_RFQ_Agent_UV5UaxZ2wkxLJ8K11DRoI_2026-06-23.json`.

Verified (short of a live generation): PUT 200, active; T&Cs is a proven ancestor of the merge
node; existing T&Cs consumers `.find()` by key so are unaffected; the extended fetch returns 3
rows; merge logic yields 10 recipients when ON / 0 when OFF; no `@sarooj` emails remain in code.
**Final confirmation needs one test SAP-upload → generate run** (side effects — user-triggered).

## Not changed (intentionally)
- **WF7** test-recipient scaffold (10 `TEST_ALWAYS` SCC team emails) — left as-is for now;
  this is what keeps test dispatches landing on the team. See the "better approach"
  recommendation (config-driven TEST_MODE divert) before go-live.
