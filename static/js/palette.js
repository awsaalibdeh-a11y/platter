/* Platter — search everything (Ctrl+K, or the search bar at the top of the sidebar).

   One box finds recipes (by name first, then by ingredient), places in the app (tags, collections, cookbooks,
   panes) and actions ("dark mode", "snap my fridge", "new recipe"). Arrow keys move, Enter opens. */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });

  /** Actions and places: [label, icon, extra words people might type, what it does] */
  const actions = () => [
    ["Discover", "compass", "home front page ideas", () => P.go("discover")],
    ["Meal plan", "calendar", "week plan dinners", () => P.go("plan")],
    ["Plan my week for me", "sparkle", "auto plan fill week", () => P.go("plan")],
    ["Shopping list", "cart", "groceries buy list", () => P.go("shop")],
    ["What can I make?", "jar", "pantry fridge ingredients have", () => P.go("pantry")],
    ["Snap your fridge", "camera", "photo fridge picture scan", () => P.go("pantry")],
    ["Ask AI what to cook", "sparkle", "ai ideas suggest", () => P.go("ai")],
    ["New recipe", "plus", "add create write import", () => P.views.add()],
    ["Import a recipe from a photo", "camera", "scan cookbook picture read", () => P.views.add()],
    ["Your kitchen", "chefHat", "stats streak cooked history", () => P.go("stats")],
    ["Settings", "gear", "options preferences", () => P.go("settings")],
    ["My diet", "leaf", "vegetarian vegan low fat dairy milk gluten allergy", () => P.diet.sheet()],
    ["Prices and location", "coins", "currency cost country city money", () => P.prices.sheet()],
    ["White mode", "sun", "light theme bright", () => { P.setTheme("white"); P.toast("White mode."); }],
    ["Warm mode", "sun", "light theme paper cream beige", () => { P.setTheme("warm"); P.toast("Warm mode."); }],
    ["Dark mode", "moon", "night theme black", () => { P.setTheme("dark"); P.toast("Dark mode."); }],
    ["Start a timer", "timer", "timer clock alarm countdown minutes egg pasta kitchen", () => P.timers.sheet()],
    ["Surprise me", "shuffle", "random", () => P.views.surprise()],
    ["Keyboard shortcuts", "keyboard", "keys help", () => P.views.shortcuts()],
    ["All recipes", "book", "everything library", () => P.go(P.pathFor({ tag: "all" }))],
    ["Favorites", "star", "starred saved", () => P.go(P.pathFor({ tag: "fav" }))],
    ["Recently viewed", "clockArrow", "history recent", () => P.go(P.pathFor({ tag: "recent" }))],
    ["Top rated", "star", "best rated", () => P.go(P.pathFor({ tag: "top" }))],
    ["Under 30 minutes", "clock", "quick fast", () => P.go(P.pathFor({ tag: "quick" }))],
    ...P.tags().map((t) => [t.name, "tree", "tag", () => P.go(P.pathFor({ tag: t.id }))]),
    ...P.books().map((b) => [b.name, "bookmark", "cookbook", () => P.go(P.pathFor({ tag: b.id }))]),
  ];

  const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  /** How well a recipe's title fits the words: whole title first, then word starts, then anywhere. */
  function titleScore(title, q, toks) {
    const t = norm(title);
    if (t === q) return 100;
    if (t.startsWith(q)) return 80;
    if (!toks.every((w) => t.includes(w))) return 0;
    return 40 + toks.filter((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t)).length * 10;
  }

  function results(query) {
    const fixed = P.fixQuery(query.trim());                    // "chiken" still finds chicken
    const q = norm(fixed.q);
    const toks = q.split(/\s+/).filter(Boolean);
    if (!q) {
      const recent = P.S.recent.map((id) => P.recipe(id)).filter(Boolean).slice(0, 5);
      return [
        recent.length ? { head: "Recently viewed", items: recent.map(recipeItem) } : null,
        { head: "Jump to", items: actions().slice(0, 8).map(actionItem) },
      ].filter(Boolean);
    }
    const scored = [];
    for (const r of P.recipes()) { const s = titleScore(r.title, q, toks); if (s) scored.push([s, r]); }
    scored.sort((a, b) => b[0] - a[0] || a[1].title.length - b[1].title.length);
    let recipes = scored.slice(0, 7).map(([, r]) => r);
    if (recipes.length < 7) {                                // then recipes that use it
      const have = new Set(recipes.map((r) => r.id));
      recipes = recipes.concat(P.search(P.recipes(), q).filter((r) => !have.has(r.id)).slice(0, 7 - recipes.length));
    }
    const acts = actions().filter(([label, , words]) => toks.every((w) => norm(`${label} ${words}`).includes(w))).slice(0, 6);
    return [
      acts.length ? { head: "Go to and do", items: acts.map(actionItem) } : null,
      recipes.length ? { head: "Recipes", items: recipes.map(recipeItem) } : null,
      { head: "Or", items: [{ icon: "sparkle", label: `Ask AI for “${query.trim()}”`, run: () => P.views.openAI(query.trim()) }] },
    ].filter(Boolean);
  }
  const recipeItem = (r) => ({ recipe: r, label: r.title, sub: [P.tagName(r.tag), r.min ? P.fmtMin(r.min) : "", r.level || ""].filter(Boolean).join(" · "), run: () => P.go(P.pathFor({ tag: r.tag, id: r.id })) });
  const actionItem = ([label, icon, , run]) => ({ icon, label, run });

  function open() {
    if (document.querySelector(".sheet.palette")) return;
    P.sheet((close) => {
      const input = h("input", { class: "pal-input", type: "search", placeholder: "Search recipes, tags and actions…", "aria-label": "Search everything", autocomplete: "off", spellcheck: "false", "data-autofocus": "" });
      const list = h("div", { class: "pal-list", role: "listbox" });
      let flat = [], at = 0;
      const pick = (it) => { close(); it.run(); };
      const paint = () => {
        const groups = results(input.value);
        flat = groups.flatMap((g) => g.items);
        at = Math.min(at, flat.length - 1);
        let n = 0;
        list.replaceChildren(...groups.map((g) => h("div", { class: "pal-group" }, h("div", { class: "pop-h" }, g.head), g.items.map((it) => {
          const i = n++;
          return h("button", { class: "pal-item" + (i === at ? " on" : ""), type: "button", role: "option", "aria-selected": String(i === at), onClick: () => pick(it), onMouseenter: () => { at = i; mark(); } },
            it.recipe ? h("span", { class: "pal-thumb" }, it.recipe.img ? h("img", { src: P.photo(it.recipe.img, "small"), alt: "", loading: "lazy" }) : null) : h("span", { class: "pal-ic", html: P.icon(it.icon) }),
            h("span", { class: "pal-t" }, it.label, it.sub ? h("small", {}, it.sub) : null),
            i === at ? h("kbd", {}, "↵") : null);
        }))));
      };
      const mark = () => {
        list.querySelectorAll(".pal-item").forEach((b, i) => { b.classList.toggle("on", i === at); b.setAttribute("aria-selected", String(i === at)); });
        list.querySelector(".pal-item.on")?.scrollIntoView({ block: "nearest" });
      };
      input.addEventListener("input", () => { at = 0; paint(); });
      input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); at = Math.min(flat.length - 1, at + 1); mark(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); at = Math.max(0, at - 1); mark(); }
        else if (e.key === "Enter" && flat[at]) { e.preventDefault(); pick(flat[at]); }
      });
      paint();
      return [h("div", { class: "pal-box" }, hi("search"), input, h("kbd", { class: "pal-esc" }, "Esc")), list];
    }, { class: "palette", label: "Search everything" });
  }

  P.palette = { open };
})();
