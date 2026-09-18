"""Generate Maze tab-mark Bench round. Production favicon is Bench take D (T-junction)."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PNG_B64 = re.search(
    r"base64,([^\"']+)", (ROOT / "favicon.svg").read_text(encoding="utf-8")
).group(1)

G = "#00ff00"
G2 = "#00b400"
G3 = "#007000"
GOLD = "#e6c35c"
GOLD2 = "#a88420"
INK = "#f7f4ec"


def svg(body: str, viewBox: str = "0 0 32 32") -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewBox}" '
        f'shape-rendering="crispEdges">\n{body}\n</svg>\n'
    )


def rects(cells, fill, s=1):
    return "\n".join(
        f'  <rect x="{x * s}" y="{y * s}" width="{s}" height="{s}" fill="{fill}"/>'
        for y, x in cells
    )


def grid_walls(lines: list[str], fill=G):
    """'#' wall, '.' or ' ' floor. Center 11x11 in 32 via viewBox."""
    cells = []
    for y, row in enumerate(lines):
        for x, ch in enumerate(row):
            if ch == "#":
                cells.append((x, y))
    body = f'  <rect width="11" height="11" fill="#000"/>\n' + rects(cells, fill)
    return svg(body, "0 0 11 11")


TAKES = {}

TAKES["A"] = svg(
    f'  <image href="data:image/png;base64,{PNG_B64}" width="32" height="32"/>'
)

# Tight crop: drop the MATRIX wordmark band (~bottom 8px) and a little side pad.
TAKES["B"] = svg(
    f'  <image href="data:image/png;base64,{PNG_B64}" width="32" height="32"/>',
    "3 1 26 21",
)

TAKES["C"] = grid_walls(
    [
        "##.########",
        "#.#...#...#",
        "#.###.#.#.#",
        "#.....#.#.#",
        "#####.#.#.#",
        "#.....#.#.#",
        "#.#####.#.#",
        "#.#.....#.#",
        "#.#.#####.#",
        "#.#.......#",
        "#########.#",
    ]
)

TAKES["D"] = grid_walls(
    [
        "#####.#####",
        "#####.#####",
        "#####.#####",
        "#####.#####",
        "#.........#",
        "#.........#",
        "###########",
        "###########",
        "###########",
        "###########",
        "###########",
    ]
)

TAKES["E"] = svg(
    """  <rect width="32" height="32" fill="#000"/>
  <path d="M4 28 V10 H12 V6 H20 V14 H28 V4" fill="none" stroke="#a88420" stroke-width="5" stroke-linejoin="round" stroke-linecap="square"/>
  <path d="M4 28 V10 H12 V6 H20 V14 H28 V4" fill="none" stroke="#e6c35c" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="square"/>
  <rect x="26" y="3" width="4" height="3" fill="#f3de8a"/>"""
)

TAKES["F"] = svg(
    """  <rect width="32" height="32" fill="#000"/>
  <rect x="2" y="6" width="28" height="20" fill="#00b400"/>
  <rect x="4" y="8" width="24" height="16" fill="#000"/>
  <rect x="24" y="12" width="6" height="8" fill="#000"/>
  <rect x="24" y="12" width="2" height="8" fill="#00ff00"/>
  <rect x="4" y="15" width="20" height="2" fill="#00ff00"/>
  <rect x="26" y="13" width="1" height="6" fill="#b6ffb6"/>"""
)

AT = [
    "01110",
    "10001",
    "10101",
    "10110",
    "10000",
    "10001",
    "01110",
    "00010",
]
at_cells = [(x, y) for y, row in enumerate(AT) for x, ch in enumerate(row) if ch == "1"]
at_body = ['  <rect width="32" height="32" fill="#000"/>']
for x, y in at_cells:
    at_body.append(
        f'  <rect x="{6 + x * 4}" y="{1 + y * 4}" width="4" height="4" fill="{G}"/>'
    )
TAKES["G"] = svg("\n".join(at_body))

TAKES["H"] = svg(
    f"""  <rect width="32" height="32" fill="#000"/>
  <polyline points="13,6 5,16 13,26" fill="none" stroke="{G}" stroke-width="3.2" stroke-linejoin="miter" stroke-linecap="square"/>
  <polyline points="19,6 27,16 19,26" fill="none" stroke="{G}" stroke-width="3.2" stroke-linejoin="miter" stroke-linecap="square"/>"""
)

META = {
    "A": {
        "title": "Current (control)",
        "thesis": "32px PNG well + MATRIX wordmark. Pixelates at 16px; too much lettering for a tab.",
    },
    "B": {
        "title": "Well crop",
        "thesis": "Same dithered well, cropped to the pit. No title band.",
    },
    "C": {
        "title": "5×5 1px maze",
        "thesis": "Plan of a tiny perfect maze. Walls are one unit; no title.",
    },
    "D": {
        "title": "T-junction",
        "thesis": "One corridor meeting a crossbar. Reads as maze, not a plus-cubie or D-pad.",
    },
    "E": {
        "title": "Gold path",
        "thesis": "The intended ribbon on black — gold path as the mark, walls implied.",
    },
    "F": {
        "title": "Exit door",
        "thesis": "A rectangle opening and one path into it. The run’s job, not the map.",
    },
    "G": {
        "title": "Player @",
        "thesis": "The dungeon glyph is the mark. Pixel @, no wordmark.",
    },
    "H": {
        "title": "Q/E chevrons",
        "thesis": "Turn left / turn right. Two chevrons only — not a four-way pad.",
    },
}

MANIFEST = {
    "id": "maze-mark",
    "product": "Matrix Maze",
    "subject": "favicon",
    "brief": "16px-first tab mark. Faithful to the dithered maze. No wordmark (or 1px implied). Do not ship until Phil picks.",
    "frame": "/bench/maze-mark.html",
    "axes": [
        "control PNG vs crop vs plan",
        "corridor / path / door",
        "player glyph vs turn chevrons",
    ],
    "takes": {k: v["thesis"] for k, v in META.items()},
}


HTML = r'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Bench — Matrix Maze tab mark</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=Oswald:wght@500;600&display=swap" rel="stylesheet" />
<style>
  :root {
    --bench: #141318;
    --bench-ink: #ece7db;
    --bench-muted: #9a9488;
    --cabinet: #050505;
    --ink: #f7f4ec;
    --muted: #ece7db;
    --line: rgba(244, 241, 234, 0.28);
    --chrome: #1a1a1e;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Figtree, ui-sans-serif, system-ui, sans-serif;
    background: var(--bench);
    color: var(--bench-ink);
  }
  header.bench {
    max-width: 1480px;
    margin: 0 auto;
    padding: 22px 22px 8px;
  }
  header.bench p.kicker {
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--bench-muted);
    margin: 0 0 6px;
  }
  header.bench h1 {
    font-family: Oswald, ui-sans-serif, sans-serif;
    font-size: 28px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 0 0 8px;
  }
  header.bench .brief {
    max-width: 52rem;
    color: var(--bench-muted);
    font-size: 14px;
    line-height: 1.45;
    margin: 0;
  }
  .grid {
    max-width: 1480px;
    margin: 0 auto 40px;
    padding: 12px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  @media (max-width: 1200px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
  .take {
    background: #0c0c10;
    border: 1px solid #2a2824;
    border-radius: 12px;
    padding: 10px;
    min-width: 0;
  }
  .take-meta {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 8px;
  }
  .letter {
    font-family: Oswald, ui-sans-serif, sans-serif;
    font-size: 18px;
    letter-spacing: 0.08em;
    color: var(--ink);
  }
  .take-title {
    font-size: 13px;
    font-weight: 600;
  }
  .window {
    background: var(--cabinet);
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }
  .chrome {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 8px;
    background: var(--chrome);
    border-bottom: 1px solid #2e2c28;
  }
  .dots { display: flex; gap: 4px; }
  .dots i { width: 7px; height: 7px; border-radius: 50%; background: #3a3834; display: block; }
  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 8px 0 5px;
    border-radius: 6px 6px 0 0;
    background: #111114;
    color: #ddd;
    font-size: 11px;
    min-width: 0;
  }
  .tab img, .tab svg { width: 16px; height: 16px; display: block; flex: 0 0 16px; }
  .stage {
    position: relative;
    height: 220px;
    background: #000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 10px 14px;
  }
  .well {
    width: 96px;
    height: 96px;
    border: 2px solid #00ff00;
    box-shadow: 0 0 18px rgba(0, 255, 0, 0.22);
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .well .mark { width: 88px; height: 88px; display: block; }
  .well .mark svg, .well .mark img { width: 88px; height: 88px; display: block; }
  .maze-title {
    font-family: Oswald, ui-sans-serif, sans-serif;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink);
    text-shadow: 0 2px 16px rgba(0,0,0,0.85);
  }
  .play {
    min-width: 88px;
    padding: 5px 14px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink);
    background: rgba(8,8,10,0.55);
    border: 1.5px solid rgba(244,241,234,0.82);
    border-radius: 999px;
  }
  .sizes {
    display: flex;
    gap: 8px;
    padding: 8px 8px 10px;
    background: #08080a;
    border-top: 1px solid #222;
    justify-content: center;
  }
  .size {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }
  .size span {
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #8a8680;
  }
  .size .cell {
    background: #000;
    border: 1px solid #333;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .thesis {
    margin: 8px 2px 2px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bench-muted);
  }
</style>
</head>
<body>
<header class="bench">
  <p class="kicker">Bench · one product · one subject</p>
  <h1>Matrix Maze tab mark</h1>
  <p class="brief">Eight orthogonal takes of the favicon. Nested windows are Maze-shaped (cabinet chrome, green well, Play). <strong>Take D (T-junction)</strong> is locked as production <code>favicon.svg</code> / Tauri icon.</p>
</header>
<div class="grid" id="grid"></div>
<script>
const TAKES = __TAKES__;
const META = __META__;

function markAt(letter, px) {
  const wrap = document.createElement("div");
  wrap.className = "mark";
  wrap.style.width = px + "px";
  wrap.style.height = px + "px";
  wrap.innerHTML = TAKES[letter];
  const svg = wrap.querySelector("svg");
  if (svg) {
    svg.setAttribute("width", px);
    svg.setAttribute("height", px);
    svg.style.width = px + "px";
    svg.style.height = px + "px";
    svg.style.display = "block";
  }
  return wrap;
}

for (const letter of Object.keys(META)) {
  const m = META[letter];
  const el = document.createElement("article");
  el.className = "take";
  el.innerHTML = `
    <div class="take-meta"><span class="letter">${letter}</span><span class="take-title">${m.title}</span></div>
    <div class="window">
      <div class="chrome">
        <div class="dots"><i></i><i></i><i></i></div>
        <div class="tab" data-tab></div>
      </div>
      <div class="stage">
        <div class="well" data-well></div>
        <div class="maze-title">Matrix Maze</div>
        <div class="play">Play</div>
      </div>
      <div class="sizes" data-sizes></div>
    </div>
    <p class="thesis">${m.thesis}</p>
  `;
  const tab = el.querySelector("[data-tab]");
  tab.appendChild(markAt(letter, 16));
  const name = document.createElement("span");
  name.textContent = "Matrix Maze";
  tab.appendChild(name);
  el.querySelector("[data-well]").appendChild(markAt(letter, 88));
  const sizes = el.querySelector("[data-sizes]");
  for (const px of [16, 32, 64]) {
    const col = document.createElement("div");
    col.className = "size";
    col.innerHTML = `<span>${px}</span><div class="cell" style="width:${px + 8}px;height:${px + 8}px"></div>`;
    col.querySelector(".cell").appendChild(markAt(letter, px));
    sizes.appendChild(col);
  }
  document.getElementById("grid").appendChild(el);
}
</script>
</body>
</html>
'''


def main() -> None:
    public_takes = ROOT / "bench" / "maze-mark" / "takes"
    skill_dir = ROOT / ".bench" / "rounds" / "maze-mark"
    skill_takes = skill_dir / "takes"
    public_takes.mkdir(parents=True, exist_ok=True)
    skill_takes.mkdir(parents=True, exist_ok=True)

    takes_js = {k: v.strip() for k, v in TAKES.items()}
    for k, body in TAKES.items():
        (public_takes / f"{k}.svg").write_text(body, encoding="utf-8")
        (skill_takes / f"{k}.svg").write_text(body, encoding="utf-8")

    (skill_dir / "manifest.json").write_text(
        json.dumps(MANIFEST, indent=2) + "\n", encoding="utf-8"
    )
    (ROOT / "bench" / "maze-mark" / "manifest.json").write_text(
        json.dumps(MANIFEST, indent=2) + "\n", encoding="utf-8"
    )

    html = HTML.replace("__TAKES__", json.dumps(takes_js))
    html = html.replace("__META__", json.dumps(META))
    (ROOT / "bench" / "maze-mark.html").write_text(html, encoding="utf-8")
    print("wrote", ROOT / "bench" / "maze-mark.html")


if __name__ == "__main__":
    main()
