// Mirrors the link-only transform that n8n WF8 ("Build Email Body") applies at SEND time,
// so the in-app covering-email preview shows what a vendor actually receives — not the raw
// stored body (which WF7 still generates with an inline item table). Keep this in sync with
// WF8's Build Email Body code node. The real per-vendor /bid link is injected at send; here
// we show a representative placeholder so the officer sees the link-first layout.

const PORTAL_NOTE =
  '<p style="color:#666;font-size:13px;">The full item schedule is in your online quotation form — open the link above.</p>';

const REPLY_BY_EMAIL =
  "Please reply directly to this email with your quotation. Responses received through any other channel will not be recorded in our system.";

const SUBMIT_BY_LINK =
  "Please submit your quotation using your secure online link above. Submissions are only recorded through that link.";

/** Transform a stored covering_email_body into the link-only form WF8 sends. */
export function toLinkOnlyPreview(body: string): string {
  if (!body) return body;
  let out = body.replace(/<table[\s\S]*?<\/table>/gi, PORTAL_NOTE);
  out = out.split(REPLY_BY_EMAIL).join(SUBMIT_BY_LINK);
  const cta =
    "<p><strong>Submit your quotation online:</strong> " +
    '<a href="#">https://sarooj-vendor-hub-code.vercel.app/bid/&lt;unique-per-vendor&gt;</a><br>' +
    '<span style="color:#555">This link is unique to each vendor and is the only way to submit a quote. ' +
    "It is inserted automatically when the RFQ is issued.</span></p>";
  // New thin templates carry a [SUBMIT_LINK] placeholder where the link should sit;
  // WF8 swaps it at send. Fallback (old templates): prepend the CTA.
  if (out.includes("[SUBMIT_LINK]")) return out.split("[SUBMIT_LINK]").join(cta);
  return cta + "<hr>" + out;
}
