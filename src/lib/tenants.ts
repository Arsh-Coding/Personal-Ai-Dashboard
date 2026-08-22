
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
  {
    id: "finance",
    label: "Finance",
    email: "gamersgrip888@gmail.com",
    accent: "black"
  }
] as const;

export type TenantId = (typeof TENANTS)[number]["id"];

/**
 * Accents in use, derived from `TENANTS` rather than declared separately so the
 * two can't drift.
 *
 * Consumers map this to real classes with a `Record<TenantAccent, ...>`, which
 * makes a new accent a compile error until it's styled — see
 * `ACTIVE_TAB_CLASSES` in `AccountSwitcher`. The classes can't be built by
 * interpolating the accent (`bg-${accent}-600`), because Tailwind only emits CSS
 * for class names it can read literally in the source.
 */
export type TenantAccent = (typeof TENANTS)[number]["accent"];
  
export const TENANT_IDS = TENANTS.map((t) => t.id) as [TenantId, ...TenantId[]];

export const DEFAULT_TENANT: TenantId = "personal";

export function tenantMeta(id: TenantId) {
  return TENANTS.find((t) => t.id === id) ?? TENANTS[0];
}

export function isTenantId(value: unknown): value is TenantId {
  return typeof value === "string" && TENANT_IDS.includes(value as TenantId);
}
