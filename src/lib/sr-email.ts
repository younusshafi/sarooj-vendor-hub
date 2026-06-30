// Builds the subcontractor invitation email from a plain-text officer message,
// wrapped in the project's CHARCOAL brand template (matches the /sr-bid document
// chrome). The officer never edits HTML — they type a normal message; this turns
// it into the rich email and injects the per-vendor link + deadline.

const INK = "#232227"; // --foreground / --header
const ACCENT = "#98191D"; // --primary / --accent (crimson)
const BORDER = "#D5D3D2"; // --border
const MUTED = "#6B696E"; // --muted-foreground
const PAPER = "#F6F4F3"; // --background

/** Sensible default message if the officer hasn't written one. Plain text. */
export const DEFAULT_INVITE_MESSAGE =
  "Sarooj Construction invites you to submit a quotation for our subcontract package. " +
  "The full bill of quantities and scope of works are in your secure online quotation form — " +
  "please review them there and enter your rates.";

export const DEFAULT_INVITE_SUBJECT = "Invitation to quote — subcontract RFQ";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Plain text → HTML paragraphs (blank line = new paragraph, single newline = <br>). */
function plainToHtml(s: string): string {
  return s
    .trim()
    .split(/\n\s*\n/)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

/** Key details shown in the invite (FAT/SME, terms, Drive + T&C links). */
export interface InviteDetails {
  driveUrl?: string | null;
  tcUrl?: string | null;
  paymentTerms?: string | null;
  subcontractPeriod?: string | null;
  fatBy?: string | null;
  equipmentBy?: string | null;
  materialsBy?: string | null;
  smeRequired?: boolean | null;
}

export interface InviteArgs {
  company: string;
  link: string;
  deadline?: string | null;
  message?: string | null;
  details?: InviteDetails;
}

function detailRow(label: string, valueHtml: string): string {
  return `<tr><td style="padding:4px 12px 4px 0;color:${MUTED};font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:4px 0;font-size:13px;">${valueHtml}</td></tr>`;
}

function detailsHtml(d?: InviteDetails): string {
  if (!d) return "";
  const rows: string[] = [];
  if (d.paymentTerms) rows.push(detailRow("Payment terms", escapeHtml(d.paymentTerms)));
  if (d.subcontractPeriod)
    rows.push(detailRow("Subcontract period", escapeHtml(d.subcontractPeriod)));
  if (d.fatBy) rows.push(detailRow("FAT by", escapeHtml(d.fatBy)));
  if (d.equipmentBy) rows.push(detailRow("Equipment by", escapeHtml(d.equipmentBy)));
  if (d.materialsBy) rows.push(detailRow("Materials by", escapeHtml(d.materialsBy)));
  if (d.smeRequired != null) rows.push(detailRow("SME required", d.smeRequired ? "Yes" : "No"));
  if (d.driveUrl)
    rows.push(
      detailRow(
        "Scope documents",
        `<a href="${d.driveUrl}" style="color:${ACCENT};">Open the Drive folder</a>`,
      ),
    );
  if (d.tcUrl)
    rows.push(
      detailRow(
        "Terms &amp; conditions",
        `<a href="${d.tcUrl}" style="color:${ACCENT};">View terms &amp; conditions</a>`,
      ),
    );
  if (!rows.length) return "";
  return `<div style="margin:8px 0 4px;padding:14px 16px;background:${PAPER};border:1px solid ${BORDER};border-radius:8px;">
    <div style="font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.6px;color:${MUTED};margin-bottom:8px;">Key details</div>
    <table style="border-collapse:collapse;">${rows.join("")}</table>
  </div>`;
}

/** The rich, charcoal-branded HTML email. */
export function buildInviteHtml({ company, link, deadline, message, details }: InviteArgs): string {
  const body = message && message.trim() ? message : DEFAULT_INVITE_MESSAGE;
  const deadlineLine = deadline
    ? `<p style="margin:0 0 16px;line-height:1.6;font-size:13px;color:${MUTED};">Quotations are due by <strong>${escapeHtml(
        deadline,
      )}</strong>.</p>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:${INK};max-width:600px;margin:0 auto;">
  <div style="background:${INK};padding:18px 24px;border-radius:8px 8px 0 0;">
    <div style="font-family:Georgia,'Times New Roman',serif;color:#ffffff;font-size:20px;line-height:1.2;">Sarooj Construction Company</div>
    <div style="color:#ffffff;opacity:.8;font-size:12px;margin-top:4px;">Invitation to Quote &mdash; Subcontract</div>
  </div>
  <div style="padding:24px;background:#ffffff;border:1px solid ${BORDER};border-top:none;border-radius:0 0 8px 8px;">
    <p style="margin:0 0 14px;">Dear ${escapeHtml(company)},</p>
    ${plainToHtml(body)}
    ${detailsHtml(details)}
    ${deadlineLine}
    <div style="text-align:center;margin:26px 0;">
      <a href="${link}" style="background:${ACCENT};color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:6px;font-weight:bold;font-size:15px;display:inline-block;">Open your quotation form &rarr;</a>
    </div>
    <p style="margin:0 0 16px;line-height:1.6;font-size:13px;color:${MUTED};">This link is unique to you and is the only way your quotation can be recorded. Submissions through any other channel will not be accepted.</p>
    <p style="margin:0 0 6px;line-height:1.6;">If you have any questions about the scope, simply reply to this email.</p>
    <p style="margin:18px 0 0;font-weight:bold;">Sarooj Construction &mdash; Procurement</p>
  </div>
  <div style="padding:10px 24px;font-size:11px;color:${MUTED};">This is an automated message from the Sarooj Procurement system.</div>
</div>`;
}

function detailsText(d?: InviteDetails): string {
  if (!d) return "";
  const lines: string[] = [];
  if (d.paymentTerms) lines.push(`Payment terms: ${d.paymentTerms}`);
  if (d.subcontractPeriod) lines.push(`Subcontract period: ${d.subcontractPeriod}`);
  if (d.fatBy) lines.push(`FAT by: ${d.fatBy}`);
  if (d.equipmentBy) lines.push(`Equipment by: ${d.equipmentBy}`);
  if (d.materialsBy) lines.push(`Materials by: ${d.materialsBy}`);
  if (d.smeRequired != null) lines.push(`SME required: ${d.smeRequired ? "Yes" : "No"}`);
  if (d.driveUrl) lines.push(`Scope documents (Drive): ${d.driveUrl}`);
  if (d.tcUrl) lines.push(`Terms & conditions: ${d.tcUrl}`);
  return lines.length ? `\n\nKey details:\n${lines.map((l) => `- ${l}`).join("\n")}` : "";
}

/** Plain-text fallback body (for clients that don't render HTML). */
export function buildInviteText({ company, link, deadline, message, details }: InviteArgs): string {
  const body = message && message.trim() ? message : DEFAULT_INVITE_MESSAGE;
  const deadlineLine = deadline ? `\n\nQuotations are due by ${deadline}.` : "";
  return (
    `Dear ${company},\n\n` +
    `${body}${deadlineLine}` +
    `${detailsText(details)}\n\n` +
    `Submit your quotation online:\n${link}\n\n` +
    `This link is unique to you and is the only way your quotation can be recorded; ` +
    `submissions through any other channel will not be accepted.\n\n` +
    `If you have any questions about the scope, please reply to this email.\n\n` +
    `Sarooj Construction — Procurement`
  );
}
