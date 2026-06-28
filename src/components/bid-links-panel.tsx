import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase-external/client";
import { wasSent } from "@/lib/rfq-vendors";
import { ShareableLink } from "@/components/rfq/shareable-link";

// Frontend link delivery for the materials vendor bid links — lets the officer copy/email
// each recipient their single-use /bid/<token> link until the dispatch email is automated
// in n8n. Renders via the shared <ShareableLink> seam (manual → emailed). Self-fetches by
// rfqId so it can be dropped anywhere.

interface Row {
  id: string;
  vendor_id: string;
  email_to: string | null;
  bid_token: string | null;
  sent_at: string | null;
  status: string;
  vendors: { company_name: string } | null;
}

export function BidLinksPanel({ rfqId, rfqReference }: { rfqId: string; rfqReference?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("rfq_vendors")
        .select("id,vendor_id,email_to,bid_token,sent_at,status,vendors(company_name)")
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
  const recipients = rows.filter((r) => wasSent(r) && r.bid_token);
  if (recipients.length === 0) return null;

  const origin = window.location.origin;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Vendor bid links
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Each vendor’s single-use link to submit a quotation. Send these until automated dispatch
        emails are enabled.
      </p>
      <div className="mt-3 space-y-2">
        {recipients.map((r) => (
          <ShareableLink
            key={r.id}
            label={r.vendors?.company_name ?? "Vendor"}
            url={`${origin}/bid/${r.bid_token}`}
            state="manual"
            mailto={{
              to: r.email_to,
              subject: `Quotation request — ${rfqReference ?? ""}`,
              body:
                `Dear ${r.vendors?.company_name ?? "Vendor"},\n\n` +
                `Please submit your quotation using your secure link below. ` +
                `It is unique to you and the only way to quote:`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
