"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { buildReportDisplay } from "@/lib/dealsense/reportDisplay";

type DocCompletenessSnapshot = {
  required: { uploaded: number; pending: number; missing: number; not_required: number };
  recommended: { uploaded: number; pending: number; missing: number; not_required: number };
  supporting: { uploaded: number; pending: number; missing: number; not_required: number };
  completenessPct: number;
};
type RunRow = {
  id?: string;
  status: string;
  created_at: string;
  updated_at?: string;
  submission_id?: string;
  doc_completeness_snapshot?: DocCompletenessSnapshot | null;
  score?: number | null;
  assessment_status?: string | null;
  deal_summary_data?: unknown | null;
  deal_summary_text?: string | null;
};
type FindingRow = { id: string; severity: string; workflow_state?: string; title?: string; category?: string; message?: string; fix?: string; score_impact?: number | null };

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
  const [runAgainLoading, setRunAgainLoading] = useState(false);
  const [runAgainError, setRunAgainError] = useState<string | null>(null);
  const processTriggeredRef = useRef(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const processingStartRef = useRef<number | null>(null);

  const missingRunId = !runId || runId === "undefined";
  const displayProcessError = processError ?? (missingRunId ? "Missing runId" : null);

  useEffect(() => {
    if (!runId) {
      setLoading(false);
      return;
    }
    async function loadRun() {
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

  // Track elapsed time while run is queued/running and drive stage messaging
  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) {
      processingStartRef.current = null;
      setElapsedSeconds(0);
      return;
    }

    if (!processingStartRef.current) {
      processingStartRef.current = Date.now();
    }

    const interval = setInterval(() => {
      if (!processingStartRef.current) return;
      const diff = Math.floor((Date.now() - processingStartRef.current) / 1000);
      setElapsedSeconds(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [run?.status]);

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
  const readinessScore = run.score ?? 0;

  const report = (run.status === "completed" || run.status === "failed")
    ? buildReportDisplay(run, findings)
    : null;

  const dealSummary = (run.deal_summary_data && typeof run.deal_summary_data === "object")
    ? (run.deal_summary_data as any)
    : null;
  const summaryText = (field: any, kind?: "purpose" | "repayment") => {
    const v = typeof field?.value === "string" ? field.value.trim() : "";
    if (!v) {
      if (kind === "purpose") return "Purpose not clearly described in pack";
      if (kind === "repayment") return "Primary repayment source not clearly described";
      return "Not clearly documented";
    }
    if (kind === "purpose") {
      const lower = v.toLowerCase();
      if (lower === "business_purchase") return "Business acquisition";
      if (lower === "working_capital") return "Working capital";
      if (lower === "property_purchase") return "Property purchase";
      if (lower === "shareholder_buyout") return "Shareholder buyout";
      if (lower === "refinance") return "Refinance";
      if (lower === "startup") return "Startup funding";
      if (lower === "equipment") return "Equipment acquisition";
    }
    if (kind === "repayment") {
      const lower = v.toLowerCase();
      if (lower.includes("salary") || lower.includes("wage")) return "Personal income (salary/wages)";
      if (lower.includes("business cash flow") || lower.includes("trading")) return "Business trading cash flow";
      if (lower.includes("sale proceeds")) return "Sale proceeds from asset disposal";
      if (lower.includes("refinance")) return "Refinance of existing facilities";
      if (lower.includes("rental") || lower.includes("rent")) return "Property rental income";
    }
    return v;
  };
  const formatCurrencyShort = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
    return `$${value.toFixed(0)}`;
  };
  const summaryNum = (field: any) => {
    const v = typeof field?.value === "number" && Number.isFinite(field.value) ? field.value : null;
    if (v == null) return "Not clearly documented";
    return formatCurrencyShort(Math.round(v));
  };
  const creditPurpose = dealSummary ? summaryText(dealSummary.purpose, "purpose") : "Not clearly documented";
  const creditRepayment = dealSummary ? summaryText(dealSummary.repayment_source, "repayment") : "Not clearly documented";
  const creditFinancialSupport = (() => {
    const ff = dealSummary?.forecast_figures;
    const rev = ff ? summaryNum(ff.revenue) : null;
    const ebitda = ff ? summaryNum(ff.ebitda) : null;
    const dscr =
      typeof ff?.dscr?.value === "number" && Number.isFinite(ff.dscr.value)
        ? ff.dscr.value.toFixed(2)
        : null;
    const snippets = [];
    if (rev && rev !== "Not clearly documented") snippets.push(`forecast revenue of ${rev}`);
    if (ebitda && ebitda !== "Not clearly documented") snippets.push(`forecast EBITDA of ${ebitda}`);
    if (dscr) snippets.push(`DSCR around ${dscr}`);
    if (snippets.length === 0) return "Not clearly documented";
    return `Forecasts indicate ${snippets.join(", ")}.`;
  })();
  const creditSecondarySupport = (() => {
    const ppl = Array.isArray(dealSummary?.key_people) ? dealSummary.key_people : [];
    const names = ppl
      .filter((p: any) => typeof p?.name === "string" && p.name.trim())
      .slice(0, 2)
      .map((p: any) => {
        const roleRaw = typeof p?.role === "string" ? p.role.trim() : "";
        if (roleRaw && ["borrower", "applicant"].includes(roleRaw.toLowerCase())) {
          return p.name.trim();
        }
        const role = roleRaw ? ` — ${roleRaw}` : "";
        return `${p.name.trim()}${role}`;
      });
    return names.length > 0 ? names.join(", ") : "Not clearly documented";
  })();
  const creditSecurityPosition = (() => {
    const openStates = ["open", "acknowledged"];
    const open = findings.filter((f) => openStates.includes((f.workflow_state ?? "open").toLowerCase()));
    const hasSecurity = open.some((f) => {
      const t = `${f.title ?? ""} ${f.message ?? ""}`.toLowerCase();
      return t.includes("security") || t.includes("collateral") || t.includes("ranking");
    });
    return hasSecurity ? "Requires clarification (security/collateral details)" : "Not clearly documented";
  })();
  const creditNextStep =
    report?.summary.must_resolve?.[0] ??
    report?.summary.should_improve?.[0] ??
    "Review key blockers and re-run DealSense";

  const activeFindings = findings.filter((f) => {
    const s = f.workflow_state ?? "open";
    return s === "open" || s === "acknowledged";
  });
  const fixInWizardStep = (() => {
    const list = activeFindings.length > 0 ? activeFindings : findings;
    if (list.some((f) => f.category === "parties" || (f.title ?? "").toLowerCase().includes("borrower"))) return 1;
    if (list.some((f) => f.category === "documents")) return 2;
    return 3;
  })();

  const processingStages = [
    "Preparing run",
    "Extracting document text",
    "Reviewing borrower and structure",
    "Assessing financial information",
    "Checking supporting documents",
    "Generating findings",
    "Preparing DealSense summary",
  ];
  const currentStage =
    run && run.status === "running" && processingStages.length > 0
      ? processingStages[Math.floor(elapsedSeconds / 5) % processingStages.length]
      : "Preparing run";
  const formattedElapsed = (() => {
    const m = Math.floor(elapsedSeconds / 60);
    const s = elapsedSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  })();

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
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>DealSense Run Results</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => dealId && router.push(`/app/deals/${dealId}/wizard/step-4`)}
            disabled={!dealId}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid #4f46e5",
              background: dealId ? "#4f46e5" : "#f1f5f9",
              color: dealId ? "white" : "#94a3b8",
              cursor: dealId ? "pointer" : "not-allowed",
            }}
          >
            Re-run DealSense
          </button>
          <button
            type="button"
            onClick={() => dealId && router.push(`/app/deals/${dealId}/wizard/step-2`)}
            disabled={!dealId}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid #64748b",
              background: dealId ? "white" : "#f1f5f9",
              color: dealId ? "#475569" : "#94a3b8",
              cursor: dealId ? "pointer" : "not-allowed",
            }}
          >
            Back to Documents
          </button>
        </div>
      </div>

      {run.doc_completeness_snapshot && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h2 className="text-sm font-bold text-slate-700 mb-2">Submission completeness</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{run.doc_completeness_snapshot.completenessPct}%</span>
            {(["required", "recommended", "supporting"] as const).map((tier) => {
              const t = run.doc_completeness_snapshot![tier];
              const parts = [];
              if (t.uploaded) parts.push(`${t.uploaded} uploaded`);
              if (t.pending) parts.push(`${t.pending} pending`);
              if (t.missing) parts.push(`${t.missing} missing`);
              if (t.not_required) parts.push(`${t.not_required} not required`);
              if (parts.length === 0) return null;
              return (
                <span key={tier}>
                  {tier.charAt(0).toUpperCase() + tier.slice(1)}: {parts.join(", ")}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Report summary block (credit-memo style) */}
      {report && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <span
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                background: report.summary.ready_to_submit ? "#d1fae5" : report.summary.status === "high_risk" ? "#fee2e2" : "#fef3c7",
                color: report.summary.ready_to_submit ? "#065f46" : report.summary.status === "high_risk" ? "#991b1b" : "#92400e",
              }}
            >
              {report.summary.ready_to_submit ? "Ready to submit" : report.summary.status === "high_risk" ? "Needs attention" : "Needs work"}
            </span>
            <span style={{ fontSize: 14, color: "#475569", fontWeight: 600 }}>Score: {report.summary.score}/100</span>
            <span style={{ fontSize: 12, color: "#64748b" }}>
              {report.summary.counts.critical} critical · {report.summary.counts.warning} warning · {report.summary.counts.info} info · {report.summary.counts.open} open · {report.summary.counts.resolved} resolved
            </span>
          </div>
          {!report.summary.executive_summary && report.summary.readiness_explanation && (
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 10px", lineHeight: 1.4 }}>
              {report.summary.readiness_explanation}
            </p>
          )}
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", color: "#111827" }}>{report.summary.headline}</h2>
          {report.summary.executive_summary && (
            <p style={{ fontSize: 14, color: "#475569", margin: "0 0 8px", lineHeight: 1.5 }}>
              {report.summary.executive_summary}
            </p>
          )}
          {report.summary.blocker_bullets.length > 0 && (
            <div style={{ marginTop: 4, marginBottom: 8 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: "0 0 4px" }}>Key blockers</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                {report.summary.blocker_bullets.map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.5 }}>
            <strong>Recommendation:</strong> {report.summary.recommendation}
          </p>
          {report.summary.strengths.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: "0 0 4px" }}>Deal strengths</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                {report.summary.strengths.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Key Actions */}
      {report && (report.summary.must_resolve.length > 0 || report.summary.should_improve.length > 0 || report.summary.optional.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#111827" }}>Key actions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {report.summary.must_resolve.length > 0 && (
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: "#991b1b", marginBottom: 6 }}>Must resolve before submission</h3>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
                  {report.summary.must_resolve.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.summary.should_improve.length > 0 && (
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: "#92400e", marginBottom: 6 }}>Should improve before submission</h3>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
                  {report.summary.should_improve.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.summary.optional.length > 0 && (
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: "#065f46", marginBottom: 6 }}>Optional enhancements</h3>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
                  {report.summary.optional.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Run Status Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 0 }}>Run Status</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              onClick={() => dealId && router.push(`/app/deals/${dealId}/wizard/step-${fixInWizardStep}`)}
              disabled={!dealId}
              style={{
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 6,
                border: "1px solid #64748b",
                background: !dealId ? "#f1f5f9" : "white",
                color: !dealId ? "#94a3b8" : "#475569",
                cursor: dealId ? "pointer" : "not-allowed",
              }}
            >
              Fix in wizard
            </button>
            <button
              type="button"
              disabled={runAgainLoading || !run.submission_id}
              onClick={async () => {
                if (!dealId || !run.submission_id || runAgainLoading) return;
                setRunAgainError(null);
                setRunAgainLoading(true);
                try {
                  const supabase = supabaseBrowser();
                  const { data: newRun, error: insertErr } = await supabase
                    .from("submission_runs")
                    .insert({ submission_id: run.submission_id, status: "queued" })
                    .select("id")
                    .single();
                  if (insertErr || !newRun?.id) {
                    setRunAgainError(insertErr?.message ?? "Failed to create run.");
                    return;
                  }
                  router.push(`/app/deals/${dealId}/runs/${newRun.id}`);
                } catch (err) {
                  setRunAgainError(err instanceof Error ? err.message : "Failed to run again.");
                } finally {
                  setRunAgainLoading(false);
                }
              }}
              style={{
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 6,
                border: "1px solid #64748b",
                background: runAgainLoading || !run.submission_id ? "#f1f5f9" : "white",
                color: runAgainLoading || !run.submission_id ? "#94a3b8" : "#475569",
                cursor: runAgainLoading || !run.submission_id ? "not-allowed" : "pointer",
              }}
            >
              {runAgainLoading ? "Creating…" : "Run again"}
            </button>
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
        </div>
        {runAgainError && (
          <p style={{ fontSize: 13, color: "#b91c1c", marginTop: 0, marginBottom: 8 }}>{runAgainError}</p>
        )}
        {!report && (
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 8, marginBottom: 0 }}>
            Readiness score: {readinessScore}/100
          </p>
        )}
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

      {/* Credit view (compact, structured) */}
      {(run.status === "completed" || run.status === "failed") && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: "#111827" }}>Credit view</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "#334155" }}>
            {[
              ["Purpose", creditPurpose],
              ["Primary repayment", creditRepayment],
              ["Financial support", creditFinancialSupport],
              ["Secondary support", creditSecondarySupport],
              ["Security position", creditSecurityPosition],
              ["Main gap / Next step", creditNextStep],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 160, flexShrink: 0, color: "#64748b", fontWeight: 600 }}>{label}</div>
                <div style={{ flex: 1, lineHeight: 1.5 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Persisted transaction summary (from DealSense run) */}
      {run.deal_summary_text && run.deal_summary_text.trim() && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: "#111827" }}>
            Transaction summary
          </h2>
          <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, whiteSpace: "pre-line" }}>
            {run.deal_summary_text}
          </div>
        </div>
      )}

      {/* Findings by theme (credit-memo style) */}
      {(run.status === "completed" || run.status === "failed") && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: "#111827" }}>Findings by area</h2>
          {!report || report.themes.length === 0 ? (
            <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>No findings. The pack has no items to address.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {report.themes.map((group) => {
                const colors = severityColors;
                return (
                  <div key={group.theme}>
                    <div style={{ marginBottom: 12 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px", color: "#1e293b" }}>{group.theme}</h3>
                      {group.summary && (
                        <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.4 }}>{group.summary}</p>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        {group.counts.critical > 0 && (
                          <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: colors.critical.bg, color: colors.critical.color }}>
                            {group.counts.critical} critical
                          </span>
                        )}
                        {group.counts.warning > 0 && (
                          <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: colors.warning.bg, color: colors.warning.color }}>
                            {group.counts.warning} warning
                          </span>
                        )}
                        {group.counts.info > 0 && (
                          <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: colors.info.bg, color: colors.info.color }}>
                            {group.counts.info} info
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {group.findings.map((rf) => {
                        const sevColors = severityColors[rf.severity] ?? severityColors.info;
                        const isCompleted = rf.workflow_state === "resolved" || rf.workflow_state === "dismissed";
                        return (
                          <div
                            key={rf.id}
                            style={{
                              padding: "12px 16px",
                              background: isCompleted ? "#f8fafc" : "#f9fafb",
                              borderRadius: 8,
                              border: `1px solid ${isCompleted ? "rgba(0,0,0,0.08)" : `${sevColors.color}20`}`,
                              opacity: isCompleted ? 0.85 : 1,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, justifyContent: "space-between" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                                  <span
                                    style={{
                                      padding: "4px 8px",
                                      borderRadius: 4,
                                      background: sevColors.bg,
                                      color: sevColors.color,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      textTransform: "capitalize",
                                    }}
                                  >
                                    {rf.severity}
                                  </span>
                                  <span
                                    style={{
                                      padding: "2px 6px",
                                      borderRadius: 4,
                                      fontSize: 10,
                                      color: "#64748b",
                                      background: "#e2e8f0",
                                      textTransform: "capitalize",
                                    }}
                                  >
                                    {rf.workflow_state}
                                  </span>
                                  <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#111827" }}>{rf.title}</h4>
                                </div>
                                {rf.why_it_matters && (
                                  <p style={{ fontSize: 13, color: "#475569", margin: "0 0 8px", lineHeight: 1.5 }}>
                                    <strong style={{ color: "#374151" }}>Why it matters:</strong> {rf.why_it_matters}
                                  </p>
                                )}
                                {rf.next_step && (
                                  <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.5 }}>
                                    <strong style={{ color: "#374151" }}>Next step:</strong> {rf.next_step}
                                  </p>
                                )}
                              </div>
                              <select
                                value={rf.workflow_state}
                                onChange={(e) => handleWorkflowStateChange(rf.id, e.target.value)}
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
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Loading/Processing State */}
      {(run.status === "queued" || run.status === "running") && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <p style={{ fontSize: 14, color: "#0f172a", margin: 0, fontWeight: 600 }}>
                {run.status === "queued" ? "DealSense run is starting…" : "DealSense run is in progress…"}
              </p>
              <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                Current stage: {currentStage || (run.status === "queued" ? "Preparing run" : "Processing")}
              </p>
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              Elapsed: {formattedElapsed}
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                height: 4,
                borderRadius: 9999,
                background: "#e5e7eb",
                overflow: "hidden",
              }}
            >
              <div
                className="animate-pulse"
                style={{
                  height: "100%",
                  width: "40%",
                  background: "linear-gradient(90deg, #cbd5f5, #6366f1, #cbd5f5)",
                }}
              />
            </div>
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8, marginBottom: 0 }}>
              This page will update automatically when the run completes. You can continue working while DealSense finishes its analysis.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
