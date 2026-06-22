// Comparison evaluation — equalization (B) + per-line award (C).
// Spec: docs/PROCURE_TO_AWARD_SPEC.md §3–§4.
//
// Wired to scc_procurement.comparison_equalizations / comparison_awards
// (migration s2_comparison_equalizations_and_awards). Save = full replace for the
// comparison (delete existing rows, insert current set). Officer-authenticated via
// the shared anon client, matching the rest of the app.

import { supabase } from "@/integrations/supabase-external/client";

export interface Equalization {
  rfq_item_id: string;
  vendor_id: string;
  equalization_omr: number; // officer's budget for the vendor's excluded scope (may be negative)
  note: string; // what it covers
}

export interface Award {
  rfq_item_id: string;
  awarded_vendor_id: string;
  awarded_bid_id: string;
  reason: string; // required (app-enforced) when not the lowest-equalized
}

export interface ComparisonEval {
  equalizations: Equalization[];
  awards: Award[];
}

/** Backend tables are live. */
export const COMPARISON_EVAL_STUBBED = false;

export async function loadComparisonEval(comparisonId: string): Promise<ComparisonEval> {
  const [eqRes, awRes] = await Promise.all([
    supabase
      .from("comparison_equalizations")
      .select("rfq_item_id,vendor_id,equalization_omr,note")
      .eq("comparison_id", comparisonId),
    supabase
      .from("comparison_awards")
      .select("rfq_item_id,awarded_vendor_id,awarded_bid_id,reason")
      .eq("comparison_id", comparisonId),
  ]);
  if (eqRes.error) throw eqRes.error;
  if (awRes.error) throw awRes.error;
  return {
    equalizations: (eqRes.data ?? []).map((r) => ({
      rfq_item_id: r.rfq_item_id,
      vendor_id: r.vendor_id,
      equalization_omr: Number(r.equalization_omr),
      note: r.note ?? "",
    })),
    awards: (awRes.data ?? []).map((r) => ({
      rfq_item_id: r.rfq_item_id,
      awarded_vendor_id: r.awarded_vendor_id,
      awarded_bid_id: r.awarded_bid_id ?? "",
      reason: r.reason ?? "",
    })),
  };
}

export async function saveComparisonEval(
  comparisonId: string,
  data: ComparisonEval,
): Promise<void> {
  // Full replace for this comparison.
  const delEq = await supabase
    .from("comparison_equalizations")
    .delete()
    .eq("comparison_id", comparisonId);
  if (delEq.error) throw delEq.error;
  const delAw = await supabase.from("comparison_awards").delete().eq("comparison_id", comparisonId);
  if (delAw.error) throw delAw.error;

  if (data.equalizations.length) {
    const insEq = await supabase.from("comparison_equalizations").insert(
      data.equalizations.map((e) => ({
        comparison_id: comparisonId,
        rfq_item_id: e.rfq_item_id,
        vendor_id: e.vendor_id,
        equalization_omr: e.equalization_omr,
        note: e.note,
      })),
    );
    if (insEq.error) throw insEq.error;
  }

  if (data.awards.length) {
    const insAw = await supabase.from("comparison_awards").insert(
      data.awards.map((a) => ({
        comparison_id: comparisonId,
        rfq_item_id: a.rfq_item_id,
        awarded_vendor_id: a.awarded_vendor_id,
        awarded_bid_id: a.awarded_bid_id || null, // empty → null (rule 5)
        reason: a.reason || null,
      })),
    );
    if (insAw.error) throw insAw.error;
  }
}
