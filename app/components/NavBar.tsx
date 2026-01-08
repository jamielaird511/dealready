import Link from "next/link";
import Image from "next/image";

export default function NavBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="inline-block">
          <Image
            src="/brand/dealready-logo.svg"
            alt="DealReady"
            height={40}
            width={171}
            className="h-10 md:h-12 w-auto"
            priority
          />
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-none border-2 border-indigo-600 bg-white px-5 py-2 text-sm font-medium text-indigo-600 transition-all duration-150 ease-out hover:bg-indigo-50 hover:shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-600"
        >
          Login
        </Link>
      </nav>
    </header>
  );
}

