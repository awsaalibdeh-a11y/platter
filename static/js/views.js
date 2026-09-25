/* Platter — the three panes: tag tiles, the recipe list, and the recipe (or its editor). */
(() => {
  const P = window.P;
  const { h, $, icon } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: icon(name) });
  const DEFAULT = { tag: "chicken", id: "52772" };          // the first thing a new visitor sees

  const els = {};
  const state = {
    q: "", carryQ: "", filters: { sub: "", fav: false, video: false },
    editingTiles: false, drawer: false, cook: false, muteData: false,
    shown: [], rendered: {},
  };
  const noFilters = () => ({ sub: "", fav: false, video: false });
  const realTag = () => (P.route.tag && !P.isSpecial(P.route.tag) ? P.route.tag : null);

  P.views = { init, start, fail };

  /* ================= boot ================= */
  function init() {
    for (const id of ["app", "side", "tiles", "list", "rows", "detail", "layer"]) els[id] = document.getElementById(id);
    Object.assign(els, {
      title: $("#list-title"), count: $("#list-count"), sortBtn: $("#sort-btn"), search: $("#search"),
      clear: $("#search-clear"), filterRow: $("#filter-row"), top: $("#detail-top"), scroll: $("#detail-scroll"),
      backTags: $("#back-tags"), backList: $("#back-list"), sideScrim: $("#side-scrim"),
    });

    els.search.addEventListener("input", P.debounce(() => { state.q = els.search.value; els.clear.hidden = !state.q; renderList(); }, 70));
    els.search.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && els.search.value) { e.stopPropagation(); clearSearch(); }
      if (e.key === "ArrowDown") { e.preventDefault(); selectNeighbor(1); }
      if (e.key === "Enter") { const first = state.shown[0]; if (first && !P.route.id) openRecipe(first.id); }
    });
    els.clear.addEventListener("click", () => { clearSearch(); els.search.focus(); });
    els.sortBtn.addEventListener("click", () => sortMenu(els.sortBtn));
    $("#btn-add").addEventListener("click", newRecipe);
    $("#btn-ai").addEventListener("click", () => openAI());
    $("#btn-tags").addEventListener("click", toggleTileEditing);
    $("#btn-folder").addEventListener("click", (e) => collectionsMenu(e.currentTarget));
    $("#btn-people").addEventListener("click", (e) => shareMenu(e.currentTarget));
    $("#btn-sidebar").addEventListener("click", toggleSidebar);
    $("#btn-sidebar-show").addEventListener("click", toggleSidebar);
    els.sideScrim.addEventListener("click", () => { state.drawer = false; syncSide(); });
    els.backTags.addEventListener("click", () => P.go(""));
    els.backList.addEventListener("click", () => (P.route.mode === "view" ? P.go(P.pathFor({ tag: P.route.tag })) : closePane()));

    P.on("route", onRoute);
    P.on("data", onData);
    P.on("layout", onLayout);
    P.on("fav", onFav);
    P.on("shop", onShop);
    P.on("rate", onCook);
    P.on("made", onCook);
    P.on("plan", () => P.route.mode === "plan" && renderDetail());
    P.on("units", () => P.route.mode === "view" && P.route.id && renderDetail());
    P.on("scale", (id) => id === P.route.id && refreshScale());
    // a photo that fails to load falls back to the soft placeholder instead of a broken icon
    document.addEventListener("error", (e) => {
      const img = e.target;
      if (img.tagName === "IMG" && img.closest(".tile, .row-thumb, .hero, .cover-opt, .idea-photo")) img.classList.add("broken");
    }, true);
    syncSide();
  }

  function start() { renderTiles(); updateShopBadge(); onRoute(); }

  function fail() {
    els.tiles.replaceChildren(h("div", { class: "load-fail" },
      h("p", {}, "The recipe library didn't load."),
      h("button", { class: "btn lime", type: "button", onClick: () => location.reload() }, "Try again")));
  }

  /* ================= tiles ================= */
  function renderTiles() {
    const frag = document.createDocumentFragment();
    for (const t of P.tags()) frag.append(tileEl(t));
    if (state.editingTiles) frag.append(addTileEl());
    els.tiles.replaceChildren(frag);
    els.tiles.classList.toggle("editing", state.editingTiles);
    $("#btn-tags").classList.toggle("on", state.editingTiles);
    $("#btn-tags").setAttribute("aria-pressed", String(state.editingTiles));
    syncTiles();
  }

  const tileEl = (t) => {
    const src = P.coverOf(t);
    return h("button", {
      class: "tile", type: "button", "data-tag": t.id,
      "aria-label": `${t.name}, ${P.plural(P.count(t.id), "recipe")}`,
      onClick: () => onTile(t),
    },
    src ? h("img", { src, alt: "", loading: "lazy", decoding: "async", draggable: "false" }) : null,
    h("span", { class: "tile-label" }, t.name),
    h("span", { class: "tile-x", role: "button", "aria-label": `Hide ${t.name}`, html: icon("minus"), onClick: (e) => { e.stopPropagation(); hideTag(t); } }));
  };

  const addTileEl = () =>
    h("button", { class: "tile add", type: "button", onClick: () => tagSheet(null) }, hi("plus"), h("span", {}, "New tag"));

  function syncTiles() {
    for (const t of els.tiles.querySelectorAll(".tile[data-tag]")) {
      const on = t.dataset.tag === P.route.tag && !P.route.home || (P.route.home && !P.isNarrow() && t.dataset.tag === P.route.tag);
      t.classList.toggle("on", on);
      if (on) t.setAttribute("aria-current", "true"); else t.removeAttribute("aria-current");
    }
  }

  function onTile(t) {
    if (state.editingTiles) return tagSheet(t);
    if (P.isMedium()) { state.drawer = false; syncSide(); }
    P.go(P.pathFor({ tag: t.id }));
  }

  function toggleTileEditing() {
    state.editingTiles = !state.editingTiles;
    renderTiles();
    if (state.editingTiles) P.toast("Tap a tag to rename it or change its photo. Tap – to hide it.");
  }

  function hideTag(t) {
    const undo = P.hideTag(t.id);
    if (P.route.tag === t.id) P.go(P.pathFor({ tag: "all" }));
    P.toast(`Hid “${t.name}”. Its recipes are still in All recipes.`, { action: { label: "Undo", fn: undo } });
  }

  /** Rename a tag, choose its cover, move it — or make a new one. */
  function tagSheet(t) {
    P.sheet((close) => {
      const isNew = !t;
      let cover = null;
      const name = h("input", { class: "input", id: "tag-name", maxlength: "28", placeholder: "e.g. Weeknight dinners", "data-autofocus": "" });
      name.value = t?.name || "";
      const grid = h("div", { class: "cover-grid" });
      const mark = () => { for (const b of grid.children) b.classList.toggle("on", b.dataset.v === cover); };
      const addOpt = (v, src, label) => {
        const b = h("button", { class: "cover-opt", type: "button", "data-v": v, "aria-label": label, onClick: () => { cover = v; mark(); } }, h("img", { src, alt: "" }));
        grid.append(b);
        return b;
      };
      if (t) for (const r of P.inTag(t.id).filter((x) => x.img).slice(0, 23)) addOpt(r.id, P.photo(r.img, "small"), r.title);
      const file = h("input", { type: "file", accept: "image/*", hidden: true });
      file.addEventListener("change", async () => {
        if (!file.files[0]) return;
        try { const data = await P.resizeImage(file.files[0], 600); const b = addOpt(data, data, "Your photo"); grid.prepend(b); cover = data; mark(); }
        catch (e) { P.toast(e.message); }
      });
      const save = () => {
        const label = name.value.trim();
        if (!label) { name.classList.add("bad"); name.focus(); return; }
        if (isNew) { P.addTag(label); }
        else { P.renameTag(t.id, label); if (cover) P.setCover(t.id, cover); }
        close();
      };
      name.addEventListener("keydown", (e) => e.key === "Enter" && save());
      const remove = async () => {
        if (t.custom) {
          const ok = await P.confirm({ title: `Delete “${t.name}”?`, body: "Its recipes move to Everyday Mains.", ok: "Delete tag", danger: true });
          if (ok) { close(); P.removeCustomTag(t.id); }
        } else { close(); hideTag(t); }
      };
      return [
        h("h3", { class: "sheet-h" }, isNew ? "New tag" : "Edit tag"),
        h("label", { class: "label", for: "tag-name" }, "Name"), name,
        !isNew ? [
          h("div", { class: "label" }, "Cover photo"), grid,
          h("div", { class: "row-btns" },
            h("button", { class: "btn ghost sm", type: "button", onClick: () => file.click() }, hi("upload"), "Upload your own"),
            h("button", { class: "btn ghost sm", type: "button", onClick: () => P.moveTag(t.id, -1) }, hi("chevron"), "Move earlier"),
            h("button", { class: "btn ghost sm", type: "button", onClick: () => P.moveTag(t.id, 1) }, "Move later", hi("chevronRight"))),
          file,
        ] : null,
        h("div", { class: "sheet-btns spread" },
          !isNew ? h("button", { class: "btn danger-ghost", type: "button", onClick: remove }, t.custom ? "Delete tag" : "Hide tag") : h("span"),
          h("span", { class: "grp" },
            h("button", { class: "btn ghost", type: "button", onClick: close }, "Cancel"),
            h("button", { class: "btn lime", type: "button", onClick: save }, isNew ? "Create" : "Save"))),
      ];
    }, { label: t ? "Edit tag" : "New tag" });
  }

  /* ================= menus ================= */
  function collectionsMenu(anchor) {
    P.popover(anchor, (close) => {
      const go = (tag) => () => { close(); if (P.isMedium()) { state.drawer = false; syncSide(); } P.go(P.pathFor({ tag })); };
      const favCount = Object.keys(P.S.fav).filter((id) => P.recipe(id)).length;
      const hidden = P.tags({ hidden: true }).filter((t) => P.S.tags.hidden[t.id]);
      const nav = (fn) => () => { close(); if (P.isMedium()) { state.drawer = false; syncSide(); } fn(); };
      const coll = (label, icon, id) => P.menuItem({ label, icon, count: P.inTag(id).length, on: P.route.tag === id && P.route.mode === "view", onClick: go(id) });
      return [
        P.menuItem({ label: "Ask AI what to cook", icon: "sparkle", on: P.route.mode === "ai", onClick: nav(() => openAI()) }),
        P.menuItem({ label: "What can I make?", sub: "Rank recipes by what's in your kitchen", icon: "jar", on: P.route.mode === "pantry", onClick: nav(openPantry) }),
        P.menuItem({ label: "Meal plan", sub: "Plan the week, shop for it in one tap", icon: "calendar", count: P.plan.upcoming() || undefined, on: P.route.mode === "plan", onClick: nav(openPlan) }),
        P.menuItem({ label: "Shopping list", icon: "cart", count: P.shop.count() || undefined, on: P.route.mode === "shop", onClick: nav(openShop) }),
        h("div", { class: "pop-sep" }),
        h("div", { class: "pop-h" }, "Collections"),
        P.menuItem({ label: "All recipes", icon: "book", count: P.recipes().length, on: P.route.tag === "all", onClick: go("all") }),
        P.menuItem({ label: "Favorites", icon: "star", count: favCount, on: P.route.tag === "fav", onClick: go("fav") }),
        P.menuItem({ label: "Recently viewed", icon: "clockArrow", count: P.S.recent.filter((i) => P.recipe(i)).length, on: P.route.tag === "recent", onClick: go("recent") }),
        coll("Top rated", "star", "top"),
        coll("Cooked before", "chefHat", "made"),
        coll("Under 30 minutes", "clock", "quick"),
        h("div", { class: "pop-sep" }),
        P.menuItem({ label: "Surprise me", sub: "Open a random recipe", icon: "shuffle", onClick: nav(surprise) }),
        hidden.length ? [
          h("div", { class: "pop-sep" }), h("div", { class: "pop-h" }, "Hidden tags"),
          ...hidden.map((t) => P.menuItem({ label: `Show ${t.name}`, icon: "plus", onClick: () => { P.showTag(t.id); close(); } })),
        ] : null,
      ];
    }, { align: "left" });
  }

  function shareMenu(anchor) {
    P.popover(anchor, (close) => [
      h("div", { class: "pop-h" }, "Share & backup"),
      P.menuItem({ label: "Download a backup", sub: "Your recipes, edits and favorites in one file", icon: "download", onClick: () => { close(); backup(); } }),
      P.menuItem({ label: "Restore from a backup", sub: "Bring your library to another device", icon: "upload", onClick: () => { close(); restore(); } }),
      P.menuItem({ label: "Copy the link to Platter", icon: "link", onClick: async () => { close(); await P.copyText(location.origin); P.toast("Link copied."); } }),
      h("div", { class: "pop-sep" }),
      h("p", { class: "pop-note" }, "Everything you change is saved in this browser. The sample recipes come from ",
        h("a", { href: "https://www.themealdb.com", target: "_blank", rel: "noopener noreferrer" }, "TheMealDB"), "."),
    ], { class: "wide", align: "left" });
  }

  const backup = () => P.download(`platter-backup-${new Date().toISOString().slice(0, 10)}.json`, P.exportData());
  function restore() {
    const input = h("input", { type: "file", accept: "application/json,.json" });
    input.addEventListener("change", async () => {
      try { P.importData(await input.files[0].text()); P.toast("Library restored."); }
      catch (e) { P.toast(e instanceof SyntaxError ? "Couldn't read that file." : e.message); }
    });
    input.click();
  }

  function sortMenu(anchor) {
    const sorts = [["az", "Title A–Z"], ["za", "Title Z–A"], ["new", "Newest first"], ["quick", "Quickest first"], ["fav", "Favorites first"], ["rating", "Top rated first"], ["cooked", "Most cooked first"]];
    const subs = [...new Set(P.inTag(P.route.tag).map((r) => r.sub).filter(Boolean))].sort();
    P.popover(anchor, (close) => [
      h("div", { class: "pop-h" }, "Sort by"),
      ...sorts.map(([k, l]) => P.menuItem({ label: l, on: P.S.ui.sort === k, onClick: () => { P.S.ui.sort = k; P.save(); renderList(); close(); } })),
      h("div", { class: "pop-sep" }),
      h("div", { class: "pop-h" }, "Show only"),
      P.menuItem({ label: "Favorites", icon: "star", on: state.filters.fav, onClick: () => { state.filters.fav = !state.filters.fav; renderList(); close(); } }),
      P.menuItem({ label: "With a video", icon: "play", on: state.filters.video, onClick: () => { state.filters.video = !state.filters.video; renderList(); close(); } }),
      subs.length ? [
        h("div", { class: "pop-sep" }), h("div", { class: "pop-h" }, "Subtag"),
        P.menuItem({ label: "All", on: !state.filters.sub, onClick: () => { state.filters.sub = ""; renderList(); close(); } }),
        ...subs.map((s) => P.menuItem({ label: s, on: state.filters.sub === s, onClick: () => { state.filters.sub = s; renderList(); close(); } })),
      ] : null,
    ], { class: "scroll" });
  }

  /* ================= the list ================= */
  const isFiltered = () => !!(state.q || state.filters.sub || state.filters.fav || state.filters.video);

  function currentList() {
    const tag = P.route.tag, f = state.filters;
    let list = P.inTag(tag);
    if (f.sub) list = list.filter((r) => r.sub === f.sub);
    if (f.fav && tag !== "fav") list = list.filter((r) => P.isFav(r.id));
    if (f.video) list = list.filter((r) => r.video);
    list = P.search(list, state.q);
    return P.keepsOrder(tag) ? list : P.sort(list, P.S.ui.sort);
  }

  function renderList() {
    const list = currentList();
    state.shown = list;
    els.title.textContent = P.tagName(P.route.tag);
    els.count.textContent = P.plural(list.length, "recipe");
    els.sortBtn.classList.toggle("desc", P.S.ui.sort === "za");
    els.sortBtn.classList.toggle("filtered", !!(state.filters.sub || state.filters.fav || state.filters.video));
    renderFilterRow();
    const frag = document.createDocumentFragment();
    if (!list.length) frag.append(emptyList());
    else for (const r of list) frag.append(rowEl(r));
    els.rows.replaceChildren(frag);
    syncRows(true);
  }

  function renderFilterRow() {
    const f = state.filters, chips = [];
    const chip = (label, fn) => h("button", { class: "fchip", type: "button", "aria-label": `Remove filter ${label}`, onClick: () => { fn(); renderList(); } }, label, hi("x"));
    if (f.sub) chips.push(chip(f.sub, () => (f.sub = "")));
    if (f.fav) chips.push(chip("Favorites", () => (f.fav = false)));
    if (f.video) chips.push(chip("With video", () => (f.video = false)));
    if (state.q && P.route.tag !== "all") {
      // the search box is scoped to the tag you are in; say so when the rest of the library has more
      const have = new Set(state.shown.map((r) => r.id));
      const more = P.search(P.recipes(), state.q).filter((r) => !have.has(r.id)).length;
      if (more) chips.push(h("button", { class: "fchip more", type: "button", title: "Search every tag", onClick: searchAll }, hi("search"), `${more} more in All recipes`));
    }
    els.filterRow.replaceChildren(...chips);
    els.filterRow.hidden = !chips.length;
  }

  function searchAll() {
    state.carryQ = state.q;                                   // the tag changes, and a tag change would clear the box
    P.go(P.pathFor({ tag: "all" }));
  }

  const thumbEl = (r, size) =>
    r.img ? h("img", { src: P.photo(r.img, size), alt: "", loading: "lazy", decoding: "async", draggable: "false" }) : null;

  function rowEl(r) {
    const on = r.id === P.route.id;
    return h("button", {
      class: "row" + (on ? " on" : "") + (P.isFav(r.id) ? " fav" : ""), type: "button", role: "option",
      "aria-selected": String(on), "data-id": r.id, onClick: () => openRecipe(r.id),
    },
    h("span", { class: "row-thumb" }, thumbEl(r, "small"), r.video ? h("span", { class: "row-play", html: icon("play") }) : null),
    h("span", { class: "row-body" },
      h("span", { class: "row-title" }, r.title),
      h("span", { class: "row-dom" }, h("span", { class: "row-dom-text" }, r.dom || ""), h("span", { class: "row-fav", html: icon("star") }))));
  }

  function emptyList() {
    const tag = P.route.tag;
    if (isFiltered()) {
      return h("div", { class: "empty" }, h("p", {}, state.q ? `Nothing matches “${state.q}”.` : "Nothing matches those filters."),
        state.q ? h("button", { class: "btn lime sm", type: "button", onClick: () => openAI(state.q) }, hi("sparkle"), "Ask AI to make it") : null,
        h("button", { class: "btn ghost sm", type: "button", onClick: () => { clearSearch(); state.filters = noFilters(); renderList(); } }, "Clear search and filters"));
    }
    const msg = {
      fav: "Tap the star on a recipe to keep it here.", recent: "Recipes you open show up here.",
      top: "Give a recipe four or five stars and it lands here.", made: "Tap “I made this” on a recipe to keep track of what you've cooked.",
      quick: "No recipe here takes 30 minutes or less.",
    }[tag];
    return h("div", { class: "empty" }, h("p", {}, msg || "No recipes in this tag yet."),
      msg ? null : h("button", { class: "btn lime sm", type: "button", onClick: newRecipe }, hi("plus"), "Add a recipe"));
  }

  function clearSearch() {
    state.q = "";
    els.search.value = "";
    els.clear.hidden = true;
    renderList();
  }

  function syncRows(scroll) {
    const id = P.route.id;
    for (const b of els.rows.querySelectorAll(".row")) {
      const on = b.dataset.id === id;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
      if (on && scroll) b.scrollIntoView({ block: "nearest" });
    }
  }

  const openRecipe = (id) => P.go(P.pathFor({ tag: P.route.tag, id }));

  function selectNeighbor(delta) {
    const list = state.shown;
    if (!list.length) return;
    const i = list.findIndex((r) => r.id === P.route.id);
    const next = list[Math.max(0, Math.min(list.length - 1, (i < 0 ? (delta > 0 ? 0 : list.length - 1) : i + delta)))];
    if (next && next.id !== P.route.id) {
      P.go(P.pathFor({ tag: P.route.tag, id: next.id }), { replace: true });
      els.rows.querySelector(".row.on")?.focus({ preventScroll: true });     // keep the keyboard on the selection
    }
  }

  function onFav(id) {
    const on = P.isFav(id);
    for (const b of els.scroll.querySelectorAll(".starbtn")) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
    els.rows.querySelector(`.row[data-id="${CSS.escape(id)}"]`)?.classList.toggle("fav", on);
    if (P.route.tag === "fav" || P.S.ui.sort === "fav" || state.filters.fav) renderList();
  }

  /* ================= the recipe ================= */
  function renderDetail() {
    const { mode, id } = P.route;
    const same = state.rendered.id === id && state.rendered.mode === mode;
    const keep = same ? els.scroll.scrollTop : 0;
    els.detail.classList.toggle("editing", mode !== "view");
    if (mode === "new") renderEditor(null);
    else if (P.PANES.includes(mode)) {
      els.detail.classList.remove("cook");
      P.panes[mode](els.top, els.scroll, { close: closePane });
    } else {
      const r = id && P.recipe(id);
      if (!r) renderBlank();
      else if (mode === "edit") renderEditor(r);
      else renderRecipe(r);
    }
    els.scroll.scrollTop = keep;
  }

  function renderBlank() {
    els.detail.classList.remove("cook");
    els.top.replaceChildren();
    els.scroll.replaceChildren(h("div", { class: "blank" }, hi("plate"), h("p", {}, P.count(P.route.tag) || P.isSpecial(P.route.tag) ? "Pick a recipe from the list." : "Nothing here yet — add your first recipe with the + button.")));
  }

  const actBtn = (name, label, fn) => h("button", { class: "abtn", type: "button", title: label, "aria-label": label, html: icon(name), onClick: fn });

  function renderRecipe(r) {
    const servings = P.scaleOf(r);
    els.detail.classList.toggle("cook", state.cook);
    els.top.replaceChildren(
      h("button", { class: "tagpill", type: "button", title: `Show ${P.tagName(r.tag)}`, onClick: () => P.go(P.pathFor({ tag: r.tag, id: r.id })) }, P.tagName(r.tag)),
      h("div", { class: "acts" },
        actBtn("calendar", "Add to meal plan", (e) => P.plan.menu(e.currentTarget, r)),
        actBtn("printer", "Print", () => window.print()),
        actBtn("share", "Share", () => shareRecipe(r)),
        actBtn("copy", "Copy recipe", () => copyRecipe(r)),
        h("button", { class: "editbtn", type: "button", onClick: editCurrent }, hi("pencil"), "Edit")));
    els.scroll.replaceChildren(heroEl(r), r.img ? expandEl(r) : null, bodyEl(r, servings));
  }

  function heroEl(r) {
    const fav = P.isFav(r.id);
    return h("div", { class: "hero" + (r.img ? "" : " empty") },
      r.img ? h("img", { src: P.photo(r.img), alt: r.title, decoding: "async", fetchpriority: "high", onClick: () => P.lightbox(P.photo(r.img), r.title) }) : h("span", { class: "hero-ph", html: icon("plate") }),
      r.cr ? h(r.crl ? "a" : "span", { class: "credit", title: r.cr, ...(r.crl ? { href: r.crl, target: "_blank", rel: "noopener noreferrer" } : {}) }, `Photo: ${r.cr}`) : null,
      h("button", { class: "starbtn" + (fav ? " on" : ""), type: "button", "aria-pressed": String(fav), "aria-label": "Favorite", title: "Favorite", html: icon("star"), onClick: () => P.toggleFav(r.id) }));
  }

  const expandEl = (r) =>
    h("div", { class: "expand" }, h("button", { class: "ibtn sm", type: "button", "aria-label": "View photo full screen", title: "View photo", html: icon("expand"), onClick: () => P.lightbox(P.photo(r.img), r.title) }));

  function bodyEl(r, servings) {
    const f = servings / (r.serves || 4);
    const anyTicked = P.checked(r.id).size > 0;
    return h("div", { class: "recipe" },
      h("h1", { class: "title" }, r.title),
      chipsEl(r, servings),
      cookRowEl(r),
      h("div", { class: "cols" },
        h("section", { class: "col-ing" + (anyTicked ? " has-checks" : "") },
          h("div", { class: "sec-head" }, h("h2", { class: "section-h" }, "Ingredients"),
            h("button", { class: "linkbtn", type: "button", onClick: () => { P.clearChecks(r.id); renderDetail(); } }, "Uncheck all")),
          h("div", { class: "ing-tools" }, scalerEl(r, servings), unitsEl()), ingredientsEl(r, f), shopBarEl(r, f)),
        h("section", { class: "col-steps" },
          h("div", { class: "sec-head" }, h("h2", { class: "section-h" }, "Directions"),
            h("button", { class: "linkbtn", type: "button", onClick: () => { P.clearSteps(r.id); renderDetail(); } }, "Start over")),
          stepsEl(r),
          r.tip ? h("div", { class: "tip" }, h("span", { class: "tip-h" }, hi("chefHat"), "Tip"), h("p", {}, r.tip)) : null,
          notesEl(r))));
  }

  /** Your star rating, and how often you have cooked it. */
  function cookRowEl(r) {
    const cur = P.rating(r.id), times = P.madeTimes(r.id);
    const stars = h("div", { class: "rating", role: "radiogroup", "aria-label": "Your rating" },
      [1, 2, 3, 4, 5].map((n) => h("button", {
        class: "rstar" + (n <= cur ? " on" : ""), type: "button", role: "radio", "aria-checked": String(n === cur),
        "aria-label": `${n} ${n === 1 ? "star" : "stars"}`, title: n === cur ? "Clear your rating" : `${n} of 5`, html: icon("star"), onClick: () => P.setRating(r.id, n),
      })));
    const made = h("button", {
      class: "madebtn", type: "button", title: "Log that you cooked this",
      onClick: () => { const undo = P.markMade(r.id); P.toast(`Logged. That's ${P.plural(P.madeTimes(r.id).length, "time")} you've made it.`, { action: { label: "Undo", fn: undo } }); },
    }, hi("check"), "I made this");
    return h("div", { class: "cookrow", "data-role": "cookrow" }, stars, made,
      times.length ? h("span", { class: "made-note" }, `Made ${times.length === 1 ? "once" : `${times.length}×`} · last ${P.ago(P.lastMade(r.id))}`) : null);
  }

  /** A rating or a cooked-it changed: redo just that row, and the list when it is sorted or filtered by it. */
  function onCook(id) {
    const r = P.route.mode === "view" && P.recipe(P.route.id);
    if (r && id === r.id) els.scroll.querySelector('[data-role="cookrow"]')?.replaceWith(cookRowEl(r));
    if (["rating", "cooked"].includes(P.S.ui.sort) || ["top", "made"].includes(P.route.tag)) renderList();
  }

  function unitsEl() {
    const mode = P.unitMode();
    return h("div", { class: "seg", role: "group", "aria-label": "Units" },
      [["orig", "As written"], ["us", "US"], ["metric", "Metric"]].map(([k, label]) =>
        h("button", { type: "button", class: mode === k ? "on" : "", "aria-pressed": String(mode === k), onClick: () => P.setUnitMode(k) }, label)));
  }

  function chipsEl(r, servings) {
    const source = r.dom ? (r.src ? h("a", { class: "chip", href: r.src, target: "_blank", rel: "noopener noreferrer", title: "Open the original" }, hi("doc"), r.dom) : h("span", { class: "chip" }, hi("doc"), r.dom)) : null;
    const sw = h("button", { class: "switch", type: "button", role: "switch", "aria-checked": String(state.cook), "aria-label": "Cook Mode", onClick: () => toggleCook() });
    return [
      h("div", { class: "chips" },
        r.min ? h("span", { class: "chip" }, hi("clock"), P.fmtMin(r.min)) : null,
        h("span", { class: "chip", "data-role": "serves" }, hi("people"), `Serves ${servings}`),
        source,
        h("span", { class: "switch-wrap" }, h("span", { class: "switch-label" }, "Cook Mode"), sw)),
      h("div", { class: "chips" },
        h("button", { class: "chip" + (r.sub ? "" : " empty"), type: "button", "aria-haspopup": "menu", "aria-expanded": "false", onClick: (e) => subtagMenu(e.currentTarget, r) }, hi("tree"), r.sub || "Subtag"),
        r.video ? h("a", { class: "chip", href: r.video, target: "_blank", rel: "noopener noreferrer" }, hi("play"), "Watch video") : null),
    ];
  }

  function subtagMenu(anchor, r) {
    const existing = [...new Set(P.recipes().filter((x) => x.tag === r.tag && x.sub).map((x) => x.sub))].sort();
    P.popover(anchor, (close) => {
      const apply = (val) => { close(); state.muteData = false; P.saveRecipe({ ...r, sub: val.trim() }); };
      const input = h("input", { class: "input sm", placeholder: "New subtag…", maxlength: "24", "data-autofocus": "" });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter" && input.value.trim()) apply(input.value); });
      return [
        h("div", { class: "pop-h" }, `Subtag in ${P.tagName(r.tag)}`),
        h("div", { class: "pop-input" }, input, h("button", { class: "btn lime sm", type: "button", onClick: () => input.value.trim() && apply(input.value) }, "Set")),
        r.sub ? P.menuItem({ label: "Remove subtag", icon: "x", onClick: () => apply("") }) : null,
        ...existing.map((s) => P.menuItem({ label: s, on: s === r.sub, onClick: () => apply(s) })),
      ];
    }, { align: "left", class: "scroll" });
  }

  function scalerEl(r, servings) {
    const base = r.serves || 4;
    return h("div", { class: "scaler", "data-role": "scaler" },
      h("button", { type: "button", "aria-label": "Fewer servings", html: icon("minus"), disabled: servings <= 1, onClick: () => P.setScale(r.id, servings - 1) }),
      h("button", { type: "button", class: "lbl", title: servings === base ? "" : `Back to ${base}`, onClick: () => servings !== base && P.setScale(r.id, base) }, hi("people"), `Serves ${servings}`),
      h("button", { type: "button", "aria-label": "More servings", html: icon("plus"), disabled: servings >= 99, onClick: () => P.setScale(r.id, servings + 1) }));
  }

  /** Servings changed: redo only the pieces that depend on it, so the page does not jump. */
  function refreshScale() {
    const r = P.recipe(P.route.id);
    if (!r || P.route.mode !== "view") return;
    const servings = P.scaleOf(r), f = servings / (r.serves || 4);
    const focusLabel = document.activeElement?.closest?.(".scaler") ? [...els.scroll.querySelectorAll(".scaler button")].indexOf(document.activeElement) : -1;
    els.scroll.querySelector('[data-role="scaler"]')?.replaceWith(scalerEl(r, servings));
    els.scroll.querySelector('[data-role="serves"]')?.replaceChildren(hi("people"), `Serves ${servings}`);
    els.scroll.querySelector(".ings")?.replaceWith(ingredientsEl(r, f));
    els.scroll.querySelector(".shopbar")?.replaceWith(shopBarEl(r, f));
    if (focusLabel >= 0) els.scroll.querySelectorAll(".scaler button")[focusLabel]?.focus({ preventScroll: true });
  }

  function ingredientsEl(r, f) {
    const done = P.checked(r.id);
    const ul = h("ul", { class: "ings" });
    r.ing.forEach((line, i) => {
      const on = done.has(i);
      const li = h("li", { class: "ing" + (on ? " done" : ""), role: "checkbox", tabindex: "0", "aria-checked": String(on) },
        h("span", { class: "cb", html: icon("check") }), h("span", { class: "txt" }, P.scaleLine(line, f)));
      const flip = () => {
        const now = P.toggleCheck(r.id, i);
        li.classList.toggle("done", now);
        li.setAttribute("aria-checked", String(now));
        li.closest(".col-ing")?.classList.toggle("has-checks", P.checked(r.id).size > 0);
        els.scroll.querySelector(".shopbar")?.replaceWith(shopBarEl(r, f));      // ticked = already have it
      };
      li.addEventListener("click", flip);
      li.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } });
      ul.append(li);
    });
    return ul;
  }

  function stepsEl(r) {
    const done = P.stepsDone(r.id);
    const ol = h("ol", { class: "steps" });
    const mark = () => {
      const d = P.stepsDone(r.id);
      let current = true;
      for (const [i, li] of [...ol.children].entries()) {
        const isDone = d.has(i);
        li.classList.toggle("done", isDone);
        li.setAttribute("aria-checked", String(isDone));
        li.classList.toggle("current", current && !isDone);
        if (!isDone) current = false;
      }
    };
    r.steps.forEach((text, i) => {
      const timers = P.cook.findTimers(text);
      const li = h("li", { class: "step", role: "checkbox", tabindex: "0", "aria-checked": String(done.has(i)) },
        h("span", { class: "step-n" }, String(i + 1)),
        h("div", { class: "step-main" }, h("p", {}, P.convertText(text)),
          timers.length ? h("div", { class: "step-timers" }, timers.map((t) =>
            h("button", { class: "timer-chip", type: "button", title: `Start a ${t.label} timer`, onClick: (e) => { e.stopPropagation(); P.cook.start(t.seconds, `Step ${i + 1}`); } }, hi("timer"), t.label))) : null));
      const flip = () => { P.toggleStep(r.id, i); mark(); };
      li.addEventListener("click", flip);
      li.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && e.target === li) { e.preventDefault(); flip(); } });
      ol.append(li);
    });
    mark();
    return ol;
  }

  function notesEl(r) {
    const ta = h("textarea", { class: "notes", rows: "3", placeholder: "Add a note — swaps, tweaks, what to try next time…", "aria-label": "Notes" });
    ta.value = P.notesOf(r.id);
    const grow = () => { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight}px`; };
    const wrap = h("div", { class: "notes-wrap" + (ta.value ? "" : " empty") }, h("h2", { class: "section-h" }, "Notes"), ta);
    ta.addEventListener("input", () => { grow(); wrap.classList.toggle("empty", !ta.value.trim()); });
    ta.addEventListener("input", P.debounce(() => P.setNotes(r.id, ta.value), 250));
    requestAnimationFrame(grow);
    return wrap;
  }

  function toggleCook(force) {
    state.cook = typeof force === "boolean" ? force : !state.cook;
    els.detail.classList.toggle("cook", state.cook);
    for (const s of els.detail.querySelectorAll(".switch")) s.setAttribute("aria-checked", String(state.cook));
    P.cook.set(state.cook);
    if (state.cook) {
      els.scroll.scrollTo({ top: 0, behavior: "smooth" });
      P.toast("Cook Mode on — the screen stays awake. Tap a step to tick it off.");
    }
  }

  const editCurrent = () => P.route.id && P.go(P.pathFor({ tag: P.route.tag, id: P.route.id, mode: "edit" }));

  async function shareRecipe(r) {
    const text = P.recipeText(r, P.scaleOf(r));
    const url = r.user || r.edited ? "" : `${location.origin}/#/t/${r.tag}/r/${r.id}`;
    if (navigator.share) {
      try { await navigator.share(url ? { title: r.title, url } : { title: r.title, text }); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    if (url) { await P.copyText(url); P.toast("Link copied."); }
    else { await P.copyText(text); P.toast("Recipe copied — paste it anywhere."); }
  }

  async function copyRecipe(r) {
    const ok = await P.copyText(P.recipeText(r, P.scaleOf(r)));
    P.toast(ok ? "Recipe copied to the clipboard." : "Couldn't copy — your browser blocked it.");
  }

  /* ================= the editor (edit one, or write / import a new one) ================= */
  function newRecipe() { P.go(P.pathFor({ mode: "new", tag: realTag() })); }

  function renderEditor(r) {
    const isNew = !r;
    els.detail.classList.remove("cook");
    const tags = P.tags({ hidden: true });
    const d = r ? { ...r } : { title: "", tag: realTag() || "mains", sub: "", img: "", src: "", min: null, serves: 4, video: "", ing: [], steps: [] };
    let img = d.img || "";
    const f = {};
    const field = (label, el, hint) => h("label", { class: "field" }, h("span", { class: "label" }, label), el, hint ? h("span", { class: "hint" }, hint) : null);
    const input = (val, attrs) => { const el = h("input", { class: "input", ...attrs }); el.value = val ?? ""; return el; };
    const area = (val, attrs) => { const el = h("textarea", { class: "input area", ...attrs }); el.value = val; return el; };

    f.title = input(d.title, { placeholder: "Recipe name", maxlength: "120" });
    f.title.classList.add("big");
    f.tag = h("select", { class: "input" }, tags.map((t) => h("option", { value: t.id, selected: t.id === d.tag }, t.name)));
    f.sub = input(d.sub, { placeholder: "e.g. Grilled", list: "sub-list", maxlength: "24" });
    const subList = h("datalist", { id: "sub-list" });
    const fillSubs = () => subList.replaceChildren(...[...new Set(P.recipes().filter((x) => x.tag === f.tag.value && x.sub).map((x) => x.sub))].sort().map((s) => h("option", { value: s })));
    f.tag.addEventListener("change", fillSubs);
    fillSubs();
    f.min = input(d.min, { type: "number", min: "0", max: "1440", inputmode: "numeric", placeholder: "minutes" });
    f.serves = input(d.serves, { type: "number", min: "1", max: "99", inputmode: "numeric" });
    f.src = input(d.src, { type: "url", placeholder: "https://…" });
    f.video = input(d.video, { type: "url", placeholder: "YouTube, TikTok, Facebook… (optional)" });
    f.img = input(img.startsWith("data:") ? "" : img, { type: "url", placeholder: "…or paste a photo link" });
    f.ing = area(d.ing.join("\n"), { rows: "9", placeholder: "1 cup soy sauce\n2 cloves garlic, minced\n1 onion, chopped" });
    f.steps = area(d.steps.join("\n"), { rows: "9", placeholder: "One step per line" });

    const heroBox = h("div", { class: "hero editable" });
    const file = h("input", { type: "file", accept: "image/*", hidden: true });
    const paintHero = () => heroBox.replaceChildren(
      img ? h("img", { src: P.photo(img), alt: "" }) : h("span", { class: "hero-ph", html: icon("image") }),
      h("div", { class: "hero-tools" },
        h("button", { class: "btn white sm", type: "button", onClick: () => file.click() }, hi("upload"), img ? "Change photo" : "Add a photo"),
        img ? h("button", { class: "btn white sm", type: "button", onClick: () => { img = ""; f.img.value = ""; paintHero(); } }, "Remove") : null));
    file.addEventListener("change", async () => {
      if (!file.files[0]) return;
      try { img = await P.resizeImage(file.files[0], 1100); f.img.value = ""; paintHero(); }
      catch (e) { P.toast(e.message); }
    });
    f.img.addEventListener("change", () => { img = f.img.value.trim(); paintHero(); });
    paintHero();

    /* import a link (only when starting a new recipe) */
    let importBar = null;
    if (isNew) {
      const url = h("input", { class: "input", type: "url", placeholder: "Paste a recipe link to fill this in…", "aria-label": "Recipe link" });
      const status = h("p", { class: "hint", "aria-live": "polite" }, "Works with most recipe sites. Video links (YouTube, Facebook, TikTok) are saved as a link with their title and photo.");
      const go = h("button", { class: "btn lime", type: "button" }, "Import");
      const run = async () => {
        const link = url.value.trim();
        if (!link) return url.focus();
        go.disabled = true; go.textContent = "Importing…"; status.classList.remove("err"); status.textContent = "Reading the page…";
        try {
          const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: link }) });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Couldn't import that page.");
          if (data.title) f.title.value = data.title;
          if (data.image) { img = data.image; f.img.value = data.image; paintHero(); }
          f.serves.value = data.serves || 4;
          f.min.value = data.time || "";
          f.src.value = data.url || link;
          f.video.value = data.video || "";
          f.ing.value = (data.ingredients || []).join("\n");
          f.steps.value = (data.steps || []).join("\n");
          f.tag.value = P.guessTag(data.title, data.category, data.ingredients || []);
          fillSubs();
          if (data.cuisine) f.sub.value = data.cuisine.split(",")[0].trim();
          status.textContent = data.partial
            ? "Got the title and photo. That page has no ingredient list, so add those below."
            : `Imported from ${data.source}. Check the details, then press Done.`;
        } catch (e) { status.classList.add("err"); status.textContent = e.message; }
        finally { go.disabled = false; go.textContent = "Import"; }
      };
      go.addEventListener("click", run);
      url.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), run()));
      importBar = h("div", { class: "import" }, h("div", { class: "import-row" }, url, go), status,
        h("button", { class: "textbtn", type: "button", onClick: () => openAI() }, hi("sparkle"), "Or describe a dish and let AI write it"));
    }

    const lines = (t) => t.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const save = () => {
      const title = f.title.value.trim();
      if (!title) { f.title.classList.add("bad"); f.title.focus(); P.toast("Give the recipe a name first."); return; }
      state.muteData = true;
      const id = P.saveRecipe({
        id: r?.id, title, tag: f.tag.value, sub: f.sub.value, img, src: f.src.value, video: f.video.value,
        cr: img && img === (d.img || "") ? d.cr : "", crl: img && img === (d.img || "") ? d.crl : "",     // a new photo is not the old credit
        min: Math.round(+f.min.value) || null, serves: Math.max(1, Math.round(+f.serves.value) || 4),
        ing: lines(f.ing.value), steps: lines(f.steps.value),
      });
      state.muteData = false;
      renderTiles();
      renderList();                       // the row's title, or a brand-new row, has to appear
      P.toast(isNew ? "Recipe added." : "Saved.");
      P.go(P.pathFor({ tag: f.tag.value, id }));
    };
    const cancel = () => (isNew ? closePane() : P.go(P.pathFor({ tag: P.route.tag, id: r?.id })));
    f.title.addEventListener("input", () => f.title.classList.remove("bad"));

    const del = async () => {
      const ok = await P.confirm({
        title: `Delete “${r.title}”?`,
        body: r.user ? "This removes it from your library." : "It's part of the sample library. You can bring it back with Undo, or by restoring a backup.",
        ok: "Delete", danger: true,
      });
      if (!ok) return;
      const undo = P.deleteRecipe(r.id);
      P.toast("Recipe deleted.", { action: { label: "Undo", fn: undo } });
    };

    els.top.replaceChildren(
      h("span", { class: "tagpill ghost" }, isNew ? "New recipe" : "Editing"),
      h("div", { class: "acts" },
        h("button", { class: "btn ghost sm", type: "button", onClick: cancel }, "Cancel"),
        h("button", { class: "editbtn", type: "button", onClick: save }, hi("check"), "Done")));

    els.scroll.replaceChildren(
      heroBox, file,
      h("form", { class: "recipe form", onSubmit: (e) => e.preventDefault() },
        importBar,
        field("Name", f.title),
        h("div", { class: "form-grid" }, field("Tag", f.tag), field("Subtag", f.sub, "Optional — a cuisine, a method, a mood.")),
        h("div", { class: "form-grid three" }, field("Time (min)", f.min), field("Serves", f.serves), field("Source link", f.src)),
        field("Photo", f.img),
        field("Video link", f.video),
        field("Ingredients", f.ing, "One per line. Start with the amount (“2 cups flour”) and Serves will scale it."),
        field("Directions", f.steps, "One step per line. Times like “10 minutes” become timers in Cook Mode."),
        subList,
        h("div", { class: "form-foot" },
          r ? h("span", { class: "grp" },
            h("button", { class: "btn ghost sm", type: "button", onClick: () => { const id = P.duplicateRecipe(r.id); P.toast("Duplicated."); P.go(P.pathFor({ tag: r.tag, id, mode: "edit" })); } }, hi("copy"), "Duplicate"),
            r.edited ? h("button", { class: "btn ghost sm", type: "button", onClick: () => { P.resetRecipe(r.id); P.toast("Back to the original."); P.go(P.pathFor({ tag: r.tag, id: r.id })); } }, "Reset to original") : null) : h("span"),
          r ? h("button", { class: "btn danger-ghost sm", type: "button", onClick: del }, hi("trash"), "Delete recipe") : null)));
    if (isNew) queueMicrotask(() => els.scroll.querySelector(".import input")?.focus({ preventScroll: true }));
  }

  /* ================= Ask AI, the shopping list, and getting back out of them ================= */
  const openAI = (prefill) => { if (prefill) P.ai.prefill(prefill); P.go("ai"); };
  const openShop = () => P.go("shop");
  const openPlan = () => P.go("plan");
  const openPantry = () => P.go("pantry");

  /** Open a random recipe: from the tag you are in, or from everything when you are not in one. */
  function surprise() {
    const inTag = realTag() && state.shown.length ? realTag() : null;
    const pool = inTag ? state.shown : P.recipes();
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!pick) return;
    P.go(P.pathFor({ tag: inTag || "all", id: pick.id }));
    P.toast("How about this one?", { action: { label: "Another", fn: surprise } });
  }

  function closePane() {
    const b = state.before;
    if (b && P.validTag(b.tag) && (!b.id || P.recipe(b.id))) return P.go(P.pathFor({ tag: b.tag, id: b.id }));
    P.go(P.pathFor({ tag: P.route.tag }));
  }

  function updateShopBadge() {
    const n = P.shop.count(), btn = $("#btn-folder");
    btn.classList.toggle("badged", n > 0);
    if (n > 0) btn.dataset.badge = n > 99 ? "99+" : String(n); else delete btn.dataset.badge;
  }

  function onShop() {
    updateShopBadge();
    const { mode, id } = P.route;
    if (mode === "shop") renderDetail();
    else if (mode === "view" && id) {
      const r = P.recipe(id);
      if (r) els.scroll.querySelector(".shopbar")?.replaceWith(shopBarEl(r, P.scaleOf(r) / (r.serves || 4)));
    }
  }

  /** "Add to shopping list", under the ingredients. Ticked ingredients are ones you already have, so they are left out. */
  function shopBarEl(r, f) {
    const ticked = P.checked(r.id);
    const lines = r.ing.map((l, i) => (ticked.has(i) ? null : P.scaleLine(l, f))).filter(Boolean);
    const inList = P.shop.has(r.id);
    const skipped = r.ing.length - lines.length;
    const add = () => {
      const servings = P.scaleOf(r);
      const res = P.shop.add(r, servings, lines);
      P.toast(res.updated ? `Updated your list for ${servings} servings.` : `Added ${P.plural(res.added, "item")} to your shopping list.`, { action: { label: "View", fn: openShop } });
    };
    return h("div", { class: "shopbar" },
      h("button", { class: "btn shopbtn " + (inList ? "in" : "lime"), type: "button", disabled: !lines.length, onClick: add },
        hi(inList ? "check" : "cart"), !lines.length ? "Everything is ticked" : inList ? "Update shopping list" : "Add to shopping list"),
      h("span", { class: "shopnote" }, lines.length ? `${P.plural(lines.length, "item")}${skipped ? ` · skipping the ${skipped} you ticked` : ""}` : "You already have it all"),
      inList ? h("button", { class: "textbtn", type: "button", onClick: openShop }, "View list") : null);
  }

  /* ================= navigation and layout ================= */
  function onRoute() {
    const raw = P.parseRoute(), narrow = P.isNarrow();
    if (raw.home && !narrow) {
      const last = P.S.ui.last || {};
      const tag = P.validTag(last.tag) ? last.tag : P.validTag(DEFAULT.tag) ? DEFAULT.tag : "all";     // never redirect to a tag that would bounce back here
      const id = P.recipe(last.id) && last.tag === tag ? last.id : (tag === DEFAULT.tag && P.recipe(DEFAULT.id) ? DEFAULT.id : null);
      return P.go(P.pathFor({ tag, id }), { replace: true });
    }
    if (raw.home) {
      const last = P.S.ui.last || {};
      P.route = { tag: P.validTag(last.tag) ? last.tag : P.validTag(DEFAULT.tag) ? DEFAULT.tag : "all", id: null, mode: "view", home: true };
    } else if (raw.mode === "new" || P.PANES.includes(raw.mode)) {
      // these panes borrow the list on the left for context, so they keep the tag you were in
      P.route = { tag: P.validTag(raw.tag) ? raw.tag : P.validTag(P.route.tag) ? P.route.tag : DEFAULT.tag, id: null, mode: raw.mode, home: false };
    } else {
      if (!P.validTag(raw.tag)) return P.go("", { replace: true });
      if (raw.id && !P.recipe(raw.id)) return P.go(P.pathFor({ tag: raw.tag }), { replace: true });
      P.route = { tag: raw.tag, id: raw.id, mode: raw.mode, home: false };
    }

    const { tag, id, mode } = P.route;
    const prev = state.rendered;
    if (mode !== "view" && prev.built && prev.mode === "view" && prev.tag) state.before = { tag: prev.tag, id: prev.id };   // where Close returns to
    const tagChanged = prev.tag !== tag;
    if (tagChanged) {
      // "search all recipes" brings the words along. Not cleared here: this pass can end early, redirecting to the
      // first recipe, and the tag change is then seen a second time. It is cleared once a pass completes, below.
      state.q = state.carryQ;
      els.search.value = state.q; els.clear.hidden = !state.q; state.filters = noFilters();
    }
    if (tagChanged || !prev.built) renderList();

    // on a wide screen a tag always has a recipe open, like the iPad layout
    if (!id && mode === "view" && !narrow && !P.route.home) {
      const first = state.shown[0];
      if (first) return P.go(P.pathFor({ tag, id: first.id }), { replace: true });
    }

    syncRows(true);
    syncTiles();
    if (!prev.built || prev.id !== id || prev.mode !== mode) renderDetail();
    state.rendered = { tag, id, mode, built: true };
    state.carryQ = "";
    if (mode === "view" && !P.route.home) {
      if (id) P.touchRecent(id);
      P.S.ui.last = { tag, id: id || null };
      P.save();
    }
    if (P.isMedium()) { state.drawer = false; syncSide(); }
    syncNav();
    const r = id && P.recipe(id);
    document.title = `${{ new: "New recipe", ai: "Ask AI", shop: "Shopping list", plan: "Meal plan", pantry: "What can I make?" }[mode] || (r ? r.title : P.tagName(tag))} · Platter`;
  }

  function onData() {
    if (state.muteData) return;
    renderTiles();
    const { tag, id, mode } = P.route;
    if (!P.validTag(tag)) return P.go("", { replace: true });
    if (mode !== "new" && id && !P.recipe(id)) return P.go(P.pathFor({ tag }), { replace: true });
    renderList();
    renderDetail();
  }

  function syncNav() {
    const { id, mode, home } = P.route;
    let nav = "detail";
    if (P.isNarrow()) nav = home ? "tags" : id || mode !== "view" ? "detail" : "list";
    els.app.dataset.nav = nav;
    const label = els.backList.querySelector(".back-label");
    if (label) label.textContent = P.tagName(P.route.tag);
  }

  function syncSide() {
    if (P.isNarrow()) els.app.dataset.side = "open";
    else if (P.isMedium()) els.app.dataset.side = state.drawer ? "open" : "closed";
    else els.app.dataset.side = P.S.ui.sidebar ? "open" : "closed";
  }

  function toggleSidebar() {
    if (P.isNarrow()) return;
    if (P.isMedium()) state.drawer = !state.drawer;
    else { P.S.ui.sidebar = !P.S.ui.sidebar; P.save(); }
    syncSide();
  }

  function onLayout() {
    syncSide();
    if (P.route.home && !P.isNarrow()) return onRoute();
    syncNav();
  }

  /* what the keyboard and other modules call */
  Object.assign(P.views, {
    next: (d) => selectNeighbor(d),
    edit: editCurrent,
    add: newRecipe,
    toggleCook,
    toggleSidebar,
    focusSearch: () => { if (P.isNarrow() && P.route.home) return; els.search.focus(); els.search.select(); },
    fav: () => P.route.id && P.route.mode === "view" && P.toggleFav(P.route.id),
    cookOn: () => state.cook,
    openAI,
    openShop,
    openPlan,
    openPantry,
    surprise,
  });
})();
