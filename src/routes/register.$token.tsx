import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Header } from "@/components/vendor-form/Header";
import { Footer } from "@/components/vendor-form/Footer";
import { VendorRegistrationForm } from "@/components/vendor-form/VendorRegistrationForm";
import { vendorLinkGet, vendorLinkSubmit, type VendorLinkResult } from "@/lib/vendor-link";

// Tokenized capture link — the SAME onboarding form, pre-filled for an existing vendor
// (re-confirmation) or a freshly invited new vendor. Submissions go to the pending-approval
// queue (vendor_update_requests) for an officer to review before they hit the live record.
export const Route = createFileRoute("/register/$token")({
  head: () => ({
    meta: [{ title: "Confirm your details — Sarooj Construction Company" }],
  }),
  component: TokenRegistrationPage,
});

function TokenRegistrationPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<VendorLinkResult | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    setState(null);
    setLoadError(false);
    vendorLinkGet(token)
      .then((r) => alive && setState(r))
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, [token]);

  const onSubmit = async (payload: Record<string, unknown>) => {
    const res = await vendorLinkSubmit(token, payload);
    if (!res.ok) throw new Error(res.error || "Submission failed");
  };

  return (
    <div className="min-h-screen bg-background" data-theme="crimson">
      <Header />

      {state === null && !loadError && (
        <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      )}

      {(loadError || (state && !state.found)) && (
        <div className="mx-auto max-w-[560px] px-6 py-20 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
          <h1 className="mt-4 font-serif text-[26px] text-foreground">Link not valid</h1>
          <p className="mt-3 text-[15px] text-muted-foreground">
            This link is invalid, has expired, or has already been used. Please contact Sarooj
            procurement for a new one.
          </p>
        </div>
      )}

      {state?.found && (
        <VendorRegistrationForm
          prefill={state.prefill}
          documentsOnFile={(state.documents_on_file ?? []).map((d) => d.document_type)}
          submitLabel={
            state.kind === "reconfirm" ? "Submit updated details" : "Submit registration"
          }
          successTitle={state.kind === "reconfirm" ? "Details submitted" : "Registration received"}
          successText="Thank you. Your details have been sent to Sarooj procurement for review and will be applied once approved."
          onSubmit={onSubmit}
        />
      )}

      <Footer />
    </div>
  );
}
