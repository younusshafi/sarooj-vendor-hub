/* eslint-disable @typescript-eslint/no-explicit-any -- loose jsonb payload from the capture form */
// Officer review queue for tokenized capture-link submissions (onboarding + re-confirmation).
// The tile is a summary; "Review submission" opens a full side-by-side (current vs submitted)
// with openable documents, and Approve/Reject live inside that review — no blind accept.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  X,
  FileText,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/integrations/supabase-external/auth";
import { formatDate } from "@/lib/format";
import {
  listPendingUpdates,
  vendorUpdateApply,
  vendorUpdateReject,
  verifyRequest,
  getRequestVerification,
  type PendingUpdate,
  type RequestVerification,
} from "@/lib/vendor-link";

// Verification result → colour token (matches the ledger result values).
const RESULT_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  match: { bg: "#E0F2EA", fg: "#0D5C3A", label: "Match" },
  mismatch: { bg: "#FEE2E2", fg: "#991B1B", label: "Mismatch" },
  unverifiable: { bg: "#EBEAEA", fg: "#6B696E", label: "Unverifiable" },
  info: { bg: "#E8EFF7", fg: "#1A3A5C", label: "Info" },
  advisory: { bg: "#FDF3E0", fg: "#7A5200", label: "Advisory" },
};

function VerifBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const map: Record<string, { bg: string; fg: string; Icon: typeof ShieldCheck; label: string }> = {
    pass: { bg: "#E0F2EA", fg: "#0D5C3A", Icon: ShieldCheck, label: "Verified" },
    mismatch: { bg: "#FEE2E2", fg: "#991B1B", Icon: ShieldAlert, label: "Mismatch" },
    unverifiable: { bg: "#EBEAEA", fg: "#6B696E", Icon: ShieldQuestion, label: "Unverifiable" },
    pending: { bg: "#FDF3E0", fg: "#7A5200", Icon: Loader2, label: "Verifying…" },
  };
  const s = map[status] ?? map.unverifiable;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      <s.Icon className="h-3 w-3" /> {s.label}
    </span>
  );
}

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

// AI-extracted fields the officer can write into the vendor master, line-by-line.
// exKey = key in verification.extracted; payloadKey/currentKey = the vendor's own value
// (for the diff); col = the vendor column sent as an override; isDate normalises DD/MM/YYYY.
const ENRICH_FIELDS: {
  col: string;
  label: string;
  exKey: string;
  payloadKey?: string;
  currentKey?: string;
  isDate?: boolean;
}[] = [
  { col: "company_name", label: "Company name", exKey: "entity_name", payloadKey: "company_name", currentKey: "company_name" }, // prettier-ignore
  {
    col: "cr_number",
    label: "CR number",
    exKey: "cr_number",
    payloadKey: "cr_number",
    currentKey: "cr_number",
  },
  {
    col: "vat_number",
    label: "VAT number",
    exKey: "vat_number",
    payloadKey: "vat_number",
    currentKey: "vat_number",
  },
  { col: "legal_structure", label: "Legal structure", exKey: "legal_structure", payloadKey: "legal_structure" }, // prettier-ignore
  { col: "cr_expiry", label: "CR expiry", exKey: "cr_expiry", isDate: true },
  { col: "vat_expiry", label: "VAT valid until", exKey: "vat_valid_until", isDate: true },
];

// Extracted dates are DD/MM/YYYY; vendor date columns need ISO (YYYY-MM-DD).
function ddmmyyyyToIso(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

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

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["vendor-pending-updates"] });
    qc.invalidateQueries({ queryKey: ["vendors"] });
  };

  const approve = async (
    id: string,
    overrideNote?: string,
    fieldOverrides?: Record<string, string>,
  ) => {
    setBusy(id);
    try {
      await vendorUpdateApply(id, reviewer, overrideNote, fieldOverrides);
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
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Vendor submissions from re-confirmation / onboarding links. Open each to review the details
        and documents, then apply to the vendor record or reject.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : pending.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          No pending responses yet. When a vendor submits via an outreach or onboarding link, it
          appears here for review.
        </div>
      ) : (
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
                    <VerifBadge status={p.verification_status} />
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
      )}

      {reviewing && (
        <ReviewModal
          request={reviewing}
          busy={busy === reviewing.request_id}
          onClose={() => setReviewing(null)}
          onApprove={(note, overrides) => approve(reviewing.request_id, note, overrides)}
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
  onApprove: (overrideNote?: string, fieldOverrides?: Record<string, string>) => void;
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
        .select(
          "company_name,cr_number,vat_number,website,country,contacts,legal_structure,cr_expiry,vat_expiry",
        )
        .eq("vendor_id", request.vendor_id)
        .maybeSingle();
      return data as any;
    },
  });

  // Document verification (from the scc-vendor-verify workflow).
  const {
    data: verification,
    refetch: refetchVerif,
    isFetching: verifFetching,
  } = useQuery<RequestVerification | null>({
    queryKey: ["vendor-verification", request.request_id],
    queryFn: () => getRequestVerification(request.request_id),
  });
  const [rerunning, setRerunning] = useState(false);
  const [overrideNote, setOverrideNote] = useState("");
  // Which AI-extracted values the officer has ticked to write into the vendor record.
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  const rerun = async () => {
    setRerunning(true);
    const before = verification?.ran_at ?? null;
    await verifyRequest(request.request_id);
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await refetchVerif();
      if (res.data?.ran_at && res.data.ran_at !== before) break;
    }
    setRerunning(false);
  };
  const vStatus = verification?.status ?? null;
  const needsOverride = vStatus === "mismatch";
  const canApprove = !busy && (!needsOverride || overrideNote.trim().length > 0);

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

  // AI-extracted values the officer can accept into the vendor record, line-by-line.
  const extracted = (verification?.extracted ?? {}) as Record<string, unknown>;
  const enrichRows = ENRICH_FIELDS.map((f) => {
    const rawAi = extracted[f.exKey];
    const aiDisplay = rawAi == null ? "" : String(rawAi).trim();
    const aiValue = f.isDate ? (aiDisplay ? ddmmyyyyToIso(aiDisplay) : null) : aiDisplay || null;
    const fromPayload = f.payloadKey ? pl[f.payloadKey] : undefined;
    let typed = fromPayload == null ? "" : String(fromPayload).trim();
    if (!typed && isUpdate && f.currentKey && current?.[f.currentKey] != null) {
      typed = String(current[f.currentKey]).trim();
    }
    let state: "match" | "fill" | "differs";
    if (!aiValue) state = "match";
    else if (!typed) state = "fill";
    else if (typed.toLowerCase() === aiDisplay.toLowerCase()) state = "match";
    else state = "differs";
    return { ...f, typed, aiDisplay, aiValue, state };
  }).filter((r) => r.aiDisplay);

  // Pre-tick blanks the documents can fill; leave "differs" for the officer to confirm.
  useEffect(() => {
    if (!verification?.ran_at) return;
    const init: Record<string, boolean> = {};
    for (const r of enrichRows) if (r.state === "fill" && r.aiValue) init[r.col] = true;
    setAccepted(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verification?.ran_at]);

  const fieldOverrides: Record<string, string> = {};
  for (const r of enrichRows) if (accepted[r.col] && r.aiValue) fieldOverrides[r.col] = r.aiValue;
  const acceptCount = Object.keys(fieldOverrides).length;

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
          {/* Document verification — AI-extracted values compared to entered details, in code */}
          <div className="mb-6 rounded-xl border border-border p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Document verification <VerifBadge status={vStatus} />
              </span>
              <button
                type="button"
                onClick={rerun}
                disabled={rerunning || verifFetching}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium disabled:opacity-50"
              >
                {rerunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {rerunning ? "Verifying…" : "Re-run"}
              </button>
            </div>
            {!verification || !verification.ran_at ? (
              <p className="text-sm text-muted-foreground">
                Not verified yet. Click <strong>Re-run</strong> to check the uploaded documents
                against the entered details.
              </p>
            ) : (
              <>
                <p className="mb-2 text-xs text-muted-foreground">
                  Ran {formatDate(verification.ran_at)}
                  {verification.confidence ? ` · confidence ${verification.confidence}` : ""}.
                  Values are AI-extracted; every flag is computed in code, not asserted by the AI.
                </p>
                <ul className="space-y-1.5">
                  {(verification.ledger ?? []).map((l, i) => {
                    const st = RESULT_STYLE[l.result] ?? RESULT_STYLE.info;
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span
                          className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                          style={{ backgroundColor: st.bg, color: st.fg }}
                        >
                          {st.label}
                        </span>
                        <span className="min-w-0">
                          <span className="font-medium">{l.field}</span>
                          <span className="text-muted-foreground"> — {l.note}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {(verification.per_document ?? []).some((d) => !d.ok) && (
                  <p className="mt-2 text-xs" style={{ color: "#991B1B" }}>
                    {verification.per_document!.filter((d) => !d.ok).length} document(s) could not
                    be read.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Apply AI-extracted values — line-by-line accept into the vendor record */}
          {verification?.ran_at && enrichRows.length > 0 && (
            <div className="mb-6 rounded-xl border border-border p-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Apply AI-extracted values
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Tick a value to write it into the vendor record on approve. Blanks the documents can
                fill are pre-ticked; values that differ from what the vendor entered are left for
                you to confirm.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 pr-3">Field</th>
                    <th className="py-1.5 pr-3">Entered</th>
                    <th className="py-1.5 pr-3">Found in documents</th>
                    <th className="py-1.5 text-right">Accept</th>
                  </tr>
                </thead>
                <tbody>
                  {enrichRows.map((r) => {
                    const stKey =
                      r.state === "fill" ? "info" : r.state === "differs" ? "mismatch" : "match";
                    const st = RESULT_STYLE[stKey];
                    const canAccept = r.state !== "match" && !!r.aiValue;
                    return (
                      <tr key={r.col} className="border-t border-border align-top">
                        <td className="py-2 pr-3 text-muted-foreground">{r.label}</td>
                        <td className="py-2 pr-3">
                          {r.typed || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                              style={{ backgroundColor: st.bg, color: st.fg }}
                            >
                              {r.state === "fill"
                                ? "Fill"
                                : r.state === "differs"
                                  ? "Differs"
                                  : "Match"}
                            </span>
                            <span className="min-w-0 break-words">{r.aiDisplay}</span>
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          {canAccept ? (
                            <input
                              type="checkbox"
                              checked={!!accepted[r.col]}
                              onChange={(e) =>
                                setAccepted((p) => ({ ...p, [r.col]: e.target.checked }))
                              }
                              className="h-4 w-4 accent-[var(--accent)]"
                              aria-label={`Accept ${r.label}`}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {acceptCount > 0 && (
                <p className="mt-3 text-xs" style={{ color: "var(--accent)" }}>
                  {acceptCount} value{acceptCount === 1 ? "" : "s"} will be written to the vendor
                  record on approve.
                </p>
              )}
            </div>
          )}

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

        <div className="border-t border-border p-4">
          {needsOverride && (
            <div className="mb-3">
              <label className="text-xs font-medium" style={{ color: "#991B1B" }}>
                Verification flagged mismatches — enter a justification to approve anyway:
              </label>
              <textarea
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                rows={2}
                placeholder="Why is it acceptable to approve despite the flags?"
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onReject}
              disabled={busy}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={() =>
                onApprove(needsOverride ? overrideNote.trim() : undefined, fieldOverrides)
              }
              disabled={!canApprove}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Approve &amp; apply{acceptCount > 0 ? ` (+${acceptCount})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
