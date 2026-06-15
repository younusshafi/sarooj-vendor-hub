import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, X, AlertTriangle, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/integrations/supabase-external/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/rfq/preview")({
  validateSearch: (s: Record<string, unknown>) => ({
    rfq_ids: Array.isArray(s.rfq_ids)
      ? (s.rfq_ids as string[])
      : typeof s.rfq_ids === "string"
        ? [s.rfq_ids]
        : [],
  }),
  component: RFQPreviewPage,
});

const N8N_WF8 = "https://n8n.zavia-ai.com/webhook/scc-rfq-dispatch";

// ── Row types for Supabase queries used on this page ──

interface RfqPreview {
  rfq_id: string;
  rfq_reference: string;
  title: string;
  rfq_type: string;
  status: string;
  covering_email_subject: string | null;
  covering_email_body: string | null;
  terms_and_conditions: string | null;
  needs_scope_documents: boolean | null;
}

interface RfqItemRow {
  item_id: string;
  item_number: number;
  sap_item_number: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  already_procured: boolean | null;
}

interface RfqVendorRow {
  id: string;
  vendor_id: string;
  email_to: string;
  contact_person: string | null;
  matched_category: string | null;
  status: string;
  vendors: {
    company_name: string;
    status: string;
    categories: string[] | null;
  } | null;
}

interface VendorContact {
  email?: string;
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

function RFQPreviewPage() {
  const { rfq_ids } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();

  // If no rfq_ids in URL, try sessionStorage fallback
  const [resolvedIds, setResolvedIds] = useState<string[]>([]);
  useEffect(() => {
    if (rfq_ids.length) {
      setResolvedIds(rfq_ids);
    } else {
      try {
        const stored = sessionStorage.getItem("rfq_preview_ids");
        if (stored) setResolvedIds(JSON.parse(stored) as string[]);
      } catch {
        /* ignored — sessionStorage unavailable */
      }
    }
  }, [rfq_ids]);

  const [activeTab, setActiveTab] = useState(0);
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const rfqId = resolvedIds[activeTab];

  const { data: rfq, isLoading: rfqLoading } = useQuery({
    queryKey: ["rfq-preview", rfqId],
    queryFn: async () => {
      if (!rfqId) return null;
      const { data, error } = await supabase.from("rfqs").select("*").eq("rfq_id", rfqId).single();
      if (error) throw error;
      return data as RfqPreview;
    },
    enabled: !!rfqId,
  });

  const { data: rfqItems } = useQuery({
    queryKey: ["rfq-items-preview", rfqId],
    queryFn: async () => {
      if (!rfqId) return [];
      const { data } = await supabase
        .from("rfq_items")
        .select("item_id,item_number,sap_item_number,description,quantity,unit,already_procured")
        .eq("rfq_id", rfqId)
        .order("item_number");
      return (data ?? []) as RfqItemRow[];
    },
    enabled: !!rfqId,
  });

  const { data: rfqVendors } = useQuery({
    queryKey: ["rfq-vendors-preview", rfqId],
    queryFn: async () => {
      if (!rfqId) return [];
      const { data } = await supabase
        .from("rfq_vendors")
        .select(
          "id,vendor_id,email_to,contact_person,matched_category,status,vendors(company_name,status,categories)",
        )
        .eq("rfq_id", rfqId);
      // PostgREST returns vendors as object for many-to-one FK;
      // Supabase TS generics infer an array — cast via unknown.
      return (data ?? []) as unknown as RfqVendorRow[];
    },
    enabled: !!rfqId,
  });

  const { data: tcs } = useQuery({
    queryKey: ["system-settings-tcs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", "rfq_terms_and_conditions")
        .single();
      return (data as { setting_value: string } | null)?.setting_value ?? "";
    },
  });

  const { data: defaultDeadlineDays } = useQuery({
    queryKey: ["system-settings-deadline"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", "rfq_default_deadline_days")
        .single();
      return parseInt((data as { setting_value: string } | null)?.setting_value ?? "14");
    },
  });

  // Editable fields
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [termsText, setTermsText] = useState("");
  const [deadline, setDeadline] = useState("");
  const [previewHtml, setPreviewHtml] = useState(false);
  const [vendorList, setVendorList] = useState<RfqVendorRow[]>([]);

  // Selection state — restore from sessionStorage if available, otherwise empty
  const [selectedVendorIds, setSelectedVendorIds] = useState<Set<string>>(() => {
    if (!rfqId) return new Set<string>();
    try {
      const stored = sessionStorage.getItem(`rfq_selection_${rfqId}`);
      if (stored) return new Set(JSON.parse(stored) as string[]);
    } catch {
      /* ignored */
    }
    return new Set<string>();
  });
  const prevVendorIdsRef = useRef<Set<string>>(new Set());

  // Persist selection to sessionStorage on every change
  useEffect(() => {
    if (rfqId) {
      sessionStorage.setItem(`rfq_selection_${rfqId}`, JSON.stringify([...selectedVendorIds]));
    }
  }, [rfqId, selectedVendorIds]);

  // Vendor search state
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorResults, setVendorResults] = useState<VendorSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Populate editable fields when rfq loads
  useEffect(() => {
    if (rfq) {
      setSubject(rfq.covering_email_subject || "");
      setBody(rfq.covering_email_body || "");
    }
  }, [rfq]);

  useEffect(() => {
    if (tcs !== undefined) setTermsText(tcs);
  }, [tcs]);

  useEffect(() => {
    if (rfqVendors) {
      setVendorList(
        rfqVendors.filter((v) => !(v.vendors?.categories ?? []).includes("TEST_BATCH")),
      );
    }
  }, [rfqVendors]);

  // Prune selection when vendorList changes (remove IDs no longer present)
  useEffect(() => {
    const currentIds = new Set(vendorList.map((v) => v.vendor_id));

    setSelectedVendorIds((prev) => {
      const next = new Set(prev);
      for (const id of next) {
        if (!currentIds.has(id)) next.delete(id);
      }
      return next;
    });

    prevVendorIdsRef.current = currentIds;
  }, [vendorList]);

  // Helpers for checkbox selection
  const isTestVendor = useCallback(
    (v: RfqVendorRow) =>
      v.matched_category === "TEST_ALWAYS" ||
      (v.vendors?.company_name ?? "").startsWith("SCC TEST \u2014"),
    [],
  );

  const toggleVendor = useCallback((vendorId: string) => {
    setSelectedVendorIds((prev) => {
      const next = new Set(prev);
      if (next.has(vendorId)) next.delete(vendorId);
      else next.add(vendorId);
      return next;
    });
  }, []);

  const toggleCategory = useCallback(
    (categoryVendors: RfqVendorRow[]) => {
      const ids = categoryVendors.map((v) => v.vendor_id);
      const allSelected = ids.every((id) => selectedVendorIds.has(id));
      setSelectedVendorIds((prev) => {
        const next = new Set(prev);
        if (allSelected) {
          ids.forEach((id) => next.delete(id));
        } else {
          ids.forEach((id) => next.add(id));
        }
        return next;
      });
    },
    [selectedVendorIds],
  );

  const selectAll = useCallback(() => {
    setSelectedVendorIds(new Set(vendorList.map((v) => v.vendor_id)));
  }, [vendorList]);

  const deselectAll = useCallback(() => {
    setSelectedVendorIds(new Set());
  }, []);

  const selectedCount = selectedVendorIds.size;
  const allSelected = vendorList.length > 0 && selectedCount === vendorList.length;

  // Default deadline
  useEffect(() => {
    if (defaultDeadlineDays !== undefined && !deadline) {
      const d = new Date();
      d.setDate(d.getDate() + defaultDeadlineDays);
      setDeadline(d.toISOString().split("T")[0]);
    }
  }, [defaultDeadlineDays]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeVendor = (id: string) => {
    setVendorList((prev) => prev.filter((v) => v.id !== id));
  };

  const searchVendors = async (q: string) => {
    if (!q.trim()) {
      setVendorResults([]);
      return;
    }
    setSearching(true);
    const { data } = await supabase
      .from("vendors")
      .select("vendor_id,company_name,contacts,contact_person,status,categories")
      .ilike("company_name", `%${q}%`)
      .neq("status", "blacklisted")
      .limit(10);
    const results: VendorSearchResult[] = (data ?? []).map(
      (v: {
        vendor_id: string;
        company_name: string;
        contacts: VendorContact[] | null;
        contact_person: string | null;
        status: string;
        categories: string[] | null;
      }) => {
        const firstEmail =
          Array.isArray(v.contacts)
            ? (v.contacts.find((c) => c.email)?.email ?? null)
            : null;
        return {
          vendor_id: v.vendor_id,
          company_name: v.company_name,
          email: firstEmail,
          contact_person: v.contact_person,
          status: v.status,
          categories: v.categories,
        };
      },
    );
    setVendorResults(results);
    setSearching(false);
  };

  const addVendor = async (v: VendorSearchResult) => {
    // Check not already in list
    if (vendorList.some((vl) => vl.vendor_id === v.vendor_id)) {
      toast.info("Vendor already in list");
      return;
    }
    if (!v.email) {
      toast.warning(
        `${v.company_name} has no email address on file — add one before sending.`,
      );
    }
    // Add to rfq_vendors in Supabase
    const { data, error } = await supabase
      .from("rfq_vendors")
      .insert({
        rfq_id: rfqId,
        vendor_id: v.vendor_id,
        email_to: v.email || "",
        contact_person: v.contact_person || "",
        status: "pending",
      })
      .select("id,vendor_id,email_to,contact_person,status")
      .single();
    if (error) {
      toast.error("Failed to add vendor: " + error.message);
      return;
    }
    const newRow: RfqVendorRow = {
      ...(data as {
        id: string;
        vendor_id: string;
        email_to: string;
        contact_person: string | null;
        status: string;
      }),
      matched_category: null,
      vendors: { company_name: v.company_name, status: v.status, categories: v.categories },
    };
    setVendorList((prev) => [...prev, newRow]);
    // Auto-select newly added vendor
    setSelectedVendorIds((prev) => new Set([...prev, v.vendor_id]));
    setVendorSearch("");
    setVendorResults([]);
    toast.success(`${v.company_name} added`);
  };

  const handleSend = async () => {
    const finalVendorIds = [...selectedVendorIds];
    if (!finalVendorIds.length) {
      toast.error("No vendors selected");
      return;
    }
    setSending(true);
    setShowConfirm(false);
    try {
      // Update email fields in rfqs before dispatch
      await supabase
        .from("rfqs")
        .update({
          covering_email_subject: subject,
          covering_email_body: body,
          terms_and_conditions: termsText,
        })
        .eq("rfq_id", rfqId);

      const res = await fetch(N8N_WF8, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfq_id: rfqId,
          final_vendor_ids: finalVendorIds,
          selected_vendor_ids: finalVendorIds,
          deadline,
        }),
      });
      const result: { message?: string } = await res.json();
      if (!res.ok) throw new Error(result.message || `WF8 error: ${res.status}`);
      toast.success("RFQ dispatched successfully!");
      navigate({ to: "/rfq/$rfqId", params: { rfqId } });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Dispatch failed";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const alreadyProcured = (rfqItems ?? []).filter((i) => i.already_procured);
  const needsScope = rfq?.needs_scope_documents;

  if (!resolvedIds.length) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No RFQs to preview.{" "}
        <a href="/rfq/new" className="underline">
          Generate one
        </a>
        .
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-6" style={{ backgroundColor: "#E8EFF7" }}>
        <div className="flex items-start justify-between">
          <div>
            <Link
              to="/rfq"
              className="mb-2 inline-flex items-center gap-1 text-xs font-medium"
              style={{ color: "#1A3A5C", opacity: 0.7 }}
            >
              <ArrowLeft className="h-3 w-3" /> Back to RFQ Tracker
            </Link>
            <h1 className="font-display text-[28px]" style={{ color: "#1A3A5C" }}>
              RFQ Preview & Dispatch
            </h1>
            {rfq && (
              <p className="mt-1 text-sm" style={{ color: "#1A3A5C", opacity: 0.7 }}>
                {rfq.rfq_reference} — {rfq.title}
              </p>
            )}
          </div>
          {rfqId && (
            <Link
              to="/rfq/$rfqId"
              params={{ rfqId }}
              className="text-sm font-medium"
              style={{ color: "var(--accent)" }}
            >
              RFQ Detail →
            </Link>
          )}
        </div>
      </div>

      {/* Tabs for multiple RFQ groups */}
      {resolvedIds.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {resolvedIds.map((id, i) => (
            <button
              key={id}
              onClick={() => setActiveTab(i)}
              className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
              style={
                activeTab === i
                  ? { backgroundColor: "#1A3A5C", color: "white" }
                  : { backgroundColor: "#E8EFF7", color: "#1A3A5C" }
              }
            >
              Group {i + 1}
            </button>
          ))}
        </div>
      )}

      {rfqLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left column — 60% */}
          <div className="space-y-6 lg:col-span-3">
            {/* Email Subject */}
            <div className="rounded-xl border border-border bg-card p-6">
              <label className="space-y-2 block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Email Subject
                </span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
                />
              </label>
            </div>

            {/* Email Body */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Email Body (HTML)
                </span>
                <button
                  onClick={() => setPreviewHtml((v) => !v)}
                  className="text-xs underline"
                  style={{ color: "var(--accent)" }}
                >
                  {previewHtml ? "Edit" : "Preview"}
                </button>
              </div>
              {previewHtml ? (
                <div
                  className="rounded-md border border-border p-4 text-sm prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: body }}
                />
              ) : (
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm font-mono outline-none"
                />
              )}
            </div>

            {/* Items table */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                RFQ Items
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: "var(--table-header)" }}>
                    <tr
                      className="text-left text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--table-header-text)" }}
                    >
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rfqItems ?? []).map((item) => (
                      <tr key={item.item_id} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {item.sap_item_number || item.item_number}
                        </td>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                        <td className="px-3 py-2">{item.unit || "\u2014"}</td>
                      </tr>
                    ))}
                    {!(rfqItems ?? []).length && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                          No items
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* T&Cs */}
            <div className="rounded-xl border border-border bg-card p-6">
              <label className="space-y-2 block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Terms & Conditions — edit for this RFQ only. Change default in{" "}
                  <a href="/settings" className="underline" style={{ color: "var(--accent)" }}>
                    Settings
                  </a>
                  .
                </span>
                <textarea
                  value={termsText}
                  onChange={(e) => setTermsText(e.target.value)}
                  rows={6}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
                />
              </label>
            </div>

            {/* Already procured */}
            {alreadyProcured.length > 0 && (
              <div
                className="rounded-xl border p-4"
                style={{ borderColor: "#F59E0B", backgroundColor: "#FDF3E0" }}
              >
                <div
                  className="flex items-center gap-2 font-semibold text-sm"
                  style={{ color: "#7A5200" }}
                >
                  <AlertTriangle className="h-4 w-4" />
                  {alreadyProcured.length} item(s) already procured
                </div>
                <p className="mt-1 text-xs" style={{ color: "#7A5200" }}>
                  These items have existing POs and will be excluded from the RFQ.
                </p>
              </div>
            )}

            {/* Scope warning */}
            {needsScope && (
              <div
                className="rounded-xl border p-4"
                style={{ borderColor: "#EF4444", backgroundColor: "#FEF2F2" }}
              >
                <div className="flex items-center gap-2 font-semibold text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  Scope documents required
                </div>
                <p className="mt-1 text-xs text-red-600">
                  This subcontract RFQ requires scope documents to be uploaded before dispatch.
                </p>
              </div>
            )}
          </div>

          {/* Right column — 40% */}
          <div className="space-y-6 lg:col-span-2">
            {/* Deadline */}
            <div className="rounded-xl border border-border bg-card p-6">
              <label className="space-y-2 block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Response Deadline
                </span>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
                />
              </label>
            </div>

            {/* Vendor cards — grouped by category with checkboxes */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Vendors ({vendorList.length}) — {selectedCount} selected
              </h3>
              {vendorList.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No vendors. Search and add below.
                </p>
              )}
              {vendorList.length > 0 && (
                <div className="mb-3 flex items-center gap-3">
                  <button
                    onClick={allSelected ? deselectAll : selectAll}
                    className="text-xs font-medium"
                    style={{ color: "var(--accent)" }}
                  >
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                  {selectedCount > 0 && !allSelected && (
                    <button
                      onClick={deselectAll}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Deselect all
                    </button>
                  )}
                </div>
              )}
              {vendorList.length > 0 &&
                (() => {
                  const grouped = vendorList.reduce<Record<string, RfqVendorRow[]>>((acc, v) => {
                    const cat = v.matched_category || "Uncategorised";
                    if (!acc[cat]) acc[cat] = [];
                    acc[cat].push(v);
                    return acc;
                  }, {});
                  const categoryNames = Object.keys(grouped).sort();
                  return (
                    <div className="space-y-4">
                      {categoryNames.map((categoryName) => {
                        const catVendors = grouped[categoryName];
                        const catIds = catVendors.map((v) => v.vendor_id);
                        const checkedCount = catIds.filter((id) =>
                          selectedVendorIds.has(id),
                        ).length;
                        const allChecked = checkedCount === catIds.length;
                        const someChecked = checkedCount > 0 && !allChecked;
                        return (
                          <div key={categoryName}>
                            <div
                              className="flex items-center justify-between px-3 py-1.5 rounded-t-lg"
                              style={{ backgroundColor: "#E8EFF7" }}
                            >
                              <label className="flex items-center gap-2 cursor-pointer">
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
                              <button
                                onClick={() => catVendors.forEach((v) => removeVendor(v.id))}
                                className="text-xs font-medium"
                                style={{ color: "#DC2626" }}
                              >
                                Remove all
                              </button>
                            </div>
                            <div className="space-y-2 rounded-b-lg border border-border p-2">
                              {catVendors.map((v) => (
                                <div
                                  key={v.id}
                                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                                  style={{
                                    opacity: selectedVendorIds.has(v.vendor_id) ? 1 : 0.5,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedVendorIds.has(v.vendor_id)}
                                    onChange={() => toggleVendor(v.vendor_id)}
                                    className="mt-0.5 h-4 w-4 flex-shrink-0 rounded accent-[var(--accent)]"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm truncate">
                                        {v.vendors?.company_name || "Unknown Vendor"}
                                      </span>
                                      {isTestVendor(v) && (
                                        <span
                                          className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                                          style={{
                                            backgroundColor: "#FDF3E0",
                                            color: "#7A5200",
                                          }}
                                        >
                                          TEST
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-0.5 text-xs text-muted-foreground truncate">
                                      {v.email_to}
                                    </div>
                                    {v.contact_person && (
                                      <div className="mt-0.5 text-xs text-muted-foreground">
                                        {v.contact_person}
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => removeVendor(v.id)}
                                    className="ml-2 flex-shrink-0 rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive-soft"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

              {/* Add vendor search */}
              <div className="mt-4 relative">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search vendors to add..."
                    value={vendorSearch}
                    onChange={(e) => {
                      setVendorSearch(e.target.value);
                      searchVendors(e.target.value);
                    }}
                    className="w-full rounded-md border border-border bg-white pl-9 pr-3 py-2 text-sm outline-none"
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {vendorResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-white shadow-lg max-h-72 overflow-y-auto">
                    {vendorResults.map((v) => {
                      const alreadyAdded = vendorList.some(
                        (vl) => vl.vendor_id === v.vendor_id,
                      );
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
                                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "#E0F2EA", color: "#0D5C3A" }}>
                                  Added
                                </span>
                              )}
                              {!v.email && !alreadyAdded && (
                                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "#FDF3E0", color: "#7A5200" }}>
                                  No email
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {v.email || "No email on file"}
                            </div>
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
            </div>

            {/* Send button */}
            <button
              onClick={() => setShowConfirm(true)}
              disabled={sending || !selectedCount}
              className="w-full rounded-md py-3 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {sending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                </span>
              ) : (
                `Send RFQ to ${selectedCount} Vendor${selectedCount !== 1 ? "s" : ""}`
              )}
            </button>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="font-display text-xl" style={{ color: "#1A3A5C" }}>
              Confirm Dispatch
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Send this RFQ to {selectedCount} vendor
              {selectedCount !== 1 ? "s" : ""}? Deadline: {deadline || "not set"}.
            </p>
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
                Confirm Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
