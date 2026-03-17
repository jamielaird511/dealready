import { DEALSENSE_QUESTIONS } from "@/lib/dealsense/questions";

/**
 * Credit-memo-style report display model for DealSense.
 * Transforms raw run + findings into a lending-assistant-friendly structure.
 */

export type ReportSummary = {
  status: "ready_to_submit" | "needs_work" | "high_risk";
  score: number;
  ready_to_submit: boolean;
  headline: string;
  overview: string;
  recommendation: string;
  readiness_explanation: string;
  executive_summary: string;
  blocker_bullets: string[];
  strengths: string[];
  key_points: string[];
  must_resolve: string[];
  should_improve: string[];
  optional: string[];
  counts: {
    critical: number;
    warning: number;
    info: number;
    open: number;
    resolved: number;
  };
};

export const REPORT_THEMES = [
  "Deal Structure",
  "Security",
  "Servicing",
  "Financials",
  "Guarantor Support",
  "Documents",
  "Compliance",
  "Forecasts",
] as const;

export type ReportTheme = (typeof REPORT_THEMES)[number];

export type ReportFinding = {
  id: string;
  severity: "critical" | "warning" | "info";
  theme: ReportTheme;
  title: string;
  why_it_matters: string;
  next_step: string;
  workflow_state: string;
  score_impact: number;
  evidence?: string[];
};

export type ReportThemeGroup = {
  theme: ReportTheme;
  summary: string;
  counts: { critical: number; warning: number; info: number };
  findings: ReportFinding[];
};

export type DealSenseQuestionSummary = {
  summary: string;
  keyFacts: { label: string; value: string; question_id: string }[];
  informationGaps: { label: string; question_id: string }[];
};

export type DealSenseReportDisplay = {
  summary: ReportSummary;
  themes: ReportThemeGroup[];
  dealsenseSummary?: DealSenseQuestionSummary;
};

/** Map raw category/title to a controlled report theme */
function mapToTheme(category: string | null | undefined, title: string | null | undefined): ReportTheme {
  const cat = (category ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  if (cat === "parties" || t.includes("borrower") || t.includes("structure")) return "Deal Structure";
  if (cat === "clarification" || t.includes("compliance") || t.includes("clarification")) return "Compliance";
  if (t.includes("security") || t.includes("security interest")) return "Security";
  if (t.includes("servicing") || t.includes("covenant")) return "Servicing";
  if (t.includes("financial") || t.includes("statement") || t.includes("cash flow")) return "Financials";
  if (t.includes("guarantor") || t.includes("guarantee")) return "Guarantor Support";
  if (t.includes("forecast") || t.includes("projection")) return "Forecasts";
  return "Documents";
}

/** One-line theme summary for display */
function themeSummary(theme: ReportTheme, count: number): string {
  if (count === 0) return "";
  const summaries: Partial<Record<ReportTheme, string>> = {
    "Deal Structure": "Borrower and deal structure items.",
    Security: "Security and collateral items.",
    Servicing: "Covenant and servicing items.",
    Financials: "Financial statements and metrics.",
    "Guarantor Support": "Guarantor and support items.",
    Documents: "Document completeness and coverage.",
    Compliance: "Clarifications and compliance items.",
    Forecasts: "Forecasts and projections.",
  };
  return summaries[theme] ?? `${theme} items.`;
}

/** Plain-English titles for credit-review tone; preserve useful content */
function toProfessionalTitle(rawTitle: string | null | undefined): string {
  const base = (rawTitle ?? "").trim();
  if (!base) return "Item for review";
  const lower = base.toLowerCase();
  if (lower.includes("dealsense could not determine")) {
    const rest = base.replace(/^dealsense could not determine:\s*/i, "").trim();
    if (rest) return rest.endsWith("?") ? rest.slice(0, -1) + " not clearly stated in the pack." : rest + " not clearly stated in the pack.";
  }
  if (lower.includes("missing borrower") || lower.includes("borrower entity")) return "Borrower or purchasing entity not clearly identified";
  if (lower.includes("missing security") || lower.includes("security details")) return "Security or collateral details need clarification";
  if (lower.includes("missing loan purpose") || lower.includes("loan purpose")) return "Loan purpose or use of funds not clearly stated";
  if (lower.includes("missing financial") || lower.includes("financial statements")) return "Financial statements or prior-year numbers not provided or unclear";
  if (lower.includes("forecast") || lower.includes("projection")) return "Forecast growth or assumptions need support or explanation";
  if (lower.includes("repayment") || lower.includes("servicing")) return "Repayment source or debt servicing may need clarification";
  if (lower.includes("owner") && (lower.includes("salary") || lower.includes("remuneration") || lower.includes("drawings"))) return "Owner salary or drawings may not be reflected in servicing";
  if (lower.includes("valuation") || lower.includes("property")) return "Property or asset valuation not clearly referenced";
  if (lower.includes("purchase agreement") || lower.includes("sale and purchase")) return "Purchase agreement or S&P terms not clearly summarised";
  if (lower.includes("term") || lower.includes("maturity")) return "Proposed loan term may not align with typical structure for this security type";
  if (lower.includes("guarantor") || lower.includes("guarantee")) return "Guarantor support or recourse not clearly set out";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Turn a title/message into an action-oriented label for Key Actions */
function toActionLabel(title: string | null | undefined, message: string | null | undefined): string {
  const raw = ((title ?? "") + " " + (message ?? "")).toLowerCase();
  if (raw.includes("borrower") || raw.includes("sponsor")) {
    return "Provide borrower entity details and ownership structure";
  }
  if (raw.includes("security")) {
    return "Confirm properties offered as security and their ranking";
  }
  if (raw.includes("use of funds")) {
    return "Provide a breakdown of use of funds";
  }
  if (raw.includes("loan purpose") || raw.includes("purpose of loan")) {
    return "Clarify loan purpose and use of funds";
  }
  if (raw.includes("repayment") || raw.includes("servicing")) {
    return "Clarify repayment source and servicing position";
  }
  if (raw.includes("revenue") || raw.includes("income")) {
    return "Clarify revenue sources supporting the transaction";
  }
  if (raw.includes("date") || raw.includes("term") || raw.includes("maturity")) {
    return "Confirm key loan dates and term details";
  }
  if (raw.includes("financial") || raw.includes("statement")) {
    return "Provide recent financial statements";
  }
  if (raw.includes("valuation") || raw.includes("appraisal")) {
    return "Provide supporting valuation information";
  }
  if (raw.includes("insurance")) {
    return "Provide insurance documentation";
  }
  if (raw.includes("liabilities") || raw.includes("debt position")) {
    return "Clarify existing liabilities and overall debt position";
  }
  if (raw.includes("forecast") || raw.includes("projection")) {
    return "Explain assumptions underpinning the forecast";
  }
  if (raw.includes("ownership structure") || raw.includes("structure chart")) {
    return "Provide an ownership structure chart";
  }
  const cleanedTitle = toProfessionalTitle(title);
  return cleanedTitle !== "Finding" ? `Resolve: ${cleanedTitle}` : "Review and address this item";
}

/** Credit-review style explanation: practical concern, not generic */
function buildWhyItMatters(theme: ReportTheme, rawMessage: string | null | undefined, rawTitle?: string | null): string {
  const detail = (rawMessage ?? "").trim();
  const t = (rawTitle ?? "").toLowerCase();
  let base: string;
  switch (theme) {
    case "Deal Structure":
      base = "Lenders need to see who is borrowing and how the structure is set up.";
      break;
    case "Security":
      base = "Collateral and ranking drive recovery; clarity here avoids follow-up.";
      break;
    case "Servicing":
      base = "Debt-servicing and repayment source are central to credit decisions.";
      break;
    case "Financials":
      base =
        t.includes("forecast") || t.includes("projection")
          ? "Forecast growth that significantly exceeds historical trading usually needs a short explanation."
          : "Historical financials support leverage and repayment capacity.";
      break;
    case "Guarantor Support":
      base = "Guarantees and recourse affect risk; lenders will ask if this is unclear.";
      break;
    case "Documents":
      base = "Supporting documents help the lender verify key assumptions.";
      break;
    case "Compliance":
      base = "Clear compliance context reduces back-and-forth and speeds assessment.";
      break;
    case "Forecasts":
      base = "Forecast assumptions need to be visible so the lender can rely on projections.";
      break;
    default:
      base = "This is the kind of point a credit reviewer would flag for clarification.";
  }
  if (detail && !detail.toLowerCase().includes("could not determine") && detail.length < 200) {
    return `${base} ${detail}`;
  }
  return base;
}

/** Single, practical next step in credit-review language; always returns a non-empty string */
function buildNextStep(
  fix: string | null | undefined,
  theme: ReportTheme,
  rawTitle?: string | null,
  rawMessage?: string | null
): string {
  const trimmed = (fix ?? "").trim();
  const t = (rawTitle ?? "").toLowerCase();
  const m = (rawMessage ?? "").toLowerCase();
  if (trimmed && trimmed.length > 10 && !/^(review|check|consider|please)\s/i.test(trimmed)) {
    return trimmed;
  }
  switch (theme) {
    case "Deal Structure":
      return "Confirm borrower entity and structure in the pack and add a one-line summary if missing.";
    case "Security":
      return "Include security type, ranking, and any key conditions so the lender can assess collateral.";
    case "Servicing":
      return "Clarify repayment source and show how debt is serviced (e.g. cashflow, sale, refinance).";
    case "Financials":
      if (t.includes("forecast") || t.includes("projection") || m.includes("forecast")) {
        return "Add a short note explaining forecast growth vs historical trading, or attach supporting assumptions.";
      }
      return "Provide or clearly reference financial statements and prior-year numbers.";
    case "Guarantor Support":
      return "Summarise guarantor coverage and any limitations so the lender can assess recourse.";
    case "Documents":
      return "Attach or reference the missing document so the lender can verify the point.";
    case "Compliance":
      return "Add the missing compliance detail or confirm it will be supplied at submission.";
    case "Forecasts":
      return "State or attach the key assumptions behind the forecast so they can be relied on.";
    default:
      return "Review and address before submission, or confirm with the lender if already covered.";
  }
}

type ThemeStats = {
  theme: ReportTheme;
  total: number;
  openTotal: number;
  openCritical: number;
  hasCritical: boolean;
  hasWarning: boolean;
  hasInfo: boolean;
};

function buildThemeStats(rawFindings: RawFindingRow[]): ThemeStats[] {
  const openStates = ["open", "acknowledged"];
  const byTheme = new Map<ReportTheme, ThemeStats>();
  for (const t of REPORT_THEMES) {
    byTheme.set(t, {
      theme: t,
      total: 0,
      openTotal: 0,
      openCritical: 0,
      hasCritical: false,
      hasWarning: false,
      hasInfo: false,
    });
  }

  for (const f of rawFindings) {
    const theme = mapToTheme(f.category, f.title);
    const stats = byTheme.get(theme)!;
    stats.total += 1;
    const isOpen = openStates.includes(f.workflow_state ?? "open");
    if (isOpen) {
      stats.openTotal += 1;
    }
    if (f.severity === "critical") {
      stats.hasCritical = true;
      if (isOpen) stats.openCritical += 1;
    } else if (f.severity === "warning") {
      stats.hasWarning = true;
    } else {
      stats.hasInfo = true;
    }
  }

  return Array.from(byTheme.values());
}

function dominantOpenCriticalTheme(stats: ThemeStats[]): ReportTheme | null {
  let best: ThemeStats | null = null;
  for (const s of stats) {
    if (!best || s.openCritical > best.openCritical) {
      best = s;
    }
  }
  if (best && best.openCritical > 0) return best.theme;
  // Fallback: theme with most open items, if any
  best = null;
  for (const s of stats) {
    if (!best || s.openTotal > best.openTotal) {
      best = s;
    }
  }
  return best && best.openTotal > 0 ? best.theme : null;
}

function buildReadinessExplanation(
  openCriticalCount: number,
  warningOpenCount: number,
  dominantTheme: ReportTheme | null
): string {
  if (openCriticalCount > 0) {
    const themePart = dominantTheme ? `, particularly around ${dominantTheme.toLowerCase()}` : "";
    return `The submission is not yet ready because critical issues remain open${themePart}.`;
  }
  if (warningOpenCount > 0) {
    return "The submission is close to ready but still has open items that should be addressed before lender submission.";
  }
  return "The submission appears ready for lender review with no open critical issues.";
}

function buildStrengths(
  score: number,
  openCriticalCount: number,
  stats: ThemeStats[],
  rawFindings: RawFindingRow[]
): string[] {
  const strengths: string[] = [];

  const hasAnyFindings = stats.some((s) => s.total > 0);

  const openStates = ["open", "acknowledged"];
  const openTexts = rawFindings
    .filter((f) => openStates.includes(f.workflow_state ?? "open"))
    .map((f) => ((f.title ?? "") + " " + (f.message ?? "")).toLowerCase());

  const hasFinancialIssues = openTexts.some((t) =>
    t.includes("financial") ||
    t.includes("statement") ||
    t.includes("accounts") ||
    t.includes("forecast") ||
    t.includes("projection") ||
    t.includes("repayment") ||
    t.includes("servicing") ||
    t.includes("liabilities") ||
    t.includes("debt position")
  );

  const hasSecurityIssues = openTexts.some((t) =>
    t.includes("security") || t.includes("collateral") || t.includes("guarantee")
  );

  if (score >= 70 && openCriticalCount === 0 && hasAnyFindings) {
    strengths.push(
      "Overall structure appears acceptable for submission once minor gaps are addressed."
    );
  }

  const security = stats.find((s) => s.theme === "Security");
  if (
    security &&
    !security.hasCritical &&
    security.total > 0 &&
    !hasSecurityIssues &&
    strengths.length < 3
  ) {
    strengths.push(
      "Security support appears likely to be available, subject to confirming the final package."
    );
  }

  const financials = stats.find((s) => s.theme === "Financials");
  if (
    financials &&
    !financials.hasCritical &&
    !financials.hasWarning &&
    financials.total > 0 &&
    !hasFinancialIssues &&
    strengths.length < 3
  ) {
    strengths.push(
      "Core financial information appears broadly sufficient for an initial assessment."
    );
  }

  return strengths.slice(0, 3);
}

function buildExecutiveTexts(
  status: ReportSummary["status"],
  openCriticalCount: number,
  warningCount: number,
  dominantTheme: ReportTheme | null
): { headline: string; overview: string; recommendation: string } {
  let headline: string;
  let overview: string;
  let recommendation: string;

  if (status === "ready_to_submit") {
    headline = "Pack appears ready for lender review";
    overview =
      "There are no open critical issues and the remaining points appear manageable for a typical lender review.";
    recommendation =
      "You may proceed to submission, while addressing any minor items where practical.";
  } else if (status === "needs_work") {
    headline = "Pack appears viable but needs work before submission";
    overview =
      "There are no open critical issues, but several warnings and open items should be resolved to present a clearer credit narrative.";
    recommendation =
      "Focus on the key warning items, then update the pack and re-run DealSense before submitting.";
  } else {
    const themePart = dominantTheme ? `, particularly in ${dominantTheme.toLowerCase()}` : "";
    headline = "Pack is not yet ready for lender submission";
    if (openCriticalCount > 0) {
      overview = `Open critical issues${themePart} mean the submission is not yet ready for lender review.`;
    } else {
      overview =
        "Current issues indicate the submission is not yet ready and key risks are not sufficiently addressed.";
    }
    recommendation =
      "Resolve all critical issues and the most material warnings, then update the pack and re-run DealSense.";
  }

  // Keep the overview + recommendation combination concise and memo-style.
  return { headline, overview, recommendation };
}

export type RawFindingRow = {
  id: string;
  severity: string;
  workflow_state?: string | null;
  title?: string | null;
  category?: string | null;
  message?: string | null;
  fix?: string | null;
  score_impact?: number | null;
};

export type RawRunRow = {
  score?: number | null;
  status?: string;
  // Optional JSON summary data attached during processing (includes DealSense questions).
  deal_summary_data?: unknown;
};

const SCORE_THRESHOLD_READY = 70;

type DealSenseQuestionAnswerRow = {
  question_id?: string;
  answer?: string;
  confidence?: string;
  evidence?: string;
  value?: number;
  currency?: string;
  unit?: string;
  metrics?: Record<string, unknown>;
};

function findingBusinessPriority(f: RawFindingRow): number {
  // Lower score = higher priority
  const t = ((f.title ?? "") + " " + (f.message ?? "")).toLowerCase();
  let score = 100;
  // Severity weight
  if (f.severity === "critical") score -= 40;
  else if (f.severity === "warning") score -= 20;

  // Business importance keywords
  if (t.includes("borrower") || t.includes("sponsor") || t.includes("ownership")) score -= 20;
  if (t.includes("security") || t.includes("collateral") || t.includes("guarantee")) score -= 20;
  if (t.includes("repayment") || t.includes("servicing") || t.includes("debt service")) score -= 16;
  if (t.includes("loan purpose") || t.includes("use of funds") || t.includes("purpose of loan")) score -= 14;
  if (t.includes("liabilities") || t.includes("debt position")) score -= 12;
  if (t.includes("financial") || t.includes("statement") || t.includes("accounts")) score -= 10;
  if (t.includes("forecast") || t.includes("projection")) score -= 8;
  if (t.includes("date") || t.includes("term") || t.includes("maturity")) score -= 6;

  return score;
}

function toBlockerBullet(f: RawFindingRow): string {
  const text = ((f.title ?? "") + " " + (f.message ?? "")).toLowerCase();
  if (text.includes("borrower") || text.includes("sponsor") || text.includes("ownership")) {
    return "Borrower entity details and ownership structure are not clearly defined.";
  }
  if (text.includes("security") || text.includes("collateral")) {
    return "Security package, ranking, or collateral details require clarification.";
  }
  if (text.includes("repayment") || text.includes("servicing") || text.includes("debt service")) {
    return "Repayment source and servicing position require clearer support.";
  }
  if (text.includes("loan purpose") || text.includes("use of funds") || text.includes("purpose of loan")) {
    return "Loan purpose and use of funds are not sufficiently explained.";
  }
  if (text.includes("liabilities") || text.includes("debt position")) {
    return "Existing liabilities and overall debt position require clarification.";
  }
  if (text.includes("financial") || text.includes("statement") || text.includes("accounts")) {
    return "Recent financial statements or financial performance information are incomplete.";
  }
  if (text.includes("forecast") || text.includes("projection")) {
    return "Forecast assumptions and support for projections require further explanation.";
  }
  if (text.includes("date") || text.includes("term") || text.includes("maturity")) {
    return "Key loan dates and term details require confirmation.";
  }
  const title = toProfessionalTitle(f.title);
  return `${title}.`;
}

function toNarrativeBlockerPhraseFromText(text: string): string | null {
  const t = text.toLowerCase();
  if (t.includes("borrower") || t.includes("sponsor") || t.includes("ownership")) {
    return "borrower entity and ownership structure";
  }
  if (t.includes("security") || t.includes("collateral")) {
    return "security structure and ranking";
  }
  if (t.includes("repayment") || t.includes("servicing") || t.includes("debt service")) {
    return "repayment support";
  }
  if (t.includes("loan purpose") || t.includes("use of funds") || t.includes("purpose of loan")) {
    return "loan purpose and use of funds";
  }
  if (t.includes("liabilities") || t.includes("debt position")) {
    return "existing liabilities and debt position";
  }
  if (t.includes("financial") || t.includes("statement") || t.includes("accounts")) {
    return "financial information";
  }
  if (t.includes("forecast") || t.includes("projection")) {
    return "forecast assumptions";
  }
  if (t.includes("date") || t.includes("term") || t.includes("maturity")) {
    return "key loan dates and term details";
  }
  return null;
}

function extractTopBlockers(rawFindings: RawFindingRow[]): string[] {
  const openStates = ["open", "acknowledged"];
  const openFindings = rawFindings.filter((f) => openStates.includes(f.workflow_state ?? "open"));
  const sorted = [...openFindings].sort((a, b) => findingBusinessPriority(a) - findingBusinessPriority(b));

  const bullets: string[] = [];
  const seen = new Set<string>();

  for (const f of sorted) {
    if (bullets.length >= 4) break;
    const bullet = toBlockerBullet(f).trim();
    if (!bullet) continue;
    const normalised = bullet.replace(/\.+$/, "").trim();
    if (seen.has(normalised.toLowerCase())) continue;
    seen.add(normalised.toLowerCase());
    bullets.push(bullet.endsWith(".") ? bullet : `${bullet}.`);
  }

  return bullets;
}

function dedupeActions(
  mustResolve: string[],
  shouldImprove: string[],
  optional: string[]
): { mustResolve: string[]; shouldImprove: string[]; optional: string[] } {
  const seen = new Set<string>();
  const normalise = (s: string) => s.trim();

  const mr = mustResolve
    .map(normalise)
    .filter((s) => s.length > 0 && !seen.has(s) && (seen.add(s), true));
  const si = shouldImprove
    .map(normalise)
    .filter((s) => s.length > 0 && !seen.has(s) && (seen.add(s), true));
  const opt = optional
    .map(normalise)
    .filter((s) => s.length > 0 && !seen.has(s) && (seen.add(s), true));

  return { mustResolve: mr, shouldImprove: si, optional: opt };
}

function buildExecutiveSummary(
  status: ReportSummary["status"],
  readyToSubmit: boolean,
  blockers: string[]
): string {
  // Convert blocker sentences into short phrases for narrative use
  const phraseSet = new Set<string>();
  for (const b of blockers) {
    const phrase = toNarrativeBlockerPhraseFromText(b);
    if (phrase) phraseSet.add(phrase);
  }
  const phrases = Array.from(phraseSet).slice(0, 3);
  const joinPhrases = () => {
    if (phrases.length === 0) return "";
    if (phrases.length === 1) return phrases[0];
    if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
    return `${phrases[0]}, ${phrases[1]} and ${phrases[2]}`;
  };

  let first: string;
  let second: string | null = null;

  if (status === "ready_to_submit" && readyToSubmit) {
    first =
      "The pack appears broadly ready for lender review, with only minor items requiring clarification.";
    if (phrases.length > 0) {
      second = `Remaining points relate mainly to ${joinPhrases()}.`;
    }
  } else if (status === "needs_work") {
    first =
      "The pack appears viable but still requires clarification of several important items before lender submission.";
    if (phrases.length > 0) {
      second = `The main areas to address are ${joinPhrases()}, so the submission presents a clearer and more coherent credit narrative.`;
    }
  } else {
    // high_risk
    first =
      "The pack is not yet ready for lender submission because several core elements of the credit story remain unclear.";
    if (phrases.length > 0) {
      second = `The most important gaps relate to ${joinPhrases()}, and these items need to be clarified before the lender can properly assess the transaction.`;
    }
  }

  return second ? `${first} ${second}` : first;
}

function buildDealSenseQuestionSummary(run: RawRunRow): DealSenseQuestionSummary | null {
  const data = (run as any)?.deal_summary_data as any;
  const answersRaw = Array.isArray(data?.dealsense_questions) ? data.dealsense_questions : [];
  if (!answersRaw || answersRaw.length === 0) return null;

  const byId = new Map(DEALSENSE_QUESTIONS.map((q) => [q.id, q]));
  const normalise = (s: unknown) =>
    typeof s === "string" ? s.trim() : typeof s === "number" ? String(s) : "";

  const COULD_NOT_DETERMINE_PHRASE =
    "dealsense could not determine this from the documents provided";

  const keyFacts: { label: string; value: string; question_id: string }[] = [];
  const informationGaps: { label: string; question_id: string }[] = [];

  // Preserve logical question order from DEALSENSE_QUESTIONS
  for (const q of DEALSENSE_QUESTIONS) {
    const answerRow = (answersRaw as DealSenseQuestionAnswerRow[]).find(
      (a) => normalise(a.question_id) === q.id
    );
    if (!answerRow) continue;

    const label = normalise((q as any).label) || normalise(q.question) || q.id;
    const answer = normalise(answerRow.answer);
    const confidence = normalise(answerRow.confidence).toLowerCase();
    const evidence = normalise(answerRow.evidence);
    const numericValue =
      typeof answerRow.value === "number" && Number.isFinite(answerRow.value)
        ? (answerRow.value as number)
        : null;
    const currency = normalise(answerRow.currency);
    const isLowConfidence = confidence === "low";
    const isMissingText =
      !answer ||
      answer.toLowerCase().includes(COULD_NOT_DETERMINE_PHRASE) ||
      answer.toLowerCase().includes("could not determine");

    if (!isMissingText && (confidence === "high" || confidence === "medium")) {
      let display = answer;

      // Compact metric-style rendering for selected question types where metrics exist
      const metrics = (answerRow.metrics ?? {}) as Record<string, unknown>;
      if (q.id === "historical_financials" && metrics && typeof metrics === "object") {
        const rev =
          typeof metrics.revenue === "number" && Number.isFinite(metrics.revenue)
            ? (metrics.revenue as number)
            : null;
        const gm =
          typeof metrics.gross_margin_percent === "number" &&
          Number.isFinite(metrics.gross_margin_percent)
            ? (metrics.gross_margin_percent as number)
            : null;
        const ebitda =
          typeof metrics.ebitda === "number" && Number.isFinite(metrics.ebitda)
            ? (metrics.ebitda as number)
            : null;
        const period = normalise(metrics.period);
        const mCurrency = normalise(metrics.currency) || currency;

        const parts: string[] = [];
        if (rev != null) {
          const revFmt = rev.toLocaleString(undefined, { maximumFractionDigits: 0 });
          parts.push(`Revenue ${mCurrency || "NZD"} ${revFmt}`);
        }
        if (gm != null) {
          const gmFmt = gm.toFixed(0);
          parts.push(`Gross margin ${gmFmt}%`);
        }
        if (ebitda != null) {
          const eFmt = ebitda.toLocaleString(undefined, { maximumFractionDigits: 0 });
          parts.push(`EBITDA ${mCurrency || "NZD"} ${eFmt}`);
        }
        if (period) {
          parts.push(`Period ${period}`);
        }
        if (parts.length > 0) {
          display = parts.join("; ");
        }
      } else if (q.id === "forecasts" && metrics && typeof metrics === "object") {
        const fRev =
          typeof metrics.forecast_revenue === "number" &&
          Number.isFinite(metrics.forecast_revenue)
            ? (metrics.forecast_revenue as number)
            : null;
        const period = normalise(metrics.period);
        const mCurrency = normalise(metrics.currency) || currency;

        const parts: string[] = [];
        if (fRev != null) {
          const revFmt = fRev.toLocaleString(undefined, { maximumFractionDigits: 0 });
          parts.push(`Forecast revenue ${mCurrency || "NZD"} ${revFmt}`);
        }
        if (period) {
          parts.push(`Period ${period}`);
        }
        if (parts.length > 0) {
          display = parts.join("; ");
        }
      } else if (q.id === "bank_funding" && metrics && typeof metrics === "object") {
        const minVal =
          typeof metrics.min_value === "number" && Number.isFinite(metrics.min_value)
            ? (metrics.min_value as number)
            : null;
        const maxVal =
          typeof metrics.max_value === "number" && Number.isFinite(metrics.max_value)
            ? (metrics.max_value as number)
            : null;
        const mCurrency = normalise(metrics.currency) || currency;

        if (minVal != null && maxVal != null) {
          const minFmt = minVal.toLocaleString(undefined, { maximumFractionDigits: 0 });
          const maxFmt = maxVal.toLocaleString(undefined, { maximumFractionDigits: 0 });
          display = `${mCurrency || "NZD"} ${minFmt}–${maxFmt}`;
        }
      } else if (numericValue != null) {
        const formatted = numericValue.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        });
        display = currency ? `${currency} ${formatted}` : `$${formatted}`;
      }

      const valueText =
        evidence && evidence.length > 0 ? `${display} (Evidence: ${evidence})` : display;
      keyFacts.push({ label, value: valueText, question_id: q.id });
    } else if (isMissingText || isLowConfidence) {
      informationGaps.push({ label, question_id: q.id });
    }
  }

  if (keyFacts.length === 0 && informationGaps.length === 0) {
    return null;
  }

  const summary =
    "DealSense has reviewed the uploaded documents and identified the core transaction elements below.";

  return {
    summary,
    keyFacts,
    informationGaps,
  };
}

/**
 * Build the report display from run + raw findings.
 * Keeps underlying data unchanged; derives summary and themed groups.
 */
export function buildReportDisplay(
  run: RawRunRow,
  rawFindings: RawFindingRow[]
): DealSenseReportDisplay {
  const score = run.score ?? 0;
  const criticalCount = rawFindings.filter((f) => f.severity === "critical").length;
  const warningCount = rawFindings.filter((f) => f.severity === "warning").length;
  const infoCount = rawFindings.filter((f) => f.severity === "info").length;
  const openStates = ["open", "acknowledged"];
  const resolvedStates = ["resolved", "dismissed"];
  const openCount = rawFindings.filter((f) => openStates.includes(f.workflow_state ?? "open")).length;
  const resolvedCount = rawFindings.filter((f) => resolvedStates.includes(f.workflow_state ?? "open")).length;

  const openCriticalCount = rawFindings.filter(
    (f) => f.severity === "critical" && openStates.includes(f.workflow_state ?? "open")
  ).length;
  const openWarningCount = rawFindings.filter(
    (f) => f.severity === "warning" && openStates.includes(f.workflow_state ?? "open")
  ).length;

  const themeStats = buildThemeStats(rawFindings);
  const dominantTheme = dominantOpenCriticalTheme(themeStats);
  const ready_to_submit = openCriticalCount === 0 && score >= SCORE_THRESHOLD_READY;
  let status: ReportSummary["status"] = "high_risk";
  if (openCriticalCount > 0 || score < 50) status = "high_risk";
  else if (ready_to_submit) status = "ready_to_submit";
  else status = "needs_work";

  const { headline, overview, recommendation } = buildExecutiveTexts(
    status,
    openCriticalCount,
    warningCount,
    dominantTheme
  );

  const criticalFindings = rawFindings.filter(
    (f) => f.severity === "critical" && openStates.includes(f.workflow_state ?? "open")
  );
  const warningFindings = rawFindings.filter(
    (f) => f.severity === "warning" && openStates.includes(f.workflow_state ?? "open")
  );
  const infoFindings = rawFindings.filter(
    (f) => f.severity === "info" && openStates.includes(f.workflow_state ?? "open")
  );

  const must_resolve_raw = criticalFindings
    .map((f) => toActionLabel(f.title, f.message))
    .filter(Boolean);
  const should_improve_raw = warningFindings
    .map((f) => toActionLabel(f.title, f.message))
    .filter(Boolean);
  const optional_raw = infoFindings
    .map((f) => toActionLabel(f.title, f.message))
    .filter(Boolean);

  const { mustResolve, shouldImprove, optional } = dedupeActions(
    must_resolve_raw,
    should_improve_raw,
    optional_raw
  );
  const must_resolve = mustResolve.slice(0, 3);
  const should_improve = shouldImprove.slice(0, 6);
  const optional_actions = optional.slice(0, 4);

  const key_points: string[] = [];
  if (criticalCount > 0) key_points.push(`${criticalCount} critical finding${criticalCount !== 1 ? "s" : ""}`);
  if (warningCount > 0) key_points.push(`${warningCount} warning${warningCount !== 1 ? "s" : ""}`);
  if (infoCount > 0) key_points.push(`${infoCount} informational item${infoCount !== 1 ? "s" : ""}`);
  if (openCount > 0) key_points.push(`${openCount} open`);
  if (resolvedCount > 0) key_points.push(`${resolvedCount} resolved`);

  const readiness_explanation = buildReadinessExplanation(
    openCriticalCount,
    openWarningCount,
    dominantTheme
  );
  const strengths = buildStrengths(score, openCriticalCount, themeStats, rawFindings);
  const blocker_bullets = extractTopBlockers(rawFindings);
  const executive_summary = buildExecutiveSummary(status, ready_to_submit, blocker_bullets);

  const summary: ReportSummary = {
    status,
    score,
    ready_to_submit,
    headline,
    overview,
    recommendation,
    readiness_explanation,
    executive_summary,
    blocker_bullets,
    strengths,
    key_points,
    must_resolve,
    should_improve,
    optional: optional_actions,
    counts: {
      critical: criticalCount,
      warning: warningCount,
      info: infoCount,
      open: openCount,
      resolved: resolvedCount,
    },
  };

  const severity = (s: string): "critical" | "warning" | "info" =>
    s === "critical" || s === "warning" ? s : "info";

  const reportFindings: ReportFinding[] = rawFindings.map((f) => {
    const theme = mapToTheme(f.category, f.title);
    const title = toProfessionalTitle(f.title);
    const why_it_matters = buildWhyItMatters(theme, f.message, f.title);
    const next_step = buildNextStep(f.fix, theme, f.title, f.message);
    const evidence = f.message ? [f.message] : undefined;
    return {
      id: f.id,
      severity: severity(f.severity),
      theme,
      title,
      why_it_matters,
      next_step,
      workflow_state: f.workflow_state ?? "open",
      score_impact: typeof f.score_impact === "number" ? f.score_impact : 0,
      evidence,
    };
  });

  const themeOrder: ReportTheme[] = [
    "Deal Structure",
    "Documents",
    "Financials",
    "Security",
    "Servicing",
    "Guarantor Support",
    "Compliance",
    "Forecasts",
  ];
  const byTheme = new Map<ReportTheme, ReportFinding[]>();
  for (const theme of REPORT_THEMES) byTheme.set(theme, []);
  for (const r of reportFindings) byTheme.get(r.theme)!.push(r);

  const themes: ReportThemeGroup[] = themeOrder
    .filter((theme) => byTheme.get(theme)!.length > 0)
    .map((theme) => {
      const findings = byTheme.get(theme)!;
      return {
        theme,
        summary: themeSummary(theme, findings.length),
        counts: {
          critical: findings.filter((f) => f.severity === "critical").length,
          warning: findings.filter((f) => f.severity === "warning").length,
          info: findings.filter((f) => f.severity === "info").length,
        },
        findings,
      };
    });

  const dealsenseSummary = buildDealSenseQuestionSummary(run) ?? undefined;

  return { summary, themes, dealsenseSummary };
}
