import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";
import { Loader2, Search, X } from "lucide-react";
import { excludeTestBatch, splitRecipients, groupByCategory, wasSent } from "@/lib/rfq-vendors";

// ── Types ──────────────────────────────────────────────────────────────────────

interface VendorContact {
  name?: string;
  email?: string;
  phone?: string;
  [key: string]: unknown;
}

interface VendorSearchResult {
  vendor_id: string;
  company_name: string;
  email: string | null;
  contact_person: string | null;
  status: string;
  categories: string[] | null;
}

export interface RfqVendor {
  id: string;
  vendor_id: string;
  email_to: string | null;
  contact_person: string | null;
  matched_category: string | null;
  status: string;
  sent_at: string | null;
  response_received: boolean;
  response_status: string | null;
  response_drive_url: string | null;
  vendors: {
    company_name: string;
    status: string;
    categories: string[] | null;
  } | null;
}

/**
 * A vendor chosen for dispatch. `vendor_id` is the vendors-table id
 * (rfq_vendors.vendor_id) — the value the dispatch webhook gates on.
 * `name` is carried so the confirmation can list vendors by name.
 */
export interface SelectedVendor {
  vendor_id: string;
  name: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function RfqVendorList({
  rfqId,
  status = "draft",
  selected,
  onSelectionChange,
  onCountChange,
  defaultSelectAll = false,
}: {
  rfqId: string;
  /** RFQ status — drives recipients-only view + read-only gating once issued. */
  status?: string;
  selected: SelectedVendor[];
  onSelectionChange: (next: SelectedVendor[]) => void;
  onCountChange?: (count: number) => void;
  /** When true, every matched vendor starts SELECTED (a recipient by default); the
   *  officer just unticks the few they don't want. Used by the SR wizard. */
  defaultSelectAll?: boolean;
}) {
  const isDraft = status === "draft";
  const [vendorList, setVendorList] = useState<RfqVendor[]>([]);
  // Selection is owned by the parent route (so it survives tab switches);
  // derive a Set of vendor_ids for cheap membership checks during render.
  const selectedIds = new Set(selected.map((s) => s.vendor_id));
  const [loading, setLoading] = useState(true);
  // Once issued, default to recipients only (sent_at set); toggle reveals the pool.
  const [showAll, setShowAll] = useState(false);

  // Full matched pool (minus TEST_BATCH) and the actually-sent recipients.
  const allVendors = excludeTestBatch(vendorList);
  const { recipients, uncontacted } = splitRecipients(allVendors);
  const displayVendors = isDraft || showAll ? allVendors : recipients;
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorResults, setVendorResults] = useState<VendorSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // ── Fetch vendors on mount ──

  const fetchVendors = useCallback(async () => {
    const { data, error } = await supabase
      .from("rfq_vendors")
      .select(
        "id,vendor_id,email_to,contact_person,matched_category,status,sent_at,response_received,response_status,response_drive_url,vendors(company_name,status,categories)",
      )
      .eq("rfq_id", rfqId)
      .order("matched_category", { ascending: true });

    if (error) {
      toast.error("Failed to load vendors");
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as unknown as RfqVendor[];
    setVendorList(rows);
    onCountChange?.(rows.length);
    setLoading(false);
  }, [rfqId, onCountChange]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  // ── Selection ──

  // name carried with each selection so the dispatch confirmation can list names
  const nameOf = (v: RfqVendor) => v.vendors?.company_name || v.contact_person || "Unknown Vendor";

  const toggleVendor = (v: RfqVendor) => {
    if (selectedIds.has(v.vendor_id)) {
      onSelectionChange(selected.filter((s) => s.vendor_id !== v.vendor_id));
    } else {
      onSelectionChange([...selected, { vendor_id: v.vendor_id, name: nameOf(v) }]);
    }
  };

  const toggleCategory = (catVendors: RfqVendor[]) => {
    const ids = catVendors.map((v) => v.vendor_id);
    const allCatSelected = ids.every((id) => selectedIds.has(id));
    if (allCatSelected) {
      onSelectionChange(selected.filter((s) => !ids.includes(s.vendor_id)));
    } else {
      const additions = catVendors
        .filter((v) => !selectedIds.has(v.vendor_id))
        .map((v) => ({ vendor_id: v.vendor_id, name: nameOf(v) }));
      onSelectionChange([...selected, ...additions]);
    }
  };

  const selectAll = () => {
    onSelectionChange(displayVendors.map((v) => ({ vendor_id: v.vendor_id, name: nameOf(v) })));
  };

  const deselectAll = () => {
    onSelectionChange([]);
  };

  const selectedCount = selected.length;
  const allSelected = displayVendors.length > 0 && selectedCount === displayVendors.length;

  // Default every matched vendor to SELECTED (SR wizard). Runs once after load and
  // only if no selection exists yet — so it survives step navigation (the parent
  // keeps the selection) and never clobbers the officer's unticks.
  const didDefault = useRef(false);
  useEffect(() => {
    if (!defaultSelectAll || didDefault.current || loading || !isDraft) return;
    didDefault.current = true;
    if (selected.length === 0 && allVendors.length > 0) {
      onSelectionChange(allVendors.map((v) => ({ vendor_id: v.vendor_id, name: nameOf(v) })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSelectAll, loading, isDraft, allVendors.length]);

  // ── Search ──

  const searchVendors = async (q: string) => {
    setVendorSearch(q);
    if (!q.trim()) {
      setVendorResults([]);
      return;
    }
    setSearching(true);
    const { data, error } = await supabase
      .from("vendors")
      .select("vendor_id,company_name,contacts,status,categories")
      .ilike("company_name", `%${q}%`)
      .neq("status", "blacklisted")
      .limit(20);

    if (error) {
      console.error("Vendor search error:", error);
      setVendorResults([]);
      setSearching(false);
      return;
    }

    const results: VendorSearchResult[] = (data ?? [])
      .map(
        (v: {
          vendor_id: string;
          company_name: string;
          contacts: VendorContact[] | null;
          status: string;
          categories: string[] | null;
        }) => {
          const firstContact = Array.isArray(v.contacts) ? v.contacts[0] : null;
          const firstEmail = Array.isArray(v.contacts)
            ? (v.contacts.find((c) => c.email)?.email ?? null)
            : null;
          return {
            vendor_id: v.vendor_id,
            company_name: v.company_name,
            email: firstEmail,
            contact_person: (firstContact?.name as string) ?? null,
            status: v.status,
            categories: v.categories,
          };
        },
      )
      .filter((v) => !!v.email); // Exclude vendors with no email
    setVendorResults(results);
    setSearching(false);
  };

  // ── Add vendor ──

  const addVendor = async (v: VendorSearchResult) => {
    if (vendorList.some((vl) => vl.vendor_id === v.vendor_id)) {
      toast.info("Vendor already in list");
      return;
    }
    if (!v.email) {
      toast.error(`${v.company_name} has no email address on file and cannot be added.`);
      return;
    }
    const { data, error } = await supabase
      .from("rfq_vendors")
      .insert({
        rfq_id: rfqId,
        vendor_id: v.vendor_id,
        email_to: v.email,
        contact_person: v.contact_person || "",
        matched_category: v.categories?.[0] || null,
        status: "pending",
        response_received: false,
      })
      .select(
        "id,vendor_id,email_to,contact_person,matched_category,status,sent_at,response_received,response_status,response_drive_url",
      )
      .single();

    if (error) {
      toast.error("Failed to add vendor: " + error.message);
      return;
    }

    const newRow: RfqVendor = {
      ...(data as Omit<RfqVendor, "vendors">),
      vendors: { company_name: v.company_name, status: v.status, categories: v.categories },
    };
    setVendorList((prev) => [...prev, newRow]);
    onCountChange?.(vendorList.length + 1);
    if (defaultSelectAll) {
      onSelectionChange([...selected, { vendor_id: v.vendor_id, name: v.company_name }]);
    }
    setVendorSearch("");
    setVendorResults([]);
    toast.success(`${v.company_name} added`);
  };

  // ── Remove vendor ──

  const removeVendor = async (vendor: RfqVendor) => {
    const name = vendor.vendors?.company_name || vendor.contact_person || "this vendor";
    if (!confirm(`Remove ${name} from this RFQ?`)) return;

    const { error } = await supabase.from("rfq_vendors").delete().eq("id", vendor.id);

    if (error) {
      toast.error(`Remove failed: ${error.message}`);
      return;
    }

    setVendorList((prev) => prev.filter((v) => v.id !== vendor.id));
    onSelectionChange(selected.filter((s) => s.vendor_id !== vendor.vendor_id));
    onCountChange?.(vendorList.length - 1);
    toast.success(`${name} removed`);
  };

  // ── Test vendor detection ──

  const isTestVendor = (v: RfqVendor) =>
    v.matched_category === "TEST_ALWAYS" || (v.vendors?.company_name ?? "").startsWith("SCC TEST");

  // ── Group vendors by category ──

  const grouped = groupByCategory(displayVendors);
  const categoryNames = Object.keys(grouped).sort();

  // ── Render ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: "#1A3A5C" }}>
          {isDraft
            ? `Vendors (${allVendors.length}) — ${selectedCount} selected`
            : `Sent to ${recipients.length} vendor${recipients.length !== 1 ? "s" : ""}`}
        </span>
        <div className="flex items-center gap-3">
          {/* Selection controls — draft only (issued RFQs are read-only) */}
          {isDraft && allVendors.length > 0 && (
            <>
              <button
                onClick={allSelected ? deselectAll : selectAll}
                className="text-xs font-medium"
                style={{ color: "var(--accent)" }}
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              {selectedCount > 0 && !allSelected && (
                <button onClick={deselectAll} className="text-xs font-medium text-muted-foreground">
                  Deselect all
                </button>
              )}
            </>
          )}
          {/* Recipients/pool toggle — issued only */}
          {!isDraft && uncontacted.length > 0 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs font-medium underline"
              style={{ color: "var(--accent)" }}
            >
              {showAll
                ? "Show recipients only"
                : `Show all matched (${uncontacted.length} un-contacted)`}
            </button>
          )}
        </div>
      </div>

      {/* Vendor list grouped by category */}
      {displayVendors.length === 0 && (
        <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-muted-foreground text-sm">
          {isDraft
            ? "No vendors assigned. Search and add below."
            : "No vendors have been sent this RFQ yet."}
        </div>
      )}

      {categoryNames.map((categoryName) => {
        const catVendors = grouped[categoryName];
        const catIds = catVendors.map((v) => v.vendor_id);
        const checkedCount = catIds.filter((id) => selectedIds.has(id)).length;
        const allChecked = checkedCount === catIds.length;
        const someChecked = checkedCount > 0 && !allChecked;

        return (
          <div key={categoryName}>
            <div
              className="flex items-center justify-between px-3 py-1.5 rounded-t-lg"
              style={{ backgroundColor: "#E8EFF7" }}
            >
              <label className="flex items-center gap-2 cursor-pointer">
                {isDraft && (
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={() => toggleCategory(catVendors)}
                    className="h-4 w-4 rounded accent-[var(--accent)]"
                  />
                )}
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#1A3A5C" }}
                >
                  {categoryName} ({catVendors.length})
                </span>
              </label>
              {isDraft && (
                <button
                  onClick={() => catVendors.forEach((v) => removeVendor(v))}
                  className="text-xs font-medium"
                  style={{ color: "#DC2626" }}
                >
                  Remove all
                </button>
              )}
            </div>
            <div className="space-y-2 rounded-b-lg border border-border p-2">
              {catVendors.map((v) => (
                <div
                  key={v.id}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                  style={{
                    opacity: isDraft
                      ? selectedIds.has(v.vendor_id)
                        ? 1
                        : 0.5
                      : showAll && !wasSent(v)
                        ? 0.5
                        : 1,
                  }}
                >
                  {isDraft && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(v.vendor_id)}
                      onChange={() => toggleVendor(v)}
                      className="mt-0.5 h-4 w-4 flex-shrink-0 rounded accent-[var(--accent)]"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {v.vendors?.company_name || v.contact_person || "Unknown Vendor"}
                      </span>
                      {isTestVendor(v) && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                          style={{ backgroundColor: "#FDF3E0", color: "#7A5200" }}
                        >
                          TEST
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">
                      {v.email_to || "No email on file"}
                    </div>
                    {v.contact_person && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{v.contact_person}</div>
                    )}
                    {/* Status / response indicators */}
                    <div className="flex items-center gap-2 mt-1">
                      {v.status === "sent" && (
                        <span className="text-xs" style={{ color: "var(--accent)" }}>
                          Sent
                          {v.sent_at
                            ? ` · ${new Date(v.sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                            : ""}
                        </span>
                      )}
                      {v.status === "pending" && (
                        <span className="text-xs text-muted-foreground">Pending</span>
                      )}
                      {v.response_received && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: "#E0F2EA", color: "#0D5C3A" }}
                        >
                          {v.response_status ?? "Responded"}
                        </span>
                      )}
                      {v.response_drive_url && (
                        <a
                          href={v.response_drive_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium underline"
                          style={{ color: "var(--accent)" }}
                        >
                          View submission
                        </a>
                      )}
                    </div>
                  </div>
                  {isDraft && (
                    <button
                      onClick={() => removeVendor(v)}
                      className="ml-2 flex-shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Add vendor search — draft only (issued RFQs are read-only) */}
      {isDraft && (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search vendors to add..."
              value={vendorSearch}
              onChange={(e) => searchVendors(e.target.value)}
              className="w-full rounded-md border border-border bg-white pl-9 pr-3 py-2 text-sm outline-none"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {vendorResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-white shadow-lg max-h-72 overflow-y-auto">
              {vendorResults.map((v) => {
                const alreadyAdded = vendorList.some((vl) => vl.vendor_id === v.vendor_id);
                return (
                  <button
                    key={v.vendor_id}
                    onClick={() => addVendor(v)}
                    disabled={alreadyAdded}
                    className="flex w-full items-start gap-2 px-3 py-2 text-sm hover:bg-secondary text-left disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{v.company_name}</span>
                        {alreadyAdded && (
                          <span
                            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: "#E0F2EA", color: "#0D5C3A" }}
                          >
                            Added
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{v.email}</div>
                      {v.categories && v.categories.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {v.categories.slice(0, 3).map((cat) => (
                            <span
                              key={cat}
                              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ backgroundColor: "#E8EFF7", color: "#1A3A5C" }}
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
