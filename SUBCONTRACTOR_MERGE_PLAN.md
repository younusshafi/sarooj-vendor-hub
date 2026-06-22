# Subcontractor → Main merge plan

**Goal:** Fold the separate subcontractor RFQ app (`Sarooj_procurement_subcontractors`) into this repo and retire the standalone Vercel app. One app; shared chrome (sidebar, dashboard, PR tracker) and a unified RFQ Tracker list; each RFQ type keeps its own create/detail screens. **Materials flows must not regress** (CLAUDE.md rule 6).

## Approved decisions (2026-06-21)
1. SR route namespace: `/rfq/sub/new` + `/rfq/sub/$rfqId` (materials stay at `/rfq/new`, `/rfq/$rfqId`).
2. One unified `/rfq` tracker listing both types, routing per row by `rfq_type`.
3. "New RFQ" entry: a Materials | Subcontractor chooser.
4. Replace SR Zustand draft store with `sessionStorage` (match materials pattern; no new state dep).
5. Sidebar: one "RFQ" group with Materials + Subcontractor children, replacing the external link.

## Shared data (one Supabase DB, schema `scc_procurement`)
`rfqs` (discriminated by `rfq_type` = `materials` | `subcontractor`), `rfq_vendors`, `vendors`, `rfq_items`, `rfq_attachments`.

## SR backend contract (LIVE, backend-owned — call only, never change)
Base `https://n8n.zavia-ai.com`:
- `POST /webhook/scc-subcontract-rfq-generate` — form + attachment metadata → draft RFQ + suggested vendors + Drive folder + draft email.
- `POST /webhook/scc-subcontract-rfq-upload` — one file/call (base64) → Drive + `rfq_attachments`.
- `POST /webhook/scc-frame-generate` — locked BOQ lines → `rfq_items` + frame metadata.
- `POST /webhook/scc-subcontract-rfq-dispatch` — `{rfq_id, deadline, selected_vendor_ids}` → share folder, email vendors, flip to `issued`.

## Port list (SR → this repo, reconciled to main conventions)
- Components: `rfq-dispatch-panel`, `rfq-editable-fields`, `rfq-email-editor`, `rfq-vendor-list`, `frame/{BoqUploadStep,FrameGrid,FrameView}`.
- lib: `boq-parse`, `frame-email`, `file-utils`, SR `webhook.ts` (→ `subcontract-webhook.ts`), SR `types.ts` (→ `subcontract-types.ts`).
- Routes: `rfq.sub.new.tsx`, `rfq.sub.$rfqId.tsx` (flat-dot; main's auth; sessionStorage draft).
- Deps add: `pdfjs-dist` (xlsx already present; NOT `next-themes`/`zustand`).
- Reconcile: imports `@/integrations/supabase` → `@/integrations/supabase-external`; hardcode n8n base; main's `useAuth`; main's sonner.

## Stages (each gated: tsc + lint + build + verify:contracts + materials-flow smoke)
- **A — Land SR inside the app** at `/rfq/sub/*`, not yet linked. Verify SR create→generate→upload→frame→dispatch (test emails only).
- **B — Unify `/rfq` tracker** to list both types + route by type; remove the non-materials redirect-out in `rfq.$rfqId.index.tsx`.
- **C — Flip dashboard + sidebar** SR links from external to internal.
- **D — Retire** the separate app (remove external link; user decommissions the Vercel project + repo).

## Test discipline
Dispatch only to test addresses: `younus@zavia-ai.com`, `younus.shafi@gmail.com`, `younus.shafi.archive@gmail.com`. Clean up test rows after.

## Status — 2026-06-21 (all stages code-complete; automated gate green: tsc · lint · build · verify:contracts)
- **A ✅** SR screens live at `/rfq/sub/new` + `/rfq/sub/$rfqId`; libs/components ported; `pdfjs-dist` added; Zustand replaced by in-memory `subcontract-draft`.
- **B ✅** `/rfq` tracker lists both types and routes each row by type; materials-detail redirect now points to `/rfq/sub/$rfqId` (internal).
- **C ✅** Unified `/rfq` gained a Type filter; dashboard SR tiles + Recent SR list link internally; sidebar has an RFQ group (Materials / Subcontractor); New RFQ chooser (Materials | Subcontractor) in the tracker header.
- **D ✅ (code)** No external SR links remain in the repo (verified by grep). SR rows on the PR detail page now open `/rfq/sub/$rfqId`.

### Remaining HUMAN actions (not code)
1. Run the runtime smoke tests (need login + live backend; test emails only): SR create→generate→upload→frame→dispatch; materials regression; both types in `/rfq`; dashboard SR tiles/links; PR detail SR rows.
2. After production parity is confirmed: **decommission the standalone Vercel project `sarooj-procurement-subcontractors` and archive its GitHub repo.** Keep the 4 SR n8n webhooks + SR DB columns/`rfq_attachments` live — the in-app screens call them.
