/**
 * DealSense run execution route.
 *
 * - Runs are queued via: POST /api/submissions/{submissionId}/runs
 * - Runs are executed via: POST /api/dealsense/runs/{runId}/execute
 *
 * This route performs:
 * - Rule-based findings (computeFindings)
 * - AI completeness findings
 * - AI clarification findings
 * - Writes to submission_run_findings
 * - Computes and persists run summary (score, assessment_status, top_fixes)
 */
export * from "../process/route";

