"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWizard } from "@/lib/dealWizard/wizardContext";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function WizardStep4Page() {
  const { state } = useWizard();
  const router = useRouter();
  const dealId = state.dealId;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        .limit(1);

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

      const { data: runRow, error: insertErr } = await supabase
        .from("submission_runs")
        .insert({ submission_id: submissionId, status: "queued" })
        .select("id")
        .single();

      if (insertErr || !runRow?.id) {
        setError(insertErr?.message ?? "Failed to create run.");
        setRunning(false);
        return;
      }

      router.push(`/app/deals/${dealId}/runs/${runRow.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

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
        <p className="text-sm text-slate-500">
          Or <a href={`/app/deals/${dealId}`} className="text-indigo-600 hover:underline">return to the deal</a> and upload more documents first.
        </p>
      </div>
    </div>
  );
}
