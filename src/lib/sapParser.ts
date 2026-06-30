/**
 * Format-agnostic parser for SAP "Purchase Requisition" Excel exports.
 *
 * Why this exists: SAP exports are NOT stable. Two genuine exports five weeks apart
 * (May vs June 2026) differed in:
 *   - column order  (PR Number <-> Item Number were swapped)
 *   - column count  (a "Material Group" column was inserted at index 4, shifting the rest)
 *   - status values ("Not edited (N)", "PO created (B)" vs "Not edited (N)" only)
 * The sheet name happened to stay "SAPUI5 Export" both times, but different SAP users
 * configure their layouts differently, so even that is not guaranteed.
 *
 * So we resolve EVERYTHING by content, never by position:
 *   - the worksheet is picked by which sheet's header best matches known columns,
 *   - the header row is found by scanning the first rows (SAP sometimes prepends titles),
 *   - each field is mapped from its header NAME via an alias table,
 *   - the processing status is read from the parenthetical code (B = PO created).
 * If a required column can't be resolved, the caller shows a manual-mapping UI; this
 * module exposes the detected headers + auto-mapping so that UI can pre-fill its selects.
 */
import * as XLSX from "xlsx";

export interface SAPRow {
  pr_number: string;
  item_number: number;
  material_id: string;
  item_details: string;
  quantity: number;
  unit: string;
  processing_status: string;
  delivery_date: string | null;
}

/** The fields we map out of a SAP sheet. (Material Group etc. are ignored.) */
export type SapField =
  | "pr_number"
  | "item_number"
  | "material_id"
  | "item_details"
  | "quantity"
  | "processing_status"
  | "delivery_date";

/** Without these we cannot generate an RFQ, so the manual-mapping UI is forced. */
export const REQUIRED_FIELDS: SapField[] = ["pr_number", "item_number", "material_id", "quantity"];

/** Nice to have, but parsing proceeds without them. */
export const OPTIONAL_FIELDS: SapField[] = ["item_details", "processing_status", "delivery_date"];

/** Display order for the mapping UI. */
export const ALL_FIELDS: SapField[] = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

export const FIELD_LABELS: Record<SapField, string> = {
  pr_number: "PR Number",
  item_number: "Item Number",
  material_id: "Material ID",
  item_details: "Item Details",
  quantity: "Quantity",
  processing_status: "Processing Status",
  delivery_date: "Delivery Date",
};

/** A column mapping: field -> column index (null = unmapped). */
export type ColumnMapping = Record<SapField, number | null>;

export interface ParsedSheet {
  /** Worksheet we chose. */
  sheetName: string;
  /** All worksheet names (so the UI can offer to switch). */
  sheetNames: string[];
  /** Header cells (as strings) of the detected header row. */
  headers: string[];
  /** Data rows after the header row (still raw cell values). */
  dataRows: unknown[][];
  /** Auto-resolved mapping; missing fields are null. */
  mapping: ColumnMapping;
  /** Required fields the auto-resolver could NOT find. Empty => clean parse. */
  missing: SapField[];
}

// ---------------------------------------------------------------------------
// Header matching
// ---------------------------------------------------------------------------

/** lowercase, strip punctuation, collapse whitespace — so "Material ID" ~ "material_id". */
function normalizeHeader(h: string): string {
  return String(h ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const has = (h: string, ...needles: string[]) => needles.some((n) => h.includes(n));

/**
 * Predicate per field over the NORMALIZED header. Resolution order (below) matters because
 * some headers are ambiguous — e.g. "Item Number of Purchase Requisition" contains both
 * "item" and "requisition number". We match item_number first and claim that column, so
 * pr_number then matches the other "...requisition number" column. SAP technical field
 * names (BANFN/BNFPO/MATNR/MENGE/LFDAT) are included as a safety net.
 */
const MATCHERS: Record<SapField, (h: string) => boolean> = {
  item_number: (h) => has(h, "item number", "item no", "bnfpo") || h === "item",
  pr_number: (h) =>
    has(h, "requisition number", "pr number", "purchase req", "banfn") ||
    (h.includes("requisition") && h.includes("number")),
  // Must NOT grab "Material Group": require an id/number/code qualifier (or exactly "material").
  material_id: (h) =>
    has(h, "material id", "material number", "material no", "material code", "matnr") ||
    h === "material",
  quantity: (h) => has(h, "quantity", "qty", "menge"),
  processing_status: (h) => has(h, "processing status", "status", "statu"),
  delivery_date: (h) =>
    has(h, "delivery date", "deliv date", "del date", "lfdat") ||
    (h.includes("delivery") && h.includes("date")),
  item_details: (h) =>
    has(h, "item details", "short text", "description", "txz01", "item text") ||
    h === "details" ||
    h === "text",
};

/** Most-specific / disambiguating fields first; each column is claimed once. */
const RESOLUTION_ORDER: SapField[] = [
  "item_number",
  "pr_number",
  "material_id",
  "delivery_date",
  "processing_status",
  "quantity",
  "item_details",
];

/** Resolve a header row to a field->column map, claiming each column at most once. */
export function resolveColumns(headers: string[]): ColumnMapping {
  const norm = headers.map(normalizeHeader);
  const claimed = new Set<number>();
  const map: ColumnMapping = {
    pr_number: null,
    item_number: null,
    material_id: null,
    item_details: null,
    quantity: null,
    processing_status: null,
    delivery_date: null,
  };
  for (const field of RESOLUTION_ORDER) {
    const matcher = MATCHERS[field];
    for (let i = 0; i < norm.length; i++) {
      if (claimed.has(i) || !norm[i]) continue;
      if (matcher(norm[i])) {
        map[field] = i;
        claimed.add(i);
        break;
      }
    }
  }
  return map;
}

function scoreMapping(map: ColumnMapping): number {
  return ALL_FIELDS.reduce((n, f) => n + (map[f] != null ? 1 : 0), 0);
}

// ---------------------------------------------------------------------------
// Sheet + header-row detection
// ---------------------------------------------------------------------------

function sheetToMatrix(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false }) as unknown[][];
}

/** SAP sometimes prepends a title/filter row — scan the first rows for the real header. */
function findHeaderRow(rows: unknown[][]): number {
  let best = 0;
  let bestScore = -1;
  const limit = Math.min(15, rows.length);
  for (let i = 0; i < limit; i++) {
    const headers = (rows[i] ?? []).map((c) => String(c ?? ""));
    const score = scoreMapping(resolveColumns(headers));
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Pick the worksheet whose header resolves the most known fields (tie -> first). */
function pickSheet(wb: XLSX.WorkBook): string {
  if (wb.SheetNames.length <= 1) return wb.SheetNames[0];
  let best = wb.SheetNames[0];
  let bestScore = -1;
  for (const name of wb.SheetNames) {
    const rows = sheetToMatrix(wb.Sheets[name]);
    if (!rows.length) continue;
    const hr = findHeaderRow(rows);
    const score = scoreMapping(resolveColumns((rows[hr] ?? []).map((c) => String(c ?? ""))));
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------

function decodeExcelDate(serial: number): string {
  // 25569 = days between Excel's 1900 epoch and the Unix 1970 epoch.
  const date = new Date((serial - 25569) * 86400 * 1000);
  return date.toISOString().split("T")[0];
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(/[\s,]/g, "")); // tolerate "4,000" / "1 200"
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toDateString(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return decodeExcelDate(v);
  if (v instanceof Date) return v.toISOString().split("T")[0];
  if (typeof v === "string") return v;
  return null;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

// ---------------------------------------------------------------------------
// Processing-status interpretation (display/filtering only)
// ---------------------------------------------------------------------------

/** Extract the single-letter code SAP puts in parentheses: "PO created (B)" -> "B". */
export function statusCode(status: string): string | null {
  const m = /\(([A-Za-z]+)\)\s*$/.exec(str(status));
  return m ? m[1].toUpperCase() : null;
}

/**
 * Has this item already been turned into a PO (so it should be excluded from new RFQs)?
 * Canonical signal is the code "B" ("PO created (B)"); we also accept the bare text and the
 * legacy strings the old positional parser used, so nothing regresses.
 */
export function isPoCreated(status: string): boolean {
  const s = str(status).toLowerCase();
  return statusCode(status) === "B" || /po created/.test(s) || ["b", "po", "bsart"].includes(s);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read a workbook: pick the sheet, find the header row, auto-map columns. No throwing on
 *  layout drift — unresolved required fields come back in `missing` for the mapping UI. */
export function readWorkbook(file: File): Promise<ParsedSheet> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        if (!wb.SheetNames.length) {
          reject(new Error("This file has no worksheets."));
          return;
        }
        const sheetName = pickSheet(wb);
        const rows = sheetToMatrix(wb.Sheets[sheetName]);
        if (!rows.length) {
          reject(new Error(`Sheet "${sheetName}" is empty.`));
          return;
        }
        const headerRow = findHeaderRow(rows);
        const headers = (rows[headerRow] ?? []).map((c) => String(c ?? ""));
        const mapping = resolveColumns(headers);
        const dataRows = rows
          .slice(headerRow + 1)
          .filter((r) => r.some((c) => c != null && c !== ""));
        const missing = REQUIRED_FIELDS.filter((f) => mapping[f] == null);
        resolve({
          sheetName,
          sheetNames: wb.SheetNames,
          headers,
          dataRows,
          mapping,
          missing,
        });
      } catch (err: unknown) {
        reject(new Error(err instanceof Error ? err.message : "Failed to parse Excel file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

/** Apply a (possibly user-edited) column mapping to the data rows. Rows with neither a PR
 *  number nor an item number are dropped as blank/garbage. */
export function buildRows(sheet: ParsedSheet, mapping: ColumnMapping): SAPRow[] {
  const at = (r: unknown[], idx: number | null) => (idx == null ? undefined : r[idx]);
  return sheet.dataRows
    .map((r) => ({
      pr_number: str(at(r, mapping.pr_number)),
      item_number: toNumber(at(r, mapping.item_number)),
      material_id: str(at(r, mapping.material_id)),
      item_details: str(at(r, mapping.item_details)),
      quantity: toNumber(at(r, mapping.quantity)),
      unit: "",
      processing_status: str(at(r, mapping.processing_status)),
      delivery_date: toDateString(at(r, mapping.delivery_date)),
    }))
    .filter((row) => row.pr_number !== "" || row.item_number !== 0);
}
