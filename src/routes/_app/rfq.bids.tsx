import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_app/rfq/bids")({
  component: BidsPlaceholderPage,
});

function BidsPlaceholderPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl p-6" style={{ backgroundColor: "#FDF3E0" }}>
        <h1
          className="font-display text-[28px]"
          style={{ color: "#7A5200" }}
        >
          Bid Comparison
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#7A5200", opacity: 0.7 }}>
          AI-powered bid analysis and vendor recommendation
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-20">
        <ClipboardList
          className="mb-4 h-12 w-12"
          style={{ color: "#F59E0B" }}
        />
        <h2 className="text-lg font-semibold text-foreground">
          Bid Comparison — Coming Soon
        </h2>
        <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
          The bid comparison module is being set up. You will be able to review
          AI-extracted bids, compare vendors, and get AI-powered recommendations here.
        </p>
      </div>
    </div>
  );
}
