import type { Metadata, Viewport } from "next";
import "./globals.css";

// The social card: the live hero, rendered by scripts/render-og.mjs (brand/hero/HERO.md).
const OG_IMAGE = {
  url: "/brand/hero/og-card.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Spiral: the red glass toolbar with Wallpaper selected, a Resume tab and a buy button. Buy Spiral, $15 once. Mac and Windows.",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://spiralcc.tech"),
  title: "Spiral. Wallpaper and Resume.",
  description:
    "Spiral. Wallpaper and Resume. One $15 license. Anonymous, privacy-safe usage stats only: no personal data or content, IP discarded, and you can turn it off in Settings. The app quits when you close the window. Mac and Windows.",
  alternates: { canonical: "/" },
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "32x32" }],
    apple: [{ url: "/apple-icon.png", sizes: "256x256" }],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Spiral",
    title: "Spiral. Wallpaper and Resume.",
    description:
      "Spiral. Wallpaper and Resume. One $15 license. Anonymous, privacy-safe usage stats only: no personal data or content, IP discarded, and you can turn it off in Settings. The app quits when you close the window. Mac and Windows.",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Spiral. Wallpaper and Resume.",
    description:
      "Spiral. Wallpaper and Resume. One $15 license. Anonymous, privacy-safe usage stats only: no personal data or content, IP discarded, and you can turn it off in Settings. The app quits when you close the window. Mac and Windows.",
    images: [OG_IMAGE],
  },
};

// The hero's top edge: --glass-400 from brand/tokens.css. Metadata cannot read CSS.
export const viewport: Viewport = {
  themeColor: "rgb(195 56 63)",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/brand/fonts/familjen-grotesk-var.woff2"
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
