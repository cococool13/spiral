"""Writes the 1440x900 exploration artboards as HTML. Render with render.sh.

Images in img/ are not committed: Wallhaven thumbnails (SFW toplist) and the
brand mark. fetch-images.sh gets them again.
"""

from pathlib import Path

OUT = Path(__file__).parent

ICON_WALL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2.5" width="13" height="11"/><path d="M1.5 11l4-4 3 3 2-2 4 4"/><circle cx="11" cy="5.5" r="1"/></svg>'
ICON_PAGE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M6 7h5M6 9.5h5M6 12h3"/></svg>'
ICON_FIND = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3.5 3.5"/></svg>'
ICON_SIDE = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2.5" width="13" height="11"/><path d="M6 2.5v11"/></svg>'
ICON_TICK = '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 6.5l2.5 2.5L10 3"/></svg>'

WALLS = [
    ("jelye5", "2560 × 1440", "622 KB"),
    ("9okkr1", "3840 × 2288", "2.1 MB"),
    ("vp22dm", "5272 × 2962", "3.8 MB"),
    ("zpvdzv", "5599 × 3149", "5.0 MB"),
    ("xekje3", "3840 × 2160", "2.1 MB"),
    ("yqk2q7", "1920 × 1080", "403 KB"),
    ("zpv5zj", "3840 × 2880", "3.7 MB"),
    ("lygg6r", "4928 × 3280", "1.9 MB"),
    ("pomm99", "5640 × 2400", "2.9 MB"),
    ("jelv1w", "4500 × 2000", "7.6 MB"),
    ("jelyoq", "3840 × 2160", "5.8 MB"),
    ("vp2d98", "5765 × 3243", "5.6 MB"),
    ("9oke91", "1503 × 940", "1.7 MB"),
    ("9ok8q8", "4096 × 2304", "5.3 MB"),
    ("jelrzq", "3840 × 2160", "3.7 MB"),
    ("d8vvlo", "3840 × 2160", "7.1 MB"),
]

MARKS = '<i class="mk tl"></i><i class="mk tr"></i><i class="mk bl"></i><i class="mk br"></i>'

FACTS = [
    ("Contact", [("Name", "Maya Okafor"), ("Email", "maya.okafor@fastmail.com"), ("Phone", "+1 (415) 555-0142"), ("Location", "Oakland, CA")]),
    ("Experience", [("Title", "Senior Product Designer"), ("Employer", "Halden Health"), ("Dates", "Mar 2021 – Present"),
                    ("Title", "Product Designer"), ("Employer", "Ferro Logistics"), ("Dates", "Jun 2017 – Feb 2021")]),
    ("Education", [("School", "University of Washington"), ("Degree", "B.Des., Interaction Design"), ("Dates", "2013 – 2017")]),
]


def page(name, css, body, dark=False):
    cls = ' class="dark"' if dark else ""
    html = f"""<!doctype html>
<html{cls}><head><meta charset="utf-8"><title>{name}</title>
<link rel="stylesheet" href="{css}"></head>
<body>{body}</body></html>
"""
    (OUT / f"{name}.html").write_text(html)


def lights():
    return '<div class="lights"><i></i><i></i><i></i></div>'


def resume_page(scale_cls="sheet"):
    """The user's resume as Spiral typesets it (Column template, ink on paper)."""
    return f"""<div class="{scale_cls}">
  <div class="rp-name">Maya Okafor</div>
  <div class="rp-contact">maya.okafor@fastmail.com · +1 (415) 555-0142 · Oakland, CA</div>
  <div class="rp-h">Experience</div>
  <div class="rp-row"><b>Senior Product Designer, Halden Health</b><span>Mar 2021 – Present</span></div>
  <div class="rp-li">Led redesign of performance reviews for 1,200 clinics; cut review setup from 40 to 12 minutes.</div>
  <div class="rp-li">Built the Halden design system with 2 engineers; 140 components in production.</div>
  <div class="rp-row"><b>Product Designer, Ferro Logistics</b><span>Jun 2017 – Feb 2021</span></div>
  <div class="rp-li">Designed route planning, adopted by 31% of fleet customers in the first year.</div>
  <div class="rp-li">Ran 60+ usability sessions for the dispatch launch.</div>
  <div class="rp-h">Education</div>
  <div class="rp-row"><b>University of Washington</b><span>2013 – 2017</span></div>
  <div class="rp-li">B.Des., Interaction Design</div>
  <div class="rp-h">Skills</div>
  <div class="rp-li">Prototyping in code · Research synthesis · Design systems · SQL</div>
</div>"""


# ---------------------------------------------------------------- A: Proof Plate

A_EXTRA = """<style>
.grid { display: flex; flex-wrap: wrap; gap: 40px 32px; padding: 40px 40px 0; align-content: flex-start; }
.tile { width: 266px; display: flex; flex-direction: column; gap: 10px; }
.tile .img { width: 266px; height: 150px; background-size: cover; background-position: center; display: block; }
.tile .line { justify-content: space-between; }
.tile.applied .line b { color: var(--red); }
.tile .hover { position: absolute; left: 0; right: 0; bottom: 0; height: 30px; background: rgba(23,24,26,.82); color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; font-size: 12px; font-weight: 500; }
.tile .hover .key { color: rgba(255,255,255,.7); }
.tile .prog { position: absolute; left: 0; bottom: 0; height: 3px; width: 64%; background: var(--red); }
.content { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
/* resume */
.sheet { width: 520px; background: #fff; color: #17181a; padding: 44px 48px; font-family: Charter, Georgia, serif; font-size: 10.5px; line-height: 15px; display: flex; flex-direction: column; gap: 4px; }
.rp-name { font-size: 22px; line-height: 28px; font-weight: 700; }
.rp-contact { color: #4a4a46; padding-bottom: 6px; }
.rp-h { font-family: var(--font); font-size: 9px; letter-spacing: .14em; text-transform: uppercase; font-weight: 600; border-bottom: 1px solid #cfcfca; padding: 10px 0 3px; margin-bottom: 2px; }
.rp-row { display: flex; justify-content: space-between; padding-top: 4px; }
.rp-li { padding-left: 10px; color: #2b2b28; }
.facts { width: 560px; flex-shrink: 0; overflow: hidden; padding: 32px 0 0 40px; display: flex; flex-direction: column; gap: 28px; border-right: 1px solid var(--rule); }
.fgroup { display: flex; flex-direction: column; }
.fgroup h3 { font-size: 13px; font-weight: 600; padding-bottom: 8px; }
.frow { display: flex; align-items: center; height: 36px; border-top: 1px solid var(--rule); gap: 0; }
.frow:last-child { border-bottom: 1px solid var(--rule); }
.frow .k { width: 96px; flex-shrink: 0; color: var(--ink-2); font-size: 12px; }
.frow .v { flex: 1; font-size: 13px; }
.frow .m { width: 56px; flex-shrink: 0; display: flex; justify-content: center; color: var(--ink-2); }
.frow.flag .m { color: var(--red); }
.frow.flag .v { color: var(--ink); }
.frow.flag { background: color-mix(in srgb, var(--red) 6%, transparent); }
.mtag { font-family: var(--mono); font-size: 10px; color: var(--red); border: 1px solid var(--red); padding: 0 4px; line-height: 14px; }
.preview { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding-top: 48px; gap: 28px; background: var(--stock-2); }
.steps { display: flex; gap: 2px; align-items: center; font-size: 12px; color: var(--ink-3); }
.steps span { padding: 0 8px; }
.steps span.on { color: var(--ink); font-weight: 600; }
.steps span.done { color: var(--ink-2); }
</style>"""


def a_wallpaper(name, dark=False, refined=False):
    tiles = []
    for i, (wid, res, size) in enumerate(WALLS):
        inner = ""
        line = f'<div class="line"><b>{wid}</b><span>{res}</span><span>{size}</span></div>'
        cls = "tile"
        img_cls = "img plate"
        if i == 1:
            cls += " applied"
            img_cls += " red"
            inner = MARKS
            line = f'<div class="line"><b>On your desktop</b><span>{res}</span><span>{size}</span></div>'
        if i == 6:
            inner = '<div class="hover"><span>Set as wallpaper</span><span class="key">↵</span></div>'
        if i == 4:
            inner = '<div class="prog"></div>'
            line = f'<div class="line"><b>Downloading from wallhaven.cc</b><span>{size}</span></div>'
        tiles.append(f'<div class="{cls}"><div class="{img_cls}" style="background-image:url(img/wh-{wid}.jpg)">{inner}</div>{line}</div>')
    side = f"""<nav class="side">
  <a class="on">{ICON_WALL}Wallpaper</a>
  <a>{ICON_PAGE}Resume</a>
  <div class="foot">Licensed to<br>maya.okafor@fastmail.com</div>
</nav>"""
    body = f"""<div class="win">
<header class="bar">{lights()}<span style="color:var(--ink-2);display:flex">{ICON_SIDE}</span><span style="width:96px"></span><h1>Wallpaper</h1><span class="spacer"></span>
  <div class="seg"><span class="on">Toplist</span><span>General</span><span>Anime</span><span>People</span></div>
  <div class="search">{ICON_FIND}<span>Search Wallhaven</span><span class="spacer"></span><span class="key">/</span></div>
</header>
<div class="body">{side}
<main class="content"><div class="grid">{''.join(tiles)}</div></main>
</div>
<footer class="status"><span><span class="dot"></span>&nbsp; wallhaven.cc · SFW only</span><span>16 of 1,204</span><span class="spacer"></span><span>Thumbnail cache 41.2 MB of 200 MB</span></footer>
</div>{A_EXTRA}"""
    page(name, "proof.css", body, dark)


def a_resume(name, dark=False, refined=False):
    groups = []
    for title, rows in FACTS:
        rs = []
        for k, v in rows:
            flag = v == "Mar 2021 – Present"
            mark = '<span class="mtag">CHECK</span>' if flag else ICON_TICK
            rs.append(f'<div class="frow{" flag" if flag else ""}"><span class="k">{k}</span><span class="v">{v}</span><span class="m">{mark}</span></div>')
        groups.append(f'<div class="fgroup"><h3>{title}</h3>{"".join(rs)}</div>')
    side = f"""<nav class="side">
  <a>{ICON_WALL}Wallpaper</a>
  <a class="on">{ICON_PAGE}Resume</a>
  <div class="foot">Licensed to<br>maya.okafor@fastmail.com</div>
</nav>"""
    body = f"""<div class="win">
<header class="bar">{lights()}<span style="color:var(--ink-2);display:flex">{ICON_SIDE}</span><span style="width:96px"></span><h1>Check</h1>
  <div class="steps"><span class="done">Import</span>›<span class="on">Check</span>›<span>Style</span>›<span>Format</span>›<span>Build</span></div>
  <span class="spacer"></span><span class="btn">Back</span><span class="btn primary">Choose a style</span></header>
<div class="body">{side}
<section class="facts">{''.join(groups)}</section>
<section class="preview"><div class="plate">{MARKS}{resume_page()}</div>
<div class="line"><b>maya-okafor-resume.pdf</b><span>1 page</span><span>19 facts read</span><span style="color:var(--red-text)">1 to check</span></div></section>
</div>
<footer class="status"><span>Read from maya-okafor-resume.pdf on this Mac</span><span class="spacer"></span><span>No connection used</span></footer>
</div>{A_EXTRA}"""
    page(name, "proof.css", body, dark)


def a_picker(name, dark=False, refined=False):
    body = f"""<div class="win" style="align-items:center">
<header class="bar" style="width:100%;border-bottom:0">{lights()}</header>
<div style="flex:1;display:flex;flex-direction:column;align-items:center;padding-top:72px;gap:56px">
  <img src="img/mark-red.svg" style="height:40px">
  <h1 style="font-size:32px;line-height:40px;font-weight:600">Which tools do you want?</h1>
  <div style="display:flex;gap:72px;align-items:flex-start">
    <div style="display:flex;flex-direction:column;gap:18px;width:400px">
      <div class="plate red" style="width:400px;height:250px;background:url(img/wh-9okkr1.jpg) center/cover">{MARKS}</div>
      <div style="display:flex;align-items:center;gap:10px"><span class="cbox on"></span><b style="font-size:17px;font-weight:600">Wallpaper</b></div>
      <div class="line">Wallhaven, SFW only. Click to apply.</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:18px;width:400px">
      <div class="plate red" style="width:400px;height:250px;background:var(--stock-2);overflow:hidden;display:flex;justify-content:center;padding-top:24px">{MARKS}<div style="transform:scale(.62);transform-origin:top center">{resume_page()}</div></div>
      <div style="display:flex;align-items:center;gap:10px"><span class="cbox on"></span><b style="font-size:17px;font-weight:600">Resume</b></div>
      <div class="line">PDF or Word out. No fact changes.</div>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;align-items:center;gap:14px"><span class="btn primary lg">Continue</span><span class="line">Change this later in Settings.</span></div>
</div></div>{A_EXTRA}
<style>.cbox{{width:16px;height:16px;border:1.5px solid var(--ink-2);border-radius:4px;display:inline-block}}.cbox.on{{background:var(--ink);border-color:var(--ink);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='white' stroke-width='1.8'%3E%3Cpath d='M2.5 6.5l2.3 2.3L9.5 3.5'/%3E%3C/svg%3E");background-size:12px;background-position:center;background-repeat:no-repeat}}</style>"""
    page(name, "proof.css", body, dark)



# ---------------------------------------------------------------- B: Chip Deck (assigned)

B_CSS = """<style>
@font-face { font-family: "Host Grotesk"; font-weight: 400; src: url("../../../brand/fonts/host-grotesk-400.woff2"); }
@font-face { font-family: "Host Grotesk"; font-weight: 600; src: url("../../../brand/fonts/host-grotesk-600.woff2"); }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 1440px; height: 900px; overflow: hidden; font: 13px/18px "Host Grotesk", system-ui; color: #1d1c22; background: #e7d8b1; }
.win { height: 900px; display: flex; flex-direction: column; background: #e7d8b1; }
.top { height: 64px; background: #424153; color: #f3eee0; display: flex; align-items: flex-end; gap: 6px; padding: 0 24px; position: relative; }
.lights { position: absolute; left: 20px; top: 14px; display: flex; gap: 8px; }
.lights i { width: 12px; height: 12px; border-radius: 50%; display: block; background: #ff5f57; } .lights i+i { background: #febc2e; } .lights i+i+i { background: #28c840; }
.tab { height: 36px; padding: 0 22px; display: flex; align-items: center; font-weight: 600; font-size: 14px; border-radius: 10px 10px 0 0; color: #c9c4d8; }
.tab.on { background: #e7d8b1; color: #1d1c22; }
.chips { display: flex; gap: 8px; padding: 20px 32px 0; align-items: center; }
.chip { width: 28px; height: 28px; border-radius: 6px; border: 2px solid rgba(0,0,0,.12); }
.chip.on { outline: 2px solid #1d1c22; outline-offset: 2px; }
.search { margin-left: auto; height: 32px; width: 300px; border-radius: 8px; background: #f3eee0; display: flex; align-items: center; padding: 0 12px; color: #6d6878; }
.grid { display: flex; flex-wrap: wrap; gap: 28px 24px; padding: 28px 32px; }
.t { width: 324px; background: #f3eee0; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.t .img { height: 172px; border-radius: 6px; background-size: cover; background-position: center; }
.sw { display: flex; gap: 0; height: 22px; border-radius: 4px; overflow: hidden; }
.sw span { flex: 1; font: 10px/22px ui-monospace, monospace; padding-left: 6px; color: rgba(255,255,255,.85); }
.sw span.lt { color: rgba(0,0,0,.6); }
.meta { display: flex; justify-content: space-between; font: 11px ui-monospace, monospace; color: #5d5868; padding: 0 2px; }
.btn { height: 40px; padding: 0 22px; border-radius: 10px; background: #1d1c22; color: #f3eee0; display: inline-flex; align-items: center; font-weight: 600; font-size: 14px; }
</style>"""

B_COLORS = [("#424153", "#999999", "#e7d8b1"), ("#000000", "#424153", "#0099cc"), ("#424153", "#999999", "#000000"),
            ("#cccccc", "#424153", "#999999"), ("#000000", "#424153", "#999999"), ("#000000", "#663300", "#424153"),
            ("#000000", "#424153", "#999999"), ("#000000", "#999999", "#424153")]


def sw(cols):
    light = {"#cccccc", "#999999", "#e7d8b1"}
    return '<div class="sw">' + "".join(f'<span class="{"lt" if c in light else ""}" style="background:{c}">{c}</span>' for c in cols) + "</div>"


def b_wallpaper(name):
    order = ["9okkr1", "jelye5", "vp22dm", "zpvdzv", "xekje3", "yqk2q7", "jelyoq", "lygg6r"]
    meta = {w[0]: w for w in WALLS}
    tiles = "".join(f'<div class="t"><div class="img" style="background-image:url(img/wh-{w}.jpg)"></div>{sw(B_COLORS[i])}<div class="meta"><span>{w}</span><span>{meta[w][1]}</span></div></div>' for i, w in enumerate(order))
    chips = "".join(f'<span class="chip{" on" if c == "#424153" else ""}" style="background:{c}"></span>' for c in ["#660000", "#990000", "#cc6633", "#ffcc33", "#669900", "#0099cc", "#424153", "#333399", "#999999", "#000000"])
    body = f"""<div class="win"><div class="top"><div class="lights"><i></i><i></i><i></i></div><span style="width:72px"></span><span class="tab on">Wallpaper</span><span class="tab">Resume</span></div>
<div class="chips">{chips}<span style="padding-left:12px;font-weight:600">Slate</span><div class="search">Search Wallhaven</div></div>
<div class="grid">{tiles}</div></div>{B_CSS}"""
    page(name, "proof.css", body)


def b_picker(name):
    body = f"""<div class="win" style="background:#424153;align-items:center;position:relative">
<div class="lights"><i></i><i></i><i></i></div>
<h1 style="color:#f3eee0;font-size:44px;line-height:52px;font-weight:600;padding-top:96px">Pick your tools</h1>
<div style="display:flex;gap:56px;padding-top:64px;align-items:flex-start">
 <div style="width:360px;background:#e7d8b1;border-radius:14px;padding:12px 12px 20px;transform:rotate(-4deg);display:flex;flex-direction:column;gap:14px">
  <div style="height:300px;border-radius:8px;background:url(img/wh-9okkr1.jpg) center/cover"></div>
  <div style="display:flex;justify-content:space-between;align-items:center;padding:0 8px"><b style="font-size:22px">Wallpaper</b><span style="width:26px;height:26px;border-radius:50%;background:#1d1c22"></span></div>
  {sw(B_COLORS[0])}</div>
 <div style="width:360px;background:#f3eee0;border-radius:14px;padding:12px 12px 20px;transform:rotate(3deg);display:flex;flex-direction:column;gap:14px">
  <div style="height:300px;border-radius:8px;background:#fff;overflow:hidden;padding:18px 0 0 18px"><div style="transform:scale(.6);transform-origin:top left">{resume_page()}</div></div>
  <div style="display:flex;justify-content:space-between;align-items:center;padding:0 8px"><b style="font-size:22px">Resume</b><span style="width:26px;height:26px;border-radius:50%;background:#1d1c22"></span></div>
  {sw(("#1d1c22", "#2f5d8a", "#f3eee0"))}</div>
</div>
<span class="btn" style="margin-top:72px;background:#e7d8b1;color:#1d1c22">Continue</span>
</div>{B_CSS}{A_EXTRA.replace('.sheet {', '.sheet { margin:0;')}"""
    page(name, "proof.css", body)


def b_resume(name):
    rows = "".join(f'<div style="display:flex;height:40px;align-items:center;border-bottom:1px solid #d9cba3"><span style="width:110px;color:#6b6450">{k}</span><span style="flex:1;font-size:14px">{v}</span></div>' for _, rs in FACTS[:2] for k, v in rs)
    accents = "".join(f'<span class="chip{" on" if c == "#2f5d8a" else ""}" style="background:{c};width:40px;height:40px"></span>' for c in ["#1d1c22", "#2f5d8a", "#7a2e2a", "#3f6b4a", "#6b5a2e"])
    body = f"""<div class="win"><div class="top"><div class="lights"><i></i><i></i><i></i></div><span style="width:72px"></span><span class="tab">Wallpaper</span><span class="tab on">Resume</span></div>
<div style="display:flex;flex:1;gap:48px;padding:40px 48px">
 <div style="width:560px;display:flex;flex-direction:column;gap:20px"><h2 style="font-size:28px;line-height:34px">Check what we read</h2>
  <div style="background:#f3eee0;border-radius:12px;padding:8px 20px">{rows}</div>
  <div style="display:flex;gap:10px;align-items:center">{accents}<span style="padding-left:8px;font:11px ui-monospace,monospace;color:#5d5868">Accent #2f5d8a</span></div></div>
 <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:24px"><div style="border-radius:10px;overflow:hidden;box-shadow:0 12px 32px rgba(66,65,83,.25)">{resume_page()}</div><span class="btn">Choose a style</span></div>
</div></div>{B_CSS}{A_EXTRA}"""
    page(name, "proof.css", body)


# ---------------------------------------------------------------- C: Night Hang

C_CSS = """<style>
@font-face { font-family: "Host Grotesk"; font-weight: 400; src: url("../../../brand/fonts/host-grotesk-400.woff2"); }
@font-face { font-family: "Host Grotesk"; font-weight: 600; src: url("../../../brand/fonts/host-grotesk-600.woff2"); }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 1440px; height: 900px; overflow: hidden; font: 13px/18px "Host Grotesk", system-ui; color: #e9e6df; background: #0c0c0b; }
.win { height: 900px; display: flex; flex-direction: column; position: relative; background: #0c0c0b; color: #e9e6df; }
.lights { position: absolute; left: 20px; top: 20px; display: flex; gap: 8px; }
.lights i { width: 12px; height: 12px; border-radius: 50%; display: block; background: #ff5f57; } .lights i+i { background: #febc2e; } .lights i+i+i { background: #28c840; }
.cmd { margin: 14px auto 0; width: 560px; height: 36px; border: 1px solid #2a2926; border-radius: 8px; display: flex; align-items: center; padding: 0 14px; color: #8f8b82; background: #141412; }
.cmd .k { margin-left: auto; font: 11px ui-monospace, monospace; }
.label { display: flex; flex-direction: column; gap: 6px; width: 240px; }
.label .t { font-size: 20px; line-height: 26px; font-weight: 600; }
.label .r { font: 12px/18px ui-monospace, monospace; color: #a39f96; }
.strip { display: flex; gap: 12px; padding: 0 64px 28px; align-items: flex-end; }
.strip div { width: 148px; height: 84px; background-size: cover; background-position: center; opacity: .55; }
.strip div.on { opacity: 1; outline: 2px solid #e9e6df; outline-offset: 3px; }
.btn { height: 34px; padding: 0 16px; border-radius: 8px; border: 1px solid #3a3935; display: inline-flex; align-items: center; font-weight: 600; }
.btn.p { background: #e9e6df; color: #0c0c0b; border-color: #e9e6df; }
</style>"""


def c_wallpaper(name):
    strip = "".join(f'<div class="{"on" if w == "9okkr1" else ""}" style="background-image:url(img/wh-{w}.jpg)"></div>' for w, _, _ in WALLS[:8])
    body = f"""<div class="win"><div class="lights"><i></i><i></i><i></i></div>
<div class="cmd">Search Wallhaven or type a command<span class="k">⌘K</span></div>
<div style="flex:1;display:flex;gap:48px;padding:40px 64px 32px;align-items:center">
 <div style="width:1000px;height:563px;background:url(img/wh-9okkr1.jpg) center/cover;box-shadow:0 30px 60px rgba(0,0,0,.6)"></div>
 <div class="label"><span class="t">9okkr1</span><span class="r">General · Toplist #23<br>3840 × 2288 px<br>2.1 MB · JPEG<br>from wallhaven.cc</span>
  <div style="display:flex;gap:4px;padding-top:6px"><span style="width:18px;height:18px;background:#424153"></span><span style="width:18px;height:18px;background:#999999"></span><span style="width:18px;height:18px;background:#e7d8b1"></span></div>
  <div style="padding-top:20px;display:flex;gap:8px"><span class="btn p">Set as wallpaper</span></div></div>
</div>
<div class="strip">{strip}</div></div>{C_CSS}"""
    page(name, "proof.css", body)


def c_picker(name):
    body = f"""<div class="win" style="align-items:center"><div class="lights"><i></i><i></i><i></i></div>
<img src="img/mark-red.svg" style="height:36px;margin-top:72px">
<div style="display:flex;gap:96px;padding-top:80px;align-items:flex-end">
 <div style="display:flex;gap:24px;align-items:flex-end"><div style="width:440px;height:290px;background:url(img/wh-jelv1w.jpg) center/cover;box-shadow:0 30px 60px rgba(0,0,0,.6)"></div>
  <div class="label" style="width:150px"><span class="t">Wallpaper</span><span class="r">Wallhaven, SFW.<br>Click to apply.</span><span class="r" style="color:#e9e6df">● On</span></div></div>
 <div style="display:flex;gap:24px;align-items:flex-end"><div style="width:224px;height:290px;background:#fff;overflow:hidden;padding:14px 0 0 14px;box-shadow:0 30px 60px rgba(0,0,0,.6)"><div style="transform:scale(.38);transform-origin:top left">{resume_page()}</div></div>
  <div class="label" style="width:150px"><span class="t">Resume</span><span class="r">PDF or Word.<br>No fact changes.</span><span class="r" style="color:#e9e6df">● On</span></div></div>
</div>
<div style="padding-top:88px;display:flex;flex-direction:column;align-items:center;gap:12px"><span class="btn p">Open Spiral</span><span class="r" style="font:12px ui-monospace,monospace;color:#8f8b82">Click a work to turn it off.</span></div>
</div>{C_CSS}{A_EXTRA}"""
    page(name, "proof.css", body)


def c_resume(name):
    left = "".join(f'<div class="label" style="width:220px;gap:2px;padding-bottom:18px"><span class="r">{k}</span><span style="font-size:15px">{v}</span></div>' for k, v in FACTS[0][1])
    right = "".join(f'<div class="label" style="width:220px;gap:2px;padding-bottom:18px"><span class="r">{k}</span><span style="font-size:15px">{v}</span></div>' for k, v in FACTS[1][1])
    body = f"""<div class="win"><div class="lights"><i></i><i></i><i></i></div>
<div class="cmd">Check · 19 facts · type to jump to a fact<span class="k">⌘K</span></div>
<div style="flex:1;display:flex;gap:56px;padding:44px 72px;justify-content:center;align-items:flex-start">
 <div style="display:flex;flex-direction:column;padding-top:40px">{left}</div>
 <div style="box-shadow:0 30px 60px rgba(0,0,0,.6)">{resume_page()}</div>
 <div style="display:flex;flex-direction:column;padding-top:40px">{right}<span class="btn p" style="margin-top:24px;align-self:flex-start">Choose a style</span></div>
</div></div>{C_CSS}{A_EXTRA}"""
    page(name, "proof.css", body)



# ---------------------------------------------------------------- Final: A refined

F_CSS = """<style>
.grid { gap: 40px 32px; }
.tile { width: 262px; }
.tile .img { width: 262px; height: 147px; }
.tile.focus-ring .img { outline: 2px solid var(--red); outline-offset: 3px; }
.frow .v.edit { height: 30px; display: flex; align-items: center; padding: 0 8px; margin-left: -9px; border: 1px solid var(--rule); border-radius: var(--r-ctl); background: var(--stock-3); outline: 2px solid var(--red); outline-offset: 2px; }
.frow { height: 38px; }
.add { color: var(--ink-2); font-size: 12px; font-weight: 500; padding-top: 10px; }
.desk { width: 1440px; height: 900px; background: url(img/full-zpvdzv.jpg) center/cover; display: flex; align-items: center; justify-content: center; }
.menubar { position: absolute; top: 0; left: 0; right: 0; height: 28px; background: rgba(246,246,244,.72); display: flex; align-items: center; gap: 20px; padding: 0 18px; font-size: 13px; font-weight: 500; color: #17181a; }
.swin { width: 680px; background: var(--stock); border-radius: 12px; overflow: hidden; box-shadow: 0 24px 64px rgba(0,0,0,.35), 0 0 0 1px rgba(0,0,0,.12); display: flex; flex-direction: column; }
.stabs { display: flex; justify-content: center; gap: 4px; padding: 6px 0 10px; border-bottom: 1px solid var(--rule); }
.stab { width: 76px; height: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border-radius: var(--r-ctl); color: var(--ink-2); font-size: 11px; font-weight: 500; }
.stab svg { width: 20px; height: 20px; }
.stab.on { background: var(--stock-2); color: var(--ink); }
.trow { display: flex; align-items: center; gap: 20px; padding: 20px 0; border-bottom: 1px solid var(--rule); }
.trow:last-child { border-bottom: 0; }
.trow .thumb { width: 112px; height: 70px; flex-shrink: 0; background-size: cover; background-position: center; }
.otp { display: flex; gap: 10px; }
.otp span { width: 48px; height: 60px; border: 1px solid var(--rule); border-radius: var(--r-ctl); background: var(--stock-3); display: flex; align-items: center; justify-content: center; font: 500 26px var(--mono); }
.otp span.cur { outline: 2px solid var(--red); outline-offset: 2px; }
.link { color: var(--ink-2); font-size: 12px; font-weight: 500; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--rule); }
</style>"""

ICON_GEAR = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6"/></svg>'
ICON_TOOLS = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="3.5" width="6.5" height="6.5"/><rect x="11" y="3.5" width="6.5" height="6.5"/><rect x="2.5" y="12" width="6.5" height="4.5"/><path d="M11 14.25h6.5"/></svg>'
ICON_KEY = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="6.5" cy="10" r="3.5"/><path d="M10 10h7.5M15 10v3M17.5 10v2"/></svg>'
ICON_ARROW = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M10 3v10M6 9l4 4 4-4M4 16.5h12"/></svg>'


def side(active):
    a = ' class="on"'
    return f"""<nav class="side">
  <div style="display:flex;align-items:center;gap:8px;height:32px;padding:0 10px 8px"><img src="img/mark-red.svg" style="height:18px"><b style="font-size:14px;font-weight:600">Spiral</b></div>
  <a{a if active == "w" else ""}>{ICON_WALL}Wallpaper</a>
  <a{a if active == "r" else ""}>{ICON_PAGE}Resume</a>
  <div class="foot">Licensed to<br>maya.okafor@fastmail.com</div>
</nav>"""


def f_wallpaper(name, dark=False):
    tiles = []
    for i, (wid, res, size) in enumerate(WALLS):
        inner, cls, img_cls = "", "tile", "img plate"
        line = f'<div class="line"><b>{wid}</b><span>{res}</span><span>{size}</span></div>'
        if i == 1:
            inner = MARKS
            line = f'<div class="line"><b style="color:var(--red-text)">On your desktop</b><span>{res}</span><span>{size}</span></div>'
        if i == 6:
            cls += " focus-ring"
            inner = '<div class="hover"><span>Set as wallpaper</span><span class="key">↵</span></div>'
        if i == 5:
            inner = '<div class="prog"></div>'
            line = f'<div class="line"><b>Downloading · wallhaven.cc</b><span>{size}</span></div>'
        tiles.append(f'<div class="{cls}"><div class="{img_cls}" style="background-image:url(img/wh-{wid}.jpg)">{inner}</div>{line}</div>')
    body = f"""<div class="win">
<header class="bar">{lights()}<span style="color:var(--ink-2);display:flex">{ICON_SIDE}</span><span style="width:96px"></span><h1>Wallpaper</h1><span class="spacer"></span>
  <div class="seg"><span class="on">Toplist</span><span>General</span><span>Anime</span><span>People</span></div>
  <div class="search">{ICON_FIND}<span>Search Wallhaven</span><span class="spacer"></span><span class="key">/</span></div>
</header>
<div class="body">{side("w")}
<main class="content"><div class="grid">{''.join(tiles)}</div></main>
</div>
<footer class="status"><span><span class="dot"></span>&nbsp; wallhaven.cc · SFW only</span><span>16 of 1,204</span><span class="spacer"></span><span>Thumbnail cache 41.2 MB of 200 MB</span></footer>
</div>{A_EXTRA}{F_CSS}"""
    page(name, "proof.css", body, dark)


def f_resume(name):
    groups = []
    for title, rows in FACTS:
        rs = []
        for k, v in rows:
            edit = v == "Mar 2021 – Present"
            changed = k == "Phone"
            val = "+1 (415) 555-0124" if changed else v
            dot = '<span class="dot" title="Edited"></span>' if changed else ""
            rs.append(f'<div class="frow"><span class="k">{k}</span><span class="v{" edit" if edit else ""}">{val}</span><span style="width:24px;display:flex;justify-content:center">{dot}</span></div>')
        add = {"Experience": "Add a role", "Education": "Add a school"}.get(title)
        groups.append(f'<div class="fgroup"><h3>{title}</h3>{"".join(rs)}{f"<span class=add>{add}</span>" if add else ""}</div>')
    body = f"""<div class="win">
<header class="bar">{lights()}<span style="color:var(--ink-2);display:flex">{ICON_SIDE}</span><span style="width:96px"></span><h1>Resume</h1>
  <div class="steps"><span class="done">Import</span>›<span class="on">Check</span>›<span>Style</span>›<span>Format</span>›<span>Build</span></div>
  <span class="spacer"></span><span class="btn">Back</span><span class="btn primary">Choose a style</span></header>
<div class="body">{side("r")}
<section class="facts" style="padding-right:40px">{''.join(groups)}</section>
<section class="preview"><div class="plate">{MARKS}{resume_page().replace("555-0142", "555-0124")}</div>
<div class="line"><b>maya-okafor-resume.pdf</b><span>1 page</span><span>19 facts read</span><span style="color:var(--red-text)">1 edited</span></div></section>
</div>
<footer class="status"><span>Read on this Mac</span><span class="spacer"></span><span>No connection used</span></footer>
</div>{A_EXTRA}{F_CSS}"""
    page(name, "proof.css", body)


def f_picker(name):
    def card(title, line, visual, on=True):
        marks = MARKS if on else ""
        box = '<span class="cbox on"></span>' if on else '<span class="cbox"></span>'
        return f"""<div style="display:flex;flex-direction:column;gap:18px;width:400px">
      <div class="plate" style="width:400px;height:250px">{marks}<div style="width:400px;height:250px;overflow:hidden;{visual[0]}">{visual[1]}</div></div>
      <div style="display:flex;align-items:center;gap:10px">{box}<b style="font-size:17px;font-weight:600">{title}</b></div>
      <div class="line">{line}</div></div>"""
    wall = ("background:url(img/wh-9okkr1.jpg) center/cover", "")
    res = ("background:var(--stock-2);display:flex;justify-content:center;padding-top:24px", f'<div style="transform:scale(.62);transform-origin:top center">{resume_page()}</div>')
    body = f"""<div class="win" style="align-items:center">
<header class="bar" style="width:100%;border-bottom:0">{lights()}</header>
<div style="flex:1;display:flex;flex-direction:column;align-items:center;padding-top:64px;gap:56px">
  <img src="img/mark-red.svg" style="height:40px">
  <h1 style="font-size:32px;line-height:40px;font-weight:600">Which tools do you want?</h1>
  <div style="display:flex;gap:72px;align-items:flex-start">
    {card("Wallpaper", "Wallhaven, SFW only. Click to apply.", wall)}
    {card("Resume", "PDF or Word out. No fact changes.", res)}
  </div>
  <div style="display:flex;flex-direction:column;align-items:center;gap:14px"><span class="btn primary lg">Continue</span><span class="line">Change this later in Settings.</span></div>
</div></div>{A_EXTRA}{F_CSS}
<style>.cbox{{width:16px;height:16px;border:1.5px solid var(--ink-2);border-radius:4px;display:inline-block}}.cbox.on{{background:var(--ink);border-color:var(--ink);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='white' stroke-width='1.8'%3E%3Cpath d='M2.5 6.5l2.3 2.3L9.5 3.5'/%3E%3C/svg%3E");background-size:12px;background-position:center;background-repeat:no-repeat}}</style>"""
    page(name, "proof.css", body)


def f_settings(name):
    rows = [
        ("Wallpaper", "img/wh-9okkr1.jpg", "Reaches wallhaven.cc when you search or apply.", True),
        ("Resume", None, "Opens no connection unless you add a model.", False),
    ]
    trs = []
    for title, img, fact, on in rows:
        thumb = f'<div class="thumb" style="background-image:url({img})"></div>' if img else f'<div class="thumb" style="background:var(--stock-2);overflow:hidden;display:flex;justify-content:center;padding-top:6px"><div style="transform:scale(.19);transform-origin:top center">{resume_page()}</div></div>'
        trs.append(f'<div class="trow">{thumb}<div style="flex:1;display:flex;flex-direction:column;gap:4px"><b style="font-size:14px;font-weight:600">{title}</b><span class="line" style="white-space:normal">{fact}</span></div><span class="toggle{" on" if on else ""}"></span></div>')
    body = f"""<div class="desk" style="position:relative"><div class="menubar"><img src="img/mark-red.svg" style="height:14px"><b>Spiral</b><span>File</span><span>Edit</span><span>View</span><span>Window</span><span>Help</span></div>
<div class="swin">
  <div style="height:32px;display:flex;align-items:center;justify-content:center;position:relative"><div class="lights" style="position:absolute;left:0;top:10px;padding-left:14px"><i></i><i></i><i></i></div><b style="font-size:13px;font-weight:600">Tools</b></div>
  <div class="stabs"><span class="stab">{ICON_GEAR}General</span><span class="stab on">{ICON_TOOLS}Tools</span><span class="stab">{ICON_KEY}License</span><span class="stab">{ICON_ARROW}Updates</span></div>
  <div style="padding:8px 32px 16px">{''.join(trs)}</div>
</div></div>{A_EXTRA}{F_CSS}"""
    page(name, "proof.css", body)


def f_license(name):
    body = f"""<div class="win" style="align-items:center">
<header class="bar" style="width:100%;border-bottom:0">{lights()}</header>
<div style="flex:1;display:flex;flex-direction:column;align-items:center;padding-top:72px;gap:40px">
  <img src="img/mark-red.svg" style="height:40px">
  <h1 style="font-size:32px;line-height:40px;font-weight:600">Activate Spiral</h1>
  <div class="seg"><span class="on">Email</span><span>License key</span></div>
  <div style="display:flex;flex-direction:column;align-items:center;gap:28px;padding-top:8px">
    <span style="font-size:14px;color:var(--ink-2)">Enter the code sent to <b style="color:var(--ink);font-weight:500">maya.okafor@fastmail.com</b>.</span>
    <div class="plate" style="padding:24px 28px">{MARKS}<div class="otp"><span>4</span><span>8</span><span>1</span><span class="cur"></span><span></span><span></span></div></div>
    <div class="line"><span>6-digit code</span><span>Checked by Spiral’s license server</span></div>
  </div>
  <div style="display:flex;flex-direction:column;align-items:center;gap:18px"><span class="btn primary lg" style="opacity:.45">Activate</span>
  <div style="display:flex;gap:20px"><span class="link">Send again</span><span class="link">Use a different email</span></div></div>
</div>
<footer class="status" style="width:100%;justify-content:center;border-top:0;height:56px"><span class="link">Buy Spiral — $15</span><span class="link">Lost your key?</span></footer>
</div>{A_EXTRA}{F_CSS}"""
    page(name, "proof.css", body)


if __name__ == "__main__":
    a_picker("A1-picker")
    a_wallpaper("A2-wallpaper")
    a_resume("A3-resume")
    b_picker("B1-picker")
    b_wallpaper("B2-wallpaper")
    b_resume("B3-resume")
    c_picker("C1-picker")
    c_wallpaper("C2-wallpaper")
    c_resume("C3-resume")
    f_picker("F1-picker")
    f_wallpaper("F2-wallpaper")
    f_wallpaper("F2-wallpaper-dark", dark=True)
    f_resume("F3-resume")
    f_settings("F4-settings-tools")
    f_license("F5-license")
