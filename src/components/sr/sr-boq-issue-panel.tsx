import { useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  Loader2,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/integrations/supabase-external/auth";
import {
  parseBoqRemote,
  checkBoqService,
  getBoqServiceUrl,
  type ParsedBoq,
  type ParsedBoqRow,
} from "@/lib/boq-service";
import { useQueryClient } from "@tanstack/react-query";
import { srBoqIssue, type SrBoqColumn, type SrIssueLine } from "@/lib/sr-boq";

const PRICE_HINT = /rate|price|amount|total|value|budget|cost/i;
const HIDDEN_ROLES = new Set(["HEADER", "COLHEADER"]);
const BAND_ROLES = new Set(["SECTION", "NOTE", "TOTAL"]);

function toNum(s: string): number {
  return parseFloat((s || "").replace(/,/g, "").trim());
}

function detectRole(name: string, hidden: boolean): SrBoqColumn["role"] {
  if (hidden) return "internal";
  if (/desc/i.test(name)) return "desc";
  if (/qty|quantity/i.test(name)) return "qty";
  if (/unit|uom/i.test(name)) return "unit";
  return "data";
}

/**
 * Officer panel on the SR RFQ detail page: upload a BOQ → parse (external service) →
 * curate which columns the vendor sees → Lock (creates the sr_boq skeleton + makes the
 * per-vendor /sr-bid/<token> links live). Vendors are emailed their link from the Vendors
 * tab. Additive — uses the sr_* flow, doesn't touch the existing frame/rfq_items path.
 */
export function SrBoqIssuePanel({ rfqId, rfqReference }: { rfqId: string; rfqReference: string }) {
  const { user } = useAuth();
  const [loadingExisting, setLoadingExisting] = useState(true);
  const qc = useQueryClient();
  const [issuedBoqId, setIssuedBoqId] = useState<string | null>(null);

  const [health, setHealth] = useState<{ ok: boolean; keySet: boolean } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedBoq | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedBoqRow[]>([]);
  const [hiddenCols, setHiddenCols] = useState<Set<number>>(new Set());
  const [scope, setScope] = useState("");
  const [sourceKind, setSourceKind] = useState<string>("");
  const [sourceFile, setSourceFile] = useState<string>("");
  const [issuing, setIssuing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // On mount: is a BOQ already issued for this RFQ? + service health.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("sr_boq")
        .select("boq_id, status")
        .eq("rfq_id", rfqId)
        .eq("status", "issued")
        .order("issued_at", { ascending: false })
        .limit(1);
      if (data && data.length) setIssuedBoqId((data[0] as { boq_id: string }).boq_id);
      setLoadingExisting(false);
    })();
    checkBoqService(getBoqServiceUrl()).then(setHealth);
  }, [rfqId]);

  const processFile = async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "xlsx") {
      setError("Upload a .pdf or .xlsx BOQ.");
      return;
    }
    setParsing(true);
    setError(null);
    setParsed(null);
    try {
      const data = await parseBoqRemote(f, getBoqServiceUrl());
      const cols = data.columns.length ? data.columns : ["Col 1"];
      setParsed(data);
      setColumns(cols);
      setRows(
        data.rows
          .filter((r) => !HIDDEN_ROLES.has(r.role))
          .map((r) => ({ ...r, cells: [...r.cells] })),
      );
      setScope(data.scope || "");
      setSourceKind(ext);
      setSourceFile(f.name);
      const hc = new Set<number>();
      cols.forEach((c, i) => {
        if (PRICE_HINT.test(c)) hc.add(i);
      });
      setHiddenCols(hc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const updateCell = (rowIdx: number, colIdx: number, value: string) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== rowIdx) return r;
        const cells = [...r.cells];
        while (cells.length < columns.length) cells.push("");
        cells[colIdx] = value;
        return { ...r, cells };
      }),
    );
  };

  const descIdx = columns.findIndex((c) => /desc/i.test(c));
  const qtyIdx = columns.findIndex((c) => /qty|quantity/i.test(c));
  const unitIdx = columns.findIndex((c) => /unit|uom/i.test(c));
  const itemCount = rows.filter((r) => r.role === "ITEM").length;

  const handleIssue = async () => {
    if (!parsed) return;
    setIssuing(true);
    setError(null);
    const cols: SrBoqColumn[] = columns.map((name, i) => ({
      key: `c${i}`,
      name,
      visible: !hiddenCols.has(i),
      role: detectRole(name, hiddenCols.has(i)),
    }));
    const lines: SrIssueLine[] = rows.map((r, idx) => {
      let qty: number | null = null;
      if (r.role === "ITEM") {
        const n = toNum(r.cells[qtyIdx] || "");
        if (!Number.isNaN(n)) qty = n;
        else {
          const u = unitIdx >= 0 ? (r.cells[unitIdx] || "").toLowerCase() : "";
          if (/\b(ls|lump|lumpsum|lot|sum|item)\b/.test(u)) qty = 1;
        }
      }
      return { seq: idx + 1, role: r.role, cells: r.cells, incomplete: !!r.incomplete, qty };
    });
    try {
      const res = await srBoqIssue({
        rfq_id: rfqId,
        columns: cols,
        lines,
        scope,
        source_kind: sourceKind,
        source_filename: sourceFile,
        actor: user?.email ?? null,
      });
      if (res.ok) {
        setIssuedBoqId(res.boq_id);
        // Issuing the BOQ is the RFQ's go-live moment (vendor links work now). Mark the RFQ
        // 'issued' so the header badge + gating match the stepper (which already advances on
        // boqIssued), then refresh the detail page's queries.
        await supabase
          .from("rfqs")
          .update({ status: "issued" })
          .eq("rfq_id", rfqId)
          .eq("status", "draft");
        qc.invalidateQueries();
        toast.success("BOQ locked — invite vendors from the Vendors tab.");
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Issue failed");
    } finally {
      setIssuing(false);
    }
  };

  // ── Source-price leak (numeric only) ──
  const priceCols = columns.map((c, i) => (PRICE_HINT.test(c) ? i : -1)).filter((i) => i >= 0);
  const leak =
    priceCols.length > 0 &&
    rows.some(
      (r) =>
        r.role === "ITEM" &&
        priceCols.some((ci) => {
          const v = r.cells[ci] || "";
          if (!/\d/.test(v)) return false;
          const n = parseFloat(v.replace(/[^\d.]/g, ""));
          return !Number.isNaN(n) && n !== 0;
        }),
    );

  if (loadingExisting) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </CardContent>
      </Card>
    );
  }

  // ── Locked state ──
  if (issuedBoqId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 text-[var(--accent)]" /> BOQ locked — {rfqReference}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The BOQ is finalised and each invited vendor&apos;s quotation link is live. Go to the{" "}
            <strong>Vendors</strong> tab to email vendors their invitation. Links expire at the RFQ
            deadline; you can re-open one for negotiation from the comparison later.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Pre-issue: upload → curate → issue ──
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">Lock BOQ</CardTitle>
          {health && (
            <span className="flex items-center gap-1.5 text-xs">
              {health.ok ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)]" /> Parser online
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5 text-destructive" /> Parser unreachable
                </>
              )}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Locking finalises the BOQ and makes each vendor&apos;s quotation link go live. It does not
          send anything — you email vendors their link from the <strong>Vendors</strong> tab.
        </p>
        {!parsed ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) processFile(f);
            }}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition-colors"
            style={{ borderColor: dragging ? "var(--accent)" : "var(--border)" }}
          >
            {parsing ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Parsing… (vision model, ~20–60s)
              </div>
            ) : (
              <>
                <UploadCloud className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  Drag &amp; drop the BOQ (PDF or .xlsx)
                </p>
                <label className="mt-4 cursor-pointer">
                  <span
                    className="rounded-md px-4 py-2 text-sm font-semibold text-white"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    Browse File
                  </span>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) processFile(f);
                    }}
                  />
                </label>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-secondary px-3 py-1 font-medium">
                {itemCount} items
              </span>
              <span className="text-muted-foreground">from {sourceFile}</span>
              <button
                type="button"
                onClick={() => setParsed(null)}
                className="ml-auto text-xs underline"
                style={{ color: "var(--accent)" }}
              >
                Upload a different file
              </button>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Scope</span>
              <input
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>

            {parsed.issues.length > 0 && (
              <div
                className="rounded-lg border p-3 text-sm"
                style={{ borderColor: "#F59E0B", backgroundColor: "#FDF3E0", color: "#7A5200" }}
              >
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" /> Parser notes
                </div>
                <ul className="ml-5 list-disc space-y-0.5">
                  {parsed.issues.map((iss, i) => (
                    <li key={i}>{iss}</li>
                  ))}
                </ul>
              </div>
            )}

            {leak && (
              <div
                className="rounded-lg border p-3 text-sm"
                style={{ borderColor: "#DC2626", backgroundColor: "#FEF2F2", color: "#991B1B" }}
              >
                <AlertTriangle className="mr-1 inline h-4 w-4" /> Source contains prices in an
                internal column — those columns are hidden from the vendor (eye-toggle below to
                confirm).
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr className="text-left font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="w-8 px-2 py-2 text-center">#</th>
                    {columns.map((c, i) => {
                      const hidden = hiddenCols.has(i);
                      return (
                        <th key={i} className="px-2 py-2 align-bottom">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              title={
                                hidden
                                  ? "Hidden from vendor — click to show"
                                  : "Vendor sees this — click to hide"
                              }
                              onClick={() =>
                                setHiddenCols((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(i)) next.delete(i);
                                  else next.add(i);
                                  return next;
                                })
                              }
                              className="opacity-60 hover:opacity-100"
                            >
                              {hidden ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                            </button>
                            <span className={hidden ? "line-through opacity-50" : ""}>
                              {c || `Col ${i + 1}`}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rIdx) => {
                    const colCount = columns.length;
                    if (BAND_ROLES.has(row.role)) {
                      const text = row.cells.filter((c) => c.trim()).join(" ");
                      const st =
                        row.role === "SECTION"
                          ? { background: "#1B4332", color: "white" }
                          : {
                              background: "#FFF8E8",
                              color: "#5A4A00",
                              fontStyle: "italic" as const,
                            };
                      return (
                        <tr key={rIdx}>
                          <td className="px-2 py-1 text-center" style={st}>
                            {row.role[0]}
                          </td>
                          <td colSpan={colCount} className="px-2 py-1" style={st}>
                            {text || " "}
                          </td>
                        </tr>
                      );
                    }
                    const incomplete = row.role === "ITEM" && !!row.incomplete;
                    return (
                      <tr key={rIdx} className="border-t border-border">
                        <td
                          className="px-2 py-1 text-center font-mono text-[10px]"
                          style={{ color: incomplete ? "#B45309" : "var(--muted-foreground)" }}
                          title={
                            incomplete
                              ? "Code-only item — complete the description from drawings"
                              : undefined
                          }
                        >
                          {incomplete ? "!" : "•"}
                        </td>
                        {columns.map((_, cIdx) => {
                          const cell = row.cells[cIdx] ?? "";
                          const flagged = cell.includes("?") || (incomplete && cIdx === descIdx);
                          return (
                            <td key={cIdx} className="px-1 py-0.5 align-top">
                              {cIdx === descIdx ? (
                                <textarea
                                  value={cell}
                                  rows={2}
                                  onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                                  className="min-w-[320px] w-full resize-y rounded border px-1.5 py-1 leading-snug outline-none focus:border-[var(--accent)]"
                                  style={{
                                    borderColor: flagged ? "#F59E0B" : "var(--border)",
                                    backgroundColor: flagged ? "#FEF3C7" : "white",
                                  }}
                                />
                              ) : (
                                <input
                                  value={cell}
                                  onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                                  className="w-full rounded border px-1.5 py-1 outline-none focus:border-[var(--accent)]"
                                  style={{
                                    borderColor: flagged ? "#F59E0B" : "var(--border)",
                                    backgroundColor: flagged ? "#FEF3C7" : "white",
                                  }}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Eye-toggle internal columns (Budget/prices) so the vendor never sees them.
              </span>
              <Button
                type="button"
                onClick={handleIssue}
                disabled={issuing || itemCount === 0}
                className="gap-2 bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
              >
                {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Lock BOQ
              </Button>
            </div>
          </>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
      </CardContent>
    </Card>
  );
}
