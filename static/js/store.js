/* Platter — data: the sample library, everything the person changes, and the hash router.

   The server only ships the sample library. Everything a person does — favourites, ticked
   ingredients, edits, recipes they add, tag names and covers — is layered on top of it in
   localStorage, so a seed recipe can be edited or deleted without the seed file ever changing. */
(() => {
  const P = window.P;
  const KEY = "platter.v1";

  /* ---------- tiny event bus ---------- */
  const subs = {};
  P.on = (evt, fn) => (subs[evt] ||= []).push(fn);
  P.emit = (evt, payload) => (subs[evt] || []).forEach((fn) => fn(payload));

  /* ---------- persisted state ---------- */
  const blank = () => ({
    fav: {}, user: {}, edits: {}, gone: {}, checks: {}, scale: {}, notes: {}, steps: {}, photos: {},
    rate: {}, made: {}, plan: {}, pantry: { have: [], staples: true }, books: [], diet: { keys: [], on: true }, prices: { on: true, cc: "", name: "", city: "", cal: null },
    tags: { order: [], names: {}, covers: {}, hidden: {}, custom: [] },
    shop: { recipes: [], extra: [], done: {}, hidden: {}, basics: true },
    recent: [],
    ui: { sidebar: true, sort: "az", last: null, units: "orig", theme: "white", speak: false },
  });
  const merge = (base, extra) => {
    for (const k of Object.keys(extra || {})) {
      const v = extra[k];
      if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) merge(base[k], v);
      else base[k] = v;
    }
    return base;
  };
  let S = (() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return merge(blank(), JSON.parse(raw));
    } catch { /* private mode or corrupt: start fresh, in memory */ }
    return blank();
  })();
  Object.defineProperty(P, "S", { get: () => S });
  // White is the default now. Before, a new visitor got "auto", which turned dark on a dark-mode device: move anyone
  // still on that untouched default over to White, once. (Picking Auto again in Settings keeps it.)
  const upgrade = (s) => { if (s.ui.themeV !== 2) { if (!s.ui.theme || s.ui.theme === "auto") s.ui.theme = "white"; s.ui.themeV = 2; } return s; };
  upgrade(S);

  let timer = 0;
  const flush = () => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch { P.toast?.("Your browser's storage is full — remove a photo or two."); }
  };
  P.save = () => { clearTimeout(timer); timer = setTimeout(flush, 150); };
  /** Save right away and say whether the browser took it (a photo can be the one that fills its storage). */
  P.saveNow = () => { clearTimeout(timer); try { localStorage.setItem(KEY, JSON.stringify(S)); return true; } catch { return false; } };
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => document.hidden && flush());

  /* ---------- the library: seed + edits + the person's own ---------- */
  P.lib = { seedTags: [], seed: [], seedById: {}, ready: false };
  P.loadLibrary = async () => {
    const res = await fetch(`/static/data/library.json?v=${window.PLATTER.v}`);
    if (!res.ok) throw new Error(`library ${res.status}`);
    const data = await res.json();
    P.lib.seedTags = data.tags;
    P.lib.seed = data.recipes;
    for (const r of data.recipes) P.lib.seedById[r.id] = r;
    P.lib.ready = true;
    dirty = true;
  };

  /** Descriptions, tips, serving ideas and nutrition: fetched after the first screen, then merged into the seed recipes. */
  P.loadDetails = async () => {
    try {
      const res = await fetch(`/static/data/details.json?v=${window.PLATTER.v}`);
      if (!res.ok) return;
      const all = await res.json();
      for (const [id, d] of Object.entries(all)) { const r = P.lib.seedById[id]; if (r) Object.assign(r, d); }
      P.lib.details = true;
      dirty = true;
      P.emit("details");
    } catch { /* offline on a first visit: the recipes work without their descriptions */ }
  };

  let dirty = true;
  let cache = { list: [], byId: new Map(), counts: {} };
  const rebuild = () => {
    const list = [];
    for (const r of P.lib.seed) {
      if (S.gone[r.id]) continue;
      const e = S.edits[r.id];
      list.push(e ? { ...r, ...e, id: r.id, edited: true } : r);
    }
    for (const r of Object.values(S.user)) list.push({ ...r, user: true });
    const byId = new Map(), counts = {};
    for (const r of list) {
      byId.set(r.id, r);
      counts[r.tag] = (counts[r.tag] || 0) + 1;
    }
    cache = { list, byId, counts };
    dirty = false;
  };
  const ensure = () => dirty && rebuild();
  const touch = () => { dirty = true; vocab = null; P.save(); P.emit("data"); };

  P.recipes = () => (ensure(), cache.list);
  P.recipe = (id) => (ensure(), cache.byId.get(id));
  P.count = (tagId) => (ensure(), cache.counts[tagId] || 0);

  /* ---------- tags ---------- */
  P.tags = ({ hidden = false } = {}) => {
    const base = P.lib.seedTags.map((t) => ({ id: t.id, name: t.name, cover: t.cover }));
    const custom = S.tags.custom.map((t) => ({ id: t.id, name: t.name, custom: true }));
    let all = [...base, ...custom].map((t, i) => ({ ...t, name: S.tags.names[t.id] || t.name, _i: i }));
    const order = S.tags.order;
    if (order.length) {
      // a saved order only knows the tags that existed when it was saved. A tag the app has added since
      // (Chicken, say) goes right after the tag that precedes it in the app's own order, not at the very end.
      const out = all.filter((t) => order.includes(t.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      for (const t of all) {
        if (order.includes(t.id)) continue;
        let at = out.length;
        if (!t.custom) {
          at = 0;
          for (let i = t._i - 1; i >= 0; i--) {
            const j = out.findIndex((x) => x._i === i);
            if (j >= 0) { at = j + 1; break; }
          }
        }
        out.splice(at, 0, t);
      }
      all = out;
    }
    return hidden ? all : all.filter((t) => !S.tags.hidden[t.id]);
  };
  const SPECIAL = { all: "All recipes", fav: "Favorites", recent: "Recently viewed", top: "Top rated", made: "Cooked before", quick: "Under 30 minutes" };
  const book = (id) => (typeof id === "string" && id.startsWith("bk") ? S.books.find((b) => b.id === id) : null);
  P.isBook = (id) => !!book(id);
  // a cookbook behaves like a collection: it lists recipes, but it is nobody's "tag"
  P.isSpecial = (id) => id in SPECIAL || P.isBook(id);
  P.validTag = (id) => !!id && (id in SPECIAL || P.isBook(id) || P.tags({ hidden: true }).some((t) => t.id === id));
  P.tagName = (id) => SPECIAL[id] || book(id)?.name || P.tags({ hidden: true }).find((t) => t.id === id)?.name || "Recipes";
  P.coverOf = (t) => {
    const c = S.tags.covers[t.id];
    if (c && c.startsWith("data:")) return c;
    const r = P.recipe(c || t.cover);
    if (r?.img) return P.photo(r.img, "medium");
    const first = P.recipes().find((x) => x.tag === t.id && x.img);
    return first ? P.photo(first.img, "medium") : "";
  };
  P.inTag = (id) => {
    const all = P.recipes();
    if (id === "all") return all;
    if (id === "fav") return all.filter((r) => S.fav[r.id]);
    if (id === "recent") return S.recent.map((i) => P.recipe(i)).filter(Boolean);
    if (id === "top") return all.filter((r) => S.rate[r.id] >= 4);
    if (id === "made") return Object.keys(S.made).sort((a, b) => P.lastMade(b) - P.lastMade(a)).map((i) => P.recipe(i)).filter(Boolean);
    if (id === "quick") return all.filter((r) => r.min && r.min <= 30);
    if (P.isBook(id)) return book(id).ids.map((i) => P.recipe(i)).filter(Boolean);
    return all.filter((r) => r.tag === id);
  };
  P.keepsOrder = (id) => id === "recent" || id === "made";      // collections that are already in a meaningful order

  /* ---------- cookbooks: named lists, and a recipe can be in as many as you like ---------- */
  const booksChanged = () => { P.save(); P.emit("books"); };
  P.books = () => S.books;
  P.booksOf = (recipeId) => S.books.filter((b) => b.ids.includes(recipeId));
  P.addBook = (name, recipeId) => {
    const id = "bk" + Date.now().toString(36);
    S.books.push({ id, name: name.trim().slice(0, 40) || "My cookbook", ids: recipeId ? [recipeId] : [], created: Date.now() });
    booksChanged();
    return id;
  };
  P.renameBook = (id, name) => { const b = book(id); if (b && name.trim()) { b.name = name.trim().slice(0, 40); booksChanged(); } };
  P.deleteBook = (id) => {
    const i = S.books.findIndex((b) => b.id === id);
    if (i < 0) return () => {};
    const [gone] = S.books.splice(i, 1);
    booksChanged();
    return () => { S.books.splice(i, 0, gone); booksChanged(); };
  };
  /** Put a recipe in a cookbook, or take it out. Returns whether it is in it now. */
  P.toggleInBook = (bookId, recipeId) => {
    const b = book(bookId);
    if (!b) return false;
    const i = b.ids.indexOf(recipeId);
    if (i >= 0) b.ids.splice(i, 1); else b.ids.push(recipeId);
    booksChanged();
    return i < 0;
  };

  P.renameTag = (id, name) => { S.tags.names[id] = name.trim() || P.tagName(id); touch(); };
  P.setCover = (id, v) => { S.tags.covers[id] = v; touch(); };
  P.hideTag = (id) => { S.tags.hidden[id] = 1; touch(); return () => { delete S.tags.hidden[id]; touch(); }; };
  P.showTag = (id) => { delete S.tags.hidden[id]; touch(); };
  P.addTag = (name) => {
    const id = "c" + Date.now().toString(36);
    S.tags.custom.push({ id, name: name.trim() || "New tag" });
    touch();
    return id;
  };
  P.moveTag = (id, dir) => {
    const ids = P.tags({ hidden: true }).map((t) => t.id);
    const i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    S.tags.order = ids;
    touch();
  };
  P.removeCustomTag = (id) => {
    S.tags.custom = S.tags.custom.filter((t) => t.id !== id);
    for (const r of Object.values(S.user)) if (r.tag === id) r.tag = "mains";
    for (const r of Object.values(S.edits)) if (r.tag === id) r.tag = "mains";
    delete S.tags.names[id]; delete S.tags.covers[id]; delete S.tags.hidden[id];
    S.tags.order = S.tags.order.filter((x) => x !== id);
    touch();
  };

  /* ---------- browsing: search and sort ---------- */
  const HAY = new WeakMap();
  const hay = (r) => {
    let h = HAY.get(r);
    if (!h) { h = `${r.title} ${r.sub || ""} ${r.dom || ""} ${r.ing.join(" ")}`.toLowerCase(); HAY.set(r, h); }
    return h;
  };
  /* ---------- typos: "chiken" finds chicken ----------
     Every word in the library (titles, cuisines, ingredients) with how often it appears. A search word that matches
     nothing is swapped for the closest real word: one slip allowed in short words, two in long ones. */
  let vocab = null;
  const words = () => {
    if (!vocab) {
      vocab = new Map();
      for (const r of P.recipes()) for (const w of hay(r).match(/[a-z\u00e0-\u024f]{3,}/g) || []) vocab.set(w, (vocab.get(w) || 0) + 1);
    }
    return vocab;
  };
  /** Edit distance (with swapped neighbours counting as one), giving up once it passes `max`. */
  function distance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur.push(v);
        best = Math.min(best, v);
      }
      if (best > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[b.length];
  }
  /** A search, with any word that matches nothing replaced by the closest real one: { q, fixes: [[typed, meant]] } */
  P.fixQuery = (q) => {
    const toks = (q || "").toLowerCase().split(/\s+/).filter(Boolean);
    const vocabulary = words(), fixes = [];
    const out = toks.map((t) => {
      if (t.length < 4 || /[^a-z\u00e0-\u024f]/.test(t)) return t;
      for (const w of vocabulary.keys()) if (w.includes(t)) return t;          // it already matches something
      const max = t.length >= 7 ? 2 : 1;
      let best = null;
      for (const [w, n] of vocabulary) {
        if (Math.abs(w.length - t.length) > max) continue;
        const d = distance(t, w, max);
        if (d <= max && (!best || d < best.d || (d === best.d && n > best.n))) best = { w, d, n };
      }
      if (!best) return t;
      fixes.push([t, best.w]);
      return best.w;
    });
    return { q: out.join(" "), fixes };
  };

  P.search = (list, q) => {
    const toks = (q || "").toLowerCase().split(/\s+/).filter(Boolean);
    return toks.length ? list.filter((r) => { const h = hay(r); return toks.every((t) => h.includes(t)); }) : list;
  };
  const coll = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  const az = (a, b) => coll.compare(a.title, b.title);
  P.sort = (list, mode) => {
    const out = [...list];
    if (mode === "za") return out.sort((a, b) => az(b, a));
    if (mode === "quick") return out.sort((a, b) => (a.min || 9999) - (b.min || 9999) || az(a, b));
    if (mode === "fav") return out.sort((a, b) => (!!S.fav[b.id] - !!S.fav[a.id]) || az(a, b));
    if (mode === "rating") return out.sort((a, b) => (S.rate[b.id] || 0) - (S.rate[a.id] || 0) || az(a, b));
    if (mode === "cheap") {
      const cost = (r) => P.prices.perServing(r) ?? 1e9;          // recipes without a cost go last
      return out.sort((a, b) => cost(a) - cost(b) || az(a, b));
    }
    if (mode === "cooked") return out.sort((a, b) => (S.made[b.id]?.length || 0) - (S.made[a.id]?.length || 0) || az(a, b));
    if (mode === "new") {
      const age = (r) => (r.user ? 1e15 + (r.created || 0) : +r.id || 0);
      return out.sort((a, b) => age(b) - age(a));
    }
    return out.sort(az);
  };

  /* ---------- per-recipe state ---------- */
  P.isFav = (id) => !!S.fav[id];
  P.toggleFav = (id) => {
    if (S.fav[id]) delete S.fav[id]; else S.fav[id] = 1;
    P.save(); P.emit("fav", id);
    return !!S.fav[id];
  };
  P.scaleOf = (r) => S.scale[r.id] || r.serves || 4;
  P.setScale = (id, n) => {
    const r = P.recipe(id);
    n = Math.max(1, Math.min(99, Math.round(n)));
    if (n === (r.serves || 4)) delete S.scale[id]; else S.scale[id] = n;
    P.save(); P.emit("scale", id);
  };
  P.checked = (id) => new Set(S.checks[id] || []);
  P.toggleCheck = (id, i) => {
    const set = P.checked(id);
    if (set.has(i)) set.delete(i); else set.add(i);
    if (set.size) S.checks[id] = [...set]; else delete S.checks[id];
    P.save();
    return set.has(i);
  };
  P.clearChecks = (id) => { delete S.checks[id]; P.save(); };
  P.stepsDone = (id) => new Set(S.steps[id] || []);
  P.toggleStep = (id, i) => {
    const set = P.stepsDone(id);
    if (set.has(i)) set.delete(i); else set.add(i);
    if (set.size) S.steps[id] = [...set]; else delete S.steps[id];
    P.save();
    return set.has(i);
  };
  P.clearSteps = (id) => { delete S.steps[id]; P.save(); };
  P.notesOf = (id) => S.notes[id] || "";
  P.setNotes = (id, text) => { if (text.trim()) S.notes[id] = text; else delete S.notes[id]; P.save(); };
  P.touchRecent = (id) => { S.recent = [id, ...S.recent.filter((x) => x !== id)].slice(0, 40); P.save(); };

  /* ---------- your rating, and how often you have cooked it ---------- */
  P.rating = (id) => S.rate[id] || 0;
  P.setRating = (id, n) => {
    if (!n || S.rate[id] === n) delete S.rate[id]; else S.rate[id] = n;         // tapping the same star again clears it
    P.save(); P.emit("rate", id);
    return S.rate[id] || 0;
  };
  P.madeTimes = (id) => S.made[id] || [];
  P.lastMade = (id) => Math.max(0, ...(S.made[id] || []));
  P.markMade = (id, when = Date.now()) => {
    (S.made[id] ||= []).push(when);
    P.save(); P.emit("made", id);
    return () => P.unmarkMade(id, when);                                          // undo
  };
  P.unmarkMade = (id, when) => {
    const log = S.made[id];
    if (!log) return;
    const i = log.lastIndexOf(when);
    if (i >= 0) log.splice(i, 1);
    if (!log.length) delete S.made[id];
    P.save(); P.emit("made", id);
  };

  /* ---------- light or dark ---------- */
  const mqDark = matchMedia("(prefers-color-scheme: dark)");
  const COLORS = { white: "#ffffff", warm: "#fafaf8", dark: "#121317" };
  P.theme = () => (S.ui.theme === "light" ? "white" : S.ui.theme || "white");         // "light" was the old name
  /** The theme actually showing: auto becomes white or dark, whichever the device prefers. */
  P.resolvedTheme = () => (P.theme() === "auto" ? (mqDark.matches ? "dark" : "white") : P.theme());
  P.applyTheme = () => {
    const t = P.resolvedTheme();
    document.documentElement.dataset.theme = t;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COLORS[t] || COLORS.white);
    P.emit("theme", t);
  };
  P.setTheme = (t) => { S.ui.theme = t; if (t === "white" || t === "warm") S.ui.lightTheme = t; P.save(); P.applyTheme(); };
  mqDark.addEventListener("change", () => P.applyTheme());
  P.applyTheme();

  /* ---------- units: as written, US, or metric ---------- */
  P.unitMode = () => S.ui.units || "orig";
  P.setUnitMode = (mode) => { S.ui.units = mode; P.save(); P.emit("units", mode); };

  /* ---------- writing recipes ---------- */
  const newId = () => "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  P.saveRecipe = (rec) => {
    const id = rec.id || newId();
    const clean = {
      id,
      title: (rec.title || "").trim() || "Untitled recipe",
      tag: rec.tag || "mains",
      sub: (rec.sub || "").trim(),
      img: rec.img || "",
      src: (rec.src || "").trim(),
      dom: rec.dom || P.domainOf(rec.src) || "My recipe",
      min: rec.min || null,
      serves: rec.serves || 4,
      video: (rec.video || "").trim(),
      cr: rec.cr || "",                       // who to thank for a photo that is not ours
      crl: rec.crl || "",
      ing: rec.ing || [],
      steps: rec.steps || [],
    };
    // catalogue details: kept only when there is something, so an edit made before details.json arrived
    // doesn't blank out the sample recipe's description
    // a cost list only means something while it lines up with the ingredients
    if (Array.isArray(rec.cost) && rec.cost.length !== clean.ing.length) rec = { ...rec, cost: null };
    for (const k of ["about", "level", "serve", "tip", "diet", "nut", "kcal", "cost"]) {
      const v = rec[k];
      if (v && (!Array.isArray(v) || v.length)) clean[k] = typeof v === "string" ? v.trim() : v;
    }
    // a new base yield makes an old "scale to 12" override meaningless
    if (P.recipe(id) && P.recipe(id).serves !== clean.serves) delete S.scale[id];
    if (P.lib.seedById[id]) S.edits[id] = clean;
    else S.user[id] = { ...clean, created: S.user[id]?.created || Date.now() };
    delete S.gone[id];
    touch();
    return id;
  };
  P.deleteRecipe = (id) => {
    const snap = { user: S.user[id], edit: S.edits[id], gone: S.gone[id], fav: S.fav[id], photos: S.photos[id], recent: [...S.recent] };
    if (S.user[id]) delete S.user[id]; else S.gone[id] = 1;
    delete S.edits[id]; delete S.fav[id]; delete S.photos[id];            // your photos of it take real room: they go too
    S.recent = S.recent.filter((x) => x !== id);
    touch();
    return () => {                                    // undo
      if (snap.user) S.user[id] = snap.user;
      if (snap.gone === undefined) delete S.gone[id]; else S.gone[id] = snap.gone;
      if (snap.edit) S.edits[id] = snap.edit;
      if (snap.fav) S.fav[id] = snap.fav;
      if (snap.photos) S.photos[id] = snap.photos;
      S.recent = snap.recent;
      touch();
    };
  };
  P.resetRecipe = (id) => { delete S.edits[id]; touch(); };
  P.duplicateRecipe = (id) => {
    const r = P.recipe(id);
    return P.saveRecipe({ ...r, id: null, title: `${r.title} (copy)` });
  };

  /* ---------- backup ---------- */
  P.exportData = () => JSON.stringify({ app: "platter", v: 1, exported: new Date().toISOString(), data: S }, null, 1);
  P.importData = (text) => {
    const o = JSON.parse(text);
    if (o.app !== "platter" || !o.data) throw new Error("That file isn't a Platter backup.");
    S = upgrade(merge(blank(), o.data));
    flush();
    dirty = true;
    P.emit("data");
  };

  /* ---------- router: #/  ·  #/t/<tag>  ·  #/t/<tag>/r/<id>[/edit]  ·  #/new[/<tag>]  ·  #/ai  #/shop  #/plan  #/pantry ---------- */
  P.PANES = ["discover", "ai", "shop", "plan", "pantry", "stats", "shared", "sharedbook", "settings"];        // whole-pane tools that borrow the list column for context
  P.route = { tag: "chicken", id: null, mode: "view", home: true };
  P.parseRoute = () => {
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent).filter(Boolean);
    const r = { tag: null, id: null, mode: "view", home: false };
    if (!parts.length) { r.home = true; return r; }
    if (parts[0] === "new") { r.mode = "new"; r.tag = parts[1] || null; return r; }
    if (P.PANES.includes(parts[0])) { r.mode = parts[0]; r.data = parts.slice(1).join("/"); return r; }
    if (parts[0] === "t") {
      r.tag = parts[1] || null;
      if (parts[2] === "r") { r.id = parts[3] || null; if (parts[4] === "edit") r.mode = "edit"; }
    } else r.home = true;
    return r;
  };
  P.pathFor = ({ tag, id, mode, data }) => {
    if (mode === "new") return tag ? `new/${tag}` : "new";
    if (mode === "shared" || mode === "sharedbook") return `${mode}/${data || ""}`;
    if (P.PANES.includes(mode)) return mode;
    if (!tag) return "";
    return `t/${tag}${id ? `/r/${encodeURIComponent(id)}${mode === "edit" ? "/edit" : ""}` : ""}`;
  };
  // a route handler may redirect (home → the last recipe); if two redirects ever chased each other this would be a
  // stack overflow, so nested route changes are cut off after a few levels
  let routeDepth = 0;
  const emitRoute = () => {
    if (routeDepth > 6) return;
    routeDepth++;
    try { P.emit("route"); } finally { routeDepth--; }
  };
  P.go = (path, opts = {}) => {
    const hash = "#/" + path;
    if (opts.replace) { history.replaceState(null, "", hash === "#/" ? location.pathname : hash); emitRoute(); }
    else if (location.hash === hash || (hash === "#/" && !location.hash)) emitRoute();
    else location.hash = hash;
  };
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  const wide = matchMedia("(min-width: 721px)");
  addEventListener("hashchange", () => {
    if (!document.startViewTransition || !wide.matches || calm.matches || document.hidden) return emitRoute();
    // the animation is a nicety: whatever happens to it (skipped because the tab is hidden, or cut short by the next
    // navigation), the page itself is redrawn exactly once
    let drawn = false;
    const draw = () => { if (!drawn) { drawn = true; emitRoute(); } };
    const vt = document.startViewTransition(draw);
    vt.updateCallbackDone.catch(() => {}).finally(draw);
    vt.ready.catch(() => {});
    vt.finished.catch(() => {});
  });

  /* ---------- viewport ---------- */
  const mqNarrow = matchMedia("(max-width: 720px)"), mqMedium = matchMedia("(max-width: 1020px)");
  P.isNarrow = () => mqNarrow.matches;
  P.isMedium = () => mqMedium.matches && !mqNarrow.matches;
  mqNarrow.addEventListener("change", () => P.emit("layout"));
  mqMedium.addEventListener("change", () => P.emit("layout"));
})();
