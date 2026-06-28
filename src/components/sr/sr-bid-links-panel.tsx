// SR vendor link hand-out. Lists every invited vendor's single-use /sr-bid/<token>
// link via the shared <ShareableLink> (manual state for now — flips to "emailed" once
// the n8n dispatch email lands). SR dispatch is manual today, so (unlike the materials
// BidLinksPanel) this is NOT gated on sent_at — any invited vendor with a token shows.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase-external/client";
import { ShareableLink } from "@/components/rfq/shareable-link";

interface Row {
  id: string;
  email_to: string | null;
  bid_token: string | null;
  vendors: { company_name: string | null } | null;
}

export function SrBidLinksPanel({ rfqId }: { rfqId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("rfq_vendors")
        .select("id,email_to,bid_token,vendors(company_name)")
        .eq("rfq_id", rfqId);
      if (alive) {
        setRows((data ?? []) as unknown as Row[]);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [rfqId]);

  if (loading) return null;
  const withToken = rows.filter((r) => r.bid_token);
  if (withToken.length === 0) return null;

  const origin = window.location.origin;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Vendor bid links
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Each vendor’s single-use link to the BOQ quotation document. Send these manually until the
        automated dispatch email is enabled. Links become active once the BOQ is issued.
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
