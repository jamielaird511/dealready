"use client";

import { WizardProvider } from "@/lib/dealWizard/wizardContext";

export default function WizardLayout({ children }: { children: React.ReactNode }) {
  return <WizardProvider>{children}</WizardProvider>;
}
