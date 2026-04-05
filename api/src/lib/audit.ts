import type { Database } from "../db/client.js";
import { dogAuditLogs } from "../db/schema.js";

export interface AuditChange {
  field: string;
  old: unknown;
  new: unknown;
}

/** Fields to skip when diffing dog records. */
const SKIP_FIELDS = new Set(["updated_at", "created_at"]);

/**
 * Compare two dog record snapshots and return field-level changes.
 */
function diffRecords(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): AuditChange[] {
  const changes: AuditChange[] = [];

  for (const key of Object.keys(after)) {
    if (SKIP_FIELDS.has(key)) continue;

    const oldVal = before[key];
    const newVal = after[key];

    // Normalize null/undefined for comparison
    const oldNorm = oldVal === undefined ? null : oldVal;
    const newNorm = newVal === undefined ? null : newVal;

    // Deep-equal for objects (jsonb fields like health_rating)
    const oldStr = JSON.stringify(oldNorm);
    const newStr = JSON.stringify(newNorm);

    if (oldStr !== newStr) {
      changes.push({ field: key, old: oldNorm, new: newNorm });
    }
  }

  return changes;
}

/**
 * Log a dog audit entry. No-op if nothing actually changed.
 */
export async function logDogAudit(
  db: Database,
  opts: {
    clubId: string;
    dogId: string;
    memberId: string;
    action: "update" | "approve" | "reject";
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }
) {
  const changes = diffRecords(opts.before, opts.after);

  if (changes.length === 0) return;

  await db.insert(dogAuditLogs).values({
    club_id: opts.clubId,
    dog_id: opts.dogId,
    member_id: opts.memberId,
    action: opts.action,
    changes,
  });
}
