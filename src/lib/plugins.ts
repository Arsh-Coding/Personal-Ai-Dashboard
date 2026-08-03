/**
 * Google services each connected account authorizes.
 *
 * Corsair stores credentials per (tenant, plugin), and each plugin asks for its
 * own scopes — so connecting an account is one consent round trip per entry
 * here, not one for the account as a whole.
 *
 * Safe to import from client components: no server-only dependencies.
 */
export const PLUGINS = [
  { id: "gmail", label: "Gmail" },
  { id: "googlecalendar", label: "Google Calendar" },
  { id: "googlemeet", label: "Google Meet" },
] as const;

export type PluginId = (typeof PLUGINS)[number]["id"];

export const PLUGIN_IDS = PLUGINS.map((p) => p.id) as [PluginId, ...PluginId[]];

export function pluginMeta(id: PluginId) {
  return PLUGINS.find((p) => p.id === id) ?? PLUGINS[0];
}

/**
 * Mirrors Corsair's `PluginConnectionState`. Declared here rather than imported
 * from `corsair` so this stays a client-safe module.
 *
 * `missing_credentials` means the *app's* client_id/secret are unset (a
 * `corsair setup` problem, the same for every account); `not_connected` means
 * this particular account never completed consent, which is what the connect
 * flow fixes.
 */
export type ConnectionState =
  | "connected"
  | "missing_credentials"
  | "not_connected";

/** Connection state of one account, as reported by `auth.listStatuses`. */
export type TenantConnection = {
  plugins: { id: PluginId; state: ConnectionState }[];
  /** Plugins still needing consent, in `PLUGINS` order. */
  pending: PluginId[];
  connected: boolean;
};
