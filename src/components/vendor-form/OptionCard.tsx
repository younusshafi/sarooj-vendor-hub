import { cn } from "@/lib/utils";

interface OptionCardProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
  size?: "default" | "large";
}

export function OptionCard({ label, selected, onSelect, size = "default" }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-lg border-[1.5px] bg-card text-left text-[14px] font-medium text-foreground transition-colors",
        size === "large" ? "px-5 py-5 text-[15px]" : "px-4 py-3",
        selected ? "border-primary bg-accent-soft" : "border-border hover:border-primary/50",
      )}
    >
      {label}
    </button>
  );
}
