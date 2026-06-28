# CLAUDE.md — Sarooj Procurement AI (frontend: `sarooj-vendor-hub-code`)

You are working **frontend only** in this repo (React + Vite + TanStack Router + Supabase + TypeScript + Tailwind + shadcn/ui, deployed on Vercel). These rules are durable and override anything in a stage prompt that conflicts with them.

## Non-negotiable rules

1. **Frontend only.** NEVER edit n8n workflows or Supabase schema/tables/views. Those are owned by the backend operator and changed separately. If a task seems to need a backend change, stop and say so in the handoff — do not work around it.
2. **`scc_procurement` schema on every Supabase call.** Reads must resolve to `scc_procurement`, not `public`. The client (`src/integrations/supabase-external/client.ts`) is configured with `db: { schema: 'scc_procurement' }`, so plain `supabase.from('…')` calls already target the right schema — follow that pattern; no per-call `.schema()` needed. Note: that client **hardcodes** the Supabase URL + anon key (it does not read `import.meta.env`); the `VITE_SUPABASE_*` env vars are used only by `scripts/verify_pr_contracts.mjs`.
3. **Key on `rfq_id`, never `rfq_reference`.** RFQ reference strings are NOT unique (duplicates exist). Use `rfq_id` (uuid) for React keys and navigation targets.
4. **`vendors` has no `email` column.** Emails live in `vendors.contacts` (jsonb[]); recipient address is `rfq_vendors.email_to`. Never request `vendors(email)` — PostgREST 400s on unknown columns and nulls the whole row.
5. **Empty → null on writes.** Coerce empty strings to `null` for any non-text column (date/int/numeric) before writing to Supabase. Mirror the existing bid-confirm handler.
6. **Additive, no regressions.** New PR features are new routes/components. Do not alter the existing RFQ Tracker / Bid Review / Comparison flows.
7. **Vercel** blocks unverified commits — after pushing, a manual Redeploy may be needed (note it in handoff).

## Definition of done — automated gate (run before any "stage complete")

Run in order; ALL must pass. On failure, fix and re-run — do not proceed to handoff.

```bash
npx tsc --noEmit
npm run lint            # = "eslint ." (confirmed in package.json)
npm run build
node scripts/verify_pr_contracts.mjs
```

`verify_pr_contracts.mjs` reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (confirmed env names; falls back to `.env.local` then `.env`) and asserts the backend view contracts below over the anon PostgREST path. It exits non-zero if a contract column is missing.

## Backend contracts (read-only views — already built, do NOT create/alter)

### `scc_procurement.v_pr_tracker` — one row per PR

`pr_number`(text) · `total_rfqs`(int) · `issued_rfqs`(int) · `rfqs_with_responses`(int) · `rfqs_evaluated`(int) · `total_vendors_invited`(bigint) · `total_responses_received`(bigint) · `total_items`(bigint) · `rfq_references`(text[]) · `first_rfq_created_at`(timestamptz) · `last_rfq_created_at`(timestamptz) · `pr_status`(text, display) · `pr_status_code`(text, **match on this**)

`pr_status_code` → label: `draft`→"Draft" · `issued_awaiting`→"Issued – awaiting responses" · `responses_pending`→"Responses in – pending evaluation" · `evaluation_complete`→"Evaluation complete". (Label has an en-dash U+2013 — never hand-type it for comparisons; key on the code.)

### `scc_procurement.v_pr_rfq_detail` — one row per (PR × RFQ)

`pr_number`(text) · `rfq_id`(uuid) · `rfq_reference`(text) · `title`(text) · `rfq_type`(text) · `rfq_status`(text) · `created_at`(timestamptz) · `items_from_this_pr`(int) · `vendors_invited`(int) · `responses_received`(int) · `comparisons_count`(int) · `finalised_count`(int)

Generate `src/types/pr.ts` (or repo convention) from these in Stage 0 and import them everywhere — the compiler then enforces the contract and prevents drift.

## Money — OMR amounts (rounding + display)

OMR has up to **3 decimals** (1 rial = 1000 baisa). Two separate concerns:

- **Rounding/calc (unchanged):** compute at **full precision**, round **only** the final
  subtotal / VAT / total to **3 dp**; `total = subtotal + VAT` (ties out exactly). DB money
  columns are `numeric(_,3)`.
- **Display:** show **meaningful decimals only — trim trailing zeros**. `230000` → `230,000`,
  `1158.5` → `1,158.5`, `1158.535` → `1,158.535`. Use the single shared formatter
  **`fmtOmr` from `src/lib/omr.ts`** everywhere an OMR amount is shown. **Do not** hand-roll
  `toLocaleString` with fixed `minimumFractionDigits: 3` — that reintroduces `230,000.000` and
  drifts between screens. (Materials + subcontractor both route through `fmtOmr`.)

## Status badge tokens

`--cream:#F4F8F6; --ink:#0D3D2E; --accent:#0D7A5A; --border:#C8DDD7`
draft `#E5EAE8`/`#0D3D2E` · issued_awaiting `#E8EFF7`/`#1A3A5C` · responses_pending `#FDF3E0`/`#7A5200` · evaluation_complete `#E0F2EA`/`#0D5C3A`
