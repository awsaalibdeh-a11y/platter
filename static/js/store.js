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
    fav: {}, user: {}, edits: {}, gone: {}, checks: {}, scale: {}, notes: {}, steps: {},
    tags: { order: [], names: {}, covers: {}, hidden: {}, custom: [] },
    shop: { recipes: [], extra: [], done: {}, hidden: {} },
    recent: [],
    ui: { sidebar: true, sort: "az", last: null },
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

  let timer = 0;
  const flush = () => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch { P.toast?.("Your browser's storage is full — remove a photo or two."); }
  };
  P.save = () => { clearTimeout(timer); timer = setTimeout(flush, 150); };
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
  const touch = () => { dirty = true; P.save(); P.emit("data"); };

  P.recipes = () => (ensure(), cache.list);
  P.recipe = (id) => (ensure(), cache.byId.get(id));
  P.count = (tagId) => (ensure(), cache.counts[tagId] || 0);

  /* ---------- tags ---------- */
  P.tags = ({ hidden = false } = {}) => {
    const base = P.lib.seedTags.map((t) => ({ id: t.id, name: t.name, cover: t.cover }));
    const custom = S.tags.custom.map((t) => ({ id: t.id, name: t.name, custom: true }));
    const all = [...base, ...custom].map((t, i) => ({ ...t, name: S.tags.names[t.id] || t.name, _i: i }));
    const pos = (t) => { const p = S.tags.order.indexOf(t.id); return p >= 0 ? p : 1000 + t._i; };
    all.sort((a, b) => pos(a) - pos(b));
    return hidden ? all : all.filter((t) => !S.tags.hidden[t.id]);
  };
  const SPECIAL = { all: "All recipes", fav: "Favorites", recent: "Recently viewed" };
  P.isSpecial = (id) => id in SPECIAL;
  P.validTag = (id) => !!id && (id in SPECIAL || P.tags({ hidden: true }).some((t) => t.id === id));
  P.tagName = (id) => SPECIAL[id] || P.tags({ hidden: true }).find((t) => t.id === id)?.name || "Recipes";
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
    return all.filter((r) => r.tag === id);
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
    // a new base yield makes an old "scale to 12" override meaningless
    if (P.recipe(id) && P.recipe(id).serves !== clean.serves) delete S.scale[id];
    if (P.lib.seedById[id]) S.edits[id] = clean;
    else S.user[id] = { ...clean, created: S.user[id]?.created || Date.now() };
    delete S.gone[id];
    touch();
    return id;
  };
  P.deleteRecipe = (id) => {
    const snap = { user: S.user[id], edit: S.edits[id], gone: S.gone[id], fav: S.fav[id], recent: [...S.recent] };
    if (S.user[id]) delete S.user[id]; else S.gone[id] = 1;
    delete S.edits[id]; delete S.fav[id];
    S.recent = S.recent.filter((x) => x !== id);
    touch();
    return () => {                                    // undo
      if (snap.user) S.user[id] = snap.user;
      if (snap.gone === undefined) delete S.gone[id]; else S.gone[id] = snap.gone;
      if (snap.edit) S.edits[id] = snap.edit;
      if (snap.fav) S.fav[id] = snap.fav;
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
    S = merge(blank(), o.data);
    flush();
    dirty = true;
    P.emit("data");
  };

  /* ---------- router: #/  ·  #/t/<tag>  ·  #/t/<tag>/r/<id>[/edit]  ·  #/new[/<tag>] ---------- */
  P.route = { tag: "poultry", id: null, mode: "view", home: true };
  P.parseRoute = () => {
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent).filter(Boolean);
    const r = { tag: null, id: null, mode: "view", home: false };
    if (!parts.length) { r.home = true; return r; }
    if (parts[0] === "new") { r.mode = "new"; r.tag = parts[1] || null; return r; }
    if (parts[0] === "ai" || parts[0] === "shop") { r.mode = parts[0]; return r; }
    if (parts[0] === "t") {
      r.tag = parts[1] || null;
      if (parts[2] === "r") { r.id = parts[3] || null; if (parts[4] === "edit") r.mode = "edit"; }
    } else r.home = true;
    return r;
  };
  P.pathFor = ({ tag, id, mode }) => {
    if (mode === "new") return tag ? `new/${tag}` : "new";
    if (mode === "ai" || mode === "shop") return mode;
    if (!tag) return "";
    return `t/${tag}${id ? `/r/${encodeURIComponent(id)}${mode === "edit" ? "/edit" : ""}` : ""}`;
  };
  P.go = (path, opts = {}) => {
    const hash = "#/" + path;
    if (opts.replace) { history.replaceState(null, "", hash === "#/" ? location.pathname : hash); P.emit("route"); }
    else if (location.hash === hash || (hash === "#/" && !location.hash)) P.emit("route");
    else location.hash = hash;
  };
  addEventListener("hashchange", () => P.emit("route"));

  /* ---------- viewport ---------- */
  const mqNarrow = matchMedia("(max-width: 720px)"), mqMedium = matchMedia("(max-width: 1020px)");
  P.isNarrow = () => mqNarrow.matches;
  P.isMedium = () => mqMedium.matches && !mqNarrow.matches;
  mqNarrow.addEventListener("change", () => P.emit("layout"));
  mqMedium.addEventListener("change", () => P.emit("layout"));
})();
