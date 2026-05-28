import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/integrations/supabase-external/auth";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/categories")({
  component: CategoriesPage,
});

const PROCUREMENT_GROUPS = [
  "Steel & Rebar",
  "Pipes, Fittings & Valves",
  "Fasteners & Fixings",
  "Electrical Materials",
  "HVAC & Cooling",
  "Welfare & Camp",
  "Building Materials & Accessories",
  "Pumps & Mechanical",
  "Cement & Concrete",
  "Aggregates & Sand",
  "Scaffolding & Formwork",
  "Logistics & Services",
] as const;

type CategoryRow = {
  vendor_category: string;
  vendor_count: number;
  procurement_group: string | null;
};

function useCategories() {
  return useQuery({
    queryKey: ["categories-mapping"],
    queryFn: async () => {
      const [vendorsRes, mappingsRes] = await Promise.all([
        supabase
          .from("vendors")
          .select("categories")
          .in("status", ["listed", "registered"]),
        supabase.from("category_groups").select("*"),
      ]);

      // Build category → vendor count from vendors data
      const countMap: Record<string, number> = {};
      if (vendorsRes.data) {
        for (const row of vendorsRes.data) {
          const cats = (row as any).categories as string[] | null;
          if (!cats) continue;
          for (const c of cats) {
            const trimmed = c.trim();
            if (!trimmed) continue;
            countMap[trimmed] = (countMap[trimmed] || 0) + 1;
          }
        }
      }

      // Build category → procurement_group from mappings
      const groupMap: Record<string, string> = {};
      if (mappingsRes.data) {
        for (const m of mappingsRes.data) {
          groupMap[(m as any).vendor_category] = (m as any).procurement_group;
        }
      }

      // Merge into unified rows
      const allCategories = new Set([
        ...Object.keys(countMap),
        ...Object.keys(groupMap),
      ]);
      const rows: CategoryRow[] = [];
      for (const cat of allCategories) {
        rows.push({
          vendor_category: cat,
          vendor_count: countMap[cat] || 0,
          procurement_group: groupMap[cat] || null,
        });
      }

      rows.sort((a, b) =>
        a.vendor_category.localeCompare(b.vendor_category, undefined, {
          sensitivity: "base",
        })
      );
      return rows;
    },
  });
}

function CategoryRow({
  row,
  userEmail,
  onSaved,
}: {
  row: CategoryRow;
  userEmail: string;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (newGroup: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("category_groups").upsert(
        {
          vendor_category: row.vendor_category,
          procurement_group: newGroup,
          updated_by: userEmail,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "vendor_category" }
      );
      if (error) throw error;
      toast.success(`"${row.vendor_category}" → ${newGroup}`);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-md px-4 py-2.5 text-sm">
      <div className="flex items-center gap-3 min-w-0">
        <span className="truncate font-medium text-foreground">
          {row.vendor_category}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {row.vendor_count} vendor{row.vendor_count !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <Select
          value={row.procurement_group ?? ""}
          onValueChange={handleChange}
        >
          <SelectTrigger className="w-[220px] h-8 text-xs">
            <SelectValue placeholder="Assign group…" />
          </SelectTrigger>
          <SelectContent>
            {PROCUREMENT_GROUPS.map((g) => (
              <SelectItem key={g} value={g} className="text-xs">
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function CategoriesPage() {
  const { user } = useAuth();
  const userEmail = user?.email ?? "";
  const queryClient = useQueryClient();
  const { data: rows, isLoading } = useCategories();
  const [search, setSearch] = useState("");

  const filtered = (rows ?? []).filter((r) =>
    r.vendor_category.toLowerCase().includes(search.toLowerCase())
  );

  const unmapped = filtered.filter((r) => !r.procurement_group);
  const mapped = filtered.filter((r) => !!r.procurement_group);

  // Group mapped categories by procurement group
  const grouped: Record<string, CategoryRow[]> = {};
  for (const r of mapped) {
    const g = r.procurement_group!;
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(r);
  }

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["categories-mapping"] });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] text-foreground">
          Category Mapping
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control how vendor categories group into procurement pools for RFQs.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search categories…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-border bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-ring"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Unmapped section */}
          {unmapped.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div
                className="px-4 py-3 text-sm font-semibold"
                style={{
                  backgroundColor: "#FDF3E0",
                  color: "#7A5200",
                }}
              >
                Needs assignment ({unmapped.length})
              </div>
              <div className="divide-y divide-border bg-card">
                {unmapped.map((r) => (
                  <CategoryRow
                    key={r.vendor_category}
                    row={r}
                    userEmail={userEmail}
                    onSaved={invalidate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Mapped groups */}
          {PROCUREMENT_GROUPS.map((group) => {
            const items = grouped[group];
            if (!items || items.length === 0) return null;
            return (
              <div
                key={group}
                className="rounded-xl border border-border overflow-hidden"
              >
                <div
                  className="px-4 py-3 text-sm font-semibold"
                  style={{
                    backgroundColor: "#E8EFF7",
                    color: "#1A3A5C",
                  }}
                >
                  {group} ({items.length})
                </div>
                <div className="divide-y divide-border bg-card">
                  {items.map((r) => (
                    <CategoryRow
                      key={r.vendor_category}
                      row={r}
                      userEmail={userEmail}
                      onSaved={invalidate}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No categories match your search.
            </div>
          )}
        </>
      )}
    </div>
  );
}
