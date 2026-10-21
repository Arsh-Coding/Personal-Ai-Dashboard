import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TRPCReactProvider } from "@/trpc/react";
import { SITE } from "@/lib/site";

const inter = Inter({ subsets: ["latin"] });

// Same name as the Google consent screen and the privacy policy, which is what
// Google checks the homepage against.
export const metadata: Metadata = {
  title: SITE.name,
  description: "Your Gmail, Google Calendar and Google Meet in one dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <body className={`${inter.className} min-h-full bg-slate-950 text-slate-100 antialiased`}>
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
