import type { Metadata } from "next";
import type { AppPage } from "./appPages";

export function appMetadata(
  page: Pick<AppPage, "slug" | "title" | "description">,
): Metadata {
  const url = `/${page.slug}/`;
  const image = {
    url: "/brand/hero/hero-exit.webp",
    width: 2400,
    height: 1350,
    alt: "A dark corridor with daylight at the far door.",
  };

  // Next replaces nested metadata instead of merging it with the root layout.
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: "Spiral",
      title: page.title,
      description: page.description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [image],
    },
  };
}
