import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://spiralcc.tech";
  const paths = [
    "",
    "/wallpaper/",
    "/slim/",
    "/clean/",
    "/resume/",
    "/privacy/",
    "/work/",
  ];
  // No lastModified — `new Date()` would make every export look freshly
  // updated and fight cache/CDN fingerprints for an otherwise static site.
  return paths.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.7,
  }));
}
