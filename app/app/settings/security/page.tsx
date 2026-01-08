"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type SupabaseMfaFactor = {
  id: string;
  factor_type: string;
  status?: string;
  friendly_name?: string | null;
  created_at?: string;
};

type EnrollData = {
  factorId: string;
  qr: string; // data URL
  secret: string;
  uri: string;
};

export default function SecuritySettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [factors, setFactors] = useState<SupabaseMfaFactor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [enrolling, setEnrolling] = useState(false);
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const hasVerifiedTotp = useMemo(() => {
    return factors.some(
      (f) => f.factor_type === "totp" && (f.status === "verified" || f.status === "active")
    );
  }, [factors]);

  async function load() {
    setLoading(true);
    setError(null);
    setInfo(null);

    const supabase = supabaseBrowser();

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      setLoading(false);
      setError(userErr.message);
      return;
    }

    const email = userRes.user?.email ?? null;
    setUserEmail(email);

    const { data: factorRes, error: factorErr } = await supabase.auth.mfa.listFactors();
    if (factorErr) {
      setLoading(false);
      setError(factorErr.message);
      return;
    }

    // Factor response shape: { all: Factor[], totp: Factor[] }
    const all = (factorRes as any)?.all ?? [];
    setFactors(all);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startEnroll() {
    setError(null);
    setInfo(null);
    setEnroll(null);
    setCode("");

    setEnrolling(true);
    try {
      const supabase = supabaseBrowser();

      // Create an enrollment challenge for a TOTP factor
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator app",
      } as any);

      if (error) throw error;

      // Supabase returns: { id, type, totp: { secret, uri, qr_code } } (shape can vary)
      const factorId: string = (data as any).id;
      const secret: string = (data as any)?.totp?.secret;
      const uri: string = (data as any)?.totp?.uri;

      if (!factorId || !secret || !uri) {
        throw new Error("Missing enrollment data from Supabase.");
      }

      const qrDataUrl = await QRCode.toDataURL(uri);

      setEnroll({
        factorId,
        qr: qrDataUrl,
        secret,
        uri,
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to start TOTP enrollment.");
    } finally {
      setEnrolling(false);
    }
  }

  async function verifyEnroll() {
    if (!enroll) return;
    const trimmed = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setVerifying(true);
    setError(null);
    setInfo(null);

    try {
      const supabase = supabaseBrowser();

      // Create a challenge first
      const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: enroll.factorId,
      } as any);
      if (challengeErr) throw challengeErr;

      const challengeId: string = (challengeData as any).id;
      if (!challengeId) throw new Error("Missing challenge id from Supabase.");

      // Verify the code
      const { data: verifyData, error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId,
        code: trimmed,
      } as any);

      if (verifyErr) throw verifyErr;

      // Some clients return a new session; if so, set it
      const maybeSession = (verifyData as any)?.session;
      if (maybeSession) {
        await supabase.auth.setSession(maybeSession);
      }

      setInfo("Authenticator app enabled.");
      setEnroll(null);
      setCode("");

      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to verify code.");
    } finally {
      setVerifying(false);
    }
  }

  async function unenrollFactor(factorId: string) {
    if (!confirm("Remove this MFA factor?")) return;

    setError(null);
    setInfo(null);

    try {
      const supabase = supabaseBrowser();

      const { error } = await supabase.auth.mfa.unenroll({ factorId } as any);
      if (error) throw error;

      setInfo("MFA factor removed.");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to remove factor.");
    }
  }

  function signOut() {
    const supabase = supabaseBrowser();
    supabase.auth.signOut().finally(() => {
      router.push("/login");
    });
  }

  function scrollToFactors() {
    const element = document.getElementById("enrolled-factors");
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      element.focus();
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Security</h1>
      <p style={{ marginBottom: 24, color: "#555" }}>
        Manage your account security settings (under <code>/app</code>).
      </p>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 20,
          marginBottom: 16,
          background: "white",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Signed in as</div>
            <div style={{ color: "#444" }}>{userEmail ?? "—"}</div>
          </div>

          <button
            onClick={signOut}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
              fontWeight: 600,
              height: 42,
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 20,
          background: "white",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Two-factor authentication</div>
            <div style={{ color: "#444" }}>
              Status:{" "}
              <span style={{ fontWeight: 700 }}>{hasVerifiedTotp ? "Enabled" : "Not enabled"}</span>
            </div>
          </div>

          {hasVerifiedTotp ? (
            <button
              onClick={scrollToFactors}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #4f46e5",
                background: "white",
                color: "#4f46e5",
                cursor: "pointer",
                fontWeight: 700,
                height: 42,
              }}
            >
              Manage 2FA
            </button>
          ) : (
            <button
              onClick={startEnroll}
              disabled={loading || enrolling}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #4f46e5",
                background: enrolling ? "#eef2ff" : "white",
                color: "#4f46e5",
                cursor: loading || enrolling ? "not-allowed" : "pointer",
                fontWeight: 700,
                height: 42,
              }}
            >
              {enrolling ? "Preparing…" : "Enable 2FA (TOTP)"}
            </button>
          )}
        </div>

        {loading && <p style={{ marginTop: 16, color: "#666" }}>Loading…</p>}

        {error && (
          <p style={{ marginTop: 16, color: "#b91c1c", fontWeight: 600 }}>
            {error}
          </p>
        )}
        {info && (
          <p style={{ marginTop: 16, color: "#065f46", fontWeight: 600 }}>
            {info}
          </p>
        )}

        {enroll && (
          <div style={{ marginTop: 18 }}>
            <hr style={{ border: "none", borderTop: "1px solid #eee", margin: "18px 0" }} />

            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Set up authenticator app</h2>

            <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                {/* QR */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={enroll.qr} alt="TOTP QR code" style={{ width: 180, height: 180 }} />
              </div>

              <div style={{ flex: 1, minWidth: 260 }}>
                <ol style={{ marginTop: 0, paddingLeft: 18, color: "#333" }}>
                  <li style={{ marginBottom: 8 }}>
                    Open Google Authenticator / 1Password / Authy and scan the QR code.
                  </li>
                  <li style={{ marginBottom: 8 }}>
                    If you can't scan, enter this secret manually:
                    <div
                      style={{
                        marginTop: 8,
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid #eee",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        wordBreak: "break-all",
                        background: "#fafafa",
                      }}
                    >
                      {enroll.secret}
                    </div>
                  </li>
                  <li style={{ marginBottom: 8 }}>
                    Enter the 6-digit code from the app to finish setup.
                  </li>
                </ol>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="numeric"
                    placeholder="123456"
                    style={{
                      width: 160,
                      padding: 12,
                      fontSize: 16,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      outline: "none",
                    }}
                  />

                  <button
                    onClick={verifyEnroll}
                    disabled={verifying}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #111827",
                      background: "#111827",
                      color: "white",
                      cursor: verifying ? "not-allowed" : "pointer",
                      fontWeight: 800,
                      height: 44,
                    }}
                  >
                    {verifying ? "Verifying…" : "Verify & enable"}
                  </button>

                  <button
                    onClick={() => {
                      setEnroll(null);
                      setCode("");
                      setError(null);
                      setInfo(null);
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 700,
                      height: 44,
                    }}
                  >
                    Cancel
                  </button>
                </div>

                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer", color: "#555" }}>Advanced</summary>
                  <div style={{ marginTop: 8, color: "#444", fontSize: 13 }}>
                    <div style={{ marginBottom: 6 }}>
                      <b>otpauth URI</b> (debug):
                    </div>
                    <div
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid #eee",
                        background: "#fafafa",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        wordBreak: "break-all",
                      }}
                    >
                      {enroll.uri}
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </div>
        )}

        <div id="enrolled-factors" tabIndex={-1} style={{ marginTop: 18 }}>
          <hr style={{ border: "none", borderTop: "1px solid #eee", margin: "18px 0" }} />
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>Enrolled factors</h3>

          {factors.length === 0 ? (
            <p style={{ color: "#666" }}>No MFA factors enrolled.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {factors.map((f) => (
                <div
                  key={f.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>
                      {f.factor_type.toUpperCase()}{" "}
                      <span style={{ fontWeight: 600, color: "#555" }}>
                        {f.friendly_name ? `· ${f.friendly_name}` : ""}
                      </span>
                    </div>
                    <div style={{ color: "#666", fontSize: 13 }}>
                      Status: {f.status ?? "unknown"} · ID:{" "}
                      <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                        {f.id}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => unenrollFactor(f.id)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #ef4444",
                      background: "white",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontWeight: 800,
                      height: 42,
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
