import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const pathname = req.nextUrl.pathname;

  // Never gate static assets and Next.js internals
  const isAsset =
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/brand/") ||
    pathname === "/favicon.ico" ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|map|txt)$/i);

  if (isAsset) return res;

  // Public routes (must NOT be blocked)
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/security") ||
    pathname.startsWith("/mfa");

  // Gate broker area: /app/:path* requires authenticated session
  const isBrokerRoute = pathname === "/app" || pathname.startsWith("/app/");

  // Gate admin area: /admin or /admin/:path* (except /admin/login) requires authenticated session AND admin authorization
  const isAdminRoute = (pathname === "/admin" || pathname.startsWith("/admin/")) && pathname !== "/admin/login";

  // If public route, allow through
  if (isPublic) {
    return res;
  }

  // Check authentication for protected routes
  if (isBrokerRoute || isAdminRoute) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (!user || error) {
      // Not authenticated - redirect to appropriate login
      const url = req.nextUrl.clone();
      if (isAdminRoute) {
        url.pathname = "/admin/login";
      } else {
        url.pathname = "/login";
      }
      url.searchParams.set("next", pathname + (req.nextUrl.search || ""));
      return NextResponse.redirect(url);
    }

    // For admin routes, check admin authorization via profiles.role
    if (isAdminRoute) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      // TODO: Enforce profile creation via database trigger if needed
      // If profile row is missing or error, treat as non-admin
      if (profileError || !profile || profile.role !== "admin") {
        // Authenticated but not admin - redirect to broker area
        const url = req.nextUrl.clone();
        url.pathname = "/app";
        return NextResponse.redirect(url);
      }
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/).*)",
  ],
};
