// Platter's recipe logic, tested in Node: quantities and scaling, unit conversion, the shopping list's merging,
// diet rules, prices and tag guessing. The real browser scripts are loaded into a small stand-in for a browser.
//     node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadPlatter() {
  const store = new Map();
  const noop = () => {};
  const el = () => ({ style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop }, append: noop, setAttribute: noop, addEventListener: noop, appendChild: noop });
  const sandbox = {
    console, Intl, Math, Date, JSON, Map, Set, WeakMap, Promise, setTimeout, clearTimeout, TextEncoder, TextDecoder,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    addEventListener: noop,
    navigator: { language: "en-US", onLine: true, platform: "Linux" },
    location: { hash: "", origin: "https://platter.test", pathname: "/" },
    history: { replaceState: noop },
    document: { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], createElement: el, documentElement: { dataset: {} }, body: el() },
    CSS: { escape: (s) => s },
  };
  sandbox.window = sandbox;
  sandbox.window.PLATTER = { v: "test" };
  vm.createContext(sandbox);
  for (const f of ["util", "store", "shop", "diet", "prices", "kitchen"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "static", "js", `${f}.js`), "utf8"), sandbox, { filename: `${f}.js` });
  }
  return sandbox.P;
}
const P = loadPlatter();

test("scaling a line keeps units, plurals and fractions right", () => {
  assert.equal(P.scaleLine("1 cup flour", 2, "orig"), "2 cups flour");
  assert.equal(P.scaleLine("4 cloves garlic, minced", 1.5, "orig"), "6 cloves garlic, minced");
  assert.equal(P.scaleLine("1 1/2 cups milk", 0.5, "orig"), "¾ cup milk");
  assert.equal(P.scaleLine("salt, to taste", 3, "orig"), "salt, to taste");
  assert.equal(P.scaleLine("3 chicken thighs", 1.33, "orig"), "4 chicken thighs");     // nobody wants 3.99 thighs
  assert.equal(P.scaleLine("200g spaghetti", 2, "orig"), "400g spaghetti");
});

test("US and metric conversion", () => {
  assert.equal(P.scaleLine("1 cup milk", 1, "metric"), "240ml milk");
  assert.equal(P.scaleLine("2 lb potatoes, peeled", 1, "metric"), "900g potatoes, peeled");
  assert.equal(P.scaleLine("500 g flour", 1, "us"), "1 lb flour");
  assert.equal(P.scaleLine("1 cinnamon stick", 1, "metric"), "1 cinnamon stick");          // a cinnamon stick is not 113 g of butter
  assert.equal(P.scaleLine("2 tbsp soy sauce", 1, "metric"), "2 tbsp soy sauce");         // spoons stay spoons
  assert.equal(P.convertText("Bake at 425°F for 20 minutes.", "metric"), "Bake at 220°C for 20 minutes.");
  assert.equal(P.convertText("Preheat the oven to 180°C.", "us"), "Preheat the oven to 350°F.");
  assert.equal(P.convertText("Roast at 350°F (180°C).", "metric"), "Roast at 350°F (180°C).");  // already gives both
});

test("guessing a tag for an imported recipe", () => {
  assert.equal(P.guessTag("Chicken Tikka Masala"), "chicken");
  assert.equal(P.guessTag("Roast Turkey"), "poultry");
  assert.equal(P.guessTag("Quick Guacamole"), "appetizers");
  assert.equal(P.guessTag("Lemon Drizzle Cake"), "desserts");
  assert.equal(P.guessTag("Something", "", ["200g tofu", "1 onion"]), "vegetarian");
});

test("the shopping list merges the same thing across recipes", () => {
  P.shop.clearAll();
  P.shop.add({ id: "a", title: "A" }, 4, ["2 cloves garlic", "1 cup milk", "1 onion"]);
  P.shop.add({ id: "b", title: "B" }, 4, ["4 cloves garlic, minced", "2 tbsp milk", "2 onions, chopped"]);
  const items = P.shop.sections().flatMap((s) => s.items.map((i) => i.text));
  assert.ok(items.includes("6 cloves garlic"), items.join(" | "));
  assert.ok(items.includes("1 ⅛ cups milk"), items.join(" | "));
  assert.ok(items.includes("3 onions"), items.join(" | "));
  const undo = P.shop.removeRecipe("b");
  assert.ok(P.shop.sections().flatMap((s) => s.items.map((i) => i.text)).includes("2 cloves garlic"));
  undo();
  assert.equal(P.shop.recipes().length, 2);
  P.shop.clearAll();
});

test("diet rules read the ingredient list, with each rule's own exceptions", () => {
  const cases = [
    ["dairy-free", "1 can coconut milk", true], ["dairy-free", "2 tbsp butter", false], ["dairy-free", "2 tbsp peanut butter", true],
    ["dairy-free", "1 tsp cream of tartar", true], ["nut-free", "1 cup almond milk", false], ["nut-free", "1/2 tsp nutmeg", true],
    ["nut-free", "1 can water chestnuts", true], ["egg-free", "1 eggplant, diced", true], ["egg-free", "2 eggs", false],
    ["gluten-free", "200g rice noodles", true], ["gluten-free", "2 tbsp soy sauce", false], ["gluten-free", "2 tbsp tamari", true],
    ["no-alcohol", "1 tbsp red wine vinegar", true], ["no-alcohol", "1/2 cup white wine", false], ["no-alcohol", "1 tbsp grated ginger", true],
    ["no-pork", "4 chicken sausages", true], ["no-pork", "4 sausages", false], ["no-pork", "1 tsp gelatin", false],
    ["vegetarian", "2 cups vegetable stock", true], ["vegetarian", "2 cups chicken stock", false], ["vegetarian", "2 tbsp fish sauce", false],
    ["pescatarian", "200g salmon", true], ["pescatarian", "200g chicken", false], ["vegan", "1 cup oat milk", true], ["vegan", "1 tbsp honey", false],
  ];
  for (const [rule, line, fits] of cases) {
    const bad = P.diet.problems({ ing: [line] }, [rule]);
    assert.equal(bad.length === 0, fits, `${rule}: "${line}" should ${fits ? "fit" : "not fit"}`);
  }
  // goals use the nutrition estimate: low fat is under 15 g, or under 30% of the calories
  assert.equal(P.diet.problems({ ing: [], nut: [700, 30, 80, 22] }, ["low-fat"]).length, 0);
  assert.equal(P.diet.problems({ ing: [], nut: [600, 30, 30, 30] }, ["low-fat"]).length, 1);
});

test("prices: a line costs its US price times its kind's factor", () => {
  P.S.prices.on = true;
  P.S.prices.cal = { currency: "EUR", mult: { general: 1, meat: 2, produce: 0.5 }, at: 1 };
  const r = { id: "t1", serves: 2, ing: ["500g beef mince", "2 onions"], cost: [5, 1] };
  assert.equal(P.prices.lineCost(r, 0), 10);                       // beef: meat factor 2
  assert.equal(P.prices.lineCost(r, 1), 0.5);                      // onions: produce factor 0.5
  const c = P.prices.recipeCost(r, 4);                             // (an object from the sandbox: compare its fields)
  assert.equal(c.total, 21);
  assert.equal(c.per, 5.25);
  assert.match(P.prices.fmt(5.25), /5[.,]25/);
  P.S.prices.cal = null;
});

test("typos in a search are fixed against the words the library really has", () => {
  const lib = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "static", "data", "library.json"), "utf8"));
  P.lib.seedTags = lib.tags;
  P.lib.seed = lib.recipes;
  for (const r of lib.recipes) P.lib.seedById[r.id] = r;
  P.saveRecipe({ title: "reload", ing: [], steps: [] });           // any change marks the library as needing a rebuild
  const fix = (q) => P.fixQuery(q).q;
  assert.equal(fix("chiken"), "chicken");
  assert.equal(fix("spagheti"), "spaghetti");
  assert.equal(fix("chiken curry"), "chicken curry");
  assert.equal(fix("garlic"), "garlic");                          // right already: left alone
  assert.equal(fix("chi"), "chi");                                // too short to guess at, and a prefix while typing
  assert.equal(fix("xqzvw"), "xqzvw");                            // nothing close: left alone
  assert.ok(P.search(P.recipes(), fix("chiken tika")).some((r) => /chicken tikka/i.test(r.title)));
});

test("swaps are found by the ingredient's name, not a word inside another", () => {
  const name = (line) => P.swaps.find(line)?.name ?? null;
  assert.equal(name("1 cup buttermilk"), "buttermilk");
  assert.equal(name("2 cups whole milk"), "milk");
  assert.equal(name("1 can coconut milk"), "coconut milk");
  assert.equal(name("2 tbsp peanut butter"), "nut butter");
  assert.equal(name("50g unsalted butter, softened"), "butter");
  assert.equal(name("1 tbsp cornflour"), "cornstarch");
  assert.equal(name("2 large eggs"), "egg");
  assert.equal(name("1 eggplant, diced"), null);
  assert.equal(name("200g sugar snap peas"), null);
  assert.equal(name("1 tsp ground coriander"), null);
  assert.equal(name("4 kaffir lime leaves"), null);
  assert.equal(name("1 tbsp shrimp paste"), null);
  assert.equal(name("300 ml double cream"), "cream");
  assert.equal(name("1 scoop ice cream"), null);
});

test("swaps that fit your diet come first, and a line that breaks it says so", () => {
  const before = P.S.diet.keys;
  P.S.diet.keys = ["dairy-free"];
  try {
    const milk = P.swaps.options("1 cup milk");
    assert.ok(milk.clash.includes("No milk or dairy"));
    assert.equal(milk.opts[0].use, "Oat or soy milk");
    assert.ok(milk.opts[0].fits);
    assert.ok(!milk.opts.find((o) => o.use === "Skimmed milk").fits);
    assert.ok(P.swaps.clashes("2 tbsp butter"));
    assert.ok(P.swaps.clashes("3 cups queso fresco") || P.diet.problems({ ing: ["3 cups queso fresco"] }, ["dairy-free"]).length);
    assert.ok(!P.swaps.clashes("2 tbsp olive oil"));
  } finally { P.S.diet.keys = before; }
});

test("the converter crosses cups and grams by ingredient, and knows gas marks", () => {
  const by = (list) => Object.fromEntries(list.map((x) => [x.unit, x.text]));
  const flour = by(P.convert.amount(1, "cup", 125));
  assert.equal(flour.g, "125");
  assert.equal(flour.tbsp, "16");                                  // big spoon counts round to whole ones
  assert.equal(by(P.convert.amount(100, "g", 200)).cup, "½");
  assert.equal(by(P.convert.amount(1, "lb", 240)).g, "455");
  const o = P.convert.oven(350, "F");
  assert.equal(o.c, 175);
  assert.equal(o.gas, "4");
  assert.equal(P.convert.oven(200, "C").fan, 180);
  assert.equal(P.convert.oven(200, "C").f, 390);
});
