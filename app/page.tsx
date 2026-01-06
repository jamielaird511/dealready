import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-3xl px-6 py-24 sm:px-8 sm:py-32">
        {/* Hero Section */}
        <div className="mb-20 text-center">
          <h1 className="mb-4 text-5xl font-semibold tracking-tight text-gray-900 sm:text-6xl">
            DealReady
          </h1>
          <h2 className="mb-6 text-2xl font-medium text-gray-900 sm:text-3xl">
            Application readiness for lenders
          </h2>
          <p className="mx-auto max-w-2xl text-lg leading-8 text-gray-600">
            DealReady checks whether a broker submission has sufficient information for a bank or lender to assess it.
          </p>
        </div>

        {/* What it does / What it doesn't do */}
        <div className="mb-20 grid gap-12 sm:grid-cols-2 sm:gap-16">
          <div>
            <h3 className="mb-4 text-xl font-semibold text-gray-900">
              What it does
            </h3>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Reviews submissions for completeness and coherence</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Flags missing or unclear information before submission</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Helps reduce back-and-forth with lenders</span>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-xl font-semibold text-gray-900">
              What it doesn't do
            </h3>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Does not assess deal strength</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Does not predict approval outcomes</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Does not provide credit advice</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Who it's for */}
        <div className="mb-20">
          <h3 className="mb-4 text-xl font-semibold text-gray-900">
            Who it's for
          </h3>
          <p className="text-lg leading-8 text-gray-600">
            DealReady is built for commercial and business lending brokers. It is designed from a bank-side assessment perspective to help ensure submissions meet lender requirements.
          </p>
        </div>

        {/* Call to action */}
        <div className="text-center">
          <a
            href="mailto:info@dealready.com"
            className="inline-flex items-center justify-center rounded-md bg-gray-900 px-8 py-3 text-base font-medium text-white transition-colors hover:bg-gray-800"
          >
            Request early access
          </a>
        </div>

        {/* Footer */}
        <footer className="mt-24 border-t border-gray-200 pt-8">
          <div className="flex justify-center gap-6 text-sm text-gray-600">
            <Link
              href="/privacy"
              className="hover:text-gray-900 transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/security"
              className="hover:text-gray-900 transition-colors"
            >
              Security
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
