export interface OtherProject {
  name: string;
  description: string;
  /** Leave null to render the card without a link until the project is public. */
  href: string | null;
}

// Placeholder entries — replace with real projects and URLs.
export const otherWork: OtherProject[] = [
  {
    name: "Client sites",
    description: "Marketing and commerce builds for small businesses.",
    href: null,
  },
  {
    name: "Open source",
    description: "Tools and experiments on GitHub.",
    href: "https://github.com/cococool13",
  },
  {
    name: "Windows toolkit",
    description: "A reversible, script-first PC optimization toolkit.",
    href: null,
  },
];
