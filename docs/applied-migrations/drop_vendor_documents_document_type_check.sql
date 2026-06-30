-- Applied 2026-06-30 to scc_procurement (reference copy).
-- BUG (vendor module, demo): "Approve pending vendor update" returned 400.
-- Root cause: vendor_update_apply inserts vendor_documents rows whose document_type
-- comes from the registration form's HUMAN LABELS ("Company Profile", "Tax Certificate",
-- "Authorised Signatory + ID", ...), but vendor_documents.document_type had a CHECK
-- constraint that only allowed snake_case slugs (company_profile, cr_certificate, ...).
-- Every approval of a submission-with-documents violated the constraint -> 400.
-- Fix: the form owns the document categories (and they will evolve with recategorisation),
-- so the DB-level enum is the wrong place to enforce them. Drop the constraint.
-- Verified: vendor_update_apply now succeeds (tested on a real pending request, rolled back).
alter table scc_procurement.vendor_documents
  drop constraint if exists vendor_documents_document_type_check;
