import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type FileRow = {
  id?: string;
  category?: string | null;
  extraction_status?: string | null;
  extracted_text?: string | null;
  display_name?: string | null;
  original_filename?: string | null;
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

function computeSummary(findings: FindingRow[]): { score: number; assessment_status: string; top_fixes: string[] } {
  let score = 100;
  for (const f of findings) {
    score -= f.score_impact;
  }
  score = Math.max(0, score);

  let assessment_status = "ready";
  if (findings.some((f) => f.severity === "critical")) assessment_status = "needs_review";
  else if (findings.some((f) => f.severity === "warning")) assessment_status = "minor_issues";

  const sorted = [...findings].sort((a, b) => {
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

    const { data: filesData, error: filesError } = await supabase
      .from("submission_files")
      .select("id, category, extraction_status, extracted_text, display_name, original_filename")
      .eq("submission_id", submissionId);

    if (filesError) {
      await supabase.from("submission_runs").update({ status: "failed" }).eq("id", runId);
      return NextResponse.json({ error: "Failed to load files" }, { status: 500 });
    }

    const files = (filesData || []) as FileRow[];
    const findings = generateFindings(submissionId, files);

    const { error: deleteFindingsError } = await supabase
      .from("submission_run_findings")
      .delete()
      .eq("run_id", runId);

    if (deleteFindingsError) {
      console.error("[submissions/run] Error deleting existing findings:", deleteFindingsError);
      await supabase.from("submission_runs").update({ status: "failed" }).eq("id", runId);
      return NextResponse.json({ error: "Failed to clear findings for run" }, { status: 500 });
    }

    const findingsToInsert = findings.map((f) => ({
      run_id: runId,
      severity: f.severity,
      category: f.category,
      message: f.message,
      finding_id: f.finding_id,
      title: f.title,
      fix: f.fix,
      score_impact: f.score_impact,
      evidence: f.evidence,
      status: f.status,
    }));

    if (findingsToInsert.length > 0) {
      const { error: insertFindingsError } = await supabase
        .from("submission_run_findings")
        .insert(findingsToInsert);

      if (insertFindingsError) {
        console.error("[submissions/run] Error inserting findings:", insertFindingsError);
        await supabase.from("submission_runs").update({ status: "failed" }).eq("id", runId);
        return NextResponse.json({ error: "Failed to insert findings" }, { status: 500 });
      }
    }

    const { score, assessment_status, top_fixes } = computeSummary(findings);

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
