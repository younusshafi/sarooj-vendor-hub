-- Applied 2026-06-30 to scc_procurement (additive; reference copy).
-- Persist the responsibility selections from the subcontract RFQ create form
-- (FAT / Equipment / Materials by) so the invite email can show them. sme_required
-- already existed. Written by the create form via a PATCH after the RFQ is generated.
alter table scc_procurement.rfqs
  add column if not exists fat_by text,
  add column if not exists equipment_by text,
  add column if not exists materials_by text;
