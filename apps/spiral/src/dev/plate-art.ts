function cssColor(name: string): string {
  if (typeof document === "undefined" || !document.body) return "currentColor";
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  if (!color || color === "rgba(0, 0, 0, 0)") return "currentColor";
  return color;
}

function palette() {
  return {
    // Pages are paper in a dark room, so draw them light whatever the theme.
    stock: cssColor("--room-paper"),
    ink: cssColor("--room"),
    red: cssColor("--glass-500"),
    rule: cssColor("--room-mute"),
  };
}

function seed(id: string): number {
  let value = 0;
  for (const char of id) value = (value * 33 + char.charCodeAt(0)) >>> 0;
  return value;
}

export function plateThumb(id: string): string {
  const { stock, ink, red, rule } = palette();
  const n = seed(id);
  const bars = 3 + (n % 4);
  let shapes = "";
  for (let i = 0; i < bars; i += 1) {
    const x = 16 + ((n >> (i * 3)) % 200);
    const w = 36 + ((n >> i) % 80);
    const y = 28 + i * 22;
    const h = 12 + (i % 3) * 6;
    const fill = i === bars - 1 ? red : ink;
    shapes += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="${stock}"/><rect x="8" y="8" width="304" height="164" fill="none" stroke="${rule}" stroke-width="1"/>${shapes}<path d="M14 14h10M14 14v10M306 14h-10M306 14v10M14 166h10M14 166v-10M306 166h-10M306 166v-10" fill="none" stroke="${ink}" stroke-width="1"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// The real templates (src-tauri/crates/resume-core/src/templates/mod.rs, DocxStyle):
// font, name size and body size in half-points, and the four layout switches.
// The mock draws the same facts the real helper would, so review screenshots
// show a page, not placeholder bars. It never changes a value it is given.
interface Look {
  name: string;
  serif: boolean;
  nameSize: number;
  bodySize: number;
  centered?: boolean;
  rule?: boolean;
  shaded?: boolean;
  rail?: boolean;
}

export const LOOKS: Record<string, Look> = {
  column: { name: "Column", serif: true, nameSize: 38, bodySize: 21, centered: true },
  ledger: { name: "Ledger", serif: true, nameSize: 36, bodySize: 21, rail: true },
  sheet: { name: "Sheet", serif: false, nameSize: 32, bodySize: 20 },
  rule: { name: "Rule", serif: true, nameSize: 40, bodySize: 21, rule: true },
  card: { name: "Card", serif: false, nameSize: 40, bodySize: 20, shaded: true },
  bullet: { name: "Bullet", serif: true, nameSize: 24, bodySize: 21, centered: true, rule: true },
  brief: { name: "Brief", serif: false, nameSize: 30, bodySize: 20, centered: true, rule: true },
  chronicle: { name: "Chronicle", serif: true, nameSize: 28, bodySize: 21, centered: true, rule: true },
  index: { name: "Index", serif: true, nameSize: 28, bodySize: 21, rule: true },
  timeline: { name: "Timeline", serif: true, nameSize: 34, bodySize: 21 },
  blend: { name: "Blend", serif: false, nameSize: 40, bodySize: 19 },
  lead: { name: "Lead", serif: true, nameSize: 36, bodySize: 20, centered: true, rule: true },
};

// resume-core/src/accent.rs, without the leading mark (the hex gate scans src/).
export const ACCENT_HEX: [string, string][] = [
  ["ink", "111111"],
  ["slate", "44515c"],
  ["navy", "1f3352"],
  ["forest", "27452f"],
  ["oxblood", "5e1f1f"],
  ["plum", "4a2545"],
  ["teal", "1f4f4a"],
  ["copper", "6b3f2a"],
  ["charcoal", "2b2d31"],
  ["wine", "4a1c28"],
];

interface PageDate {
  raw?: string;
}
interface PageEntry {
  title?: string;
  organization?: string;
  institution?: string;
  credential?: string;
  location?: string;
  start?: PageDate;
  end?: PageDate;
  bullets?: { text?: string }[];
  notes?: { text?: string }[];
}
export interface PageDoc {
  contact?: { name?: string; email?: string; phone?: string; location?: string; links?: string[] };
  headline?: string;
  summary?: string;
  experience?: PageEntry[];
  education?: PageEntry[];
  projects?: PageEntry[];
  skills?: { label?: string; items?: string[] }[];
}

const esc = (text: string) => text.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

function wrap(text: string, size: number, width: number): string[] {
  const max = Math.max(8, Math.floor(width / (size * 0.5)));
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + word).length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** One US Letter page set in the chosen template, from the doc's own facts. */
export function pageArt(doc: PageDoc, look: string, accent: string): string {
  const style = LOOKS[look] ?? LOOKS.column;
  const hex = ACCENT_HEX.find(([id]) => id === accent)?.[1] ?? "111111";
  const tone = `#${hex}`;
  const ink = "rgb(17 17 17)";
  const quiet = "rgb(85 85 85)";
  const font = style.serif ? "Charter, 'Iowan Old Style', Georgia, serif" : "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const body = style.bodySize / 2;
  const left = 54;
  const right = 558;
  const width = right - left;
  const mid = style.centered ? 306 : left;
  const anchor = style.centered ? "middle" : "start";
  const out: string[] = [];
  let y = 66;
  const text = (x: number, size: number, fill: string, value: string, extra = "") =>
    out.push(`<text x="${x}" y="${y.toFixed(1)}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`);

  const c = doc.contact ?? {};
  if (style.shaded) out.push(`<rect x="0" y="0" width="612" height="${y + 46}" fill="rgb(240 239 236)"/>`);
  const nameSize = style.nameSize / 2;
  y += nameSize * 0.4;
  text(mid, nameSize, tone, c.name || "", `text-anchor="${anchor}" font-weight="${style.serif ? 400 : 600}"`);
  y += body + 8;
  const contact = [c.email, c.phone, c.location, ...(c.links ?? [])].filter((part): part is string => Boolean(part));
  text(mid, body - 1, quiet, contact.join("  ·  "), `text-anchor="${anchor}"`);
  if (doc.headline) {
    y += body + 4;
    text(mid, body, ink, doc.headline, `text-anchor="${anchor}" font-style="italic"`);
  }
  y += style.shaded ? 34 : 18;
  if (doc.summary) {
    for (const line of wrap(doc.summary, body, width)) {
      text(left, body, ink, line);
      y += body * 1.35;
    }
    y += 4;
  }

  const heading = (label: string) => {
    y += 10;
    text(left, body - 1, tone, label.toUpperCase(), `font-weight="600" letter-spacing="1.2"`);
    y += 5;
    if (style.rule) out.push(`<rect x="${left}" y="${y.toFixed(1)}" width="${width}" height="0.6" fill="${tone}"/>`);
    y += body + 4;
  };
  const dates = (entry: PageEntry) => [entry.start?.raw, entry.end?.raw].filter(Boolean).join(" – ");
  const entries = (label: string, list: PageEntry[] | undefined) => {
    if (!list || list.length === 0) return;
    heading(label);
    for (const entry of list) {
      const what = entry.title || entry.credential || "";
      const where = entry.organization || entry.institution || "";
      const x = style.rail ? left + 92 : left;
      if (style.rail) text(left, body - 1, quiet, dates(entry));
      text(x, body, ink, [what, where].filter(Boolean).join(", "), `font-weight="600"`);
      if (!style.rail) text(right, body - 1, quiet, dates(entry), `text-anchor="end"`);
      y += body * 1.35;
      if (entry.location) {
        text(x, body - 1, quiet, entry.location);
        y += body * 1.35;
      }
      for (const item of [...(entry.bullets ?? []), ...(entry.notes ?? [])]) {
        if (!item.text) continue;
        wrap(item.text, body, right - x - 12).forEach((line, index) => {
          if (index === 0) text(x + 2, body, ink, "•");
          text(x + 12, body, ink, line);
          y += body * 1.35;
        });
      }
      y += 6;
    }
  };
  entries("Experience", doc.experience);
  entries("Projects", doc.projects);
  entries("Education", doc.education);
  const skills = (doc.skills ?? []).filter((group) => (group.items ?? []).length > 0);
  if (skills.length > 0) {
    heading("Skills");
    for (const group of skills) {
      text(left, body, ink, `${group.label ? `${group.label}: ` : ""}${(group.items ?? []).join(", ")}`);
      y += body * 1.35;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 612 792" font-family="${esc(font)}"><rect width="612" height="792" fill="rgb(255 255 255)"/>${out.join("")}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
