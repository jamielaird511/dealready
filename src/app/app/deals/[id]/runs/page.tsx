"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type RunRow = { id: string; status: string; created_at: string; submission_id?: string };

export default function DealRunsListPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dealId) {
      setLoading(false);
      return;
    }
    async function loadRuns() {
      const supabase = supabaseBrowser();
      const { data: submissions, error: subErr } = await supabase
        .from("submissions")
        .select("id")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (subErr || !submissions?.length) {
        setRuns([]);
        setLoading(false);
        return;
      }
      const submissionIds = submissions.map((s) => s.id);
      const { data: runsData, error: runsErr } = await supabase
        .from("submission_runs")
        .select("id, status, created_at, submission_id")
        .in("submission_id", submissionIds)
        .order("created_at", { ascending: false })
        .limit(10);
      if (runsErr) {
        setError(runsErr.message);
        setLoading(false);
        return;
      }
      setRuns((runsData as RunRow[]) || []);
      setLoading(false);
    }
    loadRuns();
  }, [dealId]);

  if (!dealId) {
    return (
      <div className="space-y-8 p-6">
        <p className="text-slate-600">Missing deal.</p>
        <Link href="/app/deals" className="text-indigo-600 hover:underline">Back to Deals</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-8 p-6">
        <p className="text-slate-600">Loading runs...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.push(`/app/deals/${dealId}`)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ← Back to Deal
        </button>
        <h1 className="text-2xl font-bold text-slate-900">DealSense Runs</h1>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}
      {runs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-slate-600">No runs yet.</p>
          <p className="mt-2 text-sm text-slate-500">
            Use the wizard to run DealSense, or run from the deal page.
          </p>
          <Link
            href={`/app/deals/${dealId}/wizard/step-4`}
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Open Wizard
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/app/deals/${dealId}/runs/${run.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">
                  {new Date(run.created_at).toLocaleString()}
                </span>
                <span className="rounded px-2 py-0.5 text-xs font-semibold capitalize text-slate-700 bg-slate-100">
                  {run.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
