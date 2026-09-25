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
- 790 sample recipes with photos, so it is full from the first open

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
`scripts/covers.json`.

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
static/js/ai.js        the Ask AI pane
static/js/views.js     tiles, list, recipe, editor
static/js/main.js      start-up and keyboard shortcuts
```

Keys: `/` search · `j`/`k` next/previous · `e` edit · `f` favourite · `c` Cook Mode · `n` new · `a` Ask AI · `s` shopping list · `[` sidebar.
