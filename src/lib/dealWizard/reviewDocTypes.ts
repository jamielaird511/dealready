/**
 * Document types shown in the wizard review step (file-first, broker confirms).
 * Maps to submission_files.category for backend analysis; backend allows a fixed set.
 */

export const REVIEW_DOC_TYPES = [
  { id: "financial_statements", label: "Financial Statements", category: "financials" as const },
  { id: "forecasts", label: "Forecasts", category: "forecasts" as const },
  { id: "bank_statements", label: "Bank Statements", category: "other" as const },
  { id: "id_kyc", label: "ID / KYC", category: "other" as const },
  { id: "trust_deed", label: "Trust Deed", category: "other" as const },
  { id: "company_documents", label: "Company Documents", category: "other" as const },
  { id: "purchase_agreement", label: "Purchase Agreement", category: "other" as const },
  { id: "property_valuation", label: "Property Valuation", category: "security" as const },
  { id: "lease_tenancy", label: "Lease / Tenancy", category: "other" as const },
  { id: "application_deal_summary", label: "Application / Deal Summary", category: "broker_app" as const },
  { id: "other", label: "Other", category: "other" as const },
] as const;

export type ReviewDocTypeId = (typeof REVIEW_DOC_TYPES)[number]["id"];

const ALLOWED_CATEGORIES = new Set(["financials", "forecasts", "business_plan", "broker_app", "security", "other"]);

/** Map submission_files.category (and optional doc_type) to a review type id for display. */
export function categoryToReviewTypeId(category: string | null | undefined, _docType?: string | null): ReviewDocTypeId {
  const c = (category ?? "").toLowerCase().trim();
  if (!ALLOWED_CATEGORIES.has(c)) return "other";
  const found = REVIEW_DOC_TYPES.find((r) => r.category === c);
  if (found) return found.id;
  if (c === "financials") return "financial_statements";
  if (c === "forecasts") return "forecasts";
  if (c === "broker_app") return "application_deal_summary";
  if (c === "security") return "property_valuation";
  if (c === "business_plan") return "application_deal_summary";
  return "other";
}

/** Get backend category to persist from review type id. */
export function reviewTypeIdToCategory(id: ReviewDocTypeId): string {
  const r = REVIEW_DOC_TYPES.find((x) => x.id === id);
  return r ? r.category : "other";
}

export type ConfidenceLevel = "high" | "medium" | "low";

/** Convert numeric confidence 0–1 to High/Medium/Low. */
export function confidenceToLevel(n: number | null | undefined): ConfidenceLevel {
  if (n == null || typeof n !== "number") return "low";
  if (n >= 0.8) return "high";
  if (n >= 0.5) return "medium";
  return "low";
}

/**
 * Mock prediction: suggest document type from filename and existing category/doc_type.
 * Replace with backend prediction later without changing UI.
 */
export function predictDocTypeFromFile(
  filename: string,
  existingCategory: string | null | undefined,
  existingDocType: string | null | undefined,
  _extractedTextPreview?: string | null
): { typeId: ReviewDocTypeId; confidence: ConfidenceLevel } {
  const rawName = (filename ?? "").toLowerCase();
  const name = rawName.replace(/[_\-]+/g, " ");
  const cat = (existingCategory ?? "").toLowerCase();
  const doc = (existingDocType ?? "").toLowerCase();

  // Strong, filename-driven signals only. Default to Other when unsure.

  // Application / Deal Summary
  if (
    name.includes("deal summary") ||
    name.includes("lending summary") ||
    name.includes("loan application") ||
    name.includes("credit application")
  ) {
    return { typeId: "application_deal_summary", confidence: "high" };
  }
  if (
    name.includes("application") ||
    name.includes("submission") ||
    name.includes("summary")
  ) {
    return { typeId: "application_deal_summary", confidence: "medium" };
  }

  // ID / KYC
  if (
    name.includes("passport") ||
    name.includes("driver licence") ||
    name.includes("drivers licence") ||
    name.includes("driver license") ||
    name.includes("drivers license")
  ) {
    return { typeId: "id_kyc", confidence: "high" };
  }
  if (
    name.includes("kyc") ||
    name.includes("photo id") ||
    /\bid\b/.test(name)
  ) {
    return { typeId: "id_kyc", confidence: "medium" };
  }

  // Bank Statements – only strong bank-statement terms
  if (
    name.includes("bank statement") ||
    name.includes("account statement") ||
    name.includes("transaction listing") ||
    (name.includes("bank") && name.includes("statement"))
  ) {
    return { typeId: "bank_statements", confidence: "high" };
  }

  // Financial Statements
  if (
    name.includes("financial statements") ||
    name.includes("financials") ||
    name.includes("profit and loss") ||
    name.includes("p&l") ||
    name.includes("balance sheet") ||
    name.includes("trial balance")
  ) {
    return { typeId: "financial_statements", confidence: "medium" };
  }

  // Forecasts
  if (name.includes("forecast") || name.includes("projection") || name.includes("budget")) {
    return { typeId: "forecasts", confidence: "medium" };
  }

  // Property valuation / security
  if (name.includes("valuation") || name.includes("valuation report") || name.includes("registered valuation")) {
    return { typeId: "property_valuation", confidence: "medium" };
  }

  // Trust deed
  if (name.includes("trust deed")) {
    return { typeId: "trust_deed", confidence: "high" };
  }
  if (name.includes("trust") && name.includes("deed")) {
    return { typeId: "trust_deed", confidence: "medium" };
  }

  // Company documents
  if (
    name.includes("certificate of incorporation") ||
    name.includes("company constitution")
  ) {
    return { typeId: "company_documents", confidence: "high" };
  }
  if (
    name.includes("company") ||
    name.includes("incorporation") ||
    name.includes("constitution")
  ) {
    return { typeId: "company_documents", confidence: "medium" };
  }

  // Purchase agreement / SPA
  if (name.includes("sale and purchase") || name.includes("sale & purchase") || name.includes("spa")) {
    return { typeId: "purchase_agreement", confidence: "high" };
  }
  if (name.includes("purchase agreement") || name.includes("sale agreement")) {
    return { typeId: "purchase_agreement", confidence: "medium" };
  }

  // Lease / tenancy
  if (name.includes("lease") || name.includes("tenancy") || name.includes("rental")) {
    return { typeId: "lease_tenancy", confidence: "medium" };
  }

  if (ALLOWED_CATEGORIES.has(cat)) {
    const typeId = categoryToReviewTypeId(existingCategory, existingDocType);
    return { typeId, confidence: typeId === "other" ? "low" : "medium" };
  }
  return { typeId: "other", confidence: "low" };
}
