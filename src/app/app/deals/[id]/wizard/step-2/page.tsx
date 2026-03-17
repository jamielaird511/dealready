"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useWizard } from "@/lib/dealWizard/wizardContext";
import { PURPOSE_DOC_MATRIX } from "@/lib/dealWizard/docMatrix";
import type { TaxPositionOption } from "@/lib/dealWizard/types";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const TAX_OPTIONS: { value: TaxPositionOption; label: string }[] = [
  { value: "confirmed_current", label: "Confirmed current (no arrears)" },
  { value: "arrears_exist", label: "Arrears exist (explanation required)" },
  { value: "not_confirmed", label: "Not confirmed" },
];

const GENERIC_CATEGORY = "other";

type FileRow = {
  id: string;
  filename: string;
  size_bytes: number | null;
  storage_path: string | null;
  uploaded_at: string;
};

function formatFileSize(bytes: number | null): string {
  if (bytes == null || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function WizardStep2Page() {
  const routeParams = useParams();
  const dealId = typeof routeParams?.id === "string" ? routeParams.id : Array.isArray(routeParams?.id) ? routeParams.id[0] : "";
  const { state, setTaxPosition, setTaxExplanation } = useWizard();

  const [fileList, setFileList] = useState<FileRow[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadIndex, setUploadIndex] = useState(0);
  const [uploadCurrentName, setUploadCurrentName] = useState<string | null>(null);
  const [lastUploadSummary, setLastUploadSummary] = useState<string | null>(null);
  const [removingFileId, setRemovingFileId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [syncTrigger, setSyncTrigger] = useState(0);

  useEffect(() => {
    if (!dealId) return;
    let cancelled = false;
    setSyncing(true);
    const supabase = supabaseBrowser();
    supabase
      .from("submissions")
      .select("id")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: sub }) => {
        if (cancelled || !sub?.id) {
          if (!cancelled) {
            setFileList([]);
            setSyncing(false);
          }
          return;
        }
        return supabase
          .from("submission_files")
          .select("id, original_filename, display_name, size_bytes, storage_path, created_at")
          .eq("submission_id", sub.id)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false });
      })
      .then((res) => {
        if (cancelled || !res?.data) {
          if (!cancelled) setSyncing(false);
          return;
        }
        const rows = (res.data as { id?: string; original_filename?: string | null; display_name?: string | null; size_bytes?: number | null; storage_path?: string | null; created_at?: string | null }[]).map(
          (f) => ({
            id: f.id ?? "",
            filename: (f.original_filename || f.display_name || "File") ?? "File",
            size_bytes: f.size_bytes ?? null,
            storage_path: f.storage_path ?? null,
            uploaded_at: f.created_at ?? "",
          })
        );
        setFileList(rows);
        setSyncing(false);
      })
      .catch(() => {
        if (!cancelled) setSyncing(false);
      });
    return () => { cancelled = true; };
  }, [dealId, syncTrigger]);

  async function getOrCreateSubmissionId(): Promise<string | null> {
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: submissions } = await supabase
      .from("submissions")
      .select("id")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (submissions?.[0]?.id) return submissions[0].id;
    const { data: orgMember } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!orgMember?.organization_id) return null;
    const { data: newSub, error } = await supabase
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
    if (error || !newSub?.id) return null;
    return newSub.id;
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!dealId || uploading || !files?.length) return;
    const submissionId = await getOrCreateSubmissionId();
    if (!submissionId) {
      alert("Could not create or find submission. Please try again.");
      return;
    }
    setUploading(true);
    setLastUploadSummary(null);
    const supabase = supabaseBrowser();
    const fileArray = Array.from(files);
    setUploadTotal(fileArray.length);
    setUploadIndex(0);
    setUploadCurrentName(null);
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setUploadIndex(i + 1);
      setUploadCurrentName(file.name);
      const storagePath = `${submissionId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("deal-packs")
        .upload(storagePath, file, { upsert: false, contentType: file.type });
      if (uploadErr) {
        alert(`Error uploading ${file.name}. Please try again.`);
        continue;
      }
      const { data: inserted, error: insertErr } = await supabase
        .from("submission_files")
        .insert({
          submission_id: submissionId,
          storage_path: storagePath,
          original_filename: file.name,
          display_name: file.name,
          category: GENERIC_CATEGORY,
          mime_type: file.type,
          size_bytes: file.size,
        })
        .select("id")
        .single();
      if (insertErr) {
        alert(`Error saving record for ${file.name}.`);
        continue;
      }
      if (inserted?.id) {
        try {
          await fetch("/api/submission-files/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId: inserted.id }),
            credentials: "include",
          });
        } catch {
          // non-blocking
        }
      }
    }
    setUploading(false);
    setUploadCurrentName(null);
    setUploadTotal(0);
    setUploadIndex(0);
    setLastUploadSummary("Any successful uploads are now ready for review in the next step.");
    setSyncTrigger((t) => t + 1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const files = e.dataTransfer?.files;
    if (files?.length) uploadFiles(files);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(true);
  }

  function onDragLeave() {
    setDragActive(false);
  }

  async function handleRemoveFile(fileId: string) {
    if (removingFileId || !fileId) return;
    setRemovingFileId(fileId);
    const supabase = supabaseBrowser();
    await supabase
      .from("submission_files")
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq("id", fileId);
    setRemovingFileId(null);
    setSyncTrigger((t) => t + 1);
  }

  async function handleViewFile(storagePath: string | null) {
    if (!storagePath?.trim()) return;
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.storage.from("deal-packs").createSignedUrl(storagePath, 60);
    if (error || !data?.signedUrl) {
      alert("Could not open file.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const config = PURPOSE_DOC_MATRIX[state.purposeKey];
  const showTaxSection = config.taxPositionApplicable;

  return (
    <div className="space-y-8">
      {syncing && <p className="text-sm text-slate-500">Syncing…</p>}

      <h1 className="text-2xl font-bold text-slate-900">Documents</h1>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Upload deal pack</h2>
        <p className="text-sm text-slate-600">
          Upload whatever you have for this deal—financials, application notes, agreements, or supporting docs. You can add more later; DealSense will review the pack as-is.
        </p>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            dragActive ? "border-indigo-400 bg-indigo-50/50" : "border-slate-300 bg-slate-50/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files?.length) uploadFiles(files);
            }}
          />
          <p className="text-sm text-slate-600 mb-3">
            Drag and drop files here, or{" "}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              choose files
            </button>
          </p>
          {uploading && (
            <div className="mt-2 text-sm text-slate-600">
              <p className="font-medium">
                Uploading {uploadIndex} of {uploadTotal} file{uploadTotal === 1 ? "" : "s"}…
              </p>
              {uploadCurrentName && <p className="text-xs text-slate-500">Currently uploading: {uploadCurrentName}</p>}
              <p className="text-xs text-slate-500 mt-1">Files are being uploaded and processed. You can continue working while this completes.</p>
            </div>
          )}
        </div>

        {!uploading && lastUploadSummary && (
          <p className="text-xs text-emerald-700 mt-1">{lastUploadSummary}</p>
        )}

        {fileList.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <h3 className="text-sm font-semibold text-slate-800 px-4 py-2 border-b border-slate-200 bg-slate-50">
              Uploaded files ({fileList.length})
            </h3>
            <ul className="divide-y divide-slate-200">
              {fileList.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-slate-900 truncate block">{file.filename}</span>
                    <span className="text-xs text-slate-500">{formatFileSize(file.size_bytes)}</span>
                  </div>
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
      </section>

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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
