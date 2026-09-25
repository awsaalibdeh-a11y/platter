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
  function row(title, list, more) {
    if (!list.length) return null;
    const track = h("div", { class: "drow-track" }, list.map(card));
    const nudge = (d) => track.scrollBy({ left: d * track.clientWidth * 0.85, behavior: "smooth" });
    return h("section", { class: "drow" },
      h("div", { class: "drow-head" }, h("h2", {}, title),
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

  P.panes.discover = (top, scroll, ctx) => {
    const all = P.recipes().filter((r) => r.img);
    const hour = new Date().getHours();
    const hello = hour < 5 ? "Cooking late?" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

    const pickPool = all.filter((r) => MAINS.has(r.tag) && r.level !== "Hard" && (!P.lib.details || r.about));
    const [today] = daily(pickPool.length ? pickPool : all, "hero", 1);
    const planned = P.plan.on(P.plan.key(new Date())).map((e) => P.recipe(e.id)).filter(Boolean);
    const quick = daily(all.filter((r) => r.min && r.min <= 30 && MAINS.has(r.tag) && r.id !== today?.id), "quick", 14);
    const fresh = daily(all.filter((r) => +r.id >= 90001), "new", 14);
    const again = P.inTag("made").filter((r) => r.img).slice(0, 14);
    const favs = daily(P.inTag("fav").filter((r) => r.img), "fav", 14);
    const chicken = daily(P.inTag("chicken").filter((r) => r.img), "chicken", 14);
    const veg = daily(all.filter((r) => (r.diet || []).includes("vegetarian") && MAINS.has(r.tag)), "veg", 14);
    const sweet = daily(P.inTag("desserts").filter((r) => r.img), "sweet", 14);

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
      today ? hero(today) : null,
      planned.length ? h("section", { class: "dplan" },
        h("div", { class: "drow-head" }, h("h2", {}, "On your plan today"), h("button", { class: "textbtn", type: "button", onClick: () => P.go("plan") }, "Open the plan")),
        h("div", { class: "dplan-list" }, planned.map((r) => h("div", { class: "dplan-item" },
          h("button", { class: "pi-main", type: "button", onClick: () => open(r) },
            h("span", { class: "pi-thumb" }, r.img ? h("img", { src: P.photo(r.img, "small"), alt: "" }) : null), h("span", { class: "pi-title" }, r.title)),
          h("button", { class: "btn lime sm", type: "button", onClick: () => P.stepper.open(r) }, hi("chefHat"), "Start cooking"))))) : null,
      row("Quick weeknight dinners", quick, () => P.views.browse({ quick: true })),
      again.length ? row("Cook it again", again, () => P.go(P.pathFor({ tag: "made" }))) : null,
      favs.length ? row("Your favorites", favs, () => P.go(P.pathFor({ tag: "fav" }))) : null,
      row("New in Platter", fresh),
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
        h("button", { class: "btn ghost", type: "button", onClick: () => P.go("ai") }, hi("sparkle"), "Ask AI for something new"))));
  };
})();
