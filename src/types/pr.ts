// Typed interfaces for scc_procurement PR views.
// Generated from the backend contracts in CLAUDE.md — do not drift.

/** One row per PR from scc_procurement.v_pr_tracker */
export interface PrTrackerRow {
  pr_number: string;
  total_rfqs: number;
  issued_rfqs: number;
  rfqs_with_responses: number;
  rfqs_evaluated: number;
  total_vendors_invited: number;
  total_responses_received: number;
  total_items: number;
  rfq_references: string[];
  first_rfq_created_at: string;
  last_rfq_created_at: string;
  pr_status: string;
  pr_status_code: PrStatusCode;
}

/** One row per (PR × RFQ) from scc_procurement.v_pr_rfq_detail */
export interface PrRfqDetailRow {
  pr_number: string;
  rfq_id: string;
  rfq_reference: string;
  title: string;
  rfq_type: string;
  rfq_status: string;
  created_at: string;
  items_from_this_pr: number;
  vendors_invited: number;
  responses_received: number;
  comparisons_count: number;
  finalised_count: number;
}

/** The four lifecycle codes from pr_status_code */
export type PrStatusCode =
  | "draft"
  | "issued_awaiting"
  | "responses_pending"
  | "evaluation_complete";

/** Display labels (note: en-dash U+2013 in two labels — never hand-type for matching) */
export const PR_STATUS_LABEL: Record<PrStatusCode, string> = {
  draft: "Draft",
  issued_awaiting: "Issued \u2013 awaiting responses",
  responses_pending: "Responses in \u2013 pending evaluation",
  evaluation_complete: "Evaluation complete",
};

/** Badge colour tokens keyed on pr_status_code (bg / text) */
export const PR_STATUS_BADGE: Record<PrStatusCode, { bg: string; text: string }> = {
  draft: { bg: "#E5EAE8", text: "#0D3D2E" },
  issued_awaiting: { bg: "#E8EFF7", text: "#1A3A5C" },
  responses_pending: { bg: "#FDF3E0", text: "#7A5200" },
  evaluation_complete: { bg: "#E0F2EA", text: "#0D5C3A" },
};
