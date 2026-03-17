"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWizard } from "@/lib/dealWizard/wizardContext";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { PURPOSE_DOC_MATRIX } from "@/lib/dealWizard/docMatrix";
import { buildDocCompletenessSnapshot } from "@/lib/dealWizard/docStatus";
import { DOC_TYPES, LEGACY_CATEGORY_TO_DOC_ID } from "@/lib/dealWizard/docMatrix";

const VALID_DOC_IDS_LOWER = new Set(DOC_TYPES.map((d) => d.id.toLowerCase()));

export default function WizardStep4Page() {
  const { state } = useWizard();
  const router = useRouter();
  const dealId = state.dealId;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await createRunWithSnapshot(submissionId, snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  const config = PURPOSE_DOC_MATRIX[state.purposeKey];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">Run DealSense</h1>
      <p className="text-slate-600">Run the analysis on your deal. You will be taken to the results page when the run completes.</p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
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
        <p className="text-sm text-slate-500 text-center max-w-xl">
          DealSense will assess whatever is currently in the pack. You can upload more documents first, but the assessment can still run on an incomplete or early-stage deal and will call out any gaps it sees.
        </p>
      </div>
    </div>
  );
}
