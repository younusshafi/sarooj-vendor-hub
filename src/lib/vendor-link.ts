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
}

export async function listPendingUpdates(): Promise<PendingUpdate[]> {
  const { data } = await supabase
    .from("vendor_update_requests")
    .select("request_id,vendor_id,kind,payload,submitted_at")
    .eq("status", "pending")
    .order("submitted_at", { ascending: false });
  return (data ?? []) as unknown as PendingUpdate[];
}

export async function vendorUpdateApply(requestId: string, reviewer: string): Promise<void> {
  const { data, error } = await supabase.rpc("vendor_update_apply", {
    p_request_id: requestId,
    p_reviewer: reviewer,
  });
  if (error) throw error;
  const res = data as { ok?: boolean; error?: string };
  if (!res?.ok) throw new Error(res?.error || "Failed to apply update");
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
