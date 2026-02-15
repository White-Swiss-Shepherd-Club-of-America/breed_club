/**
 * Shared TypeScript types used by both frontend and API.
 */

import type { Tier, PermissionFlags } from "./roles.js";

// --- Enums ---

export type ApprovalStatus = "draft" | "submitted" | "under_review" | "approved" | "rejected" | "needs_revision";
export type DogStatus = "pending" | "approved" | "rejected";
export type MembershipStatus = "pending" | "active" | "expired" | "suspended";
export type LitterStatus = "planned" | "expected" | "born" | "weaned" | "closed";
export type PupStatus = "available" | "reserved" | "sold" | "retained" | "deceased";
export type OrgType = "kennel_club" | "health_testing" | "grading_body" | "pedigree_database";
export type HealthCategory = "orthopedic" | "cardiac" | "genetic" | "vision" | "thyroid" | "dental" | "other";
export type ConditionSeverity = "mild" | "moderate" | "severe";

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
  is_public: boolean;
  status: DogStatus;
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

export interface HealthTestType {
  id: string;
  club_id: string;
  name: string;
  short_name: string;
  category: HealthCategory;
  result_options: string[];
  is_required_for_chic: boolean;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  // Joined
  grading_orgs?: Organization[];
}

export interface DogHealthClearance {
  id: string;
  dog_id: string;
  health_test_type_id: string;
  organization_id: string;
  result: string;
  result_detail: string | null;
  test_date: string | null;
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
  expected_date: string | null;
  num_puppies_born: number | null;
  num_puppies_survived: number | null;
  status: LitterStatus;
  approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
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

export interface MembershipApplication {
  id: string;
  club_id: string;
  applicant_email: string;
  applicant_name: string;
  applicant_phone: string | null;
  applicant_address: string | null;
  membership_type: string;
  notes: string | null;
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
    test_type: Pick<HealthTestType, "name" | "short_name" | "category" | "is_required_for_chic">;
    result: string | null; // null = not tested
    organization: Pick<Organization, "name"> | null;
    test_date: string | null;
    certificate_number: string | null;
    verified: boolean;
  }>;
}
