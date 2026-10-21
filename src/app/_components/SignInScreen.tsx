"use client";

interface SignInScreenProps {
  /** Message from a failed sign-in, passed back as `?auth_error=`. */
  error?: string | null;
}

/**
 * What an unauthenticated visitor sees.
 *
 * A plain link rather than a fetch: sign-in is a full navigation to Google and
 * back, and the `/api/auth/signin` route needs to set the CSRF state cookie on a
 * real response.
 */
export function SignInScreen({ error }: SignInScreenProps) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6">
      <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/50 p-8 backdrop-blur-xl">
        <h1 className="bg-linear-to-r from-purple-400 via-indigo-300 to-pink-400 bg-clip-text text-center text-2xl font-extrabold tracking-tight text-transparent">
          Corsair Workspace
        </h1>
        <p className="mt-2 text-center text-xs text-slate-400">
          Your Gmail, Calendar and Meet in one place.
        </p>

        {error && (
          <div className="mt-5 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-[11px] text-red-300">
            {error}
          </div>
        )}

        <a
          href="/api/auth/signin"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-600/20 hover:from-purple-500 hover:to-indigo-500"
        >
          Continue with Google
        </a>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-slate-500">
          Signing in only shares your name and email address. Access to your mail
          and calendar is requested separately, afterwards, and you can decline it.
        </p>
      </div>
    </div>
  );
}
