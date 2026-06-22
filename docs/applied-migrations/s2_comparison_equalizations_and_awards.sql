-- APPLIED to project fimfybfgjrbkcylmyekz (SCC), schema scc_procurement, on 2026-06-22
-- via Supabase management (migration name: s2_comparison_equalizations_and_awards).
-- Additive only (two new tables). Mirrors existing project posture: RLS disabled,
-- granted to anon + authenticated (the app uses the anon client directly).
-- Frontend wired in src/lib/comparison-eval.ts (COMPARISON_EVAL_STUBBED = false).
--
-- NOTE for backend operator: the S2 spec called for RLS + lock-when-approved. This
-- project currently runs RLS-OFF everywhere, so these tables match that. The
-- "no writes once comparison is approved" lock is NOT enforced at the DB yet —
-- add a trigger/policy when the S3 approval lock lands (see PROCURE_TO_AWARD_SPEC §5/§8).

create table if not exists scc_procurement.comparison_equalizations (
  equalization_id  uuid primary key default gen_random_uuid(),
  comparison_id    uuid not null references scc_procurement.comparisons(comparison_id) on delete cascade,
  rfq_item_id      uuid not null references scc_procurement.rfq_items(item_id) on delete cascade,
  vendor_id        uuid not null references scc_procurement.vendors(vendor_id),
  equalization_omr numeric not null,
  note             text not null default '',
  created_by       text,
  created_at       timestamptz not null default now(),
  unique (comparison_id, rfq_item_id, vendor_id)
);

create table if not exists scc_procurement.comparison_awards (
  award_id          uuid primary key default gen_random_uuid(),
  comparison_id     uuid not null references scc_procurement.comparisons(comparison_id) on delete cascade,
  rfq_item_id       uuid not null references scc_procurement.rfq_items(item_id) on delete cascade,
  awarded_vendor_id uuid not null references scc_procurement.vendors(vendor_id),
  awarded_bid_id    uuid references scc_procurement.bids(bid_id),
  reason            text,
  created_by        text,
  created_at        timestamptz not null default now(),
  unique (comparison_id, rfq_item_id)
);

grant all on scc_procurement.comparison_equalizations to anon, authenticated;
grant all on scc_procurement.comparison_awards to anon, authenticated;
