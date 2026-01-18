import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";
import { computeFindings } from "../../../../../../lib/dealsense/runChecks";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId: paramRunId } = await params;
  let urlRunId: string | undefined;
  
  if (!paramRunId) {
    // Fallback: parse from URL pathname
    const pathname = new URL(req.url).pathname;
    const parts = pathname.split("/").filter(Boolean);
    const runsIndex = parts.indexOf("runs");
    if (runsIndex >= 0 && runsIndex + 1 < parts.length) {
      urlRunId = parts[runsIndex + 1];
      console.log("[DealSense Process API] Using URL fallback for runId:", urlRunId);
    }
  }
  
  const runId = paramRunId || urlRunId;

  // Validate UUID format (basic check)
  const isUuid = runId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId);

  if (!runId || !isUuid) {
    return NextResponse.json({ error: "Missing runId" }, { status: 400 });
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
      console.error("[DealSense Process API] Error loading run:", { runId, error: runError });
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
        .eq("id", runId);
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
        .eq("id", runId);
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
        .eq("id", runId);
      return NextResponse.json({ error: "Failed to load parties" }, { status: 500 });
    }

    // Normalize parties data for computeFindings
    const parties = (partiesData || []).map((p: any) => ({
      roles: p.roles ?? (p.role ? [p.role] : []),
      role: p.role,
    }));

    // Normalize files data
    const normalizedFiles = (files || []).map((f: any) => ({
      category: f.category,
      display_name: f.display_name,
      original_filename: f.original_filename,
    }));

    // Compute findings
    const findings = computeFindings({
      files: normalizedFiles,
      parties: parties,
    });

    // Delete existing findings for this run (idempotency)
    await supabase
      .from("submission_run_findings")
      .delete()
      .eq("run_id", runId);

    // Insert findings
    if (findings.length > 0) {
      const findingsToInsert = findings.map(f => ({
        run_id: runId,
        severity: f.severity,
        category: f.category,
        message: f.message,
      }));

      const { error: insertError } = await supabase
        .from("submission_run_findings")
        .insert(findingsToInsert);

      if (insertError) {
        console.error("[DealSense Process API] Error inserting findings:", insertError);
        await supabase
          .from("submission_runs")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", runId);
        return NextResponse.json({ error: "Failed to insert findings" }, { status: 500 });
      }
    }

    // Set status to completed
    const { error: completeError } = await supabase
      .from("submission_runs")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (completeError) {
      console.error("[DealSense Process API] Error completing run:", completeError);
      await supabase
        .from("submission_runs")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", runId);
      return NextResponse.json({ error: "Failed to complete run" }, { status: 500 });
    }

    return NextResponse.json({ status: "completed", findingsCount: findings.length });
  } catch (err) {
    console.error("[DealSense Process API] Error processing run:", err);
    
    // Try to set status to failed
    try {
      const supabase = await createSupabaseServerClient();
      await supabase
        .from("submission_runs")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", runId);
    } catch (updateErr) {
      console.error("[DealSense Process API] Error setting failed status:", updateErr);
    }

    return NextResponse.json(
      { error: "An unexpected error occurred while processing the run" },
      { status: 500 }
    );
  }
}
