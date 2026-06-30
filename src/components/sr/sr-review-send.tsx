// Wizard Step 3 — Review & send. Shows exactly who the invitation goes to (every
// vendor on the RFQ that has a live link), lets the officer edit the covering email
// as PLAIN TEXT with a live preview of the branded charcoal email, and sends. The
// send is the "issue" moment: it emails each vendor their unique /sr-bid link and
// flips the RFQ to issued. Honors Dispatch Test Mode (routes to the officer).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase-external/client";
import { sendEmail, getDispatchTestMode, getOfficerEmails } from "@/lib/notify";
import {
  buildInviteHtml,
  buildInviteText,
  DEFAULT_INVITE_MESSAGE,
  DEFAULT_INVITE_SUBJECT,
  type InviteDetails,
} from "@/lib/sr-email";

interface Recipient {
  id: string;
  vendor_id: string;
  email_to: string | null;
  bid_token: string | null;
  vendors: { company_name: string | null } | null;
}

export function SrReviewSend({
  rfqId,
  deadline,
  selectedVendorIds,
  onSent,
}: {
  rfqId: string;
  deadline?: string | null;
  /** Only these vendors (chosen in Step 2) are emailed. */
  selectedVendorIds: string[];
  onSent: () => void;
}) {
  const [allRows, setAllRows] = useState<Recipient[]>([]);
  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const [{ data: rfq }, { data: rv }] = await Promise.all([
      supabase
        .from("rfqs")
        .select(
          "covering_email_subject, covering_email_message, drive_folder_url, fat_by, equipment_by, materials_by, sme_required, payment_terms, subcontract_period",
        )
        .eq("rfq_id", rfqId)
        .single(),
      supabase
        .from("rfq_vendors")
        .select("id, vendor_id, email_to, bid_token, vendors(company_name)")
        .eq("rfq_id", rfqId),
    ]);
    setSubject((rfq?.covering_email_subject as string) || DEFAULT_INVITE_SUBJECT);
    setMessage((rfq?.covering_email_message as string) || DEFAULT_INVITE_MESSAGE);
    setDetails({
      driveUrl: (rfq?.drive_folder_url as string | null) ?? null,
      tcUrl: null, // pending the agreed T&C URL
      fatBy: (rfq?.fat_by as string | null) ?? null,
      equipmentBy: (rfq?.equipment_by as string | null) ?? null,
      materialsBy: (rfq?.materials_by as string | null) ?? null,
      smeRequired: (rfq?.sme_required as boolean | null) ?? null,
      paymentTerms: (rfq?.payment_terms as string | null) ?? null,
      subcontractPeriod: (rfq?.subcontract_period as string | null) ?? null,
    });
    setAllRows(((rv ?? []) as unknown as Recipient[]).filter((r) => r.bid_token));
    setLoading(false);
  }, [rfqId]);

  useEffect(() => {
    load();
  }, [load]);

  // Recipients = the vendors picked in Step 2 that have a live link.
  const selSet = useMemo(() => new Set(selectedVendorIds), [selectedVendorIds]);
  const recipients = useMemo(
    () => allRows.filter((r) => selSet.has(r.vendor_id)),
    [allRows, selSet],
  );

  const saveDraft = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("rfqs")
      .update({ covering_email_subject: subject, covering_email_message: message })
      .eq("rfq_id", rfqId);
    setSaving(false);
    if (error) toast.error(`Save failed: ${error.message}`);
    else toast.success("Email draft saved");
  };

  const handleSend = async () => {
    if (recipients.length === 0) {
      toast.error("No vendors with a live link. Lock the BOQ and add vendors first.");
      return;
    }
    setSending(true);
    try {
      // Persist the email text first, so what's sent matches what's stored.
      await supabase
        .from("rfqs")
        .update({ covering_email_subject: subject, covering_email_message: message })
        .eq("rfq_id", rfqId);

      const testMode = await getDispatchTestMode();
      const officerTo = testMode ? await getOfficerEmails() : "";
      const origin = window.location.origin;
      let sent = 0;
      for (const r of recipients) {
        const to = testMode ? officerTo : (r.email_to ?? "");
        if (!to) continue;
        const company = r.vendors?.company_name ?? "Vendor";
        const link = `${origin}/sr-bid/${r.bid_token}`;
        const args = { company, link, deadline, message, details: details ?? undefined };
        await sendEmail(
          to,
          testMode ? `[TEST] ${subject} — ${company}` : subject,
          buildInviteText(args),
          buildInviteHtml(args),
        );
        await supabase
          .from("rfq_vendors")
          .update({ sent_at: new Date().toISOString(), status: "sent" })
          .eq("id", r.id);
        sent += 1;
      }
      // The send is the issue moment.
      await supabase.from("rfqs").update({ status: "issued" }).eq("rfq_id", rfqId);
      toast.success(
        testMode
          ? `Test mode: ${sent} invitation(s) sent to the officer.`
          : `Sent ${sent} invitation(s).`,
      );
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const previewHtml = buildInviteHtml({
    company: "Vendor Name",
    link: `${window.location.origin}/sr-bid/...`,
    deadline,
    message,
    details: details ?? undefined,
  });

  return (
    <div className="space-y-6">
      {/* Who it goes to */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          This invitation will be emailed to {recipients.length} vendor
          {recipients.length !== 1 ? "s" : ""}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Each vendor receives their own unique quotation link. To change who&apos;s included, go
          back to <strong>Choose vendors</strong>.
        </p>
        {recipients.length === 0 ? (
          <p className="mt-3 text-sm text-destructive">
            No vendors with a live link yet — lock the BOQ and add vendors first.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {recipients.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {r.vendors?.company_name ?? "Vendor"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {r.email_to ?? "no email"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Compose (plain text) */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Mail className="h-4 w-4" /> Covering email
          </h3>
          <button
            type="button"
            onClick={saveDraft}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save draft
          </button>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Message to the vendor (plain text — branding, button, link and deadline are added
            automatically)
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-[var(--accent)]"
          />
        </label>

        <div className="mt-4">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Preview (what each vendor receives)
          </span>
          <div
            className="overflow-hidden rounded-lg border border-border bg-[#F6F4F3] p-4"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </div>

      {/* Send */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || recipients.length === 0}
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send {recipients.length} invitation{recipients.length !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}
