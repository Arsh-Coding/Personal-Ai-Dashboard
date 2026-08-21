/**
 * Connected Google accounts, one Corsair tenant each.
 *
 * A tenant id is the `tenant_id` stored in `corsair_accounts`, and it scopes
 * every credential and synced entity. Adding an account here is not enough on
 * its own — it also has to be authorized:
 *   npx corsair auth --plugin=gmail --tenant=<id> --code=<code>
 *
 * Safe to import from client components: no server-only dependencies.
 */
export const TENANTS = [
  {
    id: "personal",
    label: "Personal",
    email: "arshpreet.singh.dev@gmail.com",
    accent: "purple",
  },
  {
    id: "jungleworks",
    label: "Jungleworks",
    email: "arshpreet.singh@jungleworks.com",
    accent: "indigo",
  },
] as const;

export type TenantId = (typeof TENANTS)[number]["id"];

export const TENANT_IDS = TENANTS.map((t) => t.id) as [TenantId, ...TenantId[]];

export const DEFAULT_TENANT: TenantId = "personal";

export function tenantMeta(id: TenantId) {
  return TENANTS.find((t) => t.id === id) ?? TENANTS[0];
}

export function isTenantId(value: unknown): value is TenantId {
  return typeof value === "string" && TENANT_IDS.includes(value as TenantId);
}
