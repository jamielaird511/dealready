"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type RunRow = { id?: string; status: string; created_at: string; updated_at?: string };
type FindingRow = { id: string; severity: string; workflow_state?: string; title?: string; category?: string; message?: string; fix?: string };

export default function RunResultsPage() {
  const params = useParams();
  const router = useRouter();
  const dealIdRaw = params?.id;
  const runIdRaw = params?.runId;
  const dealId = Array.isArray(dealIdRaw) ? dealIdRaw[0] : dealIdRaw;
  const runId = Array.isArray(runIdRaw) ? runIdRaw[0] : runIdRaw;

  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<RunRow | null>(null);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const processTriggeredRef = useRef(false);

  const missingRunId = !runId || runId === "undefined";
  const displayProcessError = processError ?? (missingRunId ? "Missing runId" : null);

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

    if (missingRunId) {
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
  }, [run, runId, missingRunId]);

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
      <div className="space-y-8">
        <p>Loading run results...</p>
      </div>
    );
  }

  if (error) {
    if (error === "not_found") {
      return (
        <div className="space-y-8">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
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
              Back to Deal Details
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
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
      </div>
    );
  }

  if (!run) {
    return (
      <div className="space-y-8">
        <p>Loading run results...</p>
      </div>
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
    if (!findingId) {
      console.error("Missing findingId in handleWorkflowStateChange");
      return;
    }

    try {
      const response = await fetch(`/api/dealsense/findings/${findingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workflow_state: newWorkflowState.toLowerCase() }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unable to read error");
        const errorJson = await response.json().catch(() => ({}));
        console.error("Failed to update finding workflow_state:", {
          status: response.status,
          statusText: response.statusText,
          errorText,
          errorJson,
        });
        alert(`Failed to update status: ${errorJson.error || errorText || "Unknown error"}`);
        return;
      }

      const result = await response.json();
      
      // Update local state immediately to reflect the new value
      setFindings((prevFindings) =>
        prevFindings.map((f) =>
          f.id === findingId
            ? { ...f, workflow_state: result.finding?.workflow_state ?? newWorkflowState.toLowerCase() }
            : f
        )
      );
    } catch (err) {
      console.error("Error updating finding workflow_state:", err);
      alert("Failed to update status. Please try again.");
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
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
          ← Back to Deal Details
        </button>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 0 }}>DealSense Run Results</h1>
      </div>

      {/* Run Status Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
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
        {displayProcessError && (
          <div style={{ marginTop: 12, padding: 12, background: "#fee2e2", borderRadius: 8, border: "1px solid #dc2626" }}>
            <p style={{ fontSize: 13, color: "#991b1b", margin: 0 }}>
              Error starting processing: {displayProcessError}
            </p>
          </div>
        )}
      </div>

      {/* Findings Summary */}
      {(run.status === "completed" || run.status === "failed") && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
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
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
              <p style={{ fontSize: 13, opacity: 0.6 }}>
                No findings found.
              </p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12, marginTop: 0 }}>
                Resolved and dismissed items are shown at the bottom.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {(() => {
                  // Sort findings: open/acknowledged first, resolved/dismissed last
                  const sortedFindings = [...findings].sort((a, b) => {
                    const aState = a.workflow_state ?? "open";
                    const bState = b.workflow_state ?? "open";
                    const activeStates = ["open", "acknowledged"];
                    const completedStates = ["resolved", "dismissed"];
                    
                    const aIsActive = activeStates.includes(aState);
                    const bIsActive = activeStates.includes(bState);
                    const aIsCompleted = completedStates.includes(aState);
                    const bIsCompleted = completedStates.includes(bState);
                    
                    // Active states come first
                    if (aIsActive && !bIsActive) return -1;
                    if (!aIsActive && bIsActive) return 1;
                    
                    // Completed states come last
                    if (aIsCompleted && !bIsCompleted) return 1;
                    if (!aIsCompleted && bIsCompleted) return -1;
                    
                    // Within same group, preserve original order
                    return 0;
                  });
                  
                  return sortedFindings.map((finding) => {
                    const colors = severityColors[finding.severity] ?? severityColors.info;
                    const workflowState = finding.workflow_state ?? "open";
                    const isCompleted = workflowState === "resolved" || workflowState === "dismissed";

                    return (
                      <div
                        key={finding.id}
                        style={{
                          padding: "12px 16px",
                          background: isCompleted ? "#f3f4f6" : "#f9fafb",
                          borderRadius: 8,
                          border: `1px solid ${isCompleted ? "rgba(0,0,0,0.1)" : `${colors.color}20`}`,
                          opacity: isCompleted ? 0.6 : 1,
                        }}
                      >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, justifyContent: "space-between" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
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
                          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#111827" }}>
                            {finding.title || "Finding"}
                          </h3>
                          {finding.category && (
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 10,
                                color: "#6b7280",
                                background: "#f3f4f6",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                              }}
                            >
                              {finding.category}
                            </span>
                          )}
                        </div>
                        {finding.message && (
                          <p style={{ fontSize: 13, margin: 0, color: "#6b7280", marginTop: 4 }}>
                            {finding.message}
                          </p>
                        )}
                        {finding.fix && finding.fix.trim() && (
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                            <p style={{ margin: 0, fontSize: 12, color: "#6b7280", flex: 1 }}>
                              <strong style={{ fontWeight: 600 }}>Next step:</strong> {finding.fix.trim()}
                            </p>
                            <button
                              type="button"
                              onClick={() => navigator.clipboard.writeText(finding.fix!.trim()).catch(() => {})}
                              style={{
                                padding: "2px 8px",
                                fontSize: 11,
                                fontWeight: 500,
                                borderRadius: 4,
                                border: "1px solid #d1d5db",
                                background: "#f9fafb",
                                color: "#374151",
                                cursor: "pointer",
                                flexShrink: 0,
                              }}
                            >
                              Copy
                            </button>
                          </div>
                        )}
                      </div>
                      <select
                        value={finding.workflow_state ?? "open"}
                        onChange={(e) => handleWorkflowStateChange(finding.id, e.target.value)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 4,
                          border: "1px solid rgba(0,0,0,0.2)",
                          fontSize: 12,
                          cursor: "pointer",
                          background: "white",
                          flexShrink: 0,
                        }}
                      >
                        <option value="open">Open</option>
                        <option value="acknowledged">Acknowledged</option>
                        <option value="resolved">Resolved</option>
                        <option value="dismissed">Dismissed</option>
                      </select>
                    </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </>
          )}
        </div>
      )}

      {/* Loading/Processing State */}
      {(run.status === "queued" || run.status === "running") && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
          <p style={{ fontSize: 14, opacity: 0.6, marginBottom: 8 }}>
            {run.status === "queued" ? "Starting..." : "Run is processing..."}
          </p>
          <p style={{ fontSize: 12, opacity: 0.5 }}>
            This page will update automatically when the run completes.
          </p>
        </div>
      )}
    </div>
  );
}
