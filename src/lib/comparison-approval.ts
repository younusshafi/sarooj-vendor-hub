// Approval (D) — officer submits a comparison; head (Rabia) approves/returns via a
// single-use review link. Spec: docs/PROCURE_TO_AWARD_SPEC.md §5.
// Wired to RPCs comparison_submit_for_approval / comparison_get_by_token /
// comparison_decide_by_token (migration s3_comparison_approval).

import { supabase } from "@/integrations/supabase-external/client";

export interface ApprovalSubmitResult {
  ok: boolean;
  review_token?: string;
  error?: string;
}

export interface ReviewBidLine {
  rfq_item_id: string;
  unit_price_omr: number | null;
  quantity_offered: number | null;
}
export interface ReviewBid {
  vendor_id: string;
  bid_id: string;
  vendor_name: string;
  total_inc_vat_omr: number | null;
  lines: ReviewBidLine[];
}
export interface ReviewItem {
  rfq_item_id: string;
  item_number: number | null;
  sap_item_number: string | null;
  description: string;
  quantity: number;
  unit: string | null;
}
export interface ReviewEqualization {
  rfq_item_id: string;
  vendor_id: string;
  equalization_omr: number;
  note: string;
}
export interface ReviewAward {
  rfq_item_id: string;
  awarded_vendor_id: string;
  awarded_bid_id: string | null;
  reason: string | null;
}

export type ComparisonReviewData =
  | { found: false }
  | {
      found: true;
      status: string;
      prepared_by: string | null;
      decision_notes: string | null;
      rfq: { rfq_id: string; rfq_reference: string; title: string; project_name: string | null };
      items: ReviewItem[];
      bids: ReviewBid[];
      equalizations: ReviewEqualization[];
      awards: ReviewAward[];
    };

export interface DecideResult {
  ok: boolean;
  decision?: "approve" | "return" | "revoke";
  error?: string;
}

export async function submitForApproval(
  comparisonId: string,
  actor: string,
): Promise<ApprovalSubmitResult> {
  const { data, error } = await supabase.rpc("comparison_submit_for_approval", {
    p_comparison_id: comparisonId,
    p_actor: actor,
  });
  if (error) throw error;
  return data as ApprovalSubmitResult;
}

export async function getComparisonByToken(token: string): Promise<ComparisonReviewData> {
  const { data, error } = await supabase.rpc("comparison_get_by_token", { p_token: token });
  if (error) throw error;
  return data as ComparisonReviewData;
}

export async function decideComparison(
  token: string,
  decision: "approve" | "return" | "revoke",
  notes: string,
): Promise<DecideResult> {
  const { data, error } = await supabase.rpc("comparison_decide_by_token", {
    p_token: token,
    p_decision: decision,
    p_notes: notes,
  });
  if (error) throw error;
  return data as DecideResult;
}
