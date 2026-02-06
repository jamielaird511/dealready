import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type FileRow = {
  id?: string;
  category?: string | null;
  extraction_status?: string | null;
  extracted_text?: string | null;
  display_name?: string | null;
  original_filename?: string | null;
  extracted_at?: string | null;
  doc_type?: string | null;
  doc_type_ran_at?: string | null;
};

type FindingRow = {
  run_id: string;
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
  finding_id: string;
  title: string;
  fix: string;
  score_impact: number;
  evidence: { file_id?: string; original_filename?: string; display_name?: string }[] | null;
  status: string;
};

const FINANCIAL_KEYWORDS = /revenue|profit|ebitda|balance\s*sheet|income\s*statement|cash\s*flow|assets|liabilities|equity|audit|financial\s*year|fy\d|turnover|margin/i;

function evidenceFromFile(f: FileRow): { file_id?: string; original_filename?: string; display_name?: string } {
  const out: { file_id?: string; original_filename?: string; display_name?: string } = {};
  if (f.id) out.file_id = f.id;
  if (f.original_filename) out.original_filename = f.original_filename;
  if (f.display_name) out.display_name = f.display_name;
  return out;
}

function hasCategoryOrKeywords(files: FileRow[], categoryValue: string, keywords: string[]): boolean {
  const catLower = categoryValue.toLowerCase();
  return files.some((f) => {
    const cat = (f.category ?? "").toLowerCase();
    if (cat === catLower) return true;
    const name = (f.display_name ?? "").toLowerCase();
    const orig = (f.original_filename ?? "").toLowerCase();
    return keywords.some((kw) => name.includes(kw.toLowerCase()) || orig.includes(kw.toLowerCase()));
  });
}

function hasSecuredEvidence(files: FileRow[]): boolean {
  const keywords = ["security", "property", "mortgage", "valuation"];
  return files.some((f) => {
    const cat = (f.category ?? "").toLowerCase();
    const name = (f.display_name ?? "").toLowerCase();
    const orig = (f.original_filename ?? "").toLowerCase();
    const combined = `${cat} ${name} ${orig}`;
    return keywords.some((kw) => combined.includes(kw.toLowerCase()));
  });
}

const ALLOWED_DOC_TYPES = [
  "bank_statement", "financial_statement", "tax_return", "id_document", "drivers_license", "passport",
  "payslip", "rental_statement", "valuation_report", "insurance_schedule", "loan_facility_letter",
  "trust_deed", "company_documents", "other",
] as const;
const MAX_INPUT_LENGTH_CLASSIFY = 12_000;
const CLASSIFY_MODEL = "gpt-4o-mini";

async function classifyOneFile(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  fileId: string
): Promise<void> {
  const { data: chunksData, error: chunksError } = await supabase
    .from("submission_file_chunks")
    .select("content, chunk_index")
    .eq("submission_file_id", fileId)
    .order("chunk_index", { ascending: true });

  if (chunksError || !chunksData?.length) throw new Error(chunksError?.message ?? "No chunks");

  const fullText = (chunksData as { content?: string | null }[])
    .map((c) => (c.content ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
  const cappedText = fullText.slice(0, MAX_INPUT_LENGTH_CLASSIFY);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const systemPrompt = `You classify document text into exactly one doc_type. Reply with valid JSON only, no markdown or extra text.
Output shape must be exactly:
{"doc_type": "<one of allowed>", "confidence": <number 0-1>, "reasons": ["<short reason>", ...]}
Allowed doc_type values (use exactly one): ${ALLOWED_DOC_TYPES.join(", ")}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: CLASSIFY_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Classify this document. Return only the JSON object.\n\n${cappedText}` },
      ],
      temperature: 0.2,
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 100)}`);
  }

  const data = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("No content in OpenAI response");

  let parsed: { doc_type: string; confidence: number; reasons: string[] };
  try {
    const o = JSON.parse(content) as Record<string, unknown>;
    const doc_type = typeof o.doc_type === "string" ? o.doc_type.trim() : "other";
    let confidence = typeof o.confidence === "number" ? o.confidence : 0;
    confidence = Math.max(0, Math.min(1, confidence));
    let reasons = Array.isArray(o.reasons) ? o.reasons : [];
    reasons = (reasons as string[])
      .filter((r): r is string => typeof r === "string")
      .map((r) => r.trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 5);
    if (reasons.length === 0) reasons = ["Classification completed"];
    parsed = { doc_type, confidence, reasons };
  } catch {
    throw new Error("Invalid JSON from model");
  }

  const doc_type = ALLOWED_DOC_TYPES.includes(parsed.doc_type as (typeof ALLOWED_DOC_TYPES)[number]) ? parsed.doc_type : "other";
  const confidence = Math.max(0, Math.min(1, parsed.confidence));

  const { error: updateError } = await supabase
    .from("submission_files")
    .update({
      doc_type,
      doc_type_confidence: confidence,
      doc_type_reasons: parsed.reasons,
      doc_type_model: CLASSIFY_MODEL,
      doc_type_ran_at: new Date().toISOString(),
    })
    .eq("id", fileId);

  if (updateError) throw new Error(updateError.message);
}

function generateFindings(submissionId: string, files: FileRow[]): FindingRow[] {
  const findings: FindingRow[] = [];

  const hasFinancials = files.some((f) => (f.category ?? "").toLowerCase() === "financials");
  if (!hasFinancials) {
    findings.push({
      run_id: "",
      severity: "critical",
      category: "financials",
      message: "No financials file uploaded.",
      finding_id: "docs_missing_financials",
      title: "Missing financials",
      fix: "Upload at least one file with category Financials.",
      score_impact: 25,
      evidence: null,
      status: "new",
    });
  }

  const financialFiles = files.filter((f) => (f.category ?? "").toLowerCase() === "financials");
  for (const f of financialFiles) {
    const extStatus = (f.extraction_status ?? "").toLowerCase();
    const text = (f.extracted_text ?? "").trim();
    const extractedOk = extStatus === "succeeded" && text.length > 0;

    if (!extractedOk) {
      findings.push({
        run_id: "",
        severity: "critical",
        category: "financials",
        message: extStatus !== "succeeded" ? "Extraction failed or not yet completed." : "Extracted text is empty.",
        finding_id: "extract_failed",
        title: "Extraction failed or empty",
        fix: "Re-run extraction or upload a valid PDF with extractable text.",
        score_impact: 25,
        evidence: [evidenceFromFile(f)],
        status: "new",
      });
      continue;
    }

    if (!FINANCIAL_KEYWORDS.test(text)) {
      findings.push({
        run_id: "",
        severity: "warning",
        category: "financials",
        message: "Financials file does not contain common financial keywords; may be low confidence.",
        finding_id: "financials_low_confidence",
        title: "Financials low confidence",
        fix: "Upload a document that clearly contains financial statements or key figures.",
        score_impact: 10,
        evidence: [evidenceFromFile(f)],
        status: "new",
      });
    }
  }

  // Warning when Financials files exist but combined content does not look like financial statements
  if (financialFiles.length > 0) {
    const financialsContentKeywords = ["profit", "loss", "revenue", "sales", "expenses", "ebit", "balance sheet", "assets", "liabilities", "equity", "gst", "income tax"];
    const combinedText = financialFiles
      .map((f) => (f.extracted_text ?? "").trim())
      .join(" ")
      .toLowerCase();
    const keywordCount = financialsContentKeywords.filter((kw) => combinedText.includes(kw)).length;
    if (keywordCount < 1) {
      findings.push({
        run_id: "",
        severity: "warning",
        category: "documents",
        message: "Content of file(s) categorised as Financials does not appear to contain financial statement content. Consider uploading actual financial statements (P&L, balance sheet, or tax documents).",
        finding_id: "financials_suspect_content",
        title: "Financials may be wrong document",
        fix: "Upload actual financial statements (e.g. P&L, balance sheet) or re-categorise the file if it is not a financial document.",
        score_impact: 5,
        evidence: null,
        status: "new",
      });
    }
  }

  const missingDocChecks: Array<{
    finding_id: string;
    title: string;
    message: string;
    fix: string;
    categoryMatch: string;
    keywordMatches: string[];
    severity: "critical" | "warning" | "info";
    score_impact: number;
  }> = [
    {
      finding_id: "docs_missing_bank_statements",
      title: "Missing bank statements",
      message: "Bank statements (e.g. last 6 months) not found in the pack.",
      fix: "Upload bank statements with category Bank statements or a filename indicating statements/transactions.",
      categoryMatch: "bank_statements",
      keywordMatches: ["bank statement", "statement", "transactions"],
      severity: "critical",
      score_impact: 25,
    },
    {
      finding_id: "docs_missing_tax",
      title: "Missing IRD/tax documents",
      message: "IRD or tax documents (GST, income tax) not found.",
      fix: "Upload tax/IRD documents with category Tax or a filename indicating IRD, tax, or GST.",
      categoryMatch: "tax",
      keywordMatches: ["ird", "tax", "gst", "income tax"],
      severity: "critical",
      score_impact: 25,
    },
    {
      finding_id: "docs_missing_debtor_aging",
      title: "Missing debtor aging",
      message: "Debtor aging report not found.",
      fix: "Upload a debtor aging report with category Debtors or a filename indicating debtors/aging.",
      categoryMatch: "debtors",
      keywordMatches: ["debtor", "debtors", "aging", "ageing"],
      severity: "warning",
      score_impact: 10,
    },
    {
      finding_id: "docs_missing_creditor_aging",
      title: "Missing creditor aging",
      message: "Creditor aging report not found.",
      fix: "Upload a creditor aging report with category Creditors or a filename indicating creditors/aging.",
      categoryMatch: "creditors",
      keywordMatches: ["creditor", "creditors", "aging", "ageing"],
      severity: "warning",
      score_impact: 10,
    },
    {
      finding_id: "docs_missing_forecast",
      title: "Missing forecast/budget",
      message: "Forecast, budget or cashflow projection not found.",
      fix: "Upload forecast/budget with category Forecast or a filename indicating forecast, budget or projection.",
      categoryMatch: "forecast",
      keywordMatches: ["forecast", "budget", "projection", "cashflow"],
      severity: "warning",
      score_impact: 10,
    },
    {
      finding_id: "docs_missing_lending_schedule",
      title: "Missing existing lending schedule",
      message: "Existing facilities or loan schedule not found.",
      fix: "Upload facility/lending schedule with category Lending or a filename indicating facilities or term loans.",
      categoryMatch: "lending",
      keywordMatches: ["facility", "facilities", "lending", "loan schedule", "term loan"],
      severity: "warning",
      score_impact: 10,
    },
  ];

  for (const check of missingDocChecks) {
    if (!hasCategoryOrKeywords(files, check.categoryMatch, check.keywordMatches)) {
      findings.push({
        run_id: "",
        severity: check.severity,
        category: "documents",
        message: check.message,
        finding_id: check.finding_id,
        title: check.title,
        fix: check.fix,
        score_impact: check.score_impact,
        evidence: null,
        status: "new",
      });
    }
  }

  const secured = hasSecuredEvidence(files);
  const valuationKeywords = ["valuation", "val report", "valn"];
  const insuranceKeywords = ["insurance", "insur"];
  if (!hasCategoryOrKeywords(files, "valuation", valuationKeywords)) {
    findings.push({
      run_id: "",
      severity: secured ? "warning" : "info",
      category: "documents",
      message: secured ? "Valuation not found; required for secured lending." : "Valuation document not found.",
      finding_id: "docs_missing_valuation",
      title: "Missing valuation",
      fix: secured ? "Upload a valuation with category Valuation or a filename indicating valuation." : "Consider uploading a valuation if applicable.",
      score_impact: secured ? 10 : 5,
      evidence: null,
      status: "new",
    });
  }
  if (!hasCategoryOrKeywords(files, "insurance", insuranceKeywords)) {
    findings.push({
      run_id: "",
      severity: secured ? "warning" : "info",
      category: "documents",
      message: secured ? "Insurance evidence not found; required for secured lending." : "Insurance document not found.",
      finding_id: "docs_missing_insurance",
      title: "Missing insurance",
      fix: secured ? "Upload insurance evidence with category Insurance or a filename indicating insurance." : "Consider uploading insurance evidence if applicable.",
      score_impact: secured ? 10 : 5,
      evidence: null,
      status: "new",
    });
  }

  return findings;
}

const SEVERITY_ORDER: Record<FindingRow["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function computeSummary(
  findings: FindingRow[],
  workflowStateByFindingId?: Map<string, string>
): { score: number; assessment_status: string; top_fixes: string[] } {
  const active = workflowStateByFindingId
    ? findings.filter((f) => workflowStateByFindingId.get(f.finding_id) !== "resolved")
    : findings;

  let score = 100;
  for (const f of active) {
    score -= f.score_impact;
  }
  score = Math.max(0, score);

  let assessment_status = "ready";
  if (active.some((f) => f.severity === "critical")) assessment_status = "needs_review";
  else if (active.some((f) => f.severity === "warning")) assessment_status = "minor_issues";

  const sorted = [...active].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    return b.score_impact - a.score_impact;
  });

  const seen = new Set<string>();
  const top_fixes: string[] = [];
  for (const f of sorted) {
    if (top_fixes.length >= 5) break;
    if (seen.has(f.fix)) continue;
    seen.add(f.fix);
    top_fixes.push(f.fix);
  }

  return { score, assessment_status, top_fixes };
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await context.params;
    if (!submissionId) {
      return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: submission, error: subError } = await supabase
      .from("submissions")
      .select("id, org_id")
      .eq("id", submissionId)
      .maybeSingle();

    if (subError || !submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", (submission as { org_id?: string }).org_id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: existingQueued, error: existingErr } = await supabase
      .from("submission_runs")
      .select("id")
      .eq("submission_id", submissionId)
      .eq("status", "queued")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      console.error("[submissions/run] Error checking existing run:", existingErr);
      return NextResponse.json({ error: "Failed to check run" }, { status: 500 });
    }
    if (existingQueued) {
      const existingId = (existingQueued as { id: string }).id;
      return NextResponse.json({ ok: true, runId: existingId, reused: true });
    }

    const { data: runRow, error: insertRunError } = await supabase
      .from("submission_runs")
      .insert({
        submission_id: submissionId,
        status: "queued",
      })
      .select("id")
      .single();

    if (insertRunError || !runRow) {
      console.error("[submissions/run] Error creating run:", insertRunError);
      return NextResponse.json({ error: "Failed to create run" }, { status: 500 });
    }

    const runId = (runRow as { id: string }).id;

    // Load previous completed run (if any) to carry over finding state
    const { data: prevRun } = await supabase
      .from("submission_runs")
      .select("id")
      .eq("submission_id", submissionId)
      .eq("status", "completed")
      .neq("id", runId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let prevFindingsByKey = new Map<string, {
      workflow_state?: string | null;
      acknowledged_at?: string | null;
      resolved_at?: string | null;
      title?: string | null;
      fix?: string | null;
    }>();

    if (prevRun?.id) {
      const { data: prevFindings } = await supabase
        .from("submission_run_findings")
        .select("finding_id, workflow_state, acknowledged_at, resolved_at, title, fix")
        .eq("run_id", prevRun.id);

      for (const f of prevFindings ?? []) {
        prevFindingsByKey.set(f.finding_id, {
          workflow_state: f.workflow_state,
          acknowledged_at: f.acknowledged_at,
          resolved_at: f.resolved_at,
          title: f.title,
          fix: f.fix,
        });
      }
    }

    const { data: filesData, error: filesError } = await supabase
      .from("submission_files")
      .select("id, category, extraction_status, extracted_text, display_name, original_filename, extracted_at, doc_type, doc_type_ran_at")
      .eq("submission_id", submissionId);

    if (filesError) {
      await supabase.from("submission_runs").update({ status: "failed" }).eq("id", runId);
      return NextResponse.json({ error: "Failed to load files" }, { status: 500 });
    }

    const files = (filesData || []) as FileRow[];

    const eligibleForClassify = files.filter((f) => {
      if ((f.extraction_status ?? "") !== "succeeded") return false;
      const docType = f.doc_type ?? null;
      const ranAt = f.doc_type_ran_at ?? null;
      const extractedAt = f.extracted_at ?? null;
      if (docType === null || ranAt === null) return true;
      if (extractedAt !== null && ranAt !== null && new Date(extractedAt) > new Date(ranAt)) return true;
      return false;
    });
    for (const f of eligibleForClassify) {
      if (!f.id) continue;
      try {
        await classifyOneFile(supabase, f.id);
      } catch (err) {
        console.error("[submissions/run] Classify failed:", f.id, err instanceof Error ? err.message : err);
      }
    }

    const findings = generateFindings(submissionId, files);
    const currentFindingIds = new Set(findings.map((f) => f.finding_id));
    const syntheticFindingIds = new Set<string>();

    for (const [findingId, prev] of prevFindingsByKey) {
      if (currentFindingIds.has(findingId)) continue;
      const prevTitle = prev?.title ?? null;
      const prevFix = prev?.fix ?? null;
      findings.push({
        run_id: "",
        severity: "info",
        category: "documents",
        finding_id: findingId,
        title: (typeof prevTitle === "string" && prevTitle.trim() ? prevTitle : "Resolved item") as string,
        message: "Resolved in latest run (requirement no longer detected as missing).",
        fix: (typeof prevFix === "string" ? prevFix : "") as string,
        score_impact: 0,
        evidence: null,
        status: "auto_resolved",
      });
      syntheticFindingIds.add(findingId);
    }

    const { error: deleteFindingsError } = await supabase
      .from("submission_run_findings")
      .delete()
      .eq("run_id", runId);

    if (deleteFindingsError) {
      console.error("[submissions/run] Error deleting existing findings:", deleteFindingsError);
      await supabase.from("submission_runs").update({ status: "failed" }).eq("id", runId);
      return NextResponse.json({ error: "Failed to clear findings for run" }, { status: 500 });
    }

    const now = new Date().toISOString();
    const findingsToInsert = findings.map((f) => {
      const prev = prevFindingsByKey.get(f.finding_id);
      const isSyntheticAutoResolved = syntheticFindingIds.has(f.finding_id);

      if (isSyntheticAutoResolved) {
        return {
          run_id: runId,
          severity: f.severity,
          category: f.category,
          message: f.message,
          finding_id: f.finding_id,
          title: f.title,
          fix: f.fix,
          score_impact: f.score_impact,
          evidence: f.evidence,
          status: "new",
          workflow_state: "resolved",
          resolved_at: now,
          acknowledged_at: prev?.acknowledged_at ?? null,
          state_changed_at: now,
        };
      }

      return {
        run_id: runId,
        severity: f.severity,
        category: f.category,
        message: f.message,
        finding_id: f.finding_id,
        title: f.title,
        fix: f.fix,
        score_impact: f.score_impact,
        evidence: f.evidence,
        status: "new",
        workflow_state: prev?.workflow_state ?? "open",
        acknowledged_at: prev?.acknowledged_at ?? null,
        resolved_at: prev?.resolved_at ?? null,
        state_changed_at: now,
      };
    });

    if (findingsToInsert.length > 0) {
      const { error: insertFindingsError } = await supabase
        .from("submission_run_findings")
        .insert(findingsToInsert);

      if (insertFindingsError) {
        console.error("insert findings failed", { submissionId, error: insertFindingsError });
        await supabase.from("submission_runs").update({ status: "failed" }).eq("id", runId);
        return NextResponse.json({ ok: false, error: "Failed to insert findings", details: insertFindingsError }, { status: 500 });
      }
    }

    const workflowStateByFindingId = new Map<string, string>(findingsToInsert.map((p) => [p.finding_id, p.workflow_state ?? "open"]));
    const { score, assessment_status, top_fixes } = computeSummary(findings, workflowStateByFindingId);

    const { error: updateError } = await supabase
      .from("submission_runs")
      .update({
        status: "completed",
        score,
        assessment_status,
        top_fixes,
        assessed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (updateError) {
      console.error("[submissions/run] Error updating run:", updateError);
      return NextResponse.json({ error: "Failed to complete run" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, runId });
  } catch (err) {
    console.error("[submissions/run] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
