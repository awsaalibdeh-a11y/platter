"""Write scripts/extras/more.json: well-loved dishes from every tag that TheMealDB lacks.

Same method as add_chicken.py: each recipe is written by the Ask AI recipe prompt (ai.py), its photo is a real
one from Wikipedia or Wikimedia Commons, and the result is committed as plain data, so building the library
never needs a key or a network. A photo another recipe already uses is skipped, so no two dishes share one.

    python scripts/add_recipes.py                  # write the dishes that are not in more.json yet
    python scripts/add_recipes.py --redo "Bulgogi" # write one again
    python scripts/add_recipes.py --fix-photos     # re-apply PHOTO_OVERRIDES without new AI calls
    python scripts/add_recipes.py --sheets         # numbered contact sheets static/_sheetN.html to check photos by eye
"""

import json
import os
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import add_chicken as base  # noqa: E402  (loads .env and ai.py; reuses its Wikipedia and Commons lookups)

ai = base.ai
OUT = os.path.join(ROOT, "scripts", "extras", "more.json")
FIRST_ID = 91001

TAG_NAMES = {"appetizers": "Appetizers", "soup": "Soup", "salad": "Salad", "beef": "Beef", "seafood": "Seafood", "pork": "Pork",
             "lamb": "Lamb", "vegetarian": "Vegetarian Mains", "pasta": "Pasta & Noodles", "desserts": "Desserts",
             "breakfast": "Breakfast", "sides": "Sides", "mains": "Everyday Mains"}
SERVES = {"desserts": 8, "appetizers": 6}

# (title, cuisine, the Wikipedia article whose lead photo shows this dish, or "" to search Commons)
DISHES = {
    "beef": [
        ("Bulgogi", "Korean", "Bulgogi"), ("Carne Asada Tacos", "Mexican", "Carne asada"),
        ("Chili con Carne", "Tex-Mex", "Chili con carne"), ("Philly Cheesesteak", "American", "Cheesesteak"),
        ("Mongolian Beef", "Chinese-American", "Mongolian beef"), ("Classic Pot Roast", "American", "Pot roast"),
        ("Swedish Meatballs", "Swedish", "Swedish meatballs"), ("Ropa Vieja", "Cuban", "Ropa vieja"),
        ("Lomo Saltado", "Peruvian", "Lomo saltado"), ("Steak au Poivre", "French", "Steak au poivre"),
        ("Birria Tacos", "Mexican", "Birria"), ("Galbi-jjim (Korean Braised Short Ribs)", "Korean", "Galbi-jjim"),
        ("Picadillo", "Cuban", "Picadillo"), ("Sloppy Joes", "American", "Sloppy joe"),
        ("Beef and Broccoli", "Chinese-American", "Beef and broccoli"), ("Bobotie", "South African", "Bobotie"),
        ("Smash Burgers", "American", ""), ("Beef Stroganoff", "Russian", "Beef Stroganoff"),
    ],
    "seafood": [
        ("Fish Tacos", "Mexican", "Fish taco"), ("Shrimp Scampi", "Italian-American", "Scampi"),
        ("Cioppino", "Italian-American", "Cioppino"), ("Bouillabaisse", "French", "Bouillabaisse"),
        ("Shrimp and Grits", "Southern", "Shrimp and grits"), ("Ahi Poke Bowl", "Hawaiian", "Poke (Hawaiian dish)"),
        ("Ceviche", "Peruvian", "Ceviche"), ("Maryland Crab Cakes", "American", "Crab cake"),
        ("Lobster Roll", "American", "Lobster roll"), ("Moqueca", "Brazilian", "Moqueca"),
        ("Miso-Glazed Black Cod", "Japanese", ""), ("Moules Frites", "Belgian", "Moules-frites"),
        ("Garlic Butter Shrimp", "American", ""), ("Tod Mun Pla (Thai Fish Cakes)", "Thai", "Thot man"),
        ("Gambas al Ajillo", "Spanish", "Gambas al ajillo"), ("Shrimp Tempura", "Japanese", "Tempura"),
        ("Goan Fish Curry", "Goan", ""),
    ],
    "pork": [
        ("Carnitas", "Mexican", "Carnitas"), ("Tacos al Pastor", "Mexican", "Al pastor"), ("Tonkatsu", "Japanese", "Tonkatsu"),
        ("Char Siu", "Cantonese", "Char siu"), ("Pulled Pork Sandwiches", "American", "Pulled pork"),
        ("Cochinita Pibil", "Mexican", "Cochinita pibil"), ("Porchetta", "Italian", "Porchetta"), ("Katsudon", "Japanese", "Katsudon"),
        ("Gua Bao (Pork Belly Buns)", "Taiwanese", "Gua bao"), ("Lechon Kawali", "Filipino", "Lechon kawali"),
        ("BBQ Baby Back Ribs", "American", "Pork ribs"), ("Bánh Mì Thịt", "Vietnamese", "Bánh mì"),
        ("Mapo Tofu", "Sichuan", "Mapo tofu"), ("Sweet and Sour Pork", "Cantonese", "Sweet and sour pork"),
        ("Twice-Cooked Pork", "Sichuan", "Twice-cooked pork"), ("Choucroute Garnie", "Alsatian", "Choucroute garnie"),
        ("Pork Chops with Apples", "American", ""),
    ],
    "lamb": [
        ("Lamb Rogan Josh", "Kashmiri", "Rogan josh"), ("Lamb Kofta", "Middle Eastern", "Kofta"),
        ("Moroccan Lamb Tagine with Apricots", "Moroccan", ""), ("Herb-Crusted Rack of Lamb", "French", "Rack of lamb"),
        ("Lamb Biryani", "Hyderabadi", ""), ("Irish Stew", "Irish", "Irish stew"), ("Mansaf", "Jordanian", "Mansaf"),
        ("Lamb Keema", "Indian", "Keema"), ("Kleftiko", "Greek", "Kleftiko"), ("Lamb Shawarma", "Levantine", ""),
        ("Slow-Roasted Lamb Shoulder", "British", ""), ("Lamb Chops with Mint Sauce", "British", "Mint sauce"),
        ("Maqluba", "Palestinian", "Maqluba"), ("Shepherd's Pie", "British", "Shepherd's pie"), ("Moussaka", "Greek", "Moussaka"),
    ],
    "vegetarian": [
        ("Chana Masala", "Indian", "Chana masala"), ("Palak Paneer", "Indian", "Palak paneer"), ("Dal Tadka", "Indian", "Dal"),
        ("Eggplant Parmesan", "Italian", "Parmigiana"), ("Mushroom Risotto", "Italian", "Risotto"),
        ("Black Bean Burgers", "American", "Veggie burger"), ("Stuffed Bell Peppers", "Mediterranean", "Stuffed peppers"),
        ("Aloo Gobi", "Indian", "Aloo gobi"), ("Paneer Tikka Masala", "Indian", "Paneer tikka masala"),
        ("Malai Kofta", "Indian", "Malai kofta"), ("Spanakopita", "Greek", "Spanakopita"), ("Mujadara", "Levantine", "Mujaddara"),
        ("Vegetable Bibimbap", "Korean", "Bibimbap"), ("Falafel Bowl with Tahini", "Middle Eastern", "Falafel"),
        ("Mushroom Stroganoff", "Russian", ""), ("Cauliflower Tacos", "Mexican", ""), ("Pav Bhaji", "Indian", "Pav bhaji"),
        ("Chiles Rellenos", "Mexican", "Chile relleno"), ("Gado-Gado", "Indonesian", "Gado-gado"), ("Rajma", "Indian", "Rajma"),
        ("Imam Bayildi", "Turkish", "İmam bayıldı"), ("Crispy Tofu Stir-Fry", "Chinese", ""),
    ],
    "pasta": [
        ("Cacio e Pepe", "Roman", "Cacio e pepe"), ("Pasta alla Norma", "Sicilian", "Pasta alla Norma"),
        ("Trofie al Pesto", "Ligurian", "Trofie"), ("Penne alla Vodka", "Italian-American", "Penne alla vodka"),
        ("Lasagne alla Bolognese", "Italian", "Lasagna"), ("Spaghetti Aglio e Olio", "Italian", "Spaghetti aglio e olio"),
        ("Dan Dan Noodles", "Sichuan", "Dandan noodles"), ("Yakisoba", "Japanese", "Yakisoba"), ("Japchae", "Korean", "Japchae"),
        ("Singapore Noodles", "Cantonese", "Singapore-style noodles"), ("Beef Chow Fun", "Cantonese", "Beef chow fun"),
        ("Tonkotsu Ramen", "Japanese", "Tonkotsu ramen"), ("Spaghetti alle Vongole", "Italian", "Spaghetti alle vongole"),
        ("Gnocchi with Brown Butter and Sage", "Italian", "Gnocchi"), ("Orecchiette with Broccoli Rabe and Sausage", "Apulian", "Orecchiette"),
        ("Pasta Primavera", "Italian-American", "Pasta primavera"), ("Bucatini all'Amatriciana", "Roman", "Amatriciana"),
        ("Pastitsio", "Greek", "Pastitsio"), ("Zhajiangmian", "Beijing", "Zhajiangmian"),
    ],
    "soup": [
        ("French Onion Soup", "French", "French onion soup"), ("Miso Soup", "Japanese", "Miso soup"),
        ("Red Lentil Soup", "Turkish", "Lentil soup"), ("Roasted Butternut Squash Soup", "American", ""),
        ("Potato Leek Soup", "French", ""), ("New England Clam Chowder", "American", "Clam chowder"),
        ("Hot and Sour Soup", "Chinese", "Hot and sour soup"), ("Harira", "Moroccan", "Harira"),
        ("Mulligatawny", "Anglo-Indian", "Mulligatawny"), ("Split Pea Soup", "American", "Pea soup"),
        ("Creamy Tomato Soup", "American", "Tomato soup"), ("Wonton Soup", "Cantonese", "Wonton"),
        ("Avgolemono", "Greek", "Avgolemono"), ("Ribollita", "Tuscan", "Ribollita"), ("Caldo Verde", "Portuguese", "Caldo verde"),
        ("Corn Chowder", "American", "Corn chowder"), ("Pasta e Fagioli", "Italian", "Pasta e fagioli"), ("Solyanka", "Russian", "Solyanka"),
    ],
    "salad": [
        ("Greek Salad (Horiatiki)", "Greek", "Greek salad"), ("Caprese Salad", "Italian", "Caprese salad"),
        ("Cobb Salad", "American", "Cobb salad"), ("Salade Niçoise", "French", "Salade niçoise"),
        ("Waldorf Salad", "American", "Waldorf salad"), ("Fattoush", "Lebanese", "Fattoush"), ("Panzanella", "Tuscan", "Panzanella"),
        ("Som Tam (Green Papaya Salad)", "Thai", "Green papaya salad"), ("Classic Potato Salad", "American", "Potato salad"),
        ("Sunomono (Japanese Cucumber Salad)", "Japanese", "Sunomono"), ("Larb", "Lao", "Larb"), ("Tabbouleh", "Levantine", "Tabbouleh"),
        ("Kachumber", "Indian", "Kachumber"), ("Shirazi Salad", "Persian", "Shirazi salad"),
    ],
    "appetizers": [
        ("Guacamole", "Mexican", "Guacamole"), ("Classic Hummus", "Levantine", "Hummus"),
        ("Vietnamese Fresh Spring Rolls", "Vietnamese", "Gỏi cuốn"), ("Pork and Chive Potstickers", "Chinese", "Guotie"),
        ("Deviled Eggs", "American", "Deviled egg"), ("Stuffed Mushrooms", "Italian-American", "Stuffed mushrooms"),
        ("Spinach Artichoke Dip", "American", "Spinach and artichoke dip"), ("Baba Ghanoush", "Levantine", "Baba ghanoush"),
        ("Mozzarella Sticks", "American", "Mozzarella sticks"), ("Jalapeño Poppers", "Tex-Mex", "Jalapeño popper"),
        ("Arancini", "Sicilian", "Arancini"), ("Fried Calamari", "Mediterranean", ""), ("Onion Bhaji", "Indian", "Onion bhaji"),
        ("Elote (Mexican Street Corn)", "Mexican", "Elote"), ("Bruschetta al Pomodoro", "Italian", "Bruschetta"),
        ("Crab Rangoon", "Chinese-American", "Crab rangoon"), ("Takoyaki", "Japanese", "Takoyaki"), ("Tzatziki", "Greek", "Tzatziki"),
        ("Pão de Queijo", "Brazilian", "Pão de queijo"), ("Queso Fundido", "Mexican", ""),
    ],
    "desserts": [
        ("Crème Brûlée", "French", "Crème brûlée"), ("Panna Cotta", "Italian", "Panna cotta"),
        ("New York Cheesecake", "American", "Cheesecake"), ("Chocolate Lava Cake", "French", "Molten chocolate cake"),
        ("Churros with Chocolate Sauce", "Spanish", "Churro"), ("Tres Leches Cake", "Latin American", "Tres leches cake"),
        ("Mango Sticky Rice", "Thai", "Mango sticky rice"), ("Fudgy Brownies", "American", "Chocolate brownie"),
        ("Chocolate Chip Cookies", "American", "Chocolate chip cookie"), ("Key Lime Pie", "American", "Key lime pie"),
        ("Gulab Jamun", "Indian", "Gulab jamun"), ("Pavlova", "Australian", "Pavlova (cake)"), ("Tiramisu", "Italian", "Tiramisu"),
        ("Baklava", "Turkish", "Baklava"), ("Basque Burnt Cheesecake", "Spanish", "Basque cheesecake"), ("Kheer", "Indian", "Kheer"),
        ("Banana Bread", "American", "Banana bread"), ("Mochi Ice Cream", "Japanese", "Mochi ice cream"),
    ],
    "breakfast": [
        ("Eggs Benedict", "American", "Eggs Benedict"), ("Huevos Rancheros", "Mexican", "Huevos rancheros"),
        ("Buttermilk Pancakes", "American", "Pancake"), ("French Toast", "French", "French toast"),
        ("Belgian Waffles", "Belgian", "Belgian waffle"), ("Breakfast Burrito", "Tex-Mex", "Breakfast burrito"),
        ("Avocado Toast with Poached Egg", "Australian", "Avocado toast"), ("Overnight Oats", "Swiss", ""),
        ("Homemade Granola", "American", "Granola"), ("Spinach and Feta Frittata", "Italian", "Frittata"),
        ("Quiche Lorraine", "French", "Quiche"), ("Dutch Baby Pancake", "American", "Dutch baby pancake"),
        ("Menemen", "Turkish", "Menemen (food)"), ("Masala Omelette", "Indian", ""), ("Tamagoyaki", "Japanese", "Tamagoyaki"),
        ("Cinnamon Rolls", "Swedish", "Cinnamon roll"), ("Blueberry Muffins", "American", "Muffin"),
        ("Ful Medames", "Egyptian", "Ful medames"), ("Açaí Bowl", "Brazilian", "Açaí na tigela"),
        ("Breakfast Hash with Fried Eggs", "American", "Hash (food)"), ("Kaya Toast", "Singaporean", "Kaya toast"),
        ("Idli with Sambar", "South Indian", "Idli"),
    ],
    "sides": [
        ("Garlic Mashed Potatoes", "American", "Mashed potato"), ("Roasted Brussels Sprouts", "American", ""),
        ("Mexican Red Rice", "Mexican", "Mexican rice"), ("Jeera Rice", "Indian", "Jeera rice"), ("Garlic Naan", "Indian", "Naan"),
        ("Skillet Cornbread", "Southern", "Cornbread"), ("Classic Coleslaw", "American", "Coleslaw"),
        ("Creamed Spinach", "American", "Creamed spinach"), ("Patatas Bravas", "Spanish", "Patatas bravas"),
        ("Hasselback Potatoes", "Swedish", "Hasselback potatoes"), ("Rosemary Focaccia", "Italian", "Focaccia"),
        ("Refried Beans", "Mexican", "Refried beans"), ("Potatoes Dauphinoise", "French", "Gratin dauphinois"),
        ("Kimchi", "Korean", "Kimchi"), ("Tostones", "Caribbean", "Tostones"), ("Green Beans Almondine", "French", ""),
        ("Sweet Potato Fries", "American", ""),
    ],
    "mains": [
        ("Pizza Margherita", "Italian", "Pizza Margherita"), ("Pepperoni Pizza", "American", ""), ("Calzone", "Italian", "Calzone"),
        ("Okonomiyaki", "Japanese", "Okonomiyaki"), ("Egg Fried Rice", "Chinese", ""), ("Tortilla Española", "Spanish", "Spanish omelette"),
        ("Croque Monsieur", "French", "Croque monsieur"), ("Ultimate Grilled Cheese", "American", "Cheese sandwich"),
        ("Flammkuchen", "Alsatian", "Tarte flambée"), ("Pierogi", "Polish", "Pierogi"), ("Khachapuri", "Georgian", "Khachapuri"),
        ("Lahmacun", "Turkish", "Lahmacun"), ("Pupusas", "Salvadoran", "Pupusa"), ("Arepas con Queso", "Venezuelan", "Arepa"),
        ("Stuffed Cabbage Rolls", "Eastern European", "Cabbage roll"), ("Burrito Bowl", "Tex-Mex", ""),
    ],
}

# Where the automatic search picked the wrong picture, the Wikimedia Commons file that really shows the dish.
PHOTO_OVERRIDES = {
    "Smash Burgers": "Double Smash Burger with Fries.jpg",
    "Shrimp Scampi": "Shrimp Scampi with Campanelle (11884663686).jpg",          # the article's photo is a live langoustine
    "Miso-Glazed Black Cod": "Miso cod (5441609643).jpg",
    "Goan Fish Curry": "Goan Fish Curry Rice.jpg",
    "Moroccan Lamb Tagine with Apricots": "Lamb Tajine at Chambar.jpg",
    "Herb-Crusted Rack of Lamb": "Outback Steakhouse rack of lamb.JPG",             # the article's photo is raw
    "Lamb Keema": "Keema Matar (a dish from India).jpg",                            # the article's photo is a meat grinder
    "Lamb Shawarma": "Plate shawarma.jpg",
    "Lamb Chops with Mint Sauce": "Liat Portal for Foodie Disorder - Homemade Lamb Chops with Rice and Grilled Vegetables.jpg",
    "Dal Tadka": "Dal tadka and naan.jpg",                                         # "Dal" shows dry lentils
    "Malai Kofta": "Malai Kofta Curry.jpg",
    "Trofie al Pesto": "Trofie al pesto.jpg",
    "Wonton Soup": "FOOD Wonton Soup.jpg",
    "Burrito Bowl": "Chipotle burrito bowl - October 2024 - Sarah Stierch.jpg",
    "Pupusas": "Pupusas con curtido y salsa El Salvador.JPG",
}

MEATISH = re.compile(r"\b(beef|pork|chicken|turkey|lamb|mutton|bacon|ham|sausages?|chorizo|pancetta|prosciutto|salami|pepperoni|"
                     r"anchov\w*|shrimps?|prawns?|fish|tuna|salmon|cod|gelatin\w*|lard|meat|dashi|bonito)\b|fish sauce|oyster sauce", re.I)

_lock = threading.Lock()
USED = set()                     # photos already on a recipe, so no two dishes share one


def photo_key(url):
    return re.sub(r"/\d+px-", "/px-", (url or "").split("?")[0]).replace("thumb.wikimedia.org", "upload.wikimedia.org")


def norm(title):
    return {w for w in re.findall(r"[a-z]{3,}", title.lower()) if w not in ai.STOP}


def write_recipe(title, cuisine, tag):
    serves = SERVES.get(tag, 4)
    system = ai.RECIPE_PROMPT.format(tags=f"{tag}: {TAG_NAMES[tag]}")
    veg = " It must be vegetarian: no meat, poultry, fish, seafood, fish sauce or meat stock." if tag == "vegetarian" else ""
    user = (f"Dish: {title}. Servings: {serves}. Context: the classic, well-loved {cuisine} dish, written the way a careful "
            f"cookbook would write it.{veg} The person asked: the real, authentic version of {title}.")
    strip_no = re.compile(r"^\s*(?:step\s*)?\d+[.):]\s*", re.I)
    for _ in range(3):
        try:
            data = ai._ask(system, user, 2600)
        except ai.AIError:
            continue
        ings = [ai._s(x, 160) for x in (data.get("ingredients") or []) if isinstance(x, str) and ai._s(x, 160)][:20]
        steps = [strip_no.sub("", ai._s(x, 420)) for x in (data.get("steps") or []) if isinstance(x, str) and ai._s(x, 420)][:12]
        if len(ings) < 5 or len(steps) < 3 or (tag == "vegetarian" and MEATISH.search(" ".join(ings))):
            continue
        return {"title": title, "tag": tag, "sub": cuisine, "min": ai._int(data.get("minutes"), 0, 0, 900) or None,
                "serves": ai._int(data.get("serves"), serves, 1, 24) or serves, "ing": ings, "steps": steps,
                "tip": ai._s(data.get("notes"), 260)}
    return None


def find_photo(title, wiki):
    if title in PHOTO_OVERRIDES:
        found = base.commons_file(PHOTO_OVERRIDES[title])
        if found:
            return found
    for lookup in (lambda: wiki and base.wiki_lead(wiki), lambda: ai._wikipedia(title, title), lambda: ai._commons(title, wiki),
                   lambda: ai._openverse(title, wiki)):
        try:
            found = lookup()
        except Exception:  # noqa: BLE001 - a lookup that fails is a lookup that found nothing
            found = None
        if found and str(found.get("url", "")).startswith(ai.IMG_HOSTS):
            key = photo_key(found["url"])
            with _lock:
                if key in USED:
                    continue
                USED.add(key)
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


def sheets(recs):
    def small(u):
        return re.sub(r"^(https://(?:upload|thumb)\.wikimedia\.org/wikipedia/[^/]+/thumb/.+/)\d+(px-[^/]+)$", r"\g<1>250\2", u)
    css = ("<!doctype html><meta charset=utf-8><title>photo check</title><style>body{margin:4px;display:grid;grid-template-columns:"
           "repeat(8,1fr);gap:4px}figure{margin:0;position:relative}img{width:100%;aspect-ratio:1;object-fit:cover;display:block;"
           "background:#eee}i{position:absolute;left:0;top:0;background:#000;color:#fff;font:bold 22px system-ui;padding:0 6px}"
           ".fb i{background:#c00}</style>")
    for page in range(0, len(recs), 40):
        cells = [f'<figure class="{"fb" if r["cr"] != "Wikipedia" else ""}"><img src="{small(r["img"])}" referrerpolicy="no-referrer">'
                 f'<i>{i}</i></figure>' for i, r in enumerate(recs[page:page + 40], page + 1)]
        with open(os.path.join(ROOT, "static", f"_sheet{page // 40 + 1}.html"), "w", encoding="utf-8") as fh:
            fh.write(css + "".join(cells))
    print(" | ".join(f'{i}{"*" if r["cr"] != "Wikipedia" else ""}:{r["title"]}' for i, r in enumerate(recs, 1)))


def save(have):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(have, fh, ensure_ascii=False, indent=1)


def main():
    have = []
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as fh:
            have = json.load(fh)
    if "--sheets" in sys.argv and "--fix-photos" not in sys.argv and len(sys.argv) == 2:
        return sheets(have)
    if "--fix-photos" in sys.argv:
        for rec in have:
            if rec["title"] in PHOTO_OVERRIDES:
                photo = base.commons_file(PHOTO_OVERRIDES[rec["title"]])
                print(f"  {rec['title']}: {'ok' if photo else 'NOT FOUND'}")
                if photo:
                    rec.update(img=photo["url"], cr=photo["credit"], crl=photo["link"])
        save(have)
        return sheets(have) if "--sheets" in sys.argv else None

    redo = sys.argv[sys.argv.index("--redo") + 1] if "--redo" in sys.argv else None
    if redo:
        have = [r for r in have if r["title"].lower() != redo.lower()]
    known = {r["title"].lower() for r in have}
    with open(os.path.join(ROOT, "static", "data", "library.json"), encoding="utf-8") as fh:
        library = json.load(fh)["recipes"]
    USED.update(photo_key(r["img"]) for r in library + have if r.get("img"))
    taken = [norm(r["title"]) for r in library]

    jobs = []
    for tag, dishes in DISHES.items():
        for title, cuisine, wiki in dishes:
            if title.lower() in known or (redo and title.lower() != redo.lower()):
                continue
            words = norm(title)
            if not redo and any(words and len(words & t) / len(words | t) >= 0.6 for t in taken):
                print(f"skip (already in the library): {title}")
                continue
            jobs.append((title, cuisine, wiki, tag))
    print(f"writing {len(jobs)} dishes with {ai.MODEL}…", flush=True)

    next_id = max([FIRST_ID - 1] + [int(r["id"]) for r in have]) + 1
    failed = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        for n, (job, rec) in enumerate(pool.map(make, jobs), 1):
            if not rec:
                failed.append(job[0])
                print(f"  [{n}/{len(jobs)}] FAILED {job[0]}", flush=True)
                continue
            rec.update(id=str(next_id), src="", dom="AI recipe", video="")
            next_id += 1
            have.append(rec)
            print(f"  [{n}/{len(jobs)}] {rec['title']}  {'photo' if rec['img'] else 'NO PHOTO'}", flush=True)
            if n % 20 == 0:
                save(have)
    save(have)
    print(f"\n{len(have)} recipes in {OUT}; without a photo: {[r['title'] for r in have if not r['img']] or 'none'}; failed: {failed or 'none'}")
    if "--sheets" in sys.argv:
        sheets(have)


if __name__ == "__main__":
    main()
