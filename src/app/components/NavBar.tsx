"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function NavBar() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function checkAuth() {
      const supabase = supabaseBrowser();
      
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error || !user) {
        setIsAuthenticated(false);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAuthenticated(true);

      // Check if user is admin
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      setIsAdmin(profile?.role === "admin");
      setLoading(false);
    }

    checkAuth();

    // Listen for auth changes
    const supabase = supabaseBrowser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAuth();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  async function handleSignOut() {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    setDropdownOpen(false);
    router.push("/");
  }

  const userLabel = isAdmin ? "Admin" : "Broker";

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
        <div className="flex items-center">
          {loading ? (
            <div className="h-6 w-20" />
          ) : isAuthenticated ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 px-2 py-1 text-sm text-slate-700 hover:text-slate-900 transition-colors"
                aria-label="User menu"
              >
                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-white"
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
                </div>
                <span className="font-medium">{userLabel}</span>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 shadow-lg">
                  <div className="py-1">
                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setDropdownOpen(false)}
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        Admin Console
                      </Link>
                    )}
                    <Link
                      href="/app"
                      onClick={() => setDropdownOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Broker App
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-none border-2 border-indigo-600 bg-white px-5 py-2 text-sm font-medium text-indigo-600 transition-all duration-150 ease-out hover:bg-indigo-50 hover:shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-600"
            >
              Login
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
