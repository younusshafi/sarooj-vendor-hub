// Phase-0: the persistent lifecycle progress bar for an RFQ detail page.
// Presentational only — pass the derived `current` stage (see lib/rfq-stage.ts).
// Source-agnostic and backend-free: stages are derived, not stored.

import { Check } from "lucide-react";
import { RFQ_STAGES, RFQ_STAGE_META, stageIndex, type RfqStage } from "@/lib/rfq-stage";

type StepState = "done" | "current" | "todo";

function nodeStyle(state: StepState): React.CSSProperties {
  if (state === "done") return { background: "var(--accent)", color: "#fff" };
  if (state === "current")
    return {
      background: "#fff",
      color: "var(--accent)",
      border: "3px solid var(--accent)",
      boxShadow: "0 0 0 5px color-mix(in srgb, var(--accent) 16%, transparent)",
    };
  return { background: "#E5EAE8", color: "#9aa8a3" };
}

export interface StatusStepperProps {
  current: RfqStage;
  /** Override the stage set (e.g. SR before later stages exist). Defaults to all 6. */
  stages?: readonly RfqStage[];
  className?: string;
}

export function StatusStepper({ current, stages = RFQ_STAGES, className }: StatusStepperProps) {
  const curIdx = stageIndex(current);

  return (
    <ol className={`flex items-start ${className ?? ""}`}>
      {stages.map((stage, i) => {
        const idx = stageIndex(stage);
        const state: StepState = idx < curIdx ? "done" : idx === curIdx ? "current" : "todo";
        const meta = RFQ_STAGE_META[stage];
        const reached = idx <= curIdx;
        return (
          <li
            key={stage}
            className="relative flex min-w-0 flex-1 flex-col items-center px-1 text-center"
          >
            {i > 0 && (
              <span
                aria-hidden
                className="absolute right-1/2 top-[18px] h-[3px] w-full"
                style={{ background: reached ? "var(--accent)" : "#E5EAE8" }}
              />
            )}
            <span
              className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
              style={nodeStyle(state)}
            >
              {state === "done" ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className="mt-2 text-xs font-semibold leading-tight"
              style={{
                color:
                  state === "todo"
                    ? "#9aa8a3"
                    : state === "current"
                      ? "var(--accent)"
                      : "var(--foreground)",
              }}
            >
              {meta.short}
            </span>
            <span
              className="mt-0.5 text-[10px] leading-tight"
              style={{ color: state === "todo" ? "#b9c6c0" : "var(--muted-foreground)" }}
            >
              {meta.sublabel}
            </span>
            {state === "current" && (
              <span
                className="mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: meta.badge.bg, color: meta.badge.fg }}
              >
                you are here
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
