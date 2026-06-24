/**
 * Build an inline-styled HTML schedule table from rfq_items for the covering email,
 * and inject it into the email body (idempotent via HTML comment markers).
 */

const MARKER_START = "<!--FRAME_SCHEDULE_START-->";
const MARKER_END = "<!--FRAME_SCHEDULE_END-->";

interface FrameItem {
  item_number: number | null;
  description: string;
  unit: string | null;
  quantity: number | null;
}

/**
 * Build the HTML table string for the schedule of works.
 */
export function buildScheduleHtml(items: FrameItem[]): string {
  const headerStyle =
    'style="border:1px solid #C8DDD7;padding:6px 10px;background:#F4F8F6;' +
    'font-size:12px;font-weight:600;text-align:left;color:#0D3D2E"';
  const cellStyle =
    'style="border:1px solid #C8DDD7;padding:6px 10px;font-size:12px;color:#1a1a1a"';
  const cellRightStyle =
    'style="border:1px solid #C8DDD7;padding:6px 10px;font-size:12px;color:#1a1a1a;text-align:right"';
  const emptyStyle =
    'style="border:1px solid #C8DDD7;padding:6px 10px;font-size:12px;color:#999;text-align:right"';

  let html = `<table style="width:100%;border-collapse:collapse;margin:16px 0" cellpadding="0" cellspacing="0">\n`;
  html += `<thead><tr>`;
  html += `<th ${headerStyle}>#</th>`;
  html += `<th ${headerStyle}>Description</th>`;
  html += `<th ${headerStyle}>Unit</th>`;
  html += `<th ${headerStyle} style="border:1px solid #C8DDD7;padding:6px 10px;background:#F4F8F6;font-size:12px;font-weight:600;text-align:right;color:#0D3D2E">Qty</th>`;
  html += `<th ${headerStyle} style="border:1px solid #C8DDD7;padding:6px 10px;background:#F4F8F6;font-size:12px;font-weight:600;text-align:right;color:#0D3D2E">Rate (OMR)</th>`;
  html += `<th ${headerStyle} style="border:1px solid #C8DDD7;padding:6px 10px;background:#F4F8F6;font-size:12px;font-weight:600;text-align:right;color:#0D3D2E">Amount (OMR)</th>`;
  html += `</tr></thead>\n<tbody>\n`;

  for (const item of items) {
    html += `<tr>`;
    html += `<td ${cellStyle}>${item.item_number ?? ""}</td>`;
    html += `<td ${cellStyle}>${escapeHtml(item.description)}</td>`;
    html += `<td ${cellStyle}>${escapeHtml(item.unit ?? "")}</td>`;
    html += `<td ${cellRightStyle}>${item.quantity ?? ""}</td>`;
    html += `<td ${emptyStyle}>&nbsp;</td>`;
    html += `<td ${emptyStyle}>&nbsp;</td>`;
    html += `</tr>\n`;
  }

  html += `</tbody></table>`;
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Inject the schedule table into the email body (idempotent — replaces if markers exist).
 */
export function injectScheduleIntoBody(currentBody: string, items: FrameItem[]): string {
  const tableHtml = buildScheduleHtml(items);
  const markedBlock = `${MARKER_START}\n<p style="font-size:13px;font-weight:600;color:#0D3D2E;margin:16px 0 4px">Schedule of Works</p>\n${tableHtml}\n${MARKER_END}`;

  // If markers already exist, replace content between them
  const startIdx = currentBody.indexOf(MARKER_START);
  const endIdx = currentBody.indexOf(MARKER_END);
  if (startIdx >= 0 && endIdx >= 0) {
    return (
      currentBody.slice(0, startIdx) + markedBlock + currentBody.slice(endIdx + MARKER_END.length)
    );
  }

  // No markers — insert ABOVE the signature/sign-off block.
  // Detect the earliest sign-off marker among common variants (incl. the
  // [SENDER_NAME] signature placeholder used in the covering email template).
  const signoffPatterns = [
    /\[SENDER_NAME\]/i,
    /\bThanks\s*(&|&amp;)?\s*Regards\b/i,
    /\b(Best|Kind|Warm)\s+Regards\b/i,
    /\bRegards\b/i,
    /\bSincerely\b/i,
    /\bYours\s+(faithfully|truly|sincerely)\b/i,
    /Procurement\s+(Department|Officer|Manager)/i,
  ];
  let signoffIdx = -1;
  for (const re of signoffPatterns) {
    const m = currentBody.search(re);
    if (m >= 0 && (signoffIdx < 0 || m < signoffIdx)) signoffIdx = m;
  }
  if (signoffIdx >= 0) {
    // Back up to the start of the paragraph containing the sign-off so we
    // insert before the whole block rather than splitting an HTML tag.
    const pIdx = currentBody.lastIndexOf("<p", signoffIdx);
    const insertAt = pIdx >= 0 ? pIdx : signoffIdx;
    return currentBody.slice(0, insertAt) + markedBlock + "\n\n" + currentBody.slice(insertAt);
  }

  // Fallback: append at end
  return currentBody + "\n\n" + markedBlock;
}

/**
 * Update "BOQ: NO" → "BOQ: YES (schedule below)" in the email body.
 */
export function updateBoqFlag(body: string): string {
  return body.replace(/BOQ:\s*NO/gi, "BOQ: YES (schedule below)");
}

/**
 * Update intro line from "as per the BOQ in Drive" to "price the schedule of works set out below"
 */
export function updateIntroLine(body: string): string {
  return body.replace(/as per the BOQ in Drive/gi, "price the schedule of works set out below");
}
