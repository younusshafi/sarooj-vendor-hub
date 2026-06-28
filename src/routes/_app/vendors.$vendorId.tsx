/* eslint-disable @typescript-eslint/no-explicit-any -- loose Supabase rows from the untyped external client (see comparison-award-panel.tsx) */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import {
  supabase,
  type Vendor,
  type VendorValidation,
  type VendorOutreach,
  vendorEmail,
  vendorContactName,
  vendorPhone,
} from "@/integrations/supabase-external/client";
import { StatusBadge, ConfidenceDot } from "@/components/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatDate,
  formatDateTime,
  formatVendorType,
  formatSupplierType,
  titleCase,
} from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/vendors/$vendorId")({
  component: VendorProfilePage,
});

function VendorProfilePage() {
  const { vendorId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const vendor = useQuery({
    queryKey: ["vendor", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("vendor_id", vendorId)
        .single();
      if (error) throw error;
      return data as Vendor;
    },
  });

  const setStatus = async (newStatus: string) => {
    const { error } = await supabase
      .from("vendors")
      .update({ status: newStatus })
      .eq("vendor_id", vendorId);
    if (error) toast.error(error.message);
    else {
      toast.success(`Vendor marked ${newStatus}.`);
      qc.invalidateQueries({ queryKey: ["vendor", vendorId] });
    }
  };
  const flagDup = async () => {
    const { error } = await supabase
      .from("vendors")
      .update({ duplicate_flag: true })
      .eq("vendor_id", vendorId);
    if (error) toast.error(error.message);
    else {
      toast.success("Flagged as duplicate.");
      qc.invalidateQueries({ queryKey: ["vendor", vendorId] });
    }
  };
  const restoreVendor = async () => {
    const { error } = await supabase
      .from("vendors")
      .update({ status: "listed", duplicate_flag: false })
      .eq("vendor_id", vendorId);
    if (error) toast.error(error.message);
    else {
      toast.success("Vendor restored to Listed.");
      qc.invalidateQueries({ queryKey: ["vendor", vendorId] });
    }
  };

  if (vendor.isLoading) return <div className="text-muted-foreground">Loading vendor…</div>;
  if (vendor.isError || !vendor.data)
    return (
      <div
        className="rounded-md p-4 text-sm"
        style={{ backgroundColor: "var(--toast-error-bg)", color: "var(--toast-error-fg)" }}
      >
        Failed to load vendor.{" "}
        <button onClick={() => navigate({ to: "/vendors" })} className="underline">
          Back to list
        </button>
      </div>
    );

  const v = vendor.data;

  return (
    <div className="space-y-6">
      <Link
        to="/vendors"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to vendors
      </Link>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[28px] text-foreground">{v.company_name}</h1>
            <div className="mt-3 flex items-center gap-3">
              <StatusBadge status={v.status} large />
              <ConfidenceDot level={v.data_confidence} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={flagDup}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-secondary"
            >
              Flag Duplicate
            </button>
            {v.status === "blacklisted" ? (
              <button
                onClick={() => {
                  if (window.confirm("Restore this vendor to Listed and clear duplicate flag?")) {
                    restoreVendor();
                  }
                }}
                className="rounded-md border px-3 py-1.5 text-sm font-semibold hover:bg-secondary"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
              >
                Un-blacklist / Restore
              </button>
            ) : (
              <button
                onClick={() => {
                  if (window.confirm("This removes the vendor from the RFQ pool. Continue?")) {
                    setStatus("blacklisted");
                  }
                }}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-secondary"
                style={{ color: "var(--toast-error-fg)" }}
              >
                Blacklist
              </button>
            )}
            {/* hidden — phase 2 / demo */}
          </div>
        </div>

        {v.duplicate_flag && (
          <div
            className="mt-4 flex items-start gap-2 rounded-md border p-3 text-sm"
            style={{
              backgroundColor: "var(--badge-pending-bg)",
              borderColor: "var(--badge-pending-fg)",
              color: "var(--badge-pending-fg)",
            }}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              <div className="font-semibold">Possible duplicate</div>
              {v.duplicate_notes && <div className="mt-0.5">{v.duplicate_notes}</div>}
            </div>
          </div>
        )}
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileTab v={v} />
        </TabsContent>
        <TabsContent value="documents" className="mt-4">
          <DocumentsTab vendor={v} />
        </TabsContent>
        <TabsContent value="history" className="mt-4 space-y-6">
          <ValidationHistory vendorId={vendorId} />
          <OutreachHistory vendorId={vendorId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border py-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm text-foreground">
        {children || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

function ProfileTab({ v }: { v: Vendor }) {
  const crColor =
    v.cr_status === "active"
      ? "var(--confidence-high)"
      : v.cr_status === "expired" || v.cr_status === "suspended"
        ? "var(--confidence-low)"
        : "var(--muted-foreground)";
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
        <div>
          <Field label="Vendor Type">{formatVendorType(v.vendor_type)}</Field>
          <Field label="Supplier Type">{formatSupplierType(v.supplier_type)}</Field>
          <Field label="Legal Structure">{v.legal_structure}</Field>
          <Field label="CR Number">{v.cr_number}</Field>
          <Field label="CR Status">
            {v.cr_status ? (
              <span className="inline-flex items-center gap-2 capitalize">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: crColor }} />
                {v.cr_status}
              </span>
            ) : null}
          </Field>
          <Field label="CR Last Checked">{formatDate(v.cr_last_checked)}</Field>
          <Field label="VAT Number">{v.vat_number}</Field>
          <Field label="Website">
            {v.website && (
              <a href={v.website} target="_blank" rel="noreferrer" className="underline">
                {v.website}
              </a>
            )}
          </Field>
        </div>
        <div>
          <Field label="Contact Person">{vendorContactName(v)}</Field>
          <Field label="Designation">{v.designation}</Field>
          <Field label="Mobile">{vendorPhone(v)}</Field>
          <Field label="Telephone">{v.telephone}</Field>
          <Field label="Email">
            {vendorEmail(v) && (
              <a href={`mailto:${vendorEmail(v)}`} className="underline">
                {vendorEmail(v)}
              </a>
            )}
          </Field>
          <Field label="Location / City / Country">
            {[v.location, v.city, v.country].filter(Boolean).join(", ")}
          </Field>
          <Field label="Number of Employees">{v.num_employees}</Field>
          <Field label="Main Customers">{v.main_customers}</Field>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Categories
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(v.categories ?? []).map((c) => (
              <span
                key={c}
                className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs"
              >
                {c}
              </span>
            ))}
            {(v.categories ?? []).length === 0 && (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
        </div>
        <Field label="Offered Products / Services">{v.offered_products}</Field>
        <Field label="Source">{v.source_sheet}</Field>
        <Field label="Remarks">{v.remarks}</Field>
      </div>
    </div>
  );
}

const BUCKET = "vendor-documents";

interface DocRow {
  document_id: string;
  document_type: string;
  filename: string | null;
  drive_file_url: string | null;
  submitted_at: string | null;
  signedUrl: string | null;
}

function DocumentsTab({ vendor }: { vendor: Vendor }) {
  const docs = useQuery({
    queryKey: ["vendor-docs-table", vendor.vendor_id],
    queryFn: async (): Promise<DocRow[]> => {
      const { data, error } = await supabase
        .from("vendor_documents")
        .select("document_id,document_type,filename,drive_file_url,submitted_at")
        .eq("vendor_id", vendor.vendor_id)
        .eq("submitted", true)
        .not("drive_file_url", "is", null)
        .order("submitted_at", { ascending: false });
      if (error) throw error;

      // Generate signed URLs for each document
      const rows: DocRow[] = await Promise.all(
        (data ?? []).map(async (row: any) => {
          let signedUrl: string | null = null;
          if (row.drive_file_url) {
            const { data: signed } = await supabase.storage
              .from(BUCKET)
              .createSignedUrl(row.drive_file_url, 3600);
            signedUrl = signed?.signedUrl ?? null;
          }
          return {
            document_id: row.document_id,
            document_type: row.document_type ?? "Other",
            filename: row.filename,
            drive_file_url: row.drive_file_url,
            submitted_at: row.submitted_at,
            signedUrl,
          };
        }),
      );
      return rows;
    },
  });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {docs.isError && (
        <div className="px-4 py-3 text-sm" style={{ color: "var(--toast-error-fg)" }}>
          Error loading documents: {(docs.error as Error)?.message ?? "Unknown error"}
        </div>
      )}
      <table className="w-full text-sm">
        <thead style={{ backgroundColor: "var(--table-header)" }}>
          <tr
            className="text-left text-[13px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--table-header-text)" }}
          >
            <th className="px-4 py-3">Document Type</th>
            <th className="px-4 py-3">Filename</th>
            <th className="px-4 py-3">Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {docs.isLoading && (
            <tr>
              <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                Loading…
              </td>
            </tr>
          )}
          {!docs.isLoading && !docs.isError && (docs.data?.length ?? 0) === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                No documents found for this vendor.
              </td>
            </tr>
          )}
          {docs.data?.map((d) => (
            <tr key={d.document_id} className="border-t border-border">
              <td className="px-4 py-3 font-medium">
                {titleCase(d.document_type.replace(/_/g, " "))}
              </td>
              <td className="px-4 py-3">
                {d.signedUrl ? (
                  <a
                    href={d.signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                    style={{ color: "var(--accent)" }}
                  >
                    {d.filename ?? "View"}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{d.filename ?? "—"}</span>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(d.submitted_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ValidationHistory({ vendorId }: { vendorId: string }) {
  const q = useQuery({
    queryKey: ["vendor-validations", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_validations")
        .select("*")
        .eq("vendor_id", vendorId)
        .order("performed_at", { ascending: false });
      if (error) throw error;
      return data as VendorValidation[];
    },
  });
  return (
    <div>
      <h3 className="mb-2 font-display text-lg text-foreground">Validation History</h3>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: "var(--table-header)" }}>
            <tr
              className="text-left text-[13px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--table-header-text)" }}
            >
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Check</th>
              <th className="px-4 py-3">Result</th>
              <th className="px-4 py-3">Detail</th>
              <th className="px-4 py-3">By</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  No validation runs.
                </td>
              </tr>
            )}
            {q.data?.map((r) => (
              <tr key={r.validation_id} className="border-t border-border">
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDateTime(r.performed_at)}
                </td>
                <td className="px-4 py-3">{titleCase(r.check_type)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.result} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.result_detail ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.performed_by ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OutreachHistory({ vendorId }: { vendorId: string }) {
  const q = useQuery({
    queryKey: ["vendor-outreach", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_outreach")
        .select("*")
        .eq("vendor_id", vendorId)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return data as VendorOutreach[];
    },
  });
  return (
    <div>
      <h3 className="mb-2 font-display text-lg text-foreground">Outreach History</h3>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: "var(--table-header)" }}>
            <tr
              className="text-left text-[13px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--table-header-text)" }}
            >
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">To</th>
              <th className="px-4 py-3">Delivery</th>
              <th className="px-4 py-3">Response</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  No outreach yet.
                </td>
              </tr>
            )}
            {q.data?.map((r) => (
              <tr key={r.outreach_id} className="border-t border-border">
                <td className="px-4 py-3 text-muted-foreground">{formatDateTime(r.sent_at)}</td>
                <td className="px-4 py-3">{r.email_to}</td>
                <td className="px-4 py-3">{r.delivery_status ?? "—"}</td>
                <td className="px-4 py-3">{r.response_received ? "Yes" : "No"}</td>
                <td className="px-4 py-3">{r.response_type ?? "—"}</td>
                <td className="px-4 py-3">{r.follow_up_sent_at ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
