import { sql } from "@/server/pg";
import type { PluginId } from "@/lib/plugins";
import type { TenantId } from "@/lib/tenants";

/**
 * Projected reads of `corsair_entities`.
 *
 * Corsair's own `db.<entity>.search({})` is `SELECT *` with no way to choose
 * columns, which was free against a local SQLite file and is not against Neon.
 * Measured on one account's 276 Gmail messages:
 *
 *   SELECT *                        17.00 MB   10184ms
 *   same rows minus `payload`        4.94 MB    4244ms
 *   just the hydrated/not flags      0.02 MB     552ms
 *
 * The list views only ever render headers and a snippet, so they were moving
 * roughly 17 MB to display 170 KB of it.
 *
 * ## The tradeoff
 *
 * This reaches past the ORM to the table, which couples these queries to Corsair's
 * storage layout — if that changes, these break where `search()` would have
 * absorbed it. Accepted deliberately, and only for the list reads and the sync
 * bookkeeping where the volume justifies it. Everything else still goes through
 * the ORM, and all writes do.
 *
 * One query, not two: tenant and plugin resolve to an account through a join
 * rather than a separate lookup, because at ~266ms per round trip the number of
 * queries matters as much as their size.
 */

/** Body-bearing keys, stripped for anything that renders a list. */
export const BODY_KEYS = ["payload", "raw", "body"];

type EntityRow = { _row_id: string; data: Record<string, unknown> | null };

/** One provider entity, flattened. Keys depend on the plugin and entity type. */
export type Entity = Record<string, unknown>;

/** Shapes a row the way `unwrapEntities` did, so callers are unchanged. */
function lift(rows: EntityRow[]): Entity[] {
  return rows.map((r) => ({ ...(r.data ?? {}), _rowId: r._row_id }));
}

/**
 * Entities of one type for one (tenant, plugin), minus `omitKeys`.
 *
 * `jsonb - text[]` does the projection inside Postgres, so the omitted keys are
 * never serialised or transferred.
 */
export async function readEntities(opts: {
  tenant: TenantId;
  plugin: PluginId;
  entityType: string;
  omitKeys?: string[];
}): Promise<Entity[]> {
  const omit = opts.omitKeys ?? [];
  const rows = await sql<EntityRow[]>`
    SELECT e.id AS _row_id,
           (e.data - ${omit}::text[]) AS data
      FROM corsair_entities e
      JOIN corsair_accounts a ON a.id = e.account_id
      JOIN corsair_integrations i ON i.id = a.integration_id
     WHERE a.tenant_id = ${opts.tenant}
       AND i.name = ${opts.plugin}
       AND e.entity_type = ${opts.entityType}
  `;
  return lift(rows);
}

/**
 * One entity by its provider id, with everything intact.
 *
 * `entity_id` is not unique on its own — Gmail reuses a single id for a
 * one-message thread and its message — so `entity_type` is part of the lookup.
 */
export async function readEntity(opts: {
  tenant: TenantId;
  plugin: PluginId;
  entityType: string;
  entityId: string;
}): Promise<Entity | undefined> {
  const rows = await sql<EntityRow[]>`
    SELECT e.id AS _row_id, e.data AS data
      FROM corsair_entities e
      JOIN corsair_accounts a ON a.id = e.account_id
      JOIN corsair_integrations i ON i.id = a.integration_id
     WHERE a.tenant_id = ${opts.tenant}
       AND i.name = ${opts.plugin}
       AND e.entity_type = ${opts.entityType}
       AND e.entity_id = ${opts.entityId}
     LIMIT 1
  `;
  return lift(rows)[0];
}

/**
 * The `corsair_accounts` row id for a (tenant, plugin), or null when that plugin
 * was never connected for this account.
 *
 * Needed by the sync, which operates on `corsair_entities` directly and so has to
 * name the account itself.
 */
export async function resolveAccountId(
  tenant: TenantId,
  plugin: PluginId,
): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    SELECT a.id
      FROM corsair_accounts a
      JOIN corsair_integrations i ON i.id = a.integration_id
     WHERE a.tenant_id = ${tenant} AND i.name = ${plugin}
     LIMIT 1
  `;
  return row?.id ?? null;
}
