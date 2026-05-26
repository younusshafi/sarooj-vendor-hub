import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
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
          "id,vendor_id,email_to,contact_person,status,response_received,sent_at,response_at,reminder_sent_at,vendors(company_name)"
        )
        .eq("rfq_id", rfqId);
      return (data ?? []) as any[];
    },
    enabled: tab === "vendors",
  });

  const { data: bids, isLoading: bidsLoading } = useQuery({
    queryKey: ["rfq-bids-detail", rfqId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bids")
        .select(
          "bid_id,status,total_inc_vat_omr,subtotal_ex_vat_omr,overall_confidence,created_at,vendors(company_name)"
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
        </div>
      )}

      {/* Vendors tab */}
      {tab === "vendors" && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: "var(--table-header)" }}>
              <tr
                className="text-left text-[13px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--table-header-text)" }}
              >
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Responded</th>
                <th className="px-4 py-3">Reminder</th>
              </tr>
            </thead>
            <tbody>
              {vendorsLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!vendorsLoading && (vendors?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No vendors assigned
                  </td>
                </tr>
              )}
              {vendors?.map((v: any) => (
                <tr key={v.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    {v.vendors?.company_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {v.email_to}
                  </td>
                  <td className="px-4 py-3">
                    <VendorStatusBadge status={v.status} responseReceived={v.response_received} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {v.sent_at ? formatDate(v.sent_at) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {v.response_at ? formatDate(v.response_at) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {v.reminder_sent_at ? formatDate(v.reminder_sent_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                    <ConfidenceBadge level={b.overall_confidence} />
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
      <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "#0D5C3A" }}>
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
