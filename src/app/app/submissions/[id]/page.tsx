"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type SubmissionRow = { id: string; deal_id?: string; title?: string; status?: string; created_at?: string; updated_at?: string };
type SubmissionFileRow = { id?: string; storage_path?: string; original_filename?: string; created_at?: string; doc_type?: string | null; doc_type_confidence?: number | null; doc_type_ran_at?: string | null };
type RunRow = { id: string; submission_id?: string; status?: string; score?: number; assessment_status?: string; top_fixes?: string[]; assessed_at?: string | null; created_at?: string };
type FindingRow = { id?: string; run_id: string; title?: string | null; severity?: string | null; category?: string | null; message?: string | null; fix?: string | null; score_impact?: number | null; workflow_state?: string | null; created_at?: string | null };
type SupabaseErrorLike = { message?: string; details?: unknown; hint?: string; code?: string };

function FileItem({ file, getDownloadUrl }: { file: SubmissionFileRow; getDownloadUrl: (path: string) => Promise<string | null> }) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  async function handleDownload() {
    if (downloadUrl) {
      window.open(downloadUrl, "_blank");
      return;
    }
    if (!file.storage_path) return;

    setLoadingUrl(true);
    const url = await getDownloadUrl(file.storage_path);
    setDownloadUrl(url);
    setLoadingUrl(false);

    if (url) {
      window.open(url, "_blank");
    } else {
      alert("Error generating download link. Please try again.");
    }
  }

  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.1)",
        borderRadius: 8,
        padding: 12,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>
          {file.original_filename}
        </div>
        {file.doc_type && (
          <span
            style={{
              display: "inline-block",
              marginBottom: 4,
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              background: "#e5e7eb",
              color: "#374151",
            }}
          >
            {file.doc_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            {typeof file.doc_type_confidence === "number" && ` · ${Math.round(file.doc_type_confidence * 100)}%`}
          </span>
        )}
        {file.doc_type_ran_at && (
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            Classified: {new Date(file.doc_type_ran_at).toLocaleString()}
          </div>
        )}
        {file.created_at && (
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            Uploaded: {new Date(file.created_at).toLocaleString()}
          </div>
        )}
      </div>
      <button
        onClick={handleDownload}
        disabled={loadingUrl}
        style={{
          padding: "6px 12px",
          borderRadius: 8,
          border: "1px solid rgba(0,0,0,0.2)",
          cursor: loadingUrl ? "not-allowed" : "pointer",
          fontWeight: 600,
          fontSize: 13,
          opacity: loadingUrl ? 0.6 : 1,
        }}
      >
        {loadingUrl ? "Loading..." : "Download"}
      </button>
    </div>
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
  const [latestRun, setLatestRun] = useState<RunRow | null>(null);
  const [latestRunLoading, setLatestRunLoading] = useState(false);
  const [latestFindings, setLatestFindings] = useState<FindingRow[]>([]);
  const [runNowLoading, setRunNowLoading] = useState(false);
  const [runNowError, setRunNowError] = useState<string | null>(null);

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

  useEffect(() => {
    async function loadFiles() {
      if (!submissionId) return;

      const supabase = supabaseBrowser();

      const { data, error: fetchError } = await supabase
        .from("submission_files")
        .select("*")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Error loading files:", {
          message: fetchError.message,
          details: fetchError.details,
          hint: fetchError.hint,
          code: fetchError.code,
        });
        setFilesError(fetchError.message);
        setFilesLoading(false);
        return;
      }

      setFiles(data || []);
      setFilesLoading(false);
    }

    if (submissionId && !loading) {
      loadFiles();
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

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !submission || uploading) return;

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

      // Generate storage path: ${submissionId}/${timestamp}_${originalFilename}
      const timestamp = Date.now();
      const storagePath = `${submissionId}/${timestamp}_${file.name}`;
      const bucketName = "deal-packs";

      // Upload file to storage
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

      // Insert file record into submission_files
      const insertData = {
        submission_id: submission.id,
        storage_path: storagePath,
        original_filename: file.name,
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
        console.error("Insert error (stringified):", JSON.stringify(insertError, null, 2));
        console.error("Insert error details:", {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code,
        });

        // Check if it's an RLS error
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

      // Refresh files list
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

      // Reset file input
      event.target.value = "";
      setUploading(false);
    } catch (err) {
      console.error("Error:", err);
      setUploading(false);
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
              onChange={handleFileUpload}
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
              <FileItem key={file.id} file={file} getDownloadUrl={getDownloadUrl} />
            ))}
          </div>
        )}
      </div>

      {/* Assessment (latest run + findings) */}
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.2)",
          borderRadius: 10,
          padding: 20,
          background: "white",
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
          Assessment
        </h2>
        {runNowLoading && (
          <p style={{ fontSize: 14, opacity: 0.6, marginBottom: 12 }}>Running assessment…</p>
        )}
        {runNowError && (
          <div style={{ fontSize: 14, color: "crimson", marginBottom: 12, padding: 10, borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca" }}>Error: {runNowError}</div>
        )}
        {latestRunLoading ? (
          <p style={{ fontSize: 14, opacity: 0.6 }}>Loading run…</p>
        ) : !latestRun ? (
          <>
            <p style={{ fontSize: 14, opacity: 0.6, marginBottom: 12 }}>No runs yet.</p>
            <p style={{ fontSize: 13, opacity: 0.7 }}>
              Run assessment from the deal page (Upload Pack section) to see status, score, and findings here.
            </p>
            {submission?.deal_id && (
              <button
                type="button"
                onClick={() => router.push(`/app/deals/${submission.deal_id}`)}
                style={{
                  marginTop: 12,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.2)",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Go to deal
              </button>
            )}
          </>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 16, fontSize: 14 }}>
              {typeof latestRun.score === "number" && (
                <span><strong>Score:</strong> {latestRun.score}</span>
              )}
              {latestRun.assessment_status && (
                <span><strong>Status:</strong> {String(latestRun.assessment_status).replace(/_/g, " ")}</span>
              )}
              {latestRun.assessed_at && (
                <span><strong>Assessed:</strong> {new Date(latestRun.assessed_at).toLocaleString()}</span>
              )}
            </div>
            {Array.isArray(latestRun.top_fixes) && latestRun.top_fixes.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#374151" }}>Top fixes</div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#4b5563" }}>
                  {latestRun.top_fixes.map((fix, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{fix}</li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#374151" }}>Findings</div>
            {latestFindings.length === 0 ? (
              <p style={{ fontSize: 14, opacity: 0.6 }}>No findings for latest run.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {latestFindings.map((f, i) => (
                  <div
                    key={f.id ?? i}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      {f.severity && (
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: "capitalize",
                            background: f.severity === "critical" ? "#fee2e2" : f.severity === "warning" ? "#fef3c7" : "#e0e7ff",
                            color: f.severity === "critical" ? "#991b1b" : f.severity === "warning" ? "#92400e" : "#3730a3",
                          }}
                        >
                          {f.severity}
                        </span>
                      )}
                      {f.workflow_state && (
                        <span style={{ fontSize: 11, opacity: 0.8 }}>{String(f.workflow_state).replace(/_/g, " ")}</span>
                      )}
                      {f.title && <span style={{ fontWeight: 600, color: "#374151" }}>{f.title}</span>}
                    </div>
                    {f.category && <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{f.category}</div>}
                    {f.message && <p style={{ margin: "0 0 6px 0", color: "#4b5563" }}>{f.message}</p>}
                    {f.fix && <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}><strong>Fix:</strong> {f.fix}</p>}
                    {(f.score_impact != null || f.created_at) && (
                      <div style={{ marginTop: 6, fontSize: 11, opacity: 0.6 }}>
                        {f.score_impact != null && `Impact: ${f.score_impact}`}
                        {f.score_impact != null && f.created_at && " · "}
                        {f.created_at && `Created: ${new Date(f.created_at).toLocaleString()}`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <button
          type="button"
          onClick={async () => {
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
          }}
          disabled={runNowLoading}
          style={{
            marginTop: 20,
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 8,
            border: "1px solid #4f46e5",
            background: runNowLoading ? "#c7d2fe" : "#4f46e5",
            color: "white",
            cursor: runNowLoading ? "not-allowed" : "pointer",
            opacity: runNowLoading ? 0.8 : 1,
          }}
        >
          {runNowLoading ? "Running…" : "Run assessment"}
        </button>
      </div>
    </main>
  );
}
