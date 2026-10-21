/**
 * Who runs this deployment. Shown on the sign-in, privacy and terms pages.
 *
 * Change these when you deploy your own copy. The privacy policy is a statement
 * by whoever operates the instance, and Google's consent screen should use the
 * same app name and support email.
 *
 * Safe to import from client components: no server-only dependencies.
 */
export const SITE = {
  name: "Personal AI Dashboard",
  contactEmail: "arshpreet.singh.dev@gmail.com",
  /** Bump whenever the privacy policy or terms change. */
  lastUpdated: "October 2026",
} as const;
