import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../client";
import { getOrCreateDefaultProfile, updateProfile, DEFAULT_PROFILE_ID } from "../travelerProfilesRepo";
import { StaleRevisionError, NotFoundError } from "../../../lib/errors";
import { resetTestDb } from "./testSupport";

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("travelerProfilesRepo", () => {
  it("creates the default profile on first call, seeded with real content (not blank)", async () => {
    const profile = await getOrCreateDefaultProfile();
    expect(profile.id).toBe(DEFAULT_PROFILE_ID);
    expect(profile.revision).toBe(1);
    expect(profile.priorityOrder.length).toBeGreaterThan(0);
    expect(profile.rawProfileText.length).toBeGreaterThan(0);
  });

  it("is idempotent — a second call returns the same record, not a duplicate or a reset", async () => {
    const first = await getOrCreateDefaultProfile();
    const second = await getOrCreateDefaultProfile();
    expect(second).toEqual(first);
  });

  it("does not recreate (or reset) the profile after it's been edited", async () => {
    const created = await getOrCreateDefaultProfile();
    const edited = await updateProfile(created.id, { pace: "relaxed" }, created.revision);
    expect(edited.pace).toBe("relaxed");

    const fetchedAgain = await getOrCreateDefaultProfile();
    expect(fetchedAgain).toEqual(edited);
    expect(fetchedAgain.pace).toBe("relaxed");
  });

  it("updates the profile and bumps its revision", async () => {
    const profile = await getOrCreateDefaultProfile();
    const updated = await updateProfile(
      profile.id,
      { accommodationPreferences: "Updated preference text." },
      profile.revision,
    );
    expect(updated.revision).toBe(profile.revision + 1);
    expect(updated.accommodationPreferences).toBe("Updated preference text.");
  });

  it("rejects a stale update", async () => {
    const profile = await getOrCreateDefaultProfile();
    await updateProfile(profile.id, { pace: "relaxed" }, profile.revision);
    await expect(updateProfile(profile.id, { pace: "packed" }, profile.revision)).rejects.toBeInstanceOf(
      StaleRevisionError,
    );
  });

  it("rejects updating a profile that doesn't exist", async () => {
    await expect(updateProfile("profile_nope", { pace: "relaxed" }, 1)).rejects.toBeInstanceOf(NotFoundError);
  });
});
