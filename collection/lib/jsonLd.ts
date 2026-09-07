/**
 * JSON-LD for the home page. Every string is already on the site (layout
 * metadata, the hero, the app catalogue, the rules board, or the manifesto).
 * No ratings, review counts, or other figures we do not have.
 */
import { apps } from "@/lib/apps";
import { WHOP_CHECKOUT_URL } from "@/lib/whop";

const SITE = "https://spiralcc.tech";

/** Same sentence as `app/layout.tsx` metadata.description. */
const COLLECTION_DESCRIPTION =
  "Spiral Collection — Wallpaper, Slim, and Resume. One $9.99 license. No telemetry, no background processes. Mac, and Windows where each app ships.";

/**
 * Live apps the home page and checkout actually sell. Clean has a page but
 * is not released — it is not in this list and has no Offer.
 */
const LISTED = ["wallpaper", "slim", "resume"] as const;

const OFFER = {
  "@type": "Offer",
  name: "Spiral Collection license",
  description: "One $9.99 license. Unlocks Wallpaper, Slim, and Resume.",
  price: "9.99",
  priceCurrency: "USD",
  url: WHOP_CHECKOUT_URL,
  availability: "https://schema.org/InStock",
};

function operatingSystem(slug: string): string {
  // Slim's only shipped binary is the macOS wizard. The tagline already
  // states that scripts cover the other browsers and platforms.
  if (slug === "slim") return "macOS";
  return "macOS, Windows";
}

export function homeJsonLd(): Record<string, unknown> {
  const listedApps = LISTED.map((slug) => {
    const app = apps.find((entry) => entry.slug === slug);
    if (!app) throw new Error(`JSON-LD: catalogue is missing "${slug}".`);
    return app;
  });

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        url: `${SITE}/`,
        name: "Spiral",
        description: COLLECTION_DESCRIPTION,
        publisher: { "@id": `${SITE}/#org` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE}/#org`,
        name: "Spiral",
        url: `${SITE}/`,
        email: "cohencool@icloud.com",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE}/#collection`,
        name: "Spiral Collection",
        url: `${SITE}/`,
        description: COLLECTION_DESCRIPTION,
        applicationCategory: "DesktopApplication",
        operatingSystem: "macOS, Windows",
        offers: OFFER,
        featureList: [
          "One $9.99 license",
          "No telemetry",
          "No background processes",
          "Nothing to sign in to",
          "Source you can read",
        ],
        publisher: { "@id": `${SITE}/#org` },
      },
      {
        "@type": "ItemList",
        "@id": `${SITE}/#apps`,
        name: "Spiral Collection apps",
        numberOfItems: listedApps.length,
        itemListElement: listedApps.map((app, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "SoftwareApplication",
            "@id": `${SITE}${app.page}#app`,
            name: app.name,
            url: `${SITE}${app.page}`,
            description: app.tagline,
            applicationCategory: "DesktopApplication",
            operatingSystem: operatingSystem(app.slug),
            softwareVersion: app.version,
            downloadUrl: app.downloads?.mac.url,
            offers: OFFER,
            publisher: { "@id": `${SITE}/#org` },
          },
        })),
      },
    ],
  };
}
