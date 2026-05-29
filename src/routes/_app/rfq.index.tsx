import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/rfq/")({
  component: RFQTrackerPage,
});

const STATUS_OPTIONS = ["draft", "sent", "closed", "awarded", "cancelled"];
const TYPE_OPTIONS = ["materials", "subcontract"];

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

function RFQTrackerPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [rfqType, setRfqType] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["rfqs", search, status, rfqType],
    queryFn: async () => {
      let q = supabase
        .from("rfqs")
        .select(
          "rfq_id,rfq_reference,title,rfq_type,status,sent_at,deadline,created_at"
        )
        .order("created_at", { ascending: false });
      if (status) q = q.eq("status", status);
      if (rfqType) q = q.eq("rfq_type", rfqType);
      if (search)
        q = q.or(`rfq_reference.ilike.%${search}%,title.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const hasFilters = !!(search || status || rfqType);

  return (
    <div className="space-y-6">
      <div
        className="rounded-xl p-6"
        style={{ backgroundColor: "#E8EFF7" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="font-display text-[28px]"
              style={{ color: "#1A3A5C" }}
            >
              RFQ Tracker
            </h1>
            <p className="mt-1 text-sm" style={{ color: "#1A3A5C", opacity: 0.7 }}>
              Manage and track all Request for Quotations
            </p>
          </div>
          <Link
            to="/rfq/new"
            className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--accent)" }}
          >
            <Plus className="h-4 w-4" /> New RFQ
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            placeholder="Search reference or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[220px] flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
          />
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Type:</span>
            <select
              value={rfqType}
              onChange={(e) => setRfqType(e.target.value)}
              className="rounded-md border border-border bg-white px-2 py-1.5 text-sm outline-none"
            >
              <option value="">All</option>
              {TYPE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Status:</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-md border border-border bg-white px-2 py-1.5 text-sm outline-none"
            >
              <option value="">All</option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </option>
              ))}
            </select>
          </label>
          {hasFilters && (
            <button
              onClick={() => {
                setSearch("");
                setStatus("");
                setRfqType("");
              }}
              className="text-sm font-medium"
              style={{ color: "var(--accent)" }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: "var(--table-header)" }}>
            <tr
              className="text-left text-[13px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--table-header-text)" }}
            >
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Deadline</th>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-border">
                  <td colSpan={7} className="px-4 py-3">
                    <div className="h-4 w-full animate-pulse rounded bg-secondary" />
                  </td>
                </tr>
              ))}
            {isError && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-6 text-center text-sm text-destructive"
                >
                  Failed to load RFQs.{" "}
                  <button onClick={() => refetch()} className="underline">
                    Retry
                  </button>
                </td>
              </tr>
            )}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No RFQs found.{" "}
                  <Link
                    to="/rfq/new"
                    className="underline"
                    style={{ color: "var(--accent)" }}
                  >
                    Create one
                  </Link>
                  .
                </td>
              </tr>
            )}
            {data?.map((rfq: any) => (
              <tr
                key={rfq.rfq_id}
                className="border-t border-border hover:bg-secondary/40"
              >
                <td className="px-4 py-3 font-mono text-xs font-semibold text-muted-foreground">
                  {rfq.rfq_reference || "—"}
                </td>
                <td className="px-4 py-3 font-medium">{rfq.title}</td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor:
                        rfq.rfq_type === "materials" ? "#E8EFF7" : "#FDF3E0",
                      color:
                        rfq.rfq_type === "materials" ? "#1A3A5C" : "#7A5200",
                    }}
                  >
                    {rfq.rfq_type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <RFQStatusBadge status={rfq.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {rfq.deadline || "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {rfq.sent_at ? formatDate(rfq.sent_at) : "—"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    to="/rfq/$rfqId"
                    params={{ rfqId: rfq.rfq_id }}
                    className="flex items-center gap-1 text-sm font-medium"
                    style={{ color: "var(--accent)" }}
                  >
                    View <ChevronRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
