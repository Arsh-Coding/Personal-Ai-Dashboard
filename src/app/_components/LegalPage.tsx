import Link from "next/link";
import { SITE } from "@/lib/site";

/**
 * Shared frame for the privacy policy and terms.
 *
 * Both must be readable without signing in: Google's consent screen links to
 * them, and anyone deciding whether to grant access reads them first.
 */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-xs font-medium text-indigo-400 hover:text-indigo-300">
        ← Back to {SITE.name}
      </Link>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-100">{title}</h1>
      <p className="mt-1 text-xs text-slate-500">Last updated: {SITE.lastUpdated}</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-slate-300 [&_a]:text-indigo-400 [&_a]:underline [&_a:hover]:text-indigo-300 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-100 [&_li]:mt-1 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>

      <nav aria-label="Legal" className="mt-12 flex gap-4 border-t border-slate-800 pt-6 text-xs">
        <Link href="/privacy">Privacy policy</Link>
        <Link href="/terms">Terms of service</Link>
        <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
      </nav>
    </main>
  );
}
