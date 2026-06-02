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
