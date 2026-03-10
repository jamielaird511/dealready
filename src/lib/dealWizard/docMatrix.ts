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
    recommended: ["bank_statements_personal", "information_memorandum", "identification"],
    supporting: [],
    taxPositionApplicable: false,
  },
  startup: {
    required: ["application_narrative", "statement_of_position", "forecasts", "bank_statements_personal"],
    recommended: ["identification"],
    supporting: [],
    taxPositionApplicable: false,
  },
  refinance_business: {
    required: ["application_narrative", "statement_of_position", "financials", "bank_statements_business"],
    recommended: ["ytd_accounts", "receivables_payables", "forecasts", "identification"],
    supporting: [],
    taxPositionApplicable: true,
  },
  refinance_property: {
    required: ["application_narrative", "statement_of_position", "financials", "bank_statements_business", "valuation"],
    recommended: ["ytd_accounts", "bank_statements_personal", "forecasts", "identification"],
    supporting: ["sale_purchase_agreement", "rental_appraisal"],
    taxPositionApplicable: true,
  },
  shareholder_buyout: {
    required: ["application_narrative", "statement_of_position", "financials"],
    recommended: ["ytd_accounts", "forecasts", "sale_purchase_agreement", "identification"],
    supporting: ["receivables_payables"],
    taxPositionApplicable: true,
  },
  working_capital: {
    required: ["application_narrative", "statement_of_position", "financials", "forecasts"],
    recommended: ["ytd_accounts", "receivables_payables", "identification"],
    supporting: [],
    taxPositionApplicable: true,
  },
  equipment: {
    required: ["application_narrative", "statement_of_position", "financials", "invoice_quote", "sale_purchase_agreement"],
    recommended: ["ytd_accounts", "identification"],
    supporting: ["receivables_payables", "forecasts", "information_memorandum", "valuation"],
    taxPositionApplicable: true,
  },
  property_purchase_oo: {
    required: ["application_narrative", "statement_of_position", "financials", "sale_purchase_agreement", "valuation"],
    recommended: ["ytd_accounts", "forecasts", "information_memorandum", "identification"],
    supporting: ["receivables_payables"],
    taxPositionApplicable: true,
  },
  property_purchase_inv: {
    required: ["application_narrative", "statement_of_position", "sale_purchase_agreement", "information_memorandum", "valuation", "tenancy_agreements"],
    recommended: ["identification"],
    supporting: ["rental_appraisal"],
    taxPositionApplicable: true,
  },
  other: {
    required: ["application_narrative", "statement_of_position"],
    recommended: [],
    supporting: [],
    taxPositionApplicable: false,
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

/** Legacy submission_files.category -> wizard doc id. */
export const LEGACY_CATEGORY_TO_DOC_ID: Record<string, DocTypeId> = {
  broker_app: "application_narrative",
  financials: "financials",
  forecasts: "forecasts",
  security: "valuation",
  id: "identification",
  identification: "identification",
};
