// Shared, pure logic for classifying RFQ vendor rows.
//
// Both Vendors tabs (materials `VendorsTabPanel` and subcontractor `RfqVendorList`)
// import these so they agree on what counts as a "recipient", what a test vendor is,
// and how rows are grouped — while keeping their own (different) rendering.
//
// Canonical signal: dispatch stamps `sent_at` only on the vendors actually emailed,
// leaving the rest `pending` with `sent_at = null`. So a recipient ⇔ `sent_at != null`.

/** Minimal field shape both row types already satisfy. */
export interface ClassifiableVendor {
  status?: string | null;
  sent_at?: string | null;
  response_received?: boolean | null;
  matched_category?: string | null;
  vendors?: { company_name?: string | null; categories?: string[] | null } | null;
}

/** A vendor was actually sent the RFQ (the canonical recipient signal). */
export function wasSent(v: ClassifiableVendor): boolean {
  return !!v.sent_at;
}

/** Always-on test vendor (gets the real email during test dispatches). */
export function isTestAlways(v: ClassifiableVendor): boolean {
  return (
    v.matched_category === "TEST_ALWAYS" || (v.vendors?.company_name ?? "").startsWith("SCC TEST")
  );
}

/** Batch test vendor — excluded from the visible list entirely. */
export function isTestBatch(v: ClassifiableVendor): boolean {
  return (v.vendors?.categories ?? []).includes("TEST_BATCH");
}

/** Drop TEST_BATCH vendors; keep everything else (incl. TEST_ALWAYS, which is badged). */
export function excludeTestBatch<T extends ClassifiableVendor>(list: T[]): T[] {
  return list.filter((v) => !isTestBatch(v));
}

/** Split into vendors actually sent the RFQ vs. the un-contacted candidate pool. */
export function splitRecipients<T extends ClassifiableVendor>(
  list: T[],
): { recipients: T[]; uncontacted: T[] } {
  const recipients: T[] = [];
  const uncontacted: T[] = [];
  for (const v of list) (wasSent(v) ? recipients : uncontacted).push(v);
  return { recipients, uncontacted };
}

/** Group rows by matched category (falling back to "Uncategorised"), keys unsorted. */
export function groupByCategory<T extends ClassifiableVendor>(list: T[]): Record<string, T[]> {
  return list.reduce<Record<string, T[]>>((acc, v) => {
    const cat = v.matched_category || "Uncategorised";
    (acc[cat] ??= []).push(v);
    return acc;
  }, {});
}

/** Headline counts for a vendor set. */
export function recipientSummary(list: ClassifiableVendor[]): {
  total: number;
  sent: number;
  responded: number;
  uncontacted: number;
} {
  let sent = 0;
  let responded = 0;
  for (const v of list) {
    if (wasSent(v)) sent++;
    else continue;
    if (v.response_received) responded++;
  }
  return { total: list.length, sent, responded, uncontacted: list.length - sent };
}
