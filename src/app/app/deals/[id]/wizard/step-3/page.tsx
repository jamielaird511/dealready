"use client";

import { useWizard } from "@/lib/dealWizard/wizardContext";
import { PURPOSE_DOC_MATRIX, WIZARD_PURPOSE_LABELS, getDocLabel, type DocTypeId } from "@/lib/dealWizard/docMatrix";
import type { DocTier, TaxPositionOption } from "@/lib/dealWizard/types";

const TIER_LABELS: Record<DocTier, string> = { required: "Required", recommended: "Recommended", supporting: "Supporting" };
const TAX_LABELS: Record<TaxPositionOption, string> = {
  confirmed_current: "Confirmed current (no arrears)",
  arrears_exist: "Arrears exist",
  not_confirmed: "Not confirmed",
};

function computeConfidence(state: ReturnType<typeof useWizard>["state"]): number {
  const config = PURPOSE_DOC_MATRIX[state.purposeKey];
  let score = 100;
  const requiredIds = config.required;
  const recommendedIds = config.recommended;
  const missingRequired = requiredIds.filter((id) => !state.docUploaded[id] && !state.docMissing?.[id]).length;
  const missingRecommended = recommendedIds.filter((id) => !state.docUploaded[id]).length;
  score -= missingRequired * 8;
  score -= missingRecommended * 2;
  if (state.taxPosition === "not_confirmed") score -= 5;
  if (state.taxPosition === "arrears_exist" && !state.taxExplanation.trim()) score -= 5;
  return Math.max(0, Math.min(100, score));
}

export default function WizardStep3Page() {
  const { state, setDocMissing } = useWizard();
  const config = PURPOSE_DOC_MATRIX[state.purposeKey];
  const confidence = computeConfidence(state);

  const requiredUploaded = config.required.filter((id) => state.docUploaded[id]).length;
  const requiredTotal = config.required.length;
  const recommendedUploaded = config.recommended.filter((id) => state.docUploaded[id]).length;
  const recommendedTotal = config.recommended.length;
  const requiredReady = config.required.every((id) => state.docUploaded[id] || state.docMissing?.[id]);

  function DocRow({ id, tier }: { id: DocTypeId; tier: DocTier }) {
    const uploaded = state.docUploaded[id];
    const markedMissing = !!state.docMissing?.[id];
    const status = uploaded ? "Uploaded" : markedMissing ? "Marked missing" : "Missing";
    const pillClass = uploaded
      ? "bg-emerald-100 text-emerald-800"
      : markedMissing
        ? "bg-slate-200 text-slate-700"
        : "bg-amber-100 text-amber-800";
    return (
      <li className="flex items-center justify-between gap-2 py-1.5 text-sm">
        <span className="font-medium text-slate-900">{getDocLabel(id)}</span>
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${pillClass}`}>{status}</span>
          {tier === "required" && !uploaded && (
            <button
              type="button"
              onClick={() => setDocMissing(id, !markedMissing)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              {markedMissing ? "Unmark" : "Mark missing"}
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">Review</h1>
      <p className="text-slate-600">Summary and analysis confidence before running DealSense.</p>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900 mb-2">Basics</h2>
        <dl className="grid grid-cols-1 gap-2 text-sm">
          <div>
            <dt className="text-slate-500">Deal name</dt>
            <dd className="font-medium text-slate-900">{state.dealName || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Purpose</dt>
            <dd className="font-medium text-slate-900">{WIZARD_PURPOSE_LABELS[state.purposeKey]}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Borrowers</dt>
            <dd className="font-medium text-slate-900">{state.borrowerNames.length ? state.borrowerNames.join(", ") : "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Guarantors</dt>
            <dd className="font-medium text-slate-900">{state.guarantorNames.length ? state.guarantorNames.join(", ") : "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900 mb-2">Document checklist</h2>
        <p className="text-sm text-slate-600 mb-3">
          Required: {requiredUploaded}/{requiredTotal} uploaded — Recommended: {recommendedUploaded}/{recommendedTotal} uploaded
        </p>
        {!requiredReady && (
          <p className="text-sm text-amber-700 mb-3">Upload or mark missing all required documents to proceed.</p>
        )}
        <div className="space-y-4">
          {(["required", "recommended", "supporting"] as const).map((tier) => {
            const ids = config[tier] as DocTypeId[];
            if (ids.length === 0) return null;
            return (
              <div key={tier}>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{TIER_LABELS[tier]}</h3>
                <ul className="list-none space-y-0">
                  {ids.map((id) => (
                    <DocRow key={id} id={id} tier={tier} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {config.taxPositionApplicable && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-2">Tax position</h2>
          <p className="text-sm text-slate-600">
            {state.taxPosition ? TAX_LABELS[state.taxPosition] : "Not set"}
            {state.taxPosition === "arrears_exist" && state.taxExplanation && (
              <span className="block mt-1 text-slate-500">Explanation provided.</span>
            )}
          </p>
        </section>
      )}

      <section className="rounded-lg border-2 border-indigo-200 bg-indigo-50 p-4">
        <h2 className="text-sm font-bold text-indigo-900 mb-1">Analysis confidence (preview)</h2>
        <p className="text-2xl font-bold text-indigo-700">{confidence}%</p>
        <p className="text-xs text-indigo-800 mt-1">
          Based on required/recommended docs and tax confirmation. Not confirmed or missing docs reduce the score.
        </p>
      </section>
    </div>
  );
}
