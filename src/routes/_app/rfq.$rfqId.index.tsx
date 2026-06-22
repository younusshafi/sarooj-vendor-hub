import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Send,
  CheckCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/rfq/$rfqId/")({
  component: RFQDetailPage,
});

// This is the materials (Supplies) RFQ detail page. Subcontractor RFQs have their
// own in-app detail screen — if one is reached here directly by URL, redirect to it.
type Tab = "overview" | "vendors" | "bids";

function RFQDetailPage() {
  const { rfqId } = Route.useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");

  const { data: rfq, isLoading: rfqLoading } = useQuery({
    queryKey: ["rfq-detail", rfqId],
    queryFn: async () => {
      const { data, error } = await supabase.from("rfqs").select("*").eq("rfq_id", rfqId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: vendors, isLoading: vendorsLoading } = useQuery({
    queryKey: ["rfq-vendors-detail", rfqId],
    queryFn: async () => {
      const { data } = await supabase
        .from("rfq_vendors")
        .select(
          "id,vendor_id,email_to,contact_person,matched_category,status,response_received,sent_at,response_at,reminder_sent_at,vendors(company_name,contacts,categories)",
        )
        .eq("rfq_id", rfqId);
      return (data ?? []) as any[];
    },
    enabled: tab === "vendors",
  });

  const { data: rfqItems } = useQuery({
    queryKey: ["rfq-items-overview", rfqId],
    queryFn: async () => {
      const { data } = await supabase
        .from("rfq_items")
        .select(
          "item_id, sap_item_number, description, quantity, unit, delivery_date, budget_unit_rate_omr",
        )
        .eq("rfq_id", rfqId)
        .order("sap_item_number");
      return (data ?? []) as any[];
    },
  });

  const { data: bids, isLoading: bidsLoading } = useQuery({
    queryKey: ["rfq-bids-detail", rfqId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bids")
        .select(
          "bid_id,status,total_inc_vat_omr,subtotal_ex_vat_omr,ai_extraction_confidence,created_at,vendors(company_name)",
        )
        .eq("rfq_id", rfqId)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
    enabled: true,
  });

  // Guard: a subcontractor RFQ reached here directly belongs to the SR detail screen.
  const isSubcontractor = !!rfq && rfq.rfq_type !== "materials";
  useEffect(() => {
    if (isSubcontractor) {
      navigate({ to: "/rfq/sub/$rfqId", params: { rfqId }, replace: true });
    }
  }, [isSubcontractor, rfqId, navigate]);

  if (rfqLoading || isSubcontractor) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!rfq) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        RFQ not found.{" "}
        <Link to="/rfq/" className="underline" style={{ color: "var(--accent)" }}>
          Back to tracker
        </Link>
      </div>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "vendors", label: "Vendors" },
    { id: "bids", label: "Bids" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl p-6" style={{ backgroundColor: "#E8EFF7" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-semibold text-muted-foreground">
                {rfq.rfq_reference}
              </span>
              <RFQStatusBadge status={rfq.status} />
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: rfq.rfq_type === "materials" ? "#d1e0f4" : "#FDE68A",
                  color: rfq.rfq_type === "materials" ? "#1A3A5C" : "#7A5200",
                }}
              >
                {rfq.rfq_type}
              </span>
            </div>
            <h1 className="mt-2 font-display text-[26px]" style={{ color: "#1A3A5C" }}>
              {rfq.title}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {(bids?.length ?? 0) > 0 && (
              <Link
                to="/rfq/$rfqId/comparison"
                params={{ rfqId }}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: "#1A3A5C" }}
              >
                Compare bids ({bids?.length})
              </Link>
            )}
            <Link to="/rfq/" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
              ← Back
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px"
            style={
              tab === t.id
                ? { borderColor: "#1A3A5C", color: "#1A3A5C" }
                : { borderColor: "transparent", color: "var(--muted-foreground)" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard label="RFQ Reference" value={rfq.rfq_reference || "—"} />
          <InfoCard label="RFQ Type" value={rfq.rfq_type || "—"} />
          <InfoCard label="Status" value={rfq.status || "—"} />
          <InfoCard label="Deadline" value={rfq.deadline || "—"} />
          <InfoCard label="Sent At" value={rfq.sent_at ? formatDate(rfq.sent_at) : "—"} />
          <InfoCard label="Created At" value={rfq.created_at ? formatDate(rfq.created_at) : "—"} />
          {rfq.project_name && <InfoCard label="Project Name" value={rfq.project_name} />}
          {rfq.project_code && <InfoCard label="Project Code" value={rfq.project_code} />}
          {rfq.project_location && (
            <InfoCard label="Project Location" value={rfq.project_location} />
          )}
          {rfq.client && <InfoCard label="Client" value={rfq.client} />}
          {rfq.consultant && <InfoCard label="Consultant" value={rfq.consultant} />}
          {rfq.created_by && <InfoCard label="Created By" value={rfq.created_by} />}
          {rfq.drive_folder_url && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Drive Folder
              </div>
              <a
                href={rfq.drive_folder_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center gap-1 text-sm font-medium"
                style={{ color: "var(--accent)" }}
              >
                Open in Drive <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
          {rfq.pr_numbers && rfq.pr_numbers.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 sm:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                PR Numbers
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {rfq.pr_numbers.map((pr: string) => (
                  <span key={pr} className="rounded font-mono text-xs px-2 py-0.5 bg-secondary">
                    {pr}
                  </span>
                ))}
              </div>
            </div>
          )}
          {rfqItems && rfqItems.length > 0 && (
            <div className="rounded-xl border border-border bg-card sm:col-span-2 lg:col-span-3">
              <div className="px-4 py-3 border-b border-border">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Items ({rfqItems.length})
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: "var(--table-header)" }}>
                    <tr
                      className="text-left text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--table-header-text)" }}
                    >
                      <th className="px-4 py-2">#</th>
                      <th className="px-4 py-2">Description</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2">Unit</th>
                      <th className="px-4 py-2">Delivery Date</th>
                      <th className="px-4 py-2 text-right">Budget Rate (OMR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rfqItems.map((item: any) => (
                      <tr key={item.item_id} className="border-t border-border">
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                          {item.sap_item_number ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-xs">{item.description || "—"}</td>
                        <td className="px-4 py-2 text-right text-xs">{item.quantity ?? "—"}</td>
                        <td className="px-4 py-2 text-xs">{item.unit || "—"}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {item.delivery_date ? item.delivery_date.split("T")[0] : "—"}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                          {item.budget_unit_rate_omr ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vendors tab */}
      {tab === "vendors" && (
        <VendorsTabPanel
          rfq={rfq}
          rfqId={rfqId}
          vendors={vendors ?? []}
          vendorsLoading={vendorsLoading}
        />
      )}

      {/* Bids tab */}
      {tab === "bids" && (
        <div className="space-y-3">
          {(bids?.length ?? 0) > 0 && (
            <div className="flex justify-end">
              <Link
                to="/rfq/$rfqId/comparison"
                params={{ rfqId }}
                className="text-sm font-medium"
                style={{ color: "var(--accent)" }}
              >
                View comparison →
              </Link>
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: "var(--table-header)" }}>
                <tr
                  className="text-left text-[13px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--table-header-text)" }}
                >
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Total (OMR)</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {bidsLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                )}
                {!bidsLoading && (bids?.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No bids received yet
                    </td>
                  </tr>
                )}
                {bids?.map((b: any) => (
                  <tr key={b.bid_id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{b.vendors?.company_name || "—"}</td>
                    <td className="px-4 py-3">
                      <BidStatusBadge status={b.status} />
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {b.total_inc_vat_omr != null
                        ? `OMR ${Number(b.total_inc_vat_omr).toLocaleString("en", { minimumFractionDigits: 3 })}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <ConfidenceBadge level={b.ai_extraction_confidence} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.created_at ? formatDate(b.created_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to="/rfq/$rfqId/bids/$bidId/review"
                        params={{ rfqId, bidId: b.bid_id }}
                        className="text-xs font-medium underline"
                        style={{ color: "var(--accent)" }}
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vendors Tab Panel ────────────────────────────────────────────────────────

function VendorsTabPanel({
  rfq,
  rfqId,
  vendors,
  vendorsLoading,
}: {
  rfq: any;
  rfqId: string;
  vendors: any[];
  vendorsLoading: boolean;
}) {
  const isDraft = rfq.status === "draft";

  const filteredVendors = vendors.filter(
    (v: any) => !(v.vendors?.categories ?? []).includes("TEST_BATCH"),
  );

  // Read saved selection from sessionStorage (set by Preview page)
  const [savedSelection] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem(`rfq_selection_${rfqId}`);
      if (stored) return new Set(JSON.parse(stored) as string[]);
    } catch {
      /* ignored */
    }
    return new Set<string>();
  });
  const hasSelection = savedSelection.size > 0;
  const selectedCount = filteredVendors.filter((v: any) => savedSelection.has(v.vendor_id)).length;

  const [emailExpanded, setEmailExpanded] = useState(true);
  const [deadline, setDeadline] = useState<string>(rfq.deadline ?? "");
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [deadlineSaved, setDeadlineSaved] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Save deadline
  const handleDeadlineChange = useCallback(
    async (value: string) => {
      setDeadline(value);
      setDeadlineSaving(true);
      setDeadlineSaved(false);
      try {
        const { error } = await supabase
          .from("rfqs")
          .update({ deadline: value })
          .eq("rfq_id", rfqId);
        if (error) throw error;
        setDeadlineSaved(true);
        setTimeout(() => setDeadlineSaved(false), 2000);
      } catch {
        showToast("Failed to save deadline", "error");
      } finally {
        setDeadlineSaving(false);
      }
    },
    [rfqId, showToast],
  );

  const vendorCount = filteredVendors.length;

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg"
          style={{
            backgroundColor: toast.type === "success" ? "var(--accent)" : "#991B1B",
            color: "#fff",
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold" style={{ color: "#1A3A5C" }}>
            {vendorsLoading ? "Vendors" : `Vendors (${vendorCount})`}
          </span>
          {hasSelection && (
            <span
              className="rounded-full px-3 py-0.5 text-xs font-medium"
              style={{ backgroundColor: "#E0F2EA", color: "#0D5C3A" }}
            >
              {selectedCount} of {vendorCount} selected for dispatch
            </span>
          )}
          {rfq.status === "issued" && rfq.sent_at && (
            <span
              className="rounded-full px-3 py-0.5 text-xs font-medium"
              style={{ backgroundColor: "#E8F5EE", color: "#0D5C3A" }}
            >
              Sent {formatDate(rfq.sent_at)}
            </span>
          )}
        </div>
        {isDraft ? (
          <Link
            to="/rfq/preview"
            search={{ rfq_ids: [rfqId] }}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ backgroundColor: "var(--accent)", color: "#fff" }}
          >
            <Send className="h-4 w-4" />
            Preview & Select Recipients
          </Link>
        ) : (
          <span
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: "#E8F5EE", color: "#0D5C3A" }}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            RFQ Issued
          </span>
        )}
      </div>

      {/* Deadline */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
        <span
          className="w-36 shrink-0 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted-foreground)" }}
        >
          Response Deadline
        </span>
        {isDraft ? (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={deadline}
              onChange={(e) => handleDeadlineChange(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none"
              style={{ color: "var(--foreground)" }}
            />
            {deadlineSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {deadlineSaved && !deadlineSaving && (
              <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                Saved
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
            {rfq.deadline || "—"}
          </span>
        )}
      </div>

      {/* Vendor list — grouped by category */}
      {vendorsLoading && (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      )}
      {!vendorsLoading && filteredVendors.length === 0 && (
        <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-muted-foreground">
          No vendors assigned
        </div>
      )}
      {!vendorsLoading &&
        (() => {
          const grouped = filteredVendors.reduce((acc: Record<string, any[]>, v: any) => {
            const cat = v.matched_category || "Uncategorised";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(v);
            return acc;
          }, {});
          const categoryNames = Object.keys(grouped).sort();
          return categoryNames.map((categoryName) => (
            <div key={categoryName} className="mb-4">
              <div
                className="flex items-center justify-between px-4 py-2 rounded-t-xl"
                style={{ backgroundColor: "#E8EFF7" }}
              >
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#1A3A5C" }}
                >
                  {categoryName} ({grouped[categoryName].length})
                </span>
              </div>
              <div className="overflow-hidden rounded-b-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: "var(--table-header)" }}>
                    <tr
                      className="text-left text-[13px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--table-header-text)" }}
                    >
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Contact Person</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[categoryName].map((v: any) => {
                      const isSelected = !hasSelection || savedSelection.has(v.vendor_id);
                      return (
                        <tr
                          key={v.id}
                          className="border-t border-border"
                          style={{ opacity: isSelected ? 1 : 0.4 }}
                        >
                          <td
                            className="px-4 py-3 font-medium"
                            style={{ color: "var(--foreground)" }}
                          >
                            <span className="flex items-center gap-2">
                              {v.vendors?.company_name || "—"}
                              {hasSelection && isSelected && (
                                <CheckCircle
                                  className="h-3.5 w-3.5 flex-shrink-0"
                                  style={{ color: "var(--accent)" }}
                                />
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {v.contact_person || "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {v.email_to || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {(v.vendors?.categories ?? []).slice(0, 2).map((cat: string) => (
                                <span
                                  key={cat}
                                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                                  style={{ backgroundColor: "#E8EFF7", color: "#1A3A5C" }}
                                >
                                  {cat}
                                </span>
                              ))}
                              {(!v.vendors?.categories || v.vendors.categories.length === 0) && (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <VendorStatusBadge
                              status={v.status}
                              responseReceived={v.response_received}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ));
        })()}

      {/* Covering email preview (collapsible) */}
      {(rfq.covering_email_subject || rfq.covering_email_body) && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <button
            onClick={() => setEmailExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/20"
            style={{ color: "#1A3A5C" }}
          >
            <span>Email that will be sent to each vendor</span>
            {emailExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {emailExpanded && (
            <div className="border-t border-border p-4 space-y-4">
              {rfq.covering_email_subject && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Subject
                  </div>
                  <div className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                    {rfq.covering_email_subject}
                  </div>
                </div>
              )}
              {rfq.covering_email_body && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Body
                  </div>
                  <div
                    className="prose prose-sm max-w-none text-sm"
                    style={{ color: "var(--foreground)" }}
                    dangerouslySetInnerHTML={{ __html: rfq.covering_email_body }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Vendor management has moved to Preview & Select Recipients */}

      {/* Send flow has moved to Preview & Select Recipients */}
    </div>
  );
}

// ─── Shared helper components ─────────────────────────────────────────────────

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function RFQStatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    draft: { bg: "#F0F7F4", fg: "#4A6560" },
    issued: { bg: "#E8F5EE", fg: "#0D5C3A" },
    sent: { bg: "#E8EFF7", fg: "#1A3A5C" },
    closed: { bg: "#FDF3E0", fg: "#7A5200" },
    awarded: { bg: "#E8F5EE", fg: "#0D5C3A" },
    cancelled: { bg: "#FEF2F2", fg: "#991B1B" },
  };
  const c = colors[status] ?? { bg: "#F0F7F4", fg: "#4A6560" };
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {status}
    </span>
  );
}

function VendorStatusBadge({
  status,
  responseReceived,
}: {
  status: string;
  responseReceived: boolean;
}) {
  if (responseReceived) {
    return (
      <span
        className="flex items-center gap-1 text-xs font-medium"
        style={{ color: "var(--accent)" }}
      >
        <CheckCircle2 className="h-3 w-3" /> Responded
      </span>
    );
  }
  if (status === "sent") {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Clock className="h-3 w-3" /> Awaiting
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <AlertCircle className="h-3 w-3" /> {status}
    </span>
  );
}

function BidStatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    ai_extracted_pending_review: { bg: "#FDF3E0", fg: "#7A5200" },
    confirmed: { bg: "#E8F5EE", fg: "#0D5C3A" },
    rejected: { bg: "#FEF2F2", fg: "#991B1B" },
    under_review: { bg: "#E8EFF7", fg: "#1A3A5C" },
  };
  const c = colors[status] ?? { bg: "#F0F7F4", fg: "#4A6560" };
  const label = status.replace(/_/g, " ");
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}

function ConfidenceBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-xs text-muted-foreground">—</span>;
  const colors = {
    high: { color: "var(--confidence-high)" },
    medium: { color: "var(--confidence-medium)" },
    low: { color: "var(--confidence-low)" },
  };
  const c = colors[level as keyof typeof colors] ?? { color: "var(--muted-foreground)" };
  return (
    <span className="text-xs font-medium capitalize" style={c}>
      {level}
    </span>
  );
}
