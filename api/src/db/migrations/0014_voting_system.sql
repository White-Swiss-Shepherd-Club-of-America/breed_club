-- Voting system tables

CREATE TABLE IF NOT EXISTS "voting_tiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "club_id" uuid NOT NULL REFERENCES "clubs"("id"),
  "name" varchar(100) NOT NULL,
  "points" integer NOT NULL DEFAULT 1,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_voting_tiers_club_name" ON "voting_tiers" ("club_id", "name");
CREATE INDEX IF NOT EXISTS "idx_voting_tiers_club" ON "voting_tiers" ("club_id");

CREATE TABLE IF NOT EXISTS "member_voting_tiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "voting_tier_id" uuid NOT NULL REFERENCES "voting_tiers"("id"),
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "assigned_by" uuid REFERENCES "members"("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_member_voting_tiers_member" ON "member_voting_tiers" ("member_id");
CREATE INDEX IF NOT EXISTS "idx_member_voting_tiers_tier" ON "member_voting_tiers" ("voting_tier_id");

CREATE TABLE IF NOT EXISTS "elections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "club_id" uuid NOT NULL REFERENCES "clubs"("id"),
  "title" varchar(255) NOT NULL,
  "description" text,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "results_visible" boolean NOT NULL DEFAULT false,
  "created_by" uuid REFERENCES "members"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_elections_club" ON "elections" ("club_id");
CREATE INDEX IF NOT EXISTS "idx_elections_club_dates" ON "elections" ("club_id", "starts_at", "ends_at");

CREATE TABLE IF NOT EXISTS "vote_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "election_id" uuid NOT NULL REFERENCES "elections"("id") ON DELETE CASCADE,
  "title" varchar(500) NOT NULL,
  "description" text,
  "question_type" varchar(20) NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_vote_questions_election" ON "vote_questions" ("election_id");

CREATE TABLE IF NOT EXISTS "vote_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "question_id" uuid NOT NULL REFERENCES "vote_questions"("id") ON DELETE CASCADE,
  "label" varchar(255) NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "idx_vote_options_question" ON "vote_options" ("question_id");

-- Anonymous ballot records — NO member_id column
CREATE TABLE IF NOT EXISTS "vote_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "question_id" uuid NOT NULL REFERENCES "vote_questions"("id") ON DELETE CASCADE,
  "option_id" uuid NOT NULL REFERENCES "vote_options"("id") ON DELETE CASCADE,
  "points" integer NOT NULL,
  "cast_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_vote_records_question" ON "vote_records" ("question_id");
CREATE INDEX IF NOT EXISTS "idx_vote_records_option" ON "vote_records" ("option_id");

-- Participation tracking — NO option_id, NO points columns
CREATE TABLE IF NOT EXISTS "vote_participation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "question_id" uuid NOT NULL REFERENCES "vote_questions"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "members"("id"),
  "voted_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_vote_participation_unique" ON "vote_participation" ("question_id", "member_id");
CREATE INDEX IF NOT EXISTS "idx_vote_participation_member" ON "vote_participation" ("member_id");
