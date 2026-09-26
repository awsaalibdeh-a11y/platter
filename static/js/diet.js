/* Platter — your diet: the rules you eat by ("no milk", "low fat", "vegetarian"…), checked against every recipe.

   Ingredient rules read the ingredient list itself, so they are exact and can explain themselves: a recipe that isn't
   for you says which ingredients are the problem. Each rule has its own exceptions (coconut milk isn't dairy, but
   almond milk still counts for "no nuts"). Nutrition rules use the per-serving estimates. The profile also goes along
   with every AI request, so Ask AI, Remix and the recipe helper all follow it. */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });
  const W = (words) => new RegExp(`\\b(?:${words})\\b`, "i");
  const X = (words) => new RegExp(words, "gi");

  const MEAT = { re: W("beef|steaks?|pork|bacon|hams?|gammon|sausages?|chorizo|pancetta|prosciutto|salami|pepperoni|lamb|mutton|goat|veal|venison|chicken|turkey|duck|goose|quail|poussin|livers?|mince|meat|meats|meatballs?|oxtail|brisket|short ribs|spare ribs|baby back ribs|guanciale|lardons?|lard|suet|gelatine?|(?:chicken|beef|lamb|pork|meat|bone|veal|ham|turkey) (?:stock|broth|bouillon|gravy)"),
    ok: X("(?:veggie|vegetarian|vegan|plant[- ]based|meat[- ]free|soy|soya|quorn|mushroom)\\s+(?:sausages?|mince|burgers?|chicken|bacon|meatballs?|gelatine?)") };
  const FISH = { re: W("fish|salmon|tuna|cod|haddock|pollock|trout|mackerel|sardines?|anchov(?:y|ies)|herring|halibut|sea bass|snapper|tilapia|swordfish|catfish|monkfish|basa|kippers?|fish sauce|dashi|bonito|katsuobushi|worcestershire|caviar|roe") };
  const SHELL = { re: W("prawns?|shrimps?|crabs?|crabmeat|lobsters?|scallops?|mussels?|clams?|oysters?|squid|calamari|octopus|crayfish|langoustines?|cockles?|oyster sauce|shrimp paste") };
  const DAIRY = { re: W("milk|butter|buttermilk|cream|creams|cr[eè]me fra[iî]che|cheese|cheeses|cheddar|parmesan|parmigiano|mozzarella|feta|paneer|ricotta|halloumi|mascarpone|brie|camembert|gruy[eè]re|emmental|gorgonzola|stilton|roquefort|pecorino|manchego|gouda|monterey jack|provolone|quark|kefir|yogh?urts?|ghee|whey|custard|ice cream|labneh|queso|cotija|burrata|fontina|taleggio|raclette|havarti|jarlsberg|edam|asiago|comt[eé]|skyr|dulce de leche|lassi|malai|khoa|khoya"),
    ok: X("(?:coconut|almond|soy|soya|oat|rice|cashew|hemp|vegan|plant[- ]based|dairy[- ]free)\\s+(?:milk|cream|yogh?urt|butter|cheese|drink|ice cream)|(?:peanut|almond|cashew|cocoa|nut|apple|sunflower|shea|vegan)\\s+butter|butter\\s*(?:beans?|lettuce)|cream of tartar|cream crackers?") };
  const EGG = { re: W("eggs?|egg yolks?|yolks?|egg whites?|mayonnaise|mayo|meringues?|aioli"), ok: X("egg[- ]?plants?|egg[- ]free\\s+\\w+|vegan\\s+mayo(?:nnaise)?") };
  const HONEY = { re: W("honey") };
  const GLUTEN = { re: W("flour|self[- ]raising|bread|breads|breadcrumbs?|panko|pasta|spaghetti|noodles?|macaroni|couscous|bulgh?ur|barley|rye|beer|ale|stout|soy sauce|wheat|semolina|tortillas?|pitas?|pitta|naan|buns?|rolls?|croutons?|crackers?|pastry|phyllo|filo|wrappers?|biscuits?|cakes?|sponge|gnocchi|orzo|lasagn\\w*|penne|fettuccine|linguine|tagliatelle|rigatoni|ravioli|tortellini|seitan|farro|spelt|malt|udon|ramen|baguette|brioche|sourdough|ciabatta|focaccia|pizza dough|hoisin|teriyaki sauce|cookies?"),
    ok: X("(?:rice|corn|chickpea|gram|almond|coconut|tapioca|potato|buckwheat|quinoa|sorghum|teff|arrowroot|cassava)\\s+(?:flour|starch|noodles?|paper|vermicelli|tortillas?|pasta|cakes?|crackers?)|corn\\s*flour|cornstarch|gluten[- ]free\\s+[\\w-]+(?:\\s+[\\w-]+)?|tamari") };
  const NUTS = { re: W("nuts?|almonds?|walnuts?|cashews?|pecans?|peanuts?|pistachios?|hazelnuts?|pine nuts?|macadamias?|brazil nuts?|chestnuts?|praline|marzipan|frangipane|nutella|almond (?:extract|essence|meal|milk|flour|butter)|ground almonds|cashew (?:milk|cream|butter)|satay"),
    ok: X("water chestnuts?") };
  const PORK = { re: W("pork|bacon|hams?|gammon|pancetta|prosciutto|chorizo|salami|pepperoni|lard|lardons?|guanciale|speck|char siu|pork rinds?|gelatine?|(?<!(?:chicken|turkey|beef|lamb|veggie|vegetarian|vegan|plant[- ]based) )sausages?"),
    ok: X("(?:veggie|vegetarian|vegan|plant[- ]based|turkey|beef|chicken)\\s+(?:bacon|ham|pepperoni|salami|gelatine?)|agar") };
  const ALCOHOL = { re: W("wine|beer|ale|stout|lager|cider|rum|brandy|cognac|whiske?y|bourbon|vodka|gin|sherry|marsala|madeira|sake|mirin|vermouth|liqueur|amaretto|baileys|kahlua|tequila|champagne|prosecco|grand marnier|cointreau|triple sec|kirsch|calvados|shaoxing|port wine|ouzo|arak|raki"),
    ok: X("(?:red |white |rice |rice wine |sherry |cider |champagne |malt )?(?:wine |cider |sherry |malt )?vinegar|non[- ]alcoholic\\s+\\w+|(?:ginger|root) beer|gingerbread|gin(?:ger)") };

  const RULES = [
    { key: "vegetarian", label: "Vegetarian", group: "eat", ai: "vegetarian (no meat, poultry or fish)", checks: [MEAT, FISH, SHELL] },
    { key: "vegan", label: "Vegan", group: "eat", ai: "vegan (no animal products at all: no meat, fish, dairy, eggs or honey)", checks: [MEAT, FISH, SHELL, DAIRY, EGG, HONEY] },
    { key: "pescatarian", label: "Pescatarian", group: "eat", ai: "pescatarian (fish and seafood are fine; no meat or poultry)", checks: [MEAT] },
    { key: "dairy-free", label: "No milk or dairy", group: "avoid", ai: "no dairy at all (no milk, butter, cream, cheese or yogurt)", checks: [DAIRY] },
    { key: "egg-free", label: "No eggs", group: "avoid", ai: "no eggs", checks: [EGG] },
    { key: "gluten-free", label: "No gluten", group: "avoid", ai: "gluten-free", checks: [GLUTEN] },
    { key: "nut-free", label: "No nuts", group: "avoid", ai: "no nuts or peanuts", checks: [NUTS] },
    { key: "shellfish-free", label: "No shellfish", group: "avoid", ai: "no shellfish", checks: [SHELL] },
    { key: "no-pork", label: "No pork", group: "avoid", ai: "no pork or pork products (bacon, ham, lard, gelatin)", checks: [PORK] },
    { key: "no-alcohol", label: "No alcohol", group: "avoid", ai: "no alcohol (no wine, beer, spirits or mirin)", checks: [ALCOHOL] },
    { key: "low-fat", label: "Low fat", group: "goal", ai: "low fat (under 30% of calories from fat, ideally under 15 g fat per serving)", nut: (n) => (n[3] <= 15 || n[3] * 9 <= n[0] * 0.3 ? "" : `${n[3]} g fat`) },     // either counts as low fat
    { key: "low-carb", label: "Low carb", group: "goal", ai: "low carb (at most about 20 g carbohydrate per serving)", nut: (n) => (n[2] <= 20 ? "" : `${n[2]} g carbs`) },
    { key: "low-cal", label: "Under 500 kcal", group: "goal", ai: "light (under 500 kcal per serving)", nut: (n) => (n[0] <= 500 ? "" : `${n[0]} kcal`) },
    { key: "high-protein", label: "High protein", group: "goal", ai: "high protein (at least 30 g protein per serving)", nut: (n) => (n[1] >= 30 ? "" : `only ${n[1]} g protein`) },
  ];
  const EXCLUSIVE = new Set(["vegetarian", "vegan", "pescatarian"]);          // you eat one way, not three

  const S = () => P.S.diet;
  const keys = () => S().keys.filter((k) => RULES.some((r) => r.key === k));

  /* ---------- checking a recipe ---------- */
  const cache = new WeakMap();
  /** Every rule of your diet this recipe breaks, and why: [{ rule, why: ["milk", "butter"] }]. */
  function problems(r, ks = keys()) {
    const sig = ks.join(",");
    const hit = cache.get(r);
    if (hit && hit.sig === sig) return hit.out;
    const out = [];
    for (const rule of RULES) {
      if (!ks.includes(rule.key)) continue;
      if (rule.nut) {
        const why = r.nut ? rule.nut(r.nut) : "";              // no estimate yet (a recipe you wrote): don't hold it against it
        if (why) out.push({ rule, why: [why] });
        continue;
      }
      const bad = new Set();
      for (const line of r.ing || []) {
        for (const c of rule.checks) {
          const m = (c.ok ? line.replace(c.ok, " ") : line).match(c.re);
          if (m) bad.add(m[0].toLowerCase());
        }
      }
      if (bad.size) out.push({ rule, why: [...bad] });
    }
    cache.set(r, { sig, out });
    return out;
  }
  const fits = (r) => !problems(r).length;

  /* ---------- the setting ---------- */
  function sheet() {
    let chosen = new Set(keys());
    let on = S().on !== false;
    P.sheet((close) => {
      const body = h("div", { class: "diet-body" });
      const paint = () => {
        const ks = [...chosen];
        const n = ks.length ? P.recipes().filter((r) => !problems(r, ks).length).length : P.recipes().length;
        const group = (g, title) => [h("div", { class: "label" }, title), h("div", { class: "ai-chips" }, RULES.filter((r) => r.group === g).map((rule) => {
          const sel = chosen.has(rule.key);
          return h("button", {
            class: "ai-chip" + (sel ? " on" : ""), type: "button", "aria-pressed": String(sel),
            onClick: () => {
              if (sel) chosen.delete(rule.key);
              else { if (EXCLUSIVE.has(rule.key)) for (const k of EXCLUSIVE) chosen.delete(k); chosen.add(rule.key); }
              paint();
            },
          }, sel ? hi("check") : null, rule.label);
        }))];
        body.replaceChildren(
          ...group("eat", "I eat"), ...group("avoid", "I don't eat"), ...group("goal", "I'm aiming for"),
          h("label", { class: "auto-row check" }, h("button", { class: "switch", type: "button", role: "switch", "aria-checked": String(on), onClick: () => { on = !on; paint(); } }),
            h("span", {}, "Only show recipes that fit")),
          h("p", { class: "diet-count" }, ks.length ? `${n.toLocaleString()} of ${P.recipes().length.toLocaleString()} recipes fit.` : "No rules yet: everything fits."));
      };
      paint();
      const save = () => {
        S().keys = [...chosen];
        S().on = on;
        P.save();
        close();
        P.emit("diet");
        P.toast(chosen.size ? `Saved. ${on ? "Showing recipes that fit, and AI" : "AI"} follows your diet too.` : "Diet cleared.");
      };
      return [
        h("h3", { class: "sheet-h" }, "Your diet"),
        h("p", { class: "sheet-p" }, "Pick what you eat and what you avoid. Every recipe is checked against its ingredients (and its nutrition, for the goals), and Ask AI, Remix and the recipe helper follow it too."),
        body,
        h("div", { class: "sheet-btns spread" },
          h("button", { class: "btn ghost", type: "button", onClick: () => { chosen = new Set(); paint(); } }, "Clear"),
          h("span", { class: "grp" }, h("button", { class: "btn ghost", type: "button", onClick: close }, "Cancel"), h("button", { class: "btn lime", type: "button", onClick: save }, "Save"))),
      ];
    }, { label: "Your diet", class: "diet-sheet" });
  }

  /** On a recipe: "Fits your diet", or what's wrong with it and a way to fix it. */
  function badge(r) {
    if (!keys().length) return null;
    const probs = problems(r);
    if (!probs.length) return h("div", { class: "dietfit ok" }, hi("check"), h("span", {}, h("b", {}, "Fits your diet"), ` · ${summary()}`));
    return h("div", { class: "dietfit no" }, hi("leaf"),
      h("div", {}, h("b", {}, "Not for your diet"),
        h("span", {}, probs.map((p) => `${p.rule.label}: ${p.rule.nut ? p.why[0] : `has ${p.why.slice(0, 3).join(", ")}`}`).join(" · "))),
      h("button", { class: "btn lime sm", type: "button", title: "Rewrite this recipe so it fits your diet", onClick: () => P.aitools.remix(r, `Make it fit this diet: ${text()}.`, "to fit your diet") }, hi("wand"), "Remix it to fit"));
  }

  const summary = () => keys().map((k) => RULES.find((r) => r.key === k).label).join(", ");
  const text = () => keys().map((k) => RULES.find((r) => r.key === k).ai).join("; ");

  P.diet = {
    RULES, keys, problems, fits, sheet, badge, summary, text,
    has: () => keys().length > 0,
    /** Lists only show what fits: the diet is set and the switch is on. */
    active: () => keys().length > 0 && S().on !== false,
    setOn(v) { S().on = v; P.save(); P.emit("diet"); },
    /** `list` narrowed to what fits, when that's switched on. */
    filter: (list) => (keys().length && S().on !== false ? list.filter(fits) : list),
  };
})();
