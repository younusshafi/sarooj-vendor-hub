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
bid-form RPC `bid_submit_by_token` and the frontend bid form / comparison display (3 dp).
Verified: tie-out holds; a high-qty example showed the old rule drifting 0.278 OMR, now removed.

## 2026-06-24 — WF6 invite registration URL (defect fix)

**WF6 — SCC Vendor Invite Pipeline** (`REVnviNEV0ly3kgd`): the AI prompt said
"Include this registration URL: {{ $json.registration_url }}", but that field was a
caller-supplied input that was empty/retired — so invite emails had no working link.
Fix: the `Validate Fields` node now always sets
`registration_url = 'https://procurement.scc.zavia-ai.com/register'`.
Backup: `WF6_Invite_REVnviNEV0ly3kgd_2026-06-24.json`. PUT 200, active.

## Not changed (intentionally)
- **WF7** test-recipient scaffold (10 `TEST_ALWAYS` SCC team emails) — left as-is for now;
  this is what keeps test dispatches landing on the team. See the "better approach"
  recommendation (config-driven TEST_MODE divert) before go-live.
