import type { GenerateResponse } from "./subcontract-types";

interface RfqDraft {
  response: GenerateResponse;
  files: File[];
  fileTypes: string[];
}

// In-memory draft cache that carries the generate response + the selected File
// objects from /rfq/sub/new to /rfq/sub/$rfqId. File objects cannot be put in
// sessionStorage, so this mirrors the (non-persisted) Zustand store it replaces:
// same module-singleton lifetime, no extra dependency.
const drafts: Record<string, RfqDraft> = {};

export function setDraft(
  rfqId: string,
  response: GenerateResponse,
  files: File[],
  fileTypes: string[],
): void {
  drafts[rfqId] = { response, files, fileTypes };
}

export function getDraft(rfqId: string): RfqDraft | undefined {
  return drafts[rfqId];
}

export function clearFiles(rfqId: string): void {
  const draft = drafts[rfqId];
  if (draft) drafts[rfqId] = { ...draft, files: [], fileTypes: [] };
}
