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
