"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type DealRow = { id: string; name?: string; status?: string; created_at?: string; updated_at?: string };

/** Row from deal_latest_run view: latest run per deal with snapshot. */
type DealLatestRunRow = {
  deal_id: string;
  run_id: string | null;
  run_created_at: string | null;
  doc_completeness_snapshot: { completenessPct?: number } | null;
};

export default function DealsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [latestRunByDeal, setLatestRunByDeal] = useState<Record<string, DealLatestRunRow>>({});

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

      const ids = (data || []).map((d) => d.id).filter((id): id is string => Boolean(id));
      if (ids.length === 0) return;
      const { data: latestRuns, error: runsError } = await supabase
        .from("deal_latest_run")
        .select("deal_id, run_id, run_created_at, doc_completeness_snapshot")
        .in("deal_id", ids);
      if (!runsError && latestRuns) {
        const byDeal: Record<string, DealLatestRunRow> = {};
        for (const row of latestRuns as DealLatestRunRow[]) {
          byDeal[row.deal_id] = row;
        }
        setLatestRunByDeal(byDeal);
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
                {deals.map((deal) => {
                  const latest = latestRunByDeal[deal.id];
                  const runId = latest?.run_id ?? null;
                  const snapshot = latest?.doc_completeness_snapshot;
                  const pct = snapshot && typeof snapshot.completenessPct === "number" ? snapshot.completenessPct : null;
                  const runCreatedAt = latest?.run_created_at ?? null;
                  const href = runId
                    ? `/app/deals/${deal.id}/runs/${runId}`
                    : `/app/deals/${deal.id}/wizard/step-4`;
                  const runDate = runCreatedAt ? new Date(runCreatedAt) : null;
                  const now = new Date();
                  const diffMs = runDate ? now.getTime() - runDate.getTime() : 0;
                  const diffMins = Math.floor(diffMs / 60000);
                  const diffHours = Math.floor(diffMs / 3600000);
                  const diffDays = Math.floor(diffMs / 86400000);
                  const updatedLabel = runDate
                    ? diffMins < 1
                      ? "Just now"
                      : diffMins < 60
                        ? `${diffMins}m ago`
                        : diffHours < 24
                          ? `${diffHours}h ago`
                          : diffDays < 7
                            ? `${diffDays}d ago`
                            : runDate.toLocaleDateString()
                    : null;

                  return (
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
                        <Link
                          href={href}
                          className="block rounded-md p-2 -m-2 hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {pct != null ? (
                            <>
                              <span className="text-sm font-medium text-gray-900">{pct}%</span>
                              {updatedLabel && (
                                <div className="text-xs text-gray-500 mt-0.5">Updated {updatedLabel}</div>
                              )}
                            </>
                          ) : (
                            <span className="text-sm text-gray-500">—</span>
                          )}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
