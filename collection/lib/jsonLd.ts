/**
 * JSON-LD for the home page. Every string is already on the site.
 * No ratings, review counts, or other figures we do not have.
 */
import { apps } from "@/lib/apps";
import { CHECKOUT_URL } from "@/lib/checkout";

const SITE = "https://spiralcc.tech";

const COLLECTION_DESCRIPTION =
  "Spiral. Wallpaper and Resume. One $15 license. No telemetry. The app quits when you close the window. Mac and Windows.";

const OFFER = {
  "@type": "Offer",
  name: "Spiral license",
  description: "One $15 license for Spiral. It covers Wallpaper and Resume.",
  price: "15.00",
  priceCurrency: "USD",
  url: CHECKOUT_URL,
  availability: "https://schema.org/InStock",
};

export function homeJsonLd(): Record<string, unknown> {
  const product = apps.find((entry) => entry.slug === "spiral");
  if (!product) throw new Error('JSON-LD: catalogue is missing "spiral".');

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
        email: "cohenbcoolidge@gmail.com",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE}/#spiral`,
        name: "Spiral",
        url: `${SITE}/`,
        description: COLLECTION_DESCRIPTION,
        applicationCategory: "DesktopApplication",
        operatingSystem: "macOS, Windows",
        softwareVersion: product.version,
        downloadUrl: product.downloads?.mac.url,
        offers: OFFER,
        featureList: [
          "Wallpaper",
          "Resume",
          "One $15 license",
          "No telemetry",
          "Nothing to sign in to",
        ],
        publisher: { "@id": `${SITE}/#org` },
      },
      {
        "@type": "ItemList",
        "@id": `${SITE}/#apps`,
        name: "Spiral",
        numberOfItems: product.sections.length,
        itemListElement: product.sections.map((section, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: section.name,
          url: `${SITE}/#${section.id}`,
        })),
      },
    ],
  };
}
