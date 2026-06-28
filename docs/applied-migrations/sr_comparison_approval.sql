-- APPLIED 2026-06-28 to scc_procurement (project fimfybfgjrbkcylmyekz) via Supabase
-- apply_migration (migration name: sr_comparison_approval).
--
-- NOTE: applied by the frontend session with the user's EXPLICIT override of the
-- "frontend only / backend owned by operator" rule in CLAUDE.md. Additive only.
--
-- SR (subcontractor) comparison approval → PO. Mirror of the materials comparison_*
-- flow (s3_comparison_approval / s3b_approval_po_flow). Awards/equalizations already
-- live in sr_award / sr_bid_equalization (boq-scoped); this table holds approval/PO
-- state, one row per boq.
--
-- State machine:
--   draft → pending_approval → approved (PO pending) → po_issued (closed)
--                    ↘ returned ↙ (return from pending, or revoke from approved)
--
-- RPCs (SECURITY DEFINER, granted anon+authenticated):
--   sr_comparison_submit_for_approval(uuid,text) -> mints review_token, status=pending_approval
--   sr_comparison_get_by_token(text)             -> full review payload while pending/approved
--   sr_comparison_decide_by_token(text,text,text)-> approve (keeps token) | return | revoke
--   sr_comparison_issue_po(uuid,text,text)       -> from approved → po_issued, clears token
--
-- VERIFIED end-to-end via SQL on SR-DEMO-001: submit → get(found,3 vendors,4 lines) →
-- approve → issue PO (po_issued). Demo row then reset to draft.
--
-- PENDING (n8n / operator): email Rabia the /sr-comparison-review/<review_token> link on
-- submit; notify officer on approve/return/revoke. (FE shows the link to copy as fallback.)

create table if not exists scc_procurement.sr_comparison (
  sr_comparison_id uuid primary key default gen_random_uuid(),
  boq_id         uuid not null references scc_procurement.sr_boq(boq_id) on delete cascade,
  status         text not null default 'draft',
  review_token   text,
  prepared_by    text,
  approved_by    text,
  decision_notes text,
  review_notes   text,
  po_number      text,
  po_issued_by   text,
  po_issued_at   timestamptz,
  submitted_at   timestamptz,
  approved_at    timestamptz,
  created_by     text,
  created_at     timestamptz not null default now(),
  unique(boq_id)
);
create unique index if not exists sr_comparison_review_token_idx
  on scc_procurement.sr_comparison(review_token) where review_token is not null;
grant select on scc_procurement.sr_comparison to anon, authenticated;

-- Function bodies: see the apply_migration call / Supabase migration history. They mirror
-- the materials comparison_* RPCs exactly, against sr_boq / sr_boq_line / sr_bid /
-- sr_bid_line / sr_bid_equalization / sr_award, returning columns+lines+vendors(+rates)+
-- equalizations+awards in sr_comparison_get_by_token.

grant execute on function scc_procurement.sr_comparison_submit_for_approval(uuid,text) to anon, authenticated;
grant execute on function scc_procurement.sr_comparison_get_by_token(text) to anon, authenticated;
grant execute on function scc_procurement.sr_comparison_decide_by_token(text,text,text) to anon, authenticated;
grant execute on function scc_procurement.sr_comparison_issue_po(uuid,text,text) to anon, authenticated;
