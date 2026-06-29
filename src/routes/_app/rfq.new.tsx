import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { UploadCloud, ChevronDown, ChevronUp, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/integrations/supabase-external/auth";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_app/rfq/new")({
  component: NewRFQPage,
});

const N8N_WF7 = "https://n8n.zavia-ai.com/webhook/scc-rfq-generate";

interface SAPRow {
  pr_number: string;
  item_number: number;
  material_id: string;
  item_details: string;
  quantity: number;
  unit: string;
  processing_status: string;
  delivery_date: string | null;
}

interface OverlappingPr {
  pr_number: string;
  total_rfqs: number;
  last_rfq_created_at: string;
}

/** Shape returned by WF7 on success */
interface Wf7Response {
  success: boolean;
  message?: string;
  rfqs: {
    rfq_id: string;
    rfq_reference: string;
    title: string;
    category: string;
    rfq_type: string;
    item_count: number;
    vendor_count: number;
    pr_numbers: string[];
  }[];
  pr_numbers: string[];
}

function decodeExcelDate(serial: number): string {
  const date = new Date((serial - 25569) * 86400 * 1000);
  return date.toISOString().split("T")[0];
}

function parseSAPExcel(file: File): Promise<SAPRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const ws = wb.Sheets["SAPUI5 Export"];
        if (!ws) {
          reject(new Error('Sheet "SAPUI5 Export" not found in this file.'));
          return;
        }
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
        const rows = raw
          .slice(1)
          .filter((r) => r[0])
          .map((r) => ({
            pr_number: String(r[0] || ""),
            item_number: Number(r[1] || 0),
            material_id: String(r[2] || ""),
            item_details: String(r[3] || ""),
            quantity: Number(r[4] || 0),
            unit: "",
            processing_status: String(r[5] || ""),
            delivery_date:
              r[6] && typeof r[6] === "number"
                ? decodeExcelDate(Number(r[6]))
                : typeof r[6] === "string"
                  ? (r[6] as string)
                  : null,
          }));
        resolve(rows);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to parse Excel file";
        reject(new Error(msg));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

function NewRFQPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<SAPRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [client, setClient] = useState("");
  const [consultant, setConsultant] = useState("");

  // Duplicate-upload warning state
  const [overlappingPrs, setOverlappingPrs] = useState<OverlappingPr[]>([]);
  const [duplicateCheckDone, setDuplicateCheckDone] = useState(false);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);

  const clearFile = useCallback(() => {
    setFile(null);
    setRows([]);
    setParseError(null);
    setOverlappingPrs([]);
    setDuplicateCheckDone(false);
    setDuplicateAcknowledged(false);
  }, []);

  const activePRs = new Set(
    rows.filter((r) => !["po", "PO"].includes(r.processing_status)).map((r) => r.pr_number),
  );
  const alreadyPO = rows.filter((r) => ["po", "PO", "BSART"].includes(r.processing_status)).length;
  const activeItems = rows.filter(
    (r) => !["po", "PO", "BSART"].includes(r.processing_status),
  ).length;

  // Check for duplicate PRs after parsing
  useEffect(() => {
    if (!rows.length) {
      setOverlappingPrs([]);
      setDuplicateCheckDone(false);
      setDuplicateAcknowledged(false);
      return;
    }
    const prNumbers = [...new Set(rows.map((r) => r.pr_number).filter(Boolean))];
    if (!prNumbers.length) {
      setDuplicateCheckDone(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("v_pr_tracker")
        .select("pr_number,total_rfqs,last_rfq_created_at")
        .in("pr_number", prNumbers);
      if (cancelled) return;
      setOverlappingPrs((data ?? []) as OverlappingPr[]);
      setDuplicateCheckDone(true);
      setDuplicateAcknowledged(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [rows]);

  const hasDuplicateWarning = duplicateCheckDone && overlappingPrs.length > 0;
  const generateBlocked = hasDuplicateWarning && !duplicateAcknowledged;

  const processFile = useCallback(async (f: File) => {
    if (!f.name.endsWith(".xlsx") && !f.name.endsWith(".xls")) {
      setParseError("Please upload an Excel file (.xlsx or .xls)");
      return;
    }
    setParsing(true);
    setParseError(null);
    setFile(f);
    try {
      const parsed = await parseSAPExcel(f);
      setRows(parsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Parse error";
      setParseError(msg);
      setRows([]);
    } finally {
      setParsing(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) processFile(f);
    },
    [processFile],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) processFile(f);
    },
    [processFile],
  );

  const handleGenerate = async () => {
    if (!rows.length) return;
    setGenerating(true);
    try {
      const payload = {
        filename: file?.name || "upload.xlsx",
        sap_rows: rows,
        created_by: user?.email || "",
        project_name: projectName || null,
        project_code: projectCode || null,
        project_location: projectLocation || null,
        client: client || null,
        consultant: consultant || null,
      };
      const res = await fetch(N8N_WF7, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result: Wf7Response = await res.json();
      if (!res.ok) {
        throw new Error(result.message || `WF7 error: ${res.status}`);
      }

      const rfqs = result.rfqs ?? [];
      const prNumbers = result.pr_numbers ?? [];

      if (!rfqs.length) {
        toast.info("RFQs generated. Check RFQ Tracker.");
        navigate({ to: "/rfq/" });
        return;
      }

      // Pass full WF7 response data to summary — no DB refetch needed
      sessionStorage.setItem("rfq_summary_rfqs", JSON.stringify(rfqs));
      sessionStorage.setItem("rfq_summary_prs", JSON.stringify(prNumbers));
      sessionStorage.setItem("rfq_summary_filename", file?.name || "upload.xlsx");
      navigate({ to: "/rfq/summary" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate RFQs";
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-6" style={{ backgroundColor: "#E8EFF7" }}>
        <h1 className="font-display text-[28px]" style={{ color: "#1A3A5C" }}>
          New RFQ
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#1A3A5C", opacity: 0.7 }}>
          Upload a SAP Export to generate Request for Quotations
        </p>
      </div>

      {/* Upload zone */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold" style={{ color: "#1A3A5C" }}>
          Step 1 — Upload SAP Excel Export
        </h2>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition-colors"
          style={{
            borderColor: dragging ? "var(--accent)" : "var(--border)",
            backgroundColor: dragging ? "#E8EFF7" : "transparent",
          }}
        >
          {parsing ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Parsing Excel…
            </div>
          ) : file ? (
            <div className="space-y-1">
              <p className="font-medium text-foreground">{file.name}</p>
              <p className="text-sm text-muted-foreground">{rows.length} rows parsed</p>
              <button
                onClick={clearFile}
                className="text-xs underline"
                style={{ color: "var(--accent)" }}
              >
                Remove file
              </button>
            </div>
          ) : (
            <>
              <UploadCloud className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                Drag & drop your Excel file here
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                .xlsx only — must contain &quot;SAPUI5 Export&quot; sheet
              </p>
              <label className="mt-4 cursor-pointer">
                <span
                  className="rounded-md px-4 py-2 text-sm font-semibold text-white"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  Browse File
                </span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
              </label>
            </>
          )}
        </div>
        {parseError && (
          <div
            className="mt-3 rounded-md p-3 text-sm"
            style={{
              backgroundColor: "var(--toast-error-bg)",
              color: "var(--toast-error-fg)",
            }}
          >
            {parseError}
          </div>
        )}
      </div>

      {/* Summary */}
      {rows.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-3 text-base font-semibold" style={{ color: "#1A3A5C" }}>
            Step 2 — Review Summary
          </h2>
          <div className="flex flex-wrap gap-4">
            <div
              className="rounded-lg p-4 text-center"
              style={{ backgroundColor: "#E8EFF7", minWidth: 120 }}
            >
              <div className="text-2xl font-bold" style={{ color: "#1A3A5C" }}>
                {activeItems}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Active Items</div>
            </div>
            <div
              className="rounded-lg p-4 text-center"
              style={{ backgroundColor: "#E8EFF7", minWidth: 120 }}
            >
              <div className="text-2xl font-bold" style={{ color: "#1A3A5C" }}>
                {activePRs.size}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">PR Numbers</div>
            </div>
            {alreadyPO > 0 && (
              <div
                className="rounded-lg p-4 text-center"
                style={{ backgroundColor: "#FDF3E0", minWidth: 120 }}
              >
                <div className="text-2xl font-bold" style={{ color: "#7A5200" }}>
                  {alreadyPO}
                </div>
                <div className="mt-1 text-xs" style={{ color: "#7A5200" }}>
                  Already have POs
                </div>
              </div>
            )}
          </div>
          {alreadyPO > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {alreadyPO} item(s) with existing POs will be excluded from RFQ generation.
            </p>
          )}
        </div>
      )}

      {/* Duplicate-upload warning */}
      {hasDuplicateWarning && (
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: "#F59E0B", backgroundColor: "#FDF3E0" }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: "#7A5200" }} />
            <div className="flex-1">
              <p className="font-semibold text-sm" style={{ color: "#7A5200" }}>
                Some of these PRs were already turned into RFQs
              </p>
              <p className="mt-1 text-xs" style={{ color: "#7A5200" }}>
                Uploading again will create duplicate RFQs. Continue anyway?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {overlappingPrs.map((pr) => (
                  <span
                    key={pr.pr_number}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ backgroundColor: "rgba(122,82,0,0.12)", color: "#7A5200" }}
                  >
                    <span className="font-semibold">{pr.pr_number}</span>
                    <span className="opacity-70">
                      ({pr.total_rfqs} RFQ{pr.total_rfqs !== 1 ? "s" : ""},{" "}
                      {formatDistanceToNow(new Date(pr.last_rfq_created_at), { addSuffix: true })})
                    </span>
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                {!duplicateAcknowledged && (
                  <button
                    onClick={() => setDuplicateAcknowledged(true)}
                    className="rounded-md px-4 py-1.5 text-xs font-semibold"
                    style={{ backgroundColor: "#7A5200", color: "white" }}
                  >
                    I understand, continue
                  </button>
                )}
                {duplicateAcknowledged && (
                  <p className="text-xs font-medium" style={{ color: "#7A5200" }}>
                    Acknowledged — Generate is enabled.
                  </p>
                )}
                <button
                  onClick={clearFile}
                  className="rounded-md border px-4 py-1.5 text-xs font-semibold"
                  style={{ borderColor: "#7A5200", color: "#7A5200" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Optional project details */}
      {rows.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="flex w-full items-center justify-between text-sm font-semibold"
            style={{ color: "#1A3A5C" }}
          >
            Step 3 — Project Details (Optional)
            {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showDetails && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Project Name" value={projectName} onChange={setProjectName} />
              <Field label="Project Code" value={projectCode} onChange={setProjectCode} />
              <Field
                label="Project Location"
                value={projectLocation}
                onChange={setProjectLocation}
              />
              <Field label="Client" value={client} onChange={setClient} />
              <Field label="Consultant" value={consultant} onChange={setConsultant} />
            </div>
          )}
        </div>
      )}

      {/* Generate button */}
      {rows.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={generating || generateBlocked}
            className="flex items-center gap-2 rounded-md px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {generating && <Loader2 className="h-4 w-4 animate-spin" />}
            {generating ? "Generating RFQs\u2026" : "Generate RFQs"}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-ring"
      />
    </label>
  );
}
