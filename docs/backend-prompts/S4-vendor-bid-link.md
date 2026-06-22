# Backend prompt — S4 vendor bid-entry link (paste into claude.ai)

> Paste everything below the line into claude.ai (which has the Supabase MCP connected to the
> `scc_procurement` project). It builds the backend slice for the vendor bid-entry link. The
> frontend (`/bid/$token`) is already built against this exact contract and calls
> `supabase.rpc("bid_get_by_token", …)` / `supabase.rpc("bid_submit_by_token", …)`.

---

You are working on the Supabase project for Sarooj Procurement, schema **`scc_procurement`**. Build
the backend for a **vendor bid-entry link**: a vendor opens a public, no-login URL `/bid/<token>`,
sees their RFQ's material list, types unit rates (+ brand, qty offered, per-line remark) and
commercial terms, and submits. The submission writes `bids` + `bid_items` and feeds the existing
comparison. **Editable until the RFQ deadline** (each submit = a new revision, last wins); the link
locks once `now > rfqs.deadline`. Reads/writes happen via the anon key calling SECURITY-DEFINER
RPCs only — do **not** grant broad anon table access.

First inspect the existing schema (`list_tables` / introspect) for `rfqs`, `rfq_vendors`,
`rfq_items`, `bids`, `bid_items` and match existing column names/types exactly. Then:

## 1. Schema additions
- `rfq_vendors.bid_token text` — unique, default a random unguessable value
  (e.g. `encode(gen_random_bytes(24),'base64url')` or `gen_random_uuid()::text`). Backfill existing
  rows. Generate it for every vendor at/after dispatch.
- `rfq_vendors.bid_submitted_at timestamptz` (nullable).
- `bid_items.brand text` (nullable).

## 2. RPC `bid_get_by_token(p_token text) returns jsonb`  (SECURITY DEFINER)
Resolve the token → its `rfq_vendors` row → `rfqs` + `vendors` + `rfq_items`. Return:
```
{} as {found:false}                       -- if token unknown
{ "found": true,
  "locked": (now() > rfqs.deadline),      -- true => read-only
  "rfq":    { rfq_id, rfq_reference, title, deadline, rfq_type, project_name },
  "vendor": { vendor_id, company_name, contact_person, email_to },
  "items":  [ { rfq_item_id, item_number, sap_item_number, description, quantity, unit } order by item_number ],
  "existing_bid": null | {                 -- the vendor's latest revision, for prefill
     "revision": <int>,
     "header": { quotation_reference, quotation_date, currency, payment_structure,
                 advance_percentage, credit_days, pdc_days, payment_method, delivery_terms,
                 delivery_location, delivery_lead_time_days, validity_days, vat_treatment,
                 scope_coverage_percent, exclusions, key_conditions, notes },
     "lines": [ { rfq_item_id, unit_price_omr, quantity_offered, brand, deviations_from_rfq } ] } }
```
Only expose data for the token's own RFQ/vendor. Valid while `rfqs.status='issued'`.

## 3. RPC `bid_submit_by_token(p_token text, p_payload jsonb) returns jsonb`  (SECURITY DEFINER)
`p_payload = { header:{…same keys as above…}, lines:[ {rfq_item_id, unit_price_omr, quantity_offered,
brand, deviations_from_rfq} ] }`. Steps:
1. Resolve token; if unknown → `{ok:false, error:'Invalid link'}`.
2. **Reject if `now() > rfqs.deadline`** → `{ok:false, error:'This RFQ has closed.'}`.
3. Validate server-side: numerics ≥ 0; `vat_treatment ∈ ('inclusive','exclusive')`; lines reference
   real `rfq_items` of this RFQ. Null `unit_price_omr` = NQ (allowed; partial quotes OK).
4. Compute per line `total_price_omr = unit_price_omr * coalesce(quantity_offered, rfq_items.quantity)`.
   Compute header `subtotal_ex_vat_omr`, `vat_amount_omr` (5%), `total_inc_vat_omr` from the lines
   honouring `vat_treatment`.
5. Set this vendor's prior `bids.is_latest_revision=false`; insert a new `bids` row
   (`rfq_id`, `vendor_id`, `vendor_name`, `rfq_vendor_id`, `revision = prev+1`,
   `is_latest_revision=true`, `status='submitted'`, the header fields, computed totals,
   `entered_by='vendor-link'`, `entered_at=now()`). Insert `bid_items` for each line
   (`bid_id`, `rfq_item_id`, `unit_price_omr`, `quantity_offered`, `total_price_omr`, `brand`,
   `deviations_from_rfq`, plus `description`/`unit`/`sap_item_number` copied from `rfq_items`).
6. Update `rfq_vendors`: `status='responded'`, `response_received=true`, `bid_submitted_at=now()`.
7. Return `{ok:true, bid_id, revision}`.
Make it idempotent-friendly (re-submit just adds the next revision).

## 4. Grants / RLS
Grant EXECUTE on both RPCs to `anon`. Do not grant anon direct table privileges. Keep all logic in
the SECURITY-DEFINER functions. Confirm `bids`/`bid_items` shapes are unchanged so the existing
comparison keeps reading them.

## 5. n8n (note — may be a separate task)
- Dispatch email (`scc-rfq-dispatch`): include each vendor's link `https://<app>/bid/<bid_token>`;
  carry only the link (not the schedule); reply-to = no-reply; copy says quotes are accepted only via
  the link.
- Add a vendor **confirmation email** on submit.
- **Disable inbound email→AI bid extraction** for these RFQs (link is the sole intake).

Report back: the migration SQL applied, the two function definitions, and one example
`bid_get_by_token` result for a real issued RFQ so the frontend team can verify the shape.
