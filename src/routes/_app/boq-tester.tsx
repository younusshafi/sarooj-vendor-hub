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
  FileCode,
} from "lucide-react";
import {
  parseBoqPdfRemote,
  checkBoqService,
  getBoqServiceUrl,
  setBoqServiceUrl,
  type ParsedBoq,
  type ParsedBoqRow,
} from "@/lib/boq-service";

export const Route = createFileRoute("/_app/boq-tester")({
  component: BoqTesterPage,
});

const PRICE_HINT = /rate|price|amount|total|value/i;

// Roles that render as full-width bands rather than per-column cells.
const BAND_ROLES = new Set(["SECTION", "NOTE", "TOTAL"]);
// Roles hidden from the editable table (title block + column header).
const HIDDEN_ROLES = new Set(["HEADER", "COLHEADER"]);

interface EditableState {
  rfqRef: string;
  projectTitle: string;
  scope: string;
  columns: string[];
  rows: ParsedBoqRow[];
}

function pad(cells: string[], n: number): string[] {
  const out = cells.slice(0, n);
  while (out.length < n) out.push("");
  return out;
}

function BoqTesterPage() {
  const [serviceUrl, setUrl] = useState(getBoqServiceUrl());
  const [health, setHealth] = useState<{ ok: boolean; keySet: boolean } | null>(null);
  const [checking, setChecking] = useState(false);

  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedBoq | null>(null);
  const [edit, setEdit] = useState<EditableState | null>(null);
  const [showHtml, setShowHtml] = useState(false);
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
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("This tester accepts .pdf only for now (Excel comes later).");
      return;
    }
    setParsing(true);
    setError(null);
    setResult(null);
    setEdit(null);
    setShowHtml(false);
    try {
      const data = await parseBoqPdfRemote(f, serviceUrl);
      setResult(data);
      setEdit({
        rfqRef: data.rfq_ref,
        projectTitle: data.project_title,
        scope: data.scope,
        columns: data.columns.length ? data.columns : ["Col 1"],
        rows: data.rows
          .filter((r) => !HIDDEN_ROLES.has(r.role))
          .map((r) => ({ ...r, cells: [...r.cells] })),
      });
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
      (r) => r.role === "ITEM" && priceCols.some((ci) => (r.cells[ci] || "").trim() !== ""),
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
          <CardTitle className="text-base">Upload BOQ (PDF)</CardTitle>
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
                <p className="text-sm font-medium text-foreground">Drag &amp; drop a BOQ PDF</p>
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
                    accept=".pdf"
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Parsed Result — {result.filename}</CardTitle>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowHtml((s) => !s)}
                className="gap-2"
              >
                {showHtml ? <FileCode className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showHtml ? "Show table" : "Preview RFQ document"}
              </Button>
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

            {showHtml ? (
              <iframe
                title="RFQ preview"
                srcDoc={result.html}
                className="h-[800px] w-full rounded-md border border-border bg-white"
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
                        {edit.columns.map((c, i) => (
                          <th key={i} className="px-2 py-2">
                            {c || `Col ${i + 1}`}
                          </th>
                        ))}
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
                        return (
                          <tr key={rIdx} className="border-t border-border hover:bg-secondary/30">
                            <td className="px-2 py-1 text-center font-mono text-[10px] text-muted-foreground">
                              {row.role === "ITEM" ? "•" : row.role[0]}
                            </td>
                            {cells.map((cell, cIdx) => {
                              const flagged = cell.includes("?");
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
                    Amber cells contain &quot;?&quot; — illegible source, verify before issue.
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
