/* Platter — the shopping list: what goes in, how lines merge, and the pane that shows it.

   The list stores *recipes*. Each contributes the ingredient lines it was added with, already
   scaled to the servings you chose, and what you see is worked out from them on demand — 2 cloves
   of garlic from one dish and 4 from another become 6. That is why taking a recipe off just works:
   there is no merged total to pull apart. */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });
  const S = () => P.S.shop;
  // what nearly every kitchen already has: not worth a line on the list
  const BASICS = /^(?:(?:fine|coarse|ground|freshly ground|cracked|black|white|kosher|sea|table|flaky|cold|hot|warm|boiling)\s+)*(?:salt|pepper|peppercorns?|salt and pepper|water|ice|ice cubes|(?:vegetable|olive|extra virgin olive|cooking|sunflower|canola|neutral|frying|rapeseed)\s+oil|oil)$/;

  /* ---------- reading a line ---------- */
  // how it's bought, not what it is: "finely chopped fresh parsley" is parsley. ("Crushed" stays: crushed tomatoes are their own tin.)
  const SIZE_WORDS = /^(?:(?:large|medium|small|big|fresh|freshly|ripe|whole|boneless|skinless|raw|cooked|dried|frozen|canned|tinned|organic|extra|minced|chopped|diced|sliced|grated|finely|roughly|coarsely|thinly|peeled|shredded|softened|melted|toasted|beaten|cubed|halved|quartered|trimmed|packed|sifted|crumbled)\s+)+/i;
  const IRREGULAR = { leaves: "leaf", loaves: "loaf", knives: "knife", halves: "half" };
  const ES_WORDS = new Set(["tomato", "potato", "mango", "hero", "echo"]);
  const UNCOUNTABLE = new Set(["garlic", "rice", "flour", "sugar", "salt", "butter", "milk", "water", "oil", "cheese", "cream", "honey", "pepper", "ginger", "bread", "pasta", "meat", "fish", "chicken", "beef", "pork", "lamb", "broccoli", "spinach", "lettuce", "parsley", "cilantro", "basil", "mint", "thyme", "dill", "rosemary", "yogurt", "vinegar", "wine", "stock", "broth"]);

  const singularWord = (w) => {
    if (IRREGULAR[w]) return IRREGULAR[w];
    if (w.length < 4 || /(?:us|ss|is)$/.test(w)) return w;
    if (/ies$/.test(w)) return `${w.slice(0, -3)}y`;
    if (/(?:oes|ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
    return w.endsWith("s") ? w.slice(0, -1) : w;
  };
  const pluralWord = (w) => {
    if (/s$/.test(w) || UNCOUNTABLE.has(w)) return w;
    if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ies`;
    if (ES_WORDS.has(w) || /(?:ch|sh|x|z)$/.test(w)) return `${w}es`;
    return `${w}s`;
  };
  const withLastWord = (name, fn) => name.replace(/(\S+)$/, (w) => fn(w));

  // "boneless, skinless chicken thighs, cubed" is one ingredient with a comma inside its name, not "boneless" plus a note
  const DESCRIPTOR_COMMA = /\b(boneless|skinless|skin-on|bone-in|large|medium|small|fresh|ripe|firm|whole|unsalted|salted|lean|thick|thin|dry|dried)\s*,\s*(?=[a-z])/gi;
  const cleanName = (rest) => {
    let n = rest.replace(/\([^)]*\)/g, " ").replace(DESCRIPTOR_COMMA, "$1 ").split(",")[0];
    n = n.replace(/^of\s+/i, "").replace(/\s+/g, " ").trim().toLowerCase();
    return n.replace(SIZE_WORDS, "");
  };

  // units that can be added to each other, expressed in the family's smallest unit
  const FAMILY = {
    teaspoon: ["vol", 1], tsp: ["vol", 1], tablespoon: ["vol", 3], tbsp: ["vol", 3], tbs: ["vol", 3], tbls: ["vol", 3], tblsp: ["vol", 3], cup: ["vol", 48],
    ml: ["ml", 1], cl: ["ml", 10], dl: ["ml", 100], l: ["ml", 1000], litre: ["ml", 1000], liter: ["ml", 1000],
    g: ["g", 1], mg: ["g", 0.001], kg: ["g", 1000],
    oz: ["oz", 1], ounce: ["oz", 1], lb: ["oz", 16], lbs: ["oz", 16], pound: ["oz", 16],
  };
  const DISPLAY = {
    // cups once it is a fraction a measuring cup actually has (¼ ⅓ ½ ⅔ ¾ …), else tablespoons: 12 tbsp reads as ¾ cup, 5 tbsp stays 5 tbsp
    vol: (t) => {
      const c = t / 48;
      const nice = t >= 12 && (Math.abs(c * 8 - Math.round(c * 8)) < 0.05 || Math.abs(c * 3 - Math.round(c * 3)) < 0.05);
      return nice ? [c, "cup", "cups"] : t >= 3 ? [t / 3, "tbsp", "tbsp"] : [t, "tsp", "tsp"];
    },
    ml: (t) => (t >= 1000 ? [t / 1000, "l", "l"] : [t, "ml", "ml"]),
    g: (t) => (t >= 1000 ? [t / 1000, "kg", "kg"] : [t, "g", "g"]),
    oz: (t) => (t >= 16 ? [t / 16, "lb", "lb"] : [t, "oz", "oz"]),
  };
  const TIGHT = new Set(["ml", "l", "g", "kg"]);

  /** One ingredient line → what it is, how much, and which family of unit it is measured in. */
  const read = (line) => {
    let raw = String(line).trim();
    const juice = /^(?:juice|zest)(?:\s+and\s+juice)?\s+of\s+(.+)$/i.exec(raw);
    if (juice) raw = juice[1];                                                   // "juice of 2 lemons" → 2 lemons
    const pinch = /^(?:a|an|some|a few|few)\s+(?:pinch|dash|splash|handful|knob|drizzle|sprinkling|bunch|squeeze|glug|sprig|twist)(?:es|s)?\s+of\s+(.+)$/i.exec(raw);
    if (pinch) return { q: null, name: cleanName(pinch[1]), fam: "none" };
    const p = P.parseLine(raw);
    if (!p) return { q: null, name: cleanName(raw), fam: "none" };
    const name = cleanName(p.rest);
    const size = (/^\(([^)]{1,20})\)/.exec(p.rest) || [])[1] || "";
    const q = p.q2 != null ? Math.max(p.q, p.q2) : p.q;                          // a range: buy for the top of it
    if (p.unit) {
      const f = FAMILY[p.unit.one];
      return f ? { q, name, size, fam: f[0], mult: f[1] } : { q, name, size, fam: `u:${p.unit.one}`, mult: 1, unitOne: p.unit.one };
    }
    return { q, name, size, fam: "count", mult: 1 };
  };
  const keyOf = (it) => `${withLastWord(it.name, singularWord)}|${it.fam}`;
  const keyForLine = (line) => { const it = read(line); return it.name ? keyOf(it) : ""; };

  /* ---------- aisles ---------- */
  const AISLES = ["Produce", "Meat & fish", "Dairy & eggs", "Bakery & grains", "Pantry", "Spices", "Other"];
  const AISLE_RULES = [
    ["Pantry", /\b(?:oyster sauce|hoisin|teriyaki|(?:sweet )?chill?i sauce|bbq sauce|barbecue sauce|stock|broth|bouillon|(?:coconut|almond|soy|oat|rice) milk|peanut butter|almond butter|tomato (?:paste|puree|sauce)|soy sauce|fish sauce|hot sauce|worcestershire|vinegar|(?:black|kidney|pinto|cannellini|butter|white|baked|refried|red|borlotti) beans?|canned|tinned)\b/],
    ["Spices", /\b(?:salt|black pepper|white pepper|peppercorn|cumin|paprika|cinnamon|oregano|turmeric|cayenne|nutmeg|cardamom|garam|curry powder|curry paste|masala|saffron|allspice|bay leaf|bay leaves|star anise|za'atar|five[- ]spice|seasoning|spice|chili powder|chilli powder|chili flakes|red pepper flakes|ground (?:cumin|coriander|cinnamon|ginger|pepper|nutmeg|cloves?|turmeric|paprika|mustard|cardamom)|dried (?:oregano|thyme|basil|parsley|chili|chilli|herbs|mint|sage|rosemary|dill)|(?:garlic|onion|curry|chili|chilli|cayenne) powder|(?:cumin|coriander|fennel|mustard|caraway) seeds?)\b/],
    ["Meat & fish", /\b(?:chicken|beef|pork|lamb|turkey|duck|bacon|ham|sausage|chorizo|salami|prosciutto|mince|steak|brisket|ribs?|veal|venison|goat|fish|salmon|tuna|cod|haddock|trout|sea bass|snapper|tilapia|prawns?|shrimps?|crab|lobster|scallops?|mussels?|clams?|oysters?|squid|calamari|anchov(?:y|ies)|sardines?|mackerel|gammon|oxtail)\b/],
    ["Dairy & eggs", /\b(?:milk|butter|cream|cheese|yogh?urt|eggs?|parmesan|mozzarella|cheddar|feta|ricotta|mascarpone|halloumi|paneer|ghee|buttermilk|creme fraiche|crème fraîche)\b/],
    ["Bakery & grains", /\b(?:bread|buns?|rolls?|tortillas?|pita|naan|flatbread|wraps?|baguette|croissants?|flour|rice|pasta|spaghetti|noodles?|macaroni|lasagn\w*|couscous|quinoa|oats?|barley|bulgur|polenta|cornmeal|breadcrumbs?|panko|crackers?|cereal|granola|yeast|semolina|orzo|penne|fettuccine|linguine)\b/],
    ["Produce", /\b(?:onions?|shallots?|garlic|ginger|tomato(?:es)?|potato(?:es)?|carrots?|celery|lettuce|spinach|kale|cabbage|broccoli|cauliflower|peppers?|chill?is?|jalape\w+|cucumbers?|zucchini|courgettes?|aubergines?|eggplants?|mushrooms?|avocados?|lemons?|limes?|oranges?|apples?|bananas?|berr(?:y|ies)|grapes?|mangos?|pineapple|peach(?:es)?|pears?|plums?|cherr(?:y|ies)|melon|basil|parsley|cilantro|coriander|mint|dill|rosemary|thyme|sage|chives?|scallions?|spring onions?|leeks?|corn|peas?|beetroot|beets?|radish(?:es)?|turnips?|squash|pumpkin|asparagus|fennel|herbs?|arugula|rocket|watercress|bok choy|pak choi|lemongrass|sprouts?|okra|plantains?|sweet potato(?:es)?|greens|beans)\b/],
    ["Pantry", /\b(?:oil|sauce|paste|sugar|honey|syrup|molasses|jam|mustard|ketchup|mayo|mayonnaise|tins?|cans?|chickpeas?|lentils?|passata|nuts?|almonds?|walnuts?|pecans?|cashews?|peanuts?|pistachios?|seeds?|tahini|miso|sriracha|cornstarch|cornflour|baking|vanilla|cocoa|chocolate|raisins?|dates?|olives?|capers?|pickles?|wine|beer|rum|brandy|whisky|water|gelatin|tofu)\b/],
  ];
  const aisleOf = (name) => (AISLE_RULES.find(([, re]) => re.test(name)) || ["Other"])[0];

  /* ---------- merging ---------- */
  /** How much, and what: { qty: "10 oz", name: "bean sprouts" }. */
  const partsOf = (e) => {
    if (!e.hasQty) return { qty: "", name: e.name };
    let qty = e.total, unit = "", tight = false;
    if (DISPLAY[e.fam]) {
      const [v, one, many] = DISPLAY[e.fam](e.total);
      qty = v; unit = v > 1.0001 ? many : one; tight = TIGHT.has(one);
    } else if (e.fam.startsWith("u:")) {
      const u = P.units[e.unitOne];
      unit = u ? (qty > 1.0001 ? u.many : u.one) : e.unitOne;
    }
    const name = !unit && qty > 1.0001 ? withLastWord(e.name, pluralWord) : e.name;
    return { qty: `${P.fmtQty(qty)}${tight ? unit : unit ? ` ${unit}` : ""}${e.size ? ` (${e.size})` : ""}`, name };
  };
  const textOf = (e) => { const p = partsOf(e); return `${p.qty} ${p.name}`.replace(/\s+/g, " ").trim(); };
  /** One food measured two ways (by weight in one recipe, by the cup in another) is still one line: "10 oz + 1 cup bean sprouts". */
  const joinedText = (es) => (es.every((e) => e.hasQty && e.fam !== "count")
    ? `${es.map((e) => partsOf(e).qty).join(" + ")} ${es[0].name}`
    : es.map(textOf).join(" + "));

  const collect = () => {
    const map = new Map();
    const put = (line, source, usd) => {
      const it = read(line);
      if (!it.name) return;
      const key = keyOf(it);
      let e = map.get(key);
      if (!e) map.set(key, (e = { key, name: it.name, size: it.size, fam: it.fam, unitOne: it.unitOne, total: 0, hasQty: false, from: new Set() }));
      if (it.q != null) { e.hasQty = true; e.total += it.q * (it.mult || 1); }
      if (usd != null && P.prices?.show()) e.cost = (e.cost || 0) + P.prices.here(usd, line);     // what it costs where you are
      e.from.add(source);
    };
    for (const r of S().recipes) r.lines.forEach((line, i) => put(line, r.title, r.c ? r.c[i] : null));
    for (const x of S().extra) put(x.text, "Added by you");
    return map;
  };

  /* ---------- the API the rest of the app uses ---------- */
  const touch = () => { P.save(); P.emit("shop"); };
  const snapshot = () => JSON.stringify(S());
  const restore = (snap) => { Object.assign(S(), JSON.parse(snap)); touch(); };

  P.shop = {
    has: (id) => S().recipes.some((r) => r.id === id),
    recipes: () => S().recipes,
    /** What an ingredient line is called ("2 cloves garlic, minced" → "garlic"): what the pantry finder matches on. */
    nameOf: (line) => read(line).name,
    aisleOfName: (name) => aisleOf(name),

    /** Kitchen basics (salt, pepper, oil, water) left off the list, when that's on. */
    basicsHidden() { return S().basics === false ? 0 : [...collect().values()].filter((e) => !S().hidden[e.key] && BASICS.test(e.name)).length; },
    toggleBasics() { S().basics = S().basics === false; touch(); },
    sections() {
      const skipBasics = S().basics !== false;
      const groups = new Map();
      for (const e of collect().values()) {
        if (S().hidden[e.key] || (skipBasics && BASICS.test(e.name))) continue;
        const k = withLastWord(e.name, singularWord);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(e);
      }
      const items = [...groups.values()].map((es) => {
        const keys = es.map((e) => e.key);
        return {
          key: keys[0], keys, name: es[0].name, text: es.length > 1 ? joinedText(es) : textOf(es[0]), aisle: aisleOf(es[0].name),
          done: keys.every((k) => S().done[k]), from: [...new Set(es.flatMap((e) => [...e.from]))],
          cost: es.some((e) => e.cost != null) ? es.reduce((n, e) => n + (e.cost || 0), 0) : null,
        };
      });
      const by = {};
      for (const it of items) (by[it.aisle] ||= []).push(it);
      return AISLES.filter((a) => by[a]).map((a) => ({ aisle: a, items: by[a].sort((x, y) => x.name.localeCompare(y.name)) }));
    },
    count() { return this.sections().reduce((n, s) => n + s.items.filter((i) => !i.done).length, 0); },

    /** Put a recipe's (already scaled) lines on the list; adding it again updates it. */
    add(recipe, servings, lines, costs) {
      const list = S().recipes;
      const i = list.findIndex((x) => x.id === recipe.id);
      const entry = { id: recipe.id, title: recipe.title, servings, lines, at: Date.now() };
      if (costs && costs.length === lines.length) entry.c = costs.map((x) => Math.round(x * 100) / 100);     // US dollars, per line
      if (i >= 0) list[i] = entry; else list.push(entry);
      for (const line of lines) {                                               // bring back anything you had cleared
        const k = keyForLine(line);
        delete S().hidden[k];
        delete S().done[k];
      }
      touch();
      return { updated: i >= 0, added: lines.length };
    },
    removeRecipe(id) { const snap = snapshot(); S().recipes = S().recipes.filter((r) => r.id !== id); touch(); return () => restore(snap); },
    addExtra(text) {
      for (const part of String(text).split(/[,;\n]+/).map((t) => t.trim()).filter(Boolean)) {
        S().extra.push({ id: `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, text: part.slice(0, 80) });
        const k = keyForLine(part);
        delete S().hidden[k];
        delete S().done[k];
      }
      touch();
    },
    /** Tick or untick a line; a line made of several (one food, two units) moves as one. */
    toggle(key) {
      const keys = [].concat(key), on = !keys.every((k) => S().done[k]);
      for (const k of keys) { if (on) S().done[k] = 1; else delete S().done[k]; }
      touch();
    },
    hide(key) { const snap = snapshot(); for (const k of [].concat(key)) { S().hidden[k] = 1; delete S().done[k]; } touch(); return () => restore(snap); },
    clearDone() {
      const snap = snapshot();
      for (const key of Object.keys(S().done)) { S().hidden[key] = 1; }
      S().done = {};
      touch();
      return () => restore(snap);
    },
    clearAll() { const snap = snapshot(); Object.assign(S(), { recipes: [], extra: [], done: {}, hidden: {} }); touch(); return () => restore(snap); },

    /** What you ticked goes into "What can I make?" and off the list: the kitchen knows what you just bought. */
    toKitchen() {
      const ticked = this.sections().flatMap((s) => s.items).filter((i) => i.done);
      if (!ticked.length) return null;
      const snap = snapshot(), pantry = JSON.stringify(P.S.pantry);
      const have = P.S.pantry.have;
      let added = 0;
      for (const it of ticked) {
        const t = it.name.toLowerCase().slice(0, 30), one = withLastWord(t, singularWord);
        if (t && !have.some((x) => withLastWord(x, singularWord) === one)) { have.push(t); added++; }
        for (const k of it.keys) { S().hidden[k] = 1; delete S().done[k]; }
      }
      touch();
      return { added, moved: ticked.length, undo: () => { Object.assign(P.S.pantry, JSON.parse(pantry)); restore(snap); } };
    },

    text() {
      const out = ["Shopping list"];
      for (const sec of this.sections()) {
        out.push("", sec.aisle.toUpperCase());
        for (const it of sec.items) out.push(`${it.done ? "[x]" : "[ ]"} ${it.text}`);
      }
      return out.join("\n");
    },
  };

  /* ---------- shop mode: big rows, what's left first, the screen stays on ---------- */
  let shopping = false, lock = null;
  const wake = async (on) => {
    try {
      if (on && !lock && "wakeLock" in navigator && document.visibilityState === "visible") { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); }
      if (!on && lock) { await lock.release(); lock = null; }
    } catch { lock = null; }                                            // no wake lock here (or battery saver): shop mode still works
  };
  document.addEventListener("visibilitychange", () => { if (shopping && P.route.mode === "shop") wake(true); });
  P.on("route", () => { if (P.route.mode !== "shop" && shopping) { shopping = false; wake(false); } });

  /* ---------- the pane ---------- */
  P.panes.shop = (top, scroll, ctx) => {
    const secs = P.shop.sections();
    if (shopping) for (const sec of secs) sec.items.sort((a, b) => a.done - b.done);      // what's left to find comes first
    const setShopping = (on) => { shopping = on; wake(on); P.emit("shop"); };
    const all = secs.flatMap((s) => s.items);
    const open = all.filter((i) => !i.done).length;
    const done = all.length - open;
    const recipes = P.shop.recipes();
    const btn = (icon, label, fn) => h("button", { class: "abtn", type: "button", title: label, "aria-label": label, html: P.icon(icon), onClick: fn });

    const share = async () => {
      const text = P.shop.text();
      if (navigator.share) { try { await navigator.share({ title: "Shopping list", text }); return; } catch (e) { if (e.name === "AbortError") return; } }
      await P.copyText(text);
      P.toast("List copied — paste it anywhere.");
    };

    top.replaceChildren(
      h("span", { class: "tagpill ghost" }, "Shopping list"),
      h("div", { class: "acts" },
        btn("copy", "Copy the list", async () => { await P.copyText(P.shop.text()); P.toast("List copied."); }),
        btn("share", "Share the list", share),
        btn("printer", "Print", () => window.print()),
        h("button", { class: "editbtn", type: "button", onClick: ctx.close }, hi("check"), "Done")));

    const input = h("input", { class: "input", placeholder: "Add an item — milk, paper towels…", "aria-label": "Add an item", enterkeyhint: "done", autocomplete: "off" });
    const add = () => { const t = input.value.trim(); if (t) { P.shop.addExtra(t); requestAnimationFrame(() => scroll.querySelector(".shop-add input")?.focus({ preventScroll: true })); } };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });

    const undoToast = (msg, undo) => P.toast(msg, { action: { label: "Undo", fn: undo } });
    const openRecipe = (r) => { const rec = P.recipe(r.id); if (rec) P.go(P.pathFor({ tag: rec.tag, id: rec.id })); else P.toast("That recipe is no longer in your library."); };

    const row = (it) => {
      const li = h("li", { class: "ing shop-item" + (it.done ? " done" : ""), role: "checkbox", tabindex: "0", "aria-checked": String(it.done), title: `From ${it.from.join(", ")}` },
        h("span", { class: "cb", html: P.icon("check") }), h("span", { class: "txt" }, it.text),
        it.cost != null ? h("span", { class: "ing-price" }, P.prices.amount(it.cost)) : null,
        h("button", { class: "rm", type: "button", "aria-label": `Remove ${it.name}`, html: P.icon("x"), onClick: (e) => { e.stopPropagation(); undoToast(`Removed ${it.name}.`, P.shop.hide(it.keys)); } }));
      li.addEventListener("click", () => P.shop.toggle(it.keys));
      li.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && e.target === li) { e.preventDefault(); P.shop.toggle(it.keys); } });
      return li;
    };

    const intoKitchen = () => {
      const res = P.shop.toKitchen();
      if (!res) return;
      P.toast(`${P.plural(res.moved, "item")} put away${res.added ? ` (${res.added} new in your kitchen)` : ""}.`, { ms: 5000, action: { label: "Undo", fn: res.undo } });
    };
    scroll.replaceChildren(h("div", { class: "recipe shop" + (shopping ? " shopping" : "") },
      shopping && all.length ? h("div", { class: "shop-progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(all.length), "aria-valuenow": String(done), "aria-label": "In the basket" },
        h("span", { class: "shop-track", "aria-hidden": "true" }, h("i", { style: { width: `${Math.round((done / all.length) * 100)}%` } })),
        h("span", {}, open ? `${done} of ${all.length} in the basket` : "Everything's in the basket"),
        done ? h("button", { class: "textbtn", type: "button", onClick: intoKitchen }, hi("jar"), "Put it in my kitchen") : null,
        h("button", { class: "btn sm shopmode-btn on", type: "button", "aria-pressed": "true", onClick: () => setShopping(false) }, "Exit")) : null,
      h("h1", { class: "title" }, "Shopping list"),
      h("div", { class: "chips" },
        open ? h("button", { class: "chip shopmode-btn", type: "button", "aria-pressed": "false", title: "Big rows, what's left first, and the screen stays on", onClick: () => setShopping(true) }, hi("cart"), "Shop mode") : null,
        h("span", { class: "chip" }, hi("cart"), all.length ? `${open} to buy` : "Nothing yet"),
        (() => {                                               // what the rest of the list costs, where you are
          const priced = all.filter((i) => !i.done && i.cost != null);
          if (!priced.length || !P.prices.show()) return null;
          const sum = priced.reduce((n, i) => n + i.cost, 0);
          return h("button", { class: "chip money", type: "button", title: `${P.prices.place()} prices, AI estimate. Change`, onClick: () => P.prices.sheet() }, hi("coins"), `≈ ${P.prices.fmt(sum)}`);
        })(),
        done ? h("span", { class: "chip" }, hi("check"), `${done} in the basket`) : null,
        recipes.length ? h("span", { class: "chip" }, hi("book"), P.plural(recipes.length, "recipe")) : null),
      h("div", { class: "shop-add" }, input, h("button", { class: "btn lime", type: "button", onClick: add }, hi("plus"), "Add")),
      (() => {
        const n = P.shop.basicsHidden(), off = P.S.shop.basics === false;
        if (!n && !off) return null;
        return h("p", { class: "shop-basics" }, hi("jar"), off ? "Showing salt, pepper, oil and water. " : `${P.plural(n, "kitchen basic")} (salt, pepper, oil, water) left off. `,
          h("button", { class: "textbtn", type: "button", onClick: () => P.shop.toggleBasics() }, off ? "Leave them off" : "Show them"));
      })(),
      recipes.length ? h("div", { class: "shop-from" }, h("span", { class: "label" }, "From"),
        recipes.map((r) => h("span", { class: "rchip" },
          h("button", { class: "rname", type: "button", onClick: () => openRecipe(r), title: "Open the recipe" }, r.title, h("em", {}, ` · ${r.servings}`)),
          h("button", { class: "rx", type: "button", "aria-label": `Take ${r.title} off the list`, html: P.icon("x"), onClick: () => undoToast(`Took ${r.title} off the list.`, P.shop.removeRecipe(r.id)) })))) : null,
      all.length
        ? [secs.map((sec) => h("section", { class: "shop-sec" },
          h("div", { class: "sec-head" }, h("h2", { class: "section-h" }, sec.aisle), h("span", { class: "count-note" }, String(sec.items.filter((i) => !i.done).length))),
          h("ul", { class: "ings" }, sec.items.map(row)))),
        h("div", { class: "shop-foot" },
          done ? h("button", { class: "btn lime sm", type: "button", title: "Add what you bought to What can I make?, and take it off the list", onClick: intoKitchen }, hi("jar"), `Put ${done} ticked in my kitchen`) : null,
          done ? h("button", { class: "btn ghost sm", type: "button", onClick: () => undoToast("Cleared what you ticked.", P.shop.clearDone()) }, `Clear ${done} ticked`) : null,
          h("button", { class: "btn danger-ghost sm", type: "button", onClick: () => undoToast("Cleared the list.", P.shop.clearAll()) }, hi("trash"), "Clear the list"))]
        : h("div", { class: "blank inline" }, hi("basket"), h("p", {}, "Your list is empty."),
          h("p", { class: "sub" }, "Open any recipe and tap “Add to shopping list”, or type an item above."))));
  };
})();
