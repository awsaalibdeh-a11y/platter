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
    /** Move a planned meal to another day. */
    move(k, u, to) {
      const list = days()[k] || [];
      const i = list.findIndex((e) => e.u === u);
      if (i < 0 || to === k) return () => {};
      const [e] = list.splice(i, 1);
      if (!list.length) delete days()[k];
      (days()[to] ||= []).push(e);
      touch();
      return () => P.plan.move(to, u, k);
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

  /* ---------- "plan the week for me" ---------- */
  const DINNERS = new Set(["chicken", "poultry", "beef", "seafood", "pork", "lamb", "vegetarian", "pasta", "mains"]);
  const DIET_OPTS = [["", "Anything"], ["vegetarian", "Vegetarian"], ["vegan", "Vegan"], ["gluten-free", "Gluten-free"], ["dairy-free", "Dairy-free"]];
  const TIME_OPTS = [[0, "Any time"], [30, "30 min"], [45, "45 min"], [60, "1 hour"]];

  /** Dinners for the empty days: varied (no tag or cuisine twice in a row), nothing cooked in the last two weeks,
      favorites and your top-rated nudged up. Runs in the browser, instantly, no AI needed. */
  function pickDinners(n, { diet, maxMin, favs }) {
    const since = Date.now() - 14 * 864e5;
    const planned = new Set(Object.values(P.S.plan).flat().map((e) => e.id));
    const pool = P.diet.filter(P.recipes()).filter((r) => DINNERS.has(r.tag) && r.img && (!diet || (r.diet || []).includes(diet)) && (!maxMin || (r.min && r.min <= maxMin)));
    const score = (r) => Math.random() * 2 + (P.isFav(r.id) ? (favs ? 4 : 1) : 0) + (P.rating(r.id) >= 4 ? 1.2 : 0) + (r.level === "Easy" ? 0.3 : 0)
      - (P.lastMade(r.id) > since ? 6 : 0) - (planned.has(r.id) ? 6 : 0);
    const ranked = pool.map((r) => [score(r), r]).sort((a, b) => b[0] - a[0]).map(([, r]) => r);
    const out = [];
    for (let i = 0; i < n; i++) {
      const prev = out[out.length - 1];
      const pick = ranked.find((r) => !out.includes(r) && (!prev || (r.tag !== prev.tag && (!r.sub || r.sub !== prev.sub))))
        || ranked.find((r) => !out.includes(r));
      if (!pick) break;
      out.push(pick);
    }
    return out;
  }

  function autoPlan(dates) {
    const today = key(new Date());
    const empty = dates.filter((d) => key(d) >= today && !P.plan.on(key(d)).length);
    if (!empty.length) { P.toast("Every day from today already has something planned."); return; }
    const o = { diet: "", maxMin: 0, favs: true, servings: 4 };
    P.sheet((close) => {
      const body = h("div", { class: "auto-body" });
      const paint = () => {
        const chip = (on, label, fn) => h("button", { class: "ai-chip" + (on ? " on" : ""), type: "button", "aria-pressed": String(on), onClick: () => { fn(); paint(); } }, label);
        body.replaceChildren(
          h("div", { class: "label" }, "Diet"), h("div", { class: "ai-chips" }, DIET_OPTS.map(([k, l]) => chip(o.diet === k, l, () => (o.diet = k)))),
          h("div", { class: "label" }, "Time to cook"), h("div", { class: "ai-chips" }, TIME_OPTS.map(([k, l]) => chip(o.maxMin === k, l, () => (o.maxMin = k)))),
          h("div", { class: "auto-row" },
            h("span", { class: "label" }, "Serves"),
            h("div", { class: "scaler" },
              h("button", { type: "button", "aria-label": "Fewer", html: P.icon("minus"), disabled: o.servings <= 1, onClick: () => { o.servings--; paint(); } }),
              h("span", { class: "lbl" }, hi("people"), String(o.servings)),
              h("button", { type: "button", "aria-label": "More", html: P.icon("plus"), disabled: o.servings >= 12, onClick: () => { o.servings++; paint(); } }))),
          h("label", { class: "auto-row check" }, h("button", { class: "switch", type: "button", role: "switch", "aria-checked": String(o.favs), onClick: () => { o.favs = !o.favs; paint(); } }), h("span", {}, "Lean on my favorites")));
      };
      paint();
      const run = () => {
        const picks = pickDinners(empty.length, o);
        close();
        if (!picks.length) { P.toast("Nothing in your library fits all of that. Loosen a filter and try again."); return; }
        const undos = picks.map((r, i) => P.plan.add(r.id, key(empty[i]), o.servings));
        P.toast(`Planned ${P.plural(picks.length, "dinner")}. Change any of them with ✕ and “Add a recipe”.`, { action: { label: "Undo", fn: () => undos.forEach((u) => u()) }, ms: 6000 });
      };
      return [
        h("h3", { class: "sheet-h" }, "Plan the week for me"),
        h("p", { class: "sheet-p" }, `Fills the ${P.plural(empty.length, "empty day")} from today with a varied mix of dinners from your library: nothing you've cooked in the last two weeks, and never the same kind twice in a row.`),
        body,
        h("div", { class: "sheet-btns" }, h("button", { class: "btn ghost", type: "button", onClick: close }, "Cancel"),
          h("button", { class: "btn lime", type: "button", onClick: run }, hi("sparkle"), `Plan ${P.plural(empty.length, "dinner")}`)),
      ];
    }, { label: "Plan the week for me" });
  }
  P.plan.pick = pickDinners;

  /** "Move to…": the days of this week and the next. */
  function moveMenu(anchor, k, e, from) {
    const r = P.recipe(e.id);
    P.popover(anchor, (close) => [
      h("div", { class: "pop-h" }, `Move ${r.title} to…`),
      ...Array.from({ length: 14 }, (_, i) => addDays(from, i)).filter((d) => key(d) !== k && key(d) >= key(new Date())).map((d) => P.menuItem({
        label: long(d), icon: "calendar", count: P.plan.on(key(d)).length || undefined,
        onClick: () => { close(); const undo = P.plan.move(k, e.u, key(d)); P.toast(`Moved to ${long(d)}.`, { action: { label: "Undo", fn: undo } }); },
      })),
    ], { class: "scroll", align: "right" });
  }

  /* ---------- the week, as calendar events (.ics): each planned meal on its day, with its ingredients ---------- */
  const icsText = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const fold = (line) => { const out = []; while (line.length > 74) { out.push(line.slice(0, 74)); line = ` ${line.slice(74)}`; } out.push(line); return out.join("\r\n"); };
  function calendar(dates) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Platter//Meal plan//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Platter meal plan"];
    let n = 0;
    for (const d of dates) {
      for (const e of P.plan.on(key(d))) {
        const r = P.recipe(e.id), day = key(d).replace(/-/g, ""), next = key(addDays(d, 1)).replace(/-/g, "");
        const about = `Serves ${e.servings}. ${location.origin}/#/t/${r.tag}/r/${encodeURIComponent(r.id)}\n\nIngredients:\n${r.ing.map((l) => `- ${l}`).join("\n")}`;
        lines.push("BEGIN:VEVENT", `UID:${e.u}-${day}@platter`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`,
          `SUMMARY:${icsText(`Cook: ${r.title}`)}`, `DESCRIPTION:${icsText(about)}`, "END:VEVENT");
        n++;
      }
    }
    lines.push("END:VCALENDAR");
    P.download(`platter-meal-plan-${key(dates[0])}.ics`, lines.map(fold).join("\r\n"), "text/calendar");
    P.toast(`${P.plural(n, "meal")} saved as a calendar file. Open it to add them to your calendar.`, { ms: 5000 });
  }
  P.plan.calendar = calendar;

  /* ---------- the week at a glance ---------- */
  /** Calories and protein a day, the calorie split, meat-free nights and what's cooked: per person, AI estimates. */
  function weekSummary(dates, planned) {
    const recipes = planned.map((e) => P.recipe(e.id)).filter(Boolean);
    if (!recipes.length) return null;
    const days = dates.map((d) => P.plan.on(key(d)).map((e) => P.recipe(e.id)).filter((r) => r?.nut?.[0])).filter((rs) => rs.length);
    const avg = (i) => (days.length ? Math.round(days.reduce((n, rs) => n + rs.reduce((m, r) => m + (r.nut[i] || 0), 0), 0) / days.length) : 0);
    const [kcal, protein, carbs, fat] = [0, 1, 2, 3].map(avg);
    const veg = recipes.filter((r) => (r.diet || []).includes("vegetarian")).length;
    const cooked = planned.filter((e) => e.done).length;
    const kinds = new Set(recipes.map((r) => r.sub || r.tag)).size;
    const cal = { p: protein * 4, c: carbs * 4, f: fat * 9 };
    const sum = cal.p + cal.c + cal.f || 1;
    const pct = (k) => Math.round((cal[k] / sum) * 100);
    const tip = !kcal ? ""
      : pct("f") > 42 ? "A rich week: over 40% of the calories come from fat. A lighter dinner or two would even it out."
      : recipes.length >= 4 && !veg ? "No meat-free nights yet. One or two would add variety (and save a little)."
      : recipes.length >= 4 && kinds <= 2 ? "Lots of the same kind of food. Try mixing in another cuisine."
      : protein < 22 ? "Light on protein. Beans, eggs, fish or chicken would help."
      : "A nicely balanced week.";
    const tile = (ic, value, label) => h("div", { class: "wk-tile" }, hi(ic), h("b", {}, value), h("small", {}, label));
    return h("section", { class: "wk", "aria-label": "This week at a glance" },
      h("div", { class: "wk-head" }, h("h2", {}, "The week at a glance"), h("small", {}, "Per person, from what's planned · AI estimates")),
      h("div", { class: "wk-grid" },
        tile("fire", kcal ? kcal.toLocaleString() : "—", "kcal a day"),
        tile("bars", protein ? `${protein} g` : "—", "protein a day"),
        tile("leaf", `${veg} of ${recipes.length}`, veg === 1 ? "meal is meat-free" : "meals meat-free"),
        tile("check", `${cooked} of ${planned.length}`, "cooked so far")),
      kcal ? h("div", { class: "wk-split", role: "img", "aria-label": `Calories: ${pct("p")}% protein, ${pct("c")}% carbs, ${pct("f")}% fat` },
        ["p", "c", "f"].map((k) => h("i", { class: k, style: { width: `${pct(k)}%` } }))) : null,
      kcal ? h("div", { class: "wk-legend", "aria-hidden": "true" }, h("span", { class: "p" }, `Protein ${pct("p")}%`), h("span", { class: "c" }, `Carbs ${pct("c")}%`), h("span", { class: "f" }, `Fat ${pct("f")}%`)) : null,
      tip ? h("p", { class: "wk-tip" }, hi("sparkle"), tip) : null);
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
        h("button", { class: "pi-x", type: "button", "aria-label": `Move ${r.title} to another day`, title: "Move to another day", html: P.icon("calendar"), onClick: (ev) => moveMenu(ev.currentTarget, k, e, week) }),
        h("button", { class: "pi-x", type: "button", "aria-label": `Remove ${r.title}`, html: P.icon("x"), onClick: () => { const undo = P.plan.remove(k, e.u); P.toast(`Removed ${r.title}.`, { action: { label: "Undo", fn: undo } }); } }));
    };

    const dayEl = (d) => {
      const k = key(d), items = P.plan.on(k);
      const kcal = items.reduce((n, e) => n + (P.recipe(e.id)?.kcal || 0), 0);
      return h("section", { class: "plan-day" + (k === today ? " today" : "") + (k < today ? " past" : "") },
        h("div", { class: "plan-date" }, h("b", {}, d.toLocaleDateString(undefined, { weekday: "short" })), h("span", {}, String(d.getDate())), k === today ? h("em", {}, "Today") : null),
        h("div", { class: "plan-items" },
          items.map((e) => itemEl(k, e)),
          h("div", { class: "plan-day-foot" },
            h("button", { class: "plan-add", type: "button", onClick: () => picker(k) }, hi("plus"), items.length ? "Add another" : "Add a recipe"),
            kcal ? h("span", { class: "plan-kcal", title: "Calories per person for what's planned today (AI estimate)" }, hi("fire"), `${kcal.toLocaleString()} kcal`) : null)));
    };

    const addWeek = () => {
      const totals = new Map();
      for (const d of dates) for (const e of P.plan.on(key(d))) totals.set(e.id, (totals.get(e.id) || 0) + e.servings);
      for (const [id, servings] of totals) {
        const r = P.recipe(id), ticked = P.checked(id), f = servings / (r.serves || 4);
        P.shop.add(r, servings, r.ing.map((l, i) => (ticked.has(i) ? null : P.scaleLine(l, f))).filter(Boolean), P.prices.costsFor(r, f, (i) => !ticked.has(i)));     // ticked = already have it
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
        planned.length ? h("span", { class: "chip" }, hi("book"), P.plural(planned.length, "meal")) : null,
        (() => {                                               // the week's food, where you are
          if (!P.prices.show()) return null;
          const costs = planned.map((e) => P.prices.recipeCost(P.recipe(e.id), e.servings)?.total).filter((x) => x != null);
          return costs.length ? h("button", { class: "chip money", type: "button", title: `${P.prices.place()} prices, AI estimate`, onClick: () => P.prices.sheet() }, hi("coins"), `≈ ${P.prices.fmt(costs.reduce((a, b) => a + b, 0))}`) : null;
        })(),
        h("button", { class: "btn lime sm auto-btn", type: "button", onClick: () => autoPlan(dates) }, hi("sparkle"), "Plan it for me")),
      weekSummary(dates, planned),
      h("div", { class: "plan-days" }, dates.map(dayEl)),
      h("div", { class: "plan-foot" },
        h("button", { class: "btn lime", type: "button", disabled: !planned.length, onClick: addWeek }, hi("cart"), "Add this week to my shopping list"),
        planned.length ? h("button", { class: "btn ghost sm", type: "button", onClick: () => calendar(dates), title: "Download the week as a calendar file (.ics)" }, hi("calendar"), "Add to my calendar") : null,
        planned.length ? h("button", { class: "btn danger-ghost sm", type: "button", onClick: () => { const undo = P.plan.clearWeek(week); P.toast("Cleared the week.", { action: { label: "Undo", fn: undo } }); } }, hi("trash"), "Clear the week") : null,
        h("span", { class: "shopnote" }, planned.length ? "Ingredients you ticked on a recipe are left out." : "Plan a few dinners, then shop for all of them in one tap."))));
    // the week starts on Monday, so on a Friday the first thing on screen would be four empty past days
    if (fresh && isThisWeek) setTimeout(() => scroll.querySelector(".plan-day.today")?.scrollIntoView({ block: "start" }), 0);   // after renderDetail restores the scroll position
  };
})();
