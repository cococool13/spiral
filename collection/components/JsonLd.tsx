import { homeJsonLd } from "@/lib/jsonLd";

/** Home-page JSON-LD. Escapes `<` so a future string cannot break the parser. */
export default function JsonLd() {
  const json = JSON.stringify(homeJsonLd()).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD, no user input
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
