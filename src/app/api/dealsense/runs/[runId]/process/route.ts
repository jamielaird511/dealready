import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeFindings, type Party } from "@/lib/dealsense/runChecks";

type FileRow = {
  id?: string;
  category?: string | null;
  display_name?: string | null;
  original_filename?: string | null;
  extraction_status?: string | null;
  extracted_text?: string | null;
  doc_type?: string | null;
};

type AiClarificationFinding = {
  finding_id: string;
  title: string;
  severity: "warning" | "info";
  status: "open" | "addressed";
  question: string;
  why_it_matters: string;
  what_ai_found: string;
  recommended_broker_action: string;
  evidence: unknown[];
};

type AiCompletenessFinding = {
  finding_id: string;
  title: string;
  severity: "warning" | "info";
  message: string;
  fix: string;
};

const AI_COMPLETENESS_MAX_FINDINGS = 8;
const AI_EXTRACT_PREVIEW_CHARS = 4000;
const AI_COMPLETENESS_MODEL = "gpt-4o-mini";
const AI_CLARIFICATION_MODEL = "gpt-4o-mini";
const AI_FINDING_ID_REGEX = /^ai_[a-z0-9_]+$/;

function mapAiSeverityToDb(severity: string): "warning" | "info" {
  if (severity === "critical" || severity === "active") return "warning";
  return "info";
}

async function generateAiCompletenessFindings(
  submissionId: string,
  files: FileRow[]
): Promise<AiCompletenessFinding[]> {
  const filePreviews = files.map((f) => {
    const text = (f.extracted_text ?? "").trim();
    const hasText = text.length > 0;
    return {
      id: f.id ?? "",
      display_name: f.display_name ?? f.original_filename ?? "Unknown",
      has_extracted_text: hasText,
      extracted_text: hasText ? text.slice(0, AI_EXTRACT_PREVIEW_CHARS) : "",
    };
  });
  const contextBlock =
    filePreviews.length > 0 ? JSON.stringify(filePreviews, null, 2) : "No files available.";
  const submissionContext = JSON.stringify({ submission_id: submissionId });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("[DealSense Process AI][completeness] OPENAI_API_KEY not set; skipping AI completeness.");
    return [];
  }

  const systemPrompt = `You are a Deal Pack Completeness Reviewer. Identify only MISSING INFORMATION or UNCLEAR CONTEXT. Do NOT assess credit quality, risk, or approval likelihood.

Output only valid JSON, no markdown. Use this exact finding structure:
{"findings": [{"finding_id": "<slug>", "title": "<short title>", "severity": "critical"|"active"|"info", "explanation": "<why this is a gap>", "fix": "<what to provide or clarify>", "evidence": []}]}
Severity: "critical" = deal cannot proceed; "active" = likely lender follow-up; "info" = minor clarification.
Use finding_id slugs like ai_missing_purpose, ai_missing_ownership_chart, ai_missing_loan_purpose, ai_missing_borrower_structure, ai_missing_security_details, ai_missing_use_of_funds, ai_missing_repayment_source, ai_incomplete_context, ai_missing_key_dates, ai_unclear_terms.
Return at most ${AI_COMPLETENESS_MAX_FINDINGS} findings. If nothing clearly missing, return {"findings": []}.`;

  const userPrompt = `Submission context: ${submissionContext}\n\nFile list and extracted text:\n${contextBlock}`;

  let raw: string;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AI_COMPLETENESS_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      }),
    });
    if (!res.ok) {
      console.log("[DealSense Process AI][completeness] OpenAI HTTP error:", res.status);
      return [];
    }
    const data = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
    raw = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      console.log("[DealSense Process AI][completeness] Model returned empty content.");
      return [];
    }
  } catch (err) {
    console.log(
      "[DealSense Process AI][completeness] Error calling OpenAI, returning no findings:",
      err instanceof Error ? err.message : err
    );
    return [];
  }

  let parsed: { findings?: unknown[] };
  try {
    const cleaned = raw.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, "$1").trim();
    parsed = JSON.parse(cleaned) as { findings?: unknown[] };
  } catch {
    console.log("[DealSense Process AI][completeness] JSON parse failed; returning no findings.");
    return [];
  }

  const arr = Array.isArray(parsed.findings) ? parsed.findings : [];
  const out: {
    finding_id: string;
    title: string;
    severity: "warning" | "info";
    message: string;
    fix: string;
  }[] = [];
  for (let i = 0; i < Math.min(arr.length, AI_COMPLETENESS_MAX_FINDINGS); i++) {
    const f = arr[i];
    if (!f || typeof f !== "object") continue;
    const o = f as Record<string, unknown>;
    const finding_id = typeof o.finding_id === "string" ? o.finding_id.trim() : "";
    if (!finding_id || !AI_FINDING_ID_REGEX.test(finding_id)) continue;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) continue;
    const severityRaw = typeof o.severity === "string" ? o.severity : "info";
    const severity = mapAiSeverityToDb(severityRaw);
    const explanation = typeof o.explanation === "string" ? o.explanation : "";
    const fix = typeof o.fix === "string" ? o.fix : "";
    out.push({
      finding_id,
      title,
      severity,
      message: explanation || title,
      fix: fix || "Review and provide clarification.",
    });
  }
  if (out.length === 0) {
    console.log("[DealSense Process AI][completeness] Parsed 0 findings from model output.");
  }
  return out;
}

async function generateAiClarificationAnalysis(
  submissionId: string,
  files: FileRow[],
  purposeType: string
): Promise<{ executive_summary: string; findings: AiClarificationFinding[] }> {
  const filePreviews = files.map((f) => {
    const text = (f.extracted_text ?? "").trim();
    const hasText = text.length > 0;
    return {
      id: f.id ?? "",
      category: f.category ?? "",
      display_name: f.display_name ?? f.original_filename ?? "Unknown",
      has_extracted_text: hasText,
      extracted_text: hasText ? text.slice(0, AI_EXTRACT_PREVIEW_CHARS) : "",
    };
  });
  const contextBlock =
    filePreviews.length > 0 ? JSON.stringify(filePreviews, null, 2) : "No files available.";
  const submissionContext = JSON.stringify({ submission_id: submissionId, purpose_type: purposeType ?? "other" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("[DealSense Process AI][clarification] OPENAI_API_KEY not set; skipping AI clarification.");
    return { executive_summary: "", findings: [] };
  }

  const systemPrompt = `You are analysing a broker's business lending submission pack BEFORE a bank or lender reviews it.

Your job:
- Identify LIKELY lender clarification questions or follow-up points.
- Focus on information gaps, unresolved ambiguities, internal inconsistencies, or unusual items.
- Distinguish clearly between:
  - "open" clarification issues where the pack does NOT clearly address the question.
  - "addressed" items where the pack appears to cover the issue but it is still worth explicitly pointing out.

Very important constraints:
- Do NOT assess credit worthiness, risk appetite, or approval likelihood.
- Do NOT estimate probability of approval or pricing.
- Do NOT give a credit recommendation.
- Avoid duplicating simple checklist-style "missing file" issues – those are handled by separate rules.
- Use ONLY the submission context and the uploaded file names, categories, and extracted text previews.

Output STRICT JSON ONLY with this EXACT shape:
{
  "executive_summary": "string",
  "findings": [
    {
      "finding_id": "ai_clarify_<slug>",
      "title": "string",
      "severity": "warning" | "info",
      "status": "open" | "addressed",
      "question": "string",
      "why_it_matters": "string",
      "what_ai_found": "string",
      "recommended_broker_action": "string",
      "evidence": []
    }
  ]
}

Rules:
- Return AT MOST 8 findings.
- Use finding_id values like ai_clarify_working_capital_gaps, ai_clarify_security_explained, ai_clarify_related_party_loans.
- If nothing material is found, return an informative executive_summary and "findings": [].`;

  const userPrompt = `Submission context: ${submissionContext}

File list, categories, and extracted text previews:
${contextBlock}`;

  let raw: string;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AI_CLARIFICATION_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      }),
    });
    if (!res.ok) {
      console.log("[DealSense Process AI][clarification] OpenAI HTTP error:", res.status);
      return { executive_summary: "", findings: [] };
    }
    const data = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
    raw = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      console.log("[DealSense Process AI][clarification] Model returned empty content.");
      return { executive_summary: "", findings: [] };
    }
  } catch (err) {
    console.log(
      "[DealSense Process AI][clarification] Error calling OpenAI, returning no findings:",
      err instanceof Error ? err.message : err
    );
    return { executive_summary: "", findings: [] };
  }

  let parsed: { executive_summary?: unknown; findings?: unknown };
  try {
    const cleaned = raw.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, "$1").trim();
    parsed = JSON.parse(cleaned) as { executive_summary?: unknown; findings?: unknown };
  } catch {
    console.log("[DealSense Process AI][clarification] JSON parse failed; returning no findings.");
    return { executive_summary: "", findings: [] };
  }

  const execSummary = typeof parsed.executive_summary === "string" ? parsed.executive_summary.trim() : "";
  const arr = Array.isArray(parsed.findings) ? parsed.findings : [];

  const findings: AiClarificationFinding[] = [];
  for (let i = 0; i < Math.min(arr.length, AI_COMPLETENESS_MAX_FINDINGS); i++) {
    const f = arr[i];
    if (!f || typeof f !== "object") continue;
    const obj = f as Record<string, unknown>;
    const finding_id = typeof obj.finding_id === "string" ? obj.finding_id.trim() : "";
    if (!finding_id || !finding_id.startsWith("ai_clarify_")) continue;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    if (!title) continue;
    const severity = obj.severity === "warning" ? "warning" : "info";
    const status = obj.status === "addressed" ? "addressed" : "open";
    const question = typeof obj.question === "string" ? obj.question.trim() : "";
    const why_it_matters = typeof obj.why_it_matters === "string" ? obj.why_it_matters.trim() : "";
    const what_ai_found = typeof obj.what_ai_found === "string" ? obj.what_ai_found.trim() : "";
    const recommended_broker_action =
      typeof obj.recommended_broker_action === "string" ? obj.recommended_broker_action.trim() : "";
    const evidence = Array.isArray(obj.evidence) ? obj.evidence : [];

    findings.push({
      finding_id,
      title,
      severity,
      status,
      question,
      why_it_matters,
      what_ai_found,
      recommended_broker_action,
      evidence,
    });
  }

  if (findings.length === 0) {
    console.log("[DealSense Process AI][clarification] Parsed 0 findings from model output.");
  }
  return { executive_summary: execSummary, findings };
}

export async function GET(_req: NextRequest) {
  void _req;
  try {
    const supabase = await createSupabaseServerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Query recent submission_runs
    const { data: runs, error } = await supabase
      .from("submission_runs")
      .select("id, status, created_at, submission_id")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[DealSense Process API] Error loading runs:", error);
      return NextResponse.json({ error: "Failed to load runs" }, { status: 500 });
    }

    return NextResponse.json({ runs: runs || [] });
  } catch (err) {
    console.error("[DealSense Process API] Error in GET handler:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  const { runId } = await context.params;
  let urlRunId: string | undefined;

  if (!runId) {
    // Fallback: parse from URL pathname
    const pathname = new URL(req.url).pathname;
    const parts = pathname.split("/").filter(Boolean);
    const runsIndex = parts.indexOf("runs");
    if (runsIndex >= 0 && runsIndex + 1 < parts.length) {
      urlRunId = parts[runsIndex + 1];
    }
  }

  const finalRunId = runId || urlRunId;

  console.log("[DealSense Process API] runId debug", {
    runIdFromParams: runId,
    urlRunId,
    finalRunId,
    url: req.url,
  });

  // Validate UUID format (basic check)
  console.log("[DealSense Process API] UUID validation debug", {
    runId: finalRunId,
    runIdJson: JSON.stringify(finalRunId),
    len: finalRunId?.length,
    charCodes: finalRunId?.split("").slice(0, 80).map(c => c.charCodeAt(0))
  });

  const isUuid = !!finalRunId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalRunId);

  if (!finalRunId) {
    return NextResponse.json({ error: "Missing runId", url: req.url }, { status: 400 });
  }

  if (!isUuid) {
    return NextResponse.json({ error: "Invalid runId", runId: finalRunId, runIdJson: JSON.stringify(finalRunId), len: finalRunId?.length }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Load submission_run
    const { data: run, error: runError } = await supabase
      .from("submission_runs")
      .select("*")
      .eq("id", runId)
      .maybeSingle();

    if (runError) {
          console.error("[DealSense Process API] Error loading run:", { runId: finalRunId, error: runError });
      return NextResponse.json({ error: "Failed to load run" }, { status: 500 });
    }

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // If status is running/completed/failed, skip processing
    if (["running", "completed", "failed"].includes(run.status)) {
      return NextResponse.json({ status: run.status, skipped: true });
    }

    // If not queued, something is wrong
    if (run.status !== "queued") {
      return NextResponse.json({ error: "Invalid run status" }, { status: 400 });
    }

    // Set status to running
    const { error: updateError } = await supabase
      .from("submission_runs")
      .update({
        status: "running",
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (updateError) {
      console.error("[DealSense Process API] Error updating run status:", updateError);
      return NextResponse.json({ error: "Failed to update run status" }, { status: 500 });
    }

    // Fetch related data
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select("deal_id")
      .eq("id", run.submission_id)
      .maybeSingle();

    if (submissionError || !submission) {
      console.error("[DealSense Process API] Error loading submission:", submissionError);
      await supabase
        .from("submission_runs")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", finalRunId);
      return NextResponse.json({ error: "Failed to load submission" }, { status: 500 });
    }

    // Fetch deal purpose_type
    let purposeType = "other";
    if (submission.deal_id) {
      const { data: deal } = await supabase
        .from("deals")
        .select("purpose_type")
        .eq("id", submission.deal_id)
        .maybeSingle();
      const pt = (deal as { purpose_type?: string } | null)?.purpose_type;
      if (typeof pt === "string" && pt.trim()) {
        purposeType = pt;
      }
    }

    // Fetch submission files (exclude soft-deleted so only current active files are analysed)
    const { data: files, error: filesError } = await supabase
      .from("submission_files")
      .select("id, category, display_name, original_filename, extraction_status, extracted_text, doc_type")
      .eq("submission_id", run.submission_id)
      .eq("is_deleted", false);

    if (filesError) {
      console.error("[DealSense Process API] Error loading files:", filesError);
      await supabase
        .from("submission_runs")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", finalRunId);
      return NextResponse.json({ error: "Failed to load files" }, { status: 500 });
    }

    // Fetch deal parties with entities join
    const { data: partiesData, error: partiesError } = await supabase
      .from("deal_parties")
      .select(`
        roles,
        role,
        entities:entity_id (
          id
        )
      `)
      .eq("deal_id", submission.deal_id);

    if (partiesError) {
      console.error("[DealSense Process API] Error loading parties:", partiesError);
      await supabase
        .from("submission_runs")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", finalRunId);
      return NextResponse.json({ error: "Failed to load parties" }, { status: 500 });
    }

    // Normalize parties data for computeFindings
    type PartyRow = { roles?: unknown; role?: unknown };
    const parties: Party[] = (partiesData || []).map((p: PartyRow): Party => ({
      roles: Array.isArray(p.roles) ? (p.roles as string[]) : (p.role != null ? [String(p.role)] : []),
      role: p.role != null ? String(p.role) : null,
    }));

    // Normalize files data
    const aiFiles = (files || []) as FileRow[];
    console.log(
      "[DealSense Process AI][files]",
      aiFiles.map((f) => ({
        id: f.id,
        display_name: f.display_name ?? f.original_filename ?? "Unknown",
        category: f.category ?? null,
        extraction_status: f.extraction_status ?? null,
        extracted_text_len: (f.extracted_text ?? "").length,
        doc_type: f.doc_type ?? null,
      }))
    );

    const normalizedFiles = aiFiles.map((f) => ({
      category: f.category,
      display_name: f.display_name,
      original_filename: f.original_filename,
    }));

    // Compute findings
    const { findings, summary } = computeFindings({
      files: normalizedFiles,
      parties: parties,
    });

    console.log("[DealSense] summary debug", summary);

    // AI findings (completeness + clarification)
    let aiCompletenessFindings: Awaited<ReturnType<typeof generateAiCompletenessFindings>> = [];
    let aiClarificationFindings: AiClarificationFinding[] = [];
    let aiClarificationExecutiveSummary = "";

    try {
      console.log("[DealSense Process AI][completeness] Calling generateAiCompletenessFindings:", {
        submissionId: run.submission_id,
        purposeType,
      });
      aiCompletenessFindings = await generateAiCompletenessFindings(run.submission_id, aiFiles);
      console.log(
        "[DealSense Process AI][completeness] Findings count:",
        aiCompletenessFindings.length
      );
      console.log(
        "[DealSense Process AI][completeness] Finding IDs:",
        aiCompletenessFindings.map((f) => f.finding_id)
      );
      if (aiCompletenessFindings.length === 0) {
        console.log("[DealSense Process AI][completeness] No AI completeness findings returned.");
      }
    } catch (err) {
      console.error(
        "[DealSense Process API] AI completeness failed:",
        err instanceof Error ? err.message : err
      );
    }

    try {
      console.log("[DealSense Process AI][clarification] Calling generateAiClarificationAnalysis:", {
        submissionId: run.submission_id,
        purposeType,
      });
      const clar = await generateAiClarificationAnalysis(run.submission_id, aiFiles, purposeType);
      aiClarificationFindings = clar.findings;
      aiClarificationExecutiveSummary = clar.executive_summary;
      console.log(
        "[DealSense Process AI][clarification] Executive summary:",
        aiClarificationExecutiveSummary
      );
      console.log(
        "[DealSense Process AI][clarification] Findings count:",
        aiClarificationFindings.length
      );
      console.log(
        "[DealSense Process AI][clarification] Finding IDs:",
        aiClarificationFindings.map((f) => f.finding_id)
      );
      if (aiClarificationFindings.length === 0) {
        console.log("[DealSense Process AI][clarification] No AI clarification findings returned.");
      }
      // TODO: store aiClarificationExecutiveSummary on submission_runs or a dedicated analysis table
    } catch (err) {
      console.error(
        "[DealSense Process API] AI clarification analysis failed:",
        err instanceof Error ? err.message : err
      );
    }

    // Delete existing findings for this run (idempotency)
    await supabase
      .from("submission_run_findings")
      .delete()
      .eq("run_id", runId);

    // Merge rule-based findings + AI completeness + AI clarification
    const now = new Date().toISOString();
    const findingsToInsert = [
      ...findings.map((f) => ({
        run_id: finalRunId,
        severity: f.severity,
        category: f.category,
        message: f.message,
        finding_id: f.id,
        title: f.title,
        fix: f.fix,
        score_impact: f.scoreImpact,
        evidence: f.evidence ?? null,
      })),
      ...aiCompletenessFindings.map((f) => ({
        run_id: finalRunId,
        severity: f.severity,
        category: "completeness" as const,
        message: f.message,
        finding_id: f.finding_id,
        title: f.title,
        fix: f.fix,
        score_impact: 0,
        evidence: [],
      })),
      ...aiClarificationFindings.map((f) => {
        const isAddressed = f.status === "addressed";
        const baseMessage = f.question || f.title;
        const message = isAddressed
          ? `${baseMessage} (appears already addressed in the current pack.)`
          : baseMessage;
        return {
          run_id: finalRunId,
          severity: f.severity,
          category: "clarification" as const,
          message,
          finding_id: f.finding_id,
          title: f.title,
          fix: f.recommended_broker_action || "Clarify this point for the lender.",
          score_impact: 0,
          evidence: [],
          workflow_state: isAddressed ? "resolved" : "open",
          acknowledged_at: null,
          resolved_at: isAddressed ? now : null,
          state_changed_at: now,
        };
      }),
    ];

    if (findingsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("submission_run_findings")
        .insert(findingsToInsert);

      if (insertError) {
        console.error("[DealSense Process API] Error inserting findings:", insertError);
        await supabase
          .from("submission_runs")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", finalRunId);
        return NextResponse.json({ error: "Failed to insert findings" }, { status: 500 });
      }
    }

    // Set status to completed and persist assessment summary
    const { error: completeError } = await supabase
      .from("submission_runs")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
        score: summary.score,
        assessment_status: summary.status,
        top_fixes: summary.topFixes,
        assessed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (completeError) {
      console.error("[DealSense Process API] Error completing run:", completeError);
      await supabase
        .from("submission_runs")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", finalRunId);
      return NextResponse.json({ error: "Failed to complete run" }, { status: 500 });
    }

    return NextResponse.json({
      status: "completed",
      findingsCount: findings.length,
      summary,
    });
  } catch (err) {
    console.error("[DealSense Process API] Error processing run:", err);
    
    // Try to set status to failed
    try {
      const supabase = await createSupabaseServerClient();
      await supabase
        .from("submission_runs")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", finalRunId);
    } catch (updateErr) {
      console.error("[DealSense Process API] Error setting failed status:", updateErr);
    }

    return NextResponse.json(
      { error: "An unexpected error occurred while processing the run" },
      { status: 500 }
    );
  }
}
