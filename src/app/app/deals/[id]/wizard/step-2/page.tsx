"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useWizard } from "@/lib/dealWizard/wizardContext";
import { DOC_TYPES, PURPOSE_DOC_MATRIX, WIZARD_PURPOSE_LABELS, getDocLabel, WIZARD_DOC_ID_TO_UPLOAD_CATEGORY } from "@/lib/dealWizard/docMatrix";
import type { DocTypeId } from "@/lib/dealWizard/docMatrix";
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
  const { state, setDocUploaded, setTaxPosition, setTaxExplanation } = useWizard();
  const config = PURPOSE_DOC_MATRIX[state.purposeKey];
  const docsByTier: DocTier[] = ["required", "recommended", "supporting"];

  const requiredIds = config.required;
  const missingRequired = requiredIds.filter((id) => !state.docUploaded[id]);
  const showTaxSection = config.taxPositionApplicable;

  const dealDocumentsUrl = `/app/deals/${dealId}?tab=documents&from=wizard&returnTo=step-2`;

  const docUploadedRef = useRef(state.docUploaded);
  docUploadedRef.current = state.docUploaded;
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

  useEffect(() => {
    if (!dealId) return;
    let cancelled = false;
    const config = PURPOSE_DOC_MATRIX[state.purposeKey];
    const docIdsInPurpose = [...config.required, ...config.recommended, ...config.supporting];
    setSyncingUploads(true);
    const supabase = supabaseBrowser();
    console.debug("[step2 sync] dealId", dealId);
    supabase
      .from("submissions")
      .select("id")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(5)
      .then(({ data: submissions }) => {
        if (cancelled) return;
        const list = (submissions || []) as { id: string }[];
        console.debug("[step2 sync] submissions picked", list.length, list.map((s) => s.id));
        if (list.length === 0) {
          setSyncingUploads(false);
          setLegacyFiles([]);
          setSubmissionIdWithLegacy(null);
          return;
        }
        let index = 0;
        function tryNext(): Promise<void> {
          if (cancelled) return Promise.resolve();
          if (index >= list.length) {
            setSyncingUploads(false);
            setLegacyFiles([]);
            setSubmissionIdWithLegacy(null);
            return Promise.resolve();
          }
          const submissionId = list[index].id;
          index += 1;
          return Promise.resolve(
            supabase
              .from("submission_files")
              .select("id, category")
              .eq("submission_id", submissionId)
              .limit(500)
              .then(({ data: files }) => {
                if (cancelled) return;
                if (files && files.length > 0) {
                  console.debug("[step2 sync] submissionId with files", submissionId);
                  const categories = new Set<string>();
                  files.forEach((f: { category?: string | null }) => {
                    const c = (f.category ?? "").toLowerCase().trim();
                    if (c) categories.add(c);
                  });
                  console.debug("[step2 sync] categories found", Array.from(categories));
                  docIdsInPurpose.forEach((docId) => {
                    if (categories.has(docId)) setDocUploaded(docId, true);
                  });
                  const legacy = (files as { id?: string; category?: string | null }[])
                    .filter((f) => {
                      if (!f.id || !f.category) return false;
                      const catLower = (f.category as string).toLowerCase().trim();
                      if (VALID_DOC_IDS_LOWER.has(catLower)) return false;
                      return catLower in LEGACY_CATEGORY_TO_DOC_ID;
                    })
                    .map((f) => ({ fileId: f.id!, category: (f.category as string).toLowerCase().trim() }));
                  setLegacyFiles(legacy);
                  setSubmissionIdWithLegacy(submissionId);
                  setSyncingUploads(false);
                } else {
                  return tryNext();
                }
              })
          ).catch(() => {
            if (!cancelled) setSyncingUploads(false);
          });
        }
        return tryNext();
      })
      .then(undefined, () => {
        if (!cancelled) setSyncingUploads(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dealId, state.purposeKey, setDocUploaded, syncTrigger]);

  useEffect(() => {
    if (!dealId) return;
    const config = PURPOSE_DOC_MATRIX[state.purposeKey];
    const docIdsInPurpose = [...config.required, ...config.recommended, ...config.supporting];
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const onFocus = () => {
      timeoutId = setTimeout(() => {
        setSyncingUploads(true);
        const supabase = supabaseBrowser();
        console.debug("[step2 sync focus] dealId", dealId);
        supabase
          .from("submissions")
          .select("id")
          .eq("deal_id", dealId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(5)
          .then(({ data: submissions }) => {
            const list = (submissions || []) as { id: string }[];
            console.debug("[step2 sync focus] submissions picked", list.length, list.map((s) => s.id));
            if (list.length === 0) {
              setSyncingUploads(false);
              return;
            }
            let index = 0;
            function tryNext(): Promise<void> {
              if (index >= list.length) {
                setSyncingUploads(false);
                return Promise.resolve();
              }
              const submissionId = list[index].id;
              index += 1;
              return Promise.resolve(
                supabase
                  .from("submission_files")
                  .select("category")
                  .eq("submission_id", submissionId)
                  .limit(500)
                  .then(({ data: files }) => {
                    if (files && files.length > 0) {
                      console.debug("[step2 sync focus] submissionId with files", submissionId);
                      const categories = new Set<string>();
                      files.forEach((f: { category?: string | null }) => {
                        const c = (f.category ?? "").toLowerCase().trim();
                        if (c) categories.add(c);
                      });
                      console.debug("[step2 sync focus] categories found", Array.from(categories));
                      docIdsInPurpose.forEach((docId) => {
                        if (categories.has(docId)) setDocUploaded(docId, true);
                      });
                      setSyncingUploads(false);
                    } else {
                      return tryNext();
                    }
                  })
              ).catch(() => setSyncingUploads(false));
            }
            return tryNext();
          })
          .then(undefined, () => setSyncingUploads(false));
      }, 300);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [dealId, state.purposeKey, setDocUploaded]);

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
      const storagePath = `${submissionId}/${Date.now()}_${uploadFile.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("deal-packs")
        .upload(storagePath, uploadFile, { upsert: false, contentType: uploadFile.type });
      if (uploadErr) {
        alert("Error uploading file. Please try again.");
        setUploading(false);
        return;
      }
      const { error: insertErr } = await supabase
        .from("submission_files")
        .insert({
          submission_id: submissionId,
          storage_path: storagePath,
          original_filename: uploadFile.name,
          display_name: uploadFile.name,
          category,
          mime_type: uploadFile.type,
          size_bytes: uploadFile.size,
        });
      if (insertErr) {
        alert(`Error saving file record: ${insertErr.message || "Please try again."}`);
        setUploading(false);
        return;
      }
      setDocUploaded(rowDocId, true);
      setUploadModalDocId(null);
      setUploadFile(null);
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
          return (
            <div key={tier}>
              <h2 className="text-sm font-bold text-slate-700 mb-2">{TIER_LABELS[tier]}</h2>
              <ul className="space-y-2">
                {ids.map((id) => {
                  const uploaded = state.docUploaded[id];
                  return (
                    <li key={id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2">
                      <span className="text-slate-900 font-medium">{getDocLabel(id)}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDocUploaded(id, !uploaded)}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                          suppressHydrationWarning
                        >
                          {uploaded ? "Mark missing" : "Mark uploaded"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setUploadModalDocId(id)}
                          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          suppressHydrationWarning
                        >
                          Upload
                        </button>
                      </div>
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

      {uploadModalDocId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !uploading) {
              setUploadModalDocId(null);
              setUploadFile(null);
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
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setUploadModalDocId(null);
                  setUploadFile(null);
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
