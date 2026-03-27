"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type DealRow = { id: string; name?: string | null; status?: string | null; updated_at?: string | null };
type SortColumn = "name" | "status" | "updated_at";

export default function AppHome() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [showCreateDeal, setShowCreateDeal] = useState(false);
  const [dealName, setDealName] = useState("");
  const [purposeType, setPurposeType] = useState<string>("other");
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState<string | null>(null);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [sortColumn, setSortColumn] = useState<SortColumn>("updated_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  }

  const sortedDeals = useMemo(() => {
    const sorted = [...deals];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortColumn === "name") {
        cmp = (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
      } else if (sortColumn === "status") {
        cmp = (a.status ?? "").localeCompare(b.status ?? "", undefined, { sensitivity: "base" });
      } else {
        cmp = (new Date(a.updated_at ?? 0).getTime() || 0) - (new Date(b.updated_at ?? 0).getTime() || 0);
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [deals, sortColumn, sortDirection]);

  useEffect(() => {
    async function loadDeals() {
      const supabase = supabaseBrowser();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setDealsError("Not authenticated. Please sign in.");
        setDealsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("deals")
        .select("id, name, status, updated_at")
        .eq("broker_id", user.id)
        .order("updated_at", { ascending: false });

      if (error) {
        setDealsError(error.message);
        setDealsLoading(false);
        return;
      }

      setDeals((data ?? []) as DealRow[]);
      setDealsLoading(false);
    }

    loadDeals();
  }, []);

  async function createDeal() {
    setCreating(true);
    const supabase = supabaseBrowser();

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      console.log("[app] auth user id:", user?.id);
      if (userError || !user) {
        router.replace("/login");
        setCreating(false);
        return;
      }

      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (membershipError || !membership) {
        console.error("Error creating deal (membership):", membershipError ?? "No membership");
        alert("No organization membership found for this user.");
        setCreating(false);
        return;
      }

      const organizationId = (membership as { organization_id: string }).organization_id;

      // Insert a new deal
      const { data: deal, error } = await supabase
        .from("deals")
        .insert({
          broker_id: user.id,
          name: dealName.trim(),
          status: "draft",
          organization_id: organizationId,
          purpose_type: purposeType || "other",
          purpose_notes: null,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating deal (raw):", error);
        console.error("Error creating deal (details):", {
          message: (error as { message?: string })?.message,
          details: (error as { details?: unknown })?.details,
          hint: (error as { hint?: string })?.hint,
          code: (error as { code?: string })?.code,
        });
        alert(`Error creating deal: ${error?.message ?? "Unknown error"}`);
        setCreating(false);
        return;
      }

      // Route to the new deal workspace
      setShowCreateDeal(false);
      setDealName("");
      setPurposeType("other");
      router.push(`/app/deals/${deal.id}?upload=1`);
    } catch (err) {
      console.error("Error creating deal (raw):", err);
      console.error("Error creating deal (details):", {
        message: err instanceof Error ? err.message : (err as { message?: string })?.message,
        details: (err as { details?: unknown })?.details,
        hint: (err as { hint?: string })?.hint,
        code: (err as { code?: string })?.code,
      });
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message;
      alert(`Error creating deal: ${message ?? "Unknown error"}`);
      setCreating(false);
    }
    setCreating(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Your Deals</h1>
          <p className="text-base text-gray-600">
            Create and manage your deals.
          </p>
        </div>
        <button
          onClick={() => {
            setDealName("New Deal");
            setPurposeType("other");
            setShowCreateDeal(true);
          }}
          disabled={creating}
          className="inline-flex items-center justify-center rounded-none bg-emerald-500 px-8 py-3 text-base font-semibold text-white transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {creating ? "Creating..." : "New Deal"}
        </button>
      </div>

      {showCreateDeal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !creating) setShowCreateDeal(false);
          }}
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Create deal</h2>
                <p className="text-sm text-slate-600 mt-1">Name the deal, then you’ll land in the workspace to upload the pack.</p>
              </div>
              <button
                type="button"
                disabled={creating}
                onClick={() => setShowCreateDeal(false)}
                className="text-slate-500 hover:text-slate-700 text-sm font-semibold"
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Deal name</label>
                <input
                  value={dealName}
                  onChange={(e) => setDealName(e.target.value)}
                  placeholder="e.g. Acme Engineering — refinance"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Borrowing purpose (optional)</label>
                <select
                  value={purposeType}
                  onChange={(e) => setPurposeType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                >
                  <option value="other">Other / not set</option>
                  <option value="business_purchase">Business purchase</option>
                  <option value="working_capital">Working capital</option>
                  <option value="refinance">Refinance / restructure</option>
                  <option value="property_purchase">Property purchase</option>
                  <option value="shareholder_buyout">Shareholder buyout</option>
                  <option value="equipment">Equipment / asset purchase</option>
                  <option value="startup">Start-up / new business</option>
                  <option value="expansion">Business expansion</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={creating}
                onClick={() => setShowCreateDeal(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creating || !dealName.trim()}
                onClick={() => {
                  if (!dealName.trim() || creating) return;
                  createDeal();
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? "Creating..." : "Create deal"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="space-y-2">
        {dealsLoading ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <p className="text-sm text-slate-600">Loading deals...</p>
          </div>
        ) : dealsError ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <p className="text-sm text-red-600">Error: {dealsError}</p>
          </div>
        ) : deals.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <p className="text-sm text-slate-700">No deals yet</p>
            <p className="text-sm text-slate-600 mt-1">Create your first deal to get started</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-2 text-left text-xs font-semibold text-slate-700">
                    <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1">
                      Deal Name
                      {sortColumn === "name" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th className="px-6 py-2 text-left text-xs font-semibold text-slate-700">
                    <button type="button" onClick={() => toggleSort("status")} className="inline-flex items-center gap-1">
                      Status
                      {sortColumn === "status" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th className="px-6 py-2 text-left text-xs font-semibold text-slate-700">
                    <button type="button" onClick={() => toggleSort("updated_at")} className="inline-flex items-center gap-1">
                      Last Updated
                      {sortColumn === "updated_at" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedDeals.map((deal) => (
                  <tr
                    key={deal.id}
                    onClick={() => router.push(`/app/deals/${deal.id}`)}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-2.5 text-sm font-medium text-slate-900">{deal.name || "Unnamed Deal"}</td>
                    <td className="px-6 py-2.5 text-sm text-slate-700">
                      <span className="inline-flex items-center rounded-full border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {deal.status || "—"}
                      </span>
                    </td>
                    <td className="px-6 py-2.5 text-sm text-slate-600">
                      {deal.updated_at ? new Date(deal.updated_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
