export type WebhookResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Matches the materials flow, which hardcodes the n8n base in its route files.
const N8N_BASE_URL = "https://n8n.zavia-ai.com";

export async function postWebhook<T>(path: string, body: unknown): Promise<WebhookResult<T>> {
  const url = `${N8N_BASE_URL}${path}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text || res.statusText}` };
    }

    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { ok: false, error: message };
  }
}

export interface UploadResponse {
  success: boolean;
  attachment_id: string;
  filename: string;
  drive_file_url: string;
}

export async function uploadDocument(
  rfqId: string,
  file: File,
  fileType: string,
  contentBase64: string,
): Promise<WebhookResult<UploadResponse>> {
  return postWebhook<UploadResponse>("/webhook/scc-subcontract-rfq-upload", {
    rfq_id: rfqId,
    filename: file.name,
    file_type: fileType,
    mimeType: file.type || "application/octet-stream",
    content_base64: contentBase64,
  });
}
