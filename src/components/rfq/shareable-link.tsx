// Phase-0: the formalized link/token "seam". One component for every shareable link
// (vendor /bid & /sr-bid links, the approval /comparison-review link). Today links are
// hand-shared ("manual"); when the n8n emails land, the parent flips `state` to "emailed"
// — no structural rework. See memory ux-redesign-philosophy + handoff items 6 / 7b.

import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type ShareableLinkState = "manual" | "queued" | "emailed";

const STATE_CHIP: Record<ShareableLinkState, { label: string; bg: string; fg: string }> = {
  manual: { label: "Manual — copy & send", bg: "#FDF3E0", fg: "#7A5200" },
  queued: { label: "Queued to email", bg: "#E8EFF7", fg: "#1A3A5C" },
  emailed: { label: "Auto-emailed", bg: "#E0F2EA", fg: "#0D5C3A" },
};

export interface ShareableLinkProps {
  /** Full URL to share. */
  url: string;
  /** Seam state — defaults to manual (today's reality) until n8n automation exists. */
  state?: ShareableLinkState;
  /** Optional context shown alongside an "emailed" chip. */
  emailedTo?: string | null;
  emailedAt?: string | null;
  /** Optional leading label (e.g. vendor / recipient name). */
  label?: string;
  className?: string;
}

export function ShareableLink({
  url,
  state = "manual",
  emailedTo,
  emailedAt,
  label,
  className,
}: ShareableLinkProps) {
  const chip = STATE_CHIP[state];
  const copy = () => {
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied"),
      () => toast.error("Could not copy link"),
    );
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-md border border-border p-2.5 ${className ?? ""}`}
    >
      {label && <span className="text-sm font-medium text-foreground">{label}</span>}
      <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
        {url}
      </code>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
        style={{ backgroundColor: chip.bg, color: chip.fg }}
        title={
          state === "emailed"
            ? [emailedTo ? `to ${emailedTo}` : null, emailedAt ? `at ${emailedAt}` : null]
                .filter(Boolean)
                .join(" ")
            : undefined
        }
      >
        {chip.label}
        {state === "emailed" && emailedTo ? ` · ${emailedTo}` : ""}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={copy} className="shrink-0 gap-1">
        <Copy className="h-3.5 w-3.5" /> Copy
      </Button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" /> Open
      </a>
    </div>
  );
}
