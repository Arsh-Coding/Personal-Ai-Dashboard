import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TRPCReactProvider } from "@/trpc/react";
import { ToastProvider } from "@/app/_components/Toaster";
import { SITE } from "@/lib/site";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/theme";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const siteVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();

// Same name as the Google consent screen and the privacy policy, which is what
// Google checks the homepage against.
export const metadata: Metadata = {
  title: SITE.name,
  description: "Your Gmail, Google Calendar and Google Meet in one dashboard.",
  /**
   * Google Search Console ownership proof. Google's OAuth brand verification
   * requires the homepage domain to be verified there, and a `*.vercel.app`
   * address can't take DNS records, so the HTML-tag method is the one that
   * works. The value is the `content` of the tag Search Console shows.
   * Not a secret, but kept in env so each deployment can use its own.
   */
  verification: siteVerification ? { google: siteVerification } : undefined,
};

/** Browser chrome (mobile address bar) matches the page in either theme. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5fb" },
    { media: "(prefers-color-scheme: dark)", color: "#06070f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `data-theme` is corrected by the script before first paint, so the
    // server's default never shows; `suppressHydrationWarning` covers that
    // attribute (and the `color-scheme` style) differing at hydration.
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      className={`${inter.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full antialiased">
        <AmbientBackground />
        <TRPCReactProvider>
          <ToastProvider>{children}</ToastProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}

/**
 * Two slow-drifting color fields behind everything. Fixed and behind the
 * content, so they never scroll or take clicks, and kept as siblings of the
 * app rather than ancestors: their blur and transforms would otherwise trap
 * `position: fixed` descendants.
 */
function AmbientBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Centred with `left` rather than a translate, which the float keyframes would override. */}
      <div className="absolute -top-48 left-[calc(50%-30rem)] h-[36rem] w-[60rem] animate-float rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--ui-brand)_22%,transparent),transparent)] opacity-70 dark:opacity-100" />
      <div className="absolute top-1/3 -right-40 size-[32rem] animate-float-slow rounded-full bg-[radial-gradient(closest-side,rgb(217_70_239/0.12),transparent)] dark:bg-[radial-gradient(closest-side,rgb(217_70_239/0.14),transparent)]" />
      <div className="absolute -bottom-40 -left-40 size-[30rem] animate-float rounded-full bg-[radial-gradient(closest-side,rgb(56_189_248/0.1),transparent)]" />
      {/* Fine dot grid, faded out below the fold. */}
      <div className="absolute inset-0 bg-[radial-gradient(var(--ui-line-strong)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_60%)] bg-[size:24px_24px] opacity-40 dark:opacity-30" />
    </div>
  );
}
