-- APPLIED 2026-06-27 to scc_procurement (project fimfybfgjrbkcylmyekz) via Supabase apply_migration.
-- Migration name: sr_boq_rfq_tables
--
-- SR BOQ-driven RFQ: flexible BOQ skeleton + per-vendor submissions.
-- Additive only; references existing rfqs(rfq_id) / rfq_vendors(id) by FK, alters nothing.
-- RLS left off to match project-wide posture (security via SECURITY DEFINER RPCs, to follow).
-- See docs/SR_BOQ_RFQ_PROPOSAL.md for the design rationale.
--
-- Verified after apply: 7 tables created —
--   sr_boq(10 cols,1 fk) sr_boq_line(6,1) sr_bid(21,2) sr_bid_line(6,2)
--   sr_bid_attachment(7,1) sr_bid_equalization(8,3) sr_award(8,4)

create table if not exists scc_procurement.sr_boq (
  boq_id          uuid primary key default gen_random_uuid(),
  rfq_id          uuid not null references scc_procurement.rfqs(rfq_id) on delete cascade,
  columns         jsonb not null default '[]'::jsonb,
  source_kind     text,
  source_filename text,
  scope           text,
  status          text not null default 'draft',
  created_by      text,
  created_at      timestamptz not null default now(),
  issued_at       timestamptz
);
create index if not exists sr_boq_rfq_id_idx on scc_procurement.sr_boq(rfq_id);

create table if not exists scc_procurement.sr_boq_line (
  line_id    uuid primary key default gen_random_uuid(),
  boq_id     uuid not null references scc_procurement.sr_boq(boq_id) on delete cascade,
  seq        int not null default 0,
  role       text not null default 'ITEM',
  cells      jsonb not null default '[]'::jsonb,
  incomplete boolean not null default false
);
create index if not exists sr_boq_line_boq_id_idx on scc_procurement.sr_boq_line(boq_id);

create table if not exists scc_procurement.sr_bid (
  bid_id             uuid primary key default gen_random_uuid(),
  boq_id             uuid not null references scc_procurement.sr_boq(boq_id) on delete cascade,
  rfq_vendor_id      uuid not null references scc_procurement.rfq_vendors(id) on delete cascade,
  revision           int not null default 1,
  is_latest          boolean not null default true,
  status             text not null default 'submitted',
  vat_treatment      text default 'exclusive',
  quotation_ref      text,
  payment_terms      text,
  validity_days      int,
  subcontract_period text,
  exclusions         text,
  notes              text,
  subtotal_omr       numeric(14,3),
  vat_omr            numeric(14,3),
  total_omr          numeric(14,3),
  submitted_at       timestamptz,
  reopened_until     date,
  reopened_by        text,
  reopen_reason      text,
  created_at         timestamptz not null default now()
);
create index if not exists sr_bid_boq_id_idx on scc_procurement.sr_bid(boq_id);
create index if not exists sr_bid_rfq_vendor_id_idx on scc_procurement.sr_bid(rfq_vendor_id);
create unique index if not exists sr_bid_latest_uq on scc_procurement.sr_bid(boq_id, rfq_vendor_id) where is_latest;

create table if not exists scc_procurement.sr_bid_line (
  bid_line_id   uuid primary key default gen_random_uuid(),
  bid_id        uuid not null references scc_procurement.sr_bid(bid_id) on delete cascade,
  line_id       uuid not null references scc_procurement.sr_boq_line(line_id) on delete cascade,
  unit_rate_omr numeric(14,3),
  amount_omr    numeric(14,3),
  remark        text
);
create index if not exists sr_bid_line_bid_id_idx on scc_procurement.sr_bid_line(bid_id);
create index if not exists sr_bid_line_line_id_idx on scc_procurement.sr_bid_line(line_id);

create table if not exists scc_procurement.sr_bid_attachment (
  attachment_id uuid primary key default gen_random_uuid(),
  bid_id        uuid not null references scc_procurement.sr_bid(bid_id) on delete cascade,
  filename      text,
  storage_ref   text,
  mime          text,
  size_bytes    bigint,
  uploaded_at   timestamptz not null default now()
);
create index if not exists sr_bid_attachment_bid_id_idx on scc_procurement.sr_bid_attachment(bid_id);

create table if not exists scc_procurement.sr_bid_equalization (
  equalization_id uuid primary key default gen_random_uuid(),
  boq_id          uuid not null references scc_procurement.sr_boq(boq_id) on delete cascade,
  line_id         uuid not null references scc_procurement.sr_boq_line(line_id) on delete cascade,
  rfq_vendor_id   uuid not null references scc_procurement.rfq_vendors(id) on delete cascade,
  adjustment_omr  numeric(14,3) not null default 0,
  note            text,
  created_by      text,
  created_at      timestamptz not null default now(),
  unique(line_id, rfq_vendor_id)
);
create index if not exists sr_bid_equalization_boq_id_idx on scc_procurement.sr_bid_equalization(boq_id);

create table if not exists scc_procurement.sr_award (
  award_id       uuid primary key default gen_random_uuid(),
  boq_id         uuid not null references scc_procurement.sr_boq(boq_id) on delete cascade,
  line_id        uuid not null references scc_procurement.sr_boq_line(line_id) on delete cascade,
  rfq_vendor_id  uuid references scc_procurement.rfq_vendors(id) on delete set null,
  awarded_bid_id uuid references scc_procurement.sr_bid(bid_id) on delete set null,
  reason         text,
  created_by     text,
  created_at     timestamptz not null default now(),
  unique(line_id)
);
create index if not exists sr_award_boq_id_idx on scc_procurement.sr_award(boq_id);
