/**
 * BOQ (Bill of Quantities) parse utilities — browser-side, deterministic.
 * No AI involved. Lines are extracted by positional/header matching only.
 */
import * as XLSX from "xlsx";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BoqLine {
  item: number;
  description: string;
  unit: string;
  qty: number | null;
  line_type: string;
}

export interface ParseResult {
  lines: BoqLine[];
  preamble: string;
  sourceKind: "xlsx" | "pdf-text" | "manual";
  source_confidence: "high" | "manual";
  source_remark: string;
  candidateSheets?: string[];
}

// ── Common helpers ─────────────────────────────────────────────────────────────

const DESC_RE = /desc|item\s*desc|particular|work\s*item|scope/i;
const QTY_RE = /qty|quantity|quant/i;
const UNIT_RE = /unit|uom|u\/m|measure/i;
const RATE_RE = /rate|amount|price/i;

interface HeaderMap {
  descCol: number;
  qtyCol: number;
  unitCol: number;
}

function findHeaderRow(rows: unknown[][]): { rowIndex: number; map: HeaderMap } | null {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    let descCol = -1;
    let qtyCol = -1;
    let unitCol = -1;
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? "").trim();
      if (!cell) continue;
      if (descCol < 0 && DESC_RE.test(cell)) descCol = c;
      else if (qtyCol < 0 && QTY_RE.test(cell)) qtyCol = c;
      else if (unitCol < 0 && UNIT_RE.test(cell)) unitCol = c;
    }
    if (descCol >= 0 && (qtyCol >= 0 || unitCol >= 0)) {
      return { rowIndex: r, map: { descCol, qtyCol, unitCol } };
    }
  }
  return null;
}

function isItemRow(row: unknown[]): boolean {
  if (!Array.isArray(row) || row.length < 2) return false;
  // At least one cell should have non-empty text content
  return row.some((c) => String(c ?? "").trim().length > 0);
}

function parseNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ── xlsx parsing ───────────────────────────────────────────────────────────────

function sheetToRows(wb: XLSX.WorkBook, sheetName: string): unknown[][] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
}

function isCandidateSheet(rows: unknown[][]): boolean {
  return findHeaderRow(rows) !== null;
}

function extractLinesFromSheet(rows: unknown[][]): { lines: BoqLine[]; preamble: string } {
  const header = findHeaderRow(rows);
  if (!header) return { lines: [], preamble: "" };

  const { rowIndex, map } = header;
  const preambleRows: string[] = [];
  for (let r = 0; r < rowIndex; r++) {
    const text = (rows[r] ?? []).map((c) => String(c ?? "").trim()).filter(Boolean).join(" ");
    if (text) preambleRows.push(text);
  }

  const lines: BoqLine[] = [];
  let itemNum = 0;
  for (let r = rowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!isItemRow(row)) continue;
    const desc = String((row as unknown[])[map.descCol] ?? "").trim();
    if (!desc) continue;
    // Skip total/subtotal rows
    if (/^(sub\s*)?total/i.test(desc)) continue;

    itemNum++;
    const unit = map.unitCol >= 0 ? String((row as unknown[])[map.unitCol] ?? "").trim() : "";
    const qty = map.qtyCol >= 0 ? parseNumber((row as unknown[])[map.qtyCol]) : null;

    lines.push({
      item: itemNum,
      description: desc,
      unit,
      qty,
      line_type: "boq",
    });
  }

  return { lines, preamble: preambleRows.join("\n") };
}

export async function parseBoqXlsx(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const candidates: string[] = [];
  for (const name of wb.SheetNames) {
    const rows = sheetToRows(wb, name);
    if (isCandidateSheet(rows)) candidates.push(name);
  }

  if (candidates.length === 0) {
    // No parseable sheets — fall through to manual
    return {
      lines: [],
      preamble: "",
      sourceKind: "manual",
      source_confidence: "manual",
      source_remark: "No sheets with recognisable BOQ columns found. Enter lines manually.",
      candidateSheets: undefined,
    };
  }

  if (candidates.length > 1) {
    // Multiple candidates — return them for the UI to show a picker
    return {
      lines: [],
      preamble: "",
      sourceKind: "xlsx",
      source_confidence: "high",
      source_remark: "",
      candidateSheets: candidates,
    };
  }

  // Exactly one candidate
  const rows = sheetToRows(wb, candidates[0]);
  const { lines, preamble } = extractLinesFromSheet(rows);

  return {
    lines,
    preamble,
    sourceKind: "xlsx",
    source_confidence: "high",
    source_remark: `Parsed from sheet "${candidates[0]}"`,
  };
}

export async function parseBoqXlsxSheet(file: File, sheetName: string): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const rows = sheetToRows(wb, sheetName);
  const { lines, preamble } = extractLinesFromSheet(rows);

  return {
    lines,
    preamble,
    sourceKind: "xlsx",
    source_confidence: lines.length > 0 ? "high" : "manual",
    source_remark: lines.length > 0
      ? `Parsed from sheet "${sheetName}"`
      : `No item rows found in sheet "${sheetName}". Enter lines manually.`,
  };
}

// ── PDF text-layer parsing ─────────────────────────────────────────────────────

interface TextItem {
  str: string;
  transform: number[];
}

function groupTextItemsByLine(items: TextItem[], tolerance = 3): string[][] {
  if (!items.length) return [];

  // Sort by y (descending — PDF y goes bottom-up) then x
  const sorted = [...items].sort((a, b) => {
    const dy = b.transform[5] - a.transform[5];
    if (Math.abs(dy) > tolerance) return dy;
    return a.transform[4] - b.transform[4];
  });

  const lines: string[][] = [];
  let currentY = sorted[0].transform[5];
  let currentLine: string[] = [];

  for (const item of sorted) {
    if (Math.abs(item.transform[5] - currentY) > tolerance) {
      if (currentLine.length) lines.push(currentLine);
      currentLine = [];
      currentY = item.transform[5];
    }
    if (item.str.trim()) currentLine.push(item.str.trim());
  }
  if (currentLine.length) lines.push(currentLine);

  return lines;
}

const UNIT_TOKENS = new Set([
  "m", "m2", "m3", "m²", "m³", "nr", "no", "nos", "no.", "ls", "l.s", "l.s.",
  "kg", "ton", "t", "set", "sets", "lot", "lots", "ea", "each", "item",
  "pcs", "lm", "rm", "sm", "sqm", "cum", "day", "days", "month", "months",
  "hr", "hrs", "hour", "hours", "trip", "trips", "sum",
]);

function isUnitToken(s: string): boolean {
  return UNIT_TOKENS.has(s.toLowerCase().replace(/\.$/, ""));
}

function tryParseItemLine(cells: string[]): BoqLine | null {
  // Look for: a leading number, then description text, a unit token, a numeric qty
  if (cells.length < 2) return null;
  const joined = cells.join(" ");

  // Check if first cell is a number (item number)
  const firstNum = parseFloat(cells[0]);
  if (isNaN(firstNum)) return null;

  // Find the unit token and qty
  let unit = "";
  let qty: number | null = null;
  const descParts: string[] = [];

  for (let i = 1; i < cells.length; i++) {
    const cell = cells[i];
    if (!unit && isUnitToken(cell)) {
      unit = cell;
    } else if (unit && qty === null && !isNaN(parseFloat(cell.replace(/,/g, "")))) {
      qty = parseFloat(cell.replace(/,/g, ""));
    } else if (!unit && !isNaN(parseFloat(cell.replace(/,/g, ""))) && i >= cells.length - 3) {
      // Numeric near end — could be qty; check if next is unit
      const next = cells[i + 1];
      if (next && isUnitToken(next)) {
        qty = parseFloat(cell.replace(/,/g, ""));
        // unit will be caught next iteration
      } else if (i === cells.length - 1 || i === cells.length - 2) {
        // Last or second-to-last, treat as qty
        qty = parseFloat(cell.replace(/,/g, ""));
      } else {
        descParts.push(cell);
      }
    } else {
      descParts.push(cell);
    }
  }

  const description = descParts.join(" ").trim();
  if (!description) return null;

  return {
    item: Math.round(firstNum),
    description,
    unit: unit || "",
    qty,
    line_type: "boq",
  };
}

export async function parseBoqPdf(file: File): Promise<ParseResult> {
  // Dynamic import to keep pdfjs-dist out of the main bundle
  const pdfjsLib = await import("pdfjs-dist");
  // Use Vite ?url import for the bundled worker — version always matches the installed package
  const workerUrl = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.default;

  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;

  const allTextItems: TextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ("str" in item && typeof item.str === "string") {
        allTextItems.push({ str: item.str, transform: (item as any).transform ?? [1, 0, 0, 1, 0, 0] });
      }
    }
  }

  if (allTextItems.length === 0) {
    // Scanned PDF — no text layer
    return {
      lines: [],
      preamble: "",
      sourceKind: "manual",
      source_confidence: "manual",
      source_remark:
        "Source is a scanned copy — extracted lines entered/verified manually before issue.",
    };
  }

  const textLines = groupTextItemsByLine(allTextItems);
  const preambleRows: string[] = [];
  const lines: BoqLine[] = [];
  let foundFirst = false;

  for (const cells of textLines) {
    const parsed = tryParseItemLine(cells);
    if (parsed) {
      foundFirst = true;
      parsed.item = lines.length + 1; // renumber sequentially
      lines.push(parsed);
    } else if (!foundFirst) {
      preambleRows.push(cells.join(" "));
    }
  }

  if (lines.length === 0) {
    return {
      lines: [],
      preamble: preambleRows.join("\n"),
      sourceKind: "manual",
      source_confidence: "manual",
      source_remark:
        "Could not extract structured item rows from the PDF. Enter lines manually.",
    };
  }

  return {
    lines,
    preamble: preambleRows.join("\n"),
    sourceKind: "pdf-text",
    source_confidence: "high",
    source_remark: `Extracted ${lines.length} lines from PDF text layer`,
  };
}
