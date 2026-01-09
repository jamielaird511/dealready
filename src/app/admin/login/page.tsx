"use client";

import { useState, Suspense, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoading(true);

    const supabase = supabaseBrowser();

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErr(error.message);
        return;
      }

      // Check if user is admin via profiles.role
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        setErr("Failed to retrieve user information.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      console.log("ADMIN ROLE DEBUG", {
        userId: user.id,
        email: user.email,
        profile,
        profileError,
      });

      if (profileError || !profile || profile.role !== "admin") {
        // Not an admin - redirect to broker area
        setErr("Access denied. Admin privileges required.");
        setTimeout(() => {
          router.replace("/app");
        }, 1500);
        return;
      }

      // Admin user - redirect to admin area
      router.replace(next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "calc(100vh - 80px)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          padding: 20,
          background: "white",
          boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Admin Login</h1>
        <p style={{ marginTop: 0, marginBottom: 18, opacity: 0.75 }}>
          Sign in with your admin credentials.
        </p>

        <form onSubmit={onSignIn}>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
            Email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="admin@email.com"
            autoComplete="email"
            style={{
              width: "100%",
              padding: 12,
              fontSize: 16,
              marginBottom: 14,
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              outline: "none",
            }}
          />

          <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
            Password
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: 12,
              fontSize: 16,
              marginBottom: 12,
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              outline: "none",
            }}
          />

          {(err || msg) && (
            <div
              style={{
                marginBottom: 12,
                padding: 10,
                borderRadius: 10,
                background: err ? "rgba(220,20,60,0.08)" : "rgba(0,128,0,0.08)",
                color: err ? "crimson" : "green",
                border: err
                  ? "1px solid rgba(220,20,60,0.2)"
                  : "1px solid rgba(0,128,0,0.2)",
              }}
            >
              {err ?? msg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            style={{
              width: "100%",
              padding: 12,
              fontSize: 16,
              fontWeight: 700,
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              cursor: "pointer",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={
      <div
        style={{
          minHeight: "calc(100vh - 80px)",
          display: "grid",
          placeItems: "center",
          padding: 16,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            padding: 20,
            background: "white",
            boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
          }}
        >
          <p>Loading...</p>
        </div>
      </div>
    }>
      <AdminLoginForm />
    </Suspense>
  );
}
