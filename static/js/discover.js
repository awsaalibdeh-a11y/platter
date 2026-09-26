/* Platter — Discover: the front page. A recipe of the day, what's planned for today, and rows to browse: quick
   dinners, what's new, what you've cooked before, cuisines and diets. The picks are shuffled once a day (seeded by
   the date), so the page stays the same all day and changes tomorrow. */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });

  /* ---------- a shuffle that is the same all day ---------- */
  const seedOf = (s) => { let x = 2166136261; for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return x >>> 0; };
  const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const daily = (list, label, n) => {
    const rand = rng(seedOf(`${new Date().toDateString()}|${label}`));
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, n);
  };

  const meta = (r) => [r.min ? P.fmtMin(r.min) : "", r.level || "", r.kcal ? `${r.kcal} kcal` : ""].filter(Boolean).join(" · ");
  const open = (r) => P.go(P.pathFor({ tag: r.tag, id: r.id }));
  const MAINS = new Set(["chicken", "poultry", "beef", "seafood", "pork", "lamb", "vegetarian", "pasta", "mains", "soup", "salad"]);

  const card = (r) => h("button", { class: "dcard", type: "button", onClick: () => open(r), title: r.title },
    h("span", { class: "dcard-img" }, r.img ? h("img", { src: P.photo(r.img, "medium"), alt: "", loading: "lazy", decoding: "async", draggable: "false" }) : null,
      P.isFav(r.id) ? h("span", { class: "dcard-fav", html: P.icon("star") }) : null),
    h("span", { class: "dcard-t" }, r.title),
    h("span", { class: "dcard-m" }, meta(r) || P.tagName(r.tag)));

  /** A titled row of cards that scrolls sideways. */
  function row(title, list, more, sub) {
    if (!list.length) return null;
    const track = h("div", { class: "drow-track" }, list.map(card));
    const nudge = (d) => track.scrollBy({ left: d * track.clientWidth * 0.85, behavior: "smooth" });
    return h("section", { class: "drow" },
      h("div", { class: "drow-head" }, h("div", {}, h("h2", {}, title), sub ? h("small", {}, sub) : null),
        more ? h("button", { class: "textbtn", type: "button", onClick: more }, "See all") : null,
        h("span", { class: "drow-arrows" },
          h("button", { class: "ibtn sm", type: "button", "aria-label": "Scroll left", html: P.icon("chevron"), onClick: () => nudge(-1) }),
          h("button", { class: "ibtn sm", type: "button", "aria-label": "Scroll right", html: P.icon("chevronRight"), onClick: () => nudge(1) }))),
      track);
  }

  function hero(r) {
    return h("article", { class: "dhero" },
      h("button", { class: "dhero-img", type: "button", onClick: () => open(r), "aria-label": `Open ${r.title}` },
        r.img ? h("img", { src: P.photo(r.img), alt: "", decoding: "async", fetchpriority: "high" }) : null),
      h("div", { class: "dhero-body" },
        h("span", { class: "eyebrow" }, hi("sparkle"), "Recipe of the day"),
        h("h2", {}, r.title),
        r.about ? h("p", {}, r.about) : null,
        h("div", { class: "dhero-meta" },
          r.min ? h("span", {}, hi("clock"), P.fmtMin(r.min)) : null,
          r.level ? h("span", {}, hi("bars"), r.level) : null,
          r.kcal ? h("span", {}, hi("fire"), `${r.kcal} kcal`) : null,
          r.sub ? h("span", {}, hi("compass"), r.sub) : null),
        h("div", { class: "dhero-btns" },
          h("button", { class: "btn lime", type: "button", onClick: () => open(r) }, "View recipe", hi("chevronRight")),
          h("button", { class: "btn ghost", type: "button", onClick: () => P.stepper.open(r) }, hi("chefHat"), "Cook it now"),
          h("button", { class: "btn ghost", type: "button", onClick: (e) => P.plan.menu(e.currentTarget, r) }, hi("calendar"), "Plan it"))));
  }

  /** "Picked for you": what your favorites, ratings, cooking and browsing say you like (tags, cuisines, ingredients). */
  function pickedForYou(all) {
    const S = P.S, tagW = new Map(), subW = new Map(), ingW = new Map();
    const add = (id, weight) => {
      const r = P.recipe(id);
      if (!r || !weight) return;
      tagW.set(r.tag, (tagW.get(r.tag) || 0) + weight);
      if (r.sub) subW.set(r.sub, (subW.get(r.sub) || 0) + weight);
      for (const n of P.ingredientNames(r)) ingW.set(n, (ingW.get(n) || 0) + weight * 0.25);
    };
    Object.keys(S.fav).forEach((id) => add(id, 3));
    Object.entries(S.rate).forEach(([id, n]) => add(id, n >= 4 ? 3 : n <= 2 ? -2 : 0));
    Object.keys(S.made).forEach((id) => add(id, 2));
    S.recent.slice(0, 15).forEach((id) => add(id, 1));
    const signals = Object.keys(S.fav).length + Object.keys(S.made).length + Object.keys(S.rate).length + Math.min(S.recent.length, 15) / 3;
    if (signals < 2) return null;
    const known = new Set([...Object.keys(S.fav), ...Object.keys(S.made), ...S.recent.slice(0, 10)]);
    const scored = [];
    for (const r of all) {
      if (known.has(r.id)) continue;
      let s = (tagW.get(r.tag) || 0) + (r.sub ? (subW.get(r.sub) || 0) * 1.2 : 0);
      for (const n of P.ingredientNames(r)) s += ingW.get(n) || 0;
      if (s > 0) scored.push([s, r]);
    }
    const best = scored.sort((a, b) => b[0] - a[0]).slice(0, 40).map(([, r]) => r);
    const top = (m) => [...m].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
    const why = [top(subW), top(tagW) && P.tagName(top(tagW)).toLowerCase()].filter(Boolean);
    return { list: daily(best, "picked", 14), why: why.length ? `Because you like ${why.join(" and ")}` : "" };
  }

  /* ---------- in season ---------- */
  // where the seasons run the other way round: by the country prices use, or by the time zone
  const SOUTH = new Set(["AU", "NZ", "AR", "CL", "UY", "PY", "ZA", "BR", "PE", "BO", "NA", "BW", "LS", "SZ", "MZ", "ZW", "ZM", "MG", "MU", "FJ"]);
  const SEASONS = {
    spring: ["asparagus|peas|pea|spinach|spring onions?|radish(?:es)?|rhubarb|new potato(?:es)?|artichokes?|watercress|broad beans?|fava beans?|lettuce|mint|morels?|lamb", "asparagus, peas, spinach and new potatoes"],
    summer: ["tomato(?:es)?|courgettes?|zucchini|aubergines?|eggplants?|sweetcorn|corn on the cob|peach(?:es)?|strawberr(?:y|ies)|raspberr(?:y|ies)|blueberr(?:y|ies)|cherr(?:y|ies)|cucumbers?|bell peppers?|basil|watermelon|green beans?|apricots?", "tomatoes, courgettes, berries and sweetcorn"],
    autumn: ["pumpkins?|squash|butternut|apples?|pears?|mushrooms?|sweet potato(?:es)?|parsnips?|beets?|beetroots?|cauliflower|kale|chestnuts?|cranberr(?:y|ies)|figs?|plums?|brussels sprouts?|celeriac", "pumpkin, squash, apples and mushrooms"],
    winter: ["cabbages?|kale|leeks?|parsnips?|turnips?|swede|celeriac|oranges?|clementines?|satsumas?|blood oranges?|pomegranates?|brussels sprouts?|cauliflower|chestnuts?|red cabbage|lentils", "cabbage, leeks, citrus and root vegetables"],
  };
  const NOT_FRESH = /\b(?:vinegar|juice|sauce|stock|powder|extract|jam|jelly|ketchup|puree|paste|dried|canned|tinned)\b/;
  function season(now = new Date()) {
    const north = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"][now.getMonth()];
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* no time zone: assume north */ }
    const cc = P.S.prices?.cc || "";
    const south = cc ? SOUTH.has(cc) : /^(?:Australia|Pacific\/Auckland|America\/(?:Argentina|Santiago|Sao_Paulo|Montevideo|Asuncion|Lima|La_Paz)|Africa\/(?:Johannesburg|Maputo|Harare|Windhoek))/.test(tz);
    return south ? { winter: "summer", summer: "winter", spring: "autumn", autumn: "spring" }[north] : north;
  }
  /** Recipes built on what's at its best right now: a seasonal name counts twice in the title. */
  function inSeason(all) {
    const key = season();
    const re = new RegExp(`\\b(?:${SEASONS[key][0]})\\b`, "i");
    const scored = [];
    for (const r of all) {
      if (!MAINS.has(r.tag) && r.tag !== "desserts" && r.tag !== "sides") continue;
      let s = re.test(r.title) ? 2 : 0;
      for (const n of P.ingredientNames(r)) if (re.test(n) && !NOT_FRESH.test(n)) s++;
      if (s >= 2) scored.push([s + Math.random() * 0.01, r]);
    }
    const best = scored.sort((a, b) => b[0] - a[0]).slice(0, 60).map(([, r]) => r);
    return { key, blurb: SEASONS[key][1], list: daily(best, `season-${key}`, 14) };
  }

  /** The first time: four things worth trying, then out of the way for good. */
  function welcome() {
    if (P.S.ui.welcomed) return null;
    const tip = (ic, title, sub, fn) => h("button", { class: "wtip", type: "button", onClick: () => { fn(); } }, h("span", { class: "wtip-ic", html: P.icon(ic) }), h("b", {}, title), h("small", {}, sub));
    const card = h("section", { class: "welcome" },
      h("div", { class: "welcome-head" }, h("div", {}, h("h2", {}, "Welcome to Platter"), h("p", {}, "A recipe box that cooks with you. A few things to try first:")),
        h("button", { class: "btn ghost sm", type: "button", onClick: () => { P.S.ui.welcomed = true; P.save(); card.remove(); } }, "Got it")),
      h("div", { class: "wtips" },
        tip("camera", "Snap your fridge", "See what you can make with what you've got", () => P.go("pantry")),
        tip("leaf", "Set your diet", "Low fat, no milk, vegetarian… everything follows it", () => P.diet.sheet()),
        tip("calendar", "Plan your week", "Dinners picked for you, one tap to a shopping list", () => P.go("plan")),
        tip("search", "Search everything", matchMedia("(pointer: coarse)").matches ? "Recipes, tags and actions, all in one box" : "Recipes, tags and actions: press Ctrl K", () => P.palette.open())));
    return card;
  }

  P.panes.discover = (top, scroll, ctx) => {
    const all = P.diet.filter(P.recipes()).filter((r) => r.img);
    const hour = new Date().getHours();
    const hello = hour < 5 ? "Cooking late?" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

    const pickPool = all.filter((r) => MAINS.has(r.tag) && r.level !== "Hard" && (!P.lib.details || r.about));
    const [today] = daily(pickPool.length ? pickPool : all, "hero", 1);
    const planned = P.plan.on(P.plan.key(new Date())).map((e) => P.recipe(e.id)).filter(Boolean);
    const quick = daily(all.filter((r) => r.min && r.min <= 30 && MAINS.has(r.tag) && r.id !== today?.id), "quick", 14);
    const fresh = daily(all.filter((r) => +r.id >= 90001), "new", 14);
    const again = P.diet.filter(P.inTag("made")).filter((r) => r.img).slice(0, 14);
    const favs = daily(P.diet.filter(P.inTag("fav")).filter((r) => r.img), "fav", 14);
    const chicken = daily(P.diet.filter(P.inTag("chicken")).filter((r) => r.img), "chicken", 14);
    const priced = P.prices.show() ? all.filter((r) => MAINS.has(r.tag) && P.prices.perServing(r) != null).sort((a, b) => P.prices.perServing(a) - P.prices.perServing(b)) : [];
    const cheapCut = priced[Math.floor(priced.length / 5)];
    const cheap = cheapCut ? daily(priced.slice(0, Math.floor(priced.length / 5)), "cheap", 14) : [];
    const veg = daily(all.filter((r) => (r.diet || []).includes("vegetarian") && MAINS.has(r.tag)), "veg", 14);
    const sweet = daily(P.diet.filter(P.inTag("desserts")).filter((r) => r.img), "sweet", 14);

    const counts = {};
    for (const r of P.recipes()) if (r.sub) counts[r.sub] = (counts[r.sub] || 0) + 1;
    const cuisines = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([c]) => c).sort();
    const dietCount = (d) => P.recipes().filter((r) => (r.diet || []).includes(d)).length;
    const DIETS = [["vegetarian", "Vegetarian"], ["vegan", "Vegan"], ["gluten-free", "Gluten-free"], ["dairy-free", "Dairy-free"], ["spicy", "Spicy"]];

    const search = h("input", { class: "input dsearch-in", type: "search", placeholder: `Search ${P.recipes().length.toLocaleString()} recipes…`, "aria-label": "Search all recipes", enterkeyhint: "search" });
    search.addEventListener("keydown", (e) => { if (e.key === "Enter" && search.value.trim()) P.views.browse({}, search.value.trim()); });

    top.replaceChildren(
      h("span", { class: "tagpill ghost" }, "Discover"),
      h("div", { class: "acts" },
        h("button", { class: "btn ghost sm", type: "button", onClick: () => P.views.surprise() }, hi("shuffle"), "Surprise me"),
        h("button", { class: "editbtn", type: "button", onClick: ctx.close }, hi("check"), "Done")));

    scroll.replaceChildren(h("div", { class: "recipe discover" },
      h("header", { class: "dhead" },
        h("div", {}, h("h1", { class: "title" }, hello), h("p", { class: "lead" }, `What are we cooking today? ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}.`)),
        h("label", { class: "dsearch" }, hi("search"), search)),
      h("div", { class: "ddiet" }, hi("leaf"),
        P.diet.has() ? [h("span", {}, h("b", {}, "Your diet: "), P.diet.summary(), P.diet.active() ? "" : " (showing everything)"), h("button", { class: "textbtn", type: "button", onClick: () => P.diet.sheet() }, "Change")]
          : [h("span", {}, "Eat low fat, no milk, vegetarian…? "), h("button", { class: "textbtn", type: "button", onClick: () => P.diet.sheet() }, "Set your diet")],
        h("button", { class: "textbtn", type: "button", onClick: () => P.go("pantry") }, hi("camera"), "Snap your fridge")),
      welcome(),
      today ? hero(today) : null,
      planned.length ? h("section", { class: "dplan" },
        h("div", { class: "drow-head" }, h("h2", {}, "On your plan today"), h("button", { class: "textbtn", type: "button", onClick: () => P.go("plan") }, "Open the plan")),
        h("div", { class: "dplan-list" }, planned.map((r) => h("div", { class: "dplan-item" },
          h("button", { class: "pi-main", type: "button", onClick: () => open(r) },
            h("span", { class: "pi-thumb" }, r.img ? h("img", { src: P.photo(r.img, "small"), alt: "" }) : null), h("span", { class: "pi-title" }, r.title)),
          h("button", { class: "btn lime sm", type: "button", onClick: () => P.stepper.open(r) }, hi("chefHat"), "Start cooking"))))) : null,
      (() => {                                                         // food in the kitchen that is about to go off
        const going = P.pantry?.soon() || [];
        if (!going.length) return null;
        const list = P.pantry.rank(going.map((x) => x.t)).filter((x) => x.urgent.length && x.r.img).slice(0, 14).map((x) => x.r);
        return list.length ? row("Use it up before it goes off", list, () => P.go("pantry"), going.map((x) => `${x.t}: ${P.pantry.leftText(x.days)}`).join(" · ")) : null;
      })(),
      (() => { const p = pickedForYou(all); return p ? row("Picked for you", p.list, null, p.why) : null; })(),
      (() => { const s = inSeason(all); return s.list.length >= 4 ? row(`In season · ${s.key}`, s.list, null, `At their best right now: ${s.blurb}`) : null; })(),
      row("Quick weeknight dinners", quick, () => P.views.browse({ quick: true })),
      again.length ? row("Cook it again", again, () => P.go(P.pathFor({ tag: "made" }))) : null,
      favs.length ? row("Your favorites", favs, () => P.go(P.pathFor({ tag: "fav" }))) : null,
      cheap.length ? row(`Cheap eats · under ${P.prices.fmt(P.prices.perServing(cheapCut))} a serving`, cheap, () => { P.S.ui.sort = "cheap"; P.save(); P.views.browse({}); }) : null,
      row("New in Platter", fresh),
      P.books().length ? h("section", { class: "drow" }, h("div", { class: "drow-head" }, h("h2", {}, "Your cookbooks")),
        h("div", { class: "dchips" }, P.books().map((b) => h("button", { class: "ai-chip", type: "button", onClick: () => P.go(P.pathFor({ tag: b.id })) }, hi("bookmark"), b.name, h("em", {}, ` ${P.inTag(b.id).length}`))))) : null,
      h("section", { class: "drow" }, h("div", { class: "drow-head" }, h("h2", {}, "Around the world")),
        h("div", { class: "dchips" }, cuisines.map((c) => h("button", { class: "ai-chip", type: "button", onClick: () => P.views.browse({ sub: c }) }, c, h("em", {}, ` ${counts[c]}`))))),
      row("Chicken, every way", chicken, () => P.go(P.pathFor({ tag: "chicken" }))),
      h("section", { class: "drow" }, h("div", { class: "drow-head" }, h("h2", {}, "Eat your way")),
        h("div", { class: "dchips" },
          DIETS.map(([k, label]) => { const n = dietCount(k); return n ? h("button", { class: "ai-chip", type: "button", onClick: () => P.views.browse({ diet: k }) }, hi(k === "spicy" ? "fire" : "leaf"), label, h("em", {}, ` ${n}`)) : null; }),
          h("button", { class: "ai-chip", type: "button", onClick: () => P.views.browse({ easy: true }) }, hi("bars"), "Easy"),
          h("button", { class: "ai-chip", type: "button", onClick: () => P.views.browse({ quick: true }) }, hi("clock"), "Under 30 minutes"))),
      veg.length ? row("Meat-free and filling", veg, () => P.views.browse({ diet: "vegetarian" })) : null,
      row("Something sweet", sweet, () => P.go(P.pathFor({ tag: "desserts" }))),
      h("div", { class: "dfoot" },
        h("button", { class: "btn ghost", type: "button", onClick: () => P.go("pantry") }, hi("jar"), "What can I make with what I have?"),
        h("button", { class: "btn ghost", type: "button", onClick: () => P.go("ai") }, hi("sparkle"), "Ask AI for something new"),
        h("button", { class: "btn ghost", type: "button", onClick: () => P.go("stats") }, hi("chefHat"), "Your kitchen"))));
  };
})();
