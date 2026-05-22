import type { VendorStatus } from "@/integrations/supabase-external/client";
import { formatStatus } from "@/lib/format";

const STYLES: Record<string, { bg: string; fg: string }> = {
  listed: { bg: "var(--badge-listed-bg)", fg: "var(--badge-listed-fg)" },
  registered: { bg: "var(--badge-registered-bg)", fg: "var(--badge-registered-fg)" },
  pending_review: { bg: "var(--badge-pending-bg)", fg: "var(--badge-pending-fg)" },
  blacklisted: { bg: "var(--badge-blacklisted-bg)", fg: "var(--badge-blacklisted-fg)" },
  unresponsive: { bg: "var(--badge-unresponsive-bg)", fg: "var(--badge-unresponsive-fg)" },
  inactive: { bg: "var(--badge-inactive-bg)", fg: "var(--badge-inactive-fg)" },
};

export function StatusBadge({ status, large = false }: { status: VendorStatus | string; large?: boolean }) {
  const style = STYLES[status] ?? STYLES.inactive;
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold uppercase tracking-wide ${
        large ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[11px]"
      }`}
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {formatStatus(status)}
    </span>
  );
}

export function ConfidenceDot({ level }: { level: string | null }) {
  if (!level) return <span className="text-muted-foreground text-sm">—</span>;
  const color =
    level === "high"
      ? "var(--confidence-high)"
      : level === "medium"
        ? "var(--confidence-medium)"
        : "var(--confidence-low)";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm capitalize">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {level}
    </span>
  );
}

export function CategoryTags({ categories }: { categories: string[] | null }) {
  if (!categories || categories.length === 0) return <span className="text-muted-foreground">—</span>;
  const shown = categories.slice(0, 2);
  const extra = categories.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((c) => (
        <span
          key={c}
          className="inline-flex rounded-md border border-border bg-secondary px-2 py-0.5 text-xs"
        >
          {c}
        </span>
      ))}
      {extra > 0 && <span className="text-xs text-muted-foreground">+{extra} more</span>}
    </div>
  );
}

export function SupplierPill({ type }: { type: string | null }) {
  if (!type) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex rounded-full border border-border bg-secondary px-2 py-0.5 text-xs capitalize">
      {type}
    </span>
  );
}