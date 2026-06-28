// Fire-and-forget email notifications via the n8n "SCC - WF15 Approval Email" webhook
// (Webhook → Gmail "sarooj procurement gmail" → Respond). Created via the n8n REST API.
// These never block or break the action they accompany — failures are swallowed.

import { supabase } from "@/integrations/supabase-external/client";

const N8N_APPROVAL_EMAIL = "https://n8n.zavia-ai.com/webhook/scc-approval-email";

/** Approver address from system_settings, with a safe fallback. */
export async function getApproverEmail(): Promise<string> {
  try {
    const { data } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "approver_email")
      .maybeSingle();
    const v = (data as { setting_value: string } | null)?.setting_value;
    return v && v.trim() ? v.trim() : "rabia.vahabudeen@sarooj.com";
  } catch {
    return "rabia.vahabudeen@sarooj.com";
  }
}

export interface ApprovalEmailArgs {
  to: string;
  rfqReference: string;
  title?: string | null;
  reviewUrl: string;
  preparedBy?: string | null;
}

/** Email the approver their single-use comparison review link. */
export async function sendApprovalEmail(args: ApprovalEmailArgs): Promise<void> {
  const subject = `Approval needed — ${args.rfqReference} comparison`;
  const text =
    `A procurement comparison for ${args.rfqReference}` +
    (args.title ? ` — ${args.title}` : "") +
    ` is ready for your approval.\n\n` +
    `Review & decide here:\n${args.reviewUrl}\n\n` +
    (args.preparedBy ? `Prepared by ${args.preparedBy}.\n\n` : "") +
    `This link lets you Approve, Return, or Revoke; it stays live until the PO is issued.\n\n` +
    `Sarooj Construction — Procurement`;
  await sendEmail(args.to, subject, text);
}

/** Generic fire-and-forget transactional email via the WF15 webhook. */
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!to) return;
  try {
    await fetch(N8N_APPROVAL_EMAIL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, text }),
    });
  } catch {
    /* fire-and-forget */
  }
}

/** Officer recipient list (comma-joined for the Gmail node) from system_settings.officer_emails. */
export async function getOfficerEmails(): Promise<string> {
  try {
    const { data } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "officer_emails")
      .maybeSingle();
    const raw = (data as { setting_value: string } | null)?.setting_value;
    if (!raw) return "";
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter(Boolean).join(",");
    } catch {
      /* not JSON — treat as a plain/comma string */
    }
    return raw;
  } catch {
    return "";
  }
}

/** Notify the officer(s) that a vendor submitted a quotation. */
export async function notifyBidSubmitted(a: {
  rfqReference: string;
  vendorName: string;
  total?: number | null;
}): Promise<void> {
  const to = await getOfficerEmails();
  if (!to) return;
  const subject = `New quotation — ${a.rfqReference} from ${a.vendorName}`;
  const text =
    `${a.vendorName} has submitted a quotation for ${a.rfqReference}` +
    (a.total != null ? ` (total OMR ${a.total}).` : ".") +
    `\n\nReview it in the procurement app under the RFQ's Bids.\n\nSarooj Construction — Procurement`;
  await sendEmail(to, subject, text);
}

/** Notify the preparing officer of the approver's decision. */
export async function notifyDecision(a: {
  to: string | null;
  rfqReference: string;
  decision: "approve" | "return" | "revoke";
  notes?: string;
}): Promise<void> {
  if (!a.to) return;
  const word =
    a.decision === "approve"
      ? "approved"
      : a.decision === "revoke"
        ? "revoked"
        : "returned for revision";
  const subject = `${a.rfqReference} — comparison ${word}`;
  const text =
    `The comparison for ${a.rfqReference} has been ${word} by the approver.` +
    (a.notes ? `\n\nNote: ${a.notes}` : "") +
    `\n\nSarooj Construction — Procurement`;
  await sendEmail(a.to, subject, text);
}
