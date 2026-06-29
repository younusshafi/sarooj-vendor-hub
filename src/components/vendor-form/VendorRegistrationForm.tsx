// Shared vendor data-capture form used by BOTH new onboarding (/register) and existing-vendor
// re-confirmation (/register/$token). The caller supplies prefill values, the list of documents
// already on file, button/success text, and an onSubmit that decides where the payload goes
// (n8n webhook for generic onboarding; the vendor_link_submit RPC for tokenized capture).
import { useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { SectionCard } from "@/components/vendor-form/SectionCard";
import { Field, inputClass, textareaClass } from "@/components/vendor-form/Field";
import { OptionCard } from "@/components/vendor-form/OptionCard";
import { DocumentUpload } from "@/components/vendor-form/DocumentUpload";
import { Checkbox } from "@/components/ui/checkbox";

const SUPABASE_URL = "https://fimfybfgjrbkcylmyekz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpbWZ5YmZnanJia2N5bG15ZWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTk1MjQsImV4cCI6MjA5NDY5NTUyNH0.F85OZSHUJAaHFmg1FlPfMfUrDMK4f_6WslRLo_5Wv0Q";

async function uploadDocumentToSupabase(file: File, storagePath: string): Promise<void> {
  const url = `${SUPABASE_URL}/storage/v1/object/vendor-documents/${storagePath}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
}

const LEGAL_STRUCTURES = [
  "Public Company",
  "LLC",
  "Partnership",
  "SME",
  "LCC Minority Owned",
  "Non Corporate",
] as const;

const VENDOR_TYPES = [
  "Material Supply",
  "Services Provider",
  "Subcontractor",
  "Resources Supply",
  "Professional Services",
] as const;

const SUPPLIER_TYPES = ["Local", "International"] as const;

export const REQUIRED_DOCS = [
  "Company Profile",
  "Commercial Registration Certificate",
  "Tax Certificate",
  "Product Catalogues",
  "Authorised Signatory + ID",
] as const;

export const OPTIONAL_DOCS = [
  "Chamber of Commerce Certificate",
  "JSRS Registration",
  "Riyada Card",
  "Product Certificates",
  "Vehicle Registration",
  "VAT Certificate",
  "ISO Certificate",
] as const;

const schema = z
  .object({
    company_name: z.string().trim().min(1, "Company name is required").max(200),
    cr_number: z.string().trim().max(100).optional().or(z.literal("")),
    location: z.string().trim().min(1, "Address is required").max(300),
    telephone: z.string().trim().min(8, "Phone must be at least 8 digits").max(30),
    mobile_alt: z.string().trim().max(30).optional().or(z.literal("")),
    legal_structure: z.enum(LEGAL_STRUCTURES, { message: "Select a legal structure" }),
    vendor_type: z.enum(VENDOR_TYPES, { message: "Select a vendor type" }),
    supplier_type: z.enum(SUPPLIER_TYPES, { message: "Select a supplier type" }),
    country: z.string().trim().max(100).optional().or(z.literal("")),
    website: z.string().trim().max(200).optional().or(z.literal("")),
    offered_products: z
      .string()
      .trim()
      .min(1, "Please describe your products / services")
      .max(2000),
    main_customers: z.string().trim().max(2000).optional().or(z.literal("")),
    num_employees: z.string().trim().max(10).optional().or(z.literal("")),
    vat_number: z.string().trim().max(100).optional().or(z.literal("")),
    contact_person: z.string().trim().min(1, "Contact name is required").max(150),
    designation: z.string().trim().min(1, "Designation is required").max(150),
    contact_mobile: z.string().trim().min(8, "Mobile must be at least 8 digits").max(30),
    email: z.string().trim().email("Enter a valid email").max(200),
    signatory_name: z.string().trim().min(1, "Signatory name is required").max(150),
    signatory_position: z.string().trim().min(1, "Position is required").max(150),
    declaration: z.literal(true, { message: "You must confirm the declaration" }),
  })
  .refine(
    (v) => v.supplier_type !== "International" || (v.country && v.country.trim().length > 0),
    {
      message: "Country of origin is required",
      path: ["country"],
    },
  );

type FormValues = z.input<typeof schema>;

export interface VendorFormPrefill {
  company_name?: string | null;
  cr_number?: string | null;
  vat_number?: string | null;
  website?: string | null;
  country?: string | null;
  contact_person?: string | null;
  email?: string | null;
  contact_mobile?: string | null;
  designation?: string | null;
}

export interface VendorRegistrationFormProps {
  prefill?: VendorFormPrefill | null;
  /** Document types already on file (re-confirmation) — re-upload becomes optional. */
  documentsOnFile?: string[];
  submitLabel?: string;
  successTitle?: string;
  successText?: string;
  /** Receives the assembled payload (field values + uploaded_documents metadata). Throw to surface an error. */
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}

const s = (v: unknown) => (v == null ? "" : String(v));

export function VendorRegistrationForm({
  prefill,
  documentsOnFile = [],
  submitLabel = "Submit Registration",
  successTitle = "Registration Received",
  successText = "Thank you. Your registration has been received. Sarooj's procurement team will review and contact you.",
  onSubmit,
}: VendorRegistrationFormProps) {
  const [documents, setDocuments] = useState<Record<string, File | null>>({});
  const [docError, setDocError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const onFile = useMemo(() => new Set(documentsOnFile), [documentsOnFile]);
  const isReconfirm = onFile.size > 0;

  const today = useMemo(
    () =>
      new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    [],
  );

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    mode: "onBlur",
    defaultValues: {
      company_name: s(prefill?.company_name),
      cr_number: s(prefill?.cr_number),
      location: "",
      telephone: "",
      mobile_alt: "",
      country: s(prefill?.country),
      website: s(prefill?.website),
      offered_products: "",
      main_customers: "",
      num_employees: "",
      vat_number: s(prefill?.vat_number),
      contact_person: s(prefill?.contact_person),
      designation: s(prefill?.designation),
      contact_mobile: s(prefill?.contact_mobile),
      email: s(prefill?.email),
      signatory_name: "",
      signatory_position: "",
    },
  });

  const supplierType = watch("supplier_type");
  const setDoc = (name: string, file: File | null) =>
    setDocuments((prev) => ({ ...prev, [name]: file }));

  const submit = async (values: FormValues) => {
    setSubmitError(null);
    setDocError(null);

    // Onboarding requires ≥1 required doc; re-confirmation may rely on docs already on file.
    const uploadedRequired = REQUIRED_DOCS.filter((d) => documents[d]);
    if (!isReconfirm && uploadedRequired.length === 0) {
      setDocError("Please upload at least one required document.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const allUploaded = [...REQUIRED_DOCS, ...OPTIONAL_DOCS].filter((d) => documents[d]);
    const timestamp = Date.now();
    const companySlug = s(values.company_name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const folderPrefix = `vendor-docs-pending/${timestamp}_${companySlug}`;

    const uploadedDocuments: Array<{
      document_type: string;
      storage_path: string;
      filename: string;
    }> = [];
    for (const docType of allUploaded) {
      const file = documents[docType]!;
      const storagePath = `${folderPrefix}/${docType}/${file.name}`;
      try {
        await uploadDocumentToSupabase(file, storagePath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setSubmitError(
          `Failed to upload "${docType}": ${msg}. Please check your connection and try again.`,
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      uploadedDocuments.push({
        document_type: docType,
        storage_path: storagePath,
        filename: file.name,
      });
    }

    const payload = {
      company_name: values.company_name,
      cr_number: values.cr_number || "",
      location: values.location,
      telephone: values.telephone,
      mobile: values.mobile_alt || "",
      legal_structure: values.legal_structure,
      vendor_type: values.vendor_type,
      supplier_type: values.supplier_type,
      country: values.supplier_type === "International" ? values.country : "",
      website: values.website || "",
      offered_products: values.offered_products,
      main_customers: values.main_customers || "",
      num_employees: values.num_employees ? Number(values.num_employees) : null,
      vat_number: values.vat_number || "",
      contact_person: values.contact_person,
      designation: values.designation,
      contact_mobile: values.contact_mobile,
      email: values.email,
      signatory_name: values.signatory_name,
      signatory_position: values.signatory_position,
      submitted_at: new Date().toISOString(),
      documents_submitted: allUploaded,
      uploaded_documents: uploadedDocuments,
    };

    try {
      await onSubmit(payload);
      setSubmitted(true);
    } catch {
      setSubmitError(
        "Submission failed. Please check your connection and try again. If the problem persists, contact procurement@sarooj.com",
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const onInvalid = () => {
    setTimeout(() => {
      const el = document.querySelector("[aria-invalid='true'], .text-destructive");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-20 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft">
          <CheckCircle2 className="h-12 w-12 text-primary" />
        </div>
        <h1 className="mt-6 font-serif text-[32px] text-foreground">{successTitle}</h1>
        <p className="mt-4 text-[16px]" style={{ color: "var(--muted-foreground)" }}>
          {successText}
        </p>
      </div>
    );
  }

  const docNote = (d: string) =>
    onFile.has(d) ? " — already on file; upload only to replace" : undefined;

  return (
    <main className="mx-auto max-w-[780px] px-6 pb-12 md:px-8">
      {(submitError || docError) && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-lg border border-destructive bg-destructive-soft p-4 text-[14px] text-destructive"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{submitError ?? docError}</p>
        </div>
      )}

      {isReconfirm && (
        <div className="mb-6 rounded-lg border border-border bg-accent-soft/50 p-4 text-[14px] text-foreground">
          We’ve pre-filled your details on file. Please review, correct anything out of date, and
          re-upload any documents that have changed, then submit. Your changes go to Sarooj
          procurement for review before they’re applied.
        </div>
      )}

      <form onSubmit={handleSubmit(submit, onInvalid)} noValidate>
        <SectionCard number={1} title="Company Information">
          <Field
            label="Company Name"
            required
            htmlFor="company_name"
            error={errors.company_name?.message}
          >
            <input
              id="company_name"
              className={inputClass}
              aria-invalid={!!errors.company_name}
              {...register("company_name")}
            />
          </Field>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field
              label="Commercial Registration Number (CR No.)"
              htmlFor="cr_number"
              helper="Required for Omani companies"
              error={errors.cr_number?.message}
            >
              <input id="cr_number" className={inputClass} {...register("cr_number")} />
            </Field>
            <div className="hidden md:block" />
          </div>
          <Field
            label="Main Office Address"
            required
            htmlFor="location"
            error={errors.location?.message}
          >
            <input
              id="location"
              className={inputClass}
              aria-invalid={!!errors.location}
              {...register("location")}
            />
          </Field>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field
              label="Phone Number"
              required
              htmlFor="telephone"
              error={errors.telephone?.message}
            >
              <input
                id="telephone"
                type="tel"
                className={inputClass}
                aria-invalid={!!errors.telephone}
                {...register("telephone")}
              />
            </Field>
            <Field
              label="Alternative Phone"
              htmlFor="mobile_alt"
              error={errors.mobile_alt?.message}
            >
              <input
                id="mobile_alt"
                type="tel"
                className={inputClass}
                {...register("mobile_alt")}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard number={2} title="Legal Structure">
          <Controller
            control={control}
            name="legal_structure"
            render={({ field }) => (
              <Field label="Legal Structure" required error={errors.legal_structure?.message}>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {LEGAL_STRUCTURES.map((opt) => (
                    <OptionCard
                      key={opt}
                      label={opt}
                      selected={field.value === opt}
                      onSelect={() => field.onChange(opt)}
                    />
                  ))}
                </div>
              </Field>
            )}
          />
        </SectionCard>

        <SectionCard number={3} title="Vendor Type">
          <Controller
            control={control}
            name="vendor_type"
            render={({ field }) => (
              <Field label="Vendor Type" required error={errors.vendor_type?.message}>
                <div className="flex flex-wrap gap-3">
                  {VENDOR_TYPES.map((opt) => (
                    <OptionCard
                      key={opt}
                      label={opt}
                      selected={field.value === opt}
                      onSelect={() => field.onChange(opt)}
                    />
                  ))}
                </div>
              </Field>
            )}
          />
        </SectionCard>

        <SectionCard number={4} title="Supplier Type">
          <Controller
            control={control}
            name="supplier_type"
            render={({ field }) => (
              <Field label="Supplier Type" required error={errors.supplier_type?.message}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <OptionCard
                    label="Local (Oman-based)"
                    size="large"
                    selected={field.value === "Local"}
                    onSelect={() => field.onChange("Local")}
                  />
                  <OptionCard
                    label="International"
                    size="large"
                    selected={field.value === "International"}
                    onSelect={() => field.onChange("International")}
                  />
                </div>
              </Field>
            )}
          />
          {supplierType === "International" && (
            <Field
              label="Country of Origin"
              required
              htmlFor="country"
              error={errors.country?.message}
            >
              <input
                id="country"
                className={inputClass}
                aria-invalid={!!errors.country}
                {...register("country")}
              />
            </Field>
          )}
        </SectionCard>

        <SectionCard number={5} title="Company Details">
          <Field
            label="Website"
            htmlFor="website"
            helper="Optional"
            error={errors.website?.message}
          >
            <input
              id="website"
              className={inputClass}
              placeholder="https://"
              {...register("website")}
            />
          </Field>
          <Field
            label="Products / Services Offered"
            required
            htmlFor="offered_products"
            helper="Describe what your company supplies or does. Be specific — e.g. Ready Mix Concrete, Civil Subcontracting, PPE Supply."
            error={errors.offered_products?.message}
          >
            <textarea
              id="offered_products"
              rows={4}
              className={textareaClass}
              aria-invalid={!!errors.offered_products}
              {...register("offered_products")}
            />
          </Field>
          <Field
            label="Main Customers"
            htmlFor="main_customers"
            helper="List your main clients, especially construction companies"
            error={errors.main_customers?.message}
          >
            <textarea
              id="main_customers"
              rows={3}
              className={textareaClass}
              {...register("main_customers")}
            />
          </Field>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field
              label="Number of Employees"
              htmlFor="num_employees"
              error={errors.num_employees?.message}
            >
              <input
                id="num_employees"
                type="number"
                min={0}
                className={inputClass}
                {...register("num_employees")}
              />
            </Field>
            <Field
              label="VAT Registration Number"
              htmlFor="vat_number"
              helper="If applicable"
              error={errors.vat_number?.message}
            >
              <input id="vat_number" className={inputClass} {...register("vat_number")} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard number={6} title="Contact Person">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field
              label="Full Name"
              required
              htmlFor="contact_person"
              error={errors.contact_person?.message}
            >
              <input
                id="contact_person"
                className={inputClass}
                aria-invalid={!!errors.contact_person}
                {...register("contact_person")}
              />
            </Field>
            <Field
              label="Position / Designation"
              required
              htmlFor="designation"
              error={errors.designation?.message}
            >
              <input
                id="designation"
                className={inputClass}
                aria-invalid={!!errors.designation}
                {...register("designation")}
              />
            </Field>
            <Field
              label="Mobile Number"
              required
              htmlFor="contact_mobile"
              error={errors.contact_mobile?.message}
            >
              <input
                id="contact_mobile"
                type="tel"
                className={inputClass}
                aria-invalid={!!errors.contact_mobile}
                {...register("contact_mobile")}
              />
            </Field>
            <Field label="Email Address" required htmlFor="email" error={errors.email?.message}>
              <input
                id="email"
                type="email"
                className={inputClass}
                aria-invalid={!!errors.email}
                {...register("email")}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard number={7} title="Required Documents">
          <p className="-mt-2 text-[14px] text-muted-foreground">
            Upload the following documents. Accepted formats: PDF, JPG, PNG. Max 60MB per file.
          </p>
          <div className="flex flex-col gap-4">
            {REQUIRED_DOCS.map((d) => (
              <DocumentUpload
                key={d}
                label={`${d}${docNote(d) ?? ""}`}
                required={!onFile.has(d)}
                file={documents[d] ?? null}
                onChange={(f) => setDoc(d, f)}
              />
            ))}
            {OPTIONAL_DOCS.map((d) => (
              <DocumentUpload
                key={d}
                label={`${d}${docNote(d) ?? ""}`}
                file={documents[d] ?? null}
                onChange={(f) => setDoc(d, f)}
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard number={8} title="Declaration">
          <div className="rounded-lg border border-border bg-accent-soft p-5 text-[14px] text-foreground">
            I confirm that the information provided in this form is accurate and complete. I
            authorise Sarooj Construction Company to verify the details provided.
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field
              label="Authorised Signatory Name"
              required
              htmlFor="signatory_name"
              error={errors.signatory_name?.message}
            >
              <input
                id="signatory_name"
                className={inputClass}
                aria-invalid={!!errors.signatory_name}
                {...register("signatory_name")}
              />
            </Field>
            <Field
              label="Position"
              required
              htmlFor="signatory_position"
              error={errors.signatory_position?.message}
            >
              <input
                id="signatory_position"
                className={inputClass}
                aria-invalid={!!errors.signatory_position}
                {...register("signatory_position")}
              />
            </Field>
            <Field label="Date">
              <input
                className={inputClass}
                value={today}
                readOnly
                tabIndex={-1}
                style={{ backgroundColor: "var(--background)" }}
              />
            </Field>
          </div>
          <Controller
            control={control}
            name="declaration"
            render={({ field }) => (
              <label className="flex items-start gap-3 text-[14px] text-foreground">
                <Checkbox
                  checked={!!field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="mt-0.5"
                />
                <span>
                  I confirm the above declaration<span className="ml-1 text-destructive">*</span>
                </span>
              </label>
            )}
          />
          {errors.declaration && (
            <p className="text-[13px] text-destructive">{errors.declaration.message as string}</p>
          )}
        </SectionCard>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Submitting...
            </>
          ) : (
            submitLabel
          )}
        </button>
      </form>
    </main>
  );
}
