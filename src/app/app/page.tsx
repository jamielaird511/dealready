"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function AppHome() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [showCreateDeal, setShowCreateDeal] = useState(false);
  const [dealName, setDealName] = useState("");
  const [purposeType, setPurposeType] = useState<string>("other");

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
    <div className="space-y-8">
      <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 mb-2">Broker Dashboard</h1>
            <p className="text-base text-gray-600">
              Manage your deals, submissions, and requests.
            </p>
          </div>
          <button
            onClick={() => {
              setDealName("New Deal");
              setPurposeType("other");
              setShowCreateDeal(true);
            }}
            disabled={creating}
            className="inline-flex items-center justify-center rounded-none bg-emerald-500 px-6 py-2 text-sm font-semibold text-white transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
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

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Deals Card */}
          <Link
            href="/app/deals"
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 transition-transform transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center gap-3 mb-3">
              <svg
                className="h-5 w-5 shrink-0 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h2 className="text-lg font-semibold leading-tight text-slate-900">
                Deals
              </h2>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              View and manage your deals.
            </p>
          </Link>

          {/* Submissions Card */}
          <Link
            href="/app/submissions"
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 transition-transform transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center gap-3 mb-3">
              <svg
                className="h-5 w-5 shrink-0 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
              <h2 className="text-lg font-semibold leading-tight text-slate-900">
                Submissions
              </h2>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              Track your deal submissions to lenders.
            </p>
          </Link>

          {/* Requests Card */}
          <Link
            href="/app/requests"
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 transition-transform transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center gap-3 mb-3">
              <svg
                className="h-5 w-5 shrink-0 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <h2 className="text-lg font-semibold leading-tight text-slate-900">
                Requests
              </h2>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              View lender requests and inquiries.
            </p>
          </Link>

          {/* Settings Card */}
          <Link
            href="/app/settings"
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 transition-transform transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center gap-3 mb-3">
              <svg
                className="h-5 w-5 shrink-0 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <h2 className="text-lg font-semibold leading-tight text-slate-900">
                Settings
              </h2>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              Manage your account and preferences.
            </p>
          </Link>
        </div>
    </div>
  );
}
