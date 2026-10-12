import { getReadyDb, withWriteTransaction } from "../client";
import type { TravelerProfile } from "../schema";
import { nowIso } from "../../lib/time";
import { StaleRevisionError, NotFoundError } from "../../lib/errors";

/**
 * The schema supports multiple named profiles, but Phase 2's actual use
 * case is one couple sharing one profile — so the app manages exactly one
 * record at this well-known ID rather than building profile-switching UI
 * nothing currently needs. Seeded from the Couple Travel Profile already
 * established in chat, so the app is useful on first run instead of
 * starting blank.
 */
export const DEFAULT_PROFILE_ID = "profile-default";

function defaultProfileSeed(): Omit<TravelerProfile, "revision" | "createdAt" | "updatedAt"> {
  return {
    id: DEFAULT_PROFILE_ID,
    name: "NK Couple Profile",
    priorityOrder: [
      "experience",
      "value",
      "quality",
      "convenience",
      "authenticity",
      "comfort",
      "photography",
    ],
    accommodationPreferences:
      "Clean, comfortable, well-located 3-4 star hotels or well-reviewed Airbnb/condos. " +
      "Not automatically the cheapest, and not automatically luxury.",
    foodPreferences:
      "Authentic local food and delicacies, not only tourist-oriented restaurants. " +
      "Mix of must-try, local favorites, hidden gems, budget eats, and special-occasion spots.",
    pace: "comfortable",
    rawProfileText:
      "Value for money, not simply the lowest price. Avoid both overpaying for brand/luxury " +
      "and under-spending on poor quality. Willing to pay more when it provides a meaningful " +
      "improvement in comfort, convenience or experience.",
  };
}

export async function getOrCreateDefaultProfile(): Promise<TravelerProfile> {
  const db = getReadyDb();
  const existing = await db.get("travelerProfiles", DEFAULT_PROFILE_ID);
  if (existing) return existing;

  const now = nowIso();
  const seeded: TravelerProfile = { ...defaultProfileSeed(), revision: 1, createdAt: now, updatedAt: now };

  return withWriteTransaction(["travelerProfiles"], async (tx) => {
    const store = tx.objectStore("travelerProfiles");
    // Re-check inside the transaction: a second caller may have created
    // it between our read above and this write (e.g. two components
    // mounting at once). `add` throws on an existing key rather than
    // silently overwriting, so prefer whichever one actually landed.
    const raceCheck = await store.get(DEFAULT_PROFILE_ID);
    if (raceCheck) return raceCheck;
    await store.add(seeded);
    return seeded;
  });
}

export type ProfilePatch = Partial<
  Omit<TravelerProfile, "id" | "revision" | "createdAt" | "updatedAt">
>;

export async function updateProfile(
  id: string,
  patch: ProfilePatch,
  expectedRevision: number,
): Promise<TravelerProfile> {
  return withWriteTransaction(["travelerProfiles"], async (tx) => {
    const store = tx.objectStore("travelerProfiles");
    const existing = await store.get(id);
    if (!existing) throw new NotFoundError("Traveler profile", id);
    if (existing.revision !== expectedRevision) throw new StaleRevisionError("Traveler profile", id);

    const updated: TravelerProfile = {
      ...existing,
      ...patch,
      id: existing.id,
      revision: existing.revision + 1,
      updatedAt: nowIso(),
    };
    await store.put(updated);
    return updated;
  });
}
