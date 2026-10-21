import 'dotenv/config';
import { createCorsair } from 'corsair';
import { googlecalendar } from '@corsair-dev/googlecalendar';
import { gmail } from '@corsair-dev/gmail';
import { googlemeet } from '@corsair-dev/googlemeet';
import { type TenantId } from '@/lib/tenants';
import { sql } from '@/server/pg';

if (!process.env.CORSAIR_KEK) {
    // Every stored OAuth token is encrypted under this key. Failing loudly here is
    // far better than booting and then reporting every account as disconnected,
    // which is what a missing KEK looks like from the dashboard.
    throw new Error('CORSAIR_KEK is not set — stored credentials cannot be decrypted.');
}

/**
 * Multi-tenant so each connected Google account gets its own credentials and
 * its own slice of `corsair_entities`, keyed by `tenant_id`.
 *
 * Backed by Postgres (Neon) rather than a local SQLite file, because a serverless
 * host gives each request an ephemeral, effectively read-only filesystem — a
 * `better-sqlite3` file would have nowhere durable to live. `corsair_*` tables are
 * not created by Corsair itself (`setupCorsair` only checks they exist), so they
 * come from `scripts/init-corsair-schema.ts`.
 *
 * Note this wrapper deliberately does NOT expose plugins directly — there is no
 * `corsair.gmail`. Everything goes through `corsairFor(tenant)` so a caller can
 * never accidentally read one account's mail while acting as another.
 */
export const corsair = createCorsair({
    plugins: [googlecalendar(), gmail(), googlemeet()],
    database: sql,
    kek: process.env.CORSAIR_KEK,
    multiTenancy: true,
});

/**
 * Cached tenant clients.
 *
 * Corsair caches decrypted credentials *on the tenant client*, so a fresh
 * `withTenant()` per call throws that cache away and re-reads and re-decrypts
 * every key from Postgres. Measured on three plugins for one account:
 *
 *   fresh client per plugin    4776ms cold, 1769ms on every repeat
 *   one shared client          1783ms cold, then 3ms, then 1ms
 *
 * `corsairFor` was called afresh in every procedure — and three times inside
 * `auth.myStatus` alone — so nothing ever hit a warm cache. Reusing the client per
 * tenant is what makes the second read of a key free.
 *
 * Bounded because tenants are now created by anyone signing in, and an unbounded
 * map would hold every visitor's client — and their decrypted tokens — for the
 * life of the process. Eviction is oldest-first, which is good enough for a cache
 * whose only job is to survive one request.
 */
const MAX_CACHED_CLIENTS = 32;
const tenantClients = new Map<TenantId, ReturnType<typeof corsair.withTenant>>();

/**
 * Plugin APIs scoped to one connected account.
 *
 * The tenant is required. It used to default to a hardcoded one, which meant a
 * caller that forgot to pass it still got a working client — pointed at somebody
 * else's mailbox. Now that omitting it is a type error, the only way to reach
 * Corsair is to have decided whose data you are reading, and the only source of
 * that decision is `ctx.tenantId` from the session.
 */
export function corsairFor(tenant: TenantId) {
    const cached = tenantClients.get(tenant);
    if (cached) return cached;

    const client = corsair.withTenant(tenant);
    if (tenantClients.size >= MAX_CACHED_CLIENTS) {
        const oldest = tenantClients.keys().next().value;
        if (oldest !== undefined) tenantClients.delete(oldest);
    }
    tenantClients.set(tenant, client);
    return client;
}

/**
 * Drop a tenant's cached client so the next `corsairFor` reads keys afresh.
 *
 * Each cached client's key managers keep the account row they first read, and
 * only reset it when they themselves write. Tokens stored anywhere else leave
 * that copy stale: the OAuth callback writes through its own client, and on a
 * serverless host another instance may have done the writing. After a reconnect
 * the stale copy still held the revoked refresh token, so the dashboard kept
 * reporting "Authorization expired" and calls kept failing with `invalid_grant`
 * even though fresh tokens were already saved.
 */
export function forgetTenantClient(tenant: TenantId): void {
    tenantClients.delete(tenant);
}

/**
 * Where Google sends the user back after consent.
 *
 * Read by both sides of the flow on purpose: OAuth requires the `redirect_uri`
 * in the token exchange to match the one in the authorize request byte for
 * byte, and this client is a GCP "Web application" type, so Google also
 * requires it to be pre-registered — a per-run value could never match.
 * Override only to serve the app from another origin, and register that URI in
 * the Google Cloud console first.
 */
export function oauthRedirectUri(): string {
    const configured = process.env.CORSAIR_OAUTH_REDIRECT_URI;
    if (configured) return configured;

    /**
     * Fail loudly rather than quietly pointing production at localhost.
     *
     * Unlike the sign-in callback, this cannot be derived from the request origin:
     * Google requires the `redirect_uri` in the token exchange to match the
     * authorize request byte for byte, and the two happen in different handlers.
     * Defaulting silently meant a deploy that forgot the variable would send users
     * to `localhost:3000` and fail with a `redirect_uri_mismatch` pointing nowhere
     * near the actual mistake.
     *
     * A function rather than a module constant so the check happens when a request
     * needs the value. Evaluating it at import time threw during `next build`,
     * which runs with `NODE_ENV=production` and no runtime environment.
     */
    if (process.env.NODE_ENV === 'production') {
        throw new Error(
            'CORSAIR_OAUTH_REDIRECT_URI is not set. Set it to ' +
            'https://<your-domain>/oauth/callback and register that exact URI as an ' +
            'Authorised redirect URI on the Google OAuth client.',
        );
    }
    return 'http://localhost:3000/oauth/callback';
}









    
/**
 * Procedures no longer take a tenant as input.
 *
 * There used to be a `tenantInput` zod schema here that every tenant-scoped
 * procedure spread into its own input, which meant the account was chosen by the
 * caller. It now comes from the signed session cookie via `ctx.tenantId` — see
 * `@/server/session` for why, and use `tenantProcedure` from `@/server/api/trpc`
 * to get it.
 */

/**
 * `unwrapEntities` used to live here.
 *
 * It flattened the `{ id, account_id, data: {...} }` rows that Corsair's
 * `.db.<entity>.search()` returns. Every caller has moved to `@/server/entityReads`,
 * which does that shaping as part of a query that also projects away the message
 * bodies — so there is nothing left to unwrap after the fact.
 */
