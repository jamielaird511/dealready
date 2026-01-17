"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DeleteFileDialog } from "@/components/DeleteFileDialog";

function FileItem({ file, getDownloadUrl, onDelete }: { file: any; getDownloadUrl: (path: string) => Promise<string | null>; onDelete: (fileId: string) => Promise<void> }) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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

  async function confirmDelete() {
    try {
      setDeleting(true);
      await onDelete(file.id);
      setDeleteOpen(false);
    } catch (err) {
      console.error("Error deleting file:", err);
      alert("Delete failed: " + ((err as any)?.message ?? "Unknown error"));
    } finally {
      setDeleting(false);
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
          type="button"
          onClick={() => setDeleteOpen(true)}
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
          title={`Delete ${file.display_name || file.original_filename}`}
          aria-label={`Delete ${file.display_name || file.original_filename}`}
        >
          🗑️
        </button>
      </div>
      <DeleteFileDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        fileName={file.display_name || file.original_filename}
        onConfirm={confirmDelete}
        isDeleting={deleting}
      />
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
  const [newCustomerRoles, setNewCustomerRoles] = useState<string[]>(["borrower"]);
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityRoles, setNewEntityRoles] = useState<string[]>(["borrower"]);
  const [addingParty, setAddingParty] = useState(false);
  
  // Canonical role values
  const availableRoles = [
    { value: "borrower", label: "Borrower" },
    { value: "guarantor", label: "Guarantor" },
    { value: "director", label: "Director" },
    { value: "shareholder", label: "Shareholder" },
    { value: "trustee", label: "Trustee" },
    { value: "beneficialOwner", label: "Beneficial Owner" },
    { value: "contact", label: "Contact" },
  ];
  
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
  const [showDetails, setShowDetails] = useState(false);
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

      // Query with join to entities, fallback to legacy columns if entity is missing
      const { data, error } = await supabase
        .from("deal_parties")
        .select(`
          id,
          deal_id,
          roles,
          notes,
          entity_id,
          entities:entity_id (
            id,
            entity_type,
            display_name,
            email,
            phone
          ),
          type,
          name,
          role
        `)
        .eq("deal_id", dealId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error loading deal parties:", error);
        setPartiesLoading(false);
        return;
      }

      // Transform data to normalize structure with legacy fallback
      // TODO: Remove legacy fallback once all rows are migrated
      const normalized = (data || []).map((party: any) => {
        // Supabase returns entities as an array when using join syntax, get first element
        const entity = Array.isArray(party.entities) ? party.entities[0] : party.entities;
        return {
          id: party.id,
          deal_id: party.deal_id,
          roles: party.roles || (party.role ? [party.role] : []),
          notes: party.notes,
          entityId: entity?.id || null,
          entity_type: entity?.entity_type || party.type,
          display_name: entity?.display_name || party.name,
          email: entity?.email || null,
          phone: entity?.phone || null,
          // Legacy fields for backward compatibility during transition
          type: entity?.entity_type || party.type,
          name: entity?.display_name || party.name,
          role: party.roles?.[0] || party.role || null,
        };
      });

      setDealParties(normalized);
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

  // Delete deal party (unlink from deal, but keep entity)
  async function handleDeleteParty(partyId: string) {
    const supabase = supabaseBrowser();
    
    // Delete the deal_parties row (this unlinks the party from the deal but keeps the entity)
    const { error } = await supabase
      .from("deal_parties")
      .delete()
      .eq("id", partyId);
    
    if (error) {
      console.error("Error deleting party:", error);
      alert("Error deleting party. Please try again.");
      return;
    }
    
    // Update UI by removing the deleted party
    setDealParties(dealParties.filter(p => p.id !== partyId));
  }

  // Helper function to upsert entity and get entity_id
  async function upsertEntity(
    organizationId: string,
    entityType: "person" | "company" | "trust" | "other",
    displayName: string
  ): Promise<string | null> {
    const supabase = supabaseBrowser();
    
    // Try to find existing entity
    const { data: existing } = await supabase
      .from("entities")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("entity_type", entityType)
      .ilike("display_name", displayName)
      .maybeSingle();
    
    if (existing?.id) {
      return existing.id;
    }
    
    // Create new entity
    const { data: newEntity, error } = await supabase
      .from("entities")
      .insert({
        organization_id: organizationId,
        entity_type: entityType,
        display_name: displayName,
        legal_name: displayName,
      })
      .select("id")
      .single();
    
    if (error || !newEntity) {
      console.error("Error creating entity:", error);
      return null;
    }
    
    return newEntity.id;
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

  async function handleDeleteFile(fileId: string): Promise<void> {
    const file = files.find(f => f.id === fileId);
    if (!file || !activeSubmissionId) {
      throw new Error("File or submission not found");
    }

    setDeleteError(null);
    const supabase = supabaseBrowser();

    // Optimistically remove from UI
    setFiles(prev => prev.filter(f => f.id !== fileId));

    // Delete from database first
    const { data: deletedRow, error: dbError } = await supabase
      .from("submission_files")
      .delete()
      .eq("id", fileId)
      .select("id")
      .maybeSingle();

    if (dbError) {
      console.error("Error deleting file record:", {
        message: dbError.message,
        details: dbError.details,
        hint: dbError.hint,
        code: dbError.code,
      });
      // Rollback: refetch files list
      const { data: refreshedFiles } = await supabase
        .from("submission_files")
        .select("*")
        .eq("submission_id", activeSubmissionId)
        .order("created_at", { ascending: false });

      if (refreshedFiles) {
        setFiles(refreshedFiles);
      }
      setDeleteError("Failed to delete file record.");
      throw new Error(dbError.message || "Failed to delete file record");
    }

    if (!deletedRow) {
      // Rollback: refetch files list
      const { data: refreshedFiles } = await supabase
        .from("submission_files")
        .select("*")
        .eq("submission_id", activeSubmissionId)
        .order("created_at", { ascending: false });

      if (refreshedFiles) {
        setFiles(refreshedFiles);
      }
      setDeleteError("Delete blocked (no rows deleted). Likely RLS policy.");
      throw new Error("Delete blocked (no rows deleted). Likely RLS policy.");
    }

    // Delete from storage (non-critical - if it fails, show warning but don't rollback)
    const bucketName = "deal-packs";
    const { error: storageError } = await supabase.storage
      .from(bucketName)
      .remove([file.storage_path]);

    if (storageError) {
      console.error("Error deleting file from storage:", {
        message: storageError.message,
        details: (storageError as any).details,
        hint: (storageError as any).hint,
        code: (storageError as any).code,
      });
      setDeleteError(`Warning: File record deleted but storage cleanup failed: ${storageError.message || "Unknown error"}`);
      // Don't throw - UI already shows file as deleted
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

  // Helper function to get party roles with legacy fallback
  function getPartyRoles(party: any): string[] {
    return party.roles ?? (party.role ? [party.role] : []);
  }

  // Compute borrower/guarantor readiness from deal parties
  const hasBorrower = dealParties.some(p => getPartyRoles(p).includes("borrower"));
  const hasGuarantor = dealParties.some(p => getPartyRoles(p).includes("guarantor"));

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
              if (!hasBorrower) {
                alert("Add at least one borrower (person or entity) to run DealSense.");
                return;
              }
              if (!hasFiles) {
                alert("Please upload files before running DealSense checks.");
              } else {
                alert("DealSense checks coming soon.");
              }
            }}
            disabled={!hasFiles || !hasBorrower}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.2)",
              background: hasFiles && hasBorrower ? "#10b981" : "#e5e7eb",
              color: hasFiles && hasBorrower ? "white" : "#9ca3af",
              cursor: hasFiles && hasBorrower ? "pointer" : "not-allowed",
              opacity: hasFiles && hasBorrower ? 1 : 0.6,
            }}
          >
            {!hasBorrower ? "Add a borrower to run DealSense" : "Run DealSense"}
          </button>
          {!hasBorrower && (
            <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8, marginBottom: 0 }}>
              Add at least one borrower (person or entity) to run DealSense.
            </p>
          )}
          {hasBorrower && !hasGuarantor && (
            <p style={{ fontSize: 12, color: "#d97706", marginTop: 8, marginBottom: 0 }}>
              No guarantors added. DealSense may miss guarantee-related requirements.
            </p>
          )}
          {hasBorrower && !hasFiles && (
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: hasGuarantor ? 4 : 8, marginBottom: 0 }}>
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

          {/* Customers Section */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Customers</h3>
            
            {/* Customers List Card */}
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.2)",
                borderRadius: 10,
                padding: 20,
                background: "white",
                marginBottom: 16,
              }}
            >
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#374151" }}>Added Customers</h4>
              {partiesLoading ? (
                <p style={{ fontSize: 14, opacity: 0.6 }}>Loading...</p>
              ) : dealParties.filter(p => p.type === "person").length === 0 ? (
                <p style={{ fontSize: 14, opacity: 0.6 }}>No customers added yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {dealParties.filter(p => p.type === "person").map((party) => (
                    <div key={party.id} style={{ fontSize: 14, padding: "8px 12px", background: "#f9fafb", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600 }}>{party.display_name || party.name}</span>
                        {party.roles && party.roles.length > 0 && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {party.roles.map((r: string) => {
                              const roleLabel = availableRoles.find(ar => ar.value === r)?.label || r;
                              return (
                                <span
                                  key={r}
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 500,
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    background: "#e5e7eb",
                                    color: "#374151",
                                  }}
                                >
                                  {roleLabel}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteParty(party.id)}
                        style={{
                          padding: "4px 8px",
                          fontSize: 12,
                          fontWeight: 600,
                          borderRadius: 6,
                          border: "1px solid #dc2626",
                          background: "#fee2e2",
                          color: "#991b1b",
                          cursor: "pointer",
                        }}
                        title={`Remove ${party.display_name || party.name} from deal`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Customer Form Card */}
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.2)",
                borderRadius: 10,
                padding: 20,
                background: "white",
              }}
            >
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "#374151" }}>Add Customer</h4>
              <div>
                <div style={{ marginBottom: 12 }}>
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
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#374151" }}>Roles</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {availableRoles.map((role) => (
                      <label
                        key={role.value}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={newCustomerRoles.includes(role.value)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewCustomerRoles([...newCustomerRoles, role.value]);
                            } else {
                              setNewCustomerRoles(newCustomerRoles.filter(r => r !== role.value));
                            }
                          }}
                          style={{ cursor: "pointer" }}
                        />
                        <span>{role.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={async () => {
                      if (!newCustomerName.trim() || addingParty || newCustomerRoles.length === 0) return;
                      setAddingParty(true);
                      const supabase = supabaseBrowser();
                      
                      try {
                        // Get organization_id
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) {
                          alert("Not authenticated. Please refresh and try again.");
                          setAddingParty(false);
                          return;
                        }
                        
                        const { data: orgMember } = await supabase
                          .from("organization_members")
                          .select("organization_id")
                          .eq("user_id", user.id)
                          .maybeSingle();
                        
                        if (!orgMember?.organization_id) {
                          alert("Error: Could not find organization. Please contact support.");
                          setAddingParty(false);
                          return;
                        }
                        
                        // Upsert entity
                        const entityId = await upsertEntity(orgMember.organization_id, "person", newCustomerName.trim());
                        if (!entityId) {
                          alert("Error creating entity. Please try again.");
                          setAddingParty(false);
                          return;
                        }
                        
                        // Insert deal_parties with entity_id and roles
                        const { data, error } = await supabase
                          .from("deal_parties")
                          .insert({
                            deal_id: dealId,
                            entity_id: entityId,
                            roles: newCustomerRoles,
                            // Legacy columns for backward compatibility
                            type: "person",
                            name: newCustomerName.trim(),
                            role: newCustomerRoles[0] || null,
                          })
                          .select(`
                            id,
                            deal_id,
                            roles,
                            notes,
                            entity_id,
                            entities:entity_id (
                              id,
                              entity_type,
                              display_name,
                              email,
                              phone
                            ),
                            type,
                            name,
                            role
                          `)
                          .single();
                        
                        if (error) {
                          console.error("Error adding customer:", error);
                          alert("Error adding customer. Please try again.");
                        } else {
                          // Normalize the response
                          const entity = Array.isArray(data.entities) ? data.entities[0] : data.entities;
                          const normalized = {
                            id: data.id,
                            deal_id: data.deal_id,
                            roles: data.roles || [],
                            notes: data.notes,
                            entityId: entity?.id || null,
                            entity_type: entity?.entity_type || data.type,
                            display_name: entity?.display_name || data.name,
                            email: entity?.email || null,
                            phone: entity?.phone || null,
                            type: entity?.entity_type || data.type,
                            name: entity?.display_name || data.name,
                            role: data.roles?.[0] || data.role || null,
                          };
                          setDealParties([...dealParties, normalized]);
                          setNewCustomerName("");
                          setNewCustomerRoles([]);
                        }
                      } catch (err) {
                        console.error("Error:", err);
                        alert("An unexpected error occurred.");
                      }
                      setAddingParty(false);
                    }}
                    disabled={!newCustomerName.trim() || addingParty || newCustomerRoles.length === 0}
                    style={{
                      padding: "8px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: "1px solid rgba(0,0,0,0.2)",
                      background: "#10b981",
                      color: "white",
                      cursor: !newCustomerName.trim() || addingParty || newCustomerRoles.length === 0 ? "not-allowed" : "pointer",
                      opacity: !newCustomerName.trim() || addingParty || newCustomerRoles.length === 0 ? 0.6 : 1,
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Entities Section */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Entities</h3>
            
            {/* Entities List Card */}
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.2)",
                borderRadius: 10,
                padding: 20,
                background: "white",
                marginBottom: 16,
              }}
            >
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#374151" }}>Added Entities</h4>
              {partiesLoading ? (
                <p style={{ fontSize: 14, opacity: 0.6 }}>Loading...</p>
              ) : dealParties.filter(p => p.type === "entity" || p.entity_type === "company" || p.entity_type === "trust" || p.entity_type === "other").length === 0 ? (
                <p style={{ fontSize: 14, opacity: 0.6 }}>No entities added yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {dealParties.filter(p => p.type === "entity" || p.entity_type === "company" || p.entity_type === "trust" || p.entity_type === "other").map((party) => (
                    <div key={party.id} style={{ fontSize: 14, padding: "8px 12px", background: "#f9fafb", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600 }}>{party.display_name || party.name}</span>
                        {party.roles && party.roles.length > 0 && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {party.roles.map((r: string) => {
                              const roleLabel = availableRoles.find(ar => ar.value === r)?.label || r;
                              return (
                                <span
                                  key={r}
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 500,
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    background: "#e5e7eb",
                                    color: "#374151",
                                  }}
                                >
                                  {roleLabel}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteParty(party.id)}
                        style={{
                          padding: "4px 8px",
                          fontSize: 12,
                          fontWeight: 600,
                          borderRadius: 6,
                          border: "1px solid #dc2626",
                          background: "#fee2e2",
                          color: "#991b1b",
                          cursor: "pointer",
                        }}
                        title={`Remove ${party.display_name || party.name} from deal`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Entity Form Card */}
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.2)",
                borderRadius: 10,
                padding: 20,
                background: "white",
              }}
            >
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "#374151" }}>Add Entity</h4>
              <div>
                <div style={{ marginBottom: 12 }}>
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
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#374151" }}>Roles</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {availableRoles.map((role) => (
                      <label
                        key={role.value}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={newEntityRoles.includes(role.value)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewEntityRoles([...newEntityRoles, role.value]);
                            } else {
                              setNewEntityRoles(newEntityRoles.filter(r => r !== role.value));
                            }
                          }}
                          style={{ cursor: "pointer" }}
                        />
                        <span>{role.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={async () => {
                      if (!newEntityName.trim() || addingParty || newEntityRoles.length === 0) return;
                      setAddingParty(true);
                      const supabase = supabaseBrowser();
                      
                      try {
                        // Get organization_id
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) {
                          alert("Not authenticated. Please refresh and try again.");
                          setAddingParty(false);
                          return;
                        }
                        
                        const { data: orgMember } = await supabase
                          .from("organization_members")
                          .select("organization_id")
                          .eq("user_id", user.id)
                          .maybeSingle();
                        
                        if (!orgMember?.organization_id) {
                          alert("Error: Could not find organization. Please contact support.");
                          setAddingParty(false);
                          return;
                        }
                        
                        // Upsert entity (use 'company' as default entity_type for entities section)
                        const entityId = await upsertEntity(orgMember.organization_id, "company", newEntityName.trim());
                        if (!entityId) {
                          alert("Error creating entity. Please try again.");
                          setAddingParty(false);
                          return;
                        }
                        
                        // Insert deal_parties with entity_id and roles
                        const { data, error } = await supabase
                          .from("deal_parties")
                          .insert({
                            deal_id: dealId,
                            entity_id: entityId,
                            roles: newEntityRoles,
                            // Legacy columns for backward compatibility
                            type: "entity",
                            name: newEntityName.trim(),
                            role: newEntityRoles[0] || null,
                          })
                          .select(`
                            id,
                            deal_id,
                            roles,
                            notes,
                            entity_id,
                            entities:entity_id (
                              id,
                              entity_type,
                              display_name,
                              email,
                              phone
                            ),
                            type,
                            name,
                            role
                          `)
                          .single();
                        
                        if (error) {
                          console.error("Error adding entity:", error);
                          alert("Error adding entity. Please try again.");
                        } else {
                          // Normalize the response
                          const entity = Array.isArray(data.entities) ? data.entities[0] : data.entities;
                          const normalized = {
                            id: data.id,
                            deal_id: data.deal_id,
                            roles: data.roles || [],
                            notes: data.notes,
                            entityId: entity?.id || null,
                            entity_type: entity?.entity_type || data.type,
                            display_name: entity?.display_name || data.name,
                            email: entity?.email || null,
                            phone: entity?.phone || null,
                            type: entity?.entity_type || data.type,
                            name: entity?.display_name || data.name,
                            role: data.roles?.[0] || data.role || null,
                          };
                          setDealParties([...dealParties, normalized]);
                          setNewEntityName("");
                          setNewEntityRoles([]);
                        }
                      } catch (err) {
                        console.error("Error:", err);
                        alert("An unexpected error occurred.");
                      }
                      setAddingParty(false);
                    }}
                    disabled={!newEntityName.trim() || addingParty || newEntityRoles.length === 0}
                    style={{
                      padding: "8px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: "1px solid rgba(0,0,0,0.2)",
                      background: "#10b981",
                      color: "white",
                      cursor: !newEntityName.trim() || addingParty || newEntityRoles.length === 0 ? "not-allowed" : "pointer",
                      opacity: !newEntityName.trim() || addingParty || newEntityRoles.length === 0 ? 0.6 : 1,
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
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

        {/* Collapsible Details Section */}
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 600,
              color: "#6b7280",
              background: "transparent",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <span style={{ transform: showDetails ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "inline-block" }}>
              ▶
            </span>
            <span>Details</span>
          </button>
          {showDetails && (
            <div
              style={{
                fontSize: 12,
                background: "#f9fafb",
                border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: 8,
                padding: 12,
                marginTop: 8,
              }}
            >
              <div style={{ marginBottom: 4 }}>
                <strong>Deal ID:</strong> <span style={{ fontFamily: "monospace" }}>{dealId}</span>
              </div>
              <div>
                <strong>Submission ID:</strong> <span style={{ fontFamily: "monospace" }}>{activeSubmissionId ?? "—"}</span>
              </div>
            </div>
          )}
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
