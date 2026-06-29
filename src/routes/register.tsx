import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/vendor-form/Header";
import { Footer } from "@/components/vendor-form/Footer";
import { VendorRegistrationForm } from "@/components/vendor-form/VendorRegistrationForm";

// Generic (un-tokenized) onboarding: submissions go to the n8n registration pipeline as before.
// Tokenized capture (pre-filled, pending-approval) lives at /register/$token.
const WEBHOOK_URL = "https://n8n.zavia-ai.com/webhook/scc-vendor-registration";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Vendor Registration — Sarooj Construction Company" },
      {
        name: "description",
        content: "Register your company to join Sarooj Construction's approved vendor network.",
      },
    ],
  }),
  component: VendorRegistrationPage,
});

function VendorRegistrationPage() {
  const onSubmit = async (payload: Record<string, unknown>) => {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  };

  return (
    <div className="min-h-screen bg-background" data-theme="crimson">
      <Header />
      <VendorRegistrationForm onSubmit={onSubmit} />
      <Footer />
    </div>
  );
}
