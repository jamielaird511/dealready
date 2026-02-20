export type WizardStep = 1 | 2 | 3 | 4;

export type DocTier = "required" | "recommended" | "supporting";

export interface DocMatrixItem {
  id: string;
  label: string;
  tier: DocTier;
  /** Purpose keys where this doc is N/A (e.g. "startup" for Financials) */
  naForPurposes?: string[];
}

/** Wizard purpose key (may map to deal.purpose_type; refinance_property -> refinance) */
export type WizardPurposeKey =
  | "business_purchase"
  | "startup"
  | "refinance_business"
  | "refinance_property"
  | "shareholder_buyout"
  | "working_capital"
  | "equipment"
  | "property_purchase_oo"
  | "property_purchase_inv"
  | "other";

export type TaxPositionOption = "confirmed_current" | "arrears_exist" | "not_confirmed";

export interface WizardState {
  dealId: string;
  step: WizardStep;
  dealName: string;
  purposeKey: WizardPurposeKey;
  purposeNotes: string;
  borrowerNames: string[];
  guarantorNames: string[];
  /** docId -> true if uploaded */
  docUploaded: Record<string, boolean>;
  /** docId -> true if user explicitly marked as missing (required-docs readiness gate) */
  docMissing: Record<string, boolean>;
  taxPosition: TaxPositionOption | null;
  taxExplanation: string;
  /** Persisted to deal on Step 1 Next */
  dealUpdated: boolean;
}

/** TODO: Persist tax position + explanation to deal record when a lightweight metadata column exists. */
