import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.tagline,
};

/*
 * Typed explicitly rather than with Next's generated `LayoutProps<"/">`.
 *
 * That type lives in `.next/types/`, which is a build artefact and gitignored — so it
 * exists only after `next build` has run. A fresh clone (CI, or a deploy-button user)
 * fails `tsc` with "Cannot find name 'LayoutProps'" before anything has been built.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
