# Spiral website redesign — Instrument Utility (2026-09-15)

## Brief and target

Complete redesign and rebrand of spiralcc.tech and the shared brand system for
people choosing small desktop tools. First screen: name the collection, show
real product evidence, make the $9.99 one-time license obvious.

**Chosen hybrid (user lock):** Direction 2 colors + Direction 3 design/feel.
- Colors: Cron / Dark Instrument (warm near-black, paper type, single helix CTA)
- Feel: Control / Signal Utility (sharp chrome, mono labels, parts-sheet index,
  framed evidence, sliced display type, no glass pills)

## References inspected

- **Cron** — https://cron.com — style `0528b40d-d5ef-4783-9206-d42fa97ad1d2`.
  Owns palette roles: warm black canvas, white type, one vivid CTA accent.
- **Control** — https://cntrl.site — style `94565ee3-1022-4150-bec1-2863506e2951`.
  Owns composition grammar: 0° radius, mono UI labels, oversized tight display,
  framed product evidence, parts-sheet density.
- **Sleeve** — https://replay.software/sleeve — selector behavior only
  (visitor-controlled preview; no autoplay).
- **B—Line / mono / INK** — researched; not primary for this lock.
- Previews archived under `docs/reference/redesign-previews/`.

Inspo MCP was unavailable this session; research is Refero-only.

## Reference lock

```text
Primary direction: Instrument Utility (Cron color × Control grammar)
Preserve: warm near-black page; paper type; helix as sole chromatic CTA/focus/
  warning; 0° surfaces and controls; mono metadata/nav; real product evidence;
  visitor-controlled showcase; $9.99 one-time facts; source-only honesty
Borrow only: Sleeve’s selector (press to change preview); Cushion’s single
  obvious download/buy verb
Role rules: helix never fills a page section; mute never becomes an accent;
  mono is for labels/data/nav, not body paragraphs
Media: Resume Typst sheets, Slim policy IDs, Wallpaper labelled illustrative
  plate, Clean removal rules — never fake app chrome as screenshots
Reject: paper catalogue islands; glass/stadium CTAs; atmospheric corridor hero;
  red glow; neon second accent; eyebrow kickers; autoplay; fake testimonials;
  warm-cream AI defaults; purple SaaS glow
Token commitments: see brand/tokens.css (Identity 03)
```

## Page structure

1. **Hero (dark)** — sliced display headline, one short line, sharp Buy CTA,
   framed showcase with hairline frame + visitor tabs.
2. **Parts sheet (dark)** — four apps as ruled modules with real evidence.
3. **Rules (dark)** — three ownership claims in bordered cells.
4. **License (dark)** — price, steps, Buy + Download.
5. **Footer** — mono columns + mark signature.

## Product truth (unchanged)

Whop URLs, download routing, privacy copy, unreleased Clean honesty, no
telemetry claims, keyboard/reduced-motion requirements.

## Completion checks

`cd collection && pnpm lint && pnpm typecheck && pnpm build`, desktop/mobile
layout, selector, mobile nav, FAQ/policy/resume expansions on app pages,
focus and reduced motion. Publish remains a separate ask.
