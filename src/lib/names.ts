/**
 * The signed-in person's first name, for greetings and the workspace title.
 *
 * Google's profile name comes first because it is what the person chose to be
 * called ("Mark Lee" gives "Mark"). Accounts without one fall back to the
 * address: the part before the first dot, underscore, dash, plus or digit, so
 * "mark.lee@…" and "mark_99@…" both give "Mark".
 *
 * Safe to import from client components: no server-only dependencies.
 */
export function firstName(name: string | null | undefined, email: string): string {
  const fromName = name?.trim().split(/\s+/)[0];
  if (fromName) return fromName;

  const local = email.split("@")[0] ?? "";
  const word = local.split(/[._\-+0-9]+/).find(Boolean) ?? "";
  if (!word) return "My";
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
