/**
 * Light/dark theme, shared by the pre-paint script and the toggle.
 *
 * The resolved theme lives on `<html data-theme>`, which is what the CSS reads.
 * The stored preference is only written when the user picks one explicitly;
 * no entry means "follow the OS", so nobody gets pinned to whatever their OS
 * happened to say on their first visit.
 *
 * Safe to import from client components: no server-only dependencies.
 */
export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

export const THEME_STORAGE_KEY = "theme";

/** What the server renders before the script corrects it. */
export const DEFAULT_THEME: Theme = "dark";

/**
 * Runs synchronously in `<head>`, before the body is parsed, so the first
 * paint is already in the right theme. Kept dependency-free and ES5 because it
 * is inlined as a string. `try` covers storage being blocked.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var t=p==="light"||p==="dark"?p:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");var d=document.documentElement;d.setAttribute("data-theme",t);d.style.colorScheme=t}catch(e){}})()`;
