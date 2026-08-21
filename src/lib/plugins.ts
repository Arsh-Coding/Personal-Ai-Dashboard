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
 * Mirrors Corsair's `PluginConnectionState`, plus one state Corsair cannot
 * report. Declared here rather than imported from `corsair` so this stays a
 * client-safe module.
 *
 * `missing_credentials` means the *app's* client_id/secret are unset (a
 * `corsair setup` problem, the same for every account); `not_connected` means
 * this particular account never completed consent, which is what the connect
 * flow fixes.
 *
 * `needs_reauth` is ours: Corsair's `connectionStatus` only checks that an
 * access token was *stored*, so a grant Google has since revoked still reports
 * `connected` while every call fails with `invalid_grant`. `probeConnection`
 * downgrades those to this state so the UI can offer the one fix that works —
 * consent again. See `@/server/authHealth`.
 */
export type ConnectionState =
  | "connected"
  | "missing_credentials"
  | "needs_reauth"
  | "not_connected";

/** Connection state of one account, as reported by `auth.listStatuses`. */
export type TenantConnection = {
  plugins: { id: PluginId; state: ConnectionState }[];
  /** Plugins still needing consent, in `PLUGINS` order. */
  pending: PluginId[];
  connected: boolean;
};
