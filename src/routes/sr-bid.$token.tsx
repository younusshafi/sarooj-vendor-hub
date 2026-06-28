import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, CheckCircle2, Lock, Paperclip } from "lucide-react";
import {
  srBidGetByToken,
  srBidSubmitByToken,
  type SrBidGetResult,
  type SrBoqLine,
  type SrCommercialTerms,
  type SrBidLineInput,
} from "@/lib/sr-boq";
import { fmtOmr as fmt } from "@/lib/omr";
import { RfqDocShell, RfqDocSection } from "@/components/rfq-document";
import { uploadDocument } from "@/lib/subcontract-webhook";
import { fileToBase64 } from "@/lib/file-utils";
import { notifyBidSubmitted } from "@/lib/notify";

export const Route = createFileRoute("/sr-bid/$token")({
  head: () => ({ meta: [{ title: "Submit your quotation — Sarooj Construction Company" }] }),
  component: SrBidPage,
});

const RATE_RE = /^\d*(\.\d{0,3})?$/;
const INT_RE = /^\d*$/;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

interface LineRow {
  rate: string;
  remark: string;
}

interface Att {
  id: string;
  name: string;
  url: string | null;
  status: "uploading" | "done" | "error";
  error?: string;
}

const emptyTerms: SrCommercialTerms = {
  vat_treatment: "exclusive",
  quotation_ref: "",
  payment_terms: "",
  validity_days: "",
  subcontract_period: "",
  exclusions: "",
  notes: "",
};

const cellInput =
  "w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]";

function SrBidPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<SrBidGetResult | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [rows, setRows] = useState<Record<string, LineRow>>({});
  const [terms, setTerms] = useState<SrCommercialTerms>(emptyTerms);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [attachments, setAttachments] = useState<Att[]>([]);

  useEffect(() => {
    let alive = true;
    setState(null);
    setLoadError(false);
    srBidGetByToken(token)
      .then((res) => {
        if (!alive) return;
        setState(res);
        if (res.found) {
          const eb = res.existing_bid;
          if (eb) setTerms({ ...emptyTerms, ...eb.terms });
          const init: Record<string, LineRow> = {};
          for (const l of res.lines) {
            if (l.role !== "ITEM") continue;
            const prev = eb?.lines.find((x) => x.line_id === l.line_id);
            init[l.line_id] = {
              rate: prev?.unit_rate_omr != null ? String(prev.unit_rate_omr) : "",
              remark: prev?.remark ?? "",
            };
          }
          setRows(init);
        }
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, [token]);

  const found = state && state.found ? state : null;
  const readOnly = found ? found.locked : false;
  const columns = found ? found.columns : [];
  const lines = useMemo<SrBoqLine[]>(() => (found ? found.lines : []), [found]);

  const setRow = (id: string, patch: Partial<LineRow>) =>
    setRows((p) => ({ ...p, [id]: { ...(p[id] ?? { rate: "", remark: "" }), ...patch } }));
  const setT = (patch: Partial<SrCommercialTerms>) => setTerms((p) => ({ ...p, ...patch }));

  const amountOf = (l: SrBoqLine): number | null => {
    const r = rows[l.line_id];
    if (!r || r.rate.trim() === "") return null;
    const rate = Number(r.rate);
    if (Number.isNaN(rate) || l.qty == null) return null;
    return r3(rate * l.qty);
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let priced = 0;
    let items = 0;
    for (const l of lines) {
      if (l.role !== "ITEM") continue;
      items += 1;
      const r = rows[l.line_id];
      if (!r || r.rate.trim() === "") continue;
      const rate = Number(r.rate);
      if (Number.isNaN(rate) || l.qty == null) continue;
      subtotal += rate * l.qty;
      priced += 1;
    }
    const excl = terms.vat_treatment !== "inclusive";
    const subEx = r3(excl ? subtotal : subtotal / 1.05);
    const vat = r3(subEx * 0.05);
    const total = r3(subEx + vat);
    return { subEx, vat, total, priced, items };
  }, [lines, rows, terms.vat_treatment]);

  const handleSubmit = async () => {
    setSubmitErr(null);
    if (totals.priced === 0) {
      setSubmitErr("Enter at least one unit rate before submitting.");
      return;
    }
    setSubmitting(true);
    const payloadLines: SrBidLineInput[] = lines
      .filter((l) => l.role === "ITEM")
      .map((l) => {
        const r = rows[l.line_id] ?? { rate: "", remark: "" };
        const rate = r.rate.trim() === "" ? null : Number(r.rate);
        return {
          line_id: l.line_id,
          unit_rate_omr: rate != null && !Number.isNaN(rate) ? rate : null,
          remark: r.remark.trim(),
        };
      });
    const res = await srBidSubmitByToken(token, { terms, lines: payloadLines });
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
      if (found) {
        notifyBidSubmitted({
          rfqReference: found.rfq.rfq_reference,
          vendorName: found.vendor.company_name ?? "Vendor",
          total: totals.total,
        });
      }
    } else setSubmitErr(res.error);
  };

  // Vendor attachments — reuse the existing Drive upload webhook (uploads to the RFQ's
  // Drive folder + records it; the officer sees it in the SR Documents tab). Fire-and-forget
  // per file, independent of the rate submission.
  const handleAttach = async (file: File) => {
    if (!found) return;
    const id = crypto.randomUUID();
    setAttachments((a) => [...a, { id, name: file.name, url: null, status: "uploading" }]);
    const update = (patch: Partial<Att>) =>
      setAttachments((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const base64 = await fileToBase64(file);
      const res = await uploadDocument(found.rfq.rfq_id, file, "Vendor bid attachment", base64);
      if (res.ok && res.data.success) update({ status: "done", url: res.data.drive_file_url });
      else update({ status: "error", error: res.ok ? "Upload returned an error" : res.error });
    } catch (err) {
      update({ status: "error", error: err instanceof Error ? err.message : "Upload failed" });
    }
  };

  return (
    <RfqDocShell subtitle="Subcontract Quotation">
      {state === null && !loadError && (
        <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      )}

      {loadError && (
        <CenterCard icon="error" title="Something went wrong">
          Please try the link again, or contact Sarooj procurement.
        </CenterCard>
      )}

      {state && !state.found && (
        <CenterCard icon="error" title="Invalid or expired link">
          This quotation link is not valid. It may have already closed, or the link is incomplete.
          Please contact Sarooj procurement.
        </CenterCard>
      )}

      {done && (
        <CenterCard icon="ok" title="Quotation submitted">
          Thank you — your quotation has been received. You may close this page.
        </CenterCard>
      )}

      {found && !done && (
        <>
          <div className="mb-6 rounded-xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-serif text-[26px] leading-tight text-foreground">
                  {found.rfq.rfq_reference}
                  {found.rfq.title ? ` — ${found.rfq.title}` : ""}
                </h1>
                <p className="mt-1 text-[14px] text-muted-foreground">
                  {found.vendor.company_name ?? "Vendor"}
                  {found.rfq.scope ? ` · ${found.rfq.scope}` : ""}
                </p>
              </div>
              <div className="text-right text-[13px] text-muted-foreground">
                {found.rfq.deadline && (
                  <div>
                    Response deadline: <span className="font-medium">{found.rfq.deadline}</span>
                  </div>
                )}
                {found.existing_bid && (
                  <div className="mt-1">Revision {found.existing_bid.revision} on file</div>
                )}
              </div>
            </div>
            {readOnly && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-[13px] font-medium text-foreground">
                <Lock className="h-4 w-4" /> This RFQ has closed — your submitted quotation is shown
                below, read-only.
              </div>
            )}
          </div>

          {/* Bill of Quantities */}
          <RfqDocSection title="Bill of Quantities — enter your unit rates">
            <div className="overflow-x-auto p-2">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2">#</th>
                    {columns.map((c, i) => (
                      <th key={i} className="px-2 py-2">
                        {c.name || `Col ${i + 1}`}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right">Unit Rate (RO)</th>
                    <th className="px-2 py-2 text-right">Amount (RO)</th>
                    <th className="px-2 py-2" style={{ minWidth: 160 }}>
                      Remark / Exclusion
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const totalCols = columns.length + 4;
                    if (l.role !== "ITEM") {
                      const text = l.cells.filter((c) => c.trim()).join(" ");
                      const isSection = l.role === "SECTION";
                      return (
                        <tr key={l.line_id}>
                          <td
                            colSpan={totalCols}
                            className={
                              isSection
                                ? "bg-primary px-2 py-1.5 font-semibold text-primary-foreground"
                                : "bg-secondary px-2 py-1.5 text-[12px] italic text-muted-foreground"
                            }
                          >
                            {text || " "}
                          </td>
                        </tr>
                      );
                    }
                    const r = rows[l.line_id] ?? { rate: "", remark: "" };
                    const rateBad = r.rate !== "" && !RATE_RE.test(r.rate);
                    const amt = amountOf(l);
                    return (
                      <tr key={l.line_id} className="border-b border-border align-top">
                        <td className="px-2 py-1.5 text-muted-foreground">{l.seq}</td>
                        {l.cells.map((cell, i) => {
                          const isDesc =
                            columns[i]?.role === "desc" || /desc/i.test(columns[i]?.name ?? "");
                          return (
                            <td key={i} className="px-2 py-1.5">
                              <div
                                className={`whitespace-pre-wrap break-words ${
                                  isDesc ? "min-w-[460px] max-w-[720px]" : "max-w-[150px]"
                                }`}
                              >
                                {cell}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5">
                          <input
                            inputMode="decimal"
                            value={r.rate}
                            disabled={readOnly || l.qty == null}
                            placeholder={l.qty == null ? "—" : "0.000"}
                            onChange={(e) =>
                              RATE_RE.test(e.target.value) &&
                              setRow(l.line_id, { rate: e.target.value })
                            }
                            className={`w-28 rounded-md border bg-card px-2 py-1.5 text-right text-sm tabular-nums outline-none ${
                              rateBad ? "border-destructive" : "border-input"
                            }`}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {amt == null ? "—" : fmt(amt)}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={r.remark}
                            disabled={readOnly}
                            placeholder="e.g. excludes scaffolding"
                            onChange={(e) => setRow(l.line_id, { remark: e.target.value })}
                            className={cellInput}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-secondary">
                    <td colSpan={columns.length + 2} className="px-2 py-2 text-right font-medium">
                      Subtotal (excl. VAT)
                    </td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums">
                      {fmt(totals.subEx)}
                    </td>
                    <td />
                  </tr>
                  <tr className="bg-secondary">
                    <td
                      colSpan={columns.length + 2}
                      className="px-2 py-2 text-right text-muted-foreground"
                    >
                      VAT @ 5%
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt(totals.vat)}</td>
                    <td />
                  </tr>
                  <tr className="bg-muted">
                    <td colSpan={columns.length + 2} className="px-2 py-2.5 text-right font-bold">
                      GRAND TOTAL (incl. VAT)
                    </td>
                    <td className="px-2 py-2.5 text-right font-bold tabular-nums">
                      {fmt(totals.total)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-4 py-2 text-[12px] text-muted-foreground">
              {totals.priced} of {totals.items} lines priced · amounts in OMR to 3 decimals (baisa)
              · totals indicative, finalised on submit.
            </div>
          </RfqDocSection>

          {/* Commercial terms */}
          <RfqDocSection title="Commercial Terms">
            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
              <Field label="VAT treatment">
                <select
                  value={terms.vat_treatment}
                  disabled={readOnly}
                  onChange={(e) =>
                    setT({ vat_treatment: e.target.value as "exclusive" | "inclusive" })
                  }
                  className={cellInput}
                >
                  <option value="exclusive">Rates exclusive of VAT</option>
                  <option value="inclusive">Rates inclusive of VAT</option>
                </select>
              </Field>
              <Field label="Quotation reference">
                <input
                  value={terms.quotation_ref}
                  disabled={readOnly}
                  onChange={(e) => setT({ quotation_ref: e.target.value })}
                  className={cellInput}
                />
              </Field>
              <Field label="Payment terms">
                <input
                  value={terms.payment_terms}
                  disabled={readOnly}
                  onChange={(e) => setT({ payment_terms: e.target.value })}
                  placeholder="e.g. 30 days, advance %"
                  className={cellInput}
                />
              </Field>
              <Field label="Quote validity (days)">
                <input
                  inputMode="numeric"
                  value={terms.validity_days}
                  disabled={readOnly}
                  onChange={(e) =>
                    INT_RE.test(e.target.value) && setT({ validity_days: e.target.value })
                  }
                  className={cellInput}
                />
              </Field>
              <Field label="Proposed subcontract period">
                <input
                  value={terms.subcontract_period}
                  disabled={readOnly}
                  onChange={(e) => setT({ subcontract_period: e.target.value })}
                  placeholder="e.g. 12 weeks"
                  className={cellInput}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 px-4 pb-4">
              <Field label="Overall exclusions">
                <textarea
                  rows={2}
                  value={terms.exclusions}
                  disabled={readOnly}
                  onChange={(e) => setT({ exclusions: e.target.value })}
                  placeholder="Anything not covered by this quotation"
                  className={cellInput}
                />
              </Field>
              <Field label="Key conditions / notes">
                <textarea
                  rows={2}
                  value={terms.notes}
                  disabled={readOnly}
                  onChange={(e) => setT({ notes: e.target.value })}
                  className={cellInput}
                />
              </Field>
            </div>
          </RfqDocSection>

          {!readOnly && (
            <RfqDocSection title="Attachments (optional)">
              <div className="space-y-3 p-4">
                <p className="text-[13px] text-muted-foreground">
                  Attach supporting documents (your quotation PDF, method statement, catalogues).
                  These are shared with Sarooj procurement.
                </p>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-4 py-2 text-sm font-medium hover:bg-secondary">
                  <Paperclip className="h-4 w-4" /> Add file
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAttach(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {attachments.length > 0 && (
                  <ul className="space-y-1.5">
                    {attachments.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{a.name}</span>
                        {a.status === "uploading" && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        {a.status === "done" &&
                          (a.url ? (
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[13px] font-medium text-[var(--accent)] hover:underline"
                            >
                              View
                            </a>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-[var(--accent)]" />
                          ))}
                        {a.status === "error" && (
                          <span className="text-[12px] text-destructive">
                            {a.error ?? "Failed"}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </RfqDocSection>
          )}

          {!readOnly && (
            <div className="flex flex-col items-end gap-2 pb-12">
              {submitErr && (
                <p className="flex items-center gap-1.5 text-[14px] text-destructive">
                  <AlertCircle className="h-4 w-4" /> {submitErr}
                </p>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-8 text-[15px] font-semibold text-primary-foreground hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Submit quotation
              </button>
              <p className="text-[12px] text-muted-foreground">
                You can revise and re-submit until the deadline.
              </p>
            </div>
          )}
        </>
      )}
    </RfqDocShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function CenterCard({
  icon,
  title,
  children,
}: {
  icon: "ok" | "error";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto mt-12 max-w-[520px] rounded-xl border border-border bg-card p-8 text-center">
      {icon === "ok" ? (
        <CheckCircle2 className="mx-auto h-12 w-12 text-[var(--accent)]" />
      ) : (
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
      )}
      <h2 className="mt-4 font-serif text-[22px] text-foreground">{title}</h2>
      <p className="mt-2 text-[14px] text-muted-foreground">{children}</p>
    </div>
  );
}
