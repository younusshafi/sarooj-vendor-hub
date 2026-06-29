import { createFileRoute, Navigate } from "@tanstack/react-router";

// The standalone Preview & Dispatch page has been retired. Selecting recipients and
// sending now happen inline on each RFQ's detail page → Vendors tab. Any old link or
// bookmark to /rfq/preview redirects to the RFQ Tracker.
export const Route = createFileRoute("/_app/rfq/preview")({
  validateSearch: (s: Record<string, unknown>) => ({
    rfq_ids: Array.isArray(s.rfq_ids)
      ? (s.rfq_ids as string[])
      : typeof s.rfq_ids === "string"
        ? [s.rfq_ids]
        : [],
  }),
  component: () => <Navigate to="/rfq" />,
});
