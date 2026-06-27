import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  UploadCloud,
  Loader2,
  X,
  Plus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  FileCode,
  Table2,
  Users,
} from "lucide-react";
import {
  parseBoqRemote,
  checkBoqService,
  getBoqServiceUrl,
  setBoqServiceUrl,
  type ParsedBoq,
  type ParsedBoqRow,
} from "@/lib/boq-service";

export const Route = createFileRoute("/_app/boq-tester")({
  component: BoqTesterPage,
});

// Columns whose values are internal or price-bearing and must not reach a vendor.
const PRICE_HINT = /rate|price|amount|total|value|budget|cost/i;

// Roles that render as full-width bands rather than per-column cells.
const BAND_ROLES = new Set(["SECTION", "NOTE", "TOTAL"]);
// Roles hidden from the editable table (title block + column header).
const HIDDEN_ROLES = new Set(["HEADER", "COLHEADER"]);

type ViewMode = "table" | "vendor" | "html";

interface EditableState {
  rfqRef: string;
  projectTitle: string;
  scope: string;
  columns: string[];
  rows: ParsedBoqRow[];
}

// OMR is 3 decimals (baisa).
function fmtOmr(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function toNum(s: string): number {
  return parseFloat((s || "").replace(/,/g, "").trim());
}

function pad(cells: string[], n: number): string[] {
  const out = cells.slice(0, n);
  while (out.length < n) out.push("");
  return out;
}

// A source "price" worth warning about is an actual NUMBER (e.g. "32,000.00"),
// not a text annotation like "Rate Only" — which is a legitimate BOQ instruction
// the vendor should still see. Only numeric values get flagged for blanking.
function looksLikePrice(s: string): boolean {
  if (!/\d/.test(s)) return false;
  const cleaned = s.replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned);
  // A real leaked price is a non-zero number; "0" / blank amount columns don't count.
  return cleaned !== "" && !Number.isNaN(n) && n !== 0;
}

function BoqTesterPage() {
  const [serviceUrl, setUrl] = useState(getBoqServiceUrl());
  const [health, setHealth] = useState<{ ok: boolean; keySet: boolean } | null>(null);
  const [checking, setChecking] = useState(false);

  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedBoq | null>(null);
  const [edit, setEdit] = useState<EditableState | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  // Columns hidden from the vendor (internal/price). Officer can override.
  const [hiddenCols, setHiddenCols] = useState<Set<number>>(new Set());
  // Vendor-entered unit rate + remark, keyed by row index (sandbox preview only).
  const [rates, setRates] = useState<Record<number, string>>({});
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const runHealth = async () => {
    setChecking(true);
    const h = await checkBoqService(serviceUrl);
    setHealth(h);
    setChecking(false);
  };

  // Check health on mount and whenever the URL is committed.
  useEffect(() => {
    runHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processFile = async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "xlsx") {
      setError("Upload a .pdf or .xlsx file (legacy .xls is not supported).");
      return;
    }
    setParsing(true);
    setError(null);
    setResult(null);
    setEdit(null);
    setViewMode("table");
    setRates({});
    setRemarks({});
    try {
      const data = await parseBoqRemote(f, serviceUrl);
      const columns = data.columns.length ? data.columns : ["Col 1"];
      setResult(data);
      setEdit({
        rfqRef: data.rfq_ref,
        projectTitle: data.project_title,
        scope: data.scope,
        columns,
        rows: data.rows
          .filter((r) => !HIDDEN_ROLES.has(r.role))
          .map((r) => ({ ...r, cells: [...r.cells] })),
      });
      // Default-hide internal/price columns from the vendor (officer can override).
      const hc = new Set<number>();
      columns.forEach((c, i) => {
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
    setEdit((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((r, i) => {
        if (i !== rowIdx) return r;
        const cells = pad(r.cells, prev.columns.length);
        cells[colIdx] = value;
        return { ...r, cells };
      });
      return { ...prev, rows };
    });
  };

  const updateBandText = (rowIdx: number, value: string) => {
    setEdit((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((r, i) => (i === rowIdx ? { ...r, cells: [value] } : r));
      return { ...prev, rows };
    });
  };

  const deleteRow = (rowIdx: number) => {
    setEdit((prev) => (prev ? { ...prev, rows: prev.rows.filter((_, i) => i !== rowIdx) } : prev));
  };

  const addItemAfter = (rowIdx: number) => {
    setEdit((prev) => {
      if (!prev) return prev;
      const blank: ParsedBoqRow = {
        row_num: -1,
        role: "ITEM",
        cells: new Array(prev.columns.length).fill(""),
      };
      const rows = [...prev.rows];
      rows.splice(rowIdx + 1, 0, blank);
      return { ...prev, rows };
    });
  };

  // ── Source-price leak detection (HITL warning) ──
  const priceCols = edit
    ? edit.columns.map((c, i) => (PRICE_HINT.test(c) ? i : -1)).filter((i) => i >= 0)
    : [];
  const sourcePricesPresent =
    edit !== null &&
    priceCols.length > 0 &&
    edit.rows.some(
      (r) => r.role === "ITEM" && priceCols.some((ci) => looksLikePrice(r.cells[ci] || "")),
    );

  const itemCount = edit ? edit.rows.filter((r) => r.role === "ITEM").length : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">BOQ Parser — Test Workbench</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Private sandbox. Uploads a BOQ to the external parser service and shows the parsed result
          as an editable table. Nothing here is saved — no database, no n8n, no RFQ.
        </p>
      </div>

      {/* Service config + health */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parser Service</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[280px]">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Service URL
              </label>
              <input
                value={serviceUrl}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => setBoqServiceUrl(serviceUrl)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                placeholder="http://localhost:8001"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBoqServiceUrl(serviceUrl);
                runHealth();
              }}
              disabled={checking}
              className="gap-2"
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Check
            </Button>
            {health && (
              <div className="flex items-center gap-2 text-sm">
                {health.ok ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-[var(--accent)]" />
                    <span className="text-foreground">
                      Online{health.keySet ? "" : " (no OpenAI key!)"}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive">Unreachable</span>
                  </>
                )}
              </div>
            )}
          </div>
          {health && !health.ok && (
            <p className="text-xs text-muted-foreground">
              Can&apos;t reach the service. If testing locally, open the SSH tunnel:{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                ssh -L 8001:127.0.0.1:8001 root@31.97.233.41
              </code>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload BOQ (PDF or Excel)</CardTitle>
        </CardHeader>
        <CardContent>
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
            style={{
              borderColor: dragging ? "var(--accent)" : "var(--border)",
              backgroundColor: dragging ? "oklch(0.95 0.02 165)" : "transparent",
            }}
          >
            {parsing ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Parsing… (vision model, ~20–60s)
              </div>
            ) : (
              <>
                <UploadCloud className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  Drag &amp; drop a BOQ (PDF or .xlsx)
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

          {error && (
            <div className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Result */}
      {result && edit && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Parsed Result — {result.filename}</CardTitle>
              <div className="inline-flex rounded-md border border-border">
                {(
                  [
                    ["table", "Officer table", Table2],
                    ["vendor", "Vendor view", Users],
                    ["html", "RFQ document", FileCode],
                  ] as const
                ).map(([mode, label, Icon]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                      viewMode === mode
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-foreground hover:bg-secondary"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Counts */}
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                ["Items", result.counts.items],
                ["Sections", result.counts.sections],
                ["Notes", result.counts.notes],
                ["Total rows", result.counts.total_rows],
              ].map(([label, n]) => (
                <span
                  key={label}
                  className="rounded-full bg-secondary px-3 py-1 font-medium text-foreground"
                >
                  {label}: {n}
                </span>
              ))}
            </div>

            {/* Parser issues */}
            {result.issues.length > 0 && (
              <div
                className="rounded-lg border p-3 text-sm"
                style={{ borderColor: "#F59E0B", backgroundColor: "#FDF3E0", color: "#7A5200" }}
              >
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" /> Parser notes ({result.issues.length})
                </div>
                <ul className="ml-5 list-disc space-y-0.5">
                  {result.issues.map((iss, i) => (
                    <li key={i}>{iss}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Source-price leak warning */}
            {sourcePricesPresent && (
              <div
                className="rounded-lg border p-3 text-sm"
                style={{ borderColor: "#DC2626", backgroundColor: "#FEF2F2", color: "#991B1B" }}
              >
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" /> Source already contains prices
                </div>
                <p className="mt-1">
                  Column(s) {priceCols.map((i) => `"${edit.columns[i]}"`).join(", ")} hold values
                  from the original document. These must be cleared before this RFQ goes to vendors
                  (auto-blanking will be added later).
                </p>
              </div>
            )}

            {viewMode === "html" ? (
              <iframe
                title="RFQ preview"
                srcDoc={result.html}
                className="h-[800px] w-full rounded-md border border-border bg-white"
              />
            ) : viewMode === "vendor" ? (
              <VendorView
                edit={edit}
                hiddenCols={hiddenCols}
                rates={rates}
                remarks={remarks}
                onRate={(i, v) => setRates((p) => ({ ...p, [i]: v }))}
                onRemark={(i, v) => setRemarks((p) => ({ ...p, [i]: v }))}
              />
            ) : (
              <>
                {/* Editable project info */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <LabeledInput
                    label="RFQ Ref"
                    value={edit.rfqRef}
                    onChange={(v) => setEdit((p) => (p ? { ...p, rfqRef: v } : p))}
                  />
                  <LabeledInput
                    label="Project Title"
                    value={edit.projectTitle}
                    onChange={(v) => setEdit((p) => (p ? { ...p, projectTitle: v } : p))}
                  />
                  <LabeledInput
                    label="Scope"
                    value={edit.scope}
                    onChange={(v) => setEdit((p) => (p ? { ...p, scope: v } : p))}
                  />
                </div>

                {/* Editable BOQ table */}
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr className="text-left font-semibold uppercase tracking-wider text-muted-foreground">
                        <th className="w-10 px-2 py-2 text-center">#</th>
                        {edit.columns.map((c, i) => {
                          const hidden = hiddenCols.has(i);
                          return (
                            <th key={i} className="px-2 py-2 align-bottom">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  title={
                                    hidden
                                      ? "Hidden from vendor (internal) — click to show"
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
                        <th className="w-16 px-2 py-2 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {edit.rows.map((row, rIdx) => {
                        const isBand = BAND_ROLES.has(row.role);
                        const colCount = edit.columns.length;
                        if (isBand) {
                          const bandText = row.cells.filter((c) => c.trim()).join(" ");
                          const bandStyle =
                            row.role === "SECTION"
                              ? { background: "#1B4332", color: "white" }
                              : row.role === "TOTAL"
                                ? { background: "#F4F4F4", fontWeight: 600 }
                                : { background: "#FFF8E8", color: "#5A4A00", fontStyle: "italic" };
                          return (
                            <tr key={rIdx} className="border-t border-border">
                              <td
                                className="px-2 py-1 text-center font-mono text-[10px]"
                                style={bandStyle}
                              >
                                {row.role[0]}
                              </td>
                              <td colSpan={colCount} className="px-2 py-1" style={bandStyle}>
                                <input
                                  value={bandText}
                                  onChange={(e) => updateBandText(rIdx, e.target.value)}
                                  className="w-full bg-transparent px-1 py-0.5 outline-none"
                                  style={{ color: "inherit" }}
                                />
                              </td>
                              <td className="px-2 py-1 text-center" style={bandStyle}>
                                <RowActions
                                  onAdd={() => addItemAfter(rIdx)}
                                  onDelete={() => deleteRow(rIdx)}
                                />
                              </td>
                            </tr>
                          );
                        }
                        const cells = pad(row.cells, colCount);
                        const incomplete = row.role === "ITEM" && !!row.incomplete;
                        // Highlight the description column when incomplete (found by name).
                        const descIdx = edit.columns.findIndex((c) => /desc/i.test(c));
                        return (
                          <tr key={rIdx} className="border-t border-border hover:bg-secondary/30">
                            <td
                              className="px-2 py-1 text-center font-mono text-[10px]"
                              style={{ color: incomplete ? "#B45309" : "var(--muted-foreground)" }}
                              title={
                                incomplete
                                  ? "Code-only item — description must be completed from the drawings"
                                  : undefined
                              }
                            >
                              {incomplete ? "!" : row.role === "ITEM" ? "•" : row.role[0]}
                            </td>
                            {cells.map((cell, cIdx) => {
                              const flagged =
                                cell.includes("?") || (incomplete && cIdx === descIdx);
                              return (
                                <td key={cIdx} className="px-1 py-0.5">
                                  <input
                                    value={cell}
                                    onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                                    className="w-full rounded border px-1.5 py-1 outline-none focus:border-[var(--accent)]"
                                    style={{
                                      borderColor: flagged ? "#F59E0B" : "var(--border)",
                                      backgroundColor: flagged ? "#FEF3C7" : "white",
                                    }}
                                  />
                                </td>
                              );
                            })}
                            <td className="px-2 py-1 text-center">
                              <RowActions
                                onAdd={() => addItemAfter(rIdx)}
                                onDelete={() => deleteRow(rIdx)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {itemCount} item row{itemCount === 1 ? "" : "s"} after edits ·{" "}
                    {edit.rows.length} total rows shown
                  </span>
                  <span className="italic">
                    Toggle the eye icons to set what the vendor sees · amber cells contain
                    &quot;?&quot; (illegible source — verify).
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function VendorView({
  edit,
  hiddenCols,
  rates,
  remarks,
  onRate,
  onRemark,
}: {
  edit: EditableState;
  hiddenCols: Set<number>;
  rates: Record<number, string>;
  remarks: Record<number, string>;
  onRate: (rowIdx: number, v: string) => void;
  onRemark: (rowIdx: number, v: string) => void;
}) {
  const visible = edit.columns.map((c, i) => ({ c, i })).filter(({ i }) => !hiddenCols.has(i));
  const qtyIdx = edit.columns.findIndex((c) => /qty|quantity/i.test(c));
  const unitIdx = edit.columns.findIndex((c) => /unit|uom/i.test(c));

  const rowQty = (row: ParsedBoqRow): number | null => {
    if (qtyIdx >= 0) {
      const n = toNum(row.cells[qtyIdx] || "");
      if (!Number.isNaN(n)) return n;
    }
    // lump-sum item → quantity 1 so Amount = Rate
    const unit = unitIdx >= 0 ? (row.cells[unitIdx] || "").toLowerCase() : "";
    if (/\b(ls|lump|lumpsum|lot|sum|item)\b/.test(unit)) return 1;
    return null;
  };

  const amountOf = (rowIdx: number, row: ParsedBoqRow): number | null => {
    const q = rowQty(row);
    const r = toNum(rates[rowIdx] || "");
    if (q === null || Number.isNaN(r)) return null;
    return q * r;
  };

  let grand = 0;
  edit.rows.forEach((row, i) => {
    if (row.role === "ITEM") {
      const a = amountOf(i, row);
      if (a !== null) grand += a;
    }
  });

  const totalCols = visible.length + 4; // # + visible + Rate + Amount + Remark

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
        This is what the <strong className="text-foreground">vendor</strong> sees. Internal/price
        columns are hidden (toggle them on the Officer table). The vendor enters a{" "}
        <strong className="text-foreground">Unit Rate</strong> only — the line{" "}
        <strong className="text-foreground">Amount</strong> and the{" "}
        <strong className="text-foreground">Grand Total</strong> calculate automatically. The{" "}
        <strong className="text-foreground">Vendor Remark</strong> captures exclusions /
        clarifications (these feed equalization at comparison).
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr className="text-left font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="w-10 px-2 py-2 text-center">#</th>
              {visible.map(({ c, i }) => (
                <th key={i} className="px-2 py-2">
                  {c || `Col ${i + 1}`}
                </th>
              ))}
              <th className="w-28 px-2 py-2 text-right">Unit Rate (RO)</th>
              <th className="w-28 px-2 py-2 text-right">Amount (RO)</th>
              <th className="px-2 py-2" style={{ minWidth: 160 }}>
                Vendor Remark
              </th>
            </tr>
          </thead>
          <tbody>
            {edit.rows.map((row, rIdx) => {
              if (BAND_ROLES.has(row.role)) {
                const bandText = row.cells.filter((c) => c.trim()).join(" ");
                const bandStyle =
                  row.role === "SECTION"
                    ? { background: "#1B4332", color: "white" }
                    : row.role === "TOTAL"
                      ? { background: "#F4F4F4", fontWeight: 600 }
                      : { background: "#FFF8E8", color: "#5A4A00", fontStyle: "italic" };
                return (
                  <tr key={rIdx} className="border-t border-border">
                    <td colSpan={totalCols} className="px-2 py-1" style={bandStyle}>
                      {bandText || " "}
                    </td>
                  </tr>
                );
              }
              const cells = pad(row.cells, edit.columns.length);
              const amt = amountOf(rIdx, row);
              return (
                <tr key={rIdx} className="border-t border-border">
                  <td className="px-2 py-1 text-center font-mono text-[10px] text-muted-foreground">
                    •
                  </td>
                  {visible.map(({ i }) => (
                    <td key={i} className="px-2 py-1">
                      {cells[i]}
                    </td>
                  ))}
                  <td className="px-1 py-0.5">
                    <input
                      inputMode="decimal"
                      value={rates[rIdx] ?? ""}
                      onChange={(e) => onRate(rIdx, e.target.value)}
                      placeholder="0.000"
                      className="w-full rounded border border-border bg-white px-1.5 py-1 text-right outline-none focus:border-[var(--accent)]"
                    />
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                    {amt === null ? "—" : fmtOmr(amt)}
                  </td>
                  <td className="px-1 py-0.5">
                    <input
                      value={remarks[rIdx] ?? ""}
                      onChange={(e) => onRemark(rIdx, e.target.value)}
                      placeholder="e.g. excludes scaffolding"
                      className="w-full rounded border border-border bg-white px-1.5 py-1 outline-none focus:border-[var(--accent)]"
                    />
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-border" style={{ background: "#E0EAE5" }}>
              <td colSpan={visible.length + 2} className="px-2 py-2 text-right font-semibold">
                GRAND TOTAL (RO) — excl. VAT
              </td>
              <td className="px-2 py-2 text-right font-bold tabular-nums">{fmtOmr(grand)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
      />
    </div>
  );
}

function RowActions({ onAdd, onDelete }: { onAdd: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={onAdd}
        title="Add item row below"
        className="rounded p-0.5 opacity-60 hover:opacity-100"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Delete this row"
        className="rounded p-0.5 opacity-60 hover:text-destructive hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
