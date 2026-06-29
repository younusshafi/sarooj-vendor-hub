// SR vendor invite + dispatch. Lists each invited vendor (name + email) with a
// checkbox, and an "Email N vendors" action that emails each SELECTED vendor their
// single-use /sr-bid/<token> link via the generic WF15 webhook (src/lib/notify). The
// link is delivered only in the email — it is not shown/copied in the UI. Honors
// Dispatch Test Mode (when ON, routes to the officer instead of real vendors).

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase-external/client";
import { sendEmail, getDispatchTestMode, getOfficerEmails } from "@/lib/notify";

interface Row {
  id: string;
  email_to: string | null;
  bid_token: string | null;
  vendors: { company_name: string | null } | null;
}

// Rich HTML covering email in the project's CHARCOAL theme (matches the vendor /sr-bid
// document chrome: charcoal #232227 header with the serif company name, crimson #98191D
// action band, border #D5D3D2). Inline styles only — email clients strip <style>/classes.
function buildInviteHtml(company: string, link: string, deadline?: string | null): string {
  const ink = "#232227"; // --foreground / --header
  const accent = "#98191D"; // --primary / --accent (crimson)
  const border = "#D5D3D2"; // --border
  const muted = "#6B696E"; // --muted-foreground
  const deadlineSentence = deadline ? ` Quotations are due by <strong>${deadline}</strong>.` : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:${ink};max-width:600px;margin:0 auto;">
  <div style="background:${ink};padding:18px 24px;border-radius:8px 8px 0 0;">
    <div style="font-family:Georgia,'Times New Roman',serif;color:#ffffff;font-size:20px;line-height:1.2;">Sarooj Construction Company</div>
    <div style="color:#ffffff;opacity:.8;font-size:12px;margin-top:4px;">Invitation to Quote &mdash; Subcontract</div>
  </div>
  <div style="padding:24px;background:#ffffff;border:1px solid ${border};border-top:none;border-radius:0 0 8px 8px;">
    <p style="margin:0 0 14px;">Dear ${company},</p>
    <p style="margin:0 0 16px;line-height:1.6;">Sarooj Construction invites you to submit a quotation for our subcontract package.${deadlineSentence} The full bill of quantities and scope of works are in your secure online quotation form &mdash; please review them there and enter your rates.</p>
    <div style="text-align:center;margin:26px 0;">
      <a href="${link}" style="background:${accent};color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:6px;font-weight:bold;font-size:15px;display:inline-block;">Open your quotation form &rarr;</a>
    </div>
    <p style="margin:0 0 16px;line-height:1.6;font-size:13px;color:${muted};">This link is unique to you and is the only way your quotation can be recorded. Submissions through any other channel will not be accepted.</p>
    <p style="margin:0 0 6px;line-height:1.6;">If you have any questions about the scope, simply reply to this email.</p>
    <p style="margin:18px 0 0;font-weight:bold;">Sarooj Construction &mdash; Procurement</p>
  </div>
  <div style="padding:10px 24px;font-size:11px;color:${muted};">This is an automated message from the Sarooj Procurement system.</div>
</div>`;
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
        // Rich HTML body (mirrors the materials invite); plain text kept as a fallback
        // for clients that don't render HTML. WF15 sends HTML when `html` is present.
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
        const html = buildInviteHtml(company, link, deadline);
        await sendEmail(to, subject, text, html);
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
        Tick the vendors to contact, then send — each receives an email with their single-use
        quotation link (lock the BOQ first so the links are live). Honors Dispatch Test Mode.
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
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {r.vendors?.company_name ?? "Vendor"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {r.email_to ?? "no email"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
