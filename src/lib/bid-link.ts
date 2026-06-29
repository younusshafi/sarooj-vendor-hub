// Data seam for the vendor bid-entry link (workstream A / spec §2).
// Wired to Supabase RPCs bid_get_by_token / bid_submit_by_token
// (migration s4_vendor_bid_link). Contract: docs/PROCURE_TO_AWARD_SPEC.md §2.

import { supabase } from "@/integrations/supabase-external/client";

// ── Contract types ───────────────────────────────────────────────────────────

export interface BidRfq {
  rfq_id: string;
  rfq_reference: string;
  title: string;
  deadline: string | null;
  rfq_type: string;
  project_name: string | null;
  vendor_instructions: string | null;
}

export interface BidVendor {
  vendor_id: string;
  company_name: string;
  contact_person: string | null;
  email_to: string | null;
}

export interface BidItem {
  rfq_item_id: string;
  item_number: number | null;
  sap_item_number: string | null;
  description: string;
  quantity: number;
  unit: string | null;
}

export type VatTreatment = "inclusive" | "exclusive";

export interface BidHeader {
  quotation_reference: string;
  quotation_date: string; // yyyy-mm-dd or ""
  currency: string;
  payment_structure: string;
  advance_percentage: string; // kept as string in the form; coerced server-side
  credit_days: string;
  pdc_days: string;
  payment_method: string;
  delivery_terms: string;
  delivery_location: string;
  delivery_lead_time_days: string;
  validity_days: string;
  vat_treatment: VatTreatment;
  scope_coverage_percent: string;
  exclusions: string;
  key_conditions: string;
  notes: string;
}

export interface BidLineInput {
  rfq_item_id: string;
  unit_price_omr: number | null;
  quantity_offered: number | null;
  brand: string;
  deviations_from_rfq: string;
}

export interface ExistingBid {
  header: Partial<BidHeader>;
  lines: BidLineInput[];
  revision: string;
}

export type BidGetResult =
  | { found: false }
  | {
      found: true;
      locked: boolean; // current_date > deadline → read-only
      rfq: BidRfq;
      vendor: BidVendor;
      items: BidItem[];
      existing_bid: ExistingBid | null;
    };

export interface BidSubmitPayload {
  header: BidHeader;
  lines: BidLineInput[];
}

export type BidSubmitResult =
  | { ok: true; bid_id: string; revision: string }
  | { ok: false; error: string };

/** Backend RPCs are live. */
export const BID_LINK_STUBBED = false;

export async function bidGetByToken(token: string): Promise<BidGetResult> {
  const { data, error } = await supabase.rpc("bid_get_by_token", { p_token: token });
  if (error) throw error;
  return data as BidGetResult;
}

export async function bidSubmitByToken(
  token: string,
  payload: BidSubmitPayload,
): Promise<BidSubmitResult> {
  const { data, error } = await supabase.rpc("bid_submit_by_token", {
    p_token: token,
    p_payload: payload,
  });
  if (error) throw error;
  return data as BidSubmitResult;
}
