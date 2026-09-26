# Platter

A recipe box with three panes — tags, the recipes in a tag, and the recipe itself — laid out
like an iPad app, in a browser.

- **Tags** as photo tiles; rename them, change their cover, hide them, add your own
- **Search this tag**, sort, and filter by favourites, video or subtag
- **Servings scaler** that rewrites the quantities (`1 cup` → `1 ½ cups`, `4 cloves` → `6 cloves`)
- **Tick-off ingredients** and directions, remembered per recipe
- **Cook Mode**: bigger type, the screen stays awake, and "simmer 10 minutes" becomes a timer
- **Import any recipe link** (schema.org), or save a video link (YouTube, Facebook, TikTok)
- Edit, duplicate, delete-with-undo, favourites, notes, print, share, backup and restore
- **Ask AI**: say what you feel like making, get a few dishes with real photos, pick one and it writes the full recipe into your library
- **Shopping list**: "Add to shopping list" under every recipe; amounts merge across recipes (2 cloves + 4 cloves = 6, 1 cup + 2 tbsp = 1⅛ cups), sorted by aisle, tick things off as you shop
- **A door at the front**: on the first visit Platter asks for its creator's name. The right name (any capitalisation)
  opens it for good; a wrong one gives 30 minutes with a timer in the corner, then Platter closes behind a lock
  screen until the name is given (`static/js/gate.js`). It is stored in the visitor's browser, like everything else
- **White, Warm and Dark**: a crisp white theme (the default in daylight), the original warm paper tones, and dark; Auto
  follows your device. Switch with the sun/moon button, in Settings, or press `t`
- **Settings**, in one clear page (the gear): appearance, units, diet, prices, your data, help
- **Search everything** (Ctrl K, or the bar at the top of the sidebar): recipes by name or ingredient, tags, cookbooks
  and actions such as "dark mode" or "snap my fridge"
- **Translate any recipe** into Arabic (right to left), Spanish, French, Urdu, Turkish and 15 more, with "Save as a copy"
- **Scale to what I have**: "I have 1 kg of chicken" and the whole recipe scales to match
- **Prices where you are**: every recipe shows what it costs in your currency, per ingredient, per serving and in
  total (it follows the servings you pick); so do list rows (and "Cheapest first"), the shopping list total, the meal
  plan's week and a "Cheap eats" row on Discover. Where you are is guessed from your device's time zone (no location
  permission, no IP lookup); change it, add your city or share your precise location in the settings menu. Each recipe
  carries the US cost of each ingredient line (`scripts/costs.py`); `prices.py` has the AI price a basket of 29
  everyday groceries where you are, compares it with US prices kind by kind (meat, dairy, produce…), checks it against
  today's exchange rate, and keeps it for a week. All prices are estimates, and say so
- **Your diet**: pick what you eat and avoid (vegetarian, vegan, pescatarian; no milk/dairy, no eggs, no gluten, no nuts,
  no shellfish, no pork, no alcohol) and your goals (low fat, low carb, under 500 kcal, high protein). Lists, Discover, the
  meal planner and "What can I make?" show only what fits; each recipe says whether it fits and, if not, which
  ingredients are the problem, with "Remix it to fit". Every AI request follows it too. Checked against the ingredient
  list itself (`static/js/diet.js`), with per-rule exceptions: coconut milk isn't dairy, almond milk is still a nut
- **Snap your fridge**: take a photo of your fridge or cupboard and AI spots the food in it; the ingredients go straight
  into "What can I make?" (and Ask AI can suggest dishes from them)
- **Remix with AI**: "make it vegetarian / vegan / healthier / quicker / spicier / kid-friendly / air fryer…" or type your
  own change; the rewritten recipe is saved as a new one, with what changed in its notes
- **Read a recipe in from a photo or pasted text**: snap a cookbook page, a card or a screenshot (or paste any recipe
  text) and AI fills in the form, copying the author's amounts and method faithfully
- **Cookbooks**: your own named lists ("Date night", "Holiday baking"); a recipe can be in as many as you like
- **Your kitchen**: meals cooked, your streak, a cooking calendar of the last 18 weeks, your most-cooked dishes and cuisines
- **Share links for your own recipes**: the whole recipe travels (compressed) inside the link, so anyone who opens it
  can save a copy; no account, and the recipe never touches the server
- **Clearer recipe pages**: a jump bar (Ingredients, Directions, Nutrition, Notes) that stays at the top, and a labelled
  More menu for remix, translate, scale, print and copy
- **Recipe helper**: stuck on a step? Select any words in a recipe and tap "Ask AI about this", tap **Explain** on a step, or open the helper and ask. The recipe (at your servings, in your units) goes along as context, and the answer streams in
- **Cook step by step**: one step at a time, full screen and big type, with the ingredients that step uses, its timers, read-aloud,
  **voice control** (say "next", "back", "repeat", "timer"; Chrome and Edge), swipe or arrow keys, and "I made this" at the end
- **Every recipe described**: a short description, difficulty, calories and a protein/carbs/fat estimate per serving, a serving suggestion, a tip and diet labels (vegetarian, vegan, gluten-free, dairy-free, spicy). Filter any tag by diet, Easy or Under 30 minutes
- **Discover**: the front page, with a recipe of the day, today's plan, quick dinners, what's new, cuisines, diets and "cook it again"; the picks change once a day
- **You might also like** under every recipe, matched on shared ingredients, tag and cuisine
- **Dark mode**: Auto, Light or Dark in the settings menu (the people icon), or press `t`
- **What can I make?**: type what is in your kitchen and every recipe is ranked by how much of it you already have, with "Add missing" straight to the shopping list
- **Meal plan**: put recipes on the days you will cook them, adjust servings, tick them off as cooked, see calories per day, let
  **Plan it for me** fill the empty days with a varied mix (by diet, time and your favorites), then add the whole week to the shopping list in one tap
- **Ratings and a cooked log**: five stars and "I made this" on every recipe; sort by top rated or most cooked, and open the Top rated, Cooked before and Under 30 minutes collections
- **US ⇄ metric** in one tap: cups, ounces and pounds become ml and g (and back), and oven temperatures in the directions convert too
- **Search across tags**: the search box searches the tag you are in and offers "N more in All recipes"
- **Works offline**: once loaded, the app and the library are kept on the device (a service worker), so it opens with no signal, and photos you have seen are remembered. It installs to the home screen
- **Ingredient swaps**: out of buttermilk, or it isn't in your diet? The swap button on an ingredient lists what to
  use instead and how much (milk + lemon, a flax egg, tamari…). Every swap is checked against your diet, the ones that
  fit come first, lines that break your diet show the button without a hover, and a tap keeps the swap in the recipe's notes
- **Kitchen converter** (`u`): cups, spoons, ml, grams, ounces and pounds, crossing volume and weight by ingredient (a cup
  of flour is 125 g, a cup of sugar 200 g), and oven temperatures in °C, °F, fan and gas marks
- **Use-by dates** in What can I make?: tap a food to say when it needs using; recipes that use it up come first, a
  "Use soon" bar can ask AI for ideas, and Discover shows "Use it up before it goes off"
- **The week at a glance** on the meal plan: calories and protein a day, the protein / carbs / fat split, meat-free
  nights and what's cooked so far, with a tip for balancing the week
- **Move a meal** to another day, and **add the week to your calendar** (an .ics file for any calendar app)
- **Share a whole cookbook** as one link: sample recipes travel as ids, your own ones inside the link; whoever opens it
  can save the cookbook
- **Timers any time** (`w`): presets, a name, +1 minute, a progress bar, the countdown in the tab title, and they
  survive a reload
- **Discover** also has "Picked for you" (from your favourites, ratings and what you cook) and "In season now" (by month
  and hemisphere)
- **Safe by default**: a strict Content-Security-Policy with a per-response nonce, no framing, HSTS, and camera,
  microphone and location allowed only for Platter itself; assets go out brotli-compressed
- 1,103 sample recipes with photos, so it is full from the first open. **Chicken** is the biggest meat tag: 177 dishes from a dozen cuisines

Everything a person changes is stored in their own browser (`localStorage`). The server ships the page,
the sample library, `POST /api/import` (read a recipe from a link), and the Ask AI endpoints.

## Run it

```bash
pip install -r requirements.txt
python app.py            # http://127.0.0.1:5075
```

Deploys as-is on Render: build `pip install -r requirements.txt`, start
`gunicorn --workers 1 --worker-class gthread --threads 8 --timeout 60 app:app`.

### Ask AI needs one environment variable

Everything except Ask AI works with no configuration. To switch Ask AI on, set on the server:

| variable | what | default |
|---|---|---|
| `OPENAI_API_KEY` | your OpenAI key | (AI off, and the pane says so) |
| `OPENAI_MODEL` | any chat model | `gpt-5` |
| `OPENAI_REASONING_EFFORT` | `minimal`, `low`, `medium`… (gpt-5 / o-series only) | `minimal` |
| `AI_DAILY_LIMIT` | AI calls per day for the whole site | `400` |

Locally, put them in a `.env` file (it is gitignored). Requests are also limited to 40 per person per hour.
Typical timing on `gpt-5` with minimal reasoning: dish ideas about 4 s, a full recipe about 6 s.

The pictures cost nothing and need no key: real photographs, looked up in order from the dish's Wikipedia
article, a Wikimedia Commons search, Openverse, then TheMealDB. Each is checked against the dish's name so a
"honey garlic salmon" never gets an air fryer, and the source is credited on the photo.

## Tests

```bash
python -m unittest discover tests     # the server: pages, assets, brotli, security headers, import guard, AI input checks, prices, library
node --test tests/logic.test.js       # the recipe logic: scaling, units, shopping list, diet rules, prices, tags, swaps, the converter
```

Neither spends anything: the AI endpoints are tested with no key, and the browser scripts run in a small stand-in
for a browser.

## The sample library

`static/data/library.json` is built from [TheMealDB](https://www.themealdb.com) by
`scripts/build_library.py` (`python scripts/build_library.py`, or `--raw dump.json` to reuse a download).
It sorts each dish into a tag, composes the ingredient lines, and estimates time and servings from what
the method says. Photos load straight from TheMealDB's CDN. Which photo fronts each tag is set in
`scripts/covers.json`. A dish that TheMealDB files under Chicken always lands in the Chicken tag, even
a chicken noodle soup.

**312 of the recipes are not from TheMealDB.** `scripts/add_chicken.py` adds 106 well-known chicken, turkey
and duck dishes TheMealDB lacks (Butter Chicken, Hainanese Chicken Rice…), and `scripts/add_recipes.py` adds
206 more across every other tag (Bulgogi, Cacio e Pepe, Pad Krapow, Crème Brûlée, Eggs Benedict…). Each is
written by the same recipe prompt Ask AI uses and shows "AI recipe" as its source. Its photo is a real one
from Wikipedia or Wikimedia Commons, credited on the picture, and no two recipes share a photo. Every photo was
checked by eye on a contact sheet; where the search picked the wrong one, `PHOTO_OVERRIDES` in the script
names the right file. The results are committed in `scripts/extras/*.json`, so building the library needs
no key and no network.

**Descriptions, levels, nutrition and diet labels** come from `scripts/enrich.py` (six recipes per AI call,
kept in `scripts/details.json`). The AI proposes diet labels and the ingredient list has the last word: a dish
with fish sauce is never "vegetarian", one with butter is never "dairy-free". Nutrition is an estimate and says
so on the page. `build_library.py` keeps the small fields (level, diet, calories) in `library.json` and puts the
longer text in `details.json`, which the app loads after the first screen is drawn.

**The White and Dark themes** are `static/white.css` and `static/dark.css`, generated from `style.css` (which is the Warm
theme) by `scripts/build_dark_css.py`: run it after changing colours in `style.css`.

## Layout

```
app.py                 Flask: page (with its CSP nonce), security headers, cached brotli/gzip assets, /api/import (SSRF-guarded)
prices.py              /api/prices: a grocery basket priced where you are, as a factor per kind of food
ai.py                  /api/ai/ideas, /api/ai/recipe, /api/ai/remix, /api/ai/extract, /api/ai/fridge, /api/ai/translate, /api/ai/ask (OpenAI) and /api/ai/photo (free photo sources)
templates/index.html   the three panes
static/style.css       every size measured from the reference, in rem
static/js/util.js      icons, quantity parser and scaler
static/js/store.js     library + personal state + hash router
static/js/ui.js        popovers, dialogs, toasts, photo viewer
static/js/cook.js      wake lock and timers (the corner pills, the new-timer sheet)
static/js/shop.js      the shopping list: merging, aisles, its pane
static/js/plan.js      the meal plan: days, servings, the week at a glance, moving meals, calendar export
static/js/pantry.js    "What can I make?": ranks recipes by what is in the kitchen, and use-by dates
static/js/ai.js        the Ask AI pane
static/js/gate.js      the "name the creator" door and its 30-minute timer
static/js/aitools.js   Remix, reading a recipe in from a photo or text, and the fridge photo
static/js/settings.js  the Settings page
static/js/palette.js   search everything (Ctrl K)
static/js/prices.js    prices where you are: the guess, the settings sheet, costs in your money
static/js/diet.js      your diet: the rules, checking a recipe against them, the settings sheet
static/js/kitchen.js   ingredient swaps and the kitchen converter (no AI, works offline)
static/js/books.js     cookbooks, and the Your kitchen page
static/js/share.js     share links that carry a recipe or a whole cookbook, and the pages they open
static/js/help.js      the recipe helper: select-to-ask, Explain, the streaming chat panel
static/js/steps.js     cook step by step
static/js/discover.js  the Discover front page
static/dark.css        the dark theme (generated)
static/white.css       the white theme (generated)
static/sw.js           the service worker: the app and library offline, remembered photos
scripts/add_chicken.py writes scripts/extras/chicken.json (the extra chicken, turkey and duck dishes)
scripts/add_recipes.py writes scripts/extras/more.json (206 dishes across the other tags)
scripts/costs.py       writes scripts/costs.json (what each ingredient line costs in US dollars)
scripts/build_timezones.py writes static/data/tz.json (time zone to country, from IANA)
scripts/enrich.py      writes scripts/details.json (descriptions, levels, nutrition, diet labels)
scripts/build_dark_css.py  writes static/dark.css and static/white.css from static/style.css
static/js/views.js     tiles, list, recipe, editor
static/js/main.js      start-up and keyboard shortcuts
```

Keys: `/` search · `j`/`k` next/previous · `g` cook step by step · `h` recipe helper · `e` edit · `f` favourite · `c` Cook Mode · `n` new · `d` Discover · `a` Ask AI · `s` shopping list · `y` your kitchen · `p` what can I make · `m` meal plan · `r` random recipe · `w` new timer · `u` kitchen converter · `t` light/dark · `[` sidebar · `?` all shortcuts.
