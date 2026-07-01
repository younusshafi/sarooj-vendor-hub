// Data layer for the tokenized vendor capture link (onboarding + re-confirmation) and the
// officer-side pending-approval queue. Wired to the vendor_link_* / vendor_update_* RPCs
// (migration vendor_capture_link_pending_approval).
import { supabase } from "@/integrations/supabase-external/client";

export interface VendorLinkPrefill {
  company_name?: string | null;
  cr_number?: string | null;
  vat_number?: string | null;
  website?: string | null;
  country?: string | null;
  contact_person?: string | null;
  email?: string | null;
  contact_mobile?: string | null;
  designation?: string | null;
}

export interface VendorLinkResult {
  found: boolean;
  kind?: "onboard" | "reconfirm";
  vendor_id?: string | null;
  prefill?: VendorLinkPrefill;
  documents_on_file?: { document_type: string; filename: string }[];
}

export async function vendorLinkGet(token: string): Promise<VendorLinkResult> {
  const { data, error } = await supabase.rpc("vendor_link_get", { p_token: token });
  if (error) throw error;
  return data as VendorLinkResult;
}

export async function vendorLinkSubmit(
  token: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; request_id?: string }> {
  const { data, error } = await supabase.rpc("vendor_link_submit", {
    p_token: token,
    p_payload: payload,
  });
  if (error) throw error;
  return data as { ok: boolean; error?: string; request_id?: string };
}

export async function vendorLinkCreate(args: {
  vendorId?: string | null;
  kind: "onboard" | "reconfirm";
  email?: string | null;
  company?: string | null;
  contact?: string | null;
  category?: string | null;
}): Promise<{ token: string }> {
  const { data, error } = await supabase.rpc("vendor_link_create", {
    p_vendor_id: args.vendorId ?? null,
    p_kind: args.kind,
    p_email: args.email ?? null,
    p_company: args.company ?? null,
    p_contact: args.contact ?? null,
    p_category: args.category ?? null,
  });
  if (error) throw error;
  return data as { token: string };
}

export interface PendingUpdate {
  request_id: string;
  vendor_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  submitted_at: string;
  verification_status?: string | null;
}

export async function listPendingUpdates(): Promise<PendingUpdate[]> {
  const { data } = await supabase
    .from("vendor_update_requests")
    .select("request_id,vendor_id,kind,payload,submitted_at,verification_status")
    .eq("status", "pending")
    .order("submitted_at", { ascending: false });
  return (data ?? []) as unknown as PendingUpdate[];
}

export async function vendorUpdateApply(
  requestId: string,
  reviewer: string,
  overrideNote?: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("vendor_update_apply", {
    p_request_id: requestId,
    p_reviewer: reviewer,
    p_override_note: overrideNote ?? null,
  });
  if (error) throw error;
  const res = data as { ok?: boolean; error?: string };
  if (!res?.ok) throw new Error(res?.error || "Failed to apply update");
}

// ── Document verification (n8n scc-vendor-verify) ────────────────────────────
const VERIFY_WEBHOOK = "https://n8n.zavia-ai.com/webhook/scc-vendor-verify";

/** Fire the document-verification workflow for a pending request (fire-and-forget). */
export async function verifyRequest(requestId: string): Promise<void> {
  try {
    await fetch(VERIFY_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: requestId }),
    });
  } catch {
    /* fire-and-forget */
  }
}

export interface VerificationLedgerItem {
  field: string;
  typed: string | null;
  document: string | null;
  result: "match" | "mismatch" | "unverifiable" | "info" | "advisory";
  note: string;
}
export interface RequestVerification {
  status: string | null;
  ran_at: string | null;
  confidence?: string;
  extracted?: Record<string, unknown>;
  per_document?: { document_type: string; filename: string; ok: boolean; error: string | null }[];
  ledger?: VerificationLedgerItem[];
}

/** Read the stored verification result for a pending request. */
export async function getRequestVerification(
  requestId: string,
): Promise<RequestVerification | null> {
  const { data } = await supabase
    .from("vendor_update_requests")
    .select("verification, verification_status, verification_ran_at")
    .eq("request_id", requestId)
    .maybeSingle();
  if (!data) return null;
  const v = (data.verification as Record<string, unknown> | null) || {};
  return {
    status: (data.verification_status as string | null) ?? (v.status as string) ?? null,
    ran_at: (data.verification_ran_at as string | null) ?? (v.ran_at as string) ?? null,
    confidence: v.confidence as string | undefined,
    extracted: v.extracted as Record<string, unknown> | undefined,
    per_document: v.per_document as RequestVerification["per_document"],
    ledger: v.ledger as RequestVerification["ledger"],
  };
}

export async function vendorUpdateReject(
  requestId: string,
  reviewer: string,
  notes: string,
): Promise<void> {
  const { error } = await supabase.rpc("vendor_update_reject", {
    p_request_id: requestId,
    p_reviewer: reviewer,
    p_notes: notes,
  });
  if (error) throw error;
}
