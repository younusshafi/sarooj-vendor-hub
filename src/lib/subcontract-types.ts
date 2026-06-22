export interface GenerateVendor {
  rfq_id: string;
  vendor_id: string;
  email_to: string | null;
  contact_person: string;
  matched_category: string;
  status: string;
  response_received: boolean;
}

export interface GenerateResponse {
  success: boolean;
  rfq_id: string;
  rfq_reference: string;
  rfq_type: string;
  subject_works: string;
  scope_summary: string;
  suggested_categories: string[];
  vendor_count: number;
  vendors: GenerateVendor[];
  drive_folder_url: string;
  covering_email_subject: string;
  covering_email_body: string;
}

// ── Frame (BOQ schedule) shapes — webhook + DB rows are loosely shaped ──

export interface FrameLine {
  item_number?: number | string;
  item?: number | string;
  description?: string;
  unit?: string;
  qty?: number | null;
  quantity?: number | null;
  line_type?: string;
}

export interface FrameFlag {
  type?: string;
  detail?: string;
  message?: string;
}

export interface FrameData {
  frame?: {
    meta?: {
      template?: string | null;
      template_variant?: string | null;
      source_confidence?: string;
    };
    count_check?: { match?: boolean; locked?: number; written?: number };
    flags?: FrameFlag[];
    commercial_terms_to_request?: string[];
    lines?: FrameLine[];
  };
}

export interface FrameRfqRow {
  template?: string | null;
  template_variant?: string | null;
  data_confidence?: string | null;
}

export interface FrameItemRow {
  item_number?: number | string;
  sap_item_number?: number | string;
  description?: string;
  unit?: string;
  quantity?: number | null;
  item_details?: unknown;
}
