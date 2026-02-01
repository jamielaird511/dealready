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
      .select("id, category, extraction_status, extracted_text")
      .eq("submission_id", submissionId);

    if (filesError) {
      await supabase.from("submission_runs").update({ status: "failed" }).eq("id", runId);
      return NextResponse.json({ error: "Failed to load files" }, { status: 500 });
    }

    const files = (filesData || []) as FileRow[];
    const findings = generateFindings(submissionId, files);

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
