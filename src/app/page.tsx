import { Suspense } from "react";
import { Dashboard } from "@/app/_components/Dashboard";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950">
      {/* Dashboard reads `useSearchParams()` to surface an OAuth failure coming
          back from /oauth/callback, which requires a Suspense boundary. */}
      <Suspense>
        <Dashboard />
      </Suspense>
    </main>
  );
}
