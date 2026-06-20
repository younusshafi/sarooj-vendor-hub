import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";
import { fetchPrTracker } from "@/lib/pr-queries";
import { fetchPrRfqDetail } from "@/lib/pr-queries";
import { PrStatusCode, PR_STATUS_LABEL, PR_STATUS_BADGE, type PrRfqDetailRow } from "@/types/pr";

export const Route = createFileRoute("/_app/prs/$prNumber")({
  component: PrDetailPage,
});

// Subcontractor RFQs live in a separate app — a PR can span both types, so the
// SR detail link must deep-link out rather than open the frameless materials page.
const SUBCONTRACTOR_APP_URL = "https://sarooj-procurement-subcontractors.vercel.app";

function PrStatusBadge({ code }: { code: string }) {
  const c = code as PrStatusCode;
  const style = PR_STATUS_BADGE[c] ?? { bg: "#E5EAE8", text: "#0D3D2E" };
  const label = PR_STATUS_LABEL[c] ?? code;
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {label}
    </span>
  );
}

function RfqStatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    draft: { bg: "#F0F7F4", fg: "#4A6560" },
    sent: { bg: "#E8EFF7", fg: "#1A3A5C" },
    closed: { bg: "#FDF3E0", fg: "#7A5200" },
    awarded: { bg: "#E8F5EE", fg: "#0D5C3A" },
    cancelled: { bg: "#FEF2F2", fg: "#991B1B" },
  };
  const c = colors[status] ?? { bg: "#F0F7F4", fg: "#4A6560" };
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {status}
    </span>
  );
}

function EvalCell({ row }: { row: PrRfqDetailRow }) {
  if (row.finalised_count > 0) {
    return (
      <span
        className="rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ backgroundColor: "#E0F2EA", color: "#0D5C3A" }}
      >
        Finalised
      </span>
    );
  }
  if (row.comparisons_count > 0) {
    return (
      <span
        className="rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ backgroundColor: "#FDF3E0", color: "#7A5200" }}
      >
        In progress
      </span>
    );
  }
  return <span className="text-muted-foreground">&mdash;</span>;
}

function PrDetailPage() {
  const { prNumber } = Route.useParams();

  // Fetch PR summary row
  const { data: prRows } = useQuery({
    queryKey: ["pr-tracker"],
    queryFn: fetchPrTracker,
  });
  const prRow = prRows?.find((r) => r.pr_number === prNumber);

  // Fetch RFQ detail rows
  const {
    data: rfqRows,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["pr-rfq-detail", prNumber],
    queryFn: () => fetchPrRfqDetail(prNumber),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl p-6" style={{ backgroundColor: "#E8EFF7" }}>
        <Link
          to="/prs"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: "#1A3A5C", opacity: 0.7 }}
        >
          <ArrowLeft className="h-3 w-3" /> Back to PR Tracker
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[28px]" style={{ color: "#1A3A5C" }}>
            PR {prNumber}
          </h1>
          {prRow && <PrStatusBadge code={prRow.pr_status_code} />}
        </div>
        {prRow && (
          <div className="mt-3 flex flex-wrap gap-4 text-sm" style={{ color: "#1A3A5C" }}>
            <div>
              <span className="font-semibold">{prRow.total_rfqs}</span>{" "}
              <span style={{ opacity: 0.7 }}>RFQs</span>
            </div>
            <div>
              <span className="font-semibold">{prRow.issued_rfqs}</span>{" "}
              <span style={{ opacity: 0.7 }}>issued</span>
            </div>
            <div>
              <span className="font-semibold">{prRow.rfqs_with_responses}</span>{" "}
              <span style={{ opacity: 0.7 }}>with responses</span>
            </div>
            <div>
              <span className="font-semibold">{prRow.rfqs_evaluated}</span>{" "}
              <span style={{ opacity: 0.7 }}>evaluated</span>
            </div>
            <div>
              <span className="font-semibold">{prRow.total_items}</span>{" "}
              <span style={{ opacity: 0.7 }}>items</span>
            </div>
          </div>
        )}
      </div>

      {/* RFQ detail table */}
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: "var(--table-header)" }}>
            <tr
              className="text-left text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--table-header-text)" }}
            >
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-center">Items</th>
              <th className="px-4 py-3 text-center">Responses</th>
              <th className="px-4 py-3">Evaluation</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Failed to load.{" "}
                  <button
                    onClick={() => refetch()}
                    className="underline"
                    style={{ color: "var(--accent)" }}
                  >
                    Retry
                  </button>
                </td>
              </tr>
            )}
            {!isLoading && !isError && (rfqRows ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No RFQs found for this PR.
                </td>
              </tr>
            )}
            {(rfqRows ?? []).map((row: PrRfqDetailRow) => (
              <tr key={row.rfq_id} className="border-t border-border hover:bg-secondary/50">
                <td className="px-4 py-3 font-medium font-mono text-xs">{row.rfq_reference}</td>
                <td className="px-4 py-3 max-w-[250px] truncate">{row.title}</td>
                <td className="px-4 py-3">
                  <RfqStatusBadge status={row.rfq_status} />
                </td>
                <td className="px-4 py-3 text-center">{row.items_from_this_pr}</td>
                <td className="px-4 py-3 text-center">
                  <span className="font-medium">{row.responses_received}</span>
                  <span className="text-muted-foreground">/{row.vendors_invited}</span>
                </td>
                <td className="px-4 py-3">
                  <EvalCell row={row} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {row.rfq_type === "materials" ? (
                      <Link
                        to="/rfq/$rfqId"
                        params={{ rfqId: row.rfq_id }}
                        className="inline-flex items-center gap-1 text-xs font-medium"
                        style={{ color: "var(--accent)" }}
                      >
                        Detail <ChevronRight className="h-3 w-3" />
                      </Link>
                    ) : (
                      <a
                        href={`${SUBCONTRACTOR_APP_URL}/rfq/${row.rfq_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium"
                        style={{ color: "var(--accent)" }}
                      >
                        Detail ↗
                      </a>
                    )}
                    {row.rfq_type === "materials" &&
                      (row.comparisons_count > 0 || row.finalised_count > 0) && (
                        <Link
                          to="/rfq/$rfqId/comparison"
                          params={{ rfqId: row.rfq_id }}
                          className="inline-flex items-center gap-1 text-xs font-medium"
                          style={{ color: "#1A3A5C" }}
                        >
                          Comparison
                        </Link>
                      )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
