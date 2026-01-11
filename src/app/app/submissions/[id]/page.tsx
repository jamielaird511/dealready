"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function FileItem({ file, getDownloadUrl }: { file: any; getDownloadUrl: (path: string) => Promise<string | null> }) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  async function handleDownload() {
    if (downloadUrl) {
      window.open(downloadUrl, "_blank");
      return;
    }

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
  const [submission, setSubmission] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !submission || uploading) return;

    setUploading(true);
    setFilesError(null);
    const supabase = supabaseBrowser();

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

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
          details: (uploadError as any).details,
          hint: (uploadError as any).hint,
          code: (uploadError as any).code,
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

      const { error: insertError } = await supabase
        .from("submission_files")
        .insert(insertData);

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
        details: (error as any).details,
        hint: (error as any).hint,
        code: (error as any).code,
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

      {/* Findings / Requests Section */}
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
          Findings / Requests
        </h2>
        <p style={{ fontSize: 14, opacity: 0.6 }}>
          Submission findings and requests will be displayed here.
        </p>
      </div>
    </main>
  );
}
