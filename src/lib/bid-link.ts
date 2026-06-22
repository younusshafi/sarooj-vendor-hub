// Data seam for the vendor bid-entry link (workstream A / spec §2).
//
// Today these are STUBS so the /bid/$token UI is fully clickable without backend.
// When the backend RPCs land (bid_get_by_token / bid_submit_by_token), replace the
// bodies of bidGetByToken/bidSubmitByToken with the supabase.rpc(...) calls noted
// inline — nothing else in the route needs to change.
//
// Contract: docs/PROCURE_TO_AWARD_SPEC.md §2.

// ── Contract types ───────────────────────────────────────────────────────────

export interface BidRfq {
  rfq_id: string;
  rfq_reference: string;
  title: string;
  deadline: string | null;
  rfq_type: string;
  project_name: string | null;
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
  advance_percentage: string; // kept as string in the form; coerced on submit
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
  revision: number;
}

export type BidGetResult =
  | { found: false }
  | {
      found: true;
      locked: boolean; // now > deadline → read-only
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
  | { ok: true; bid_id: string; revision: number }
  | { ok: false; error: string };

/** True while the data layer is stubbed (drives the demo banner). Set false when wired. */
export const BID_LINK_STUBBED = true;

// ── Stub implementation (remove when wired) ──────────────────────────────────

const SAMPLE_ITEMS: BidItem[] = [
  {
    rfq_item_id: "i1",
    item_number: 1,
    sap_item_number: "10",
    description: 'HPVC Ball Valve 2"',
    quantity: 25,
    unit: "NOS",
  },
  {
    rfq_item_id: "i2",
    item_number: 2,
    sap_item_number: "20",
    description: 'Brass NRV 1.5"',
    quantity: 40,
    unit: "NOS",
  },
  {
    rfq_item_id: "i3",
    item_number: 3,
    sap_item_number: "30",
    description: "HPVC Pipe 3in x 6m",
    quantity: 120,
    unit: "MTR",
  },
  {
    rfq_item_id: "i4",
    item_number: 4,
    sap_item_number: "40",
    description: "GI Elbow 90deg 2in",
    quantity: 60,
    unit: "NOS",
  },
  {
    rfq_item_id: "i5",
    item_number: 5,
    sap_item_number: "50",
    description: "PTFE Thread Seal Tape",
    quantity: 200,
    unit: "ROLL",
  },
];

const SAMPLE_RFQ: BidRfq = {
  rfq_id: "rfq-demo",
  rfq_reference: "MR-2606-027",
  title: "Plumbing materials — Phase 2",
  deadline: "2026-07-05",
  rfq_type: "materials",
  project_name: "SCC HQ Fit-out",
};

const SAMPLE_VENDOR: BidVendor = {
  vendor_id: "v-demo",
  company_name: "Demo Trading LLC",
  contact_person: "A. Vendor",
  email_to: "vendor@example.com",
};

function delay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * STUB. Replace with:
 *   const { data, error } = await supabase.rpc("bid_get_by_token", { p_token: token });
 *   if (error) throw error;
 *   return data as BidGetResult;
 *
 * Stub tokens for testing states:
 *   ""/"invalid" → not found · "expired" → locked (view-only) ·
 *   "revise" → prefilled re-open · anything else → fresh form.
 */
export async function bidGetByToken(token: string): Promise<BidGetResult> {
  if (!token || token === "invalid") return delay({ found: false });

  const base = {
    found: true as const,
    rfq: SAMPLE_RFQ,
    vendor: SAMPLE_VENDOR,
    items: SAMPLE_ITEMS,
  };

  if (token === "expired") {
    return delay({
      ...base,
      locked: true,
      existing_bid: {
        revision: 1,
        header: { validity_days: "30", vat_treatment: "exclusive" },
        lines: SAMPLE_ITEMS.map((it, i) => ({
          rfq_item_id: it.rfq_item_id,
          unit_price_omr: [11.9, 8.5, 14.8, 3.2, 0.9][i] ?? null,
          quantity_offered: null,
          brand: "Generic",
          deviations_from_rfq: "",
        })),
      },
    });
  }

  if (token === "revise") {
    return delay({
      ...base,
      locked: false,
      existing_bid: {
        revision: 1,
        header: {
          validity_days: "30",
          vat_treatment: "exclusive",
          payment_structure: "30 days credit",
        },
        lines: SAMPLE_ITEMS.map((it, i) => ({
          rfq_item_id: it.rfq_item_id,
          unit_price_omr: [11.9, 8.5, null, 3.2, 0.9][i] ?? null,
          quantity_offered: null,
          brand: "Generic",
          deviations_from_rfq: i === 2 ? "Item 3: 6m length not stocked; 5.8m offered" : "",
        })),
      },
    });
  }

  return delay({ ...base, locked: false, existing_bid: null });
}

/**
 * STUB. Replace with:
 *   const { data, error } = await supabase.rpc("bid_submit_by_token",
 *     { p_token: token, p_payload: payload });
 *   if (error) throw error;
 *   return data as BidSubmitResult;
 */
export async function bidSubmitByToken(
  token: string,
  payload: BidSubmitPayload,
): Promise<BidSubmitResult> {
  if (token === "expired") return delay({ ok: false, error: "This RFQ has closed." });
  const priced = payload.lines.filter((l) => l.unit_price_omr != null).length;
  if (priced === 0)
    return delay({ ok: false, error: "Enter at least one rate before submitting." });
  return delay({ ok: true, bid_id: "stub-bid-id", revision: 1 });
}
