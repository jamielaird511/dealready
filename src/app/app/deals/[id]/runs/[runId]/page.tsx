"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function RunResultsPage() {
  const params = useParams();
  const router = useRouter();
  const dealIdRaw = params?.id;
  const runIdRaw = params?.runId;
  const dealId = Array.isArray(dealIdRaw) ? dealIdRaw[0] : dealIdRaw;
  const runId = Array.isArray(runIdRaw) ? runIdRaw[0] : runIdRaw;

  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<any>(null);
  const [findings, setFindings] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const processTriggeredRef = useRef(false);

  useEffect(() => {
    async function loadRun() {
      if (!runId) return;

      const supabase = supabaseBrowser();

      const { data, error: fetchError } = await supabase
        .from("submission_runs")
        .select("*")
        .eq("id", runId)
        .maybeSingle();

      if (fetchError) {
        console.error("Error loading run:", fetchError);
        setError("Failed to load run");
        setLoading(false);
        return;
      }

      if (!data) {
        setError("not_found");
        setLoading(false);
        return;
      }

      setRun(data);
      setLoading(false);
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
      setProcessError("Missing runId");
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
          const errorMessage = data.error || "Failed to start processing";
          setProcessError(errorMessage);
          return;
        }

        const result = await response.json();
        if (result.skipped) {
          return;
        }
      } catch (err) {
        console.error("Error triggering run process:", err);
        setProcessError(err instanceof Error ? err.message : "Failed to start processing");
      }
    }

    triggerProcess();
  }, [run, runId]);

  useEffect(() => {
    async function loadFindings() {
      if (!runId) return;

      const supabase = supabaseBrowser();

      const { data, error: fetchError } = await supabase
        .from("submission_run_findings")
        .select("*")
        .eq("run_id", runId)
        .order("created_at", { ascending: true });

      if (fetchError) {
        console.error("Error loading findings:", fetchError);
        return;
      }

      setFindings(data || []);
    }

    if (runId) {
      loadFindings();
    }
  }, [runId]);

  // Poll for run status updates if still queued or running
  useEffect(() => {
    if (!runId || !run || (run.status !== "queued" && run.status !== "running")) {
      return;
    }

    const interval = setInterval(async () => {
      const supabase = supabaseBrowser();

      const { data, error } = await supabase
        .from("submission_runs")
        .select("*")
        .eq("id", runId)
        .maybeSingle();

      if (error) {
        console.error("Error polling run status:", error);
        return;
      }

      if (data) {
        setRun(data);
        
        // Reload findings if run completed
        if (data.status === "completed" || data.status === "failed") {
          const { data: findingsData } = await supabase
            .from("submission_run_findings")
            .select("*")
            .eq("run_id", runId)
            .order("created_at", { ascending: true });

          if (findingsData) {
            setFindings(findingsData);
          }
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [run, runId]);

  if (loading) {
    return (
      <main style={{ maxWidth: 1200, margin: "40px auto", padding: 16 }}>
        <p>Loading run results...</p>
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
              onClick={() => router.push(dealId ? `/app/deals/${dealId}` : "/app")}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.2)",
                cursor: "pointer",
                fontWeight: 600,
                background: "white",
              }}
            >
              Back to Deal
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
            Please try again later.
          </p>
          <button
            onClick={() => router.push(dealId ? `/app/deals/${dealId}` : "/app")}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: "pointer",
              fontWeight: 600,
              background: "white",
            }}
          >
            Back to Deal
          </button>
        </div>
      </main>
    );
  }

  const statusColors: Record<string, { bg: string; color: string }> = {
    queued: { bg: "#e5e7eb", color: "#374151" },
    running: { bg: "#dbeafe", color: "#1e40af" },
    completed: { bg: "#d1fae5", color: "#065f46" },
    failed: { bg: "#fee2e2", color: "#991b1b" },
  };

  const severityColors: Record<string, { bg: string; color: string }> = {
    critical: { bg: "#fee2e2", color: "#991b1b" },
    warning: { bg: "#fef3c7", color: "#92400e" },
    info: { bg: "#d1fae5", color: "#065f46" },
  };

  const statusColor = statusColors[run.status] || statusColors.queued;

  const criticalCount = findings.filter(f => f.severity === "critical").length;
  const warningCount = findings.filter(f => f.severity === "warning").length;
  const infoCount = findings.filter(f => f.severity === "info").length;

  // Handler to update finding workflow_state
  async function handleWorkflowStateChange(findingId: string, newWorkflowState: string) {
    try {
      const response = await fetch(`/api/dealsense/findings/${findingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workflow_state: newWorkflowState }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error("Failed to update finding workflow_state:", error);
        alert(`Failed to update status: ${error.error || "Unknown error"}`);
        return;
      }

      // Reload findings to reflect the update
      const supabase = supabaseBrowser();
      const { data: findingsData } = await supabase
        .from("submission_run_findings")
        .select("*")
        .eq("run_id", runId)
        .order("created_at", { ascending: true });

      if (findingsData) {
        setFindings(findingsData);
      }
    } catch (err) {
      console.error("Error updating finding workflow_state:", err);
      alert("Failed to update status. Please try again.");
    }
  }

  return (
    <main style={{ maxWidth: 1200, margin: "40px auto", padding: 16 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => router.push(dealId ? `/app/deals/${dealId}` : "/app")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            cursor: "pointer",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          ← Back to Deal
        </button>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 0 }}>DealSense Run Results</h1>
      </div>

      {/* Run Status Card */}
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.2)",
          borderRadius: 10,
          padding: 20,
          background: "white",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 0 }}>Run Status</h2>
          <span
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              background: statusColor.bg,
              color: statusColor.color,
              fontSize: 13,
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          >
            {run.status}
          </span>
        </div>
        <div style={{ fontSize: 14, color: "#6b7280" }}>
          <div>Started: {new Date(run.created_at).toLocaleString()}</div>
          {run.updated_at && run.updated_at !== run.created_at && (
            <div>Last updated: {new Date(run.updated_at).toLocaleString()}</div>
          )}
        </div>
        {processError && (
          <div style={{ marginTop: 12, padding: 12, background: "#fee2e2", borderRadius: 8, border: "1px solid #dc2626" }}>
            <p style={{ fontSize: 13, color: "#991b1b", margin: 0 }}>
              Error starting processing: {processError}
            </p>
          </div>
        )}
      </div>

      {/* Findings Summary */}
      {(run.status === "completed" || run.status === "failed") && (
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.2)",
            borderRadius: 10,
            padding: 20,
            background: "white",
            marginBottom: 24,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Findings Summary</h2>
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                background: "#fee2e2",
                color: "#991b1b",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Critical: {criticalCount}
            </div>
            <div
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                background: "#fef3c7",
                color: "#92400e",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Warnings: {warningCount}
            </div>
            <div
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                background: "#d1fae5",
                color: "#065f46",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Info: {infoCount}
            </div>
          </div>

          {/* Findings List */}
          {findings.length === 0 ? (
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: 8,
                padding: 20,
                background: "#f9fafb",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: 13, opacity: 0.6 }}>
                No findings found.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {findings.map((finding) => {
                const colors = severityColors[finding.severity] ?? severityColors.info;

                return (
                  <div
                    key={finding.id}
                    style={{
                      padding: "12px 16px",
                      background: "#f9fafb",
                      borderRadius: 8,
                      border: `1px solid ${colors.color}20`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 4,
                            background: colors.bg,
                            color: colors.color,
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: "capitalize",
                          }}
                        >
                          {finding.severity}
                        </span>
                        {finding.category && (
                          <span style={{ fontSize: 12, color: "#6b7280" }}>
                            {finding.category}
                          </span>
                        )}
                      </div>
                      <select
                        value={finding.workflow_state || finding.status || "open"}
                        onChange={(e) => handleWorkflowStateChange(finding.id, e.target.value)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 4,
                          border: "1px solid rgba(0,0,0,0.2)",
                          fontSize: 12,
                          cursor: "pointer",
                          background: "white",
                        }}
                      >
                        <option value="open">Open</option>
                        <option value="acknowledged">Acknowledged</option>
                        <option value="resolved">Resolved</option>
                        <option value="dismissed">Dismissed</option>
                      </select>
                    </div>
                    <p style={{ fontSize: 14, margin: 0, color: "#374151" }}>
                      {finding.message}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Loading/Processing State */}
      {(run.status === "queued" || run.status === "running") && (
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.2)",
            borderRadius: 10,
            padding: 40,
            background: "white",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 14, opacity: 0.6, marginBottom: 8 }}>
            {run.status === "queued" ? "Starting..." : "Run is processing..."}
          </p>
          <p style={{ fontSize: 12, opacity: 0.5 }}>
            This page will update automatically when the run completes.
          </p>
        </div>
      )}
    </main>
  );
}
