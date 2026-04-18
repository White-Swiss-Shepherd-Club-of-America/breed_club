import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─── Clubs ──────────────────────────────────────────────────────────────────

export const clubs = pgTable("clubs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  breed_name: varchar("breed_name", { length: 255 }).notNull(),
  logo_url: varchar("logo_url", { length: 500 }),
  primary_color: varchar("primary_color", { length: 7 }).default("#655e7a"),
  secondary_color: varchar("secondary_color", { length: 7 }).default("#ffffff"),
  settings: jsonb("settings").default({}).$type<Record<string, unknown>>(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Contacts ───────────────────────────────────────────────────────────────

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    club_id: uuid("club_id")
      .notNull()
      .references(() => clubs.id),
    full_name: varchar("full_name", { length: 255 }).notNull(),
    kennel_name: varchar("kennel_name", { length: 255 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    city: varchar("city", { length: 100 }),
    state: varchar("state", { length: 50 }),
    country: varchar("country", { length: 2 }),
    website_url: varchar("website_url", { length: 500 }),
    member_id: uuid("member_id"), // FK added after members table
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_contacts_club").on(t.club_id),
    index("idx_contacts_member").on(t.member_id),
    index("idx_contacts_name").on(t.club_id, t.full_name),
  ]
);

// ─── Members ────────────────────────────────────────────────────────────────

export const members = pgTable(
  "members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    club_id: uuid("club_id")
      .notNull()
      .references(() => clubs.id),
    clerk_user_id: varchar("clerk_user_id", { length: 255 }).notNull(),
    contact_id: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    tier: varchar("tier", { length: 20 }).notNull().default("non_member"),
    membership_status: varchar("membership_status", { length: 20 }).notNull().default("pending"),
    membership_type: varchar("membership_type", { length: 50 }),
    membership_expires: timestamp("membership_expires", { withTimezone: true }),
    is_breeder: boolean("is_breeder").notNull().default(false),
    can_approve_members: boolean("can_approve_members").notNull().default(false),
    can_approve_clearances: boolean("can_approve_clearances").notNull().default(false),
    can_manage_registry: boolean("can_manage_registry").notNull().default(false),
    show_in_directory: boolean("show_in_directory").notNull().default(true),
    verified_breeder: boolean("verified_breeder").notNull().default(false),
    logo_url: varchar("logo_url", { length: 500 }),
    banner_url: varchar("banner_url", { length: 500 }),
    primary_color: varchar("primary_color", { length: 7 }),
    accent_color: varchar("accent_color", { length: 7 }),
    pup_status: varchar("pup_status", { length: 20 }),
    pup_expected_date: date("pup_expected_date"),
    skip_fees: boolean("skip_fees").notNull().default(false),
    is_admin: boolean("is_admin").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_members_club_clerk").on(t.club_id, t.clerk_user_id),
    index("idx_members_club_tier").on(t.club_id, t.tier),
    index("idx_members_contact").on(t.contact_id),
  ]
);

// ─── Membership Applications ────────────────────────────────────────────────

export const membershipApplications = pgTable(
  "membership_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    club_id: uuid("club_id")
      .notNull()
      .references(() => clubs.id),
    applicant_email: varchar("applicant_email", { length: 255 }).notNull(),
    applicant_name: varchar("applicant_name", { length: 255 }).notNull(),
    applicant_phone: varchar("applicant_phone", { length: 50 }),
    applicant_address: text("applicant_address"),
    membership_type: varchar("membership_type", { length: 50 }).notNull(),
    notes: text("notes"),
    form_data: jsonb("form_data").$type<FormDataEntry[]>(),
    status: varchar("status", { length: 20 }).notNull().default("submitted"),
    review_notes: text("review_notes"),
    reviewed_by: uuid("reviewed_by").references(() => members.id),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    member_id: uuid("member_id").references(() => members.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_applications_club_status").on(t.club_id, t.status)]
);

// ─── Membership Form Fields ────────────────────────────────────────────────

export type FormDataEntry = {
  field_key: string;
  label: string;
  field_type: string;
  value: string | string[] | boolean | null;
};

export const membershipFormFields = pgTable(
  "membership_form_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    club_id: uuid("club_id")
      .notNull()
      .references(() => clubs.id),
    field_key: varchar("field_key", { length: 100 }).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    description: text("description"),
    field_type: varchar("field_type", { length: 30 }).notNull(),
    options: jsonb("options").$type<string[]>(),
    required: boolean("required").notNull().default(false),
    sort_order: integer("sort_order").notNull().default(0),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_form_fields_club_key").on(t.club_id, t.field_key),
    index("idx_form_fields_club_active").on(t.club_id, t.is_active),
  ]
);

// ─── Organizations ──────────────────────────────────────────────────────────

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    club_id: uuid("club_id")
      .notNull()
      .references(() => clubs.id),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 30 }).notNull(),
    country: varchar("country", { length: 2 }),
    website_url: varchar("website_url", { length: 500 }),
    description: text("description"),
    is_active: boolean("is_active").notNull().default(true),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_organizations_club").on(t.club_id)]
);

// ─── Dogs ───────────────────────────────────────────────────────────────────

export const dogs = pgTable(
  "dogs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    club_id: uuid("club_id")
      .notNull()
      .references(() => clubs.id),
    registered_name: varchar("registered_name", { length: 255 }).notNull(),
    call_name: varchar("call_name", { length: 100 }),
    sex: varchar("sex", { length: 10 }),
    date_of_birth: date("date_of_birth"),
    date_of_death: date("date_of_death"),
    color: varchar("color", { length: 100 }),
    coat_type: varchar("coat_type", { length: 50 }),
    sire_id: uuid("sire_id"), // self-ref, FK added via raw SQL or relations
    dam_id: uuid("dam_id"),
    owner_id: uuid("owner_id").references(() => contacts.id),
    breeder_id: uuid("breeder_id").references(() => contacts.id),
    photo_url: varchar("photo_url", { length: 500 }),
    notes: text("notes"),
    is_public: boolean("is_public").notNull().default(false),
    is_historical: boolean("is_historical").notNull().default(false),
    is_deceased: boolean("is_deceased").notNull().default(false),
    breeding_status: varchar("breeding_status", { length: 20 }).notNull().default("not_published"),
    stud_service_available: boolean("stud_service_available").notNull().default(false),
    frozen_semen_available: boolean("frozen_semen_available").notNull().default(false),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    health_rating: jsonb("health_rating").$type<HealthRating | null>(),
    submitted_by: uuid("submitted_by").references(() => members.id),
    approved_by: uuid("approved_by").references(() => members.id),
    approved_at: timestamp("approved_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_dogs_club").on(t.club_id),
    index("idx_dogs_owner").on(t.owner_id),
    index("idx_dogs_breeder").on(t.breeder_id),
    index("idx_dogs_sire").on(t.sire_id),
    index("idx_dogs_dam").on(t.dam_id),
    index("idx_dogs_status").on(t.club_id, t.status),
  ]
);

// ─── Dog Ownership Transfers ────────────────────────────────────────────────

export const dogOwnershipTransfers = pgTable(
  "dog_ownership_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dog_id: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    from_owner_id: uuid("from_owner_id").references(() => contacts.id),
    to_owner_id: uuid("to_owner_id")
      .notNull()
      .references(() => contacts.id),
    requested_by: uuid("requested_by")
      .notNull()
      .references(() => members.id),
    approved_by: uuid("approved_by").references(() => members.id),
    approved_at: timestamp("approved_at", { withTimezone: true }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    reason: varchar("reason", { length: 100 }),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_ownership_transfers_dog").on(t.dog_id),
    index("idx_ownership_transfers_status").on(t.status),
  ]
);

// ─── Dog Registrations ──────────────────────────────────────────────────────

export const dogRegistrations = pgTable(
  "dog_registrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dog_id: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    registration_number: varchar("registration_number", { length: 100 }).notNull(),
    registration_url: varchar("registration_url", { length: 500 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("idx_dog_registrations_unique").on(t.dog_id, t.organization_id)]
);

// ─── Dog Microchips ────────────────────────────────────────────────────────

export const dogMicrochips = pgTable(
  "dog_microchips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dog_id: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    microchip_number: varchar("microchip_number", { length: 50 }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_dog_microchips_dog").on(t.dog_id),
    uniqueIndex("idx_dog_microchips_unique").on(t.dog_id, t.microchip_number),
  ]
);

// ─── Health Test Types ──────────────────────────────────────────────────────

export const healthTestTypes = pgTable(
  "health_test_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    club_id: uuid("club_id")
      .notNull()
      .references(() => clubs.id),
    name: varchar("name", { length: 255 }).notNull(),
    short_name: varchar("short_name", { length: 50 }).notNull(),
    category: varchar("category", { length: 30 }).notNull(),
    result_options: jsonb("result_options").notNull().$type<string[]>(),
    is_required: boolean("is_required").notNull().default(false),
    rating_category: varchar("rating_category", { length: 30 }),
    description: text("description"),
    sort_order: integer("sort_order").notNull().default(0),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_health_test_types_club").on(t.club_id)]
);

// ─── Health Test Type ↔ Organizations (join table) ──────────────────────────

export const healthTestTypeOrgs = pgTable(
  "health_test_type_orgs",
  {
    health_test_type_id: uuid("health_test_type_id")
      .notNull()
      .references(() => healthTestTypes.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    result_schema: jsonb("result_schema").$type<ResultSchema | null>(),
    confidence: integer("confidence"), // 1-10 scale, how reliable is this test method
    thresholds: jsonb("thresholds").$type<RatingThresholds | null>(),
  },
  (t) => [primaryKey({ columns: [t.health_test_type_id, t.organization_id] })]
);

// ─── Result Schema Types ────────────────────────────────────────────────────

// Score config types — define how result values map to 0-100 scores

export type ScoreConfigEnum = {
  score_map: Record<string, number>; // option string → 0-100
};

export type ScoreConfigNumericLR = {
  field: string; // which field key to score on
  ranges: Array<{ max: number; score: number }>; // sorted ascending by max
};

export type ScoreConfigPointScoreLR = {
  ranges: Array<{ max: number; score: number }>; // per-side total → score
};

export type ScoreConfigElbowLR = {
  score_map: Record<string, number>; // grade string → 0-100
};

export type ResultSchemaEnum = {
  type: "enum";
  options: string[];
  score_config?: ScoreConfigEnum;
};

export type ResultSchemaNumericLR = {
  type: "numeric_lr";
  fields: { label: string; key: string; unit?: string; min?: number; max?: number; step?: number }[];
  score_config?: ScoreConfigNumericLR;
};

export type ResultSchemaPointScoreLR = {
  type: "point_score_lr";
  subcategories: { label: string; key: string; max: number }[];
  score_config?: ScoreConfigPointScoreLR;
};

export type ResultSchemaElbowLR = {
  type: "elbow_lr";
  score_config?: ScoreConfigElbowLR;
};

export type ResultSchemaEnumLR = {
  type: "enum_lr";
  options: string[];
  score_config?: ScoreConfigEnum;
};

export type ResultSchema =
  | ResultSchemaEnum
  | ResultSchemaNumericLR
  | ResultSchemaPointScoreLR
  | ResultSchemaElbowLR
  | ResultSchemaEnumLR;

// ─── Rating Thresholds ───────────────────────────────────────────────────────

// Defines how 0-100 scores map to rating levels per test+org combo
export type RatingThresholds = {
  auto_dq: number; // score <= this → Red (disqualified)
  poor: number; // score <= this → Orange
  fair: number; // score <= this → Yellow
  good: number; // score <= this → Green
  // score > good → Blue (excellent)
};

// ─── Cached Health Rating ────────────────────────────────────────────────────

export type HealthRatingColor = "red" | "orange" | "yellow" | "green" | "blue";

export type HealthRating = {
  color: HealthRatingColor;
  score: number; // 0-100 weighted score
  saturation: number; // 0-100 testing completeness %
  computed_at: string; // ISO timestamp
  required_complete: boolean; // all is_required tests have approved clearances
  auto_dq: boolean; // any test hit auto_dq threshold
  category_scores: Record<string, { color: HealthRatingColor; score: number; test_count: number }>;
  cert_version_id: string | null; // which cert version was used for evaluation
  cert_version_name: string | null; // human-readable version name
};

// ─── Dog Health Clearances ──────────────────────────────────────────────────

export const dogHealthClearances = pgTable(
  "dog_health_clearances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dog_id: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    health_test_type_id: uuid("health_test_type_id")
      .notNull()
      .references(() => healthTestTypes.id),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    result: varchar("result", { length: 100 }).notNull(),
    result_data: jsonb("result_data").$type<Record<string, unknown> | null>(),
    result_detail: text("result_detail"),
    result_score: integer("result_score"), // 0-100, for single-result tests (enum)
    result_score_left: integer("result_score_left"), // 0-100, for bilateral tests (L/R)
    result_score_right: integer("result_score_right"), // 0-100, for bilateral tests (L/R)
    test_date: date("test_date").notNull(),
    expiration_date: date("expiration_date"),
    // For final OFA results; null for preliminary results (no OFA number issued yet)
    certificate_number: varchar("certificate_number", { length: 100 }),
    certificate_url: varchar("certificate_url", { length: 500 }),
    // Flags this as an OFA Preliminary (Consultation) result — not yet certified, not counted in health rating
    is_preliminary: boolean("is_preliminary").notNull().default(false),
    // OFA application number from preliminary reports (distinct from the final OFA certificate number)
    application_number: varchar("application_number", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    submitted_by: uuid("submitted_by").references(() => members.id),
    verified_by: uuid("verified_by").references(() => members.id),
    verified_at: timestamp("verified_at", { withTimezone: true }),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Include is_preliminary so a prelim and a final can coexist for the same dog/test/org/date
    uniqueIndex("idx_clearances_dog_test_org_date").on(t.dog_id, t.health_test_type_id, t.organization_id, t.test_date, t.is_preliminary),
    index("idx_clearances_status").on(t.status),
  ]
);

// ─── Health Conditions ──────────────────────────────────────────────────────

export const healthConditions = pgTable(
  "health_conditions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dog_id: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    condition_name: varchar("condition_name", { length: 255 }).notNull(),
    category: varchar("category", { length: 30 }),
    diagnosis_date: date("diagnosis_date"),
    resolved_date: date("resolved_date"),
    severity: varchar("severity", { length: 20 }),
    notes: text("notes"),
    reported_by: uuid("reported_by").references(() => members.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_health_conditions_dog").on(t.dog_id)]
);

// ─── Litters ────────────────────────────────────────────────────────────────

export const litters = pgTable(
  "litters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    club_id: uuid("club_id")
      .notNull()
      .references(() => clubs.id),
    sire_id: uuid("sire_id").references(() => dogs.id),
    dam_id: uuid("dam_id").references(() => dogs.id),
    breeder_id: uuid("breeder_id")
      .notNull()
      .references(() => contacts.id),
    whelp_date: date("whelp_date"),
    litter_name: varchar("litter_name", { length: 100 }),
    num_males: integer("num_males"),
    num_females: integer("num_females"),
    approved: boolean("approved").notNull().default(false),
    approved_by: uuid("approved_by").references(() => members.id),
    approved_at: timestamp("approved_at", { withTimezone: true }),
    sire_approval_status: varchar("sire_approval_status", { length: 20 }).notNull().default("not_required"),
    sire_approval_by: uuid("sire_approval_by").references(() => members.id),
    sire_approval_at: timestamp("sire_approval_at", { withTimezone: true }),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_litters_club").on(t.club_id),
    index("idx_litters_breeder").on(t.breeder_id),
  ]
);

// ─── Litter Pups ────────────────────────────────────────────────────────────

export const litterPups = pgTable(
  "litter_pups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    litter_id: uuid("litter_id")
      .notNull()
      .references(() => litters.id, { onDelete: "cascade" }),
    call_name: varchar("call_name", { length: 100 }),
    sex: varchar("sex", { length: 10 }),
    color: varchar("color", { length: 100 }),
    coat_type: varchar("coat_type", { length: 50 }),
    status: varchar("status", { length: 20 }).notNull().default("available"),
    dog_id: uuid("dog_id").references(() => dogs.id),
    buyer_contact_id: uuid("buyer_contact_id").references(() => contacts.id),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_litter_pups_litter").on(t.litter_id)]
);

// ─── Payments ───────────────────────────────────────────────────────────────

// ─── Health Rating Config ────────────────────────────────────────────────────

export type ScoreThresholds = {
  red: number; // overall score <= this → Red
  orange: number; // overall score <= this → Orange
  yellow: number; // overall score <= this → Yellow
  green: number; // overall score <= this → Green
  // overall score > green → Blue
};

export const healthRatingConfigs = pgTable("health_rating_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  club_id: uuid("club_id")
    .notNull()
    .references(() => clubs.id)
    .unique(),
  category_weights: jsonb("category_weights").notNull().$type<Record<string, number>>(),
  // e.g. { hips: 20, genetics: 20, elbows: 15, vision: 12, spine: 10, cardiac: 8, patella: 5, dentition: 3, temperament: 5, other: 2 }
  critical_categories: jsonb("critical_categories").notNull().$type<string[]>(),
  // e.g. ["hips", "genetics", "elbows"]
  score_thresholds: jsonb("score_thresholds").notNull().$type<ScoreThresholds>(),
  // overall weighted score → color mapping
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Health Cert Versions ────────────────────────────────────────────────────

export const healthCertVersions = pgTable(
  "health_cert_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    club_id: uuid("club_id")
      .notNull()
      .references(() => clubs.id),
    version_name: varchar("version_name", { length: 100 }).notNull(),
    effective_date: date("effective_date").notNull(),
    required_test_type_ids: jsonb("required_test_type_ids").notNull().$type<string[]>(),
    category_weights: jsonb("category_weights").notNull().$type<Record<string, number>>(),
    critical_categories: jsonb("critical_categories").notNull().$type<string[]>(),
    score_thresholds: jsonb("score_thresholds").notNull().$type<ScoreThresholds>(),
    notes: text("notes"),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_cert_versions_club_date").on(t.club_id, t.effective_date),
  ]
);

// ─── Health Statistics Cache ─────────────────────────────────────────────────

export const healthStatisticsCache = pgTable("health_statistics_cache", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").notNull(),
  computed_at: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Member Health Stats Cache ───────────────────────────────────────────────

export const memberHealthStatsCache = pgTable(
  "member_health_stats_cache",
  {
    member_id: uuid("member_id")
      .primaryKey()
      .references(() => members.id, { onDelete: "cascade" }),
    data: jsonb("data").notNull(),
    computed_at: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_member_health_stats_member").on(t.member_id)]
);

// ─── Member Invitations ──────────────────────────────────────────────────────

export const memberInvitations = pgTable(
  "member_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    club_id: uuid("club_id")
      .notNull()
      .references(() => clubs.id),
    token: varchar("token", { length: 64 }).notNull().unique(),
    email: varchar("email", { length: 255 }).notNull(),
    tier: varchar("tier", { length: 20 }).notNull().default("member"),
    invited_by: uuid("invited_by")
      .notNull()
      .references(() => members.id),
    application_id: uuid("application_id").references(() => membershipApplications.id),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    accepted_at: timestamp("accepted_at", { withTimezone: true }),
    accepted_by: uuid("accepted_by").references(() => members.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_member_invitations_token").on(t.token),
    index("idx_member_invitations_club_status").on(t.club_id, t.status),
    index("idx_member_invitations_email").on(t.club_id, t.email),
  ]
);

// ─── Payments ───────────────────────────────────────────────────────────────

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    club_id: uuid("club_id")
      .notNull()
      .references(() => clubs.id),
    member_id: uuid("member_id")
      .notNull()
      .references(() => members.id),
    stripe_payment_intent_id: varchar("stripe_payment_intent_id", { length: 255 }),
    amount_cents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("usd"),
    description: varchar("description", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    metadata: jsonb("metadata").default({}).$type<Record<string, unknown>>(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_payments_club_member").on(t.club_id, t.member_id)]
);

// ─── Membership Tiers ─────────────────────────────────────────────────────

export const membershipTiers = pgTable(
  "membership_tiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    club_id: uuid("club_id")
      .notNull()
      .references(() => clubs.id),
    slug: varchar("slug", { length: 50 }).notNull(),
    label: varchar("label", { length: 100 }).notNull(),
    level: integer("level").notNull(),
    color: varchar("color", { length: 7 }),
    is_system: boolean("is_system").notNull().default(false),
    is_default: boolean("is_default").notNull().default(false),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_membership_tiers_club_slug").on(t.club_id, t.slug),
    uniqueIndex("idx_membership_tiers_club_level").on(t.club_id, t.level),
    index("idx_membership_tiers_club").on(t.club_id),
  ]
);

// ─── Voting Tiers ──────────────────────────────────────────────────────────

export const votingTiers = pgTable(
  "voting_tiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    club_id: uuid("club_id")
      .notNull()
      .references(() => clubs.id),
    name: varchar("name", { length: 100 }).notNull(),
    points: integer("points").notNull().default(1),
    membership_tier_id: uuid("membership_tier_id").references(() => membershipTiers.id, { onDelete: "set null" }),
    sort_order: integer("sort_order").notNull().default(0),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_voting_tiers_club_name").on(t.club_id, t.name),
    index("idx_voting_tiers_club").on(t.club_id),
    index("idx_voting_tiers_membership_tier").on(t.membership_tier_id),
  ]
);

// ─── Member Voting Tiers ───────────────────────────────────────────────────

export const memberVotingTiers = pgTable(
  "member_voting_tiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    member_id: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    voting_tier_id: uuid("voting_tier_id")
      .notNull()
      .references(() => votingTiers.id),
    assigned_at: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
    assigned_by: uuid("assigned_by").references(() => members.id),
  },
  (t) => [
    uniqueIndex("idx_member_voting_tiers_member").on(t.member_id),
    index("idx_member_voting_tiers_tier").on(t.voting_tier_id),
  ]
);

// ─── Elections ─────────────────────────────────────────────────────────────

export const elections = pgTable(
  "elections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    club_id: uuid("club_id")
      .notNull()
      .references(() => clubs.id),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    starts_at: timestamp("starts_at", { withTimezone: true }).notNull(),
    ends_at: timestamp("ends_at", { withTimezone: true }).notNull(),
    results_visible: boolean("results_visible").notNull().default(false),
    created_by: uuid("created_by").references(() => members.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_elections_club").on(t.club_id),
    index("idx_elections_club_dates").on(t.club_id, t.starts_at, t.ends_at),
  ]
);

// ─── Vote Questions ────────────────────────────────────────────────────────

export const voteQuestions = pgTable(
  "vote_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    election_id: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    question_type: varchar("question_type", { length: 20 }).notNull(), // "yes_no" | "multiple_choice"
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_vote_questions_election").on(t.election_id)]
);

// ─── Vote Options ──────────────────────────────────────────────────────────

export const voteOptions = pgTable(
  "vote_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    question_id: uuid("question_id")
      .notNull()
      .references(() => voteQuestions.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 255 }).notNull(),
    sort_order: integer("sort_order").notNull().default(0),
  },
  (t) => [index("idx_vote_options_question").on(t.question_id)]
);

// ─── Vote Records (Anonymous) ──────────────────────────────────────────────
// CRITICAL: No member_id — this table stores WHAT was voted, not WHO voted.

export const voteRecords = pgTable(
  "vote_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    question_id: uuid("question_id")
      .notNull()
      .references(() => voteQuestions.id, { onDelete: "cascade" }),
    option_id: uuid("option_id")
      .notNull()
      .references(() => voteOptions.id, { onDelete: "cascade" }),
    points: integer("points").notNull(),
    cast_at: timestamp("cast_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_vote_records_question").on(t.question_id),
    index("idx_vote_records_option").on(t.option_id),
  ]
);

// ─── Vote Participation ────────────────────────────────────────────────────
// CRITICAL: No option_id, no points — this table stores WHO voted, not WHAT.

export const voteParticipation = pgTable(
  "vote_participation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    question_id: uuid("question_id")
      .notNull()
      .references(() => voteQuestions.id, { onDelete: "cascade" }),
    member_id: uuid("member_id")
      .notNull()
      .references(() => members.id),
    voted_at: timestamp("voted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_vote_participation_unique").on(t.question_id, t.member_id),
    index("idx_vote_participation_member").on(t.member_id),
  ]
);

// ─── Dog Audit Logs ───────────────────────────────────────────────────────

export const dogAuditLogs = pgTable(
  "dog_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    club_id: uuid("club_id")
      .notNull()
      .references(() => clubs.id),
    dog_id: uuid("dog_id")
      .references(() => dogs.id, { onDelete: "set null" }),
    member_id: uuid("member_id")
      .notNull()
      .references(() => members.id),
    action: varchar("action", { length: 30 }).notNull(),
    changes: jsonb("changes").notNull().$type<{ field: string; old: unknown; new: unknown }[]>(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_dog_audit_dog").on(t.dog_id),
    index("idx_dog_audit_member").on(t.member_id),
    index("idx_dog_audit_created").on(t.club_id, t.created_at),
  ]
);
