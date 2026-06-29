// SR vendor link hand-out + dispatch. Lists each invited vendor's single-use
// /sr-bid/<token> link (copy/open via <ShareableLink>) with a checkbox, and an
// "Email N vendors" action that sends each SELECTED vendor their link via the generic
// WF15 webhook (src/lib/notify). Honors Dispatch Test Mode (when ON, routes to the
// officer instead of real vendors). SR dispatch is otherwise manual; this is the auto-send.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase-external/client";
import { ShareableLink } from "@/components/rfq/shareable-link";
import { sendEmail, getDispatchTestMode, getOfficerEmails } from "@/lib/notify";

interface Row {
  id: string;
  email_to: string | null;
  bid_token: string | null;
  vendors: { company_name: string | null } | null;
}

export function SrBidLinksPanel({ rfqId, deadline }: { rfqId: string; deadline?: string | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("rfq_vendors")
      .select("id,email_to,bid_token,vendors(company_name)")
      .eq("rfq_id", rfqId);
    const list = (data ?? []) as unknown as Row[];
    setRows(list);
    // Default: every invited vendor with a live link is selected.
    setSelected(new Set(list.filter((r) => r.bid_token).map((r) => r.id)));
    setLoading(false);
  }, [rfqId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;
  const withToken = rows.filter((r) => r.bid_token);
  if (withToken.length === 0) return null;

  const origin = window.location.origin;
  const selectedRows = withToken.filter((r) => selected.has(r.id));
  const allSelected = selectedRows.length === withToken.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(withToken.map((r) => r.id)));

  const handleEmail = async () => {
    if (selectedRows.length === 0) {
      toast.error("Select at least one vendor to email.");
      return;
    }
    setSending(true);
    try {
      const testMode = await getDispatchTestMode();
      const officerTo = testMode ? await getOfficerEmails() : "";
      let sent = 0;
      for (const r of selectedRows) {
        const to = testMode ? officerTo : (r.email_to ?? "");
        if (!to) continue;
        const company = r.vendors?.company_name ?? "Vendor";
        const link = `${origin}/sr-bid/${r.bid_token}`;
        const subject = testMode
          ? `[TEST] Subcontract RFQ — link for ${company}`
          : `Invitation to quote — subcontract RFQ`;
        // Link sits MID-BODY (after the intro), not pinned at the top — mirrors the
        // [SUBMIT_LINK] convention used for the materials covering email.
        const deadlineLine = deadline ? ` Quotations are due by ${deadline}.` : "";
        const text =
          `Dear ${company},\n\n` +
          `Sarooj Construction invites you to submit a quotation for our subcontract package.` +
          `${deadlineLine} The full bill of quantities and scope are in your online quotation ` +
          `form — please review them there and enter your rates.\n\n` +
          `Submit your quotation online:\n${link}\n\n` +
          `This link is unique to you and is the only way your quote can be recorded; ` +
          `submissions through any other channel will not be accepted.\n\n` +
          `If you have any questions about the scope, please reply to this email.\n\n` +
          `Sarooj Construction — Procurement`;
        await sendEmail(to, subject, text);
        await supabase
          .from("rfq_vendors")
          .update({ sent_at: new Date().toISOString(), status: "sent" })
          .eq("id", r.id);
        sent += 1;
      }
      toast.success(
        testMode
          ? `Test mode: ${sent} link(s) sent to the officer.`
          : `Emailed ${sent} vendor link(s).`,
      );
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Invite vendors
        </h3>
        <button
          type="button"
          onClick={handleEmail}
          disabled={sending || selectedRows.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Mail className="h-3.5 w-3.5" />
          )}
          Email {selectedRows.length} vendor{selectedRows.length !== 1 ? "s" : ""}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Tick the vendors to contact, then send — each gets their single-use quotation link (issue
        the BOQ first so the links are live). Honors Dispatch Test Mode.
      </p>

      <div className="mt-3 mb-2 flex items-center gap-3">
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs font-medium underline"
          style={{ color: "var(--accent)" }}
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
        <span className="text-xs text-muted-foreground">
          {selectedRows.length} of {withToken.length} selected
        </span>
      </div>

      <div className="space-y-2">
        {withToken.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border p-2">
            <input
              type="checkbox"
              checked={selected.has(r.id)}
              onChange={() => toggle(r.id)}
              className="h-4 w-4 shrink-0 rounded accent-[var(--accent)]"
              aria-label={`Select ${r.vendors?.company_name ?? "vendor"}`}
            />
            <div className="min-w-0 flex-1">
              <ShareableLink
                label={r.vendors?.company_name ?? "Vendor"}
                url={`${origin}/sr-bid/${r.bid_token}`}
                state="manual"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
