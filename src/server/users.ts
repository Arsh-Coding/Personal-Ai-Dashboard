import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { appUsers } from "@/server/db/schema";
import type { GoogleIdentity } from "@/server/googleAuth";

export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

/**
 * Finds or creates the `app_user` row for a Google identity, and returns it.
 *
 * The row's `id` is the Corsair tenant id, so this function is the thing that
 * turns "signed in with Google" into "may read exactly this slice of data".
 *
 * Three cases, in priority order:
 *
 *   1. `google_sub` already known — the normal return visit.
 *   2. A seeded row with this email and no `google_sub` yet — one of the three
 *      original tenants, claimed on first sign-in so the migrated mail and
 *      calendar data stays reachable under its existing id.
 *   3. Nobody matches — a new user, given a fresh tenant.
 *
 * Case 2 only fires when Google reports the address as verified. Matching on an
 * unverified email would let someone claim a tenant by asserting its address.
 */
export async function resolveUserFromGoogle(
  identity: GoogleIdentity,
): Promise<AppUser> {
  const now = new Date();

  const [bySub] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.googleSub, identity.sub))
    .limit(1);

  if (bySub) {
    // Profile fields drift — people rename themselves and change avatars.
    await db
      .update(appUsers)
      .set({
        email: identity.email,
        name: identity.name,
        image: identity.picture,
        lastSeenAt: now,
      })
      .where(eq(appUsers.id, bySub.id));
    return {
      id: bySub.id,
      email: identity.email,
      name: identity.name,
      image: identity.picture,
    };
  }

  if (identity.emailVerified) {
    const [byEmail] = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.email, identity.email))
      .limit(1);

    if (byEmail && !byEmail.googleSub) {
      await db
        .update(appUsers)
        .set({
          googleSub: identity.sub,
          name: identity.name,
          image: identity.picture,
          lastSeenAt: now,
        })
        .where(eq(appUsers.id, byEmail.id));
      return {
        id: byEmail.id,
        email: byEmail.email,
        name: identity.name,
        image: identity.picture,
      };
    }

    if (byEmail?.googleSub && byEmail.googleSub !== identity.sub) {
      // Same address, different Google account. Refusing is the safe answer:
      // silently rebinding would hand one account's data to another.
      throw new Error(
        `${identity.email} is already linked to a different Google account.`,
      );
    }
  }

  // Prefixed so a generated id can never collide with one of the legacy words,
  // and so it is obvious in the database where an id came from.
  const id = `u_${identity.sub}`;
  await db.insert(appUsers).values({
    id,
    googleSub: identity.sub,
    email: identity.email,
    name: identity.name,
    image: identity.picture,
    createdAt: now,
    lastSeenAt: now,
  });

  return {
    id,
    email: identity.email,
    name: identity.name,
    image: identity.picture,
  };
}

/** The signed-in user, or null if the session points at a row that is gone. */
export async function findUserById(id: string): Promise<AppUser | null> {
  const [row] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.id, id))
    .limit(1);
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, image: row.image };
}
