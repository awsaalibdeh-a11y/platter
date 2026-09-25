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
from flask import Blueprint, Response, jsonify, request

bp = Blueprint("ai", __name__)
log = logging.getLogger("platter.ai")

MODEL = os.environ.get("OPENAI_MODEL", "gpt-5")
EFFORT = os.environ.get("OPENAI_REASONING_EFFORT", "minimal")     # the fastest tier that still gives clean JSON
DAILY_LIMIT = int(os.environ.get("AI_DAILY_LIMIT", "600"))         # a ceiling on what a public URL can spend
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
UA = {"User-Agent": "PlatterRecipeBox/1.0 (https://github.com/awsaalibdeh-a11y/platter)", "Accept": "application/json"}

DEFAULT_TAGS = [("appetizers", "Appetizers"), ("soup", "Soup"), ("salad", "Salad"), ("chicken", "Chicken"), ("poultry", "Turkey & Duck"), ("beef", "Beef"),
                ("seafood", "Seafood"), ("pork", "Pork"), ("lamb", "Lamb"), ("vegetarian", "Vegetarian Mains"),
                ("pasta", "Pasta & Noodles"), ("desserts", "Desserts"), ("breakfast", "Breakfast"), ("sides", "Sides"),
                ("mains", "Everyday Mains")]


def _configured():
    return bool(os.environ.get("OPENAI_API_KEY"))


# ---------- limits: per person per hour, and a daily ceiling for the whole site ----------
_lock = threading.Lock()
_hits = {}
_day = {"date": "", "n": 0}
LIMITS = {"llm": (40, 3600), "chat": (90, 3600), "photo": (300, 3600)}


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
        if kind in ("llm", "chat"):
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


def _ask(system, user, max_tokens, read_timeout=25, tries=2):
    """One JSON-mode chat call. `user` is text, or a list of content parts (text and an image)."""
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
    for attempt in range(tries):
        try:
            resp = requests.post(OPENAI_URL,
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
                                 json=body, timeout=(6, read_timeout))
            break
        except requests.RequestException:
            if attempt == tries - 1:
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


# ---------- diet labels: the AI proposes, the ingredient list has the last word ----------
DIETS = ("vegetarian", "vegan", "gluten-free", "dairy-free", "spicy")
_NOT_REALLY = re.compile(
    r"(?:coconut|almond|soy|oat|rice|cashew|vegan|plant[- ]based)\s+(?:milk|cream|yog\w*|butter|cheese)|(?:peanut|almond|cashew|cocoa|nut|apple|"
    r"sunflower|vegan)\s+butter|butter\s*beans?|cream of tartar|gluten[- ]free\s+[\w-]+(?:\s+[\w-]+)?|rice (?:flour|noodles?|paper|vermicelli)|"
    r"corn\s*(?:flour|starch|tortillas?)|cornflour|chickpea flour|gram flour|almond flour|buckwheat|tamari|egg[- ]?plant", re.I)
_MEAT = re.compile(
    r"\b(beef|steak|pork|bacon|ham|gammon|sausages?|chorizo|pancetta|prosciutto|salami|pepperoni|lamb|mutton|goat|veal|venison|chicken|"
    r"turkey|duck|goose|quail|hens?|liver|mince|meat|meatballs?|oxtail|fish|salmon|tuna|cod|haddock|trout|mackerel|sardines?|anchov\w*|"
    r"prawns?|shrimps?|crab|lobster|scallops?|mussels?|clams?|oysters?|squid|calamari|octopus|gelatin\w*|lard|suet|dashi|bonito|"
    r"worcestershire)\b|fish sauce|oyster sauce|(?:chicken|beef|fish|meat|bone|veal) (?:stock|broth)", re.I)
_ANIMAL = re.compile(r"\b(eggs?|yolks?|whites?|honey|milk|butter|cream|cheese|cheddar|parmesan|mozzarella|feta|paneer|ricotta|halloumi|"
                     r"mascarpone|yogh?urt|ghee|buttermilk|mayonnaise|mayo|crème fraîche|creme fraiche|condensed milk)\b", re.I)
_DAIRY = re.compile(r"\b(milk|butter|cream|cheese|cheddar|parmesan|mozzarella|feta|paneer|ricotta|halloumi|mascarpone|yogh?urt|ghee|"
                    r"buttermilk|crème fraîche|creme fraiche|condensed milk)\b", re.I)
_GLUTEN = re.compile(
    r"\b(flour|bread|breadcrumbs?|panko|pasta|spaghetti|noodles?|macaroni|couscous|bulgur|barley|rye|beer|ale|soy sauce|wheat|semolina|"
    r"tortillas?|pita|naan|buns?|rolls?|croutons?|crackers?|pastry|phyllo|filo|wrappers?|biscuits?|cake|gnocchi|orzo|lasagn\w*|penne|"
    r"fettuccine|linguine|seitan|farro|spelt|malt|udon|ramen|baguette|brioche|sourdough|pizza dough|dumplings?|hoisin|teriyaki sauce)\b", re.I)


def diet_labels(labels, ingredients):
    """Keep only the labels the AI gave that the ingredient list can't disprove."""
    text = _NOT_REALLY.sub(" ", " ; ".join(str(i) for i in ingredients))
    out = [d for d in DIETS if d in {str(x).lower().strip() for x in (labels or []) if isinstance(x, str)}]
    if _MEAT.search(text):
        out = [d for d in out if d not in ("vegetarian", "vegan")]
    if "vegan" in out and _ANIMAL.search(text):
        out.remove("vegan")
    if "vegan" in out and "vegetarian" not in out:
        out.insert(0, "vegetarian")
    if "dairy-free" in out and _DAIRY.search(text):
        out.remove("dairy-free")
    if "gluten-free" in out and _GLUTEN.search(text):
        out.remove("gluten-free")
    return out


def _diet(body):
    """The cook's own diet (set in the app), as a line every prompt can follow; "" when they have none."""
    d = _s(body.get("diet"), 400)
    return f"\nThe cook's diet, which you must always respect: {d}." if d else ""


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
- "about": 2 or 3 sentences, max 380 characters: what the dish is, where it comes from, how it tastes. Plain words, no hype ("delicious", "perfect"), don't start with "This".
- "level": "Easy", "Medium" or "Hard" for a home cook. "serve": what to serve it with, max 70 characters.
- "kcal", "protein", "carbs", "fat": estimates per serving, integers (grams for the last three).
- "diet": the labels strictly true of the recipe as written, from "vegetarian", "vegan", "gluten-free", "dairy-free", "spicy".
- "costs": for each ingredient line, in order, what the amount used costs at typical US supermarket prices in US dollars (2 tbsp olive oil ≈ 0.35).
- Respect every constraint in the request (diet, allergens, time, equipment).
Tags to choose from (id: name): {tags}
Return ONLY JSON: {{"title": str, "cuisine": str or "", "tag": one tag id, "minutes": int total time, "serves": int, "ingredients": [str], "steps": [str], "notes": str, "about": str, "level": str, "serve": str, "kcal": int, "protein": int, "carbs": int, "fat": int, "diet": [str], "costs": [number]}}"""

HELP_PROMPT = """You are the cooking helper inside a recipe app. The cook has the recipe below open and asks about it, sometimes about a part they highlighted. Answer like a patient chef standing beside them.
- Answer in the first sentence, in plain words. Explain any technique or term (fold, deglaze, blind bake, soft peaks, a rolling boil…) and how to tell it is done right: what it should look, smell, sound or feel like.
- Keep it short: 2 to 5 sentences, or a few "- " bullet points for a sequence. No preamble, don't repeat the question, no sign-off.
- Use this recipe's own amounts, temperatures and step numbers. For a substitute, give one to three options with amounts and say what changes.
- Give safe internal temperatures whenever meat, poultry, fish or eggs are involved.
- If the question has nothing to do with cooking or this recipe, say in one sentence that you can only help with the recipe.
- Plain text. **Bold** a few words at most. No headings, no tables, no emoji.

THE RECIPE
{recipe}"""


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
        data = _ask(IDEAS_PROMPT.format(n=n, tags=", ".join(f"{i}: {nm}" for i, nm in tags), avoid=avoid), query + _diet(body), 1400)
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
    user = f"Dish: {title}. Servings: {serves}. Context: {_s(body.get('blurb'), 160)}. The person asked: {_s(body.get('query'), 240)}" + _diet(body)
    try:
        data = _ask(RECIPE_PROMPT.format(tags=", ".join(f"{i}: {nm}" for i, nm in tags)), user, 2800)
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
        ing=ings, steps=steps, notes=_s(data.get("notes"), 300), **details(data, ings),
    )


def details(data, ings):
    """The catalogue fields every recipe carries: description, level, serving idea, nutrition, diet labels."""
    level = str(data.get("level") or "").strip().capitalize()
    kcal = _int(data.get("kcal"), 0, 0, 3000)
    nut = [kcal, _int(data.get("protein"), 0, 0, 300), _int(data.get("carbs"), 0, 0, 500), _int(data.get("fat"), 0, 0, 300)]
    return {
        "about": _s(data.get("about"), 420), "level": level if level in ("Easy", "Medium", "Hard") else "",
        "serve": _s(data.get("serve"), 90), "diet": diet_labels(data.get("diet"), ings),
        "nut": nut if 40 <= kcal <= 2500 else None, "kcal": kcal if 40 <= kcal <= 2500 else None,
        "cost": _costs(data.get("costs"), len(ings)),
    }


def _costs(raw, n):
    """What each ingredient line costs in US dollars, only when there's exactly one number per line."""
    if not isinstance(raw, list) or len(raw) != n or not n:
        return None
    try:
        return [round(min(max(float(x), 0.0), 80.0), 2) for x in raw]
    except (TypeError, ValueError):
        return None


# ---------- "I don't understand this part": questions about the open recipe, answered as a stream ----------
def _stream(messages, max_tokens=900):
    key = os.environ.get("OPENAI_API_KEY")
    body = {"model": MODEL, "max_completion_tokens": max_tokens, "messages": messages, "stream": True}
    if re.match(r"^(gpt-5|o\d)", MODEL):
        body["reasoning_effort"] = EFFORT
    try:
        resp = requests.post(OPENAI_URL, headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
                             json=body, timeout=(6, 30), stream=True)
    except requests.RequestException:
        yield "I couldn't reach the AI service. Try again in a moment."
        return
    if not resp.ok:
        log.error("OpenAI %s: %s", resp.status_code, resp.text[:400])
        yield "The AI service returned an error. Try again in a moment."
        return
    said = False
    try:
        for raw in resp.iter_lines():                   # server-sent events: "data: {json}" per line
            line = raw.decode("utf-8", "replace")
            if not line.startswith("data:"):
                continue
            chunk = line[5:].strip()
            if chunk == "[DONE]":
                break
            try:
                piece = json.loads(chunk)["choices"][0]["delta"].get("content")
            except (ValueError, KeyError, IndexError, TypeError):
                continue
            if piece:
                said = True
                yield piece
    except requests.RequestException:
        yield "\n\n(The answer was cut off. Ask again.)"
    finally:
        resp.close()
    if not said:
        yield "I couldn't come up with an answer to that. Try asking another way."


@bp.post("/api/ai/ask")
def ask():
    body = request.get_json(silent=True) or {}
    q = _s(body.get("q"), 500)
    rec = body.get("recipe") if isinstance(body.get("recipe"), dict) else {}
    title = _s(rec.get("title"), 120)
    if len(q) < 2 or not title:
        return jsonify(error="Ask a question about the recipe."), 400
    if not _configured():
        return jsonify(error="AI isn't switched on for this site yet.", code="off"), 503
    if _limited("chat"):
        return jsonify(error="That's a lot of questions. Give it a little while."), 429
    ings = [_s(x, 200) for x in (rec.get("ing") or [])[:45] if isinstance(x, str)]
    steps = [_s(x, 700) for x in (rec.get("steps") or [])[:30] if isinstance(x, str)]
    minutes = _int(rec.get("min"), 0, 0, 2000)
    text = "\n".join([
        title, f"Serves {_int(rec.get('serves'), 4, 1, 99)}" + (f", about {minutes} minutes" if minutes else ""),
        "Ingredients:", *(f"- {i}" for i in ings), "Method:", *(f"{n}. {s}" for n, s in enumerate(steps, 1)),
    ])
    notes = _s(rec.get("notes"), 500)
    if notes:
        text += f"\nThe cook's own notes: {notes}"
    messages = [{"role": "system", "content": HELP_PROMPT.format(recipe=text) + _diet(body)}]
    for turn in (body.get("history") or [])[-8:]:
        said = _s((turn or {}).get("text"), 1500) if isinstance(turn, dict) else ""
        if said:
            messages.append({"role": "assistant" if turn.get("role") == "ai" else "user", "content": said})
    focus = _s(body.get("focus"), 700)
    messages.append({"role": "user", "content": f'The part I mean: "{focus}"\n\n{q}' if focus else q})
    return Response(_stream(messages), content_type="text/plain; charset=utf-8",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


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


# ---------- remix a recipe, and read one from a photo or pasted text ----------
_RULES = """- "ingredients": 5 to 20 strings, each starting with an amount and unit (cup, tbsp, tsp, oz, lb, g, ml) or a plain count, then the ingredient, then any prep after a comma: "2 cloves garlic, minced". Only salt, pepper, frying oil and garnish may say "to taste" or "as needed".
- "steps": short imperative steps without numbers; times ("simmer for 10 minutes") and temperatures ("425°F") inside the text. Meat, poultry, fish and eggs cooked to safe temperatures.
- "about": 2 or 3 sentences, max 380 characters: what the dish is and how it tastes; no hype words. "level": "Easy", "Medium" or "Hard". "serve": what to serve it with, max 70 characters.
- "kcal", "protein", "carbs", "fat": estimates per serving, integers. "diet": labels strictly true of it, from "vegetarian", "vegan", "gluten-free", "dairy-free", "spicy".
- "costs": for each ingredient line, in order, what the amount used costs at typical US supermarket prices in US dollars."""

REMIX_PROMPT = """You rework a home-cooking recipe the way a good cook would, following the change the cook asks for. Keep the dish recognisable and keep whatever doesn't need to change; change ingredients, amounts, steps, times and servings wherever the change needs it. If the change can't be done honestly (a vegetarian version of a dish that is nothing but meat), make the closest honest version and say so.
- "title": a short, honest name for the new version, e.g. "Paneer Butter Masala" or "Lighter Chicken Tikka Masala".
""" + _RULES + """
- "changes": 2 to 4 short strings (max 90 characters each) saying what you changed and why.
- "notes": one practical tip for this version, max 200 characters.
Return ONLY JSON: {"title": str, "minutes": int, "serves": int, "ingredients": [str], "steps": [str], "changes": [str], "notes": str, "about": str, "level": str, "serve": str, "kcal": int, "protein": int, "carbs": int, "fat": int, "diet": [str], "costs": [number]}"""

EXTRACT_PROMPT = """You read a recipe from a photo (a cookbook page, a card, a screenshot, handwriting) or from pasted text, and write it out as JSON for a cooking app. Copy it faithfully: keep the author's title, amounts, ingredients and method; don't add or invent anything, except to split run-on text into clean ingredient lines and separate steps, and to fix obvious OCR slips.
- "title": the recipe's own title, or a short plain one if it has none. "minutes": total time if stated or clearly implied, else 0. "serves": if stated, else 4. "cuisine": if obvious, else "".
- "ingredients": one string per ingredient, amount first, prep after a comma. "steps": the method as separate steps without numbers.
- "about", "level", "serve", "kcal", "protein", "carbs", "fat", "diet": your own short description and estimates, by these rules:
""" + _RULES + """
If there is no recipe in it, return {"error": "one short sentence saying what you see instead"}.
Return ONLY JSON: {"title": str, "cuisine": str, "minutes": int, "serves": int, "ingredients": [str], "steps": [str], "about": str, "level": str, "serve": str, "kcal": int, "protein": int, "carbs": int, "fat": int, "diet": [str], "costs": [number]}"""

STRIP_NO = re.compile(r"^\s*(?:step\s*)?\d+[.):]\s*", re.I)


def _parts(data):
    ings = [_s(x, 160) for x in (data.get("ingredients") or []) if isinstance(x, str) and _s(x, 160)][:30]
    steps = [STRIP_NO.sub("", _s(x, 600)) for x in (data.get("steps") or []) if isinstance(x, str) and _s(x, 600)][:20]
    return ings, steps


@bp.post("/api/ai/remix")
def remix():
    body = request.get_json(silent=True) or {}
    rec = body.get("recipe") if isinstance(body.get("recipe"), dict) else {}
    title, how = _s(rec.get("title"), 120), _s(body.get("how"), 200)
    if not title or len(how) < 3:
        return jsonify(error="Say how you'd like the recipe changed."), 400
    if not _configured():
        return jsonify(error="AI isn't switched on for this site yet.", code="off"), 503
    if _limited("llm"):
        return jsonify(error="That's a lot of AI requests. Give it a little while."), 429
    ings = [_s(x, 200) for x in (rec.get("ing") or [])[:40] if isinstance(x, str)]
    steps = [_s(x, 700) for x in (rec.get("steps") or [])[:25] if isinstance(x, str)]
    serves = _int(rec.get("serves"), 4, 1, 24) or 4
    text = "\n".join(["THE RECIPE", title, f"Serves {serves}", "Ingredients:", *(f"- {i}" for i in ings),
                      "Method:", *(f"{n}. {x}" for n, x in enumerate(steps, 1)), "", f"THE CHANGE THE COOK WANTS: {how}"]) + _diet(body)
    try:
        data = _ask(REMIX_PROMPT, text, 3400, read_timeout=45, tries=1)
    except AIError as exc:
        return jsonify(error=str(exc)), exc.status
    new_ings, new_steps = _parts(data)
    if len(new_ings) < 3 or len(new_steps) < 2:
        return jsonify(error="The remix came back incomplete. Try again."), 502
    changes = [_s(c, 120) for c in (data.get("changes") or [])[:4] if isinstance(c, str) and _s(c, 120)]
    return jsonify(title=_s(data.get("title"), 90) or title, min=_int(data.get("minutes"), 0, 0, 900) or None,
                   serves=_int(data.get("serves"), serves, 1, 24) or serves, ing=new_ings, steps=new_steps,
                   notes=_s(data.get("notes"), 300), changes=changes, **details(data, new_ings))


@bp.post("/api/ai/extract")
def extract():
    body = request.get_json(silent=True) or {}
    text = str(body.get("text") or "")[:14000].strip()
    image = str(body.get("image") or "")
    if image and (len(image) > 7_000_000 or not re.match(r"^data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]", image)):
        return jsonify(error="That photo couldn't be read. Try a JPEG or PNG."), 400
    if len(text) < 20 and not image:
        return jsonify(error="Paste the whole recipe, or add a photo of it."), 400
    if not _configured():
        return jsonify(error="AI isn't switched on for this site yet.", code="off"), 503
    if _limited("llm"):
        return jsonify(error="That's a lot of AI requests. Give it a little while."), 429
    intro = f"Here is the recipe:\n\n{text}" if text else "Here is a photo of the recipe."
    user = [{"type": "text", "text": intro}, {"type": "image_url", "image_url": {"url": image, "detail": "high"}}] if image else intro
    try:
        data = _ask(EXTRACT_PROMPT, user, 3600, read_timeout=50, tries=1)
    except AIError as exc:
        return jsonify(error=str(exc)), exc.status
    if data.get("error") and not data.get("ingredients"):
        return jsonify(error=_s(data.get("error"), 160) or "I couldn't find a recipe in that."), 422
    ings, steps = _parts(data)
    if len(ings) < 2 or not steps:
        return jsonify(error="I couldn't find a whole recipe in that. Try a sharper photo, or paste the text."), 422
    return jsonify(title=_s(data.get("title"), 90) or "Untitled recipe", sub=_s(data.get("cuisine"), 24),
                   min=_int(data.get("minutes"), 0, 0, 1440) or None, serves=_int(data.get("serves"), 4, 1, 99) or 4,
                   ing=ings, steps=steps, **details(data, ings))


# ---------- what's in the fridge? ----------
FRIDGE_PROMPT = """You look at a photo of the inside of a fridge, a cupboard, a pantry shelf or groceries on a counter, and list the food a cook could use, for an app that suggests recipes from it.
- Short plain names the way a recipe would say them: "eggs", "milk", "cheddar", "greek yogurt", "spinach", "chicken breast", "tomatoes", "lemon", "butter", "ketchup".
- Name the food itself, not its packaging, cut or brand: "chicken" not "chicken packaged", "pineapple" not "pineapple slices", "ham" not "sliced deli meat" when you can tell.
- Only what you can really see, or read on a label. Leave out anything you would be guessing at, drinks that aren't cooking ingredients, and non-food.
- At most 30, the most useful for cooking first.
- "note": one short, useful sentence, e.g. what looks like it should be used up soon. If there's no food in the photo, an empty list and a note saying what you see.
Return ONLY JSON: {"items": [str], "note": str}"""


@bp.post("/api/ai/fridge")
def fridge():
    body = request.get_json(silent=True) or {}
    image = str(body.get("image") or "")
    if not image or len(image) > 7_000_000 or not re.match(r"^data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]", image):
        return jsonify(error="Add a photo of your fridge or cupboard."), 400
    if not _configured():
        return jsonify(error="AI isn't switched on for this site yet.", code="off"), 503
    if _limited("llm"):
        return jsonify(error="That's a lot of AI requests. Give it a little while."), 429
    user = [{"type": "text", "text": "What food can you see in this photo?"}, {"type": "image_url", "image_url": {"url": image, "detail": "high"}}]
    try:
        data = _ask(FRIDGE_PROMPT, user, 1500, read_timeout=45, tries=1)
    except AIError as exc:
        return jsonify(error=str(exc)), exc.status
    items, seen = [], set()
    for x in data.get("items") or []:
        name = re.sub(r"[^\w\s'&-]", "", _s(x, 30).lower()).strip()
        if name and name not in seen:
            seen.add(name)
            items.append(name)
    return jsonify(items=items[:30], note=_s(data.get("note"), 200))


# ---------- translate a recipe ----------
LANGS = {"ar": "Arabic", "es": "Spanish", "fr": "French", "de": "German", "it": "Italian", "pt": "Portuguese", "tr": "Turkish",
         "hi": "Hindi", "ur": "Urdu", "fa": "Persian", "zh": "Simplified Chinese", "ja": "Japanese", "ko": "Korean", "ru": "Russian",
         "id": "Indonesian", "nl": "Dutch", "pl": "Polish", "el": "Greek", "he": "Hebrew", "sw": "Swahili"}

TRANSLATE_PROMPT = """You translate a recipe for a cooking app into {lang}, the way a good cookbook in {lang} would say it: natural, clear and accurate.
- Start each ingredient line with its amount and unit exactly as given ("2 tbsp", "1.5 lb", "400 g") so the app can still scale them; translate the rest of the line.
- In the steps, translate everything, times and temperatures included, keeping every number in the digits 0-9 (never other numerals).
- Keep exactly the same number of ingredient lines and steps, in the same order.
Return ONLY JSON: {{"title": str, "about": str, "ingredients": [str], "steps": [str], "tip": str, "serve": str}}"""


@bp.post("/api/ai/translate")
def translate():
    body = request.get_json(silent=True) or {}
    lang = LANGS.get(str(body.get("lang") or ""))
    rec = body.get("recipe") if isinstance(body.get("recipe"), dict) else {}
    ings = [_s(x, 220) for x in (rec.get("ing") or [])[:45] if isinstance(x, str)]
    steps = [_s(x, 900) for x in (rec.get("steps") or [])[:30] if isinstance(x, str)]
    if not lang or not _s(rec.get("title"), 120) or not ings:
        return jsonify(error="Pick a language and a recipe."), 400
    if not _configured():
        return jsonify(error="AI isn't switched on for this site yet.", code="off"), 503
    if _limited("llm"):
        return jsonify(error="That's a lot of AI requests. Give it a little while."), 429
    source = {"title": _s(rec.get("title"), 120), "about": _s(rec.get("about"), 600), "ingredients": ings, "steps": steps,
              "tip": _s(rec.get("tip"), 300), "serve": _s(rec.get("serve"), 120)}
    try:
        data = _ask(TRANSLATE_PROMPT.format(lang=lang), json.dumps(source, ensure_ascii=False), 5000, read_timeout=50, tries=1)
    except AIError as exc:
        return jsonify(error=str(exc)), exc.status
    t_ings = [_s(x, 260) for x in (data.get("ingredients") or []) if isinstance(x, str)]
    t_steps = [_s(x, 1200) for x in (data.get("steps") or []) if isinstance(x, str)]
    if len(t_ings) != len(ings) or len(t_steps) != len(steps):
        return jsonify(error="The translation came back out of step with the recipe. Try again."), 502
    return jsonify(lang=body.get("lang"), language=lang, title=_s(data.get("title"), 160), about=_s(data.get("about"), 900),
                   ing=t_ings, steps=t_steps, tip=_s(data.get("tip"), 400), serve=_s(data.get("serve"), 160))
