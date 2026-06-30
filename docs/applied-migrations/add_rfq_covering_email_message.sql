-- Applied 2026-06-30 to scc_procurement (additive; reference copy).
-- A plain-text covering-email message for the SR wizard's "Review & send" step.
-- The officer edits plain text; the app wraps it in the branded charcoal template
-- at send (buildInviteHtml). Materials keeps covering_email_body (HTML via WF8).
alter table scc_procurement.rfqs
  add column if not exists covering_email_message text;

comment on column scc_procurement.rfqs.covering_email_message is
  'Plain-text officer message for the SR invite; wrapped in the branded HTML template at send. Additive 2026-06-30.';
