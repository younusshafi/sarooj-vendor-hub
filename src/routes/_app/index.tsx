import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { supabase, type Vendor } from "@/integrations/supabase-external/client";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatVendorType, titleCase } from "@/lib/format";
import { fetchPrTypeMap } from "@/lib/pr-queries";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

function useStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [total, pending, listed, registered, dup] = await Promise.all([
        supabase.from("vendors").select("*", { count: "exact", head: true }),
        supabase
          .from("vendors")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending_review"),
        supabase.from("vendors").select("*", { count: "exact", head: true }).eq("status", "listed"),
        supabase
          .from("vendors")
          .select("*", { count: "exact", head: true })
          .eq("status", "registered"),
        supabase
          .from("vendors")
          .select("*", { count: "exact", head: true })
          .eq("duplicate_flag", true),
      ]);
      return {
        total: total.count ?? 0,
        pending: pending.count ?? 0,
        active: (listed.count ?? 0) + (registered.count ?? 0),
        duplicates: dup.count ?? 0,
      };
    },
  });
}

function StatCard({
  value,
  label,
  loading,
  linkTo,
  search,
}: {
  value: number | string;
  label: string;
  loading: boolean;
  linkTo?: string;
  search?: Record<string, unknown>;
}) {
  const card = (
    <div
      className="relative h-full overflow-hidden rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
      style={{ borderLeft: "4px solid var(--module-vendor)" }}
    >
      <div className="font-display text-[36px] leading-none text-foreground">
        {loading ? "—" : value.toLocaleString()}
      </div>
      <div className="mt-2 text-sm text-muted-foreground">{label}</div>
    </div>
  );
  if (linkTo) {
    return (
      <Link to={linkTo} search={search} className="block">
        {card}
      </Link>
    );
  }
  return card;
}

const RFQ_STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  draft: { bg: "#E5EAE8", fg: "#0D3D2E" },
  issued: { bg: "#E8EFF7", fg: "#1A3A5C" },
  closed: { bg: "#FDF3E0", fg: "#7A5200" },
};

function RfqStatusBadge({ status }: { status: string }) {
  const c = RFQ_STATUS_COLORS[status] ?? { bg: "#E5EAE8", fg: "#0D3D2E" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {titleCase(status)}
    </span>
  );
}

interface ProcSectionStats {
  openRfqs: number;
  bidsToReview: number;
  comparisons: number;
  prsTracked: number;
}

function useProcurementStats() {
  return useQuery({
    queryKey: ["dashboard-procurement-stats"],
    queryFn: async () => {
      // Per-type counts so the dashboard can show parallel MR / SR sections with
      // no silent mixing. PRs are single-path, so their type is derived from
      // v_pr_rfq_detail (v_pr_tracker carries no rfq_type at PR level).
      const openRfqs = (type: string) =>
        supabase
          .from("rfqs")
          .select("*", { count: "exact", head: true })
          .eq("status", "issued")
          .eq("rfq_type", type);
      const bidsToReview = (type: string) =>
        supabase
          .from("bids")
          .select("*, rfqs!inner(rfq_type)", { count: "exact", head: true })
          .eq("status", "ai_extracted_pending_review")
          .eq("rfqs.rfq_type", type);
      const comparisons = (type: string) =>
        supabase
          .from("comparisons")
          .select("*, rfqs!inner(rfq_type)", { count: "exact", head: true })
          .eq("rfqs.rfq_type", type);

      const [openMr, openSr, bidsMr, bidsSr, compMr, compSr, prTypeMap] = await Promise.all([
        openRfqs("materials"),
        openRfqs("subcontractor"),
        bidsToReview("materials"),
        bidsToReview("subcontractor"),
        comparisons("materials"),
        comparisons("subcontractor"),
        fetchPrTypeMap(),
      ]);

      let prsMr = 0;
      let prsSr = 0;
      for (const t of Object.values(prTypeMap)) {
        if (t === "subcontractor") prsSr++;
        else prsMr++;
      }

      const materials: ProcSectionStats = {
        openRfqs: openMr.count ?? 0,
        bidsToReview: bidsMr.count ?? 0,
        comparisons: compMr.count ?? 0,
        prsTracked: prsMr,
      };
      const subcontractor: ProcSectionStats = {
        openRfqs: openSr.count ?? 0,
        bidsToReview: bidsSr.count ?? 0,
        comparisons: compSr.count ?? 0,
        prsTracked: prsSr,
      };
      return { materials, subcontractor };
    },
  });
}

interface RfqRow {
  rfq_id: string;
  rfq_reference: string | null;
  title: string | null;
  category_detected: string[] | null;
  rfq_type: string | null;
  status: string;
  created_at: string;
}

function ProcurementStatCard({
  value,
  label,
  loading,
  attention,
  linkTo,
  search,
  href,
}: {
  value: number | string;
  label: string;
  loading: boolean;
  attention?: boolean;
  linkTo?: string;
  search?: Record<string, unknown>;
  href?: string;
}) {
  const card = (
    <div
      className="relative h-full overflow-hidden rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
      style={{
        borderLeft: attention ? "4px solid #D97706" : "4px solid #1A3A5C",
        backgroundColor: attention ? "#FFFBEB" : undefined,
      }}
    >
      {href && <ExternalLink className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />}
      <div
        className="font-display text-[36px] leading-none"
        style={{ color: attention ? "#92400E" : "var(--foreground)" }}
      >
        {loading ? "—" : value.toLocaleString()}
      </div>
      <div
        className="mt-2 text-sm"
        style={{ color: attention ? "#92400E" : "var(--muted-foreground)" }}
      >
        {label}
      </div>
    </div>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {card}
      </a>
    );
  }
  if (linkTo) {
    return (
      <Link to={linkTo} search={search} className="block">
        {card}
      </Link>
    );
  }
  return card;
}

function RecentRfqsTable({ kind }: { kind: "materials" | "subcontractor" }) {
  const recentRfqs = useQuery({
    queryKey: ["recent-rfqs", kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfqs")
        .select("rfq_id,rfq_reference,title,category_detected,rfq_type,status,created_at")
        .eq("rfq_type", kind)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as RfqRow[];
    },
  });
  const label = kind === "materials" ? "Materials" : "Subcontractor";
  return (
    <div>
      <h3 className="mb-3 font-display text-lg text-foreground">Recent {label} RFQs (latest 5)</h3>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: "var(--table-header)" }}>
            <tr
              className="text-left text-[13px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--table-header-text)" }}
            >
              <th className="px-4 py-3">RFQ Reference</th>
              <th className="px-4 py-3">Title / Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {recentRfqs.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!recentRfqs.isLoading && (recentRfqs.data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  No {label.toLowerCase()} RFQs yet.
                </td>
              </tr>
            )}
            {recentRfqs.data?.map((rfq) => (
              <tr key={rfq.rfq_id} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-xs font-semibold text-muted-foreground">
                  {rfq.rfq_reference || "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{rfq.title || "—"}</div>
                  {rfq.category_detected && rfq.category_detected.length > 0 && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {rfq.category_detected.slice(0, 2).join(", ")}
                      {rfq.category_detected.length > 2
                        ? ` +${rfq.category_detected.length - 2}`
                        : ""}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <RfqStatusBadge status={rfq.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(rfq.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={kind === "materials" ? "/rfq/$rfqId" : "/rfq/sub/$rfqId"}
                    params={{ rfqId: rfq.rfq_id }}
                    className="text-sm font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    View
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

function ProcurementSection({
  title,
  subtitle,
  stats,
  loading,
  kind,
}: {
  title: string;
  subtitle: string;
  stats?: ProcSectionStats;
  loading: boolean;
  kind: "materials" | "subcontractor";
}) {
  const isSub = kind === "subcontractor";
  return (
    <div className="space-y-4">
      <div className="rounded-xl p-6" style={{ backgroundColor: isSub ? "#FDF3E0" : "#E8EFF7" }}>
        <h2 className="font-display text-xl" style={{ color: isSub ? "#7A5200" : "#1A3A5C" }}>
          {title}
        </h2>
        <p className="mt-1 text-sm" style={{ color: isSub ? "#7A5200" : "#1A3A5C", opacity: 0.7 }}>
          {subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Open RFQs -> unified tracker filtered to issued + this type */}
        <ProcurementStatCard
          value={stats?.openRfqs ?? 0}
          label="Open RFQs"
          loading={loading}
          linkTo="/rfq"
          search={{ status: "issued", type: kind }}
        />
        {/* Bids to Review: MR -> RFQ tracker (materials); SR has no bid screen yet (count only) */}
        <ProcurementStatCard
          value={stats?.bidsToReview ?? 0}
          label="Bids to Review"
          loading={loading}
          attention={(stats?.bidsToReview ?? 0) > 0}
          {...(isSub ? {} : { linkTo: "/rfq", search: { type: "materials" } })}
        />
        {/* Comparisons & PRs: both land on the PR Tracker filtered to this type */}
        <ProcurementStatCard
          value={stats?.comparisons ?? 0}
          label="Comparisons"
          loading={loading}
          linkTo="/prs"
          search={{ type: kind }}
        />
        <ProcurementStatCard
          value={stats?.prsTracked ?? 0}
          label="PRs Tracked"
          loading={loading}
          linkTo="/prs"
          search={{ type: kind }}
        />
      </div>

      <RecentRfqsTable kind={kind} />
    </div>
  );
}

function DashboardPage() {
  const stats = useStats();
  const procStats = useProcurementStats();

  const recent = useQuery({
    queryKey: ["recent-registrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("source_sheet", "registration_form")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as Vendor[];
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of the vendor master.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          value={stats.data?.total ?? 0}
          label="Total Vendors"
          loading={stats.isLoading}
          linkTo="/vendors"
        />
        <StatCard
          value={stats.data?.pending ?? 0}
          label="Pending Review"
          loading={stats.isLoading}
          linkTo="/vendors"
          search={{ status: "pending_review" }}
        />
        <StatCard
          value={stats.data?.active ?? 0}
          label="Active (Listed + Registered)"
          loading={stats.isLoading}
          linkTo="/vendors"
          search={{ status: "active" }}
        />
        <StatCard
          value={stats.data?.duplicates ?? 0}
          label="Duplicate Flags"
          loading={stats.isLoading}
          linkTo="/vendors"
          search={{ dup: true }}
        />
      </div>

      <section>
        <h2 className="mb-3 font-display text-xl text-foreground">Recent Registrations</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: "var(--table-header)" }}>
              <tr
                className="text-left text-[13px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--table-header-text)" }}
              >
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Categories</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {recent.isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!recent.isLoading && (recent.data?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    No recent registrations.
                  </td>
                </tr>
              )}
              {recent.data?.map((v) => (
                <tr key={v.vendor_id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-foreground">{v.company_name}</td>
                  <td className="px-4 py-3">{formatVendorType(v.vendor_type)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {(v.categories ?? []).slice(0, 2).join(", ")}
                    {v.categories && v.categories.length > 2 ? ` +${v.categories.length - 2}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={v.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(v.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to="/vendors/$vendorId"
                      params={{ vendorId: v.vendor_id }}
                      className="text-sm font-semibold"
                      style={{ color: "var(--accent)" }}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Procurement: parallel MR / SR sections (no silent type mixing) ── */}
      <ProcurementSection
        title="Procurement — Materials (MR)"
        subtitle="Materials RFQ pipeline at a glance"
        stats={procStats.data?.materials}
        loading={procStats.isLoading}
        kind="materials"
      />
      <ProcurementSection
        title="Procurement — Subcontractor (SR)"
        subtitle="Subcontractor RFQ pipeline — detail opens in the Subcontractor app"
        stats={procStats.data?.subcontractor}
        loading={procStats.isLoading}
        kind="subcontractor"
      />
    </div>
  );
}
