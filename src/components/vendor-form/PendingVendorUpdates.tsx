/* eslint-disable @typescript-eslint/no-explicit-any -- loose jsonb payload from the capture form */
// Officer review queue for tokenized capture-link submissions (onboarding + re-confirmation).
// Each row is a pending vendor_update_request; Approve applies it to the live vendor (or creates
// a new one) via vendor_update_apply, Reject discards it. Renders nothing when empty.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/integrations/supabase-external/auth";
import { formatDate } from "@/lib/format";
import { listPendingUpdates, vendorUpdateApply, vendorUpdateReject } from "@/lib/vendor-link";

export function PendingVendorUpdates() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const reviewer = user?.email ?? "";
  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["vendor-pending-updates"],
    queryFn: listPendingUpdates,
  });
  const [busy, setBusy] = useState<string | null>(null);

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
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-semibold" style={{ color: "#7A5200" }}>
          Pending vendor updates ({pending.length})
        </h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Submitted by vendors through a re-confirmation or onboarding link. Review the details and
        approve to apply them to the vendor record, or reject to discard.
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
                  {pl.contact_mobile ? ` · ${pl.contact_mobile}` : ""}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  CR {pl.cr_number || "—"} · VAT {pl.vat_number || "—"}
                  {pl.website ? ` · ${pl.website}` : ""}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Documents:{" "}
                  {docs.length ? docs.map((d) => d.document_type).join(", ") : "none new"}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Submitted {formatDate(p.submitted_at)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => approve(p.request_id)}
                  disabled={busy === p.request_id}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  {busy === p.request_id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Approve
                </button>
                <button
                  onClick={() => reject(p.request_id)}
                  disabled={busy === p.request_id}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
