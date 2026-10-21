/**
 * A Corsair tenant id — one connected Google account's slice of everything.
 *
 * This file used to hold a hardcoded array of three accounts, with `TenantId`
 * derived from it as a union of string literals and `z.enum(TENANT_IDS)` guarding
 * every procedure input. That shape could not survive sign-up: adding a user meant
 * editing source and redeploying.
 *
 * Tenant ids now come from the `app_user` table, which is keyed by the Google
 * account that signed in, so the type is simply a string. The identifiers for the
 * original three accounts were kept rather than renumbered, so all the migrated
 * mail and calendar data stays attached to them.
 *
 * Safe to import from client components: no server-only dependencies.
 */
export type TenantId = string;
