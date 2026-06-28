import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";
import { Loader2, Mail, Save } from "lucide-react";

export function RfqEmailEditor({ rfqId, status = "draft" }: { rfqId: string; status?: string }) {
  const readOnly = status !== "draft";
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingBody, setEditingBody] = useState(false);

  const fetchEmail = useCallback(async () => {
    const { data, error } = await supabase
      .from("rfqs")
      .select("covering_email_subject, covering_email_body")
      .eq("rfq_id", rfqId)
      .single();

    if (error || !data) {
      toast.error("Failed to load email");
      setLoading(false);
      return;
    }

    setSubject(data.covering_email_subject ?? "");
    setBody(data.covering_email_body ?? "");
    setLoading(false);
  }, [rfqId]);

  useEffect(() => {
    fetchEmail();
  }, [fetchEmail]);

  const handleSave = async () => {
    if (!subject.trim()) {
      toast.error("Email subject cannot be empty");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("rfqs")
      .update({
        covering_email_subject: subject,
        covering_email_body: body,
      })
      .eq("rfq_id", rfqId);

    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
    } else {
      toast.success("Email saved");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Covering Email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading email...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5" />
            Covering Email
          </CardTitle>
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
        <div className="rounded-md border border-border bg-secondary/30 p-3">
          <p className="text-xs text-muted-foreground">
            <strong>Auto-filled at send:</strong>{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">[Contact Person]</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">[SENDER_NAME]</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">[DEADLINE]</code> are replaced
            per vendor when the RFQ is issued. Keep these placeholders intact.
          </p>
        </div>

        <div>
          <Label htmlFor="email_subject">Subject</Label>
          <Input
            id="email_subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={readOnly}
            className="mt-1"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="email_body">Body</Label>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setEditingBody((v) => !v)}
                className="text-xs font-medium underline"
                style={{ color: "var(--accent)" }}
              >
                {editingBody ? "Done — show preview" : "Edit HTML"}
              </button>
            )}
          </div>
          <div className="mt-1">
            {editingBody && !readOnly ? (
              <textarea
                id="email_body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[260px] w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <div className="rounded-md border border-border bg-card p-4">
                {body.trim() ? (
                  <div
                    className="prose prose-sm max-w-none text-sm"
                    dangerouslySetInnerHTML={{ __html: body }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No email body yet.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
