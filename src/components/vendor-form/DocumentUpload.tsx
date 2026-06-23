import { useRef, useState } from "react";
import { UploadCloud, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentUploadProps {
  label: string;
  required?: boolean;
  file: File | null;
  onChange: (file: File | null) => void;
}

const MAX_SIZE = 60 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DocumentUpload({ label, required, file, onChange }: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (f: File | null) => {
    if (!f) return onChange(null);
    if (f.size > MAX_SIZE) {
      setError("File exceeds 60MB limit.");
      return;
    }
    setError(null);
    onChange(f);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-medium text-foreground">{label}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
            required ? "bg-destructive-soft text-destructive" : "bg-muted text-muted-foreground",
          )}
        >
          {required ? "Required" : "Optional"}
        </span>
      </div>

      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className={cn(
            "flex w-full items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-accent-soft/40 px-4 py-4 text-[14px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground",
            dragOver ? "border-primary text-foreground" : "border-border",
          )}
          style={{ backgroundColor: "#F9FCFB" }}
        >
          <UploadCloud className="h-5 w-5" />
          <span>Click to upload or drag and drop</span>
        </button>
      ) : (
        <div className="flex items-center justify-between rounded-lg border-2 border-primary bg-accent-soft px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <FileText className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-foreground">{file.name}</p>
              <p className="text-[12px] text-muted-foreground">{formatBytes(file.size)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-md p-1 text-destructive transition-colors hover:bg-destructive/10"
            aria-label={`Remove ${label}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && <p className="text-[13px] text-destructive">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
