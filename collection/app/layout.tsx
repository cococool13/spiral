import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://spiralcc.tech"),
  title: "Spiral — Small tools. No bloat. Your data stays yours.",
  description:
    "Spiral Collection is a free, privacy-first suite of lightweight desktop apps for macOS and Windows. No accounts, no telemetry, no background processes.",
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
      "Spiral Collection is a free, privacy-first suite of lightweight desktop apps for macOS and Windows. No accounts, no telemetry, no background processes.",
    images: [
      {
        url: "/images/hero-exit.webp",
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
      "Spiral Collection is a free, privacy-first suite of lightweight desktop apps for macOS and Windows. No accounts, no telemetry, no background processes.",
    images: ["/images/hero-exit.webp"],
  },
};

export const viewport: Viewport = {
  themeColor: "#080809",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
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
