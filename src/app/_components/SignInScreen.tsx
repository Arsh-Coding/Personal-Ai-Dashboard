import Link from "next/link";
import { SITE } from "@/lib/site";
import { ThemeToggle } from "./ThemeToggle";
import {
  ArrowRightIcon,
  CalendarIcon,
  GoogleIcon,
  LockIcon,
  LogoMark,
  MailIcon,
  ShieldIcon,
  SparklesIcon,
  UserIcon,
  VideoIcon,
} from "./icons";

interface SignInScreenProps {
  /** Message from a failed sign-in callback (`?auth_error=`). */
  error?: string | null;
}

/**
 * The public homepage: what a signed-out visitor sees.
 *
 * This is also the page Google reviews for OAuth brand verification. It has to
 * name the app (matching the consent screen), describe what the app does, and
 * explain why it asks for Google data, all without signing in. So `app/page.tsx`
 * renders it on the server, and the text is in the HTML itself. `Dashboard` also
 * renders it in the browser as a fallback when a session turns out to be invalid.
 *
 * It has no hooks and no browser APIs, which is what lets it work as both a
 * server and a client component. Keep it that way. (`ThemeToggle` is a client
 * component of its own; rendering one from here is fine either way.)
 *
 * Sign-in is a plain link rather than a fetch: it's a full navigation to Google
 * and back, and `/api/auth/signin` has to set the CSRF state cookie on a real
 * response.
 */

const TONES = {
  amber: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-300",
  violet: "bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-300",
  sky: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-300",
  fuchsia: "bg-fuchsia-500/10 text-fuchsia-600 ring-fuchsia-500/20 dark:text-fuchsia-300",
  emerald: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-300",
} as const;

const FEATURES = [
  {
    title: "Gmail",
    body: "Your inbox in one view. Read full messages, with remote images blocked until you allow them, and write and send email.",
    icon: MailIcon,
    tone: TONES.amber,
  },
  {
    title: "Google Calendar",
    body: "Your upcoming agenda and today's schedule, events you create, and private notes on any event.",
    icon: CalendarIcon,
    tone: TONES.violet,
  },
  {
    title: "Google Meet",
    body: "Schedule a meeting in one step. It creates the Meet link, adds the event to both calendars and emails the invite.",
    icon: VideoIcon,
    tone: TONES.sky,
  },
  {
    title: "Assistant",
    body: "Ask it to draft an email or set up a meeting. It shows you an editable draft, and nothing is sent until you press the button.",
    icon: SparklesIcon,
    tone: TONES.fuchsia,
  },
];

const DATA_USES = [
  {
    service: "Sign-in",
    use: "Your name, email address and profile picture, to identify your account. Nothing else.",
    icon: UserIcon,
  },
  {
    service: "Gmail",
    use: "To sync your messages so they appear on your dashboard, and to send the emails you write or confirm.",
    icon: MailIcon,
  },
  {
    service: "Google Calendar",
    use: "To show your events, and to create the events and meetings you ask for.",
    icon: CalendarIcon,
  },
  {
    service: "Google Meet",
    use: "To create a Meet link for each meeting you schedule.",
    icon: VideoIcon,
  },
];

function SignInButton({ className = "" }: { className?: string }) {
  return (
    <a
      href="/api/auth/signin"
      className={`btn btn-primary group h-12 rounded-2xl pr-5 pl-2 text-[15px] ${className}`}
    >
      <span className="flex size-8 items-center justify-center rounded-xl bg-white shadow-sm">
        <GoogleIcon className="size-4" />
      </span>
      Continue with Google
      <ArrowRightIcon className="transition-transform duration-200 group-hover:translate-x-1" />
    </a>
  );
}

/**
 * A wordless sketch of the dashboard. Decorative only: hidden from assistive
 * tech, and shapes rather than sample data so nothing in it reads as real.
 */
function AppPreview() {
  const bars = ["from-violet-500 to-indigo-500", "from-sky-500 to-cyan-400", "from-emerald-500 to-teal-400"];
  const avatars = ["from-amber-500 to-orange-400", "from-pink-500 to-rose-400", "from-violet-500 to-indigo-500", "from-sky-500 to-cyan-400"];

  return (
    <div
      aria-hidden="true"
      className="relative mx-auto mt-16 max-w-5xl animate-fade-up [perspective:2000px] sm:mt-20"
      style={{ animationDelay: "320ms" }}
    >
      <div className="absolute inset-x-12 -top-8 h-48 rounded-full bg-brand/25 blur-3xl dark:bg-brand/30" />
      <div className="relative rounded-[1.75rem] border border-line bg-surface/70 p-2 shadow-pop backdrop-blur-xl transition-transform duration-700 ease-out [transform:rotateX(10deg)] hover:[transform:rotateX(0deg)]">
        <div className="overflow-hidden rounded-[1.35rem] border border-line bg-canvas">
          <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
            <span className="size-2.5 rounded-full bg-red-400/80" />
            <span className="size-2.5 rounded-full bg-amber-400/80" />
            <span className="size-2.5 rounded-full bg-emerald-400/80" />
            <span className="ml-3 h-5 w-48 rounded-md bg-surface-2" />
          </div>
          <div className="p-4 sm:p-6">
            <div className="h-2.5 w-24 rounded-full bg-surface-3" />
            <div className="mt-2.5 h-5 w-56 rounded-full bg-linear-to-r from-brand/60 to-fuchsia-500/50 sm:w-72" />
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {["bg-violet-500/15", "bg-sky-500/15", "bg-amber-500/15", "bg-emerald-500/15"].map((tone) => (
                <div key={tone} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <div className="h-2 w-12 rounded-full bg-surface-3" />
                    <div className={`size-5 rounded-md ${tone}`} />
                  </div>
                  <div className="mt-3 h-5 w-10 rounded-md bg-surface-3" />
                  <div className="mt-3 h-1.5 w-full rounded-full bg-surface-2" />
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-12">
              <div className="space-y-2 rounded-xl border border-line bg-surface p-3 sm:col-span-7">
                {bars.map((bar, i) => (
                  <div key={bar} className="flex items-center gap-3 rounded-lg border border-line p-2.5">
                    <div className="w-10 space-y-1">
                      <div className="ml-auto h-2 w-8 rounded-full bg-surface-3" />
                      <div className="ml-auto h-1.5 w-6 rounded-full bg-surface-2" />
                    </div>
                    <div className={`h-8 w-1 rounded-full bg-linear-to-b ${bar}`} />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 rounded-full bg-surface-3" style={{ width: `${70 - i * 12}%` }} />
                      <div className="h-2 w-1/2 rounded-full bg-surface-2" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden space-y-2.5 rounded-xl border border-line bg-surface p-3 sm:col-span-5 sm:block">
                {avatars.map((tone, i) => (
                  <div key={tone} className="flex items-center gap-2.5">
                    <div className={`size-7 shrink-0 rounded-full bg-linear-to-br ${tone}`} />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2 rounded-full bg-surface-3" style={{ width: `${55 + ((i * 17) % 30)}%` }} />
                      <div className="h-1.5 w-4/5 rounded-full bg-surface-2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SignInScreen({ error }: SignInScreenProps) {
  return (
    <div className="relative">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-sm font-semibold tracking-tight text-fg">{SITE.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <a href="/api/auth/signin" className="btn btn-secondary btn-sm">
            Sign in
          </a>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 pt-8 pb-20 sm:pt-14">
        <header className="mx-auto max-w-3xl text-center">
          <div className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-fg-muted shadow-xs backdrop-blur">
            <SparklesIcon className="size-3.5 text-brand-text" />
            Gmail · Calendar · Meet · AI assistant
          </div>
          <h1
            className="mt-6 animate-fade-up text-4xl font-extrabold tracking-tight sm:text-6xl"
            style={{ animationDelay: "60ms" }}
          >
            <span className="text-gradient animate-gradient">{SITE.name}</span>
          </h1>
          <p
            className="mx-auto mt-5 max-w-xl animate-fade-up text-base leading-relaxed text-fg-muted sm:text-lg"
            style={{ animationDelay: "120ms" }}
          >
            Your Gmail, Google Calendar and Google Meet in one dashboard, with an assistant
            that drafts emails and schedules meetings for you to review.
          </p>

          {error && (
            <div role="alert" className="alert alert-danger mx-auto mt-6 max-w-md text-left">
              {error}
            </div>
          )}

          <div className="mt-8 flex animate-fade-up flex-col items-center gap-3" style={{ animationDelay: "180ms" }}>
            <SignInButton />
            <p className="mx-auto max-w-md text-center text-[11px] leading-relaxed text-fg-subtle">
              Signing in only shares your name and email address. Access to Gmail, Calendar and
              Meet is requested separately afterwards, and you can decline it.
            </p>
          </div>
        </header>

        <AppPreview />

        <section aria-labelledby="features-heading" className="mt-24">
          <div className="text-center">
            <p className="text-xs font-semibold tracking-wider text-brand-text uppercase">Everything in one place</p>
            <h2 id="features-heading" className="mt-2 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              What it does
            </h2>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="card group relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-pop"
              >
                <div className="pointer-events-none absolute -top-12 -right-12 size-32 rounded-full bg-brand/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                <span className={`relative flex size-10 items-center justify-center rounded-xl ring-1 ${feature.tone}`}>
                  <feature.icon className="size-5" />
                </span>
                <h3 className="relative mt-4 text-sm font-semibold text-fg">{feature.title}</h3>
                <p className="relative mt-1.5 text-xs leading-relaxed text-fg-muted">{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="data-heading" className="mx-auto mt-24 max-w-3xl">
          <div className="text-center">
            <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-300">
              <ShieldIcon className="size-5" />
            </span>
            <h2 id="data-heading" className="mt-4 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              How your Google data is used
            </h2>
          </div>
          <dl className="card mt-8 divide-y divide-line overflow-hidden">
            {DATA_USES.map((item) => (
              <div key={item.service} className="flex gap-4 p-4 transition-colors hover:bg-surface-2/60 sm:p-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-fg-muted ring-1 ring-line">
                  <item.icon />
                </span>
                <div className="sm:flex sm:flex-1 sm:gap-4">
                  <dt className="text-sm font-semibold text-fg sm:w-36 sm:shrink-0 sm:pt-0.5">{item.service}</dt>
                  <dd className="mt-1 text-xs leading-relaxed text-fg-muted sm:mt-0 sm:pt-0.5">{item.use}</dd>
                </div>
              </div>
            ))}
          </dl>
          <div className="alert alert-info mt-4 p-4 text-xs leading-relaxed">
            <LockIcon className="mt-px size-4 text-emerald-600 dark:text-emerald-400" />
            <p>
              Your data is used only to provide these features to you. It is never sold or
              used for advertising. The assistant sees only what you type to it, never your
              email or calendar. You can revoke access at any time from your Google Account.
              Full details are in the{" "}
              <Link href="/privacy" className="font-medium text-brand-text underline underline-offset-2 hover:text-fg">
                privacy policy
              </Link>
              .
            </p>
          </div>
        </section>

        <section className="relative mx-auto mt-24 max-w-3xl overflow-hidden rounded-3xl border border-line bg-surface p-8 text-center shadow-card sm:p-12">
          <div aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-brand/20 blur-3xl" />
          <LogoMark className="relative mx-auto size-12" />
          <h2 className="relative mt-5 text-2xl font-bold tracking-tight text-fg">Your day, in one view</h2>
          <p className="relative mx-auto mt-2 max-w-md text-sm text-fg-muted">
            Mail, meetings and an assistant that waits for your go-ahead.
          </p>
          <SignInButton className="relative mt-6" />
        </section>
      </div>
    </div>
  );
}
