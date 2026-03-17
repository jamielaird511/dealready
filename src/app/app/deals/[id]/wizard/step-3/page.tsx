"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWizard } from "@/lib/dealWizard/wizardContext";
import { PURPOSE_DOC_MATRIX, WIZARD_PURPOSE_LABELS } from "@/lib/dealWizard/docMatrix";
import {
  REVIEW_DOC_TYPES,
  categoryToReviewTypeId,
  reviewTypeIdToCategory,
  confidenceToLevel,
  predictDocTypeFromFile,
  type ReviewDocTypeId,
  type ConfidenceLevel,
} from "@/lib/dealWizard/reviewDocTypes";
import type { TaxPositionOption } from "@/lib/dealWizard/types";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const TAX_LABELS: Record<TaxPositionOption, string> = {
  confirmed_current: "Confirmed current (no arrears)",
  arrears_exist: "Arrears exist",
  not_confirmed: "Not confirmed",
};

type FileRow = {
  id: string;
  filename: string;
  category: string | null;
  doc_type: string | null;
  doc_type_confidence: number | null;
  storage_path: string | null;
};

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const style =
    level === "high"
      ? "bg-emerald-100 text-emerald-800"
      : level === "medium"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-600";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${style}`}>
      {level}
    </span>
  );
}

export default function WizardStep3Page() {
  const routeParams = useParams();
  const dealId = typeof routeParams?.id === "string" ? routeParams.id : Array.isArray(routeParams?.id) ? routeParams.id[0] : "";
  const { state } = useWizard();
  const config = PURPOSE_DOC_MATRIX[state.purposeKey];

  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!dealId) return;
    let cancelled = false;
    setLoading(true);
    const supabase = supabaseBrowser();
    void (async () => {
      try {
        const { data: sub } = await supabase
          .from("submissions")
          .select("id")
          .eq("deal_id", dealId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled || !sub?.id) {
          if (!cancelled) setFiles([]);
          return;
        }
        const { data: filesData } = await supabase
          .from("submission_files")
          .select("id, original_filename, display_name, category, doc_type, doc_type_confidence, storage_path")
          .eq("submission_id", sub.id)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false });
        if (cancelled) return;
        if (filesData) {
          const rows = (filesData as {
            id?: string;
            original_filename?: string | null;
            display_name?: string | null;
            category?: string | null;
            doc_type?: string | null;
            doc_type_confidence?: number | null;
            storage_path?: string | null;
          }[]).map((f) => ({
            id: f.id ?? "",
            filename: (f.original_filename || f.display_name || "File") ?? "File",
            category: f.category ?? null,
            doc_type: f.doc_type ?? null,
            doc_type_confidence: f.doc_type_confidence ?? null,
            storage_path: f.storage_path ?? null,
          }));
          setFiles(rows);
        }
      } catch {
        // ignore; loading cleared in finally
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  async function handleTypeChange(fileId: string, reviewTypeId: ReviewDocTypeId) {
    if (updatingId) return;
    setUpdatingId(fileId);
    const category = reviewTypeIdToCategory(reviewTypeId);
    const supabase = supabaseBrowser();
    const { error } = await supabase
      .from("submission_files")
      .update({ category })
      .eq("id", fileId);
    setUpdatingId(null);
    if (error) {
      return;
    }
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, category } : f))
    );
  }

  async function handleRemove(fileId: string) {
    if (removingId) return;
    setRemovingId(fileId);
    const supabase = supabaseBrowser();
    await supabase
      .from("submission_files")
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq("id", fileId);
    setRemovingId(null);
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">Review</h1>
      <p className="text-slate-600">
        Confirm document types for each file. DealReady suggests; you confirm or change.
      </p>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900 mb-2">Basics</h2>
        <dl className="grid grid-cols-1 gap-2 text-sm">
          <div>
            <dt className="text-slate-500">Deal name</dt>
            <dd className="font-medium text-slate-900">{state.dealName || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Purpose</dt>
            <dd className="font-medium text-slate-900">{WIZARD_PURPOSE_LABELS[state.purposeKey]}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Borrowers</dt>
            <dd className="font-medium text-slate-900">{state.borrowerNames.length ? state.borrowerNames.join(", ") : "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Guarantors</dt>
            <dd className="font-medium text-slate-900">{state.guarantorNames.length ? state.guarantorNames.join(", ") : "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900 mb-1">Document types</h2>
        <p className="text-sm text-slate-600 mb-4">
          Review or change the suggested type for each file. You can leave any file as Other.
        </p>
        {loading ? (
          <p className="text-sm text-slate-500">Loading files…</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-slate-500">No files in this pack. Add documents in the previous step.</p>
        ) : (
          <ul className="space-y-3">
            {files.map((file) => {
              const predicted = predictDocTypeFromFile(
                file.filename,
                file.category,
                file.doc_type,
                null
              );
              const savedTypeId = categoryToReviewTypeId(file.category, file.doc_type);
              const confidenceLevel = file.doc_type_confidence != null
                ? confidenceToLevel(file.doc_type_confidence)
                : predicted.confidence;
              const suggestedLabel = savedTypeId === "other" && predicted.typeId !== "other"
                ? REVIEW_DOC_TYPES.find((t) => t.id === predicted.typeId)?.label
                : null;
              return (
                <li
                  key={file.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{file.filename}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <ConfidenceBadge level={confidenceLevel} />
                      {suggestedLabel && (
                        <span className="text-xs text-slate-500">Suggested: {suggestedLabel}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={savedTypeId}
                      onChange={(e) => handleTypeChange(file.id, e.target.value as ReviewDocTypeId)}
                      disabled={updatingId === file.id}
                      className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                    >
                      {REVIEW_DOC_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemove(file.id)}
                      disabled={removingId === file.id}
                      className="text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      {removingId === file.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {config.taxPositionApplicable && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-2">Tax position</h2>
          <p className="text-sm text-slate-600">
            {state.taxPosition ? TAX_LABELS[state.taxPosition] : "Not set"}
            {state.taxPosition === "arrears_exist" && state.taxExplanation && (
              <span className="block mt-1 text-slate-500">Explanation provided.</span>
            )}
          </p>
        </section>
      )}

      <section className="rounded-lg border-2 border-indigo-200 bg-indigo-50 p-4">
        <h2 className="text-sm font-bold text-indigo-900 mb-1">Next step</h2>
        <p className="text-sm text-indigo-800">
          Run DealSense to analyse your deal pack and get readiness feedback.
        </p>
      </section>
    </div>
  );
}
