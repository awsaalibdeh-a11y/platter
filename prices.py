"""Platter's prices: what food costs where you are.

Every recipe carries the US-dollar cost of each ingredient line (scripts/costs.py). To show those where you live,
the AI prices one fixed basket of everyday groceries there (chicken, beef, rice, milk, eggs, tomatoes…), in your
currency. Comparing that basket with the same basket at US prices gives a factor per kind of food: meat can be
dear where vegetables are cheap. The app multiplies each ingredient's cost by its kind's factor.

The AI's basket is checked against today's exchange rate, so a price given in the wrong currency or off by a factor
of ten can't slip through. Results are kept for a week per place.
"""

import re
import statistics
import threading
import time

import requests
from flask import Blueprint, jsonify, request

import ai

bp = Blueprint("prices", __name__)

# (key, kind of food, what exactly, typical US supermarket price in USD, 2025)
BASKET = [
    ("chicken", "poultry", "1 kg boneless chicken breast", 9.50), ("whole_chicken", "poultry", "1 kg whole chicken", 4.80),
    ("beef", "meat", "1 kg ground beef", 12.50), ("lamb", "meat", "1 kg lamb (leg or shoulder)", 20.00), ("pork", "meat", "1 kg pork chops", 9.50),
    ("salmon", "seafood", "1 kg fresh salmon fillet", 24.00), ("shrimp", "seafood", "1 kg raw shrimp", 20.00),
    ("milk", "dairy", "1 litre whole milk", 1.10), ("eggs", "dairy", "12 eggs", 4.20), ("cheese", "dairy", "1 kg cheddar or the local hard cheese", 13.00),
    ("butter", "dairy", "250 g butter", 2.60), ("yogurt", "dairy", "1 kg plain yogurt", 4.20),
    ("tomatoes", "produce", "1 kg tomatoes", 4.40), ("onions", "produce", "1 kg onions", 2.40), ("potatoes", "produce", "1 kg potatoes", 2.10),
    ("garlic", "produce", "1 kg garlic", 9.00), ("lemons", "produce", "1 kg lemons", 5.00), ("apples", "produce", "1 kg apples", 4.60),
    ("bananas", "produce", "1 kg bananas", 1.50), ("lettuce", "produce", "1 head of lettuce", 2.20),
    ("rice", "grains", "1 kg white rice", 2.70), ("pasta", "grains", "1 kg dried pasta", 3.40), ("bread", "grains", "1 loaf of bread, about 500 g", 3.00),
    ("flour", "grains", "1 kg wheat flour", 1.30),
    ("olive_oil", "pantry", "1 litre olive oil", 13.00), ("sugar", "pantry", "1 kg white sugar", 2.10), ("lentils", "pantry", "1 kg dried lentils", 3.60),
    ("canned_tomatoes", "pantry", "one 400 g can of tomatoes", 1.40), ("cumin", "spices", "one 50 g jar of ground cumin", 3.50),
]
KINDS = ["poultry", "meat", "seafood", "dairy", "produce", "grains", "pantry", "spices"]

PROMPT = """You know typical supermarket prices around the world. Give today's typical price at an ordinary supermarket in {place}, in the local currency, for exactly the quantity stated for each item. Use the everyday local equivalent where the exact item is unusual there (the local hard cheese, the local rice). A single number for each, no ranges, no currency symbols.
Items (key: quantity and item):
{items}
Return ONLY JSON: {{"currency": "the ISO 4217 code of the local currency", "prices": {{"key": number, ...}}}}"""

_lock = threading.Lock()
_places = {}                       # (country, city) → (time, result)
_fx = {"at": 0, "rates": {}}


def _rates():
    """Today's exchange rates, local currency per US dollar; {} if the service can't be reached."""
    if time.time() - _fx["at"] < 12 * 3600 and _fx["rates"]:
        return _fx["rates"]
    try:
        d = requests.get("https://open.er-api.com/v6/latest/USD", timeout=8).json()
        if d.get("result") == "success":
            _fx.update(at=time.time(), rates=d["rates"])
    except (requests.RequestException, ValueError):
        pass
    return _fx["rates"]


def _calibrate(place):
    items = "\n".join(f"{key}: {what}" for key, _, what, _ in BASKET)
    data = ai._ask(PROMPT.format(place=place, items=items), "Prices, please.", 1600, read_timeout=50, tries=1)
    currency = re.sub(r"[^A-Z]", "", str(data.get("currency") or "").upper())[:3]
    got = data.get("prices") if isinstance(data.get("prices"), dict) else {}
    ratios = {}
    for key, kind, _, usd in BASKET:
        try:
            local = float(got.get(key))
        except (TypeError, ValueError):
            continue
        if local > 0:
            ratios.setdefault(kind, []).append(local / usd)
    every = [x for xs in ratios.values() for x in xs]
    if len(currency) != 3 or len(every) < len(BASKET) // 2:
        raise ai.AIError("Couldn't work out prices for that place. Try the country on its own.")
    general = statistics.median(every)
    fx = _rates().get(currency)
    rough = False
    if fx:
        level = general / fx                        # how dear food is there, compared with the US
        if not 0.12 <= level <= 5:                  # a price in the wrong currency, or out by a factor of ten
            general, ratios, rough = fx * 0.9, {}, True
        lo, hi = fx * 0.12, fx * 6
        ratios = {k: [min(max(x, lo), hi) for x in v] for k, v in ratios.items()}
    mult = {k: round(statistics.median(ratios[k]), 5) if ratios.get(k) else round(general, 5) for k in KINDS}
    mult["general"] = round(general, 5)
    return {"currency": currency, "mult": mult, "level": round(general / fx, 2) if fx else None, "rough": rough}


@bp.post("/api/prices")
def prices():
    body = request.get_json(silent=True) or {}
    cc = re.sub(r"[^A-Z]", "", str(body.get("country") or "").upper())[:2]
    name = ai._s(body.get("name"), 60) or cc
    city = ai._s(body.get("city"), 60)
    if len(cc) != 2:
        return jsonify(error="Pick a country."), 400
    if cc == "US" and not city:                     # the costs are already in US prices
        return jsonify(country=cc, city="", currency="USD", mult={k: 1 for k in KINDS + ["general"]}, level=1, rough=False, at=int(time.time()))
    key = (cc, city.lower())
    with _lock:
        hit = _places.get(key)
    if hit and time.time() - hit[0] < 7 * 86400:
        return jsonify(hit[1])
    if not ai._configured():
        return jsonify(error="Prices need the site's AI switched on.", code="off"), 503
    if ai._limited("llm"):
        return jsonify(error="That's a lot of AI requests. Give it a little while."), 429
    try:
        result = _calibrate(f"{city}, {name}" if city else name)
    except ai.AIError as exc:
        return jsonify(error=str(exc)), exc.status
    result.update(country=cc, city=city, at=int(time.time()))
    with _lock:
        if len(_places) > 500:
            _places.clear()
        _places[key] = (time.time(), result)
    return jsonify(result)
