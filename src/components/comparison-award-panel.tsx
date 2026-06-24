import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Save, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  loadComparisonEval,
  saveComparisonEval,
  COMPARISON_EVAL_STUBBED,
  type ComparisonEval,
} from "@/lib/comparison-eval";

// Loose row types — the comparison route passes Supabase rows as `any`.
/* eslint-disable @typescript-eslint/no-explicit-any */

const GREEN_BG = "#E0F2EA";
const GREEN_FG = "#0D5C3A";

const key = (itemId: string, vendorId: string) => `${itemId}::${vendorId}`;
const fmt = (n: number) =>
  n.toLocaleString("en", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

interface EqEntry {
  equalization_omr: number;
  note: string;
}

export function ComparisonAwardPanel({
  comparisonId,
  rfqItems,
  bids,
  locked = false,
}: {
  comparisonId: string;
  rfqItems: any[];
  bids: any[];
  locked?: boolean;
}) {
  const [eqs, setEqs] = useState<Record<string, EqEntry>>({});
  const [awards, setAwards] = useState<Record<string, { vendor_id: string; reason: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ itemId: string; vendorId: string; name: string } | null>(
    null,
  );

  // Load saved evaluation
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadComparisonEval(comparisonId)
      .then((data) => {
        if (!alive) return;
        const e: Record<string, EqEntry> = {};
        for (const x of data.equalizations)
          e[key(x.rfq_item_id, x.vendor_id)] = {
            equalization_omr: x.equalization_omr,
            note: x.note,
          };
        const a: Record<string, { vendor_id: string; reason: string }> = {};
        for (const x of data.awards)
          a[x.rfq_item_id] = { vendor_id: x.awarded_vendor_id, reason: x.reason };
        setEqs(e);
        setAwards(a);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [comparisonId]);

  const rateFor = useCallback((bid: any, item: any): number | null => {
    const bi = bid.bid_items?.find((x: any) => x.rfq_item_id === item.item_id);
    return bi?.unit_price_omr ?? null;
  }, []);

  // Per-item computed rows (equalized amounts + lowest)
  const perItem = useMemo(() => {
    return rfqItems.map((item) => {
      const qty = item.quantity ?? 0;
      const cells = bids.map((b) => {
        const rate = rateFor(b, item);
        const eq = eqs[key(item.item_id, b.vendor_id)]?.equalization_omr ?? 0;
        const raw = rate != null ? rate * qty : null;
        const equalized = raw != null ? raw + eq : null;
        return {
          vendorId: b.vendor_id,
          bidId: b.bid_id,
          name: b.vendors?.company_name ?? "Vendor",
          rate,
          eq,
          raw,
          equalized,
        };
      });
      const quoted = cells.filter((c) => c.equalized != null);
      const lowest = quoted.length
        ? quoted.reduce((m, c) => (c.equalized! < m.equalized! ? c : m))
        : null;
      const awardedVendor = awards[item.item_id]?.vendor_id ?? lowest?.vendorId ?? "";
      return { item, qty, cells, lowestVendorId: lowest?.vendorId ?? null, awardedVendor };
    });
  }, [rfqItems, bids, eqs, awards, rateFor]);

  // Split summary: vendor → { lines, total (equalized) }
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

  const setAward = (itemId: string, vendorId: string) =>
    setAwards((prev) => ({
      ...prev,
      [itemId]: { vendor_id: vendorId, reason: prev[itemId]?.reason ?? "" },
    }));
  const setReason = (itemId: string, reason: string) =>
    setAwards((prev) => ({
      ...prev,
      [itemId]: { vendor_id: prev[itemId]?.vendor_id ?? "", reason },
    }));

  const handleSave = async () => {
    // Validation: equalization with a value needs a note; non-lowest award needs a reason.
    for (const [k, v] of Object.entries(eqs)) {
      if (v.equalization_omr !== 0 && !v.note.trim()) {
        toast.error("Every equalization needs a note explaining what it covers.");
        return;
      }
      void k;
    }
    for (const row of perItem) {
      if (row.lowestVendorId && row.awardedVendor && row.awardedVendor !== row.lowestVendorId) {
        if (!awards[row.item.item_id]?.reason?.trim()) {
          toast.error(
            `Line ${row.item.item_number ?? ""}: a reason is required when not awarding the lowest.`,
          );
          return;
        }
      }
    }
    setSaving(true);
    const data: ComparisonEval = {
      equalizations: Object.entries(eqs)
        .filter(([, v]) => v.equalization_omr !== 0 || v.note.trim())
        .map(([k, v]) => {
          const [rfq_item_id, vendor_id] = k.split("::");
          return { rfq_item_id, vendor_id, equalization_omr: v.equalization_omr, note: v.note };
        }),
      awards: perItem
        .filter((r) => r.awardedVendor)
        .map((r) => {
          const cell = r.cells.find((c) => c.vendorId === r.awardedVendor);
          return {
            rfq_item_id: r.item.item_id,
            awarded_vendor_id: r.awardedVendor,
            awarded_bid_id: cell?.bidId ?? "",
            reason: awards[r.item.item_id]?.reason ?? "",
          };
        }),
    };
    try {
      await saveComparisonEval(comparisonId, data);
      toast.success("Evaluation saved");
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-display text-lg" style={{ color: "#1A3A5C" }}>
          Per-line award & equalization
        </h3>
        {locked ? (
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: "#E0F2EA", color: "#0D5C3A" }}
          >
            Approved — locked
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
        Lowest <span style={{ color: GREEN_FG }}>equalized</span> amount is highlighted. Add an
        equalization to a vendor’s line to budget for an exclusion noted in their remark; award each
        line to a vendor (default = lowest equalized).
        {COMPARISON_EVAL_STUBBED && " — DEMO: not yet persisted to backend."}
        <span className="block">* All amounts in OMR, shown to 3 decimals (baisa).</span>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-[12px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2 text-right">Qty</th>
              {bids.map((b) => (
                <th key={b.bid_id} className="px-2 py-2 text-right">
                  {b.vendors?.company_name ?? "Vendor"}
                </th>
              ))}
              <th className="px-2 py-2">Award</th>
            </tr>
          </thead>
          <tbody>
            {perItem.map((row) => {
              const nonLowest =
                row.lowestVendorId && row.awardedVendor && row.awardedVendor !== row.lowestVendorId;
              return (
                <tr key={row.item.item_id} className="border-t border-border align-top">
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {row.item.sap_item_number || row.item.item_number}
                  </td>
                  <td className="px-2 py-2">{row.item.description}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.qty}</td>
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
                                    itemId: row.item.item_id,
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
                      </td>
                    );
                  })}
                  <td className="px-2 py-2">
                    <select
                      value={row.awardedVendor}
                      disabled={locked}
                      onChange={(e) => setAward(row.item.item_id, e.target.value)}
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
                        value={awards[row.item.item_id]?.reason ?? ""}
                        disabled={locked}
                        onChange={(e) => setReason(row.item.item_id, e.target.value)}
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

      {/* Split summary */}
      <div className="mt-5">
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Trophy className="h-3.5 w-3.5" /> PO split (equalized)
        </h4>
        {Object.keys(split).length === 0 ? (
          <p className="text-sm text-muted-foreground">No lines awarded yet.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {Object.entries(split).map(([vid, s]) => (
              <div key={vid} className="rounded-lg border border-border px-4 py-2">
                <div className="text-sm font-medium" style={{ color: "#1A3A5C" }}>
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

      {editing && (
        <EqualizeModal
          name={editing.name}
          current={eqs[key(editing.itemId, editing.vendorId)] ?? { equalization_omr: 0, note: "" }}
          onClose={() => setEditing(null)}
          onSave={(entry) => {
            setEqs((prev) => ({ ...prev, [key(editing.itemId, editing.vendorId)]: entry }));
            setEditing(null);
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
  const [value, setValue] = useState(String(current.equalization_omr || ""));
  const [note, setNote] = useState(current.note);
  const num = value.trim() === "" ? 0 : Number(value);
  const invalid = Number.isNaN(num) || (num !== 0 && !note.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h3 className="font-display text-lg" style={{ color: "#1A3A5C" }}>
          Equalize — {name}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Add a budget for scope this vendor excluded, so the line compares fairly. Use a negative
          value to discount. The vendor’s raw quote is never changed.
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
            onClick={() => onSave({ equalization_omr: num, note: note.trim() })}
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
