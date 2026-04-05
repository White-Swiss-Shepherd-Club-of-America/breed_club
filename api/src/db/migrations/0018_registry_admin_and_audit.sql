-- Add registry admin flag to members
ALTER TABLE "members" ADD COLUMN "can_manage_registry" boolean NOT NULL DEFAULT false;

-- Backfill: grant registry management to existing clearance approvers
UPDATE "members" SET "can_manage_registry" = true WHERE "can_approve_clearances" = true;

-- Audit log for dog record changes
CREATE TABLE "dog_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_id" uuid NOT NULL REFERENCES "clubs"("id"),
  "dog_id" uuid NOT NULL REFERENCES "dogs"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "members"("id"),
  "action" varchar(30) NOT NULL,
  "changes" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "idx_dog_audit_dog" ON "dog_audit_logs" ("dog_id");
CREATE INDEX "idx_dog_audit_member" ON "dog_audit_logs" ("member_id");
CREATE INDEX "idx_dog_audit_created" ON "dog_audit_logs" ("club_id", "created_at" DESC);
