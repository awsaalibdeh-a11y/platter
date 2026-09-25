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
- **Recipe helper**: stuck on a step? Select any words in a recipe and tap "Ask AI about this", tap **Explain** on a step, or open the helper and ask. The recipe (at your servings, in your units) goes along as context, and the answer streams in
- **Cook step by step**: one step at a time, full screen and big type, with the ingredients that step uses, its timers, read-aloud, swipe or arrow keys, and "I made this" at the end
- **Every recipe described**: a short description, difficulty, calories and a protein/carbs/fat estimate per serving, a serving suggestion, a tip and diet labels (vegetarian, vegan, gluten-free, dairy-free, spicy). Filter any tag by diet, Easy or Under 30 minutes
- **Discover**: the front page, with a recipe of the day, today's plan, quick dinners, what's new, cuisines, diets and "cook it again"; the picks change once a day
- **You might also like** under every recipe, matched on shared ingredients, tag and cuisine
- **Dark mode**: Auto, Light or Dark in the settings menu (the people icon), or press `t`
- **What can I make?**: type what is in your kitchen and every recipe is ranked by how much of it you already have, with "Add missing" straight to the shopping list
- **Meal plan**: put recipes on the days you will cook them, adjust servings, tick them off as cooked, then add the whole week to the shopping list in one tap
- **Ratings and a cooked log**: five stars and "I made this" on every recipe; sort by top rated or most cooked, and open the Top rated, Cooked before and Under 30 minutes collections
- **US ⇄ metric** in one tap: cups, ounces and pounds become ml and g (and back), and oven temperatures in the directions convert too
- **Search across tags**: the search box searches the tag you are in and offers "N more in All recipes"
- **Works offline**: once loaded, the app and the library are kept on the device (a service worker), so it opens with no signal, and photos you have seen are remembered. It installs to the home screen
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

**Dark mode** is `static/dark.css`, generated from `style.css` by `scripts/build_dark_css.py`: run it after
changing colours in `style.css`.

## Layout

```
app.py                 Flask: page, cached/gzipped assets, /api/import (SSRF-guarded)
ai.py                  /api/ai/ideas, /api/ai/recipe (OpenAI) and /api/ai/photo (free photo sources)
templates/index.html   the three panes
static/style.css       every size measured from the reference, in rem
static/js/util.js      icons, quantity parser and scaler
static/js/store.js     library + personal state + hash router
static/js/ui.js        popovers, dialogs, toasts, photo viewer
static/js/cook.js      wake lock and timers
static/js/shop.js      the shopping list: merging, aisles, its pane
static/js/plan.js      the meal plan: days, servings, "add the week to the shopping list"
static/js/pantry.js    "What can I make?": ranks recipes by what is in the kitchen
static/js/ai.js        the Ask AI pane
static/js/help.js      the recipe helper: select-to-ask, Explain, the streaming chat panel
static/js/steps.js     cook step by step
static/js/discover.js  the Discover front page
static/dark.css        the dark theme (generated)
static/sw.js           the service worker: the app and library offline, remembered photos
scripts/add_chicken.py writes scripts/extras/chicken.json (the extra chicken, turkey and duck dishes)
scripts/add_recipes.py writes scripts/extras/more.json (206 dishes across the other tags)
scripts/enrich.py      writes scripts/details.json (descriptions, levels, nutrition, diet labels)
scripts/build_dark_css.py  writes static/dark.css from static/style.css
static/js/views.js     tiles, list, recipe, editor
static/js/main.js      start-up and keyboard shortcuts
```

Keys: `/` search · `j`/`k` next/previous · `g` cook step by step · `h` recipe helper · `e` edit · `f` favourite · `c` Cook Mode · `n` new · `d` Discover · `a` Ask AI · `s` shopping list · `p` what can I make · `m` meal plan · `r` random recipe · `t` light/dark · `[` sidebar · `?` all shortcuts.
