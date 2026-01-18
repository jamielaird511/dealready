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
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
}

export function computeFindings(input: { files: File[]; parties: Party[] }): Finding[] {
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

  // File category checks
  const fileCategories = new Set<string>();
  files.forEach((f) => {
    if (f.category) {
      fileCategories.add(f.category.toLowerCase());
    }
  });

  // Rule 1: Missing borrower
  if (!hasBorrower) {
    findings.push({
      severity: "critical",
      category: "parties",
      message: "No borrower found in deal parties. A borrower is required.",
    });
  }

  // Rule 2: Missing financial statements
  if (!fileCategories.has("financial_statements") && !fileCategories.has("financial")) {
    findings.push({
      severity: hasBorrower ? "warning" : "info",
      category: "documents",
      message: "No financial statements found. Financial statements are typically required for due diligence.",
    });
  }

  // Rule 3: Missing credit report
  if (!fileCategories.has("credit_report") && !fileCategories.has("credit")) {
    findings.push({
      severity: hasBorrower ? "warning" : "info",
      category: "documents",
      message: "No credit report found. Credit reports are typically required for borrower assessment.",
    });
  }

  // Rule 4: Guarantor without guarantee documents
  if (hasGuarantor && !fileCategories.has("guarantee") && !fileCategories.has("guaranty")) {
    findings.push({
      severity: "warning",
      category: "documents",
      message: "Guarantor found but no guarantee documents uploaded. Guarantee documents are typically required when a guarantor is involved.",
    });
  }

  // Rule 5: Missing appraisal (for real estate deals)
  if (!fileCategories.has("appraisal") && !fileCategories.has("valuation")) {
    findings.push({
      severity: "info",
      category: "documents",
      message: "No appraisal or valuation documents found. These may be required depending on the deal type.",
    });
  }

  // Rule 6: Missing insurance documents
  if (!fileCategories.has("insurance") && !fileCategories.has("insurance_certificate")) {
    findings.push({
      severity: "info",
      category: "documents",
      message: "No insurance documents found. Insurance certificates are often required for secured transactions.",
    });
  }

  // Rule 7: No files at all
  if (files.length === 0) {
    findings.push({
      severity: "critical",
      category: "documents",
      message: "No files uploaded. Documents are required to complete due diligence.",
    });
  }

  // Rule 8: Lender but no loan documents
  if (hasLender && !fileCategories.has("loan_agreement") && !fileCategories.has("credit_agreement")) {
    findings.push({
      severity: "warning",
      category: "documents",
      message: "Lender found but no loan agreement documents found. Loan agreements are typically required.",
    });
  }

  return findings;
}
