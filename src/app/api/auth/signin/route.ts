import { NextResponse, type NextRequest } from "next/server";
import { buildSignInUrl, signInRedirectUri } from "@/server/googleAuth";
import { createOAuthState } from "@/server/session";

/**
 * Starts Google sign-in.
 *
 * GET rather than POST because this is a plain navigation that ends at Google —
 * there is nothing to protect yet, and the CSRF token for the *return* leg is
 * minted here and stored in a cookie.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const next = request.nextUrl.searchParams.get("next") ?? "/";

  try {
    const { token, cookie } = createOAuthState(next);
    const url = await buildSignInUrl({
      redirectUri: signInRedirectUri(origin),
      state: token,
    });

    const response = NextResponse.redirect(url);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (e) {
    console.error("Could not start Google sign-in:", e);
    const message = e instanceof Error ? e.message : "Sign-in unavailable";
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent(message)}`, origin),
    );
  }
}
