"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function DealsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dealSenseData, setDealSenseData] = useState<Record<string, { latestRun: any; criticalCount: number; activeCount: number; loading: boolean; error: string | null }>>({});

  useEffect(() => {
    async function loadDeals() {
      const supabase = supabaseBrowser();

      // Get the current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError("Not authenticated. Please sign in.");
        setLoading(false);
        return;
      }

      // Fetch deals for this broker
      const { data, error: fetchError } = await supabase
        .from("deals")
        .select("*")
        .eq("broker_id", user.id)
        .order("updated_at", { ascending: false });

      if (fetchError) {
        console.error("Error loading deals:", {
          message: fetchError.message,
          details: fetchError.details,
          hint: fetchError.hint,
          code: fetchError.code,
        });
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      setDeals(data || []);
      setLoading(false);

      // Load DealSense data for each deal
      // TODO: Optimize this to avoid N+1 queries (e.g., batch fetch or join)
      if (data && data.length > 0) {
        data.forEach((deal) => {
          loadDealSenseData(deal.id);
        });
      }
    }

    async function loadDealSenseData(dealId: string) {
      const supabase = supabaseBrowser();

      // Initialize loading state
      setDealSenseData((prev) => ({
        ...prev,
        [dealId]: { latestRun: null, criticalCount: 0, activeCount: 0, loading: true, error: null },
      }));

      try {
        // Get first submission for this deal
        const { data: submissions, error: subError } = await supabase
          .from("submissions")
          .select("id")
          .eq("deal_id", dealId)
          .order("created_at", { ascending: false })
          .limit(1);

        if (subError || !submissions || submissions.length === 0) {
          setDealSenseData((prev) => ({
            ...prev,
            [dealId]: { latestRun: null, criticalCount: 0, activeCount: 0, loading: false, error: null },
          }));
          return;
        }

        const submissionId = submissions[0].id;

        // Get latest run for this submission
        const { data: runs, error: runsError } = await supabase
          .from("submission_runs")
          .select("*")
          .eq("submission_id", submissionId)
          .order("created_at", { ascending: false })
          .limit(1);

        if (runsError || !runs || runs.length === 0) {
          setDealSenseData((prev) => ({
            ...prev,
            [dealId]: { latestRun: null, criticalCount: 0, activeCount: 0, loading: false, error: null },
          }));
          return;
        }

        const latestRun = runs[0];

        // Get findings for this run
        const { data: findings, error: findingsError } = await supabase
          .from("submission_run_findings")
          .select("severity, workflow_state")
          .eq("run_id", latestRun.id);

        if (findingsError) {
          console.error("Error loading findings for deal:", dealId, findingsError);
          setDealSenseData((prev) => ({
            ...prev,
            [dealId]: { latestRun, criticalCount: 0, activeCount: 0, loading: false, error: "Failed to load findings" },
          }));
          return;
        }

        const criticalCount = (findings || []).filter((f) => f.severity === "critical").length;
        const activeCount = (findings || []).filter((f) => {
          const state = f.workflow_state ?? "open";
          return state === "open" || state === "acknowledged";
        }).length;

        setDealSenseData((prev) => ({
          ...prev,
          [dealId]: { latestRun, criticalCount, activeCount, loading: false, error: null },
        }));
      } catch (err) {
        console.error("Error loading DealSense data for deal:", dealId, err);
        setDealSenseData((prev) => ({
          ...prev,
          [dealId]: { latestRun: null, criticalCount: 0, activeCount: 0, loading: false, error: "Error loading DealSense data" },
        }));
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
                {deals.map((deal) => (
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
                          return (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-500">No DealSense run yet</span>
                              <Link
                                href={`/app/deals/${deal.id}`}
                                className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Run DealSense
                              </Link>
                            </div>
                          );
                        }
                        const runDate = new Date(dsData.latestRun.created_at);
                        const now = new Date();
                        const diffMs = now.getTime() - runDate.getTime();
                        const diffMins = Math.floor(diffMs / 60000);
                        const diffHours = Math.floor(diffMs / 3600000);
                        const diffDays = Math.floor(diffMs / 86400000);
                        
                        const relativeTime =
                          diffMins < 1
                            ? "Just now"
                            : diffMins < 60
                            ? `${diffMins}m ago`
                            : diffHours < 24
                            ? `${diffHours}h ago`
                            : diffDays < 7
                            ? `${diffDays}d ago`
                            : runDate.toLocaleDateString();

                        return (
                          <Link
                            href={`/app/deals/${deal.id}/runs/${dsData.latestRun.id}`}
                            className="block rounded-md p-2 -m-2 hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                                  dsData.criticalCount > 0
                                    ? "bg-red-100 text-red-800"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                Critical: {dsData.criticalCount}
                              </span>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                                  dsData.activeCount > 0
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                Active: {dsData.activeCount}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500 mt-1.5">
                              Last run: {relativeTime}
                            </div>
                          </Link>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
