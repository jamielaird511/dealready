"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function AppHome() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function createDeal() {
    setCreating(true);
    const supabase = supabaseBrowser();

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        router.replace("/login");
        setCreating(false);
        return;
      }

      // Insert a new deal
      const { data: deal, error } = await supabase
        .from("deals")
        .insert({
          broker_id: user.id,
          name: "New Deal",
          status: "draft",
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating deal:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        alert("Error creating deal. Please ensure the deals table exists in your database.");
        setCreating(false);
        return;
      }

      // Route to the new deal
      router.push(`/app/deals/${deal.id}`);
    } catch (err) {
      console.error("Error:", err);
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-white px-6 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 mb-2">Broker Dashboard</h1>
            <p className="text-base text-gray-600">
              Manage your deals, submissions, and requests.
            </p>
          </div>
          <button
            onClick={createDeal}
            disabled={creating}
            className="inline-flex items-center justify-center rounded-none bg-emerald-500 px-6 py-2 text-sm font-semibold text-white transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {creating ? "Creating..." : "New Deal"}
          </button>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Deals Card */}
          <Link
            href="/app/deals"
            className="rounded-none border-2 border-slate-200 bg-white p-6 transition-transform transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-md"
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
            className="rounded-none border-2 border-slate-200 bg-white p-6 transition-transform transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-md"
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
            className="rounded-none border-2 border-slate-200 bg-white p-6 transition-transform transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-md"
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
            className="rounded-none border-2 border-slate-200 bg-white p-6 transition-transform transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-md"
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
    </div>
  );
}
