# Backlog / pending

Living list of open items. Updated 2026-06-22.

## 🅿️ Parked — needs brainstorming before any code

### Deterministic vendor bid-entry link (replaces AI extraction for bids)
**Idea (client, 22 Jun):** instead of AI-extracting prices from emailed quote docs, email each
vendor a **single-use web link** to a validated, typed table of the RFQ's material list (SR: the
BoQ schedule). Vendor types unit rates directly; on submit the data writes to the DB instantly,
the link becomes **dead (destructive / one-time)**, and the bid flows straight into comparison.
AI becomes a fallback, not the primary path. Applies to MR and SR.

**Why it's good:** deterministic structured input > AI extraction for numeric bid data (no
confidence/QA step, no mis-reads).

**⚠️ Mostly BACKEND (rule 1) — needs handoff. Frontend can own only the form UI.**
- Frontend (us): public `/bid/:token` route (no auth), typed/validated editable table, submit UX,
  used/expired/success states; admin "copy bid link" affordance.
- Backend (operator): single-use **token table + issuance**; attach link in dispatch email (n8n);
  **secure submit endpoint** (Supabase edge fn or n8n webhook, service-role) that atomically
  validates token + marks used + writes `bids`/`bid_items`; RLS for any anon reads; token→rfq/
  vendor mapping; server-side validation (never trust client). Token must be unguessable, hashed
  at rest, expire at deadline, rate-limited.
- Open: confirm `bids`/`bid_items` shape so the form populates the exact comparison schema; SR
  has **no bid screen yet** — this could be SR's primary intake (bigger backend lift).
- Next step when revisited: write the frontend↔backend contract so both build in parallel.

### Dashboard "latest 5" confusion (from 21 Jun PR sanity check — RESOLVED, no data loss)
The dashboard "Recent Materials RFQs" widget is capped at `.limit(5)` (`index.tsx:237`), so a
7-RFQ upload shows only 5 — by design, nothing lost. Full list lives on the PR Tracker (`/prs`,
14 PRs all present). Also: "PRs tracked" stat is cumulative all-time, and RFQ count ≠ PR count
(`rfqs.pr_numbers` is many-to-many). Optional UX fixes: add "View all" link / "Showing 5 of N" /
raise the cap / upload summary "X RFQs across Y PRs".


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
