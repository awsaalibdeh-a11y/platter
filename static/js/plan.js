/* Platter — the meal plan: put recipes on the days you will cook them, then shop for the whole week at once.

   A day holds a list of { u, id, servings, done }. Only ids are stored, so an edited recipe shows up edited,
   and one that has been deleted simply drops out of the week. */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });

  /* ---------- dates (local time, keyed "2026-09-28") ---------- */
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const monday = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const short = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const long = (d) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const uid = () => Math.random().toString(36).slice(2, 9);

  /* ---------- the data ---------- */
  const days = () => P.S.plan;
  const touch = () => { P.save(); P.emit("plan"); };

  P.plan = {
    key,
    /** What is planned on a day (recipes that no longer exist are left out). */
    on: (k) => (days()[k] || []).filter((e) => P.recipe(e.id)),
    has: (id, k) => (days()[k] || []).some((e) => e.id === id),
    add(id, k, servings) {
      const r = P.recipe(id);
      if (!r) return () => {};
      const e = { u: uid(), id, servings: servings || P.scaleOf(r), done: 0 };
      (days()[k] ||= []).push(e);
      touch();
      return () => P.plan.remove(k, e.u);
    },
    remove(k, u) {
      const list = days()[k] || [];
      const i = list.findIndex((e) => e.u === u);
      if (i < 0) return () => {};
      const [e] = list.splice(i, 1);
      if (!list.length) delete days()[k];
      touch();
      return () => { const l = (days()[k] ||= []); l.splice(Math.min(i, l.length), 0, e); touch(); };
    },
    servings(k, u, n) {
      const e = (days()[k] || []).find((x) => x.u === u);
      if (e) { e.servings = Math.max(1, Math.min(99, n)); touch(); }
    },
    toggleDone(k, u) {
      const e = (days()[k] || []).find((x) => x.u === u);
      if (!e) return;
      if (e.done) { P.unmarkMade(e.id, e.done); e.done = 0; }
      else { e.done = Date.now(); P.markMade(e.id, e.done); }                    // cooking it from the plan counts as cooking it
      touch();
    },
    /** How many meals are planned from today on (the badge in the menu). */
    upcoming() {
      const today = key(new Date());
      return Object.keys(days()).filter((k) => k >= today).reduce((n, k) => n + P.plan.on(k).length, 0);
    },
    clearWeek(from) {
      const keys = Array.from({ length: 7 }, (_, i) => key(addDays(from, i)));
      const snap = keys.map((k) => [k, days()[k]]);
      for (const k of keys) delete days()[k];
      touch();
      return () => { for (const [k, v] of snap) if (v) days()[k] = v; touch(); };
    },
  };

  /* ---------- "Add to meal plan" on a recipe: the next seven days ---------- */
  P.plan.menu = (anchor, r) => {
    P.popover(anchor, (close) => {
      const today = new Date();
      return [
        h("div", { class: "pop-h" }, "Cook it on…"),
        ...Array.from({ length: 7 }, (_, i) => {
          const d = addDays(today, i), k = key(d), there = P.plan.has(r.id, k);
          return P.menuItem({
            label: i === 0 ? `Today · ${short(d)}` : i === 1 ? `Tomorrow · ${short(d)}` : long(d), icon: "calendar", on: there,
            onClick: () => {
              close();
              const undo = P.plan.add(r.id, k, P.scaleOf(r));
              P.toast(`Planned for ${i === 0 ? "today" : i === 1 ? "tomorrow" : long(d)}.`, { action: { label: "Undo", fn: undo } });
            },
          });
        }),
        h("div", { class: "pop-sep" }),
        P.menuItem({ label: "Open the meal plan", icon: "book", onClick: () => { close(); P.go("plan"); } }),
      ];
    }, { align: "right" });
  };

  /* ---------- choosing a recipe for a day ---------- */
  function picker(k, onDone) {
    const d = new Date(`${k}T12:00:00`);
    P.sheet((close) => {
      const input = h("input", { class: "input", placeholder: "Search your recipes…", "aria-label": "Search recipes", "data-autofocus": "", autocomplete: "off" });
      const list = h("div", { class: "pick-list", role: "listbox" });
      const paint = () => {
        const q = input.value.trim();
        let items, label = "";
        if (q) items = P.sort(P.search(P.recipes(), q), "az").slice(0, 40);
        else {
          // favorites and what you looked at lately first, then the quickest recipes, so it is never a bare list
          const seen = new Set();
          items = [...P.inTag("fav"), ...P.inTag("recent"), ...P.sort(P.inTag("quick"), "quick")].filter((r) => !seen.has(r.id) && seen.add(r.id)).slice(0, 24);
          label = "Suggestions";
        }
        const rows = items.map((r) => h("button", {
          class: "pick", type: "button", role: "option",
          onClick: () => { close(); P.plan.add(r.id, k, P.scaleOf(r)); P.toast(`Added ${r.title} to ${long(d)}.`); onDone?.(); },
        },
        h("span", { class: "pick-thumb" }, r.img ? h("img", { src: P.photo(r.img, "small"), alt: "", loading: "lazy" }) : null),
        h("span", { class: "pick-t" }, r.title, h("small", {}, [P.tagName(r.tag), r.min ? P.fmtMin(r.min) : ""].filter(Boolean).join(" · ")))));
        list.replaceChildren(...[label ? h("div", { class: "pop-h" }, label) : null, ...(rows.length ? rows : [h("p", { class: "pick-none" }, `Nothing matches “${q}”.`)])].filter(Boolean));
      };
      input.addEventListener("input", P.debounce(paint, 60));
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") list.querySelector(".pick")?.click(); });
      paint();
      return [
        h("h3", { class: "sheet-h" }, `Add to ${long(d)}`),
        input, list,
        h("div", { class: "sheet-btns" }, h("button", { class: "btn ghost", type: "button", onClick: close }, "Cancel")),
      ];
    }, { label: "Add a recipe to the plan", class: "picker" });
  }

  /* ---------- the pane ---------- */
  let week = monday(new Date());                                   // which week the pane is showing

  P.panes.plan = (top, scroll, ctx) => {
    const fresh = !scroll.querySelector(".recipe.plan");          // opening the pane, not redrawing it after a tap
    const today = key(new Date());
    const dates = Array.from({ length: 7 }, (_, i) => addDays(week, i));
    const planned = dates.flatMap((d) => P.plan.on(key(d)));
    const range = `${short(dates[0])} – ${short(dates[6])}`;
    const isThisWeek = key(week) === key(monday(new Date()));
    const go = (n) => { week = addDays(week, n * 7); P.emit("plan"); };

    const open = (r) => P.go(P.pathFor({ tag: r.tag, id: r.id }));

    const itemEl = (k, e) => {
      const r = P.recipe(e.id);
      const step = (n) => h("button", { type: "button", "aria-label": n < 0 ? "Fewer servings" : "More servings", html: P.icon(n < 0 ? "minus" : "plus"), disabled: n < 0 ? e.servings <= 1 : e.servings >= 99, onClick: () => P.plan.servings(k, e.u, e.servings + n) });
      return h("div", { class: "plan-item" + (e.done ? " done" : "") },
        h("button", { class: "pi-check", type: "button", role: "checkbox", "aria-checked": String(!!e.done), title: e.done ? "Not cooked after all" : "I cooked this", "aria-label": e.done ? "Mark as not cooked" : "Mark as cooked", html: P.icon("check"), onClick: () => P.plan.toggleDone(k, e.u) }),
        h("button", { class: "pi-main", type: "button", title: "Open the recipe", onClick: () => open(r) },
          h("span", { class: "pi-thumb" }, r.img ? h("img", { src: P.photo(r.img, "small"), alt: "", loading: "lazy", draggable: "false" }) : null),
          h("span", { class: "pi-title" }, r.title)),
        h("span", { class: "pi-serves" }, step(-1), h("span", {}, `Serves ${e.servings}`), step(1)),
        h("button", { class: "pi-x", type: "button", "aria-label": `Remove ${r.title}`, html: P.icon("x"), onClick: () => { const undo = P.plan.remove(k, e.u); P.toast(`Removed ${r.title}.`, { action: { label: "Undo", fn: undo } }); } }));
    };

    const dayEl = (d) => {
      const k = key(d), items = P.plan.on(k);
      return h("section", { class: "plan-day" + (k === today ? " today" : "") + (k < today ? " past" : "") },
        h("div", { class: "plan-date" }, h("b", {}, d.toLocaleDateString(undefined, { weekday: "short" })), h("span", {}, String(d.getDate())), k === today ? h("em", {}, "Today") : null),
        h("div", { class: "plan-items" },
          items.map((e) => itemEl(k, e)),
          h("button", { class: "plan-add", type: "button", onClick: () => picker(k) }, hi("plus"), items.length ? "Add another" : "Add a recipe")));
    };

    const addWeek = () => {
      const totals = new Map();
      for (const d of dates) for (const e of P.plan.on(key(d))) totals.set(e.id, (totals.get(e.id) || 0) + e.servings);
      for (const [id, servings] of totals) {
        const r = P.recipe(id), ticked = P.checked(id), f = servings / (r.serves || 4);
        P.shop.add(r, servings, r.ing.map((l, i) => (ticked.has(i) ? null : P.scaleLine(l, f))).filter(Boolean));     // ticked = already have it
      }
      P.toast(`Added ${P.plural(totals.size, "recipe")} to your shopping list.`, { action: { label: "View", fn: () => P.go("shop") } });
    };

    top.replaceChildren(
      h("span", { class: "tagpill ghost" }, "Meal plan"),
      h("div", { class: "acts" }, h("button", { class: "editbtn", type: "button", onClick: ctx.close }, hi("check"), "Done")));

    scroll.replaceChildren(h("div", { class: "recipe plan" },
      h("h1", { class: "title" }, "Meal plan"),
      h("div", { class: "plan-nav" },
        h("div", { class: "seg" },
          h("button", { type: "button", "aria-label": "Previous week", html: P.icon("chevron"), onClick: () => go(-1) }),
          h("button", { type: "button", class: isThisWeek ? "on" : "", onClick: () => { week = monday(new Date()); P.emit("plan"); } }, "This week"),
          h("button", { type: "button", "aria-label": "Next week", html: P.icon("chevronRight"), onClick: () => go(1) })),
        h("span", { class: "chip" }, hi("calendar"), range),
        planned.length ? h("span", { class: "chip" }, hi("book"), P.plural(planned.length, "meal")) : null),
      h("div", { class: "plan-days" }, dates.map(dayEl)),
      h("div", { class: "plan-foot" },
        h("button", { class: "btn lime", type: "button", disabled: !planned.length, onClick: addWeek }, hi("cart"), "Add this week to my shopping list"),
        planned.length ? h("button", { class: "btn danger-ghost sm", type: "button", onClick: () => { const undo = P.plan.clearWeek(week); P.toast("Cleared the week.", { action: { label: "Undo", fn: undo } }); } }, hi("trash"), "Clear the week") : null,
        h("span", { class: "shopnote" }, planned.length ? "Ingredients you ticked on a recipe are left out." : "Plan a few dinners, then shop for all of them in one tap."))));
    // the week starts on Monday, so on a Friday the first thing on screen would be four empty past days
    if (fresh && isThisWeek) setTimeout(() => scroll.querySelector(".plan-day.today")?.scrollIntoView({ block: "start" }), 0);   // after renderDetail restores the scroll position
  };
})();
