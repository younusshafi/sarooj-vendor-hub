export function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const formatStatus = titleCase;
export const formatVendorType = titleCase;
export const formatSupplierType = titleCase;

export function formatDate(d: string | null | undefined): string {
  if (!d) return "Never";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "Never";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}