export const DEALSENSE_QUESTIONS = [
  {
    id: "transaction_asset",
    label: "Transaction asset or business",
    question: "What asset, business, or property is being purchased?",
    category: "transaction",
  },
  {
    id: "borrower_entity",
    label: "Borrower or purchasing entity",
    question: "Who is the borrower or purchasing entity?",
    category: "transaction",
  },
  {
    id: "purchase_price",
    label: "Purchase price",
    question: "What is the purchase price of the transaction?",
    category: "transaction",
  },
  {
    id: "bank_funding",
    label: "Bank funding requested",
    question: "How much bank funding is being requested?",
    category: "funding",
  },
  {
    id: "equity_contribution",
    label: "Equity contribution",
    question: "How much equity is being contributed and what is the source?",
    category: "funding",
  },
  {
    id: "historical_financials",
    label: "Historical financial performance",
    question: "What historical financial performance exists for the business?",
    category: "financials",
  },
  {
    id: "forecasts",
    label: "Financial forecasts",
    question: "Are financial forecasts provided and what do they indicate?",
    category: "financials",
  },
  {
    id: "security_assets",
    label: "Security assets proposed",
    question: "What security assets or collateral are proposed for the loan?",
    category: "security",
  },
  {
    id: "owner_remuneration",
    label: "Owner remuneration",
    question: "What remuneration, salary, or drawings will the owners take?",
    category: "ownership",
  },
  {
    id: "key_risks",
    label: "Key risks",
    question:
      "Are there identifiable risks such as tax arrears, contingent liabilities, or related party transactions?",
    category: "risk",
  },
] as const;

export const BUSINESS_PURCHASE_QUESTIONS = [
  {
    id: "purchase_structure",
    category: "Transaction",
    question: "Is this an asset or share purchase?",
    reason: "Determines legal risk, transfer of liabilities, and lending structure.",
  },
  {
    id: "purchase_price_breakdown",
    category: "Transaction",
    question: "Provide a breakdown of the purchase price (goodwill, plant & equipment, stock).",
    reason: "Required to assess lending allocation and realisable security value.",
  },
  {
    id: "equity_contribution",
    category: "Funding",
    question: "What is the confirmed equity contribution and where is it being sourced from?",
    reason: "Ensures genuine borrower commitment and avoids over-leveraging.",
  },
  {
    id: "vendor_finance",
    category: "Funding",
    question: "Is any vendor finance included, and if so what are the terms (amount, ranking, repayment)?",
    reason: "Impacts total leverage and repayment pressure on the business.",
  },
  {
    id: "historical_financials",
    category: "Serviceability",
    question: "Provide the last 2–3 years financial statements for the business.",
    reason: "Required to assess historical performance and baseline serviceability.",
  },
  {
    id: "normalised_ebitda",
    category: "Serviceability",
    question: "What is the normalized EBITDA and what adjustments have been made?",
    reason: "Ensures earnings used for servicing are sustainable and not overstated.",
  },
  {
    id: "debt_servicing_capacity",
    category: "Serviceability",
    question: "Based on proposed lending, what is the expected debt servicing position (e.g. DSCR)?",
    reason: "Confirms the business can meet repayment obligations under realistic assumptions.",
  },
  {
    id: "owner_involvement_management",
    category: "Serviceability",
    question: "What is the owner involvement, management structure, and remuneration approach post-settlement?",
    reason: "Confirms operating model and ensures servicing assumptions reflect owner drawings or management costs.",
  },
  {
    id: "tax_and_liabilities",
    category: "Risk",
    question: "Are there any tax arrears, creditor issues, or contingent liabilities?",
    reason: "Identifies hidden risks that could impair cashflow or increase leverage.",
  },
  {
    id: "customer_concentration",
    category: "Risk",
    question: "Is there any customer or revenue concentration (e.g. >30% from a single source)?",
    reason: "Highlights vulnerability in income sustainability.",
  },
  {
    id: "security_position",
    category: "Security",
    question: "What security is being offered (business assets, property, guarantees)?",
    reason: "Determines downside protection and overall risk profile of the lending.",
  },
] as const;
