"""Write scripts/extras/chicken.json: more chicken (and some turkey and duck) for the sample library.

TheMealDB has about eighty chicken dishes. This adds the well-known ones it lacks. Each dish is written by
the same recipe prompt Ask AI uses (ai.py) and photographed from the same free sources (its own Wikipedia
article first, then Wikimedia Commons and Openverse), then saved as plain data, so building the library
never needs a key or a network.

    python scripts/add_chicken.py                    # write the dishes that are not in chicken.json yet
    python scripts/add_chicken.py --redo "Butter Chicken"    # write one again
    python scripts/add_chicken.py --sheet            # also write static/_sheet.html to eyeball the photos
"""

import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(ROOT, ".env"))          # the key stays in .env; nothing here prints it
import ai  # noqa: E402  (after load_dotenv, so it sees OPENAI_MODEL)

OUT = os.path.join(ROOT, "scripts", "extras", "chicken.json")
FIRST_ID = 90001                                  # far above TheMealDB's ids, so "Newest first" lists these first

# (title, cuisine, the Wikipedia article whose lead photo shows this dish, or "")
CHICKEN = [
    # America
    ("Buffalo Chicken Wings", "American", "Buffalo wing"),
    ("Southern Fried Chicken", "American", "Fried chicken"),
    ("Nashville Hot Chicken", "American", "Hot chicken"),
    ("Chicken and Waffles", "American", "Chicken and waffles"),
    ("Chicken Pot Pie", "American", "Pot pie"),
    ("Chicken and Dumplings", "American", "Chicken and dumplings"),
    ("Chicken Noodle Soup", "American", "Chicken soup"),
    ("Chicken à la King", "American", "Chicken à la King"),
    ("Chicken Salad Sandwich", "American", "Chicken salad"),
    ("Chicken Caesar Salad", "American", "Caesar salad"),
    ("Honey Mustard Chicken Tenders", "American", "Chicken finger"),
    ("Homemade Chicken Nuggets", "American", "Chicken nugget"),
    ("Popcorn Chicken", "American", "Popcorn chicken"),
    ("Beer Can Chicken", "American", "Beer can chicken"),
    ("Lemon Herb Roast Chicken", "American", "Roast chicken"),
    ("Chicken Parmesan", "Italian-American", "Chicken parmigiana"),
    ("Chicken Tortilla Soup", "Mexican", "Tortilla soup"),
    ("Chicken Jambalaya", "Cajun", "Jambalaya"),
    ("Chicken and Sausage Gumbo", "Cajun", "Gumbo"),
    ("Huli Huli Chicken", "Hawaiian", "Huli-huli chicken"),
    # Mexico and Latin America
    ("Chicken Fajitas", "Tex-Mex", "Fajita"),
    ("Chicken Enchiladas", "Mexican", "Enchilada"),
    ("Chicken Quesadillas", "Mexican", "Quesadilla"),
    ("Chicken Tinga Tacos", "Mexican", "Tinga"),
    ("Chicken Mole Poblano", "Mexican", "Mole poblano"),
    ("Chicken Pozole", "Mexican", "Pozole"),
    ("Chicken Chilaquiles", "Mexican", "Chilaquiles"),
    ("Arroz con Pollo", "Latin American", "Arroz con pollo"),
    ("Peruvian Roast Chicken (Pollo a la Brasa)", "Peruvian", "Pollo a la brasa"),
    ("Chicken Empanadas", "Argentine", "Empanada"),
    ("Aji de Gallina", "Peruvian", "Ají de gallina"),
    ("Chicken Paella", "Spanish", "Paella"),
    # Europe
    ("Chicken Cacciatore", "Italian", "Chicken cacciatore"),
    ("Chicken Marsala", "Italian-American", "Chicken Marsala"),
    ("Chicken Piccata", "Italian", "Piccata"),
    ("Chicken Saltimbocca", "Italian", "Saltimbocca"),
    ("Chicken Fettuccine Alfredo", "Italian-American", "Fettuccine Alfredo"),
    ("Chicken Milanese", "Italian", "Milanesa"),
    ("Chicken Cordon Bleu", "Swiss", "Cordon bleu (dish)"),
    ("Chicken Kiev", "Ukrainian", "Chicken Kiev"),
    ("Chicken Schnitzel", "Austrian", "Schnitzel"),
    ("Chicken Paprikash", "Hungarian", "Chicken paprikash"),
    ("Poule au Pot", "French", "Poule au pot"),
    ("Chicken Fricassée", "French", "Fricassée"),
    ("Coronation Chicken", "British", "Coronation chicken"),
    ("Cock-a-Leekie Soup", "Scottish", "Cock-a-leekie soup"),
    ("Chicken Souvlaki", "Greek", "Souvlaki"),
    ("Chicken Gyros", "Greek", "Gyro (food)"),
    ("Chakhokhbili", "Georgian", "Chakhokhbili"),
    ("Shkmeruli (Garlic Chicken)", "Georgian", "Shkmeruli"),
    # Middle East and Africa
    ("Shish Tawook", "Lebanese", "Shish taouk"),
    ("Musakhan", "Palestinian", "Musakhan"),
    ("Chicken Tagine with Olives and Preserved Lemon", "Moroccan", "Tajine"),
    ("Chicken Bastilla", "Moroccan", "Pastilla"),
    ("Chicken Yassa", "Senegalese", "Yassa"),
    ("Doro Wat", "Ethiopian", "Doro wat"),
    ("Peri-Peri Chicken", "Portuguese", "Piri piri"),
    ("Jerk Chicken", "Jamaican", "Jerk (cooking)"),
    # South Asia
    ("Chicken Tikka Masala", "British-Indian", "Chicken tikka masala"),
    ("Butter Chicken", "Indian", "Butter chicken"),
    ("Chicken Biryani", "Indian", "Biryani"),
    ("Tandoori Chicken", "Indian", "Tandoori chicken"),
    ("Chicken Korma", "Indian", "Korma"),
    ("Chicken Vindaloo", "Indian", "Vindaloo"),
    ("Chicken Jalfrezi", "Indian", "Jalfrezi"),
    ("Chicken Karahi", "Pakistani", "Karahi"),
    ("Chicken 65", "Indian", "Chicken 65"),
    ("Chicken Tikka", "Indian", "Chicken tikka"),
    ("Chicken Xacuti", "Goan", "Xacuti"),
    ("Kerala Chicken Curry", "Indian", ""),
    ("Chicken Saag", "Indian", ""),
    # East Asia
    ("Kung Pao Chicken", "Chinese", "Kung Pao chicken"),
    ("General Tso's Chicken", "Chinese-American", "General Tso's chicken"),
    ("Orange Chicken", "Chinese-American", "Orange chicken"),
    ("Sweet and Sour Chicken", "Chinese", "Sweet and sour"),
    ("Lemon Chicken", "Chinese", "Lemon chicken"),
    ("Sesame Chicken", "Chinese-American", "Sesame chicken"),
    ("Cashew Chicken", "Chinese-American", "Cashew chicken"),
    ("Three Cup Chicken", "Taiwanese", "Three-cup chicken"),
    ("White Cut Chicken", "Cantonese", "White cut chicken"),
    ("Chicken Chow Mein", "Chinese-American", "Chow mein"),
    ("Chicken Fried Rice", "Chinese", "Fried rice"),
    ("Chicken Congee", "Chinese", "Congee"),
    ("Chicken Teriyaki", "Japanese", "Teriyaki"),
    ("Chicken Katsu", "Japanese", "Katsu"),
    ("Chicken Karaage", "Japanese", "Karaage"),
    ("Yakitori", "Japanese", "Yakitori"),
    ("Oyakodon", "Japanese", "Oyakodon"),
    ("Chicken Katsu Curry", "Japanese", "Katsu curry"),
    ("Korean Fried Chicken", "Korean", "Korean fried chicken"),
    ("Dak Galbi", "Korean", "Dakgalbi"),
    ("Samgyetang", "Korean", "Samgyetang"),
    ("Hainanese Chicken Rice", "Singaporean", "Hainanese chicken rice"),
    # Southeast Asia
    ("Chicken Satay", "Indonesian", "Satay"),
    ("Ayam Goreng", "Indonesian", "Ayam goreng"),
    ("Ayam Penyet", "Indonesian", "Ayam penyet"),
    ("Chicken Rendang", "Malaysian", "Rendang"),
    ("Chicken Laksa", "Malaysian", "Laksa"),
    ("Thai Basil Chicken (Pad Krapow Gai)", "Thai", "Phat kaphrao"),
    ("Khao Man Gai", "Thai", "Khao man kai"),
    ("Gai Yang (Thai Grilled Chicken)", "Thai", "Gai yang"),
    ("Chicken Panang Curry", "Thai", "Phanaeng"),
    ("Chicken Pad Thai", "Thai", "Pad thai"),
    ("Chicken Adobo", "Filipino", "Adobo"),
    ("Chicken Tinola", "Filipino", "Tinola"),
    ("Chicken Inasal", "Filipino", "Inasal"),
    ("Phở Gà (Vietnamese Chicken Noodle Soup)", "Vietnamese", "Phở"),
    ("Vietnamese Lemongrass Chicken", "Vietnamese", ""),
]

TURKEY_DUCK = [
    ("Classic Roast Turkey", "American", "Roast turkey"),
    ("Turkey Burgers", "American", ""),
    ("Turkey Chili", "American", ""),
    ("Turkey Meatballs", "American", ""),
    ("Turkey Tetrazzini", "American", "Tetrazzini"),
    ("Duck à l'Orange", "French", "Duck à l'orange"),
    ("Peking Duck", "Chinese", "Peking duck"),
    ("Crispy Duck Breast with Cherry Sauce", "French", ""),
    ("Duck Ragu with Pappardelle", "Italian", ""),
    ("Roasted Cornish Game Hens", "American", "Rock Cornish game hen"),
]

BIRD = re.compile(r"chicken|turkey|duck|hens?\b|poultry", re.I)

# Where the automatic search picked the wrong picture (a rug for "Turkey Chili", a chili plant for peri-peri),
# name the Wikimedia Commons file that really shows the dish. Found by reading the contact sheet.
PHOTO_OVERRIDES = {
    "Chicken Tinga Tacos": "El Pavo Real Lunch Chicken Tinga Tacos.jpg",
    "Peri-Peri Chicken": "Peri-Peri Chicken dish.jpg",
    "Chicken Karahi": "Chicken Karahi.JPG",
    "Chicken Adobo": "Chicken adobo.jpg",
    "Vietnamese Lemongrass Chicken": "Lemongrass chicken at Quan Nem Ninh Hoa, Sacramento.jpg",
    "Turkey Chili": "Turkey Chili.jpg",
    "Khao Man Gai": "Khao Man Gai at Nong's Khao Man Gai.jpg",                    # it had borrowed Hainanese Chicken Rice's photo
    "Crispy Duck Breast with Cherry Sauce": "Roast Duck breast with a cherry sauce, dauphinoise potatoes, cauliflower cheese, broccoli, peas & beans (47953415966).jpg",
}


def norm(title):
    return {w for w in re.findall(r"[a-z]{3,}", title.lower()) if w not in ai.STOP and w not in {"chicken"}}


def existing_titles():
    path = os.path.join(ROOT, "static", "data", "library.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        return [r["title"] for r in json.load(fh)["recipes"]]


def write_recipe(title, cuisine, tag):
    system = ai.RECIPE_PROMPT.format(tags="chicken: Chicken, poultry: Turkey & Duck")
    user = (f"Dish: {title}. Servings: 4. Context: the classic, well-loved {cuisine} dish, written the way a careful "
            f"cookbook would write it. The person asked: the real, authentic version of {title}.")
    for attempt in range(3):
        try:
            data = ai._ask(system, user, 2400)
        except ai.AIError:
            continue
        strip_no = re.compile(r"^\s*(?:step\s*)?\d+[.):]\s*", re.I)
        ings = [ai._s(x, 160) for x in (data.get("ingredients") or []) if isinstance(x, str) and ai._s(x, 160)][:20]
        steps = [strip_no.sub("", ai._s(x, 420)) for x in (data.get("steps") or []) if isinstance(x, str) and ai._s(x, 420)][:12]
        if len(ings) >= 5 and len(steps) >= 3 and BIRD.search(" ".join(ings)):
            return {
                "title": title, "tag": tag, "sub": cuisine,
                "min": ai._int(data.get("minutes"), 0, 0, 900) or None,
                "serves": ai._int(data.get("serves"), 4, 1, 24) or 4,
                "ing": ings, "steps": steps, "tip": ai._s(data.get("notes"), 260),
            }
    return None


def wiki_lead(article):
    """The lead photo of a hand-picked Wikipedia article. I chose the article, so only a non-dish is rejected."""
    d = ai._get("https://en.wikipedia.org/w/api.php", action="query", format="json", formatversion="2",
                prop="pageimages|description", piprop="thumbnail", pithumbsize="960", redirects="1", titles=article)
    for p in ((d or {}).get("query", {}).get("pages") or []):
        thumb = (p.get("thumbnail") or {}).get("source", "")
        if not p.get("missing") and thumb.startswith(ai.IMG_HOSTS) and not ai.NOT_A_DISH.search(p.get("description") or ""):
            return {"url": thumb, "credit": "Wikipedia", "link": "https://en.wikipedia.org/wiki/" + ai.quote(p["title"].replace(" ", "_"))}
    return None


def commons_file(name):
    d = ai._get("https://commons.wikimedia.org/w/api.php", action="query", format="json", formatversion="2", titles="File:" + name,
                prop="imageinfo", iiprop="url|mime|extmetadata", iiurlwidth="960", iiextmetadatafilter="LicenseShortName|Artist")
    for p in ((d or {}).get("query", {}).get("pages") or []):
        ii = (p.get("imageinfo") or [{}])[0]
        thumb = ii.get("thumburl") or ""
        if thumb.startswith(ai.IMG_HOSTS):
            meta = ii.get("extmetadata") or {}
            who = ai._s(re.sub(r"<[^>]+>", "", (meta.get("Artist") or {}).get("value", "")), 40)
            lic = ai._s((meta.get("LicenseShortName") or {}).get("value"), 24)
            return {"url": thumb, "credit": " · ".join(x for x in (who, lic, "Wikimedia Commons") if x),
                    "link": "https://commons.wikimedia.org/wiki/File:" + ai.quote(name.replace(" ", "_"))}
    return None


def find_photo(title, wiki):
    if title in PHOTO_OVERRIDES:
        found = commons_file(PHOTO_OVERRIDES[title])
        if found:
            return found
    for lookup in (lambda: wiki and wiki_lead(wiki), lambda: ai._wikipedia(title, title), lambda: ai._commons(title, wiki),
                   lambda: ai._openverse(title, wiki)):
        try:
            found = lookup()
        except Exception:  # noqa: BLE001 - a lookup that blows up is just a lookup that found nothing
            found = None
        if found and str(found.get("url", "")).startswith(ai.IMG_HOSTS):
            return found
    return None


def make(job):
    title, cuisine, wiki, tag = job
    rec = write_recipe(title, cuisine, tag)
    if not rec:
        return job, None
    photo = find_photo(title, wiki)
    rec.update(img=photo["url"] if photo else "", cr=photo["credit"] if photo else "", crl=photo["link"] if photo else "")
    return job, rec


def sheet(recipes):
    rows = "".join(
        f'<figure><img src="{r["img"]}" loading="lazy"><figcaption><b>{r["title"]}</b><br>{r["cr"]} · {r["tag"]}</figcaption></figure>'
        if r["img"] else f'<figure class="none"><figcaption><b>{r["title"]}</b><br>NO PHOTO</figcaption></figure>' for r in recipes)
    html = ("<!doctype html><meta charset=utf-8><title>photo check</title><style>body{font:12px system-ui;margin:8px;"
            "display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}figure{margin:0}img{width:100%;"
            "aspect-ratio:4/3;object-fit:cover;border-radius:6px;display:block}figcaption{padding:3px 0}.none{background:#fdd;"
            "padding:8px;border-radius:6px}</style>" + rows)
    with open(os.path.join(ROOT, "static", "_sheet.html"), "w", encoding="utf-8") as fh:
        fh.write(html)


def fix_photos(have):
    """Apply PHOTO_OVERRIDES to recipes already written (no new AI calls)."""
    for rec in have:
        if rec["title"] in PHOTO_OVERRIDES:
            photo = commons_file(PHOTO_OVERRIDES[rec["title"]])
            print(f"  {rec['title']}: {'ok' if photo else 'NOT FOUND'}")
            if photo:
                rec.update(img=photo["url"], cr=photo["credit"], crl=photo["link"])


def main():
    redo = sys.argv[sys.argv.index("--redo") + 1] if "--redo" in sys.argv else None
    have = []
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as fh:
            have = json.load(fh)
    if "--fix-photos" in sys.argv:
        fix_photos(have)
        with open(OUT, "w", encoding="utf-8") as fh:
            json.dump(have, fh, ensure_ascii=False, indent=1)
        sheet(have)
        return
    if redo:
        have = [r for r in have if r["title"].lower() != redo.lower()]
    known = {r["title"].lower() for r in have}
    taken = [norm(t) for t in existing_titles()]

    jobs = []
    for tag, dishes in (("chicken", CHICKEN), ("poultry", TURKEY_DUCK)):
        for title, cuisine, wiki in dishes:
            if title.lower() in known or (redo and title.lower() != redo.lower()):
                continue
            words = norm(title)
            twin = next((t for t in taken if words and len(words & t) / len(words | t) >= 0.6), None)
            if twin is not None and not redo:
                print(f"skip (already in the library): {title}")
                continue
            jobs.append((title, cuisine, wiki, tag))
    print(f"writing {len(jobs)} dishes with {ai.MODEL}…")

    next_id = max([FIRST_ID - 1] + [int(r["id"]) for r in have]) + 1
    failed = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        for n, (job, rec) in enumerate(pool.map(make, jobs), 1):
            if not rec:
                failed.append(job[0])
                print(f"  [{n}/{len(jobs)}] FAILED {job[0]}")
                continue
            rec.update(id=str(next_id), src="", dom="AI recipe", video="")
            next_id += 1
            have.append(rec)
            print(f"  [{n}/{len(jobs)}] {rec['title']}  {'photo' if rec['img'] else 'NO PHOTO'}")
            if n % 15 == 0:
                os.makedirs(os.path.dirname(OUT), exist_ok=True)
                with open(OUT, "w", encoding="utf-8") as fh:
                    json.dump(have, fh, ensure_ascii=False, indent=1)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(have, fh, ensure_ascii=False, indent=1)
    print(f"\n{len(have)} recipes in {OUT}; {sum(1 for r in have if not r['img'])} without a photo; failed: {failed or 'none'}")
    if "--sheet" in sys.argv:
        sheet(have)
        print("contact sheet: static/_sheet.html")


if __name__ == "__main__":
    main()
