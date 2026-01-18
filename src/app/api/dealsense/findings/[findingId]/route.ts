import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ findingId: string }> }
) {
  const { findingId } = await context.params;

  if (!findingId) {
    return NextResponse.json({ error: "Missing findingId" }, { status: 400 });
  }

  // Validate UUID format
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(findingId);
  if (!isUuid) {
    return NextResponse.json({ error: "Invalid findingId", findingId }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { workflow_state, status, owner, resolution_note } = body;

    // Build update object with only allowed fields
    const updates: any = {};

    // Validate and set workflow_state (preferred) or status (backward compatibility)
    const stateValue = workflow_state !== undefined ? workflow_state : status;
    if (stateValue !== undefined) {
      const validStates = ['open', 'acknowledged', 'resolved', 'dismissed'];
      if (!validStates.includes(stateValue)) {
        return NextResponse.json(
          { error: "Invalid workflow_state", workflow_state: stateValue },
          { status: 400 }
        );
      }
      updates.workflow_state = stateValue;
      updates.state_changed_at = new Date().toISOString();

      // Set resolved_at when workflow_state is 'resolved'
      if (stateValue === 'resolved') {
        updates.resolved_at = new Date().toISOString();
      }
    }

    if (owner !== undefined) {
      updates.owner = owner;
    }

    if (resolution_note !== undefined) {
      updates.resolution_note = resolution_note;
    }

    // Check if there are any updates
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Load finding to validate org access
    const { data: finding, error: findingError } = await supabase
      .from("submission_run_findings")
      .select(`
        id,
        run_id,
        submission_runs!inner (
          id,
          submissions:submission_id (
            id,
            org_id
          )
        )
      `)
      .eq("id", findingId)
      .maybeSingle();

    if (findingError) {
      console.error("[DealSense PATCH Finding API] Error loading finding:", findingError);
      return NextResponse.json({ error: "Failed to load finding" }, { status: 500 });
    }

    if (!finding) {
      return NextResponse.json({ error: "Finding not found" }, { status: 404 });
    }

    // Validate org membership
    const run = (finding as any).submission_runs;
    const submission = run?.submissions;
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

    // Update the finding
    updates.updated_at = new Date().toISOString();

    const { data: updatedFinding, error: updateError } = await supabase
      .from("submission_run_findings")
      .update(updates)
      .eq("id", findingId)
      .select()
      .single();

    if (updateError) {
      console.error("[DealSense PATCH Finding API] Error updating finding:", updateError);
      return NextResponse.json(
        { error: "Failed to update finding", details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ finding: updatedFinding });
  } catch (err) {
    console.error("[DealSense PATCH Finding API] Error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
