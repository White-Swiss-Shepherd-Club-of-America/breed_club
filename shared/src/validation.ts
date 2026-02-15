/**
 * Shared Zod validation schemas used by both frontend forms and API routes.
 */

import { z } from "zod";
import { TIERS } from "./roles.js";

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

// --- Dogs ---

export const createDogSchema = z.object({
  registered_name: z.string().min(1).max(255),
  call_name: z.string().max(100).nullish(),
  microchip_number: z.string().max(50).nullish(),
  sex: z.enum(["male", "female"]).nullish(),
  date_of_birth: z.string().date().nullish(),
  date_of_death: z.string().date().nullish(),
  color: z.string().max(100).nullish(),
  coat_type: z.string().max(50).nullish(),
  sire_id: uuidSchema.nullish(),
  dam_id: uuidSchema.nullish(),
  owner_id: uuidSchema.nullish(),
  breeder_id: uuidSchema.nullish(),
  is_public: z.boolean().default(false),
  // Inline registrations for convenience
  registrations: z
    .array(
      z.object({
        organization_id: uuidSchema,
        registration_number: z.string().min(1).max(100),
        registration_url: z.string().url().nullish(),
      })
    )
    .optional(),
});

export const updateDogSchema = createDogSchema.partial();

// --- Dog Registrations ---

export const createDogRegistrationSchema = z.object({
  organization_id: uuidSchema,
  registration_number: z.string().min(1).max(100),
  registration_url: z.string().url().nullish(),
});

// --- Health Clearances ---

export const createHealthClearanceSchema = z.object({
  health_test_type_id: uuidSchema,
  organization_id: uuidSchema,
  result: z.string().min(1).max(100),
  result_detail: z.string().max(1000).nullish(),
  test_date: z.string().date().nullish(),
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

// --- Membership Applications ---

export const createApplicationSchema = z.object({
  applicant_name: z.string().min(1).max(255),
  applicant_email: z.string().email(),
  applicant_phone: z.string().max(50).nullish(),
  applicant_address: z.string().max(500).nullish(),
  membership_type: z.string().min(1).max(50),
  notes: z.string().max(2000).nullish(),
});

// --- Members (admin update) ---

export const updateMemberSchema = z.object({
  tier: z.enum(TIERS).optional(),
  membership_status: z.enum(["pending", "active", "expired", "suspended"]).optional(),
  membership_type: z.string().max(50).nullish(),
  membership_expires: z.string().datetime().nullish(),
  is_breeder: z.boolean().optional(),
  can_approve_members: z.boolean().optional(),
  can_approve_clearances: z.boolean().optional(),
  show_in_directory: z.boolean().optional(),
  verified_breeder: z.boolean().optional(),
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

export const createHealthTestTypeSchema = z.object({
  name: z.string().min(1).max(255),
  short_name: z.string().min(1).max(50),
  category: z.enum(["orthopedic", "cardiac", "genetic", "vision", "thyroid", "dental", "other"]),
  result_options: z.array(z.string().min(1)).min(1),
  is_required_for_chic: z.boolean().default(false),
  description: z.string().max(2000).nullish(),
  sort_order: z.number().int().default(0),
  grading_org_ids: z.array(uuidSchema).optional(),
});

// --- Litters ---

export const createLitterSchema = z.object({
  sire_id: uuidSchema.nullish(),
  dam_id: uuidSchema.nullish(),
  whelp_date: z.string().date().nullish(),
  expected_date: z.string().date().nullish(),
  num_puppies_born: z.number().int().min(0).nullish(),
  num_puppies_survived: z.number().int().min(0).nullish(),
  status: z.enum(["planned", "expected", "born", "weaned", "closed"]).default("planned"),
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
  buyer_email: z.string().email(),
  buyer_name: z.string().min(1).max(255),
  registered_name: z.string().min(1).max(255),
});

// --- Payments ---

export const createPaymentSessionSchema = z.object({
  resource_type: z.enum(["dog_create", "clearance_submit"]),
  metadata: z.record(z.unknown()),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});

// --- Pagination ---

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().optional(),
});
