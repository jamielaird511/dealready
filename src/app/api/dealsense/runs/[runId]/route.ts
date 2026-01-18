import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
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

  if (!finalRunId) {
    return NextResponse.json({ error: "Missing runId", runId: finalRunId }, { status: 400 });
  }

  // Validate UUID format
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(finalRunId);
  if (!isUuid) {
    return NextResponse.json({ error: "Invalid runId", runId: finalRunId }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Load submission_run with submission join to validate org access
    const { data: run, error: runError } = await supabase
      .from("submission_runs")
      .select(`
        id,
        status,
        submission_id,
        created_at,
        updated_at,
        score,
        assessment_status,
        top_fixes,
        assessed_at,
        submissions:submission_id (
          id,
          org_id
        )
      `)
      .eq("id", finalRunId)
      .maybeSingle();

    if (runError) {
      console.error("[DealSense Get Run API] Error loading run:", runError);
      return NextResponse.json({ error: "Failed to load run" }, { status: 500 });
    }

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // Validate org membership: user must be in the same org as the submission
    const submission = (run as any).submissions;
    if (!submission || !submission.org_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", submission.org_id)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch findings for this run
    const { data: findings, error: findingsError } = await supabase
      .from("submission_run_findings")
      .select("*")
      .eq("run_id", finalRunId)
      .order("created_at", { ascending: true });

    if (findingsError) {
      console.error("[DealSense Get Run API] Error loading findings:", findingsError);
      return NextResponse.json({ error: "Failed to load findings" }, { status: 500 });
    }

    // Remove the nested submissions object from the run response
    const { submissions, ...runData } = run as any;

    return NextResponse.json({
      run: runData,
      findings: findings || [],
    });
  } catch (err) {
    console.error("[DealSense Get Run API] Error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
