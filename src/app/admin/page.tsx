import Link from 'next/link';

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-white px-6 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Admin</h1>
          <p className="text-base text-gray-600">
            Manage brokers, submissions, and system settings.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brokers Card */}
          <Link
            href="/admin/brokers"
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
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
              <h2 className="text-lg font-semibold leading-tight text-slate-900">
                Brokers
              </h2>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              Manage broker accounts and access.
            </p>
          </Link>

          {/* Submissions Card */}
          <Link
            href="/admin/submissions"
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
                Submissions
              </h2>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              View and manage deal submissions.
            </p>
          </Link>

          {/* Users Card */}
          <Link
            href="/admin/users"
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
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <h2 className="text-lg font-semibold leading-tight text-slate-900">
                Users
              </h2>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              Manage user accounts and permissions.
            </p>
          </Link>

          {/* System Card */}
          <Link
            href="/admin/system"
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
                System
              </h2>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              System settings and configuration.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
