"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { AssessmentCard } from "@/components/AssessmentCard";
import { DeleteFileDialog } from "@/components/DeleteFileDialog";

type SubmissionRow = { id: string; deal_id?: string; title?: string; status?: string; created_at?: string; updated_at?: string };
type SubmissionFileRow = {
  id?: string;
  storage_path?: string;
  original_filename?: string;
  created_at?: string;
  display_name?: string | null;
  category?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  extracted_text?: string | null;
  extraction_status?: string | null;
  extraction_error?: string | null;
  extracted_at?: string | null;
  extracted_len?: number | null;
  doc_type?: string | null;
  doc_type_confidence?: number | null;
  doc_type_ran_at?: string | null;
};
type RunRow = { id: string; submission_id?: string; status?: string; score?: number; assessment_status?: string; top_fixes?: string[]; assessed_at?: string | null; created_at?: string };
type FindingRow = { id?: string; run_id: string; title?: string | null; severity?: string | null; category?: string | null; message?: string | null; fix?: string | null; score_impact?: number | null; workflow_state?: string | null; created_at?: string | null };
type SupabaseErrorLike = { message?: string; details?: unknown; hint?: string; code?: string };

function formatCategory(cat: string | null | undefined): string {
  if (!cat) return "";
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function FileItem({
  file,
  getDownloadUrl,
  onRefresh,
  onRequestDelete,
}: {
  file: SubmissionFileRow;
  getDownloadUrl: (path: string) => Promise<string | null>;
  onRefresh: () => void;
  onRequestDelete: (file: SubmissionFileRow) => void;
}) {
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const title = file.display_name ?? file.original_filename ?? "File";
  const showSubline = file.display_name != null && file.original_filename != null && file.display_name !== file.original_filename;

  function handlePreview() {
    setShowPreviewModal(true);
  }

  async function handleOpenPdf() {
    if (!file.storage_path) return;
    setLoadingUrl(true);
    const url = await getDownloadUrl(file.storage_path);
    setLoadingUrl(false);
    if (url) window.open(url, "_blank");
    else alert("Error generating link.");
  }

  async function handleDownload() {
    if (!file.storage_path) return;
    setLoadingUrl(true);
    const url = await getDownloadUrl(file.storage_path);
    setLoadingUrl(false);
    if (url) window.open(url, "_blank");
    else alert("Error generating download link. Please try again.");
  }

  async function handleRetryExtract() {
    if (!file.id || retrying) return;
    setRetrying(true);
    try {
      const res = await fetch("/api/submission-files/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id }),
      });
      if (res.ok) onRefresh();
      else alert("Retry failed. Check console.");
    } catch (e) {
      console.error(e);
      alert("Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  const statusParts: string[] = [];
  if (file.extraction_status) statusParts.push(String(file.extraction_status));
  if (file.extracted_len != null) statusParts.push(`${file.extracted_len} chars`);
  if (file.extraction_error) statusParts.push(`Error: ${file.extraction_error}`);
  const statusLine = statusParts.length > 0 ? statusParts.join(" · ") : null;

  return (
    <>
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.1)",
        borderRadius: 8,
        padding: 12,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>
          {title}
        </div>
        {showSubline && (
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{file.original_filename}</div>
        )}
        {file.category && (
          <span
            style={{
              display: "inline-block",
              marginBottom: 6,
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              background: "#e5e7eb",
              color: "#374151",
            }}
          >
            {formatCategory(file.category)}
          </span>
        )}
        {statusLine && (
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{statusLine}</div>
        )}
        {file.created_at && (
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
            Uploaded: {new Date(file.created_at).toLocaleString()}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={handlePreview}
          disabled={loadingUrl}
          style={{ padding: "6px 10px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid #6b7280", background: "white", cursor: loadingUrl ? "not-allowed" : "pointer", opacity: loadingUrl ? 0.6 : 1 }}
        >
          {loadingUrl ? "…" : "Preview"}
        </button>
        <button
          type="button"
          onClick={handleRetryExtract}
          disabled={retrying || !file.id}
          style={{ padding: "6px 10px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid #4f46e5", background: "#eef2ff", color: "#4f46e5", cursor: retrying || !file.id ? "not-allowed" : "pointer", opacity: retrying || !file.id ? 0.6 : 1 }}
        >
          {retrying ? "Retrying…" : "Retry extract"}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={loadingUrl}
          style={{ padding: "6px 10px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid #059669", background: "#ecfdf5", color: "#047857", cursor: loadingUrl ? "not-allowed" : "pointer", opacity: loadingUrl ? 0.6 : 1 }}
        >
          Download
        </button>
        <button
          type="button"
          onClick={() => onRequestDelete(file)}
          style={{ padding: "6px 10px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid #b91c1c", background: "#fef2f2", color: "#b91c1c", cursor: "pointer" }}
        >
          Delete
        </button>
      </div>
    </div>

    {showPreviewModal && (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
        onClick={() => setShowPreviewModal(false)}
      >
        <div
          style={{ background: "white", borderRadius: 10, padding: 20, maxWidth: 640, width: "90%", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{file.display_name ?? file.original_filename ?? "File"}</div>
          {file.original_filename && (file.display_name !== file.original_filename || !file.display_name) && (
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>{file.original_filename}</div>
          )}
          {file.category && (
            <span style={{ display: "inline-block", marginBottom: 8, padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#e5e7eb", color: "#374151" }}>
              {formatCategory(file.category)}
            </span>
          )}
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            {file.extraction_status && <span>{file.extraction_status}</span>}
            {file.extracted_at && <span> · Extracted: {new Date(file.extracted_at).toLocaleString()}</span>}
          </div>
          {file.extraction_error && (
            <div style={{ fontSize: 13, color: "#b91c1c", marginBottom: 12, padding: 8, background: "#fef2f2", borderRadius: 6 }}>{file.extraction_error}</div>
          )}
          <pre
            style={{
              flex: 1,
              minHeight: 200,
              maxHeight: 360,
              overflow: "auto",
              margin: "0 0 16px 0",
              padding: 12,
              fontSize: 12,
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {file.extracted_text?.trim() ? file.extracted_text : "No extracted text yet."}
          </pre>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(file.extracted_text || "").then(() => alert("Copied to clipboard"))}
              style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid #6b7280", background: "white", cursor: "pointer" }}
            >
              Copy text
            </button>
            <button
              type="button"
              onClick={() => { handleRetryExtract(); }}
              disabled={retrying || !file.id}
              style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid #4f46e5", background: "#eef2ff", color: "#4f46e5", cursor: retrying || !file.id ? "not-allowed" : "pointer", opacity: retrying || !file.id ? 0.6 : 1 }}
            >
              {retrying ? "Retrying…" : "Retry extract"}
            </button>
            <button
              type="button"
              onClick={() => setShowPreviewModal(false)}
              style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid #6b7280", background: "white", cursor: "pointer" }}
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleOpenPdf}
              disabled={loadingUrl}
              style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid #059669", background: "#ecfdf5", color: "#047857", cursor: loadingUrl ? "not-allowed" : "pointer", opacity: loadingUrl ? 0.6 : 1 }}
            >
              {loadingUrl ? "…" : "Open PDF"}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
}

export default function SubmissionPage() {
  const params = useParams();
  const router = useRouter();
  const submissionId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<SubmissionRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<SubmissionFileRow[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadDisplayName, setUploadDisplayName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("other");
  const [latestRun, setLatestRun] = useState<RunRow | null>(null);

  // Prevent background scroll while upload modal is open
  useEffect(() => {
    if (!isUploadModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isUploadModalOpen]);
  const [latestRunLoading, setLatestRunLoading] = useState(false);
  const [latestFindings, setLatestFindings] = useState<FindingRow[]>([]);
  const [runNowLoading, setRunNowLoading] = useState(false);
  const [runNowError, setRunNowError] = useState<string | null>(null);
  const [findingActionLoadingId, setFindingActionLoadingId] = useState<string | null>(null);
  const [findingActionError, setFindingActionError] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<SubmissionFileRow | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  useEffect(() => {
    async function loadSubmission() {
      const supabase = supabaseBrowser();

      const { data, error: fetchError } = await supabase
        .from("submissions")
        .select("*")
        .eq("id", submissionId)
        .single();

      if (fetchError) {
        console.error("Error loading submission:", {
          message: fetchError.message,
          details: fetchError.details,
          hint: fetchError.hint,
          code: fetchError.code,
        });
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      setSubmission(data);
      setLoading(false);
    }

    if (submissionId) {
      loadSubmission();
    }
  }, [submissionId]);

  async function refreshFiles() {
    if (!submissionId) return;
    const supabase = supabaseBrowser();
    setFilesLoading(true);
    const { data, error: fetchError } = await supabase
      .from("submission_files")
      .select("id, storage_path, original_filename, created_at, display_name, category, mime_type, size_bytes, extraction_status, extraction_error, extracted_at, extracted_text, doc_type, doc_type_confidence, doc_type_ran_at")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: false });
    if (fetchError) {
      console.error("Error loading files:", { message: fetchError.message, details: fetchError.details, hint: fetchError.hint, code: fetchError.code });
      setFilesError(fetchError.message);
    } else {
      setFilesError(null);
      setFiles(data || []);
    }
    setFilesLoading(false);
  }

  useEffect(() => {
    if (submissionId && !loading) {
      refreshFiles();
    }
  }, [submissionId, loading]);

  async function loadLatestRun() {
    if (!submissionId) return;
    const supabase = supabaseBrowser();
    setLatestRunLoading(true);
    const { data: runs, error: runsError } = await supabase
      .from("submission_runs")
      .select("*")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (runsError || !runs?.length) {
      setLatestRun(null);
      setLatestFindings([]);
      setLatestRunLoading(false);
      return;
    }
    const run = runs[0] as RunRow;
    setLatestRun(run);
    const { data: findingsData, error: findingsError } = await supabase
      .from("submission_run_findings")
      .select("*")
      .eq("run_id", run.id)
      .order("created_at", { ascending: false });
    if (findingsError) {
      setLatestFindings([]);
    } else {
      setLatestFindings((findingsData || []) as FindingRow[]);
    }
    setLatestRunLoading(false);
  }

  useEffect(() => {
    if (submissionId && !loading) {
      loadLatestRun();
    }
  }, [submissionId, loading]);

  async function updateFindingWorkflowState(findingId: string, nextState: "open" | "acknowledged" | "resolved") {
    setFindingActionError(null);
    setFindingActionLoadingId(findingId);
    const now = new Date().toISOString();
    try {
      const supabase = supabaseBrowser();
      const payload: Record<string, unknown> = {
        workflow_state: nextState,
        state_changed_at: now,
      };
      if (nextState === "acknowledged" || nextState === "resolved") {
        const { data: row, error: selectError } = await supabase
          .from("submission_run_findings")
          .select("acknowledged_at, resolved_at")
          .eq("id", findingId)
          .single();
        if (selectError) {
          console.error("[finding update] failed", { findingId, nextState, error: selectError });
          setFindingActionError(selectError.message ?? "Update failed");
          return;
        }
        if (nextState === "acknowledged") {
          payload.acknowledged_at = row?.acknowledged_at ?? now;
        }
        if (nextState === "resolved") {
          payload.resolved_at = row?.resolved_at ?? now;
        }
      }
      const { error } = await supabase
        .from("submission_run_findings")
        .update(payload)
        .eq("id", findingId);
      if (error) {
        console.error("[finding update] failed", { findingId, nextState, error });
        setFindingActionError(error.message ?? "Update failed");
        return;
      }
      console.log("[finding update] ok", { findingId, nextState });
      await loadLatestRun();
    } catch (err) {
      setFindingActionError(err instanceof Error ? err.message : "Failed to update finding");
    } finally {
      setFindingActionLoadingId(null);
    }
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    const nameWithoutExt = file.name.replace(/\.[^.]+$/, "") || file.name;
    setUploadDisplayName(nameWithoutExt);
    setUploadCategory("other");
    setIsUploadModalOpen(true);
    event.target.value = "";
  }

  async function performUpload(file: File, meta: { display_name: string; category: string }) {
    if (!submission || uploading) return;

    setUploading(true);
    setFilesError(null);
    const supabase = supabaseBrowser();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.error("No authenticated user for storage upload");
      alert("You are not authenticated. Please refresh and try again.");
      setUploading(false);
      return;
    }

    try {
      const timestamp = Date.now();
      const storagePath = `${submissionId}/${timestamp}_${file.name}`;
      const bucketName = "deal-packs";

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, file, {
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        console.error("Error uploading file:", uploadError);
        console.error("Upload error details:", {
          message: uploadError.message,
          details: (uploadError as SupabaseErrorLike).details,
          hint: (uploadError as SupabaseErrorLike).hint,
          code: (uploadError as SupabaseErrorLike).code,
        });
        alert("Error uploading file. Please try again.");
        setUploading(false);
        return;
      }

      const validCategories = ["financials", "tax", "forecasts", "business_plan", "broker_app", "security", "other"];
      const safeCategory = validCategories.includes(meta.category) ? meta.category : "other";
      const displayName = (meta.display_name || "").trim() || file.name;

      const insertData = {
        submission_id: submission.id,
        storage_path: storagePath,
        original_filename: file.name,
        display_name: displayName,
        category: safeCategory,
        mime_type: file.type,
        size_bytes: file.size
      };

      const { data: insertedFile, error: insertError } = await supabase
        .from("submission_files")
        .insert(insertData)
        .select("id")
        .single();

      if (insertError) {
        console.error("Error inserting file record:", insertError);
        console.error("Insert error details:", {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code,
        });
        const isRLSError = insertError.code === "42501" ||
          insertError.message?.toLowerCase().includes("permission denied") ||
          insertError.message?.toLowerCase().includes("row-level security");
        if (isRLSError) {
          alert("Permission denied. Please ensure RLS policies are configured for submission_files. See console for details.");
        } else {
          alert("Error saving file record. Please try again. See console for details.");
        }
        setUploading(false);
        return;
      }

      if (insertedFile?.id) {
        fetch("/api/submission-files/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: insertedFile.id }),
        }).catch(() => {});
      }

      const { data: refreshedFiles, error: refreshError } = await supabase
        .from("submission_files")
        .select("*")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: false });

      if (refreshError) {
        console.error("Error refreshing files:", refreshError);
      } else {
        setFiles(refreshedFiles || []);
      }

      setIsUploadModalOpen(false);
      setPendingFile(null);
      setUploadDisplayName("");
      setUploadCategory("other");
      setUploading(false);
    } catch (err) {
      console.error("Error:", err);
      setUploading(false);
    }
  }

  function handleUploadModalConfirm() {
    if (!pendingFile || uploading || !uploadCategory) return;
    const displayName = uploadDisplayName.trim() || pendingFile.name;
    performUpload(pendingFile, { display_name: displayName, category: uploadCategory });
  }

  function handleUploadModalCancel() {
    if (uploading) return;
    setIsUploadModalOpen(false);
    setPendingFile(null);
    setUploadDisplayName("");
    setUploadCategory("other");
  }

  async function handleRunAssessment() {
    if (!submissionId || runNowLoading) return;
    setRunNowLoading(true);
    setRunNowError(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/run`, { method: "POST", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        await loadLatestRun();
      } else {
        setRunNowError(json?.error ?? "Failed to run assessment");
      }
    } catch (err) {
      console.error("Run assessment failed:", err);
      setRunNowError(err instanceof Error ? err.message : "Failed to run assessment");
    } finally {
      setRunNowLoading(false);
    }
  }

  async function getDownloadUrl(storagePath: string): Promise<string | null> {
    const supabase = supabaseBrowser();
    const bucketName = "deal-packs";

    // Try to create signed URL (60s expiry)
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(storagePath, 60);

    if (error) {
      console.error("Error creating signed URL:", {
        message: error.message,
        details: (error as SupabaseErrorLike).details,
        hint: (error as SupabaseErrorLike).hint,
        code: (error as SupabaseErrorLike).code,
      });
      return null;
    }

    return data?.signedUrl || null;
  }

  async function handleConfirmDeleteFile() {
    if (!fileToDelete?.id) return;
    setDeleteInProgress(true);
    const supabase = supabaseBrowser();
    const bucket = (fileToDelete as { storage_bucket?: string }).storage_bucket ?? "deal-packs";
    if (fileToDelete.storage_path) {
      const { error: storageError } = await supabase.storage.from(bucket).remove([fileToDelete.storage_path]);
      if (storageError) {
        console.error("Storage delete error:", storageError);
        alert("Failed to delete file from storage.");
        setDeleteInProgress(false);
        return;
      }
    }
    const { error: dbError } = await supabase.from("submission_files").delete().eq("id", fileToDelete.id);
    if (dbError) {
      console.error("DB delete error:", dbError);
      alert("File removed from storage but record delete failed.");
    }
    refreshFiles();
    setFileToDelete(null);
    setDeleteInProgress(false);
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
        <p>Loading submission...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
        <p style={{ color: "crimson" }}>Error: {error}</p>
        <button
          onClick={() => router.push("/app")}
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Back to App
        </button>
      </main>
    );
  }

  const backPath = submission?.deal_id 
    ? `/app/deals/${submission.deal_id}`
    : "/app";

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => router.push(backPath)}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            cursor: "pointer",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          ← Back
        </button>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
          {submission?.title || "Submission"}
        </h1>
        {submission?.status && (
          <p style={{ opacity: 0.8, marginBottom: 16 }}>
            Status: {submission.status}
          </p>
        )}
      </div>

      {/* Submission Details */}
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.2)",
          borderRadius: 10,
          padding: 20,
          background: "white",
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Details</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {submission?.title && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, marginBottom: 4 }}>
                Title
              </div>
              <div style={{ fontSize: 14 }}>{submission.title}</div>
            </div>
          )}
          {submission?.status && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, marginBottom: 4 }}>
                Status
              </div>
              <div style={{ fontSize: 14 }}>{submission.status}</div>
            </div>
          )}
          {submission?.created_at && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, marginBottom: 4 }}>
                Created
              </div>
              <div style={{ fontSize: 14 }}>
                {new Date(submission.created_at).toLocaleString()}
              </div>
            </div>
          )}
          {submission?.updated_at && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, marginBottom: 4 }}>
                Updated
              </div>
              <div style={{ fontSize: 14 }}>
                {new Date(submission.updated_at).toLocaleString()}
              </div>
            </div>
          )}
          {submission?.deal_id && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, marginBottom: 4 }}>
                Deal ID
              </div>
              <div style={{ fontSize: 14, fontFamily: "monospace" }}>
                {submission.deal_id}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Files Section */}
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.2)",
          borderRadius: 10,
          padding: 20,
          background: "white",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 0 }}>Files</h2>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 16px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: uploading ? "not-allowed" : "pointer",
              fontWeight: 600,
              opacity: uploading ? 0.6 : 1,
            }}
          >
            <input
              type="file"
              onChange={handleFileSelect}
              disabled={uploading}
              style={{ display: "none" }}
            />
            {uploading ? "Uploading..." : "Upload File"}
          </label>
        </div>

        {filesError && (
          <p style={{ fontSize: 14, color: "crimson", marginBottom: 16 }}>
            Error: {filesError}
          </p>
        )}

        {filesLoading ? (
          <p style={{ fontSize: 14, opacity: 0.6 }}>Loading files...</p>
        ) : files.length === 0 ? (
          <p style={{ fontSize: 14, opacity: 0.6 }}>No files uploaded yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {files.map((file) => (
              <FileItem key={file.id} file={file} getDownloadUrl={getDownloadUrl} onRefresh={refreshFiles} onRequestDelete={setFileToDelete} />
            ))}
          </div>
        )}
      </div>

      <DeleteFileDialog
        open={fileToDelete != null}
        onOpenChange={(open) => !open && setFileToDelete(null)}
        fileName={fileToDelete ? (fileToDelete.display_name ?? fileToDelete.original_filename ?? "File") : ""}
        onConfirm={handleConfirmDeleteFile}
        isDeleting={deleteInProgress}
      />

      {/* Upload File Modal */}
      {isUploadModalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
          onClick={handleUploadModalCancel}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Upload File</h3>
            {pendingFile && (
              <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>File: {pendingFile.name}</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#374151" }}>
                  Display name (required)
                </label>
                <input
                  type="text"
                  value={uploadDisplayName}
                  onChange={(e) => setUploadDisplayName(e.target.value)}
                  placeholder="Enter display name"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 14,
                    border: "1px solid rgba(0,0,0,0.2)",
                    borderRadius: 8,
                    outline: "none",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#374151" }}>
                  Category (required)
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  disabled={uploading}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 14,
                    border: "1px solid rgba(0,0,0,0.2)",
                    borderRadius: 8,
                    outline: "none",
                    background: "white",
                  }}
                >
                  <option value="financials">Financials</option>
                  <option value="tax">Tax</option>
                  <option value="forecasts">Forecasts</option>
                  <option value="business_plan">Business Plan</option>
                  <option value="broker_app">Broker Application/SoP</option>
                  <option value="security">Security</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  type="button"
                  onClick={handleUploadModalCancel}
                  disabled={uploading}
                  style={{
                    padding: "10px 20px",
                    fontSize: 14,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.2)",
                    background: "white",
                    cursor: uploading ? "not-allowed" : "pointer",
                    opacity: uploading ? 0.6 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUploadModalConfirm}
                  disabled={uploading || !pendingFile || !uploadCategory}
                  style={{
                    padding: "10px 20px",
                    fontSize: 14,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: "1px solid #4f46e5",
                    background: uploading || !pendingFile || !uploadCategory ? "#e5e7eb" : "#4f46e5",
                    color: uploading || !pendingFile || !uploadCategory ? "#9ca3af" : "white",
                    cursor: uploading || !pendingFile || !uploadCategory ? "not-allowed" : "pointer",
                    opacity: uploading || !pendingFile || !uploadCategory ? 0.6 : 1,
                  }}
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AssessmentCard
        findings={latestFindings}
        run={latestRun}
        runLoading={latestRunLoading}
        runError={null}
        runNowLoading={runNowLoading}
        runNowError={runNowError}
        findingActionError={findingActionError}
        findingActionLoadingId={findingActionLoadingId}
        onRunAssessment={handleRunAssessment}
        onUpdateWorkflowState={updateFindingWorkflowState}
      />
    </main>
  );
}
