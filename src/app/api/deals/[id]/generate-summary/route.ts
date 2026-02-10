import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SUMMARY_MODEL = "gpt-4.1-mini";
const SUMMARY_TEMPERATURE = 0.3;

export async function POST(
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

    const { data: deal, error: dealError } = await supabase
      .from("deals")
      .select("id, name, status, notes")
      .eq("id", dealId)
      .maybeSingle();

    if (dealError) {
      console.error("[generate-summary] Error loading deal:", dealError);
      return NextResponse.json({ error: "Failed to load deal" }, { status: 500 });
    }
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    let run: { id: string } | null = null;
    const { data: submissions } = await supabase
      .from("submissions")
      .select("id")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1);

    const submissionId = submissions?.[0]?.id;
    if (submissionId) {
      const { data: runs } = await supabase
        .from("submission_runs")
        .select("id")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: false })
        .limit(1);
      run = runs?.[0] ?? null;
    }

    let findings: { title?: string; message?: string; severity?: string; fix?: string }[] = [];
    if (run?.id) {
      const { data: findingsData } = await supabase
        .from("submission_run_findings")
        .select("title, message, severity, fix")
        .eq("run_id", run.id);
      findings = (findingsData ?? []) as typeof findings;
    }

    const dealContext = JSON.stringify({
      deal: { id: deal.id, name: (deal as { name?: string }).name, status: (deal as { status?: string }).status, notes: (deal as { notes?: string }).notes },
      run_id: run?.id ?? null,
      findings_count: findings.length,
      findings: findings.map((f) => ({ title: f.title, message: f.message, severity: f.severity, fix: f.fix })),
    });

    const systemPrompt = `You are a concise underwriter. Produce a lender-ready cover sheet in plain text using only these headings (include each even if brief):
Facility requested
Purpose
Business overview
Financial snapshot
Security
Strengths
Key risks
Mitigants
Keep each section short (1-3 sentences). Base content on the deal and findings provided; if information is missing, state "Not provided" or "To be confirmed."`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI not configured" }, { status: 500 });
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Deal and run context:\n${dealContext}` },
        ],
        temperature: SUMMARY_TEMPERATURE,
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[generate-summary] OpenAI error:", res.status, errText);
      return NextResponse.json({ error: "Summary generation failed" }, { status: 500 });
    }

    const data = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
    const summary = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!summary) {
      return NextResponse.json({ error: "Empty summary from model" }, { status: 500 });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("deal_summaries")
      .insert({
        deal_id: dealId,
        run_id: run?.id ?? null,
        content: summary,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[generate-summary] Insert error:", insertError);
      return NextResponse.json({ error: "Failed to save summary" }, { status: 500 });
    }

    const summaryId = (inserted as { id: string }).id;
    return NextResponse.json({ summary, summary_id: summaryId }, { status: 200 });
  } catch (err) {
    console.error("[generate-summary] Unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
