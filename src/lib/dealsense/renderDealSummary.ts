import type { DealSenseSummaryData } from "@/lib/dealsense/extractDealSummaryData";

function hasConfidence(conf: number, min: number) {
  return typeof conf === "number" && conf >= min;
}

function formatCurrencyShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

function textValue(value: string | null, confidence: number) {
  if (!value) return "Not clearly documented";
  if (hasConfidence(confidence, 0.75)) return value;
  if (hasConfidence(confidence, 0.5)) return `${value} (subject to confirmation)`;
  return `${value} (requires confirmation)`;
}

function numberValue(value: number | null, confidence: number) {
  if (value == null || !Number.isFinite(value)) return "Not clearly documented";
  const rounded = Math.round(value);
  const formatted = formatCurrencyShort(rounded);
  if (hasConfidence(confidence, 0.75)) return formatted;
  if (hasConfidence(confidence, 0.5)) return `${formatted} (subject to confirmation)`;
  return `${formatted} (requires confirmation)`;
}

/** Tone down modelled language in notes when the pack lacks formal financials or uses narrative-only sources. */
function softenThinPackFinancialNote(note: string, narrativeClaimSourcesOnly: boolean): string {
  let s = note;
  s = s.replace(
    /\bhistorical profitability and future contracts support repayment capability\b/gi,
    "the pack references historical profitability and future contracts, which require confirmation"
  );
  s = s.replace(/\bstrong historical profitability\b/gi, "Historical profitability as described in the pack");
  s = s.replace(/\bsupports repayment capability\b/gi, "would need to be confirmed in the context of repayment capacity");
  s = s.replace(/\bsupports repayment\b/gi, "would need to be confirmed in the context of repayment");
  if (narrativeClaimSourcesOnly) {
    s = s.replace(/\bfuture contracts support\b/gi, "future contracts are referenced; confirmation is required as to");
    s = s.replace(/\bhistorical profitability supports\b/gi, "historical profitability is referenced; confirmation is required as to");
  }
  return s;
}

export function renderDealSummary(
  data: DealSenseSummaryData,
  context: { ready_to_submit: boolean; has_open_critical: boolean }
) {
  // Keep readiness wording separate from transaction facts.
  const readinessLine = context.has_open_critical
    ? "Readiness: Not yet ready — key items require clarification before lender submission."
    : context.ready_to_submit
      ? "Readiness: Appears broadly ready — only minor clarifications outstanding."
      : "Readiness: Close to ready — several important clarifications remain.";

  const borrowerRaw = data.borrower_name.value;
  const borrower = textValue(borrowerRaw, data.borrower_name.confidence);
  const rawPurpose = data.purpose.value;
  const purposeLabel = (() => {
    if (!rawPurpose) return null;
    const v = rawPurpose.trim();
    const lower = v.toLowerCase();
    if (lower === "business_purchase") return "Business acquisition";
    if (lower === "working_capital") return "Working capital";
    if (lower === "property_purchase") return "Property purchase";
    if (lower === "shareholder_buyout") return "Shareholder buyout";
    if (lower === "refinance") return "Refinance";
    return v;
  })();
  const purpose = textValue(purposeLabel, data.purpose.confidence);
  const purchaseTotal = numberValue(data.purchase_price_total.value, data.purchase_price_total.confidence);

  const breakdown = (data.purchase_price_breakdown || [])
    .filter((b) => b.label && b.label.trim())
    .slice(0, 5)
    .map((b) => {
      const amt = numberValue(b.amount, b.confidence);
      return `${b.label}: ${amt}`;
    });

  const keyPeople = (data.key_people || [])
    .filter((p) => p.name && p.name.trim() && hasConfidence(p.confidence, 0.5))
    .slice(0, 4)
    .map((p) => (p.role ? `${p.name} (${p.role})` : p.name));

  const repayment = textValue(data.repayment_source.value, data.repayment_source.confidence);

  const hasHistoricalFinancials =
    typeof (data as any)?.has_historical_financials === "boolean"
      ? Boolean((data as any).has_historical_financials)
      : true;
  const forecastRelianceFlag =
    typeof (data as any)?.forecast_reliance === "boolean"
      ? Boolean((data as any).forecast_reliance)
      : false;
  const hasProperFinancialDocuments =
    typeof (data as any)?.has_proper_financial_documents === "boolean"
      ? Boolean((data as any).has_proper_financial_documents)
      : true;
  const narrativeClaimSourcesOnly =
    typeof (data as any)?.narrative_claim_sources_only === "boolean"
      ? Boolean((data as any).narrative_claim_sources_only)
      : false;

  const revenue = numberValue(data.forecast_figures.revenue.value, data.forecast_figures.revenue.confidence);
  const ebitda = numberValue(data.forecast_figures.ebitda.value, data.forecast_figures.ebitda.confidence);
  const dscr = data.forecast_figures.dscr.value == null
    ? "not clearly documented"
    : hasConfidence(data.forecast_figures.dscr.confidence, 0.75)
      ? `${data.forecast_figures.dscr.value.toFixed(2)}`
      : `${data.forecast_figures.dscr.value.toFixed(2)} (subject to confirmation)`;

  const forecastNotesRaw = data.forecast_figures.notes.value
    ? textValue(data.forecast_figures.notes.value, data.forecast_figures.notes.confidence)
    : null;
  const forecastNotes =
    forecastNotesRaw && !hasProperFinancialDocuments
      ? softenThinPackFinancialNote(forecastNotesRaw, narrativeClaimSourcesOnly)
      : forecastNotesRaw;

  const unknowns = (data.key_unknowns || [])
    .filter((u) => u.bullet && u.bullet.trim())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6)
    .map((u) => u.bullet);
  const structuredClarifications = Array.isArray((data as any)?.key_clarifications_required)
    ? ((data as any).key_clarifications_required as Array<{
        category?: string;
        action?: string;
        question?: string;
        reason?: string;
      }>)
    : [];
  const keyRisks = Array.isArray((data as any)?.key_risks)
    ? ((data as any).key_risks as string[]).filter((x) => typeof x === "string" && x.trim()).slice(0, 6)
    : [];
  const structuringConsiderations = Array.isArray((data as any)?.structuring_considerations)
    ? ((data as any).structuring_considerations as string[]).filter((x) => typeof x === "string" && x.trim()).slice(0, 6)
    : [];
  const strengthsLayer = Array.isArray((data as any)?.strengths)
    ? ((data as any).strengths as string[]).filter((x) => typeof x === "string" && x.trim()).slice(0, 6)
    : [];

  const lines: string[] = [];
  lines.push(readinessLine);
  lines.push("");
  lines.push("Transaction Summary");
  const tsSentence1 = (() => {
    if (borrowerRaw && purposeLabel) {
      const suffix =
        hasConfidence(data.borrower_name.confidence, 0.75) && hasConfidence(data.purpose.confidence, 0.75)
          ? ""
          : " (subject to confirmation)";
      return `${borrowerRaw} is seeking funding for ${purposeLabel}.${suffix}`;
    }
    if (purposeLabel) {
      const suffix = hasConfidence(data.purpose.confidence, 0.75) ? "" : " (subject to confirmation)";
      return `The submission is seeking funding for ${purposeLabel}.${suffix}`;
    }
    if (borrowerRaw) {
      const suffix = hasConfidence(data.borrower_name.confidence, 0.75) ? "" : " (subject to confirmation)";
      return `${borrowerRaw} is seeking funding for a transaction where key details are not clearly documented.${suffix}`;
    }
    return "The submission is seeking funding, but key transaction details are not clearly documented.";
  })();
  let tsSentence2 = "";
  if (purchaseTotal !== "Not clearly documented") {
    tsSentence2 = `Indicative purchase price is ${purchaseTotal}.`;
    if (breakdown.length > 0) {
      tsSentence2 += ` Breakdown: ${breakdown.join("; ")}.`;
    }
  } else if (breakdown.length > 0) {
    tsSentence2 = `Purchase price is not clearly documented, but the pack includes the following components: ${breakdown.join("; ")}.`;
  }
  let tsSentence3 = "";
  if (keyPeople.length > 0) {
    tsSentence3 = `Key people involved include ${keyPeople.join(", ")}.`;
  }
  lines.push(tsSentence1);
  if (tsSentence2) lines.push(tsSentence2);
  if (tsSentence3) lines.push(tsSentence3);
  lines.push("");
  lines.push("Repayment Overview");
  if (!hasHistoricalFinancials && forecastRelianceFlag) {
    if (hasProperFinancialDocuments) {
      lines.push(
        "- Repayment supported by forecast earnings and future contracts (subject to confirmation; historical performance not provided)."
      );
    } else if (narrativeClaimSourcesOnly) {
      lines.push(
        "- The pack references forecast earnings and future contracts; these require confirmation before they can be relied upon for servicing (historical performance not provided)."
      );
    } else {
      lines.push(
        "- Repayment is indicated as relying on forecast earnings and future contracts (subject to confirmation; historical performance not provided)."
      );
    }
  } else if (!hasProperFinancialDocuments && repayment !== "Not clearly documented") {
    lines.push(
      narrativeClaimSourcesOnly
        ? "- The pack references the following repayment description (unverified narrative; confirmation required): " + repayment
        : "- Repayment source indicated in the pack as follows (subject to confirmation against financial statements): " + repayment
    );
  } else {
    lines.push(`- Repayment source: ${repayment}`);
  }
  lines.push("");
  lines.push("Financial Snapshot");
  if (!hasProperFinancialDocuments) {
    lines.push(
      narrativeClaimSourcesOnly
        ? "- Historical profitability, future contracts, and similar points appear only as narrative claims in the pack (e.g. plans or applications); they require confirmation and are not evidenced as validated financial facts."
        : "- Forecast and narrative figures below are extracted from the pack; confirm against historical financial statements or management accounts before relying on servicing conclusions."
    );
  }
  lines.push(`- Forecast revenue: ${revenue}`);
  lines.push(`- Forecast EBITDA: ${ebitda}`);
  lines.push(`- Forecast DSCR: ${dscr}`);
  if (forecastNotes) lines.push(`- Notes: ${forecastNotes}`);
  if (keyRisks.length > 0) {
    lines.push("");
    lines.push("Key risks");
    for (const r of keyRisks) lines.push(`- ${r}`);
  }
  if (structuringConsiderations.length > 0) {
    lines.push("");
    lines.push("Structuring considerations");
    for (const s of structuringConsiderations) lines.push(`- ${s}`);
  }
  if (strengthsLayer.length > 0) {
    lines.push("");
    lines.push("Strengths");
    for (const s of strengthsLayer) lines.push(`- ${s}`);
    if (narrativeClaimSourcesOnly) {
      lines.push(
        "- Supporting statements above reflect pack narrative only; confirm against financial statements, tax records, or contracts before treating them as evidenced."
      );
    }
  }
  lines.push("");
  lines.push("Key clarifications required before submission");
  if (structuredClarifications.length > 0) {
    const grouped = new Map<string, Array<{ action: string; reason: string }>>();
    for (const c of structuredClarifications) {
      const category = (c.category || "General").trim() || "General";
      const action = (c.action || c.question || "").trim();
      if (!action) continue;
      const reason = (c.reason || "").trim();
      if (!grouped.has(category)) grouped.set(category, []);
      const list = grouped.get(category)!;
      if (!list.some((x) => x.action === action)) list.push({ action, reason });
    }
    for (const [category, items] of grouped.entries()) {
      lines.push("");
      lines.push(`${category}`);
      for (const item of items) {
        lines.push(`- ${item.action}`);
      }
    }
  } else if (unknowns.length > 0) {
    for (const u of unknowns) lines.push(`- ${u}`);
  } else {
    lines.push("- No specific clarifications extracted with high confidence from the available text.");
  }

  return { text: lines.join("\n"), strengths: [] as string[] };
}

