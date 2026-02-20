export interface File {
  category?: string | null;
  display_name?: string | null;
  original_filename?: string | null;
}

export interface Party {
  roles?: string[] | null;
  role?: string | null;
}

export interface Finding {
  id: string;
  severity: "critical" | "warning" | "info";
  category: string;
  title: string;
  message: string;
  fix: string;
  scoreImpact: number;
  evidence?: string[];
}

export type AssessmentStatus = "not_ready" | "needs_review" | "ready";

export interface AssessmentSummary {
  score: number;
  status: AssessmentStatus;
  topFixes: string[];
}

// Helper to infer document types from filename/category
function inferDocTypes(file: File): Set<string> {
  const tags = new Set<string>();
  const text = `${file.category || ""} ${file.display_name || ""} ${file.original_filename || ""}`.toLowerCase();

  // Financial statements
  if (/\b(financial|fs|statements|accounts|annual report)\b/.test(text)) {
    tags.add("financial_statements");
  }

  // Bank statements
  if (/\b(bank|statement|stmt|transaction|asb|anz|bnz|westpac)\b/.test(text)) {
    tags.add("bank_statement");
  }

  // ID documents
  if (/\b(passport|driver|licence|license|dl|identity)\b/.test(text)) {
    tags.add("id");
  }

  // Credit report
  if (/\b(credit|equifax|illion|centrix)\b/.test(text)) {
    tags.add("credit_report");
  }

  // Valuation/appraisal
  if (/\b(valuation|appraisal|valuer)\b/.test(text)) {
    tags.add("valuation");
  }

  // Insurance
  if (/\b(insurance|policy|certificate)\b/.test(text)) {
    tags.add("insurance");
  }

  // Guarantee
  if (/\b(guarantee|guaranty)\b/.test(text)) {
    tags.add("guarantee");
  }

  // Loan agreement
  if (/\b(loan agreement|facility|credit agreement)\b/.test(text)) {
    tags.add("loan_agreement");
  }

  return tags;
}

export function computeFindings(input: { files: File[]; parties: Party[] }): { findings: Finding[]; summary: AssessmentSummary } {
  const findings: Finding[] = [];
  const { files, parties } = input;

  // Normalize parties to get all roles
  const allRoles = new Set<string>();
  parties.forEach((p) => {
    if (p.roles && Array.isArray(p.roles)) {
      p.roles.forEach((r) => allRoles.add(r.toLowerCase()));
    }
    if (p.role) {
      allRoles.add(p.role.toLowerCase());
    }
  });

  const hasBorrower = allRoles.has("borrower");
  const hasGuarantor = allRoles.has("guarantor");
  const hasLender = allRoles.has("lender");

  // Infer document types from all files
  const inferredTags = new Set<string>();
  files.forEach((f) => {
    const fileTags = inferDocTypes(f);
    fileTags.forEach(tag => inferredTags.add(tag));
    // Also include explicit category if present
    if (f.category) {
      inferredTags.add(f.category.toLowerCase());
    }
  });

  // Check if any files have inferred tags
  const hasInferredTags = inferredTags.size > 0;

  // Rule 1: Missing borrower
  if (!hasBorrower) {
    findings.push({
      id: "party_missing_borrower",
      severity: "critical",
      category: "parties",
      title: "Missing Borrower",
      message: "No borrower found in deal parties. A borrower is required.",
      fix: "Add at least one borrower (person or entity) to the deal parties.",
      scoreImpact: -30,
      evidence: Array.from(allRoles),
    });
  }

  // Rule 2: Missing financial statements (treat doc-id category 'financials' as present)
  if (!inferredTags.has("financial_statements") && !inferredTags.has("financial") && !inferredTags.has("financials")) {
    findings.push({
      id: "docs_missing_financials",
      severity: hasBorrower ? "warning" : "info",
      category: "documents",
      title: "Missing Financial Statements",
      message: "No financial statements found. Financial statements are typically required for due diligence.",
      fix: "Upload financial statements or annual accounts for the borrower.",
      scoreImpact: hasBorrower ? -10 : -2,
    });
  }

  // Rule 3: Missing credit report
  if (!inferredTags.has("credit_report") && !inferredTags.has("credit")) {
    findings.push({
      id: "docs_missing_credit_report",
      severity: hasBorrower ? "warning" : "info",
      category: "documents",
      title: "Missing Credit Report",
      message: "No credit report found. Credit reports are typically required for borrower assessment.",
      fix: "Upload a credit report from Equifax, Illion, or Centrix.",
      scoreImpact: hasBorrower ? -10 : -2,
    });
  }

  // Rule 4: Guarantor without guarantee documents
  if (hasGuarantor && !inferredTags.has("guarantee") && !inferredTags.has("guaranty")) {
    findings.push({
      id: "docs_missing_guarantee",
      severity: "warning",
      category: "documents",
      title: "Missing Guarantee Documents",
      message: "Guarantor found but no guarantee documents uploaded. Guarantee documents are typically required when a guarantor is involved.",
      fix: "Upload guarantee or guaranty documents signed by the guarantor.",
      scoreImpact: -10,
      evidence: ["guarantor"],
    });
  }

  // Rule 5: Missing appraisal (for real estate deals)
  if (!inferredTags.has("appraisal") && !inferredTags.has("valuation")) {
    findings.push({
      id: "docs_missing_valuation",
      severity: "info",
      category: "documents",
      title: "Missing Valuation Documents",
      message: "No appraisal or valuation documents found. These may be required depending on the deal type.",
      fix: "Upload property valuation or appraisal reports if applicable to this deal.",
      scoreImpact: -2,
    });
  }

  // Rule 6: Missing insurance documents
  if (!inferredTags.has("insurance") && !inferredTags.has("insurance_certificate")) {
    findings.push({
      id: "docs_missing_insurance",
      severity: "info",
      category: "documents",
      title: "Missing Insurance Documents",
      message: "No insurance documents found. Insurance certificates are often required for secured transactions.",
      fix: "Upload insurance policy or certificate of currency if applicable.",
      scoreImpact: -2,
    });
  }

  // Rule 7: No files at all
  if (files.length === 0) {
    findings.push({
      id: "docs_no_files",
      severity: "critical",
      category: "documents",
      title: "No Documents Uploaded",
      message: "No files uploaded. Documents are required to complete due diligence.",
      fix: "Upload at least one document related to this deal.",
      scoreImpact: -30,
    });
  }

  // Rule 8: Lender but no loan documents
  if (hasLender && !inferredTags.has("loan_agreement") && !inferredTags.has("credit_agreement")) {
    findings.push({
      id: "docs_missing_loan_agreement",
      severity: "warning",
      category: "documents",
      title: "Missing Loan Agreement",
      message: "Lender found but no loan agreement documents found. Loan agreements are typically required.",
      fix: "Upload loan agreement, facility agreement, or credit agreement documents.",
      scoreImpact: -10,
      evidence: ["lender"],
    });
  }

  // Rule 9: Files exist but none match any inferred tags
  if (files.length > 0 && !hasInferredTags) {
    findings.push({
      id: "docs_uncategorized",
      severity: "warning",
      category: "documents",
      title: "Documents Not Categorized",
      message: "Files uploaded but none were recognized as common document types. The system cannot assess their relevance.",
      fix: "Rename files or set categories so the system can assess them.",
      scoreImpact: -10,
    });
  }

  // Calculate score
  let score = 100;
  findings.forEach(f => {
    score += f.scoreImpact;
  });
  score = Math.max(0, Math.min(100, score));

  // Determine status
  let status: AssessmentStatus;
  const hasCritical = findings.some(f => f.severity === "critical");
  const hasWarning = findings.some(f => f.severity === "warning");
  
  if (hasCritical) {
    status = "not_ready";
  } else if (hasWarning) {
    status = "needs_review";
  } else {
    status = "ready";
  }

  // Get top fixes (up to 3, priority: critical > warning > info)
  const topFixes: string[] = [];
  const criticalFixes = findings.filter(f => f.severity === "critical").map(f => f.fix);
  const warningFixes = findings.filter(f => f.severity === "warning").map(f => f.fix);
  const infoFixes = findings.filter(f => f.severity === "info").map(f => f.fix);

  topFixes.push(...criticalFixes.slice(0, 3));
  if (topFixes.length < 3) {
    topFixes.push(...warningFixes.slice(0, 3 - topFixes.length));
  }
  if (topFixes.length < 3) {
    topFixes.push(...infoFixes.slice(0, 3 - topFixes.length));
  }

  return {
    findings,
    summary: {
      score,
      status,
      topFixes,
    },
  };
}

// Legacy wrapper for backward compatibility
export function computeFindingsLegacy(input: { files: File[]; parties: Party[] }): Finding[] {
  return computeFindings(input).findings;
}
