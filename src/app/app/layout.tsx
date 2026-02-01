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
          <div style={{ transform: "scale(0.8)", transformOrigin: "top center", width: "125%" }}>
            <div className="max-w-5xl mx-auto px-6 md:px-8">
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
                <Link
                  href="/app/deals"
                  className={`px-3 py-1 rounded-md text-sm font-medium leading-none transition-colors whitespace-nowrap ${
                    pathname?.startsWith("/app/deals")
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  Deals
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <div className="w-full flex justify-center">
        <div style={{ transform: "scale(0.8)", transformOrigin: "top center", width: "125%" }}>
          <main className="py-8">
            <div className="max-w-5xl mx-auto px-6 md:px-8 text-sm md:text-[15px] leading-[1.35]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
