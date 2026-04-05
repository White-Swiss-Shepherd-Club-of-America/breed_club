CREATE TABLE "health_statistics_cache" (
	"id" integer PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
	"data" jsonb NOT NULL,
	"computed_at" timestamptz NOT NULL DEFAULT now()
);
