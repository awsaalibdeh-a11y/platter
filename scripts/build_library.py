"""Build static/data/library.json — the sample recipe box — from TheMealDB.

TheMealDB (themealdb.com) is a free, community-run recipe catalogue with a photo, ingredients,
method, cuisine, source link and often a video for each dish. This script pulls all of it once,
sorts every dish into one of the app's tags, composes the ingredient lines the way a recipe
card would print them ("4 cloves garlic, minced"), and writes one compact JSON file. Nothing at
runtime talks to TheMealDB except the browser loading the photos.

    python scripts/build_library.py            # fetch from the network
    python scripts/build_library.py --raw f.json   # reuse a saved dump
"""

import json
import os
import re
import string
import sys
from collections import Counter, defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "static", "data", "library.json")
API = "https://www.themealdb.com/api/json/v1/1"

# Tag order is the order of the tiles in the sidebar: the ten from the reference first.
TAGS = [
    ("appetizers", "Appetizers"),
    ("soup", "Soup"),
    ("salad", "Salad"),
    ("chicken", "Chicken"),
    ("poultry", "Turkey & Duck"),
    ("beef", "Beef"),
    ("seafood", "Seafood"),
    ("pork", "Pork"),
    ("lamb", "Lamb"),
    ("vegetarian", "Vegetarian Mains"),
    ("pasta", "Pasta & Noodles"),
    ("desserts", "Desserts"),
    ("breakfast", "Breakfast"),
    ("sides", "Sides"),
    ("mains", "Everyday Mains"),
]

# Which dish's photo fronts each tile. Picked by eye from a contact sheet; matched by title.
COVERS = {}
COVERS_FILE = os.path.join(BASE, "scripts", "covers.json")
if os.path.exists(COVERS_FILE):
    with open(COVERS_FILE, encoding="utf-8") as fh:
        COVERS = json.load(fh)

SOUP = re.compile(r"\b(soup|chowder|bisque|broth|borscht|gazpacho|minestrone|consomm\w*|ukha|shchi|snert|tom yum|pho)\b", re.I)
SALAD = re.compile(r"\b(salad|slaw|coleslaw|tabbouleh|tabouli)\b", re.I)
NOODLE = re.compile(
    r"\b(spaghetti|lasagn\w*|macaroni|linguine|fettuccine|penne|tagliatelle|rigatoni|gnocchi|ravioli|"
    r"tortellini|noodles?|ramen|udon|pad thai|lo mein|chow mein|carbonara|bolognese|pasta|orzo|cannelloni|"
    r"mac and cheese|mac & cheese)\b", re.I)
NIBBLE = re.compile(
    r"\b(dips?|hummus|bruschetta|nachos|spring rolls?|samosas?|croquettes?|fritters?|canap\w*|p[aâ]t[eé]|"
    r"bites|empanadas?|dumplings?|bhaji|pakora|arancini|tempura|calamari|crostini|falafel|deviled|devilled|"
    r"guacamole|tapas|stuffed mushrooms?|skewers?)\b", re.I)
POULTRY = re.compile(r"\b(chicken|turkey|duck|goose|quail)\b", re.I)

PROPER = ["Worcestershire", "Dijon", "Parmesan", "Parmigiano-Reggiano", "Cheddar", "Gruy[eè]re", "Italian",
          "Thai", "Chinese", "Japanese", "Korean", "Greek", "Mexican", "Indian", "Moroccan", "Cajun",
          "Tabasco", "Marsala", "Cointreau", "Pecorino", "Camembert", "Brie", "Emmental", "Gorgonzola",
          "Stilton", "Roquefort", "Manchego", "Baileys", "Amaretto", "Cognac", "Bourbon", "Madeira",
          "Tia Maria", "Angostura", "Old Bay", "Bird's Eye", "Marmite", "Vegemite", "Nutella", "Oreo"]
PROPER_RE = re.compile(r"\b(" + "|".join(PROPER) + r")\b", re.I)

SPECIAL_AFTER = {"to taste", "to serve", "garnish", "to garnish", "for frying", "for greasing", "topping",
                 "for dusting", "for brushing", "for the topping", "to finish", "for decoration", "to decorate",
                 "for deep frying", "for serving", "for drizzling", "for the pan", "optional"}
A_OF = {"pinch", "dash", "splash", "handful", "knob", "drizzle", "sprinkling", "bunch", "squeeze", "glug",
        "shake", "sprig", "twist", "smidgen", "scoop"}
ADVERB = r"(?:finely|roughly|thinly|coarsely|freshly|lightly|thickly|very finely)"
VERB = (r"(?:chopped|sliced|diced|minced|crushed|grated|beaten|peeled|shredded|melted|softened|cubed|halved|"
        r"quartered|mashed|cooked|drained|rinsed|torn|crumbled|toasted|trimmed|deseeded|seeded|julienned|"
        r"cut into [a-z ]+|cut in [a-z ]+|separated|zested|juiced|sifted|packed|rolled|pitted|stoned|soaked|"
        r"boiled|roasted|fried|chilled|frozen|thawed|sliced thinly|skinned|boned|deboned)")
PREP_RE = re.compile(rf"^(?:{ADVERB}\s+)?{VERB}(?:\s+(?:and\s+)?(?:{ADVERB}\s+)?{VERB})*$", re.I)
QTY = r"(?:\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?(?:\s*[-–to]+\s*\d+(?:\.\d+)?)?|[½¼¾⅓⅔⅛⅜⅝⅞])"
SIZE = {"large", "medium", "small", "big", "little", "thick", "thin"}
UNIT_FIX = {"tbs": "tbsp", "tbls": "tbsp", "tblsp": "tbsp", "tblspn": "tbsp", "tsps": "tsp", "ounces": "oz",
            "ounce": "oz", "oz.": "oz", "lbs": "lb", "lbs.": "lb", "pounds": "lb", "pound": "lb"}
JOIN_TIGHT = {"g", "kg", "ml", "l", "cl", "dl"}


def clean(text):
    text = (text or "").replace("�", "–").replace(" ", " ")
    return re.sub(r"[ \t]+", " ", text).strip()


def ingredient_name(raw):
    name = clean(raw).lower()
    name = PROPER_RE.sub(lambda m: m.group(0).title() if " " not in m.group(0) else m.group(0).title(), name)
    return name


def tidy_prep(prep):
    """'peeled crushed' -> 'peeled and crushed'; 'sliced thinly' -> 'thinly sliced'."""
    prep = re.sub(r"\b(sliced|chopped|diced|minced|grated)\s+(thinly|finely|roughly|coarsely)\b", r"\2 \1", prep)
    words = re.findall(rf"(?:{ADVERB}\s+)?{VERB}", prep, re.I)
    if len(words) >= 2 and " and " not in prep:
        return ", ".join(words[:-1]) + " and " + words[-1]
    return prep


def compose(measure, ingredient):
    name = ingredient_name(ingredient)
    if not name:
        return ""
    m = clean(measure)
    if not m or m in {"-", "."}:
        return name
    low = m.lower()
    if low in SPECIAL_AFTER:
        return f"{name}, {low}"
    if low in A_OF:
        return f"a {low} of {name}"
    if low.startswith(("juice of", "zest of", "zest and juice of", "sprigs of", "sprig of", "handful of",
                       "few ", "some ", "about ", "small bunch", "large bunch", "bunch of")):
        return f"{low} {name}"
    # "500g/1lb 2oz" — keep the first measurement, drop the alternative
    if "/" in low and re.match(r"^\d+\s*(g|kg|ml|l)\s*/", low):
        low = low.split("/")[0].strip()
    match = re.match(rf"^\s*(?P<q>{QTY})?\s*(?P<paren>\([^)]*\))?\s*(?P<rest>.*?)\s*$", low)
    q, paren, rest = match.group("q") or "", match.group("paren") or "", match.group("rest") or ""
    if not q and not paren:
        return f"{low} {name}"
    words = rest.split()
    unit, size, prep = "", "", ""
    if words:
        head = words[0].strip(".,")
        if head in SIZE:
            size, words = head, words[1:]
        elif PREP_RE.match(" ".join(words)):
            prep, words = " ".join(words), []
        else:
            unit, words = UNIT_FIX.get(head, head), words[1:]
            if words and words[0] in SIZE:
                size, words = words[0], words[1:]
        if words:
            tail = " ".join(words)
            if PREP_RE.match(tail):
                prep = tail
            else:
                # something we do not understand: keep it, but out of the way
                return f"{q} {unit} {name} ({tail})".replace("  ", " ").strip()
    qty = q.strip()
    left = qty + (unit if unit in JOIN_TIGHT and qty and qty[-1].isdigit() else (" " + unit if unit else ""))
    parts = [left.strip(), paren, size, name]
    line = " ".join(p for p in parts if p)
    if prep:
        line += ", " + tidy_prep(prep)
    return re.sub(r"\s+", " ", line).strip()


def steps_from(text):
    text = (text or "").replace("\r", "")
    lines = [clean(l) for l in text.split("\n")]
    out = []
    for line in lines:
        if not line:
            continue
        if re.fullmatch(r"(?i)(step\s*)?\d+[.):]?", line):
            continue                                        # a bare "STEP 3" heading
        line = re.sub(r"(?i)^step\s*\d+\s*[:.\-)]?\s*", "", line)
        line = re.sub(r"^\d+[.)]\s+", "", line)
        if line:
            out.append(line)
    if len(out) < 3 and out and sum(len(s) for s in out) > 280:
        # one big paragraph: break it into readable steps of about two sentences
        sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", " ".join(out))
        out, buf = [], ""
        for s in sentences:
            buf = (buf + " " + s).strip()
            if len(buf) > 150:
                out.append(buf)
                buf = ""
        if buf:
            out.append(buf)
    return out


DURATION = re.compile(r"(\d+(?:\.\d+)?)(?:\s*(?:-|–|to|or)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?)\b", re.I)


def estimate_minutes(instructions, category):
    """Total the durations the method itself mentions; fall back to a typical figure by course."""
    total = 0.0
    for a, b, unit in DURATION.findall(instructions or ""):
        v = float(b or a)
        total += v * (60 if unit.lower().startswith("h") else 1)
    fallback = {"Dessert": 45, "Starter": 25, "Breakfast": 20, "Side": 30}.get(category, 40)
    if total < 5:
        return None
    total += 10 if total < 30 else 0
    total = min(total, 270)
    return int(5 * round(total / 5))


def estimate_serves(instructions, category):
    m = re.search(r"(?:serves|makes|yields?|serving)\D{0,12}(\d{1,2})\b", instructions or "", re.I)
    if m and 1 <= int(m.group(1)) <= 24:
        return int(m.group(1))
    return {"Dessert": 8, "Starter": 6, "Breakfast": 2}.get(category, 4)


def classify(meal):
    name, cat = meal["strMeal"], meal["strCategory"]
    if cat == "Chicken":
        return "chicken"                # a chicken noodle soup is still a chicken dish: it lives here, not in Soup
    if cat != "Dessert":
        if SOUP.search(name):
            return "soup"
        if SALAD.search(name):
            return "salad"
        if cat == "Pasta" or NOODLE.search(name):
            return "pasta"
    if cat == "Starter":
        return "appetizers"
    if cat in ("Side", "Miscellaneous", "Vegetarian", "Vegan") and NIBBLE.search(name):
        return "appetizers"
    if cat == "Miscellaneous" and POULTRY.search(name):
        return "chicken" if re.search(r"chicken", name, re.I) else "poultry"
    return {"Beef": "beef", "Seafood": "seafood", "Pork": "pork", "Lamb": "lamb", "Goat": "lamb",
            "Vegetarian": "vegetarian", "Vegan": "vegetarian", "Dessert": "desserts", "Breakfast": "breakfast",
            "Side": "sides", "Pasta": "pasta"}.get(cat, "mains")


def domain(url):
    m = re.match(r"^https?://(?:www\.)?([^/]+)", url or "")
    return m.group(1).lower() if m else ""


def fetch_all():
    import requests

    meals = {}
    for ch in string.ascii_lowercase + string.digits:
        r = requests.get(f"{API}/search.php?f={ch}", timeout=30)
        for m in (r.json().get("meals") or []):
            meals[m["idMeal"]] = m
    return list(meals.values())


def main():
    if "--raw" in sys.argv:
        with open(sys.argv[sys.argv.index("--raw") + 1], encoding="utf-8") as fh:
            meals = json.load(fh)
    else:
        meals = fetch_all()

    recipes, per_tag = [], defaultdict(list)
    for m in meals:
        ings = []
        for i in range(1, 21):
            line = compose(m.get(f"strMeasure{i}"), m.get(f"strIngredient{i}"))
            if line:
                ings.append(line)
        steps = steps_from(m.get("strInstructions"))
        if not ings or not steps or not m.get("strMealThumb"):
            continue
        tag = classify(m)
        video = m.get("strYoutube") or ""
        video = video if re.search(r"youtube\.com|youtu\.be", video) else ""
        source = clean(m.get("strSource"))
        area = clean(m.get("strArea"))
        rec = {
            "id": m["idMeal"],
            "title": clean(m["strMeal"]),
            "tag": tag,
            "sub": "" if area.lower() in ("unknown", "") else area,
            "img": m["strMealThumb"],
            "src": source,
            "dom": domain(source) or "themealdb.com",
            "min": estimate_minutes(m.get("strInstructions"), m["strCategory"]),
            "serves": estimate_serves(m.get("strInstructions"), m["strCategory"]),
            "video": video,
            "ing": ings,
            "steps": steps,
        }
        recipes.append(rec)
        per_tag[tag].append(rec)

    # dishes TheMealDB lacks, written once by scripts/add_chicken.py and kept as plain data
    extras_dir = os.path.join(BASE, "scripts", "extras")
    for name in sorted(os.listdir(extras_dir)) if os.path.isdir(extras_dir) else []:
        if name.endswith(".json"):
            with open(os.path.join(extras_dir, name), encoding="utf-8") as fh:
                for rec in json.load(fh):
                    recipes.append(rec)
                    per_tag[rec["tag"]].append(rec)

    by_title = {r["title"].lower(): r for r in recipes}
    tags = []
    for tid, name in TAGS:
        pool = per_tag[tid]
        if not pool:
            continue
        pick = by_title.get(COVERS.get(tid, "").lower()) or sorted(pool, key=lambda r: (not r["video"], r["title"]))[0]
        tags.append({"id": tid, "name": name, "cover": pick["id"]})

    # catalogue details from scripts/enrich.py: the few small fields the list and the filters need stay in the
    # library; the longer text goes to details.json, which the app fetches after the first screen is drawn
    info = {}
    info_file = os.path.join(BASE, "scripts", "details.json")
    if os.path.exists(info_file):
        with open(info_file, encoding="utf-8") as fh:
            info = json.load(fh)
    costs = {}
    costs_file = os.path.join(BASE, "scripts", "costs.json")
    if os.path.exists(costs_file):
        with open(costs_file, encoding="utf-8") as fh:
            costs = json.load(fh)
    details = {}
    for r in recipes:
        c = costs.get(r["id"])
        if c and len(c) == len(r["ing"]):
            r["cost"] = c                           # US dollars per ingredient line; the app turns them into local prices
        d = info.get(r["id"], {})
        tip = r.pop("tip", "") or d.get("tip", "")
        if d.get("level"):
            r["level"] = d["level"]
        if d.get("diet"):
            r["diet"] = d["diet"]
        if d.get("nut"):
            r["kcal"] = d["nut"][0]
            r["nut"] = d["nut"]                     # [kcal, protein, carbs, fat] per serving: the diet filters need it up front
        extra = {k: v for k, v in (("about", d.get("about")), ("serve", d.get("serve")), ("tip", tip)) if v}
        if extra:
            details[r["id"]] = extra

    recipes.sort(key=lambda r: r["title"].lower())
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"tags": tags, "recipes": recipes}, fh, ensure_ascii=False, separators=(",", ":"))
    details_out = os.path.join(os.path.dirname(OUT), "details.json")
    with open(details_out, "w", encoding="utf-8") as fh:
        json.dump(details, fh, ensure_ascii=False, separators=(",", ":"))

    print(f"wrote {OUT}  ({os.path.getsize(OUT) / 1024:.0f} KB, {len(recipes)} recipes)")
    print(f"wrote {details_out}  ({os.path.getsize(details_out) / 1024:.0f} KB, {len(details)} described)")
    for t in tags:
        pool = per_tag[t["id"]]
        subs = Counter(r["sub"] for r in pool if r["sub"])
        print(f"  {t['name']:<18} {len(pool):>4} recipes · {len(subs):>2} cuisines · cover: {by_title.get(next((r['title'].lower() for r in pool if r['id'] == t['cover']), ''), {}).get('title')}")
    with_time = sum(1 for r in recipes if r["min"])
    print(f"times found in the method for {with_time}/{len(recipes)} recipes; {sum(1 for r in recipes if r['video'])} have a video")


if __name__ == "__main__":
    main()
