import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type {
  FrameData,
  FrameFlag,
  FrameItemRow,
  FrameLine,
  FrameRfqRow,
} from "@/lib/subcontract-types";

interface Props {
  rfq: FrameRfqRow;
  rfqItems: FrameItemRow[];
  frameData?: FrameData | null;
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function FrameView({ rfq, rfqItems, frameData }: Props) {
  const frame = frameData?.frame;
  const meta = frame?.meta;
  const countCheck = frame?.count_check;
  const flags = frame?.flags ?? [];
  const commercialTerms = frame?.commercial_terms_to_request ?? [];

  const template = meta?.template ?? rfq.template ?? null;
  const templateVariant = meta?.template_variant ?? rfq.template_variant ?? null;

  const lines: FrameLine[] =
    frame?.lines ??
    rfqItems.map((item) => {
      const details = item.item_details;
      let lineType: string | null = null;
      if (details && typeof details === "object") {
        lineType = (details as { line_type?: string }).line_type ?? null;
      } else if (typeof details === "string") {
        try {
          lineType = (JSON.parse(details) as { line_type?: string })?.line_type ?? null;
        } catch {
          lineType = null;
        }
      }
      return {
        item_number: item.item_number ?? item.sap_item_number,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        line_type: lineType || "boq",
      };
    });

  const sourceConfidence = meta?.source_confidence ?? rfq.data_confidence ?? "high";

  return (
    <div className="space-y-6">
      {/* Template badge */}
      {template && (
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wider text-foreground">
            {template}
            {templateVariant ? ` · ${templateVariant}` : ""}
          </span>
          <span className="text-xs text-muted-foreground">Frame template</span>
        </div>
      )}

      {/* Source confidence banner */}
      {sourceConfidence !== "high" && (
        <div
          className="rounded-lg border p-3 text-sm"
          style={{ borderColor: "#F59E0B", backgroundColor: "#FDF3E0", color: "#7A5200" }}
        >
          <strong>Verify manually</strong> — lines were entered from a scanned source. Check against
          the original BOQ before issue.
        </div>
      )}

      {/* Count check warning */}
      {countCheck && countCheck.match === false && (
        <div
          className="flex items-start gap-2 rounded-lg border p-3 text-sm"
          style={{ borderColor: "#EF4444", backgroundColor: "#FEF2F2", color: "#991B1B" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <strong>Count mismatch</strong> — locked {countCheck.locked ?? "?"} lines, but{" "}
            {countCheck.written ?? "?"} were written. Review before proceeding.
          </div>
        </div>
      )}

      {countCheck && countCheck.match === true && (
        <div
          className="flex items-center gap-2 rounded-lg border p-2 text-xs"
          style={{ borderColor: "#C8DDD7", backgroundColor: "#E0F2EA", color: "#0D5C3A" }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Count verified: {countCheck.locked ?? lines.length} lines
        </div>
      )}

      {/* Commercial schedule table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Commercial Schedule ({lines.length} items)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 w-12">#</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2 w-20">Unit</th>
                <th className="px-4 py-2 w-24 text-right">Qty</th>
                <th className="px-4 py-2 w-32">Type</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No items
                  </td>
                </tr>
              )}
              {lines.map((line: FrameLine, idx: number) => (
                <tr key={idx} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {line.item_number ?? line.item ?? idx + 1}
                  </td>
                  <td className="px-4 py-2 text-xs">{line.description || "—"}</td>
                  <td className="px-4 py-2 text-xs">{line.unit || "—"}</td>
                  <td className="px-4 py-2 text-right text-xs">
                    {line.quantity ?? line.qty ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
                      {titleCase(line.line_type || "boq")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Flags panel */}
      {flags.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Flags & Notes
          </h3>
          <div className="space-y-2">
            {flags.map((flag: FrameFlag, idx: number) => (
              <div
                key={idx}
                className="rounded-lg border p-3 text-sm"
                style={{
                  borderColor: flag.type === "warning" ? "#F59E0B" : "#C8DDD7",
                  backgroundColor: flag.type === "warning" ? "#FDF3E0" : "#F4F8F6",
                }}
              >
                <span
                  className="mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                  style={{
                    backgroundColor: flag.type === "warning" ? "#F59E0B" : "#0D7A5A",
                    color: "#fff",
                  }}
                >
                  {flag.type || "note"}
                </span>
                {flag.detail || flag.message || JSON.stringify(flag)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commercial terms to request */}
      {commercialTerms.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Commercial Terms to Request
          </h3>
          <ul className="space-y-1 text-sm">
            {commercialTerms.map((term: string, idx: number) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted-foreground" />
                {term}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
