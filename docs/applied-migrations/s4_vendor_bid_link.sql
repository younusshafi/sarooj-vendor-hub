-- APPLIED to project fimfybfgjrbkcylmyekz (SCC), schema scc_procurement, 2026-06-22
-- via Supabase management (migration name: s4_vendor_bid_link). Additive only.
-- Adds rfq_vendors.bid_token (+ default + unique) & bid_submitted_at, bid_items.brand,
-- and two SECURITY-DEFINER RPCs (granted to anon) for the public /bid/$token page.
-- Verified end-to-end via the anon client (get + submit + revise + cleanup).
--
-- STILL PENDING (n8n / operator):
--   * dispatch email (scc-rfq-dispatch) must include each vendor's link
--     https://<app>/bid/<rfq_vendors.bid_token> and carry only the link (no schedule);
--   * vendor confirmation email on submit;
--   * disable inbound email->AI bid extraction for these RFQs (link is sole intake).
-- Also: deadline is a DATE; link locks when current_date > deadline (submit through the
-- deadline day). exclusions/key_conditions are text[]; the form's free text is wrapped
-- into a single-element array on submit.

alter table scc_procurement.rfq_vendors add column if not exists bid_token text;
alter table scc_procurement.rfq_vendors add column if not exists bid_submitted_at timestamptz;
update scc_procurement.rfq_vendors set bid_token = replace(gen_random_uuid()::text,'-','') where bid_token is null;
alter table scc_procurement.rfq_vendors alter column bid_token set default replace(gen_random_uuid()::text,'-','');
create unique index if not exists rfq_vendors_bid_token_key on scc_procurement.rfq_vendors(bid_token);
alter table scc_procurement.bid_items add column if not exists brand text;

-- Functions bid_get_by_token(text) and bid_submit_by_token(text, jsonb):
-- see the full definitions in the migration history / dashboard. Summary:
--  * bid_get_by_token: resolves token -> rfq_vendor; returns {found:false} if unknown or
--    rfqs.status<>'issued'; else {found,locked,rfq,vendor,items,existing_bid(latest rev)}.
--  * bid_submit_by_token: rejects when current_date>deadline; computes per-line totals and
--    header subtotal/vat/total from vat_treatment; inserts a new bids row (revision=prev+1,
--    is_latest_revision, status='submitted', vendor_name from vendors, entered_by='vendor-link')
--    + bid_items; flips rfq_vendors to responded/response_received/bid_submitted_at; returns
--    {ok,bid_id,revision}. Both SECURITY DEFINER, search_path=scc_procurement,public,
--    granted EXECUTE to anon, authenticated.
