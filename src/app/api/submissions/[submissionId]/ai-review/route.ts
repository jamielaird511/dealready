import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const MAX_FINDINGS = 8;
const EXTRACT_PREVIEW_CHARS = 4000;
const AI_REVIEW_MODEL = "gpt-4o-mini";

const EvidenceItemSchema = z.object({
  source: z.enum(["submission", "file"]),
  id: z.string(),
  quote: z.string(),
});

const FindingSchema = z.object({
  finding_id: z.string().min(1).regex(/^ai_[a-z0-9_]+$/),
  title: z.string().min(1),
  severity: z.enum(["critical", "active", "info"]),
  explanation: z.string().min(1),
  fix: z.string().min(1),
  evidence: z.array(EvidenceItemSchema).optional().default([]),
});

const AIReviewResponseSchema = z.object({
  ok: z.literal(true),
  findings: z.array(FindingSchema).max(MAX_FINDINGS),
});

type FileRow = {
  id?: string;
  display_name?: string | null;
  original_filename?: string | null;
  mime_type?: string | null;
  extraction_status?: string | null;
  created_at?: string | null;
  extracted_text?: string | null;
};

async function callLLM(prompt: string, systemPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: AI_REVIEW_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("No content in OpenAI response");
  return content;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await context.params;
    if (!submissionId) {
      return NextResponse.json({ ok: false, error: "Missing submissionId" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: submission, error: subError } = await supabase
      .from("submissions")
      .select("id, org_id")
      .eq("id", submissionId)
      .maybeSingle();

    if (subError || !submission) {
      return NextResponse.json({ ok: false, error: "Submission not found" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", (submission as { org_id?: string }).org_id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: filesData, error: filesError } = await supabase
      .from("submission_files")
      .select("id, display_name, original_filename, mime_type, extraction_status, created_at, extracted_text")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: false });

    if (filesError) {
      console.error("[ai-review] Files error:", filesError);
      return NextResponse.json({ ok: false, error: "Failed to load files" }, { status: 500 });
    }

    const files = (filesData || []) as FileRow[];

    const filePreviews = files.map((f) => {
      const text = (f.extracted_text ?? "").trim();
      const hasText = text.length > 0;
      return {
        id: f.id ?? "",
        display_name: f.display_name ?? f.original_filename ?? "Unknown",
        has_extracted_text: hasText,
        extracted_text: hasText ? text.slice(0, EXTRACT_PREVIEW_CHARS) : "",
      };
    });

    const contextBlock =
      filePreviews.length > 0
        ? JSON.stringify(filePreviews, null, 2)
        : "No files available.";

    const systemPrompt = `You are a Deal Pack Completeness Reviewer. Your job is to identify only MISSING INFORMATION or UNCLEAR CONTEXT in the submission. You must NOT assess credit quality, risk, or approval likelihood.

Output only valid JSON, no markdown. Use this exact finding structure:
{
  "finding_id": "<slug>",
  "title": "<short title>",
  "severity": "critical" | "active" | "info",
  "explanation": "<why this is a gap>",
  "fix": "<what to provide or clarify>",
  "evidence": []
}

Severity rules:
- "critical": deal cannot proceed without this information.
- "active": likely lender follow-up question; should be addressed.
- "info": minor improvement or clarification.

Use stable finding_id slugs (e.g. ai_missing_purpose, ai_missing_ownership_chart, ai_missing_loan_purpose, ai_missing_borrower_structure, ai_missing_security_details, ai_missing_use_of_funds, ai_missing_repayment_source, ai_incomplete_context, ai_missing_key_dates, ai_unclear_terms).
Return at most ${MAX_FINDINGS} findings. If nothing is clearly missing, return {"findings": []}.`;

    const userPrompt = `Review the following submission file list and extracted text for completeness. List only missing info or missing context (no credit/risk/approval assessment).\n\n${contextBlock}`;

    const raw = await callLLM(userPrompt, systemPrompt);

    let parsed: unknown;
    try {
      const cleaned = raw.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, "$1").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("[ai-review] JSON parse error:", e);
      return NextResponse.json({ ok: false, error: "Invalid AI response format" }, { status: 500 });
    }

    const withOk = Array.isArray((parsed as { findings?: unknown })?.findings)
      ? { ok: true as const, findings: (parsed as { findings: unknown[] }).findings }
      : { ok: true as const, findings: [] };
    const result = AIReviewResponseSchema.safeParse(withOk);
    if (!result.success) {
      const rawFindings = Array.isArray((parsed as { findings?: unknown[] })?.findings)
        ? (parsed as { findings: Array<Record<string, unknown>> }).findings
        : [];
      const fallback = rawFindings
        .filter((f) => f && typeof f.finding_id === "string" && /^ai_[a-z0-9_]+$/.test(f.finding_id as string))
        .slice(0, MAX_FINDINGS)
        .map((f) => ({
          finding_id: String(f.finding_id),
          title: String(f.title ?? "Missing context"),
          severity: "active" as const,
          explanation: String(f.explanation ?? f.message ?? f.title ?? "Review this item."),
          fix: String(f.fix ?? "Review this item and provide clarification."),
          evidence: [] as Array<{ source: "submission" | "file"; id: string; quote: string }>,
        }));
      return NextResponse.json({ ok: true, findings: fallback });
    }
    return NextResponse.json(result.data);
  } catch (err) {
    console.error("[ai-review] Error:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
