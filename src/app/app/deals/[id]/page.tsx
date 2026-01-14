"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function FileItem({ file, getDownloadUrl, onDelete }: { file: any; getDownloadUrl: (path: string) => Promise<string | null>; onDelete: (fileId: string) => void }) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  async function handleDelete() {
    if (!confirm(`Are you sure you want to delete "${file.display_name || file.original_filename}"?`)) {
      return;
    }

    setDeleting(true);
    onDelete(file.id);
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
          {file.display_name || file.original_filename}
        </div>
        {file.created_at && (
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            Uploaded: {new Date(file.created_at).toLocaleString()}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #dc2626",
            background: deleting ? "#fca5a5" : "#fee2e2",
            color: "#991b1b",
            cursor: deleting ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 13,
            opacity: deleting ? 0.6 : 1,
          }}
          title="Delete file"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

export default function DealPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("draft");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Deal parties state
  const [dealParties, setDealParties] = useState<any[]>([]);
  const [partiesLoading, setPartiesLoading] = useState(true);
  
  // Add party form state
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerRole, setNewCustomerRole] = useState("borrower");
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityRole, setNewEntityRole] = useState("borrower");
  const [addingParty, setAddingParty] = useState(false);
  
  const [notes, setNotes] = useState("");
  
  // File upload state (using first submission automatically)
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [category, setCategory] = useState("financials");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadDeal() {
      const supabase = supabaseBrowser();

      const { data, error: fetchError } = await supabase
        .from("deals")
        .select("*")
        .eq("id", dealId)
        .maybeSingle();

      if (fetchError) {
        console.error("Error loading deal:", {
          message: fetchError.message,
          details: fetchError.details,
          hint: fetchError.hint,
          code: fetchError.code,
        });
        setError("Failed to load deal");
        setLoading(false);
        return;
      }

      if (!data) {
        setError("not_found");
        setLoading(false);
        return;
      }

      setDeal(data);
      setName(data.name || "");
      setStatus(data.status || "draft");
      setNotes(data.notes || "");
      setLoading(false);
    }

    if (dealId) {
      loadDeal();
    }
  }, [dealId]);

  // Auto-load or create submission for file storage
  useEffect(() => {
    async function ensureSubmission() {
      if (!dealId || loading) return;

      const supabase = supabaseBrowser();

      // Get first submission for this deal
      const { data: submissions, error: fetchError } = await supabase
        .from("submissions")
        .select("*")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (fetchError) {
        console.error("Error loading submissions:", fetchError);
        setFilesLoading(false);
        return;
      }

      let submissionId = submissions?.[0]?.id;

      // Create submission if none exists
      if (!submissionId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: orgMember } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!orgMember?.organization_id) return;

        const { data: newSubmission, error: createError } = await supabase
          .from("submissions")
          .insert({
            org_id: orgMember.organization_id,
            created_by: user.id,
            title: deal?.name ? `${deal.name}` : "New Deal",
            deal_id: dealId,
            status: "draft",
          })
          .select()
          .single();

        if (createError) {
          console.error("Error creating submission:", createError);
          return;
        }

        submissionId = newSubmission.id;
      }

      setActiveSubmissionId(submissionId);

      // Load files
      setFilesLoading(true);
      const { data: filesData, error: filesError } = await supabase
        .from("submission_files")
        .select("*")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: false });

      if (filesError) {
        console.error("Error loading files:", filesError);
        setFilesError(filesError.message);
      } else {
        setFilesError(null);
        setFiles(filesData || []);
      }
      setFilesLoading(false);
    }

    ensureSubmission();
  }, [dealId, loading, deal]);

  // Load deal parties
  useEffect(() => {
    async function loadDealParties() {
      if (!dealId) return;

      const supabase = supabaseBrowser();

      const { data, error } = await supabase
        .from("deal_parties")
        .select("*")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error loading deal parties:", error);
        setPartiesLoading(false);
        return;
      }

      setDealParties(data || []);
      setPartiesLoading(false);
    }

    if (dealId && !loading) {
      loadDealParties();
    }
  }, [dealId, loading]);

  async function handleSave() {
    if (!deal) return;

    setSaving(true);
    setSaveMessage(null);
    const supabase = supabaseBrowser();

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setSaveMessage({ type: "error", text: "Not authenticated. Please sign in again." });
        setSaving(false);
        return;
      }

      const { data: updatedDeal, error: updateError } = await supabase
        .from("deals")
        .update({
          name: name.trim() || "New Deal",
          status: status,
          notes: notes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dealId)
        .select()
        .maybeSingle();

      if (updateError) {
        console.error("Error updating deal:", {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code,
        });
        setSaveMessage({ type: "error", text: "Failed to save deal. Please try again." });
        setSaving(false);
        return;
      }

      if (!updatedDeal) {
        setSaveMessage({ type: "error", text: "Deal not found or access denied." });
        setSaving(false);
        return;
      }

      setDeal(updatedDeal);
      setName(updatedDeal.name || "");
      setStatus(updatedDeal.status || "draft");
      setNotes(updatedDeal.notes || "");
      setSaveMessage({ type: "success", text: "Saved" });
      setTimeout(() => setSaveMessage(null), 3000);
      setSaving(false);
    } catch (err) {
      console.error("Error:", err);
      setSaveMessage({ type: "error", text: "An unexpected error occurred." });
      setSaving(false);
    }
  }

  function handleFileSelectButton() {
    setShowUploadModal(true);
  }

  function handleFileSelectInModal(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file) {
      // Auto-fill display name only if it's empty or unchanged (matches previous file name)
      if (!displayName || displayName === selectedFile?.name) {
        setDisplayName(file.name);
      }
    }
  }

  async function handleFileUpload() {
    if (!selectedFile || !category || uploading) return;

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

    // Ensure submission exists before upload
    let submissionId = activeSubmissionId;
    if (!submissionId) {
      // Get or create submission
      const { data: submissions } = await supabase
        .from("submissions")
        .select("*")
        .eq("deal_id", dealId)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1);

      if (submissions?.[0]?.id) {
        submissionId = submissions[0].id;
        setActiveSubmissionId(submissionId);
      } else {
        // Create submission if none exists
        const { data: orgMember } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!orgMember?.organization_id) {
          alert("Error: Could not find organization. Please contact support.");
          setUploading(false);
          return;
        }

        const { data: newSubmission, error: createError } = await supabase
          .from("submissions")
          .insert({
            org_id: orgMember.organization_id,
            created_by: user.id,
            title: deal?.name ? `${deal.name}` : "New Deal",
            deal_id: dealId,
            status: "draft",
          })
          .select()
          .single();

        if (createError) {
          console.error("Error creating submission:", {
            message: createError.message,
            details: createError.details,
            hint: createError.hint,
            code: createError.code,
          });
          alert("Error creating submission. Please try again.");
          setUploading(false);
          return;
        }

        submissionId = newSubmission.id;
        setActiveSubmissionId(submissionId);
      }
    }

    if (!submissionId) {
      alert("Error: Could not create or find submission. Please try again.");
      setUploading(false);
      return;
    }

    try {
      const timestamp = Date.now();
      const storagePath = `${submissionId}/${timestamp}_${selectedFile.name}`;
      const bucketName = "deal-packs";

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, selectedFile, {
          upsert: false,
          contentType: selectedFile.type,
        });

      if (uploadError) {
        console.error("Error uploading file:", uploadError);
        alert("Error uploading file. Please try again.");
        setUploading(false);
        return;
      }

      // Validate category is one of the allowed values
      const validCategories = ["financials", "forecasts", "business_plan", "broker_app", "security", "other"];
      const safeCategory = validCategories.includes(category) ? category : "other";

      const insertData = {
        submission_id: submissionId,
        storage_path: storagePath,
        original_filename: selectedFile.name,
        display_name: displayName.trim() || selectedFile.name,
        category: safeCategory,
        mime_type: selectedFile.type,
        size_bytes: selectedFile.size
      };

      const { error: insertError } = await supabase
        .from("submission_files")
        .insert(insertData);

      if (insertError) {
        console.error("Error inserting file record:", {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code,
        });
        alert(`Error saving file record: ${insertError.message || "Please try again."}`);
        setUploading(false);
        return;
      }

      // Refresh files list
      const { data: refreshedFiles } = await supabase
        .from("submission_files")
        .select("*")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: false });

      if (refreshedFiles) {
        setFiles(refreshedFiles);
      }

      // Reset modal
      setShowUploadModal(false);
      setSelectedFile(null);
      setDisplayName("");
      setCategory("financials");
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      console.error("Error:", err);
      setUploading(false);
    }
  }

  async function handleDeleteFile(fileId: string) {
    const file = files.find(f => f.id === fileId);
    if (!file || !activeSubmissionId) return;

    setDeleteError(null);
    const supabase = supabaseBrowser();

    try {
      // Delete from storage
      const bucketName = "deal-packs";
      const { error: storageError } = await supabase.storage
        .from(bucketName)
        .remove([file.storage_path]);

      if (storageError) {
        console.error("Error deleting file from storage:", storageError);
        setDeleteError("Failed to delete file from storage.");
        return;
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from("submission_files")
        .delete()
        .eq("id", fileId);

      if (dbError) {
        console.error("Error deleting file record:", dbError);
        setDeleteError("Failed to delete file record.");
        return;
      }

      // Refresh files list
      const { data: refreshedFiles } = await supabase
        .from("submission_files")
        .select("*")
        .eq("submission_id", activeSubmissionId)
        .order("created_at", { ascending: false });

      if (refreshedFiles) {
        setFiles(refreshedFiles);
      }
    } catch (err) {
      console.error("Error:", err);
      setDeleteError("An unexpected error occurred.");
    }
  }

  async function getDownloadUrl(storagePath: string): Promise<string | null> {
    const supabase = supabaseBrowser();
    const bucketName = "deal-packs";

    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(storagePath, 60);

    if (error) {
      console.error("Error creating signed URL:", error);
      return null;
    }

    return data?.signedUrl || null;
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 1200, margin: "40px auto", padding: 16 }}>
        <p>Loading deal...</p>
      </main>
    );
  }

  if (error) {
    if (error === "not_found") {
      return (
        <main style={{ maxWidth: 1200, margin: "40px auto", padding: 16 }}>
          <div
            style={{
              border: "1px solid rgba(0,0,0,0.2)",
              borderRadius: 10,
              padding: 40,
              background: "white",
              textAlign: "center",
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              Deal not found
            </h2>
            <p style={{ color: "#6b7280", marginBottom: 24 }}>
              This deal may not exist or you may not have permission to view it.
            </p>
            <button
              onClick={() => router.push("/app")}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.2)",
                cursor: "pointer",
                fontWeight: 600,
                background: "white",
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      );
    }

    return (
      <main style={{ maxWidth: 1200, margin: "40px auto", padding: 16 }}>
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.2)",
            borderRadius: 10,
            padding: 40,
            background: "white",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
            Unable to load deal
          </h2>
          <p style={{ color: "#6b7280", marginBottom: 24 }}>
            Please try again later.
          </p>
          <button
            onClick={() => router.push("/app")}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: "pointer",
              fontWeight: 600,
              background: "white",
            }}
          >
            Back to Dashboard
          </button>
        </div>
      </main>
    );
  }

  const hasFiles = files.length > 0;

  return (
    <main style={{ maxWidth: 1200, margin: "40px auto", padding: 16 }}>
      {/* Header with Run DealSense button */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <button
            onClick={() => router.push("/app")}
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
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 0 }}>Deal Details</h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <button
            onClick={() => {
              if (!hasFiles) {
                alert("Please upload files before running DealSense checks.");
              } else {
                alert("DealSense checks coming soon.");
              }
            }}
            disabled={!hasFiles}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.2)",
              background: hasFiles ? "#10b981" : "#e5e7eb",
              color: hasFiles ? "white" : "#9ca3af",
              cursor: hasFiles ? "pointer" : "not-allowed",
              opacity: hasFiles ? 1 : 0.6,
            }}
          >
            Run DealSense
          </button>
          {!hasFiles && (
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8, marginBottom: 0 }}>
              Upload at least one file to run DealSense
            </p>
          )}
        </div>
      </div>

      {/* Deal Details Section */}
      {deal && (
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.2)",
            borderRadius: 10,
            padding: 20,
            background: "white",
            marginBottom: 24,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Deal Details</h2>
          
          {saveMessage && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 8,
                background: saveMessage.type === "success" ? "rgba(0,128,0,0.08)" : "rgba(220,20,60,0.08)",
                color: saveMessage.type === "success" ? "green" : "crimson",
                border: saveMessage.type === "success"
                  ? "1px solid rgba(0,128,0,0.2)"
                  : "1px solid rgba(220,20,60,0.2)",
              }}
            >
              {saveMessage.text}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: "#374151",
                }}
              >
                Deal Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter deal name"
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
              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: "#374151",
                }}
              >
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
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
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
                <option value="submitted">Submitted</option>
              </select>
            </div>
          </div>

          {/* Customers Section */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Customers</h3>
            {partiesLoading ? (
              <p style={{ fontSize: 14, opacity: 0.6 }}>Loading...</p>
            ) : (
              <>
                {dealParties.filter(p => p.type === "person").length === 0 ? (
                  <p style={{ fontSize: 14, opacity: 0.6, marginBottom: 12 }}>No customers added yet.</p>
                ) : (
                  <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    {dealParties.filter(p => p.type === "person").map((party) => (
                      <div key={party.id} style={{ fontSize: 14, padding: "8px 12px", background: "#f9fafb", borderRadius: 6 }}>
                        <span style={{ fontWeight: 600 }}>{party.name}</span>
                        {party.role && (
                          <span style={{ opacity: 0.7, marginLeft: 8 }}>({party.role})</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      placeholder="Customer name"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: 14,
                        border: "1px solid rgba(0,0,0,0.2)",
                        borderRadius: 8,
                        outline: "none",
                      }}
                    />
                  </div>
                  <div style={{ width: 150 }}>
                    <select
                      value={newCustomerRole}
                      onChange={(e) => setNewCustomerRole(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: 14,
                        border: "1px solid rgba(0,0,0,0.2)",
                        borderRadius: 8,
                        outline: "none",
                        background: "white",
                      }}
                    >
                      <option value="borrower">Borrower</option>
                      <option value="guarantor">Guarantor</option>
                      <option value="director">Director</option>
                      <option value="shareholder">Shareholder</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <button
                    onClick={async () => {
                      if (!newCustomerName.trim() || addingParty) return;
                      setAddingParty(true);
                      const supabase = supabaseBrowser();
                      const { data, error } = await supabase
                        .from("deal_parties")
                        .insert({
                          deal_id: dealId,
                          type: "person",
                          name: newCustomerName.trim(),
                          role: newCustomerRole,
                        })
                        .select()
                        .single();
                      if (error) {
                        console.error("Error adding customer:", error);
                        alert("Error adding customer. Please try again.");
                      } else {
                        setDealParties([...dealParties, data]);
                        setNewCustomerName("");
                        setNewCustomerRole("borrower");
                      }
                      setAddingParty(false);
                    }}
                    disabled={!newCustomerName.trim() || addingParty}
                    style={{
                      padding: "8px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: "1px solid rgba(0,0,0,0.2)",
                      background: "#10b981",
                      color: "white",
                      cursor: !newCustomerName.trim() || addingParty ? "not-allowed" : "pointer",
                      opacity: !newCustomerName.trim() || addingParty ? 0.6 : 1,
                    }}
                  >
                    Add
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Entities Section */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Entities</h3>
            {partiesLoading ? (
              <p style={{ fontSize: 14, opacity: 0.6 }}>Loading...</p>
            ) : (
              <>
                {dealParties.filter(p => p.type === "entity").length === 0 ? (
                  <p style={{ fontSize: 14, opacity: 0.6, marginBottom: 12 }}>No entities added yet.</p>
                ) : (
                  <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    {dealParties.filter(p => p.type === "entity").map((party) => (
                      <div key={party.id} style={{ fontSize: 14, padding: "8px 12px", background: "#f9fafb", borderRadius: 6 }}>
                        <span style={{ fontWeight: 600 }}>{party.name}</span>
                        {party.role && (
                          <span style={{ opacity: 0.7, marginLeft: 8 }}>({party.role})</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      value={newEntityName}
                      onChange={(e) => setNewEntityName(e.target.value)}
                      placeholder="Entity name"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: 14,
                        border: "1px solid rgba(0,0,0,0.2)",
                        borderRadius: 8,
                        outline: "none",
                      }}
                    />
                  </div>
                  <div style={{ width: 150 }}>
                    <select
                      value={newEntityRole}
                      onChange={(e) => setNewEntityRole(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: 14,
                        border: "1px solid rgba(0,0,0,0.2)",
                        borderRadius: 8,
                        outline: "none",
                        background: "white",
                      }}
                    >
                      <option value="borrower">Borrower</option>
                      <option value="guarantor">Guarantor</option>
                      <option value="director">Director</option>
                      <option value="shareholder">Shareholder</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <button
                    onClick={async () => {
                      if (!newEntityName.trim() || addingParty) return;
                      setAddingParty(true);
                      const supabase = supabaseBrowser();
                      const { data, error } = await supabase
                        .from("deal_parties")
                        .insert({
                          deal_id: dealId,
                          type: "entity",
                          name: newEntityName.trim(),
                          role: newEntityRole,
                        })
                        .select()
                        .single();
                      if (error) {
                        console.error("Error adding entity:", error);
                        alert("Error adding entity. Please try again.");
                      } else {
                        setDealParties([...dealParties, data]);
                        setNewEntityName("");
                        setNewEntityRole("borrower");
                      }
                      setAddingParty(false);
                    }}
                    disabled={!newEntityName.trim() || addingParty}
                    style={{
                      padding: "8px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: "1px solid rgba(0,0,0,0.2)",
                      background: "#10b981",
                      color: "white",
                      cursor: !newEntityName.trim() || addingParty ? "not-allowed" : "pointer",
                      opacity: !newEntityName.trim() || addingParty ? 0.6 : 1,
                    }}
                  >
                    Add
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 8,
                color: "#374151",
              }}
            >
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this deal"
              rows={4}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                border: "1px solid rgba(0,0,0,0.2)",
                borderRadius: 8,
                outline: "none",
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
          </div>

          <div>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.2)",
                background: "#10b981",
                color: "white",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Upload Pack Section */}
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.2)",
          borderRadius: 10,
          padding: 20,
          background: "white",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 0 }}>Upload Pack</h2>
          <button
            onClick={handleFileSelectButton}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: "pointer",
              fontWeight: 600,
              background: "white",
            }}
          >
            Upload File
          </button>
        </div>

        {filesError && (
          <p style={{ fontSize: 14, color: "crimson", marginBottom: 16 }}>
            Error: {filesError}
          </p>
        )}

        {deleteError && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 8,
              background: "rgba(220,20,60,0.08)",
              color: "crimson",
              border: "1px solid rgba(220,20,60,0.2)",
            }}
          >
            {deleteError}
          </div>
        )}

        {filesLoading ? (
          <p style={{ fontSize: 14, opacity: 0.6 }}>Loading files...</p>
        ) : files.length === 0 ? (
          <p style={{ fontSize: 14, opacity: 0.6 }}>No files uploaded yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Category: Financials */}
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#374151" }}>Financials</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {files.filter(f => f.category === "financials").map((file) => (
                  <FileItem key={file.id} file={file} getDownloadUrl={getDownloadUrl} onDelete={handleDeleteFile} />
                ))}
                {files.filter(f => f.category === "financials").length === 0 && (
                  <p style={{ fontSize: 13, opacity: 0.5, fontStyle: "italic" }}>No files in this category</p>
                )}
              </div>
            </div>

            {/* Category: Forecasts */}
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#374151" }}>Forecasts</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {files.filter(f => f.category === "forecasts").map((file) => (
                  <FileItem key={file.id} file={file} getDownloadUrl={getDownloadUrl} onDelete={handleDeleteFile} />
                ))}
                {files.filter(f => f.category === "forecasts").length === 0 && (
                  <p style={{ fontSize: 13, opacity: 0.5, fontStyle: "italic" }}>No files in this category</p>
                )}
              </div>
            </div>

            {/* Category: Business Plan */}
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#374151" }}>Business Plan</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {files.filter(f => f.category === "business_plan").map((file) => (
                  <FileItem key={file.id} file={file} getDownloadUrl={getDownloadUrl} onDelete={handleDeleteFile} />
                ))}
                {files.filter(f => f.category === "business_plan").length === 0 && (
                  <p style={{ fontSize: 13, opacity: 0.5, fontStyle: "italic" }}>No files in this category</p>
                )}
              </div>
            </div>

            {/* Category: Broker Application/SoP */}
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#374151" }}>Broker Application/SoP</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {files.filter(f => f.category === "broker_app").map((file) => (
                  <FileItem key={file.id} file={file} getDownloadUrl={getDownloadUrl} onDelete={handleDeleteFile} />
                ))}
                {files.filter(f => f.category === "broker_app").length === 0 && (
                  <p style={{ fontSize: 13, opacity: 0.5, fontStyle: "italic" }}>No files in this category</p>
                )}
              </div>
            </div>

            {/* Category: Security */}
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#374151" }}>Security</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {files.filter(f => f.category === "security").map((file) => (
                  <FileItem key={file.id} file={file} getDownloadUrl={getDownloadUrl} onDelete={handleDeleteFile} />
                ))}
                {files.filter(f => f.category === "security").length === 0 && (
                  <p style={{ fontSize: 13, opacity: 0.5, fontStyle: "italic" }}>No files in this category</p>
                )}
              </div>
            </div>

            {/* Category: Other */}
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#374151" }}>Other</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {files.filter(f => f.category === "other").map((file) => (
                  <FileItem key={file.id} file={file} getDownloadUrl={getDownloadUrl} onDelete={handleDeleteFile} />
                ))}
                {files.filter(f => f.category === "other").length === 0 && (
                  <p style={{ fontSize: 13, opacity: 0.5, fontStyle: "italic" }}>No files in this category</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => {
            if (!uploading) {
              setShowUploadModal(false);
              setSelectedFile(null);
              setDisplayName("");
              setCategory("other");
            }
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 10,
              padding: 24,
              maxWidth: 500,
              width: "90%",
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Upload File</h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 8,
                    color: "#374151",
                  }}
                >
                  File (required)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelectInModal}
                  disabled={uploading}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    padding: "10px 16px",
                    fontSize: 14,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.2)",
                    background: "white",
                    cursor: uploading ? "not-allowed" : "pointer",
                    opacity: uploading ? 0.6 : 1,
                  }}
                >
                  Choose file
                </button>
                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8, marginBottom: 0 }}>
                  {selectedFile ? `Selected: ${selectedFile.name}` : "No file selected"}
                </p>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 8,
                    color: "#374151",
                  }}
                >
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
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
                <label
                  style={{
                    display: "block",
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 8,
                    color: "#374151",
                  }}
                >
                  Category (required)
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
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
                  <option value="forecasts">Forecasts</option>
                  <option value="business_plan">Business Plan</option>
                  <option value="broker_app">Broker Application/SoP</option>
                  <option value="security">Security</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFile(null);
                    setDisplayName("");
                    setCategory("other");
                  }}
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
                  onClick={handleFileUpload}
                  disabled={uploading || !selectedFile || !category}
                  style={{
                    padding: "10px 20px",
                    fontSize: 14,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.2)",
                    background: uploading || !selectedFile || !category ? "#e5e7eb" : "#10b981",
                    color: uploading || !selectedFile || !category ? "#9ca3af" : "white",
                    cursor: uploading || !selectedFile || !category ? "not-allowed" : "pointer",
                    opacity: uploading || !selectedFile || !category ? 0.6 : 1,
                  }}
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DealSense Results Section */}
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.2)",
          borderRadius: 10,
          padding: 20,
          background: "white",
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>DealSense Results</h2>
        
        <p style={{ fontSize: 14, opacity: 0.6, marginBottom: 20 }}>
          Run DealSense to see checks
        </p>

        {/* Status Pills */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              background: "#fee2e2",
              color: "#991b1b",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Critical: 0
          </div>
          <div
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              background: "#fef3c7",
              color: "#92400e",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Warnings: 0
          </div>
          <div
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              background: "#d1fae5",
              color: "#065f46",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Passed: 0
          </div>
        </div>

        {/* Issues List */}
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Issues</h3>
          <div
            style={{
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 8,
              padding: 20,
              background: "#f9fafb",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 13, opacity: 0.6 }}>
              No issues found. Run DealSense checks to analyze your deal.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
