"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { buildReportDisplay } from "@/lib/dealsense/reportDisplay";
import {
  OUTSTANDING_ITEMS,
  OUTSTANDING_STATUSES,
  isEarlyStageStatus,
  type OutstandingItemId,
  type OutstandingStatusValue,
} from "@/lib/dealsense/outstandingItems";

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
  const [clarifyState, setClarifyState] = useState<Record<string, {
    open: boolean;
    documentHint: string;
    note: string;
    loading: boolean;
    error: string | null;
    updatedAnswer?: {
      answer: string;
      confidence: string;
      evidence?: string;
    } | null;
    stillGap: boolean;
  }>>({});
  const [outstandingStatus, setOutstandingStatus] = useState<Record<string, OutstandingStatusValue>>(() =>
    Object.fromEntries(OUTSTANDING_ITEMS.map((item) => [item.id, "not_provided" as OutstandingStatusValue]))
  );

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
  const dealsenseSummary = report?.dealsenseSummary;

  async function handleClarifyGap(questionId: string) {
    setClarifyState((prev) => {
      const current = prev[questionId] ?? {
        open: false,
        documentHint: "",
        note: "",
        loading: false,
        error: null,
        updatedAnswer: null,
        stillGap: false,
      };
      return {
        ...prev,
        [questionId]: { ...current, open: !current.open, error: null },
      };
    });
  }

  async function handleSubmitClarify(questionId: string) {
    const state = clarifyState[questionId];
    if (!state || state.loading) return;

    setClarifyState((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] ?? state), loading: true, error: null },
    }));

    try {
      const res = await fetch(`/api/dealsense/runs/${runId}/process`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question_id: questionId,
          document_hint: state.documentHint,
          note: state.note,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "Unable to read error");
        throw new Error(text || "Failed to recheck with DealSense.");
      }

      const data = await res.json().catch(() => ({}));
      const updated = !!data.updated;
      const answer = data.answer;

      setClarifyState((prev) => ({
        ...prev,
        [questionId]: {
          ...(prev[questionId] ?? state),
          loading: false,
          updatedAnswer: answer
            ? {
                answer: typeof answer.answer === "string" ? answer.answer : "",
                confidence: typeof answer.confidence === "string" ? answer.confidence : "",
                evidence: typeof answer.evidence === "string" ? answer.evidence : undefined,
              }
            : null,
          stillGap: !updated,
          open: true,
          error: null,
        },
      }));
    } catch (err) {
      setClarifyState((prev) => ({
        ...prev,
        [questionId]: {
          ...(prev[questionId] ?? state),
          loading: false,
          error: err instanceof Error ? err.message : "Failed to recheck with DealSense.",
        },
      }));
    }
  }

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

      {/* Legacy submission completeness card (hidden under new incomplete-pack model) */}
      {false && run.doc_completeness_snapshot && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h2 className="text-sm font-bold text-slate-700 mb-2">Submission completeness</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{run.doc_completeness_snapshot.completenessPct}%</span>
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
                background: report.summary.ready_to_submit && report.summary.counts.critical === 0 && report.summary.counts.open === 0
                  ? "#d1fae5"
                  : report.summary.status === "high_risk" || report.summary.counts.critical > 0
                  ? "#fee2e2"
                  : "#fef3c7",
                color: report.summary.ready_to_submit && report.summary.counts.critical === 0 && report.summary.counts.open === 0
                  ? "#065f46"
                  : report.summary.status === "high_risk" || report.summary.counts.critical > 0
                  ? "#991b1b"
                  : "#92400e",
              }}
            >
              {report.summary.ready_to_submit && report.summary.counts.critical === 0 && report.summary.counts.open === 0
                ? "Ready to submit"
                : report.summary.status === "high_risk" || report.summary.counts.critical > 0
                ? "Needs attention before submission"
                : "Early-stage / incomplete"}
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
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: "0 0 4px" }}>Top issues to address</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                {report.summary.blocker_bullets.slice(0, 3).map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.5 }}>
            <strong>Recommended next step:</strong> {report.summary.recommendation}
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

      {/* Outstanding items / deal status – context for credit review */}
      {(run.status === "completed" || run.status === "failed") && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-1">Deal status</h2>
          <p className="text-sm text-slate-600 mb-4">
            Context for credit review. Items that are often expected in a submission but may not yet be in this pack—update status so it’s clear for the lender.
          </p>
          <ul className="space-y-3">
            {OUTSTANDING_ITEMS.map((item) => {
              const status = outstandingStatus[item.id] ?? "not_provided";
              const showEarlyStageNote = isEarlyStageStatus(status);
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{item.label}</p>
                    {showEarlyStageNote && (
                      <p className="text-xs text-slate-500 mt-0.5">Deal may still be in an early stage.</p>
                    )}
                  </div>
                  <select
                    value={status}
                    onChange={(e) =>
                      setOutstandingStatus((prev) => ({
                        ...prev,
                        [item.id]: e.target.value as OutstandingStatusValue,
                      }))
                    }
                    className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {OUTSTANDING_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* DealSense question summary – what DealSense understands vs gaps */}
      {dealsenseSummary && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-2">DealSense summary</h2>
          {dealsenseSummary.summary && (
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              {dealsenseSummary.summary}
            </p>
          )}

          {dealsenseSummary.keyFacts && dealsenseSummary.keyFacts.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Key deal facts</h3>
              <div className="space-y-1 text-sm text-slate-700">
                {dealsenseSummary.keyFacts.map((fact, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2"
                  >
                    <div className="w-52 shrink-0 text-slate-500 font-semibold">
                      {fact.label}
                    </div>
                    <div className="flex-1 leading-snug">
                      {fact.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {false && dealsenseSummary.informationGaps && dealsenseSummary.informationGaps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-amber-800 mb-2">Information gaps</h3>
              <div className="space-y-3 text-sm text-slate-700">
                {dealsenseSummary.informationGaps.map((gap, idx) => {
                  const state = clarifyState[gap.question_id] ?? {
                    open: false,
                    documentHint: "",
                    note: "",
                    loading: false,
                    error: null,
                    updatedAnswer: null,
                    stillGap: false,
                  };
                  return (
                    <div
                      key={gap.question_id ?? idx}
                      className="border border-amber-100 rounded-lg p-3 bg-amber-50/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-800">{gap.label}</div>
                          {state.updatedAnswer && !state.stillGap && (
                            <p className="text-xs text-slate-600 mt-1">
                              <span className="font-semibold">DealSense (recheck):</span>{" "}
                              {state.updatedAnswer.answer || "Updated answer recorded."}{" "}
                              {state.updatedAnswer.confidence && (
                                <span className="text-slate-500">
                                  (Confidence: {state.updatedAnswer.confidence.toLowerCase()})
                                </span>
                              )}
                              {state.updatedAnswer.evidence && (
                                <span className="text-slate-500">
                                  {" "}
                                  — Evidence: {state.updatedAnswer.evidence}
                                </span>
                              )}
                            </p>
                          )}
                          {state.stillGap && (
                            <p className="text-xs text-slate-600 mt-1">
                              DealSense still could not confirm this from the referenced material.
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleClarifyGap(gap.question_id)}
                          className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                        >
                          {state.open ? "Close" : "Help DealSense locate this"}
                        </button>
                      </div>
                      {state.open && (
                        <div className="mt-3 space-y-2">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Document name or hint
                            </label>
                            <input
                              type="text"
                              value={state.documentHint}
                              onChange={(e) =>
                                setClarifyState((prev) => ({
                                  ...prev,
                                  [gap.question_id]: {
                                    ...(prev[gap.question_id] ?? state),
                                    documentHint: e.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                              placeholder="e.g. Statement_of_Position.pdf or 'SPA page 4'"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Note to DealSense
                            </label>
                            <textarea
                              value={state.note}
                              onChange={(e) =>
                                setClarifyState((prev) => ({
                                  ...prev,
                                  [gap.question_id]: {
                                    ...(prev[gap.question_id] ?? state),
                                    note: e.target.value,
                                  },
                                }))
                              }
                              rows={3}
                              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                              placeholder="e.g. Equity contribution is $800k from director personal funds in Statement_of_Position.pdf"
                            />
                          </div>
                          {state.error && (
                            <p className="text-xs text-rose-700">{state.error}</p>
                          )}
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleSubmitClarify(gap.question_id)}
                              disabled={state.loading}
                              className="inline-flex items-center px-3 py-1.5 rounded-md border border-indigo-600 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {state.loading ? "Rechecking…" : "Recheck with DealSense"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Key Actions (hidden to reduce clutter) */}
      {false && report && (report.summary.must_resolve.length > 0 || report.summary.should_improve.length > 0 || report.summary.optional.length > 0) && (
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

      {/* Credit view (compact, structured – hidden) */}
      {false && (run.status === "completed" || run.status === "failed") && (
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

      {/* Persisted transaction summary (from DealSense run – hidden) */}
      {false && run.deal_summary_text && run.deal_summary_text.trim() && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: "#111827" }}>
            Transaction summary
          </h2>
          <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, whiteSpace: "pre-line" }}>
            {run.deal_summary_text}
          </div>
        </div>
      )}

      {/* Findings: credit-review style, grouped by severity */}
      {(run.status === "completed" || run.status === "failed") && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: "#111827" }}>Credit review feedback</h2>
          <p style={{ fontSize: 14, color: "#64748b", marginBottom: 20, lineHeight: 1.5 }}>
            Points a credit reviewer would typically flag. Address or acknowledge before submission.
          </p>
          {!report || report.themes.length === 0 ? (
            <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>No findings. The pack has no items to address.</p>
          ) : (() => {
            const allFindings = report.themes.flatMap((g) => g.findings);
            const bySeverity = {
              critical: allFindings.filter((f) => f.severity === "critical"),
              warning: allFindings.filter((f) => f.severity === "warning"),
              info: allFindings.filter((f) => f.severity === "info"),
            };
            const severityOrder: Array<"critical" | "warning" | "info"> = ["critical", "warning", "info"];
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                {severityOrder.map((sev) => {
                  const list = bySeverity[sev];
                  if (list.length === 0) return null;
                  const colors = severityColors[sev];
                  return (
                    <div key={sev}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            textTransform: "capitalize",
                            background: colors.bg,
                            color: colors.color,
                          }}
                        >
                          {sev}
                        </span>
                        <span style={{ fontSize: 13, color: "#64748b" }}>{list.length} {list.length === 1 ? "item" : "items"}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {list.map((rf) => {
                          const sevColors = severityColors[rf.severity] ?? severityColors.info;
                          const isCompleted = rf.workflow_state === "resolved" || rf.workflow_state === "dismissed";
                          return (
                            <div
                              key={rf.id}
                              style={{
                                padding: "14px 16px",
                                background: isCompleted ? "#f8fafc" : "#fafbfc",
                                borderRadius: 8,
                                border: `1px solid ${isCompleted ? "rgba(0,0,0,0.08)" : `${sevColors.color}22`}`,
                                opacity: isCompleted ? 0.88 : 1,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, justifyContent: "space-between" }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
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
                                    <span style={{ fontSize: 11, color: "#64748b" }}>{rf.theme}</span>
                                  </div>
                                  <h4 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 8px", color: "#111827", lineHeight: 1.35 }}>
                                    {rf.title}
                                  </h4>
                                  {rf.why_it_matters && (
                                    <p style={{ fontSize: 13, color: "#475569", margin: "0 0 12px", lineHeight: 1.55 }}>
                                      {rf.why_it_matters}
                                    </p>
                                  )}
                                  <div
                                    style={{
                                      fontSize: 13,
                                      color: "#334155",
                                      lineHeight: 1.5,
                                      paddingTop: 10,
                                      borderTop: "1px solid #e2e8f0",
                                    }}
                                  >
                                    <strong style={{ color: "#1e293b" }}>Next step:</strong> {rf.next_step}
                                  </div>
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
            );
          })()}
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
