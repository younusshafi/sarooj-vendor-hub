// Phase-0 foundation for the RFQ detail-page redesign (see docs/RFQ_FLOW_ALIGNMENT.html
// Part 4–5 + memory ux-redesign-philosophy). The lifecycle is DERIVED on the frontend
// from columns that already exist — there is NO persisted "stage" column and no backend
// change. Stage granularity = 6 (decision 2026-06-28).
//
// Source-agnostic: a stage never depends on HOW items were ingested (SAP/WF7 today, or the
// Python/LLM parser for MR later) — only on rfqs.status + bids + comparison.status.

export type RfqStage =
  | "draft"
  | "issued"
  | "responses_in"
  | "evaluation"
  | "approved"
  | "po_issued";

/** Ordered, start → finish. Index in this array = position in the stepper. */
export const RFQ_STAGES: readonly RfqStage[] = [
  "draft",
  "issued",
  "responses_in",
  "evaluation",
  "approved",
  "po_issued",
] as const;

export interface RfqStageMeta {
  key: RfqStage;
  /** Full label. */
  label: string;
  /** Compact label for the stepper node. */
  short: string;
  /** One-line "what this means". */
  sublabel: string;
  /** Badge tokens (aligned with the existing status palette / comparison screen). */
  badge: { bg: string; fg: string };
}

export const RFQ_STAGE_META: Record<RfqStage, RfqStageMeta> = {
  draft: {
    key: "draft",
    label: "Draft",
    short: "Draft",
    sublabel: "created, not sent",
    badge: { bg: "#E5EAE8", fg: "#0D3D2E" },
  },
  issued: {
    key: "issued",
    label: "Issued — awaiting responses",
    short: "Issued",
    sublabel: "awaiting responses",
    badge: { bg: "#E8EFF7", fg: "#1A3A5C" },
  },
  responses_in: {
    key: "responses_in",
    label: "Responses in",
    short: "Responses In",
    sublabel: "bids arriving",
    badge: { bg: "#FDF3E0", fg: "#7A5200" },
  },
  evaluation: {
    key: "evaluation",
    label: "Evaluation",
    short: "Evaluation",
    sublabel: "compare & award",
    badge: { bg: "#E0E7FF", fg: "#3730A3" },
  },
  approved: {
    key: "approved",
    label: "Approved — PO pending",
    short: "Approved",
    sublabel: "by approver",
    badge: { bg: "#FDF3E0", fg: "#7A5200" },
  },
  po_issued: {
    key: "po_issued",
    label: "PO issued — closed",
    short: "PO Issued",
    sublabel: "closed",
    badge: { bg: "#E0F2EA", fg: "#0D5C3A" },
  },
};

/** Signals required to place an RFQ on the lifecycle — all already in the DB. */
export interface RfqStageSignals {
  /** rfqs.status (draft | issued | …). */
  status: string | null;
  /** Number of bids received for this RFQ. */
  bidCount: number;
  /** comparison.status, or null when no comparison row exists yet. */
  comparisonStatus?: string | null;
  /** Whether any line has been awarded (comparison_awards / sr_award exists). */
  hasAwards?: boolean;
}

/**
 * Derive the canonical stage. Ordered most-advanced → least so the furthest signal wins.
 * Note: a comparison row is auto-created (status 'draft') just by opening the comparison
 * screen, so a bare 'draft' comparison must NOT force Evaluation — only awards / submission do.
 */
export function deriveStage(s: RfqStageSignals): RfqStage {
  const cmp = s.comparisonStatus ?? null;
  if (cmp === "po_issued") return "po_issued";
  if (cmp === "approved") return "approved";
  if (cmp === "pending_approval" || cmp === "finalised" || s.hasAwards) return "evaluation";
  if (s.bidCount > 0) return "responses_in";
  if (s.status === "issued" || s.status === "sent") return "issued";
  return "draft";
}

/** Signals for the subcontractor (SR) flow — derived from the sr_* tables. */
export interface SrStageSignals {
  /** rfqs.status. */
  rfqStatus: string | null;
  /** An sr_boq with status 'issued' exists for this RFQ. */
  boqIssued: boolean;
  /** Number of latest sr_bid rows. */
  bidCount: number;
  /** Number of sr_award rows (any line awarded). */
  awardCount: number;
}

/**
 * Derive the SR stage. SR has no formal approval→PO flow yet, so it tops out at
 * "evaluation"; the stepper renders Approved / PO Issued as upcoming (greyed) —
 * honest about what isn't built.
 */
export function deriveSrStage(s: SrStageSignals): RfqStage {
  if (s.awardCount > 0) return "evaluation";
  if (s.bidCount > 0) return "responses_in";
  if (s.boqIssued || s.rfqStatus === "issued" || s.rfqStatus === "sent") return "issued";
  return "draft";
}

export function stageIndex(stage: RfqStage): number {
  return RFQ_STAGES.indexOf(stage);
}

/** Where `stage` sits relative to `current`: done (past), current, or todo (future). */
export function stageState(stage: RfqStage, current: RfqStage): "done" | "current" | "todo" {
  const a = stageIndex(stage);
  const b = stageIndex(current);
  if (a < b) return "done";
  if (a === b) return "current";
  return "todo";
}

/**
 * Progressive-disclosure gate: what's actionable at a given stage. Pure function (use
 * directly in render — no hook needed). Replaces the scattered `isDraft` checks.
 */
export interface StageGate {
  canEditContent: boolean; // items / covering email editable
  canSelectRecipients: boolean; // choose vendors
  canDispatch: boolean; // send the RFQ
  showBidLinks: boolean; // hand out /bid links
  canReviewBids: boolean; // review incoming bids
  canCompareAward: boolean; // open comparison + award lines
  canSubmitApproval: boolean; // submit to approver
  canIssuePo: boolean; // record the PO
  isClosed: boolean; // locked / terminal
}

export function stageGate(stage: RfqStage): StageGate {
  const i = stageIndex(stage);
  const atLeast = (s: RfqStage) => i >= stageIndex(s);
  const isDraft = stage === "draft";
  return {
    canEditContent: isDraft,
    canSelectRecipients: isDraft,
    canDispatch: isDraft,
    showBidLinks: atLeast("issued"),
    canReviewBids: atLeast("responses_in"),
    canCompareAward: atLeast("responses_in"),
    canSubmitApproval: stage === "evaluation",
    canIssuePo: stage === "approved",
    isClosed: stage === "po_issued",
  };
}
