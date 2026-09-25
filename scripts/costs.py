"""Write scripts/costs.json: what each ingredient line of each recipe costs, in US dollars.

The cost of the amount the recipe uses, at typical US supermarket prices (2 tbsp of olive oil is about $0.35, not the
whole bottle). The app turns these into local prices: each line is scaled by how expensive its kind of food (meat,
dairy, produce…) is where you are, in your currency (ai.py, /api/prices). Ten recipes go in each AI call; recipes
already done are skipped, so this can be run again after adding recipes.

    python scripts/costs.py
"""

import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(ROOT, ".env"))
import ai  # noqa: E402
from enrich import all_recipes  # noqa: E402

OUT = os.path.join(ROOT, "scripts", "costs.json")
BATCH = 10

PROMPT = """You estimate grocery costs for recipes in a cooking app. For EACH recipe below, give the cost in US dollars of the amount of each ingredient line the recipe uses, at typical US supermarket prices in 2025. Price only the amount used, not the whole package: 2 tbsp of olive oil is about 0.35, 1 clove of garlic about 0.10, 1 lb of chicken thighs about 3.50. Water is 0; salt, pepper and "to taste" or garnish lines are a few cents. Exactly one number per ingredient line, in the same order, rounded to cents.
Return ONLY JSON: {"recipes": [{"id": str, "costs": [number, ...]}]}"""


def brief(r):
    lines = "\n".join(f"  {i}. {line}" for i, line in enumerate(r["ing"], 1))
    return f'id {r["id"]} | {r["title"]} | serves {r.get("serves") or 4}\n{lines}'


def ask(batch):
    body = {"model": ai.MODEL, "max_completion_tokens": 3000, "response_format": {"type": "json_object"},
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


def price(batch):
    got = {str(x.get("id")): x.get("costs") for x in (ask(batch).get("recipes") or []) if isinstance(x, dict)}
    out = {}
    for r in batch:
        costs = got.get(r["id"])
        if not isinstance(costs, list) or len(costs) != len(r["ing"]):
            continue                                                   # a list that doesn't line up is worse than none
        try:
            costs = [round(min(max(float(c), 0.0), 80.0), 2) for c in costs]
        except (TypeError, ValueError):
            continue
        per_serving = sum(costs) / (r.get("serves") or 4)
        if 0.05 <= per_serving <= 40:
            out[r["id"]] = costs
    return out


def main():
    done = {}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as fh:
            done = json.load(fh)
    for _ in range(3):                                                 # a second and third go for any batch that didn't line up
        todo = [r for r in all_recipes() if r["id"] not in done]
        if not todo:
            break
        batches = [todo[i:i + BATCH] for i in range(0, len(todo), BATCH)]
        print(f"{len(todo)} recipes to price in {len(batches)} calls", flush=True)
        t0 = time.time()
        with ThreadPoolExecutor(max_workers=8) as pool:
            for n, fut in enumerate(as_completed([pool.submit(price, b) for b in batches]), 1):
                done.update(fut.result())
                if n % 10 == 0 or n == len(batches):
                    with open(OUT, "w", encoding="utf-8") as fh:
                        json.dump(done, fh, separators=(",", ":"))
                    print(f"  {n}/{len(batches)} calls · {len(done)} priced · {time.time() - t0:.0f}s", flush=True)
    print(f"done: {len(done)} priced; missing {len([r for r in all_recipes() if r['id'] not in done])}")


if __name__ == "__main__":
    main()
