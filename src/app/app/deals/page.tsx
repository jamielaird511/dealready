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
      <div className="min-h-screen bg-white px-6 py-12">
        <div className="max-w-6xl mx-auto">
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
    <div className="min-h-screen bg-white px-6 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Deals</h1>
          <p className="text-base text-gray-600">
            View and manage your deals.
          </p>
        </div>

        {deals.length === 0 ? (
          <div className="border-2 border-slate-200 rounded-none p-8 text-center">
            <p className="text-gray-600 mb-4">No deals yet.</p>
            <Link
              href="/app"
              className="inline-flex items-center justify-center rounded-none bg-emerald-500 px-6 py-2 text-sm font-semibold text-white transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg"
            >
              Create Your First Deal
            </Link>
          </div>
        ) : (
          <div className="border-2 border-slate-200 rounded-none overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b-2 border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Deal Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Updated
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
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {deal.name || "Unnamed Deal"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {deal.status || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {deal.created_at
                        ? new Date(deal.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {deal.updated_at
                        ? new Date(deal.updated_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
