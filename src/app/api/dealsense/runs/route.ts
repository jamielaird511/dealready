import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
      .select("id, status, created_at, submission_id, score, assessment_status, assessed_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[DealSense Runs API] Error loading runs:", error);
      return NextResponse.json({ error: "Failed to load runs" }, { status: 500 });
    }

    return NextResponse.json({ runs: runs || [] });
  } catch (err) {
    console.error("[DealSense Runs API] Error in GET handler:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
