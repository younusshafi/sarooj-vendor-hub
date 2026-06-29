import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import { RfqEditableFields } from "@/components/rfq-editable-fields";
import { RfqVendorList, type SelectedVendor } from "@/components/rfq-vendor-list";
import { RfqEmailEditor } from "@/components/rfq-email-editor";
import { SrBidLinksPanel } from "@/components/sr/sr-bid-links-panel";
import { SrBoqIssuePanel } from "@/components/sr/sr-boq-issue-panel";
import { SrComparisonPanel } from "@/components/sr/sr-comparison-panel";
import { StatusStepper } from "@/components/rfq/status-stepper";
import { deriveSrStage, type RfqStage } from "@/lib/rfq-stage";

const ACCEPTED_EXTENSIONS = ".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg";
const MAX_FILE_SIZE = 100 * 1024 * 1024;

export const Route = createFileRoute("/_app/rfq/sub/$rfqId")({
  component: RfqPreviewPage,
});

interface RfqHeader {
  rfq_reference: string;
  subject_works: string;
  scope_summary: string | null; // from generate response (in-memory) or ai_notes (DB)
  vendor_count: number;
  drive_folder_url: string | null;
  status: string;
  deadline: string | null;
  covering_email_subject: string | null;
  covering_email_body: string | null;
}

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
    files.map((file, i) => ({
      file,
      fileType: fileTypes[i] || "other",
      status: "pending",
    })),
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

  const retryFile = async (index: number) => {
    updateItem(index, { status: "uploading", error: undefined });
    try {
      const item = items[index];
      const base64 = await fileToBase64(item.file);
      const result = await uploadDocument(rfqId, item.file, item.fileType, base64);

      if (result.ok && result.data.success) {
        updateItem(index, { status: "done", driveUrl: result.data.drive_file_url });
        // Check if all items are now done
        const updatedItems = items.map((it, i) =>
          i === index ? { ...it, status: "done" as const } : it,
        );
        if (updatedItems.every((it) => it.status === "done")) {
          uploadedRef.current = true;
          clearFiles(rfqId);
        }
      } else {
        const errMsg = result.ok ? "Upload returned an error" : result.error;
        updateItem(index, { status: "error", error: errMsg });
      }
    } catch (err) {
      updateItem(index, {
        status: "error",
        error: err instanceof Error ? err.message : "Retry failed",
      });
    }
  };

  // Auto-start upload on mount — once only
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
        <CardTitle className="text-lg">
          Document Upload
          {allDone && (
            <span className="ml-2 text-sm font-normal text-[var(--accent)]">Complete</span>
          )}
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
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <button
                  type="button"
                  onClick={() => retryFile(index)}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
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
      toast.error(
        "File too large. For files over 100 MB, please upload directly to the RFQ Drive folder and inform procurement.",
      );
      return;
    }

    setAddingFile(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await uploadDocument(rfqId, file, "other", base64);
      if (result.ok && result.data.success) {
        toast.success(`${file.name} uploaded successfully`);
        fetchDocs();
      } else {
        toast.error(`Upload failed: ${result.ok ? "Backend error" : result.error}`);
      }
    } catch {
      toast.error("Upload failed");
    }
    setAddingFile(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading documents...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Documents</CardTitle>
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
              Add File
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

// ── Response deadline editor ─────────────────────────────────────────────────
// Mirrors the materials RfqDeadlineEditor (rfq.$rfqId.index.tsx): a fresh draft with
// no deadline is pre-filled to today + system_settings.rfq_default_deadline_days (30),
// editable while draft, read-only once issued. Empty string is coerced to null on write
// (deadline is a date column).

function SrDeadlineEditor({
  rfqId,
  initial,
  readOnly,
}: {
  rfqId: string;
  initial: string;
  readOnly: boolean;
}) {
  const [deadline, setDeadline] = useState(initial);
  const [defaultDays, setDefaultDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const defaultedRef = useRef(false);

  // Configurable default window (system_settings.rfq_default_deadline_days, default 30).
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
      setSaving(true);
      setSaved(false);
      try {
        const { error } = await supabase
          .from("rfqs")
          .update({ deadline: value || null }) // empty → null for the date column
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
    [rfqId],
  );

  // Fresh draft with no deadline yet → pre-fill (and persist) today + default days.
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
        <CardTitle className="text-lg">Response Deadline</CardTitle>
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
          Shown to vendors as the last date for submission in the invite email and on their bid
          portal.
        </p>
      </CardContent>
    </Card>
  );
}

function RfqPreviewPage() {
  const { rfqId } = Route.useParams();
  const draft = getDraft(rfqId);
  const [header, setHeader] = useState<RfqHeader | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "boqdocs" | "vendors" | "bids">(
    "overview",
  );
  // Vendor selection lives here (not in RfqVendorList) so it persists across
  // Overview/Vendors tab switches and is available to the dispatch panel.
  const [selectedVendors, setSelectedVendors] = useState<SelectedVendor[]>([]);
  const [srStage, setSrStage] = useState<RfqStage>("draft");

  // If store has data, use it directly
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
        covering_email_subject: r.covering_email_subject,
        covering_email_body: r.covering_email_body,
      });
      return;
    }

    // Fallback: fetch from Supabase on hard refresh
    setLoading(true);
    (async () => {
      const { data: rfq, error: rfqErr } = await supabase
        .from("rfqs")
        .select(
          "rfq_reference, subject_works, ai_notes, drive_folder_url, status, deadline, covering_email_subject, covering_email_body",
        )
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
        covering_email_subject: rfq.covering_email_subject,
        covering_email_body: rfq.covering_email_body,
      });
      setLoading(false);
    })();
  }, [draft, rfqId]);

  // Lifecycle stage for the stepper — derived from the sr_* tables (no persisted stage).
  // SR has no approval→PO flow yet, so it tops out at "evaluation"; later steps render greyed.
  useEffect(() => {
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
          rfqStatus: header?.status ?? null,
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
  }, [rfqId, header?.status]);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading RFQ...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">Error: {error}</p>
      </div>
    );
  }

  if (!header) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Determine file types from the store (attachments selected in the form)
  const storeFiles = draft?.files ?? [];
  const storeFileTypes = draft?.fileTypes ?? [];

  const tabs = [
    { key: "overview" as const, label: "Overview" },
    { key: "boqdocs" as const, label: "BOQ & Documents" },
    { key: "vendors" as const, label: "Vendors" },
    { key: "bids" as const, label: "Bids & Award" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl text-foreground">{header.rfq_reference}</h1>
          <p className="mt-1 text-lg text-foreground">{header.subject_works}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge
            variant={header.status === "issued" ? "default" : "secondary"}
            className="text-xs uppercase"
          >
            {header.status}
          </Badge>
          {header.status !== "draft" && (
            <button
              type="button"
              onClick={() => setActiveTab("bids")}
              className="text-sm font-medium"
              style={{ color: "var(--accent)" }}
            >
              Compare &amp; Award bids →
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card px-6 py-5">
        <StatusStepper current={srStage} />
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-[var(--accent)] text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {header.scope_summary && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Scope Summary</p>
                  <p className="mt-0.5 text-sm">{header.scope_summary}</p>
                </div>
              )}

              <div className="flex gap-6">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Vendors</p>
                  <p className="mt-0.5 text-sm font-semibold">{header.vendor_count}</p>
                </div>
                {header.drive_folder_url && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Drive Folder</p>
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

          <RfqEditableFields rfqId={rfqId} status={header.status} />

          <RfqEmailEditor rfqId={rfqId} status={header.status} />

          <SrDeadlineEditor
            rfqId={rfqId}
            initial={header.deadline ?? ""}
            readOnly={header.status !== "draft"}
          />
        </div>
      )}

      {/* Kept mounted (hidden when inactive) so a parsed-but-not-yet-issued BOQ and any cell
          edits survive switching tabs — the parse lives in component state until "Issue BOQ". */}
      <div className="space-y-6" hidden={activeTab !== "boqdocs"}>
        {/* The single BOQ upload + parse step (remote parser) → issue to vendors. */}
        <SrBoqIssuePanel rfqId={rfqId} rfqReference={header.rfq_reference} />
        {/* Scope documents library (drawings / specs). */}
        {storeFiles.length > 0 && (
          <FileUploadProgress rfqId={rfqId} files={storeFiles} fileTypes={storeFileTypes} />
        )}
        <DocumentsList rfqId={rfqId} />
      </div>

      {activeTab === "vendors" && (
        <div className="space-y-6">
          {/* Response deadline (read-only here; edit it on the Overview tab). */}
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
            <span className="w-36 shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Response Deadline
            </span>
            <span className="text-sm font-medium">{header.deadline || "Not set"}</span>
            {!header.deadline && (
              <span className="text-xs text-muted-foreground">— set it on the Overview tab</span>
            )}
          </div>
          {/* Primary select + send action: emails each invited vendor their link (honors
              Dispatch Test Mode). Per-vendor copy links are a secondary fallback inside. */}
          <SrBidLinksPanel rfqId={rfqId} deadline={header.deadline} />
          <RfqVendorList
            rfqId={rfqId}
            status={header.status}
            selected={selectedVendors}
            onSelectionChange={setSelectedVendors}
          />
        </div>
      )}

      {activeTab === "bids" && (
        <SrComparisonPanel rfqId={rfqId} rfqReference={header.rfq_reference} />
      )}
    </div>
  );
}
