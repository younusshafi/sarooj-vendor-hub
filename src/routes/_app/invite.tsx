import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, CheckCircle2, Send } from "lucide-react";

const WEBHOOK_URL = "https://n8n.zavia-ai.com/webhook/vendor-invite";
const REGISTRATION_URL = "https://sarooj-vendor-hub.vercel.app/register";

const SUPPLY_CATEGORIES = [
  "Cement",
  "Steel / Rebar",
  "Aggregates",
  "Ready Mix Concrete",
  "Pipes",
  "Welfare Facilities",
  "Civil Works",
  "Electromechanical",
  "Professional Services",
  "Other",
] as const;

const schema = z.object({
  vendor_name: z.string().trim().min(1, "Company name is required").max(200),
  contact_person: z.string().trim().min(1, "Contact person is required").max(150),
  email: z.string().trim().email("Enter a valid email address").max(200),
  category: z.enum(SUPPLY_CATEGORIES, { message: "Select a supply category" }),
  personal_message: z.string().trim().max(1000).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/_app/invite")({
  component: InviteVendorPage,
});

function InviteVendorPage() {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [successData, setSuccessData] = useState<{
    contact_person: string;
    vendor_name: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      vendor_name: "",
      contact_person: "",
      email: "",
      personal_message: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setStatus("idle");
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_name: values.vendor_name,
          contact_person: values.contact_person,
          email: values.email,
          category: values.category,
          personal_message: values.personal_message || "",
          registration_url: REGISTRATION_URL,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSuccessData({
          contact_person: values.contact_person,
          vendor_name: values.vendor_name,
        });
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (status === "success" && successData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-[28px] text-foreground">Invite a Vendor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a vendor registration link via email
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--accent-soft)" }}
          >
            <CheckCircle2 className="h-9 w-9" style={{ color: "var(--primary-hover)" }} />
          </div>
          <h2 className="mt-5 font-display text-[22px] text-foreground">
            Invitation sent to {successData.contact_person} at {successData.vendor_name}
          </h2>
          <p className="mt-3 text-[15px] text-muted-foreground">
            They will receive an email with a link to the registration form.
          </p>
          <button
            onClick={() => {
              setStatus("idle");
              setSuccessData(null);
              reset();
            }}
            className="mt-6 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-semibold text-white transition-colors"
            style={{ backgroundColor: "var(--primary-hover)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--primary-hover)")}
          >
            Send Another Invitation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] text-foreground">Invite a Vendor</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Send a vendor registration link via email
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 md:p-8">
        {status === "error" && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-lg border border-destructive bg-destructive/10 p-4 text-[14px] text-destructive"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>Failed to send invitation. Please try again.</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* Vendor Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="vendor_name" className="text-[14px] font-medium text-foreground">
                Vendor Name <span className="text-destructive">*</span>
              </label>
              <input
                id="vendor_name"
                className="h-11 w-full rounded-lg border border-input bg-white px-3.5 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
                placeholder="Company name"
                aria-invalid={!!errors.vendor_name}
                {...register("vendor_name")}
              />
              {errors.vendor_name && (
                <p className="text-[13px] text-destructive">{errors.vendor_name.message}</p>
              )}
            </div>

            {/* Contact Person */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="contact_person" className="text-[14px] font-medium text-foreground">
                Contact Person <span className="text-destructive">*</span>
              </label>
              <input
                id="contact_person"
                className="h-11 w-full rounded-lg border border-input bg-white px-3.5 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
                placeholder="Full name"
                aria-invalid={!!errors.contact_person}
                {...register("contact_person")}
              />
              {errors.contact_person && (
                <p className="text-[13px] text-destructive">{errors.contact_person.message}</p>
              )}
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[14px] font-medium text-foreground">
                Email Address <span className="text-destructive">*</span>
              </label>
              <input
                id="email"
                type="email"
                className="h-11 w-full rounded-lg border border-input bg-white px-3.5 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
                placeholder="vendor@company.com"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email && (
                <p className="text-[13px] text-destructive">{errors.email.message}</p>
              )}
            </div>

            {/* Supply Category */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="category" className="text-[14px] font-medium text-foreground">
                Supply Category <span className="text-destructive">*</span>
              </label>
              <select
                id="category"
                className="h-11 w-full rounded-lg border border-input bg-white px-3.5 text-[15px] text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
                aria-invalid={!!errors.category}
                {...register("category")}
              >
                <option value="">Select a category</option>
                {SUPPLY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p className="text-[13px] text-destructive">{errors.category.message}</p>
              )}
            </div>
          </div>

          {/* Personal Message */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="personal_message" className="text-[14px] font-medium text-foreground">
              Personal Message
            </label>
            <textarea
              id="personal_message"
              rows={4}
              className="w-full rounded-lg border border-input bg-white px-3.5 py-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="Add a personal note to the invitation email (optional)"
              {...register("personal_message")}
            />
            {errors.personal_message && (
              <p className="text-[13px] text-destructive">{errors.personal_message.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-[48px] w-full items-center justify-center gap-2 rounded-lg text-[15px] font-semibold text-white transition-colors disabled:opacity-60 md:w-auto md:px-8"
            style={{ backgroundColor: "var(--primary-hover)" }}
            onMouseEnter={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = "var(--primary)";
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = "var(--primary-hover)";
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Invitation
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
