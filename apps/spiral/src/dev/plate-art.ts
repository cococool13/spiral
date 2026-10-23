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
    stock: cssColor("--stock"),
    ink: cssColor("--ink"),
    red: cssColor("--red"),
    rule: cssColor("--rule"),
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

export function pageArt(name: string): string {
  const { stock, ink, rule } = palette();
  const safe = name.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 540"><rect width="420" height="540" fill="${stock}"/><text x="36" y="64" fill="${ink}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="22">${safe}</text><rect x="36" y="84" width="140" height="1" fill="${rule}"/><rect x="36" y="120" width="280" height="8" fill="${ink}"/><rect x="36" y="140" width="240" height="8" fill="${rule}"/><rect x="36" y="160" width="260" height="8" fill="${rule}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
