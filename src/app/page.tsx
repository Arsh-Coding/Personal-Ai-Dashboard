import Link from "next/link";
import { headers } from "next/headers";
import { Suspense } from "react";
import { Dashboard } from "@/app/_components/Dashboard";
import { SignInScreen } from "@/app/_components/SignInScreen";
import { readSessionUserId } from "@/server/session";
import { SITE } from "@/lib/site";

/**
 * Signed out: the public homepage, rendered on the server. Signed in: the
 * dashboard.
 *
 * The split happens here rather than only inside `Dashboard` because Google's
 * OAuth review reads this page, and `Dashboard` is client-only. Rendered there,
 * the HTML Google fetched contained nothing but the footer links. Here, the app
 * name, description and data-use explanation are in the HTML itself.
 *
 * Only the cookie's signature is checked, which is enough to choose a view.
 * Whether the account still exists is the dashboard's question, and it falls
 * back to the same sign-in screen if not.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  let signedIn = false;
  try {
    signedIn = readSessionUserId((await headers()).get("cookie")) !== null;
  } catch {
    // Only fails when CORSAIR_KEK is unset, and then nobody can be signed in.
  }

  if (!signedIn) {
    const authError = (await searchParams).auth_error;
    return (
      <>
        <main className="min-h-screen">
          <SignInScreen error={typeof authError === "string" ? authError : null} />
        </main>
        <LegalFooter />
      </>
    );
  }

  return (
    <>
      <main className="min-h-screen">
        {/* Dashboard reads `useSearchParams()` to surface an OAuth failure coming
            back from /oauth/callback, which requires a Suspense boundary. */}
        <Suspense>
          <Dashboard />
        </Suspense>
      </main>
      <LegalFooter />
    </>
  );
}

/** Google's homepage requirements include a visible privacy policy link. */
function LegalFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-6 text-[11px] text-fg-subtle sm:flex-row">
        <p>{SITE.name}</p>
        <nav aria-label="Legal" className="flex gap-5">
          <Link href="/privacy" className="transition-colors hover:text-fg">
            Privacy policy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-fg">
            Terms of service
          </Link>
        </nav>
      </div>
    </footer>
  );
}
