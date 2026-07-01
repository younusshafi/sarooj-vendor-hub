# Vendor Onboarding — Document Verification (handover)

**Status: LIVE end-to-end (2026-07-01).** After a vendor submits via the invite link, their
uploaded documents (CR, VAT, ID, …) are read by AI, compared **in code** to what they typed, and a
green/red/grey ledger is shown to the reviewing officer. On approval the verified data enriches the
vendor master. A human always confirms; the AI only extracts.

## What it does
1. Vendor submits `/register/{token}` → `vendor_link_submit` → `vendor_update_requests` (pending).
2. The app fires the **`scc-vendor-verify`** workflow (non-blocking) with `{request_id}`.
3. The workflow: reads the request, per-document → OpenAI **extract only** → consolidates →
   **deterministic compare** (typed vs extracted, CR↔VAT, expiry, ID↔signatory, license-pending,
   missing/unreadable docs) → writes `verification` (jsonb) + `verification_status` onto the request.
4. Officer opens **Outreach → Responses → Review submission**: a **Document verification** panel shows
   the overall verdict + per-field ledger, with a **Re-run** button. A `mismatch` verdict **requires an
   override justification** before Approve is enabled.
5. **Approve** applies the submission AND enriches: `vendor_validations` summary rows, `vendors.cr_status
   / cr_last_checked / data_confidence`, and flips `vendor_documents.verified` for docs the AI read.

## Architecture / where things live
- **Workflow** `SCC - Vendor Doc Verify` (n8n; webhook `POST /webhook/scc-vendor-verify`). Single
  orchestrator **Code node** (Webhook → Code, async `responseMode:onReceived`). Reproducible builder +
  backup: `docs/backups/n8n/build_scc_vendor_verify.py` (gitignored).
- **Extraction:** OpenAI `/v1/responses` file-input (PDF/image direct, no rasterization), model
  `gpt-5.4-mini` → `gpt-4.1-mini` fallback. Prompt/schema ported from
  `Procurement/.vendor onboarding docs/tool/api/extract.js`.
- **DB (all additive):** `vendor_update_requests.verification / verification_status / verification_ran_at
  / override_note`; enrich in `vendor_update_apply(uuid,text,text)`; lands in `vendor_validations`,
  `vendors.cr_status/data_confidence`, `vendor_documents.verified`. Reference copies in
  `docs/applied-migrations/`.
- **Frontend:** `src/lib/vendor-link.ts` (`verifyRequest`, `getRequestVerification`), fire-on-submit in
  `src/routes/register.$token.tsx`, review panel in `src/components/vendor-form/PendingVendorUpdates.tsx`.

## Operating / testing
- **Manually verify a request:** `curl -X POST https://n8n.zavia-ai.com/webhook/scc-vendor-verify
  -H "Content-Type: application/json" -d '{"request_id":"<uuid>"}'` → returns immediately; read
  `vendor_update_requests.verification` for the ledger. Or use the **Re-run** button in the review modal.
- **Edit the workflow:** edit the builder, then `python build_scc_vendor_verify.py <workflow_id>` (PUT).
  **PUT does NOT reload the live webhook — you must DELETE + recreate** (run with no id arg) to pick up code.
- The 3 current pending requests all have ledgers (all `mismatch`, correctly — they are test vendors whose
  uploaded PDFs belong to different companies). A real vendor whose docs match their details shows `pass`.

## Hard-won gotchas (do not relearn)
- n8n Code node has **no global `fetch`** — use `this.helpers.httpRequest`.
- `vendor-documents` bucket is **private** → needs the **service_role** key (`Procurement/.env`
  `SUPABASE_SERVCICE_KEY`). service_role also needed a **schema grant** on `scc_procurement` (was
  anon/authenticated-only). Signed-URL download needs `encodeURI` (paths have spaces).
- `vendor_validations` has a **fixed vocab** (check_type/result) — enrich writes summary rows, not the raw ledger.
- 5 docs sequentially timed out the sync webhook → **parallel** (`Promise.all`) + **async** response.

## Not done / future
- **No synthetic "pass" example** loaded — validated on real (mismatched) test vendors; a matching real
  vendor will demonstrate pass. To stage a green demo, create a request whose typed CR/VAT/company match
  an uploaded Sarooj CR/VAT/ID and Re-run.
- **Expired-document auto-outreach (D17)** and the PPT diagrams are separate items, not part of this build.
- **PII → OpenAI** accepted by the client (2026-07-01). service_role key lives in the n8n workflow JSON
  (backup is gitignored); rotate if the instance is ever shared more broadly.
