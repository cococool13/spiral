import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spiral — Small tools. No bloat. Your data stays yours.",
  description:
    "Spiral Collection is a free, privacy-first suite of lightweight desktop apps for macOS and Windows. No accounts, no telemetry, no background processes.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/branding/fonts/archivo-latin-wdth-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/branding/fonts/ibm-plex-mono-latin-500-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
