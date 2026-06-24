# APPLIED — Dispatch test mode → config + admin gate (2026-06-24)

Project `fimfybfgjrbkcylmyekz` (SCC), schema `scc_procurement`.

## Config rows (system_settings) — seeded
- `dispatch_test_mode` = `on` (RFQ dispatch goes only to test recipients while on).
- `dispatch_test_recipients` = JSON array of the 10 SCC test vendor objects (moved verbatim
  out of WF7's hardcoded `TEST_RECIPIENTS`, incl. their vendor_ids).
- `admin_emails` = `["younus.shafi.archive@gmail.com"]` (who may flip the flag).

## RPC — admin-gated flip (SECURITY DEFINER)
`set_dispatch_test_mode(p_on boolean)`:
- reads the caller's email from their signed-in JWT (`auth.jwt()->>'email'`);
- rejects anyone not in `admin_emails` ("Not authorized");
- updates `dispatch_test_mode`.
- EXECUTE revoked from `anon`, granted to `authenticated` → non-signed-in callers get
  "permission denied" (verified). Enforcement is server-side and can't be bypassed via the API.

## Frontend
Settings page has a "Dispatch Test Mode" card: status badge (TEST/LIVE) for everyone; the
toggle (with a confirm dialog) shows only to admins and calls the RPC.

## Still pending — Phase 3 (WF7)
WF7's `Merge Vendors + Build Email Prompt` node still hardcodes the 10 recipients and always
appends them. It must be changed to read `dispatch_test_mode` + `dispatch_test_recipients` from
config and append only when mode = on. Until then, flipping the flag has no effect on WF7.
