"""Write scripts/details.json: the catalogue details every recipe card shows.

For each recipe: a short description ("about"), a difficulty level, what to serve it with, one tip, a nutrition
estimate per serving and diet labels. The AI proposes the diet labels and the ingredient list has the last word
(ai.diet_labels), so a dish with fish sauce is never "vegetarian". Six recipes go in each AI call; recipes already
in details.json are skipped, so this can be run again after adding recipes.

build_library.py puts the small fields (level, diet, kcal) in library.json and the rest in details.json, which the
app loads after it has drawn the first screen.

    python scripts/enrich.py                 # every recipe not done yet
    python scripts/enrich.py --redo 52772    # one recipe again
"""

import glob
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(ROOT, ".env"))
import ai  # noqa: E402

OUT = os.path.join(ROOT, "scripts", "details.json")
BATCH = 6

PROMPT = """You write catalogue details for recipes in a home-cooking app. For EACH recipe below return one object with:
- "id": the recipe's id, exactly as given.
- "about": 2 or 3 sentences, 220 to 380 characters, for someone deciding what to cook: what the dish is and where it comes from, how it tastes and feels, and what makes it worth making. Concrete and plain. Don't start with the dish's name or "This"; no hype words (delicious, perfect, mouthwatering, flavorful, elevate).
- "level": "Easy", "Medium" or "Hard" for a home cook, judged by technique, timing and the number of components, not by length alone.
- "serve": what to serve it with, max 70 characters, e.g. "Steamed jasmine rice and a crisp cucumber salad". "" when it is already a full plate, a drink or a sauce.
- "tip": one practical tip a good cook would add that the method doesn't already say, max 150 characters.
- "kcal", "protein", "carbs", "fat": your best estimate PER SERVING (integers; grams for the last three), from the ingredients and the servings given.
- "diet": every label strictly true of the recipe exactly as written, from "vegetarian", "vegan", "gluten-free", "dairy-free", "spicy". Vegetarian: no meat, poultry, fish, shellfish, fish sauce, anchovies, gelatin or meat/fish stock. Gluten-free: no wheat, flour, bread, pasta, couscous, barley, rye, beer or regular soy sauce. Dairy-free: no milk, butter, cream, cheese, yogurt or ghee. Spicy: noticeably hot. Leave a label out when unsure.
Return ONLY JSON: {"recipes": [one object per recipe, in the same order]}"""


def all_recipes():
    seen, out = set(), []
    with open(os.path.join(ROOT, "static", "data", "library.json"), encoding="utf-8") as fh:
        lists = [json.load(fh)["recipes"]]
    for path in sorted(glob.glob(os.path.join(ROOT, "scripts", "extras", "*.json"))):
        with open(path, encoding="utf-8") as fh:
            lists.append(json.load(fh))
    for r in (r for rs in lists for r in rs):
        if r["id"] not in seen:
            seen.add(r["id"])
            out.append(r)
    return out


def brief(r):
    return (f'id {r["id"]} | {r["title"]} | {r.get("sub") or "unknown cuisine"} | serves {r.get("serves") or 4}'
            f' | {r.get("min") or "?"} min\nIngredients: {"; ".join(r["ing"])[:760]}\nMethod: {" ".join(r["steps"])[:460]}')


def ask(batch):
    body = {"model": ai.MODEL, "max_completion_tokens": 4000, "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": "\n\n".join(brief(r) for r in batch)}]}
    if ai.MODEL.startswith(("gpt-5", "o")):
        body["reasoning_effort"] = ai.EFFORT
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"}
    for attempt in range(4):
        try:
            resp = requests.post(ai.OPENAI_URL, headers=headers, json=body, timeout=(10, 120))
            if resp.status_code == 429 or resp.status_code >= 500:
                time.sleep(3 * (attempt + 1))
                continue
            resp.raise_for_status()
            return ai._json(resp.json()["choices"][0]["message"]["content"])
        except (requests.RequestException, ai.AIError, KeyError, IndexError):
            time.sleep(2 * (attempt + 1))
    return {}


def enrich(batch):
    data = ask(batch)
    by_id = {str(x.get("id")): x for x in (data.get("recipes") or []) if isinstance(x, dict)}
    out = {}
    for r in batch:
        x = by_id.get(r["id"])
        if not x:
            continue
        d = ai.details(x, r["ing"])
        if len(d["about"]) < 60 or not d["level"]:
            continue
        out[r["id"]] = {"about": d["about"], "level": d["level"], "serve": d["serve"], "tip": ai._s(x.get("tip"), 200),
                        "nut": d["nut"], "diet": d["diet"]}
    return out


def main():
    done = {}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as fh:
            done = json.load(fh)
    if "--redo" in sys.argv:
        done.pop(sys.argv[sys.argv.index("--redo") + 1], None)
    todo = [r for r in all_recipes() if r["id"] not in done]
    batches = [todo[i:i + BATCH] for i in range(0, len(todo), BATCH)]
    print(f"{len(todo)} recipes to describe in {len(batches)} calls ({len(done)} already done)", flush=True)
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(enrich, b) for b in batches]
        for n, fut in enumerate(as_completed(futures), 1):
            done.update(fut.result())
            if n % 10 == 0 or n == len(futures):
                with open(OUT, "w", encoding="utf-8") as fh:
                    json.dump(done, fh, ensure_ascii=False, indent=0)
                print(f"  {n}/{len(futures)} calls · {len(done)} described · {time.time() - t0:.0f}s", flush=True)
    missing = [r["title"] for r in all_recipes() if r["id"] not in done]
    print(f"done: {len(done)} described; missing {len(missing)}: {missing[:12]}")


if __name__ == "__main__":
    main()
