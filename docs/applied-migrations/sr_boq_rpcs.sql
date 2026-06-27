-- APPLIED 2026-06-27 to scc_procurement (project fimfybfgjrbkcylmyekz) via Supabase apply_migration.
-- Migrations: sr_boq_line_add_qty, sr_boq_rpcs, sr_bid_submit_carry_reopen_window
--
-- SECURITY DEFINER RPCs for the SR BOQ-driven RFQ flow. Mirror the materials
-- bid_*_by_token pattern. All granted to anon + authenticated (RLS off, client is anon).
--
-- END-TO-END TESTED against scratch data (created + cleaned up; no real data touched):
--   A get_by_token → VISIBLE columns only; hidden "Budget" column + its cell values never
--     appear in the payload (server-side projection — internal data never leaves the DB).
--   B submit → subtotal 900.000 / VAT 45.000 / total 945.000 (full precision → round finals
--     3dp, total = sub+vat); per-line amount = rate × qty; per-line remark/exclusion stored.
--   C revisions: revision++ with single is_latest; past deadline → locked=true, submit rejected.
--   D negotiation: sr_bid_reopen unlocks; a negotiated resubmit CARRIES the reopen window
--     forward (the carry-window fix) so the link stays open until the officer's date.

alter table scc_procurement.sr_boq_line add column if not exists qty numeric;

-- Officer: create the issued BOQ skeleton from the finalized draft.
create or replace function scc_procurement.sr_boq_issue(
  p_rfq_id uuid, p_columns jsonb, p_lines jsonb,
  p_scope text default null, p_source_kind text default null,
  p_source_filename text default null, p_actor text default null
) returns jsonb
language plpgsql security definer set search_path to 'scc_procurement','public'
as $$
declare v_boq_id uuid; v_line jsonb; v_seq int := 0;
begin
  insert into sr_boq (rfq_id, columns, source_kind, source_filename, scope, status, created_by, issued_at)
  values (p_rfq_id, coalesce(p_columns,'[]'::jsonb), p_source_kind, p_source_filename, p_scope, 'issued', p_actor, now())
  returning boq_id into v_boq_id;
  for v_line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    v_seq := v_seq + 1;
    insert into sr_boq_line (boq_id, seq, role, cells, incomplete, qty)
    values (v_boq_id, coalesce((v_line->>'seq')::int, v_seq),
      coalesce(v_line->>'role','ITEM'), coalesce(v_line->'cells','[]'::jsonb),
      coalesce((v_line->>'incomplete')::boolean, false), nullif(v_line->>'qty','')::numeric);
  end loop;
  return jsonb_build_object('ok', true, 'boq_id', v_boq_id);
end; $$;

-- Vendor (anon, token): read the issued BOQ — VISIBLE columns only (internal projected out).
create or replace function scc_procurement.sr_bid_get_by_token(p_token text)
returns jsonb
language plpgsql security definer set search_path to 'scc_procurement','public'
as $$
declare
  v_rv record; v_rfq record; v_vendor record; v_boq record;
  v_vis_idx int[]; v_columns jsonb; v_lines jsonb; v_existing jsonb; v_bid record; v_locked boolean;
begin
  select * into v_rv from rfq_vendors where bid_token = p_token;
  if not found then return jsonb_build_object('found', false); end if;
  select rfq_id, rfq_reference, title, deadline, project_name into v_rfq from rfqs where rfq_id = v_rv.rfq_id;
  if not found then return jsonb_build_object('found', false); end if;
  select * into v_boq from sr_boq where rfq_id = v_rv.rfq_id and status='issued' order by issued_at desc nulls last limit 1;
  if not found then return jsonb_build_object('found', false); end if;
  select vendor_id, company_name into v_vendor from vendors where vendor_id = v_rv.vendor_id;

  select array_agg((ord-1) order by ord) into v_vis_idx
    from jsonb_array_elements(v_boq.columns) with ordinality as t(col, ord)
    where coalesce((col->>'visible')::boolean, true);
  select coalesce(jsonb_agg(col order by ord), '[]'::jsonb) into v_columns
    from jsonb_array_elements(v_boq.columns) with ordinality as t(col, ord)
    where coalesce((col->>'visible')::boolean, true);

  select coalesce(jsonb_agg(jsonb_build_object(
      'line_id', l.line_id, 'seq', l.seq, 'role', l.role, 'incomplete', l.incomplete, 'qty', l.qty,
      'cells', (select coalesce(jsonb_agg(elem order by e.ord), '[]'::jsonb)
                from jsonb_array_elements(l.cells) with ordinality as e(elem, ord)
                where (e.ord-1) = any(v_vis_idx))
    ) order by l.seq), '[]'::jsonb)
    into v_lines from sr_boq_line l where l.boq_id = v_boq.boq_id;

  select * into v_bid from sr_bid where boq_id=v_boq.boq_id and rfq_vendor_id=v_rv.id and is_latest order by revision desc limit 1;
  if found then
    v_existing := jsonb_build_object('revision', v_bid.revision,
      'terms', jsonb_build_object('vat_treatment', v_bid.vat_treatment, 'quotation_ref', v_bid.quotation_ref,
        'payment_terms', v_bid.payment_terms, 'validity_days', v_bid.validity_days,
        'subcontract_period', v_bid.subcontract_period, 'exclusions', v_bid.exclusions, 'notes', v_bid.notes),
      'lines', (select coalesce(jsonb_agg(jsonb_build_object('line_id', bl.line_id,
            'unit_rate_omr', bl.unit_rate_omr, 'remark', bl.remark)), '[]'::jsonb)
          from sr_bid_line bl where bl.bid_id = v_bid.bid_id));
  else v_existing := null; end if;

  v_locked := (v_rfq.deadline is not null and current_date > v_rfq.deadline)
    and not (v_bid.reopened_until is not null and current_date <= v_bid.reopened_until);

  return jsonb_build_object('found', true, 'locked', v_locked,
    'rfq', jsonb_build_object('rfq_id', v_rfq.rfq_id, 'rfq_reference', v_rfq.rfq_reference,
       'title', v_rfq.title, 'deadline', v_rfq.deadline::text, 'project_name', v_rfq.project_name, 'scope', v_boq.scope),
    'vendor', jsonb_build_object('vendor_id', v_vendor.vendor_id, 'company_name', v_vendor.company_name, 'email_to', v_rv.email_to),
    'boq_id', v_boq.boq_id, 'columns', v_columns, 'lines', v_lines, 'existing_bid', v_existing);
end; $$;

-- Vendor (anon, token): submit. Full-precision subtotal -> round finals 3dp -> total = sub+vat.
-- Revisions; a resubmit during an active reopen window inherits reopened_until.
create or replace function scc_procurement.sr_bid_submit_by_token(p_token text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path to 'scc_procurement','public'
as $$
declare
  v_rv record; v_rfq record; v_boq record; v_bid record; v_bid_id uuid; v_rev int; v_excl boolean;
  v_subtotal numeric := 0; v_sub_ex numeric; v_vat numeric; v_total numeric;
  v_line jsonb; v_rate numeric; v_qty numeric; v_terms jsonb := coalesce(p_payload->'terms','{}'::jsonb);
  v_locked boolean; v_window_active boolean;
  v_carry_until date; v_carry_by text; v_carry_reason text; v_status text;
begin
  select * into v_rv from rfq_vendors where bid_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'Invalid link'); end if;
  select * into v_rfq from rfqs where rfq_id = v_rv.rfq_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'RFQ not found'); end if;
  select * into v_boq from sr_boq where rfq_id = v_rv.rfq_id and status='issued' order by issued_at desc nulls last limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'No BOQ issued'); end if;

  select * into v_bid from sr_bid where boq_id=v_boq.boq_id and rfq_vendor_id=v_rv.id and is_latest order by revision desc limit 1;
  v_window_active := v_bid.reopened_until is not null and current_date <= v_bid.reopened_until;
  v_locked := (v_rfq.deadline is not null and current_date > v_rfq.deadline) and not v_window_active;
  if v_locked then return jsonb_build_object('ok', false, 'error', 'This RFQ has closed.'); end if;

  if v_window_active then
    v_carry_until := v_bid.reopened_until; v_carry_by := v_bid.reopened_by;
    v_carry_reason := v_bid.reopen_reason; v_status := 'reopened';
  else
    v_carry_until := null; v_carry_by := null; v_carry_reason := null; v_status := 'submitted';
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload->'lines','[]'::jsonb)) loop
    v_rate := nullif(v_line->>'unit_rate_omr','')::numeric;
    if v_rate is null then continue; end if;
    select qty into v_qty from sr_boq_line where line_id = (v_line->>'line_id')::uuid;
    v_subtotal := v_subtotal + v_rate * coalesce(v_qty, 0);
  end loop;

  v_excl := coalesce(v_terms->>'vat_treatment','exclusive') <> 'inclusive';
  if v_excl then v_sub_ex := round(v_subtotal, 3); else v_sub_ex := round(v_subtotal/1.05, 3); end if;
  v_vat := round(v_sub_ex * 0.05, 3);
  v_total := v_sub_ex + v_vat;

  select coalesce(max(revision),0) into v_rev from sr_bid where boq_id=v_boq.boq_id and rfq_vendor_id=v_rv.id;
  update sr_bid set is_latest=false where boq_id=v_boq.boq_id and rfq_vendor_id=v_rv.id;

  insert into sr_bid (boq_id, rfq_vendor_id, revision, is_latest, status, vat_treatment, quotation_ref,
    payment_terms, validity_days, subcontract_period, exclusions, notes, subtotal_omr, vat_omr, total_omr,
    submitted_at, reopened_until, reopened_by, reopen_reason)
  values (v_boq.boq_id, v_rv.id, v_rev+1, true, v_status,
    coalesce(nullif(v_terms->>'vat_treatment',''),'exclusive'), nullif(v_terms->>'quotation_ref',''),
    nullif(v_terms->>'payment_terms',''), nullif(v_terms->>'validity_days','')::int,
    nullif(v_terms->>'subcontract_period',''), nullif(v_terms->>'exclusions',''), nullif(v_terms->>'notes',''),
    v_sub_ex, v_vat, v_total, now(), v_carry_until, v_carry_by, v_carry_reason)
  returning bid_id into v_bid_id;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload->'lines','[]'::jsonb)) loop
    v_rate := nullif(v_line->>'unit_rate_omr','')::numeric;
    select qty into v_qty from sr_boq_line where line_id = (v_line->>'line_id')::uuid;
    insert into sr_bid_line (bid_id, line_id, unit_rate_omr, amount_omr, remark)
    values (v_bid_id, (v_line->>'line_id')::uuid, v_rate,
      case when v_rate is null then null else round(v_rate * coalesce(v_qty,0), 3) end,
      nullif(v_line->>'remark',''));
  end loop;

  update rfq_vendors set status='responded', response_received=true, bid_submitted_at=now() where id=v_rv.id;
  return jsonb_build_object('ok', true, 'bid_id', v_bid_id, 'revision', v_rev+1);
end; $$;

-- Officer: re-open a vendor's link for negotiation until a date.
create or replace function scc_procurement.sr_bid_reopen(p_bid_id uuid, p_until date, p_reason text, p_actor text default null)
returns jsonb language plpgsql security definer set search_path to 'scc_procurement','public'
as $$
begin
  update sr_bid set reopened_until=p_until, reopened_by=p_actor, reopen_reason=p_reason, status='reopened' where bid_id=p_bid_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'bid not found'); end if;
  return jsonb_build_object('ok', true);
end; $$;

grant execute on function scc_procurement.sr_boq_issue(uuid,jsonb,jsonb,text,text,text,text) to anon, authenticated;
grant execute on function scc_procurement.sr_bid_get_by_token(text) to anon, authenticated;
grant execute on function scc_procurement.sr_bid_submit_by_token(text,jsonb) to anon, authenticated;
grant execute on function scc_procurement.sr_bid_reopen(uuid,date,text,text) to anon, authenticated;
