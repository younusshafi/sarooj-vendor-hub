// Officer SR (subcontractor) bid comparison + award. Reads the issued BOQ skeleton and
// every vendor's latest submission (sr-comparison.ts), lays them side by side, supports
// per-line equalization (budget for an excluded scope) + per-line award, a PO split
// summary, and re-opening a vendor's link for negotiation. Mirrors the materials
// ComparisonAwardPanel; adapted to the flexible BOQ (qty lives on the line; one column
// per vendor is guaranteed by sr_bid.is_latest, so no duplicate-vendor columns).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Save, Trophy, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/integrations/supabase-external/auth";
import { fmtOmr as fmt } from "@/lib/omr";
import { srBidReopen } from "@/lib/sr-boq";
import { ShareableLink } from "@/components/rfq/shareable-link";
import {
  srLoadComparison,
  srSaveComparison,
  srLoadComparisonState,
  srComparisonSubmit,
  srComparisonIssuePo,
  type SrComparison,
  type SrCmpVendor,
  type SrComparisonState,
} from "@/lib/sr-comparison";
import { sendApprovalEmail, getApproverEmail } from "@/lib/notify";

const GREEN_BG = "#E0F2EA";
const GREEN_FG = "#0D5C3A";

const key = (lineId: string, vendorId: string) => `${lineId}::${vendorId}`;

interface EqEntry {
  adjustment_omr: number;
  note: string;
}

export function SrComparisonPanel({
  rfqId,
  rfqReference,
}: {
  rfqId: string;
  rfqReference?: string;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<SrComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eqs, setEqs] = useState<Record<string, EqEntry>>({});
  const [awards, setAwards] = useState<Record<string, { rfq_vendor_id: string; reason: string }>>(
    {},
  );
  const [editing, setEditing] = useState<{ lineId: string; vendorId: string; name: string } | null>(
    null,
  );
  const [reopen, setReopen] = useState<SrCmpVendor | null>(null);
  const [approval, setApproval] = useState<SrComparisonState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [issuingPo, setIssuingPo] = useState(false);
  const [poNumber, setPoNumber] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cmp = await srLoadComparison(rfqId);
      setData(cmp);
      if (cmp) {
        const e: Record<string, EqEntry> = {};
        for (const x of cmp.equalizations)
          e[key(x.line_id, x.rfq_vendor_id)] = { adjustment_omr: x.adjustment_omr, note: x.note };
        const a: Record<string, { rfq_vendor_id: string; reason: string }> = {};
        for (const x of cmp.awards)
          a[x.line_id] = { rfq_vendor_id: x.rfq_vendor_id, reason: x.reason };
        setEqs(e);
        setAwards(a);
        setApproval(await srLoadComparisonState(cmp.boq_id));
      } else {
        setApproval(null);
      }
    } finally {
      setLoading(false);
    }
  }, [rfqId]);

  useEffect(() => {
    load();
  }, [load]);

  const itemLines = useMemo(
    () => (data ? data.lines.filter((l) => l.role === "ITEM") : []),
    [data],
  );

  const desc = useCallback(
    (cells: string[]) => {
      const i = data?.descIdx ?? -1;
      if (i >= 0 && cells[i]) return cells[i];
      return cells.find((c) => c && c.trim()) ?? "—";
    },
    [data],
  );

  const perItem = useMemo(() => {
    if (!data) return [];
    return itemLines.map((line) => {
      const qty = line.qty ?? 0;
      const cells = data.vendors.map((v) => {
        const r = v.rates[line.line_id];
        const rate = r?.unit_rate_omr ?? null;
        const raw = rate != null ? (r?.amount_omr ?? rate * qty) : null;
        const eq = eqs[key(line.line_id, v.rfq_vendor_id)]?.adjustment_omr ?? 0;
        const equalized = raw != null ? raw + eq : null;
        return {
          vendorId: v.rfq_vendor_id,
          name: v.company_name,
          rate,
          eq,
          raw,
          equalized,
          remark: r?.remark ?? null,
        };
      });
      const quoted = cells.filter((c) => c.equalized != null);
      const lowest = quoted.length
        ? quoted.reduce((m, c) => (c.equalized! < m.equalized! ? c : m))
        : null;
      const awardedVendor = awards[line.line_id]?.rfq_vendor_id ?? lowest?.vendorId ?? "";
      return { line, qty, cells, lowestVendorId: lowest?.vendorId ?? null, awardedVendor };
    });
  }, [data, itemLines, eqs, awards]);

  const split = useMemo(() => {
    const acc: Record<string, { name: string; lines: number; total: number }> = {};
    for (const row of perItem) {
      const v = row.awardedVendor;
      if (!v) continue;
      const cell = row.cells.find((c) => c.vendorId === v);
      if (!cell || cell.equalized == null) continue;
      if (!acc[v]) acc[v] = { name: cell.name, lines: 0, total: 0 };
      acc[v].lines += 1;
      acc[v].total += cell.equalized;
    }
    return acc;
  }, [perItem]);

  const setAward = (lineId: string, vendorId: string) =>
    setAwards((prev) => ({
      ...prev,
      [lineId]: { rfq_vendor_id: vendorId, reason: prev[lineId]?.reason ?? "" },
    }));
  const setReason = (lineId: string, reason: string) =>
    setAwards((prev) => ({
      ...prev,
      [lineId]: { rfq_vendor_id: prev[lineId]?.rfq_vendor_id ?? "", reason },
    }));

  const handleSave = async () => {
    if (!data) return;
    for (const v of Object.values(eqs)) {
      if (v.adjustment_omr !== 0 && !v.note.trim()) {
        toast.error("Every equalization needs a note explaining what it covers.");
        return;
      }
    }
    for (const row of perItem) {
      if (row.lowestVendorId && row.awardedVendor && row.awardedVendor !== row.lowestVendorId) {
        if (!awards[row.line.line_id]?.reason?.trim()) {
          toast.error(`A reason is required when not awarding the lowest on a line.`);
          return;
        }
      }
    }
    setSaving(true);
    try {
      const equalizations = Object.entries(eqs)
        .filter(([, v]) => v.adjustment_omr !== 0 || v.note.trim())
        .map(([k, v]) => {
          const [line_id, rfq_vendor_id] = k.split("::");
          return { line_id, rfq_vendor_id, adjustment_omr: v.adjustment_omr, note: v.note };
        });
      const awardRows = perItem
        .filter((r) => r.awardedVendor)
        .map((r) => {
          const v = data.vendors.find((x) => x.rfq_vendor_id === r.awardedVendor);
          return {
            line_id: r.line.line_id,
            rfq_vendor_id: r.awardedVendor,
            awarded_bid_id: v?.bid_id ?? null,
            reason: awards[r.line.line_id]?.reason ?? "",
          };
        });
      await srSaveComparison(data.boq_id, user?.email ?? null, equalizations, awardRows);
      toast.success("Evaluation saved");
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const reloadApproval = async () => {
    if (data) setApproval(await srLoadComparisonState(data.boq_id));
  };

  const handleSubmitApproval = async () => {
    if (!data) return;
    if (Object.keys(awards).length === 0) {
      toast.error("Award at least one line and Save the evaluation before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await srComparisonSubmit(data.boq_id, user?.email ?? null);
      if (!res.ok) throw new Error(res.error || "Submit failed");
      if (res.review_token) {
        const to = await getApproverEmail();
        await sendApprovalEmail({
          to,
          rfqReference: rfqReference ?? data.scope ?? "Subcontract RFQ",
          title: data.scope ?? null,
          reviewUrl: `${window.location.origin}/sr-comparison-review/${res.review_token}`,
          preparedBy: user?.email ?? null,
        });
      }
      toast.success("Submitted for approval — review link emailed (and shown below).");
      await reloadApproval();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssuePo = async () => {
    if (!data) return;
    if (!poNumber.trim()) {
      toast.error("Enter the PO number first.");
      return;
    }
    setIssuingPo(true);
    try {
      const res = await srComparisonIssuePo(data.boq_id, poNumber.trim(), user?.email ?? null);
      if (!res.ok) throw new Error(res.error || "Failed to issue PO");
      toast.success("PO recorded — comparison closed.");
      await reloadApproval();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to issue PO");
    } finally {
      setIssuingPo(false);
    }
  };

  const locked = approval?.status === "approved" || approval?.status === "po_issued";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No BOQ has been issued for this RFQ yet. Issue the BOQ first (Issue BOQ tab), then vendor
        bids will appear here for comparison.
      </div>
    );
  }

  if (data.vendors.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        BOQ issued — no vendor has submitted a quotation yet. Submissions will appear here for
        side-by-side comparison.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Commercial summary */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg" style={{ color: "#0D5C3A" }}>
            Bid comparison{data.scope ? ` — ${data.scope}` : ""}
          </h3>
          <span className="text-xs text-muted-foreground">
            {data.vendors.length} vendor{data.vendors.length !== 1 ? "s" : ""} · all amounts OMR
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left text-[12px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                <th className="px-2 py-2">Criteria</th>
                {data.vendors.map((v) => (
                  <th key={v.rfq_vendor_id} className="px-2 py-2">
                    {v.company_name}
                    {v.revision > 1 && (
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        rev {v.revision}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  {
                    label: "Total (inc-VAT)",
                    get: (v: SrCmpVendor) => (v.total_omr != null ? `${fmt(v.total_omr)}` : "—"),
                  },
                  {
                    label: "Subtotal (ex-VAT)",
                    get: (v: SrCmpVendor) => (v.subtotal_omr != null ? fmt(v.subtotal_omr) : "—"),
                  },
                  {
                    label: "VAT",
                    get: (v: SrCmpVendor) => (v.vat_omr != null ? fmt(v.vat_omr) : "—"),
                  },
                  { label: "Payment terms", get: (v: SrCmpVendor) => v.payment_terms || "—" },
                  {
                    label: "Validity (days)",
                    get: (v: SrCmpVendor) =>
                      v.validity_days != null ? String(v.validity_days) : "—",
                  },
                  {
                    label: "Subcontract period",
                    get: (v: SrCmpVendor) => v.subcontract_period || "—",
                  },
                  { label: "Exclusions", get: (v: SrCmpVendor) => v.exclusions || "—" },
                ] as { label: string; get: (v: SrCmpVendor) => string }[]
              ).map((r) => (
                <tr key={r.label} className="border-t border-border align-top">
                  <td className="px-2 py-2 text-xs font-medium text-muted-foreground">{r.label}</td>
                  {data.vendors.map((v) => (
                    <td key={v.rfq_vendor_id} className="px-2 py-2 text-xs">
                      {r.get(v)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="px-2 py-2 text-xs font-medium text-muted-foreground">Negotiation</td>
                {data.vendors.map((v) => (
                  <td key={v.rfq_vendor_id} className="px-2 py-2">
                    <button
                      onClick={() => setReopen(v)}
                      className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                      style={{ color: "var(--accent)" }}
                      title="Re-open this vendor's link for negotiation"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {v.reopened_until ? `open → ${v.reopened_until}` : "Re-open"}
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-line award & equalization */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display text-lg" style={{ color: "#0D5C3A" }}>
            Per-line award &amp; equalization
          </h3>
          {locked ? (
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: GREEN_BG, color: GREEN_FG }}
            >
              {approval?.status === "po_issued" ? "PO issued — locked" : "Approved — locked"}
            </span>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save evaluation
            </button>
          )}
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Lowest <span style={{ color: GREEN_FG }}>equalized</span> amount is highlighted. Any
          remark the vendor left on a line shows in italics under their amount. Add an equalization
          to a vendor’s line to budget for an exclusion in their remark; award each line (default =
          lowest equalized). Amounts in OMR (3 dp).
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left text-[12px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                <th className="px-2 py-2">#</th>
                <th className="min-w-[220px] px-2 py-2">Description</th>
                <th className="px-2 py-2 text-right">Qty</th>
                {data.vendors.map((v) => (
                  <th key={v.rfq_vendor_id} className="px-2 py-2 text-right">
                    {v.company_name}
                  </th>
                ))}
                <th className="px-2 py-2">Award</th>
              </tr>
            </thead>
            <tbody>
              {perItem.map((row) => {
                const nonLowest =
                  row.lowestVendorId &&
                  row.awardedVendor &&
                  row.awardedVendor !== row.lowestVendorId;
                return (
                  <tr key={row.line.line_id} className="border-t border-border align-top">
                    <td className="px-2 py-2 text-xs text-muted-foreground">{row.line.seq}</td>
                    <td className="px-2 py-2 text-xs">{desc(row.line.cells)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.qty || "—"}</td>
                    {row.cells.map((c) => {
                      const isLowest = c.vendorId === row.lowestVendorId;
                      return (
                        <td
                          key={c.vendorId}
                          className="px-2 py-2 text-right font-mono text-xs"
                          style={
                            isLowest ? { backgroundColor: GREEN_BG, color: GREEN_FG } : undefined
                          }
                        >
                          {c.equalized == null ? (
                            <span className="italic text-muted-foreground">NQ</span>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <span>
                                {fmt(c.equalized)}
                                {c.eq !== 0 && (
                                  <span className="block text-[10px] text-muted-foreground">
                                    raw {fmt(c.raw!)} {c.eq > 0 ? "+" : ""}
                                    {fmt(c.eq)}
                                  </span>
                                )}
                              </span>
                              {!locked && (
                                <button
                                  onClick={() =>
                                    setEditing({
                                      lineId: row.line.line_id,
                                      vendorId: c.vendorId,
                                      name: c.name,
                                    })
                                  }
                                  className="text-muted-foreground hover:text-foreground"
                                  title="Adjust / equalize"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )}
                          {c.remark && (
                            <div className="mt-1 whitespace-normal text-left font-sans text-[10px] italic leading-snug text-muted-foreground">
                              “{c.remark}”
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2">
                      <select
                        value={row.awardedVendor}
                        disabled={locked}
                        onChange={(e) => setAward(row.line.line_id, e.target.value)}
                        className="rounded-md border border-border bg-white px-2 py-1 text-xs outline-none disabled:opacity-60"
                      >
                        <option value="">— none —</option>
                        {row.cells
                          .filter((c) => c.equalized != null)
                          .map((c) => (
                            <option key={c.vendorId} value={c.vendorId}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                      {nonLowest && (
                        <input
                          value={awards[row.line.line_id]?.reason ?? ""}
                          disabled={locked}
                          onChange={(e) => setReason(row.line.line_id, e.target.value)}
                          placeholder="Reason (required)"
                          className="mt-1 w-40 rounded-md border border-amber-400 bg-white px-2 py-1 text-xs outline-none disabled:opacity-60"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* PO split */}
        <div className="mt-5">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Trophy className="h-3.5 w-3.5" /> Award split (equalized)
          </h4>
          {Object.keys(split).length === 0 ? (
            <p className="text-sm text-muted-foreground">No lines awarded yet.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {Object.entries(split).map(([vid, s]) => (
                <div key={vid} className="rounded-lg border border-border px-4 py-2">
                  <div className="text-sm font-medium" style={{ color: "#0D5C3A" }}>
                    {s.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s.lines} line{s.lines !== 1 ? "s" : ""} · {fmt(s.total)} OMR
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Approval → PO */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="mb-3 font-display text-lg" style={{ color: "#0D5C3A" }}>
          Approval
        </h3>
        {approval?.status === "po_issued" ? (
          <p className="text-sm" style={{ color: "#0D5C3A" }}>
            <strong>PO {approval.po_number}</strong> issued
            {approval.po_issued_by ? ` by ${approval.po_issued_by}` : ""}
            {approval.po_issued_at
              ? ` on ${new Date(approval.po_issued_at).toLocaleDateString("en-GB")}`
              : ""}
            . This comparison is closed and locked.
          </p>
        ) : approval?.status === "approved" ? (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "#0D5C3A" }}>
              Approved by {approval.approved_by}
              {approval.approved_at
                ? ` on ${new Date(approval.approved_at).toLocaleDateString("en-GB")}`
                : ""}{" "}
              — awaiting PO. The award is locked; the approver can still revoke until the PO is
              issued.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium text-muted-foreground">
                PO number
                <input
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="e.g. PO-2026-001"
                  className="mt-1 block w-56 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
                />
              </label>
              <button
                onClick={handleIssuePo}
                disabled={issuingPo || !poNumber.trim()}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {issuingPo ? "Saving…" : "Mark PO Issued"}
              </button>
            </div>
          </div>
        ) : approval?.status === "pending_approval" ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Awaiting approval from Rabia. Email automation is pending — copy/send this single-use
              review link for now:
            </p>
            {approval.review_token && (
              <ShareableLink
                url={`${window.location.origin}/sr-comparison-review/${approval.review_token}`}
                state="manual"
              />
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {approval?.status === "returned" && approval.review_notes && (
              <div
                className="rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: "#FDF3E0", color: "#7A5200" }}
              >
                <strong>Returned by approver:</strong> {approval.review_notes}
              </div>
            )}
            <button
              onClick={handleSubmitApproval}
              disabled={submitting}
              className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {submitting ? "Submitting…" : "Submit for approval"}
            </button>
            <p className="text-xs text-muted-foreground">
              Award the lines and Save the evaluation above first.
            </p>
          </div>
        )}
      </div>

      {editing && (
        <EqualizeModal
          name={editing.name}
          current={eqs[key(editing.lineId, editing.vendorId)] ?? { adjustment_omr: 0, note: "" }}
          onClose={() => setEditing(null)}
          onSave={(entry) => {
            setEqs((prev) => ({ ...prev, [key(editing.lineId, editing.vendorId)]: entry }));
            setEditing(null);
          }}
        />
      )}

      {reopen && (
        <ReopenModal
          vendor={reopen}
          actor={user?.email ?? null}
          onClose={() => setReopen(null)}
          onDone={() => {
            setReopen(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function EqualizeModal({
  name,
  current,
  onClose,
  onSave,
}: {
  name: string;
  current: EqEntry;
  onClose: () => void;
  onSave: (entry: EqEntry) => void;
}) {
  const [value, setValue] = useState(String(current.adjustment_omr || ""));
  const [note, setNote] = useState(current.note);
  const num = value.trim() === "" ? 0 : Number(value);
  const invalid = Number.isNaN(num) || (num !== 0 && !note.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h3 className="font-display text-lg" style={{ color: "#0D5C3A" }}>
          Equalize — {name}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Add a budget for scope this vendor excluded so the line compares fairly. Negative to
          discount. The vendor’s raw quote is never changed.
        </p>
        <label className="mt-4 block text-xs font-medium text-muted-foreground">
          Equalization amount (OMR)
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => /^-?\d*(\.\d{0,3})?$/.test(e.target.value) && setValue(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-muted-foreground">
          Note (what it covers) {num !== 0 && <span className="text-destructive">*</span>}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
          />
        </label>
        <div className="mt-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-border py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ adjustment_omr: num, note: note.trim() })}
            disabled={invalid}
            className="flex-1 rounded-md py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--accent)" }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function ReopenModal({
  vendor,
  actor,
  onClose,
  onDone,
}: {
  vendor: SrCmpVendor;
  actor: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [until, setUntil] = useState(vendor.reopened_until ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!until) {
      toast.error("Pick a date to keep the link open until.");
      return;
    }
    setBusy(true);
    try {
      const res = await srBidReopen(vendor.bid_id, until, reason, actor ?? undefined);
      if (!res.ok) throw new Error(res.error || "Reopen failed");
      toast.success(`${vendor.company_name}'s link re-opened until ${until}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reopen failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h3 className="font-display text-lg" style={{ color: "#0D5C3A" }}>
          Re-open for negotiation — {vendor.company_name}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Re-enables this vendor’s quotation link past the deadline so they can revise their offer
          until the date you set.
        </p>
        <label className="mt-4 block text-xs font-medium text-muted-foreground">
          Keep open until
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-muted-foreground">
          Reason (optional)
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
          />
        </label>
        <div className="mt-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-border py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 rounded-md py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {busy ? "Re-opening…" : "Re-open link"}
          </button>
        </div>
      </div>
    </div>
  );
}
