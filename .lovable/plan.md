# Fix: Documents tab reads from Supabase Storage

## Problem
The Documents tab queries `scc_procurement.vendor_documents`, which is empty. Files actually live in the `vendor-documents` Storage bucket under `vendor-docs-pending/{timestamp}_{slug}/{document_type}/{filename}`. The n8n webhook uploads files but never inserts rows into `vendor_documents`.

## Approach
Rewrite the `DocumentsTab` component in `src/routes/_app/vendors.$vendorId.tsx` to list files directly from Storage instead of querying `vendor_documents`. Group files by `{document_type}` folder. No schema or backend changes.

## Locating a vendor's folder
The folder prefix encodes a timestamp + slug, not the vendor_id, so we can't construct the path directly. Strategy:
1. Build a slug from `vendor.company_name` (lowercase, non-alphanumerics → `_`, trim) — matches typical n8n slugify output.
2. Call `supabase.storage.from('vendor-documents').list('vendor-docs-pending', { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } })`.
3. Filter top-level folders whose name ends with `_{slug}` (case-insensitive). If multiple match, pick the one whose timestamp is closest to (but not after) `vendor.created_at`. If none match, fall back to substring match on slug fragments.
4. For each matched folder, list sub-folders (`{document_type}`), then list files inside each. Flatten to `{ documentType, filename, path, sizeBytes, uploadedAt }`.

## Display
Replace the current table with one column set:
- Document type (title-cased folder name)
- Filename (click → opens signed URL in new tab)
- Size
- Uploaded date

Use `supabase.storage.from('vendor-documents').createSignedUrl(path, 60)` on click; if the bucket is public, fall back to `getPublicUrl`.

Empty state: "No documents found in storage for this vendor." Loading and error states preserved.

## Out of scope
- Backfilling `vendor_documents` table rows.
- Changing the n8n workflow.
- Editing the bucket's RLS — assumes the signed-in user already has read access to `vendor-documents` objects (current Supabase auth session is attached automatically).

## Files touched
- `src/routes/_app/vendors.$vendorId.tsx` — replace `DocumentsTab` implementation only.

## Caveats to flag to the user after build
- If the bucket has no SELECT policy for `authenticated`, the list call will return an empty array silently. I'll surface the raw storage error in the UI so this is visible.
- Slug matching is heuristic; if folder naming differs from the documented pattern (e.g. uses `vendor_id` instead of slug), I'll need a sample folder name to adjust.
