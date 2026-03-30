"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Sub-navigation bar - full width outside scaling container */}
      <nav className="sticky top-0 z-10 w-full bg-white border-b border-gray-200 py-1">
        <div className="w-full flex justify-center">
          <div className="w-full max-w-screen-2xl px-6 md:px-8">
            <div className="flex items-center gap-2 overflow-x-auto">
              <Link
                href="/app"
                className={`px-3 py-1 rounded-md text-sm font-medium leading-none transition-colors whitespace-nowrap ${
                  pathname === "/app" || pathname === "/app/"
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </nav>
      <div className="w-full flex justify-center">
        <main className="py-8 w-full max-w-screen-2xl px-6 md:px-8 text-sm md:text-[15px] leading-[1.35]">
          {children}
        </main>
      </div>
    </div>
  );
}
