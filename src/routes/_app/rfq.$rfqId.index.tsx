import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Plus,
  Search,
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

type Tab = "overview" | "vendors" | "bids";

function RFQDetailPage() {
  const { rfqId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const queryClient = useQueryClient();

  const { data: rfq, isLoading: rfqLoading } = useQuery({
    queryKey: ["rfq-detail", rfqId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfqs")
        .select("*")
        .eq("rfq_id", rfqId)
        .single();
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
          "id,vendor_id,email_to,contact_person,matched_category,status,response_received,sent_at,response_at,reminder_sent_at,vendors(company_name,contacts,categories)"
        )
        .eq("rfq_id", rfqId);
      return (data ?? []) as any[];
    },
    enabled: tab === "vendors",
  });

  const { data: rfqItems } = useQuery({
    queryKey: ['rfq-items-overview', rfqId],
    queryFn: async () => {
      const { data } = await supabase
        .from('rfq_items')
        .select('item_id, sap_item_number, description, quantity, unit, delivery_date, budget_unit_rate_omr')
        .eq('rfq_id', rfqId)
        .order('sap_item_number');
      return (data ?? []) as any[];
    },
  });

  const { data: bids, isLoading: bidsLoading } = useQuery({
    queryKey: ["rfq-bids-detail", rfqId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bids")
        .select(
          "bid_id,status,total_inc_vat_omr,subtotal_ex_vat_omr,ai_extraction_confidence,created_at,vendors(company_name)"
        )
        .eq("rfq_id", rfqId)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
    enabled: tab === "bids",
  });

  if (rfqLoading) {
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
                  backgroundColor:
                    rfq.rfq_type === "materials" ? "#d1e0f4" : "#FDE68A",
                  color: rfq.rfq_type === "materials" ? "#1A3A5C" : "#7A5200",
                }}
              >
                {rfq.rfq_type}
              </span>
            </div>
            <h1
              className="mt-2 font-display text-[26px]"
              style={{ color: "#1A3A5C" }}
            >
              {rfq.title}
            </h1>
          </div>
          <Link
            to="/rfq/"
            className="text-sm font-medium"
            style={{ color: "var(--accent)" }}
          >
            ← Back
          </Link>
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
          {rfq.project_name && (
            <InfoCard label="Project Name" value={rfq.project_name} />
          )}
          {rfq.project_code && (
            <InfoCard label="Project Code" value={rfq.project_code} />
          )}
          {rfq.project_location && (
            <InfoCard label="Project Location" value={rfq.project_location} />
          )}
          {rfq.client && (
            <InfoCard label="Client" value={rfq.client} />
          )}
          {rfq.consultant && (
            <InfoCard label="Consultant" value={rfq.consultant} />
          )}
          {rfq.created_by && (
            <InfoCard label="Created By" value={rfq.created_by} />
          )}
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
                  <span
                    key={pr}
                    className="rounded font-mono text-xs px-2 py-0.5 bg-secondary"
                  >
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
                  <thead style={{ backgroundColor: 'var(--table-header)' }}>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--table-header-text)' }}>
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
                          {item.sap_item_number ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-xs">{item.description || '—'}</td>
                        <td className="px-4 py-2 text-right text-xs">{item.quantity ?? '—'}</td>
                        <td className="px-4 py-2 text-xs">{item.unit || '—'}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {item.delivery_date ? item.delivery_date.split('T')[0] : '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                          {item.budget_unit_rate_omr ?? '—'}
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
          queryClient={queryClient}
        />
      )}

      {/* Bids tab */}
      {tab === "bids" && (
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
                  <td className="px-4 py-3 font-medium">
                    {b.vendors?.company_name || "—"}
                  </td>
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
  queryClient,
}: {
  rfq: any;
  rfqId: string;
  vendors: any[];
  vendorsLoading: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const isDraft = rfq.status === "draft";

  const filteredVendors = vendors.filter(
    (v: any) => !(v.vendors?.categories ?? []).includes('TEST_BATCH')
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [deadline, setDeadline] = useState<string>(rfq.deadline ?? "");
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [deadlineSaved, setDeadlineSaved] = useState(false);
  const [sendingRFQ, setSendingRFQ] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Debounced vendor search
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (!value.trim()) {
        setSearchResults([]);
        return;
      }
      searchTimeoutRef.current = setTimeout(async () => {
        setSearchLoading(true);
        try {
          const { data, error } = await supabase
            .from("vendors")
            .select("vendor_id,company_name,contacts,categories")
            .ilike("company_name", `%${value}%`)
            .limit(10);
          if (error) throw error;
          const existingIds = new Set(vendors.map((v) => v.vendor_id));
          setSearchResults((data ?? []).filter((v: any) => !existingIds.has(v.vendor_id)));
        } catch {
          showToast("Search failed", "error");
        } finally {
          setSearchLoading(false);
        }
      }, 300);
    },
    [vendors, showToast]
  );

  // Add vendor
  const handleAddVendor = useCallback(
    async (vendor: any) => {
      setAddingId(vendor.vendor_id);
      try {
        const { error } = await supabase.from("rfq_vendors").insert({
          rfq_id: rfqId,
          vendor_id: vendor.vendor_id,
          email_to: vendor.contacts?.[0]?.email || null,
          contact_person: vendor.contacts?.[0]?.name || null,
          status: "pending",
          response_received: false,
        });
        if (error) throw error;
        showToast(`${vendor.company_name} added`);
        setSearchResults((prev) => prev.filter((v) => v.vendor_id !== vendor.vendor_id));
        queryClient.invalidateQueries({ queryKey: ["rfq-vendors-detail", rfqId] });
      } catch {
        showToast("Failed to add vendor", "error");
      } finally {
        setAddingId(null);
      }
    },
    [rfqId, queryClient, showToast]
  );

  // Remove vendor
  const handleRemoveVendor = useCallback(
    async (rfqVendorId: string, companyName: string) => {
      setRemovingId(rfqVendorId);
      try {
        const { error } = await supabase.from("rfq_vendors").delete().eq("id", rfqVendorId);
        if (error) throw error;
        showToast(`${companyName} removed`);
        queryClient.invalidateQueries({ queryKey: ["rfq-vendors-detail", rfqId] });
      } catch {
        showToast("Failed to remove vendor", "error");
      } finally {
        setRemovingId(null);
      }
    },
    [rfqId, queryClient, showToast]
  );

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
    [rfqId, showToast]
  );

  // Send RFQ
  const handleSendRFQ = useCallback(async () => {
    setSendingRFQ(true);
    setShowConfirmModal(false);
    try {
      const vendorPayload = filteredVendors.map((v) => ({
        vendor_id: v.vendor_id,
        email_to: v.email_to,
        contact_person: v.contact_person,
        matched_category: v.matched_category,
        rfq_vendor_id: v.id,
      }));
      const res = await fetch("https://n8n.zavia-ai.com/webhook/scc-rfq-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfq_id: rfqId,
          rfq_reference: rfq.rfq_reference,
          rfq_type: rfq.rfq_type,
          title: rfq.title,
          covering_email_subject: rfq.covering_email_subject,
          covering_email_body: rfq.covering_email_body,
          deadline: deadline || rfq.deadline,
          vendors: vendorPayload,
        }),
      });
      if (!res.ok) throw new Error("Dispatch failed");
      const { error } = await supabase
        .from("rfqs")
        .update({ status: "issued", sent_at: new Date().toISOString() })
        .eq("rfq_id", rfqId);
      if (error) throw error;
      showToast("RFQ sent successfully!");
      queryClient.invalidateQueries({ queryKey: ["rfq-detail", rfqId] });
      queryClient.invalidateQueries({ queryKey: ["rfq-vendors-detail", rfqId] });
    } catch {
      showToast("Failed to send RFQ", "error");
    } finally {
      setSendingRFQ(false);
    }
  }, [rfqId, rfq, filteredVendors, deadline, queryClient, showToast]);

  const vendorCount = filteredVendors.length;
  const canSend = isDraft && vendorCount >= 1 && !sendingRFQ;

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg"
          style={{
            backgroundColor: toast.type === "success" ? "#0D7A5A" : "#991B1B",
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
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={!canSend}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-40"
            style={{ backgroundColor: "#0D7A5A", color: "#fff" }}
          >
            {sendingRFQ ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send RFQ to {vendorCount} Vendor{vendorCount !== 1 ? "s" : ""}
          </button>
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
              style={{ color: "#0D3D2E" }}
            />
            {deadlineSaving && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {deadlineSaved && !deadlineSaving && (
              <span className="text-xs font-medium" style={{ color: "#0D7A5A" }}>
                Saved
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm font-medium" style={{ color: "#0D3D2E" }}>
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
      {!vendorsLoading && (() => {
        const grouped = filteredVendors.reduce((acc: Record<string, any[]>, v: any) => {
          const cat = v.matched_category || 'Uncategorised';
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(v);
          return acc;
        }, {});
        const categoryNames = Object.keys(grouped).sort();
        return categoryNames.map((categoryName) => (
          <div key={categoryName} className="mb-4">
            <div
              className="flex items-center justify-between px-4 py-2 rounded-t-xl"
              style={{ backgroundColor: '#E8EFF7' }}
            >
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#1A3A5C' }}>
                {categoryName} ({grouped[categoryName].length})
              </span>
              {isDraft && (
                <button
                  onClick={() => grouped[categoryName].forEach(v => handleRemoveVendor(v.id, v.vendors?.company_name || 'Vendor'))}
                  className="text-xs font-medium"
                  style={{ color: '#DC2626' }}
                >
                  Remove all
                </button>
              )}
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
                    {isDraft && <th className="px-4 py-3 w-10"></th>}
                  </tr>
                </thead>
                <tbody>
                  {grouped[categoryName].map((v: any) => (
                    <tr key={v.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium" style={{ color: "#0D3D2E" }}>
                        {v.vendors?.company_name || "—"}
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
                      {isDraft && (
                        <td className="px-4 py-3">
                          <button
                            onClick={() =>
                              handleRemoveVendor(v.id, v.vendors?.company_name || "Vendor")
                            }
                            disabled={removingId === v.id}
                            className="flex items-center justify-center rounded-md p-1 transition-colors hover:bg-red-50 disabled:opacity-50"
                            title="Remove vendor"
                          >
                            {removingId === v.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                              <X className="h-4 w-4 text-red-500" />
                            )}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
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
                  <div className="text-sm font-medium" style={{ color: "#0D3D2E" }}>
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
                    style={{ color: "#0D3D2E" }}
                    dangerouslySetInnerHTML={{ __html: rfq.covering_email_body }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add vendor panel — draft only */}
      {isDraft && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: "#1A3A5C" }}>
            Add Vendor
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search vendors by company name…"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full rounded-lg border border-border pl-9 pr-10 py-2 text-sm outline-none"
              style={{ color: "#0D3D2E" }}
            />
            {searchLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border divide-y divide-border">
              {searchResults.map((vendor: any) => (
                <div
                  key={vendor.vendor_id}
                  className="flex items-center justify-between px-3 py-2.5"
                  style={{ backgroundColor: "var(--cream)" }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: "#0D3D2E" }}>
                      {vendor.company_name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{vendor.contacts?.[0]?.email || "—"}</div>
                    {(vendor.categories ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(vendor.categories ?? []).slice(0, 2).map((cat: string) => (
                          <span
                            key={cat}
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ backgroundColor: "#E8EFF7", color: "#1A3A5C" }}
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleAddVendor(vendor)}
                    disabled={addingId === vendor.vendor_id}
                    className="ml-3 shrink-0 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    style={{ backgroundColor: "#0D7A5A", color: "#fff" }}
                  >
                    {addingId === vendor.vendor_id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}

          {searchQuery.trim() && !searchLoading && searchResults.length === 0 && (
            <p className="text-sm text-center text-muted-foreground py-1">
              No vendors found matching "{searchQuery}"
            </p>
          )}
        </div>
      )}

      {/* Confirm send modal */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
        >
          <div
            className="w-full max-w-md mx-4 rounded-2xl p-6 shadow-xl"
            style={{ backgroundColor: "#F4F8F6", border: "1px solid #C8DDD7" }}
          >
            <h3 className="font-display text-xl mb-2" style={{ color: "#0D3D2E" }}>
              Confirm Send RFQ
            </h3>
            <p className="text-sm mb-6" style={{ color: "#4A6560" }}>
              This will send the RFQ email to{" "}
              <strong>{vendorCount} vendor{vendorCount !== 1 ? "s" : ""}</strong>. This
              cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
                style={{ color: "#0D3D2E" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSendRFQ}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ backgroundColor: "#0D7A5A", color: "#fff" }}
              >
                <Send className="h-4 w-4" />
                Send to {vendorCount} Vendor{vendorCount !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}
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
        style={{ color: "#0D5C3A" }}
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
