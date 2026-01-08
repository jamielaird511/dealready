"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function MFAPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const canSubmit = useMemo(() => code.trim().length >= 6 && !!factorId && !!challengeId, [
    code,
    factorId,
    challengeId,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setErrorMsg(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      // Find the user's verified TOTP factor
      const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;

      if (factorsErr) {
        setErrorMsg(factorsErr.message);
        setLoading(false);
        return;
      }

      const totp = factorsData?.totp?.find((f) => f.status === "verified") ?? null;

      if (!totp) {
        // They don't have TOTP enrolled yet; push them to security setup
        router.replace("/settings/security");
        return;
      }

      setFactorId(totp.id);

      // Create challenge
      const { data: challengeData, error: challengeErr } =
        await supabase.auth.mfa.challenge({ factorId: totp.id });

      if (cancelled) return;

      if (challengeErr) {
        setErrorMsg(challengeErr.message);
        setLoading(false);
        return;
      }

      setChallengeId(challengeData.id);
      setLoading(false);
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!canSubmit) return;

    setVerifying(true);
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId: factorId!,
        challengeId: challengeId!,
        code: code.trim(),
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      // MFA is now satisfied (AAL2). Let middleware pass.
      router.replace("/");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Two-factor verification</h1>
      <p style={{ marginBottom: 16, opacity: 0.85 }}>
        Enter the 6-digit code from your authenticator app.
      </p>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <form onSubmit={onVerify}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            style={{ width: "100%", padding: 12, fontSize: 16, marginBottom: 12 }}
          />

          {errorMsg && (
            <div style={{ marginBottom: 12, color: "crimson" }}>
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || verifying}
            style={{ width: "100%", padding: 12, fontSize: 16 }}
          >
            {verifying ? "Verifying…" : "Verify"}
          </button>
        </form>
      )}
    </div>
  );
}
