/* Platter — cookbooks (the menus) and "Your kitchen" (your cooking, in numbers).

   Cookbooks are named lists: "Date night", "Holiday baking", "Mum's recipes". Unlike tags, which give each recipe
   exactly one home, a recipe can sit in as many cookbooks as you like. The data lives in store.js. */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });

  /* ---------- cookbooks ---------- */
  /** "Save to a cookbook", from a recipe: tick the ones it belongs in, or start a new one. */
  function menu(anchor, r) {
    P.popover(anchor, (close) => {
      const input = h("input", { class: "input sm", placeholder: "New cookbook…", maxlength: "40", "aria-label": "New cookbook name" });
      const create = () => {
        const name = input.value.trim();
        if (!name) return input.focus();
        P.addBook(name, r.id);
        close();
        P.toast(`Saved to your new cookbook “${name}”.`);
      };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") create(); });
      const books = P.books();
      return [
        h("div", { class: "pop-h" }, "Save to a cookbook"),
        books.length ? books.map((b) => P.menuItem({
          label: b.name, icon: "book", on: b.ids.includes(r.id), count: b.ids.length,
          onClick: () => { const now = P.toggleInBook(b.id, r.id); close(); P.toast(now ? `Saved to “${b.name}”.` : `Taken out of “${b.name}”.`); },
        })) : h("p", { class: "pop-note" }, "Cookbooks are your own lists: date night, party food, the ones the kids like. A recipe can be in as many as you like."),
        h("div", { class: "pop-input" }, input, h("button", { class: "btn lime sm", type: "button", onClick: create }, "Create")),
      ];
    }, { class: "wide scroll" });
    queueMicrotask(() => { if (!P.books().length) document.querySelector(".popover .pop-input input")?.focus(); });
  }

  /** A name, for a new cookbook or a renamed one. */
  function nameSheet({ title, value = "", ok, onDone }) {
    P.sheet((close) => {
      const input = h("input", { class: "input", maxlength: "40", placeholder: "e.g. Date night", "data-autofocus": "" });
      input.value = value;
      const done = () => { const v = input.value.trim(); if (!v) { input.classList.add("bad"); input.focus(); return; } close(); onDone(v); };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") done(); });
      return [
        h("h3", { class: "sheet-h" }, title), input,
        h("div", { class: "sheet-btns" }, h("button", { class: "btn ghost", type: "button", onClick: close }, "Cancel"), h("button", { class: "btn lime", type: "button", onClick: done }, ok)),
      ];
    }, { class: "small", label: title });
  }

  P.cookbooks = {
    menu,
    create: () => nameSheet({ title: "New cookbook", ok: "Create", onDone: (name) => { const id = P.addBook(name); P.go(P.pathFor({ tag: id })); P.toast("Created. Add recipes with the bookmark button on any recipe."); } }),
    rename: (id) => nameSheet({ title: "Rename cookbook", value: P.tagName(id), ok: "Save", onDone: (name) => P.renameBook(id, name) }),
    async remove(id) {
      const name = P.tagName(id);
      const ok = await P.confirm({ title: `Delete “${name}”?`, body: "Only the cookbook goes. The recipes in it stay in your library.", ok: "Delete cookbook", danger: true });
      if (!ok) return;
      const undo = P.deleteBook(id);
      P.go(P.pathFor({ tag: "all" }));
      P.toast(`Deleted “${name}”.`, { action: { label: "Undo", fn: undo } });
    },
  };

  /* ---------- Your kitchen ---------- */
  const DAY = 864e5;
  const dayKey = (t) => P.plan.key(new Date(t));

  P.panes.stats = (top, scroll, ctx) => {
    const S = P.S;
    const cooks = Object.entries(S.made).flatMap(([id, ts]) => ts.map((t) => ({ id, t }))).filter((c) => P.recipe(c.id));
    const days = new Map();
    for (const c of cooks) days.set(dayKey(c.t), (days.get(dayKey(c.t)) || 0) + 1);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // streak: days in a row with something cooked, up to today (or yesterday, if today isn't over yet)
    // (stepping by calendar day, not by 24 hours, so a daylight-saving change can't skip one)
    const back = (d, n) => { const x = new Date(d); x.setDate(x.getDate() - n); return x; };
    let streak = 0;
    for (let n = days.has(dayKey(today)) ? 0 : 1; days.has(dayKey(back(today, n))); n++) streak++;
    const tried = new Set(cooks.map((c) => c.id));
    const count = (key) => { const m = new Map(); for (const c of cooks) { const v = key(P.recipe(c.id)); if (v) m.set(v, (m.get(v) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };
    const cuisines = count((r) => r.sub);
    const tags = count((r) => P.tagName(r.tag));
    const week = cooks.filter((c) => c.t >= today - 6 * DAY).length;
    const top5 = [...tried].map((id) => [id, S.made[id].length]).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // the last 18 weeks, Monday first, like a calendar on the fridge
    const weeks = 18;
    const start = new Date(today); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7);
    const cells = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const n = days.get(dayKey(d)) || 0;
      cells.push(h("i", { class: `hm l${Math.min(n, 3)}` + (d > today ? " future" : ""), title: `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}: ${n ? P.plural(n, "meal") : "nothing logged"}` }));
    }

    const num = (v, label, ic) => h("div", { class: "kstat" }, hi(ic), h("b", {}, String(v)), h("small", {}, label));
    const bars = (rows) => { const max = rows[0]?.[1] || 1; return h("div", { class: "kbars" }, rows.slice(0, 6).map(([k, n]) => h("div", { class: "kbar" }, h("span", {}, k), h("i", {}, h("em", { style: { width: `${(n / max) * 100}%` } })), h("b", {}, String(n))))); };
    const own = Object.keys(S.user).length;

    top.replaceChildren(h("span", { class: "tagpill ghost" }, "Your kitchen"),
      h("div", { class: "acts" }, h("button", { class: "editbtn", type: "button", onClick: ctx.close }, hi("check"), "Done")));
    scroll.replaceChildren(h("div", { class: "recipe kitchen" },
      h("h1", { class: "title" }, "Your kitchen"),
      h("p", { class: "lead" }, cooks.length ? `You've cooked ${P.plural(cooks.length, "meal")} from ${P.plural(tried.size, "recipe")}. Here's how it's going.` : "Tap “I made this” on a recipe after you cook it, and your cooking shows up here."),
      h("div", { class: "kstats" },
        num(cooks.length, "Meals cooked", "chefHat"), num(streak, streak === 1 ? "Day streak" : "Days in a row", "fire"),
        num(tried.size, "Recipes tried", "book"), num(cuisines.length, "Cuisines explored", "compass"),
        num(week, "This week", "calendar"), num(Object.keys(S.fav).filter((id) => P.recipe(id)).length, "Favorites", "star"),
        num(Object.keys(S.rate).filter((id) => P.recipe(id)).length, "Rated", "star"), num(own, "Your own recipes", "pencil")),
      h("section", { class: "ksec" }, h("div", { class: "sec-head" }, h("h2", { class: "section-h" }, "The last 18 weeks"), h("span", { class: "count-note" }, `${days.size} cooking days`)),
        h("div", { class: "heat", style: { gridTemplateColumns: `repeat(${weeks}, 1fr)` } }, cells),
        h("div", { class: "heat-key" }, "Less", h("i", { class: "hm l0" }), h("i", { class: "hm l1" }), h("i", { class: "hm l2" }), h("i", { class: "hm l3" }), "More")),
      top5.length ? h("section", { class: "ksec" }, h("div", { class: "sec-head" }, h("h2", { class: "section-h" }, "Your most cooked")),
        h("div", { class: "ktop" }, top5.map(([id, n], i) => { const r = P.recipe(id); return h("button", { class: "ktop-row", type: "button", onClick: () => P.go(P.pathFor({ tag: r.tag, id })) },
          h("span", { class: "ktop-n" }, String(i + 1)), h("span", { class: "pi-thumb" }, r.img ? h("img", { src: P.photo(r.img, "small"), alt: "" }) : null),
          h("span", { class: "pi-title" }, r.title), h("em", {}, `${n}×`)); }))) : null,
      cuisines.length ? h("section", { class: "ksec" }, h("div", { class: "sec-head" }, h("h2", { class: "section-h" }, "Cuisines you cook")), bars(cuisines)) : null,
      tags.length ? h("section", { class: "ksec" }, h("div", { class: "sec-head" }, h("h2", { class: "section-h" }, "What you cook")), bars(tags)) : null,
      !cooks.length ? h("div", { class: "dfoot" }, h("button", { class: "btn lime", type: "button", onClick: () => P.go("discover") }, hi("compass"), "Find something to cook")) : null));
  };
})();
