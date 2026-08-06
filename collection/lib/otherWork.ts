export interface OtherProject {
  /** Stable id — also the cover filename in /public/work. */
  id: string;
  name: string;
  /** One line. State what it is; never sell it. */
  description: string;
  /** Short kind label — the only metadata a card carries. */
  kind: string;
  /** Cover image under /public/work. 16:10, 1440×900 source. */
  cover: string;
  /** Alt text for the cover. Describes the screen, not the project. */
  coverAlt: string;
  /** Leave null to render the card without a link until the project is public. */
  href: string | null;
}

export const otherWork: OtherProject[] = [
  {
    id: "coastal-hardware",
    name: "Coastal Hardware",
    description: "Marketing site for a family hardware store in Brunswick, Georgia.",
    kind: "Website",
    cover: "/work/coastal-hardware.webp",
    coverAlt: "Coastal Hardware home page with a storefront hero and product categories.",
    href: null,
  },
  {
    id: "coastal-pharmacare",
    name: "Coastal PharmaCare",
    description: "Site for a closed-door pharmacy, with one contact form behind it.",
    kind: "Website",
    cover: "/work/coastal-pharmacare.webp",
    coverAlt: "Coastal PharmaCare home page over a coastal marsh photograph.",
    href: null,
  },
  {
    id: "coast-guard-beach",
    name: "Coast Guard Beach Signage",
    description: "Wildlife signage, spotting guide, and bingo card for a public beach.",
    kind: "Print",
    cover: "/work/coast-guard-beach.webp",
    coverAlt:
      "The “Share the Shore” sign: the Glynn County seal above a photograph of sea turtle hatchlings.",
    href: null,
  },
  {
    id: "retirement-plan-evaluator",
    name: "Retirement Plan Evaluator",
    description: "A four-step form that emails a plan summary back as a PDF.",
    kind: "Tool",
    cover: "/work/retirement-plan-evaluator.webp",
    coverAlt: "Step one of the evaluator, a company information form under a stepper.",
    href: null,
  },
  {
    id: "jcc-secure",
    name: "SECURE Case Study",
    description: "A 401(k) case study page for a multi-specialty medical group.",
    kind: "Website",
    cover: "/work/jcc-secure.webp",
    coverAlt: "The case study landing page with a headline and summary figures.",
    href: null,
  },
  {
    id: "glynn-strategic-plan",
    name: "Glynn County Strategic Plan",
    description: "The report, deck, and companion pieces for a county strategic plan.",
    kind: "Report",
    cover: "/work/glynn-strategic-plan.webp",
    coverAlt:
      "The strategic plan cover: the Sidney Lanier Bridge at sunset under the title.",
    href: null,
  },
  {
    id: "propscanner",
    name: "PropScanner",
    description: "A player-prop scanner that de-vigs sportsbook lines. Signal only.",
    kind: "Tool",
    cover: "/work/propscanner.webp",
    coverAlt: "The scanner's top single picks, each card showing a line and its edge.",
    href: null,
  },
];
