import Link from "next/link";
import { Suspense } from "react";
import { Dashboard } from "@/app/_components/Dashboard";

export default function Home() {
  return (
    <>
      <main className="min-h-screen bg-slate-950">
        {/* Dashboard reads `useSearchParams()` to surface an OAuth failure coming
            back from /oauth/callback, which requires a Suspense boundary. */}
        <Suspense>
          <Dashboard />
        </Suspense>
      </main>

      {/* Rendered on the server, outside the client-only dashboard, so the links
          are in the homepage HTML itself. Google's verification checks the
          homepage for a privacy policy link without running scripts. */}
      <footer className="flex justify-center gap-4 border-t border-slate-900 py-6 text-[11px] text-slate-500">
        <Link href="/privacy" className="hover:text-slate-300">
          Privacy policy
        </Link>
        <Link href="/terms" className="hover:text-slate-300">
          Terms of service
        </Link>
      </footer>
    </>
  );
}
