"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DeleteFileDialog } from "@/components/DeleteFileDialog";
import { DOC_TYPES, PURPOSE_DOC_MATRIX } from "@/lib/dealWizard/docMatrix";
import type { DocTypeId } from "@/lib/dealWizard/docMatrix";
import type { WizardPurposeKey } from "@/lib/dealWizard/types";

type SubmissionFileRow = {
  id?: string;
  storage_path?: string;
  display_name?: string;
  original_filename?: string;
  created_at?: string;
  category?: string;
  extraction_status?: string | null;
  extracted_at?: string | null;
  extraction_error?: string | null;
  extracted_text?: string | null;
  chunk_count?: number;
};
type DealRow = { id?: string; name?: string; status?: string; notes?: string; purpose_type?: string; purpose_notes?: string | null; wizard_state?: Record<string, unknown> | null };
type DealPartyRaw = { id: string; deal_id?: string; roles?: string[]; role?: string | null; notes?: string | null; entities?: unknown; type?: string | null; name?: string | null };
type DealPartyRow = { id: string; roles?: string[]; role?: string | null };
type DealPartyNormalized = { id: string; deal_id?: string; roles?: string[]; role?: string | null; notes?: string | null; entityId?: string | null; entity_type?: string | null; display_name?: string | null; email?: string | null; phone?: string | null; type?: string | null; name?: string | null };
type RunRow = { id?: string; created_at?: string; status?: string; score?: number; assessment_status?: string; assessed_at?: string; top_fixes?: string[] };
type FindingRow = { id?: string; severity?: string; status?: string; workflow_state?: string; title?: string; message?: string; fix?: string; score_impact?: number; resolved_at?: string; category?: string };
type SupabaseErrorLike = { message?: string; details?: unknown; hint?: string; code?: string };

type DocTier = "required" | "recommended" | "supporting";
type ChecklistItem = { key: string; label: string; tier: DocTier; acceptedCategories: string[]; help?: string };

const CATEGORY_LABELS: Record<string, string> = {
  financials: "Financials",
  tax: "Tax",
  forecasts: "Forecasts",
  business_plan: "Business Plan",
  broker_app: "Broker application/SoP",
  security: "Security",
  other: "Other",
};

const PURPOSE_LABELS: Record<string, string> = {
  business_purchase: "Business purchase",
  startup: "Start-up / new business",
  refinance: "Refinance / restructure",
  equipment: "Equipment or asset purchase",
  working_capital: "Working capital",
  property_purchase: "Property purchase (owner-occupied)",
  shareholder_buyout: "Shareholder buyout",
  expansion: "Business expansion",
  other: "Other",
};

/** Legacy upload category -> wizard doc id for submission_files.category (only known legacy buckets) */
const LEGACY_CATEGORY_TO_WIZARD_DOC_ID: Record<string, DocTypeId> = {
  broker_app: "application_narrative",
  financials: "financials",
  forecasts: "forecasts",
  security: "valuation",
  id: "identification",
  identification: "identification",
};

const PURPOSE_CHECKLIST: Record<string, ChecklistItem[]> = {
  business_purchase: [
    { key: "bp_narrative", label: "Submission / Application narrative", tier: "required", acceptedCategories: ["broker_app"] },
    { key: "bp_target_financials", label: "Target financials (2–3 years)", tier: "required", acceptedCategories: ["financials"] },
    { key: "bp_ytd_accounts", label: "Latest YTD / management accounts", tier: "required", acceptedCategories: ["financials"] },
    { key: "bp_forecasts", label: "Forecasts + assumptions", tier: "required", acceptedCategories: ["forecasts", "business_plan"] },
    { key: "bp_business_plan", label: "Business plan / rationale", tier: "required", acceptedCategories: ["business_plan"] },
    { key: "bp_bank_statements", label: "Bank statements", tier: "recommended", acceptedCategories: ["financials"] },
    { key: "bp_tax", label: "Tax / IRD returns", tier: "recommended", acceptedCategories: ["tax"] },
    { key: "bp_security", label: "Security schedule / property details", tier: "recommended", acceptedCategories: ["security"] },
    { key: "bp_due_diligence", label: "Due diligence / supporting pack", tier: "supporting", acceptedCategories: ["other"] },
    { key: "bp_valuation", label: "Valuation", tier: "supporting", acceptedCategories: ["security", "other"] },
  ],
  refinance: [
    { key: "ref_narrative", label: "Submission narrative", tier: "required", acceptedCategories: ["broker_app"] },
    { key: "ref_lending", label: "Current lending position / facilities", tier: "required", acceptedCategories: ["broker_app", "other"] },
    { key: "ref_financials", label: "Financials", tier: "required", acceptedCategories: ["financials"] },
    { key: "ref_bank", label: "Bank statements", tier: "recommended", acceptedCategories: ["financials"] },
    { key: "ref_tax", label: "Tax returns", tier: "recommended", acceptedCategories: ["tax"] },
    { key: "ref_security", label: "Security documents", tier: "recommended", acceptedCategories: ["security"] },
  ],
  equipment: [
    { key: "eq_narrative", label: "Narrative", tier: "required", acceptedCategories: ["broker_app"] },
    { key: "eq_quote", label: "Quote / invoice", tier: "required", acceptedCategories: ["other"] },
    { key: "eq_repayment", label: "Repayment source evidence", tier: "required", acceptedCategories: ["financials", "forecasts"] },
    { key: "eq_asset", label: "Asset details / specs", tier: "recommended", acceptedCategories: ["other"] },
    { key: "eq_insurance", label: "Insurance / security", tier: "recommended", acceptedCategories: ["security"] },
  ],
  startup: [
    { key: "st_narrative", label: "Narrative", tier: "required", acceptedCategories: ["broker_app"] },
    { key: "st_business_plan", label: "Business plan", tier: "required", acceptedCategories: ["business_plan"] },
    { key: "st_forecasts", label: "Forecasts", tier: "required", acceptedCategories: ["forecasts"] },
    { key: "st_founders", label: "Founders background / CVs", tier: "recommended", acceptedCategories: ["other"] },
    { key: "st_equity", label: "Evidence of equity / funds", tier: "recommended", acceptedCategories: ["other", "financials"] },
  ],
  working_capital: [
    { key: "wc_narrative", label: "Narrative", tier: "required", acceptedCategories: ["broker_app"] },
    { key: "wc_financials", label: "Current financials", tier: "required", acceptedCategories: ["financials"] },
    { key: "wc_bank", label: "Bank statements", tier: "recommended", acceptedCategories: ["financials"] },
    { key: "wc_forecasts", label: "Forecasts", tier: "recommended", acceptedCategories: ["forecasts"] },
  ],
  other: [],
};

function hasAnyFileInCategories(files: SubmissionFileRow[], categories: string[]): boolean {
  const norm = (s: string) => s.toLowerCase().trim();
  const valid = categories.filter((c) => c != null && c !== "");
  if (valid.length === 0) return false;
  return valid.some((cat) => files.some((f) => norm(f.category ?? "") === norm(cat)));
}

function checklistStatusForItem(files: SubmissionFileRow[], item: ChecklistItem): "uploaded" | "missing" {
  return hasAnyFileInCategories(files, item.acceptedCategories) ? "uploaded" : "missing";
}

function tierStats(files: SubmissionFileRow[], items: ChecklistItem[], tier: DocTier): { uploaded: number; total: number } {
  const tierItems = items.filter((i) => i.tier === tier);
  const total = tierItems.length;
  const uploaded = tierItems.filter((i) => hasAnyFileInCategories(files, i.acceptedCategories)).length;
  return { uploaded, total };
}

function computeReadinessPct(counts: {
  requiredTotal: number;
  requiredUploaded: number;
  recommendedTotal: number;
  recommendedUploaded: number;
  supportingTotal: number;
  supportingUploaded: number;
}): number {
  const { requiredTotal, requiredUploaded, recommendedTotal, recommendedUploaded, supportingTotal, supportingUploaded } = counts;
  if (requiredTotal === 0 && recommendedTotal === 0 && supportingTotal === 0) return 0;
  const reqScore = requiredTotal === 0 ? 1 : requiredUploaded / requiredTotal;
  const recScore = recommendedTotal === 0 ? 1 : recommendedUploaded / recommendedTotal;
  const supScore = supportingTotal === 0 ? 1 : supportingUploaded / supportingTotal;
  const weighted = reqScore * 0.6 + recScore * 0.3 + supScore * 0.1;
  return Math.round(weighted * 100);
}

const UPLOAD_CATEGORY_PRIORITY = ["broker_app", "financials", "forecasts", "business_plan", "tax", "security", "other"] as const;

function normalizeAcceptedToUploadCategory(accepted: string[]): string {
  const valid = accepted.filter((a) => a != null && String(a).trim() !== "");
  for (const key of UPLOAD_CATEGORY_PRIORITY) {
    const matched = valid.some((a) => {
      const l = String(a).toLowerCase().trim();
      if (l === key) return true;
      if (l.includes(key.replace(/_/g, " "))) return true;
      const label = CATEGORY_LABELS[key];
      if (label && (l.includes(label.toLowerCase()) || label.toLowerCase().includes(l))) return true;
      return false;
    });
    if (matched) return key;
  }
  return "other";
}

function getErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  return typeof (e as { message?: unknown })?.message === "string" ? (e as { message: string }).message : fallback;
}

function FindingItem({ finding: f, onResolved, resolvedView, showAiBadge }: { finding: FindingRow; onResolved?: (findingId: string) => Promise<void>; resolvedView?: boolean; showAiBadge?: boolean }) {
  const [resolving, setResolving] = useState(false);
  async function handleResolve(e: React.MouseEvent) {
    e.stopPropagation();
    if (!f.id || resolving || !onResolved) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/findings/${f.id}/resolve`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        await onResolved(f.id);
      } else {
        alert(json?.error ?? "Failed to resolve finding");
      }
    } catch (err) {
      console.error("Resolve finding failed:", err);
      alert(err instanceof Error ? err.message : "Failed to resolve finding");
    } finally {
      setResolving(false);
    }
  }
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
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
          {f.severity ?? "info"}
        </span>
        {showAiBadge && (
          <span
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              background: "#e0e7ff",
              color: "#3730a3",
              letterSpacing: "0.3px",
            }}
          >
            AI
          </span>
        )}
        {resolvedView && (
          <span
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              background: "#d1fae5",
              color: "#065f46",
            }}
          >
            Resolved
          </span>
        )}
        {f.title && <span style={{ fontWeight: 600, color: "#374151" }}>{f.title}</span>}
        {!resolvedView && f.id && onResolved && (
          <button
            type="button"
            onClick={handleResolve}
            disabled={resolving}
            style={{
              marginLeft: "auto",
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 6,
              border: "1px solid #10b981",
              background: resolving ? "#d1fae5" : "#10b981",
              color: "white",
              cursor: resolving ? "not-allowed" : "pointer",
            }}
          >
            {resolving ? "Resolving…" : "Mark resolved"}
          </button>
        )}
      </div>
      {resolvedView && f.resolved_at && (
        <p style={{ margin: "0 0 6px 0", fontSize: 12, color: "#6b7280" }}>
          Resolved at: {new Date(f.resolved_at).toLocaleString()}
        </p>
      )}
      {f.message && <p style={{ margin: "0 0 6px 0", color: "#4b5563" }}>{f.message}</p>}
      {f.fix && (f.fix as string).trim() && (
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280", flex: 1 }}>
            <strong style={{ fontWeight: 600 }}>Next step:</strong> {(f.fix as string).trim()}
          </p>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText((f.fix as string).trim()).catch(() => {})}
            style={{
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 4,
              border: "1px solid #d1d5db",
              background: "#f9fafb",
              color: "#374151",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

function FileItem({ file, getDownloadUrl, onDelete, onRefresh }: { file: SubmissionFileRow; getDownloadUrl: (path: string) => Promise<string | null>; onDelete: (fileId: string) => Promise<void>; onRefresh: () => Promise<void> }) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const status = file.extraction_status ?? "queued";
  const canPreview = status === "succeeded" && typeof file.extracted_text === "string" && file.extracted_text.length > 0;
  const canRetry = status === "failed" || status === "queued";

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
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

  async function confirmDelete() {
    if (!file.id) return;
    try {
      setDeleting(true);
      await onDelete(file.id);
      setDeleteOpen(false);
    } catch (err: unknown) {
      console.error("Error deleting file:", err);
      alert("Delete failed: " + getErrorMessage(err, "Unknown error"));
    } finally {
      setDeleting(false);
    }
  }

  async function handleRetry(e: React.MouseEvent) {
    e.stopPropagation();
    if (!file.id || !canRetry || retrying) return;
    setRetrying(true);
    try {
      const extractRes = await fetch("/api/submission-files/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id }),
      });
      const extractJson = await extractRes.json().catch(() => ({}));
      if (!extractJson?.ok) {
        alert(extractJson?.error ?? "Extraction failed");
        return;
      }
      const chunkRes = await fetch("/api/submission-files/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionFileId: file.id, force: true }),
      });
      const chunkJson = await chunkRes.json().catch(() => ({}));
      if (!chunkJson?.ok && !chunkJson?.skipped) {
        console.warn("Chunking failed or skipped:", chunkJson?.error);
      }
      await onRefresh();
    } catch (err) {
      console.error("Retry extraction failed:", err);
      alert(getErrorMessage(err, "Retry failed"));
    } finally {
      setRetrying(false);
    }
  }

  const statusPillStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 6px",
    borderRadius: 4,
    textTransform: "capitalize",
    flexShrink: 0,
  };
  const statusStyles: Record<string, React.CSSProperties> = {
    queued: { ...statusPillStyle, background: "#f3f4f6", color: "#6b7280" },
    processing: { ...statusPillStyle, background: "#fef3c7", color: "#92400e" },
    succeeded: { ...statusPillStyle, background: "#d1fae5", color: "#065f46" },
    failed: { ...statusPillStyle, background: "#fee2e2", color: "#991b1b" },
    skipped: { ...statusPillStyle, background: "#e5e7eb", color: "#374151" },
  };

  return (
    <>
      <div
        style={{
          borderRadius: 6,
          padding: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          background: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 13,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.display_name || file.original_filename}
            </div>
            <span style={statusStyles[status] ?? statusStyles.queued}>{status}</span>
            {status === "succeeded" && typeof file.chunk_count === "number" && (
              <span style={{ fontSize: 11, color: "#6b7280" }}>Chunks: {file.chunk_count}</span>
            )}
          </div>
          {file.created_at && (
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              {new Date(file.created_at).toLocaleDateString()}
            </div>
          )}
          {status === "failed" && typeof file.extraction_error === "string" && file.extraction_error && (
            <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 4, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {file.extraction_error.length > 80 ? file.extraction_error.slice(0, 80) + "…" : file.extraction_error}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); if (canPreview) setPreviewOpen(true); }}
            disabled={!canPreview}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: canPreview ? "pointer" : "not-allowed",
              fontWeight: 600,
              fontSize: 12,
              opacity: canPreview ? 1 : 0.5,
              background: "white",
            }}
          >
            Preview
          </button>
          <button
            type="button"
            onClick={handleRetry}
            disabled={!canRetry || retrying}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #4f46e5",
              background: "white",
              color: "#4f46e5",
              cursor: canRetry && !retrying ? "pointer" : "not-allowed",
              fontWeight: 600,
              fontSize: 12,
              opacity: canRetry && !retrying ? 1 : 0.5,
            }}
          >
            {retrying ? "…" : "Retry"}
          </button>
          <button
            onClick={handleDownload}
            disabled={loadingUrl}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: loadingUrl ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 12,
              opacity: loadingUrl ? 0.6 : 1,
              background: "white",
            }}
          >
            {loadingUrl ? "Loading..." : "Download"}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setDeleteOpen(true); }}
            disabled={deleting}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #dc2626",
              background: deleting ? "#fca5a5" : "#fee2e2",
              color: "#991b1b",
              cursor: deleting ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 12,
              opacity: deleting ? 0.6 : 1,
            }}
            title={`Delete ${file.display_name || file.original_filename}`}
            aria-label={`Delete ${file.display_name || file.original_filename}`}
          >
            🗑️
          </button>
        </div>
      </div>
      <DeleteFileDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        fileName={file.display_name || file.original_filename || "File"}
        onConfirm={confirmDelete}
        isDeleting={deleting}
      />
      {previewOpen && createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setPreviewOpen(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: 10,
              maxWidth: "90vw",
              maxHeight: "80vh",
              width: 640,
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: 16, borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Extracted text: {file.display_name || file.original_filename}</span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "white",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Close
              </button>
            </div>
            <pre
              style={{
                flex: 1,
                margin: 0,
                padding: 16,
                overflow: "auto",
                fontSize: 12,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {file.extracted_text ?? ""}
            </pre>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default function DealPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dealId = params.id as string;
  const fromWizard = searchParams.get("from") === "wizard";
  const returnTo = searchParams.get("returnTo") ?? "step-2";
  const tabParam = searchParams.get("tab");

  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState<DealRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("draft");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Deal parties state
  const [dealParties, setDealParties] = useState<DealPartyNormalized[]>([]);
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
  const [purposeType, setPurposeType] = useState<string>("other");
  const [purposeNotes, setPurposeNotes] = useState<string>("");

  // File upload state (using first submission automatically)
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);
  const [files, setFiles] = useState<SubmissionFileRow[]>([]);
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

  // DealSense modal state
  const [showDealSenseModal, setShowDealSenseModal] = useState(false);
  const [dealSenseLoading, setDealSenseLoading] = useState(false);
  const [dealSenseError, setDealSenseError] = useState<string | null>(null);

  // Add Customer modal state
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);

  // Add Entity modal state
  const [showAddEntityModal, setShowAddEntityModal] = useState(false);
  
  // Rename deal modal state
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const scrollPositionRef = useRef<number>(0);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  // Upload Pack category accordion state
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showEmptyCategories, setShowEmptyCategories] = useState(false);

  // Latest DealSense run state
  const [latestRun, setLatestRun] = useState<RunRow | null>(null);
  const [latestFindings, setLatestFindings] = useState<FindingRow[]>([]);
  const [latestRunLoading, setLatestRunLoading] = useState(false);
  const [latestRunError, setLatestRunError] = useState<string | null>(null);
  const [runAssessmentLoading, setRunAssessmentLoading] = useState(false);
  const [runCheckError, setRunCheckError] = useState<string | null>(null);

  // Lender summary state
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [errorSummary, setErrorSummary] = useState<string | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [summaryCreatedAt, setSummaryCreatedAt] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"overview" | "parties" | "documents" | "checks" | "lender">("overview");

  useEffect(() => {
    if (tabParam === "documents") setActiveTab("documents");
  }, [tabParam]);

  const wizardNextStep = useMemo(() => {
    if (!deal?.wizard_state) return 1;
    const pt = purposeType || deal.purpose_type || "other";
    const PURPOSE_KEYS = Object.keys(PURPOSE_DOC_MATRIX) as WizardPurposeKey[];
    const purposeKey: WizardPurposeKey = PURPOSE_KEYS.includes(pt as WizardPurposeKey) ? (pt as WizardPurposeKey) : pt === "refinance" ? "refinance_business" : pt === "property_purchase" ? "property_purchase_oo" : "other";
    const ws = deal.wizard_state as Record<string, unknown>;
    const docUploaded = (ws.docUploaded && typeof ws.docUploaded === "object" && !Array.isArray(ws.docUploaded)) ? (ws.docUploaded as Record<string, boolean>) : {};
    const docMissing = (ws.docMissing && typeof ws.docMissing === "object" && !Array.isArray(ws.docMissing)) ? (ws.docMissing as Record<string, boolean>) : {};
    const requiredIds = PURPOSE_DOC_MATRIX[purposeKey].required;
    const requiredReady = requiredIds.every((id) => docUploaded[id] || docMissing[id]);
    return requiredReady ? 3 : 2;
  }, [deal, purposeType]);

  async function loadFilesWithChunkCounts(submissionId: string): Promise<SubmissionFileRow[]> {
    const supabase = supabaseBrowser();
    const { data: filesData, error } = await supabase
      .from("submission_files")
      .select("*")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const list = (filesData || []) as SubmissionFileRow[];
    const ids = list.map((f) => f.id).filter((id): id is string => Boolean(id));
    const counts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: chunkRows } = await supabase
        .from("submission_file_chunks")
        .select("submission_file_id")
        .in("submission_file_id", ids);
      if (chunkRows && Array.isArray(chunkRows)) {
        (chunkRows as { submission_file_id: string }[]).forEach((r) => {
          counts[r.submission_file_id] = (counts[r.submission_file_id] ?? 0) + 1;
        });
      }
    }
    return list.map((f) => ({ ...f, chunk_count: counts[f.id!] ?? 0 }));
  }

  async function refreshFiles() {
    if (!activeSubmissionId) return;
    setFilesLoading(true);
    try {
      const merged = await loadFilesWithChunkCounts(activeSubmissionId);
      setFiles(merged);
      setFilesError(null);
    } catch (e) {
      setFilesError(e instanceof Error ? e.message : "Failed to refresh files");
    } finally {
      setFilesLoading(false);
    }
  }

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
      setPurposeType(data.purpose_type ?? "other");
      setPurposeNotes(data.purpose_notes ?? "");
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

      // Load files with chunk counts
      setFilesLoading(true);
      try {
        const merged = await loadFilesWithChunkCounts(submissionId);
        setFilesError(null);
        setFiles(merged);
      } catch (filesError: unknown) {
        console.error("Error loading files:", filesError);
        setFilesError(filesError instanceof Error ? filesError.message : "Failed to load files");
        setFiles([]);
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
      type EntityLike = { id?: string; entity_type?: string; display_name?: string; email?: string; phone?: string };
      const normalized = (data || []).map((party: DealPartyRaw): DealPartyNormalized => {
        // Supabase returns entities as an array when using join syntax, get first element
        const rawEntity = Array.isArray(party.entities) ? (party.entities as EntityLike[])[0] : (party.entities as EntityLike | null);
        const entity = rawEntity ?? null;
        return {
          id: party.id,
          deal_id: party.deal_id,
          roles: party.roles || (party.role ? [party.role] : []),
          notes: party.notes ?? null,
          entityId: entity?.id || null,
          entity_type: (entity?.entity_type || party.type) ?? null,
          display_name: (entity?.display_name || party.name) ?? null,
          email: entity?.email || null,
          phone: entity?.phone || null,
          type: (entity?.entity_type || party.type) ?? null,
          name: (entity?.display_name || party.name) ?? null,
          role: party.roles?.[0] ?? party.role ?? null,
        };
      });

      setDealParties(normalized);
      setPartiesLoading(false);
    }

    if (dealId && !loading) {
      loadDealParties();
    }
  }, [dealId, loading]);

  // Initialize expanded categories based on files
  useEffect(() => {
    if (!filesLoading && files.length > 0) {
      const categoriesWithFiles = new Set<string>();
      files.forEach(file => {
        if (file.category) {
          categoriesWithFiles.add(file.category);
        }
      });
      setExpandedCategories(categoriesWithFiles);
    }
  }, [files, filesLoading]);

  // Fetch latest lender summary for deal
  useEffect(() => {
    if (!dealId) return;
    let cancelled = false;
    setLoadingSummary(true);
    setErrorSummary(null);
    fetch(`/api/deals/${dealId}/summary`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to load summary");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setSummary(data.summary ?? null);
        setSummaryId(data.summary_id ?? null);
        setSummaryCreatedAt(data.created_at ?? null);
      })
      .catch((err) => {
        if (!cancelled) setErrorSummary(err instanceof Error ? err.message : "Failed to load summary");
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false);
      });
    return () => { cancelled = true; };
  }, [dealId]);

  async function refreshLatestRun() {
    if (!activeSubmissionId) {
      setLatestRun(null);
      setLatestFindings([]);
      return;
    }
    setLatestRunLoading(true);
    setLatestRunError(null);
    const supabase = supabaseBrowser();
    try {
      const { data: runs, error: runsError } = await supabase
        .from("submission_runs")
        .select("*")
        .eq("submission_id", activeSubmissionId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (runsError) {
        console.error("Error loading latest run:", runsError);
        setLatestRunError("Couldn't load run status");
        setLatestRun(null);
        setLatestFindings([]);
        return;
      }

      const latest = runs?.[0] || null;
      setLatestRun(latest);

      if (latest?.id) {
        const { data: findingsData, error: findingsError } = await supabase
          .from("submission_run_findings")
          .select("*")
          .eq("run_id", latest.id)
          .order("created_at", { ascending: false });

        if (findingsError) {
          console.error("Error loading findings:", findingsError);
          setLatestFindings([]);
        } else {
          const list = (findingsData || []) as FindingRow[];
          const severityOrder = { critical: 1, warning: 2, info: 3 };
          list.sort((a, b) => {
            const sa = severityOrder[a.severity as keyof typeof severityOrder] ?? 4;
            const sb = severityOrder[b.severity as keyof typeof severityOrder] ?? 4;
            if (sa !== sb) return sa - sb;
            return (b.score_impact ?? 0) - (a.score_impact ?? 0);
          });
          setLatestFindings(list);
        }
      } else {
        setLatestFindings([]);
      }
    } catch (err) {
      console.error("Error loading latest run:", err);
      setLatestRunError("Couldn't load run status");
    } finally {
      setLatestRunLoading(false);
    }
  }

  // Load latest run and findings
  useEffect(() => {
    refreshLatestRun();
  }, [activeSubmissionId]);

  // Lock body scroll when rename modal opens
  useEffect(() => {
    if (showRenameModal) {
      // Capture current scroll position
      scrollPositionRef.current = window.scrollY;
      
      // Lock body scroll
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollPositionRef.current}px`;
      document.body.style.width = "100%";
      
      // Focus input after a brief delay to avoid scroll jump
      setTimeout(() => {
        if (renameInputRef.current) {
          renameInputRef.current.focus({ preventScroll: true });
        }
      }, 0);
      
      return () => {
        // Restore scroll position on unmount
        const scrollY = document.body.style.top;
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        if (scrollY) {
          const parsedScrollY = parseInt(scrollY.replace("px", ""), 10) || 0;
          window.scrollTo(0, Math.abs(parsedScrollY));
        }
      };
    }
  }, [showRenameModal]);

  // Set mounted state for portal (client-side only)
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

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
          status: status,
          notes: notes.trim() || null,
          purpose_type: purposeType,
          purpose_notes: purposeType === "other" ? (purposeNotes.trim() || null) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dealId)
        .select()
        .maybeSingle();

      if (updateError) {
        console.error("Error updating deal raw:", updateError);
        console.error("Error updating deal json:", JSON.stringify(updateError));
        console.error("Error updating deal context:", { dealId, status, purposeType, purposeNotes, notesLen: notes?.length ?? 0 });
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
      setPurposeType(updatedDeal.purpose_type ?? "other");
      setPurposeNotes(updatedDeal.purpose_notes ?? "");
      setSaveMessage({ type: "success", text: "Saved" });
      setTimeout(() => setSaveMessage(null), 3000);
      setSaving(false);
    } catch (err) {
      console.error("Error:", err);
      setSaveMessage({ type: "error", text: "An unexpected error occurred." });
      setSaving(false);
    }
  }

  async function handleRenameDeal() {
    if (!deal || !renameName.trim() || renameName.trim() === (deal?.name || name)) {
      return;
    }

    setRenaming(true);
    setRenameError(null);
    const supabase = supabaseBrowser();

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setRenameError("Not authenticated. Please sign in again.");
        setRenaming(false);
        return;
      }

      const { data: updatedDeal, error: updateError } = await supabase
        .from("deals")
        .update({
          name: renameName.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", dealId)
        .select()
        .maybeSingle();

      if (updateError) {
        console.error("Error renaming deal:", updateError);
        setRenameError("Failed to rename deal. Please try again.");
        setRenaming(false);
        return;
      }

      if (!updatedDeal) {
        setRenameError("Deal not found or access denied.");
        setRenaming(false);
        return;
      }

      setDeal(updatedDeal);
      setName(updatedDeal.name || "");
      setShowRenameModal(false);
      setRenameName("");
      setRenaming(false);
    } catch (err) {
      console.error("Error:", err);
      setRenameError("An unexpected error occurred.");
      setRenaming(false);
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

  function openUploadForChecklist(accepted: string[], suggestedDisplayName?: string) {
    const pre = normalizeAcceptedToUploadCategory(accepted);
    setCategory(pre);
    setDisplayName(suggestedDisplayName ?? "");
    setSelectedFile(null);
    setShowUploadModal(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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

    const { data: { user } } = await supabase.auth.getUser();

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

      const validCategories = ["financials", "tax", "forecasts", "business_plan", "broker_app", "security", "other"];
      const safeCategory = validCategories.includes(category) ? category : "other";
      const categoryForDb = LEGACY_CATEGORY_TO_WIZARD_DOC_ID[safeCategory];
      if (categoryForDb == null) {
        alert("This document category is not supported for upload. Please use a supported category (e.g. Financials, Forecasts, Broker application/SoP, Security, Identification).");
        setUploading(false);
        return;
      }
      const wizardDocIds = new Set(DOC_TYPES.map((d) => d.id));
      if (!wizardDocIds.has(categoryForDb)) {
        alert("Invalid document category. Please try again.");
        setUploading(false);
        return;
      }

      const insertData = {
        submission_id: submissionId,
        storage_path: storagePath,
        original_filename: selectedFile.name,
        display_name: displayName.trim() || selectedFile.name,
        category: categoryForDb,
        mime_type: selectedFile.type,
        size_bytes: selectedFile.size
      };

      const { data: insertedFile, error: insertError } = await supabase
        .from("submission_files")
        .insert(insertData)
        .select("id")
        .single();

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

      // Refresh files list so new file appears
      const { data: refreshedFiles } = await supabase
        .from("submission_files")
        .select("*")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: false });

      if (refreshedFiles) {
        setFiles(refreshedFiles);
      }

      if (insertedFile?.id) {
        console.log("[Deal upload] Inserted file id:", insertedFile.id, "- extraction triggered");
        const extractRes = await fetch("/api/submission-files/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: insertedFile.id }),
        });
        const extractJson = await extractRes.json().catch(() => ({}));
        if (extractJson?.ok || extractJson?.alreadyExtracted) {
          await refreshFiles();
        }
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
    if (file.storage_path) {
      const bucketName = "deal-packs";
      const { error: storageError } = await supabase.storage
        .from(bucketName)
        .remove([file.storage_path]);

      if (storageError) {
        console.error("Error deleting file from storage:", {
          message: storageError.message,
          details: (storageError as SupabaseErrorLike).details,
          hint: (storageError as SupabaseErrorLike).hint,
          code: (storageError as SupabaseErrorLike).code,
        });
        setDeleteError(`Warning: File record deleted but storage cleanup failed: ${storageError.message || "Unknown error"}`);
        // Don't throw - UI already shows file as deleted
      }
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
      <main>
        <p>Loading deal...</p>
      </main>
    );
  }

  if (error) {
    if (error === "not_found") {
      return (
        <main>
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
      <main>
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
  function getPartyRoles(party: DealPartyRow): string[] {
    return party.roles ?? (party.role ? [party.role] : []);
  }

  // Compute borrower/guarantor readiness from deal parties
  const hasBorrower = dealParties.some(p => getPartyRoles(p).includes("borrower"));
  const hasGuarantor = dealParties.some(p => getPartyRoles(p).includes("guarantor"));

  const handleFindingResolved = async (findingId: string) => {
    setLatestFindings((prev) => prev.filter((f) => f.id !== findingId));
    await refreshLatestRun();
  };

  return (
    <div className="space-y-8">
      {/* Header: row 1 = back + title, row 2 = badges + actions, row 3 = Last run / errors */}
      <div className="flex flex-col gap-3">
        {/* Row 1: Back + rename + full title (no truncate, wraps) */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/app/deals")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              background: "white",
              cursor: "pointer",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            ← Back to Deals
          </button>
          <button
            onClick={() => {
              setRenameName(deal?.name || name || "");
              setRenameError(null);
              setShowRenameModal(true);
            }}
            className="flex-shrink-0 p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            title="Rename deal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold mb-0 leading-tight min-w-0">{deal?.name || name || "Deal Details"}</h1>
        </div>
        {/* Row 2: Left = badges (flex-wrap), Right = action buttons (flex-wrap) */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              const active = latestFindings.filter((f) => {
                const state = f.workflow_state ?? "open";
                return state === "open" || state === "acknowledged";
              });
              const criticalActive = active.filter((f) => f.severity === "critical").length;
              const warningsActive = active.filter((f) => f.severity === "warning").length;
              const label = criticalActive > 0 ? "Not ready to submit" : warningsActive > 0 ? "Needs attention" : "Ready to submit";
              const style = criticalActive > 0 ? { background: "#fee2e2", color: "#991b1b" } : warningsActive > 0 ? { background: "#fef3c7", color: "#92400e" } : { background: "#d1fae5", color: "#065f46" };
              const checklistItems = PURPOSE_CHECKLIST[purposeType] ?? [];
              const req = tierStats(files, checklistItems, "required");
              const rec = tierStats(files, checklistItems, "recommended");
              const sup = tierStats(files, checklistItems, "supporting");
              const docsPct = computeReadinessPct({
                requiredTotal: req.total,
                requiredUploaded: req.uploaded,
                recommendedTotal: rec.total,
                recommendedUploaded: rec.uploaded,
                supportingTotal: sup.total,
                supportingUploaded: sup.uploaded,
              });
              const docsStyle =
                docsPct < 60 ? { background: "#fee2e2", color: "#991b1b" } : docsPct < 85 ? { background: "#fef3c7", color: "#92400e" } : { background: "#d1fae5", color: "#065f46" };
              return (
                <>
                  <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, flexShrink: 0, ...style }}>
                    {label}
                  </span>
                  {checklistItems.length > 0 && (
                    <span
                      title="Based on purpose checklist document completeness"
                      style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, flexShrink: 0, ...docsStyle }}
                    >
                      Docs: {docsPct}%
                    </span>
                  )}
                </>
              );
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                if (!activeSubmissionId || runAssessmentLoading) return;
                setRunAssessmentLoading(true);
                setRunCheckError(null);
                try {
                  const res = await fetch(`/api/submissions/${activeSubmissionId}/run`, { method: "POST" });
                  const json = await res.json().catch(() => ({}));
                  if (json?.ok && json?.runId) {
                    await refreshLatestRun();
                  } else {
                    setRunCheckError(json?.error ?? "Run checks failed");
                  }
                } catch (err) {
                  setRunCheckError(err instanceof Error ? err.message : "Run checks failed");
                } finally {
                  setRunAssessmentLoading(false);
                }
              }}
              disabled={!activeSubmissionId || runAssessmentLoading}
              style={{
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid #4f46e5",
                background: runAssessmentLoading ? "#c7d2fe" : "#4f46e5",
                color: "white",
                cursor: !activeSubmissionId || runAssessmentLoading ? "not-allowed" : "pointer",
                opacity: runAssessmentLoading ? 0.8 : 1,
              }}
            >
              {runAssessmentLoading ? "Running…" : "Run checks"}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!dealId || generatingSummary) return;
                setGeneratingSummary(true);
                setErrorSummary(null);
                try {
                  const res = await fetch(`/api/deals/${dealId}/generate-summary`, { method: "POST" });
                  const json = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setErrorSummary(json?.error ?? "Generate failed");
                    return;
                  }
                  setSummary(json.summary ?? null);
                  setSummaryId(json.summary_id ?? null);
                  setSummaryCreatedAt(new Date().toISOString());
                } catch (err) {
                  setErrorSummary(err instanceof Error ? err.message : "Generate failed");
                } finally {
                  setGeneratingSummary(false);
                }
              }}
              disabled={generatingSummary}
              style={{
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid #059669",
                background: generatingSummary ? "#a7f3d0" : "white",
                color: "#059669",
                cursor: generatingSummary ? "not-allowed" : "pointer",
              }}
            >
              {generatingSummary ? "Generating…" : "Generate lender summary"}
            </button>
            <button
              type="button"
              onClick={() => dealId && router.push(`/app/deals/${dealId}/wizard/step-${wizardNextStep}`)}
              disabled={!dealId}
              style={{
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid #4f46e5",
                background: "#4f46e5",
                color: "white",
                cursor: dealId ? "pointer" : "not-allowed",
                opacity: dealId ? 1 : 0.7,
              }}
            >
              Continue wizard
            </button>
            <button
              type="button"
              onClick={() => dealId && router.push(`/app/deals/${dealId}/wizard/step-1`)}
              disabled={!dealId}
              style={{
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid #64748b",
                background: "white",
                color: "#475569",
                cursor: dealId ? "pointer" : "not-allowed",
              }}
            >
              Open wizard
            </button>
          </div>
        </div>
        {/* Below Row 2: Last run, runCheckError, helper – aligned right */}
        <div className="flex flex-col items-end gap-1">
          {latestRun?.created_at && (
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              Last run: {new Date(latestRun.created_at).toLocaleString()}
            </span>
          )}
          {runCheckError && <span style={{ fontSize: 12, color: "#b91c1c" }}>{runCheckError}</span>}
          {!activeSubmissionId && (
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              Add at least one borrower (person or entity) to run DealSense.
            </span>
          )}
        </div>
      </div>

      {fromWizard && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            background: "#eef2ff",
            border: "1px solid #c7d2fe",
            borderRadius: 8,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: "#3730a3" }}>
            Uploading documents for the DealReady wizard.
          </span>
          <a
            href={`/app/deals/${dealId}/wizard/${returnTo}`}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              background: "#4f46e5",
              color: "white",
              textDecoration: "none",
            }}
          >
            Back to Wizard
          </a>
          <button
            type="button"
            onClick={() => router.push(`/app/deals/${dealId}`)}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 8,
              border: "1px solid #6366f1",
              background: "white",
              color: "#4f46e5",
              cursor: "pointer",
            }}
          >
            Continue without wizard
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 24, borderBottom: "2px solid #e5e7eb", flexWrap: "wrap" }}>
        {(["overview", "parties", "documents", "checks", "lender"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 4px",
              marginBottom: -2,
              fontSize: 14,
              fontWeight: activeTab === tab ? 600 : 500,
              border: "none",
              borderBottom: activeTab === tab ? "3px solid #4f46e5" : "3px solid transparent",
              background: "none",
              color: activeTab === tab ? "#3730a3" : "#6b7280",
              cursor: "pointer",
            }}
          >
            {tab === "overview" ? "Overview" : tab === "parties" ? "Parties" : tab === "documents" ? "Documents" : tab === "checks" ? "Checks" : "Recommendations"}
          </button>
        ))}
      </div>

      {/* DealSense Confirmation Modal */}
      {showDealSenseModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !dealSenseLoading) {
              setShowDealSenseModal(false);
            }
          }}
        >
          <div
            style={{
            background: "white",
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: "90%",
              boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              Run DealSense
            </h2>
            <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 20 }}>
              This will analyze your deal and check for missing documents, required parties, and compliance issues. Continue?
            </p>

            {dealSenseError && (
            <div
              style={{
                padding: 12,
                  background: "#fee2e2",
                borderRadius: 8,
                  marginBottom: 16,
                  border: "1px solid #dc2626",
                }}
              >
                <p style={{ fontSize: 13, color: "#991b1b", margin: 0 }}>
                  {dealSenseError}
                </p>
            </div>
          )}

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  if (!dealSenseLoading) {
                    setShowDealSenseModal(false);
                    setDealSenseError(null);
                  }
                }}
                disabled={dealSenseLoading}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "white",
                  cursor: dealSenseLoading ? "not-allowed" : "pointer",
                  opacity: dealSenseLoading ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!activeSubmissionId || dealSenseLoading) return;

                  setDealSenseLoading(true);
                  setDealSenseError(null);

                  try {
                    const supabase = supabaseBrowser();
                    const { data: newRun, error: createError } = await supabase
                      .from("submission_runs")
                      .insert({
                        submission_id: activeSubmissionId,
                        status: "queued",
                      })
                      .select()
                      .single();

                    if (createError) {
                      console.error("Error creating run:", createError);
                      setDealSenseError("Failed to create DealSense run. Please try again.");
                      setDealSenseLoading(false);
                      return;
                    }

                    router.push(`/app/deals/${dealId}/runs/${newRun.id}`);
                  } catch (err) {
                    console.error("Error creating DealSense run:", err);
                    setDealSenseError("Failed to create DealSense run. Please try again.");
                    setDealSenseLoading(false);
                  }
                }}
                disabled={dealSenseLoading}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: dealSenseLoading ? "#9ca3af" : "#10b981",
                  color: "white",
                  cursor: dealSenseLoading ? "not-allowed" : "pointer",
                  opacity: dealSenseLoading ? 0.6 : 1,
                }}
              >
                {dealSenseLoading ? "Creating..." : "Confirm & Run"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddCustomerModal && (
        <div
                style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !addingParty) {
              setShowAddCustomerModal(false);
            }
          }}
        >
          <div
                style={{
                  background: "white",
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: "90%",
              boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
              Add Customer
            </h2>
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
              <div style={{ marginBottom: 20 }}>
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
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  if (!addingParty) {
                    setShowAddCustomerModal(false);
                    setNewCustomerName("");
                    setNewCustomerRoles(["borrower"]);
                  }
                }}
                disabled={addingParty}
                style={{
                  padding: "10px 20px",
                        fontSize: 14,
                  fontWeight: 600,
                        borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.2)",
                        background: "white",
                  cursor: addingParty ? "not-allowed" : "pointer",
                  opacity: addingParty ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
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
                      setNewCustomerRoles(["borrower"]);
                      setShowAddCustomerModal(false);
                    }
                  } catch (err) {
                    console.error("Error:", err);
                    alert("An unexpected error occurred.");
                      }
                      setAddingParty(false);
                    }}
                disabled={!newCustomerName.trim() || addingParty || newCustomerRoles.length === 0}
                    style={{
                  padding: "10px 20px",
                      fontSize: 14,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: "1px solid rgba(0,0,0,0.2)",
                  background: addingParty ? "#9ca3af" : "#10b981",
                      color: "white",
                  cursor: !newCustomerName.trim() || addingParty || newCustomerRoles.length === 0 ? "not-allowed" : "pointer",
                  opacity: !newCustomerName.trim() || addingParty || newCustomerRoles.length === 0 ? 0.6 : 1,
                    }}
                  >
                {addingParty ? "Adding..." : "Add"}
                  </button>
                </div>
          </div>
                  </div>
                )}

      {/* Add Entity Modal */}
      {showAddEntityModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !addingParty) {
              setShowAddEntityModal(false);
            }
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: "90%",
              boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
              Add Entity
            </h2>
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
              <div style={{ marginBottom: 20 }}>
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
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  if (!addingParty) {
                    setShowAddEntityModal(false);
                    setNewEntityName("");
                    setNewEntityRoles(["borrower"]);
                  }
                }}
                disabled={addingParty}
                style={{
                  padding: "10px 20px",
                        fontSize: 14,
                  fontWeight: 600,
                        borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.2)",
                        background: "white",
                  cursor: addingParty ? "not-allowed" : "pointer",
                  opacity: addingParty ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
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
                      setNewEntityRoles(["borrower"]);
                      setShowAddEntityModal(false);
                    }
                  } catch (err) {
                    console.error("Error:", err);
                    alert("An unexpected error occurred.");
                      }
                      setAddingParty(false);
                    }}
                disabled={!newEntityName.trim() || addingParty || newEntityRoles.length === 0}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: addingParty ? "#9ca3af" : "#10b981",
                  color: "white",
                  cursor: !newEntityName.trim() || addingParty || newEntityRoles.length === 0 ? "not-allowed" : "pointer",
                  opacity: !newEntityName.trim() || addingParty || newEntityRoles.length === 0 ? 0.6 : 1,
                }}
              >
                {addingParty ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab content: Overview */}
      {activeTab === "overview" && (
        <>
      {/* Latest DealSense Card - informational only */}
      {!latestRunLoading && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm" style={{ padding: 24 }}>
          <h2 className="text-xl font-semibold text-gray-900" style={{ marginBottom: 16 }}>Latest DealSense</h2>

          {latestRunError && (
            <p style={{ fontSize: 13, color: "#dc2626", marginBottom: 12 }}>{latestRunError}</p>
          )}

          {!latestRun ? (
            <>
              <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 12 }}>No DealSense run yet.</p>
              <button
                type="button"
                onClick={() => dealId && router.push(`/app/deals/${dealId}/wizard/step-2`)}
                className="text-sm text-indigo-600 hover:underline cursor-pointer"
              >
                Edit documents in wizard
              </button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
                {latestRun.status && (
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      background:
                        latestRun.status === "completed" ? "#d1fae5"
                          : latestRun.status === "running" ? "#dbeafe"
                          : latestRun.status === "failed" ? "#fee2e2"
                          : "#e5e7eb",
                      color:
                        latestRun.status === "completed" ? "#065f46"
                          : latestRun.status === "running" ? "#1e40af"
                          : latestRun.status === "failed" ? "#991b1b"
                          : "#374151",
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}
                  >
                    {latestRun.status}
                  </span>
                )}
                {latestFindings.length > 0 && (
                  <>
                    <span style={{ padding: "6px 12px", borderRadius: 6, background: "#fee2e2", color: "#991b1b", fontSize: 13, fontWeight: 600 }}>
                      Critical: {latestFindings.filter((f) => f.severity === "critical").length}
                    </span>
                    <span style={{ padding: "6px 12px", borderRadius: 6, background: "#fef3c7", color: "#92400e", fontSize: 13, fontWeight: 600 }}>
                      Warnings: {latestFindings.filter((f) => f.severity === "warning").length}
                    </span>
                    <span style={{ padding: "6px 12px", borderRadius: 6, background: "#d1fae5", color: "#065f46", fontSize: 13, fontWeight: 600 }}>
                      Info: {latestFindings.filter((f) => f.severity === "info").length}
                    </span>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                      Active: {latestFindings.filter((f) => { const s = f.workflow_state ?? "open"; return s === "open" || s === "acknowledged"; }).length} • Resolved: {latestFindings.filter((f) => { const s = f.workflow_state ?? "open"; return s === "resolved" || s === "dismissed"; }).length}
                    </span>
                  </>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => dealId && router.push(`/app/deals/${dealId}/wizard/step-2`)}
                  className="text-sm text-indigo-600 hover:underline cursor-pointer"
                >
                  Edit documents in wizard
                </button>
                {activeSubmissionId ? (
                  <button
                    onClick={() => router.push(`/app/submissions/${activeSubmissionId}`)}
                    className="px-4 py-2 text-base font-semibold rounded-lg border border-green-700 bg-green-600 text-white cursor-pointer hover:bg-green-700"
                  >
                    View latest results
                  </button>
                ) : (
                  <button
                    disabled
                    className="px-4 py-2 text-base font-semibold rounded-lg border border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed"
                  >
                    View latest results
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Deal Details (overview): saveMessage, Notes, Save */}
      {deal && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm" style={{ padding: 24 }}>
          <h2 className="text-xl font-semibold mb-5 text-gray-900">Deal Details</h2>
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
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#374151" }}>Borrowing purpose</label>
            <select
              value={purposeType}
              onChange={(e) => setPurposeType(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid rgba(0,0,0,0.2)", borderRadius: 8, outline: "none", background: "white" }}
            >
              <option value="business_purchase">Business purchase</option>
              <option value="startup">Start-up / new business</option>
              <option value="refinance">Refinance / restructure</option>
              <option value="equipment">Equipment or asset purchase</option>
              <option value="working_capital">Working capital</option>
              <option value="property_purchase">Property purchase (owner-occupied)</option>
              <option value="shareholder_buyout">Shareholder buyout</option>
              <option value="expansion">Business expansion</option>
              <option value="other">Other</option>
            </select>
          </div>
          {purposeType === "other" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#374151" }}>Describe the purpose</label>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Briefly describe what the borrowing is for (1–3 sentences).</p>
              <textarea
                value={purposeNotes}
                onChange={(e) => setPurposeNotes(e.target.value)}
                placeholder="e.g. Short-term funding for inventory"
                rows={3}
                maxLength={500}
                style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid rgba(0,0,0,0.2)", borderRadius: 8, outline: "none", fontFamily: "inherit", resize: "vertical" }}
              />
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#374151" }}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this deal"
              rows={4}
              style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid rgba(0,0,0,0.2)", borderRadius: 8, outline: "none", fontFamily: "inherit", resize: "vertical" }}
            />
          </div>
          <div>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: "10px 20px", fontSize: 14, fontWeight: 600, borderRadius: 8, border: "1px solid rgba(0,0,0,0.2)", background: "#10b981", color: "white", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
        </>
      )}

      {/* Tab content: Parties */}
      {activeTab === "parties" && (
        <>
          {/* Customers Section */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#111827" }}>Customers</h3>
              <button
                onClick={() => setShowAddCustomerModal(true)}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "#10b981",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                + Add person
              </button>
            </div>
            
            {/* Customers List Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#111827" }}>Added Customers</h4>
              {partiesLoading ? (
                <p style={{ fontSize: 14, color: "#6b7280" }}>Loading...</p>
              ) : dealParties.filter(p => p.type === "person").length === 0 ? (
                <p style={{ fontSize: 14, color: "#6b7280" }}>No customers added yet.</p>
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

          </div>

          {/* Entities Section */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#111827" }}>Entities</h3>
              <button
                onClick={() => setShowAddEntityModal(true)}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "#10b981",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                + Add entity
              </button>
            </div>
            
            {/* Entities List Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#111827" }}>Added Entities</h4>
              {partiesLoading ? (
                <p style={{ fontSize: 14, color: "#6b7280" }}>Loading...</p>
              ) : dealParties.filter(p => p.type === "entity" || p.entity_type === "company" || p.entity_type === "trust" || p.entity_type === "other").length === 0 ? (
                <p style={{ fontSize: 14, color: "#6b7280" }}>No entities added yet.</p>
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

          </div>
        </>
      )}

      {/* Tab content: Documents */}
      {activeTab === "documents" && (
      <>
      {/* Purpose checklist */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" style={{ marginBottom: 24 }}>
        <h2 className="text-xl font-semibold mb-0 text-gray-900">Purpose checklist</h2>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4, marginBottom: 16 }}>
          Based on borrowing purpose: {PURPOSE_LABELS[purposeType] ?? "Other"}
        </p>
        {(() => {
          const items = PURPOSE_CHECKLIST[purposeType] ?? [];
          if (items.length === 0) {
            return (
              <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
                Select a borrowing purpose to see a tailored checklist.
              </p>
            );
          }
          const tiers: DocTier[] = ["required", "recommended", "supporting"];
          const tierLabels: Record<DocTier, string> = { required: "Required", recommended: "Recommended", supporting: "Supporting" };
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {tiers.map((tier) => {
                const tierItems = items.filter((i) => i.tier === tier);
                if (tierItems.length === 0) return null;
                const { uploaded, total } = tierStats(files, items, tier);
                return (
                  <div key={tier}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{tierLabels[tier]}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: uploaded === total ? "#d1fae5" : "#f3f4f6",
                          color: uploaded === total ? "#065f46" : "#6b7280",
                        }}
                      >
                        Uploaded {uploaded}/{total}
                      </span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                      {tierItems.map((item) => {
                        const status = checklistStatusForItem(files, item);
                        return (
                          <li key={item.key} style={{ listStyle: "disc", fontSize: 14 }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  flexShrink: 0,
                                  background: status === "uploaded" ? "#d1fae5" : tier === "required" ? "#fee2e2" : "#f3f4f6",
                                  color: status === "uploaded" ? "#065f46" : tier === "required" ? "#991b1b" : "#6b7280",
                                }}
                              >
                                {status === "uploaded" ? "Uploaded" : "Missing"}
                              </span>
                              <span style={{ color: "#111827", fontWeight: 500 }}>{item.label}</span>
                              {status === "missing" && (
                                <button
                                  type="button"
                                  disabled={uploading}
                                  onClick={() => openUploadForChecklist(item.acceptedCategories, item.label)}
                                  style={{
                                    marginLeft: "auto",
                                    padding: "4px 10px",
                                    borderRadius: 6,
                                    border: "1px solid rgba(0,0,0,0.2)",
                                    background: "white",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: uploading ? "not-allowed" : "pointer",
                                    opacity: uploading ? 0.6 : 1,
                                  }}
                                >
                                  Upload
                                </button>
                              )}
                            </div>
                            {item.help && (
                              <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0 0" }}>{item.help}</p>
                            )}
                            <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0 0" }}>
                              Accepts: {item.acceptedCategories.map((c) => CATEGORY_LABELS[c] ?? c).join(", ")}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Upload Pack Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold mb-0 text-gray-900">Upload Pack</h2>
          <button
            onClick={handleFileSelectButton}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: "pointer",
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
          <p style={{ fontSize: 14, color: "#6b7280" }}>Loading files...</p>
        ) : (() => {
          const categories = [
            { key: "financials", label: "Financials" },
            { key: "forecasts", label: "Forecasts" },
            { key: "business_plan", label: "Business Plan" },
            { key: "broker_app", label: "Broker Application/SoP" },
            { key: "security", label: "Security" },
            { key: "other", label: "Other" },
          ];

          const categoryFiles = categories.map(cat => ({
            ...cat,
            files: files.filter(f => f.category === cat.key),
            count: files.filter(f => f.category === cat.key).length,
          }));

          const hasAnyFiles = files.length > 0;
          const emptyCategories = categoryFiles.filter(cat => cat.count === 0);

          if (!hasAnyFiles) {
            return <p style={{ fontSize: 14, color: "#6b7280" }}>No files uploaded yet.</p>;
          }

          const visibleCategories = showEmptyCategories 
            ? categoryFiles 
            : categoryFiles.filter(cat => cat.count > 0);

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {emptyCategories.length > 0 && (
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 13, color: "#374151" }}>Show empty categories</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showEmptyCategories}
                    aria-label="Show empty categories"
                    onClick={() => setShowEmptyCategories(!showEmptyCategories)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        setShowEmptyCategories(!showEmptyCategories);
                      }
                    }}
                    style={{
                      position: "relative",
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      background: showEmptyCategories ? "#10b981" : "#d1d5db",
                      border: "none",
                      cursor: "pointer",
                      outline: "none",
                      transition: "background-color 0.2s",
                      padding: 0,
                    }}
                    onMouseEnter={(e) => {
                      if (!showEmptyCategories) {
                        e.currentTarget.style.background = "#9ca3af";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = showEmptyCategories ? "#10b981" : "#d1d5db";
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: showEmptyCategories ? 22 : 2,
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "white",
                        transition: "left 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    />
                  </button>
                </label>
              )}
              {visibleCategories.map((category) => {
                const isExpanded = expandedCategories.has(category.key);
                return (
                  <div key={category.key} style={{ borderRadius: 8, background: "white", boxShadow: "0 2px 4px rgba(0,0,0,0.08)", marginBottom: 8 }}>
                    <button
                      onClick={() => {
                        const newExpanded = new Set(expandedCategories);
                        if (isExpanded) {
                          newExpanded.delete(category.key);
                        } else {
                          newExpanded.add(category.key);
                        }
                        setExpandedCategories(newExpanded);
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 12px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 0.2s",
                            display: "inline-block",
                            fontSize: 12,
                            color: "#6b7280",
                          }}
                        >
                          ▶
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
                          {category.label}
                        </span>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "#e5e7eb",
                            color: "#6b7280",
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {category.count}
                        </span>
              </div>
                    </button>
                    {isExpanded && (
                      <div style={{ padding: "0 12px 8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {category.files.map((file) => (
                  <FileItem key={file.id} file={file} getDownloadUrl={getDownloadUrl} onDelete={handleDeleteFile} onRefresh={refreshFiles} />
                ))}
                      </div>
                )}
              </div>
                );
              })}
            </div>
          );
        })()}
      </div>
        </>
      )}

      {/* Tab content: Checks */}
      {activeTab === "checks" && (
      <>
      {/* Assessment Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" style={{ marginTop: 24 }}>
        <h2 className="text-xl font-semibold mb-0 text-gray-900" style={{ marginBottom: 16 }}>Assessment</h2>
        {!activeSubmissionId ? (
          <p style={{ fontSize: 14, color: "#6b7280" }}>No submission yet. Upload a file to create a submission, then run assessment.</p>
        ) : latestRunLoading ? (
          <p style={{ fontSize: 14, color: "#6b7280" }}>Loading run…</p>
        ) : latestRunError ? (
          <p style={{ fontSize: 14, color: "#b91c1c" }}>{latestRunError}</p>
        ) : !latestRun ? (
          <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 12 }}>No runs yet.</p>
        ) : (
          (() => {
            const activeFindings = latestFindings.filter((f) => {
              const status = f.status ?? "";
              const state = f.workflow_state ?? "open";
              return status === "new" || state === "open" || state === "acknowledged";
            });
            const resolvedFindings = latestFindings.filter((f) => {
              const status = f.status ?? "";
              const state = f.workflow_state ?? "";
              return status === "resolved" || state === "resolved";
            });
            const severityOrder: Record<string, number> = { critical: 1, warning: 2, info: 3 };
            const sortBySeverityThenTitle = (a: FindingRow, b: FindingRow) => {
              const sa = severityOrder[a.severity ?? ""] ?? 4;
              const sb = severityOrder[b.severity ?? ""] ?? 4;
              if (sa !== sb) return sa - sb;
              return (a.title ?? "").localeCompare(b.title ?? "");
            };
            const documentsActive = activeFindings.filter((f) => (f.category ?? "documents") === "documents").sort(sortBySeverityThenTitle);
            const completenessActive = activeFindings.filter((f) => f.category === "completeness").sort(sortBySeverityThenTitle);
            const documentsResolved = resolvedFindings.filter((f) => (f.category ?? "documents") === "documents").sort(sortBySeverityThenTitle);
            const completenessResolved = resolvedFindings.filter((f) => f.category === "completeness").sort(sortBySeverityThenTitle);
            const hasCompleteness = completenessActive.length > 0 || completenessResolved.length > 0;

            const activeCriticalCount = activeFindings.filter((f) => f.severity === "critical").length;
            const activeWarningCount = activeFindings.filter((f) => f.severity === "warning").length;
            const readiness =
              activeCriticalCount > 0 ? "not_ready" : activeWarningCount > 0 ? "minor_issues" : "ready";

            const readinessConfig = {
              ready: { label: "Ready to submit", helper: "No blocking or warning findings. You can submit this pack.", bg: "#d1fae5", color: "#065f46" },
              minor_issues: { label: "Minor issues", helper: "Some warnings remain. Consider resolving them before submitting.", bg: "#fef3c7", color: "#92400e" },
              not_ready: { label: "Not ready", helper: "Critical findings must be resolved before submitting.", bg: "#fee2e2", color: "#991b1b" },
            };
            const config = readinessConfig[readiness];

            return (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      display: "inline-block",
                      padding: "8px 14px",
                      borderRadius: 8,
                      background: config.bg,
                      color: config.color,
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  >
                    {config.label}
                  </div>
                  <p style={{ margin: "8px 0 0 0", fontSize: 14, color: "#6b7280" }}>{config.helper}</p>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 16, fontSize: 14 }}>
                  {typeof latestRun.score === "number" && (
                    <span><strong>Score:</strong> {latestRun.score}</span>
                  )}
                  {latestRun.assessment_status && (
                    <span><strong>Status:</strong> {latestRun.assessment_status.replace(/_/g, " ")}</span>
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
                {activeFindings.length > 0 ? (
                  <div style={{ marginBottom: 16 }}>
                    {documentsActive.length > 0 && (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#374151" }}>Documents missing</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {documentsActive.map((f, i) => (
                            <FindingItem key={f.id ?? i} finding={f} onResolved={handleFindingResolved} />
                          ))}
                        </div>
                      </>
                    )}
                    {hasCompleteness && completenessActive.length > 0 && (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, marginTop: documentsActive.length > 0 ? 16 : 0, color: "#374151" }}>Missing context (AI)</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {completenessActive.map((f, i) => (
                            <FindingItem key={f.id ?? i} finding={f} onResolved={handleFindingResolved} showAiBadge />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : latestRun?.id ? (
                  <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 12 }}>No findings.</p>
                ) : null}
                {resolvedFindings.length > 0 && (
                  <details style={{ marginBottom: 16 }}>
                    <summary style={{ fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}>
                      Resolved findings ({resolvedFindings.length})
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                      {documentsResolved.length > 0 && (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Documents missing</div>
                          {documentsResolved.map((f, i) => (
                            <FindingItem key={f.id ?? i} finding={f} resolvedView />
                          ))}
                        </>
                      )}
                      {hasCompleteness && completenessResolved.length > 0 && (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4, marginTop: documentsResolved.length > 0 ? 12 : 0 }}>Missing context (AI)</div>
                          {completenessResolved.map((f, i) => (
                            <FindingItem key={f.id ?? i} finding={f} resolvedView showAiBadge />
                          ))}
                        </>
                      )}
                    </div>
                  </details>
                )}
              </>
            );
          })()
        )}
      </div>
        </>
      )}

      {/* Tab content: Recommendations */}
      {activeTab === "lender" && (
      <>
      {/* Lender Summary */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" style={{ marginTop: 24 }}>
        <h2 className="text-xl font-semibold mb-0 text-gray-900" style={{ marginBottom: 16 }}>Lender Summary</h2>
        {loadingSummary ? (
          <p style={{ fontSize: 14, color: "#6b7280" }}>Loading summary…</p>
        ) : errorSummary ? (
          <p style={{ fontSize: 14, color: "#b91c1c" }}>{errorSummary}</p>
        ) : null}
        {!loadingSummary && (
          <>
            <button
              type="button"
              onClick={async () => {
                if (!dealId || generatingSummary) return;
                setGeneratingSummary(true);
                setErrorSummary(null);
                try {
                  const res = await fetch(`/api/deals/${dealId}/generate-summary`, { method: "POST" });
                  const json = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setErrorSummary(json?.error ?? "Generate failed");
                    return;
                  }
                  setSummary(json.summary ?? null);
                  setSummaryId(json.summary_id ?? null);
                  setSummaryCreatedAt(new Date().toISOString());
                } catch (err) {
                  setErrorSummary(err instanceof Error ? err.message : "Generate failed");
                } finally {
                  setGeneratingSummary(false);
                }
              }}
              disabled={generatingSummary}
              style={{
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid #059669",
                background: generatingSummary ? "#a7f3d0" : "#059669",
                color: "white",
                cursor: generatingSummary ? "not-allowed" : "pointer",
                opacity: generatingSummary ? 0.8 : 1,
                marginBottom: 16,
              }}
            >
              {generatingSummary ? "Generating…" : "Generate Lender Summary"}
            </button>
            {summary && (
              <div style={{ marginTop: 8 }}>
                {summaryCreatedAt && (
                  <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                    Generated {new Date(summaryCreatedAt).toLocaleString()}
                  </p>
                )}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (summary) navigator.clipboard.writeText(summary).then(() => {}).catch(() => {});
                    }}
                    style={{
                      padding: "6px 12px",
                      fontSize: 13,
                      fontWeight: 500,
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: "#f9fafb",
                      color: "#374151",
                      cursor: "pointer",
                    }}
                  >
                    Copy
                  </button>
                </div>
                <div
                  className="whitespace-pre-wrap"
                  style={{
                    padding: 12,
                    background: "#f9fafb",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    fontSize: 13,
                    color: "#374151",
                    maxHeight: 400,
                    overflowY: "auto",
                  }}
                >
                  {summary}
                </div>
              </div>
            )}
          </>
        )}
      </div>
        </>
      )}

      {/* Upload Modal - portaled to body so it appears above sticky header */}
      {showUploadModal && mounted && createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
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
              overflow: "visible",
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
        </div>,
        document.body
      )}

      {/* Rename Deal Modal - Portal */}
      {(() => {
        const renameModal = showRenameModal ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !renaming) {
              setShowRenameModal(false);
              setRenameError(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !renaming) {
              setShowRenameModal(false);
              setRenameError(null);
            }
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: "90%",
              boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
              Rename deal
            </h2>

            {renameError && (
              <div
                style={{
                  padding: 12,
                  background: "#fee2e2",
                  borderRadius: 8,
                  marginBottom: 16,
                  border: "1px solid #dc2626",
                }}
              >
                <p style={{ fontSize: 13, color: "#991b1b", margin: 0 }}>
                  {renameError}
                </p>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <input
                ref={renameInputRef}
                type="text"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder="Enter deal name"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !renaming && renameName.trim() && renameName.trim() !== (deal?.name || name)) {
                    handleRenameDeal();
                  }
                  if (e.key === "Escape" && !renaming) {
                    setShowRenameModal(false);
                    setRenameError(null);
                  }
                }}
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

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  if (!renaming) {
                    setShowRenameModal(false);
                    setRenameError(null);
                  }
                }}
                disabled={renaming}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "white",
                  cursor: renaming ? "not-allowed" : "pointer",
                  opacity: renaming ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRenameDeal}
                disabled={renaming || !renameName.trim() || renameName.trim() === (deal?.name || name)}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: renaming || !renameName.trim() || renameName.trim() === (deal?.name || name) ? "#9ca3af" : "#10b981",
                  color: "white",
                  cursor: renaming || !renameName.trim() || renameName.trim() === (deal?.name || name) ? "not-allowed" : "pointer",
                  opacity: renaming || !renameName.trim() || renameName.trim() === (deal?.name || name) ? 0.6 : 1,
                }}
              >
                {renaming ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
        ) : null;

        return mounted && renameModal ? createPortal(renameModal, document.body) : null;
      })()}
          </div>
  );
}
