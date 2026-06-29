/* eslint-disable @typescript-eslint/no-explicit-any -- loose Supabase rows from the untyped external client */
// Draft-state recipients screen for a materials RFQ: pick which matched vendors get the
// RFQ (checkboxes per vendor / per category / all), search-and-add more, then dispatch via
// n8n WF8. This replaces the old standalone /rfq/preview page — selection + send now live
// inline on the RFQ detail's Vendors tab. The covering email + deadline are edited on the
// RFQ Document tab; this screen shows the deadline read-only with a pointer there.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, X, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase, type VendorContact } from "@/integrations/supabase-external/client";
import { excludeTestBatch, groupByCategory } from "@/lib/rfq-vendors";

const N8N_WF8 = "https://n8n.zavia-ai.com/webhook/scc-rfq-dispatch";

interface SearchResult {
  vendor_id: string;
  company_name: string;
  email: string | null;
  contact_person: string | null;
  categories: string[] | null;
}

const isTestVendor = (v: any) =>
  v.matched_category === "TEST_ALWAYS" || (v.vendors?.company_name ?? "").startsWith("SCC TEST —");

export function RecipientSelectPanel({
  rfq,
  rfqId,
  vendors,
  vendorsLoading,
}: {
  rfq: any;
  rfqId: string;
  vendors: any[];
  vendorsLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [vendorList, setVendorList] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const initRef = useRef(false);

  // Sync local list from the loaded pool (excluding the test-batch marker vendors).
  useEffect(() => {
    setVendorList(excludeTestBatch(vendors));
  }, [vendors]);

  // Default: everything matched is selected (auto-match already chose the pool).
  useEffect(() => {
    if (!initRef.current && vendorList.length > 0) {
      setSelected(new Set(vendorList.map((v) => v.vendor_id)));
      initRef.current = true;
    }
  }, [vendorList]);

  const toggleVendor = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleCategory = useCallback((catVendors: any[]) => {
    const ids = catVendors.map((v) => v.vendor_id);
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  }, []);

  const grouped = useMemo(() => groupByCategory(vendorList), [vendorList]);
  const categoryNames = useMemo(() => Object.keys(grouped).sort(), [grouped]);
  const selectedCount = selected.size;
  const allSelected = vendorList.length > 0 && selectedCount === vendorList.length;

  // ── Search & add ──
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const { data } = await supabase
      .from("vendors")
      .select("vendor_id,company_name,contacts,status,categories")
      .ilike("company_name", `%${q}%`)
      .neq("status", "blacklisted")
      .limit(10);
    setResults(
      (data ?? []).map((v: any) => {
        const contacts: VendorContact[] = Array.isArray(v.contacts) ? v.contacts : [];
        return {
          vendor_id: v.vendor_id,
          company_name: v.company_name,
          email: contacts.find((c) => c.email)?.email ?? null,
          contact_person: (contacts[0]?.name as string) ?? null,
          categories: v.categories,
        };
      }),
    );
    setSearching(false);
  }, []);

  const addVendor = useCallback(
    async (v: SearchResult) => {
      if (vendorList.some((vl) => vl.vendor_id === v.vendor_id)) {
        toast.info("Vendor already in the list");
        return;
      }
      if (!v.email)
        toast.warning(`${v.company_name} has no email on file — add one before sending.`);
      const { data, error } = await supabase
        .from("rfq_vendors")
        .insert({
          rfq_id: rfqId,
          vendor_id: v.vendor_id,
          email_to: v.email || "",
          contact_person: v.contact_person || "",
          status: "pending",
        })
        .select("id,vendor_id,email_to,contact_person,matched_category,status")
        .single();
      if (error) {
        toast.error("Failed to add vendor: " + error.message);
        return;
      }
      const row = {
        ...(data as any),
        vendors: { company_name: v.company_name, categories: v.categories },
      };
      setVendorList((prev) => [...prev, row]);
      setSelected((prev) => new Set([...prev, v.vendor_id]));
      setSearch("");
      setResults([]);
      toast.success(`${v.company_name} added`);
    },
    [rfqId, vendorList],
  );

  // ── Send ──
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    const ids = [...selected];
    if (!ids.length) {
      toast.error("Select at least one vendor");
      return;
    }
    setSending(true);
    setShowConfirm(false);
    try {
      const res = await fetch(N8N_WF8, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfq_id: rfqId,
          final_vendor_ids: ids,
          selected_vendor_ids: ids,
          deadline: rfq.deadline ?? "",
        }),
      });
      const result: { message?: string } = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message || `WF8 error: ${res.status}`);
      toast.success("RFQ dispatched.");
      try {
        sessionStorage.setItem(`rfq_dispatching_${rfqId}`, String(Date.now()));
      } catch {
        /* sessionStorage unavailable — non-fatal */
      }
      // Force the detail page to re-read state → shows the "dispatch in progress" view,
      // then flips to issued once WF8 finishes (parent polls while draft).
      queryClient.invalidateQueries({ queryKey: ["rfq-detail", rfqId] });
      queryClient.invalidateQueries({ queryKey: ["rfq-vendors-detail", rfqId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setSending(false);
    }
  }, [selected, rfqId, rfq.deadline, queryClient]);

  if (vendorsLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + send */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold" style={{ color: "#1A3A5C" }}>
            Select recipients
          </span>
          <span
            className="rounded-full px-3 py-0.5 text-xs font-medium"
            style={{ backgroundColor: "#E0F2EA", color: "#0D5C3A" }}
          >
            {selectedCount} of {vendorList.length} selected
          </span>
          {vendorList.length > 0 && (
            <button
              onClick={() =>
                setSelected(allSelected ? new Set() : new Set(vendorList.map((v) => v.vendor_id)))
              }
              className="text-xs font-medium underline"
              style={{ color: "var(--accent)" }}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={sending || selectedCount === 0}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send RFQ to {selectedCount} vendor{selectedCount !== 1 ? "s" : ""}
        </button>
      </div>

      {/* Deadline (read-only; edited on the RFQ Document tab) */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
        <span className="w-36 shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Response Deadline
        </span>
        <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
          {rfq.deadline || "Not set"}
        </span>
        {!rfq.deadline && (
          <span className="text-xs text-muted-foreground">— set it on the RFQ Document tab</span>
        )}
      </div>

      {/* Search & add */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search vendors to add…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            runSearch(e.target.value);
          }}
          className="w-full rounded-md border border-border bg-white py-2 pl-9 pr-3 text-sm outline-none"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-white shadow-lg">
            {results.map((v) => {
              const added = vendorList.some((vl) => vl.vendor_id === v.vendor_id);
              return (
                <button
                  key={v.vendor_id}
                  onClick={() => addVendor(v)}
                  disabled={added}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{v.company_name}</span>
                      {added && (
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: "#E0F2EA", color: "#0D5C3A" }}
                        >
                          Added
                        </span>
                      )}
                      {!v.email && !added && (
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: "#FDF3E0", color: "#7A5200" }}
                        >
                          No email
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {v.email || "No email on file"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Vendor list grouped by category, with checkboxes */}
      {vendorList.length === 0 && (
        <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-muted-foreground">
          No vendors matched. Search and add recipients above.
        </div>
      )}
      {categoryNames.map((categoryName) => {
        const catVendors = grouped[categoryName];
        const catIds = catVendors.map((v: any) => v.vendor_id);
        const checked = catIds.filter((id: string) => selected.has(id)).length;
        const allChecked = checked === catIds.length;
        const someChecked = checked > 0 && !allChecked;
        return (
          <div key={categoryName}>
            <label
              className="flex cursor-pointer items-center gap-2 rounded-t-xl px-4 py-2"
              style={{ backgroundColor: "#E8EFF7" }}
            >
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = someChecked;
                }}
                onChange={() => toggleCategory(catVendors)}
                className="h-4 w-4 rounded accent-[var(--accent)]"
              />
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "#1A3A5C" }}
              >
                {categoryName} ({catVendors.length})
              </span>
            </label>
            <div className="overflow-hidden rounded-b-xl border border-border bg-card">
              <table className="w-full text-sm">
                <tbody>
                  {catVendors.map((v: any) => (
                    <tr
                      key={v.id}
                      className="border-t border-border"
                      style={{ opacity: selected.has(v.vendor_id) ? 1 : 0.45 }}
                    >
                      <td className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(v.vendor_id)}
                          onChange={() => toggleVendor(v.vendor_id)}
                          className="h-4 w-4 rounded accent-[var(--accent)]"
                        />
                      </td>
                      <td className="px-2 py-3 font-medium" style={{ color: "var(--foreground)" }}>
                        <span className="flex items-center gap-2">
                          {v.vendors?.company_name || "—"}
                          {isTestVendor(v) && (
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                              style={{ backgroundColor: "#FDF3E0", color: "#7A5200" }}
                            >
                              Test
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-xs text-muted-foreground">
                        {v.contact_person || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {v.email_to || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-xl" style={{ color: "#1A3A5C" }}>
                Confirm dispatch
              </h3>
              <button onClick={() => setShowConfirm(false)} className="text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Send this RFQ to {selectedCount} vendor{selectedCount !== 1 ? "s" : ""}? Deadline:{" "}
              {rfq.deadline || "not set"}.
            </p>
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-secondary/40 p-2 text-sm">
              {vendorList
                .filter((v) => selected.has(v.vendor_id))
                .map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium" style={{ color: "#1A3A5C" }}>
                      {v.vendors?.company_name || "—"}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{v.email_to}</span>
                  </li>
                ))}
            </ul>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-md border border-border py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                className="flex-1 rounded-md py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: "var(--accent)" }}
              >
                Confirm send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
