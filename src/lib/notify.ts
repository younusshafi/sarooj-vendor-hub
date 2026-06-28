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
  try {
    await fetch(N8N_APPROVAL_EMAIL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: args.to, subject, text }),
    });
  } catch {
    /* fire-and-forget — the on-screen link is the fallback */
  }
}
