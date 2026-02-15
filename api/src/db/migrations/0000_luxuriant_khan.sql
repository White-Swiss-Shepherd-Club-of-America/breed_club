CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"breed_name" varchar(255) NOT NULL,
	"logo_url" varchar(500),
	"primary_color" varchar(7) DEFAULT '#655e7a',
	"secondary_color" varchar(7) DEFAULT '#ffffff',
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clubs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"kennel_name" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"city" varchar(100),
	"state" varchar(50),
	"country" varchar(2),
	"member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dog_health_clearances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dog_id" uuid NOT NULL,
	"health_test_type_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"result" varchar(100) NOT NULL,
	"result_detail" text,
	"test_date" date,
	"expiration_date" date,
	"certificate_number" varchar(100),
	"certificate_url" varchar(500),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"submitted_by" uuid,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dog_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dog_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"registration_number" varchar(100) NOT NULL,
	"registration_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"registered_name" varchar(255) NOT NULL,
	"call_name" varchar(100),
	"microchip_number" varchar(50),
	"sex" varchar(10),
	"date_of_birth" date,
	"date_of_death" date,
	"color" varchar(100),
	"coat_type" varchar(50),
	"sire_id" uuid,
	"dam_id" uuid,
	"owner_id" uuid,
	"breeder_id" uuid,
	"photo_url" varchar(500),
	"is_public" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"submitted_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dog_id" uuid NOT NULL,
	"condition_name" varchar(255) NOT NULL,
	"category" varchar(30),
	"diagnosis_date" date,
	"resolved_date" date,
	"severity" varchar(20),
	"notes" text,
	"reported_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_test_type_orgs" (
	"health_test_type_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	CONSTRAINT "health_test_type_orgs_health_test_type_id_organization_id_pk" PRIMARY KEY("health_test_type_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "health_test_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"short_name" varchar(50) NOT NULL,
	"category" varchar(30) NOT NULL,
	"result_options" jsonb NOT NULL,
	"is_required_for_chic" boolean DEFAULT false NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "litter_pups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"litter_id" uuid NOT NULL,
	"call_name" varchar(100),
	"sex" varchar(10),
	"color" varchar(100),
	"coat_type" varchar(50),
	"status" varchar(20) DEFAULT 'available' NOT NULL,
	"dog_id" uuid,
	"buyer_contact_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "litters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"sire_id" uuid,
	"dam_id" uuid,
	"breeder_id" uuid NOT NULL,
	"whelp_date" date,
	"expected_date" date,
	"num_puppies_born" integer,
	"num_puppies_survived" integer,
	"status" varchar(20) DEFAULT 'planned' NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"clerk_user_id" varchar(255) NOT NULL,
	"contact_id" uuid NOT NULL,
	"tier" varchar(20) DEFAULT 'non_member' NOT NULL,
	"membership_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"membership_type" varchar(50),
	"membership_expires" timestamp with time zone,
	"is_breeder" boolean DEFAULT false NOT NULL,
	"can_approve_members" boolean DEFAULT false NOT NULL,
	"can_approve_clearances" boolean DEFAULT false NOT NULL,
	"show_in_directory" boolean DEFAULT true NOT NULL,
	"verified_breeder" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"applicant_email" varchar(255) NOT NULL,
	"applicant_name" varchar(255) NOT NULL,
	"applicant_phone" varchar(50),
	"applicant_address" text,
	"membership_type" varchar(50) NOT NULL,
	"notes" text,
	"status" varchar(20) DEFAULT 'submitted' NOT NULL,
	"review_notes" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(30) NOT NULL,
	"country" varchar(2),
	"website_url" varchar(500),
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'usd' NOT NULL,
	"description" varchar(255),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dog_health_clearances" ADD CONSTRAINT "dog_health_clearances_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dog_health_clearances" ADD CONSTRAINT "dog_health_clearances_health_test_type_id_health_test_types_id_fk" FOREIGN KEY ("health_test_type_id") REFERENCES "public"."health_test_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dog_health_clearances" ADD CONSTRAINT "dog_health_clearances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dog_health_clearances" ADD CONSTRAINT "dog_health_clearances_submitted_by_members_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dog_health_clearances" ADD CONSTRAINT "dog_health_clearances_verified_by_members_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dog_registrations" ADD CONSTRAINT "dog_registrations_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dog_registrations" ADD CONSTRAINT "dog_registrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dogs" ADD CONSTRAINT "dogs_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dogs" ADD CONSTRAINT "dogs_owner_id_contacts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dogs" ADD CONSTRAINT "dogs_breeder_id_contacts_id_fk" FOREIGN KEY ("breeder_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dogs" ADD CONSTRAINT "dogs_submitted_by_members_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dogs" ADD CONSTRAINT "dogs_approved_by_members_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_conditions" ADD CONSTRAINT "health_conditions_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_conditions" ADD CONSTRAINT "health_conditions_reported_by_members_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_test_type_orgs" ADD CONSTRAINT "health_test_type_orgs_health_test_type_id_health_test_types_id_fk" FOREIGN KEY ("health_test_type_id") REFERENCES "public"."health_test_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_test_type_orgs" ADD CONSTRAINT "health_test_type_orgs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_test_types" ADD CONSTRAINT "health_test_types_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litter_pups" ADD CONSTRAINT "litter_pups_litter_id_litters_id_fk" FOREIGN KEY ("litter_id") REFERENCES "public"."litters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litter_pups" ADD CONSTRAINT "litter_pups_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litter_pups" ADD CONSTRAINT "litter_pups_buyer_contact_id_contacts_id_fk" FOREIGN KEY ("buyer_contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litters" ADD CONSTRAINT "litters_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litters" ADD CONSTRAINT "litters_sire_id_dogs_id_fk" FOREIGN KEY ("sire_id") REFERENCES "public"."dogs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litters" ADD CONSTRAINT "litters_dam_id_dogs_id_fk" FOREIGN KEY ("dam_id") REFERENCES "public"."dogs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litters" ADD CONSTRAINT "litters_breeder_id_contacts_id_fk" FOREIGN KEY ("breeder_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "litters" ADD CONSTRAINT "litters_approved_by_members_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_reviewed_by_members_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_contacts_club" ON "contacts" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "idx_contacts_member" ON "contacts" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_contacts_name" ON "contacts" USING btree ("club_id","full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_clearances_dog_test" ON "dog_health_clearances" USING btree ("dog_id","health_test_type_id");--> statement-breakpoint
CREATE INDEX "idx_clearances_status" ON "dog_health_clearances" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_dog_registrations_unique" ON "dog_registrations" USING btree ("dog_id","organization_id");--> statement-breakpoint
CREATE INDEX "idx_dogs_club" ON "dogs" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "idx_dogs_owner" ON "dogs" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_dogs_breeder" ON "dogs" USING btree ("breeder_id");--> statement-breakpoint
CREATE INDEX "idx_dogs_sire" ON "dogs" USING btree ("sire_id");--> statement-breakpoint
CREATE INDEX "idx_dogs_dam" ON "dogs" USING btree ("dam_id");--> statement-breakpoint
CREATE INDEX "idx_dogs_status" ON "dogs" USING btree ("club_id","status");--> statement-breakpoint
CREATE INDEX "idx_health_conditions_dog" ON "health_conditions" USING btree ("dog_id");--> statement-breakpoint
CREATE INDEX "idx_health_test_types_club" ON "health_test_types" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "idx_litter_pups_litter" ON "litter_pups" USING btree ("litter_id");--> statement-breakpoint
CREATE INDEX "idx_litters_club" ON "litters" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "idx_litters_breeder" ON "litters" USING btree ("breeder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_members_club_clerk" ON "members" USING btree ("club_id","clerk_user_id");--> statement-breakpoint
CREATE INDEX "idx_members_club_tier" ON "members" USING btree ("club_id","tier");--> statement-breakpoint
CREATE INDEX "idx_members_contact" ON "members" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_applications_club_status" ON "membership_applications" USING btree ("club_id","status");--> statement-breakpoint
CREATE INDEX "idx_organizations_club" ON "organizations" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "idx_payments_club_member" ON "payments" USING btree ("club_id","member_id");