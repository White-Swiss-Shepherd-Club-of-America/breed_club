/**
 * Shared Zod validation schemas used by both frontend forms and API routes.
 */

import { z } from "zod";
import { SYSTEM_LEVELS } from "./roles.js";

// --- Common ---

export const uuidSchema = z.string().uuid();

// --- Contacts ---

export const createContactSchema = z.object({
  full_name: z.string().min(1).max(255),
  kennel_name: z.string().max(255).nullish(),
  email: z.string().email().nullish(),
  phone: z.string().max(50).nullish(),
  city: z.string().max(100).nullish(),
  state: z.string().max(50).nullish(),
  country: z.string().max(2).nullish(),
  website_url: z.string().url().nullish(),
});

export const updateContactSchema = createContactSchema.partial();

// --- Breeder Preferences ---

export const updateBreederPrefsSchema = z.object({
  kennel_name: z.string().max(255).nullish(),
  website_url: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().url().nullish()
  ),
  logo_url: z.string().max(500).nullish(),
  banner_url: z.string().max(500).nullish(),
  primary_color: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color").nullish()
  ),
  accent_color: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color").nullish()
  ),
  pup_status: z.enum(["available", "expected", "none"]).nullish(),
  pup_expected_date: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().date().nullish()
  ),
  show_in_directory: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.pup_status === "expected") return !!data.pup_expected_date;
    return true;
  },
  { message: "Expected date is required when status is 'expected'", path: ["pup_expected_date"] }
);

// --- Dogs ---

/** Parent ref: either an existing dog UUID or a new dog to create by name. */
export const parentRefSchema = z.union([
  uuidSchema,
  z.object({ registered_name: z.string().min(1).max(255) }),
]).nullish();

/** Full 3-generation pedigree tree for dog create/update. */
export const pedigreeTreeSchema = z.object({
  sire: parentRefSchema,
  dam: parentRefSchema,
  sire_sire: parentRefSchema,
  sire_dam: parentRefSchema,
  dam_sire: parentRefSchema,
  dam_dam: parentRefSchema,
  sire_sire_sire: parentRefSchema,
  sire_sire_dam: parentRefSchema,
  sire_dam_sire: parentRefSchema,
  sire_dam_dam: parentRefSchema,
  dam_sire_sire: parentRefSchema,
  dam_sire_dam: parentRefSchema,
  dam_dam_sire: parentRefSchema,
  dam_dam_dam: parentRefSchema,
}).optional();

export const createDogSchema = z.object({
  registered_name: z.string().min(1).max(255),
  call_name: z.string().max(100).nullish(),
  sex: z.enum(["male", "female"]).nullish(),
  date_of_birth: z.string().date().nullish(),
  date_of_death: z.string().date().nullish(),
  color: z.string().max(100).nullish(),
  coat_type: z.string().max(50).nullish(),
  notes: z.string().max(5000).nullish(),
  photo_url: z.string().max(500).nullish(),
  sire_id: parentRefSchema,
  dam_id: parentRefSchema,
  pedigree: pedigreeTreeSchema,
  owner_id: uuidSchema.nullish(),
  breeder_id: uuidSchema.nullish(),
  is_public: z.boolean().default(false),
  is_historical: z.boolean().default(false),
  is_deceased: z.boolean().default(false),
  // Inline microchips for convenience
  microchips: z
    .array(z.string().min(1).max(50))
    .optional(),
  // Inline registrations for convenience
  registrations: z
    .array(
      z.object({
        organization_id: uuidSchema,
        registration_number: z.string().min(1).max(100),
        registration_url: z.string().max(500).nullish(),
      })
    )
    .optional(),
});

export const updateDogSchema = createDogSchema.partial();

// --- Dog Registrations ---

export const createDogRegistrationSchema = z.object({
  organization_id: uuidSchema,
  registration_number: z.string().min(1).max(100),
  registration_url: z.string().max(500).nullish(),
});

// --- Health Clearances ---

export const createHealthClearanceSchema = z.object({
  health_test_type_id: uuidSchema,
  organization_id: uuidSchema,
  result: z.string().min(1).max(100),
  result_data: z.record(z.unknown()).nullish(),
  result_detail: z.string().max(1000).nullish(),
  test_date: z.string().date(),
  expiration_date: z.string().date().nullish(),
  certificate_number: z.string().max(100).nullish(),
  notes: z.string().max(2000).nullish(),
});

export const updateHealthClearanceSchema = createHealthClearanceSchema.partial();

// --- Health Conditions ---

export const createHealthConditionSchema = z.object({
  condition_name: z.string().min(1).max(255),
  category: z
    .enum(["orthopedic", "cardiac", "genetic", "vision", "thyroid", "dental", "other"])
    .nullish(),
  diagnosis_date: z.string().date().nullish(),
  resolved_date: z.string().date().nullish(),
  severity: z.enum(["mild", "moderate", "severe"]).nullish(),
  notes: z.string().max(2000).nullish(),
});

export const updateHealthConditionSchema = createHealthConditionSchema.partial();

// --- Breeding Metadata ---

export const updateBreedingMetadataSchema = z.object({
  breeding_status: z.enum(["not_published", "altered", "retired", "breeding"]).optional(),
  stud_service_available: z.boolean().optional(),
  frozen_semen_available: z.boolean().optional(),
});

// --- Membership Applications ---

export const formDataEntrySchema = z.object({
  field_key: z.string().min(1),
  label: z.string().min(1),
  field_type: z.string().min(1),
  value: z.union([z.string(), z.array(z.string()), z.boolean(), z.null()]),
});

export const createApplicationSchema = z.object({
  applicant_name: z.string().min(1).max(255),
  applicant_email: z.string().email(),
  applicant_phone: z.string().max(50).nullish(),
  applicant_address: z.string().max(500).nullish(),
  membership_type: z.string().min(1).max(50),
  notes: z.string().max(2000).nullish(),
  form_data: z.array(formDataEntrySchema).nullish(),
});

export const publicApplicationSchema = createApplicationSchema.extend({
  recaptcha_token: z.string().min(1, "reCAPTCHA verification required").optional(),
});

// --- Membership Form Fields (admin) ---

export const formFieldTypeSchema = z.enum([
  "text", "textarea", "email", "phone", "select", "checkbox", "radio", "number", "date",
]);

export const createFormFieldSchema = z.object({
  field_key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Must be lowercase alphanumeric with underscores"),
  label: z.string().min(1).max(255),
  description: z.string().max(1000).nullish(),
  field_type: formFieldTypeSchema,
  options: z.array(z.string().min(1)).nullish(),
  required: z.boolean().default(false),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
}).refine(
  (data) => {
    if (["select", "radio"].includes(data.field_type)) {
      return data.options && data.options.length > 0;
    }
    return true;
  },
  { message: "Select and radio fields require at least one option", path: ["options"] }
);

export const updateFormFieldSchema = z.object({
  label: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullish(),
  field_type: formFieldTypeSchema.optional(),
  options: z.array(z.string().min(1)).nullish(),
  required: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

export const reorderFormFieldsSchema = z.object({
  field_ids: z.array(z.string().uuid()),
});

// --- Members (admin update) ---

export const updateMemberSchema = z.object({
  tier: z.string().max(50).optional(),
  membership_status: z.enum(["pending", "active", "expired", "suspended"]).optional(),
  membership_type: z.string().max(50).nullish(),
  membership_expires: z.string().datetime().nullish(),
  is_breeder: z.boolean().optional(),
  can_approve_members: z.boolean().optional(),
  can_approve_clearances: z.boolean().optional(),
  can_manage_registry: z.boolean().optional(),
  can_approve_ads: z.boolean().optional(),
  show_in_directory: z.boolean().optional(),
  verified_breeder: z.boolean().optional(),
  skip_fees: z.boolean().optional(),
  is_admin: z.boolean().optional(),
});

// --- Organizations (admin) ---

export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["kennel_club", "health_testing", "grading_body", "pedigree_database"]),
  country: z.string().max(2).nullish(),
  website_url: z.string().url().nullish(),
  description: z.string().max(1000).nullish(),
  sort_order: z.number().int().default(0),
});

// --- Health Test Types (admin) ---

const scoreRangeSchema = z.object({
  max: z.number(),
  score: z.number().int().min(0).max(100),
});

const resultSchemaValidator = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("enum"),
    options: z.array(z.string().min(1)).min(1),
    score_config: z.object({
      score_map: z.record(z.string(), z.number().int().min(0).max(100)),
    }).optional(),
  }),
  z.object({
    type: z.literal("numeric_lr"),
    fields: z.array(z.object({
      label: z.string().min(1),
      key: z.string().min(1),
      unit: z.string().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      step: z.number().optional(),
    })).min(1),
    score_config: z.object({
      field: z.string().min(1),
      ranges: z.array(scoreRangeSchema).min(1),
    }).optional(),
  }),
  z.object({
    type: z.literal("point_score_lr"),
    subcategories: z.array(z.object({
      label: z.string().min(1),
      key: z.string().min(1),
      max: z.number().int().min(1),
    })).min(1),
    score_config: z.object({
      ranges: z.array(scoreRangeSchema).min(1),
    }).optional(),
  }),
  z.object({
    type: z.literal("elbow_lr"),
    score_config: z.object({
      score_map: z.record(z.string(), z.number().int().min(0).max(100)),
    }).optional(),
  }),
  z.object({
    type: z.literal("enum_lr"),
    options: z.array(z.string().min(1)).min(1),
    score_config: z.object({
      score_map: z.record(z.string(), z.number().int().min(0).max(100)),
    }).optional(),
  }),
]);

export { resultSchemaValidator };

export const createHealthTestTypeSchema = z.object({
  name: z.string().min(1).max(255),
  short_name: z.string().min(1).max(50),
  category: z.enum(["orthopedic", "cardiac", "genetic", "vision", "thyroid", "dental", "other"]),
  result_options: z.array(z.string().min(1)).min(1),
  is_required: z.boolean().default(false),
  rating_category: z.string().max(30).nullish(),
  description: z.string().max(2000).nullish(),
  sort_order: z.number().int().default(0),
  grading_org_ids: z.array(uuidSchema).optional(),
  grading_orgs: z.array(z.object({
    organization_id: uuidSchema,
    result_schema: resultSchemaValidator.nullish(),
    confidence: z.number().int().min(1).max(10).nullish(),
    thresholds: z.object({
      auto_dq: z.number().int().min(0).max(100),
      poor: z.number().int().min(0).max(100),
      fair: z.number().int().min(0).max(100),
      good: z.number().int().min(0).max(100),
    }).nullish(),
  })).optional(),
});

// --- Health Cert Versions (admin) ---

export const scoreThresholdsSchema = z.object({
  red: z.number().int().min(0).max(100),
  orange: z.number().int().min(0).max(100),
  yellow: z.number().int().min(0).max(100),
  green: z.number().int().min(0).max(100),
});

export const createCertVersionSchema = z.object({
  version_name: z.string().min(1).max(100),
  effective_date: z.string().date(),
  required_test_type_ids: z.array(uuidSchema),
  category_weights: z.record(z.string(), z.number().min(0)),
  critical_categories: z.array(z.string()),
  score_thresholds: scoreThresholdsSchema,
  notes: z.string().max(2000).nullish(),
});

export const updateCertVersionSchema = createCertVersionSchema.partial();

// --- Litters ---

export const createLitterSchema = z.object({
  sire_id: uuidSchema.nullish(),
  dam_id: uuidSchema.nullish(),
  whelp_date: z.string().date().nullish(),
  litter_name: z.string().max(100).nullish(),
  num_males: z.number().int().min(0).nullish(),
  num_females: z.number().int().min(0).nullish(),
  notes: z.string().max(2000).nullish(),
});

export const sireApprovalSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  notes: z.string().max(2000).nullish(),
});

// --- Litter Pups ---

export const createLitterPupSchema = z.object({
  call_name: z.string().max(100).nullish(),
  sex: z.enum(["male", "female"]).nullish(),
  color: z.string().max(100).nullish(),
  coat_type: z.string().max(50).nullish(),
  notes: z.string().max(2000).nullish(),
});

export const sellPupSchema = z.object({
  buyer_contact_id: uuidSchema.optional(),
  buyer_email: z.string().email().optional(),
  buyer_name: z.string().min(1).max(255).optional(),
  registered_name: z.string().min(1).max(255),
}).refine(
  (data) => data.buyer_contact_id || (data.buyer_email && data.buyer_name),
  { message: "Provide either buyer_contact_id or both buyer_email and buyer_name" }
);

// --- Ownership Transfers ---

export const transferDogSchema = z.object({
  new_owner_id: uuidSchema,
  reason: z.enum(["sale", "return", "gift", "co_ownership", "other"]).optional(),
  notes: z.string().max(2000).nullish(),
});

// --- Payments ---
//
// Payment metadata is CLIENT-SUPPLIED and is replayed by the Stripe webhook to
// create real resources, so it is a trust boundary. It must be parsed into a
// closed shape before it is persisted: an open `z.record(z.unknown())` let a
// caller override the server's own fields (resource_type, club_id, member_id)
// and buy a 1500¢ resource with a 500¢ payment.

const paymentClearanceItemSchema = z.object({
  health_test_type_id: uuidSchema,
  organization_id: uuidSchema,
  result: z.string().min(1).max(100),
  result_data: z.record(z.unknown()).nullish(),
  result_detail: z.string().max(1000).nullish(),
  test_date: z.string(),
  expiration_date: z.string().nullish(),
  certificate_number: z.string().max(100).nullish(),
  notes: z.string().max(2000).nullish(),
  is_preliminary: z.boolean().optional().default(false),
  application_number: z.string().max(100).nullish(),
});

/** A preliminary result has no official certificate number yet. */
const rejectPrelimWithCertNumber = (
  item: { is_preliminary?: boolean; certificate_number?: string | null },
  ctx: z.RefinementCtx,
  path: (string | number)[]
) => {
  if (item.is_preliminary && item.certificate_number) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Preliminary results cannot have an OFA certificate number",
      path: [...path, "certificate_number"],
    });
  }
};

export const paymentMetadataSchema = z
  .discriminatedUnion("resource_type", [
    createDogSchema.extend({ resource_type: z.literal("dog_create") }),
    paymentClearanceItemSchema.extend({
      resource_type: z.literal("clearance_submit"),
      dog_id: uuidSchema,
      certificate_url: z.string().max(500).nullish(),
    }),
    z.object({
      resource_type: z.literal("clearance_batch_submit"),
      dog_id: uuidSchema,
      certificate_url: z.string().max(500).nullish(),
      clearances: z.array(paymentClearanceItemSchema).min(1).max(20),
    }),
  ])
  .superRefine((meta, ctx) => {
    if (meta.resource_type === "clearance_submit") {
      rejectPrelimWithCertNumber(meta, ctx, []);
    } else if (meta.resource_type === "clearance_batch_submit") {
      meta.clearances.forEach((item, i) => rejectPrelimWithCertNumber(item, ctx, ["clearances", i]));
    }
  });

export type PaymentMetadata = z.infer<typeof paymentMetadataSchema>;
export type PaymentResourceType = PaymentMetadata["resource_type"];

export const createPaymentSessionSchema = z
  .object({
    // Redundant with metadata.resource_type; accepted for backwards
    // compatibility but never trusted — the server reads the discriminant
    // off the parsed metadata it persists.
    resource_type: z
      .enum(["dog_create", "clearance_submit", "clearance_batch_submit"])
      .optional(),
    metadata: paymentMetadataSchema,
    success_url: z.string().url(),
    cancel_url: z.string().url(),
  })
  .refine((body) => !body.resource_type || body.resource_type === body.metadata.resource_type, {
    message: "resource_type must match metadata.resource_type",
    path: ["resource_type"],
  });

// --- Voting Tiers ---

export const createVotingTierSchema = z.object({
  name: z.string().min(1).max(100),
  points: z.number().int().min(1).max(100),
  membership_tier_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

export const updateVotingTierSchema = createVotingTierSchema.partial();

export const assignVotingTierSchema = z.object({
  member_id: uuidSchema,
  voting_tier_id: uuidSchema,
});

export const bulkAssignVotingTierSchema = z.object({
  member_ids: z.array(uuidSchema).min(1),
  voting_tier_id: uuidSchema,
});

// --- Elections ---

const voteOptionInputSchema = z.object({
  label: z.string().min(1).max(255),
  sort_order: z.number().int().default(0),
});

const voteQuestionInputSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).nullish(),
  question_type: z.enum(["yes_no", "multiple_choice"]),
  sort_order: z.number().int().default(0),
  options: z.array(voteOptionInputSchema).optional(),
}).refine(
  (data) => {
    if (data.question_type === "multiple_choice") {
      return data.options && data.options.length >= 2;
    }
    return true;
  },
  { message: "Multiple choice questions require at least 2 options", path: ["options"] }
);

export const createElectionSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).nullish(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  questions: z.array(voteQuestionInputSchema).min(1),
}).refine(
  (data) => new Date(data.ends_at) > new Date(data.starts_at),
  { message: "End date must be after start date", path: ["ends_at"] }
);

export const updateElectionSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullish(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  results_visible: z.boolean().optional(),
});

export const castBallotSchema = z.object({
  // A ballot carries at most one vote per question. A repeated `question_id`
  // is rejected rather than collapsed: silently de-duplicating would hide
  // both the client bug and the ballot-stuffing attempt it looks identical to.
  votes: z
    .array(
      z.object({
        question_id: uuidSchema,
        option_id: uuidSchema,
      })
    )
    .min(1)
    .superRefine((votes, ctx) => {
      const seen = new Set<string>();
      votes.forEach((vote, i) => {
        if (seen.has(vote.question_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate vote for question ${vote.question_id}`,
            path: [i, "question_id"],
          });
          return;
        }
        seen.add(vote.question_id);
      });
    }),
});

// --- Membership Tiers ---

export const createMembershipTierSchema = z.object({
  slug: z.string().min(1).max(50).regex(/^[a-z][a-z0-9_]*$/, "Slug must be lowercase letters, numbers, and underscores"),
  label: z.string().min(1).max(100),
  level: z.number().int().min(0).max(99),
  color: z.string().max(7).nullish(),
  is_default: z.boolean().default(false),
  sort_order: z.number().int().default(0),
});

export const updateMembershipTierSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  level: z.number().int().min(0).max(99).optional(),
  color: z.string().max(7).nullish(),
  is_default: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

// --- Litter Ads ---

export const createLitterAdSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).nullish(),
  image_url: z.string().max(500).nullish(),
  contact_url: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().url().nullish()
  ),
});

export const updateLitterAdSchema = createLitterAdSchema.partial();

export const reviewLitterAdSchema = z.object({
  action: z.enum(["approve", "reject", "request_revision"]),
  revision_notes: z.string().max(2000).nullish(),
}).refine(
  (data) => data.action !== "request_revision" || !!data.revision_notes,
  { message: "revision_notes required when requesting revision", path: ["revision_notes"] }
);

// --- Pagination ---

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().optional(),
});
