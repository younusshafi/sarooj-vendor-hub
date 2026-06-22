// Data seam for comparison evaluation — equalization (B) + per-line award (C).
// Spec: docs/PROCURE_TO_AWARD_SPEC.md §3–§4.
//
// These are in-app authenticated officer actions. Today they are STUBS (in-memory)
// so the UI is usable without backend. When the tables land
// (comparison_equalizations, comparison_awards), replace the bodies below with
// Supabase reads/upserts (noted inline) — the component needs no change.

export interface Equalization {
  rfq_item_id: string;
  vendor_id: string;
  equalization_omr: number; // officer's budget for the vendor's excluded scope
  note: string; // required: what the budget covers
}

export interface Award {
  rfq_item_id: string;
  awarded_vendor_id: string;
  awarded_bid_id: string;
  reason: string; // required when not the lowest-equalized
}

export interface ComparisonEval {
  equalizations: Equalization[];
  awards: Award[];
}

/** True while stubbed (drives the demo note). Set false when wired. */
export const COMPARISON_EVAL_STUBBED = true;

// in-memory store keyed by comparison_id (cleared on reload — stub only)
const store = new Map<string, ComparisonEval>();

/**
 * STUB. Replace with two selects:
 *   comparison_equalizations / comparison_awards where comparison_id = id.
 */
export async function loadComparisonEval(comparisonId: string): Promise<ComparisonEval> {
  return Promise.resolve(store.get(comparisonId) ?? { equalizations: [], awards: [] });
}

/**
 * STUB. Replace with upserts/deletes against comparison_equalizations &
 * comparison_awards (delete-all-then-insert, or per-row upsert under RLS).
 * Blocked when the comparison is locked (status='approved') — enforce server-side.
 */
export async function saveComparisonEval(
  comparisonId: string,
  data: ComparisonEval,
): Promise<void> {
  store.set(comparisonId, data);
  return Promise.resolve();
}
