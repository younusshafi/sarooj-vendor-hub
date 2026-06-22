import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { formatDate } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type RfqSearch = { status?: string; type?: string };

export const Route = createFileRoute("/_app/rfq/")({
  // Allow deep-linking from dashboard tiles + sidebar, e.g. /rfq?status=issued&type=materials
  validateSearch: (search: Record<string, unknown>): RfqSearch => ({
    status: typeof search.status === "string" ? search.status : undefined,
    type: search.type === "materials" || search.type === "subcontractor" ? search.type : undefined,
  }),
  component: RFQTrackerPage,
});

// Real materials RFQ statuses in the data are draft + issued only.
const STATUS_OPTIONS = ["draft", "issued"];

// ── Types ──

interface RfqRow {
  rfq_id: string;
  rfq_reference: string | null;
  title: string;
  rfq_type: string;
  status: string;
  sent_at: string | null;
  deadline: string | null;
  created_at: string;
  created_by: string | null;
}

// ── Date bucket logic ──

type BucketKey =
  | "today"
  | "yesterday"
  | "earlier_this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "older";

const BUCKET_LABELS: Record<BucketKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier_this_week: "Earlier this week",
  last_week: "Last week",
  this_month: "This month",
  last_month: "Last month",
  older: "Older",
};

const BUCKET_ORDER: BucketKey[] = [
  "today",
  "yesterday",
  "earlier_this_week",
  "last_week",
  "this_month",
  "last_month",
  "older",
];

function dateToBucket(dateStr: string): BucketKey {
  const now = new Date();
  const d = new Date(dateStr);

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  // Monday of the current week (ISO weeks start Monday)
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - mondayOffset);

  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  if (d >= todayStart) return "today";
  if (d >= yesterdayStart) return "yesterday";
  if (d >= weekStart) return "earlier_this_week";
  if (d >= lastWeekStart) return "last_week";
  if (d >= monthStart) return "this_month";
  if (d >= lastMonthStart) return "last_month";
  return "older";
}

// ── Components ──

function RFQStatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    draft: { bg: "#F0F7F4", fg: "#4A6560" },
    issued: { bg: "#E8EFF7", fg: "#1A3A5C" },
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
  const sp = Route.useSearch();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(sp.status ?? "");
  const [typeFilter, setTypeFilter] = useState(sp.type ?? "");
  const [createdBy, setCreatedBy] = useState("");
  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<BucketKey>>(new Set());

  // Sync when navigated here with new status/type params (e.g. from a dashboard tile or sidebar).
  useEffect(() => {
    setStatus(sp.status ?? "");
    setTypeFilter(sp.type ?? "");
  }, [sp.status, sp.type]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["rfqs"],
    queryFn: async () => {
      // Unified tracker: lists both materials (MR) and subcontractor (SR) RFQs.
      // Each row routes to its type's detail screen (see the View link below).
      const q = supabase
        .from("rfqs")
        .select("rfq_id,rfq_reference,title,rfq_type,status,sent_at,deadline,created_at,created_by")
        .order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RfqRow[];
    },
  });

  // Distinct created_by values for filter dropdown
  const createdByOptions = useMemo(() => {
    if (!data) return [];
    const unique = [...new Set(data.map((r) => r.created_by).filter(Boolean))] as string[];
    unique.sort();
    return unique;
  }, [data]);

  // Client-side filtering
  const filtered = useMemo(() => {
    if (!data) return [];
    let result = data;
    if (status) result = result.filter((r) => r.status === status);
    if (typeFilter) result = result.filter((r) => r.rfq_type === typeFilter);
    if (createdBy) result = result.filter((r) => r.created_by === createdBy);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          (r.rfq_reference ?? "").toLowerCase().includes(q) || r.title.toLowerCase().includes(q),
      );
    }
    return result;
  }, [data, status, typeFilter, createdBy, search]);

  // Group into date buckets
  const buckets = useMemo(() => {
    const groups: Record<BucketKey, RfqRow[]> = {
      today: [],
      yesterday: [],
      earlier_this_week: [],
      last_week: [],
      this_month: [],
      last_month: [],
      older: [],
    };
    for (const row of filtered) {
      const bucket = dateToBucket(row.created_at);
      groups[bucket].push(row);
    }
    return BUCKET_ORDER.filter((k) => groups[k].length > 0).map((k) => ({
      key: k,
      label: BUCKET_LABELS[k],
      rows: groups[k],
    }));
  }, [filtered]);

  const toggleBucket = (key: BucketKey) => {
    setCollapsedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const hasFilters = !!(search || status || typeFilter || createdBy);

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-6" style={{ backgroundColor: "#E8EFF7" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-[28px]" style={{ color: "#1A3A5C" }}>
              RFQ Tracker
            </h1>
            <p className="mt-1 text-sm" style={{ color: "#1A3A5C", opacity: 0.7 }}>
              Manage and track all Request for Quotations
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <Plus className="h-4 w-4" /> New RFQ <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/rfq/new">Materials RFQ</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/rfq/sub/new">Subcontractor RFQ</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-md border border-border bg-white px-2 py-1.5 text-sm outline-none"
            >
              <option value="">All</option>
              <option value="materials">Materials</option>
              <option value="subcontractor">Subcontractor</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Created by:</span>
            <select
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              className="rounded-md border border-border bg-white px-2 py-1.5 text-sm outline-none"
            >
              <option value="">All users</option>
              {createdByOptions.map((email) => (
                <option key={email} value={email}>
                  {email}
                </option>
              ))}
            </select>
          </label>
          {hasFilters && (
            <button
              onClick={() => {
                setSearch("");
                setStatus("");
                setTypeFilter("");
                setCreatedBy("");
              }}
              className="text-sm font-medium"
              style={{ color: "var(--accent)" }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="h-4 w-48 animate-pulse rounded bg-secondary" />
            </div>
          ))}

        {isError && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-destructive">
            Failed to load RFQs.{" "}
            <button onClick={() => refetch()} className="underline">
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            No RFQs found.{" "}
            <Link to="/rfq/new" className="underline" style={{ color: "var(--accent)" }}>
              Create one
            </Link>
            .
          </div>
        )}

        {buckets.map(({ key, label, rows }) => {
          const isCollapsed = collapsedBuckets.has(key);
          return (
            <div key={key} className="overflow-hidden rounded-xl border border-border bg-card">
              <button
                onClick={() => toggleBucket(key)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                style={{ backgroundColor: "var(--table-header)" }}
              >
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--table-header-text)" }}
                >
                  {label} <span className="ml-1 font-normal opacity-60">({rows.length})</span>
                </span>
                {isCollapsed ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {!isCollapsed && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2">Reference</th>
                      <th className="px-4 py-2">Title</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Deadline</th>
                      <th className="px-4 py-2">Sent</th>
                      <th className="px-4 py-2">Created by</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((rfq) => (
                      <tr key={rfq.rfq_id} className="border-t border-border hover:bg-secondary/40">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-muted-foreground">
                          {rfq.rfq_reference || "\u2014"}
                        </td>
                        <td className="px-4 py-3 font-medium max-w-[250px] truncate">
                          {rfq.title}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: rfq.rfq_type === "materials" ? "#E8EFF7" : "#FDF3E0",
                              color: rfq.rfq_type === "materials" ? "#1A3A5C" : "#7A5200",
                            }}
                          >
                            {rfq.rfq_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <RFQStatusBadge status={rfq.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {rfq.deadline || "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {rfq.sent_at ? formatDate(rfq.sent_at) : "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[150px] truncate">
                          {rfq.created_by || "\u2014"}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            to={
                              rfq.rfq_type === "subcontractor" ? "/rfq/sub/$rfqId" : "/rfq/$rfqId"
                            }
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
