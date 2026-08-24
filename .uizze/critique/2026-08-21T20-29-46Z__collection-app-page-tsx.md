---
target: collection homepage + apps
total_score: 17
max_score: 32
na_heuristics: 7,10
p0_count: 2
p1_count: 6
timestamp: 2026-08-21T20-29-46Z
slug: collection-app-page-tsx
---
# Spiral collection critique — homepage + apps

Method: dual-agent (A: 01a025ff-0f68-72c1-9a63-82a319a29f79 · B: 01a025ff-0f68-72c1-9a63-82b9b77e869e)

## Heuristics (Persuade / homepage)
1 Visibility 2; 2 Real world 3; 3 Control 2; 4 Consistency 1; 5 Error prevention 3; 6 Recognition 2; 7 n/a; 8 Aesthetic 2; 9 Error recovery 2; 10 n/a.
Total 17/32 Acceptable.

## UI slop score
54/100 defaults leaking.

## Detector
detect.mjs exit 0 with 5 overused-font warnings on Instrument Serif/Sans in collection/app/globals.css. Brand face, but on the Uizze overused list. CLI did not flag italic-serif-display (DOM rule).

## P0
- First viewport: AI warehouse still + slogan, no product, nav hidden until scroll.
- Clean advertised with false facts (Optimize/Storage still stubs; never opened).

## P1
- Sticky 160svh pin vs collection/README ban.
- useOS SSR "other" → duplicate All downloads.
- Identity 01 vs 02 split across surfaces.
- Resume splash 1.8s + Setup LLM upsell first.
- Slim wizard Brave-only vs four-browser copy.
- No favicon, no og:image.

## P2
- App pages are one layout four times.
- Other Work is a second homepage.
- 6 of 12 resume layouts shown.
- Wallpaper blank until user acts; settings fail = blank window.
- Wallpaper fetch URL not host-allowlisted.
