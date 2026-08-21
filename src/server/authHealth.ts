import { googlecalendar } from "@corsair-dev/googlecalendar";
import { gmail } from "@corsair-dev/gmail";
import { googlemeet } from "@corsair-dev/googlemeet";
import { corsairFor } from "@/server/corsair";
import type { ConnectionState, PluginId } from "@/lib/plugins";
import type { TenantId } from "@/lib/tenants";

/**
 * Is a stored grant still usable?
 *
 * Corsair's `manage.connectionStatus` answers "was a token ever written for
 * this (tenant, plugin)", which is not the same question. A refresh token
 * Google has expired or revoked leaves every row in place, so the status keeps
 * saying `connected` while each call dies inside the plugin's `keyBuilder`:
 *
 *   [corsair:googlemeet] Failed to get valid access token:
 *   Failed to refresh access token: {"error": "invalid_grant", ...}
 *
 * That gap is what strands the dashboard: `ConnectAccountModal` only offers a
 * Connect button for plugins that report as unconnected, so a revoked account
 * looks healthy and can never be repaired from the UI.
 *
 * A refresh token cannot be renewed — `invalid_grant` is terminal, and the only
 * way back is a fresh consent round trip. So all this has to do is tell the
 * difference between "will work" and "must reconnect".
 */

/** Refresh a little early, matching the skew the plugins themselves allow. */
const EXPIRY_SKEW_SECONDS = 300;

/** Token endpoint per plugin, read off the plugin rather than hardcoded. */
const TOKEN_URLS: Record<PluginId, string> = {
  gmail: gmail().oauthConfig!.tokenUrl,
  googlecalendar: googlecalendar().oauthConfig!.tokenUrl,
  googlemeet: googlemeet().oauthConfig!.tokenUrl,
};

/** The account-level key manager for one (tenant, plugin) pair. */
function keyManagerFor(tenant: TenantId, plugin: PluginId) {
  const client = corsairFor(tenant);
  switch (plugin) {
    case "gmail":
      return client.gmail.keys;
    case "googlecalendar":
      return client.googlecalendar.keys;
    case "googlemeet":
      return client.googlemeet.keys;
  }
}

/** `true` only for the terminal "this grant is gone, re-consent" case. */
function isInvalidGrant(status: number, body: string): boolean {
  if (status !== 400 && status !== 401) return false;
  try {
    return (JSON.parse(body) as { error?: string }).error === "invalid_grant";
  } catch {
    return /invalid_grant/.test(body);
  }
}

/**
 * Whether `plugin` can still get an access token for `tenant`.
 *
 * Only called for pairs Corsair already reports as `connected`, so the job is
 * narrowed to confirming or refuting that.
 *
 * Costs nothing in the common case: a cached access token with time left on it
 * is proof enough and no request is made. When it has expired this performs the
 * refresh the next API call would have performed anyway and stores the result,
 * so the round trip is borrowed rather than wasted.
 */
export async function probeConnection(
  tenant: TenantId,
  plugin: PluginId,
): Promise<ConnectionState> {
  const keys = keyManagerFor(tenant, plugin);

  let accessToken: string | null;
  let expiresAt: unknown;
  let refreshToken: string | null;
  let credentials: { client_id?: string | null; client_secret?: string | null };

  try {
    [accessToken, expiresAt, refreshToken, credentials] = await Promise.all([
      keys.get_access_token(),
      keys.get_expires_at(),
      keys.get_refresh_token(),
      keys.get_integration_credentials(),
    ]);
  } catch (e) {
    // No account row, or a DEK that won't unwrap — either way there is nothing
    // to refresh with, and consent is what creates it.
    console.error(`[authHealth] ${tenant}/${plugin}: cannot read keys:`, e);
    return "not_connected";
  }

  if (!refreshToken) return "not_connected";
  if (!credentials?.client_id || !credentials?.client_secret) {
    return "missing_credentials";
  }

  const now = Math.floor(Date.now() / 1000);
  if (accessToken && Number(expiresAt) > now + EXPIRY_SKEW_SECONDS) {
    return "connected";
  }

  let response: Response;
  try {
    response = await fetch(TOKEN_URLS[plugin], {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch (e) {
    // Offline or DNS trouble says nothing about the grant. Reporting
    // `needs_reauth` here would march the user through consent to fix their
    // network, so leave the status alone and let the real call surface it.
    console.error(`[authHealth] ${tenant}/${plugin}: token endpoint unreachable:`, e);
    return "connected";
  }

  const body = await response.text();

  if (!response.ok) {
    if (isInvalidGrant(response.status, body)) return "needs_reauth";
    console.error(
      `[authHealth] ${tenant}/${plugin}: refresh failed (${response.status}), ` +
        `not treating as revoked: ${body}`,
    );
    return "connected";
  }

  // Store what the refresh returned, so this probe replaces the next call's
  // refresh instead of adding one. Google omits `refresh_token` on a normal
  // refresh and only sends one when it has rotated the old one out.
  try {
    const token = JSON.parse(body) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };
    await keys.set_access_token(token.access_token);
    await keys.set_expires_at(String(now + token.expires_in));
    if (token.refresh_token) await keys.set_refresh_token(token.refresh_token);
  } catch (e) {
    // The grant is demonstrably good; failing to cache it only costs a refresh.
    console.error(`[authHealth] ${tenant}/${plugin}: could not store refreshed token:`, e);
  }

  return "connected";
}
