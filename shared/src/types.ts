/**
 * Shared TypeScript types used by both frontend and API.
 */

import type { Tier, PermissionFlags } from "./roles.js";

// --- Enums ---

export type ApprovalStatus = "draft" | "submitted" | "under_review" | "approved" | "rejected" | "needs_revision";
export type DogStatus = "pending" | "approved" | "rejected";
export type MembershipStatus = "pending" | "active" | "expired" | "suspended";
export type SireApprovalStatus = "not_required" | "pending" | "approved" | "rejected";
export type PupStatus = "available" | "reserved" | "sold" | "retained" | "deceased";
export type OrgType = "kennel_club" | "health_testing" | "grading_body" | "pedigree_database";
export type HealthCategory = "orthopedic" | "cardiac" | "genetic" | "vision" | "thyroid" | "dental" | "other";
export type ConditionSeverity = "mild" | "moderate" | "severe";

// --- Score Config Types ---

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

// --- Result Schema Types ---

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

// --- Core Entities ---

export interface Club {
  id: string;
  name: string;
  slug: string;
  breed_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  club_id: string;
  full_name: string;
  kennel_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  website_url: string | null;
  member_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  club_id: string;
  clerk_user_id: string;
  contact_id: string;
  tier: Tier;
  membership_status: MembershipStatus;
  membership_type: string | null;
  membership_expires: string | null;
  is_breeder: boolean;
  can_approve_members: boolean;
  can_approve_clearances: boolean;
  show_in_directory: boolean;
  verified_breeder: boolean;
  logo_url: string | null;
  banner_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  pup_status: "available" | "expected" | "none" | null;
  pup_expected_date: string | null;
  skip_fees: boolean;
  created_at: string;
  updated_at: string;
  // Joined from contacts
  contact?: Contact;
}

export interface Dog {
  id: string;
  club_id: string;
  registered_name: string;
  call_name: string | null;
  microchip_number: string | null;
  sex: string | null;
  date_of_birth: string | null;
  date_of_death: string | null;
  color: string | null;
  coat_type: string | null;
  sire_id: string | null;
  dam_id: string | null;
  owner_id: string | null;
  breeder_id: string | null;
  photo_url: string | null;
  notes: string | null;
  is_public: boolean;
  is_historical: boolean;
  is_deceased: boolean;
  status: DogStatus;
  health_rating: HealthRating | null;
  submitted_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  owner?: Contact;
  breeder?: Contact;
  sire?: Dog;
  dam?: Dog;
  registrations?: DogRegistration[];
  health_clearances?: DogHealthClearance[];
  healthClearances?: DogHealthClearance[];
}

export interface Organization {
  id: string;
  club_id: string;
  name: string;
  type: OrgType;
  country: string | null;
  website_url: string | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface DogRegistration {
  id: string;
  dog_id: string;
  organization_id: string;
  registration_number: string;
  registration_url: string | null;
  created_at: string;
  // Joined
  organization?: Organization;
}

// --- Rating Types ---

export type RatingThresholds = {
  auto_dq: number; // score <= this → Red (disqualified)
  poor: number; // score <= this → Orange
  fair: number; // score <= this → Yellow
  good: number; // score <= this → Green
  // score > good → Blue (excellent)
};

export type HealthRatingColor = "red" | "orange" | "yellow" | "green" | "blue";

export type ScoreThresholds = {
  red: number;
  orange: number;
  yellow: number;
  green: number;
};

export type HealthRating = {
  color: HealthRatingColor;
  score: number;
  saturation: number;
  computed_at: string;
  required_complete: boolean;
  auto_dq: boolean;
  category_scores: Record<string, { color: HealthRatingColor; score: number; test_count: number }>;
  cert_version_id: string | null;
  cert_version_name: string | null;
};

export interface HealthRatingConfig {
  id: string;
  club_id: string;
  category_weights: Record<string, number>;
  critical_categories: string[];
  score_thresholds: ScoreThresholds;
  created_at: string;
  updated_at: string;
}

export interface HealthCertVersion {
  id: string;
  club_id: string;
  version_name: string;
  effective_date: string;
  required_test_type_ids: string[];
  category_weights: Record<string, number>;
  critical_categories: string[];
  score_thresholds: ScoreThresholds;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GradingOrg extends Organization {
  result_schema: ResultSchema | null;
  confidence: number | null;
  thresholds: RatingThresholds | null;
}

export interface HealthTestType {
  id: string;
  club_id: string;
  name: string;
  short_name: string;
  category: HealthCategory;
  result_options: string[];
  is_required: boolean;
  rating_category: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  // Joined
  grading_orgs?: GradingOrg[];
}

export interface DogHealthClearance {
  id: string;
  dog_id: string;
  health_test_type_id: string;
  organization_id: string;
  result: string;
  result_data: Record<string, unknown> | null;
  result_detail: string | null;
  result_score: number | null;
  result_score_left: number | null;
  result_score_right: number | null;
  test_date: string;
  expiration_date: string | null;
  certificate_number: string | null;
  certificate_url: string | null;
  status: DogStatus;
  submitted_by: string | null;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
  // Joined
  health_test_type?: HealthTestType;
  healthTestType?: HealthTestType;
  testType?: HealthTestType;
  organization?: Organization;
}

export interface HealthCondition {
  id: string;
  dog_id: string;
  condition_name: string;
  category: HealthCategory | null;
  diagnosis_date: string | null;
  resolved_date: string | null;
  severity: ConditionSeverity | null;
  notes: string | null;
  reported_by: string | null;
  created_at: string;
}

export interface Litter {
  id: string;
  club_id: string;
  sire_id: string | null;
  dam_id: string | null;
  breeder_id: string;
  whelp_date: string | null;
  litter_name: string | null;
  num_males: number | null;
  num_females: number | null;
  approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  sire_approval_status: SireApprovalStatus;
  sire_approval_by: string | null;
  sire_approval_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  sire?: Dog;
  dam?: Dog;
  breeder?: Contact;
  pups?: LitterPup[];
}

export interface LitterPup {
  id: string;
  litter_id: string;
  call_name: string | null;
  sex: string | null;
  color: string | null;
  coat_type: string | null;
  status: PupStatus;
  dog_id: string | null;
  buyer_contact_id: string | null;
  notes: string | null;
  created_at: string;
  // Joined
  dog?: Dog;
  buyer?: Contact;
}

export interface FormDataEntry {
  field_key: string;
  label: string;
  field_type: string;
  value: string | string[] | boolean | null;
}

export type FormFieldType = "text" | "textarea" | "email" | "phone" | "select" | "checkbox" | "radio" | "number" | "date";

export interface MembershipFormField {
  id: string;
  club_id: string;
  field_key: string;
  label: string;
  description: string | null;
  field_type: FormFieldType;
  options: string[] | null;
  required: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MembershipApplication {
  id: string;
  club_id: string;
  applicant_email: string;
  applicant_name: string;
  applicant_phone: string | null;
  applicant_address: string | null;
  membership_type: string;
  notes: string | null;
  form_data: FormDataEntry[] | null;
  status: ApprovalStatus;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  member_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  club_id: string;
  member_id: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  description: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// --- Ownership Transfers ---

export type TransferReason = "sale" | "return" | "gift" | "co_ownership" | "other";
export type TransferStatus = "pending" | "approved" | "rejected";

export interface DogOwnershipTransfer {
  id: string;
  dog_id: string;
  from_owner_id: string | null;
  to_owner_id: string;
  requested_by: string;
  approved_by: string | null;
  approved_at: string | null;
  status: TransferStatus;
  reason: TransferReason | null;
  notes: string | null;
  created_at: string;
  // Joined
  dog?: Dog;
  fromOwner?: Contact;
  toOwner?: Contact;
}

// --- Progeny Types ---

export interface DogProgenyEntry {
  id: string;
  registered_name: string;
  call_name: string | null;
  sex: string | null;
  date_of_birth: string | null;
  color: string | null;
  health_rating: HealthRating | null;
  owner?: Pick<Contact, "id" | "full_name" | "kennel_name">;
}

export interface DogProgenyResponse {
  generations: Array<{
    generation: number;
    dogs: DogProgenyEntry[];
  }>;
  totalCount: number;
}

export interface DogFilterOptions {
  coat_types: string[];
  colors: string[];
}

// --- API Response Types ---

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// --- Health Stamp (public page data) ---

export interface HealthStampData {
  dog: Pick<Dog, "id" | "registered_name" | "call_name" | "photo_url" | "sex" | "date_of_birth">;
  club: Pick<Club, "name" | "logo_url" | "primary_color">;
  clearances: Array<{
    test_type: Pick<HealthTestType, "name" | "short_name" | "category" | "is_required">;
    result: string | null; // null = not tested
    organization: Pick<Organization, "name"> | null;
    test_date: string | null;
    certificate_number: string | null;
    verified: boolean;
  }>;
}
