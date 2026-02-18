CREATE TABLE "dog_ownership_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dog_id" uuid NOT NULL,
	"from_owner_id" uuid,
	"to_owner_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reason" varchar(100),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dog_ownership_transfers" ADD CONSTRAINT "dog_ownership_transfers_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dog_ownership_transfers" ADD CONSTRAINT "dog_ownership_transfers_from_owner_id_contacts_id_fk" FOREIGN KEY ("from_owner_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dog_ownership_transfers" ADD CONSTRAINT "dog_ownership_transfers_to_owner_id_contacts_id_fk" FOREIGN KEY ("to_owner_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dog_ownership_transfers" ADD CONSTRAINT "dog_ownership_transfers_requested_by_members_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dog_ownership_transfers" ADD CONSTRAINT "dog_ownership_transfers_approved_by_members_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ownership_transfers_dog" ON "dog_ownership_transfers" USING btree ("dog_id");--> statement-breakpoint
CREATE INDEX "idx_ownership_transfers_status" ON "dog_ownership_transfers" USING btree ("status");