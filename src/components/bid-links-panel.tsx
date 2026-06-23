import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase-external/client";
import { Copy, Check, Mail } from "lucide-react";
import { wasSent } from "@/lib/rfq-vendors";

// Frontend link delivery for the vendor bid links — lets the officer copy/email each
// recipient their single-use /bid/<token> link until the dispatch email is automated
// in n8n. Self-fetches by rfqId so it can be dropped anywhere.

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
  const [copied, setCopied] = useState<string | null>(null);

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

  const linkFor = useCallback((token: string) => `${window.location.origin}/bid/${token}`, []);

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const mailto = (r: Row) => {
    if (!r.bid_token) return "#";
    const link = linkFor(r.bid_token);
    const subject = encodeURIComponent(`Quotation request — ${rfqReference ?? ""}`);
    const body = encodeURIComponent(
      `Dear ${r.vendors?.company_name ?? "Vendor"},\n\n` +
        `Please submit your quotation using your secure link below. It is unique to you and the only way to quote:\n\n` +
        `${link}\n\nThank you,\nSarooj Construction — Procurement`,
    );
    return `mailto:${r.email_to ?? ""}?subject=${subject}&body=${body}`;
  };

  if (loading) return null;
  const recipients = rows.filter((r) => wasSent(r) && r.bid_token);
  if (recipients.length === 0) return null;

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
          <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
            <span
              className="w-44 shrink-0 truncate text-sm font-medium"
              style={{ color: "#1A3A5C" }}
            >
              {r.vendors?.company_name ?? "Vendor"}
            </span>
            <input
              readOnly
              value={linkFor(r.bid_token!)}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-border bg-secondary px-2 py-1 text-xs outline-none"
            />
            <button
              onClick={() => copy(r.bid_token!)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium"
              title="Copy link"
            >
              {copied === r.bid_token ? (
                <Check className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied === r.bid_token ? "Copied" : "Copy"}
            </button>
            <a
              href={mailto(r)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white"
              style={{ backgroundColor: "var(--accent)" }}
              title={r.email_to ? `Email ${r.email_to}` : "No email on file"}
            >
              <Mail className="h-3.5 w-3.5" /> Email
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
