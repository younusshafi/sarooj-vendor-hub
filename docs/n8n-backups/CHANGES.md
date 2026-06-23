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

## Not changed (intentionally)
- **WF7** test-recipient scaffold (10 `TEST_ALWAYS` SCC team emails) — left as-is for now;
  this is what keeps test dispatches landing on the team. See the "better approach"
  recommendation (config-driven TEST_MODE divert) before go-live.
