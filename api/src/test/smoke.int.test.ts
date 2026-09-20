import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { dogs } from "../db/schema.js";
import { getTestDb, withClub, withRollback } from "./db.js";
import { hasDb } from "./setup.js";

describe.skipIf(!hasDb)("integration harness", () => {
  it("sees an inserted dog inside the transaction and nothing after rollback", async () => {
    const dogId = await withRollback(async (tx) => {
      const { clubAId, contactAId, memberAId } = await withClub(tx);

      const [inserted] = await tx
        .insert(dogs)
        .values({
          club_id: clubAId,
          registered_name: "Harness Smoke Test Dog",
          sex: "male",
          owner_id: contactAId,
          submitted_by: memberAId,
        })
        .returning({ id: dogs.id, club_id: dogs.club_id, status: dogs.status });

      expect(inserted.club_id).toBe(clubAId);
      // schema default, proves we read back the committed-in-tx row
      expect(inserted.status).toBe("pending");

      const visible = await tx.select().from(dogs).where(eq(dogs.id, inserted.id));
      expect(visible).toHaveLength(1);
      expect(visible[0].registered_name).toBe("Harness Smoke Test Dog");

      return inserted.id;
    });

    const after = await getTestDb().select().from(dogs).where(eq(dogs.id, dogId));
    expect(after).toHaveLength(0);
  });

  it("seeds two isolated clubs so cross-tenant assertions are expressible", async () => {
    await withRollback(async (tx) => {
      const seeded = await withClub(tx);
      expect(seeded.clubAId).not.toBe(seeded.clubBId);
      expect(seeded.memberAId).not.toBe(seeded.memberBId);

      await tx.insert(dogs).values({
        club_id: seeded.clubAId,
        registered_name: "Club A Only",
      });

      const clubBDogs = await tx.select().from(dogs).where(eq(dogs.club_id, seeded.clubBId));
      expect(clubBDogs).toHaveLength(0);
    });
  });

  it("propagates a real failure instead of swallowing it as a rollback", async () => {
    await expect(
      withRollback(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });
});
