"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type DealRow = { id: string; name?: string; status?: string; created_at?: string; updated_at?: string };
type LatestRunRow = { id: string; created_at: string; assessed_at?: string | null };
type Readiness = "not_ready" | "minor_issues" | "ready" | "no_run";
type DealSenseRow = {
  latestSubmissionId: string | null;
  latestRun: LatestRunRow | null;
  criticalCount: number;
  warningCount: number;
  activeCount: number;
  readiness: Readiness;
  loading: boolean;
  error: string | null;
};

const initialDealSense: DealSenseRow = {
  latestSubmissionId: null,
  latestRun: null,
  criticalCount: 0,
  warningCount: 0,
  activeCount: 0,
  readiness: "no_run",
  loading: false,
  error: null,
};

export default function DealsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dealSenseData, setDealSenseData] = useState<Record<string, DealSenseRow>>({});

  async function loadDealSenseData(dealId: string) {
    const supabase = supabaseBrowser();
    setDealSenseData((prev) => ({
      ...prev,
      [dealId]: { ...initialDealSense, loading: true },
    }));

    try {
      const { data: submissions, error: subError } = await supabase
        .from("submissions")
        .select("id")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (subError || !submissions || submissions.length === 0) {
        setDealSenseData((prev) => ({
          ...prev,
          [dealId]: { ...initialDealSense, loading: false },
        }));
        return;
      }

      const submissionId = submissions[0].id;

      const { data: runs, error: runsError } = await supabase
        .from("submission_runs")
        .select("*")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (runsError || !runs || runs.length === 0) {
        setDealSenseData((prev) => ({
          ...prev,
          [dealId]: { ...initialDealSense, latestSubmissionId: submissionId, loading: false },
        }));
        return;
      }

      const latestRun = runs[0] as LatestRunRow;

      const { data: findings, error: findingsError } = await supabase
        .from("submission_run_findings")
        .select("severity, status, workflow_state")
        .eq("run_id", latestRun.id);

      if (findingsError) {
        console.error("Error loading findings for deal:", dealId, findingsError);
        setDealSenseData((prev) => ({
          ...prev,
          [dealId]: { ...initialDealSense, latestSubmissionId: submissionId, latestRun, loading: false, error: "Failed to load findings" },
        }));
        return;
      }

      const activeFindings = (findings || []).filter((f: { status?: string; workflow_state?: string }) => {
        const status = f.status ?? "";
        const state = f.workflow_state ?? "open";
        return status === "new" || state === "open" || state === "acknowledged";
      });
      const criticalCount = activeFindings.filter((f: { severity?: string }) => f.severity === "critical").length;
      const warningCount = activeFindings.filter((f: { severity?: string }) => f.severity === "warning").length;
      const activeCount = activeFindings.length;
      const readiness: Readiness =
        criticalCount > 0 ? "not_ready" : warningCount > 0 ? "minor_issues" : "ready";

      setDealSenseData((prev) => ({
        ...prev,
        [dealId]: {
          latestSubmissionId: submissionId,
          latestRun,
          criticalCount,
          warningCount,
          activeCount,
          readiness,
          loading: false,
          error: null,
        },
      }));
    } catch (err) {
      console.error("Error loading DealSense data for deal:", dealId, err);
      setDealSenseData((prev) => ({
        ...prev,
        [dealId]: { ...initialDealSense, loading: false, error: "Error loading DealSense data" },
      }));
    }
  }

  useEffect(() => {
    async function loadDeals() {
      const supabase = supabaseBrowser();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError("Not authenticated. Please sign in.");
        setLoading(false);
        return;
      }
      const { data, error: fetchError } = await supabase
        .from("deals")
        .select("*")
        .eq("broker_id", user.id)
        .order("updated_at", { ascending: false });
      if (fetchError) {
        console.error("Error loading deals:", fetchError);
        setError(fetchError.message);
        setLoading(false);
        return;
      }
      setDeals(data || []);
      setLoading(false);
      if (data && data.length > 0) {
        data.forEach((deal) => loadDealSenseData(deal.id));
      }
    }
    loadDeals();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-white px-6 py-12">
        <div className="max-w-6xl mx-auto">
          <p>Loading deals...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <p className="text-red-600">Error: {error}</p>
          <Link
            href="/app"
            className="mt-4 inline-block text-blue-600 hover:underline"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Deals</h1>
          <p className="text-base text-gray-600">
            View and manage your deals.
          </p>
        </div>

        {deals.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
            <p className="text-gray-600 mb-4">No deals yet.</p>
            <Link
              href="/app"
              className="inline-flex items-center justify-center rounded-none bg-emerald-500 px-6 py-2 text-sm font-semibold text-white transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg"
            >
              Create Your First Deal
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b-2 border-slate-200">
                <tr>
                  <th className="px-6 py-2.5 text-left text-sm font-semibold text-gray-900">
                    Deal Name
                  </th>
                  <th className="px-6 py-2.5 text-left text-sm font-semibold text-gray-900">
                    Status
                  </th>
                  <th className="px-6 py-2.5 text-left text-sm font-semibold text-gray-900">
                    Created
                  </th>
                  <th className="px-6 py-2.5 text-left text-sm font-semibold text-gray-900">
                    Updated
                  </th>
                  <th className="px-6 py-2.5 text-left text-sm font-semibold text-gray-900">
                    DealSense
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {(() => {
                  const readinessRank = (r: Readiness) => ({ not_ready: 0, minor_issues: 1, ready: 2, no_run: 3 }[r] ?? 3);
                  const sortedDeals = [...deals].sort((a, b) => {
                    const dsA = dealSenseData[a.id];
                    const dsB = dealSenseData[b.id];
                    const rankA = dsA ? readinessRank(dsA.readiness) : 3;
                    const rankB = dsB ? readinessRank(dsB.readiness) : 3;
                    if (rankA !== rankB) return rankA - rankB;
                    const timeA = dsA?.latestRun ? new Date(dsA.latestRun.assessed_at ?? dsA.latestRun.created_at).getTime() : 0;
                    const timeB = dsB?.latestRun ? new Date(dsB.latestRun.assessed_at ?? dsB.latestRun.created_at).getTime() : 0;
                    return timeB - timeA;
                  });
                  return sortedDeals.map((deal) => (
                  <tr
                    key={deal.id}
                    onClick={() => router.push(`/app/deals/${deal.id}`)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">
                      {deal.name || "Unnamed Deal"}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {deal.status || "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {deal.created_at
                        ? new Date(deal.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {deal.updated_at
                        ? new Date(deal.updated_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const dsData = dealSenseData[deal.id];
                        if (!dsData || dsData.loading) {
                          return <span className="text-sm text-gray-400">Loading...</span>;
                        }
                        if (dsData.error) {
                          return <span className="text-sm text-red-500">{dsData.error}</span>;
                        }
                        if (!dsData.latestRun) {
                          const hasSubmission = Boolean(dsData.latestSubmissionId);
                          return (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600"
                              >
                                No run
                              </span>
                              {hasSubmission && (
                                <button
                                  type="button"
                                  className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors cursor-pointer"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!dsData.latestSubmissionId) return;
                                    try {
                                      const res = await fetch(`/api/submissions/${dsData.latestSubmissionId}/run`, { method: "POST" });
                                      const json = await res.json().catch(() => ({}));
                                      if (json?.ok) {
                                        loadDealSenseData(deal.id);
                                      } else {
                                        alert(json?.error ?? "Run assessment failed");
                                      }
                                    } catch (err) {
                                      console.error("Run assessment failed:", err);
                                      alert(err instanceof Error ? err.message : "Run assessment failed");
                                    }
                                  }}
                                >
                                  Run assessment
                                </button>
                              )}
                            </div>
                          );
                        }
                        const assessedAt = dsData.latestRun.assessed_at ?? dsData.latestRun.created_at;
                        const runDate = new Date(assessedAt);
                        const now = new Date();
                        const diffMs = now.getTime() - runDate.getTime();
                        const diffMins = Math.floor(diffMs / 60000);
                        const diffHours = Math.floor(diffMs / 3600000);
                        const diffDays = Math.floor(diffMs / 86400000);
                        const relativeTime =
                          diffMins < 1 ? "Just now"
                            : diffMins < 60 ? `${diffMins}m ago`
                            : diffHours < 24 ? `${diffHours}h ago`
                            : diffDays < 7 ? `${diffDays}d ago`
                            : runDate.toLocaleDateString();

                        const readinessLabel = { not_ready: "Not ready", minor_issues: "Minor issues", ready: "Ready", no_run: "No run" }[dsData.readiness];
                        const readinessClass =
                          dsData.readiness === "not_ready" ? "bg-red-100 text-red-800"
                            : dsData.readiness === "minor_issues" ? "bg-amber-100 text-amber-800"
                            : dsData.readiness === "ready" ? "bg-green-100 text-green-800"
                            : "bg-slate-100 text-slate-600";

                        return (
                          <Link
                            href={`/app/deals/${deal.id}/runs/${dsData.latestRun.id}`}
                            className="block rounded-md p-2 -m-2 hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${readinessClass}`}>
                                {readinessLabel}
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                                C: {dsData.criticalCount} W: {dsData.warningCount}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500 mt-1.5">
                              Assessed: {relativeTime}
                            </div>
                          </Link>
                        );
                      })()}
                    </td>
                  </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
