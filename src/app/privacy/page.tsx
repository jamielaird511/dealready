import Link from "next/link";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-3xl px-6 py-24 sm:px-8 sm:py-32">
        <div className="mb-8">
          <Link
            href="/"
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← Back to home
          </Link>
        </div>

        <h1 className="mb-12 text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
          Privacy
        </h1>

        <div className="space-y-12 text-gray-700">
          {/* Overview */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              Overview
            </h2>
            <p className="leading-8">
              DealReady is an application readiness tool for lenders. It is not credit advice.
            </p>
          </section>

          {/* Information we collect */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              Information we collect
            </h2>
            <ul className="space-y-3 leading-8">
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Contact details submitted via the website</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>If and when users upload documents in the product, those documents are used only to provide the service</span>
              </li>
            </ul>
          </section>

          {/* How we use information */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              How we use information
            </h2>
            <ul className="space-y-3 leading-8">
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Provide the service</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Respond to requests</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Improve the product</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Maintain security and reliability</span>
              </li>
            </ul>
          </section>

          {/* AI and model training */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              AI and model training
            </h2>
            <p className="leading-8">
              Customer documents are not used to train public models.
            </p>
          </section>

          {/* Data retention */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              Data retention
            </h2>
            <ul className="space-y-3 leading-8">
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Contact enquiries are retained as needed to respond</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>For uploaded documents, retention will be minimised and will be clearly disclosed in-product</span>
              </li>
            </ul>
          </section>

          {/* Sharing */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              Sharing
            </h2>
            <p className="leading-8">
              We do not sell data. We may use service providers for hosting and analytics, only as needed to operate the service.
            </p>
          </section>

          {/* Security */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              Security
            </h2>
            <p className="leading-8">
              We use reasonable safeguards to protect your information. For more details, see our{" "}
              <Link
                href="/security"
                className="text-gray-900 underline hover:text-gray-700"
              >
                security page
              </Link>
              .
            </p>
          </section>

          {/* Your choices */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              Your choices
            </h2>
            <p className="mb-3 leading-8">
              You may request access, correction, or deletion of your information. To make a request, please contact us using the details below.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              Contact
            </h2>
            <p className="leading-8">
              For privacy-related enquiries, please contact us at{" "}
              <a
                href="mailto:hello@dealready.co.nz"
                className="text-gray-900 underline hover:text-gray-700"
              >
                hello@dealready.co.nz
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
