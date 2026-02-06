"use client";

import { useState } from "react";

export type AssessmentFinding = {
  id?: string;
  run_id: string;
  title?: string | null;
  severity?: string | null;
  category?: string | null;
  message?: string | null;
  fix?: string | null;
  score_impact?: number | null;
  workflow_state?: string | null;
  created_at?: string | null;
};

export type AssessmentRun = {
  id: string;
  score?: number;
  assessment_status?: string;
  assessed_at?: string | null;
  top_fixes?: string[];
};

type AssessmentCardProps = {
  findings: AssessmentFinding[];
  run: AssessmentRun | null;
  runLoading: boolean;
  runError: string | null;
  runNowLoading: boolean;
  runNowError: string | null;
  findingActionError: string | null;
  findingActionLoadingId: string | null;
  onRunAssessment: () => void;
  onUpdateWorkflowState: (findingId: string, state: "acknowledged" | "resolved") => void;
};

function FindingItem({
  f,
  loadingId,
  onAcknowledge,
  onResolve,
  resolvedView,
}: {
  f: AssessmentFinding;
  loadingId: string | null;
  onAcknowledge: () => void;
  onResolve: () => void;
  resolvedView?: boolean;
}) {
  const loading = f.id != null && loadingId === f.id;
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        {f.severity && (
          <span
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              textTransform: "capitalize",
              background: f.severity === "critical" ? "#fee2e2" : f.severity === "warning" ? "#fef3c7" : "#e0e7ff",
              color: f.severity === "critical" ? "#991b1b" : f.severity === "warning" ? "#92400e" : "#3730a3",
            }}
          >
            {f.severity}
          </span>
        )}
        {f.workflow_state && !resolvedView && (
          <span style={{ fontSize: 11, opacity: 0.8 }}>{String(f.workflow_state).replace(/_/g, " ")}</span>
        )}
        {f.title && <span style={{ fontWeight: 600, color: "#374151" }}>{f.title}</span>}
        {f.id != null && !resolvedView && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={loading || f.workflow_state !== "open"}
              onClick={onAcknowledge}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                border: "1px solid #6b7280",
                background: "white",
                cursor: loading || f.workflow_state !== "open" ? "not-allowed" : "pointer",
                opacity: loading || f.workflow_state !== "open" ? 0.6 : 1,
              }}
            >
              {loading ? "Saving…" : "Acknowledge"}
            </button>
            <button
              type="button"
              disabled={loading || f.workflow_state === "resolved"}
              onClick={onResolve}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                border: "1px solid #059669",
                background: "#ecfdf5",
                color: "#047857",
                cursor: loading || f.workflow_state === "resolved" ? "not-allowed" : "pointer",
                opacity: loading || f.workflow_state === "resolved" ? 0.6 : 1,
              }}
            >
              {loading ? "Saving…" : "Resolve"}
            </button>
          </span>
        )}
        {resolvedView && f.workflow_state === "resolved" && (
          <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>Resolved</span>
        )}
      </div>
      {f.category && <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{f.category}</div>}
      {f.message && <p style={{ margin: "0 0 6px 0", color: "#4b5563" }}>{f.message}</p>}
      {f.fix && <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}><strong>Fix:</strong> {f.fix}</p>}
      {(f.score_impact != null || f.created_at) && (
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.6 }}>
          {f.score_impact != null && `Impact: ${f.score_impact}`}
          {f.score_impact != null && f.created_at && " · "}
          {f.created_at && `Created: ${new Date(f.created_at).toLocaleString()}`}
        </div>
      )}
    </div>
  );
}

export function AssessmentCard({
  findings,
  run,
  runLoading,
  runError,
  runNowLoading,
  runNowError,
  findingActionError,
  findingActionLoadingId,
  onRunAssessment,
  onUpdateWorkflowState,
}: AssessmentCardProps) {
  const [warningsExpanded, setWarningsExpanded] = useState(false);
  const [resolvedExpanded, setResolvedExpanded] = useState(false);

  const activeFindings = findings.filter((f) => f.workflow_state !== "resolved");
  const resolvedFindings = findings.filter((f) => f.workflow_state === "resolved");
  const criticalFindings = activeFindings.filter((f) => f.severity === "critical");
  const warningFindings = activeFindings.filter((f) => f.severity === "warning");
  const infoFindings = activeFindings.filter((f) => f.severity === "info");

  const readiness = criticalFindings.length > 0 ? "not_ready" : "ready";

  if (runLoading) {
    return (
      <div style={{ border: "1px solid rgba(0,0,0,0.2)", borderRadius: 10, padding: 20, background: "white", marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Assessment</h2>
        <p style={{ fontSize: 14, opacity: 0.6 }}>Loading run…</p>
      </div>
    );
  }

  if (!run) {
    return (
      <div style={{ border: "1px solid rgba(0,0,0,0.2)", borderRadius: 10, padding: 20, background: "white", marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Assessment</h2>
        {runNowError && (
          <div style={{ fontSize: 14, color: "crimson", marginBottom: 12, padding: 10, borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca" }}>
            Error: {runNowError}
          </div>
        )}
        <p style={{ fontSize: 14, opacity: 0.6, marginBottom: 12 }}>No runs yet.</p>
        <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>Run assessment to see status and findings here.</p>
        <button
          type="button"
          onClick={onRunAssessment}
          disabled={runNowLoading}
          style={{
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 8,
            border: "1px solid #4f46e5",
            background: runNowLoading ? "#c7d2fe" : "#4f46e5",
            color: "white",
            cursor: runNowLoading ? "not-allowed" : "pointer",
            opacity: runNowLoading ? 0.8 : 1,
          }}
        >
          {runNowLoading ? "Running…" : "Run assessment"}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.2)",
        borderRadius: 10,
        padding: 20,
        background: "white",
        marginBottom: 24,
      }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Assessment</h2>

      {runNowLoading && (
        <p style={{ fontSize: 14, opacity: 0.6, marginBottom: 12 }}>Running assessment…</p>
      )}
      {runNowError && (
        <div style={{ fontSize: 14, color: "crimson", marginBottom: 12, padding: 10, borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca" }}>
          Error: {runNowError}
        </div>
      )}
      {findingActionError && (
        <div style={{ fontSize: 14, color: "crimson", marginBottom: 12, padding: 10, borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca" }}>
          Error: {findingActionError}
        </div>
      )}

      {/* Status banner */}
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 8,
          background: readiness === "not_ready" ? "#fef2f2" : "#ecfdf5",
          border: readiness === "not_ready" ? "1px solid #fecaca" : "1px solid #a7f3d0",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: readiness === "not_ready" ? "#991b1b" : "#047857" }}>
          {readiness === "not_ready" ? "Not ready to submit" : "Ready to submit"}
        </div>
        <div style={{ fontSize: 13, marginTop: 4, opacity: 0.9 }}>
          {readiness === "not_ready" ? `${criticalFindings.length} critical issue${criticalFindings.length !== 1 ? "s" : ""}` : "No critical issues found"}
        </div>
      </div>

      {/* Critical findings */}
      {criticalFindings.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#374151" }}>Critical findings</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {criticalFindings.map((f, i) => (
              <FindingItem
                key={f.id ?? i}
                f={f}
                loadingId={findingActionLoadingId}
                onAcknowledge={() => f.id && onUpdateWorkflowState(f.id, "acknowledged")}
                onResolve={() => f.id && onUpdateWorkflowState(f.id, "resolved")}
              />
            ))}
          </div>
        </div>
      )}

      {/* Warnings (collapsed) */}
      {warningFindings.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setWarningsExpanded((e) => !e)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 600,
              color: "#374151",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {warningsExpanded ? "Hide warnings" : `Show warnings (${warningFindings.length})`}
          </button>
          {warningsExpanded && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
              {warningFindings.map((f, i) => (
                <FindingItem
                  key={f.id ?? i}
                  f={f}
                  loadingId={findingActionLoadingId}
                  onAcknowledge={() => f.id && onUpdateWorkflowState(f.id, "acknowledged")}
                  onResolve={() => f.id && onUpdateWorkflowState(f.id, "resolved")}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info findings: hidden for now per task */}

      {/* Resolved (collapsible, default collapsed) */}
      {resolvedFindings.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setResolvedExpanded((e) => !e)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 600,
              color: "#374151",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Resolved findings ({resolvedFindings.length})
          </button>
          {resolvedExpanded && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
              {resolvedFindings.map((f, i) => (
                <FindingItem
                  key={f.id ?? i}
                  f={f}
                  loadingId={findingActionLoadingId}
                  onAcknowledge={() => {}}
                  onResolve={() => {}}
                  resolvedView
                />
              ))}
            </div>
          )}
        </div>
      )}

      {findings.length === 0 && (
        <p style={{ fontSize: 14, opacity: 0.6, marginBottom: 16 }}>No findings for this run.</p>
      )}

      <button
        type="button"
        onClick={onRunAssessment}
        disabled={runNowLoading}
        style={{
          marginTop: 8,
          padding: "8px 16px",
          fontSize: 14,
          fontWeight: 600,
          borderRadius: 8,
          border: "1px solid #4f46e5",
          background: runNowLoading ? "#c7d2fe" : "#4f46e5",
          color: "white",
          cursor: runNowLoading ? "not-allowed" : "pointer",
          opacity: runNowLoading ? 0.8 : 1,
        }}
      >
        {runNowLoading ? "Running…" : "Run assessment"}
      </button>
    </div>
  );
}
