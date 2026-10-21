import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { processOAuthCallback } from "corsair/oauth";
import { corsair, oauthRedirectUri } from "@/server/corsair";

/**
 * Where Google lands after consent — this path is what `OAUTH_REDIRECT_URI`
 * points at and what is registered on the OAuth client.
 *
 * The authorization code is exchanged here and the tokens are stored against
 * the tenant named in `state`, which Corsair HMAC-signs with the project KEK
 * and expires after 10 minutes, so the tenant cannot be swapped in the URL.
 *
 * Both outcomes redirect back to the dashboard rather than rendering here, so
 * the user always ends up somewhere useful. Success needs no query param: this
 * is a full document navigation, so the dashboard reloads, re-reads the active
 * account from localStorage and refetches connection status from scratch —
 * which is also what reopens the prompt for the second plugin.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const failed = (message: string) =>
    `/?${new URLSearchParams({ corsair_auth: "error", message }).toString()}`;

  let target: string;

  // Set when the user hits "Cancel" on the consent screen, or Google refuses
  // the request outright (e.g. redirect_uri_mismatch).
  const denied = params.get("error");
  const code = params.get("code");
  const state = params.get("state");

  if (denied) {
    target = failed(denied);
  } else if (!code || !state) {
    target = failed("Missing code or state");
  } else {
    try {
      await processOAuthCallback(corsair, {
        code,
        state,
        redirectUri: oauthRedirectUri(),
      });
      target = "/";
    } catch (e: any) {
      console.error("Corsair OAuth callback failed:", e);
      target = failed(e?.message || "Token exchange failed");
    }
  }

  // `redirect()` works by throwing, so it has to run outside the try/catch
  // above — inside, the catch would swallow it and report a failed exchange.
  redirect(target);
}
