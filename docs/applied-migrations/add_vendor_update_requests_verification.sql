-- Applied 2026-07-01 to scc_procurement (additive; reference copy).
-- Vendor Onboarding — document verification layer, Phase 1.
-- Holds the auto-verification result on the pending request. A NEW-vendor request has
-- vendor_id = null, so results cannot go to vendor_validations until approval; they live
-- here and are copied across on approve (enrich-on-approve, wired in Phase 5).
--   verification         jsonb        — the full typed-vs-document ledger + per-check results
--   verification_status  text         — pass | mismatch | unverifiable | pending
--   verification_ran_at  timestamptz
alter table scc_procurement.vendor_update_requests
  add column if not exists verification jsonb,
  add column if not exists verification_status text,
  add column if not exists verification_ran_at timestamptz;
