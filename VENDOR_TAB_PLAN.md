# Vendor tab — recipients vs candidate pool

**Goal:** On an issued RFQ, the Vendors tab should default to showing only the vendors
actually **sent** the RFQ (the recipients), with a toggle to reveal the full matched pool.
Draft RFQs keep the full, selectable candidate pool. Frontend-only; no backend/schema change.

## Confirmed signal (live data, 2026-06-22)

Dispatch stamps only selected vendors: `rfq_vendors.sent_at` set + `status` → `sent`/`responded`;
the rest stay `pending` with `sent_at = null`. Every `responded` row also has `sent_at`.

- **Canonical "recipient" test = `sent_at != null`.**
- Tracker view `v_pr_rfq_detail.vendors_invited` counts the **full pool** (rule-1, read-only) —
  so a collapsed tab ("Sent to 3") and the tracker ("60 invited") show two true-but-different
  numbers. Reconcile by wording, not by changing the view.

## Approach — share logic, not the component

Two Vendors tabs diverge by design (materials = custom/inline styles, sessionStorage selection,
Preview-page dispatch; SR = shadcn, in-memory selection, inline dispatch panel). Don't unify the
component. Extract a small pure-logic module both import; keep rendering per-component.

### 1. New `src/lib/rfq-vendors.ts` (pure, generic)
- `wasSent(v)` → `!!v.sent_at`
- `isTestAlways(v)`, `isTestBatch(v)` (consolidates 3 drifting copies of `isTestVendor`)
- `excludeTestBatch(list)`
- `splitRecipients(list)` → `{ recipients, uncontacted }`
- `groupByCategory(list)` (generic)
- `recipientSummary(list)` → `{ total, sent, responded, uncontacted }`

### 2. Materials — `VendorsTabPanel` (`rfq.$rfqId.index.tsx`)
- Use shared helpers (replace inline TEST_BATCH filter).
- draft: unchanged (full pool, Preview & Select button, sessionStorage badge = bridge to Preview).
- issued+: default to recipients; header "Sent to N vendors · {date}" (DB-backed, drop the
  sessionStorage "X of Y selected" badge); add toggle "Show all matched ({M} un-contacted)".

### 3. SR — `RfqVendorList` + `rfq.sub.$rfqId.tsx`
- Thread RFQ `status` prop in (pass `header.status`); component is status-blind today.
- Use shared helpers; ADD `excludeTestBatch` (SR filters nothing today).
- draft: unchanged. issued+: default to recipients + "Show all matched" toggle (reuse existing
  per-vendor Sent/Pending/Responded UI); header → "Sent to N vendors".
- **Gate mutation when issued** (disable checkboxes/add/remove) — SR is fully editable on issued
  RFQs today; materials already effectively read-only post-issue.

## Decisions taken
- Canonical signal: `sent_at`.
- Pattern B: recipients-by-default + "Show all matched" toggle.
- SR editing locked when `status !== 'draft'`.
- Header wording: "Sent to N vendors" / toggle "Show all matched (M un-contacted)".

## Sequence (gate after each: tsc · lint · build · verify:contracts; manual materials smoke)
1. Build `rfq-vendors.ts`.
2. Refactor both components to use it for existing behavior — pure, no visual change.
3. Materials: recipients filter + toggle + DB-backed header.
4. SR: thread status, filter + toggle, TEST_BATCH exclusion, mutation gating.
