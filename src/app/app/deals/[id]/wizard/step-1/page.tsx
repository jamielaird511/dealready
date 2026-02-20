"use client";

import { useEffect, useRef } from "react";
import { useWizard } from "@/lib/dealWizard/wizardContext";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { wizardPurposeToDealPurpose, WIZARD_PURPOSE_LABELS } from "@/lib/dealWizard/docMatrix";
import type { WizardPurposeKey } from "@/lib/dealWizard/types";

const PURPOSE_KEYS: WizardPurposeKey[] = [
  "business_purchase",
  "startup",
  "refinance_business",
  "refinance_property",
  "shareholder_buyout",
  "working_capital",
  "equipment",
  "property_purchase_oo",
  "property_purchase_inv",
  "other",
];

function parseLines(s: string): string[] {
  return s
    .split(/\n/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function WizardStep1Page() {
  const { state, setDealName, setPurposeKey, setPurposeNotes, setBorrowerNames, setGuarantorNames, setDealUpdated, setOnNext } = useWizard();
  const dealId = state.dealId;
  const borrowerTextRef = useRef<string>("");
  const guarantorTextRef = useRef<string>("");

  useEffect(() => {
    if (!dealId) return;
    const supabase = supabaseBrowser();
    supabase
      .from("deals")
      .select("name, purpose_type, purpose_notes")
      .eq("id", dealId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setDealName((data.name as string) ?? "");
          const pt = (data.purpose_type as string) ?? "other";
          const pn = (data.purpose_notes as string) ?? "";
          setPurposeNotes(pn);
          const key = PURPOSE_KEYS.includes(pt as WizardPurposeKey) ? (pt as WizardPurposeKey) : pt === "refinance" ? "refinance_business" : pt === "property_purchase" ? "property_purchase_oo" : "other";
          setPurposeKey(key);
        }
      });
  }, [dealId, setDealName, setPurposeKey, setPurposeNotes]);

  useEffect(() => {
    setOnNext(async () => {
      if (!dealId || !state.dealName.trim()) return;
      const supabase = supabaseBrowser();
      const purposeType = wizardPurposeToDealPurpose(state.purposeKey);
      const wizardState = {
        borrowerNames: state.borrowerNames,
        guarantorNames: state.guarantorNames,
        docUploaded: state.docUploaded,
        docMissing: state.docMissing,
        taxPosition: state.taxPosition,
        taxExplanation: state.taxExplanation,
      };
      const { error } = await supabase
        .from("deals")
        .update({
          name: state.dealName.trim(),
          purpose_type: purposeType,
          purpose_notes: state.purposeKey === "other" ? (state.purposeNotes.trim() || null) : null,
          wizard_state: wizardState,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dealId);
      if (error) {
        console.error("Wizard step 1 save error:", error);
        alert("Failed to save deal. Please try again.");
        throw new Error("Save failed");
      }
      setDealUpdated(true);
    });
    return () => setOnNext(null);
  }, [dealId, state.dealName, state.purposeKey, state.purposeNotes, state.borrowerNames, state.guarantorNames, state.docUploaded, state.docMissing, state.taxPosition, state.taxExplanation, setDealUpdated, setOnNext]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">Basics</h1>
      <p className="text-slate-600">Enter deal name, purpose, and parties.</p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Deal Name (required)</label>
          <input
            type="text"
            value={state.dealName}
            onChange={(e) => setDealName(e.target.value)}
            placeholder="e.g. Acme Corp Facility"
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Purpose (required)</label>
          <select
            value={state.purposeKey}
            onChange={(e) => setPurposeKey(e.target.value as WizardPurposeKey)}
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            {PURPOSE_KEYS.map((key) => (
              <option key={key} value={key}>
                {WIZARD_PURPOSE_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        {state.purposeKey === "other" && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Purpose details</label>
            <textarea
              value={state.purposeNotes}
              onChange={(e) => setPurposeNotes(e.target.value)}
              placeholder="Briefly describe the borrowing purpose"
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Borrower entities</label>
          <textarea
            defaultValue={state.borrowerNames.join("\n")}
            onBlur={(e) => {
              borrowerTextRef.current = e.target.value;
              setBorrowerNames(parseLines(e.target.value));
            }}
            onChange={(e) => {
              borrowerTextRef.current = e.target.value;
              setBorrowerNames(parseLines(e.target.value));
            }}
            placeholder="One per line: Acme Ltd, John Smith"
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Guarantors</label>
          <textarea
            defaultValue={state.guarantorNames.join("\n")}
            onBlur={(e) => {
              guarantorTextRef.current = e.target.value;
              setGuarantorNames(parseLines(e.target.value));
            }}
            onChange={(e) => {
              guarantorTextRef.current = e.target.value;
              setGuarantorNames(parseLines(e.target.value));
            }}
            placeholder="One per line (optional)"
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>
    </div>
  );
}
