import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  _req: Request,
  context: { params: Promise<{ findingId: string }> }
) {
  try {
    const { findingId } = await context.params;
    if (!findingId) {
      return NextResponse.json({ error: "Missing findingId" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: findingRow, error: findingErr } = await supabase
      .from("submission_run_findings")
      .select("id, run_id")
      .eq("id", findingId)
      .maybeSingle();

    if (findingErr) {
      console.error("[findings/resolve] Error fetching finding:", findingErr);
      return NextResponse.json(
        { ok: false, error: findingErr.message ?? "Database error" },
        { status: 500 }
      );
    }
    if (!findingRow) {
      return NextResponse.json({ ok: false, error: "Finding not found" }, { status: 404 });
    }

    const runId = (findingRow as { run_id: string }).run_id;
    const { data: runRow, error: runErr } = await supabase
      .from("submission_runs")
      .select("submission_id")
      .eq("id", runId)
      .maybeSingle();

    if (runErr) {
      console.error("[findings/resolve] Error fetching run:", runErr);
      return NextResponse.json(
        { ok: false, error: runErr.message ?? "Database error" },
        { status: 500 }
      );
    }
    if (!runRow) {
      return NextResponse.json({ ok: false, error: "Run not found for finding" }, { status: 404 });
    }

    const submissionId = (runRow as { submission_id: string }).submission_id;
    const { data: submissionRow, error: subErr } = await supabase
      .from("submissions")
      .select("org_id")
      .eq("id", submissionId)
      .maybeSingle();

    if (subErr) {
      console.error("[findings/resolve] Error fetching submission:", subErr);
      return NextResponse.json(
        { ok: false, error: subErr.message ?? "Database error" },
        { status: 500 }
      );
    }
    if (!submissionRow) {
      return NextResponse.json({ ok: false, error: "Submission not found for run" }, { status: 404 });
    }

    const orgId = (submissionRow as { org_id: string }).org_id;
    const { data: membership, error: membershipErr } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membershipErr) {
      console.error("[findings/resolve] Error checking membership:", membershipErr);
      return NextResponse.json(
        { ok: false, error: membershipErr.message ?? "Database error" },
        { status: 500 }
      );
    }
    if (!membership) {
      return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from("submission_run_findings")
      .update({
        status: "resolved",
        workflow_state: "resolved",
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", findingId)
      .select("id,status,workflow_state,resolved_at,updated_at")
      .single();

    if (updateError || !updatedRow) {
      return NextResponse.json(
        { ok: false, error: "Finding not found or not updated" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, finding: updatedRow });
  } catch (err) {
    console.error("[findings/resolve] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
