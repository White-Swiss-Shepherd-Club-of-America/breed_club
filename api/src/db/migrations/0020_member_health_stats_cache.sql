CREATE TABLE "member_health_stats_cache" (
	"member_id" uuid PRIMARY KEY REFERENCES "members"("id") ON DELETE CASCADE,
	"data" jsonb NOT NULL,
	"computed_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_member_health_stats_member" ON "member_health_stats_cache" USING btree ("member_id");
