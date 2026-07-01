-- Applied 2026-07-01 to scc_procurement (additive grant; reference copy).
-- The vendor-verify n8n job needs the service_role key (a) for the PRIVATE vendor-documents
-- bucket (anon is upload-only) AND (b) to read/write vendor_update_requests. But the custom
-- scc_procurement schema was only exposed to anon/authenticated, so service_role REST calls
-- 403'd with "permission denied for schema scc_procurement" (SQLSTATE 42501). Grant it.
-- Additive; does not affect anon/authenticated.
grant usage on schema scc_procurement to service_role;
grant select, insert, update, delete on all tables in schema scc_procurement to service_role;
grant usage, select on all sequences in schema scc_procurement to service_role;
grant execute on all functions in schema scc_procurement to service_role;
alter default privileges in schema scc_procurement grant select, insert, update, delete on tables to service_role;
