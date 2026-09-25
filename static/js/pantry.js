/* Platter — "What can I make?": say what is in the kitchen, get the recipes that need the least shopping.

   Every ingredient line is reduced to its name with the same reader the shopping list uses, then matched
   against what was typed. A recipe scores by how many of its ingredients are already in the kitchen. */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });

  const COMMON = ["chicken", "rice", "eggs", "onion", "garlic", "tomato", "potato", "pasta", "lemon", "cheese", "spinach", "carrot",
    "mushroom", "beef", "pork", "salmon", "bell pepper", "broccoli", "cream", "coconut milk", "chickpeas", "beans", "bread", "yogurt"];

  /* ---------- reading names ---------- */
  const ALIASES = [
    [/\b(?:scallions?|green onions?)\b/g, "spring onion"], [/\bcilantro\b/g, "coriander"], [/\baubergines?\b/g, "eggplant"],
    [/\bcourgettes?\b/g, "zucchini"], [/\bprawns?\b/g, "shrimp"], [/\bcapsicums?\b/g, "bell pepper"], [/\bchill?(?:ies|is?|es|e)\b/g, "chili"],
    [/\bgarbanzos?\b/g, "chickpea"], [/\brocket\b/g, "arugula"], [/\byoghurt\b/g, "yogurt"], [/\bbeetroot\b/g, "beet"],
  ];
  const stem = (w) => {
    if (w.length < 4) return w;
    if (/ies$/.test(w)) return `${w.slice(0, -3)}y`;
    if (/(?:oes|ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
    if (/(?:ss|us|is)$/.test(w)) return w;
    return w.endsWith("s") ? w.slice(0, -1) : w;
  };
  const words = (text) => {
    let t = String(text).toLowerCase();
    for (const [re, to] of ALIASES) t = t.replace(re, to);
    return (t.match(/[a-z]+/g) || []).map(stem);
  };
  // "chicken" is not "chicken stock", and "tomato" is not "tomato paste"
  const NOT_THE_THING = new Set(["stock", "broth", "bouillon", "cube", "seasoning", "gravy", "powder", "salt", "extract", "flake", "sauce", "paste", "puree", "ketchup", "noodle"]);
  const STAPLE = /^(?:(?:freshly|fine|coarse|ground|cracked|black|white|kosher|sea|table|flaky|extra|virgin|light|plain|all[- ]purpose|unsalted|salted|granulated|caster|vegetable|olive|sunflower|canola|cooking|frying|neutral)\s+)*(?:salt|pepper|oil|sugar|flour|butter|water)(?:\s+and\s+pepper)?$/;
  const OPTIONAL = /\b(?:to taste|to serve|for serving|to garnish|for garnish|garnish|optional|for frying|for greasing|for dusting|for brushing|for the pan|as needed)\b/i;

  const PREP = new WeakMap();
  const prep = (r) => {
    let lines = PREP.get(r);
    if (!lines) {
      lines = r.ing.map((line) => {
        const name = P.shop.nameOf(line);
        const w = words(name);
        return { line, name, w: new Set(w), tail: w[w.length - 1] || "", staple: STAPLE.test(name), optional: OPTIONAL.test(line) };
      }).filter((l) => l.w.size);
      PREP.set(r, lines);
    }
    return lines;
  };
  /** The ingredients a recipe really turns on (salt, oil and the like left out): what "You might also like" compares. */
  P.ingredientNames = (r) => new Set(prep(r).filter((l) => !l.staple && !l.optional).map((l) => l.name));
  const matches = (termWords, line) => termWords.every((w) => line.w.has(w)) && !(NOT_THE_THING.has(line.tail) && !termWords.includes(line.tail));

  /** Every recipe that uses at least one of the terms, the ones that need the least shopping first. */
  function rank(terms, staples) {
    const tws = terms.map((t) => ({ t, w: words(t) })).filter((x) => x.w.length);
    if (!tws.length) return [];
    const coll = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    const out = [];
    for (const r of P.diet.filter(P.recipes())) {
      const lines = prep(r).filter((l) => !l.optional);
      if (!lines.length) continue;
      let have = 0;
      const hit = new Set(), missing = [];
      for (const l of lines) {
        const m = tws.find((x) => matches(x.w, l));
        if (m) { have++; hit.add(m.t); }
        else if (staples && l.staple) have++;
        else missing.push(l);
      }
      if (hit.size) out.push({ r, have, total: lines.length, missing, all: hit.size === tws.length });
    }
    return out.sort((a, b) => b.all - a.all || b.have / b.total - a.have / a.total || a.missing.length - b.missing.length || coll.compare(a.r.title, b.r.title));
  }

  /* ---------- the pane ---------- */
  let shown = 30;
  let fridge = null;                                                     // the last photo: { image, items, note }                                                        // how many results are on screen

  P.panes.pantry = (top, scroll, ctx) => {
    const S = P.S.pantry;
    const live = {};

    top.replaceChildren(
      h("span", { class: "tagpill ghost" }, "What can I make?"),
      h("div", { class: "acts" }, h("button", { class: "editbtn", type: "button", onClick: ctx.close }, hi("check"), "Done")));

    const add = (text) => {
      let n = 0;
      for (const part of String(text).split(/[,;\n]+/)) {
        const t = part.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 30);
        if (t && !S.have.includes(t)) { S.have.push(t); n++; }
      }
      if (n) { shown = 30; P.save(); paint(); }
    };
    const drop = (t) => { S.have = S.have.filter((x) => x !== t); shown = 30; P.save(); paint(); };

    const input = h("input", { class: "input", placeholder: "chicken, rice, lemon…", "aria-label": "Add an ingredient you have", enterkeyhint: "done", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
    const commit = () => { if (input.value.trim()) { add(input.value); input.value = ""; } };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
      else if (e.key === "Backspace" && !input.value && S.have.length) drop(S.have[S.have.length - 1]);
    });
    input.addEventListener("paste", () => setTimeout(commit, 0));

    live.have = h("div", { class: "pan-have" });
    live.fridge = h("div", { class: "fridge-card-wrap" });
    const snap = () => P.aitools.fridge((d) => {
      fridge = d;
      if (d.items.length) add(d.items.join(","));
      paintFridge();
      P.toast(d.items.length ? `Spotted ${P.plural(d.items.length, "thing")} in your photo and added them.` : "I couldn't spot any food in that photo.", { ms: 4000 });
    });
    const paintFridge = () => live.fridge.replaceChildren(...(fridge ? [h("div", { class: "fridge-card" },
      h("img", { src: fridge.image, alt: "Your photo" }),
      h("div", {},
        h("b", {}, fridge.items.length ? `Seen in your photo: ${P.plural(fridge.items.length, "thing")}` : "No food spotted in your photo"),
        fridge.note ? h("p", {}, fridge.note) : null,
        h("div", { class: "fridge-acts" },
          fridge.items.length ? h("button", { class: "btn lime sm", type: "button", onClick: () => P.views.openAI(`Something for dinner using what's in my fridge: ${fridge.items.join(", ")}`) }, hi("sparkle"), "Ask AI for dishes") : null,
          h("button", { class: "textbtn", type: "button", onClick: () => { fridge = null; paintFridge(); } }, "Hide"))))] : []));
    paintFridge();
    live.quick = h("div", { class: "ai-chips" });
    live.head = h("div", { class: "pan-head" });
    live.list = h("div", { class: "pan-list" });
    live.more = h("div", { class: "ai-more" });

    const staples = h("button", { class: "switch", type: "button", role: "switch", "aria-checked": String(S.staples), "aria-label": "I always have the basics", onClick: () => {
      S.staples = !S.staples; staples.setAttribute("aria-checked", String(S.staples)); P.save(); paint();
    } });

    function card(x) {
      const { r } = x;
      const pct = Math.round((x.have / x.total) * 100);
      const inList = P.shop.has(r.id);
      const names = x.missing.map((l) => l.name);
      const addMissing = () => {
        const f = P.scaleOf(r) / (r.serves || 4);
        const res = P.shop.add(r, P.scaleOf(r), x.missing.map((l) => P.scaleLine(l.line, f)));
        P.toast(`Added the ${P.plural(res.added, "missing item")} for ${r.title}.`, { action: { label: "View", fn: () => P.go("shop") } });
        paint();
      };
      return h("article", { class: "pcard" },
        h("button", { class: "pcard-main", type: "button", onClick: () => P.go(P.pathFor({ tag: r.tag, id: r.id })), title: "Open the recipe" },
          h("span", { class: "pcard-thumb" }, r.img ? h("img", { src: P.photo(r.img, "small"), alt: "", loading: "lazy", decoding: "async", draggable: "false" }) : null),
          h("span", { class: "pcard-body" },
            h("span", { class: "pcard-title" }, r.title),
            h("span", { class: "pcard-meta" }, [P.tagName(r.tag), r.min ? P.fmtMin(r.min) : ""].filter(Boolean).join(" · ")),
            h("span", { class: "meter", "aria-hidden": "true" }, h("i", { style: { width: `${Math.max(6, pct)}%` } })),
            h("span", { class: "pcard-have" }, `You have ${x.have} of ${x.total}`,
              x.all && S.have.length > 1 ? h("em", {}, " · uses everything you picked") : null),
            names.length ? h("span", { class: "pcard-miss" }, `Missing: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}`) : h("span", { class: "pcard-miss ok" }, "You have everything"))),
        names.length
          ? (inList ? h("span", { class: "pcard-act on" }, hi("check"), "On your list")
            : h("button", { class: "pcard-act", type: "button", onClick: addMissing, title: "Put what you're missing on the shopping list" }, hi("cart"), "Add missing"))
          : null);
    }

    const put = (el, ...kids) => el.replaceChildren(...kids.flat().filter(Boolean));     // replaceChildren(null) would print "null"

    function paint() {
      const terms = S.have;
      put(live.have,
        terms.map((t) => h("button", { class: "fchip", type: "button", "aria-label": `Remove ${t}`, onClick: () => drop(t) }, t, hi("x"))),
        terms.length ? h("button", { class: "linkbtn show", type: "button", onClick: () => { S.have = []; P.save(); paint(); } }, "Clear all") : null);
      live.have.hidden = !terms.length;
      put(live.quick, COMMON.map((c) => {
        const on = terms.includes(c);
        return h("button", { class: "ai-chip" + (on ? " on" : ""), type: "button", "aria-pressed": String(on), onClick: () => (on ? drop(c) : add(c)) }, c);
      }));

      const results = rank(terms, S.staples);
      if (!terms.length) {
        put(live.head);
        put(live.list, h("div", { class: "blank inline" }, hi("jar"), h("p", {}, "What's in your kitchen?"),
          h("p", { class: "sub" }, "Type an ingredient above, or tap a few of the common ones.")));
        put(live.more);
        return;
      }
      const usesAll = results.filter((x) => x.all).length;
      put(live.head,
        h("span", { class: "section-h" }, results.length ? `${P.plural(results.length, "recipe")} to try` : "No recipe uses those"),
        results.length && terms.length > 1 ? h("span", { class: "count-note" }, `${usesAll} use everything you picked`) : null,
        h("button", { class: "textbtn", type: "button", onClick: () => P.views.openAI(`Dinner using ${terms.join(", ")}`) }, hi("sparkle"), "Ask AI for ideas with these"));
      put(live.list, results.length ? results.slice(0, shown).map(card)
        : h("div", { class: "blank inline" }, hi("jar"), h("p", {}, "Nothing in your library uses those."), h("p", { class: "sub" }, "Try fewer ingredients, or ask AI to invent something.")));
      put(live.more, results.length > shown ? h("button", { class: "btn ghost", type: "button", onClick: () => { shown += 30; paint(); } }, `Show more (${results.length - shown} left)`) : null);
    }

    scroll.replaceChildren(h("div", { class: "recipe pantry" },
      h("h1", { class: "title" }, "What can I make?"),
      h("p", { class: "lead" }, "Add what's in your kitchen. Every recipe in your library is ranked by how much of it you already have, so you shop for as little as possible."),
      h("div", { class: "pan-add" }, input, h("button", { class: "btn lime", type: "button", onClick: commit }, hi("plus"), "Add")),
      h("div", { class: "fridge-row" },
        h("button", { class: "btn fridge-btn", type: "button", onClick: snap }, hi("camera"), "Snap your fridge"),
        h("span", {}, "Take a photo of your fridge or cupboard: AI spots the food in it and adds it here.")),
      live.fridge,
      live.have, live.quick,
      h("div", { class: "pan-staples" }, staples, h("span", {}, "I always have salt, pepper, oil, water, sugar, flour and butter")),
      live.head, live.list, live.more));
    paint();
    if (!P.isNarrow() && !S.have.length) requestAnimationFrame(() => input.focus({ preventScroll: true }));
  };
})();
