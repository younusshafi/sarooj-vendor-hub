import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase, type Vendor } from "@/integrations/supabase-external/client";
import { StatusBadge, ConfidenceDot, CategoryTags, SupplierPill } from "@/components/status-badge";
import { formatDate, formatVendorType } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { StatusGlossary } from "@/components/vendor-form/StatusGlossary";

const PAGE_SIZE = 50;

type VendorsSearch = {
  status?: string;
  dup?: boolean;
};

export const Route = createFileRoute("/_app/vendors/")({
  // Allow deep-linking from the dashboard tiles, e.g. /vendors?status=pending_review
  // or /vendors?status=active (listed+registered) or /vendors?dup=true.
  validateSearch: (search: Record<string, unknown>): VendorsSearch => ({
    status: typeof search.status === "string" ? search.status : undefined,
    dup: search.dup === true || search.dup === "true" ? true : undefined,
  }),
  component: VendorsPage,
});

// "active" is a synthetic value (listed + registered) handled specially in the query;
// the rest are real vendors.status values.
const STATUS_OPTIONS = [
  "active",
  "listed",
  "registered",
  "pending_review",
  "unresponsive",
  "inactive",
  "blacklisted",
];
const VENDOR_TYPES = [
  "material_supplier",
  "subcontractor",
  "services",
  "resources",
  "professional",
];
const SUPPLIER_TYPES = ["local", "international"];
const CONFIDENCE = ["high", "medium", "low"];

function VendorsPage() {
  const sp = Route.useSearch();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(sp.status ?? "active");
  const [vtype, setVtype] = useState("");
  const [stype, setStype] = useState("");
  const [category, setCategory] = useState("");
  const [confidence, setConfidence] = useState("");
  const [dup, setDup] = useState<boolean>(!!sp.dup);
  const [page, setPage] = useState(0);

  // Keep filters in sync when navigated here with new search params (e.g. clicking
  // a different dashboard tile while already on /vendors).
  useEffect(() => {
    setStatus(sp.status ?? "active");
    setDup(!!sp.dup);
    setPage(0);
  }, [sp.status, sp.dup]);

  const filters = { search, status, vtype, stype, category, confidence, dup };
  const hasFilters = !!(search || status || vtype || stype || category || confidence || dup);

  const categoriesQuery = useQuery({
    queryKey: ["vendor-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("categories").limit(1000);
      const set = new Set<string>();
      (data as { categories: string[] | null }[] | null)?.forEach((row) =>
        (row.categories ?? []).forEach((c) => set.add(c)),
      );
      return Array.from(set).sort();
    },
    staleTime: 1000 * 60 * 10,
  });

  const vendors = useQuery({
    queryKey: ["vendors", filters, page],
    queryFn: async () => {
      let q = supabase.from("vendors").select("*", { count: "exact" }).order("company_name");
      if (search) q = q.ilike("company_name", `%${search}%`);
      if (status === "active") q = q.in("status", ["listed", "registered"]);
      else if (status) q = q.eq("status", status);
      if (dup) q = q.eq("duplicate_flag", true);
      if (vtype) q = q.eq("vendor_type", vtype);
      if (stype) q = q.eq("supplier_type", stype);
      if (confidence) q = q.eq("data_confidence", confidence);
      if (category) q = q.contains("categories", [category]);
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      return { rows: (data as Vendor[]) ?? [], count: count ?? 0 };
    },
  });

  const totalPages = Math.max(1, Math.ceil((vendors.data?.count ?? 0) / PAGE_SIZE));

  const clearFilters = () => {
    setSearch("");
    setStatus("");
    setVtype("");
    setStype("");
    setCategory("");
    setConfidence("");
    setDup(false);
    setPage(0);
  };

  const exportCsv = () => {
    const rows = vendors.data?.rows ?? [];
    if (rows.length === 0) {
      toast.info("Nothing to export.");
      return;
    }
    const headers = [
      "Company",
      "Type",
      "Supplier",
      "Status",
      "Confidence",
      "City",
      "Categories",
      "CR Last Checked",
    ];
    const lines = [headers.join(",")].concat(
      rows.map((v) =>
        [
          v.company_name,
          formatVendorType(v.vendor_type),
          v.supplier_type ?? "",
          v.status,
          v.data_confidence ?? "",
          v.city ?? "",
          (v.categories ?? []).join("; "),
          v.cr_last_checked ?? "",
        ]
          .map((x) => `"${String(x).replace(/"/g, '""')}"`)
          .join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendors-page-${page + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[28px] text-foreground">Vendor Master</h1>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-secondary"
          >
            Export to Excel
          </button>
        </div>
      </div>

      <StatusGlossary />

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            placeholder="Search vendors..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="min-w-[220px] flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
          />
          <Select
            label="Status"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(0);
            }}
            options={STATUS_OPTIONS}
          />
          <Select
            label="Vendor Type"
            value={vtype}
            onChange={(v) => {
              setVtype(v);
              setPage(0);
            }}
            options={VENDOR_TYPES}
          />
          <Select
            label="Supplier"
            value={stype}
            onChange={(v) => {
              setStype(v);
              setPage(0);
            }}
            options={SUPPLIER_TYPES}
          />
          <Select
            label="Category"
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPage(0);
            }}
            options={categoriesQuery.data ?? []}
          />
          <Select
            label="Confidence"
            value={confidence}
            onChange={(v) => {
              setConfidence(v);
              setPage(0);
            }}
            options={CONFIDENCE}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={dup}
              onChange={(e) => {
                setDup(e.target.checked);
                setPage(0);
              }}
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-muted-foreground">Duplicates only</span>
          </label>
          {hasFilters && (
            <button
              onClick={clearFilters}
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
              <th className="px-4 py-3">Company Name</th>
              <th className="px-4 py-3">Categories</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Confidence</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Last Validated</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {vendors.isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-t border-border">
                  <td colSpan={9} className="px-4 py-3">
                    <div className="h-4 w-full animate-pulse rounded bg-secondary" />
                  </td>
                </tr>
              ))}
            {vendors.isError && (
              <tr>
                <td colSpan={9} className="px-4 py-6">
                  <div
                    className="rounded-md p-3 text-sm"
                    style={{
                      backgroundColor: "var(--toast-error-bg)",
                      color: "var(--toast-error-fg)",
                    }}
                  >
                    Failed to load vendors.{" "}
                    <button onClick={() => vendors.refetch()} className="underline">
                      Retry
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {!vendors.isLoading && (vendors.data?.rows.length ?? 0) === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No vendors match these filters.
                </td>
              </tr>
            )}
            {vendors.data?.rows.map((v) => (
              <VendorRow key={v.vendor_id} v={v} onRefresh={() => vendors.refetch()} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          {vendors.data ? (
            <>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, vendors.data.count)}{" "}
              of {vendors.data.count.toLocaleString()}
            </>
          ) : (
            "—"
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-white px-2 py-1.5 text-sm outline-none"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </option>
        ))}
      </select>
    </label>
  );
}

function VendorRow({ v, onRefresh }: { v: Vendor; onRefresh: () => void }) {
  const setStatus = async (newStatus: string) => {
    const { error } = await supabase
      .from("vendors")
      .update({ status: newStatus })
      .eq("vendor_id", v.vendor_id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Vendor marked ${newStatus}.`);
      onRefresh();
    }
  };
  const flagDup = async () => {
    const { error } = await supabase
      .from("vendors")
      .update({ duplicate_flag: true })
      .eq("vendor_id", v.vendor_id);
    if (error) toast.error(error.message);
    else {
      toast.success("Flagged as duplicate.");
      onRefresh();
    }
  };

  return (
    <tr className="border-t border-border hover:bg-secondary/40">
      <td className="px-4 py-3">
        <Link
          to="/vendors/$vendorId"
          params={{ vendorId: v.vendor_id }}
          className="font-semibold text-foreground hover:underline"
        >
          {v.company_name}
        </Link>
      </td>
      <td className="px-4 py-3">
        <CategoryTags categories={v.categories} />
      </td>
      <td className="px-4 py-3">{formatVendorType(v.vendor_type)}</td>
      <td className="px-4 py-3">
        <SupplierPill type={v.supplier_type} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={v.status} />
      </td>
      <td className="px-4 py-3">
        <ConfidenceDot level={v.data_confidence} />
      </td>
      <td className="px-4 py-3 text-muted-foreground">{v.city ?? "—"}</td>
      <td className="px-4 py-3 text-muted-foreground">{formatDate(v.cr_last_checked)}</td>
      <td className="px-4 py-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded p-1 hover:bg-secondary">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to="/vendors/$vendorId" params={{ vendorId: v.vendor_id }}>
                View Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatus("blacklisted")}>Blacklist</DropdownMenuItem>
            <DropdownMenuItem onClick={flagDup}>Flag Duplicate</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
