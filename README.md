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
- 790 sample recipes with photos, so it is full from the first open

Everything a person changes is stored in their own browser (`localStorage`). The server ships the page,
the sample library, and one endpoint: `POST /api/import`.

## Run it

```bash
pip install -r requirements.txt
python app.py            # http://127.0.0.1:5075
```

Deploys as-is on Render: build `pip install -r requirements.txt`, start
`gunicorn --workers 1 --worker-class gthread --threads 8 --timeout 60 app:app`. No environment variables.

## The sample library

`static/data/library.json` is built from [TheMealDB](https://www.themealdb.com) by
`scripts/build_library.py` (`python scripts/build_library.py`, or `--raw dump.json` to reuse a download).
It sorts each dish into a tag, composes the ingredient lines, and estimates time and servings from what
the method says. Photos load straight from TheMealDB's CDN. Which photo fronts each tag is set in
`scripts/covers.json`.

## Layout

```
app.py                 Flask: page, cached/gzipped assets, /api/import (SSRF-guarded)
templates/index.html   the three panes
static/style.css       every size measured from the reference, in rem
static/js/util.js      icons, quantity parser and scaler
static/js/store.js     library + personal state + hash router
static/js/ui.js        popovers, dialogs, toasts, photo viewer
static/js/cook.js      wake lock and timers
static/js/views.js     tiles, list, recipe, editor
static/js/main.js      start-up and keyboard shortcuts
```

Keys: `/` search · `j`/`k` next/previous · `e` edit · `f` favourite · `c` Cook Mode · `n` new · `[` sidebar.
