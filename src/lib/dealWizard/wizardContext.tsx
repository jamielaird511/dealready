"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { WizardState, WizardStep, WizardPurposeKey, TaxPositionOption } from "@/lib/dealWizard/types";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { PURPOSE_DOC_MATRIX } from "@/lib/dealWizard/docMatrix";

const PURPOSE_KEYS: WizardPurposeKey[] = [
  "business_purchase", "startup", "refinance_business", "refinance_property",
  "shareholder_buyout", "working_capital", "equipment", "property_purchase_oo", "property_purchase_inv", "other",
];

const STEPS: { step: WizardStep; label: string }[] = [
  { step: 1, label: "Basics" },
  { step: 2, label: "Documents" },
  { step: 3, label: "Review" },
  { step: 4, label: "Run" },
];

export type WizardContextValue = {
  state: WizardState;
  setDealName: (v: string) => void;
  setPurposeKey: (v: WizardPurposeKey) => void;
  setPurposeNotes: (v: string) => void;
  setBorrowerNames: (v: string[]) => void;
  setGuarantorNames: (v: string[]) => void;
  setDocUploaded: (id: string, value: boolean) => void;
  setDocMissing: (id: string, value: boolean) => void;
  setTaxPosition: (v: TaxPositionOption | null) => void;
  setTaxExplanation: (v: string) => void;
  setDealUpdated: (v: boolean) => void;
  currentStep: WizardStep;
  /** Step can set this to run before navigating (e.g. save deal). Layout Next calls it then goNext(). */
  setOnNext: (fn: (() => void | Promise<void>) | null) => void;
  goNext: () => void;
  goBack: () => void;
  basePath: string;
};

const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used within wizard layout");
  return ctx;
}

function parseStepFromPath(pathname: string): WizardStep {
  if (pathname.endsWith("/step-4")) return 4;
  if (pathname.endsWith("/step-3")) return 3;
  if (pathname.endsWith("/step-2")) return 2;
  return 1;
}

export function WizardProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const dealId = typeof params?.id === "string" ? params.id : "";

  const currentStep = useMemo(() => parseStepFromPath(pathname ?? ""), [pathname]);

  const [onNextFn, setOnNextFn] = useState<(() => void | Promise<void>) | null>(null);

  const [state, setState] = useState<WizardState>({
    dealId,
    step: 1,
    dealName: "",
    purposeKey: "other",
    purposeNotes: "",
    borrowerNames: [],
    guarantorNames: [],
    docUploaded: {},
    docMissing: {},
    taxPosition: null,
    taxExplanation: "",
    dealUpdated: false,
  });

  useEffect(() => {
    if (dealId && state.dealId !== dealId) {
      setState((s) => ({ ...s, dealId }));
    }
  }, [dealId, state.dealId]);

  const hasHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!dealId) return;
    const supabase = supabaseBrowser();
    supabase
      .from("deals")
      .select("name, purpose_type, purpose_notes, wizard_state")
      .eq("id", dealId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data || hasHydratedRef.current === dealId) return;
        hasHydratedRef.current = dealId;
        const name = (data.name as string) ?? "";
        const pt = (data.purpose_type as string) ?? "other";
        const pn = (data.purpose_notes as string) ?? "";
        const purposeKey: WizardPurposeKey = PURPOSE_KEYS.includes(pt as WizardPurposeKey)
          ? (pt as WizardPurposeKey)
          : pt === "refinance"
            ? "refinance_business"
            : pt === "property_purchase"
              ? "property_purchase_oo"
              : "other";
        const ws = (data.wizard_state as Record<string, unknown> | null) ?? {};
        const borrowerNames = Array.isArray(ws.borrowerNames) ? (ws.borrowerNames as string[]) : [];
        const guarantorNames = Array.isArray(ws.guarantorNames) ? (ws.guarantorNames as string[]) : [];
        const docUploaded = ws.docUploaded && typeof ws.docUploaded === "object" && !Array.isArray(ws.docUploaded) ? (ws.docUploaded as Record<string, boolean>) : {};
        const docMissing = ws.docMissing && typeof ws.docMissing === "object" && !Array.isArray(ws.docMissing) ? (ws.docMissing as Record<string, boolean>) : {};
        const taxPosition = ws.taxPosition != null && (ws.taxPosition === "confirmed_current" || ws.taxPosition === "arrears_exist" || ws.taxPosition === "not_confirmed") ? ws.taxPosition : null;
        const taxExplanation = typeof ws.taxExplanation === "string" ? ws.taxExplanation : "";
        setState((s) => ({
          ...s,
          dealId,
          dealName: name,
          purposeKey,
          purposeNotes: pn,
          borrowerNames,
          guarantorNames,
          docUploaded,
          docMissing,
          taxPosition,
          taxExplanation,
        }));
      });
  }, [dealId]);

  const saveWizardStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dealId || hasHydratedRef.current !== dealId) return;
    const payload = {
      borrowerNames: state.borrowerNames,
      guarantorNames: state.guarantorNames,
      docUploaded: state.docUploaded,
      docMissing: state.docMissing,
      taxPosition: state.taxPosition,
      taxExplanation: state.taxExplanation,
    };
    if (saveWizardStateTimerRef.current) clearTimeout(saveWizardStateTimerRef.current);
    saveWizardStateTimerRef.current = setTimeout(() => {
      saveWizardStateTimerRef.current = null;
      const supabase = supabaseBrowser();
      supabase
        .from("deals")
        .update({ wizard_state: payload, updated_at: new Date().toISOString() })
        .eq("id", dealId)
        .then(() => {});
    }, 500);
    return () => {
      if (saveWizardStateTimerRef.current) clearTimeout(saveWizardStateTimerRef.current);
    };
  }, [dealId, state.borrowerNames, state.guarantorNames, state.docUploaded, state.docMissing, state.taxPosition, state.taxExplanation]);

  const setDealName = useCallback((v: string) => setState((s) => ({ ...s, dealName: v })), []);
  const setPurposeKey = useCallback((v: WizardPurposeKey) => setState((s) => ({ ...s, purposeKey: v })), []);
  const setPurposeNotes = useCallback((v: string) => setState((s) => ({ ...s, purposeNotes: v })), []);
  const setBorrowerNames = useCallback((v: string[]) => setState((s) => ({ ...s, borrowerNames: v })), []);
  const setGuarantorNames = useCallback((v: string[]) => setState((s) => ({ ...s, guarantorNames: v })), []);
  const setDocUploaded = useCallback((id: string, value: boolean) => {
    setState((s) => ({ ...s, docUploaded: { ...s.docUploaded, [id]: value } }));
  }, []);
  const setDocMissing = useCallback((id: string, value: boolean) => {
    setState((s) => ({ ...s, docMissing: { ...s.docMissing, [id]: value } }));
  }, []);
  const setTaxPosition = useCallback((v: TaxPositionOption | null) => setState((s) => ({ ...s, taxPosition: v })), []);
  const setTaxExplanation = useCallback((v: string) => setState((s) => ({ ...s, taxExplanation: v })), []);
  const setDealUpdated = useCallback((v: boolean) => setState((s) => ({ ...s, dealUpdated: v })), []);

  const setOnNext = useCallback((fn: (() => void | Promise<void>) | null) => setOnNextFn(() => fn), []);

  const basePath = `/app/deals/${dealId}/wizard`;
  const goBack = useCallback(() => {
    if (currentStep === 2) router.push(`${basePath}/step-1`);
    else if (currentStep === 3) router.push(`${basePath}/step-2`);
    else if (currentStep === 4) router.push(`${basePath}/step-3`);
  }, [currentStep, basePath, router]);
  const goNext = useCallback(async () => {
    if (onNextFn) {
      try {
        await onNextFn();
      } catch {
        return;
      }
      setOnNextFn(null);
    }
    if (currentStep === 1) router.push(`${basePath}/step-2`);
    else if (currentStep === 2) router.push(`${basePath}/step-3`);
    else if (currentStep === 3) router.push(`${basePath}/step-4`);
  }, [currentStep, basePath, router, onNextFn]);

  const value = useMemo<WizardContextValue>(
    () => ({
      state,
      setDealName,
      setPurposeKey,
      setPurposeNotes,
      setBorrowerNames,
      setGuarantorNames,
      setDocUploaded,
      setDocMissing,
      setTaxPosition,
      setTaxExplanation,
      setDealUpdated,
      currentStep,
      setOnNext,
      goNext,
      goBack,
      basePath,
    }),
    [state, currentStep, setDealName, setPurposeKey, setPurposeNotes, setBorrowerNames, setGuarantorNames, setDocUploaded, setDocMissing, setTaxPosition, setTaxExplanation, setDealUpdated, setOnNext, goNext, goBack, basePath]
  );

  return (
    <WizardContext.Provider value={value}>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-8">
          {/* Stepper */}
          {(() => {
            const basicsComplete = !!state.dealName.trim() && !!state.purposeKey;
            return (
              <nav className="mb-8" aria-label="Progress">
                <ol className="flex items-center justify-between gap-2">
                  {STEPS.map(({ step, label }, i) => {
                    const isCurrent = currentStep === step;
                    const isPast = currentStep > step;
                    const href = `${basePath}/step-${step}`;
                    const stepDisabled = step >= 2 && !basicsComplete;
                    const linkClass = `flex flex-col items-center rounded-full px-3 py-1.5 text-sm font-semibold ${
                      isCurrent ? "bg-indigo-600 text-white" : isPast ? "bg-indigo-100 text-indigo-800" : "bg-slate-200 text-slate-600"
                    }`;
                    return (
                      <li key={step} className="flex flex-1 items-center">
                        {i > 0 && <div className={`h-0.5 flex-1 ${isPast ? "bg-indigo-600" : "bg-slate-200"}`} />}
                        {stepDisabled ? (
                          <span className={`${linkClass} cursor-not-allowed opacity-60`} aria-disabled="true">
                            <span>{step}</span>
                            <span className="hidden sm:inline">{label}</span>
                          </span>
                        ) : (
                          <Link href={href} className={linkClass}>
                            <span>{step}</span>
                            <span className="hidden sm:inline">{label}</span>
                          </Link>
                        )}
                        {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${isPast ? "bg-indigo-600" : "bg-slate-200"}`} />}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            );
          })()}

          {/* Step content */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm" suppressHydrationWarning>{children}</div>

          {/* Bottom nav */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Back
                </button>
              )}
            </div>
            <div>
              {currentStep < 4 ? (
                <div className="flex flex-col items-end gap-1">
                  {currentStep === 3 && (() => {
                    const requiredIds = PURPOSE_DOC_MATRIX[state.purposeKey].required;
                    const step3Ready = requiredIds.every((id) => state.docUploaded[id] || state.docMissing?.[id]);
                    if (!step3Ready) {
                      return <span className="text-sm text-amber-700">Complete required docs to continue.</span>;
                    }
                    return null;
                  })()}
                  <button
                    type="button"
                    onClick={() => goNext()}
                    disabled={
                      (currentStep === 1 && (!state.dealName.trim() || !state.purposeKey)) ||
                      (currentStep === 3 && state.taxPosition === "arrears_exist" && !state.taxExplanation.trim()) ||
                      (currentStep === 3 && !PURPOSE_DOC_MATRIX[state.purposeKey].required.every((id) => state.docUploaded[id] || state.docMissing?.[id]))
                    }
                    className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              ) : (
                <span className="text-slate-500 text-sm">Use the &quot;Run DealSense&quot; button above.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </WizardContext.Provider>
  );
}
