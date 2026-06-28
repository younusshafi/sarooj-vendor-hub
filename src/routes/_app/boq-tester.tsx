import { createFileRoute } from "@tanstack/react-router";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
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
  FileText,
  Table2,
  Paperclip,
} from "lucide-react";
import {
  parseBoqRemote,
  checkBoqService,
  getBoqServiceUrl,
  setBoqServiceUrl,
  type ParsedBoq,
  type ParsedBoqRow,
} from "@/lib/boq-service";
import { srBoqIssue, type SrBoqColumn, type SrIssueLine } from "@/lib/sr-boq";

export const Route = createFileRoute("/_app/boq-tester")({
  component: BoqTesterPage,
});

// Columns whose values are internal or price-bearing and must not reach a vendor.
const PRICE_HINT = /rate|price|amount|total|value|budget|cost/i;

// Roles that render as full-width bands rather than per-column cells.
const BAND_ROLES = new Set(["SECTION", "NOTE", "TOTAL"]);
// Roles hidden from the editable table (title block + column header).
const HIDDEN_ROLES = new Set(["HEADER", "COLHEADER"]);

type ViewMode = "table" | "doc";

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
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Officer "Issue to RFQ" (sr_boq_issue)
  const [rfqId, setRfqId] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issueMsg, setIssueMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  const handleIssue = async () => {
    if (!edit || !rfqId.trim()) return;
    setIssuing(true);
    setIssueMsg(null);

    const qtyIdx = edit.columns.findIndex((c) => /qty|quantity/i.test(c));
    const unitIdx = edit.columns.findIndex((c) => /unit|uom/i.test(c));

    const columns: SrBoqColumn[] = edit.columns.map((name, i) => {
      const visible = !hiddenCols.has(i);
      let role: SrBoqColumn["role"];
      if (!visible) role = "internal";
      else if (/desc/i.test(name)) role = "desc";
      else if (/qty|quantity/i.test(name)) role = "qty";
      else if (/unit|uom/i.test(name)) role = "unit";
      else role = "data";
      return { key: `c${i}`, name, visible, role };
    });

    const lines: SrIssueLine[] = edit.rows.map((row, r) => {
      let qty: number | null = null;
      if (row.role === "ITEM") {
        if (qtyIdx >= 0) {
          const n = toNum(row.cells[qtyIdx] || "");
          if (!Number.isNaN(n)) qty = n;
        }
        if (qty === null) {
          const unit = unitIdx >= 0 ? row.cells[unitIdx] || "" : "";
          if (/\b(ls|lump|lumpsum|lot|sum|item)\b/i.test(unit)) qty = 1;
        }
      }
      return { seq: r + 1, role: row.role, cells: row.cells, incomplete: !!row.incomplete, qty };
    });

    try {
      const res = await srBoqIssue({
        rfq_id: rfqId.trim(),
        columns,
        lines,
        scope: edit.scope,
        source_kind: result?.filename.toLowerCase().endsWith(".xlsx") ? "xlsx" : "pdf",
        source_filename: result?.filename ?? null,
        actor: null,
      });
      if (res.ok) {
        setIssueMsg({
          ok: true,
          text: `Issued ✓ — boq_id: ${res.boq_id}. Vendor links are this RFQ's rfq_vendors.bid_token (open /sr-bid/<token>).`,
        });
      } else {
        setIssueMsg({ ok: false, text: res.error });
      }
    } catch (err) {
      setIssueMsg({ ok: false, text: err instanceof Error ? err.message : "Issue failed" });
    } finally {
      setIssuing(false);
    }
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
            <div className="min-w-[280px] flex-1">
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
                    ["table", "RFQ draft (officer)", Table2],
                    ["doc", "RFQ document (vendor)", FileText],
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
                  from the original document. These are hidden from the vendor (RFQ document) but
                  must be blanked before this RFQ is issued (auto-blanking added later).
                </p>
              </div>
            )}

            {viewMode === "doc" ? (
              <RfqDocument edit={edit} hiddenCols={hiddenCols} />
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
                              const cellStyle = {
                                borderColor: flagged ? "#F59E0B" : "var(--border)",
                                backgroundColor: flagged ? "#FEF3C7" : "white",
                              };
                              return (
                                <td key={cIdx} className="px-1 py-0.5 align-top">
                                  {cIdx === descIdx ? (
                                    <AutoGrowTextarea
                                      value={cell}
                                      onChange={(v) => updateCell(rIdx, cIdx, v)}
                                      style={cellStyle}
                                    />
                                  ) : (
                                    <input
                                      value={cell}
                                      onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                                      className="w-full rounded border px-1.5 py-1 outline-none focus:border-[var(--accent)]"
                                      style={cellStyle}
                                    />
                                  )}
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

                {/* Issue to RFQ */}
                <div className="rounded-lg border border-border p-4">
                  <h3 className="mb-1 text-sm font-semibold text-foreground">
                    Issue this BOQ to an RFQ
                  </h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Writes the curated skeleton (visible columns + roles, lines with qty) to{" "}
                    <code className="rounded bg-muted px-1 py-0.5">sr_boq</code> via{" "}
                    <code className="rounded bg-muted px-1 py-0.5">sr_boq_issue</code>. Paste the
                    target SR RFQ&apos;s id.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={rfqId}
                      onChange={(e) => setRfqId(e.target.value)}
                      placeholder="rfq_id (uuid)"
                      className="min-w-[280px] flex-1 rounded-md border border-border bg-white px-3 py-2 font-mono text-xs outline-none focus:border-[var(--accent)]"
                    />
                    <Button
                      type="button"
                      onClick={handleIssue}
                      disabled={issuing || !rfqId.trim()}
                      className="gap-2 bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
                    >
                      {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Issue BOQ
                    </Button>
                  </div>
                  {issueMsg && (
                    <p
                      className="mt-2 break-all text-xs"
                      style={{ color: issueMsg.ok ? "var(--accent)" : "var(--destructive)" }}
                    >
                      {issueMsg.text}
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const docInput =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]";
const RATE3 = /^\d*(\.\d{0,3})?$/;
const INT = /^\d*$/;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

interface CommercialTerms {
  quotationRef: string;
  vatTreatment: "exclusive" | "inclusive";
  paymentTerms: string;
  validityDays: string;
  subcontractPeriod: string;
  exclusions: string;
  notes: string;
}

// The vendor-facing RFQ document: rich, complete, fillable. Internal columns hidden.
function RfqDocument({ edit, hiddenCols }: { edit: EditableState; hiddenCols: Set<number> }) {
  const [rates, setRates] = useState<Record<number, string>>({});
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const [attachments, setAttachments] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [terms, setTerms] = useState<CommercialTerms>({
    quotationRef: "",
    vatTreatment: "exclusive",
    paymentTerms: "",
    validityDays: "",
    subcontractPeriod: "",
    exclusions: "",
    notes: "",
  });
  const setC = (patch: Partial<CommercialTerms>) => setTerms((p) => ({ ...p, ...patch }));

  const visible = edit.columns.map((c, i) => ({ c, i })).filter(({ i }) => !hiddenCols.has(i));
  const qtyIdx = edit.columns.findIndex((c) => /qty|quantity/i.test(c));
  const unitIdx = edit.columns.findIndex((c) => /unit|uom/i.test(c));

  const rowQty = (row: ParsedBoqRow): number | null => {
    if (qtyIdx >= 0) {
      const n = toNum(row.cells[qtyIdx] || "");
      if (!Number.isNaN(n)) return n;
    }
    const unit = unitIdx >= 0 ? (row.cells[unitIdx] || "").toLowerCase() : "";
    if (/\b(ls|lump|lumpsum|lot|sum|item)\b/.test(unit)) return 1; // lump-sum → Amount = Rate
    return null;
  };
  const amountOf = (rowIdx: number, row: ParsedBoqRow): number | null => {
    const q = rowQty(row);
    const r = toNum(rates[rowIdx] || "");
    if (q === null || Number.isNaN(r)) return null;
    return q * r;
  };

  let subtotal = 0;
  let priced = 0;
  let itemTotal = 0;
  edit.rows.forEach((row, i) => {
    if (row.role !== "ITEM") return;
    itemTotal += 1;
    const a = amountOf(i, row);
    if (a !== null) {
      subtotal += a;
      priced += 1;
    }
  });
  const subEx = r3(terms.vatTreatment === "exclusive" ? subtotal : subtotal / 1.05);
  const vat = r3(subEx * 0.05);
  const grand = r3(subEx + vat);
  const totalCols = visible.length + 4;

  if (submitted) {
    return (
      <div
        data-theme="charcoal"
        className="mx-auto max-w-[560px] rounded-xl border border-border bg-card p-8 text-center"
      >
        <CheckCircle2 className="mx-auto h-12 w-12 text-[var(--accent)]" />
        <h3 className="mt-4 font-display text-xl text-foreground">Quotation submitted (sandbox)</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          In the live flow this writes the vendor&apos;s submission to the database and locks the
          link until the deadline. {priced} of {itemTotal} lines priced · Grand total{" "}
          {fmtOmr(grand)} OMR.
        </p>
        <button
          onClick={() => setSubmitted(false)}
          className="mt-4 text-xs underline"
          style={{ color: "var(--accent)" }}
        >
          Back to document
        </button>
      </div>
    );
  }

  return (
    <div data-theme="charcoal" className="overflow-hidden rounded-lg border-2 border-border">
      {/* Document header */}
      <div className="flex items-center justify-between bg-header px-5 py-3 text-header-foreground">
        <div>
          <div className="text-[15px] font-bold tracking-wide">SAROOJ CONSTRUCTION COMPANY</div>
          <div className="text-[11px] opacity-80">Request for Quotation — Subcontract Works</div>
        </div>
        <div className="text-right text-[11px]">
          <div>
            RFQ: <span className="font-semibold">{edit.rfqRef || "[RFQ-REF]"}</span>
          </div>
          <div className="opacity-80">Response deadline: [set on issue]</div>
        </div>
      </div>

      <div className="space-y-5 bg-card p-5">
        <p className="rounded bg-secondary/40 p-2 text-[11px] text-muted-foreground">
          This is the document each vendor receives at their private link. Internal columns are
          hidden; the vendor enters unit rates (amounts &amp; totals auto-calculate), notes
          exclusions per line, completes commercial terms, attaches documents, and submits.
        </p>

        <DocSection title="1. Project Information">
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
            <DocInfo label="Project" value={edit.projectTitle || "—"} />
            <DocInfo label="Scope" value={edit.scope || "—"} />
          </div>
        </DocSection>

        <DocSection title="2. Bill of Quantities — enter your unit rates">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-2 py-1.5 text-left">#</th>
                  {visible.map(({ c, i }) => (
                    <th key={i} className="px-2 py-1.5 text-left">
                      {c || `Col ${i + 1}`}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-right">Unit Rate (RO)</th>
                  <th className="px-2 py-1.5 text-right">Amount (RO)</th>
                  <th className="px-2 py-1.5 text-left" style={{ minWidth: 150 }}>
                    Remark / Exclusion
                  </th>
                </tr>
              </thead>
              <tbody>
                {edit.rows.map((row, rIdx) => {
                  if (BAND_ROLES.has(row.role)) {
                    const bandText = row.cells.filter((c) => c.trim()).join(" ");
                    const bandClass =
                      row.role === "SECTION"
                        ? "bg-primary font-semibold text-primary-foreground"
                        : "bg-secondary italic text-muted-foreground";
                    return (
                      <tr key={rIdx}>
                        <td colSpan={totalCols} className={`px-2 py-1 ${bandClass}`}>
                          {bandText || " "}
                        </td>
                      </tr>
                    );
                  }
                  const cells = pad(row.cells, edit.columns.length);
                  const amt = amountOf(rIdx, row);
                  return (
                    <tr key={rIdx} className="border-b border-border">
                      <td className="px-2 py-1 align-top text-muted-foreground">•</td>
                      {visible.map(({ i }) => (
                        <td key={i} className="px-2 py-1 align-top">
                          {cells[i]}
                        </td>
                      ))}
                      <td className="px-1 py-0.5 align-top">
                        <input
                          inputMode="decimal"
                          value={rates[rIdx] ?? ""}
                          placeholder="0.000"
                          onChange={(e) =>
                            RATE3.test(e.target.value) &&
                            setRates((p) => ({ ...p, [rIdx]: e.target.value }))
                          }
                          className="w-24 rounded border border-input bg-white px-1.5 py-1 text-right tabular-nums outline-none focus:border-[var(--accent)]"
                        />
                      </td>
                      <td className="px-2 py-1 text-right align-top tabular-nums text-muted-foreground">
                        {amt === null ? "—" : fmtOmr(amt)}
                      </td>
                      <td className="px-1 py-0.5 align-top">
                        <input
                          value={remarks[rIdx] ?? ""}
                          placeholder="e.g. excludes scaffolding"
                          onChange={(e) => setRemarks((p) => ({ ...p, [rIdx]: e.target.value }))}
                          className="w-full min-w-[150px] rounded border border-input bg-white px-1.5 py-1 outline-none focus:border-[var(--accent)]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-secondary">
                  <td colSpan={visible.length + 2} className="px-2 py-1.5 text-right font-medium">
                    Subtotal (excl. VAT)
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                    {fmtOmr(subEx)}
                  </td>
                  <td />
                </tr>
                <tr className="bg-secondary">
                  <td
                    colSpan={visible.length + 2}
                    className="px-2 py-1.5 text-right text-muted-foreground"
                  >
                    VAT @ 5%
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtOmr(vat)}</td>
                  <td />
                </tr>
                <tr className="bg-muted">
                  <td colSpan={visible.length + 2} className="px-2 py-2 text-right font-bold">
                    GRAND TOTAL (incl. VAT)
                  </td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums">{fmtOmr(grand)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {priced} of {itemTotal} lines priced · amounts in OMR to 3 decimals (baisa) · totals
            indicative, finalised on submit.
          </p>
        </DocSection>

        <DocSection title="3. Commercial Terms">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DocField label="VAT treatment">
              <select
                value={terms.vatTreatment}
                onChange={(e) =>
                  setC({ vatTreatment: e.target.value as "exclusive" | "inclusive" })
                }
                className={docInput}
              >
                <option value="exclusive">Rates exclusive of VAT</option>
                <option value="inclusive">Rates inclusive of VAT</option>
              </select>
            </DocField>
            <DocField label="Quotation reference">
              <input
                value={terms.quotationRef}
                onChange={(e) => setC({ quotationRef: e.target.value })}
                className={docInput}
              />
            </DocField>
            <DocField label="Payment terms">
              <input
                value={terms.paymentTerms}
                onChange={(e) => setC({ paymentTerms: e.target.value })}
                placeholder="e.g. 30 days, advance %"
                className={docInput}
              />
            </DocField>
            <DocField label="Quote validity (days)">
              <input
                inputMode="numeric"
                value={terms.validityDays}
                onChange={(e) => INT.test(e.target.value) && setC({ validityDays: e.target.value })}
                className={docInput}
              />
            </DocField>
            <DocField label="Proposed subcontract period">
              <input
                value={terms.subcontractPeriod}
                onChange={(e) => setC({ subcontractPeriod: e.target.value })}
                placeholder="e.g. 12 weeks"
                className={docInput}
              />
            </DocField>
          </div>
          <div className="mt-3">
            <DocField label="Overall exclusions">
              <textarea
                rows={2}
                value={terms.exclusions}
                onChange={(e) => setC({ exclusions: e.target.value })}
                placeholder="Anything not covered by this quotation"
                className={docInput}
              />
            </DocField>
          </div>
          <div className="mt-3">
            <DocField label="Key conditions / notes">
              <textarea
                rows={2}
                value={terms.notes}
                onChange={(e) => setC({ notes: e.target.value })}
                className={docInput}
              />
            </DocField>
          </div>
        </DocSection>

        <DocSection title="4. Attachments">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-1.5 text-[12px] hover:bg-secondary">
            <Paperclip className="h-3.5 w-3.5" /> Add files (method statement, compliance, covering
            letter…)
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const names = Array.from(e.target.files ?? []).map((f) => f.name);
                if (names.length) setAttachments((p) => [...p, ...names]);
              }}
            />
          </label>
          {attachments.length > 0 && (
            <ul className="mt-2 space-y-1 text-[12px]">
              {attachments.map((n, i) => (
                <li key={i} className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  {n}
                  <button
                    onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DocSection>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          <span className="text-[11px] text-muted-foreground">
            Vendor can revise until the deadline.
          </span>
          <button
            type="button"
            onClick={() => setSubmitted(true)}
            className="rounded-lg bg-primary px-6 py-2.5 text-[14px] font-semibold text-primary-foreground hover:bg-[var(--primary-hover)]"
          >
            Submit quotation
          </button>
        </div>
      </div>
    </div>
  );
}

function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-foreground">
        {title}
      </div>
      <div className="px-1">{children}</div>
    </div>
  );
}

function DocInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="min-w-[60px] font-semibold text-primary">{label}:</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function DocField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// Textarea that grows to fit its content (no scrollbar, no manual resize) — used for
// long BOQ description cells so the officer can read the full work-scope passage.
function AutoGrowTextarea({
  value,
  onChange,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-[320px] resize-none overflow-hidden whitespace-pre-wrap rounded border px-1.5 py-1 leading-snug outline-none focus:border-[var(--accent)]"
      style={style}
    />
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
