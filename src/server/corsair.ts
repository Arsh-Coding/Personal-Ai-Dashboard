import 'dotenv/config';
import Database from 'better-sqlite3';
import { createCorsair } from 'corsair';
import { googlecalendar } from '@corsair-dev/googlecalendar';
import { gmail } from '@corsair-dev/gmail';
import { googlemeet } from '@corsair-dev/googlemeet';
import { z } from 'zod';
import { DEFAULT_TENANT, TENANT_IDS, type TenantId } from '@/lib/tenants';

const db = new Database('corsair.db');

/**
 * Multi-tenant so each connected Google account gets its own credentials and
 * its own slice of `corsair_entities`, keyed by `tenant_id`.
 *
 * Note this wrapper deliberately does NOT expose plugins directly — there is no
 * `corsair.gmail`. Everything goes through `corsairFor(tenant)` so a caller can
 * never accidentally read one account's mail while acting as another.
 */
export const corsair = createCorsair({
    plugins: [googlecalendar(), gmail(), googlemeet()],
    database: db,
    kek: process.env.CORSAIR_KEK!,
    multiTenancy: true,
});

/** Plugin APIs scoped to one connected account. */
export function corsairFor(tenant: TenantId = DEFAULT_TENANT) {
    return corsair.withTenant(tenant);
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
export const OAUTH_REDIRECT_URI =
    process.env.CORSAIR_OAUTH_REDIRECT_URI ?? "http://localhost:3000/oauth/callback";









    
/**
 * Every tenant-scoped procedure takes this, so switching accounts in the UI is
 * just a different input — and a procedure can't forget to scope itself.
 */
export const tenantInput = z.object({
    tenant: z.enum(TENANT_IDS).default(DEFAULT_TENANT),
});

/**
 * Corsair's `.db.<entity>.search()` returns the raw `corsair_entities` row with the
 * provider payload nested under `data` — i.e. `{ id, account_id, entity_id, data: {...} }`.
 * Callers want the payload itself, so lift `data` to the top level and keep the row's
 * primary key as `_rowId`. Note this makes `id` the provider's id (Google event id,
 * Gmail thread id), which is what joins and note-keying need.
 *
 * Defensive: rows without an object `data` are passed through untouched.
 */
export function unwrapEntities(rows: unknown): any[] {
    return ((rows as any[]) ?? []).map((row) =>
        row?.data && typeof row.data === "object"
            ? { ...row.data, _rowId: row.id }
            : row,
    );
}
