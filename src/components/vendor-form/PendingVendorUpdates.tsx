/* eslint-disable @typescript-eslint/no-explicit-any -- loose jsonb payload from the capture form */
// Officer review queue for tokenized capture-link submissions (onboarding + re-confirmation).
// The tile is a summary; "Review submission" opens a full side-by-side (current vs submitted)
// with openable documents, and Approve/Reject live inside that review — no blind accept.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, X, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/integrations/supabase-external/auth";
import { formatDate } from "@/lib/format";
import {
  listPendingUpdates,
  vendorUpdateApply,
  vendorUpdateReject,
  type PendingUpdate,
} from "@/lib/vendor-link";

// Fields shown in the review, mapped to the current vendor column (for the diff).
const FIELD_ROWS: { key: string; label: string; current?: (v: any) => string }[] = [
  { key: "company_name", label: "Company name", current: (v) => v?.company_name },
  { key: "contact_person", label: "Contact person", current: (v) => v?.contacts?.[0]?.name },
  { key: "designation", label: "Designation", current: (v) => v?.contacts?.[0]?.designation },
  { key: "email", label: "Email", current: (v) => v?.contacts?.[0]?.email },
  { key: "contact_mobile", label: "Mobile", current: (v) => v?.contacts?.[0]?.mobile },
  { key: "telephone", label: "Phone" },
  { key: "location", label: "Address" },
  { key: "cr_number", label: "CR number", current: (v) => v?.cr_number },
  { key: "vat_number", label: "VAT number", current: (v) => v?.vat_number },
  { key: "website", label: "Website", current: (v) => v?.website },
  { key: "country", label: "Country", current: (v) => v?.country },
  { key: "legal_structure", label: "Legal structure" },
  { key: "vendor_type", label: "Vendor type" },
  { key: "supplier_type", label: "Supplier type" },
  { key: "num_employees", label: "Employees" },
  { key: "offered_products", label: "Products / services" },
  { key: "main_customers", label: "Main customers" },
  { key: "signatory_name", label: "Signatory" },
  { key: "signatory_position", label: "Signatory position" },
];

export function PendingVendorUpdates() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const reviewer = user?.email ?? "";
  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["vendor-pending-updates"],
    queryFn: listPendingUpdates,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<PendingUpdate | null>(null);

  if (isLoading || pending.length === 0) return null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["vendor-pending-updates"] });
    qc.invalidateQueries({ queryKey: ["vendors"] });
  };

  const approve = async (id: string) => {
    setBusy(id);
    try {
      await vendorUpdateApply(id, reviewer);
      toast.success("Update applied to the vendor record.");
      setReviewing(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setBusy(null);
    }
  };

  const reject = async (id: string) => {
    const notes = window.prompt("Reason for rejecting this submission (optional):") ?? "";
    setBusy(id);
    try {
      await vendorUpdateReject(id, reviewer, notes);
      toast.success("Submission rejected.");
      setReviewing(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
      <h2 className="mb-1 text-base font-semibold" style={{ color: "#7A5200" }}>
        Pending vendor updates ({pending.length})
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Submitted by vendors through a re-confirmation or onboarding link. Open each to review the
        details and documents before applying them to the vendor record.
      </p>
      <div className="space-y-3">
        {pending.map((p) => {
          const pl = p.payload as any;
          const docs: any[] = Array.isArray(pl.uploaded_documents) ? pl.uploaded_documents : [];
          return (
            <div
              key={p.request_id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{pl.company_name || "—"}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: "#E8EFF7", color: "#1A3A5C" }}
                  >
                    {p.kind === "reconfirm" ? "Update to existing vendor" : "New vendor"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {pl.contact_person || "—"}
                  {pl.email ? ` · ${pl.email}` : ""}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {docs.length} document{docs.length !== 1 ? "s" : ""} · submitted{" "}
                  {formatDate(p.submitted_at)}
                </div>
              </div>
              <button
                onClick={() => setReviewing(p)}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white"
                style={{ backgroundColor: "#1A3A5C" }}
              >
                Review submission
              </button>
            </div>
          );
        })}
      </div>

      {reviewing && (
        <ReviewModal
          request={reviewing}
          busy={busy === reviewing.request_id}
          onClose={() => setReviewing(null)}
          onApprove={() => approve(reviewing.request_id)}
          onReject={() => reject(reviewing.request_id)}
        />
      )}
    </div>
  );
}

function ReviewModal({
  request,
  busy,
  onClose,
  onApprove,
  onReject,
}: {
  request: PendingUpdate;
  busy: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const pl = request.payload as any;
  const docs: any[] = Array.isArray(pl.uploaded_documents) ? pl.uploaded_documents : [];
  const isUpdate = !!request.vendor_id;

  // Current vendor (for the diff) — only for updates to an existing vendor.
  const { data: current } = useQuery({
    queryKey: ["vendor-current", request.vendor_id],
    enabled: isUpdate,
    queryFn: async () => {
      const { data } = await supabase
        .from("vendors")
        .select("company_name,cr_number,vat_number,website,country,contacts")
        .eq("vendor_id", request.vendor_id)
        .maybeSingle();
      return data as any;
    },
  });

  // Signed URLs so the officer can actually open each uploaded document.
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const d of docs) {
        if (!d.storage_path) continue;
        const { data } = await supabase.storage
          .from("vendor-documents")
          .createSignedUrl(d.storage_path, 3600);
        if (data?.signedUrl) out[d.storage_path] = data.signedUrl;
      }
      if (alive) setDocUrls(out);
    })();
    return () => {
      alive = false;
    };
  }, [request.request_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const val = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.trim() === "" ? "—" : s;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <h3 className="font-display text-xl" style={{ color: "#1A3A5C" }}>
              Review submission — {pl.company_name || "—"}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isUpdate ? "Update to an existing vendor" : "New vendor onboarding"} · submitted{" "}
              {formatDate(request.submitted_at)}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {/* Field-by-field; for updates, current vs submitted with change highlight */}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Field</th>
                {isUpdate && <th className="py-2 pr-3">Current</th>}
                <th className="py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_ROWS.map((f) => {
                const submitted = val(pl[f.key]);
                const cur = isUpdate ? val(f.current ? f.current(current) : undefined) : null;
                const changed = isUpdate && cur !== submitted && submitted !== "—";
                return (
                  <tr key={f.key} className="border-t border-border align-top">
                    <td className="py-2 pr-3 text-muted-foreground">{f.label}</td>
                    {isUpdate && <td className="py-2 pr-3 text-muted-foreground">{cur}</td>}
                    <td
                      className="py-2"
                      style={changed ? { fontWeight: 600, color: "var(--accent)" } : undefined}
                    >
                      {submitted}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Documents */}
          <div className="mt-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Documents ({docs.length})
            </div>
            {docs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No new documents uploaded.</p>
            ) : (
              <ul className="space-y-2">
                {docs.map((d, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">
                        <span className="font-medium">{d.document_type}</span>
                        <span className="text-muted-foreground"> — {d.filename}</span>
                      </span>
                    </span>
                    {docUrls[d.storage_path] ? (
                      <a
                        href={docUrls[d.storage_path]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold"
                        style={{ color: "var(--accent)" }}
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">…</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border p-4">
          <button
            onClick={onReject}
            disabled={busy}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Approve &amp; apply
          </button>
        </div>
      </div>
    </div>
  );
}
