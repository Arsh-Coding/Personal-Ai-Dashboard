import Link from "next/link";
import { SITE } from "@/lib/site";
import { ThemeToggle } from "./ThemeToggle";
import { ChevronLeftIcon, LogoMark } from "./icons";

/**
 * Shared frame for the privacy policy and terms.
 *
 * Both must be readable without signing in: Google's consent screen links to
 * them, and anyone deciding whether to grant access reads them first.
 */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="group flex items-center gap-2.5">
            <LogoMark className="size-7" />
            <span className="text-sm font-semibold tracking-tight text-fg">{SITE.name}</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/"
          className="group inline-flex items-center gap-1 text-xs font-medium text-brand-text hover:text-fg"
        >
          <ChevronLeftIcon className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
          Back to {SITE.name}
        </Link>
        <h1 className="mt-4 animate-fade-up text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-xs text-fg-subtle">Last updated: {SITE.lastUpdated}</p>

        <div className="card mt-8 animate-fade-up space-y-8 p-6 text-sm leading-relaxed text-fg-muted sm:p-8 [&_a]:font-medium [&_a]:text-brand-text [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-fg [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-fg [&_li]:mt-1.5 [&_p]:mt-2 [&_strong]:text-fg [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:marker:text-brand-text/60">
          {children}
        </div>

        <nav
          aria-label="Legal"
          className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-6 text-xs text-fg-subtle [&_a:hover]:text-fg"
        >
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms of service</Link>
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
        </nav>
      </main>
    </>
  );
}
