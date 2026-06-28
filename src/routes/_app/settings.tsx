/* eslint-disable @typescript-eslint/no-explicit-any -- loose Supabase rows from the untyped external client (see comparison-award-panel.tsx) */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/integrations/supabase-external/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function useSetting(key: string) {
  return useQuery({
    queryKey: ["system-setting", key],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", key)
        .single();
      return (data as any)?.setting_value ?? "";
    },
  });
}

async function saveSetting(key: string, value: string, userEmail: string): Promise<void> {
  const { error } = await supabase
    .from("system_settings")
    .update({
      setting_value: value,
      updated_by: userEmail,
      updated_at: new Date().toISOString(),
    })
    .eq("setting_key", key);
  if (error) throw error;
}

function SettingTextField({
  label,
  description,
  settingKey,
  userEmail,
  multiline = false,
  rows = 4,
}: {
  label: string;
  description?: string;
  settingKey: string;
  userEmail: string;
  multiline?: boolean;
  rows?: number;
}) {
  const { data: initialValue, isLoading } = useSetting(settingKey);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (initialValue !== undefined) setValue(initialValue);
  }, [initialValue]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting(settingKey, value, userEmail);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success(`${label} saved`);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {isLoading ? (
        <div className="h-10 w-full animate-pulse rounded-md bg-secondary" />
      ) : multiline ? (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={rows}
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-ring font-mono"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-ring"
        />
      )}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saved && !saving && <Check className="h-4 w-4" />}
          {saving ? "Saving…" : saved ? "Saved!" : "Save"}
        </button>
      </div>
    </div>
  );
}

function SettingNumberField({
  label,
  description,
  settingKey,
  userEmail,
  min,
  max,
}: {
  label: string;
  description?: string;
  settingKey: string;
  userEmail: string;
  min?: number;
  max?: number;
}) {
  const { data: initialValue, isLoading } = useSetting(settingKey);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (initialValue !== undefined) setValue(initialValue);
  }, [initialValue]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting(settingKey, value, userEmail);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success(`${label} saved`);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {isLoading ? (
        <div className="h-10 w-32 animate-pulse rounded-md bg-secondary" />
      ) : (
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          min={min}
          max={max}
          className="w-32 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-ring"
        />
      )}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saved && !saving && <Check className="h-4 w-4" />}
          {saving ? "Saving…" : saved ? "Saved!" : "Save"}
        </button>
      </div>
    </div>
  );
}

function TestModePanel({ userEmail }: { userEmail: string }) {
  const qc = useQueryClient();
  const { data: mode, isLoading } = useSetting("dispatch_test_mode");
  const { data: adminRaw } = useSetting("admin_emails");
  const [busy, setBusy] = useState(false);

  const isOn = (mode ?? "on") === "on";
  let admins: string[] = [];
  try {
    admins = adminRaw ? (JSON.parse(adminRaw) as string[]) : [];
  } catch {
    admins = [];
  }
  const isAdmin = admins.map((a) => a.toLowerCase()).includes(userEmail.toLowerCase());

  const toggle = async () => {
    const next = !isOn;
    const msg = next
      ? "Turn Test Mode ON?\n\nRFQ dispatch will be sent ONLY to the test recipients — no real vendors will be emailed."
      : "Turn Test Mode OFF — GO LIVE?\n\nReal vendors WILL receive RFQ emails from now on. Are you sure?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("set_dispatch_test_mode", { p_on: next });
    setBusy(false);
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) {
      toast.error(error?.message || res?.error || "Failed to change test mode");
      return;
    }
    toast.success(`Test mode turned ${next ? "ON" : "OFF"}`);
    qc.invalidateQueries({ queryKey: ["system-setting", "dispatch_test_mode"] });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold" style={{ color: "#1A3A5C" }}>
          Dispatch Test Mode
        </h2>
        {!isLoading && (
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={
              isOn
                ? { backgroundColor: "#FDF3E0", color: "#7A5200" }
                : { backgroundColor: "#E0F2EA", color: "#0D5C3A" }
            }
          >
            {isOn ? "TEST — test recipients only" : "LIVE — real vendors emailed"}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        When ON, RFQ dispatch emails go only to the configured test recipients (no real vendors).
        Turning it OFF makes the system live. Only administrators can change this.
      </p>
      {isAdmin ? (
        <div className="mt-4">
          <button
            onClick={toggle}
            disabled={busy || isLoading}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: isOn ? "#991B1B" : "var(--accent)" }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isOn ? "Turn OFF — go live" : "Turn ON — test mode"}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Only an administrator can change this setting.
        </p>
      )}
    </div>
  );
}

function SettingsPage() {
  const { user } = useAuth();
  const userEmail = user?.email ?? "";

  return (
    <div className="space-y-8">
      <h1 className="font-display text-[28px] text-foreground">Settings</h1>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold text-foreground">Account</h2>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Signed in as
        </div>
        <div className="mt-1 text-sm text-foreground">{userEmail}</div>
      </div>

      <TestModePanel userEmail={userEmail} />

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#60A5FA" }} />
          <h2 className="text-base font-semibold" style={{ color: "#1A3A5C" }}>
            RFQ Settings
          </h2>
        </div>
        <div className="space-y-8 divide-y divide-border">
          <SettingTextField
            label="Terms & Conditions Template"
            description="Default T&Cs included in all RFQ emails. Can be edited per-RFQ on the preview screen."
            settingKey="rfq_terms_and_conditions"
            userEmail={userEmail}
            multiline
            rows={10}
          />
          <div className="pt-6">
            <SettingNumberField
              label="Default Deadline Days"
              description="Number of days from dispatch date to set as the default response deadline."
              settingKey="rfq_default_deadline_days"
              userEmail={userEmail}
              min={1}
              max={365}
            />
          </div>
          <div className="pt-6">
            <SettingNumberField
              label="Reminder Days Before Deadline"
              description="How many days before the deadline the automatic reminder email is sent to non-responding vendors."
              settingKey="rfq_reminder_days_before"
              userEmail={userEmail}
              min={1}
              max={30}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
