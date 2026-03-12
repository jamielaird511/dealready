import { z } from "zod";

const ConfidenceSchema = z.number().min(0).max(1);

export const TextFieldSchema = z.object({
  value: z.string().trim().min(1).nullable(),
  confidence: ConfidenceSchema,
});

export const NumberFieldSchema = z.object({
  value: z.number().finite().nullable(),
  confidence: ConfidenceSchema,
});

export const DealSenseSummaryDataSchema = z.object({
  ok: z.literal(true),

  borrower_name: TextFieldSchema,
  purpose: TextFieldSchema,

  purchase_price_total: NumberFieldSchema,
  purchase_price_breakdown: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        amount: z.number().finite().nullable(),
        confidence: ConfidenceSchema,
      })
    )
    .max(8)
    .default([]),

  repayment_source: TextFieldSchema,

  key_people: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        role: z.string().trim().min(1).nullable(),
        confidence: ConfidenceSchema,
      })
    )
    .max(8)
    .default([]),

  forecast_figures: z.object({
    revenue: NumberFieldSchema,
    ebitda: NumberFieldSchema,
    dscr: NumberFieldSchema,
    notes: TextFieldSchema,
  }),

  key_unknowns: z
    .array(
      z.object({
        bullet: z.string().trim().min(1),
        confidence: ConfidenceSchema,
      })
    )
    .max(8)
    .default([]),
});

export type DealSenseSummaryData = z.infer<typeof DealSenseSummaryDataSchema>;

const SUMMARY_MODEL = "gpt-4o-mini";

function safeJsonParse(raw: string): unknown {
  const cleaned = raw.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, "$1").trim();
  return JSON.parse(cleaned);
}

export async function extractDealSummaryData(input: {
  run_id: string;
  purpose_type?: string;
  parties?: Array<{ roles: string[] }>;
  combined_extracted_text: string;
  findings_titles?: string[];
}): Promise<{ ok: true; data: DealSenseSummaryData } | { ok: false; error: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY not set" };
  }

  const systemPrompt = `You are assisting a commercial credit analyst reviewing a lending submission.

Extract transaction facts from SOURCE DOCUMENT TEXT. Do not rely on system mechanics or scoring language.

Output ONLY strict JSON. No markdown. No prose.

Rules:
- Do NOT present low-confidence facts as confirmed.
- Each field must include a confidence score in [0,1].
- Use null when information is missing or too uncertain.
- If you infer anything, keep confidence low (<= 0.5).
- If the extracted text is messy or ambiguous, reflect that via null/low confidence.

Return this exact JSON shape:
{
  "ok": true,
  "borrower_name": { "value": string|null, "confidence": number },
  "purpose": { "value": string|null, "confidence": number },
  "purchase_price_total": { "value": number|null, "confidence": number },
  "purchase_price_breakdown": [{ "label": string, "amount": number|null, "confidence": number }],
  "repayment_source": { "value": string|null, "confidence": number },
  "key_people": [{ "name": string, "role": string|null, "confidence": number }],
  "forecast_figures": {
    "revenue": { "value": number|null, "confidence": number },
    "ebitda": { "value": number|null, "confidence": number },
    "dscr": { "value": number|null, "confidence": number },
    "notes": { "value": string|null, "confidence": number }
  },
  "key_unknowns": [{ "bullet": string, "confidence": number }]
}`;

  const partiesBlock =
    input.parties && input.parties.length > 0
      ? JSON.stringify(input.parties)
      : "[]";
  const findingsBlock =
    input.findings_titles && input.findings_titles.length > 0
      ? input.findings_titles.slice(0, 8).map((t) => `- ${t}`).join("\n")
      : "- (none)";

  const userPrompt = `Deal context:
- purpose_type: ${input.purpose_type ?? "unknown"}
- parties: ${partiesBlock}

Known gaps (from findings; use only as hints for what may be missing, not as facts):
${findingsBlock}

SOURCE DOCUMENT TEXT (may be incomplete/dirty OCR; do your best, but stay conservative):
${input.combined_extracted_text}`;

  let raw: string;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 1200,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `OpenAI ${res.status}: ${errText.slice(0, 200)}` };
    }
    const data = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
    raw = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) return { ok: false, error: "Empty model response" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  let parsed: unknown;
  try {
    parsed = safeJsonParse(raw);
  } catch {
    return { ok: false, error: "Failed to parse JSON" };
  }

  const validated = DealSenseSummaryDataSchema.safeParse(parsed);
  if (!validated.success) {
    return { ok: false, error: "JSON did not match expected schema" };
  }

  return { ok: true, data: validated.data };
}

