import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

interface RfqFields {
  project_name: string;
  project_location: string;
  payment_terms: string;
  subcontract_period: string;
  sme_required: boolean;
}

export function RfqEditableFields({ rfqId, status = "draft" }: { rfqId: string; status?: string }) {
  const readOnly = status !== "draft";
  const [fields, setFields] = useState<RfqFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchFields = useCallback(async () => {
    const { data, error } = await supabase
      .from("rfqs")
      .select("project_name, project_location, payment_terms, subcontract_period, sme_required")
      .eq("rfq_id", rfqId)
      .single();

    if (error || !data) {
      toast.error("Failed to load RFQ fields");
      setLoading(false);
      return;
    }

    setFields({
      project_name: data.project_name ?? "",
      project_location: data.project_location ?? "",
      payment_terms: data.payment_terms ?? "",
      subcontract_period: data.subcontract_period ?? "",
      sme_required: data.sme_required ?? false,
    });
    setLoading(false);
  }, [rfqId]);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  const updateField = <K extends keyof RfqFields>(key: K, value: RfqFields[K]) => {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!fields) return;
    setSaving(true);
    const { error } = await supabase.from("rfqs").update(fields).eq("rfq_id", rfqId);

    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
    } else {
      toast.success("RFQ details saved");
    }
  };

  if (loading || !fields) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">RFQ Details</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading fields...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">RFQ Details</CardTitle>
          {readOnly ? (
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Issued — read only
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={handleSave}
              className="gap-1.5 bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="edit_project_name">Project Name</Label>
            <Input
              id="edit_project_name"
              value={fields.project_name}
              onChange={(e) => updateField("project_name", e.target.value)}
              disabled={readOnly}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="edit_project_location">Project Location</Label>
            <Input
              id="edit_project_location"
              value={fields.project_location}
              onChange={(e) => updateField("project_location", e.target.value)}
              disabled={readOnly}
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="edit_payment_terms">Payment Terms</Label>
            <Input
              id="edit_payment_terms"
              value={fields.payment_terms}
              onChange={(e) => updateField("payment_terms", e.target.value)}
              disabled={readOnly}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="edit_subcontract_period">Subcontract Period</Label>
            <Input
              id="edit_subcontract_period"
              value={fields.subcontract_period}
              onChange={(e) => updateField("subcontract_period", e.target.value)}
              disabled={readOnly}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="edit_sme_required"
            checked={fields.sme_required}
            onCheckedChange={(checked) => updateField("sme_required", checked)}
            disabled={readOnly}
          />
          <Label htmlFor="edit_sme_required">SME Required</Label>
        </div>
      </CardContent>
    </Card>
  );
}
