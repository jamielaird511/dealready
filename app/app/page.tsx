"use client";

import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function AppHome() {
  const router = useRouter();

  async function signOut() {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>App</h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        You're signed in. This route is protected by the proxy gate.
      </p>

      <button
        onClick={signOut}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.2)",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Sign out
      </button>
    </main>
  );
}
