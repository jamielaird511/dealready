import Link from "next/link";
import Image from "next/image";

const ENABLE_EPHEMERAL_RETENTION = false;

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="relative bg-gradient-to-br from-indigo-700 via-indigo-600 to-indigo-700 min-h-[75vh] flex items-center">
        <div className="mx-auto max-w-6xl px-6 py-14 w-full">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center relative z-10">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Kicker */}
              <div className="text-xs font-medium uppercase tracking-wider text-white/70">
                BROKER SUBMISSION READINESS
              </div>
              {/* Headline */}
              <h1 className="text-4xl font-semibold leading-[1.05] text-white md:text-5xl">
                Send complete deals to lenders, faster.
              </h1>
              {/* Subtext */}
              <p className="max-w-xl text-lg leading-relaxed text-white/80">
                DealReady flags missing information, weak commentary, and gaps in evidence before you submit.
              </p>
              {/* CTA Row */}
              <div className="flex flex-wrap gap-4">
                <Link
                  href="#get-dealready"
                  className="inline-flex items-center justify-center rounded-none bg-emerald-500 px-6 py-3 text-base font-semibold text-white transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-indigo-600"
                >
                  Get DealReady
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex items-center justify-center rounded-none border-2 border-indigo-600 bg-white px-6 py-3 text-base font-medium text-indigo-600 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-indigo-600"
                >
                  See how it works
                </Link>
              </div>
            </div>
            {/* Right Column: Submission Readiness Card */}
            <div className="relative w-full max-w-md rounded-none border-2 border-white/40 bg-white p-8 shadow-xl z-10">
              <div className="mb-6 text-xs font-medium text-slate-400 uppercase tracking-wider">
                DealReady Assessment
              </div>
              <div className="mb-6">
                <div className="inline-flex items-center gap-3 mb-2">
                  <div className="w-4 h-4 rounded-full bg-emerald-500"></div>
                  <h2 className="text-2xl font-semibold text-slate-900 uppercase tracking-tight">
                    Green
                  </h2>
                </div>
                <p className="text-base font-medium text-slate-600">
                  Ready to submit
                </p>
              </div>
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="flex items-center gap-3">
                  <svg
                    className="h-5 w-5 flex-shrink-0 text-emerald-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-sm font-medium text-slate-900">
                    All required documents present
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <svg
                    className="h-5 w-5 flex-shrink-0 text-emerald-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-sm font-medium text-slate-900">
                    Commentary complete and clear
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <svg
                    className="h-5 w-5 flex-shrink-0 text-emerald-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-sm font-medium text-slate-900">
                    Evidence gaps addressed
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Subtle RAG Status Motif Background */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1/3 h-2/3 opacity-[0.03] pointer-events-none z-0 hidden lg:flex items-center justify-center">
          <div className="flex flex-col gap-8">
            <div className="w-16 h-16 rounded-full bg-red-500"></div>
            <div className="w-16 h-16 rounded-full bg-amber-500"></div>
            <div className="w-16 h-16 rounded-full bg-emerald-500"></div>
          </div>
        </div>
      </div>

      {/* How it works Section */}
      <section id="how-it-works" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10">
            <h2 className="text-3xl font-semibold text-gray-900 md:text-4xl">
              How DealReady Works
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Step 1 */}
            <div className="rounded-none border-2 border-blue-300 bg-white p-6 transition-transform transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center gap-3">
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
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <h3 className="text-lg font-semibold leading-tight text-slate-900">
                  Upload
                </h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Upload your deal pack, financials, and supporting documents.
              </p>
            </div>
            {/* Step 2 */}
            <div className="rounded-none border-2 border-blue-300 bg-white p-6 transition-transform transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center gap-3">
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
                <h3 className="text-lg font-semibold leading-tight text-slate-900">
                  Scan
                </h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                DealReady checks for missing information, weak commentary, and gaps.
              </p>
            </div>
            {/* Step 3 */}
            <div className="rounded-none border-2 border-blue-300 bg-white p-6 transition-transform transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center gap-3">
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
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <h3 className="text-lg font-semibold leading-tight text-slate-900">
                  Score
                </h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Receive a Red / Amber / Green readiness score.
              </p>
            </div>
            {/* Step 4 */}
            <div className="rounded-none border-2 border-blue-300 bg-white p-6 transition-transform transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center gap-3">
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
                <h3 className="text-lg font-semibold leading-tight text-slate-900">
                  Fix & Submit
                </h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Follow the checklist and submit with fewer follow-ups.
              </p>
            </div>
          </div>
          {/* Disclaimer Callout */}
          <div className="mt-8 rounded-none border-2 border-blue-300 bg-slate-50 p-6">
            <div className="flex gap-3">
              <svg
                className="mt-0.5 h-5 w-5 shrink-0 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  DealReady does not assess credit quality.
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  It only confirms the submission includes the information a lender
                  may require to assess the application — present, clear, and
                  complete.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="border-t border-slate-200 bg-slate-100 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10">
            <h2 className="text-3xl font-semibold text-gray-900 md:text-4xl">
              Why Brokers Use DealReady
            </h2>
          </div>
          <div className="space-y-0">
            {/* Benefit 1 */}
            <div className="border-b border-slate-200 py-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
                <div className="flex items-center gap-3">
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
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  <h3 className="text-lg font-semibold leading-tight text-slate-900">
                    Fewer Follow-Ups
                  </h3>
                </div>
                <p className="text-sm leading-6 text-slate-600 md:ml-auto md:max-w-md">
                  Reduce back-and-forth with lenders by submitting complete packs the first time.
                </p>
              </div>
            </div>
            {/* Benefit 2 */}
            <div className="border-b border-slate-200 py-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
                <div className="flex items-center gap-3">
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
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <h3 className="text-lg font-semibold leading-tight text-slate-900">
                    Faster Turnaround
                  </h3>
                </div>
                <p className="text-sm leading-6 text-slate-600 md:ml-auto md:max-w-md">
                  Submit complete packs the first time, reducing delays and accelerating the assessment process.
                </p>
              </div>
            </div>
            {/* Benefit 3 */}
            <div className="border-b border-slate-200 py-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
                <div className="flex items-center gap-3">
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
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <h3 className="text-lg font-semibold leading-tight text-slate-900">
                    Higher Lender Confidence
                  </h3>
                </div>
                <p className="text-sm leading-6 text-slate-600 md:ml-auto md:max-w-md">
                  Present a clearer, more assessable deal that meets lender requirements from the start.
                </p>
              </div>
            </div>
            {/* Benefit 4 */}
            <div className="border-b border-slate-200 py-6 last:border-b-0">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
                <div className="flex items-center gap-3">
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
                  <h3 className="text-lg font-semibold leading-tight text-slate-900">
                    Team Consistency
                  </h3>
                </div>
                <p className="text-sm leading-6 text-slate-600 md:ml-auto md:max-w-md">
                  Standardise submissions across brokers to ensure consistent quality and completeness.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="border-t border-slate-200 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10">
            <h2 className="mb-4 text-3xl font-semibold text-gray-900 md:text-4xl">
              Security & Confidentiality
            </h2>
            <p className="text-base leading-7 text-gray-600">
              DealReady is designed to protect confidential deal information. We focus on secure handling, controlled access, and minimal data retention.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Encryption Card */}
            <div className="rounded-none border-2 border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center gap-3">
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
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-slate-900">
                  Encryption
                </h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start">
                  <span className="mr-2 text-slate-400">•</span>
                  <span>TLS in transit</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-slate-400">•</span>
                  <span>Encryption at rest (cloud provider)</span>
                </li>
              </ul>
            </div>
            {/* Access Controls Card */}
            <div className="rounded-none border-2 border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center gap-3">
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
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-slate-900">
                  Access Controls
                </h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start">
                  <span className="mr-2 text-slate-400">•</span>
                  <span>Role-based access</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-slate-400">•</span>
                  <span>Least-privilege permissions</span>
                </li>
              </ul>
            </div>
            {/* Data Retention Card */}
            <div className="rounded-none border-2 border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center gap-3">
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
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-slate-900">
                  Data Retention
                </h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start">
                  <span className="mr-2 text-slate-400">•</span>
                  <span>Files retained only as needed for processing</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-slate-400">•</span>
                  <span>Retention policy configurable</span>
                </li>
              </ul>
            </div>
            {/* Operational Safeguards Card */}
            <div className="rounded-none border-2 border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center gap-3">
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
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-slate-900">
                  Operational Safeguards
                </h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start">
                  <span className="mr-2 text-slate-400">•</span>
                  <span>Audit logs for key actions</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-slate-400">•</span>
                  <span>Secure deletion workflows</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 mb-8">
            {/* Left Column: Brand */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                DealReady
              </h3>
              <p className="text-sm text-slate-600">
                Broker submission readiness for lenders
              </p>
            </div>
            {/* Middle Column: Product Links */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">
                Product
              </h4>
              <ul className="space-y-2">
                <li>
                  <a
                    href="#how-it-works"
                    className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    How DealReady Works
                  </a>
                </li>
                <li>
                  <a
                    href="#benefits"
                    className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    Benefits
                  </a>
                </li>
                <li>
                  <a
                    href="#security"
                    className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    Security & Confidentiality
                  </a>
                </li>
              </ul>
            </div>
            {/* Right Column: Legal Links */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">
                Legal
              </h4>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/privacy"
                    className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    Privacy
                  </Link>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    Terms
                  </a>
                </li>
                <li>
                  <Link
                    href="/security"
                    className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    Security
                  </Link>
                </li>
                <li>
                  <a
                    href="mailto:hello@dealready.co"
                    className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    Contact
                  </a>
                </li>
                <li>
                  <Link
                    href="/admin/login"
                    className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    Admin
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          {/* Disclaimer */}
          <div className="pt-6 border-t border-slate-200 mb-6">
            <p className="text-xs text-slate-500">
              DealReady does not assess deal strength or provide credit advice.
            </p>
          </div>
          {/* Copyright */}
          <div className="text-xs text-slate-500">
            © {new Date().getFullYear()} DealReady. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
