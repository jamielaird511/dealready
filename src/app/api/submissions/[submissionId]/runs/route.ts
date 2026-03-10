import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await context.params;
    if (!submissionId) {
      return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure the user belongs to the submission's organization (same as POST)
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

    const { data: runs, error: runsError } = await supabase
      .from("submission_runs")
      .select("*")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: false });

    if (runsError) {
      console.error("[submissions/runs] Error loading runs:", runsError);
      return NextResponse.json({ error: "Failed to load runs" }, { status: 500 });
    }

    return NextResponse.json({ runs: runs || [] });
  } catch (err) {
    console.error("[submissions/runs] GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await context.params;
    if (!submissionId) {
      return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: submission, error: subError } = await supabase
      .from("submissions")
      .select("id, org_id, deal_id")
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

    // Find existing queued run for this submission (reuse if present)
    const { data: existingQueued, error: existingErr } = await supabase
      .from("submission_runs")
      .select("id")
      .eq("submission_id", submissionId)
      .eq("status", "queued")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      console.error("[submissions/runs] Error checking existing run:", existingErr);
      return NextResponse.json({ error: "Failed to check run" }, { status: 500 });
    }
    if (existingQueued) {
      const existingId = (existingQueued as { id: string }).id;
      // Note: processing of this run is handled by /api/dealsense/runs/[runId]/execute
      return NextResponse.json({ ok: true, runId: existingId, reused: true });
    }

    // Create a new queued run for this submission
    const { data: runRow, error: insertRunError } = await supabase
      .from("submission_runs")
      .insert({
        submission_id: submissionId,
        status: "queued",
      })
      .select("id")
      .single();

    if (insertRunError || !runRow) {
      console.error("[submissions/runs] Error creating run:", insertRunError);
      return NextResponse.json({ error: "Failed to create run" }, { status: 500 });
    }

    const runId = (runRow as { id: string }).id;

    // Note: processing of this run is handled by /api/dealsense/runs/[runId]/execute
    return NextResponse.json({ ok: true, runId });
  } catch (err) {
    console.error("[submissions/runs] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

