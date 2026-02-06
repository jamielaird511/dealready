import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_DOC_TYPES = [
  "bank_statement",
  "financial_statement",
  "tax_return",
  "id_document",
  "drivers_license",
  "passport",
  "payslip",
  "rental_statement",
  "valuation_report",
  "insurance_schedule",
  "loan_facility_letter",
  "trust_deed",
  "company_documents",
  "other",
] as const;

const MAX_INPUT_LENGTH = 12_000;
const CLASSIFY_MODEL = "gpt-4o-mini";

type ChunkRow = { content?: string | null; chunk_index?: number };

function parseClassificationResponse(body: string): {
  doc_type: string;
  confidence: number;
  reasons: string[];
} | null {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const doc_type = typeof o.doc_type === "string" ? o.doc_type.trim() : "other";
    let confidence = typeof o.confidence === "number" ? o.confidence : 0;
    confidence = Math.max(0, Math.min(1, confidence));
    let reasons = Array.isArray(o.reasons) ? o.reasons : [];
    reasons = reasons
      .filter((r): r is string => typeof r === "string")
      .map((r) => r.trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 5);
    if (reasons.length === 0) reasons = ["Classification completed"];
    return { doc_type, confidence, reasons };
  } catch {
    return null;
  }
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await context.params;
    if (!fileId) {
      return NextResponse.json({ ok: false, error: "Missing fileId" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: fileRow, error: fileError } = await supabase
      .from("submission_files")
      .select("id, extraction_status")
      .eq("id", fileId)
      .maybeSingle();

    if (fileError || !fileRow) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const extractionStatus = (fileRow as { extraction_status?: string | null }).extraction_status;
    if (extractionStatus !== "succeeded") {
      return NextResponse.json({ ok: false, error: "Extraction not succeeded" }, { status: 400 });
    }

    const { data: chunksData, error: chunksError } = await supabase
      .from("submission_file_chunks")
      .select("content, chunk_index")
      .eq("submission_file_id", fileId)
      .order("chunk_index", { ascending: true });

    if (chunksError) {
      console.error("[classify] Chunks error:", chunksError.message);
      return NextResponse.json({ ok: false, error: "Failed to load chunks" }, { status: 500 });
    }

    const chunks = (chunksData || []) as ChunkRow[];
    if (chunks.length === 0) {
      return NextResponse.json({ ok: false, error: "No chunks found" }, { status: 400 });
    }

    const fullText = chunks
      .map((c) => (c.content ?? "").trim())
      .filter(Boolean)
      .join("\n\n");
    const cappedText = fullText.slice(0, MAX_INPUT_LENGTH);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[classify] OPENAI_API_KEY not set");
      return NextResponse.json({ ok: false, error: "Classification failed" }, { status: 500 });
    }

    const systemPrompt = `You classify document text into exactly one doc_type. Reply with valid JSON only, no markdown or extra text.
Output shape must be exactly:
{"doc_type": "<one of allowed>", "confidence": <number 0-1>, "reasons": ["<short reason>", ...]}

Allowed doc_type values (use exactly one): ${ALLOWED_DOC_TYPES.join(", ")}`;

    const userPrompt = `Classify this document. Return only the JSON object.\n\n${cappedText}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CLASSIFY_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 300,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[classify] OpenAI error:", res.status, errText.slice(0, 200));
      return NextResponse.json({ ok: false, error: "Classification failed" }, { status: 500 });
    }

    const data = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.error("[classify] No content in OpenAI response");
      return NextResponse.json({ ok: false, error: "Classification failed" }, { status: 500 });
    }

    const parsed = parseClassificationResponse(content);
    if (!parsed) {
      console.error("[classify] Invalid JSON from model");
      return NextResponse.json({ ok: false, error: "Classification failed" }, { status: 500 });
    }

    const doc_type = ALLOWED_DOC_TYPES.includes(parsed.doc_type as (typeof ALLOWED_DOC_TYPES)[number])
      ? parsed.doc_type
      : "other";
    const confidence = Math.max(0, Math.min(1, parsed.confidence));
    const reasons = parsed.reasons;

    const { error: updateError } = await supabase
      .from("submission_files")
      .update({
        doc_type,
        doc_type_confidence: confidence,
        doc_type_reasons: reasons,
        doc_type_model: CLASSIFY_MODEL,
        doc_type_ran_at: new Date().toISOString(),
      })
      .eq("id", fileId);

    if (updateError) {
      console.error("[classify] Update error:", updateError.message);
      return NextResponse.json({ ok: false, error: "Classification failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, doc_type, confidence });
  } catch (err) {
    console.error("[classify] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Classification failed" }, { status: 500 });
  }
}
