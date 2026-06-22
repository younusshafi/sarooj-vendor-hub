# Backlog / pending

Living list of open items. Updated 2026-06-22.

## 🅿️ Parked — needs brainstorming before any code

### BoQ single source of truth (Option B)
**Problem:** BoQ can be uploaded in two places that do different jobs:
- **Documents tab** → stores the file (Drive + `rfq_attachments`), but never parses it.
- **BoQ Upload tab** → parses the file **client-side** into `rfq_items`, but the raw file
  is never stored. So a BoQ-only-in-upload-tab document is lost; doing both = double upload.

**Leaning (Option B):** make the **BoQ Upload tab the single entry point** — on
"Lock & Build BoQ", also persist the file via `uploadDocument(rfqId, file, "boq", base64)`
so it appears in Documents + Drive. Documents tab then holds only supporting docs.
(Option A — build the frame from an already-uploaded Document — needs server-side or
Drive-refetch parsing, so it's not cleanly frontend-only. Rule 1.)

**Open questions:** de-dupe if a BoQ attachment already exists; whether to block uploading
a BoQ as a generic attachment in Documents; ties into post-issue locking below.

## ✅ Done — awaiting runtime verification (human; needs login + live backend)
- **Vendor tabs → recipients view** (`1841685`): issued RFQs default to vendors actually
  sent (`sent_at`), "Show all matched" toggle. Test: issued materials (MR-2606-027/013) +
  issued SR (SR-2606-004); drafts of each still fully selectable; count vs tracker.
- **SR Overview lock + renames** (`84287ce`): RFQ Details + Covering Email read-only when
  issued; tab "Frame"→"BoQ Upload"; button "Lock & Build BoQ". Test on an issued SR RFQ.
- **Subcontractor merge** (per `SUBCONTRACTOR_MERGE_PLAN.md`): full create→generate→upload
  →build BoQ→dispatch smoke (test emails only); materials regression; both types in `/rfq`.

## 🤔 Pending decisions
- **Post-issue gating of Documents + BoQ Upload tabs** (SR): today an issued RFQ can still
  add attachments and re-lock the BoQ (rewrites `rfq_items` + covering email). Lock them, or
  allow post-issue corrections? (Related to the parked BoQ item.)
- **Lint debt:** project-wide `npm run lint` is red — ~75 pre-existing errors in non-merge
  files (`settings.tsx`, `vendors.$vendorId.tsx`, `exportComparison.ts`, `ui/*`,
  `supabase-external/*`). Our new code is clean. Decide whether to clean baseline so the
  CLAUDE.md gate can go fully green.

## 🚀 Pending ops (when ready — user-driven)
- **Push + Vercel:** 4 local commits ahead of `origin/main`, intentionally not pushed.
  Pushing `main` triggers a prod deploy; unverified commits are blocked → manual Redeploy.
- **Decommission** standalone Vercel project `sarooj-procurement-subcontractors` + archive
  its repo, after production parity. Keep the 4 SR n8n webhooks + SR DB columns live.

## 💡 Optional / nice-to-have
- Adopt SR's richer per-vendor Sent/Pending/Responded indicators in the materials
  `VendorsTabPanel` for parity.
