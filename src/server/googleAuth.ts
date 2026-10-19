import { corsair } from "@/server/corsair";

/**
 * Google sign-in — establishing *who the visitor is*.
 *
 * Deliberately separate from Corsair's OAuth, which grants *access to their data*.
 * Two different questions, two different scope sets:
 *
 *   sign-in here        openid email profile          basic, no Google review
 *   Corsair plugins     gmail.modify, calendar, ...   sensitive/restricted
 *
 * That split matters: basic identity scopes work for anyone immediately, so sign-up
 * is never blocked on Google's verification process. Only the data-access consent
 * is subject to the 100-user unverified cap.
 *
 * The OAuth client is the one already stored in Corsair rather than a new pair of
 * environment variables. Same Google project, same consent screen, one less secret
 * to configure and lose — but it does mean the sign-in redirect URI has to be
 * registered on that client alongside the existing ones.
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
/** OIDC-standard userinfo, which returns `sub` as well as the profile fields. */
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const SIGNIN_SCOPES = ["openid", "email", "profile"];

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
};

/** Where Google returns after sign-in. Must be registered on the OAuth client. */
export function signInRedirectUri(origin: string): string {
  const configured = process.env.GOOGLE_SIGNIN_REDIRECT_URI;
  if (configured) return configured;
  return `${origin}/api/auth/callback/google`;
}

/**
 * Reuses the client credentials Corsair already holds.
 *
 * All three plugins were verified to share one client, so reading from any of them
 * gives the same pair; gmail is used because it is always configured in this app.
 */
async function clientCredentials(): Promise<{ id: string; secret: string }> {
  const [id, secret] = await Promise.all([
    corsair.keys.gmail.get_client_id(),
    corsair.keys.gmail.get_client_secret(),
  ]);
  if (!id || !secret) {
    throw new Error(
      "No Google client_id/client_secret stored in Corsair. Run " +
        "`npx corsair setup --plugin=gmail client_id=... client_secret=...`",
    );
  }
  return { id, secret };
}

export async function buildSignInUrl(opts: {
  redirectUri: string;
  state: string;
}): Promise<string> {
  const { id } = await clientCredentials();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SIGNIN_SCOPES.join(" "));
  url.searchParams.set("state", opts.state);
  // Forces the account chooser instead of silently reusing whoever is already
  // signed in, which is what lets one person switch between their own accounts.
  url.searchParams.set("prompt", "select_account");
  // No refresh token wanted: this is a one-shot identity check, and asking for
  // offline access would mean holding a credential with no use for it.
  url.searchParams.set("access_type", "online");
  return url.toString();
}

/**
 * Turns an authorization code into the signed-in user's identity.
 *
 * The code is exchanged server-side with the client secret, and the resulting
 * access token is then spent on one `userinfo` call. Identity therefore arrives
 * over a TLS connection this server opened to Google, authenticated with our own
 * secret — so there is no JWT signature to verify and no JWKS to fetch and cache.
 * Decoding the `id_token` locally instead would mean taking on that verification,
 * which is exactly the kind of thing that is easy to get subtly wrong.
 */
export async function exchangeCodeForIdentity(opts: {
  code: string;
  redirectUri: string;
}): Promise<GoogleIdentity> {
  const { id, secret } = await clientCredentials();

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: id,
      client_secret: secret,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Google rejected the sign-in code: ${body.slice(0, 300)}`);
  }

  const { access_token: accessToken } = (await tokenRes.json()) as {
    access_token?: string;
  };
  if (!accessToken) throw new Error("Google returned no access token for sign-in");

  const infoRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!infoRes.ok) {
    const body = await infoRes.text();
    throw new Error(`Could not read Google profile: ${body.slice(0, 300)}`);
  }

  const info = (await infoRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  if (!info.sub || !info.email) {
    throw new Error("Google profile is missing a subject or email");
  }

  return {
    sub: info.sub,
    email: info.email.toLowerCase(),
    emailVerified: info.email_verified === true,
    name: info.name ?? null,
    picture: info.picture ?? null,
  };
}
