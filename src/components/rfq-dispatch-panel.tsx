import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase-external/client";
import { postWebhook } from "@/lib/subcontract-webhook";
import type { SelectedVendor } from "@/components/rfq-vendor-list";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Send } from "lucide-react";

function formatDeadlineDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function RfqDispatchPanel({
  rfqId,
  selectedVendors,
}: {
  rfqId: string;
  selectedVendors: SelectedVendor[];
}) {
  const [deadline, setDeadline] = useState("");
  const [rfqStatus, setRfqStatus] = useState<string>("draft");
  const [vendorsWithEmail, setVendorsWithEmail] = useState(0);
  const [vendorsWithoutEmail, setVendorsWithoutEmail] = useState(0);
  const [dispatching, setDispatching] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchState = useCallback(async () => {
    const [rfqRes, vendorRes] = await Promise.all([
      supabase.from("rfqs").select("status, deadline").eq("rfq_id", rfqId).single(),
      supabase.from("rfq_vendors").select("id, email_to, status").eq("rfq_id", rfqId),
    ]);

    if (rfqRes.data) {
      setRfqStatus(rfqRes.data.status);
      if (rfqRes.data.deadline) {
        setDeadline(rfqRes.data.deadline);
      }
    }

    const vendors = vendorRes.data ?? [];
    setVendorsWithEmail(vendors.filter((v) => v.email_to).length);
    setVendorsWithoutEmail(vendors.filter((v) => !v.email_to).length);
    setLoading(false);
  }, [rfqId]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleDispatch = async () => {
    if (!deadline) {
      toast.error("Set a deadline before issuing");
      return;
    }

    // Backend emails ONLY the vendors in selected_vendor_ids; never dispatch empty.
    if (selectedVendors.length === 0) {
      toast.error("Select at least one vendor");
      return;
    }

    const deadlineDisplay = formatDeadlineDisplay(deadline);
    const names = selectedVendors.map((v) => v.name);

    const confirmed = confirm(
      `About to email these ${selectedVendors.length} vendor(s):\n\n` +
        `${names.join(", ")}\n\n` +
        `Deadline: ${deadlineDisplay}\n\n` +
        `This will send real emails. Continue?`,
    );
    if (!confirmed) return;

    setDispatching(true);

    const result = await postWebhook<{ success: boolean }>(
      "/webhook/scc-subcontract-rfq-dispatch",
      {
        rfq_id: rfqId,
        deadline: deadlineDisplay,
        // vendor_id values (vendors-table id / rfq_vendors.vendor_id) — the backend gate
        selected_vendor_ids: selectedVendors.map((v) => v.vendor_id),
      },
    );

    setDispatching(false);

    if (!result.ok) {
      toast.error(`Dispatch failed: ${result.error}`);
      return;
    }

    toast.success("Dispatch started — emails are being sent in the background");
    // Refetch state after a short delay to let backend process
    setTimeout(() => fetchState(), 3000);
    setTimeout(() => fetchState(), 8000);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Issue RFQ</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  const isIssued = rfqStatus === "issued";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Send className="h-5 w-5" />
          Issue RFQ
          {isIssued && <Badge className="ml-2 text-xs uppercase">Issued</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isIssued ? (
          <div className="space-y-2">
            <p className="text-sm text-[var(--accent)] font-medium">This RFQ has been issued.</p>
            <p className="text-sm text-muted-foreground">
              Sent to {vendorsWithEmail} vendor(s).
              {deadline && ` Deadline: ${formatDeadlineDisplay(deadline)}.`}
            </p>
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="deadline">Response Deadline</Label>
              <Input
                id="deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="mt-1 max-w-xs"
              />
            </div>

            <div className="rounded-md border border-border p-3 space-y-1">
              <p className="text-sm">
                <span className="font-medium">{selectedVendors.length}</span> vendor(s) selected
              </p>
              <p className="text-sm text-muted-foreground">
                {vendorsWithEmail} vendor(s) invited have an email on file
              </p>
              {vendorsWithoutEmail > 0 && (
                <p className="flex items-center gap-1 text-sm text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {vendorsWithoutEmail} vendor(s) without email — will be skipped
                </p>
              )}
            </div>

            {selectedVendors.length === 0 && (
              <p className="text-sm text-amber-600">
                Select at least one vendor in the Vendors tab to enable dispatch.
              </p>
            )}

            <Button
              type="button"
              onClick={handleDispatch}
              disabled={!deadline || dispatching || selectedVendors.length === 0}
              className="gap-2 bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
            >
              {dispatching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Dispatching...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Issue RFQ
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
