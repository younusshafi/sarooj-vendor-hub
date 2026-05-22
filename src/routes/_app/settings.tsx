import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/integrations/supabase-external/auth";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <h1 className="font-display text-[28px] text-foreground">Settings</h1>
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Signed in as</div>
        <div className="mt-1 text-sm text-foreground">{user?.email}</div>
      </div>
      <p className="text-sm text-muted-foreground">More settings coming soon.</p>
    </div>
  );
}