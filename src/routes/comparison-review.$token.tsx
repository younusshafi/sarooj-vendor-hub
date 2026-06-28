import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  getComparisonByToken,
  decideComparison,
  type ComparisonReviewData,
} from "@/lib/comparison-approval";
import { fmtOmr as fmt } from "@/lib/omr";
import { notifyDecision } from "@/lib/notify";

export const Route = createFileRoute("/comparison-review/$token")({
  head: () => ({ meta: [{ title: "Comparison approval — Sarooj Construction Company" }] }),
  component: ReviewPage,
});

function ReviewPage() {
  const { token } = Route.useParams();
  const [data, setData] = useState<ComparisonReviewData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"approve" | "return" | "revoke" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setLoadError(false);
    getComparisonByToken(token)
      .then((d) => alive && setData(d))
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, [token]);

  // Compute per-line awards with equalized amounts
  const view = useMemo(() => {
    if (!data || !data.found) return null;
    const eqMap = new Map<string, number>();
    for (const e of data.equalizations)
      eqMap.set(`${e.rfq_item_id}::${e.vendor_id}`, e.equalization_omr);
    const rows = data.awards.map((a) => {
      const item = data.items.find((i) => i.rfq_item_id === a.rfq_item_id);
      const bid = data.bids.find((b) => b.vendor_id === a.awarded_vendor_id);
      const line = bid?.lines.find((l) => l.rfq_item_id === a.rfq_item_id);
      const qty = line?.quantity_offered ?? item?.quantity ?? 0;
      const rate = line?.unit_price_omr ?? null;
      const eq = eqMap.get(`${a.rfq_item_id}::${a.awarded_vendor_id}`) ?? 0;
      const equalized = rate != null ? rate * qty + eq : null;
      return {
        item_id: a.rfq_item_id,
        sap: item?.sap_item_number ?? item?.item_number ?? "",
        description: item?.description ?? "",
        qty,
        vendor: bid?.vendor_name ?? "—",
        rate,
        equalized,
        reason: a.reason ?? "",
      };
    });
    const split: Record<string, { name: string; lines: number; total: number }> = {};
    for (const r of rows) {
      if (r.equalized == null) continue;
      if (!split[r.vendor]) split[r.vendor] = { name: r.vendor, lines: 0, total: 0 };
      split[r.vendor].lines += 1;
      split[r.vendor].total += r.equalized;
    }
    const grand = Object.values(split).reduce((s, v) => s + v.total, 0);
    return { rows, split, grand };
  }, [data]);

  const decide = async (decision: "approve" | "return" | "revoke") => {
    setErr(null);
    if ((decision === "return" || decision === "revoke") && !notes.trim()) {
      setErr("Please add a note explaining the reason.");
      return;
    }
    setBusy(true);
    try {
      const res = await decideComparison(token, decision, notes);
      if (res.ok) {
        setDone(decision);
        if (data && data.found) {
          notifyDecision({
            to: data.prepared_by,
            rfqReference: data.rfq.rfq_reference,
            decision,
            notes,
          });
        }
      } else setErr(res.error ?? "Action failed");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" data-theme="charcoal">
      <header className="w-full bg-header text-header-foreground">
        <div className="mx-auto flex h-16 max-w-[1000px] items-center justify-between px-6 md:px-10">
          <span className="font-serif text-[20px] leading-none">Sarooj Construction Company</span>
          <span className="text-[13px]" style={{ color: "var(--sidebar-foreground)" }}>
            Comparison Approval
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-4 py-8 md:px-8">
        {data === null && !loadError && (
          <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        )}

        {loadError && (
          <Card icon="error" title="Something went wrong">
            Please try the link again, or contact procurement.
          </Card>
        )}

        {data && !data.found && (
          <Card icon="error" title="This review link is no longer active">
            It may have already been decided, or the comparison moved to another stage.
          </Card>
        )}

        {done && (
          <Card
            icon="ok"
            title={
              done === "approve"
                ? "Approved"
                : done === "revoke"
                  ? "Approval revoked"
                  : "Returned to officer"
            }
          >
            {done === "approve"
              ? "The comparison is approved and awaiting the PO. You can revoke from this link until the PO is issued."
              : done === "revoke"
                ? "Your approval has been revoked and sent back to the procurement officer."
                : "Your comments have been sent back to the procurement officer."}
          </Card>
        )}

        {data?.found && !done && view && (
          <>
            <div className="mb-6 rounded-xl border border-border bg-card p-6">
              <h1 className="font-serif text-[24px] leading-tight text-foreground">
                {data.rfq.rfq_reference} — {data.rfq.title}
              </h1>
              <p className="mt-1 text-[14px] text-muted-foreground">
                {data.rfq.project_name ?? ""}
                {data.prepared_by ? ` · prepared by ${data.prepared_by}` : ""}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Proposed award (equalized)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[12px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Description</th>
                      <th className="py-2 pr-3 text-right">Qty</th>
                      <th className="py-2 pr-3">Awarded vendor</th>
                      <th className="py-2 pr-3 text-right">Unit rate</th>
                      <th className="py-2 pr-3 text-right">Equalized amount</th>
                      <th className="py-2">Reason (if not lowest)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.map((r) => (
                      <tr key={r.item_id} className="border-t border-border align-top">
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{String(r.sap)}</td>
                        <td className="py-2 pr-3">{r.description}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{r.qty}</td>
                        <td className="py-2 pr-3 font-medium">{r.vendor}</td>
                        <td className="py-2 pr-3 text-right font-mono text-xs">
                          {r.rate == null ? "NQ" : fmt(r.rate)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs">
                          {r.equalized == null ? "NQ" : fmt(r.equalized)}
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap gap-3">
                  {Object.values(view.split).map((s) => (
                    <div key={s.name} className="rounded-lg border border-border px-4 py-2">
                      <div className="text-sm font-medium" style={{ color: "#1A3A5C" }}>
                        {s.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.lines} line{s.lines !== 1 ? "s" : ""} · {fmt(s.total)} OMR
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total (equalized)
                  </div>
                  <div className="text-xl font-bold" style={{ color: "#1A3A5C" }}>
                    {fmt(view.grand)} OMR
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    * Amounts in OMR, 3 decimals (baisa)
                  </div>
                </div>
              </div>

              {data.decision_notes && (
                <div className="mt-4 rounded-lg bg-secondary px-3 py-2 text-sm">
                  <strong>Officer notes:</strong> {data.decision_notes}
                </div>
              )}
            </div>

            {/* Decision panel */}
            <div className="mt-6 rounded-xl border border-border bg-card p-6">
              {data.status === "approved" && (
                <p className="mb-3 text-sm" style={{ color: "#0D5C3A" }}>
                  You approved this comparison — it is awaiting the PO. You can still{" "}
                  <strong>revoke</strong> it until the officer issues the PO.
                </p>
              )}
              <label className="text-sm font-medium text-foreground">
                Comments{" "}
                <span className="text-muted-foreground">
                  ({data.status === "approved" ? "required to revoke" : "required to return"})
                </span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
              />
              {err && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" /> {err}
                </p>
              )}
              {data.status === "approved" ? (
                <div className="mt-4">
                  <button
                    onClick={() => decide("revoke")}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ backgroundColor: "#991B1B" }}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Revoke approval
                  </button>
                </div>
              ) : (
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => decide("return")}
                    disabled={busy}
                    className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    Return for revision
                  </button>
                  <button
                    onClick={() => decide("approve")}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Approve & lock
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Card({
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
