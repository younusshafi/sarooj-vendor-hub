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

**PROVEN PATTERN EXISTS** in the rr (rental-request) app `SCC Lease Frontend Code/
scc-lease-frontend` — same stack (React 19 + TanStack Router + Supabase + shadcn). It combines
exactly the two halves the client described:
- Single-use link: public route `src/routes/rr.review.$token.tsx` (`/rr/review/$token`). Token is
  an opaque string in the URL; loaded via Supabase **RPC** `rr_get_by_token(p_token)` →
  `{found:false}` if invalid/used. Submit via RPC `rr_review_by_token(p_token, decision, payload)`.
  **Single-use = workflow state**: the RPC advances status, so the token goes stale — NO separate
  tokens table, NO time expiry. States: loading / used ("Response Recorded") / invalid-expired /
  error / valid.
- Vendor-inputs-data: public `rr.new` + `RrForm` writes via RPCs `rr_create_draft` / `rr_submit`
  called from the browser with the **anon key**; RLS + SECURITY-DEFINER RPCs enforce safety. Empty
  →null coercion (our rule 5). No edge function / node server.

**Architecture for the bid link (mirror rr):**
- Backend (operator, rule 1 — but they've built this exact shape already):
  - token column on `rfq_vendors` (e.g. `bid_token`).
  - RPC `bid_get_by_token(p_token)` → RFQ + item list + vendor, or `{found:false}` once submitted.
  - RPC `bid_submit_by_token(p_token, p_payload)` → validate, write `bids`/`bid_items`, mark
    submitted (single-use via status), return ok. Server-side validation inside the RPC.
  - dispatch email (n8n) includes the link.
- Frontend (us): public `/bid/$token` route + typed/validated editable table + used/expired/
  success states, modelled on `rr.review.$token.tsx`. Buildable against a stubbed RPC.
- Open: confirm `bids`/`bid_items` shape (comparison reads it); SR has **no bid screen yet** →
  this could be SR's primary intake (define SR bid model first).
- Next step when revisited: write the frontend↔backend RPC contract; build FE against a stub.

### Comparison & award upgrades (relate to, but decoupled from, the bid link)
These improve EVERY bid regardless of intake (AI or form) and can ship independently. Today
`comparisons` is single-winner (`recommended_vendor_id`, `approved_vendor_column`, `selection_type`,
`is_lowest_price`); no per-line award table and no PO table exist.

**B — Exclusion equalization (vendor-flagged, officer-adjusted).** Vendor states an exclusion in
their per-line remark ("we won't do X"; e.g. lump line = 13,000 OMR). Officer reads it and adds an
**equalization value** (budget for the excluded scope) so comparison is apples-to-apples; ranking/
lowest computed on the **equalized** total. Keep vendor's raw quote intact (audit); equalization is
officer-added with a required note; sheet shows raw + equalized. Vendor side reuses
`bid_items.deviations_from_rfq` / `bids.exclusions` / `scope_coverage_percent`; **officer equalization
value is NEW (backend)** at the comparison layer. MR + SR (SR's scope-coverage answer).

**C — Per-line PO award split.** Award line-by-line, not one winner per RFQ (20 lines could split
5/5/3/… across vendors); each awarded vendor gets their own PO. Default per-line award = lowest
**equalized** rate (B feeds C); require a note when awarding a non-lowest line. Needs per-line award
storage + PO tables + split-PO generation — **all NEW (backend; PO gen likely n8n)**. FE: per-row
vendor selector + split summary + note-when-not-lowest.

**D — Two-step approval (officer → head), rr-style.** Officer finalizes the comparison/awards and
**submits for approval**; the full data goes by **email to the procurement head (Rabia)** with a
single-use review link (mirror rr `rr.review.$token` / `rr_review_by_token`). On her approval it is
**locked/stored for good** and POs issue; on return-with-comments the officer revises and resubmits
(rr return/resubmit). Schema already supports the chain: `comparisons.prepared_by` / `reviewed_by` /
`verified_by` / `approved_by` (default "Rabia Vahabudeen") / `approval_date` / `approved_at` /
`status`. FE: officer "submit for approval" + Rabia's `/comparison-review/$token` page. Backend:
state-machine RPCs + email + lock-on-approve + PO trigger.

**Consolidated flow:** RFQ issued → vendors price via single-use link (A) [AI fallback] → bids land
in `bids`/`bid_items` → officer reviews comparison, equalizes exclusions (B), awards per line (C) →
submits for approval → head approves via single-use link (D) → locked + split POs issue.

**Open decisions to confirm:** (1) approval stages — officer→Rabia only, or also reviewer/verifier
(schema allows 4 roles)? (2) what exactly locks on final approval (comparison + awards +
equalizations immutable; bids already locked at deadline). (3) per-line brand → new `bid_items`
column. (4) PO issuance triggered on final approval. (5) deadline extension control on dashboard
reopens vendor links.

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
