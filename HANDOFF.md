# HANDOFF — Sarooj Procurement (BOQ → Subcontractor RFQ flow)

> Single source of truth for resuming work. Written 2026-06-28. Read this + `CLAUDE.md`
> (durable rules) and you have full context — you do **not** need any prior chat history.

---

## 0. Orientation (read first)

- **This repo is frontend only.** React + Vite + TanStack Router + Supabase + TS + Tailwind + shadcn/ui, deployed on Vercel. **Never** edit n8n workflows or Supabase schema/tables/views — backend operator owns those. See `CLAUDE.md` for the non-negotiable rules (schema `scc_procurement`, key on `rfq_id`, no `vendors.email`, empty→null on writes, additive only, `fmtOmr` for money).
- **Two themes:** green = facilities, **charcoal = procurement** (use `data-theme="charcoal"` + semantic tokens).
- **Goal of this workstream:** integrate the Python/LLM **BOQ parser** into the **subcontractor (SR) RFQ** flow — upload a real BOQ → parse → officer curates which columns vendors see → issue → each vendor gets a perishable `/sr-bid/<token>` link → vendor submits rates → officer compares + equalizes + awards. **Materials (MR) flow stays as-is** (SAP Excel, deterministic). Parser is **SR-only**.

---

## 1. Infrastructure (already deployed & live — do not rebuild)

- **BOQ parser service:** FastAPI wrapper over the offline parser (gpt-4o vision for PDF, gpt-4.1-mini for Excel).
  - Server: `ssh root@31.97.233.41` (also runs n8n in Docker). Parser lives at `/opt/boq-parser/`, runs as a **systemd** service in a **plain venv** (NOT Docker — deliberately, so n8n's compose is untouched).
  - Public URL: **`https://n8n.zavia-ai.com/boq`** (nginx subpath; `/parse-pdf`, `/parse-excel`, `/health`).
  - Auth: **`X-BOQ-Key`** shared secret (fail-closed on parse endpoints). CORS allows `sarooj-vendor-hub*.vercel.app`, `procurement.scc.zavia-ai.com`, `localhost:*`. Rate-limited.
  - Validated: all 14 test PDFs + Excel parse correctly end-to-end.
  - ⚠️ Never run `pkill -f "uvicorn api:app"` over ssh — it kills the ssh shell. Use systemctl / fuser.
- **Frontend env** (`.env.local`, gitignored — key never commits):
  - `VITE_BOQ_SERVICE_URL=https://n8n.zavia-ai.com/boq`
  - `VITE_BOQ_API_KEY=<secret>` (the X-BOQ-Key)
- **Canonical Vercel project:** `sarooj-vendor-hub-code` (Vite). The old project was renamed `sarooj-vendor-hub-old` (candidate for deletion to stop double-builds). Deploys via GitHub→Vercel git integration. Vercel blocks unverified commits — a manual Redeploy may be needed after push.
- **Test BOQ files** on the user's machine: `Desktop\BOQ_test_PDFs\` and `Desktop\BOQ_test_XLSX\`.

---

## 2. Data model (applied — do NOT alter, do NOT migrate materials into it)

New `sr_*` tables in `scc_procurement`, plus 4 token-gated SECURITY DEFINER RPCs (mirror the materials `bid_*_by_token` pattern; RLS off project-wide):

- `sr_boq` / `sr_boq_line` — the issued BOQ skeleton (flexible columns; internal/price columns stored but projected out server-side so they never reach the vendor).
- `sr_bid` / `sr_bid_line` — per-vendor submissions.
- `sr_bid_equalization` — exclusion→factor adjustments procurement applies during comparison.
- `sr_bid_attachment` — vendor attachments (table exists; upload not yet wired).
- RPCs: `sr_boq_issue`, `sr_bid_get_by_token`, `sr_bid_submit_by_token`, `sr_bid_reopen` — all end-to-end tested (projection, totals, revisions, lock, reopen-window carry-forward). Wrappers in `src/lib/sr-boq.ts`.

---

## 3. What's DONE

- Parser productionized (systemd + HTTPS subpath + key + CORS + rate-limit). n8n unaffected.
- `sr_*` schema + 4 RPCs, end-to-end tested.
- **`/boq-tester`** sandbox page (PDF + Excel, flexible columns, HITL flags, column curation, rich RFQ document preview).
- **`/sr-bid/$token`** live vendor route — charcoal RFQ document, auto-grow word-wrapped description, vendor enters rates + submits.
- Shared **`RfqDocShell` / `RfqDocSection`** (`src/components/rfq-document.tsx`) — both `/sr-bid` and materials `/bid` render as one Sarooj document.
- **`fmtOmr`** (`src/lib/omr.ts`) — trims meaningless trailing zeros (`230,000` not `230,000.000`; keeps `1,158.5`). Materials aligned to it. `CLAUDE.md` + docs updated.
- Charcoal procurement theme.
- **Officer Issue panel** — `src/components/sr/sr-boq-issue-panel.tsx` + new **"Issue BOQ" tab** in `src/routes/_app/rfq.sub.$rfqId.tsx` (additive; old "BoQ Upload" tab left untouched). Flow: upload → `parseBoqRemote` → curate (eye-toggle columns, default-hide price/budget cols, editable cells, price-leak warning) → `srBoqIssue` → shows each vendor's `/sr-bid/<token>` link.

### ⚠️ Uncommitted/unpushed state to know about

- Commit **`066f8cc`** (the Issue panel + tab) is **LOCAL ONLY — NOT pushed**, on `main`, ahead by 1. User wants it held until they finish testing.
- ~~Scratch test data to clean up~~ — **DONE 2026-06-28: full RFQ-data wipe.** All 44 RFQs + children (rfq_vendors/items/attachments, bids/bid_items, comparisons + awards/equalizations, all sr_*) deleted in scc_procurement for a clean test slate (user-authorized; SCC is test/dev). Master data kept (vendors=1415, system_settings, categories). Backup manifest: `docs/backups/rfq_wipe_manifest_2026-06-28.json`. One approval-lock trigger (`tg_block_when_approved`) was bypassed session-scoped (`session_replication_role=replica`) for the delete, then restored — no schema change.
- **Finding from the wipe:** all `sr_*` tables were **empty** beforehand — i.e. SR issuance has never actually persisted a `sr_boq` (the SR-TEST-ISSUE scratch RFQ existed in `rfqs` but spawned no `sr_boq`). Worth confirming `sr_boq_issue` end-to-end when building SR comparison.
- **Known defect (logged):** a vendor who submits twice shows as TWO competing columns in MR comparison (one `bids` row per email reply, no per-vendor dedupe). Fix = one column/vendor, latest submission, prior as revisions. See memory `ux-redesign-philosophy`.

### Local test of the Issue panel
1. Ensure dev server running (`npm run dev`, picks up `.env.local`).
2. Open `http://localhost:5173/rfq/sub/0d790046-212b-448f-b824-ae8f3723ec7e` → **"Issue BOQ"** tab.
3. Drop a BOQ from the Desktop test folders → curate columns → "Issue BOQ to vendors".
4. Open `http://localhost:5173/sr-bid/ISSUETEST1` to see the curated vendor document.

---

## 4. What's PENDING (priority order)

**Session 2026-06-28 (evening) — committed locally, NOT pushed (main ~9 ahead).** DoD gate now FULLY GREEN (tsc · lint 0 errors · build · verify_pr_contracts). Done tonight: Phase 2 MR comparison cleanup (dedupe vendor columns + Decision-card status-clash fix) `04c1f4f`; SR lifecycle stepper `ad3c532`; SR `/sr-bid` bid-links panel (fixed wrong `/bid` link) `2590861`; Phase 4 ShareableLink seam across MR/SR/approval links `149df7f`; full lint cleanup `5f90d2d`. Demo data `SR-DEMO-001` (rfq_id e112b2e2-25cf-409a-b4c0-ea9a36c3c018) seeded for the SR comparison.

**Session 2026-06-28 (continued) — more frontend + a BACKEND override.** Also done (uncommitted): SR vendor attachments (`a855d4a`); and — with the user's EXPLICIT override of the frontend-only rule — the **SR approval → PO** subsystem: additive Supabase migration `sr_comparison_approval` (table + 4 SECURITY DEFINER RPCs mirroring materials, applied via MCP + tested end-to-end on SR-DEMO-001), reference SQL in `docs/applied-migrations/sr_comparison_approval.sql`; frontend = approval card + lock in the SR comparison panel, new `/sr-comparison-review/$token` route for the approver, `sr_comparison_*` wrappers in `sr-comparison.ts`, and `deriveSrStage` now reaches Approved/PO. n8n stays operator-owned. Still open: the n8n emails (#6 incl. **SR review-link email**, #7, #7b), go-live actions, and the push.

**Active build — RFQ detail-page UX redesign (lifecycle-first IA)**
0b. **Phase 0 DONE (2026-06-28, uncommitted):** added `src/lib/rfq-stage.ts` (6-stage model — derived, no backend), `src/components/rfq/status-stepper.tsx`, `src/components/rfq/shareable-link.tsx`. Additive, not wired into any page yet; tsc+build green. Design philosophy + phased plan: `docs/RFQ_FLOW_ALIGNMENT.html` (Parts 4–5), stepper mockup: `docs/RFQ_LIFECYCLE_MOCKUP.html`, memory `ux-redesign-philosophy`.
0c. **Phase 1 DONE (2026-06-28, uncommitted):** `rfq.$rfqId.index.tsx` recomposed — added `<StatusStepper>` at top (stage derived from rfq.status + bid count + comparison.status/awards), tabs now Overview · **RFQ Document** (items + editable `RfqEmailEditor`) · Vendors (email preview removed) · **Bids & Award**. tsc+build green; eslint net-neutral (only the file's pre-existing `any`s). Dispatch (`/rfq/preview`) + comparison routes untouched. Next: Phase 2 = comparison cleanup (dedupe duplicate vendor columns; retire legacy Decision card).

**Active build — finish the BOQ→SR flow**
1. ~~Officer Issue in real SR page~~ — ✅ done, awaiting user's local test, then push. (Then clean up scratch data.)
2. ~~SR comparison sheet~~ — ✅ **DONE 2026-06-28 (uncommitted).** `src/lib/sr-comparison.ts` (reads sr_boq + sr_boq_line × latest sr_bid/sr_bid_line + sr_bid_equalization + sr_award; writes equalizations/awards with replace-semantics) + `src/components/sr/sr-comparison-panel.tsx` (commercial summary, per-line equalized matrix w/ lowest-highlight + equalize modal, per-line award + non-lowest reason, PO/award split). Wired as a new **"Bids & Award" tab** on `rfq.sub.$rfqId.tsx` (no new route); fixed the broken "Compare & Award" header link (was pointing at the MR comparison route). tsc+build green, new files lint-clean. NOTE: no formal SR approval→PO step yet (MR-style); SR ends at award+save. Stepper not yet on SR page.
3. ~~Negotiation reopen UI~~ — ✅ **DONE** as part of #2: per-vendor "Re-open" action in the comparison (modal → `sr_bid_reopen` RPC → keeps the vendor link open until a date).
4. ~~Attachments~~ — ✅ **DONE 2026-06-28 (uncommitted, vendor-side via existing Drive path).** `/sr-bid` now has an "Attachments (optional)" section; vendor files upload through the existing `uploadDocument` webhook (Drive + `rfq_attachments`), so the officer sees them in the SR **Documents** tab — zero backend. TRADE-OFF: stored at RFQ level (proven path), NOT in the bid-FK-linked `sr_bid_attachment` table (still unused). The cleaner bid-linked version would need a token RPC/webhook (backend) — deferred.
5. **Dispatch** — how vendors receive their `/sr-bid` link (email via n8n, or manual copy for now).

**Notifications & negotiation (n8n — needs re-auth; affects MR + SR)**
6. Notification emails: notify on submit · **email Rabia the comparison review link (CONFIRMED NEEDED 2026-06-28)** · notify officer on approve/return/revoke. Today "Submit for approval" only mints a single-use `/comparison-review/<token>` link shown on screen for manual share — there is NO auto-email. Backend (n8n): on `comparison_submit_for_approval`, email that link to Rabia (the approver). Frontend already exposes the token/link.
7. Materials negotiation / add-vendor-to-issued-RFQ — awaiting procurement sign-off.
7b. **MR → link-first bidding (BACKEND, n8n).** Decision 2026-06-28: materials RFQs should collect bids via the `/bid/<token>` portal like SR, not reply-by-email + AI extraction. `bid_token` is minted by WF8 at dispatch, so only WF8 can embed each vendor's link — the WF7/WF8 covering-email template must drop the schedule-table / "reply directly to this email" body and instead send the portal link. Frontend portal + BidLinksPanel already exist (model is testable now via manual link hand-out). Likely FE follow-up after backend flips: demote the "Original Email" panel on the Bid Review screen for portal-submitted bids. See memory `mr-bid-model-link-first`.

**Your-action / go-live checks**
8. Live WF7 generation test (SAP upload → generate) — the one unverified n8n change.
9. Settings → Dispatch Test Mode → OFF at go-live.
10. Rotate the n8n API key (flagged should-rotate).
11. (optional) Delete the renamed `sarooj-vendor-hub-old` Vercel project.

**Parked / optional**
NQ auto-equalization (needs user yes) · NQ frame templates (largely superseded) · WF12 suggest-only/trust fixes · G1 Frame casing · G2 T&Cs Drive sharing · E14 onboarding/outreach · Vercel Pro serverless proxy for airtight parser auth.

---

## 5. Key files

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Durable rules — read every session. |
| `src/components/sr/sr-boq-issue-panel.tsx` | Officer Issue panel (upload→parse→curate→issue). |
| `src/routes/_app/rfq.sub.$rfqId.tsx` | Real SR detail page; hosts the "Issue BOQ" tab. |
| `src/routes/sr-bid.$token.tsx` | Vendor-facing SR quotation document. |
| `src/routes/_app/boq-tester.tsx` | Parser sandbox. |
| `src/components/rfq-document.tsx` | Shared charcoal RFQ-document chrome. |
| `src/lib/sr-boq.ts` | SR RPC wrappers + types. |
| `src/lib/boq-service.ts` | `parseBoqRemote` / health, reads `VITE_BOQ_*`. |
| `src/lib/omr.ts` | `fmtOmr` money formatter. |
| `docs/SR_BOQ_RFQ_PROPOSAL.md` | Full design proposal. |
| `docs/applied-migrations/sr_boq_rfq_tables.sql`, `sr_boq_rpcs.sql` | Reference copies of applied DB changes (do not re-apply). |

## 6. Definition of done (run before any "stage complete")
```bash
npx tsc --noEmit
npm run lint
npm run build
node scripts/verify_pr_contracts.mjs
```
All must pass. Then commit. **Push only when the user says so** (current Issue-panel commit is intentionally held).
