# Backend prompt — S2 equalization (B) + per-line award (C)  (paste into claude.ai)

> Paste below the line into claude.ai (Supabase MCP, project schema `scc_procurement`). It builds the
> storage for two comparison-screen features already built in the frontend
> (`src/components/comparison-award-panel.tsx`), which currently reads/writes via stubs in
> `src/lib/comparison-eval.ts`. These are **in-app authenticated officer** actions (not token links).

---

Schema **`scc_procurement`**. Add storage for two procurement-officer evaluation features layered on
the existing single `comparisons` row per RFQ. First introspect `comparisons`, `rfq_items`, `bids`,
`vendors` for exact column names/types. Then:

## 1. Tables

```sql
create table scc_procurement.comparison_equalizations (
  equalization_id  uuid primary key default gen_random_uuid(),
  comparison_id    uuid not null references scc_procurement.comparisons(comparison_id) on delete cascade,
  rfq_item_id      uuid not null references scc_procurement.rfq_items(item_id) on delete cascade,
  vendor_id        uuid not null references scc_procurement.vendors(vendor_id),
  equalization_omr numeric not null,          -- officer's budget for the vendor's excluded scope (may be negative)
  note             text not null,             -- what it covers (required)
  created_by       text,
  created_at       timestamptz default now(),
  unique (comparison_id, rfq_item_id, vendor_id)
);

create table scc_procurement.comparison_awards (
  award_id          uuid primary key default gen_random_uuid(),
  comparison_id     uuid not null references scc_procurement.comparisons(comparison_id) on delete cascade,
  rfq_item_id       uuid not null references scc_procurement.rfq_items(item_id) on delete cascade,
  awarded_vendor_id uuid not null references scc_procurement.vendors(vendor_id),
  awarded_bid_id    uuid references scc_procurement.bids(bid_id),
  reason            text,                      -- required (app-enforced) when not the lowest-equalized
  created_by        text,
  created_at        timestamptz default now(),
  unique (comparison_id, rfq_item_id)
);
```

## 2. RLS
Both tables: enable RLS; allow the app role (authenticated procurement officers — match how existing
`comparisons` writes are authorized) to `select/insert/update/delete` rows for comparisons that are
**not locked**. **Block all writes when the parent `comparisons.status = 'approved'`** (the S3/D
approval lock). Reads allowed to the app role.

## 3. Save shape (what the frontend sends)
The frontend saves the whole evaluation for a comparison at once. Implement EITHER:
- direct upsert/delete from the client under RLS (simplest — keys are the `unique(...)` tuples), OR
- a SECURITY-DEFINER RPC `comparison_save_eval(p_comparison_id uuid, p_equalizations jsonb,
  p_awards jsonb)` that deletes existing rows for the comparison and re-inserts (transactional),
  rejecting if locked.
Tell the frontend which you chose so `src/lib/comparison-eval.ts` is wired to match
(`loadComparisonEval` = two selects; `saveComparisonEval` = upserts or the RPC).

## 4. Notes
- Equalized line value used for ranking/award = `bid_items.unit_price_omr * coalesce(qty_offered,
  rfq qty) + equalization_omr`. Raw bid data is never mutated.
- No PO tables (out of scope) — `comparison_awards` is the officer's award worksheet only.

Report back: the migration SQL applied, the chosen save mechanism (direct upsert vs RPC), and
confirm the lock-on-approved behavior.
