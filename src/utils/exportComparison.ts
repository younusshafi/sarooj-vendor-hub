import * as XLSX from "xlsx";

export function exportComparisonSheet(rfq: any, rfqItems: any[], bids: any[], comparison: any) {
  const wb = XLSX.utils.book_new();
  const rows: any[][] = [];

  // Header block
  rows.push(["SAROOJ CONSTRUCTION COMPANY"]);
  rows.push(["MATERIALS COMPARISON SHEET"]);
  rows.push(["CS Prepared Date", new Date().toLocaleDateString("en-GB")]);
  rows.push(["Material Requisition No.", (rfq.pr_numbers || []).join(", ")]);
  rows.push(["Project Name / Code", rfq.project_name || ""]);
  rows.push(["Project Location", rfq.project_location || ""]);
  rows.push(["Client", rfq.client || ""]);
  rows.push(["Consultant", rfq.consultant || ""]);
  rows.push([]);

  // Vendor name header row
  const vendorRow: any[] = ["", "", "", "", "BUDGET RATE (RO)", "BUDGET AMOUNT (RO)"];
  bids.forEach((b) => vendorRow.push(b.vendors?.company_name || "", ""));
  vendorRow.push("MIN UNIT RATE (RO)", "MIN AMOUNT (RO)");
  rows.push(vendorRow);

  // Column headers
  const colRow: any[] = [
    "SN",
    "ITEM DESCRIPTION",
    "QTY",
    "UOM",
    "BUDGET RATE (RO)",
    "BUDGET AMOUNT (RO)",
  ];
  bids.forEach(() => colRow.push("UNIT RATE (RO)", "AMOUNT (RO)"));
  colRow.push("MIN UNIT RATE (RO)", "MIN AMOUNT (RO)");
  rows.push(colRow);

  // Item rows
  rfqItems.forEach((item, i) => {
    const row: any[] = [
      i + 1,
      item.description,
      item.quantity,
      item.unit || "",
      item.budget_unit_rate_omr || "",
      item.budget_amount_omr || "",
    ];
    let min = Infinity;
    bids.forEach((bid) => {
      const bi = bid.bid_items?.find((x: any) => x.rfq_item_id === item.item_id);
      const rate = bi?.unit_price_omr ?? null;
      row.push(rate ?? "NQ", rate != null ? rate * item.quantity : "NQ");
      if (rate != null && rate < min) min = rate;
    });
    row.push(min !== Infinity ? min : "NQ", min !== Infinity ? min * item.quantity : "NQ");
    rows.push(row);
  });

  rows.push([]);

  // Totals
  const sub: any[] = ["SUB TOTAL", "", "", "", "", ""];
  bids.forEach((b) => sub.push(b.subtotal_ex_vat_omr || 0, ""));
  rows.push(sub);

  const vat: any[] = ["5% VAT", "", "", "", "", ""];
  bids.forEach((b) => vat.push(b.vat_amount_omr || 0, ""));
  rows.push(vat);

  const tot: any[] = ["TOTAL (inc-VAT)", "", "", "", "", ""];
  bids.forEach((b) => tot.push(b.total_inc_vat_omr || 0, ""));
  rows.push(tot);

  rows.push([]);

  // Commercial summary
  const payRow: any[] = ["PAYMENT TERMS", "", "", "", "", ""];
  bids.forEach((b) => payRow.push(b.payment_structure || "", ""));
  rows.push(payRow);

  const leadRow: any[] = ["LEAD TIME (days)", "", "", "", "", ""];
  bids.forEach((b) => leadRow.push(b.delivery_lead_time_days || "", ""));
  rows.push(leadRow);

  const valRow: any[] = ["VALIDITY (days)", "", "", "", "", ""];
  bids.forEach((b) => valRow.push(b.validity_days || "", ""));
  rows.push(valRow);

  rows.push([]);

  // Recommendation
  rows.push(["PROCUREMENT RECOMMENDATION", comparison?.ai_recommendation || ""]);
  rows.push(["APPROVED SUPPLIER COLUMN NO.", comparison?.approved_vendor_column || ""]);
  rows.push(["SELECTION TYPE", comparison?.selection_type || ""]);
  rows.push(["COMMENTS", comparison?.decision_notes || ""]);

  rows.push([]);

  // Approval block
  rows.push(["PREPARED BY", "", "APPROVED BY"]);
  rows.push([comparison?.prepared_by || "", "", comparison?.approved_by || "Rabia Vahabudeen"]);
  rows.push(["Procurement Officer / Engineer", "", "Procurement Manager"]);
  rows.push(["Sign and Date", "", "Sign and Date"]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "CS");
  XLSX.writeFile(wb, `${rfq.rfq_reference || "RFQ"}_comparison.xlsx`);
}
