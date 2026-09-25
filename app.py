"""Platter — a recipe box with a three-pane layout: tags, recipes, the recipe itself.

Everything a person saves (favourites, edits, their own recipes, ticked ingredients) lives in
their browser. The server hands over the page and the sample library, and offers one endpoint,
/api/import, which reads a recipe out of any public recipe web page.
"""

import gzip
import html
import ipaddress
import json
import mimetypes
import os
import re
import socket
import time
from urllib.parse import urljoin, urlparse

import requests
from dotenv import load_dotenv
from flask import Flask, Response, abort, jsonify, render_template, request
from urllib3.util import connection as urllib3_connection
from werkzeug.utils import safe_join

load_dotenv()          # local development only; on Render the variables come from the dashboard

# some hosts hand back IPv6 addresses this machine cannot route to; ask for IPv4 only
urllib3_connection.allowed_gai_family = lambda: socket.AF_INET

BASE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(BASE, "static")
app = Flask(__name__, static_folder=None)          # assets are served by static_files() below
app.config["TEMPLATES_AUTO_RELOAD"] = True          # an edited index.html shows up without a restart

from ai import bp as ai_bp  # noqa: E402  (after load_dotenv so it sees OPENAI_MODEL)

app.register_blueprint(ai_bp)

from prices import bp as prices_bp  # noqa: E402

app.register_blueprint(prices_bp)

# ---------- assets: gzipped once, kept in memory ----------
# Flask's own static route streams files, which compression middleware leaves alone — so the
# 1.2 MB recipe library would have gone out raw. Reading each asset once, gzipping the textual
# ones, and answering from memory is a few lines and gets ~250 KB on the wire.
_assets = {}
_TEXTUAL = ("text/", "application/json", "application/javascript", "image/svg+xml")


def _asset(path):
    mtime = os.path.getmtime(path)
    hit = _assets.get(path)
    if hit and hit[0] == mtime:
        return hit
    with open(path, "rb") as fh:
        raw = fh.read()
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    if path.endswith(".js"):
        mime = "text/javascript"
    gz = gzip.compress(raw, 6) if len(raw) > 600 and mime.startswith(_TEXTUAL) else None
    _assets[path] = hit = (mtime, raw, gz, mime)
    return hit


@app.route("/static/<path:filename>", endpoint="static")
def static_files(filename):
    path = safe_join(STATIC, filename)
    if not path or not os.path.isfile(path):
        abort(404)
    mtime, raw, gz, mime = _asset(path)
    etag = f'"{int(mtime)}-{len(raw)}"'
    if request.headers.get("If-None-Match") == etag:
        resp = Response(status=304)
    else:
        use_gz = gz is not None and "gzip" in request.headers.get("Accept-Encoding", "")
        resp = Response(gz if use_gz else raw, mimetype=mime)
        if use_gz:
            resp.headers["Content-Encoding"] = "gzip"
    resp.headers["ETag"] = etag
    resp.headers["Vary"] = "Accept-Encoding"
    return resp


def _asset_version():
    """Changes whenever a shipped file does, so the browser can cache every asset forever."""
    files = ["static/style.css", "static/dark.css", "static/white.css", "static/data/library.json", "static/data/details.json", "static/sw.js"]
    files += [f"static/js/{n}" for n in os.listdir(os.path.join(BASE, "static", "js"))]
    return str(int(max(os.path.getmtime(p) for p in (os.path.join(BASE, f) for f in files) if os.path.exists(p))))



@app.after_request
def headers(resp):
    if request.path.startswith("/static/") and request.args.get("v"):
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif request.path.startswith("/static/"):
        resp.headers["Cache-Control"] = "public, max-age=86400"
    elif request.path == "/":
        resp.headers["Cache-Control"] = "no-cache"
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    return resp


@app.route("/")
def index():
    return render_template("index.html", v=_asset_version())     # a handful of stat() calls: cheap


@app.route("/healthz")
def healthz():
    return "ok"


@app.route("/sw.js")
def service_worker():
    """The service worker has to be served from the root to control the whole app, and must never be cached hard."""
    with open(os.path.join(STATIC, "sw.js"), "rb") as fh:
        resp = Response(fh.read(), mimetype="text/javascript")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["Service-Worker-Allowed"] = "/"
    return resp


@app.route("/manifest.webmanifest")
def manifest():
    body = {
        "name": "Platter",
        "short_name": "Platter",
        "description": "Your recipes, sorted into tags, scaled to the crowd, ready to cook from.",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "background_color": "#fafaf8",
        "theme_color": "#fafaf8",
        "shortcuts": [                       # long-press the installed icon
            {"name": "Meal plan", "url": "/#/plan"},
            {"name": "What can I make?", "url": "/#/pantry"},
            {"name": "Shopping list", "url": "/#/shop"},
        ],
        "icons": [
            {"src": "/static/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
            {"src": "/static/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
        ],
    }
    resp = app.response_class(json.dumps(body), mimetype="application/manifest+json")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


# ---------- recipe import ----------

UA = {"User-Agent": "Mozilla/5.0 (compatible; PlatterRecipeImporter/1.0)", "Accept": "text/html,*/*"}
VIDEO_HOSTS = ("youtube.com", "youtu.be", "facebook.com", "fb.watch", "instagram.com", "tiktok.com", "vimeo.com")

_hits = {}


def _limited(limit=20, window=60):
    ip = (request.headers.get("X-Forwarded-For", request.remote_addr or "?")).split(",")[0].strip()
    now = time.time()
    bucket = [t for t in _hits.get(ip, []) if now - t < window]
    if len(bucket) >= limit:
        _hits[ip] = bucket
        return True
    bucket.append(now)
    _hits[ip] = bucket
    return False


def _is_public(host):
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    try:
        return bool(infos) and all(ipaddress.ip_address(i[4][0].split("%")[0]).is_global for i in infos)
    except ValueError:
        return False


def _fetch(url):
    """Fetch a page, re-checking every redirect hop so a public URL cannot bounce us inward."""
    for _ in range(4):
        parts = urlparse(url)
        if (parts.scheme not in ("http", "https") or not parts.hostname
                or parts.port not in (None, 80, 443) or not _is_public(parts.hostname)):
            raise ValueError("That address can't be imported.")
        resp = requests.get(url, headers=UA, timeout=10, allow_redirects=False, stream=True)
        if resp.is_redirect:
            url = urljoin(url, resp.headers.get("Location", ""))
            continue
        resp.raise_for_status()
        raw = resp.raw.read(2_500_000, decode_content=True)
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return raw.decode(resp.encoding or "latin-1", "replace")
    raise ValueError("Too many redirects.")


def _clean(text):
    text = re.sub(r"<[^>]+>", " ", str(text))
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def _find_recipe(node):
    if isinstance(node, list):
        for item in node:
            found = _find_recipe(item)
            if found:
                return found
    elif isinstance(node, dict):
        kind = node.get("@type")
        kinds = kind if isinstance(kind, list) else [kind]
        if "Recipe" in kinds:
            return node
        for key in ("@graph", "mainEntity", "mainEntityOfPage"):
            if key in node:
                found = _find_recipe(node[key])
                if found:
                    return found
    return None


def _steps(node):
    out = []
    if isinstance(node, str):
        out.extend(_clean(s) for s in re.split(r"\r?\n+", node))
    elif isinstance(node, list):
        for item in node:
            out.extend(_steps(item))
    elif isinstance(node, dict):
        if "itemListElement" in node:
            out.extend(_steps(node["itemListElement"]))
        elif node.get("text"):
            out.append(_clean(node["text"]))
        elif node.get("name"):
            out.append(_clean(node["name"]))
    return [s for s in out if s]


def _minutes(iso):
    m = re.match(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?", str(iso or ""))
    if not m:
        return 0
    d, h, mi = (int(x or 0) for x in m.groups())
    return d * 1440 + h * 60 + mi


def _image(node):
    if isinstance(node, list) and node:
        node = node[0]
    if isinstance(node, dict):
        node = node.get("url")
    return node if isinstance(node, str) and node.startswith("http") else ""


def _text_list(node):
    if isinstance(node, list):
        return ", ".join(_clean(x) for x in node if isinstance(x, str))
    return _clean(node) if isinstance(node, str) else ""


def _meta(page):
    """First value of every <meta property|name=… content=…> — attribute order varies by site."""
    found = {}
    for tag in re.findall(r"<meta\s+([^>]+?)/?>", page, re.I):
        attrs = {k.lower(): (a or b) for k, a, b in re.findall(r"([\w:-]+)\s*=\s*(?:\"([^\"]*)\"|'([^']*)')", tag)}
        key = attrs.get("property") or attrs.get("name")
        if key and attrs.get("content") and key.lower() not in found:
            found[key.lower()] = html.unescape(attrs["content"]).strip()
    return found


@app.route("/api/import", methods=["POST"])
def import_recipe():
    if _limited():
        return jsonify(error="That's a lot of imports at once — give it a minute and try again."), 429
    url = str((request.get_json(silent=True) or {}).get("url", "")).strip()
    if not re.match(r"^https?://", url, re.I):
        return jsonify(error="Paste a full web address starting with http:// or https://"), 400
    try:
        page = _fetch(url)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except requests.RequestException:
        return jsonify(error="Couldn't reach that page. Some sites block automated readers."), 502

    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    is_video = any(host == h or host.endswith("." + h) for h in VIDEO_HOSTS)

    recipe = None
    for block in re.findall(r"<script[^>]+ld\+json[^>]*>(.*?)</script>", page, re.S | re.I):
        try:
            recipe = _find_recipe(json.loads(block.strip()))
        except ValueError:
            continue
        if recipe:
            break

    meta = _meta(page)
    if not recipe:
        # not a structured recipe page (a video, a blog post): keep what the page says about itself
        title = _clean(meta.get("og:title") or meta.get("twitter:title") or "")
        if not title:
            m = re.search(r"<title[^>]*>(.*?)</title>", page, re.S | re.I)
            title = _clean(m.group(1)) if m else ""
        if not title:
            return jsonify(error="No recipe data found on that page. You can still add it by hand."), 422
        return jsonify(
            title=title, image=meta.get("og:image", "") if str(meta.get("og:image", "")).startswith("http") else "",
            serves=4, time=0, source=host, url=url, ingredients=[], steps=[], category="", cuisine="",
            video=url if is_video else "", partial=True,
        )

    yield_raw = recipe.get("recipeYield")
    if isinstance(yield_raw, list):
        yield_raw = yield_raw[0] if yield_raw else ""
    serves = re.search(r"\d+", str(yield_raw or ""))
    minutes = _minutes(recipe.get("totalTime")) or (_minutes(recipe.get("prepTime")) + _minutes(recipe.get("cookTime")))
    ingredients = recipe.get("recipeIngredient") or recipe.get("ingredients") or []
    return jsonify(
        title=_clean(recipe.get("name", "")),
        image=_image(recipe.get("image")) or (meta.get("og:image") if str(meta.get("og:image", "")).startswith("http") else ""),
        serves=int(serves.group()) if serves else 4,
        time=minutes,
        source=host,
        url=url,
        ingredients=[_clean(i) for i in ingredients if _clean(i)],
        steps=_steps(recipe.get("recipeInstructions", [])),
        category=_text_list(recipe.get("recipeCategory")),
        cuisine=_text_list(recipe.get("recipeCuisine")),
        video=url if is_video else "",
        partial=False,
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5075)), debug=False)
