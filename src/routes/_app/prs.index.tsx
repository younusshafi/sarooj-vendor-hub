import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { ChevronRight, AlertTriangle } from "lucide-react";
import { fetchPrTracker } from "@/lib/pr-queries";
import { PrStatusCode, PR_STATUS_LABEL, PR_STATUS_BADGE, type PrTrackerRow } from "@/types/pr";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_app/prs/")({
  component: PrTrackerPage,
});

const ALL_STATUS_CODES: PrStatusCode[] = [
  "draft",
  "issued_awaiting",
  "responses_pending",
  "evaluation_complete",
];

function PrStatusBadge({ code }: { code: PrStatusCode }) {
  const style = PR_STATUS_BADGE[code];
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {PR_STATUS_LABEL[code]}
    </span>
  );
}

function PrTrackerPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const {
    data: rows,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["pr-tracker"],
    queryFn: fetchPrTracker,
  });

  // Filtered rows
  const filtered = useMemo(() => {
    if (!rows) return [];
    let result = rows;
    if (statusFilter) {
      result = result.filter((r) => r.pr_status_code === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) => r.pr_number.toLowerCase().includes(q));
    }
    return result;
  }, [rows, statusFilter, search]);

  // Analytics: counts per status code
  const analytics = useMemo(() => {
    if (!rows) return { counts: {} as Record<PrStatusCode, number>, aging: 0 };
    const counts: Record<PrStatusCode, number> = {
      draft: 0,
      issued_awaiting: 0,
      responses_pending: 0,
      evaluation_complete: 0,
    };
    let aging = 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    for (const r of rows) {
      const code = r.pr_status_code as PrStatusCode;
      if (counts[code] !== undefined) counts[code]++;
      if (
        code !== "evaluation_complete" &&
        r.last_rfq_created_at &&
        new Date(r.last_rfq_created_at) < sevenDaysAgo
      ) {
        aging++;
      }
    }
    return { counts, aging };
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl p-6" style={{ backgroundColor: "#E8EFF7" }}>
        <h1 className="font-display text-[28px]" style={{ color: "#1A3A5C" }}>
          PR Tracker
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#1A3A5C", opacity: 0.7 }}>
          Purchase Requisitions and their RFQ progress
        </p>
      </div>

      {/* Analytics strip */}
      <div className="flex flex-wrap gap-3">
        {ALL_STATUS_CODES.map((code) => {
          const style = PR_STATUS_BADGE[code];
          return (
            <button
              key={code}
              onClick={() => setStatusFilter((prev) => (prev === code ? "" : code))}
              className="rounded-lg px-4 py-3 text-center transition-all"
              style={{
                backgroundColor: style.bg,
                color: style.text,
                outline: statusFilter === code ? `2px solid ${style.text}` : "none",
                outlineOffset: 2,
                minWidth: 120,
              }}
            >
              <div className="text-2xl font-bold">{analytics.counts[code] ?? 0}</div>
              <div className="mt-0.5 text-xs font-medium">{PR_STATUS_LABEL[code]}</div>
            </button>
          );
        })}
        {analytics.aging > 0 && (
          <div
            className="flex items-center gap-2 rounded-lg px-4 py-3"
            style={{ backgroundColor: "#FDF3E0", color: "#7A5200" }}
          >
            <AlertTriangle className="h-5 w-5" />
            <div>
              <div className="text-2xl font-bold">{analytics.aging}</div>
              <div className="mt-0.5 text-xs font-medium">Aging ({">"}7 days)</div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search PR number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-ring"
          style={{ minWidth: 200 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
        >
          <option value="">All statuses</option>
          {ALL_STATUS_CODES.map((code) => (
            <option key={code} value={code}>
              {PR_STATUS_LABEL[code]}
            </option>
          ))}
        </select>
        {statusFilter && (
          <button
            onClick={() => setStatusFilter("")}
            className="text-xs underline"
            style={{ color: "var(--accent)" }}
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: "var(--table-header)" }}>
            <tr
              className="text-left text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--table-header-text)" }}
            >
              <th className="px-4 py-3">PR Number</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-center">RFQs</th>
              <th className="px-4 py-3 text-center">Responses</th>
              <th className="px-4 py-3 text-center">Items</th>
              <th className="px-4 py-3">Last Activity</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Failed to load.{" "}
                  <button
                    onClick={() => refetch()}
                    className="underline"
                    style={{ color: "var(--accent)" }}
                  >
                    Retry
                  </button>
                </td>
              </tr>
            )}
            {!isLoading && !isError && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No purchase requisitions found.
                </td>
              </tr>
            )}
            {filtered.map((row: PrTrackerRow) => (
              <tr key={row.pr_number} className="border-t border-border hover:bg-secondary/50">
                <td className="px-4 py-3 font-medium">{row.pr_number}</td>
                <td className="px-4 py-3">
                  <PrStatusBadge code={row.pr_status_code} />
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="font-medium">{row.issued_rfqs}</span>
                  <span className="text-muted-foreground">/{row.total_rfqs}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="font-medium">{row.total_responses_received}</span>
                  <span className="text-muted-foreground">/{row.total_vendors_invited}</span>
                </td>
                <td className="px-4 py-3 text-center">{row.total_items}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {row.last_rfq_created_at
                    ? formatDistanceToNow(new Date(row.last_rfq_created_at), { addSuffix: true })
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    to="/prs/$prNumber"
                    params={{ prNumber: row.pr_number }}
                    className="inline-flex items-center gap-1 text-xs font-medium"
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
