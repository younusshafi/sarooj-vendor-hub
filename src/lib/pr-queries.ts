import { supabase } from "@/integrations/supabase-external/client";
import type { PrTrackerRow, PrRfqDetailRow } from "@/types/pr";

/** Fetch all rows from v_pr_tracker */
export async function fetchPrTracker(): Promise<PrTrackerRow[]> {
  const { data, error } = await supabase
    .from("v_pr_tracker")
    .select("*")
    .order("last_rfq_created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PrTrackerRow[];
}

/**
 * Map each PR number to its rfq_type ("materials" | "subcontractor").
 * A PR is single-path (all its RFQs share one type), so the first type seen wins.
 * Derived from v_pr_rfq_detail because v_pr_tracker carries no rfq_type at PR level.
 */
export async function fetchPrTypeMap(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("v_pr_rfq_detail").select("pr_number,rfq_type");
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const r of (data ?? []) as { pr_number: string; rfq_type: string | null }[]) {
    if (r.rfq_type && !map[r.pr_number]) map[r.pr_number] = r.rfq_type;
  }
  return map;
}

/** Fetch v_pr_rfq_detail rows for a single PR */
export async function fetchPrRfqDetail(prNumber: string): Promise<PrRfqDetailRow[]> {
  const { data, error } = await supabase
    .from("v_pr_rfq_detail")
    .select("*")
    .eq("pr_number", prNumber)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PrRfqDetailRow[];
}
