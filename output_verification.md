# Sarooj Vendor Hub — Comprehensive Verification Audit
**Date:** 2026-05-26  
**Scope:** Modules 2 + 4 (RFQ workflow + Bid comparison AI)  
**Instruction:** Audit and fix only. No new features. Fix only strictly required breakages.

---

## Summary

| Audit | Area | Result |
|-------|------|--------|
| 1 | Navigation | FIXED |
| 2 | Route tree | PASS |
| 3 | New RFQ page | PASS |
| 4 | Preview screen | PASS (minor gaps noted) |
| 5 | RFQ Tracker | PASS (minor gaps noted) |
| 6 | RFQ Detail page | PASS |
| 7 | Bid Review page | PASS |
| 8 | Comparison view | PASS |
| 9 | Settings page | PASS |
| — | Schema column fixes (prev. session) | FIXED |
| — | n8n credential issues | MANUAL ACTION REQUIRED |

---

## Audit 1 — Navigation (FIXED)

**Finding:** The "Bids" nav item in `app-sidebar.tsx` pointed to `/rfq/bids`, which renders a "Coming Soon" placeholder. Clicking it was a functional dead-end.

**Fix applied:** Removed the "Bids" nav item from the `NAV` array in `src/components/app-sidebar.tsx`. The bid workflow is correctly reached via: RFQ Tracker → RFQ Detail → Bids tab → Review link → Comparison view.

**Also removed** the now-unused `ClipboardList` import from lucide-react.

---

## Audit 2 — Route Tree (PASS)

All routes confirmed present in `routeTree.gen.ts`:

| Route | File | Status |
|-------|------|--------|
| `/rfq` | rfq.tsx (layout) | ✓ |
| `/rfq/` | rfq.index.tsx | ✓ |
| `/rfq/new` | rfq.new.tsx | ✓ |
| `/rfq/preview` | rfq.preview.tsx | ✓ |
| `/rfq/bids` | rfq.bids.tsx | ✓ (exists; no longer in nav) |
| `/rfq/$rfqId/` | rfq.$rfqId.index.tsx | ✓ |
| `/rfq/$rfqId/comparison` | rfq.$rfqId.comparison.tsx | ✓ |
| `/rfq/$rfqId/bids/$bidId/review` | rfq.$rfqId.bids.$bidId.review.tsx | ✓ |
| `/settings` | settings.tsx | ✓ |

---

## Audit 3 — New RFQ Page (PASS)

**File:** `src/routes/_app/rfq.new.tsx`

| Check | Status |
|-------|--------|
| `parseSAPExcel()` reads "SAPUI5 Export" sheet | ✓ |
| `decodeExcelDate()` — `(serial - 25569) * 86400 * 1000` | ✓ |
| `xlsx` package installed (`^0.18.5` in package.json) | ✓ |
| File upload zone with drag-and-drop | ✓ |
| Items summary preview table | ✓ |
| Collapsible details per item | ✓ |
| Generate button disabled until rows loaded | ✓ |
| POSTs to `https://n8n.zavia-ai.com/webhook/scc-rfq-generate` | ✓ |
| On success: stores rfq_ids in sessionStorage → navigates to `/rfq/preview` | ✓ |

---

## Audit 4 — Preview Screen (PASS, minor gap noted)

**File:** `src/routes/_app/rfq.preview.tsx`

| Check | Status |
|-------|--------|
| Loads rfq, rfq_items, rfq_vendors from Supabase | ✓ |
| Loads T&Cs from `system_settings.rfq_terms_and_conditions` | ✓ |
| Loads default deadline days from `system_settings.rfq_default_deadline_days` | ✓ |
| Two-column layout (lg:col-span-3 / lg:col-span-2) | ✓ |
| Email subject — editable input | ✓ |
| Email body — editable textarea + HTML preview toggle | ✓ |
| Items table — read-only | ✓ |
| T&Cs textarea — editable | ✓ |
| `needsScope` red warning when `rfq.needs_scope_documents` is true | ✓ |
| `alreadyProcured` amber warning when items flagged | ✓ |
| Multiple RFQ group tabs | ✓ |
| Response deadline date picker (pre-filled with default days) | ✓ |
| Vendor cards: company name, email, contact person | ✓ |
| Vendor remove (X) button | ✓ |
| Add vendor search (ilike, excludes blacklisted) | ✓ |
| Confirm dispatch modal | ✓ |
| POSTs to `https://n8n.zavia-ai.com/webhook/scc-rfq-dispatch` | ✓ |
| On success: navigates to RFQ detail page | ✓ |

**Gap (not fixed — not broken):** Vendor cards do not show `ai_flag`/`ai_notes` warnings. The `rfq_vendors` select fetches `vendors(company_name,status)` but not `ai_flag`/`ai_notes`. The page is fully functional without this; it is a missing enhancement, not a breakage.

---

## Audit 5 — RFQ Tracker (PASS, minor gap noted)

**File:** `src/routes/_app/rfq.index.tsx`

| Check | Status |
|-------|--------|
| Table columns: Reference, Title, Type, Status, Deadline, Sent, View | ✓ |
| Search by reference / title (`ilike`) | ✓ |
| Filter by type (materials / subcontract) | ✓ |
| Filter by status | ✓ |
| Clear filters button (shown only when filters active) | ✓ |
| Skeleton loading state | ✓ |
| Empty state with "Create one" link | ✓ |
| Error state with retry | ✓ |
| "New RFQ" button → `/rfq/new` | ✓ |
| RFQ status badges with correct colors | ✓ |
| "View" link navigates to `/rfq/$rfqId` | ✓ |

**Gap (not fixed — not broken):** "Vendors" count and "Responses" count columns are absent. The tracker is fully functional without them; these are missing enhancements.

---

## Audit 6 — RFQ Detail Page (PASS)

**File:** `src/routes/_app/rfq.$rfqId.index.tsx`

| Check | Status |
|-------|--------|
| 3-tab layout: Overview, Vendors, Bids | ✓ |
| Overview: info cards for all rfq fields | ✓ |
| Overview: Drive Folder link (if set) | ✓ |
| Overview: PR Numbers chips (if set) | ✓ |
| Vendors tab: loads rfq_vendors with company name, email, status, sent/response/reminder dates | ✓ |
| Bids tab: loads bids with vendor, status, total, ai confidence, received date | ✓ |
| Bids tab: "Review" link → `/rfq/$rfqId/bids/$bidId/review` | ✓ |
| `ai_extraction_confidence` field name (fixed from `overall_confidence`) | ✓ |
| Confidence badge renders from `ai_extraction_confidence` | ✓ |

---

## Audit 7 — Bid Review Page (PASS)

**File:** `src/routes/_app/rfq.$rfqId.bids.$bidId.review.tsx`

| Check | Status |
|-------|--------|
| Amber design header `#FDF3E0` / `#7A5200` | ✓ |
| Confidence legend (green=high, amber=medium, red=not extracted) | ✓ |
| Two-panel layout: left = original email, right = AI extracted data | ✓ |
| Vendor name displayed | ✓ |
| All editable fields: quote ref, date, currency, VAT treatment, payment structure/method, lead time, validity, brand | ✓ |
| Conditional fields (credit days, PDC days, advance %) | ✓ |
| Items table with confidence-coloured rate inputs | ✓ |
| Auto-calculated: subtotal, VAT (5% if exclusive), total | ✓ |
| Notes field uses `notes` column (fixed from `general_notes`) | ✓ |
| Item update uses `.eq("item_id")` (fixed from `.eq("bid_item_id")`) | ✓ |
| `bid_item_id` in editedItems populated from `bi.item_id` (fixed) | ✓ |
| CONFIRM BID → status "confirmed" → navigate to comparison | ✓ |
| SAVE DRAFT → saves without status change | ✓ |
| REJECT BID → confirmation modal → status "rejected" → navigate to RFQ detail | ✓ |

---

## Audit 8 — Comparison View (PASS)

**File:** `src/routes/_app/rfq.$rfqId.comparison.tsx`

| Check | Status |
|-------|--------|
| Amber design header `#FDF3E0` / `#7A5200` | ✓ |
| Auto-creates comparison record if not exists | ✓ |
| Loads confirmed bids with `vendors` + `bid_items` + `rfq_items` joins | ✓ |
| Market intel banner (best-effort, silently skipped if table absent) | ✓ |
| "No confirmed bids" empty state with link | ✓ |
| Comparison table: item rows with Budget Rate, Budget Amt per rfq_items | ✓ |
| Vendor columns with alternating colour (#E8EFF7 / #EDF2FB) | ✓ |
| Min-rate cell highlighted green (#D1FAE5) | ✓ |
| Null rate renders as italic "NQ" | ✓ |
| Footer rows: Sub Total, VAT (5%), TOTAL | ✓ |
| Commercial summary table: payment terms, lead time, validity, brand, vendor status, data confidence | ✓ |
| Payment terms chips with risk colouring | ✓ |
| AI Recommendation panel — "Generate" button POSTs to WF11 | ✓ |
| Shows ai_recommendation, recommendation_confidence, recommendation_summary | ✓ |
| "View full reasoning" collapsible with reasoning, payment_terms_note, caveats, alternative_vendor | ✓ |
| "Regenerate" link | ✓ |
| Decision capture: approved supplier dropdown, selection type (LOWEST / SELECTED not lowest) | ✓ |
| Comments required when not selecting lowest | ✓ |
| Prepared By shows logged-in user email | ✓ |
| Approved By editable input | ✓ |
| Mark as Final → status `"finalised"` (fixed from `"final"`) | ✓ |
| `approved_vendor_column: parseInt(approvedColumn)` (fixed from bare string) | ✓ |
| `approved_at: new Date().toISOString()` (fixed from `finalised_at`) | ✓ |
| Banner "✓ Marked as final on..." shown when `comparison.status === "finalised"` (fixed from `"final"`) | ✓ |
| Export to Excel button → `exportComparisonSheet()` | ✓ |

---

## Audit 9 — Settings Page (PASS)

**File:** `src/routes/_app/settings.tsx`

| Check | Status |
|-------|--------|
| Account card showing signed-in email | ✓ |
| Terms & Conditions — multiline textarea, `setting_key: "rfq_terms_and_conditions"` | ✓ |
| Default Deadline Days — number input (1–365), `setting_key: "rfq_default_deadline_days"` | ✓ |
| Reminder Days Before Deadline — number input (1–30), `setting_key: "rfq_reminder_days_before"` | ✓ |
| Each field saves independently to `system_settings` via `UPDATE ... WHERE setting_key = X` | ✓ |
| Save button shows spinner while saving, check icon + "Saved!" on success | ✓ |
| Loading skeleton while fetching | ✓ |
| Error toast on failure | ✓ |

---

## Schema Fixes Applied (Previous Session)

These column name mismatches were corrected in code and deployed:

| File | Fix |
|------|-----|
| `rfq.$rfqId.index.tsx` | `overall_confidence` → `ai_extraction_confidence` in select and render |
| `rfq.$rfqId.bids.$bidId.review.tsx` | `bi.bid_item_id` → `bi.item_id` in editedItems map |
| `rfq.$rfqId.bids.$bidId.review.tsx` | `.eq("bid_item_id", ...)` → `.eq("item_id", ...)` in update |
| `rfq.$rfqId.bids.$bidId.review.tsx` | `general_notes` → `notes` (state, populate, update payload, JSX) |
| `rfq.$rfqId.comparison.tsx` | `status: "final"` → `status: "finalised"` |
| `rfq.$rfqId.comparison.tsx` | `approved_vendor_column: approvedColumn` → `parseInt(approvedColumn)` |
| `rfq.$rfqId.comparison.tsx` | `finalised_at` → `approved_at` |
| `rfq.$rfqId.comparison.tsx` | `comparison?.status === "final"` → `"finalised"` (2 occurrences) |
| `rfq.$rfqId.comparison.tsx` | `comparison.finalised_at` → `comparison.approved_at` |

All fixes committed to `github.com/younusshafi/sarooj-vendor-hub` branch `main` (commit `ecc48e2`) and auto-deployed to `sarooj-vendor-hub.vercel.app`.

---

## n8n Workflow Issues — Manual Action Required

These cannot be fixed from the frontend or via Supabase. They require access to the n8n UI at `n8n.zavia-ai.com`.

### WF7 — scc-rfq-generate
**Issue:** "Chat Model - Categorise" node has an invalid/expired OpenAI credential.  
**Fix:** Re-link a valid OpenAI API key credential on that node.

### WF8 — scc-rfq-dispatch
**Issue:** Google Drive credential has expired OAuth token.  
**Fix:** Re-authenticate the Google Drive OAuth2 credential via n8n credentials manager.

### WF11 — scc-rfq-recommendation
**Issue:** The "Fetch Bids" HTTP Request node requests columns that don't exist:
- `ai_overall_confidence` → correct column is `ai_extraction_confidence`
- `bid_item_id` → correct column is `item_id` (in `bid_items` table)

**Fix:** Edit the WF11 Supabase GET node select parameter:
- Change `ai_overall_confidence` → `ai_extraction_confidence`
- Change `bid_item_id` → `item_id`

---

## Deployment

The source repo is `github.com/younusshafi/sarooj-vendor-hub`.  
The Vercel project `sarooj-vendor-hub` auto-deploys from that repo's `main` branch.  
Production URL: `https://sarooj-vendor-hub.vercel.app`

**To deploy any future code changes:** `git push origin main` from `sarooj-vendor-hub-code/`.

---

*Audit completed: 2026-05-26*
