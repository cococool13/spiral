import type { Metadata, Viewport } from "next";
import tokens from "@/lib/brand-tokens.json";
import "./globals.css";

const VOID = tokens.color.void;

export const metadata: Metadata = {
  metadataBase: new URL("https://spiralcc.tech"),
  title: "Spiral — Small tools. No bloat. Your data stays yours.",
  description:
    "Spiral Collection is a free, privacy-first suite of lightweight desktop apps. No accounts, no telemetry, no background processes. Mac, and Windows where each app ships.",
  alternates: { canonical: "/" },
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "32x32" }],
    apple: [{ url: "/apple-icon.png", sizes: "256x256" }],
  },
  openGraph: {
    type: "website",
    url: "https://spiralcc.tech",
    siteName: "Spiral",
    title: "Spiral — Small tools. No bloat. Your data stays yours.",
    description:
      "Spiral Collection is a free, privacy-first suite of lightweight desktop apps. No accounts, no telemetry, no background processes. Mac, and Windows where each app ships.",
    images: [
      {
        url: "/brand/hero/hero-exit.webp",
        width: 2400,
        height: 1350,
        alt: "A dark corridor with daylight at the far door.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Spiral — Small tools. No bloat. Your data stays yours.",
    description:
      "Spiral Collection is a free, privacy-first suite of lightweight desktop apps. No accounts, no telemetry, no background processes. Mac, and Windows where each app ships.",
    images: ["/brand/hero/hero-exit.webp"],
  },
};

export const viewport: Viewport = {
  themeColor: VOID,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Gates the hidden start state of `.reveal` (globals.css) on script
            actually running, so a blocked or failed bundle still shows the
            page at rest. Inline and first so it lands before first paint. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: one static class toggle, no data
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
        <link
          rel="preload"
          href="/brand/fonts/host-grotesk-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/brand/fonts/host-grotesk-400-italic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
