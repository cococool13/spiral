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
    strokeWidth: 1.4,
    "aria-hidden": true,
  };
  return <svg {...props}>{children}</svg>;
}

export function WallpaperGlyph({ className }: GlyphProps) {
  return (
    <Icon size={16} className={className}>
      <rect x="1.5" y="2.5" width="13" height="11" />
      <path d="M1.5 11l4-4 3 3 2-2 4 4" />
      <circle cx="11" cy="5.5" r="1" />
    </Icon>
  );
}

export function ResumeGlyph({ className }: GlyphProps) {
  return (
    <Icon size={16} className={className}>
      <path d="M3.5 1.5h6l3 3v10h-9z" />
      <path d="M6 7h5M6 9.5h5M6 12h3" />
    </Icon>
  );
}

export function SearchGlyph({ className }: GlyphProps) {
  return (
    <Icon size={16} className={className}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5l3.5 3.5" />
    </Icon>
  );
}

export function SidebarGlyph({ className }: GlyphProps) {
  return (
    <Icon size={16} className={className}>
      <rect x="1.5" y="2.5" width="13" height="11" />
      <path d="M6 2.5v11" />
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

export function ReturnGlyph({ className }: GlyphProps) {
  return (
    <Icon size={16} className={className}>
      <path d="M12 4v5H5" />
      <path d="M7.5 6.5L5 9l2.5 2.5" />
    </Icon>
  );
}
