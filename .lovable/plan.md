# Sarooj Procurement Dashboard — Build Plan

Internal, auth-gated procurement dashboard for Sarooj Construction. Connects to an **external** Supabase project (`fimfybfgjrbkcylmyekz`) using the `scc_procurement` schema via `@supabase/supabase-js`. No Lovable Cloud / no new backend provisioning — we just consume the existing DB and Supabase Auth.

## Stack & setup

- TanStack Start (existing template) + Tailwind v4 + shadcn/ui components already present.
- Add deps: `@supabase/supabase-js`.
- Google Fonts: DM Serif Display + DM Sans loaded via `<link>` in `__root.tsx` head.
- Design tokens added to `src/styles.css` (oklch equivalents of the spec hex palette + semantic tokens: `--sidebar`, `--sidebar-foreground`, `--accent-green`, `--module-vendor`, badge tokens, etc.). Components use tokens — no raw hex in JSX.
- Supabase client at `src/integrations/supabase-external/client.ts`:
  ```ts
  createClient(url, anonKey, { db: { schema: 'scc_procurement' } })
  ```
  URL + anon key hardcoded as `VITE_*` constants (anon key is publishable, safe in client). Auth persistence via Supabase's default localStorage.

## Routing (file-based, TanStack Start)

```
src/routes/
  __root.tsx                          # fonts, QueryClient, Toaster, auth listener
  login.tsx                           # public — email/password + forgot password
  reset-password.tsx                  # public — handles recovery flow
  _app.tsx                            # protected layout: sidebar + outlet, beforeLoad redirect to /login
  _app/index.tsx                      # Dashboard (stats + recent registrations)
  _app/vendors.tsx                    # Vendor Master list
  _app/vendors.$vendorId.tsx          # Vendor Profile with 3 tabs
  _app/pending.tsx                    # Pending Registrations queue
  _app/outreach.tsx                   # Placeholder page
  _app/settings.tsx                   # Minimal placeholder
```

Auth gate lives in `_app.tsx` `beforeLoad`, reading a small auth context populated at root from `supabase.auth.getSession()` + `onAuthStateChange`. On sign-out / token change → `router.invalidate()` + query cache invalidate.

## Components

- `AppSidebar` — fixed 240px dark-green sidebar, brand, user email, nav items (Dashboard, Vendors, Pending Registrations w/ live count badge from a small query, Outreach, Settings), logout at bottom. Collapses to hamburger on mobile.
- `StatCard`, `StatusBadge` (maps status → token), `ConfidenceDot`, `CategoryTags`, `VendorTypePill`, `EmptyState`, `LoadingSkeleton`, `ConfirmDialog` (reuse shadcn AlertDialog), `ErrorBanner`.
- Toasts via existing `sonner`.

## Data layer

All reads via TanStack Query hooks calling the external Supabase client directly from components (this is a SPA-style consumer of someone else's DB — no server functions needed, no RLS gymnastics on our side).

Key queries:
- Dashboard stats: 4 parallel `select('*', { count: 'exact', head: true })` with filters.
- Recent registrations: `vendors` where `source_sheet='registration_form'` order `created_at.desc` limit 10.
- Vendors list: paginated (`range(from,to)`) with ilike search + eq filters, `count: 'exact'` for pagination.
- Vendor profile: single by `vendor_id`.
- Documents: `vendor_documents` by vendor.
- Validations / Outreach history tables by vendor.
- Pending queue: `vendors` where `status='pending_review'` order `created_at.desc`.
- Pending count for sidebar badge: head + count query.

Mutations: PATCH `vendors.status` for Approve/Reject, then `queryClient.invalidateQueries`.

## Pages

1. **Login** — email/password form, "Forgot password?" triggers `resetPasswordForEmail({ redirectTo: origin + '/reset-password' })`. Errors mapped to the spec copy.
2. **Reset password** — detects recovery hash, shows new-password form, calls `updateUser({ password })`, redirects to `/`.
3. **Dashboard** — 2×2 stat grid (Total / Pending / Active / Duplicates) + Recent Registrations table.
4. **Vendors** — top bar with Export to Excel (CSV download of current filter) + Start Outreach Campaign (routes to /outreach). Filter card (search + 5 dropdowns + clear). Table with all spec columns, formatted enums, 3-dot row menu (View / Blacklist / Flag Duplicate — Blacklist & Flag Duplicate wired as status PATCH + a `duplicate_flag` PATCH). 50/page pagination.
5. **Vendor Profile** — header w/ badges + action buttons. shadcn Tabs: Profile (2-col grid + full-width sections, duplicate banner if flagged), Documents (table from `vendor_documents` w/ mandatory/missing styling), History (Validation + Outreach sub-tables).
6. **Pending Registrations** — card list per spec, duplicate/CR warning banners, mandatory-doc tick/X row, Approve/Reject confirm modals → PATCH status + toast + invalidate.
7. **Outreach** — placeholder per spec, stats row queried from `vendor_outreach` (counts), disabled Start Campaign with tooltip, history table.

## Formatting helpers

`src/lib/format.ts`: `formatVendorType`, `formatStatus`, `formatDate`, `formatSupplierType` — convert snake_case enums to Title Case.

## States

- Loading: skeleton rows/cards; stat cards show "—".
- Error: inline red banner + Retry (calls `refetch`).
- Empty: friendly empty states (Pending uses green check illustration via lucide `CheckCircle2`).

## Out of scope (phase 2)

Vendor editing forms, real outreach campaign execution, n8n "Request More Info" wiring (button shows a toast: "Coming soon — contact Zavia-ai").

## Open items I'll assume unless told otherwise

- Anon key in the prompt is treated as publishable; embedded in client code (no env file needed in Lovable).
- Routes use a pathless `_app` layout (not `_authenticated`) to keep naming neutral; behavior is identical.
- "Flag Duplicate" toggles `duplicate_flag=true` with a simple confirm; no notes field in v1.
- Export to Excel = CSV download (true .xlsx would need a heavy lib; CSV opens cleanly in Excel).
