import type { DocTypeId } from "./docMatrix";
import type { PurposeDocConfig } from "./docMatrix";

/** Derived document status for wizard Step 2. */
export type DocStatus = "uploaded" | "missing" | "pending" | "not_required";

/** Per-doc override stored in deal_doc_states. */
export type DocOverride = { status: "pending" | "not_required"; reason?: string | null } | null;

/** Snapshot persisted on run creation. */
export type DocCompletenessSnapshot = {
  required: { uploaded: number; pending: number; missing: number; not_required: number };
  recommended: { uploaded: number; pending: number; missing: number; not_required: number };
  supporting: { uploaded: number; pending: number; missing: number; not_required: number };
  missingDocIds: string[];
  pendingDocIds: string[];
  pendingReasons: Record<string, string>;
  completenessPct: number;
};

/**
 * Derive document status from uploaded file count + override.
 * - fileCount > 0 -> uploaded (overrides ignored when files present)
 * - Else override not_required -> not_required
 * - Else override pending -> pending
 * - Else -> missing
 */
export function deriveDocStatus(
  fileCount: number,
  override: DocOverride
): DocStatus {
  if (fileCount > 0) return "uploaded";
  if (override?.status === "not_required") return "not_required";
  if (override?.status === "pending") return "pending";
  return "missing";
}

/** Build doc completeness snapshot from file counts and overrides. */
export function buildDocCompletenessSnapshot(
  config: PurposeDocConfig,
  fileCountByDoc: Record<string, number>,
  overrides: Record<string, { status: "pending" | "not_required"; reason?: string | null }>
): DocCompletenessSnapshot {
  const tiers = ["required", "recommended", "supporting"] as const;
  const counts = { uploaded: 0, pending: 0, missing: 0, not_required: 0 };
  const snapshot = {
    required: { ...counts },
    recommended: { ...counts },
    supporting: { ...counts },
    missingDocIds: [] as string[],
    pendingDocIds: [] as string[],
    pendingReasons: {} as Record<string, string>,
    completenessPct: 0,
  };
  let total = 0;
  let complete = 0;
  tiers.forEach((tier) => {
    const ids = config[tier] as DocTypeId[];
    ids.forEach((id) => {
      const status = deriveDocStatus(fileCountByDoc[id] ?? 0, overrides[id] ?? null);
      snapshot[tier][status]++;
      total++;
      if (status === "uploaded" || status === "not_required") complete++;
      if (status === "missing") snapshot.missingDocIds.push(id);
      if (status === "pending") {
        snapshot.pendingDocIds.push(id);
        const reason = overrides[id]?.reason?.trim();
        if (reason) snapshot.pendingReasons[id] = reason;
      }
    });
  });
  snapshot.completenessPct = total > 0 ? Math.round((complete / total) * 100) : 100;
  return snapshot;
}
