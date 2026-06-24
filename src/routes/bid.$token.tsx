import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, CheckCircle2, Lock } from "lucide-react";
import { SectionCard } from "@/components/vendor-form/SectionCard";
import { Field, inputClass, textareaClass } from "@/components/vendor-form/Field";
import {
  bidGetByToken,
  bidSubmitByToken,
  BID_LINK_STUBBED,
  type BidGetResult,
  type BidHeader,
  type BidItem,
  type BidLineInput,
  type VatTreatment,
} from "@/lib/bid-link";

export const Route = createFileRoute("/bid/$token")({
  head: () => ({
    meta: [{ title: "Submit your quotation — Sarooj Construction Company" }],
  }),
  component: BidPage,
});

// ── Local form shapes (strings while typing; coerced on submit) ──────────────

interface LineRow {
  rate: string;
  qty: string; // quantity_offered; blank = use RFQ qty
  brand: string;
  remark: string;
}

const emptyHeader: BidHeader = {
  quotation_reference: "",
  quotation_date: "",
  currency: "OMR",
  payment_structure: "",
  advance_percentage: "",
  credit_days: "",
  pdc_days: "",
  payment_method: "",
  delivery_terms: "",
  delivery_location: "",
  delivery_lead_time_days: "",
  validity_days: "",
  vat_treatment: "exclusive",
  scope_coverage_percent: "",
  exclusions: "",
  key_conditions: "",
  notes: "",
};

const RATE_RE = /^\d*(\.\d{0,3})?$/; // up to 3 decimals
const INT_RE = /^\d*$/;

function fmt(n: number): string {
  return n.toLocaleString("en", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function BidPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<BidGetResult | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [header, setHeader] = useState<BidHeader>(emptyHeader);
  const [rows, setRows] = useState<Record<string, LineRow>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Load by token
  useEffect(() => {
    let alive = true;
    setState(null);
    setLoadError(false);
    bidGetByToken(token)
      .then((res) => {
        if (!alive) return;
        setState(res);
        if (res.found) {
          // prefill from existing revision if present
          const eb = res.existing_bid;
          if (eb) setHeader({ ...emptyHeader, ...eb.header });
          const init: Record<string, LineRow> = {};
          for (const it of res.items) {
            const prev = eb?.lines.find((l) => l.rfq_item_id === it.rfq_item_id);
            init[it.rfq_item_id] = {
              rate: prev?.unit_price_omr != null ? String(prev.unit_price_omr) : "",
              qty: prev?.quantity_offered != null ? String(prev.quantity_offered) : "",
              brand: prev?.brand ?? "",
              remark: prev?.deviations_from_rfq ?? "",
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

  const items: BidItem[] = useMemo(() => (state?.found ? state.items : []), [state]);
  const readOnly = state?.found ? state.locked : false;

  const setRow = (id: string, patch: Partial<LineRow>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const setH = (patch: Partial<BidHeader>) => setHeader((prev) => ({ ...prev, ...patch }));

  // ── Totals (display only; server is authority) ──
  const totals = useMemo(() => {
    let subtotal = 0;
    let priced = 0;
    for (const it of items) {
      const r = rows[it.rfq_item_id];
      if (!r || r.rate.trim() === "") continue;
      const rate = Number(r.rate);
      if (Number.isNaN(rate)) continue;
      const qty = r.qty.trim() === "" ? it.quantity : Number(r.qty);
      if (Number.isNaN(qty)) continue;
      subtotal += rate * qty;
      priced += 1;
    }
    // Full precision through the subtotal; round only the finals to 3 dp (OMR/baisa).
    // Total ties exactly to subtotal + VAT — matches the server.
    const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
    const exclusive = header.vat_treatment === "exclusive";
    const subEx = r3(exclusive ? subtotal : subtotal / 1.05);
    const vat = r3(subEx * 0.05);
    const total = r3(subEx + vat);
    return { subEx, vat, total, priced };
  }, [items, rows, header.vat_treatment]);

  const buildPayload = () => {
    const lines: BidLineInput[] = items.map((it) => {
      const r = rows[it.rfq_item_id];
      const rate = r.rate.trim() === "" ? null : Number(r.rate);
      const qty = r.qty.trim() === "" ? null : Number(r.qty);
      return {
        rfq_item_id: it.rfq_item_id,
        unit_price_omr: rate != null && !Number.isNaN(rate) ? rate : null,
        quantity_offered: qty != null && !Number.isNaN(qty) ? qty : null,
        brand: r.brand.trim(),
        deviations_from_rfq: r.remark.trim(),
      };
    });
    return { header, lines };
  };

  const handleSubmit = async () => {
    setSubmitErr(null);
    if (totals.priced === 0) {
      setSubmitErr("Enter at least one unit rate before submitting.");
      return;
    }
    setSubmitting(true);
    const res = await bidSubmitByToken(token, buildPayload());
    setSubmitting(false);
    if (res.ok) setDone(true);
    else setSubmitErr(res.error);
  };

  // ── Render states ──
  return (
    <div className="min-h-screen bg-background" data-theme="charcoal">
      {BID_LINK_STUBBED && (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-[12px] font-medium text-amber-900">
          DEMO MODE — stubbed data, no backend. Try tokens: <code>/bid/revise</code>,{" "}
          <code>/bid/expired</code>, <code>/bid/invalid</code>.
        </div>
      )}

      <header className="w-full bg-header text-header-foreground">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-6 md:px-10">
          <span className="font-serif text-[20px] leading-none">Sarooj Construction Company</span>
          <span className="text-[13px]" style={{ color: "var(--sidebar-foreground)" }}>
            Quotation Submission
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-4 py-8 md:px-8">
        {state === null && !loadError && (
          <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        )}

        {loadError && (
          <CenterCard icon="error" title="Something went wrong">
            Please try the link again, or contact procurement.
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
            Thank you — your quotation has been received. A confirmation has been sent to your
            email. You may close this page.
          </CenterCard>
        )}

        {state?.found && !done && (
          <>
            {/* RFQ summary */}
            <div className="mb-6 rounded-xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="font-serif text-[26px] leading-tight text-foreground">
                    {state.rfq.rfq_reference} — {state.rfq.title}
                  </h1>
                  <p className="mt-1 text-[14px] text-muted-foreground">
                    {state.vendor.company_name}
                    {state.rfq.project_name ? ` · ${state.rfq.project_name}` : ""}
                  </p>
                </div>
                <div className="text-right text-[13px] text-muted-foreground">
                  {state.rfq.deadline && (
                    <div>
                      Response deadline: <span className="font-medium">{state.rfq.deadline}</span>
                    </div>
                  )}
                  {state.existing_bid && (
                    <div className="mt-1">Revision {state.existing_bid.revision} on file</div>
                  )}
                </div>
              </div>
              {readOnly && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-[13px] font-medium text-foreground">
                  <Lock className="h-4 w-4" /> This RFQ has closed — your submitted quotation is
                  shown below, read-only.
                </div>
              )}
            </div>

            {/* Line items */}
            <SectionCard number={1} title="Material list — enter your rates">
              <p className="-mt-2 text-[13px] text-muted-foreground">
                Quantity and unit are fixed by the RFQ. Leave a rate blank to mark a line “no
                quote”. Add a remark per line for any exclusion or deviation.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[14px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Description</th>
                      <th className="py-2 pr-3 text-right">Qty</th>
                      <th className="py-2 pr-3">Unit</th>
                      <th className="py-2 pr-3">Qty offered</th>
                      <th className="py-2 pr-3">Unit rate (OMR)</th>
                      <th className="py-2 pr-3">Brand / make</th>
                      <th className="py-2">Remark / exclusion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => {
                      const r = rows[it.rfq_item_id] ?? {
                        rate: "",
                        qty: "",
                        brand: "",
                        remark: "",
                      };
                      const rateBad = r.rate !== "" && !RATE_RE.test(r.rate);
                      const qtyBad = r.qty !== "" && !RATE_RE.test(r.qty);
                      return (
                        <tr key={it.rfq_item_id} className="border-b border-border align-top">
                          <td className="py-2 pr-3 text-muted-foreground">
                            {it.sap_item_number || it.item_number}
                          </td>
                          <td className="py-2 pr-3">{it.description}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{it.quantity}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{it.unit || "—"}</td>
                          <td className="py-2 pr-3">
                            <input
                              inputMode="decimal"
                              value={r.qty}
                              disabled={readOnly}
                              placeholder={String(it.quantity)}
                              onChange={(e) =>
                                RATE_RE.test(e.target.value) &&
                                setRow(it.rfq_item_id, { qty: e.target.value })
                              }
                              className={`h-9 w-24 rounded-md border bg-white px-2 text-[14px] outline-none ${qtyBad ? "border-destructive" : "border-input"}`}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              inputMode="decimal"
                              value={r.rate}
                              disabled={readOnly}
                              placeholder="0.000"
                              onChange={(e) =>
                                RATE_RE.test(e.target.value) &&
                                setRow(it.rfq_item_id, { rate: e.target.value })
                              }
                              className={`h-9 w-28 rounded-md border bg-white px-2 text-right tabular-nums outline-none ${rateBad ? "border-destructive" : "border-input"}`}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              value={r.brand}
                              disabled={readOnly}
                              onChange={(e) => setRow(it.rfq_item_id, { brand: e.target.value })}
                              className="h-9 w-32 rounded-md border border-input bg-white px-2 text-[14px] outline-none"
                            />
                          </td>
                          <td className="py-2">
                            <input
                              value={r.remark}
                              disabled={readOnly}
                              onChange={(e) => setRow(it.rfq_item_id, { remark: e.target.value })}
                              className="h-9 w-full min-w-[180px] rounded-md border border-input bg-white px-2 text-[14px] outline-none"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="mt-3 flex flex-col items-end gap-0.5 text-[14px]">
                <div>
                  Subtotal (ex-VAT):{" "}
                  <span className="font-medium tabular-nums">{fmt(totals.subEx)}</span>
                </div>
                <div className="text-muted-foreground">
                  VAT (5%): <span className="tabular-nums">{fmt(totals.vat)}</span>
                </div>
                <div className="text-[16px] font-semibold">
                  Total (inc-VAT): <span className="tabular-nums">{fmt(totals.total)} OMR</span>
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {totals.priced} of {items.length} lines quoted · totals are indicative; finalised
                  on submit.
                </div>
                <div className="text-[11px] text-muted-foreground">
                  * All amounts in OMR, shown to 3 decimals (baisa).
                </div>
              </div>
            </SectionCard>

            {/* Commercial terms */}
            <SectionCard number={2} title="Commercial terms">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label="VAT treatment" htmlFor="vat" required>
                  <select
                    id="vat"
                    value={header.vat_treatment}
                    disabled={readOnly}
                    onChange={(e) => setH({ vat_treatment: e.target.value as VatTreatment })}
                    className={inputClass}
                  >
                    <option value="exclusive">Rates are exclusive of VAT</option>
                    <option value="inclusive">Rates are inclusive of VAT</option>
                  </select>
                </Field>
                <Field label="Quotation reference" htmlFor="qref">
                  <input
                    id="qref"
                    value={header.quotation_reference}
                    disabled={readOnly}
                    onChange={(e) => setH({ quotation_reference: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Payment terms"
                  htmlFor="pay"
                  helper="e.g. 30 days credit, advance %, PDC"
                >
                  <input
                    id="pay"
                    value={header.payment_structure}
                    disabled={readOnly}
                    onChange={(e) => setH({ payment_structure: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Payment method" htmlFor="pm">
                  <input
                    id="pm"
                    value={header.payment_method}
                    disabled={readOnly}
                    onChange={(e) => setH({ payment_method: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Credit days" htmlFor="cd">
                  <input
                    id="cd"
                    inputMode="numeric"
                    value={header.credit_days}
                    disabled={readOnly}
                    onChange={(e) =>
                      INT_RE.test(e.target.value) && setH({ credit_days: e.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Advance %" htmlFor="adv">
                  <input
                    id="adv"
                    inputMode="numeric"
                    value={header.advance_percentage}
                    disabled={readOnly}
                    onChange={(e) =>
                      INT_RE.test(e.target.value) && setH({ advance_percentage: e.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Delivery lead time (days)" htmlFor="lt">
                  <input
                    id="lt"
                    inputMode="numeric"
                    value={header.delivery_lead_time_days}
                    disabled={readOnly}
                    onChange={(e) =>
                      INT_RE.test(e.target.value) &&
                      setH({ delivery_lead_time_days: e.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Quote validity (days)" htmlFor="val">
                  <input
                    id="val"
                    inputMode="numeric"
                    value={header.validity_days}
                    disabled={readOnly}
                    onChange={(e) =>
                      INT_RE.test(e.target.value) && setH({ validity_days: e.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Delivery terms" htmlFor="dt">
                  <input
                    id="dt"
                    value={header.delivery_terms}
                    disabled={readOnly}
                    onChange={(e) => setH({ delivery_terms: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Delivery location" htmlFor="dl">
                  <input
                    id="dl"
                    value={header.delivery_location}
                    disabled={readOnly}
                    onChange={(e) => setH({ delivery_location: e.target.value })}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field
                label="Exclusions"
                htmlFor="exc"
                helper="Anything not covered by your quotation"
              >
                <textarea
                  id="exc"
                  rows={2}
                  value={header.exclusions}
                  disabled={readOnly}
                  onChange={(e) => setH({ exclusions: e.target.value })}
                  className={textareaClass}
                />
              </Field>
              <Field label="Key conditions / notes" htmlFor="notes">
                <textarea
                  id="notes"
                  rows={2}
                  value={header.notes}
                  disabled={readOnly}
                  onChange={(e) => setH({ notes: e.target.value })}
                  className={textareaClass}
                />
              </Field>
            </SectionCard>

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
                  className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-8 text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
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
      </main>
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
