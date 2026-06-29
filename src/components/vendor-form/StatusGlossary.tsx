import { useState } from "react";
import { HelpCircle, ChevronDown, ChevronUp } from "lucide-react";

// Single source of truth for what each vendor status means. Shown as a togglable legend on
// Vendor Master so the statuses in the filter/table are self-explanatory.
export const VENDOR_STATUS_GLOSSARY: { status: string; label: string; desc: string }[] = [
  {
    status: "pending_review",
    label: "Pending review",
    desc: "New registration submitted — awaiting officer review.",
  },
  {
    status: "listed",
    label: "Listed",
    desc: "Active & usable for RFQs and outreach. Imported from the master list, or approved from review / un-blacklisted.",
  },
  {
    status: "registered",
    label: "Registered",
    desc: "Completed the formal registration form (details + documents) via the onboarding / re-confirmation link, and was approved.",
  },
  {
    status: "unresponsive",
    label: "Unresponsive",
    desc: "Did not reply after outreach and follow-up.",
  },
  {
    status: "inactive",
    label: "Inactive",
    desc: "Deactivated — e.g. replied “no longer a supplier”, or rejected on review.",
  },
  {
    status: "blacklisted",
    label: "Blacklisted",
    desc: "Barred from all dealings; excluded from vendor selection.",
  },
];

export function StatusGlossary() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium text-foreground"
      >
        <span className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          What do the vendor statuses mean?
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border p-4 sm:grid-cols-2">
          {VENDOR_STATUS_GLOSSARY.map((s) => (
            <div key={s.status} className="text-sm">
              <span className="font-semibold text-foreground">{s.label}</span>
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">{s.status}</span>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
            </div>
          ))}
          <p className="text-xs text-muted-foreground sm:col-span-2">
            <span className="font-semibold text-foreground">Active</span> in the filter is a
            shortcut for Listed + Registered (the vendors usable for RFQs and outreach).
          </p>
        </div>
      )}
    </div>
  );
}
