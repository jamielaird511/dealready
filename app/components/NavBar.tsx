import Link from "next/link";
import Image from "next/image";

export default function NavBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
      <nav className="mx-auto flex max-w-6xl items-center px-6 py-3">
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
      </nav>
    </header>
  );
}

