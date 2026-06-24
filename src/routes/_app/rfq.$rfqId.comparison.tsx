import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Download, ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/integrations/supabase-external/auth";
import { toast } from "sonner";
import { exportComparisonSheet } from "@/utils/exportComparison";
import { ComparisonAwardPanel } from "@/components/comparison-award-panel";
import { loadComparisonEval } from "@/lib/comparison-eval";
import { submitForApproval } from "@/lib/comparison-approval";

export const Route = createFileRoute("/_app/rfq/$rfqId/comparison")({
  component: ComparisonViewPage,
});

const N8N_WF11 = "https://n8n.zavia-ai.com/webhook/scc-rfq-recommendation";

function paymentTermsChip(term: string | null) {
  if (!term) return null;
  const risk = ["advance_full", "advance_partial"].includes(term);
  const fav = term.startsWith("pdc") || term.startsWith("credit");
  const unk = term === "tbd";
  const bg = risk
    ? "#FEE2E2"
    : fav
      ? "var(--accent-soft)"
      : unk
        ? "#FDF3E0"
        : "var(--table-header)";
  const fg = risk
    ? "#991B1B"
    : fav
      ? "var(--primary-hover)"
      : unk
        ? "#7A5200"
        : "var(--muted-foreground)";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: bg, color: fg }}
    >
      {term.replace(/_/g, " ")}
    </span>
  );
}

function ApprovalStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    draft: { label: "Draft", bg: "#E5EAE8", fg: "#0D3D2E" },
    finalised: { label: "Finalised", bg: "#E0F2EA", fg: "#0D5C3A" },
    pending_approval: { label: "Pending approval", bg: "#FDF3E0", fg: "#7A5200" },
    returned: { label: "Returned", bg: "#FEE2E2", fg: "#991B1B" },
    approved: { label: "Approved — PO pending", bg: "#FDF3E0", fg: "#7A5200" },
    po_issued: { label: "PO issued — closed", bg: "#E0F2EA", fg: "#0D5C3A" },
  };
  const c = map[status] ?? map.draft;
  return (
    <span
      className="rounded-full px-3 py-1 text-xs font-semibold"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {c.label}
    </span>
  );
}

function ComparisonViewPage() {
  const { rfqId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showReasoning, setShowReasoning] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [savingDecision, setSavingDecision] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [poNumber, setPoNumber] = useState("");
  const [issuingPo, setIssuingPo] = useState(false);

  // Decision form state
  const [approvedColumn, setApprovedColumn] = useState("");
  const [selectionType, setSelectionType] = useState<"lowest" | "selected_not_lowest">("lowest");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [approvedBy, setApprovedBy] = useState("Rabia Vahabudeen");

  const { data: rfq } = useQuery({
    queryKey: ["rfq-comparison-header", rfqId],
    queryFn: async () => {
      const { data } = await supabase.from("rfqs").select("*").eq("rfq_id", rfqId).single();
      return data as any;
    },
  });

  const { data: rfqItems } = useQuery({
    queryKey: ["rfq-items-comparison", rfqId],
    queryFn: async () => {
      const { data } = await supabase
        .from("rfq_items")
        .select("*")
        .eq("rfq_id", rfqId)
        .order("item_number");
      return (data ?? []) as any[];
    },
  });

  const { data: bids, isLoading: bidsLoading } = useQuery({
    queryKey: ["all-bids-comparison", rfqId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bids")
        .select(
          "*, vendors(company_name, status, data_confidence, cr_status), bid_items(*, rfq_items(item_number, sap_item_number, sap_material_code, description, quantity, unit, budget_unit_rate_omr, budget_amount_omr))",
        )
        .eq("rfq_id", rfqId)
        .order("total_inc_vat_omr");
      return (data ?? []) as any[];
    },
  });

  // Auto-create / fetch comparison record
  const { data: comparison, refetch: refetchComparison } = useQuery({
    queryKey: ["comparison-record", rfqId],
    queryFn: async () => {
      const { data: existing } = await supabase
        .from("comparisons")
        .select("*")
        .eq("rfq_id", rfqId)
        .maybeSingle();
      if (existing) return existing as any;
      // Create new
      const { data: created } = await supabase
        .from("comparisons")
        .insert({ rfq_id: rfqId, status: "draft", created_by: user?.email ?? "" })
        .select()
        .single();
      return created as any;
    },
    enabled: !!rfqId,
  });

  // Market intel (best effort)
  const { data: marketIntel } = useQuery({
    queryKey: ["market-intel", rfqId],
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("scc_market_intel" as any)
          .select("*")
          .limit(1)
          .maybeSingle();
        return data;
      } catch {
        return null;
      }
    },
    retry: false,
  });

  // Populate decision form from saved comparison
  useEffect(() => {
    if (comparison) {
      setApprovedColumn(comparison.approved_vendor_column || "");
      setSelectionType(comparison.selection_type || "lowest");
      setDecisionNotes(comparison.decision_notes || "");
      setApprovedBy(comparison.approved_by || "Rabia Vahabudeen");
    }
  }, [comparison]);

  const generateAIRecommendation = async () => {
    if (!comparison?.comparison_id) {
      toast.error("Comparison record not found");
      return;
    }
    setGeneratingAI(true);
    try {
      const res = await fetch(N8N_WF11, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfq_id: rfqId,
          comparison_id: comparison.comparison_id,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "WF11 error");
      toast.success("AI recommendation generated");
      refetchComparison();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate recommendation");
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleMarkFinal = async () => {
    if (!comparison?.comparison_id) return;
    if (selectionType === "selected_not_lowest" && !decisionNotes.trim()) {
      toast.error("Comments are required when not selecting lowest bid");
      return;
    }
    setSavingDecision(true);
    try {
      const { error } = await supabase
        .from("comparisons")
        .update({
          status: "finalised",
          approved_vendor_column: approvedColumn ? parseInt(approvedColumn) : null,
          selection_type: selectionType,
          decision_notes: decisionNotes,
          prepared_by: user?.email ?? "",
          approved_by: approvedBy,
          approved_at: new Date().toISOString(),
        })
        .eq("comparison_id", comparison.comparison_id);
      if (error) throw error;
      toast.success("Comparison marked as final");
      refetchComparison();
    } catch (err: any) {
      toast.error(err.message || "Failed to save decision");
    } finally {
      setSavingDecision(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!comparison?.comparison_id) return;
    const itemCount = rfqItems?.length ?? 0;
    const evalData = await loadComparisonEval(comparison.comparison_id);
    if (evalData.awards.length < itemCount) {
      toast.error(
        `Award every line and Save the evaluation first (${evalData.awards.length}/${itemCount} awarded).`,
      );
      return;
    }
    setSubmittingApproval(true);
    try {
      const res = await submitForApproval(comparison.comparison_id, user?.email ?? "");
      if (!res.ok) throw new Error(res.error || "Submit failed");
      toast.success("Submitted to Rabia for approval");
      refetchComparison();
    } catch (err: any) {
      toast.error(err.message || "Submit failed");
    } finally {
      setSubmittingApproval(false);
    }
  };

  const handleIssuePo = async () => {
    if (!comparison?.comparison_id) return;
    if (!poNumber.trim()) {
      toast.error("Enter the PO number first");
      return;
    }
    setIssuingPo(true);
    try {
      const { data, error } = await supabase.rpc("comparison_issue_po", {
        p_comparison_id: comparison.comparison_id,
        p_po_number: poNumber.trim(),
        p_actor: user?.email ?? "",
      });
      if (error) throw error;
      const res = data as { ok?: boolean; error?: string } | null;
      if (!res?.ok) throw new Error(res?.error || "Failed to issue PO");
      toast.success("PO recorded — comparison closed");
      refetchComparison();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to issue PO");
    } finally {
      setIssuingPo(false);
    }
  };

  const handleExport = () => {
    if (!rfq || !rfqItems || !bids) {
      toast.info("Data still loading");
      return;
    }
    exportComparisonSheet(rfq, rfqItems, bids, comparison);
  };

  const vendorCount = bids?.length ?? 0;
  const confirmedBids = (bids ?? []).filter((b) => b.status === "confirmed");
  const confirmedCount = confirmedBids.length;

  if (bidsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl p-6" style={{ backgroundColor: "#FDF3E0" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-[26px]" style={{ color: "#7A5200" }}>
              {rfq?.rfq_reference} — Bid Comparison
            </h1>
            <p className="mt-1 text-sm" style={{ color: "#7A5200", opacity: 0.7 }}>
              {rfq?.title}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-semibold"
              style={{ color: "#7A5200" }}
            >
              <Download className="h-4 w-4" /> Export to Excel
            </button>
            <Link
              to="/rfq/$rfqId/"
              params={{ rfqId }}
              className="text-sm font-medium"
              style={{ color: "var(--accent)" }}
            >
              ← Back to RFQ
            </Link>
          </div>
        </div>
      </div>

      {/* Market demand banner */}
      {marketIntel && (
        <div
          className="flex items-center gap-3 rounded-xl border p-4"
          style={{ borderColor: "#F59E0B", backgroundColor: "#FDF3E0" }}
        >
          <TrendingUp className="h-5 w-5 flex-shrink-0" style={{ color: "#7A5200" }} />
          <span className="text-sm" style={{ color: "#7A5200" }}>
            {marketIntel.signal_text || "Market intelligence signal available"}
          </span>
        </div>
      )}

      {/* No confirmed bids message */}
      {vendorCount === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          No bids received yet. Vendors haven't responded to this RFQ.{" "}
          <Link
            to="/rfq/$rfqId/"
            params={{ rfqId }}
            className="underline"
            style={{ color: "var(--accent)" }}
          >
            Back to RFQ
          </Link>
        </div>
      )}

      {/* Main comparison table */}
      {vendorCount > 0 && rfqItems && (
        <div className="rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: "var(--table-header)" }}>
                <tr
                  className="text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--table-header-text)" }}
                >
                  <th className="sticky left-0 bg-inherit px-4 py-3 z-10">#</th>
                  <th className="px-4 py-3 min-w-[200px]">Description</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3">UOM</th>
                  <th className="px-4 py-3 text-right">Budget Rate</th>
                  <th className="px-4 py-3 text-right">Budget Amt</th>
                  {bids!.map((b, i) => (
                    <th
                      key={b.bid_id}
                      colSpan={2}
                      className="px-4 py-3 text-center"
                      style={{
                        backgroundColor: i % 2 === 0 ? "#E8EFF7" : "#EDF2FB",
                        color: "#1A3A5C",
                      }}
                    >
                      <div>
                        {i + 1}. {b.vendors?.company_name || "Vendor"}
                      </div>
                      <span
                        className="inline-block mt-1 font-medium"
                        style={{
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: "var(--border-radius-md, 6px)",
                          backgroundColor:
                            b.status === "confirmed"
                              ? "var(--accent-soft)"
                              : "var(--color-background-warning, #FDF3E0)",
                          color:
                            b.status === "confirmed"
                              ? "var(--primary-hover)"
                              : "var(--color-text-warning, #7A5200)",
                        }}
                      >
                        {b.status === "confirmed" ? "confirmed" : "pending review"}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Min Rate</th>
                  <th className="px-4 py-3 text-right">Min Amt</th>
                </tr>
                <tr
                  className="text-xs text-muted-foreground"
                  style={{ backgroundColor: "var(--table-header)" }}
                >
                  <th colSpan={6} />
                  {bids!.map((_, i) => (
                    <>
                      <th key={`${i}a`} className="px-4 py-1 text-right">
                        Unit Rate
                      </th>
                      <th key={`${i}b`} className="px-4 py-1 text-right">
                        Amount
                      </th>
                    </>
                  ))}
                  <th colSpan={2} />
                </tr>
              </thead>
              <tbody>
                {rfqItems.map((item, rowIdx) => {
                  // Find min rate across vendors for this item
                  const rates = bids!
                    .map((b) => {
                      const bi = b.bid_items?.find((x: any) => x.rfq_item_id === item.item_id);
                      return bi?.unit_price_omr ?? null;
                    })
                    .filter((r): r is number => r != null);
                  const minRate = rates.length ? Math.min(...rates) : null;

                  return (
                    <tr key={item.item_id} className="border-t border-border">
                      <td className="sticky left-0 bg-white px-4 py-3 text-xs text-muted-foreground z-10">
                        {item.sap_item_number || rowIdx + 1}
                      </td>
                      <td className="px-4 py-3 text-xs">{item.description}</td>
                      <td className="px-4 py-3 text-right text-xs">{item.quantity}</td>
                      <td className="px-4 py-3 text-xs">{item.unit || "—"}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                        {item.budget_unit_rate_omr ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                        {item.budget_amount_omr ?? "—"}
                      </td>
                      {bids!.map((b, i) => {
                        const bi = b.bid_items?.find((x: any) => x.rfq_item_id === item.item_id);
                        const rate = bi?.unit_price_omr ?? null;
                        const amt = rate != null ? rate * item.quantity : null;
                        const isMin = rate != null && minRate != null && rate === minRate;
                        return (
                          <>
                            <td
                              key={`${b.bid_id}-rate`}
                              className="px-4 py-3 text-right font-mono text-xs"
                              style={{
                                backgroundColor: isMin
                                  ? "#E0F2EA"
                                  : i % 2 === 0
                                    ? "#F0F7FF"
                                    : undefined,
                                color: isMin ? "#0D5C3A" : undefined,
                              }}
                            >
                              {rate != null ? (
                                rate.toLocaleString("en", {
                                  minimumFractionDigits: 3,
                                })
                              ) : (
                                <span className="italic text-muted-foreground">NQ</span>
                              )}
                            </td>
                            <td
                              key={`${b.bid_id}-amt`}
                              className="px-4 py-3 text-right font-mono text-xs"
                              style={{
                                backgroundColor: isMin
                                  ? "#E0F2EA"
                                  : i % 2 === 0
                                    ? "#F0F7FF"
                                    : undefined,
                                color: isMin ? "#0D5C3A" : undefined,
                              }}
                            >
                              {amt != null ? (
                                amt.toLocaleString("en", {
                                  minimumFractionDigits: 3,
                                })
                              ) : (
                                <span className="italic text-muted-foreground">NQ</span>
                              )}
                            </td>
                          </>
                        );
                      })}
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold">
                        {minRate != null
                          ? minRate.toLocaleString("en", {
                              minimumFractionDigits: 3,
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold">
                        {minRate != null
                          ? (minRate * item.quantity).toLocaleString("en", {
                              minimumFractionDigits: 3,
                            })
                          : "—"}
                      </td>
                    </tr>
                  );
                })}

                {/* Footer totals */}
                {[
                  { label: "Sub Total (ex-VAT)", key: "subtotal_ex_vat_omr" },
                  { label: "VAT (5%)", key: "vat_amount_omr" },
                  { label: "TOTAL (inc-VAT)", key: "total_inc_vat_omr", bold: true },
                ].map(({ label, key, bold }) => (
                  <tr
                    key={key}
                    className="border-t-2 border-border"
                    style={bold ? { fontWeight: 700 } : {}}
                  >
                    <td
                      colSpan={6}
                      className="px-4 py-2 text-right text-xs font-semibold"
                      style={bold ? { color: "#1A3A5C" } : {}}
                    >
                      {label}
                    </td>
                    {bids!.map((b, i) => (
                      <>
                        <td
                          key={`${b.bid_id}-${key}`}
                          colSpan={2}
                          className="px-4 py-2 text-center font-mono text-xs"
                          style={{
                            backgroundColor: i % 2 === 0 ? "#F0F7FF" : undefined,
                            fontWeight: bold ? 700 : undefined,
                            color: bold ? "#1A3A5C" : undefined,
                          }}
                        >
                          OMR{" "}
                          {(b[key] ?? 0).toLocaleString("en", {
                            minimumFractionDigits: 3,
                          })}
                        </td>
                      </>
                    ))}
                    <td colSpan={2} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Commercial summary table */}
      {vendorCount > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Commercial Summary
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: "var(--table-header)" }}>
                <tr
                  className="text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--table-header-text)" }}
                >
                  <th className="px-4 py-2">Criteria</th>
                  {bids!.map((b, i) => (
                    <th key={b.bid_id} className="px-4 py-2">
                      <div>
                        {i + 1}. {b.vendors?.company_name || "Vendor"}
                      </div>
                      <span
                        className="inline-block mt-1 font-medium normal-case tracking-normal"
                        style={{
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: "var(--border-radius-md, 6px)",
                          backgroundColor:
                            b.status === "confirmed"
                              ? "var(--accent-soft)"
                              : "var(--color-background-warning, #FDF3E0)",
                          color:
                            b.status === "confirmed"
                              ? "var(--primary-hover)"
                              : "var(--color-text-warning, #7A5200)",
                        }}
                      >
                        {b.status === "confirmed" ? "confirmed" : "pending review"}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    label: "Payment Terms",
                    render: (b: any) => paymentTermsChip(b.payment_structure),
                  },
                  {
                    label: "Lead Time",
                    render: (b: any) =>
                      b.delivery_lead_time_days ? `${b.delivery_lead_time_days} days` : "—",
                  },
                  {
                    label: "Validity",
                    render: (b: any) => (b.validity_days ? `${b.validity_days} days` : "—"),
                  },
                  {
                    label: "Brand",
                    render: (b: any) => b.manufacturer_brand || "—",
                  },
                  {
                    label: "Vendor Status",
                    render: (b: any) => b.vendors?.status || "—",
                  },
                  {
                    label: "Data Confidence",
                    render: (b: any) => b.vendors?.data_confidence || "—",
                  },
                ].map(({ label, render }) => (
                  <tr key={label} className="border-t border-border">
                    <td className="px-4 py-2 text-xs font-medium text-muted-foreground">{label}</td>
                    {bids!.map((b) => (
                      <td key={b.bid_id} className="px-4 py-2 text-xs">
                        {render(b)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI Recommendation panel */}
      <div
        className="rounded-xl border border-amber-200 p-6"
        style={{ backgroundColor: "#FDF3E0" }}
      >
        <h2
          className="mb-4 text-sm font-semibold uppercase tracking-wider"
          style={{ color: "#7A5200" }}
        >
          AI Recommendation
        </h2>

        {!comparison?.ai_recommendation ? (
          <div className="text-center">
            <p className="mb-4 text-sm text-muted-foreground">
              No recommendation generated yet.{" "}
              {confirmedCount === 0
                ? "Confirm at least one bid before generating a recommendation."
                : `Click below to analyse ${confirmedCount} confirmed bid(s).`}
            </p>
            <button
              onClick={generateAIRecommendation}
              disabled={generatingAI || confirmedCount === 0}
              className="flex items-center gap-2 mx-auto rounded-md px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "#7A5200" }}
            >
              {generatingAI ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analysing bids…
                </>
              ) : (
                "Generate AI Recommendation"
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold" style={{ color: "#7A5200" }}>
                {comparison.ai_recommendation}
              </span>
              {comparison.recommendation_confidence && (
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: "#FDE68A", color: "#7A5200" }}
                >
                  {comparison.recommendation_confidence} confidence
                </span>
              )}
            </div>
            {comparison.recommendation_summary && (
              <p className="text-sm text-muted-foreground">{comparison.recommendation_summary}</p>
            )}
            <button
              onClick={() => setShowReasoning((v) => !v)}
              className="flex items-center gap-1 text-sm font-medium"
              style={{ color: "#7A5200" }}
            >
              View full reasoning{" "}
              {showReasoning ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {showReasoning && (
              <div className="space-y-2 rounded-lg bg-white p-4 text-sm text-muted-foreground">
                {comparison.reasoning && <p>{comparison.reasoning}</p>}
                {comparison.payment_terms_note && (
                  <p>
                    <strong>Payment terms:</strong> {comparison.payment_terms_note}
                  </p>
                )}
                {comparison.caveats && (
                  <p>
                    <strong>Caveats:</strong> {comparison.caveats}
                  </p>
                )}
                {comparison.alternative_vendor && (
                  <p>
                    <strong>Alternative:</strong> {comparison.alternative_vendor} —{" "}
                    {comparison.alternative_reasoning}
                  </p>
                )}
              </div>
            )}
            <button
              onClick={generateAIRecommendation}
              disabled={generatingAI}
              className="text-xs underline"
              style={{ color: "#7A5200" }}
            >
              {generatingAI ? "Regenerating…" : "Regenerate"}
            </button>
          </div>
        )}
      </div>

      {/* Per-line award & equalization (B + C) */}
      {comparison?.comparison_id && (bids?.length ?? 0) > 0 && (rfqItems?.length ?? 0) > 0 && (
        <ComparisonAwardPanel
          comparisonId={comparison.comparison_id}
          rfqItems={rfqItems!}
          bids={bids!}
          locked={["approved", "po_issued"].includes(comparison.status)}
        />
      )}

      {/* Approval (D) — officer → Rabia */}
      {comparison?.comparison_id && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Approval
            </h2>
            <ApprovalStatusBadge status={comparison.status} />
          </div>

          {comparison.status === "returned" && comparison.review_notes && (
            <div
              className="mt-3 rounded-lg px-3 py-2 text-sm"
              style={{ backgroundColor: "#FDF3E0", color: "#7A5200" }}
            >
              <strong>Returned by approver:</strong> {comparison.review_notes}
            </div>
          )}

          {comparison.status === "po_issued" ? (
            <p className="mt-3 text-sm" style={{ color: "#0D5C3A" }}>
              <strong>PO {comparison.po_number}</strong> issued
              {comparison.po_issued_by ? ` by ${comparison.po_issued_by}` : ""}
              {comparison.po_issued_at
                ? ` on ${new Date(comparison.po_issued_at).toLocaleDateString("en-GB")}`
                : ""}
              . This comparison is closed and locked.
            </p>
          ) : comparison.status === "approved" ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm" style={{ color: "#0D5C3A" }}>
                Approved by {comparison.approved_by}
                {comparison.approval_date ? ` on ${comparison.approval_date}` : ""} — awaiting PO.
                The award is locked. The approver can still revoke until the PO is issued.
                {comparison.review_notes ? ` Note: ${comparison.review_notes}` : ""}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs font-medium text-muted-foreground">
                  PO number
                  <input
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    placeholder="e.g. PO-2026-001"
                    className="mt-1 block w-56 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
                  />
                </label>
                <button
                  onClick={handleIssuePo}
                  disabled={issuingPo || !poNumber.trim()}
                  className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  {issuingPo ? "Saving…" : "Mark PO Issued"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Recording the PO closes the comparison permanently — no further revocation.
              </p>
            </div>
          ) : comparison.status === "pending_approval" ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-muted-foreground">
                Awaiting approval from Rabia. Share this single-use review link if needed:
              </p>
              <input
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                value={`${window.location.origin}/comparison-review/${comparison.review_token}`}
                className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-xs outline-none"
              />
            </div>
          ) : (
            <div className="mt-3">
              <button
                onClick={handleSubmitForApproval}
                disabled={submittingApproval}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {submittingApproval ? "Submitting…" : "Submit for approval"}
              </button>
              <p className="mt-1 text-xs text-muted-foreground">
                Award every line and Save the evaluation above first.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Decision capture card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Decision
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Approved Supplier (Column No.)
            </label>
            <select
              value={approvedColumn}
              onChange={(e) => setApprovedColumn(e.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
            >
              <option value="">Select…</option>
              {confirmedBids.map((b, i) => (
                <option key={b.bid_id} value={String(i + 1)}>
                  {i + 1} — {b.vendors?.company_name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Selection Type</label>
            <div className="flex gap-2">
              {(
                [
                  { value: "lowest", label: "LOWEST" },
                  { value: "selected_not_lowest", label: "SELECTED — not lowest" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectionType(opt.value)}
                  className="flex-1 rounded-md border px-3 py-2 text-xs font-semibold transition-colors"
                  style={
                    selectionType === opt.value
                      ? { backgroundColor: "#1A3A5C", color: "white", borderColor: "#1A3A5C" }
                      : { borderColor: "var(--border)" }
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {selectionType === "selected_not_lowest" && (
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">
                Comments (required)
              </label>
              <textarea
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
                placeholder="Reason for not selecting the lowest bid…"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Prepared By</label>
            <div className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">
              {user?.email || "—"}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Approved By</label>
            <input
              type="text"
              value={approvedBy}
              onChange={(e) => setApprovedBy(e.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleMarkFinal}
            disabled={savingDecision || !approvedColumn || confirmedCount === 0}
            className="flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {savingDecision && <Loader2 className="h-4 w-4 animate-spin" />}
            {comparison?.status === "finalised" ? "Update Final Decision" : "Mark as Final"}
          </button>
        </div>

        {comparison?.status === "finalised" && (
          <div
            className="mt-3 rounded-md p-3 text-sm font-medium"
            style={{
              backgroundColor: "var(--toast-success-bg)",
              color: "var(--toast-success-fg)",
            }}
          >
            ✓ Marked as final on{" "}
            {comparison.approved_at
              ? new Date(comparison.approved_at).toLocaleDateString("en-GB")
              : "—"}
          </div>
        )}
      </div>
    </div>
  );
}
