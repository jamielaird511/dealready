import type { DocTier, WizardPurposeKey } from "./types";

/** Doc types grouped by id; tier and applicability are per-purpose in PURPOSE_DOC_MATRIX */
export const DOC_TYPES = [
  { id: "application_narrative", label: "Application Narrative" },
  { id: "statement_of_position", label: "Statement of Position" },
  { id: "financials", label: "Financials" },
  { id: "forecasts", label: "Forecasts" },
  { id: "ytd_accounts", label: "YTD Accounts" },
  { id: "receivables_payables", label: "Receivables/Payables" },
  { id: "bank_statements_business", label: "Bank Statements (Business)" },
  { id: "bank_statements_personal", label: "Bank Statements (Personal)" },
  { id: "sale_purchase_agreement", label: "Sale & Purchase Agreement" },
  { id: "information_memorandum", label: "Information Memorandum" },
  { id: "valuation", label: "Valuation" },
  { id: "invoice_quote", label: "Invoice / Quote" },
  { id: "rental_appraisal", label: "Rental Appraisal" },
  { id: "tenancy_agreements", label: "Tenancy Agreements" },
  { id: "identification", label: "Identification" },
] as const;

export type DocTypeId = (typeof DOC_TYPES)[number]["id"];

/** Per purpose: list of doc ids by tier. N/A is handled by omitting from list. */
export interface PurposeDocConfig {
  required: DocTypeId[];
  recommended: DocTypeId[];
  supporting: DocTypeId[];
  taxPositionApplicable: boolean;
}

const R = "required";
const Rec = "recommended";
const S = "supporting";
type T = DocTypeId;

export const PURPOSE_DOC_MATRIX: Record<WizardPurposeKey, PurposeDocConfig> = {
  business_purchase: {
    required: ["application_narrative", "statement_of_position", "financials", "forecasts", "sale_purchase_agreement"],
    recommended: ["ytd_accounts", "bank_statements_business", "valuation", "identification"],
    supporting: ["receivables_payables", "information_memorandum"],
    taxPositionApplicable: true,
  },
  startup: {
    required: ["application_narrative", "statement_of_position", "forecasts"],
    recommended: ["financials", "bank_statements_business", "bank_statements_personal", "identification"],
    supporting: ["receivables_payables", "information_memorandum"],
    taxPositionApplicable: true,
  },
  refinance_business: {
    required: ["application_narrative", "statement_of_position", "financials"],
    recommended: ["ytd_accounts", "bank_statements_business", "valuation", "identification"],
    supporting: ["receivables_payables", "forecasts"],
    taxPositionApplicable: true,
  },
  refinance_property: {
    required: ["application_narrative", "statement_of_position", "financials"],
    recommended: ["bank_statements_personal", "valuation", "rental_appraisal", "identification"],
    supporting: ["tenancy_agreements", "forecasts"],
    taxPositionApplicable: true,
  },
  shareholder_buyout: {
    required: ["application_narrative", "statement_of_position", "financials", "sale_purchase_agreement"],
    recommended: ["valuation", "ytd_accounts", "bank_statements_business", "identification"],
    supporting: ["information_memorandum", "receivables_payables"],
    taxPositionApplicable: true,
  },
  working_capital: {
    required: ["application_narrative", "statement_of_position", "financials", "forecasts"],
    recommended: ["ytd_accounts", "bank_statements_business", "receivables_payables", "identification"],
    supporting: ["invoice_quote"],
    taxPositionApplicable: true,
  },
  equipment: {
    required: ["application_narrative", "statement_of_position", "financials", "invoice_quote"],
    recommended: ["forecasts", "bank_statements_business", "identification"],
    supporting: ["valuation"],
    taxPositionApplicable: true,
  },
  property_purchase_oo: {
    required: ["application_narrative", "statement_of_position", "financials"],
    recommended: ["valuation", "bank_statements_personal", "identification"],
    supporting: ["forecasts", "rental_appraisal"],
    taxPositionApplicable: true,
  },
  property_purchase_inv: {
    required: ["application_narrative", "statement_of_position", "financials"],
    recommended: ["valuation", "rental_appraisal", "tenancy_agreements", "bank_statements_personal", "identification"],
    supporting: ["forecasts"],
    taxPositionApplicable: true,
  },
  other: {
    required: ["application_narrative", "statement_of_position"],
    recommended: ["financials", "forecasts", "identification"],
    supporting: ["bank_statements_business", "bank_statements_personal", "valuation"],
    taxPositionApplicable: true,
  },
};

export const WIZARD_PURPOSE_LABELS: Record<WizardPurposeKey, string> = {
  business_purchase: "Business Purchase",
  startup: "Start-Up / New Business",
  refinance_business: "Refinance (Business)",
  refinance_property: "Refinance (Property)",
  shareholder_buyout: "Shareholder Buyout",
  working_capital: "Working Capital",
  equipment: "Equipment / Asset Purchase",
  property_purchase_oo: "Property Purchase (Owner-Occupied)",
  property_purchase_inv: "Property Purchase (Investment)",
  other: "Other",
};

/** Map wizard purpose key to deal.purpose_type for API persistence */
export function wizardPurposeToDealPurpose(key: WizardPurposeKey): string {
  if (key === "refinance_property" || key === "refinance_business") return "refinance";
  if (key === "property_purchase_oo" || key === "property_purchase_inv") return "property_purchase";
  return key;
}

export function getDocLabel(id: DocTypeId): string {
  return DOC_TYPES.find((d) => d.id === id)?.label ?? id;
}

/** Exact category (wizard doc id) -> [that doc id]. Legacy buckets (broker_app, financials, etc.) are not keys; no auto-mark from them. */
export const CATEGORY_TO_WIZARD_DOC_IDS: Record<string, DocTypeId[]> = Object.fromEntries(
  DOC_TYPES.map((d) => [d.id, [d.id]])
) as Record<string, DocTypeId[]>;

/** Wizard doc id -> submission_files.category (identity: store doc id as category). */
export const WIZARD_DOC_ID_TO_UPLOAD_CATEGORY: Record<DocTypeId, string> = Object.fromEntries(
  DOC_TYPES.map((d) => [d.id, d.id])
) as Record<DocTypeId, string>;
