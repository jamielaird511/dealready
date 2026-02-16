import { z } from "zod";

export const PURPOSE_TYPES = [
  "business_purchase",
  "startup",
  "refinance",
  "equipment",
  "working_capital",
  "property_purchase",
  "shareholder_buyout",
  "expansion",
  "other",
] as const;

export type PurposeType = (typeof PURPOSE_TYPES)[number];

export interface Deal {
  id: string;
  name?: string;
  status?: string;
  notes?: string | null;
  purpose_type: string;
  purpose_notes?: string | null;
}

export const dealPurposeSchema = z.object({
  purpose_type: z.enum(PURPOSE_TYPES),
  purpose_notes: z.string().max(500).nullable().optional(),
});

export const dealUpdateBodySchema = z.object({
  name: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
  purpose_type: z.enum(PURPOSE_TYPES).optional(),
  purpose_notes: z.string().max(500).nullable().optional(),
});
