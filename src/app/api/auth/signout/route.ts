import { NextResponse, type NextRequest } from "next/server";
import { clearedSessionCookie } from "@/server/session";

/**
 * Ends the session.
 *
 * Only POST: a GET would let any page log the user out with an `<img>` tag, and
 * would also be liable to be followed by a link prefetcher.
 *
 * Google's own session is deliberately left alone — signing out here should not
 * sign the person out of Gmail in the same browser. The stored OAuth grant is also
 * untouched, so signing back in picks up where they left off without re-consenting.
 */
export async function POST(request: NextRequest) {
  // 303, not the default 307. A 307 tells the browser to repeat the same method,
  // so the sign-out form's POST was replayed against `/`, a page that only answers
  // GET, and the user landed on "HTTP ERROR 405". 303 means "now GET this URL".
  const response = NextResponse.redirect(
    new URL("/", request.nextUrl.origin),
    303,
  );
  const cleared = clearedSessionCookie();
  response.cookies.set(cleared.name, cleared.value, cleared.options);
  return response;
}
