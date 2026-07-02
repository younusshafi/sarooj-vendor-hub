// Public, vendor-facing base URL for tokenized links (registration, corrections, invites).
// These links are emailed to outside vendors, so they must ALWAYS point at production —
// never at http://localhost:… when an officer happens to trigger them from a local copy.
// Override per-environment with VITE_PUBLIC_APP_URL; defaults to the production domain.
export const APP_BASE_URL: string = (
  (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) ||
  "https://sarooj-vendor-hub-code.vercel.app"
).replace(/\/+$/, "");

/** Build an absolute, public URL for a path (e.g. publicUrl(`/register/${token}`)). */
export function publicUrl(path: string): string {
  return `${APP_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
