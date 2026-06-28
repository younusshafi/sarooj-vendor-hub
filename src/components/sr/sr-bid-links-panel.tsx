// SR vendor link hand-out + dispatch. Lists each invited vendor's single-use
// /sr-bid/<token> link (copy/open via <ShareableLink>), and an "Email all vendors"
// action that sends each their link through the generic WF15 webhook (src/lib/notify).
// Honors Dispatch Test Mode (when ON, sends to the officer instead of real vendors) —
// which the materials WF8 dispatch does NOT currently do. SR dispatch is otherwise
// manual; this is the auto-send.

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

export function SrBidLinksPanel({ rfqId }: { rfqId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("rfq_vendors")
      .select("id,email_to,bid_token,vendors(company_name)")
      .eq("rfq_id", rfqId);
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  }, [rfqId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;
  const withToken = rows.filter((r) => r.bid_token);
  if (withToken.length === 0) return null;

  const origin = window.location.origin;

  const handleEmailAll = async () => {
    setSending(true);
    try {
      const testMode = await getDispatchTestMode();
      const officerTo = testMode ? await getOfficerEmails() : "";
      let sent = 0;
      for (const r of withToken) {
        const to = testMode ? officerTo : (r.email_to ?? "");
        if (!to) continue;
        const company = r.vendors?.company_name ?? "Vendor";
        const link = `${origin}/sr-bid/${r.bid_token}`;
        const subject = testMode
          ? `[TEST] Subcontract RFQ — link for ${company}`
          : `Invitation to quote — subcontract RFQ`;
        const text =
          `Dear ${company},\n\n` +
          `You are invited to submit a quotation for our subcontract package. ` +
          `Please submit online using your secure link:\n${link}\n\n` +
          `This link is unique to you and is the only way to submit your quote.\n\n` +
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
          Vendor bid links
        </h3>
        <button
          type="button"
          onClick={handleEmailAll}
          disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Mail className="h-3.5 w-3.5" />
          )}
          Email all vendors
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Each vendor’s single-use link to the BOQ quotation document. “Email all vendors” sends each
        their link (issue the BOQ first so the links are live). Honors Dispatch Test Mode.
      </p>
      <div className="mt-3 space-y-2">
        {withToken.map((r) => (
          <ShareableLink
            key={r.id}
            label={r.vendors?.company_name ?? "Vendor"}
            url={`${origin}/sr-bid/${r.bid_token}`}
            state="manual"
          />
        ))}
      </div>
    </div>
  );
}
