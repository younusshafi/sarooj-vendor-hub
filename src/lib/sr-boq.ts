// Data seam for the subcontractor BOQ-driven RFQ flow.
// Wired to Supabase RPCs sr_boq_issue / sr_bid_get_by_token / sr_bid_submit_by_token /
// sr_bid_reopen (migrations sr_boq_rfq_tables, sr_boq_rpcs). The BOQ skeleton is flexible:
// the source decides the columns; internal columns are projected OUT server-side in get.
// Design: docs/SR_BOQ_RFQ_PROPOSAL.md.

import { supabase } from "@/integrations/supabase-external/client";

// ── Column + line shapes ─────────────────────────────────────────────────────

export type SrColumnRole = "desc" | "qty" | "unit" | "code" | "data" | "internal";

export interface SrBoqColumn {
  key: string;
  name: string;
  visible: boolean;
  role: SrColumnRole | string;
}

/** A skeleton line as returned by get_by_token (cells already projected to visible columns). */
export interface SrBoqLine {
  line_id: string;
  seq: number;
  role: string; // ITEM | SECTION | NOTE | TOTAL
  incomplete: boolean;
  qty: number | null;
  cells: string[];
}

/** A skeleton line as supplied to sr_boq_issue (cells span ALL columns). */
export interface SrIssueLine {
  seq?: number;
  role: string;
  cells: string[];
  incomplete?: boolean;
  qty?: number | null;
}

// ── Vendor-facing read/submit ────────────────────────────────────────────────

export interface SrCommercialTerms {
  vat_treatment: "exclusive" | "inclusive";
  quotation_ref: string;
  payment_terms: string;
  validity_days: string;
  subcontract_period: string;
  exclusions: string;
  notes: string;
}

export interface SrBidRfq {
  rfq_id: string;
  rfq_reference: string;
  title: string | null;
  deadline: string | null;
  project_name: string | null;
  scope: string | null;
}

export interface SrBidVendor {
  vendor_id: string;
  company_name: string | null;
  email_to: string | null;
}

export interface SrExistingBidLine {
  line_id: string;
  unit_rate_omr: number | null;
  remark: string | null;
}

export interface SrExistingBid {
  revision: number;
  terms: Partial<SrCommercialTerms>;
  lines: SrExistingBidLine[];
}

export type SrBidGetResult =
  | { found: false }
  | {
      found: true;
      locked: boolean;
      rfq: SrBidRfq;
      vendor: SrBidVendor;
      boq_id: string;
      columns: SrBoqColumn[];
      lines: SrBoqLine[];
      existing_bid: SrExistingBid | null;
    };

export interface SrBidLineInput {
  line_id: string;
  unit_rate_omr: number | null;
  remark: string;
}

export interface SrBidSubmitPayload {
  terms: Partial<SrCommercialTerms>;
  lines: SrBidLineInput[];
}

export type SrBidSubmitResult =
  | { ok: true; bid_id: string; revision: number }
  | { ok: false; error: string };

export async function srBidGetByToken(token: string): Promise<SrBidGetResult> {
  const { data, error } = await supabase.rpc("sr_bid_get_by_token", { p_token: token });
  if (error) throw error;
  return data as SrBidGetResult;
}

export async function srBidSubmitByToken(
  token: string,
  payload: SrBidSubmitPayload,
): Promise<SrBidSubmitResult> {
  const { data, error } = await supabase.rpc("sr_bid_submit_by_token", {
    p_token: token,
    p_payload: payload,
  });
  if (error) throw error;
  return data as SrBidSubmitResult;
}

// ── Officer: issue + negotiation reopen ──────────────────────────────────────

export interface SrIssueArgs {
  rfq_id: string;
  columns: SrBoqColumn[];
  lines: SrIssueLine[];
  scope?: string | null;
  source_kind?: string | null;
  source_filename?: string | null;
  actor?: string | null;
}

export type SrIssueResult = { ok: true; boq_id: string } | { ok: false; error: string };

export async function srBoqIssue(args: SrIssueArgs): Promise<SrIssueResult> {
  const { data, error } = await supabase.rpc("sr_boq_issue", {
    p_rfq_id: args.rfq_id,
    p_columns: args.columns,
    p_lines: args.lines,
    p_scope: args.scope ?? null,
    p_source_kind: args.source_kind ?? null,
    p_source_filename: args.source_filename ?? null,
    p_actor: args.actor ?? null,
  });
  if (error) throw error;
  return data as SrIssueResult;
}

export async function srBidReopen(
  bidId: string,
  until: string,
  reason: string,
  actor?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("sr_bid_reopen", {
    p_bid_id: bidId,
    p_until: until,
    p_reason: reason,
    p_actor: actor ?? null,
  });
  if (error) throw error;
  return data as { ok: boolean; error?: string };
}
