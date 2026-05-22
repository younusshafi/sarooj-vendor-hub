import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://fimfybfgjrbkcylmyekz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpbWZ5YmZnanJia2N5bG15ZWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTk1MjQsImV4cCI6MjA5NDY5NTUyNH0.F85OZSHUJAaHFmg1FlPfMfUrDMK4f_6WslRLo_5Wv0Q";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: "scc_procurement" },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type VendorStatus =
  | "listed"
  | "registered"
  | "pending_review"
  | "blacklisted"
  | "unresponsive"
  | "inactive";

export type VendorType =
  | "material_supplier"
  | "subcontractor"
  | "services"
  | "resources"
  | "professional";

export type SupplierType = "local" | "international";

export type DataConfidence = "high" | "medium" | "low";

export interface Vendor {
  vendor_id: string;
  company_name: string;
  vendor_type: VendorType | null;
  supplier_type: SupplierType | null;
  legal_structure: string | null;
  cr_number: string | null;
  cr_status: string | null;
  cr_last_checked: string | null;
  vat_number: string | null;
  website: string | null;
  contact_person: string | null;
  designation: string | null;
  mobile: string | null;
  telephone: string | null;
  email: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  number_of_employees: number | null;
  main_customers: string | null;
  categories: string[] | null;
  offered_products_services: string | null;
  source_sheet: string | null;
  duplicate_flag: boolean | null;
  duplicate_notes: string | null;
  remarks: string | null;
  status: VendorStatus;
  data_confidence: DataConfidence | null;
  created_at: string;
}

export interface VendorDocument {
  id: string;
  vendor_id: string;
  document_type: string;
  is_mandatory: boolean;
  submitted: boolean;
  verified: boolean;
  filename: string | null;
  uploaded_at: string | null;
}

export interface VendorValidation {
  id: string;
  vendor_id: string;
  check_type: string;
  result: "pass" | "fail" | "unknown" | string;
  detail: string | null;
  performed_by: string | null;
  performed_at: string;
}

export interface VendorOutreach {
  id: string;
  vendor_id: string;
  email_to: string;
  sent_at: string;
  delivery_status: string | null;
  response_received: boolean | null;
  response_type: string | null;
  followup_sent: boolean | null;
}