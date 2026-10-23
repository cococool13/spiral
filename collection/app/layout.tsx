import type { Metadata, Viewport } from "next";
import tokens from "@/lib/brand-tokens.json";
import "./globals.css";

const VOID = tokens.color.void;

export const metadata: Metadata = {
  metadataBase: new URL("https://spiralcc.tech"),
  title: "Spiral. Wallpaper and Resume.",
  description:
    "Spiral. Wallpaper and Resume. One $15 license. No telemetry. The app quits when you close the window. Mac and Windows.",
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
      "Spiral. Wallpaper and Resume. One $15 license. No telemetry. The app quits when you close the window. Mac and Windows.",
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
    title: "Spiral. Wallpaper and Resume.",
    description:
      "Spiral. Wallpaper and Resume. One $15 license. No telemetry. The app quits when you close the window. Mac and Windows.",
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
        <link
          rel="preload"
          href="/brand/fonts/host-grotesk-400.woff2"
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
