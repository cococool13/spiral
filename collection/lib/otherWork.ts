export type WorkKind = "Website" | "Print" | "Tool" | "Report";

export interface OtherProject {
  /** Stable id — also the cover filename in /public/work. */
  id: string;
  name: string;
  /** One line. State what it is; never sell it. */
  description: string;
  /** Short kind label — the only metadata a card carries. */
  kind: WorkKind;
  /** Cover image under /public/work. 16:10, 1440×900 source. */
  cover: string;
  /** Alt text for the cover. Describes the screen, not the project. */
  coverAlt: string;
  /** Leave null to render the card without a link until the project is public. */
  href: string | null;
  /** Place, when it is a fact. Never invented. */
  where?: string;
}

export const KIND_FILTERS: Array<"All" | WorkKind> = [
  "All",
  "Website",
  "Print",
  "Tool",
  "Report",
];

export const otherWork: OtherProject[] = [
  {
    id: "coastal-hardware",
    name: "Coastal Hardware",
    description:
      "Static marketing site for Coastal Hardware & Building Supply in Brunswick. Live on Cloudflare Workers.",
    kind: "Website",
    cover: "/work/coastal-hardware.webp",
    coverAlt: "Coastal Hardware home page with a storefront hero and product categories.",
    href: "https://coastal-hardware.cohencool.workers.dev",
    where: "Brunswick, Georgia",
  },
  {
    id: "coastal-pharmacare",
    name: "Coastal PharmaCare",
    description:
      "Marketing site for a closed-door pharmacy, with a contact form on Cloudflare Pages.",
    kind: "Website",
    cover: "/work/coastal-pharmacare.webp",
    coverAlt: "Coastal PharmaCare home page over a coastal marsh photograph.",
    href: "https://coastal-pharmacare.pages.dev",
    where: "Brunswick, Georgia",
  },
  {
    id: "coast-guard-beach",
    name: "Coast Guard Beach Signage",
    description:
      "Print package for Coast Guard Beach: 12×18 wildlife sign, spotting guide, and kids’ bingo card.",
    kind: "Print",
    cover: "/work/coast-guard-beach.webp",
    coverAlt:
      "The “Share the Shore” sign: the Glynn County seal above a photograph of sea turtle hatchlings.",
    href: null,
    where: "St. Simons Island, Georgia",
  },
  {
    id: "retirement-plan-evaluator",
    name: "Retirement Plan Evaluator",
    description:
      "Four-step intake that emails a plan summary PDF. Live on Cloudflare Workers for JCC.",
    kind: "Tool",
    cover: "/work/retirement-plan-evaluator.webp",
    coverAlt: "Step one of the evaluator, a company information form under a stepper.",
    href: "https://jcc-retirement-plan-evaluator.cohencool.workers.dev",
    where: "JCC",
  },
  {
    id: "jcc-secure",
    name: "SECURE Case Study",
    description:
      "Static 401(k) case study for a multi-specialty group — participation up 60%, fees down 26%.",
    kind: "Website",
    cover: "/work/jcc-secure.webp",
    coverAlt: "The case study landing page with a headline and summary figures.",
    href: "https://jcc--case-study.web.app",
    where: "JCC",
  },
  {
    id: "glynn-strategic-plan",
    name: "Glynn County Strategic Plan",
    description:
      "Fixed-page strategic plan report, deck, and companion pieces. Local deliverable — not hosted.",
    kind: "Report",
    cover: "/work/glynn-strategic-plan.webp",
    coverAlt:
      "The strategic plan cover: the Sidney Lanier Bridge at sunset under the title.",
    href: null,
    where: "Glynn County, Georgia",
  },
  {
    id: "propscanner",
    name: "PropScanner",
    description:
      "Signal-only +EV player-prop scanner. De-vigs sharp books; dashboard on Cloudflare Workers.",
    kind: "Tool",
    cover: "/work/propscanner.webp",
    coverAlt: "The scanner's top single picks, each card showing a line and its edge.",
    href: "https://propscanner.cohencool.workers.dev",
  },
];

export function countLine(kind: "All" | WorkKind, n: number): string {
  if (kind === "All") return `${n} things built for other people.`;
  if (kind === "Website") return n === 1 ? "1 website." : `${n} websites.`;
  if (kind === "Print") return n === 1 ? "1 print piece." : `${n} print pieces.`;
  if (kind === "Tool") return n === 1 ? "1 tool." : `${n} tools.`;
  return n === 1 ? "1 report." : `${n} reports.`;
}
