import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(req: NextRequest) {
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

  // 1) Never gate static assets
  const isAsset =
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/brand/") ||
    pathname === "/favicon.ico" ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|map|txt)$/i);

  if (isAsset) return res;

  // 2) Only gate private routes; everything else is public marketing site
  const isPrivateRoute =
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname.startsWith("/mfa");

  if (!isPrivateRoute) {
    return res; // public: /, /pricing, /how-it-works, /login, etc.
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const enforceMfa =
    process.env.NODE_ENV === "production"
      ? true
      : process.env.NEXT_PUBLIC_MFA_ENFORCE === "true";

  if (enforceMfa) {
    const { data: aalData, error } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (error) {
      console.warn("MFA AAL check error:", error.message);
      return res;
    }

    if (aalData?.currentLevel === "aal1") {
      const url = req.nextUrl.clone();
      url.pathname = "/mfa";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/).*)",
  ],
};
