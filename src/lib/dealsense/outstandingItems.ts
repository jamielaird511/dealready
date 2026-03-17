/**
 * Outstanding items / deal status for run results.
 * Context for credit review: items often expected but not necessarily present.
 */

export const OUTSTANDING_ITEMS = [
  { id: "purchase_agreement", label: "Purchase Agreement" },
  { id: "trust_deed", label: "Trust Deed" },
  { id: "prior_year_financials", label: "Prior year financials" },
  { id: "forecasts", label: "Forecasts" },
  { id: "bank_servicing_summary", label: "Bank servicing summary" },
  { id: "valuation", label: "Valuation" },
  { id: "security_details", label: "Security details" },
] as const;

export type OutstandingItemId = (typeof OUTSTANDING_ITEMS)[number]["id"];

export const OUTSTANDING_STATUSES = [
  { value: "not_provided", label: "Not provided" },
  { value: "not_available_yet", label: "Not available yet" },
  { value: "will_provide_later", label: "Will be provided later" },
  { value: "not_applicable", label: "Not applicable" },
] as const;

export type OutstandingStatusValue = (typeof OUTSTANDING_STATUSES)[number]["value"];

/** Statuses that indicate the deal may still be early stage */
export function isEarlyStageStatus(value: string): boolean {
  return value === "not_available_yet" || value === "will_provide_later";
}
