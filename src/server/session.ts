import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Who is signed in, and the CSRF token for the sign-in round trip.
 *
 * Step 1 moved the account out of request input and into a signed cookie, which
 * stopped any caller naming an arbitrary tenant. But with nobody signed in there
 * was no identity to check that cookie against, so anything could still ask to
 * become any account. This closes that: the cookie now carries a *user id* issued
 * only by the Google sign-in callback, and the tenant is that user's own id.
 *
 * Signed rather than encrypted — the contents are not secret, they only must not
 * be forgeable. The signing key is derived from `CORSAIR_KEK` so there is no extra
 * secret to configure, but it is a *derived* key: the value that signs cookies is
 * never the value that decrypts stored OAuth tokens.
 */

const SESSION_COOKIE = "corsair_session";
const STATE_COOKIE = "corsair_oauth_state";

/** Sessions last a week; signing in again is cheap and silent. */
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
/** The sign-in round trip should take seconds, not minutes. */
const STATE_TTL_SECONDS = 60 * 10;

function derivedKey(purpose: string): Buffer {
  const kek = process.env.CORSAIR_KEK;
  if (!kek) throw new Error("CORSAIR_KEK is not set — cannot sign cookies.");
  return createHmac("sha256", kek).update(purpose).digest();
}

function sign(purpose: string, value: string): string {
  return createHmac("sha256", derivedKey(purpose)).update(value).digest("base64url");
}

/** Constant-time compare, so a wrong signature leaks nothing through timing. */
function signatureMatches(purpose: string, value: string, given: string): boolean {
  const expected = Buffer.from(sign(purpose, value), "utf8");
  const candidate = Buffer.from(given, "utf8");
  if (expected.length !== candidate.length) return false;
  return timingSafeEqual(expected, candidate);
}

function pack(purpose: string, payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(purpose, body)}`;
}

function unpack<T>(purpose: string, raw: string | null | undefined): T | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  if (!signatureMatches(purpose, body, raw.slice(dot + 1))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** Pull one cookie out of a raw `Cookie:` header. */
export function readCookie(
  header: string | null | undefined,
  name: string,
): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // Lax, not Strict: both the Google sign-in callback and Corsair's OAuth
    // callback are cross-site navigations back into the app, and Strict would
    // withhold the cookie on exactly those requests.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/* -------------------------------------------------------------------------- */
/* Session                                                                     */
/* -------------------------------------------------------------------------- */

type SessionPayload = { uid: string; iat: number };

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

export function sessionCookieValue(userId: string): {
  name: string;
  value: string;
  options: ReturnType<typeof cookieOptions>;
} {
  return {
    name: SESSION_COOKIE,
    value: pack("corsair-session-v2", {
      uid: userId,
      iat: Math.floor(Date.now() / 1000),
    } satisfies SessionPayload),
    options: cookieOptions(SESSION_TTL_SECONDS),
  };
}

/** Clearing is a zero-length cookie with an immediate expiry. */
export function clearedSessionCookie() {
  return { name: SESSION_COOKIE, value: "", options: cookieOptions(0) };
}

/**
 * The signed-in user's id, or null.
 *
 * Returns null — never a default — for a missing, tampered or expired cookie, so
 * every caller fails closed. Step 1 fell back to a hardcoded tenant here, which
 * was the remaining hole.
 */
export function readSessionUserId(
  cookieHeader: string | null | undefined,
): string | null {
  const payload = unpack<SessionPayload>(
    "corsair-session-v2",
    readCookie(cookieHeader, SESSION_COOKIE),
  );
  if (!payload?.uid || typeof payload.iat !== "number") return null;
  // Expiry is enforced here as well as by Max-Age, because a client controls
  // whether it honours Max-Age and a server must not depend on that.
  if (Math.floor(Date.now() / 1000) - payload.iat > SESSION_TTL_SECONDS) return null;
  return payload.uid;
}

/* -------------------------------------------------------------------------- */
/* OAuth state (CSRF)                                                         */
/* -------------------------------------------------------------------------- */

type StatePayload = { nonce: string; next: string; iat: number };

export const STATE_COOKIE_NAME = STATE_COOKIE;

/**
 * A one-time token tying a sign-in callback to the browser that started it.
 *
 * The same value goes into Google's `state` parameter and into a cookie. The
 * callback requires both and requires them to match, so a callback URL replayed
 * from somewhere else has no matching cookie and is refused — otherwise an
 * attacker could complete a sign-in flow *into* a victim's browser and choose
 * which account it ends up as.
 */
export function createOAuthState(next: string) {
  const payload: StatePayload = {
    nonce: randomBytes(16).toString("base64url"),
    next,
    iat: Math.floor(Date.now() / 1000),
  };
  const token = pack("corsair-oauth-state-v1", payload);
  return {
    token,
    cookie: {
      name: STATE_COOKIE,
      value: token,
      options: cookieOptions(STATE_TTL_SECONDS),
    },
  };
}

export function clearedStateCookie() {
  return { name: STATE_COOKIE, value: "", options: cookieOptions(0) };
}

/** Verifies the returned `state` against the cookie. Returns the redirect target. */
export function verifyOAuthState(
  cookieHeader: string | null | undefined,
  stateParam: string | null,
): { ok: true; next: string } | { ok: false; reason: string } {
  if (!stateParam) return { ok: false, reason: "Missing state parameter" };

  const fromCookie = readCookie(cookieHeader, STATE_COOKIE);
  if (!fromCookie) return { ok: false, reason: "Sign-in session expired" };

  // Compare the whole signed token, so a valid token minted for another browser
  // is still rejected.
  const a = Buffer.from(stateParam, "utf8");
  const b = Buffer.from(fromCookie, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "State mismatch" };
  }

  const payload = unpack<StatePayload>("corsair-oauth-state-v1", stateParam);
  if (!payload) return { ok: false, reason: "State failed verification" };
  if (Math.floor(Date.now() / 1000) - payload.iat > STATE_TTL_SECONDS) {
    return { ok: false, reason: "Sign-in took too long, please retry" };
  }

  // Only ever redirect somewhere inside this app, so `next` cannot be used as an
  // open redirect.
  const next =
    payload.next.startsWith("/") && !payload.next.startsWith("//")
      ? payload.next
      : "/";
  return { ok: true, next };
}
