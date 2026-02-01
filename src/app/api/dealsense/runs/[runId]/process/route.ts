import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeFindings, type Party } from "@/lib/dealsense/runChecks";

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

    // Fetch submission files
    const { data: files, error: filesError } = await supabase
      .from("submission_files")
      .select("category, display_name, original_filename")
      .eq("submission_id", run.submission_id);

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
    type FileRow = { category?: string; display_name?: string; original_filename?: string };
    const normalizedFiles = (files || []).map((f: FileRow) => ({
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

    // Delete existing findings for this run (idempotency)
    await supabase
      .from("submission_run_findings")
      .delete()
      .eq("run_id", runId);

    // Insert findings
    if (findings.length > 0) {
      const findingsToInsert = findings.map(f => ({
        run_id: finalRunId,
        severity: f.severity,
        category: f.category,
        message: f.message,
        finding_id: f.id,
        title: f.title,
        fix: f.fix,
        score_impact: f.scoreImpact,
        evidence: f.evidence ?? null,
      }));

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

    return NextResponse.json({ status: "completed", findingsCount: findings.length, summary });
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
