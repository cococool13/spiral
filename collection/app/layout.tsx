import type { Metadata, Viewport } from "next";
import Script from "next/script";
import tokens from "@/lib/brand-tokens.json";
import "./globals.css";

const VOID = tokens.color.void;

export const metadata: Metadata = {
  metadataBase: new URL("https://spiralcc.tech"),
  title: "Spiral — Small tools. No bloat. Your data stays yours.",
  description:
    "Spiral Collection — Wallpaper, Slim, Resume, and Clean. One $9.99 license. No telemetry, no background processes. Mac, and Windows where each app ships.",
  alternates: { canonical: "/" },
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "32x32" }],
    apple: [{ url: "/apple-icon.png", sizes: "256x256" }],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Spiral",
    title: "Spiral — Small tools. No bloat. Your data stays yours.",
    description:
      "Spiral Collection — Wallpaper, Slim, Resume, and Clean. One $9.99 license. No telemetry, no background processes. Mac, and Windows where each app ships.",
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
      "Spiral Collection — Wallpaper, Slim, Resume, and Clean. One $9.99 license. No telemetry, no background processes. Mac, and Windows where each app ships.",
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
        <Script
          id="whop-pixel"
          strategy="afterInteractive"
        >{`!function(w,d,s,u,n,a,b){if(w[n])return;a=w[n]={q:[],t:+new Date,s:[],o:u,track:function(){a.q.push([+new Date].concat([].slice.call(arguments)))},setScope:function(){a.s=[].slice.call(arguments).filter(function(x){return typeof x==="string"});a.q.push([+new Date,"setScope"].concat(a.s))},scope:function(){var c=[].slice.call(arguments);return{track:function(){a.q.push([+new Date].concat([].slice.call(arguments)).concat([{__scope:c}]))}}}};b=d.createElement(s);b.async=1;b.src=u+"/s.js";d.getElementsByTagName(s)[0].parentNode.insertBefore(b,d.getElementsByTagName(s)[0])}(window,document,"script","https://t.whop.tw","whop");
whop.setScope("biz_7zg61bpda9b8vR");
whop.track("page");`}</Script>
      </body>
    </html>
  );
}
