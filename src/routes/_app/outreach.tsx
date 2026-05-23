import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase, type VendorOutreach } from "@/integrations/supabase-external/client";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/outreach")({
  component: OutreachPage,
});

function OutreachPage() {
  const stats = useQuery({
    queryKey: ["outreach-stats"],
    queryFn: async () => {
      const [sent, responses, confirmed, unresponsive] = await Promise.all([
        supabase.from("vendor_outreach").select("*", { count: "exact", head: true }),
        supabase.from("vendor_outreach").select("*", { count: "exact", head: true }).eq("response_received", true),
        supabase.from("vendor_outreach").select("*", { count: "exact", head: true }).eq("response_type", "confirmed"),
        supabase.from("vendors").select("*", { count: "exact", head: true }).eq("status", "unresponsive"),
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
      const { data } = await supabase.from("vendor_outreach").select("*").order("sent_at", { ascending: false }).limit(50);
      return (data ?? []) as VendorOutreach[];
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[28px] text-foreground">Vendor Outreach Campaign</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Emails Sent", stats.data?.sent ?? 0],
          ["Responses Received", stats.data?.responses ?? 0],
          ["Confirmed", stats.data?.confirmed ?? 0],
          ["Unresponsive", stats.data?.unresponsive ?? 0],
        ].map(([label, val]) => (
          <div key={label as string} className="rounded-xl border border-border bg-card p-5">
            <div className="font-display text-2xl text-foreground">{stats.isLoading ? "—" : (val as number)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-foreground">
          The outreach campaign sends re-confirmation emails to all vendors in the database. Start the campaign once you have confirmed the email content with your Zavia-ai administrator.
        </p>
        <div className="mt-4">
          <button
            disabled
            title="Contact Zavia-ai to activate"
            className="cursor-not-allowed rounded-md px-4 py-2 text-sm font-semibold text-white opacity-50"
            style={{ backgroundColor: "var(--accent)" }}
          >
            Start Campaign
          </button>
        </div>
      </div>

      <section>
        <h2 className="mb-3 font-display text-xl text-foreground">Outreach History</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: "var(--table-header)" }}>
              <tr className="text-left text-[13px] font-semibold uppercase tracking-wider" style={{ color: "var(--table-header-text)" }}>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Delivery</th>
                <th className="px-4 py-3">Response</th>
              </tr>
            </thead>
            <tbody>
              {(history.data?.length ?? 0) === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No outreach activity yet.</td></tr>
              )}
              {history.data?.map((r) => (
                <tr key={r.outreach_id} className="border-t border-border">
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(r.sent_at)}</td>
                  <td className="px-4 py-3">{r.email_to}</td>
                  <td className="px-4 py-3">{r.delivery_status ?? "—"}</td>
                  <td className="px-4 py-3">{r.response_received ? r.response_type ?? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
