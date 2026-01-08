'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

interface Session {
  access_token: string;
}

interface AdminResponse {
  status: number;
  data: any;
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminData, setAdminData] = useState<AdminResponse | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        setSession({ access_token: session.access_token });
      }
      setLoading(false);
    };

    checkSession();
  }, []);

  const fetchAdminData = async () => {
    if (!session) return;

    setFetching(true);
    setError(null);

    try {
      const response = await fetch(
        'https://wqgmcdbdjvpjnhunwkys.supabase.co/functions/v1/admin-overview',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ ping: true }),
        }
      );

      const data = await response.json();

      setAdminData({
        status: response.status,
        data,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch admin data');
    } finally {
      setFetching(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">
            Not logged in
          </h1>
          <Link
            href="/login"
            className="text-indigo-600 hover:text-indigo-700 underline"
          >
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-semibold text-gray-900 mb-6">Admin</h1>
        
        <button
          onClick={fetchAdminData}
          disabled={fetching}
          className="mb-6 bg-indigo-600 text-white px-6 py-2 rounded-none font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {fetching ? 'Fetching...' : 'Fetch Admin Overview'}
        </button>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700">
            {error}
          </div>
        )}

        {adminData && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                HTTP Status: {adminData.status}
              </h2>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Response:
              </h2>
              <pre className="bg-gray-50 border border-gray-200 p-4 rounded-none overflow-auto text-sm">
                {JSON.stringify(adminData.data, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
