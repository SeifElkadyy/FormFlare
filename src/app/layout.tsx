import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BRAND } from "@/lib/brand";
import { THEME_BOOTSTRAP } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.tagline,
};

/*
 * Typed explicitly rather than with Next's generated `LayoutProps<"/">`.
 *
 * That type lives in `.next/types/`, which is a gitignored build artefact — so it
 * exists only after `next build` has run. A fresh clone fails `tsc` with
 * "Cannot find name 'LayoutProps'" before anything has been built.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} light h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
