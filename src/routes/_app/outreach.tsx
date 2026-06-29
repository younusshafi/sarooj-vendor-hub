import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, type VendorOutreach } from "@/integrations/supabase-external/client";
import { formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { PendingVendorUpdates } from "@/components/vendor-form/PendingVendorUpdates";

export const Route = createFileRoute("/_app/outreach")({
  component: OutreachPage,
});

// Live campaign — the n8n workflow emails ALL ACTIVE vendors (status listed/registered).
// While the vendor table is in test isolation, "active" = the SCC team test inboxes, so no
// real vendors are reached; at go-live (full DB restored) this becomes a real all-vendor
// campaign. Hardcoded full URL per this repo's webhook convention.
const N8N_OUTREACH_CAMPAIGN = "https://n8n.zavia-ai.com/webhook/scc-outreach-campaign";

function OutreachPage() {
  const stats = useQuery({
    queryKey: ["outreach-stats"],
    queryFn: async () => {
      const [sent, responses, confirmed, unresponsive] = await Promise.all([
        supabase.from("vendor_outreach").select("*", { count: "exact", head: true }),
        supabase
          .from("vendor_outreach")
          .select("*", { count: "exact", head: true })
          .eq("response_received", true),
        supabase
          .from("vendor_outreach")
          .select("*", { count: "exact", head: true })
          .eq("response_type", "confirmed"),
        supabase
          .from("vendors")
          .select("*", { count: "exact", head: true })
          .eq("status", "unresponsive"),
      ]);
      return {
        sent: sent.count ?? 0,
        responses: responses.count ?? 0,
        confirmed: confirmed.count ?? 0,
        unresponsive: unresponsive.count ?? 0,
      };
    },
  });

  const history = useQuery({
    queryKey: ["outreach-history"],
    queryFn: async () => {
      const { data } = await supabase
        .from("vendor_outreach")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(50);
      return (data ?? []) as VendorOutreach[];
    },
  });

  const [starting, setStarting] = useState(false);
  const [tab, setTab] = useState<"campaign" | "responses">("campaign");

  const handleStartCampaign = async () => {
    const confirmed = window.confirm(
      "This emails ALL ACTIVE vendors. While the vendor list is in test isolation, active = the SCC team test inboxes (no real vendors). Continue?",
    );
    if (!confirmed) return;
    setStarting(true);
    try {
      const res = await fetch(N8N_OUTREACH_CAMPAIGN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Outreach campaign started — emailed your active vendors.");
      // Refresh the tiles and the history table so new sends appear.
      await Promise.all([stats.refetch(), history.refetch()]);
    } catch {
      toast.error("Failed to start the campaign. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[28px] text-foreground">Vendor Outreach</h1>

      <div className="flex gap-1 border-b border-border">
        {(
          [
            ["campaign", "Campaign"],
            ["responses", "Responses"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors"
            style={
              tab === id
                ? { borderColor: "#1A3A5C", color: "#1A3A5C" }
                : { borderColor: "transparent", color: "var(--muted-foreground)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "responses" && <PendingVendorUpdates />}

      {tab === "campaign" && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              ["Emails Sent", stats.data?.sent ?? 0],
              ["Responses Received", stats.data?.responses ?? 0],
              ["Confirmed", stats.data?.confirmed ?? 0],
              ["Unresponsive", stats.data?.unresponsive ?? 0],
            ].map(([label, val]) => (
              <div key={label as string} className="rounded-xl border border-border bg-card p-5">
                <div className="font-display text-2xl text-foreground">
                  {stats.isLoading ? "—" : (val as number)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-foreground">
              Sends a vendor re-confirmation email to{" "}
              <span className="font-semibold">all active vendors</span> (status listed /
              registered). While the vendor list is in test isolation, that is only the SCC team
              test inboxes — no real vendors are contacted. At go-live (full vendor DB restored)
              this becomes a real all-vendor campaign.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Each email includes the vendor’s pre-filled capture link; their submissions appear in
              the <strong>Responses</strong> tab for review before they’re applied to the record.
            </p>
            <div className="mt-4">
              <button
                onClick={handleStartCampaign}
                disabled={starting}
                title="Emails all active vendors. While in test isolation, active = the SCC team test inboxes; no real vendors are contacted."
                className="rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {starting ? "Starting…" : "Start Outreach Campaign"}
              </button>
            </div>
          </div>

          <section>
            <h2 className="mb-3 font-display text-xl text-foreground">Outreach History</h2>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: "var(--table-header)" }}>
                  <tr
                    className="text-left text-[13px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--table-header-text)" }}
                  >
                    <th className="px-4 py-3">Sent</th>
                    <th className="px-4 py-3">To</th>
                    <th className="px-4 py-3">Delivery</th>
                    <th className="px-4 py-3">Response</th>
                  </tr>
                </thead>
                <tbody>
                  {(history.data?.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                        No outreach activity yet.
                      </td>
                    </tr>
                  )}
                  {history.data?.map((r) => (
                    <tr key={r.outreach_id} className="border-t border-border">
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDateTime(r.sent_at)}
                      </td>
                      <td className="px-4 py-3">{r.email_to}</td>
                      <td className="px-4 py-3">{r.delivery_status ?? "—"}</td>
                      <td className="px-4 py-3">
                        {r.response_received ? (r.response_type ?? "Yes") : "No"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
