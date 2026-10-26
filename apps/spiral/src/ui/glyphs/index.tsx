import type { ReactNode, SVGProps } from "react";

interface GlyphProps {
  className?: string;
}

function Icon({
  size,
  className,
  children,
}: {
  size: number;
  className?: string;
  children: ReactNode;
}) {
  const props: SVGProps<SVGSVGElement> = {
    className,
    viewBox: `0 0 ${size} ${size}`,
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: size >= 22 ? 1.5 : 1.4,
    strokeLinecap: size >= 22 ? "round" : undefined,
    strokeLinejoin: size >= 22 ? "round" : undefined,
    "aria-hidden": true,
  };
  return <svg {...props}>{children}</svg>;
}

export function SearchGlyph({ className }: GlyphProps) {
  return (
    <Icon size={16} className={className}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5l3.5 3.5" />
    </Icon>
  );
}

export function GeneralGlyph({ className }: GlyphProps) {
  return (
    <Icon size={20} className={className}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" />
    </Icon>
  );
}

export function ToolsGlyph({ className }: GlyphProps) {
  return (
    <Icon size={20} className={className}>
      <rect x="2.5" y="3.5" width="6.5" height="6.5" />
      <rect x="11" y="3.5" width="6.5" height="6.5" />
      <rect x="2.5" y="12" width="6.5" height="4.5" />
      <path d="M11 14.25h6.5" />
    </Icon>
  );
}

export function LicenseGlyph({ className }: GlyphProps) {
  return (
    <Icon size={20} className={className}>
      <circle cx="6.5" cy="10" r="3.5" />
      <path d="M10 10h7.5M15 10v3M17.5 10v2" />
    </Icon>
  );
}

export function UpdatesGlyph({ className }: GlyphProps) {
  return (
    <Icon size={20} className={className}>
      <path d="M10 3v10M6 9l4 4 4-4M4 16.5h12" />
    </Icon>
  );
}

/* Pill toolbar set: 22pt grid, 1.5 stroke, round caps (SF Symbols weight "light"). */

export function PillSearchGlyph({ className }: GlyphProps) {
  return (
    <Icon size={22} className={className}>
      <circle cx="9.75" cy="9.75" r="5.75" />
      <path d="M14 14l4.75 4.75" />
    </Icon>
  );
}

export function PillGearGlyph({ className }: GlyphProps) {
  return (
    <Icon size={22} className={className}>
      <circle cx="11" cy="11" r="2.75" />
      <path d="M11 2.75l1.5 2 2.5-.45.85 2.4 2.3 1.1-.75 2.4 1.3 2.2-1.85 1.75-.2 2.5-2.5.35L11 19.25l-2.2-1.4-2.5-.35-.2-2.5L4.25 13.25l1.3-2.2-.75-2.4 2.3-1.1.85-2.4 2.5.45z" />
    </Icon>
  );
}

export function PillImageGlyph({ className }: GlyphProps) {
  return (
    <Icon size={22} className={className}>
      <rect x="3.25" y="4.25" width="15.5" height="13.5" rx="2.5" />
      <circle cx="8.25" cy="9.25" r="1.5" />
      <path d="M3.75 15.75l4.5-4 3.25 2.75 3.25-3.25 3.75 3.75" />
    </Icon>
  );
}

export function PillDocGlyph({ className }: GlyphProps) {
  return (
    <Icon size={22} className={className}>
      <path d="M6 3.25h7.25L17 7v11.75H6z" />
      <path d="M12.75 3.25v4.25H17M8.75 11.5h5.5M8.75 14.75h5.5" />
    </Icon>
  );
}

export function PillShuffleGlyph({ className }: GlyphProps) {
  return (
    <Icon size={22} className={className}>
      <path d="M3.75 6.5H7c4.5 0 3.75 9 8.25 9h3M3.75 15.5H7c1.5 0 2.4-1.1 3.1-2.4M15.25 6.5h3M16.25 4.25l2.25 2.25-2.25 2.25M16.25 13.25l2.25 2.25-2.25 2.25" />
    </Icon>
  );
}

export function PillPlusGlyph({ className }: GlyphProps) {
  return (
    <Icon size={22} className={className}>
      <path d="M11 4.5v13M4.5 11h13" />
    </Icon>
  );
}

export function PillCloseGlyph({ className }: GlyphProps) {
  return (
    <Icon size={22} className={className}>
      <path d="M6 6l10 10M16 6L6 16" />
    </Icon>
  );
}
