import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/integrations/supabase-external/auth";
import { postWebhook } from "@/lib/subcontract-webhook";
import { setDraft } from "@/lib/subcontract-draft";
import type { GenerateResponse } from "@/lib/subcontract-types";
import { toast } from "sonner";
import { X, Upload, FileText, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/rfq/sub/new")({
  component: NewRfqPage,
});

type ResponsibilityParty = "SAROOJ" | "SUBCONTRACTOR";
type FileType = "boq" | "specifications" | "drawings" | "other";

interface SelectedFile {
  file: File;
  file_type: FileType;
}

const ACCEPTED_EXTENSIONS = ".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg";

interface RfqFormState {
  note: string;
  project_name: string;
  project_location: string;
  payment_terms: string;
  subcontract_period: string;
  created_by: string;
  sme_required: boolean;
  fat_by: ResponsibilityParty;
  equipment_by: ResponsibilityParty;
  materials_by: ResponsibilityParty;
  pr_numbers: string[];
}

function SegmentedToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ResponsibilityParty;
  onChange: (v: ResponsibilityParty) => void;
}) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <div className="inline-flex rounded-md border border-border">
        {(["SAROOJ", "SUBCONTRACTOR"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
              value === option
                ? "bg-primary text-primary-foreground"
                : "bg-card text-foreground hover:bg-secondary"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function PrNumbersInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");

  const addPr = () => {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
  };

  const removePr = (pr: string) => {
    onChange(value.filter((v) => v !== pr));
  };

  return (
    <div>
      <Label htmlFor="pr_numbers" className="mb-1.5 block">
        PR Numbers
      </Label>
      <div className="flex gap-2">
        <Input
          id="pr_numbers"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addPr();
            }
          }}
          placeholder="Type PR number and press Enter"
          className="flex-1"
        />
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((pr) => (
            <span
              key={pr}
              className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs font-medium text-foreground"
            >
              {pr}
              <button
                type="button"
                onClick={() => removePr(pr)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function NewRfqPage() {
  const { user } = useAuth();
  const displayName =
    user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email ?? "";

  const [form, setForm] = useState<RfqFormState>({
    note: "",
    project_name: "",
    project_location: "",
    payment_terms: "",
    subcontract_period: "",
    created_by: displayName,
    sme_required: false,
    fat_by: "SUBCONTRACTOR",
    equipment_by: "SUBCONTRACTOR",
    materials_by: "SUBCONTRACTOR",
    pr_numbers: [],
  });

  const [attachments, setAttachments] = useState<SelectedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateField = <K extends keyof RfqFormState>(field: K, value: RfqFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const MAX_FILE_SIZE = 100 * 1024 * 1024;
    const accepted: SelectedFile[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(
          `"${file.name}" is too large. For files over 100 MB, please upload directly to the RFQ Drive folder and inform procurement.`,
        );
        continue;
      }
      accepted.push({ file, file_type: "other" as FileType });
    }
    if (accepted.length > 0) {
      setAttachments((prev) => [...prev, ...accepted]);
    }
    // Reset input so the same file can be re-selected if removed
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFileType = (index: number, fileType: FileType) => {
    setAttachments((prev) =>
      prev.map((item, i) => (i === index ? { ...item, file_type: fileType } : item)),
    );
  };

  const [attempted, setAttempted] = useState(false);
  const [generating, setGenerating] = useState(false);
  const navigate = useNavigate();

  const isValid = form.note.trim().length > 0 && form.created_by.trim().length > 0;

  const buildPayload = () => ({
    created_by: form.created_by,
    note: form.note,
    project_name: form.project_name,
    project_location: form.project_location,
    payment_terms: form.payment_terms,
    subcontract_period: form.subcontract_period,
    sme_required: form.sme_required,
    fat_by: form.fat_by,
    equipment_by: form.equipment_by,
    materials_by: form.materials_by,
    pr_numbers: form.pr_numbers,
    attachments: attachments.map((a) => ({
      filename: a.file.name,
      file_type: a.file_type,
    })),
  });

  const handleGenerate = async () => {
    setAttempted(true);
    if (!isValid) return;

    setGenerating(true);
    const payload = buildPayload();
    console.log("Generate payload:", JSON.stringify(payload, null, 2));

    const result = await postWebhook<GenerateResponse>(
      "/webhook/scc-subcontract-rfq-generate",
      payload,
    );

    setGenerating(false);

    if (!result.ok) {
      toast.error(`Generate failed: ${result.error}`);
      return;
    }

    if (!result.data.success) {
      toast.error("Generate returned an error from the backend.");
      return;
    }

    console.log("Generate response:", result.data);
    const { rfq_id } = result.data;

    // Store response + File objects + file types for Stage 4
    setDraft(
      rfq_id,
      result.data,
      attachments.map((a) => a.file),
      attachments.map((a) => a.file_type),
    );
    navigate({ to: "/rfq/sub/$rfqId", params: { rfqId: rfq_id } });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="font-display text-2xl text-foreground">New Subcontractor RFQ</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">RFQ Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="created_by">Created By</Label>
            <Input id="created_by" value={form.created_by} readOnly className="mt-1 bg-muted" />
          </div>

          <div>
            <Label htmlFor="note">
              Scope Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="note"
              placeholder="Describe the scope of subcontract works required..."
              value={form.note}
              onChange={(e) => updateField("note", e.target.value)}
              className={`mt-1 min-h-[120px] ${attempted && !form.note.trim() ? "border-destructive" : ""}`}
            />
            {attempted && !form.note.trim() && (
              <p className="mt-1 text-xs text-destructive">Scope description is required.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="project_name">Project Name</Label>
              <Input
                id="project_name"
                value={form.project_name}
                onChange={(e) => updateField("project_name", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="project_location">Project Location</Label>
              <Input
                id="project_location"
                value={form.project_location}
                onChange={(e) => updateField("project_location", e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="payment_terms">Payment Terms</Label>
              <Input
                id="payment_terms"
                value={form.payment_terms}
                onChange={(e) => updateField("payment_terms", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="subcontract_period">Subcontract Period</Label>
              <Input
                id="subcontract_period"
                value={form.subcontract_period}
                onChange={(e) => updateField("subcontract_period", e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Responsibilities & Requirements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-3">
            <Switch
              id="sme_required"
              checked={form.sme_required}
              onCheckedChange={(checked) => updateField("sme_required", checked)}
            />
            <Label htmlFor="sme_required">SME Required</Label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SegmentedToggle
              label="FAT By"
              value={form.fat_by}
              onChange={(v) => updateField("fat_by", v)}
            />
            <SegmentedToggle
              label="Equipment By"
              value={form.equipment_by}
              onChange={(v) => updateField("equipment_by", v)}
            />
            <SegmentedToggle
              label="Materials By"
              value={form.materials_by}
              onChange={(v) => updateField("materials_by", v)}
            />
          </div>

          <PrNumbersInput value={form.pr_numbers} onChange={(v) => updateField("pr_numbers", v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Scope Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleFilesSelected}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Select Files
          </Button>

          {attachments.length > 0 && (
            <div className="space-y-2">
              {attachments.map((item, index) => (
                <div
                  key={`${item.file.name}-${index}`}
                  className="flex items-center gap-3 rounded-md border border-border p-3"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm">{item.file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {(item.file.size / 1024).toFixed(0)} KB
                  </span>
                  <select
                    value={item.file_type}
                    onChange={(e) => updateFileType(index, e.target.value as FileType)}
                    className="rounded-md border border-border bg-card px-2 py-1 text-xs"
                  >
                    <option value="boq">BOQ</option>
                    <option value="specifications">Specifications</option>
                    <option value="drawings">Drawings</option>
                    <option value="other">Other</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleGenerate}
          disabled={generating || (attempted && !isValid)}
          className="gap-2 bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate RFQ"
          )}
        </Button>
      </div>
    </div>
  );
}
