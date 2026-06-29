import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, ArrowRight, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_app/rfq/summary")({
  component: RFQSummaryPage,
});

/** Matches WF7's per-RFQ shape stored in sessionStorage */
interface CreatedRfq {
  rfq_id: string;
  rfq_reference: string;
  title: string;
  category: string;
  rfq_type: string;
  item_count: number;
  vendor_count: number;
  pr_numbers: string[];
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* sessionStorage unavailable or bad JSON */
  }
  return fallback;
}

function RFQSummaryPage() {
  const [createdRfqs] = useState<CreatedRfq[]>(() => readJson("rfq_summary_rfqs", []));
  const [prNumbers] = useState<string[]>(() => readJson("rfq_summary_prs", []));
  const [filename] = useState(() => {
    try {
      return sessionStorage.getItem("rfq_summary_filename") || "upload.xlsx";
    } catch {
      return "upload.xlsx";
    }
  });

  if (!createdRfqs.length) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No RFQs to summarise.{" "}
        <Link to="/rfq/new" className="underline" style={{ color: "var(--accent)" }}>
          Generate one
        </Link>
        .
      </div>
    );
  }

  const rfqCount = createdRfqs.length;
  const prCount = prNumbers.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl p-6" style={{ backgroundColor: "var(--accent-soft)" }}>
        <h1 className="font-display text-[28px]" style={{ color: "var(--primary-hover)" }}>
          Created {rfqCount} RFQ{rfqCount !== 1 ? "s" : ""} across {prCount} PR
          {prCount !== 1 ? "s" : ""} from{" "}
          <code
            className="rounded px-2 py-0.5 text-[22px]"
            style={{ backgroundColor: "rgba(13,92,58,0.1)" }}
          >
            {filename}
          </code>
        </h1>
      </div>

      {/* Created RFQs list */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Created RFQs
        </h2>
        <div className="space-y-3">
          {createdRfqs.map((rfq) => (
            <Link
              key={rfq.rfq_id}
              to="/rfq/$rfqId"
              params={{ rfqId: rfq.rfq_id }}
              className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-secondary"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{rfq.rfq_reference}</span>
                    {rfq.rfq_type && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{ backgroundColor: "#E8EFF7", color: "#1A3A5C" }}
                      >
                        {rfq.rfq_type}
                      </span>
                    )}
                    {rfq.category && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{ backgroundColor: "#E5EAE8", color: "#0D3D2E" }}
                      >
                        {rfq.category}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {rfq.title} · {rfq.item_count} item{rfq.item_count !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>

      {/* PR Numbers */}
      {prCount > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            PR Numbers Touched
          </h2>
          <div className="flex flex-wrap gap-2">
            {prNumbers.map((pr) => (
              <Link
                key={pr}
                to="/prs/$prNumber"
                params={{ prNumber: pr }}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
                style={{ backgroundColor: "#E5EAE8", color: "#0D3D2E" }}
              >
                {pr}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Link
          to="/prs"
          className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Go to PR Tracker
          <ExternalLink className="h-4 w-4" />
        </Link>
        <Link
          to="/rfq"
          className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary"
        >
          Go to RFQ Tracker
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
