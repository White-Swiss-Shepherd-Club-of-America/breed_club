import { relations } from "drizzle-orm";
import {
  clubs,
  contacts,
  members,
  membershipApplications,
  organizations,
  dogs,
  dogOwnershipTransfers,
  dogRegistrations,
  healthTestTypes,
  healthTestTypeOrgs,
  dogHealthClearances,
  healthConditions,
  litters,
  litterPups,
  payments,
} from "./schema.js";

// ─── Club relations ─────────────────────────────────────────────────────────

export const clubsRelations = relations(clubs, ({ many }) => ({
  contacts: many(contacts),
  members: many(members),
  organizations: many(organizations),
  dogs: many(dogs),
  healthTestTypes: many(healthTestTypes),
  litters: many(litters),
  membershipApplications: many(membershipApplications),
  payments: many(payments),
}));

// ─── Contact relations ──────────────────────────────────────────────────────

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  club: one(clubs, { fields: [contacts.club_id], references: [clubs.id] }),
  member: one(members, { fields: [contacts.member_id], references: [members.id] }),
  ownedDogs: many(dogs, { relationName: "dogOwner" }),
  bredDogs: many(dogs, { relationName: "dogBreeder" }),
}));

// ─── Member relations ───────────────────────────────────────────────────────

export const membersRelations = relations(members, ({ one }) => ({
  club: one(clubs, { fields: [members.club_id], references: [clubs.id] }),
  contact: one(contacts, { fields: [members.contact_id], references: [contacts.id] }),
}));

// ─── Membership Application relations ───────────────────────────────────────

export const membershipApplicationsRelations = relations(membershipApplications, ({ one }) => ({
  club: one(clubs, { fields: [membershipApplications.club_id], references: [clubs.id] }),
  reviewer: one(members, {
    fields: [membershipApplications.reviewed_by],
    references: [members.id],
    relationName: "applicationReviewer",
  }),
  member: one(members, {
    fields: [membershipApplications.member_id],
    references: [members.id],
    relationName: "applicationMember",
  }),
}));

// ─── Organization relations ─────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  club: one(clubs, { fields: [organizations.club_id], references: [clubs.id] }),
  testTypeLinks: many(healthTestTypeOrgs),
  dogRegistrations: many(dogRegistrations),
}));

// ─── Dog relations ──────────────────────────────────────────────────────────

export const dogsRelations = relations(dogs, ({ one, many }) => ({
  club: one(clubs, { fields: [dogs.club_id], references: [clubs.id] }),
  owner: one(contacts, {
    fields: [dogs.owner_id],
    references: [contacts.id],
    relationName: "dogOwner",
  }),
  breeder: one(contacts, {
    fields: [dogs.breeder_id],
    references: [contacts.id],
    relationName: "dogBreeder",
  }),
  sire: one(dogs, {
    fields: [dogs.sire_id],
    references: [dogs.id],
    relationName: "dogSire",
  }),
  dam: one(dogs, {
    fields: [dogs.dam_id],
    references: [dogs.id],
    relationName: "dogDam",
  }),
  submitter: one(members, {
    fields: [dogs.submitted_by],
    references: [members.id],
    relationName: "dogSubmitter",
  }),
  approver: one(members, {
    fields: [dogs.approved_by],
    references: [members.id],
    relationName: "dogApprover",
  }),
  registrations: many(dogRegistrations),
  healthClearances: many(dogHealthClearances),
  healthConditions: many(healthConditions),
  ownershipTransfers: many(dogOwnershipTransfers),
}));

// ─── Dog Ownership Transfer relations ───────────────────────────────────────

export const dogOwnershipTransfersRelations = relations(dogOwnershipTransfers, ({ one }) => ({
  dog: one(dogs, { fields: [dogOwnershipTransfers.dog_id], references: [dogs.id] }),
  fromOwner: one(contacts, {
    fields: [dogOwnershipTransfers.from_owner_id],
    references: [contacts.id],
    relationName: "transferFromOwner",
  }),
  toOwner: one(contacts, {
    fields: [dogOwnershipTransfers.to_owner_id],
    references: [contacts.id],
    relationName: "transferToOwner",
  }),
  requestedBy: one(members, {
    fields: [dogOwnershipTransfers.requested_by],
    references: [members.id],
    relationName: "transferRequester",
  }),
  approvedBy: one(members, {
    fields: [dogOwnershipTransfers.approved_by],
    references: [members.id],
    relationName: "transferApprover",
  }),
}));

// ─── Dog Registration relations ─────────────────────────────────────────────

export const dogRegistrationsRelations = relations(dogRegistrations, ({ one }) => ({
  dog: one(dogs, { fields: [dogRegistrations.dog_id], references: [dogs.id] }),
  organization: one(organizations, {
    fields: [dogRegistrations.organization_id],
    references: [organizations.id],
  }),
}));

// ─── Health Test Type relations ─────────────────────────────────────────────

export const healthTestTypesRelations = relations(healthTestTypes, ({ one, many }) => ({
  club: one(clubs, { fields: [healthTestTypes.club_id], references: [clubs.id] }),
  orgLinks: many(healthTestTypeOrgs),
  clearances: many(dogHealthClearances),
}));

// ─── Health Test Type ↔ Org join table relations ────────────────────────────

export const healthTestTypeOrgsRelations = relations(healthTestTypeOrgs, ({ one }) => ({
  testType: one(healthTestTypes, {
    fields: [healthTestTypeOrgs.health_test_type_id],
    references: [healthTestTypes.id],
  }),
  organization: one(organizations, {
    fields: [healthTestTypeOrgs.organization_id],
    references: [organizations.id],
  }),
}));

// ─── Dog Health Clearance relations ─────────────────────────────────────────

export const dogHealthClearancesRelations = relations(dogHealthClearances, ({ one }) => ({
  dog: one(dogs, { fields: [dogHealthClearances.dog_id], references: [dogs.id] }),
  healthTestType: one(healthTestTypes, {
    fields: [dogHealthClearances.health_test_type_id],
    references: [healthTestTypes.id],
  }),
  organization: one(organizations, {
    fields: [dogHealthClearances.organization_id],
    references: [organizations.id],
  }),
  submitter: one(members, {
    fields: [dogHealthClearances.submitted_by],
    references: [members.id],
    relationName: "clearanceSubmitter",
  }),
  verifier: one(members, {
    fields: [dogHealthClearances.verified_by],
    references: [members.id],
    relationName: "clearanceVerifier",
  }),
}));

// ─── Health Condition relations ─────────────────────────────────────────────

export const healthConditionsRelations = relations(healthConditions, ({ one }) => ({
  dog: one(dogs, { fields: [healthConditions.dog_id], references: [dogs.id] }),
  reporter: one(members, {
    fields: [healthConditions.reported_by],
    references: [members.id],
  }),
}));

// ─── Litter relations ───────────────────────────────────────────────────────

export const littersRelations = relations(litters, ({ one, many }) => ({
  club: one(clubs, { fields: [litters.club_id], references: [clubs.id] }),
  sire: one(dogs, {
    fields: [litters.sire_id],
    references: [dogs.id],
    relationName: "litterSire",
  }),
  dam: one(dogs, {
    fields: [litters.dam_id],
    references: [dogs.id],
    relationName: "litterDam",
  }),
  breeder: one(contacts, {
    fields: [litters.breeder_id],
    references: [contacts.id],
  }),
  approver: one(members, {
    fields: [litters.approved_by],
    references: [members.id],
    relationName: "litterApprover",
  }),
  pups: many(litterPups),
}));

// ─── Litter Pup relations ───────────────────────────────────────────────────

export const litterPupsRelations = relations(litterPups, ({ one }) => ({
  litter: one(litters, { fields: [litterPups.litter_id], references: [litters.id] }),
  dog: one(dogs, { fields: [litterPups.dog_id], references: [dogs.id] }),
  buyer: one(contacts, { fields: [litterPups.buyer_contact_id], references: [contacts.id] }),
}));

// ─── Payment relations ──────────────────────────────────────────────────────

export const paymentsRelations = relations(payments, ({ one }) => ({
  club: one(clubs, { fields: [payments.club_id], references: [clubs.id] }),
  member: one(members, { fields: [payments.member_id], references: [members.id] }),
}));
