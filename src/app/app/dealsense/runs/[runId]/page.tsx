"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

type RunRow = { status?: string; score?: number; assessment_status?: string; top_fixes?: string[] };
type FindingRow = { id: string; severity?: string; title?: string; message?: string; fix?: string };

export default function DealSenseRunPage() {
  const params = useParams();
  const router = useRouter();
  const runIdRaw = params?.runId;
  const runId = Array.isArray(runIdRaw) ? runIdRaw[0] : runIdRaw;

  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<RunRow | null>(null);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const processTriggeredRef = useRef(false);

  // Load run and findings
  useEffect(() => {
    async function loadRun() {
      if (!runId) return;

      try {
        const response = await fetch(`/api/dealsense/runs/${runId}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError("not_found");
          } else {
            setError("Failed to load run");
          }
          setLoading(false);
          return;
        }

        const data = await response.json();
        setRun(data.run);
        setFindings(data.findings || []);
        setLoading(false);
      } catch (err) {
        console.error("Error loading run:", err);
        setError("Failed to load run");
        setLoading(false);
      }
    }

    if (runId) {
      loadRun();
    }
  }, [runId]);

  // Trigger processing when run is queued (once per page load)
  useEffect(() => {
    if (!run || run.status !== "queued" || processTriggeredRef.current) {
      return;
    }

    if (!runId || runId === "undefined") {
      return;
    }

    processTriggeredRef.current = true;

    async function triggerProcess() {
      try {
        const response = await fetch(`/api/dealsense/runs/${runId}/process`, {
          method: "POST",
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          if (data.skipped) {
            return;
          }
          console.error("Failed to start processing:", data.error);
          return;
        }

        const result = await response.json();
        if (result.skipped) {
          return;
        }
      } catch (err) {
        console.error("Error triggering run process:", err);
      }
    }

    triggerProcess();
  }, [run, runId]);

  // Poll for run status updates if still queued or running
  useEffect(() => {
    if (!runId || !run || (run.status !== "queued" && run.status !== "running")) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/dealsense/runs/${runId}`);

        if (!response.ok) {
          console.error("Error polling run status");
          return;
        }

        const data = await response.json();
        if (data.run) {
          setRun(data.run);
          setFindings(data.findings || []);

          // Stop polling if completed or failed
          if (data.run.status === "completed" || data.run.status === "failed") {
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error("Error polling run:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [run, runId]);

  if (loading) {
    return (
      <main style={{ maxWidth: 1200, margin: "40px auto", padding: 16 }}>
        <p>Loading assessment...</p>
      </main>
    );
  }

  if (error) {
    if (error === "not_found") {
      return (
        <main style={{ maxWidth: 1200, margin: "40px auto", padding: 16 }}>
          <div
            style={{
              border: "1px solid rgba(0,0,0,0.2)",
              borderRadius: 10,
              padding: 40,
              background: "white",
              textAlign: "center",
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              Run not found
            </h2>
            <p style={{ color: "#6b7280", marginBottom: 24 }}>
              This run may not exist or you may not have permission to view it.
            </p>
            <button
              onClick={() => router.push("/app")}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.2)",
                cursor: "pointer",
                fontWeight: 600,
                background: "white",
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      );
    }

    return (
      <main style={{ maxWidth: 1200, margin: "40px auto", padding: 16 }}>
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.2)",
            borderRadius: 10,
            padding: 40,
            background: "white",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
            Unable to load run
          </h2>
          <p style={{ color: "#6b7280", marginBottom: 24 }}>
            {error}
          </p>
          <button
            onClick={() => router.push("/app")}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: "pointer",
              fontWeight: 600,
              background: "white",
            }}
          >
            Back to Dashboard
          </button>
        </div>
      </main>
    );
  }

  const statusColors: Record<string, { bg: string; color: string }> = {
    not_ready: { bg: "#fee2e2", color: "#991b1b" },
    needs_review: { bg: "#fef3c7", color: "#92400e" },
    ready: { bg: "#d1fae5", color: "#065f46" },
  };

  const severityColors: Record<string, { bg: string; color: string }> = {
    critical: { bg: "#fee2e2", color: "#991b1b" },
    warning: { bg: "#fef3c7", color: "#92400e" },
    info: { bg: "#dbeafe", color: "#1e40af" },
  };

  const isProcessing = run?.status === "queued" || run?.status === "running";

  return (
    <main style={{ maxWidth: 1200, margin: "40px auto", padding: 16 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
          DealSense Assessment
        </h1>

        {isProcessing && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: "#dbeafe",
              color: "#1e40af",
              marginBottom: 24,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                border: "2px solid #1e40af",
                borderTop: "2px solid transparent",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 600 }}>Processing...</span>
          </div>
        )}

        {run?.score !== null && run?.score !== undefined && (
          <div
            style={{
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 10,
              padding: 24,
              background: "white",
              marginBottom: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 4 }}>
                  {run.score}/100
                </h2>
                <p style={{ color: "#6b7280", fontSize: 14 }}>Assessment Score</p>
              </div>
              {run.assessment_status && (
                <div
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: statusColors[run.assessment_status]?.bg || "#e5e7eb",
                    color: statusColors[run.assessment_status]?.color || "#374151",
                    fontSize: 14,
                    fontWeight: 600,
                    textTransform: "capitalize",
                  }}
                >
                  {run.assessment_status.replace("_", " ")}
                </div>
              )}
            </div>
          </div>
        )}

        {run?.top_fixes && Array.isArray(run.top_fixes) && run.top_fixes.length > 0 && (() => {
          const topFixes = run.top_fixes ?? [];
          return (
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: 10,
                padding: 24,
                background: "white",
                marginBottom: 24,
              }}
            >
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
                Top Fixes
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {topFixes.map((fix: string, idx: number) => (
                  <li
                    key={idx}
                    style={{
                      padding: "8px 0",
                      borderBottom: idx < topFixes.length - 1 ? "1px solid #e5e7eb" : "none",
                    }}
                  >
                    {fix}
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        <div
          style={{
            border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: 10,
            padding: 24,
            background: "white",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
            Findings ({findings.length})
          </h3>

          {findings.length === 0 ? (
            <p style={{ color: "#6b7280" }}>No findings to display.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {findings.map((finding: FindingRow) => (
                <div
                  key={finding.id}
                  style={{
                    padding: 16,
                    border: "1px solid rgba(0,0,0,0.1)",
                    borderRadius: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    {finding.severity && (
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: 4,
                          background: severityColors[finding.severity]?.bg || "#e5e7eb",
                          color: severityColors[finding.severity]?.color || "#374151",
                          fontSize: 12,
                          fontWeight: 600,
                          textTransform: "capitalize",
                        }}
                      >
                        {finding.severity}
                      </span>
                    )}
                    {finding.title && (
                      <h4 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                        {finding.title}
                      </h4>
                    )}
                  </div>
                  {finding.message && (
                    <p style={{ color: "#374151", marginBottom: finding.fix ? 8 : 0 }}>
                      {finding.message}
                    </p>
                  )}
                  {finding.fix && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 12,
                        background: "#f9fafb",
                        borderRadius: 6,
                        borderLeft: "3px solid #3b82f6",
                      }}
                    >
                      <strong style={{ fontSize: 13, color: "#1e40af" }}>Fix: </strong>
                      <span style={{ fontSize: 13, color: "#374151" }}>{finding.fix}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `
      }} />
    </main>
  );
}
