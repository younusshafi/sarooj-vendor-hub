import { useRef, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { parseBoqXlsx, parseBoqXlsxSheet, parseBoqPdf, type ParseResult } from "@/lib/boq-parse";

interface Props {
  onParsed: (result: ParseResult) => void;
}

export function BoqUploadStep({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [lineCount, setLineCount] = useState<number | null>(null);
  const [candidateSheets, setCandidateSheets] = useState<string[] | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const processFile = async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["xlsx", "xls", "pdf"].includes(ext)) {
      setParseError("Unsupported file type. Upload .xlsx, .xls, or .pdf");
      return;
    }

    setParsing(true);
    setParseError(null);
    setFileName(f.name);
    setCandidateSheets(null);
    setFile(f);

    try {
      let result: ParseResult;
      if (ext === "pdf") {
        result = await parseBoqPdf(f);
      } else {
        result = await parseBoqXlsx(f);
      }

      if (result.candidateSheets && result.candidateSheets.length > 1) {
        setCandidateSheets(result.candidateSheets);
        setParsing(false);
        return;
      }

      setLineCount(result.lines.length);
      setParsing(false);
      onParsed(result);
    } catch (err) {
      setParsing(false);
      setParseError(err instanceof Error ? err.message : "Failed to parse file");
    }
  };

  const pickSheet = async (sheetName: string) => {
    if (!file) return;
    setParsing(true);
    setCandidateSheets(null);
    try {
      const result = await parseBoqXlsxSheet(file, sheetName);
      setLineCount(result.lines.length);
      setParsing(false);
      onParsed(result);
    } catch (err) {
      setParsing(false);
      setParseError(err instanceof Error ? err.message : "Failed to parse sheet");
    }
  };

  const clearFile = () => {
    setFileName(null);
    setLineCount(null);
    setFile(null);
    setCandidateSheets(null);
    setParseError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="mb-4 text-base font-semibold text-foreground">Upload BoQ</h2>

      {/* Sheet picker */}
      {candidateSheets && (
        <div className="mb-4 rounded-lg border border-border p-4">
          <p className="mb-3 text-sm font-medium text-foreground">
            Multiple sheets found — select the BOQ schedule:
          </p>
          <div className="flex flex-wrap gap-2">
            {candidateSheets.map((name) => (
              <button
                key={name}
                onClick={() => pickSheet(name)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Drop zone */}
      {!candidateSheets && (
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
              <Loader2 className="h-5 w-5 animate-spin" /> Parsing...
            </div>
          ) : fileName && lineCount !== null ? (
            <div className="space-y-1">
              <p className="font-medium text-foreground">{fileName}</p>
              <p className="text-sm text-muted-foreground">
                {lineCount > 0
                  ? `${lineCount} lines extracted`
                  : "No lines extracted — manual entry"}
              </p>
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
              <p className="text-sm font-medium text-foreground">Drag & drop your BOQ file here</p>
              <p className="mt-1 text-xs text-muted-foreground">.xlsx, .xls, or .pdf</p>
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
                  accept=".xlsx,.xls,.pdf"
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
      )}

      {parseError && (
        <div className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {parseError}
        </div>
      )}
    </div>
  );
}
