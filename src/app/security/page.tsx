import Link from "next/link";

export default function Security() {
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
          Security
        </h1>

        <div className="space-y-12 text-gray-700">
          {/* Approach */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              Approach
            </h2>
            <p className="leading-8">
              Our security approach focuses on minimising retention and protecting confidentiality of information.
            </p>
          </section>

          {/* Encryption */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              Encryption
            </h2>
            <ul className="space-y-3 leading-8">
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Data in transit is encrypted using HTTPS/TLS</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Data at rest is encrypted where supported by hosting providers</span>
              </li>
            </ul>
          </section>

          {/* Access controls */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              Access controls
            </h2>
            <ul className="space-y-3 leading-8">
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Authentication is required for access</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Access is designed on the principle of least privilege</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Systems are designed for firm isolation between tenants</span>
              </li>
            </ul>
          </section>

          {/* Document handling */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              Document handling
            </h2>
            <p className="mb-3 leading-8">
              We aim to minimise retention of uploaded documents. The target design includes automatic deletion and purge mechanisms.
            </p>
            <p className="leading-8">
              Exact retention periods are disclosed in-product.
            </p>
          </section>

          {/* Operational safeguards */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              Operational safeguards
            </h2>
            <ul className="space-y-3 leading-8">
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Logging and monitoring are in place</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-gray-400">•</span>
                <span>Backups are maintained to support service reliability</span>
              </li>
            </ul>
          </section>

          {/* Vulnerability management */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              Vulnerability management
            </h2>
            <p className="leading-8">
              We encourage responsible disclosure of security vulnerabilities. Please report security issues to{" "}
              <a
                href="mailto:security@dealready.co.nz"
                className="text-gray-900 underline hover:text-gray-700"
              >
                security@dealready.co.nz
              </a>
              .
            </p>
          </section>

          {/* Independent testing */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              Independent testing
            </h2>
            <p className="leading-8">
              Independent security testing and penetration testing will be commissioned as the product matures.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              Contact
            </h2>
            <p className="leading-8">
              For security-related enquiries, please contact{" "}
              <a
                href="mailto:security@dealready.co.nz"
                className="text-gray-900 underline hover:text-gray-700"
              >
                security@dealready.co.nz
              </a>
              . For general enquiries, see our{" "}
              <Link
                href="/privacy"
                className="text-gray-900 underline hover:text-gray-700"
              >
                privacy page
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
