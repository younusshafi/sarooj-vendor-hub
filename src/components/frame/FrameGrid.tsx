import { useState } from "react";
import { X, ChevronUp, ChevronDown, Plus, Lock } from "lucide-react";
import type { BoqLine } from "@/lib/boq-parse";

const LINE_TYPES = [
  { value: "boq", label: "BOQ" },
  { value: "free_issue", label: "Free Issue" },
  { value: "attendance", label: "Attendance" },
  { value: "provisional_sum", label: "Provisional Sum" },
  { value: "note", label: "Note" },
];

interface Props {
  initialLines: BoqLine[];
  preamble: string;
  sourceConfidence: string;
  sourceRemark: string;
  onLock: (lines: BoqLine[], preamble: string) => void;
}

function emptyLine(item: number): BoqLine {
  return { item, description: "", unit: "", qty: null, line_type: "boq" };
}

export function FrameGrid({
  initialLines,
  preamble: initialPreamble,
  sourceConfidence,
  sourceRemark,
  onLock,
}: Props) {
  const [lines, setLines] = useState<BoqLine[]>(
    initialLines.length > 0 ? initialLines : [emptyLine(1)],
  );
  const [preamble, setPreamble] = useState(initialPreamble);
  const [showPreamble, setShowPreamble] = useState(!!initialPreamble);

  const updateLine = (idx: number, field: keyof BoqLine, value: string | number | null) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const deleteLine = (idx: number) => {
    setLines((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((l, i) => ({ ...l, item: i + 1 }));
    });
  };

  const addLine = () => {
    setLines((prev) => [...prev, emptyLine(prev.length + 1)]);
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setLines((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next.map((l, i) => ({ ...l, item: i + 1 }));
    });
  };

  const moveDown = (idx: number) => {
    if (idx >= lines.length - 1) return;
    setLines((prev) => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next.map((l, i) => ({ ...l, item: i + 1 }));
    });
  };

  const validLines = lines.filter(
    (l) => l.description.trim() && l.unit.trim() && l.qty !== null && l.qty > 0,
  );
  const canLock = validLines.length > 0;

  return (
    <div className="space-y-4">
      {/* Scanned / manual banner */}
      {sourceConfidence !== "high" && (
        <div
          className="rounded-lg border p-4 text-sm"
          style={{ borderColor: "#F59E0B", backgroundColor: "#FDF3E0", color: "#7A5200" }}
        >
          <strong>Manual entry required</strong>
          <span className="ml-1">
            —{" "}
            {sourceRemark ||
              "Enter the lines manually and verify against the original before issue."}
          </span>
        </div>
      )}

      {/* Preamble */}
      {!showPreamble ? (
        <button
          onClick={() => setShowPreamble(true)}
          className="text-xs font-medium underline"
          style={{ color: "var(--accent)" }}
        >
          + Add preamble text
        </button>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Preamble
            </span>
            <button
              onClick={() => {
                setShowPreamble(false);
                setPreamble("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Remove
            </button>
          </div>
          <textarea
            value={preamble}
            onChange={(e) => setPreamble(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none"
            placeholder="Project scope, general conditions, references..."
          />
        </div>
      )}

      {/* Grid */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            BOQ Lines ({lines.length})
          </span>
          <span className="text-xs text-muted-foreground">
            {validLines.length} valid of {lines.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 w-12 text-center">#</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 w-24">Unit</th>
                <th className="px-3 py-2 w-28 text-right">Qty</th>
                <th className="px-3 py-2 w-36">Line Type</th>
                <th className="px-3 py-2 w-24 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx} className="border-t border-border">
                  <td className="px-3 py-1.5 text-center text-xs font-mono text-muted-foreground">
                    {line.item}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLine(idx, "description", e.target.value)}
                      className="w-full rounded border border-border bg-white px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                      placeholder="Item description"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      value={line.unit}
                      onChange={(e) => updateLine(idx, "unit", e.target.value)}
                      className="w-full rounded border border-border bg-white px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                      placeholder="m, nr, ls..."
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      step="any"
                      value={line.qty === null ? "" : line.qty}
                      onChange={(e) =>
                        updateLine(
                          idx,
                          "qty",
                          e.target.value === "" ? null : parseFloat(e.target.value) || 0,
                        )
                      }
                      className="w-full rounded border border-border bg-white px-2 py-1 text-xs text-right outline-none focus:border-[var(--accent)]"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={line.line_type}
                      onChange={(e) => updateLine(idx, "line_type", e.target.value)}
                      className="w-full rounded border border-border bg-white px-1 py-1 text-xs outline-none"
                    >
                      {LINE_TYPES.map((lt) => (
                        <option key={lt.value} value={lt.value}>
                          {lt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => moveUp(idx)}
                        disabled={idx === 0}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => moveDown(idx)}
                        disabled={idx >= lines.length - 1}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteLine(idx)}
                        className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <button
            onClick={addLine}
            className="flex items-center gap-1 text-xs font-medium"
            style={{ color: "var(--accent)" }}
          >
            <Plus className="h-3.5 w-3.5" /> Add line
          </button>

          <button
            onClick={() => onLock(lines, preamble)}
            disabled={!canLock}
            className="flex items-center gap-2 rounded-md bg-foreground px-5 py-2 text-sm font-semibold text-background disabled:opacity-40"
          >
            <Lock className="h-4 w-4" />
            Lock & Build BoQ
          </button>
        </div>
      </div>
    </div>
  );
}
