import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dealId } = await params;
    if (!dealId) {
      return NextResponse.json({ error: "Missing deal id" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: row, error } = await supabase
      .from("deal_summaries")
      .select("id, content, run_id, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[deals/summary] Error loading summary:", error);
      return NextResponse.json({ error: "Failed to load summary" }, { status: 500 });
    }

    const summary = row?.content ?? null;
    const summary_id = row?.id ?? null;
    const run_id = row?.run_id ?? null;
    const created_at = row?.created_at ?? null;

    return NextResponse.json({
      summary: typeof summary === "string" ? summary : null,
      summary_id: typeof summary_id === "string" ? summary_id : null,
      run_id: typeof run_id === "string" ? run_id : null,
      created_at: typeof created_at === "string" ? created_at : null,
    });
  } catch (err) {
    console.error("[deals/summary] Unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
