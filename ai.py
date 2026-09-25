"""Platter's AI: "what do you want to make?" -> a few dish ideas with photos -> one full recipe.

Text comes from OpenAI (OPENAI_API_KEY, optional OPENAI_MODEL). Pictures are real photographs from
free sources, tried in order: Wikipedia for a named dish, Openverse for everything else, TheMealDB
as a last resort. The photo endpoint only ever talks to those three hosts, never to a URL the
browser supplies, so it cannot be used to reach anything else.
"""

import json
import logging
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

import requests
from flask import Blueprint, jsonify, request

bp = Blueprint("ai", __name__)
log = logging.getLogger("platter.ai")

MODEL = os.environ.get("OPENAI_MODEL", "gpt-5")
EFFORT = os.environ.get("OPENAI_REASONING_EFFORT", "minimal")     # the fastest tier that still gives clean JSON
DAILY_LIMIT = int(os.environ.get("AI_DAILY_LIMIT", "400"))         # a ceiling on what a public URL can spend
UA = {"User-Agent": "PlatterRecipeBox/1.0 (https://github.com/awsaalibdeh-a11y/platter)", "Accept": "application/json"}

DEFAULT_TAGS = [("appetizers", "Appetizers"), ("soup", "Soup"), ("salad", "Salad"), ("poultry", "Poultry"), ("beef", "Beef"),
                ("seafood", "Seafood"), ("pork", "Pork"), ("lamb", "Lamb"), ("vegetarian", "Vegetarian Mains"),
                ("pasta", "Pasta & Noodles"), ("desserts", "Desserts"), ("breakfast", "Breakfast"), ("sides", "Sides"),
                ("mains", "Everyday Mains")]


def _configured():
    return bool(os.environ.get("OPENAI_API_KEY"))


# ---------- limits: per person per hour, and a daily ceiling for the whole site ----------
_lock = threading.Lock()
_hits = {}
_day = {"date": "", "n": 0}
LIMITS = {"llm": (40, 3600), "photo": (300, 3600)}


def _limited(kind):
    ip = (request.headers.get("X-Forwarded-For", request.remote_addr or "?")).split(",")[0].strip()
    limit, window = LIMITS[kind]
    now = time.time()
    with _lock:
        bucket = [t for t in _hits.get((kind, ip), []) if now - t < window]
        if len(bucket) >= limit:
            _hits[(kind, ip)] = bucket
            return True
        bucket.append(now)
        _hits[(kind, ip)] = bucket
        if kind == "llm":
            today = time.strftime("%Y-%m-%d")
            if _day["date"] != today:
                _day.update(date=today, n=0)
            _day["n"] += 1
            if _day["n"] > DAILY_LIMIT:
                return True
    return False


class AIError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def _json(raw):
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        m = re.search(r"\{.*\}", raw or "", re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except ValueError:
                pass
    raise AIError("The AI gave a reply I couldn't read. Try rephrasing.")


def _ask(system, user, max_tokens):
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise AIError("AI isn't switched on for this site yet.", 503)
    body = {
        "model": MODEL,
        "max_completion_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    if re.match(r"^(gpt-5|o\d)", MODEL):
        body["reasoning_effort"] = EFFORT
    resp = None
    for attempt in range(2):
        try:
            resp = requests.post("https://api.openai.com/v1/chat/completions",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
                                 json=body, timeout=(6, 25))
            break
        except requests.RequestException:
            if attempt:
                raise AIError("Couldn't reach the AI service. Try again in a moment.")
    if not resp.ok:
        log.error("OpenAI %s: %s", resp.status_code, resp.text[:400])
        raise AIError("The AI service returned an error. Try again in a moment.")
    return _json(resp.json().get("choices", [{}])[0].get("message", {}).get("content", ""))


# ---------- small cleaners ----------
def _s(value, n):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(value or ""))).strip()[:n]


def _int(value, default=0, lo=0, hi=100000):
    try:
        return max(lo, min(hi, int(float(value))))
    except (TypeError, ValueError):
        return default


def _tags(body):
    """The client's own tags (they can rename and add), validated; the defaults if none came."""
    out = []
    for t in (body.get("tags") or [])[:24]:
        if isinstance(t, dict) and re.fullmatch(r"[a-z0-9_-]{1,24}", str(t.get("id", ""))):
            out.append((t["id"], _s(t.get("name"), 32) or t["id"]))
    return out or DEFAULT_TAGS


# ---------- prompts ----------
IDEAS_PROMPT = """You are the recipe assistant inside a home-cooking app. The user says what they feel like making. Suggest {n} distinct, real, well-loved dishes that fit.
- Honour every constraint they mention: diet, allergies, time, equipment, ingredients on hand, occasion, how many people.
- If they name one exact dish, give that dish first, then close variations.
- If the request is not about food, return an empty list and a one-sentence note.
Tags to choose from (id: name): {tags}
Do not repeat these titles: {avoid}
Return ONLY JSON: {{"note": "one friendly sentence, max 16 words", "ideas": [{{"title": str max 60 chars, "blurb": "max 16 words, appetising, says why it fits", "minutes": int total time, "serves": int, "tag": one tag id, "cuisine": str or "", "wiki": "the exact English Wikipedia article title for this dish or its closest famous parent dish, or empty"}}]}}"""

RECIPE_PROMPT = """You write one complete, reliable home-cooking recipe as JSON for a cooking app.
- "ingredients": 6 to 16 strings. Start each with an amount and a US unit (cup, tbsp, tsp, oz, lb) or a plain count, then the ingredient, then any prep after a comma: "2 cloves garlic, minced", "1 lb chicken thighs, cubed", "1/2 cup soy sauce". Only salt, pepper, frying oil and garnish may say "to taste" or "as needed". The amounts must suit the stated servings.
- "steps": 4 to 9 short imperative steps. Put times ("simmer for 10 minutes") and temperatures ("425°F") inside the step text. Meat and poultry must be cooked to safe temperatures.
- "notes": one or two short tips (swaps, storage, make-ahead), max 220 characters.
- Respect every constraint in the request (diet, allergens, time, equipment).
Tags to choose from (id: name): {tags}
Return ONLY JSON: {{"title": str, "cuisine": str or "", "tag": one tag id, "minutes": int total time, "serves": int, "ingredients": [str], "steps": [str], "notes": str}}"""


@bp.get("/api/ai/status")
def status():
    return jsonify(enabled=_configured(), model=MODEL if _configured() else "")


@bp.post("/api/ai/ideas")
def ideas():
    body = request.get_json(silent=True) or {}
    query = _s(body.get("query"), 240)
    if len(query) < 2:
        return jsonify(error="Tell me what you feel like making."), 400
    if not _configured():
        return jsonify(error="AI isn't switched on for this site yet.", code="off"), 503
    if _limited("llm"):
        return jsonify(error="That's a lot of AI requests. Give it a little while."), 429
    tags = _tags(body)
    ids = {t[0] for t in tags}
    n = _int(body.get("n"), 4, 1, 6)
    avoid = "; ".join(_s(t, 60) for t in (body.get("avoid") or [])[:12]) or "none"
    try:
        data = _ask(IDEAS_PROMPT.format(n=n, tags=", ".join(f"{i}: {nm}" for i, nm in tags), avoid=avoid), query, 1400)
    except AIError as exc:
        return jsonify(error=str(exc)), exc.status
    out, seen = [], set()
    for i in (data.get("ideas") or [])[:8]:
        title = _s(i.get("title"), 70)
        if not title or title.lower() in seen:
            continue
        seen.add(title.lower())
        out.append({
            "title": title, "blurb": _s(i.get("blurb"), 150), "min": _int(i.get("minutes"), 0, 0, 900),
            "serves": _int(i.get("serves"), 4, 1, 24) or 4,
            "tag": i.get("tag") if i.get("tag") in ids else ("mains" if "mains" in ids else tags[0][0]),
            "sub": _s(i.get("cuisine"), 24), "wiki": _s(i.get("wiki"), 90),
        })
    if not out:
        return jsonify(ideas=[], note=_s(data.get("note"), 160) or "I couldn't find dishes for that. Try describing a craving.")
    return jsonify(ideas=out[:n], note=_s(data.get("note"), 160))


@bp.post("/api/ai/recipe")
def recipe():
    body = request.get_json(silent=True) or {}
    title = _s(body.get("title"), 70)
    if not title:
        return jsonify(error="Missing the dish name."), 400
    if not _configured():
        return jsonify(error="AI isn't switched on for this site yet.", code="off"), 503
    if _limited("llm"):
        return jsonify(error="That's a lot of AI requests. Give it a little while."), 429
    tags = _tags(body)
    ids = {t[0] for t in tags}
    serves = _int(body.get("serves"), 4, 1, 24) or 4
    user = f"Dish: {title}. Servings: {serves}. Context: {_s(body.get('blurb'), 160)}. The person asked: {_s(body.get('query'), 240)}"
    try:
        data = _ask(RECIPE_PROMPT.format(tags=", ".join(f"{i}: {nm}" for i, nm in tags)), user, 2200)
    except AIError as exc:
        return jsonify(error=str(exc)), exc.status
    strip_no = re.compile(r"^\s*(?:step\s*)?\d+[.):]\s*", re.I)
    ings = [_s(x, 160) for x in (data.get("ingredients") or []) if isinstance(x, str) and _s(x, 160)][:20]
    steps = [strip_no.sub("", _s(x, 420)) for x in (data.get("steps") or []) if isinstance(x, str) and _s(x, 420)][:12]
    if len(ings) < 3 or len(steps) < 2:
        return jsonify(error="The recipe came back incomplete. Try again."), 502
    return jsonify(
        title=_s(data.get("title"), 70) or title, sub=_s(data.get("cuisine"), 24),
        tag=data.get("tag") if data.get("tag") in ids else ("mains" if "mains" in ids else tags[0][0]),
        min=_int(data.get("minutes"), 0, 0, 900) or None, serves=_int(data.get("serves"), serves, 1, 24) or serves,
        ing=ings, steps=steps, notes=_s(data.get("notes"), 300),
    )


# ---------- photos: real ones, from free places ----------
# Tried in order: the dish's own Wikipedia article, a Wikimedia Commons search, Openverse, TheMealDB.
_photos = {}
IMG_HOSTS = ("https://upload.wikimedia.org/", "https://thumb.wikimedia.org/", "https://api.openverse.org/", "https://www.themealdb.com/")
FOODISH = re.compile(
    r"dish|food|soup|stew|salad|sauce|cuisine|bread|cake|dessert|pastry|pie|tart|curry|pasta|noodle|rice|sandwich|snack|meal|"
    r"cheese|egg|meat|sausage|fish|seafood|vegetable|fruit|pudding|cookie|biscuit|confection|sweet|beverage|drink|breakfast|"
    r"dumpling|pancake|omelet|casserole|roast|grill|fried|baked|cocktail|pizza|burger|taco|kebab|stir|chili|chilli|salmon|chicken|"
    r"beef|pork|lamb|pasta|mushroom|chocolate|lemon|garlic|cuisine|cooked|plate|bowl", re.I)
# words about *how* or *how nicely* a dish is made say nothing about what it looks like
STOP = {"with", "and", "the", "in", "of", "a", "style", "easy", "best", "quick", "homemade", "classic", "recipe", "for", "on", "to",
        "spicy", "creamy", "sheet", "pan", "crunch", "cold", "hot", "crispy", "simple", "fresh", "baked", "roasted", "air", "fryer",
        "instant", "slow", "cooker", "oven", "grilled", "pressure", "skillet", "one", "pot", "pan-seared", "seared", "healthy", "vegan"}
NOT_A_DISH = re.compile(r"appliance|device|machine|equipment|utensil|cookware|kitchenware|apparatus|vessel|company|brand|restaurant chain", re.I)
# a file about a *different kind* of dish than the one asked for is a wrong photo, however many words it shares
OTHER_DISH = {"dog", "burger", "sandwich", "pizza", "cake", "pie", "soup", "salad", "taco", "burrito", "cookie", "bread", "sushi",
              "curry", "stew", "omelet", "omelette", "muffin", "sausage", "cocktail", "juice", "sauce", "smoothie"}


def _get(url, **params):
    try:
        r = requests.get(url, params=params or None, headers=UA, timeout=8)
        return r.json() if r.ok else None
    except (requests.RequestException, ValueError):
        return None


def _tokens(text):
    return [w for w in re.findall(r"[a-z]{3,}", (text or "").lower()) if w not in STOP]


def _stems(text):
    return {w[:5] for w in _tokens(text)}          # roast / roasted, noodle / noodles


def _relevant(title, wiki, found_title):
    """Does a photo called `found_title` plausibly show the dish `title`? Judged by word stems."""
    asked = _stems(title)
    got = _stems(found_title)
    need = 2 if len(asked) >= 3 else 1
    extras = (got & {w[:5] for w in OTHER_DISH}) - asked          # a *different* kind of dish
    return len((asked | _stems(wiki)) & got) >= need and bool(asked & got) and not extras


def _covered(title, article):
    """A Wikipedia article is only the dish's photo if every word of its title is in the dish's name."""
    words = _stems(article)
    return bool(words) and words <= _stems(title)


def _wikipedia(name, title):
    d = _get("https://en.wikipedia.org/w/api.php", action="query", format="json", formatversion="2",
             prop="pageimages|description", piprop="thumbnail", pithumbsize="960", redirects="1", titles=name)
    for p in ((d or {}).get("query", {}).get("pages") or []):
        thumb = (p.get("thumbnail") or {}).get("source", "")
        desc = p.get("description") or ""
        if (not p.get("missing") and thumb.startswith(IMG_HOSTS) and FOODISH.search(desc) and not NOT_A_DISH.search(desc)
                and _covered(title, p.get("title", ""))):
            return {"url": thumb, "credit": "Wikipedia", "link": "https://en.wikipedia.org/wiki/" + quote(p["title"].replace(" ", "_"))}
    return None


def _commons(title, wiki):
    seen = []
    for q in (title, wiki, " ".join(_tokens(title)[-2:])):
        if not q or q.lower() in seen:
            continue
        seen.append(q.lower())
        d = _get("https://commons.wikimedia.org/w/api.php", action="query", format="json", formatversion="2", generator="search",
                 gsrnamespace="6", gsrlimit="10", gsrsearch=f"{q} filetype:bitmap", prop="imageinfo",
                 iiprop="url|size|mime|extmetadata", iiurlwidth="960", iiextmetadatafilter="LicenseShortName|Artist|Categories|ImageDescription")
        for p in sorted(((d or {}).get("query", {}).get("pages") or []), key=lambda x: x.get("index", 99)):
            ii = (p.get("imageinfo") or [{}])[0]
            thumb = ii.get("thumburl") or ""
            if ii.get("mime") != "image/jpeg" or _int(ii.get("width")) < 600 or not thumb.startswith(IMG_HOSTS):
                continue
            name = re.sub(r"^File:|\.\w+$", "", p.get("title", ""))
            if not _relevant(title, wiki, name):
                continue
            meta = ii.get("extmetadata") or {}
            about = " ".join([name, (meta.get("Categories") or {}).get("value", ""), (meta.get("ImageDescription") or {}).get("value", "")])
            if not FOODISH.search(about):                   # a rug called "Turkey chili" is not a chili
                continue
            who = _s(re.sub(r"<[^>]+>", "", (meta.get("Artist") or {}).get("value", "")), 40)
            lic = _s((meta.get("LicenseShortName") or {}).get("value"), 24)
            return {"url": thumb, "credit": " · ".join(x for x in (who, lic, "Wikimedia Commons") if x),
                    "link": "https://commons.wikimedia.org/wiki/" + quote(p["title"].replace(" ", "_"))}
        if len(seen) >= 3:
            break
    return None


def _openverse(title, wiki):
    q = wiki or " ".join(_tokens(title)[-2:]) or title
    d = _get("https://api.openverse.org/v1/images/", q=q, category="photograph", extension="jpg", page_size="10", mature="false")
    for r in ((d or {}).get("results") or []):
        thumb = r.get("thumbnail") or ""
        text = f"{r.get('title') or ''} " + " ".join(t.get("name", "") for t in (r.get("tags") or []))
        if thumb.startswith(IMG_HOSTS) and _int(r.get("width")) >= 500 and FOODISH.search(text) and _relevant(title, wiki, text):
            who = _s(r.get("creator"), 40)
            lic = f"{(r.get('license') or '').upper()} {r.get('license_version') or ''}".strip()
            return {"url": thumb, "credit": " · ".join(x for x in (who, lic, "Openverse") if x),
                    "link": r.get("foreign_landing_url") or r.get("url") or ""}
    return None


def _mealdb(title):
    want = set(_tokens(title))
    for q in (title, " ".join(_tokens(title)[:2])):
        if not q:
            continue
        d = _get("https://www.themealdb.com/api/json/v1/1/search.php", s=q)
        for m in ((d or {}).get("meals") or []):
            got = set(_tokens(m.get("strMeal")))
            if want and got and len(want & got) / len(want | got) >= 0.6 and str(m.get("strMealThumb", "")).startswith(IMG_HOSTS):
                return {"url": m["strMealThumb"], "credit": "TheMealDB", "link": f"https://www.themealdb.com/meal/{m['idMeal']}"}
    return None


@bp.get("/api/ai/photo")
def photo():
    title = _s(request.args.get("title"), 80)
    wiki = _s(request.args.get("wiki"), 90)
    if not title:
        return jsonify(error="Missing title."), 400
    if _limited("photo"):
        return jsonify(error="Too many photo lookups."), 429
    key = (title.lower(), wiki.lower())
    hit = _photos.get(key)
    if hit and time.time() - hit[0] < 86400:
        return jsonify(hit[1])
    found = None
    for lookup in (lambda: wiki and _wikipedia(wiki, title), lambda: _wikipedia(title, title), lambda: _commons(title, wiki),
                   lambda: _openverse(title, wiki), lambda: _mealdb(title)):
        found = lookup()
        if found and str(found.get("url", "")).startswith(IMG_HOSTS):
            break
        found = None
    if len(_photos) > 400:
        _photos.clear()
    _photos[key] = (time.time(), found or {})
    return jsonify(found or {})
