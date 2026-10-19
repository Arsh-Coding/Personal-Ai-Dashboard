import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForIdentity, signInRedirectUri } from "@/server/googleAuth";
import {
  clearedStateCookie,
  sessionCookieValue,
  verifyOAuthState,
} from "@/server/session";
import { resolveUserFromGoogle } from "@/server/users";

/**
 * Where Google returns after sign-in.
 *
 * This is the only place in the app that issues a session cookie, which is what
 * makes the tenancy rules enforceable — every request's account is whatever was
 * decided here, and nothing downstream can argue with it.
 *
 * Order matters: verify `state` before spending the code, so a replayed or
 * cross-site callback is rejected before it can touch Google or the database.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;
  const cookieHeader = request.headers.get("cookie");

  const fail = (message: string) => {
    const response = NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent(message)}`, origin),
    );
    // Always burn the state cookie, successful or not — it is single-use.
    const cleared = clearedStateCookie();
    response.cookies.set(cleared.name, cleared.value, cleared.options);
    return response;
  };

  // Set when the user cancels at the consent screen, or Google refuses outright.
  const denied = params.get("error");
  if (denied) return fail(denied);

  const state = verifyOAuthState(cookieHeader, params.get("state"));
  if (!state.ok) return fail(state.reason);

  const code = params.get("code");
  if (!code) return fail("Missing authorization code");

  try {
    const identity = await exchangeCodeForIdentity({
      code,
      redirectUri: signInRedirectUri(origin),
    });

    const user = await resolveUserFromGoogle(identity);

    const response = NextResponse.redirect(new URL(state.next, origin));
    const session = sessionCookieValue(user.id);
    response.cookies.set(session.name, session.value, session.options);
    const cleared = clearedStateCookie();
    response.cookies.set(cleared.name, cleared.value, cleared.options);
    return response;
  } catch (e) {
    console.error("Google sign-in callback failed:", e);
    return fail(e instanceof Error ? e.message : "Sign-in failed");
  }
}
