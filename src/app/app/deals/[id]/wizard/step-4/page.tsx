"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWizard } from "@/lib/dealWizard/wizardContext";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { PURPOSE_DOC_MATRIX } from "@/lib/dealWizard/docMatrix";
import { getDocLabel } from "@/lib/dealWizard/docMatrix";
import { buildDocCompletenessSnapshot, deriveDocStatus } from "@/lib/dealWizard/docStatus";
import { DOC_TYPES, LEGACY_CATEGORY_TO_DOC_ID } from "@/lib/dealWizard/docMatrix";
import type { DocTypeId } from "@/lib/dealWizard/docMatrix";

const VALID_DOC_IDS_LOWER = new Set(DOC_TYPES.map((d) => d.id.toLowerCase()));

export default function WizardStep4Page() {
  const { state } = useWizard();
  const router = useRouter();
  const dealId = state.dealId;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWarningsModal, setShowWarningsModal] = useState(false);
  const [warningsData, setWarningsData] = useState<{
    fileCountByDoc: Record<string, number>;
    overrides: Record<string, { status: "pending" | "not_required"; reason?: string | null }>;
    snapshot: ReturnType<typeof buildDocCompletenessSnapshot>;
    submissionId: string;
  } | null>(null);

  async function createRunWithSnapshot(submissionId: string, snapshot: ReturnType<typeof buildDocCompletenessSnapshot>) {
    const supabase = supabaseBrowser();
    const { data: runRow, error: insertErr } = await supabase
      .from("submission_runs")
      .insert({
        submission_id: submissionId,
        status: "queued",
        doc_completeness_snapshot: snapshot,
      })
      .select("id")
      .single();
    if (insertErr || !runRow?.id) throw new Error(insertErr?.message ?? "Failed to create run.");
    router.push(`/app/deals/${dealId}/runs/${runRow.id}`);
  }

  async function handleRunDealSense() {
    if (!dealId) return;
    setRunning(true);
    setError(null);
    setShowWarningsModal(false);
    setWarningsData(null);
    const supabase = supabaseBrowser();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Not authenticated.");
        setRunning(false);
        return;
      }

      const { data: submissions } = await supabase
        .from("submissions")
        .select("id")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(5);

      let submissionId = submissions?.[0]?.id;

      if (!submissionId) {
        const { data: orgMember } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!orgMember?.organization_id) {
          setError("No organization found.");
          setRunning(false);
          return;
        }
        const { data: newSub, error: createErr } = await supabase
          .from("submissions")
          .insert({
            org_id: orgMember.organization_id,
            created_by: user.id,
            title: state.dealName || "New Deal",
            deal_id: dealId,
            status: "draft",
          })
          .select("id")
          .single();
        if (createErr || !newSub?.id) {
          setError(createErr?.message ?? "Failed to create submission.");
          setRunning(false);
          return;
        }
        submissionId = newSub.id;
      }

      const config = PURPOSE_DOC_MATRIX[state.purposeKey];
      const docIdsInPurpose = [...config.required, ...config.recommended, ...config.supporting];
      const subList = (submissions?.length ? (submissions as { id: string }[]) : [{ id: submissionId }]);
      const overrideRows = (await supabase.from("deal_doc_states").select("doc_id, status, reason").eq("deal_id", dealId)).data ?? [];
      const overrides: Record<string, { status: "pending" | "not_required"; reason?: string | null }> = {};
      overrideRows.forEach((r: { doc_id: string; status: string; reason?: string | null }) => {
        if (r.status === "pending" || r.status === "not_required")
          overrides[r.doc_id] = { status: r.status as "pending" | "not_required", reason: r.reason };
      });
      const fileCountByDoc: Record<string, number> = {};
      docIdsInPurpose.forEach((id) => (fileCountByDoc[id] = 0));
      for (let i = 0; i < subList.length; i++) {
        const { data: files } = await supabase
          .from("submission_files")
          .select("category")
          .eq("submission_id", subList[i].id)
          .limit(500);
        const list = (files ?? []) as { category?: string | null }[];
        if (list.length > 0) {
          list.forEach((f) => {
            const c = (f.category ?? "").toLowerCase().trim();
            if (VALID_DOC_IDS_LOWER.has(c)) fileCountByDoc[c] = (fileCountByDoc[c] ?? 0) + 1;
            else if (c in LEGACY_CATEGORY_TO_DOC_ID) {
              const docId = LEGACY_CATEGORY_TO_DOC_ID[c];
              fileCountByDoc[docId] = (fileCountByDoc[docId] ?? 0) + 1;
            }
          });
          break;
        }
      }

      const snapshot = buildDocCompletenessSnapshot(config, fileCountByDoc, overrides);
      const requiredIds = config.required;
      const requiredMissingOrPending = requiredIds.filter((id) => {
        const s = deriveDocStatus(fileCountByDoc[id] ?? 0, overrides[id] ?? null);
        return s === "missing" || s === "pending";
      });

      if (requiredMissingOrPending.length > 0) {
        setWarningsData({ fileCountByDoc, overrides, snapshot, submissionId });
        setShowWarningsModal(true);
        setRunning(false);
        return;
      }

      await createRunWithSnapshot(submissionId, snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  async function handleRunAnyway() {
    if (!warningsData) return;
    setRunning(true);
    setError(null);
    try {
      await createRunWithSnapshot(warningsData.submissionId, warningsData.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  function handleBackToDocuments() {
    setShowWarningsModal(false);
    setWarningsData(null);
    router.push(`/app/deals/${dealId}/wizard/step-2`);
  }

  const config = PURPOSE_DOC_MATRIX[state.purposeKey];
  const requiredIssues = warningsData
    ? config.required.filter((id) => {
        const s = deriveDocStatus(warningsData.fileCountByDoc[id] ?? 0, warningsData.overrides[id] ?? null);
        return s === "missing" || s === "pending";
      })
    : [];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">Run DealSense</h1>
      <p className="text-slate-600">Run the analysis on your deal. You will be taken to the results page when the run completes.</p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {showWarningsModal && warningsData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => e.target === e.currentTarget && !running && handleBackToDocuments()}
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-amber-900">Run with warnings</h3>
            <p className="mt-1 text-sm text-slate-600">Some required documents are missing or pending. DealSense accuracy may be limited.</p>
            <ul className="mt-4 space-y-2">
              {requiredIssues.map((id) => {
                const s = deriveDocStatus(warningsData.fileCountByDoc[id] ?? 0, warningsData.overrides[id] ?? null);
                const reason = warningsData.overrides[id]?.reason?.trim();
                return (
                  <li key={id} className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm">
                    <span className="font-medium text-slate-900">{getDocLabel(id as DocTypeId)}</span>
                    <span className="text-amber-800">{s === "pending" ? "Pending" : "Missing"}</span>
                    {s === "pending" && reason && <span className="text-slate-600 italic">— {reason}</span>}
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleBackToDocuments}
                disabled={running}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Back to Documents
              </button>
              <button
                type="button"
                onClick={handleRunAnyway}
                disabled={running}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {running ? "Running…" : "Run anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-6 py-8">
        <button
          type="button"
          onClick={handleRunDealSense}
          disabled={running}
          className="rounded-xl bg-indigo-600 px-8 py-4 text-lg font-semibold text-white shadow-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? "Running DealSense…" : "Run DealSense"}
        </button>
        <p className="text-sm text-slate-500">
          Or <a href={`/app/deals/${dealId}`} className="text-indigo-600 hover:underline">return to the deal</a> and upload more documents first.
        </p>
      </div>
    </div>
  );
}
