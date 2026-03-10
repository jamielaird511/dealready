// DEPRECATED: prefer /api/submissions/[submissionId]/runs
// This route is kept for backward compatibility and simply forwards to the new handler,
// where queued-run creation now lives.
import type { NextRequest } from "next/server";
import { POST as runsPOST } from "../runs/route";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ submissionId: string }> }
) {
  // Thin wrapper to keep existing UI calls working.
  return runsPOST(req, context);
}

