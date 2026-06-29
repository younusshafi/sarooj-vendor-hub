-- Applied 2026-06-28 via Supabase MCP apply_migration (additive).
-- Purpose: split the buyer's instructions/requirements out of the covering email.
--   WF7 now writes a thin invitation into rfqs.covering_email_body and the
--   requirements (T&Cs) into rfqs.vendor_instructions; the /bid portal shows the
--   latter read-only. Email = invitation only; portal = the workspace.
-- Changes:
--   1. rfqs.vendor_instructions text (nullable, additive)
--   2. bid_get_by_token() now selects + returns rfq.vendor_instructions

alter table scc_procurement.rfqs
  add column if not exists vendor_instructions text;

-- See live definition via:
--   select pg_get_functiondef('scc_procurement.bid_get_by_token(text)'::regprocedure);
-- The only changes vs the prior version: added `vendor_instructions` to the
-- `select ... into v_rfq` list and to the returned `rfq` jsonb object.
