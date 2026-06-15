import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Check, X, CheckCircle2 } from "lucide-react";
import {
  supabase,
  type Vendor,
  type VendorDocument,
} from "@/integrations/supabase-external/client";
import { formatDate, formatVendorType, formatSupplierType } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/pending")({
  component: PendingPage,
});

function PendingPage() {
  const qc = useQueryClient();
  const pending = useQuery({
    queryKey: ["pending-vendors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("status", "pending_review")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Vendor[];
    },
  });

  const [confirm, setConfirm] = useState<{ vendor: Vendor; action: "approve" | "reject" } | null>(
    null,
  );

  const apply = async () => {
    if (!confirm) return;
    const newStatus = confirm.action === "approve" ? "listed" : "inactive";
    const { error } = await supabase
      .from("vendors")
      .update({ status: newStatus })
      .eq("vendor_id", confirm.vendor.vendor_id);
    if (error) toast.error(error.message);
    else {
      toast.success(
        confirm.action === "approve"
          ? "Vendor approved and added to the vendor list."
          : "Vendor registration rejected.",
      );
      qc.invalidateQueries({ queryKey: ["pending-vendors"] });
      qc.invalidateQueries({ queryKey: ["pending-count"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    }
    setConfirm(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] text-foreground">Pending Registrations</h1>
        <p className="text-sm text-muted-foreground">
          {pending.data
            ? `${pending.data.length} vendor${pending.data.length === 1 ? "" : "s"} awaiting review`
            : "Loading…"}
        </p>
      </div>

      {pending.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {!pending.isLoading && (pending.data?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12" style={{ color: "var(--accent)" }} />
          <p className="mt-4 text-foreground">
            No pending registrations. All submissions have been reviewed.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {pending.data?.map((v) => (
          <PendingCard
            key={v.vendor_id}
            v={v}
            onApprove={() => setConfirm({ vendor: v, action: "approve" })}
            onReject={() => setConfirm({ vendor: v, action: "reject" })}
          />
        ))}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "approve" ? "Approve vendor?" : "Reject vendor?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "approve"
                ? `Approving will mark ${confirm.vendor.company_name} as Listed and add them to the vendor master.`
                : `Rejecting will mark ${confirm?.vendor.company_name} as Inactive.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={apply}
              style={{
                backgroundColor:
                  confirm?.action === "approve" ? "var(--accent)" : "var(--toast-error-fg)",
              }}
            >
              {confirm?.action === "approve" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PendingCard({
  v,
  onApprove,
  onReject,
}: {
  v: Vendor;
  onApprove: () => void;
  onReject: () => void;
}) {
  const docs = useQuery({
    queryKey: ["vendor-documents", v.vendor_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("vendor_documents")
        .select("*")
        .eq("vendor_id", v.vendor_id);
      return (data ?? []) as VendorDocument[];
    },
  });
  const mandatory = (docs.data ?? []).filter((d) => d.mandatory);
  const crBad = v.cr_status === "expired" || v.cr_status === "suspended";

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-display text-lg text-foreground">{v.company_name}</h3>
        <span className="text-xs text-muted-foreground">Submitted {formatDate(v.created_at)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {v.vendor_type && (
          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs">
            {formatVendorType(v.vendor_type)}
          </span>
        )}
        {v.supplier_type && (
          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs">
            {formatSupplierType(v.supplier_type)}
          </span>
        )}
        {(v.categories ?? []).slice(0, 4).map((c) => (
          <span
            key={c}
            className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs"
          >
            {c}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
        <div>
          <span className="text-muted-foreground">Contact: </span>
          {v.contact_person ?? "—"}
        </div>
        <div>
          <span className="text-muted-foreground">Email: </span>
          {v.email ?? "—"}
        </div>
        <div>
          <span className="text-muted-foreground">Mobile: </span>
          {v.mobile ?? "—"}
        </div>
      </div>

      {v.duplicate_flag && (
        <div
          className="mt-3 flex items-center gap-2 rounded-md p-2 text-sm"
          style={{ backgroundColor: "var(--badge-pending-bg)", color: "var(--badge-pending-fg)" }}
        >
          <AlertTriangle className="h-4 w-4" /> Possible duplicate — review before approving
        </div>
      )}
      {crBad && (
        <div
          className="mt-3 flex items-center gap-2 rounded-md p-2 text-sm"
          style={{ backgroundColor: "var(--toast-error-bg)", color: "var(--toast-error-fg)" }}
        >
          <AlertTriangle className="h-4 w-4" /> CR status: {v.cr_status}
        </div>
      )}

      {mandatory.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Mandatory documents
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {mandatory.map((d) => (
              <span
                key={d.document_id}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1"
              >
                {d.submitted ? (
                  <Check className="h-3 w-3" style={{ color: "var(--confidence-high)" }} />
                ) : (
                  <X className="h-3 w-3" style={{ color: "var(--confidence-low)" }} />
                )}
                {d.document_type}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Link
          to="/vendors/$vendorId"
          params={{ vendorId: v.vendor_id }}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-secondary"
        >
          View Full Profile
        </Link>
        {/* hidden — phase 2 / demo */}
        <button
          onClick={onReject}
          className="rounded-md border px-3 py-1.5 text-sm font-semibold"
          style={{ borderColor: "var(--toast-error-fg)", color: "var(--toast-error-fg)" }}
        >
          Reject
        </button>
        <button
          onClick={onApprove}
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Approve
        </button>
      </div>
    </div>
  );
}
