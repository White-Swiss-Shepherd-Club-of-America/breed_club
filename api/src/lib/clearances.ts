import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { dogHealthClearances, healthTestTypeOrgs } from "../db/schema.js";
import type { ResultSchema } from "../db/schema.js";
import { computeResultScores, computeResultSummary } from "./scoring.js";

/**
 * The submitted shape of one health clearance, common to the direct endpoint,
 * the batch endpoint, and the Stripe webhook.
 */
export interface ClearanceSubmission {
  health_test_type_id: string;
  organization_id: string;
  result: string;
  result_data?: Record<string, unknown> | null;
  result_detail?: string | null;
  test_date: string;
  expiration_date?: string | null;
  certificate_number?: string | null;
  notes?: string | null;
  is_preliminary?: boolean;
  application_number?: string | null;
}

/**
 * Builds the row for one clearance.
 *
 * Every submission path must go through this. Previously the paid path
 * (Stripe webhook) wrote `result` verbatim with a NULL score and no
 * `(Prelim)` marker while the unpaid path computed all three — so whether a
 * submitter happened to owe a fee changed their dog's health rating.
 *
 * Accepts a transaction handle as well as a plain connection: both are
 * assignable to `Database`.
 */
export async function buildClearanceRow(
  db: Database,
  input: {
    dogId: string;
    item: ClearanceSubmission;
    certificateUrl?: string | null;
    submittedBy: string;
  }
): Promise<typeof dogHealthClearances.$inferInsert> {
  const { dogId, item, certificateUrl, submittedBy } = input;

  const [orgLink] = await db
    .select({ result_schema: healthTestTypeOrgs.result_schema })
    .from(healthTestTypeOrgs)
    .where(
      and(
        eq(healthTestTypeOrgs.health_test_type_id, item.health_test_type_id),
        eq(healthTestTypeOrgs.organization_id, item.organization_id)
      )
    )
    .limit(1);

  const resultSchema = (orgLink?.result_schema ?? null) as ResultSchema | null;
  const resultData = item.result_data ?? null;

  const baseResult = computeResultSummary(item.result, resultData, resultSchema);
  const scores = computeResultScores(item.result, resultData, resultSchema);
  const isPreliminary = item.is_preliminary ?? false;

  return {
    dog_id: dogId,
    health_test_type_id: item.health_test_type_id,
    organization_id: item.organization_id,
    result: isPreliminary ? `${baseResult} (Prelim)` : baseResult,
    result_data: resultData,
    result_detail: item.result_detail ?? null,
    result_score: scores.result_score,
    result_score_left: scores.result_score_left,
    result_score_right: scores.result_score_right,
    test_date: item.test_date,
    expiration_date: item.expiration_date ?? null,
    // A preliminary result has no official certificate number yet.
    certificate_number: isPreliminary ? null : (item.certificate_number ?? null),
    certificate_url: certificateUrl ?? null,
    is_preliminary: isPreliminary,
    application_number: item.application_number ?? null,
    notes: item.notes ?? null,
    status: "pending",
    submitted_by: submittedBy,
  };
}
