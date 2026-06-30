import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDraft, clearFiles } from "@/lib/subcontract-draft";
import { supabase } from "@/integrations/supabase-external/client";
import { uploadDocument } from "@/lib/subcontract-webhook";
import { fileToBase64 } from "@/lib/file-utils";
import { toast } from "sonner";
import {
  ExternalLink,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Eye,
  Upload,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { RfqEditableFields } from "@/components/rfq-editable-fields";
import { RfqVendorList, type SelectedVendor } from "@/components/rfq-vendor-list";
import { SrBoqIssuePanel } from "@/components/sr/sr-boq-issue-panel";
import { SrReviewSend } from "@/components/sr/sr-review-send";
import { SrComparisonPanel } from "@/components/sr/sr-comparison-panel";
import { StatusStepper } from "@/components/rfq/status-stepper";
import { deriveSrStage, type RfqStage } from "@/lib/rfq-stage";

const ACCEPTED_EXTENSIONS = ".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg";
const MAX_FILE_SIZE = 100 * 1024 * 1024;

export const Route = createFileRoute("/_app/rfq/sub/$rfqId")({
  component: RfqWizardPage,
});

interface RfqHeader {
  rfq_reference: string;
  subject_works: string;
  scope_summary: string | null;
  vendor_count: number;
  drive_folder_url: string | null;
  status: string;
  deadline: string | null;
}

// ── Supporting-document upload (auto-runs once for files carried from create) ───

type UploadStatus = "pending" | "uploading" | "done" | "error";

interface FileUploadItem {
  file: File;
  fileType: string;
  status: UploadStatus;
  error?: string;
  driveUrl?: string;
}

function FileUploadProgress({
  rfqId,
  files,
  fileTypes,
}: {
  rfqId: string;
  files: File[];
  fileTypes: string[];
}) {
  const uploadedRef = useRef(false);
  const [items, setItems] = useState<FileUploadItem[]>(() =>
    files.map((file, i) => ({ file, fileType: fileTypes[i] || "other", status: "pending" })),
  );
  const [uploading, setUploading] = useState(false);

  const updateItem = (index: number, updates: Partial<FileUploadItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  };

  const uploadAll = useCallback(async () => {
    if (uploadedRef.current) return;
    setUploading(true);
    let allSucceeded = true;
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === "done") continue;
      updateItem(i, { status: "uploading", error: undefined });
      try {
        const base64 = await fileToBase64(items[i].file);
        const result = await uploadDocument(rfqId, items[i].file, items[i].fileType, base64);
        if (result.ok && result.data.success) {
          updateItem(i, { status: "done", driveUrl: result.data.drive_file_url });
        } else {
          const errMsg = result.ok ? "Upload returned an error" : result.error;
          updateItem(i, { status: "error", error: errMsg });
          allSucceeded = false;
        }
      } catch (err) {
        updateItem(i, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
        allSucceeded = false;
      }
    }
    setUploading(false);
    if (allSucceeded) {
      uploadedRef.current = true;
      clearFiles(rfqId);
    }
  }, [items, rfqId]);

  useEffect(() => {
    if (!uploadedRef.current && items.some((i) => i.status === "pending")) {
      uploadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDone = items.every((i) => i.status === "done");
  const hasErrors = items.some((i) => i.status === "error");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Uploading supporting documents
          {allDone && <span className="ml-2 text-sm font-normal text-[var(--accent)]">Done</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, index) => (
          <div
            key={`${item.file.name}-${index}`}
            className="flex items-center gap-3 rounded-md border border-border p-3"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-sm">{item.file.name}</span>
            <span className="text-xs text-muted-foreground">{item.fileType}</span>
            {item.status === "pending" && (
              <span className="text-xs text-muted-foreground">Waiting...</span>
            )}
            {item.status === "uploading" && (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
            )}
            {item.status === "done" && <CheckCircle2 className="h-4 w-4 text-[var(--accent)]" />}
            {item.status === "error" && (
              <button
                type="button"
                onClick={() => uploadAll()}
                className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
              >
                <AlertCircle className="h-4 w-4 text-destructive" />
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {hasErrors && !uploading && (
          <Button type="button" variant="outline" size="sm" onClick={uploadAll} className="mt-2">
            Retry Failed
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Documents library (in Drive) ───────────────────────────────────────────────

interface Attachment {
  attachment_id: string;
  filename: string;
  file_type: string;
  drive_file_url: string | null;
}

function DocumentsList({ rfqId }: { rfqId: string }) {
  const [docs, setDocs] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingFile, setAddingFile] = useState(false);
  const addFileRef = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async () => {
    const { data } = await supabase
      .from("rfq_attachments")
      .select("attachment_id, filename, file_type, drive_file_url")
      .eq("rfq_id", rfqId)
      .order("uploaded_at", { ascending: true });
    setDocs(data ?? []);
    setLoading(false);
  }, [rfqId]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (addFileRef.current) addFileRef.current.value = "";
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. For files over 100 MB, upload to the Drive folder directly.");
      return;
    }
    setAddingFile(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await uploadDocument(rfqId, file, "other", base64);
      if (result.ok && result.data.success) {
        toast.success(`${file.name} uploaded`);
        fetchDocs();
      } else {
        toast.error(`Upload failed: ${result.ok ? "Backend error" : result.error}`);
      }
    } catch {
      toast.error("Upload failed");
    }
    setAddingFile(false);
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Supporting documents</CardTitle>
          <div>
            <input
              ref={addFileRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleAddFile}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={addingFile}
              onClick={() => addFileRef.current?.click()}
              className="gap-1.5"
            >
              {addingFile ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Add file
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents attached yet.</p>
        ) : (
          docs.map((doc) => (
            <div
              key={doc.attachment_id}
              className="flex items-center gap-3 rounded-md border border-border p-3"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-sm">{doc.filename}</span>
              <Badge variant="secondary" className="text-xs">
                {doc.file_type}
              </Badge>
              {doc.drive_file_url && (
                <a
                  href={doc.drive_file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View
                </a>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ── Response deadline ──────────────────────────────────────────────────────────

function SrDeadlineEditor({
  rfqId,
  initial,
  readOnly,
  onChange,
}: {
  rfqId: string;
  initial: string;
  readOnly: boolean;
  onChange?: (v: string) => void;
}) {
  const [deadline, setDeadline] = useState(initial);
  const [defaultDays, setDefaultDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const defaultedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", "rfq_default_deadline_days")
        .maybeSingle();
      const n = parseInt((data?.setting_value as string) ?? "30", 10);
      if (alive) setDefaultDays(Number.isFinite(n) ? n : 30);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(
    async (value: string) => {
      setDeadline(value);
      onChange?.(value);
      setSaving(true);
      setSaved(false);
      try {
        const { error } = await supabase
          .from("rfqs")
          .update({ deadline: value || null })
          .eq("rfq_id", rfqId);
        if (error) throw error;
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch {
        /* non-fatal */
      } finally {
        setSaving(false);
      }
    },
    [rfqId, onChange],
  );

  useEffect(() => {
    if (defaultedRef.current || readOnly || initial || defaultDays == null) return;
    defaultedRef.current = true;
    const d = new Date();
    d.setDate(d.getDate() + defaultDays);
    save(d.toISOString().split("T")[0]);
  }, [defaultDays, initial, readOnly, save]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Response deadline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          {readOnly ? (
            <span className="text-sm font-medium">{initial || "—"}</span>
          ) : (
            <>
              <input
                type="date"
                value={deadline}
                onChange={(e) => save(e.target.value)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none"
              />
              {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {saved && !saving && (
                <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                  Saved
                </span>
              )}
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Shown to vendors as the last date for submission, in the invite email and on their bid
          portal.
        </p>
      </CardContent>
    </Card>
  );
}

// ── RFQ info strip (rides along on every step) ─────────────────────────────────

function RfqInfoStrip({ header }: { header: RfqHeader }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        {header.scope_summary && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Scope summary</p>
            <p className="mt-0.5 text-sm">{header.scope_summary}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Vendors matched</p>
            <p className="mt-0.5 text-sm font-semibold">{header.vendor_count}</p>
          </div>
          {header.drive_folder_url && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Drive folder</p>
              <a
                href={header.drive_folder_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline"
              >
                Open in Drive
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Wizard ─────────────────────────────────────────────────────────────────────

type StepKey = "boq" | "vendors" | "review";

function RfqWizardPage() {
  const { rfqId } = Route.useParams();
  const draft = getDraft(rfqId);
  const [header, setHeader] = useState<RfqHeader | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [boqLocked, setBoqLocked] = useState(false);
  const [vendorCount, setVendorCount] = useState(0);
  const [step, setStep] = useState<StepKey>("boq");
  const stepInit = useRef(false);
  const [selectedVendors, setSelectedVendors] = useState<SelectedVendor[]>([]);
  const [srStage, setSrStage] = useState<RfqStage>("draft");

  // The BOQ uploaded at creation — auto-fed to the Prepare-BOQ step (no re-upload).
  const draftBoqFile = useMemo(() => {
    if (!draft) return null;
    const i = draft.fileTypes.findIndex((t) => t === "boq");
    return i >= 0 ? draft.files[i] : null;
  }, [draft]);

  // Load header (from the in-memory draft, or fetch on hard refresh).
  useEffect(() => {
    if (draft) {
      const r = draft.response;
      setHeader({
        rfq_reference: r.rfq_reference,
        subject_works: r.subject_works,
        scope_summary: r.scope_summary,
        vendor_count: r.vendor_count,
        drive_folder_url: r.drive_folder_url,
        status: "draft",
        deadline: null,
      });
      return;
    }
    setLoading(true);
    (async () => {
      const { data: rfq, error: rfqErr } = await supabase
        .from("rfqs")
        .select("rfq_reference, subject_works, ai_notes, drive_folder_url, status, deadline")
        .eq("rfq_id", rfqId)
        .single();
      if (rfqErr || !rfq) {
        setError(rfqErr?.message ?? "RFQ not found");
        setLoading(false);
        return;
      }
      const { count } = await supabase
        .from("rfq_vendors")
        .select("id", { count: "exact", head: true })
        .eq("rfq_id", rfqId);
      setHeader({
        rfq_reference: rfq.rfq_reference,
        subject_works: rfq.subject_works,
        scope_summary: rfq.ai_notes,
        vendor_count: count ?? 0,
        drive_folder_url: rfq.drive_folder_url,
        status: rfq.status,
        deadline: rfq.deadline,
      });
      setLoading(false);
    })();
  }, [draft, rfqId]);

  // Load wizard state: BOQ locked? how many vendors?
  const loadState = useCallback(async () => {
    const [{ data: boq }, { count }] = await Promise.all([
      supabase
        .from("sr_boq")
        .select("boq_id")
        .eq("rfq_id", rfqId)
        .eq("status", "issued")
        .limit(1)
        .maybeSingle(),
      supabase.from("rfq_vendors").select("id", { count: "exact", head: true }).eq("rfq_id", rfqId),
    ]);
    setBoqLocked(!!boq?.boq_id);
    setVendorCount(count ?? 0);
  }, [rfqId]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  // Resume at the right step once state is known (only once, so user nav wins after).
  useEffect(() => {
    if (stepInit.current || !header) return;
    if (header.status === "issued") {
      stepInit.current = true;
      return; // management view
    }
    stepInit.current = true;
    setStep(!boqLocked ? "boq" : vendorCount === 0 ? "vendors" : "review");
  }, [header, boqLocked, vendorCount]);

  // Lifecycle stepper for the issued/management view.
  useEffect(() => {
    if (!header || header.status !== "issued") return;
    let alive = true;
    (async () => {
      const { data: boq } = await supabase
        .from("sr_boq")
        .select("boq_id")
        .eq("rfq_id", rfqId)
        .eq("status", "issued")
        .order("issued_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let bidCount = 0;
      let awardCount = 0;
      let comparisonStatus: string | null = null;
      if (boq?.boq_id) {
        const [{ count: bc }, { count: ac }, { data: cmp }] = await Promise.all([
          supabase
            .from("sr_bid")
            .select("*", { count: "exact", head: true })
            .eq("boq_id", boq.boq_id)
            .eq("is_latest", true),
          supabase
            .from("sr_award")
            .select("*", { count: "exact", head: true })
            .eq("boq_id", boq.boq_id),
          supabase.from("sr_comparison").select("status").eq("boq_id", boq.boq_id).maybeSingle(),
        ]);
        bidCount = bc ?? 0;
        awardCount = ac ?? 0;
        comparisonStatus = (cmp?.status as string | null) ?? null;
      }
      if (!alive) return;
      setSrStage(
        deriveSrStage({
          rfqStatus: header.status,
          boqIssued: !!boq?.boq_id,
          bidCount,
          awardCount,
          comparisonStatus,
        }),
      );
    })();
    return () => {
      alive = false;
    };
  }, [rfqId, header]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading RFQ...</div>;
  if (error) return <div className="p-6 text-sm text-destructive">Error: {error}</div>;
  if (!header) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;

  const issued = header.status === "issued";
  const storeFiles = draft?.files ?? [];
  const storeFileTypes = draft?.fileTypes ?? [];

  // ── Issued → management view ──
  if (issued) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl text-foreground">{header.rfq_reference}</h1>
            <p className="mt-1 text-lg text-foreground">{header.subject_works}</p>
          </div>
          <Badge variant="default" className="text-xs uppercase">
            Issued
          </Badge>
        </div>
        <div className="rounded-xl border border-border bg-card px-6 py-5">
          <StatusStepper current={srStage} />
        </div>
        <RfqInfoStrip header={header} />
        <RfqVendorList
          rfqId={rfqId}
          status={header.status}
          selected={selectedVendors}
          onSelectionChange={setSelectedVendors}
        />
        <SrComparisonPanel rfqId={rfqId} rfqReference={header.rfq_reference} />
      </div>
    );
  }

  // ── Draft → wizard ──
  const steps: { key: StepKey; label: string; enabled: boolean; done: boolean }[] = [
    { key: "boq", label: "Prepare BOQ", enabled: true, done: boqLocked },
    { key: "vendors", label: "Choose vendors", enabled: boqLocked, done: vendorCount > 0 },
    {
      key: "review",
      label: "Review & send",
      enabled: boqLocked && vendorCount > 0,
      done: false,
    },
  ];
  const idx = steps.findIndex((s) => s.key === step);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl text-foreground">{header.rfq_reference}</h1>
          <p className="mt-1 text-lg text-foreground">{header.subject_works}</p>
        </div>
        <Badge variant="secondary" className="text-xs uppercase">
          Draft
        </Badge>
      </div>

      <RfqInfoStrip header={header} />

      {/* Wizard step nav */}
      <div className="flex flex-wrap gap-2">
        {steps.map((s, i) => {
          const active = s.key === step;
          return (
            <button
              key={s.key}
              type="button"
              disabled={!s.enabled}
              onClick={() => s.enabled && setStep(s.key)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : s.enabled
                    ? "border-border bg-card text-foreground hover:bg-secondary"
                    : "border-border bg-card text-muted-foreground opacity-50"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  active ? "bg-white/20" : "bg-secondary"
                }`}
              >
                {s.done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Step body */}
      {step === "boq" && (
        <div className="space-y-6">
          <SrBoqIssuePanel
            rfqId={rfqId}
            rfqReference={header.rfq_reference}
            initialFile={draftBoqFile}
            onLockedChange={setBoqLocked}
          />
          {storeFiles.length > 0 && (
            <FileUploadProgress rfqId={rfqId} files={storeFiles} fileTypes={storeFileTypes} />
          )}
          <DocumentsList rfqId={rfqId} />
        </div>
      )}

      {step === "vendors" && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            These are the vendors this RFQ will be sent to. Add or remove to curate the list.
          </p>
          <RfqVendorList
            rfqId={rfqId}
            status={header.status}
            selected={selectedVendors}
            onSelectionChange={setSelectedVendors}
            onCountChange={setVendorCount}
            membershipMode
          />
        </div>
      )}

      {step === "review" && (
        <div className="space-y-6">
          <SrDeadlineEditor
            rfqId={rfqId}
            initial={header.deadline ?? ""}
            readOnly={false}
            onChange={(v) => setHeader((h) => (h ? { ...h, deadline: v } : h))}
          />
          <RfqEditableFields rfqId={rfqId} status={header.status} />
          <SrReviewSend
            rfqId={rfqId}
            deadline={header.deadline}
            onSent={() => setHeader((h) => (h ? { ...h, status: "issued" } : h))}
          />
        </div>
      )}

      {/* Footer nav */}
      {step !== "review" && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          {idx > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(steps[idx - 1].key)}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            disabled={!steps[idx + 1]?.enabled}
            onClick={() => steps[idx + 1] && setStep(steps[idx + 1].key)}
            className="gap-1.5 bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            {step === "boq" && !boqLocked
              ? "Lock the BOQ to continue"
              : step === "vendors" && vendorCount === 0
                ? "Add a vendor to continue"
                : "Next"}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      {step === "review" && idx > 0 && (
        <div className="flex border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep("vendors")}
            className="gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
