import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase, type Vendor } from "@/integrations/supabase-external/client";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatVendorType } from "@/lib/format";

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
}: {
  value: number | string;
  label: string;
  loading: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border bg-card p-6"
      style={{ borderLeft: "4px solid var(--module-vendor)" }}
    >
      <div className="font-display text-[36px] leading-none text-foreground">
        {loading ? "—" : value.toLocaleString()}
      </div>
      <div className="mt-2 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function DashboardPage() {
  const stats = useStats();

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
        <StatCard value={stats.data?.total ?? 0} label="Total Vendors" loading={stats.isLoading} />
        <StatCard
          value={stats.data?.pending ?? 0}
          label="Pending Review"
          loading={stats.isLoading}
        />
        <StatCard
          value={stats.data?.active ?? 0}
          label="Active (Listed + Registered)"
          loading={stats.isLoading}
        />
        <StatCard
          value={stats.data?.duplicates ?? 0}
          label="Duplicate Flags"
          loading={stats.isLoading}
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
    </div>
  );
}
