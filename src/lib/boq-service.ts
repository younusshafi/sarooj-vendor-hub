/**
 * Client for the external BOQ parser service (the Python/LLM parser running on the
 * n8n server at /opt/boq-parser, FastAPI on :8001).
 *
 * This is the REAL parser — the gpt-4o vision + brain/hands pipeline. It replaces the
 * non-functional browser-side src/lib/boq-parse.ts for the subcontractor BOQ flow.
 *
 * During development the service is reached over an SSH tunnel:
 *   ssh -L 8001:127.0.0.1:8001 root@31.97.233.41
 * so the default base URL is http://localhost:8001. The base URL is configurable from
 * the /boq-tester page (persisted to localStorage) so we can point it elsewhere later.
 */

export type BoqRole = "HEADER" | "COLHEADER" | "SECTION" | "ITEM" | "NOTE" | "TOTAL";

export interface ParsedBoqRow {
  row_num: number;
  role: BoqRole | string;
  cells: string[];
}

export interface ParsedBoqCounts {
  items: number;
  sections: number;
  notes: number;
  total_rows: number;
}

export interface ParsedBoq {
  ok: boolean;
  filename: string;
  rfq_ref: string;
  project_title: string;
  scope: string;
  columns: string[];
  counts: ParsedBoqCounts;
  rows: ParsedBoqRow[];
  issues: string[];
  html: string;
  // present only on error responses
  error?: string;
  trace?: string;
}

const STORAGE_KEY = "boq-service-url";
const DEFAULT_URL = "http://localhost:8001";

export function getBoqServiceUrl(): string {
  if (typeof localStorage === "undefined") return DEFAULT_URL;
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_URL;
}

export function setBoqServiceUrl(url: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, url.trim().replace(/\/$/, ""));
}

function base(url: string): string {
  return url.trim().replace(/\/$/, "");
}

export async function checkBoqService(url: string): Promise<{ ok: boolean; keySet: boolean }> {
  try {
    const res = await fetch(`${base(url)}/health`);
    if (!res.ok) return { ok: false, keySet: false };
    const d = (await res.json()) as { ok?: boolean; openai_key_set?: boolean };
    return { ok: !!d.ok, keySet: !!d.openai_key_set };
  } catch {
    return { ok: false, keySet: false };
  }
}

export async function parseBoqPdfRemote(file: File, url: string): Promise<ParsedBoq> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${base(url)}/parse-pdf`, { method: "POST", body: form });

  // The service returns JSON for both success and handled errors (422/500).
  let data: ParsedBoq;
  try {
    data = (await res.json()) as ParsedBoq;
  } catch {
    throw new Error(`Service returned non-JSON (HTTP ${res.status} ${res.statusText})`);
  }

  if (!data.ok) {
    throw new Error(data.error || `Parse failed (HTTP ${res.status})`);
  }
  return data;
}
