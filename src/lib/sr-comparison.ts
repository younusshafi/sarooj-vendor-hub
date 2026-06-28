// Officer-side SR (subcontractor) bid comparison data layer. Reads the issued BOQ
// skeleton + every vendor's LATEST submission and lays them side by side; persists
// per-line equalization (sr_bid_equalization) and awards (sr_award). RLS is off
// project-wide, so the authenticated officer reads/writes these tables directly
// (vendor-facing reads still go through the SECURITY DEFINER token RPCs).
//
// Schema: docs/applied-migrations/sr_boq_rfq_tables.sql + sr_boq_rpcs.sql.

import { supabase } from "@/integrations/supabase-external/client";
import type { SrBoqColumn } from "@/lib/sr-boq";

export interface SrCmpLine {
  line_id: string;
  seq: number;
  role: string; // ITEM | SECTION | NOTE | TOTAL
  cells: string[];
  qty: number | null;
  incomplete: boolean;
}

export interface SrCmpRate {
  unit_rate_omr: number | null;
  amount_omr: number | null;
  remark: string | null;
}

export interface SrCmpVendor {
  rfq_vendor_id: string;
  bid_id: string;
  vendor_id: string | null;
  company_name: string;
  email_to: string | null;
  status: string;
  revision: number;
  vat_treatment: string | null;
  payment_terms: string | null;
  validity_days: number | null;
  subcontract_period: string | null;
  exclusions: string | null;
  notes: string | null;
  subtotal_omr: number | null;
  vat_omr: number | null;
  total_omr: number | null;
  reopened_until: string | null;
  /** line_id -> rate cell */
  rates: Record<string, SrCmpRate>;
}

export interface SrCmpEqualization {
  line_id: string;
  rfq_vendor_id: string;
  adjustment_omr: number;
  note: string;
}

export interface SrCmpAward {
  line_id: string;
  rfq_vendor_id: string;
  awarded_bid_id: string | null;
  reason: string;
}

export interface SrComparison {
  boq_id: string;
  scope: string | null;
  columns: SrBoqColumn[];
  descIdx: number;
  lines: SrCmpLine[];
  vendors: SrCmpVendor[];
  equalizations: SrCmpEqualization[];
  awards: SrCmpAward[];
}

// ── Raw row shapes (PostgREST) ──────────────────────────────────────────────
interface BoqRow {
  boq_id: string;
  columns: SrBoqColumn[] | null;
  scope: string | null;
  status: string;
}
interface LineRow {
  line_id: string;
  seq: number;
  role: string;
  cells: string[] | null;
  qty: number | null;
  incomplete: boolean;
}
interface BidRow {
  bid_id: string;
  rfq_vendor_id: string;
  revision: number;
  status: string;
  vat_treatment: string | null;
  payment_terms: string | null;
  validity_days: number | null;
  subcontract_period: string | null;
  exclusions: string | null;
  notes: string | null;
  subtotal_omr: number | null;
  vat_omr: number | null;
  total_omr: number | null;
  reopened_until: string | null;
  rfq_vendors: {
    id: string;
    vendor_id: string | null;
    email_to: string | null;
    vendors: { company_name: string | null } | null;
  } | null;
}
interface BidLineRow {
  bid_id: string;
  line_id: string;
  unit_rate_omr: number | null;
  amount_omr: number | null;
  remark: string | null;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

/** Load the full officer comparison for an SR RFQ. Returns null if no BOQ is issued. */
export async function srLoadComparison(rfqId: string): Promise<SrComparison | null> {
  const { data: boqData } = await supabase
    .from("sr_boq")
    .select("boq_id,columns,scope,status")
    .eq("rfq_id", rfqId)
    .eq("status", "issued")
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const boq = boqData as BoqRow | null;
  if (!boq) return null;

  const columns = (boq.columns ?? []) as SrBoqColumn[];
  const descIdx = columns.findIndex(
    (c) => c.role === "desc" || /desc|item|work|description/i.test(c.name),
  );

  const { data: lineData } = await supabase
    .from("sr_boq_line")
    .select("line_id,seq,role,cells,qty,incomplete")
    .eq("boq_id", boq.boq_id)
    .order("seq", { ascending: true });
  const lines: SrCmpLine[] = ((lineData ?? []) as LineRow[]).map((l) => ({
    line_id: l.line_id,
    seq: l.seq,
    role: l.role,
    cells: (l.cells ?? []) as string[],
    qty: num(l.qty),
    incomplete: l.incomplete,
  }));

  const { data: bidData } = await supabase
    .from("sr_bid")
    .select(
      "bid_id,rfq_vendor_id,revision,status,vat_treatment,payment_terms,validity_days,subcontract_period,exclusions,notes,subtotal_omr,vat_omr,total_omr,reopened_until,rfq_vendors(id,vendor_id,email_to,vendors(company_name))",
    )
    .eq("boq_id", boq.boq_id)
    .eq("is_latest", true);
  const bidRows = (bidData ?? []) as unknown as BidRow[];

  const bidIds = bidRows.map((b) => b.bid_id);
  let bidLineRows: BidLineRow[] = [];
  if (bidIds.length) {
    const { data: blData } = await supabase
      .from("sr_bid_line")
      .select("bid_id,line_id,unit_rate_omr,amount_omr,remark")
      .in("bid_id", bidIds);
    bidLineRows = (blData ?? []) as BidLineRow[];
  }

  const ratesByBid = new Map<string, Record<string, SrCmpRate>>();
  for (const bl of bidLineRows) {
    let m = ratesByBid.get(bl.bid_id);
    if (!m) {
      m = {};
      ratesByBid.set(bl.bid_id, m);
    }
    m[bl.line_id] = {
      unit_rate_omr: num(bl.unit_rate_omr),
      amount_omr: num(bl.amount_omr),
      remark: bl.remark,
    };
  }

  const vendors: SrCmpVendor[] = bidRows
    .map((b) => ({
      rfq_vendor_id: b.rfq_vendor_id,
      bid_id: b.bid_id,
      vendor_id: b.rfq_vendors?.vendor_id ?? null,
      company_name: b.rfq_vendors?.vendors?.company_name ?? "Vendor",
      email_to: b.rfq_vendors?.email_to ?? null,
      status: b.status,
      revision: b.revision,
      vat_treatment: b.vat_treatment,
      payment_terms: b.payment_terms,
      validity_days: b.validity_days,
      subcontract_period: b.subcontract_period,
      exclusions: b.exclusions,
      notes: b.notes,
      subtotal_omr: num(b.subtotal_omr),
      vat_omr: num(b.vat_omr),
      total_omr: num(b.total_omr),
      reopened_until: b.reopened_until,
      rates: ratesByBid.get(b.bid_id) ?? {},
    }))
    .sort((a, b) => (a.total_omr ?? Infinity) - (b.total_omr ?? Infinity));

  const { data: eqData } = await supabase
    .from("sr_bid_equalization")
    .select("line_id,rfq_vendor_id,adjustment_omr,note")
    .eq("boq_id", boq.boq_id);
  const equalizations: SrCmpEqualization[] = ((eqData ?? []) as SrCmpEqualization[]).map((e) => ({
    line_id: e.line_id,
    rfq_vendor_id: e.rfq_vendor_id,
    adjustment_omr: num(e.adjustment_omr) ?? 0,
    note: e.note ?? "",
  }));

  const { data: awardData } = await supabase
    .from("sr_award")
    .select("line_id,rfq_vendor_id,awarded_bid_id,reason")
    .eq("boq_id", boq.boq_id);
  const awards: SrCmpAward[] = ((awardData ?? []) as SrCmpAward[]).map((a) => ({
    line_id: a.line_id,
    rfq_vendor_id: a.rfq_vendor_id,
    awarded_bid_id: a.awarded_bid_id ?? null,
    reason: a.reason ?? "",
  }));

  return {
    boq_id: boq.boq_id,
    scope: boq.scope,
    columns,
    descIdx,
    lines,
    vendors,
    equalizations,
    awards,
  };
}

export interface SrSaveEqualization {
  line_id: string;
  rfq_vendor_id: string;
  adjustment_omr: number;
  note: string;
}
export interface SrSaveAward {
  line_id: string;
  rfq_vendor_id: string;
  awarded_bid_id: string | null;
  reason: string;
}

/**
 * Replace the saved evaluation (equalizations + awards) for a BOQ. Replace-semantics:
 * clears prior rows for this BOQ then inserts the current set, so removing an award/
 * adjustment in the UI removes it in the DB.
 */
export async function srSaveComparison(
  boqId: string,
  actor: string | null,
  equalizations: SrSaveEqualization[],
  awards: SrSaveAward[],
): Promise<void> {
  await supabase.from("sr_bid_equalization").delete().eq("boq_id", boqId);
  if (equalizations.length) {
    const rows = equalizations.map((e) => ({
      boq_id: boqId,
      line_id: e.line_id,
      rfq_vendor_id: e.rfq_vendor_id,
      adjustment_omr: e.adjustment_omr,
      note: e.note || null,
      created_by: actor,
    }));
    const { error } = await supabase.from("sr_bid_equalization").insert(rows);
    if (error) throw error;
  }

  await supabase.from("sr_award").delete().eq("boq_id", boqId);
  if (awards.length) {
    const rows = awards.map((a) => ({
      boq_id: boqId,
      line_id: a.line_id,
      rfq_vendor_id: a.rfq_vendor_id,
      awarded_bid_id: a.awarded_bid_id,
      reason: a.reason || null,
      created_by: actor,
    }));
    const { error } = await supabase.from("sr_award").insert(rows);
    if (error) throw error;
  }
}
