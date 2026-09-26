/* Platter — kitchen help that needs no AI and no signal: what to use instead of an ingredient, and a converter for
   cups, grams and oven temperatures.

   Swaps are found by the ingredient's name in the line (buttermilk before milk, peanut butter before butter). Every
   suggestion is run through your diet's own checker, so "ground almonds" is marked as not for you when you avoid
   nuts, and the ones that fit come first. */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });

  /* ---------- swaps ---------- */
  // what the line mentions, what rules it out, the name to show, then [use, how, lighter?] for each swap
  const sw = (re, not, name, ...opts) => ({ re, not, name, opts: opts.map(([use, how = "", light = false]) => ({ use, how, light, r: { ing: [use] } })) });
  const SWAPS = [
    sw(/\bbuttermilk\b/, null, "buttermilk",
      ["Milk + lemon juice", "1 tbsp lemon juice or white vinegar in each cup of milk; leave it 5 minutes to thicken"],
      ["Plain yogurt, thinned", "¾ cup yogurt + ¼ cup water for each cup"],
      ["Oat or soy milk + lemon juice", "1 tbsp lemon juice in each cup; leave it 5 minutes"]),
    sw(/\bcoconut milk\b/, null, "coconut milk",
      ["Single cream", "Same amount; richer, not dairy-free"],
      ["Greek yogurt", "Same amount, stirred in at the end off the heat so it doesn't split", true],
      ["Cashew cream", "Soak cashews 20 minutes, blend with the same volume of water"]),
    sw(/\bsour cream\b/, null, "sour cream",
      ["Greek yogurt", "Same amount; tangier and much lighter", true],
      ["Crème fraîche", "Same amount; holds up better in hot sauces"],
      ["Coconut yogurt + lemon juice", "Same amount, with a squeeze of lemon"]),
    sw(/\bcream cheese\b/, null, "cream cheese",
      ["Strained Greek yogurt (labneh)", "Same amount; drain yogurt in a cloth for a few hours", true],
      ["Mascarpone", "Same amount; richer and sweeter"],
      ["Blended silken tofu + lemon juice", "Same amount, with a pinch of salt"]),
    sw(/\b(?:heavy|double|whipping|single|light|cooking)?\s*cream\b/, /\b(?:ice|sour|coconut|salad|cheese|of (?:tartar|mushroom|chicken))\s*cream|cream (?:of|cheese|crackers?)\b/, "cream",
      ["Full-fat coconut milk", "Same amount; use the thick top of the can for whipping"],
      ["Milk + melted butter", "¾ cup milk + ¼ cup melted butter for each cup; not for whipping"],
      ["Greek yogurt", "Same amount, stirred in off the heat", true],
      ["Evaporated milk", "Same amount; lighter, fine in sauces and soups", true]),
    sw(/\b(?:plain |greek |natural )?yogh?urt\b/, /\b(?:coconut|soy|oat)\s+yogh?urt\b/, "yogurt",
      ["Sour cream", "Same amount"],
      ["Coconut or soy yogurt", "Same amount"],
      ["Low-fat quark", "Same amount; thick and high in protein", true]),
    sw(/\bparmesan|parmigiano|pecorino\b/, null, "parmesan",
      ["Grana padano or pecorino", "Same amount"],
      ["Nutritional yeast", "Half the amount; cheesy and vegan"],
      ["Aged manchego or old gouda", "Same amount, finely grated"]),
    sw(/\bricotta\b/, null, "ricotta",
      ["Cottage cheese, blended smooth", "Same amount", true],
      ["Crumbled firm tofu + lemon juice", "Same amount, with a pinch of salt"]),
    sw(/\bmascarpone\b/, null, "mascarpone",
      ["Cream cheese + a splash of cream", "Beat 1 cup cream cheese with 2 tbsp cream"],
      ["Strained Greek yogurt", "Same amount; tangier and lighter", true]),
    sw(/\bfeta\b/, null, "feta",
      ["Goat's cheese", "Same amount, crumbled"],
      ["Salted firm tofu + lemon juice", "Crumble, toss with salt, lemon and oregano"]),
    sw(/\bmozzarella\b/, null, "mozzarella",
      ["Provolone or young gouda", "Same amount"],
      ["Vegan mozzarella", "Same amount"]),
    sw(/\b(?:cheddar|gruy[eè]re|emmental|monterey jack)\b/, null, "cheese",
      ["Any firm melting cheese", "Same amount: gouda, emmental, jack or mild cheddar"],
      ["Reduced-fat cheddar", "Same amount; strong flavour so you can use less", true],
      ["Vegan cheddar", "Same amount"]),
    sw(/\b(?:peanut|almond|cashew) butter\b/, null, "nut butter",
      ["Tahini", "Same amount; nut-free, a little bitter"],
      ["Sunflower seed butter", "Same amount; nut-free"],
      ["Powdered peanut butter, mixed with water", "2 tbsp powder + 1 tbsp water for each tbsp", true]),
    sw(/\bbutter\b/, /\b(?:peanut|almond|cashew|nut|apple|cocoa|shea|sunflower|seed)\s+butter\b|butter\s*(?:beans?|milk|nut|lettuce|scotch)/, "butter",
      ["Olive oil", "¾ of the amount, for cooking and savoury bakes"],
      ["Vegan block butter", "Same amount; the closest match for baking"],
      ["Coconut oil", "Same amount; solid when cold, like butter"],
      ["Unsweetened applesauce", "Half the butter swapped for half the amount of applesauce, in cakes and muffins", true]),
    sw(/\b(?:whole |skimmed |semi-skimmed |low-fat |full-fat |dairy )?milk\b/, /\b(?:coconut|almond|soy|soya|oat|rice|cashew|evaporated|condensed|powdered|butter)\s*milk\b|milk chocolate|milk powder/, "milk",
      ["Oat or soy milk", "Same amount; unsweetened for savoury dishes"],
      ["Water + a little butter", "Same amount of water, with 1 tbsp butter per cup, for baking"],
      ["Skimmed milk", "Same amount", true],
      ["Half evaporated milk, half water", "Same amount"]),
    sw(/\beggs?\b/, /\begg[- ]?(?:plants?|noodles?|free|wash)\b|\begg (?:whites?|yolks?)\b/, "egg",
      ["Flax egg", "1 tbsp ground flaxseed + 3 tbsp water per egg; leave 5 minutes. For baking"],
      ["Aquafaba (chickpea water)", "3 tbsp per egg; whips like egg white"],
      ["Mashed banana", "¼ cup per egg, in sweet bakes"],
      ["Unsweetened applesauce", "¼ cup (60 g) per egg, in cakes and muffins", true]),
    sw(/\bmayo(?:nnaise)?\b/, /\bvegan mayo/, "mayonnaise",
      ["Greek yogurt", "Same amount, with a squeeze of lemon", true],
      ["Vegan mayo", "Same amount"],
      ["Mashed avocado", "Same amount, in sandwiches and dressings"]),
    sw(/\bself[- ]raising flour|self[- ]rising flour\b/, null, "self-raising flour",
      ["Plain flour + baking powder", "1 cup plain flour + 1½ tsp baking powder + ¼ tsp salt"]),
    sw(/\b(?:plain|all[- ]purpose|white|wheat)?\s*flour\b/, /\b(?:rice|corn|chickpea|gram|almond|coconut|tapioca|potato|buckwheat|oat|bread|self[- ]r\w+)\s+flour\b|cornflour/, "flour",
      ["Gluten-free flour blend", "Same amount; add ½ tsp xanthan gum per cup if the blend has none"],
      ["Half whole-wheat flour", "Swap up to half; a little denser, more fibre"],
      ["Oat flour", "1¼ cups for each cup; blend rolled oats until fine"]),
    sw(/\b(?:corn ?starch|cornflour|corn flour)\b/, null, "cornstarch",
      ["Plain flour", "2 tbsp for each tbsp; cook a minute longer"],
      ["Arrowroot or potato starch", "Same amount; add at the end, don't boil hard"]),
    sw(/\bbaking powder\b/, null, "baking powder",
      ["Baking soda + cream of tartar", "¼ tsp baking soda + ½ tsp cream of tartar for each tsp"],
      ["Baking soda + yogurt", "¼ tsp baking soda for each tsp, and swap ½ cup of the liquid for yogurt"]),
    sw(/\b(?:baking soda|bicarbonate of soda|bicarb)\b/, null, "baking soda",
      ["Baking powder", "3 tsp for each tsp, and leave out any salt"]),
    sw(/\bbrown sugar\b/, null, "brown sugar",
      ["White sugar + molasses", "1 cup sugar + 1 tbsp molasses or treacle"],
      ["White sugar", "Same amount; a little less moist and caramelly"],
      ["Coconut sugar", "Same amount"]),
    sw(/\b(?:white |caster |granulated |superfine )?sugar\b/, /\b(?:brown|icing|powdered|confectioners|coconut|palm)\s+sugar\b|sugar[- ]snap/, "sugar",
      ["Honey or maple syrup", "¾ of the amount, and 3 tbsp less liquid per cup"],
      ["Coconut sugar", "Same amount"],
      ["Less sugar", "Most bakes still work with a quarter less", true]),
    sw(/\bhoney\b/, null, "honey",
      ["Maple syrup", "Same amount"],
      ["Golden syrup or agave", "Same amount"]),
    sw(/\bvanilla (?:extract|essence)\b/, null, "vanilla extract",
      ["Vanilla paste", "Same amount"],
      ["Maple syrup", "Same amount; a warm, rounder flavour"]),
    sw(/\b(?:panko|bread ?crumbs?|breadcrumbs?)\b/, null, "breadcrumbs",
      ["Crushed crackers or cornflakes", "Same amount"],
      ["Rolled oats, pulsed", "Same amount; blitz briefly"],
      ["Ground almonds", "Same amount; gluten-free"]),
    sw(/\bsoy sauce\b|\bsoya sauce\b/, null, "soy sauce",
      ["Tamari", "Same amount; gluten-free"],
      ["Coconut aminos", "Same amount; sweeter and less salty"],
      ["Low-salt soy sauce", "Same amount", true]),
    sw(/\bfish sauce\b/, null, "fish sauce",
      ["Soy sauce + lime juice", "Same amount of soy sauce, with a squeeze of lime"],
      ["Soy sauce + miso", "1 tbsp soy sauce + ½ tsp miso for each tbsp"]),
    sw(/\boyster sauce\b/, null, "oyster sauce",
      ["Hoisin + soy sauce", "Half and half, same amount"],
      ["Mushroom stir-fry sauce", "Same amount; vegetarian"]),
    sw(/\bworcestershire\b/, null, "Worcestershire sauce",
      ["Soy sauce + vinegar", "1 tbsp soy sauce + a few drops of vinegar and a pinch of sugar"]),
    sw(/\bmirin\b/, null, "mirin",
      ["Rice vinegar + sugar", "1 tbsp rice vinegar + ½ tsp sugar for each tbsp"]),
    sw(/\bwhite wine\b/, /\bwhite wine vinegar\b/, "white wine",
      ["Vegetable stock + white wine vinegar", "Same amount of stock, with 1 tsp vinegar per cup"],
      ["White grape juice + lemon juice", "Same amount, in lighter or sweeter dishes"]),
    sw(/\bred wine\b/, /\bred wine vinegar\b/, "red wine",
      ["Vegetable stock + red wine vinegar", "Same amount of stock, with 1 tbsp vinegar per cup"],
      ["Grape or pomegranate juice + red wine vinegar", "Same amount, with a splash of vinegar"]),
    sw(/\b(?:chicken|beef|lamb) (?:stock|broth|bouillon)\b/, null, "meat stock",
      ["Vegetable stock", "Same amount"],
      ["Water + miso or soy sauce", "1 tsp miso or soy sauce in each cup of water"],
      ["Mushroom stock", "Same amount; deep, meaty flavour"]),
    sw(/\b(?:bacon|pancetta|lardons?)\b/, null, "bacon",
      ["Smoked turkey rashers", "Same amount", true],
      ["Smoked paprika + olive oil", "½ tsp smoked paprika and a little oil, for the smoky taste"],
      ["Smoked tofu, diced", "Same amount, fried until crisp"]),
    sw(/\b(?:ground|minced) (?:beef|pork|lamb)\b|\b(?:beef|pork|lamb) mince\b/, null, "mince",
      ["Turkey or chicken mince", "Same amount", true],
      ["Cooked brown lentils", "About 1 cup cooked lentils for each 250 g"],
      ["Plant-based mince", "Same amount"]),
    sw(/\bchicken breasts?\b/, null, "chicken breast",
      ["Chicken thighs", "Same weight; juicier, cook a few minutes longer"],
      ["Firm tofu, pressed", "Same weight; press it for 15 minutes first"],
      ["Chickpeas", "One can for every 250 g, in curries and stews"]),
    sw(/\b(?:shrimps?|prawns?)\b/, /\bshrimp paste|dried shrimps?|prawn crackers?/, "shrimp",
      ["Firm white fish, in chunks", "Same weight; cook a little less"],
      ["King oyster mushrooms", "Sliced into rounds, same weight"]),
    sw(/\blemon juice\b|\blemons?\b/, null, "lemon",
      ["Lime juice", "Same amount"],
      ["White wine vinegar", "Half the amount"]),
    sw(/\blimes?\b|\blime juice\b/, /\blime (?:leaves|leaf|pickle|cordial)\b/, "lime",
      ["Lemon juice", "Same amount"]),
    sw(/\bgarlic\b/, /\bgarlic (?:powder|salt|granules)\b/, "garlic",
      ["Garlic powder", "⅛ tsp for each clove"],
      ["Jarred minced garlic", "½ tsp for each clove"]),
    sw(/\bshallots?\b/, null, "shallot",
      ["Red onion", "A third of an onion for each shallot"],
      ["Spring onions, white parts", "3 for each shallot"]),
    sw(/\bonions?\b/, /\b(?:spring|green|pearl) onions?\b|onion (?:powder|salt|granules)/, "onion",
      ["Onion powder", "1 tbsp for each medium onion"],
      ["Shallots", "2–3 for each onion"],
      ["Leek", "One leek, white part, for each onion"]),
    sw(/\b(?:fresh )?(?:ginger|root ginger)\b/, /\bground ginger|ginger (?:ale|beer|biscuits?)\b/, "ginger",
      ["Ground ginger", "¼ tsp for each tbsp of fresh"]),
    sw(/\b(?:coriander|cilantro)\b/, /\b(?:ground|dried) coriander|coriander (?:seeds?|powder)/, "coriander",
      ["Flat-leaf parsley + lime zest", "Same amount, for anyone who finds coriander soapy"],
      ["Thai basil or mint", "Same amount"]),
    sw(/\b(?:basil|parsley|dill|mint|tarragon|chives|chervil)\b|\bfresh (?:thyme|oregano|rosemary|sage)\b/, /\bdried\b|mint (?:sauce|jelly)/, "fresh herbs",
      ["Dried herbs", "A third of the amount, added earlier so they soften"],
      ["Frozen herbs", "Same amount"]),
    sw(/\btomato (?:paste|pur[eé]e)\b/, null, "tomato paste",
      ["Passata, cooked down", "3 tbsp passata for each tbsp, simmered until thick"],
      ["Ketchup", "Same amount; sweeter"]),
    sw(/\b(?:canned|tinned|chopped) tomatoes\b/, null, "canned tomatoes",
      ["Fresh tomatoes, chopped", "About 6 ripe tomatoes for each 400 g can"],
      ["Passata", "Same amount; smoother"]),
    sw(/\b(?:white |basmati |jasmine |long[- ]grain )?rice\b/, /\brice (?:vinegar|noodles?|paper|wine|flour|cakes?)\b|arborio|risotto|brown rice/, "rice",
      ["Cauliflower rice", "Same volume; cook 5 minutes, far fewer carbs", true],
      ["Quinoa", "Same volume; cooks in 15 minutes, more protein"],
      ["Brown rice", "Same amount; 15–20 minutes longer to cook"]),
    sw(/\b(?:spaghetti|linguine|fettuccine|penne|pasta|macaroni|tagliatelle|rigatoni|fusilli)\b/, /\bgluten[- ]free\b/, "pasta",
      ["Gluten-free pasta", "Same amount; watch the time, it goes soft quickly"],
      ["Courgette noodles", "One medium courgette per serving; a minute in the pan", true],
      ["Whole-wheat pasta", "Same amount; more fibre"]),
    sw(/\b(?:flour )?tortillas?\b/, /\bcorn tortillas?\b|tortilla chips/, "tortillas",
      ["Corn tortillas", "Same number; gluten-free"],
      ["Large lettuce leaves", "Two per wrap", true]),
    sw(/\b(?:olive oil|extra[- ]virgin)\b/, null, "olive oil",
      ["Any neutral oil", "Same amount: sunflower, rapeseed or canola"],
      ["Oil spray", "A few sprays instead of spoonfuls", true]),
    sw(/\b(?:vegetable|sunflower|canola|rapeseed|neutral|corn) oil\b/, null, "vegetable oil",
      ["Light olive oil", "Same amount; not extra-virgin for high heat"],
      ["Melted coconut oil", "Same amount"]),
    sw(/\bpine nuts?\b/, null, "pine nuts",
      ["Sunflower or pumpkin seeds, toasted", "Same amount; nut-free"],
      ["Chopped walnuts", "Same amount"]),
    sw(/\b(?:ground almonds|almond flour)\b/, null, "ground almonds",
      ["Ground sunflower seeds", "Same amount; nut-free"],
      ["Plain flour", "¾ of the amount; drier, less rich"]),
    sw(/\b(?:fresh |red |green )?(?:chil(?:l)?i(?:es)?|chil(?:l)?ies|jalape[nñ]os?)\b/, /\bchil(?:l)?i (?:powder|flakes|sauce|oil)\b|sweet chil/, "chilli",
      ["Chilli flakes", "½ tsp for each fresh chilli"],
      ["Hot sauce", "A few dashes for each chilli"]),
    sw(/\bdijon\b|\bmustard\b/, /\bmustard (?:seeds?|powder|greens)\b/, "mustard",
      ["Mustard powder + vinegar", "½ tsp powder + 1 tsp vinegar for each tsp"],
      ["Wholegrain mustard", "Same amount"]),
    sw(/\bbalsamic\b/, null, "balsamic vinegar",
      ["Red wine vinegar + sugar", "Same amount, with a pinch of sugar"]),
    sw(/\brice vinegar\b/, null, "rice vinegar",
      ["Apple cider vinegar", "A little less, with a pinch of sugar"]),
  ];

  const lower = (line) => String(line).toLowerCase().replace(/\([^)]*\)/g, " ");
  /** The swaps for one ingredient line, or null when there are none. */
  const find = (line) => {
    const t = lower(line);
    return SWAPS.find((s) => s.re.test(t) && !(s.not && s.not.test(t))) || null;
  };

  /** Which rules of your diet a line or a swap breaks: [] when it fits (or there is no diet). */
  const breaks = (r, ks) => (ks.length ? P.diet.problems(r, ks) : []);
  const lineCache = new Map();
  const asRecipe = (line) => { let r = lineCache.get(line); if (!r) { r = { ing: [line] }; lineCache.set(line, r); } return r; };
  /** True when the line breaks your diet: its swap button stands out. */
  const clashes = (line) => breaks(asRecipe(line), P.diet.keys()).length > 0;

  /** The swaps for a line, the ones that fit your diet first (and the lighter ones, when you eat light). */
  function options(line) {
    const s = find(line);
    if (!s) return null;
    const ks = P.diet.keys();
    const light = ks.some((k) => k === "low-fat" || k === "low-cal");
    const opts = s.opts.map((o) => ({ ...o, fits: !breaks(o.r, ks).length }))
      .sort((a, b) => b.fits - a.fits || (light ? b.light - a.light : 0));
    return { name: s.name, opts, clash: breaks(asRecipe(line), ks).map((p) => p.rule.label), diet: ks.length > 0 };
  }

  function menu(anchor, line, { onPick, onAsk } = {}) {
    const o = options(line);
    if (!o) return;
    P.popover(anchor, (close) => [
      h("div", { class: "pop-h" }, `Instead of ${o.name}`),
      o.clash.length ? h("div", { class: "swap-warn" }, hi("leaf"), `Not in your diet: ${o.clash.join(", ")}`) : null,
      ...o.opts.map((x) => h("button", { class: "swap-opt" + (x.fits ? "" : " off"), type: "button", role: "menuitem", onClick: () => { close(); onPick?.(o, x); } },
        h("span", { class: "swap-use" }, h("b", {}, x.use),
          x.light ? h("em", { class: "swap-tag light" }, "Lighter") : null,
          o.diet ? h("em", { class: "swap-tag " + (x.fits ? "fit" : "no") }, x.fits ? "Fits your diet" : "Not for your diet") : null),
        x.how ? h("small", {}, x.how) : null)),
      h("div", { class: "pop-sep" }),
      onAsk ? P.menuItem({ label: "Ask AI for another idea", icon: "sparkle", onClick: () => { close(); onAsk(o); } }) : null,
      onPick ? h("p", { class: "swap-foot" }, "Tap a swap to keep it in this recipe's notes.") : null,
    ], { align: "right", class: "swaps" });
  }

  /* ---------- converter ---------- */
  const VOL = { tsp: 4.929, tbsp: 14.787, cup: 240, "fl oz": 29.574, ml: 1, l: 1000 };
  const MASS = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };
  const UNITS = [...Object.keys(VOL), ...Object.keys(MASS)];
  // grams in one cup (240 ml), for crossing between volume and weight
  const FOODS = [
    ["Water, milk or stock", 240], ["Plain / all-purpose flour", 125], ["Bread flour", 130], ["Whole-wheat flour", 120],
    ["White sugar", 200], ["Brown sugar, packed", 220], ["Icing / powdered sugar", 120], ["Butter", 227], ["Oil", 218],
    ["Honey or syrup", 340], ["Rice, uncooked", 185], ["Rolled oats", 90], ["Cocoa powder", 85], ["Grated cheese", 100],
    ["Chopped nuts", 120], ["Ground almonds", 96], ["Breadcrumbs", 110], ["Yogurt or sour cream", 245], ["Fine salt", 288],
    ["Chocolate chips", 170], ["Frozen peas", 145], ["Cooked rice", 160],
  ];
  /** A number the way a cook would say it: fractions for spoons and cups, sensible rounding for the rest. */
  function nice(v, unit) {
    if (!Number.isFinite(v) || v <= 0) return "—";
    if (unit === "tsp" || unit === "tbsp" || unit === "cup") {
      const q = Math.round(v * 4) / 4;
      if (q >= 0.25) return P.fmtQty(q);
      return v.toFixed(2).replace(/0+$/, "");
    }
    if (unit === "g" || unit === "ml") return String(v < 10 ? Math.round(v * 10) / 10 : v < 100 ? Math.round(v) : Math.round(v / 5) * 5);
    if (unit === "oz" || unit === "fl oz") return String(v < 10 ? Math.round(v * 10) / 10 : Math.round(v * 2) / 2);
    return String(Math.round(v * 100) / 100);
  }
  // nobody measures 98 teaspoons or 0.02 kg
  const sensible = (u, v) => !((u === "tsp" && v > 24) || (u === "tbsp" && v > 32) || (u === "cup" && v < 0.12) || ((u === "l" || u === "kg" || u === "lb") && v < 0.1));
  /** amount × unit into every other unit; volume and weight cross over with grams-per-cup. */
  function convert(amount, from, perCup) {
    const out = [];
    const ml = VOL[from] ? amount * VOL[from] : (amount * MASS[from] * 240) / perCup;
    const g = MASS[from] ? amount * MASS[from] : (amount * VOL[from] * perCup) / 240;
    for (const u of UNITS) if (u !== from && sensible(u, VOL[u] ? ml / VOL[u] : g / MASS[u])) out.push({ unit: u, v: VOL[u] ? ml / VOL[u] : g / MASS[u], text: nice(VOL[u] ? ml / VOL[u] : g / MASS[u], u), cross: !!VOL[u] !== !!VOL[from] });
    return out;
  }

  // gas marks with the Celsius and Fahrenheit a British recipe means by them
  const OVEN = [["¼", 110, 225, "Very cool"], ["½", 120, 250, "Very cool"], ["1", 140, 275, "Cool"], ["2", 150, 300, "Cool"], ["3", 160, 325, "Warm"],
    ["4", 180, 350, "Moderate"], ["5", 190, 375, "Moderately hot"], ["6", 200, 400, "Hot"], ["7", 220, 425, "Hot"], ["8", 230, 450, "Very hot"], ["9", 240, 475, "Very hot"]];
  const toC = (f) => ((f - 32) * 5) / 9;
  const toF = (c) => (c * 9) / 5 + 32;
  /** The oven row nearest a temperature in °C. */
  const nearestOven = (c) => OVEN.reduce((best, row) => (Math.abs(row[1] - c) < Math.abs(best[1] - c) ? row : best));
  function oven(value, scale) {
    const c = scale === "F" ? toC(value) : value, f = scale === "F" ? value : toF(c);
    const row = nearestOven(c);
    return { c: Math.round(c / 5) * 5, f: Math.round(f / 5) * 5, fan: Math.round((c - 20) / 5) * 5, gas: row[0], words: row[3], row };
  }

  function converter(opts = {}) {
    const st = { amount: 1, from: "cup", food: 1, temp: 180, scale: "C", ...(P.S.ui.conv || {}), ...opts };
    const remember = () => { P.S.ui.conv = { from: st.from, food: st.food, scale: st.scale }; P.save(); };
    P.sheet(() => {
      const amount = h("input", { class: "input cv-amt", type: "number", inputmode: "decimal", min: "0", step: "any", value: String(st.amount), "aria-label": "Amount", "data-autofocus": "" });
      const from = h("select", { class: "input cv-unit", "aria-label": "Unit" }, UNITS.map((u) => h("option", { value: u, selected: u === st.from }, u)));
      const food = h("select", { class: "input cv-food", "aria-label": "Ingredient" }, FOODS.map(([n], i) => h("option", { value: String(i), selected: i === st.food }, n)));
      const outBox = h("div", { class: "cv-out", "aria-live": "polite" });
      const paintAmount = () => {
        st.amount = Math.max(0, parseFloat(amount.value) || 0);
        const res = convert(st.amount, st.from, FOODS[st.food][1]);
        const block = (title, list) => h("div", { class: "cv-group" }, h("small", {}, title),
          h("div", { class: "cv-grid" }, list.map((x) => h("div", { class: "cv-cell" + (x.cross ? " cross" : "") }, h("b", {}, x.text), h("span", {}, x.unit)))));
        outBox.replaceChildren(
          block(VOL[st.from] ? "Other measures" : "By volume", res.filter((x) => VOL[x.unit])),
          block(MASS[st.from] ? "Other weights" : "By weight", res.filter((x) => MASS[x.unit])));
      };
      amount.addEventListener("input", paintAmount);
      from.addEventListener("change", () => { st.from = from.value; remember(); paintAmount(); });
      food.addEventListener("change", () => { st.food = +food.value; remember(); paintAmount(); });

      const temp = h("input", { class: "input cv-amt", type: "number", inputmode: "numeric", value: String(st.temp), "aria-label": "Oven temperature" });
      const scaleSeg = h("div", { class: "seg", role: "group", "aria-label": "Scale" });
      const ovenOut = h("div", { class: "cv-oven-out", "aria-live": "polite" });
      const table = h("div", { class: "cv-table", role: "group", "aria-label": "Oven temperatures" },
        h("div", { class: "cv-tr head", "aria-hidden": "true" }, ["Gas", "°C", "Fan °C", "°F", ""].map((x) => h("span", {}, x))),
        OVEN.map((row) => h("button", { class: "cv-tr", type: "button", "aria-label": `Gas ${row[0]}: ${row[1]} °C, fan ${row[1] - 20} °C, ${row[2]} °F`, onClick: () => { temp.value = String(st.scale === "F" ? row[2] : row[1]); paintOven(); } },
          h("span", {}, row[0]), h("span", {}, String(row[1])), h("span", {}, String(row[1] - 20)), h("span", {}, String(row[2])), h("small", {}, row[3]))));
      const paintScale = () => scaleSeg.replaceChildren(...["C", "F"].map((s) => h("button", { type: "button", class: st.scale === s ? "on" : "", "aria-pressed": String(st.scale === s),
        onClick: () => { st.scale = s; remember(); paintScale(); paintOven(); temp.focus(); } }, `°${s}`)));     // says which scale the number is in
      const paintOven = () => {
        st.temp = +temp.value || 0;
        const o = oven(st.temp, st.scale);
        ovenOut.replaceChildren(h("b", {}, `${o.c} °C`), h("span", {}, " = "), h("b", {}, `${o.f} °F`), h("span", {}, ` · fan ${o.fan} °C · gas ${o.gas} · ${o.words.toLowerCase()}`));
        for (const [i, el] of [...table.querySelectorAll("button.cv-tr")].entries()) el.classList.toggle("on", OVEN[i] === o.row);
      };
      temp.addEventListener("input", paintOven);
      paintAmount(); paintScale(); paintOven();
      return [
        h("h3", { class: "sheet-h" }, hi("scale"), "Kitchen converter"),
        h("div", { class: "cv-row" }, amount, from, h("span", { class: "cv-of" }, "of"), food),
        h("p", { class: "cv-note" }, "Going between cups and grams depends on what it is: pick the ingredient. Spoons are level."),
        outBox,
        h("h4", { class: "cv-h" }, hi("fire"), "Oven temperature"),
        h("div", { class: "cv-row" }, temp, scaleSeg, ovenOut),
        table,
      ];
    }, { class: "converter-sheet", label: "Kitchen converter" });
  }

  P.swaps = { find, options, menu, clashes, all: SWAPS };
  P.convert = { sheet: converter, amount: convert, oven, nice, FOODS, UNITS };
})();
