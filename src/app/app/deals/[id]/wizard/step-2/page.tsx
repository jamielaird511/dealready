"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useWizard } from "@/lib/dealWizard/wizardContext";
import { DOC_TYPES, PURPOSE_DOC_MATRIX, WIZARD_PURPOSE_LABELS, getDocLabel, WIZARD_DOC_ID_TO_UPLOAD_CATEGORY } from "@/lib/dealWizard/docMatrix";
import type { DocTypeId } from "@/lib/dealWizard/docMatrix";
import { deriveDocStatus, type DocStatus } from "@/lib/dealWizard/docStatus";
import type { DocTier, TaxPositionOption } from "@/lib/dealWizard/types";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const TIER_LABELS: Record<DocTier, string> = { required: "Required", recommended: "Recommended", supporting: "Supporting" };
const TAX_OPTIONS: { value: TaxPositionOption; label: string }[] = [
  { value: "confirmed_current", label: "Confirmed current (no arrears)" },
  { value: "arrears_exist", label: "Arrears exist (explanation required)" },
  { value: "not_confirmed", label: "Not confirmed" },
];

/** Valid wizard doc ids (lowercased) for legacy detection. */
const VALID_DOC_IDS_LOWER = new Set(DOC_TYPES.map((d) => d.id.toLowerCase()));

/** Known legacy buckets we can convert -> single wizard doc id. */
const LEGACY_CATEGORY_TO_DOC_ID: Record<string, DocTypeId> = {
  broker_app: "application_narrative",
  financials: "financials",
  forecasts: "forecasts",
  security: "valuation",
  id: "identification",
  identification: "identification",
};

export default function WizardStep2Page() {
  const routeParams = useParams();
  const dealId = typeof routeParams?.id === "string" ? routeParams.id : Array.isArray(routeParams?.id) ? routeParams.id[0] : "";
  const { state, setDocUploaded, setDocMissing, setTaxPosition, setTaxExplanation } = useWizard();
  const config = PURPOSE_DOC_MATRIX[state.purposeKey];
  const docsByTier: DocTier[] = ["required", "recommended", "supporting"];

  const [fileCountByDoc, setFileCountByDoc] = useState<Record<string, number>>({});
  const [overrides, setOverrides] = useState<Record<string, { status: "pending" | "not_required"; reason?: string | null }>>({});
  const [overrideModalDocId, setOverrideModalDocId] = useState<DocTypeId | null>(null);
  const [overrideModalStatus, setOverrideModalStatus] = useState<"pending" | "not_required">("pending");
  const [overrideModalReason, setOverrideModalReason] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);

  const requiredIds = config.required;
  const docStatus = (id: DocTypeId): DocStatus =>
    deriveDocStatus(fileCountByDoc[id] ?? 0, overrides[id] ?? null);
  const missingRequired = requiredIds.filter(
    (id) => (() => { const s = docStatus(id); return s !== "uploaded" && s !== "not_required"; })()
  );
  const showTaxSection = config.taxPositionApplicable;

  const dealDocumentsUrl = `/app/deals/${dealId}?tab=documents&from=wizard&returnTo=step-2`;

  const [filesByDocId, setFilesByDocId] = useState<Record<string, { id: string; filename: string; uploaded_at: string; storage_path?: string | null }[]>>({});
  const [expandedDocIds, setExpandedDocIds] = useState<Set<string>>(new Set());
  const [syncingUploads, setSyncingUploads] = useState(false);
  const [uploadModalDocId, setUploadModalDocId] = useState<DocTypeId | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [legacyFiles, setLegacyFiles] = useState<{ fileId: string; category: string }[]>([]);
  const [submissionIdWithLegacy, setSubmissionIdWithLegacy] = useState<string | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [syncTrigger, setSyncTrigger] = useState(0);
  const [removingFileId, setRemovingFileId] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);

  useEffect(() => {
    if (!dealId) return;
    let cancelled = false;
    const cfg = PURPOSE_DOC_MATRIX[state.purposeKey];
    const docIdsInPurpose = [...cfg.required, ...cfg.recommended, ...cfg.supporting];
    setSyncingUploads(true);
    const supabase = supabaseBrowser();
    Promise.all([
      supabase
        .from("submissions")
        .select("id")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("deal_doc_states").select("doc_id, status, reason").eq("deal_id", dealId),
    ]).then(([subRes, overRes]) => {
      if (cancelled) return;
      const submissions = (subRes.data || []) as { id: string }[];
      const overrideRows = (overRes.data || []) as { doc_id: string; status: string; reason?: string | null }[];
      const overrideMap: Record<string, { status: "pending" | "not_required"; reason?: string | null }> = {};
      overrideRows.forEach((r) => {
        if (r.status === "pending" || r.status === "not_required")
          overrideMap[r.doc_id] = { status: r.status as "pending" | "not_required", reason: r.reason };
      });
      setOverrides(overrideMap);
      const fileCounts: Record<string, number> = {};
      const filesByDoc: Record<string, { id: string; filename: string; uploaded_at: string; storage_path?: string | null }[]> = {};
      docIdsInPurpose.forEach((id) => {
        fileCounts[id] = 0;
        filesByDoc[id] = [];
      });
      let legacyFiles: { fileId: string; category: string }[] = [];
      let subWithLegacy: string | null = null;
      function tryNext(idx: number): Promise<void> {
        if (cancelled || idx >= submissions.length) {
          docIdsInPurpose.forEach((docId) => {
            const status = deriveDocStatus(fileCounts[docId] ?? 0, overrideMap[docId] ?? null);
            setDocUploaded(docId, status === "uploaded");
            setDocMissing(docId, status === "not_required");
          });
          setFileCountByDoc(fileCounts);
          setFilesByDocId(filesByDoc);
          setLegacyFiles(legacyFiles);
          setSubmissionIdWithLegacy(subWithLegacy);
          setSyncingUploads(false);
          return Promise.resolve();
        }
        const subId = submissions[idx].id;
        return new Promise<void>((resolve, reject) => {
          supabase
            .from("submission_files")
            .select("id, category, original_filename, display_name, created_at, storage_path")
            .eq("submission_id", subId)
            .eq("is_deleted", false)
            .limit(500)
            .then(({ data: files }) => {
            if (cancelled) { resolve(); return; }
            const list = (files || []) as { id?: string; category?: string | null; original_filename?: string | null; display_name?: string | null; created_at?: string | null; storage_path?: string | null }[];
            list.forEach((f) => {
              const c = (f.category ?? "").toLowerCase().trim();
              const filename = (f.original_filename || f.display_name || "File") ?? "File";
              const uploaded_at = f.created_at ?? "";
              const fileId = f.id ?? "";
              const storage_path = f.storage_path ?? null;
              let docId: string | null = null;
              if (VALID_DOC_IDS_LOWER.has(c)) {
                docId = c;
                fileCounts[c] = (fileCounts[c] ?? 0) + 1;
              } else if (c in LEGACY_CATEGORY_TO_DOC_ID) {
                docId = LEGACY_CATEGORY_TO_DOC_ID[c];
                fileCounts[docId] = (fileCounts[docId] ?? 0) + 1;
                if (f.id) {
                  legacyFiles.push({ fileId: f.id, category: c });
                  subWithLegacy = subId;
                }
              }
              if (docId && filesByDoc[docId] && fileId) {
                filesByDoc[docId].push({ id: fileId, filename, uploaded_at, storage_path });
              }
            });
            if (list.length > 0) {
              docIdsInPurpose.forEach((docId) => {
                const status = deriveDocStatus(fileCounts[docId] ?? 0, overrideMap[docId] ?? null);
                setDocUploaded(docId, status === "uploaded");
                setDocMissing(docId, status === "not_required");
              });
              setFileCountByDoc({ ...fileCounts });
              setFilesByDocId({ ...Object.fromEntries(Object.entries(filesByDoc).map(([k, v]) => [k, [...v]])) });
              setLegacyFiles([...legacyFiles]);
              setSubmissionIdWithLegacy(subWithLegacy);
              setSyncingUploads(false);
              resolve();
              return;
            }
            void tryNext(idx + 1).then(resolve, reject);
          }).then(undefined, reject);
        });
      }
      if (submissions.length === 0) {
        docIdsInPurpose.forEach((docId) => {
          const status = deriveDocStatus(0, overrideMap[docId] ?? null);
          setDocUploaded(docId, status === "uploaded");
          setDocMissing(docId, status === "not_required");
        });
        setFileCountByDoc({});
        setFilesByDocId({});
        setSyncingUploads(false);
        setLegacyFiles([]);
        setSubmissionIdWithLegacy(null);
        return Promise.resolve();
      }
      return tryNext(0);
    }).catch(() => {
      if (!cancelled) setSyncingUploads(false);
    });
    return () => { cancelled = true; };
  }, [dealId, state.purposeKey, setDocUploaded, setDocMissing, syncTrigger]);

  useEffect(() => {
    if (!dealId) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const onFocus = () => {
      timeoutId = setTimeout(() => setSyncTrigger((t) => t + 1), 300);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [dealId]);

  async function handleViewFile(storagePath: string | null | undefined) {
    if (!storagePath?.trim()) return;
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.storage.from("deal-packs").createSignedUrl(storagePath, 60);
    if (error || !data?.signedUrl) {
      alert("Could not open file.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function handleRemoveFile(fileId: string) {
    if (removingFileId || !fileId) return;
    setRemovingFileId(fileId);
    const supabase = supabaseBrowser();
    const { error } = await supabase
      .from("submission_files")
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq("id", fileId);
    setRemovingFileId(null);
    if (error) {
      alert(`Failed to remove file: ${error.message}`);
      return;
    }
    setSyncTrigger((t) => t + 1);
  }

  async function handleSaveOverride() {
    if (!dealId || !overrideModalDocId || savingOverride) return;
    if (!overrideModalReason.trim()) return;
    setSavingOverride(true);
    const supabase = supabaseBrowser();
    const { error } = await supabase
      .from("deal_doc_states")
      .upsert(
        {
          deal_id: dealId,
          doc_id: overrideModalDocId,
          status: overrideModalStatus,
          reason: overrideModalReason.trim(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "deal_id,doc_id" }
      );
    setSavingOverride(false);
    if (error) {
      alert(`Failed to save override: ${error.message}`);
      return;
    }
    setOverrideModalDocId(null);
    setOverrideModalReason("");
    setSyncTrigger((t) => t + 1);
  }

  async function handleConvertLegacy() {
    if (!submissionIdWithLegacy || legacyFiles.length === 0 || converting) return;
    setConverting(true);
    setConvertError(null);
    const supabase = supabaseBrowser();
    const validDocIds = new Set(DOC_TYPES.map((d) => d.id));
    let hadSkipped = false;
    try {
      for (const { fileId, category } of legacyFiles) {
        const targetDocId = LEGACY_CATEGORY_TO_DOC_ID[category];
        if (!targetDocId || !validDocIds.has(targetDocId)) {
          hadSkipped = true;
          continue;
        }
        const { error } = await supabase
          .from("submission_files")
          .update({ category: targetDocId })
          .eq("id", fileId);
        if (error) {
          hadSkipped = true;
        }
      }
      if (hadSkipped) setConvertError("Some legacy tags couldn't be converted yet.");
      else setLegacyFiles([]);
      setSyncTrigger((t) => t + 1);
    } finally {
      setConverting(false);
    }
  }

  async function handleWizardUpload() {
    const rowDocId = uploadModalDocId;
    if (!dealId || !rowDocId || !uploadFile || uploading) return;
    const category = (WIZARD_DOC_ID_TO_UPLOAD_CATEGORY[rowDocId] ?? rowDocId) as DocTypeId;
    const wizardDocIds = new Set(DOC_TYPES.map((d) => d.id));
    if (!wizardDocIds.has(category)) {
      alert("Invalid document type. Please try again.");
      setUploading(false);
      return;
    }

    setUploading(true);
    const supabase = supabaseBrowser();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("You are not authenticated. Please refresh and try again.");
        setUploading(false);
        return;
      }
      let submissionId: string | null = null;
      const { data: submissions } = await supabase
        .from("submissions")
        .select("id")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (submissions?.[0]?.id) {
        submissionId = submissions[0].id;
      } else {
        const { data: orgMember } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!orgMember?.organization_id) {
          alert("Could not find organization. Please try again.");
          setUploading(false);
          return;
        }
        const { data: newSub, error: createErr } = await supabase
          .from("submissions")
          .insert({
            org_id: orgMember.organization_id,
            created_by: user.id,
            title: "Deal",
            deal_id: dealId,
            status: "draft",
          })
          .select("id")
          .single();
        if (createErr || !newSub?.id) {
          alert("Could not create submission. Please try again.");
          setUploading(false);
          return;
        }
        submissionId = newSub.id;
      }
      if (!submissionId) {
        setUploading(false);
        return;
      }
      if (replaceExisting) {
        await supabase
          .from("submission_files")
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .eq("submission_id", submissionId)
          .eq("category", category)
          .eq("is_deleted", false);
      }
      const storagePath = `${submissionId}/${Date.now()}_${uploadFile.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("deal-packs")
        .upload(storagePath, uploadFile, { upsert: false, contentType: uploadFile.type });
      if (uploadErr) {
        alert("Error uploading file. Please try again.");
        setUploading(false);
        return;
      }
      const { data: insertedFile, error: insertErr } = await supabase
        .from("submission_files")
        .insert({
          submission_id: submissionId,
          storage_path: storagePath,
          original_filename: uploadFile.name,
          display_name: uploadFile.name,
          category,
          mime_type: uploadFile.type,
          size_bytes: uploadFile.size,
        })
        .select("id")
        .single();
      if (insertErr) {
        alert(`Error saving file record: ${insertErr.message || "Please try again."}`);
        setUploading(false);
        return;
      }
      if (insertedFile?.id) {
        try {
          const extractRes = await fetch("/api/submission-files/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId: insertedFile.id }),
            credentials: "include",
          });

          const extractText = await extractRes.text().catch(() => "");
          let extractJson: any = {};
          try {
            extractJson = extractText ? JSON.parse(extractText) : {};
          } catch {
            extractJson = {};
          }

          if (!extractRes.ok || (!extractJson?.ok && !extractJson?.alreadyExtracted)) {
            console.error("[Wizard upload] Extraction failed:", {
              fileId: insertedFile.id,
              status: extractRes.status,
              body: extractText.slice(0, 500),
            });
            alert(extractJson?.error ?? "File uploaded but extraction failed. See console for details.");
            setSyncTrigger((t) => t + 1);
          } else {
            try {
              const classifyRes = await fetch(`/api/submission-files/${insertedFile.id}/classify`, {
                method: "POST",
                credentials: "include",
              });

              const classifyText = await classifyRes.text().catch(() => "");
              let classifyJson: any = {};
              try {
                classifyJson = classifyText ? JSON.parse(classifyText) : {};
              } catch {
                classifyJson = {};
              }

              if (!classifyRes.ok || !classifyJson?.ok) {
                console.error("[Wizard upload] Classification failed:", {
                  fileId: insertedFile.id,
                  status: classifyRes.status,
                  body: classifyText.slice(0, 500),
                });
                alert(classifyJson?.error ?? "File extracted but classification failed. See console for details.");
              }
            } finally {
              setSyncTrigger((t) => t + 1);
            }
          }
        } catch (err) {
          console.error("[Wizard upload] Extract/classify request failed:", err);
          alert("File uploaded but processing failed. See console for details.");
          setSyncTrigger((t) => t + 1);
        }
      } else {
        setSyncTrigger((t) => t + 1);
      }
      setUploadModalDocId(null);
      setUploadFile(null);
      setReplaceExisting(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    } catch (err) {
      console.error("Wizard upload error:", err);
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-8">
      {syncingUploads && (
        <p className="text-sm text-slate-500">Syncing uploads…</p>
      )}
      <h1 className="text-2xl font-bold text-slate-900">Documents</h1>
      <p className="text-slate-600">
        Based on purpose: <strong>{WIZARD_PURPOSE_LABELS[state.purposeKey]}</strong>. Upload or link documents. DealSense accuracy may be limited if required docs are missing.
      </p>

      {missingRequired.length > 0 && (
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-bold text-amber-900 mb-2">Missing required documents</h2>
          <ul className="list-disc list-inside text-sm text-amber-800 mb-2">
            {missingRequired.map((id) => (
              <li key={id}>{getDocLabel(id)}</li>
            ))}
          </ul>
          <p className="text-sm text-amber-800">DealSense accuracy may be limited. You can still proceed to the next step.</p>
        </div>
      )}

      {legacyFiles.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-700 mb-2">
            Some uploaded files use legacy category tags. Converting them will match documents to the wizard rows and mark them as uploaded.
          </p>
          <p className="text-xs text-slate-600 mb-2">
            {legacyFiles.length} file(s):{" "}
            {Array.from(
              new Map(legacyFiles.map((f) => [f.category, LEGACY_CATEGORY_TO_DOC_ID[f.category]])).entries()
            )
              .filter(([, docId]) => docId)
              .map(([cat, docId]) => `${cat} → ${getDocLabel(docId!)}`)
              .join("; ")}
          </p>
          {convertError && <p className="text-sm text-amber-700 mb-2">{convertError}</p>}
          <button
            type="button"
            onClick={handleConvertLegacy}
            disabled={converting}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {converting ? "Converting…" : "Convert legacy tags"}
          </button>
        </div>
      )}

      <div className="space-y-6">
        {docsByTier.map((tier) => {
          const ids = config[tier] as DocTypeId[];
          if (ids.length === 0) return null;
          const statusCounts = { uploaded: 0, pending: 0, missing: 0, not_required: 0 };
          ids.forEach((id) => {
            const s = docStatus(id);
            if (s === "uploaded") statusCounts.uploaded++;
            else if (s === "pending") statusCounts.pending++;
            else if (s === "not_required") statusCounts.not_required++;
            else statusCounts.missing++;
          });
          const counterParts: string[] = [];
          if (statusCounts.uploaded) counterParts.push(`${statusCounts.uploaded} uploaded`);
          if (statusCounts.pending) counterParts.push(`${statusCounts.pending} pending`);
          if (statusCounts.missing) counterParts.push(`${statusCounts.missing} missing`);
          if (statusCounts.not_required) counterParts.push(`${statusCounts.not_required} not required`);
          return (
            <div key={tier}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-slate-700">{TIER_LABELS[tier]}</h2>
                {counterParts.length > 0 && (
                  <span className="text-xs text-slate-500">{counterParts.join(" · ")}</span>
                )}
              </div>
              <ul className="space-y-2">
                {ids.map((id) => {
                  const status = docStatus(id);
                  const count = fileCountByDoc[id] ?? 0;
                  const files = filesByDocId[id] ?? [];
                  const isExpanded = expandedDocIds.has(id);
                  const dotBg =
                    status === "uploaded" ? "bg-green-500" :
                    status === "not_required" ? "bg-slate-400" :
                    status === "pending" ? "bg-amber-500" : "bg-red-400";
                  const toggleExpand = () => setExpandedDocIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return new Set(next);
                  });
                  const hasOverride = !!overrides[id];
                  const overrideReason = overrides[id]?.reason?.trim();
                  const showOverrideReason = isExpanded && (status === "pending" || status === "not_required") && overrideReason;
                  return (
                    <li key={id} className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={toggleExpand}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpand(); } }}
                        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-slate-100/80"
                        aria-expanded={isExpanded}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`shrink-0 p-0.5 text-slate-500 inline-block transition-transform ${isExpanded ? "rotate-90" : ""}`} aria-hidden>▶</span>
                          <span className="text-slate-900 font-medium truncate">{getDocLabel(id)}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <span className={`h-2 w-2 rounded-full ${dotBg}`} title={status} aria-hidden />
                          <span className="text-xs text-slate-600">{count} {count === 1 ? "file" : "files"}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOverrideModalDocId(id);
                              setOverrideModalStatus(overrides[id]?.status ?? "pending");
                              setOverrideModalReason(overrides[id]?.reason ?? "");
                            }}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                          >
                            {hasOverride ? "Edit status" : "Set status"}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setUploadModalDocId(id); }}
                            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Upload
                          </button>
                        </div>
                      </div>
                      {showOverrideReason && (
                        <div className="border-t border-slate-200 bg-amber-50/60 px-4 py-2 pl-8 text-sm text-slate-700">
                          <span className="font-medium text-slate-600">Reason:</span> {overrideReason}
                        </div>
                      )}
                      {isExpanded && files.length > 0 && (
                        <div className="border-t border-slate-200 bg-white/60 px-4 py-2 pl-8" onClick={(e) => e.stopPropagation()}>
                          <ul className="space-y-1 text-sm text-slate-700">
                            {files.map((file) => (
                              <li key={file.id} className="flex items-center justify-between gap-4">
                                <span className="truncate min-w-0">{file.filename}</span>
                                <span className="text-xs text-slate-500 shrink-0">
                                  {file.uploaded_at ? new Date(file.uploaded_at).toLocaleString() : "—"}
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleViewFile(file.storage_path)}
                                    disabled={!file.storage_path?.trim()}
                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    View
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFile(file.id)}
                                    disabled={removingFileId === file.id}
                                    className="text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50"
                                  >
                                    {removingFileId === file.id ? "Removing…" : "Remove"}
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {isExpanded && files.length === 0 && (
                        <div className="border-t border-slate-200 bg-white/60 px-4 py-2 pl-8 text-sm text-slate-500">
                          No files uploaded
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {showTaxSection && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
          <h2 className="text-sm font-bold text-slate-900">Business Tax Position</h2>
          <div className="space-y-2">
            {TAX_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="taxPosition"
                  value={opt.value}
                  checked={state.taxPosition === opt.value}
                  onChange={() => setTaxPosition(opt.value)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-800">{opt.label}</span>
              </label>
            ))}
          </div>
          {state.taxPosition === "arrears_exist" && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Explanation (required)</label>
              <textarea
                value={state.taxExplanation}
                onChange={(e) => setTaxExplanation(e.target.value)}
                placeholder="Describe the arrears situation and any payment plan"
                rows={3}
                className={`w-full rounded-lg border px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:ring-1 ${
                  !state.taxExplanation.trim()
                    ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                    : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                }`}
              />
              {!state.taxExplanation.trim() && (
                <p className="mt-1 text-sm text-red-600">Please provide an explanation for the tax arrears.</p>
              )}
              <p className="mt-1 text-xs text-slate-500">Optional: upload supporting docs via the deal Documents tab.</p>
            </div>
          )}
        </div>
      )}

      {overrideModalDocId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingOverride) {
              setOverrideModalDocId(null);
              setOverrideModalReason("");
            }
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">Override status: {getDocLabel(overrideModalDocId)}</h3>
            <p className="mt-1 text-sm text-slate-600">Set a status override. Reason is required for both options.</p>
            <div className="mt-4 space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="overrideStatus"
                  checked={overrideModalStatus === "pending"}
                  onChange={() => setOverrideModalStatus("pending")}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span className="text-sm">Pending (will upload later)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="overrideStatus"
                  checked={overrideModalStatus === "not_required"}
                  onChange={() => setOverrideModalStatus("not_required")}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span className="text-sm">Not required (N/A for this deal)</span>
              </label>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Reason (required)</label>
              <textarea
                value={overrideModalReason}
                onChange={(e) => setOverrideModalReason(e.target.value)}
                placeholder={overrideModalStatus === "not_required" ? "Explain why this document is not required" : "e.g. Will upload after receiving from client"}
                rows={2}
                className={`w-full rounded-lg border px-4 py-2 text-sm ${
                  !overrideModalReason.trim() ? "border-red-400" : "border-slate-300"
                }`}
              />
              {!overrideModalReason.trim() && (
                <p className="mt-1 text-sm text-red-600">Please provide a reason.</p>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setOverrideModalDocId(null); setOverrideModalReason(""); }}
                disabled={savingOverride}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveOverride}
                disabled={savingOverride || !overrideModalReason.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingOverride ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadModalDocId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !uploading) {
              setUploadModalDocId(null);
              setUploadFile(null);
              setReplaceExisting(false);
              if (uploadInputRef.current) uploadInputRef.current.value = "";
            }
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">Upload: {getDocLabel(uploadModalDocId)}</h3>
            <p className="mt-1 text-sm text-slate-600">Select a file to upload for this document.</p>
            <input
              ref={uploadInputRef}
              type="file"
              className="mt-4 block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            />
            <label className="mt-4 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span className="text-sm text-slate-700">Replace existing files in this category</span>
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setUploadModalDocId(null);
                  setUploadFile(null);
                  setReplaceExisting(false);
                  if (uploadInputRef.current) uploadInputRef.current.value = "";
                }}
                disabled={uploading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleWizardUpload}
                disabled={!uploadFile || uploading}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
