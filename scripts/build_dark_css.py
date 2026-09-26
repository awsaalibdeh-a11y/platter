"""Write static/dark.css and static/white.css: Platter's dark and white themes, generated from static/style.css.

style.css itself is the "Warm" theme (paper-toned greys). White is the same design on crisp, neutral surfaces: every
warm grey becomes a very slightly cool one and light surfaces get brighter; the lime accent stays.

style.css is written for the light theme, with its colours inline. Rather than keep two hand-written palettes in step,
this reads every rule, keeps only the declarations that carry a colour, and writes a copy of the rule under
:root[data-theme="dark"] with each colour mapped by the job it does:

  surface  (background)   light greys become dark greys, keeping their order; plain white (a card) becomes a
                          slightly *lighter* dark than the page, so cards still float; pale tints become deep tints
  text     (color, fill)  dark greys become light greys; dark accent text becomes a light accent
  line     (borders, 1px rings)  pale lines become faint light lines
  shadow   (blurred box-shadows) stay black, a little stronger

Every colour rule is copied, including ones that only use var(), so the dark copies keep the same order of
specificity among themselves and all of them outrank the light rules. Text on a bright lime surface or on a
translucent overlay over a photo is left alone. Fixes that need a human eye live in EXTRA, at the end.

    python scripts/build_dark_css.py
"""

import colorsys
import os
import re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "static", "style.css")
OUT = os.path.join(BASE, "static", "dark.css")
OUT_WHITE = os.path.join(BASE, "static", "white.css")
DARK = ':root[data-theme="dark"]'

COLOR_PROPS = {"background", "background-color", "background-image", "color", "border", "border-color", "border-top", "border-bottom",
               "border-left", "border-right", "box-shadow", "outline", "outline-color", "text-decoration-color", "fill", "stroke",
               "scrollbar-color", "caret-color"}
COLOR_RE = re.compile(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)")
# glass buttons and labels that sit on a photo or on the always-dark photo viewer look the same in every theme:
# mapping them would turn a white "x" on dark glass into a dark one
SAME_IN_EVERY_THEME = re.compile(r"\.(?:lightbox|lb-|viewer|vw-|gal-arrow|gal-count|gal-add-chip|gal-own|burst)")

EXTRA = """
/* ---------- by hand ---------- */
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg-detail: #151513; --bg-list: #1a1a17; --bg-side: #1f1f1b; --field: #262621; --chip: #2a2a25; --line: #2e2d28;
  --ink: #ecebe5; --ink-2: #cfcec7; --muted: #aeada3; --faint: #6c6b64; --danger: #f07a6e;
  --lime-soft: #2b3514;
  --pop: 0 16px 44px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08);
}
:root[data-theme="dark"] .row.on { background: #34421a; }
:root[data-theme="dark"] .row.on .row-title { color: #f2f5e6; }
:root[data-theme="dark"] .row.on .row-dom { color: rgba(236, 235, 229, 0.74); }
:root[data-theme="dark"] .row.on .row-price { color: #e3f0b8; }
:root[data-theme="dark"] .tile.on { box-shadow: inset 0 0 0 2.5px var(--lime), 0 0 0 1.5px var(--lime); }
:root[data-theme="dark"] .qbtn.on .qn { background: #151513; color: var(--lime); }
:root[data-theme="dark"] .tile-label { background: rgba(28, 28, 25, 0.92); color: var(--ink); }
:root[data-theme="dark"] .hero:not(.editable):not(.empty)::after { background: linear-gradient(transparent, rgba(0, 0, 0, 0.35)); }
:root[data-theme="dark"] .switch::after { background: #f2f1ec; }
:root[data-theme="dark"] .cbtn.lime, :root[data-theme="dark"] .cbtn.lime .ic { color: var(--lime-ink); }
:root[data-theme="dark"] .sp-num, :root[data-theme="dark"] .hp-badge { color: var(--lime-ink); }
:root[data-theme="dark"] .ing.done .cb, :root[data-theme="dark"] .plan-item.done .pi-check { color: var(--lime-ink); }
:root[data-theme="dark"] .dcard-fav { background: rgba(28, 28, 25, 0.9); }
:root[data-theme="dark"] img { color-scheme: light; }
"""


# ---------- colours ----------
def parse(c):
    c = c.strip()
    if c.startswith("#"):
        h = c[1:]
        if len(h) == 3:
            h = "".join(x * 2 for x in h)
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0
    nums = [x.strip() for x in c[c.index("(") + 1:-1].split(",")]
    r, g, b = (int(float(x)) for x in nums[:3])
    return r, g, b, float(nums[3]) if len(nums) > 3 else 1.0


def fmt(r, g, b, a):
    r, g, b = (max(0, min(255, round(x))) for x in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}" if a >= 0.999 else f"rgba({r}, {g}, {b}, {round(a, 3)})"


def hls(r, g, b):
    return colorsys.rgb_to_hls(r / 255, g / 255, b / 255)


def from_hls(h, l, s, a):
    r, g, b = colorsys.hls_to_rgb(h, max(0, min(1, l)), max(0, min(1, s)))
    return fmt(r * 255, g * 255, b * 255, a)


def is_bright_accent(c):
    r, g, b, a = parse(c)
    h, l, s = hls(r, g, b)
    return a > 0.9 and s > 0.35 and 0.42 < l < 0.82


NEUTRAL_H = 0.64          # the dark theme's greys lean a touch blue: calm charcoal, not the warm theme's olive-brown


def dark(c, role):
    """Map one light-theme colour to its dark-theme partner, by the role it plays."""
    r, g, b, a = parse(c)
    h, l, s = hls(r, g, b)
    neutral = s < 0.3 or l > 0.975 or l < 0.05
    if a < 0.999:                                            # translucent
        if l < 0.4 and neutral:
            if role == "shadow":
                return fmt(0, 0, 0, min(a * 1.8, 0.7))
            if role == "line" or (role == "bg" and a <= 0.12):
                return fmt(255, 255, 255, min(a * 1.35, 0.22))
            if role == "fg":
                return fmt(237, 237, 242, a)
            return c                                          # scrims and overlays on photos stay dark
        if l > 0.8 and neutral:
            return fmt(26, 27, 32, a) if role == "bg" else fmt(18, 19, 23, a)
        if role == "shadow":
            return fmt(0, 0, 0, min(a * 1.8, 0.7))
        return c                                              # accent tints (danger wash, lime ring) read fine on dark
    if role == "shadow":
        return fmt(0, 0, 0, 0.5)
    if neutral:
        if role == "bg":
            if l >= 0.995:
                return from_hls(NEUTRAL_H, 0.132, 0.1, 1)      # a white card: a step lighter than the page, so it floats
            if l >= 0.5:
                return from_hls(NEUTRAL_H, 0.078 + (0.985 - l) * 0.85, 0.1, 1)
            return from_hls(NEUTRAL_H, 1 - l * 0.9, 0.06, 1)  # a dark pill (toast, timer) turns light
        if role == "fg":
            return from_hls(NEUTRAL_H, 0.95 - l * 0.8, 0.08, 1)
        if role == "line":
            return from_hls(NEUTRAL_H, min(0.4, 0.085 + (0.985 - l) * 1.25), 0.08, 1) if l >= 0.5 else c
    # accents
    if role == "bg":
        return from_hls(h, 0.16, s * 0.3, 1) if l > 0.8 else c     # pale tints become quiet, low-saturation washes
    if role == "fg":
        return from_hls(h, 0.74, min(s, 0.55), 1) if l < 0.55 else c
    if role == "line":
        return from_hls(h, 0.28, s * 0.35, 1) if l > 0.8 else c
    return c


# ---------- css ----------
def white(c, role):
    """Map one warm-theme colour to the white theme: neutral greys, brighter surfaces, accents untouched."""
    r, g, b, a = parse(c)
    h, l, s = hls(r, g, b)
    neutral = s < 0.3 or l > 0.975 or l < 0.05
    if a < 0.999:
        if neutral or l < 0.4:                       # warm-tinted shadows, rings and hover washes turn neutral
            v = 0 if l < 0.5 else 255
            return fmt(v, v, v, a)
        return c
    if not neutral:
        return c
    if role == "bg" and l >= 0.85:
        l = min(1.0, l + (1 - l) * 0.45)
    return from_hls(0.66, l, 0.05 if l > 0.5 else 0.03, 1)


EXTRA_WHITE = """
/* ---------- by hand ---------- */
:root[data-theme="white"] {
  --bg-detail: #ffffff; --bg-list: #f7f7f9; --bg-side: #f1f1f4; --field: #f1f1f4; --chip: #efeff2; --line: #e6e6eb;
  --ink: #111114; --ink-2: #38383d; --muted: #6c6c72; --faint: #aeaeb4;
  --pop: 0 16px 44px rgba(0, 0, 0, 0.14), 0 0 0 1px rgba(0, 0, 0, 0.05);
}
:root[data-theme="white"] .side { box-shadow: 1px 0 0 rgba(0, 0, 0, 0.06); }
:root[data-theme="white"] .detail { box-shadow: -1px 0 0 #ececf0; }
"""


def split_top(text, sep):
    out, depth, cur = [], 0, ""
    for ch in text:
        depth += ch == "("
        depth -= ch == ")"
        if ch == sep and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    out.append(cur)
    return out


def map_value(prop, value, keep_fg, fn=None):
    fn = fn or dark
    if prop == "box-shadow":
        layers = []
        for layer in split_top(value, ","):
            nums = re.findall(r"(-?[\d.]+)(?:px|rem|em)?(?=\s|$)", COLOR_RE.sub(" ", layer).replace("inset", " "))
            ring = len(nums) >= 3 and float(nums[2]) == 0
            layers.append(COLOR_RE.sub(lambda m: fn(m.group(0), "line" if ring else "shadow"), layer))
        return ",".join(layers)
    role = ("fg" if prop in ("color", "fill", "stroke", "caret-color") else
            "bg" if prop.startswith("background") else "line")
    if role == "fg" and keep_fg:
        return value
    return COLOR_RE.sub(lambda m: fn(m.group(0), role), value)


def rules(css):
    """Yield (wrapper, selector, body) for every rule, one level of @media / @container deep."""
    i, n = 0, len(css)
    stack = []
    while i < n:
        j = css.find("{", i)
        k = css.find("}", i)
        if k != -1 and (j == -1 or k < j):
            if stack:
                stack.pop()
            i = k + 1
            continue
        if j == -1:
            break
        head = css[i:j].strip()
        if head.startswith("@"):
            if head.startswith(("@keyframes", "@font-face")) or "print" in head:
                depth, m = 1, j + 1                           # skip the whole block
                while depth and m < n:
                    depth += css[m] == "{"
                    depth -= css[m] == "}"
                    m += 1
                i = m
                continue
            stack.append(head)
            i = j + 1
            continue
        end = css.find("}", j)
        yield (stack[-1] if stack else None), head, css[j + 1:end]
        i = end + 1


def prefix(selector, root=DARK):
    parts = []
    for part in split_top(selector, ","):
        part = part.strip()
        if part.startswith((":root", "html")):
            parts.append(root + part[len(":root") if part.startswith(":root") else len("html"):])
        else:
            parts.append(f"{root} {part}")
    return ", ".join(parts)


def main():
    build("dark", dark, EXTRA, OUT, DARK, fix_lime=True)
    build("white", white, EXTRA_WHITE, OUT_WHITE, ':root[data-theme="white"]', fix_lime=False)


def build(name, fn, extra, path, root, fix_lime):
    css = re.sub(r"/\*.*?\*/", "", open(SRC, encoding="utf-8").read(), flags=re.S)
    out, groups = [], {}
    order = []
    for wrapper, selector, body in rules(css):
        if selector.startswith(":root") and "--" in body:
            continue                                          # the tokens are redefined by hand in EXTRA
        if SAME_IN_EVERY_THEME.search(selector):
            continue
        decls = []
        for d in split_top(body, ";"):
            if ":" not in d:
                continue
            prop, value = (x.strip() for x in d.split(":", 1))
            if prop in COLOR_PROPS and (COLOR_RE.search(value) or "var(" in value):
                decls.append((prop, value))
        if not decls:
            continue
        bg = next((v for p, v in decls if p in ("background", "background-color")), "")
        bright = "var(--lime)" in bg or any(is_bright_accent(c) for c in COLOR_RE.findall(bg))
        overlay = any(parse(c)[3] < 0.9 and hls(*parse(c)[:3])[1] < 0.4 for c in COLOR_RE.findall(bg))
        lines = [f"{p}: {map_value(p, v, bright or overlay, fn)};" for p, v in decls]
        if fix_lime and bright and not any(p == "color" for p, _ in decls):
            lines.append("color: var(--lime-ink);")          # a surface that turns lime keeps dark text on it
        rule = f"{prefix(selector, root)} {{ {' '.join(lines)} }}"
        if wrapper not in groups:
            groups[wrapper] = []
            order.append(wrapper)
        groups[wrapper].append(rule)
    out.append(f"/* Platter's {name} theme. Generated by scripts/build_dark_css.py from style.css: don't edit by hand. */")
    for w in order:
        if w is None:
            out.extend(groups[w])
        else:
            out.append(w + " {")
            out.extend("  " + r for r in groups[w])
            out.append("}")
    out.append(extra.strip())
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")
    print(f"wrote {path}: {sum(len(v) for v in groups.values())} rules, {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main()
