import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeFindings, type Party } from "@/lib/dealsense/runChecks";
import { extractDealSummaryData } from "@/lib/dealsense/extractDealSummaryData";
import { renderDealSummary } from "@/lib/dealsense/renderDealSummary";
import { BUSINESS_PURCHASE_QUESTIONS, DEALSENSE_QUESTIONS } from "@/lib/dealsense/questions";

type FileRow = {
  id?: string;
  category?: string | null;
  display_name?: string | null;
  original_filename?: string | null;
  extraction_status?: string | null;
  extracted_text?: string | null;
  doc_type?: string | null;
};

type DealSenseQuestionAnswer = {
  question_id: string;
  answer: string;
  confidence: "high" | "medium" | "low";
  evidence: string;
  value?: number;
  currency?: string;
  unit?: string;
  metrics?: Record<string, unknown>;
};

type BusinessPurchaseClarification = {
  id: string;
  category: string;
  question: string;
  action: string;
  reason: string;
  confidence: number;
};

type CreditFindingsLayer = {
  key_risks: string[];
  structuring_considerations: string[];
  strengths: string[];
  has_historical_financials: boolean;
  forecast_reliance: boolean;
};

const AI_EXTRACT_PREVIEW_CHARS = 4000;
const AI_QUESTIONS_MODEL = "gpt-4o-mini";
const COULD_NOT_DETERMINE = "DealSense could not determine this from the documents provided";

function isAnsweredText(input: unknown): boolean {
  if (typeof input !== "string") return false;
  const s = input.trim().toLowerCase();
  if (!s) return false;
  if (s.includes("could not determine")) return false;
  if (s.includes("not provided")) return false;
  if (s.includes("not available")) return false;
  if (s.includes("not yet identified")) return false;
  return true;
}

function isBusinessPurchaseContext(params: {
  purposeType: string;
  extractedPurpose: unknown;
  combinedText: string;
}): boolean {
  const p = params.purposeType.toLowerCase();
  if (p.includes("business_purchase")) return true;
  const extracted = typeof params.extractedPurpose === "string" ? params.extractedPurpose.toLowerCase() : "";
  const text = params.combinedText.toLowerCase();
  return (
    extracted.includes("business") ||
    extracted.includes("acquisition") ||
    text.includes("business purchase") ||
    text.includes("business acquisition") ||
    text.includes("asset purchase") ||
    text.includes("share purchase")
  );
}

function buildBusinessPurchaseClarifications(params: {
  purposeType: string;
  extractedData: any;
  dealSenseQuestionAnswers: DealSenseQuestionAnswer[];
  combinedText: string;
  files: FileRow[];
}): BusinessPurchaseClarification[] {
  const { purposeType, extractedData, dealSenseQuestionAnswers, combinedText, files } = params;
  if (!isBusinessPurchaseContext({ purposeType, extractedPurpose: extractedData?.purpose?.value, combinedText })) {
    return [];
  }

  const text = combinedText.toLowerCase();
  const answerById = new Map<string, DealSenseQuestionAnswer>();
  for (const a of dealSenseQuestionAnswers) answerById.set(a.question_id, a);
  const answerText = (id: string) => answerById.get(id)?.answer ?? "";

  const hasFinancialDocs = files.some((f) => {
    const n = (f.display_name ?? f.original_filename ?? "").toLowerCase();
    const t = (f.doc_type ?? "").toLowerCase();
    return (
      t.includes("financial") ||
      n.includes("financial statement") ||
      n.includes("profit") ||
      n.includes("p&l") ||
      n.includes("balance sheet")
    );
  });

  const breakdownItems = Array.isArray(extractedData?.purchase_price_breakdown)
    ? extractedData.purchase_price_breakdown
    : [];
  const breakdownLabels = breakdownItems.map((b: any) => (typeof b?.label === "string" ? b.label.toLowerCase() : ""));
  const hasBreakdown = ["goodwill", "plant", "equipment", "stock", "inventory"].some((k) =>
    breakdownLabels.some((l: string) => l.includes(k))
  );

  const checks: Record<string, boolean> = {
    purchase_structure:
      text.includes("asset purchase") ||
      text.includes("share purchase") ||
      isAnsweredText(answerText("transaction_asset")),
    purchase_price_breakdown: hasBreakdown,
    equity_contribution: isAnsweredText(answerText("equity_contribution")),
    vendor_finance:
      text.includes("vendor finance") ||
      text.includes("seller finance") ||
      text.includes("no vendor finance"),
    historical_financials: isAnsweredText(answerText("historical_financials")) || hasFinancialDocs,
    normalised_ebitda:
      text.includes("normalised ebitda") ||
      text.includes("normalized ebitda") ||
      text.includes("adjusted ebitda"),
    debt_servicing_capacity:
      typeof extractedData?.forecast_figures?.dscr?.value === "number" ||
      text.includes("dscr") ||
      text.includes("debt service coverage"),
    tax_and_liabilities:
      text.includes("tax arrears") ||
      text.includes("contingent liabilities") ||
      text.includes("creditor") ||
      text.includes("no tax arrears") ||
      text.includes("no contingent liabilities"),
    customer_concentration:
      text.includes("customer concentration") ||
      text.includes("revenue concentration") ||
      text.includes("top customer") ||
      text.includes("customer mix"),
    security_position:
      isAnsweredText(answerText("security_assets")) ||
      text.includes("security offered") ||
      text.includes("personal guarantee") ||
      text.includes("general security agreement"),
  };

  const ownerOperatorDetected =
    text.includes("owner-operator") ||
    text.includes("owner operator") ||
    text.includes("owner operated") ||
    text.includes("founder-led") ||
    text.includes("director-managed") ||
    text.includes("director operated");
  const managerStructureDetected =
    text.includes("management team") ||
    text.includes("general manager") ||
    text.includes("manager-run") ||
    text.includes("manager run") ||
    text.includes("independent manager") ||
    text.includes("day-to-day manager");
  const ownerRoleMentioned =
    ownerOperatorDetected ||
    managerStructureDetected ||
    text.includes("operational experience") ||
    text.includes("industry experience") ||
    text.includes("currently involved") ||
    text.includes("already involved") ||
    text.includes("owner involvement") ||
    text.includes("management structure") ||
    text.includes("owner role");

  return BUSINESS_PURCHASE_QUESTIONS
    .filter((q) => (q.id === "owner_involvement_management" ? true : !checks[q.id]))
    .map((q) => ({
      id: q.id,
      category: q.category,
      question: q.question,
      action:
        q.id === "purchase_structure"
          ? "Confirm whether the transaction is an asset or share purchase."
          : q.id === "purchase_price_breakdown"
          ? "Provide a purchase price breakdown across goodwill, plant & equipment, and stock."
          : q.id === "equity_contribution"
          ? "Confirm equity contribution amount and source of funds."
          : q.id === "vendor_finance"
          ? "Confirm whether vendor finance is included and provide amount, ranking, and repayment terms."
          : q.id === "historical_financials"
          ? "Provide the last 2-3 years of financial statements."
          : q.id === "normalised_ebitda"
          ? "Provide normalized EBITDA and clearly document all adjustments."
          : q.id === "debt_servicing_capacity"
          ? "Provide expected debt servicing position, including DSCR."
          : q.id === "owner_involvement_management"
          ? ownerRoleMentioned
            ? "Confirm post-settlement remuneration and final management structure."
            : "Confirm post-settlement ownership, management structure, and remuneration."
          : q.id === "tax_and_liabilities"
          ? "Confirm tax position, creditor status, and any contingent liabilities."
          : q.id === "customer_concentration"
          ? "Confirm customer/revenue concentration and exposure to key counterparties."
          : q.id === "security_position"
          ? "Confirm full security package including business assets, property, and guarantees."
          : q.question,
      reason: q.reason,
      confidence: 0.9,
    }));
}

function buildCreditFindingsLayer(params: {
  extractedData: any;
  dealSenseQuestionAnswers: DealSenseQuestionAnswer[];
  combinedText: string;
  files: FileRow[];
}): CreditFindingsLayer {
  const { extractedData, dealSenseQuestionAnswers, combinedText, files } = params;
  const normalizedCombined = combinedText.toLowerCase().replace(/\s+/g, " ").trim();
  const text = normalizedCombined;
  const risks: string[] = [];
  const structuring: string[] = [];
  const strengths: string[] = [];
  const cashflowPhrasesMatched: string[] = [];
  const historicalSignalsMatched: string[] = [];

  const docClassifications = files.map((f) => {
    const name = (f.display_name ?? f.original_filename ?? "").toLowerCase();
    const snippetRaw = (f.extracted_text ?? "").slice(0, 2000);
    const snippet = snippetRaw.toLowerCase();
    const tags: string[] = [];

    const textBlock = `${name} ${snippet}`;

    const isForecastLike =
      textBlock.includes("forecast") ||
      textBlock.includes("projected") ||
      textBlock.includes("projection") ||
      textBlock.includes("on purchase") ||
      textBlock.includes("cashflow forecast") ||
      textBlock.includes("cash flow forecast") ||
      textBlock.includes("balance sheet forecast");

    const hasHistoricalIndicators =
      (textBlock.includes("financial statements") ||
        textBlock.includes("profit and loss") ||
        textBlock.includes("p&l") ||
        textBlock.includes("balance sheet") ||
        textBlock.includes("annual accounts") ||
        textBlock.includes("prior trading results") ||
        textBlock.includes("comparative accounts") ||
        textBlock.includes("comparative financials")) &&
      !isForecastLike;

    const hasHistoricalYearTag = /\bfy20[0-9]\b/.test(textBlock);

    if (hasHistoricalIndicators || hasHistoricalYearTag) {
      tags.push("historical_financials");
    }

    if (textBlock.includes("cashflow forecast") || textBlock.includes("cash flow forecast")) {
      tags.push("cashflow_forecast");
    }

    if (textBlock.includes("forecast") || textBlock.includes("projected")) {
      tags.push("forecast_financials");
    }

    if (textBlock.includes("business plan")) {
      tags.push("business_plan");
    }

    if (textBlock.includes("application") || textBlock.includes("deal summary") || textBlock.includes("submission")) {
      tags.push("application");
    }

    if (textBlock.includes("statement of position") || textBlock.includes("sop")) {
      tags.push("statement_of_position");
    }

    return {
      id: f.id ?? null,
      name: name || "(unnamed)",
      tags,
    };
  });

  const answerById = new Map<string, DealSenseQuestionAnswer>();
  for (const a of dealSenseQuestionAnswers) answerById.set(a.question_id, a);
  const equityAnswer = answerById.get("equity_contribution");
  const ownerRemAnswer = answerById.get("owner_remuneration");
  const forecastsAnswer = answerById.get("forecasts");

  const hasCashflowSignal =
    text.includes("cash flow") ||
    text.includes("cashflow") ||
    typeof extractedData?.forecast_figures?.revenue?.value === "number" ||
    typeof extractedData?.forecast_figures?.ebitda?.value === "number";

  // Scan cashflow-forecast documents directly
  let explicitCashflowExclusionFromDocs = false;
  let cashflowDocNormalizedPreview = "";
  const cashflowDocs = files.filter((f) => {
    const name = (f.display_name ?? f.original_filename ?? "").toLowerCase();
    return name.includes("cashflow forecast") || name.includes("cash flow forecast");
  });
  for (const f of cashflowDocs) {
    const raw = (f.extracted_text ?? "").toString();
    const rawLower = raw.toLowerCase();
    const length = raw.length;
    const tail = raw.slice(Math.max(0, length - 500));
    const exactPhrases = [
      "no loan principal repayments",
      "no loan principal repayments or drawings considered",
      "no drawings considered",
    ];
    const foundExact = exactPhrases.filter((p) => raw.includes(p));
    const normalizedCashflow = rawLower.replace(/\s+/g, " ").trim();
    const cashflowPhrases = [
      "no loan principal repayments",
      "no principal repayments",
      "no drawings",
      "debt servicing not included",
      "loan repayments not included",
      "loan principal repayments",
      "drawings considered",
      "no drawings considered",
      "repayments or drawings considered",
    ];
    const foundNormalized = cashflowPhrases.filter((p) => normalizedCashflow.includes(p));
    if (foundExact.length > 0 || foundNormalized.length > 0) {
      explicitCashflowExclusionFromDocs = true;
      cashflowPhrasesMatched.push(...foundExact, ...foundNormalized);
    }
    if (!cashflowDocNormalizedPreview) {
      cashflowDocNormalizedPreview = normalizedCashflow.slice(-500);
    }
    console.log("[DealSense CreditLayer] cashflowDoc", {
      name: f.display_name ?? f.original_filename ?? "(unnamed)",
      length,
      tail,
      foundExact,
      foundNormalized,
    });
  }

  const explicitCashflowExclusionCombined =
    ["no loan principal repayments", "no principal repayments", "no drawings", "debt servicing not included", "loan repayments not included"].some(
      (phrase) => {
        if (text.includes(phrase)) {
          cashflowPhrasesMatched.push(phrase);
          return true;
        }
        return false;
      }
    );
  const hasRepaymentSignal =
    isAnsweredText(extractedData?.repayment_source?.value) ||
    text.includes("loan repayment") ||
    text.includes("debt servicing") ||
    text.includes("debt service");
  const hasDrawingsSignal =
    isAnsweredText(ownerRemAnswer?.answer) ||
    text.includes("drawings") ||
    text.includes("owner salary") ||
    text.includes("remuneration");
  const explicitCashflowExclusion = explicitCashflowExclusionFromDocs || explicitCashflowExclusionCombined;

  if (explicitCashflowExclusion || (hasCashflowSignal && (!hasRepaymentSignal || !hasDrawingsSignal))) {
    risks.push(
      "Cashflow forecast excludes debt servicing and/or owner drawings, limiting reliability of serviceability assessment."
    );
  }

  const equityUnclear =
    !isAnsweredText(equityAnswer?.answer) ||
    equityAnswer?.confidence === "low" ||
    equityAnswer?.confidence === "medium";
  const shareholderAdvanceSignal =
    text.includes("shareholder current account") ||
    text.includes("shareholder advance") ||
    text.includes("shareholder loan");
  if (equityUnclear || shareholderAdvanceSignal) {
    structuring.push(
      "Equity contribution may be supported by shareholder advances. Confirm whether funds are to be subordinated (e.g. Deed of Postponement) to be treated as effective equity."
    );
  }

  const forecastRelianceSignal =
    isAnsweredText(forecastsAnswer?.answer) ||
    text.includes("forecast") ||
    text.includes("forward contract") ||
    text.includes("forward contracts");
  const historicalFinancialsDetectedFromDocs = docClassifications.some((d) => d.tags.includes("historical_financials"));
  if (historicalFinancialsDetectedFromDocs) historicalSignalsMatched.push("doc:historical_financials");
  const hasHistoricalAnswer = isAnsweredText(answerById.get("historical_financials")?.answer);
  const historicalFinancialsDetected = hasHistoricalAnswer || historicalFinancialsDetectedFromDocs;
  if (
    forecastRelianceSignal &&
    !historicalFinancialsDetected &&
    !hasHistoricalAnswer &&
    historicalSignalsMatched.length === 0
  ) {
    risks.push(
      "Serviceability is based on forecast earnings without supporting historical financials provided in the initial pack, limiting the ability to validate income sustainability."
    );
  }

  const hasBusinessIncome =
    text.includes("business income") ||
    text.includes("trading income") ||
    text.includes("ebitda") ||
    text.includes("business earnings");
  const hasPayeIncome = text.includes("paye") || text.includes("salary and wages");
  if (hasBusinessIncome && hasPayeIncome) {
    strengths.push(
      "Repayment supported by diversified income streams, including business earnings and PAYE income."
    );
  }

  const propertyWordCount = (text.match(/\bproperty\b/g) || []).length;
  const hasNumberedProperties = /\bproperty\s*(1|one)\b/.test(text) && /\bproperty\s*(2|two)\b/.test(text);
  const hasMultiplePropertySecurity =
    text.includes("multiple properties") ||
    text.includes("properties offered as security") ||
    hasNumberedProperties ||
    propertyWordCount >= 2;
  const hasStrongAssetBacking =
    text.includes("strong asset backing") ||
    text.includes("asset backing") ||
    text.includes("additional collateral");
  if (hasMultiplePropertySecurity || hasStrongAssetBacking) {
    strengths.push(
      "Lending supported by multiple property securities, providing additional downside protection."
    );
  }

  console.log("[DealSense CreditLayer] docClassifications:", docClassifications);
  console.log("[DealSense CreditLayer] cashflowPhrasesMatched:", cashflowPhrasesMatched);
  console.log("[DealSense CreditLayer] cashflowDocNormalizedPreview:", cashflowDocNormalizedPreview);
  console.log("[DealSense CreditLayer] historicalSignalsMatched:", historicalSignalsMatched);
  console.log("[DealSense CreditLayer] key_risks:", risks);

  return {
    key_risks: [...new Set(risks)],
    structuring_considerations: [...new Set(structuring)],
    strengths: [...new Set(strengths)],
    has_historical_financials: historicalFinancialsDetected,
    forecast_reliance: forecastRelianceSignal,
  };
}

function isMissingOrLowConfidence(a: DealSenseQuestionAnswer): boolean {
  const lowConfidence = a.confidence === "low";
  const missing =
    !a.answer?.trim() ||
    a.answer.toLowerCase().includes("could not determine");
  return lowConfidence || missing;
}

async function generateDealSenseQuestionAnswers(
  files: FileRow[]
): Promise<DealSenseQuestionAnswer[]> {
  const filePreviews = files.map((f) => {
    const text = (f.extracted_text ?? "").trim();
    const hasText = text.length > 0;
    return {
      id: f.id ?? "",
      display_name: f.display_name ?? f.original_filename ?? "Unknown",
      has_extracted_text: hasText,
      extracted_text: hasText ? text.slice(0, AI_EXTRACT_PREVIEW_CHARS) : "",
    };
  });
  const contextBlock =
    filePreviews.length > 0 ? JSON.stringify(filePreviews, null, 2) : "No files available.";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("[DealSense Process AI][questions] OPENAI_API_KEY not set; skipping.");
    return [];
  }

  const questionsBlock = DEALSENSE_QUESTIONS.map(
    (q) => `- ${q.id}: ${q.question}`
  ).join("\n");

  const systemPrompt = `You are DealSense, an AI credit analyst reviewing lending transaction documents.

Using the provided document extracts, answer the following deal questions.

For each question return:
- answer
- confidence (high/medium/low)
- supporting evidence (document name or section)
- OPTIONAL numeric fields where clearly identifiable:
  - value (number, e.g. 1200000 for $1.2m)
  - currency (e.g. "NZD", "AUD", "USD")
  - unit (e.g. "amount", "revenue", "EBITDA", "forecast_revenue")
- if information cannot be located, return "${COULD_NOT_DETERMINE}" as the answer and omit value/currency/unit.

Purchase price guidance (question_id "purchase_price"):
- Look for phrases such as: "purchase price", "acquisition price", "sale price", "transaction value", "business price", "vendor asking price", "agreed price", "purchase consideration".
- Support common currency formats: "$1,200,000", "$1.2m", "1.2m", "NZD 1,200,000", "NZD1.2m".
- When you see a clear total purchase price in the documents, return a numeric value (e.g. 1200000 for $1.2m) and the currency where possible.
- If both the bank funding requested (question_id "bank_funding") and equity contribution (question_id "equity_contribution") appear as clear numeric amounts and no explicit purchase price is stated, you may infer purchase price as their sum.
  - In this case, use medium or low confidence (<= 0.6), and make sure the inferred amount is plausible relative to other large transaction numbers (not orders of magnitude out of line).
  - Clearly reflect in the natural-language answer that the purchase price is inferred from funding + equity.
- Do NOT invent a purchase price when numbers are ambiguous or obviously inconsistent; prefer "${COULD_NOT_DETERMINE}" with low confidence instead.

Additionally, for selected questions, include a compact metrics object when clearly identifiable:
- For "historical_financials": metrics: { "revenue": number, "gross_margin_percent": number, "ebitda": number, "period": string, "currency": string }
- For "forecasts": metrics: { "forecast_revenue": number, "forecast_ebitda": number, "forecast_profit": number, "period": string, "currency": string }
- For "bank_funding": metrics: { "min_value": number, "max_value": number, "currency": string }

Output ONLY valid JSON: an array of objects with keys: question_id, answer, confidence, evidence, and optional value, currency, unit, metrics.
No markdown, no extra text. Example: [{"question_id":"purchase_price","answer":"$1,200,000","value":1200000,"currency":"NZD","confidence":"high","evidence":"Application.pdf","metrics":{}}]`;

  const userPrompt = `Document extracts:\n${contextBlock}\n\nQuestions to answer (use question_id exactly as listed):\n${questionsBlock}\n\nReturn one object per question in the same order, with question_id, answer, confidence, evidence, and optional value/currency/unit where numeric values are clear. When metrics apply for historical_financials, forecasts, or bank_funding, include the metrics object as described in the system instructions.`;

  let raw: string;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AI_QUESTIONS_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      }),
    });
    if (!res.ok) {
      console.log("[DealSense Process AI][questions] OpenAI HTTP error:", res.status);
      return [];
    }
    const data = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
    raw = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      console.log("[DealSense Process AI][questions] Model returned empty content.");
      return [];
    }
  } catch (err) {
    console.log(
      "[DealSense Process AI][questions] Error calling OpenAI:",
      err instanceof Error ? err.message : err
    );
    return [];
  }

  let parsed: unknown;
  try {
    const cleaned = raw.replace(/^[\s\S]*?(\[[\s\S]*\])[\s\S]*$/m, "$1").trim();
    parsed = JSON.parse(cleaned) as unknown;
  } catch {
    console.log("[DealSense Process AI][questions] JSON parse failed.");
    return [];
  }

  const arr = Array.isArray(parsed) ? parsed : [];
  const idSet: Set<string> = new Set(DEALSENSE_QUESTIONS.map((q) => q.id));
  const out: DealSenseQuestionAnswer[] = [];
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    const question_id = typeof r.question_id === "string" ? r.question_id.trim() : "";
    if (!question_id || !idSet.has(question_id)) continue;
    const answer = typeof r.answer === "string" ? r.answer.trim() : "";
    const confidenceRaw = typeof r.confidence === "string" ? r.confidence.toLowerCase() : "";
    const confidence: DealSenseQuestionAnswer["confidence"] =
      confidenceRaw === "high" ? "high" : confidenceRaw === "medium" ? "medium" : "low";
    const evidence = typeof r.evidence === "string" ? r.evidence.trim() : "";
    const value =
      typeof r.value === "number" && Number.isFinite(r.value as number)
        ? (r.value as number)
        : undefined;
    const currency =
      typeof r.currency === "string" && r.currency.trim() ? r.currency.trim() : undefined;
    const unit = typeof r.unit === "string" && r.unit.trim() ? r.unit.trim() : undefined;
    const metrics =
      r.metrics && typeof r.metrics === "object" && r.metrics !== null
        ? (r.metrics as Record<string, unknown>)
        : undefined;
    out.push({ question_id, answer, confidence, evidence, value, currency, unit, metrics });
  }
  return out;
}

function questionAnswersToFindings(
  answers: DealSenseQuestionAnswer[]
): Array<{ finding_id: string; title: string; severity: "warning"; message: string; fix: string }> {
  const byId: Map<string, (typeof DEALSENSE_QUESTIONS)[number]> = new Map(
    DEALSENSE_QUESTIONS.map((q) => [q.id, q] as const)
  );
  const findings: Array<{
    finding_id: string;
    title: string;
    severity: "warning";
    message: string;
    fix: string;
  }> = [];
  for (const a of answers) {
    if (!isMissingOrLowConfidence(a)) continue;
    const q = byId.get(a.question_id);
    const questionSummary = q ? q.question : a.question_id;
    const title = `DealSense could not determine: ${questionSummary}`;
    findings.push({
      finding_id: `dealsense_q_${a.question_id}`,
      title,
      severity: "warning",
      message: a.answer || title,
      fix: "Provide supporting documents or clarify in the pack.",
    });
  }
  return findings;
}

async function generateDealSenseSingleQuestionAnswer(
  files: FileRow[],
  questionId: string,
  documentHint: string | undefined,
  note: string | undefined
): Promise<DealSenseQuestionAnswer | null> {
  const question = DEALSENSE_QUESTIONS.find((q) => q.id === questionId);
  if (!question) return null;

  const filePreviews = files.map((f) => {
    const text = (f.extracted_text ?? "").trim();
    const hasText = text.length > 0;
    return {
      id: f.id ?? "",
      display_name: f.display_name ?? f.original_filename ?? "Unknown",
      has_extracted_text: hasText,
      extracted_text: hasText ? text.slice(0, AI_EXTRACT_PREVIEW_CHARS) : "",
    };
  });
  const contextBlock =
    filePreviews.length > 0 ? JSON.stringify(filePreviews, null, 2) : "No files available.";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("[DealSense Process AI][question_recheck] OPENAI_API_KEY not set; skipping.");
    return null;
  }

  const guidanceParts: string[] = [];
  if (documentHint && documentHint.trim()) {
    guidanceParts.push(
      `Prioritise any content from documents matching or similar to: "${documentHint.trim()}".`
    );
  }
  if (note && note.trim()) {
    guidanceParts.push(
      `Broker note (treat as guidance only, do not override documents if inconsistent): "${note.trim()}".`
    );
  }
  const guidanceBlock =
    guidanceParts.length > 0 ? guidanceParts.join(" ") : "Use your best judgement from the documents.";

  const systemPrompt = `You are DealSense, an AI credit analyst reviewing lending transaction documents.

You are rechecking ONE specific information gap for a broker.

Question:
- ${question.id}: ${question.question}

Broker guidance:
${guidanceBlock}

Using ONLY the provided document extracts (and the broker guidance as context), answer this question.

Return:
- answer
- confidence (high/medium/low)
- supporting evidence (document name or section)
- OPTIONAL numeric fields where clearly identifiable:
  - value (number, e.g. 1200000 for $1.2m)
  - currency (e.g. "NZD", "AUD", "USD")
  - unit (e.g. "amount", "revenue", "EBITDA", "forecast_revenue")
- if information cannot be located in the documents, return "${COULD_NOT_DETERMINE}" as the answer and omit value/currency/unit.

Output ONLY valid JSON with shape:
{"question_id": "${question.id}", "answer": "...", "confidence": "high"|"medium"|"low", "evidence": "...", "value": 1200000, "currency": "NZD", "unit": "amount", "metrics": {}}`;

  const userPrompt = `Document extracts:\n${contextBlock}`;

  let raw: string;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AI_QUESTIONS_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      }),
    });
    if (!res.ok) {
      console.log("[DealSense Process AI][question_recheck] OpenAI HTTP error:", res.status);
      return null;
    }
    const data = (await res.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
    } | null;
    raw = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      console.log("[DealSense Process AI][question_recheck] Model returned empty content.");
      return null;
    }
  } catch (err) {
    console.log(
      "[DealSense Process AI][question_recheck] Error calling OpenAI:",
      err instanceof Error ? err.message : err
    );
    return null;
  }

  let parsed: any;
  try {
    const cleaned = raw.replace(/^[\\s\\S]*?(\\{[\\s\\S]*\\})[\\s\\S]*$/m, "$1").trim();
    parsed = JSON.parse(cleaned) as any;
  } catch {
    console.log("[DealSense Process AI][question_recheck] JSON parse failed.");
    return null;
  }

  const qid = typeof parsed?.question_id === "string" ? parsed.question_id.trim() : "";
  if (!qid || qid !== question.id) return null;
  const answer = typeof parsed?.answer === "string" ? parsed.answer.trim() : "";
  const confidenceRaw = typeof parsed?.confidence === "string" ? parsed.confidence.toLowerCase() : "";
  const confidence: DealSenseQuestionAnswer["confidence"] =
    confidenceRaw === "high" ? "high" : confidenceRaw === "medium" ? "medium" : "low";
  const evidence = typeof parsed?.evidence === "string" ? parsed.evidence.trim() : "";
  const value =
    typeof parsed?.value === "number" && Number.isFinite(parsed.value)
      ? (parsed.value as number)
      : undefined;
  const currency =
    typeof parsed?.currency === "string" && parsed.currency.trim()
      ? parsed.currency.trim()
      : undefined;
  const unit =
    typeof parsed?.unit === "string" && parsed.unit.trim() ? parsed.unit.trim() : undefined;
  const metrics =
    parsed?.metrics && typeof parsed.metrics === "object" && parsed.metrics !== null
      ? (parsed.metrics as Record<string, unknown>)
      : undefined;

  return { question_id: question.id, answer, confidence, evidence, value, currency, unit, metrics };
}

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
      .select("id, status, created_at, submission_id")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[DealSense Process API] Error loading runs:", error);
      return NextResponse.json({ error: "Failed to load runs" }, { status: 500 });
    }

    return NextResponse.json({ runs: runs || [] });
  } catch (err) {
    console.error("[DealSense Process API] Error in GET handler:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

export async function POST(
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

  console.log("[DealSense Process API] runId debug", {
    runIdFromParams: runId,
    urlRunId,
    finalRunId,
    url: req.url,
  });

  // Validate UUID format (basic check)
  console.log("[DealSense Process API] UUID validation debug", {
    runId: finalRunId,
    runIdJson: JSON.stringify(finalRunId),
    len: finalRunId?.length,
    charCodes: finalRunId?.split("").slice(0, 80).map(c => c.charCodeAt(0))
  });

  const isUuid = !!finalRunId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalRunId);

  if (!finalRunId) {
    return NextResponse.json({ error: "Missing runId", url: req.url }, { status: 400 });
  }

  if (!isUuid) {
    return NextResponse.json({ error: "Invalid runId", runId: finalRunId, runIdJson: JSON.stringify(finalRunId), len: finalRunId?.length }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Load submission_run
    const { data: run, error: runError } = await supabase
      .from("submission_runs")
      .select("*")
      .eq("id", runId)
      .maybeSingle();

    if (runError) {
          console.error("[DealSense Process API] Error loading run:", { runId: finalRunId, error: runError });
      return NextResponse.json({ error: "Failed to load run" }, { status: 500 });
    }

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // If status is running/completed/failed, skip processing
    if (["running", "completed", "failed"].includes(run.status)) {
      return NextResponse.json({ status: run.status, skipped: true });
    }

    // If not queued, something is wrong
    if (run.status !== "queued") {
      return NextResponse.json({ error: "Invalid run status" }, { status: 400 });
    }

    // Set status to running
    const { error: updateError } = await supabase
      .from("submission_runs")
      .update({
        status: "running",
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (updateError) {
      console.error("[DealSense Process API] Error updating run status:", updateError);
      return NextResponse.json({ error: "Failed to update run status" }, { status: 500 });
    }

    // Fetch related data
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select("deal_id")
      .eq("id", run.submission_id)
      .maybeSingle();

    if (submissionError || !submission) {
      console.error("[DealSense Process API] Error loading submission:", submissionError);
      await supabase
        .from("submission_runs")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", finalRunId);
      return NextResponse.json({ error: "Failed to load submission" }, { status: 500 });
    }

    // Fetch deal purpose_type
    let purposeType = "other";
    if (submission.deal_id) {
      const { data: deal } = await supabase
        .from("deals")
        .select("purpose_type")
        .eq("id", submission.deal_id)
        .maybeSingle();
      const pt = (deal as { purpose_type?: string } | null)?.purpose_type;
      if (typeof pt === "string" && pt.trim()) {
        purposeType = pt;
      }
    }

    // Fetch submission files (exclude soft-deleted so only current active files are analysed)
    const { data: files, error: filesError } = await supabase
      .from("submission_files")
      .select("id, category, display_name, original_filename, extraction_status, extracted_text, doc_type")
      .eq("submission_id", run.submission_id)
      .eq("is_deleted", false);

    if (filesError) {
      console.error("[DealSense Process API] Error loading files:", filesError);
      await supabase
        .from("submission_runs")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", finalRunId);
      return NextResponse.json({ error: "Failed to load files" }, { status: 500 });
    }

    // Fetch deal parties with entities join
    const { data: partiesData, error: partiesError } = await supabase
      .from("deal_parties")
      .select(`
        roles,
        role,
        entities:entity_id (
          id
        )
      `)
      .eq("deal_id", submission.deal_id);

    if (partiesError) {
      console.error("[DealSense Process API] Error loading parties:", partiesError);
      await supabase
        .from("submission_runs")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", finalRunId);
      return NextResponse.json({ error: "Failed to load parties" }, { status: 500 });
    }

    // Normalize parties data for computeFindings
    type PartyRow = { roles?: unknown; role?: unknown };
    const parties: Party[] = (partiesData || []).map((p: PartyRow): Party => ({
      roles: Array.isArray(p.roles) ? (p.roles as string[]) : (p.role != null ? [String(p.role)] : []),
      role: p.role != null ? String(p.role) : null,
    }));

    // Normalize files data
    const aiFiles = (files || []) as FileRow[];
    console.log(
      "[DealSense Process AI][files]",
      aiFiles.map((f) => ({
        id: f.id,
        display_name: f.display_name ?? f.original_filename ?? "Unknown",
        category: f.category ?? null,
        extraction_status: f.extraction_status ?? null,
        extracted_text_len: (f.extracted_text ?? "").length,
        doc_type: f.doc_type ?? null,
      }))
    );

    const normalizedFiles = aiFiles.map((f) => ({
      category: f.category,
      display_name: f.display_name,
      original_filename: f.original_filename,
    }));

    // Compute findings
    const { findings, summary } = computeFindings({
      files: normalizedFiles,
      parties: parties,
    });

    console.log("[DealSense] summary debug", summary);

    // AI findings: DealSense Question Engine (answer deal questions; low confidence/missing → findings)
    let dealSenseQuestionAnswers: DealSenseQuestionAnswer[] = [];
    let dealSenseQuestionFindings: Array<{
      finding_id: string;
      title: string;
      severity: "warning";
      message: string;
      fix: string;
    }> = [];

    try {
      console.log("[DealSense Process AI][questions] Calling generateDealSenseQuestionAnswers");
      dealSenseQuestionAnswers = await generateDealSenseQuestionAnswers(aiFiles);
      dealSenseQuestionFindings = questionAnswersToFindings(dealSenseQuestionAnswers);
      console.log(
        "[DealSense Process AI][questions] Answers:",
        dealSenseQuestionAnswers.length,
        "Findings from low/missing:",
        dealSenseQuestionFindings.length
      );
    } catch (err) {
      console.error(
        "[DealSense Process API] DealSense question engine failed:",
        err instanceof Error ? err.message : err
      );
    }

    // Delete existing findings for this run (idempotency)
    await supabase
      .from("submission_run_findings")
      .delete()
      .eq("run_id", runId);

    // Merge rule-based findings + DealSense question-engine findings (low/missing → clarification)
    const findingsToInsert = [
      ...findings.map((f) => ({
        run_id: finalRunId,
        severity: f.severity,
        category: f.category,
        message: f.message,
        finding_id: f.id,
        title: f.title,
        fix: f.fix,
        score_impact: f.scoreImpact,
        evidence: f.evidence ?? null,
      })),
      ...dealSenseQuestionFindings.map((f) => ({
        run_id: finalRunId,
        severity: f.severity,
        category: "clarification" as const,
        message: f.message,
        finding_id: f.finding_id,
        title: f.title,
        fix: f.fix,
        score_impact: 0,
        evidence: [],
      })),
    ];

    // DealSense structured summary extraction (typed JSON + deterministic render).
    // This is a reporting layer and does not affect findings generation or scoring.
    let dealSummaryData: unknown = null;
    let dealSummaryText = "";
    try {
      const criticalCount = findingsToInsert.filter((f: any) => f?.severity === "critical").length;
      const warningCount = findingsToInsert.filter((f: any) => f?.severity === "warning").length;
      const infoCount = findingsToInsert.filter((f: any) => f?.severity === "info").length;

      const openFindings = (findingsToInsert as any[]).filter((f) => {
        const s = (f?.workflow_state ?? "open").toString();
        return s === "open" || s === "acknowledged";
      });
      const hasOpenCritical = openFindings.some((f) => f?.severity === "critical");

      const topFindings = [...openFindings]
        .sort((a, b) => {
          const rank = (s: string) => (s === "critical" ? 0 : s === "warning" ? 1 : 2);
          return rank(a?.severity) - rank(b?.severity);
        })
        .slice(0, 6)
        .map((f) => {
          const t = typeof f?.title === "string" ? f.title.trim() : "";
          if (t) return t;
          const m = typeof f?.message === "string" ? f.message.trim() : "";
          return m;
        })
        .filter(Boolean);

      const themeCounts: Record<string, number> = {};
      for (const f of findingsToInsert as any[]) {
        const cat = (f?.category ?? "").toString().toLowerCase();
        const theme =
          cat === "parties"
            ? "Deal Structure"
            : cat === "clarification"
              ? "Compliance"
              : cat === "documents" || cat === "completeness"
                ? "Documents"
                : "Documents";
        themeCounts[theme] = (themeCounts[theme] ?? 0) + 1;
      }
      const themeSummary = Object.entries(themeCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");

      const combinedExtractedText = (aiFiles || [])
        .map((f: any) => {
          const name = (f?.display_name ?? f?.original_filename ?? f?.id ?? "File").toString();
          const text = (f?.extracted_text ?? "").toString().trim();
          if (!text) return "";
          return `--- ${name} ---\n${text}`;
        })
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 20000);

      const extracted = await extractDealSummaryData({
        run_id: runId,
        purpose_type: purposeType,
        parties: (parties || []).map((p: any) => ({ roles: Array.isArray(p.roles) ? p.roles : [] })),
        combined_extracted_text: combinedExtractedText,
        findings_titles: topFindings,
      });

      if (extracted.ok) {
        const businessClarifications = buildBusinessPurchaseClarifications({
          purposeType,
          extractedData: extracted.data,
          dealSenseQuestionAnswers,
          combinedText: combinedExtractedText,
          files: aiFiles,
        });
        const creditFindingsLayer = buildCreditFindingsLayer({
          extractedData: extracted.data,
          dealSenseQuestionAnswers,
          combinedText: combinedExtractedText,
          files: aiFiles,
        });
        const existingUnknowns = Array.isArray((extracted.data as any)?.key_unknowns)
          ? (extracted.data as any).key_unknowns
          : [];
        const clarificationBullets = businessClarifications
          .map((c) => ({
            bullet: `${c.category}: ${c.action}`,
            confidence: c.confidence,
          }))
          .filter((c, idx, arr) => arr.findIndex((x) => x.bullet === c.bullet) === idx);
        const mergedUnknowns = businessClarifications.length > 0
          ? clarificationBullets.slice(0, 10)
          : existingUnknowns.slice(0, 10);
        // Attach DealSense question answers so the reporting layer can surface
        // both what DealSense understands and remaining information gaps.
        const enrichedSummaryData = {
          ...(extracted.data as any),
          key_unknowns: mergedUnknowns,
          key_clarifications_required: businessClarifications,
          key_risks: creditFindingsLayer.key_risks,
          structuring_considerations: creditFindingsLayer.structuring_considerations,
          strengths: creditFindingsLayer.strengths,
          has_historical_financials: creditFindingsLayer.has_historical_financials,
          forecast_reliance: creditFindingsLayer.forecast_reliance,
          unknowns_label:
            businessClarifications.length > 0
              ? "Key clarifications required before submission"
              : (extracted.data as any)?.unknowns_label ?? "Key clarifications",
          dealsense_questions: dealSenseQuestionAnswers,
        };
        dealSummaryData = enrichedSummaryData;
        dealSummaryText = renderDealSummary(enrichedSummaryData as any, {
          ready_to_submit: summary.status === "ready" || summary.score >= 70,
          has_open_critical: hasOpenCritical,
        }).text;
      } else {
        console.log("[DealSense Process Summary] Summary extraction skipped/failed:", extracted.error);
      }
    } catch (err) {
      console.error("[DealSense Process Summary] Summary extraction error:", err);
    }

    if (findingsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("submission_run_findings")
        .insert(findingsToInsert);

      if (insertError) {
        console.error("[DealSense Process API] Error inserting findings:", insertError);
        await supabase
          .from("submission_runs")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", finalRunId);
        return NextResponse.json({ error: "Failed to insert findings" }, { status: 500 });
      }
    }

    // Set status to completed and persist assessment summary
    const { error: completeError } = await supabase
      .from("submission_runs")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
        score: summary.score,
        assessment_status: summary.status,
        top_fixes: summary.topFixes,
        assessed_at: new Date().toISOString(),
        deal_summary_data: dealSummaryData,
        deal_summary_text: dealSummaryText,
      })
      .eq("id", runId);

    if (completeError) {
      console.error("[DealSense Process API] Error completing run:", completeError);
      await supabase
        .from("submission_runs")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", finalRunId);
      return NextResponse.json({ error: "Failed to complete run" }, { status: 500 });
    }

    return NextResponse.json({
      status: "completed",
      findingsCount: findings.length,
      summary,
      deal_summary_data: dealSummaryData,
      deal_summary_text: dealSummaryText,
    });
  } catch (err) {
    console.error("[DealSense Process API] Error processing run:", err);
    
    // Try to set status to failed
    try {
      const supabase = await createSupabaseServerClient();
      await supabase
        .from("submission_runs")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", finalRunId);
    } catch (updateErr) {
      console.error("[DealSense Process API] Error setting failed status:", updateErr);
    }

    return NextResponse.json(
      { error: "An unexpected error occurred while processing the run" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  const { runId } = await context.params;

  try {
    const supabase = await createSupabaseServerClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const questionId = typeof body?.question_id === "string" ? body.question_id.trim() : "";
    const documentHint =
      typeof body?.document_hint === "string" ? body.document_hint.trim() : "";
    const note = typeof body?.note === "string" ? body.note.trim() : "";

    if (!questionId) {
      return NextResponse.json({ error: "Missing question_id" }, { status: 400 });
    }

    // Load run to ensure it exists and belongs to current user context
    const { data: run, error: runError } = await supabase
      .from("submission_runs")
      .select("*")
      .eq("id", runId)
      .maybeSingle();

    if (runError || !run) {
      console.error("[DealSense Question Recheck] Error loading run:", { runId, runError });
      return NextResponse.json({ error: "Failed to load run" }, { status: 500 });
    }

    // Fetch submission files (same filters as main run processing)
    const { data: files, error: filesError } = await supabase
      .from("submission_files")
      .select("id, category, display_name, original_filename, extraction_status, extracted_text, doc_type")
      .eq("submission_id", run.submission_id)
      .eq("is_deleted", false);

    if (filesError) {
      console.error("[DealSense Question Recheck] Error loading files:", filesError);
      return NextResponse.json({ error: "Failed to load files" }, { status: 500 });
    }

    const aiFiles = (files || []) as FileRow[];

    const answer = await generateDealSenseSingleQuestionAnswer(
      aiFiles,
      questionId,
      documentHint,
      note
    );

    if (!answer) {
      return NextResponse.json(
        {
          updated: false,
          message: "DealSense still could not confirm this from the referenced material.",
        },
        { status: 200 }
      );
    }

    const isStillGap =
      !answer.answer?.trim() ||
      answer.confidence === "low" ||
      answer.answer.toLowerCase().includes("could not determine");

    if (isStillGap) {
      return NextResponse.json(
        {
          updated: false,
          answer,
          message: "DealSense still could not confirm this from the referenced material.",
        },
        { status: 200 }
      );
    }

    // Narrow, non-persistent recheck: return improved answer to the client without
    // mutating findings or stored summary data. The UI can treat this as an inline override.
    return NextResponse.json(
      {
        updated: true,
        answer,
        message: "DealSense has refreshed this answer using the referenced material.",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[DealSense Question Recheck] Unexpected error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while rechecking this question" },
      { status: 500 }
    );
  }
}
