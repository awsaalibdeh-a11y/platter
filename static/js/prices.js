/* Platter — prices where you are.

   Each recipe carries the US-dollar cost of every ingredient line. Where you live, each line is multiplied by how
   dear its kind of food is there (meat, dairy, produce…) and shown in your currency; those factors come from the
   server (prices.py), which asks the AI to price a basket of everyday groceries in your country or city, once a week.

   Where you are starts as a guess from the device's time zone (Asia/Amman → Jordan): no location permission and no
   IP lookup. You can pick a country and city yourself, or share your precise location once. */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });
  const WEEK = 7 * 864e5;
  const S = () => P.S.prices;
  let busy = false;

  /* ---------- which kind of food a line is ---------- */
  const kinds = new WeakMap();
  const POULTRY = /\b(chicken|turkey|duck|goose|quail|hens?|poussin)\b/;
  const SEAFOOD = /\b(fish|salmon|tuna|cod|haddock|trout|mackerel|sardines?|anchov\w*|shrimps?|prawns?|crabs?|lobsters?|scallops?|mussels?|clams?|oysters?|squid|calamari|octopus|seafood|sea bass|snapper|tilapia|halibut)\b/;
  const AISLE_KIND = { "Dairy & eggs": "dairy", Produce: "produce", "Bakery & grains": "grains", Pantry: "pantry", Spices: "spices" };
  function kindOfLine(line) {
    const name = P.shop.nameOf(line);
    const aisle = P.shop.aisleOfName(name);
    if (aisle === "Meat & fish") return POULTRY.test(name) ? "poultry" : SEAFOOD.test(name) ? "seafood" : "meat";
    return AISLE_KIND[aisle] || "general";
  }
  function kindsOf(r) {
    r = r._orig || r;                                              // a translation is priced by its original lines
    let k = kinds.get(r);
    if (!k) { k = r.ing.map(kindOfLine); kinds.set(r, k); }
    return k;
  }

  /* ---------- money ---------- */
  const cal = () => S().cal;
  const show = () => S().on !== false && !!cal();
  const mult = (kind) => cal().mult[kind] ?? cal().mult.general;
  /** What line i of recipe r costs here, at factor f of the recipe's servings. */
  const lineCost = (r, i, f = 1) => (r.cost?.[i] || 0) * f * mult(kindsOf(r)[i]);
  /** The whole recipe here, for `servings` people; null when it has no costs. */
  function recipeCost(r, servings = r.serves || 4) {
    if (!show() || !r.cost || r.cost.length !== r.ing.length) return null;
    const f = servings / (r.serves || 4);
    let total = 0;
    for (let i = 0; i < r.ing.length; i++) total += lineCost(r, i, f);
    return { total, per: total / servings };
  }
  const perCache = new WeakMap();
  /** Cost per serving here, for lists and sorting (cached per recipe and place). */
  function perServing(r) {
    if (!show() || !r.cost) return null;
    const sig = `${cal().currency}|${cal().at}`;
    const hit = perCache.get(r);
    if (hit && hit.sig === sig) return hit.v;
    const v = recipeCost(r)?.per ?? null;
    perCache.set(r, { sig, v });
    return v;
  }

  // building an Intl.NumberFormat is slow (a list of 1,100 prices took a tenth of a second): make each one once
  const formats = new Map();
  const formatter = (key, opts) => {
    if (!formats.has(key)) { try { formats.set(key, new Intl.NumberFormat(undefined, opts)); } catch { formats.set(key, null); } }
    return formats.get(key);
  };
  function fmt(x) {
    const c = cal()?.currency || "USD";
    const band = x >= 100 ? 0 : x >= 10 ? 1 : 2;
    const opts = band === 0 ? { maximumFractionDigits: 0 } : band === 1 ? { maximumFractionDigits: 1 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    const f = formatter(`${c}|${band}`, { style: "currency", currency: c, currencyDisplay: "narrowSymbol", ...opts });
    return f ? f.format(x) : `${x.toFixed(2)} ${c}`;
  }
  /** A bare amount for an ingredient line: the currency is already said at the top. */
  const amount = (x) => (x < 0.005 ? "" : x < 0.01 ? "<0.01" : formatter("amount", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x));

  const regionName = (cc) => { try { return new Intl.DisplayNames([navigator.language, "en"], { type: "region" }).of(cc) || cc; } catch { return cc; } };
  const place = () => [S().city, S().name || regionName(S().cc)].filter(Boolean).join(", ");

  /* ---------- where you are ---------- */
  let tz = null;
  const tzData = async () => (tz ||= await fetch(`/static/data/tz.json?v=${window.PLATTER.v}`).then((r) => r.json()).catch(() => ({ zones: {}, countries: [] })));
  async function guessCountry() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return (await tzData()).zones[zone] || (navigator.language.split("-")[1] || "US").toUpperCase();
  }

  async function calibrate() {
    if (busy) return;
    busy = true;
    P.emit("prices");
    try {
      const res = await fetch("/api/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country: S().cc, name: S().name || regionName(S().cc), city: S().city }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't get prices for that place.");
      S().cal = { currency: d.currency, mult: d.mult, level: d.level, rough: d.rough, at: Date.now(), for: `${S().cc}|${S().city}` };
    } catch (e) {
      if (!cal()) S().cal = { currency: "USD", mult: { general: 1 }, level: 1, at: Date.now(), for: "US|", fallback: true };
      P.toast(`Prices: ${e.message} Showing US prices for now.`, { ms: 5000 });
    } finally {
      busy = false;
      P.save();
      P.emit("prices");
    }
  }

  /** At start-up: guess the country the first time, and refresh the prices once a week. */
  async function start() {
    if (S().on === false) return;
    if (!S().cc) { S().cc = await guessCountry(); S().name = regionName(S().cc); S().guessed = true; P.save(); }
    const c = cal();
    if (!c || c.for !== `${S().cc}|${S().city}` || Date.now() - c.at > WEEK) calibrate();
  }

  /* ---------- the settings sheet ---------- */
  async function sheet() {
    const data = await tzData();
    P.sheet((close) => {
      const names = data.countries.map((cc) => [cc, regionName(cc)]).sort((a, b) => a[1].localeCompare(b[1]));
      const country = h("select", { class: "input", "aria-label": "Country" }, names.map(([cc, n]) => h("option", { value: cc, selected: cc === S().cc }, n)));
      const city = h("input", { class: "input", placeholder: "City (optional), e.g. Amman", maxlength: "60", "aria-label": "City" });
      city.value = S().city || "";
      let on = S().on !== false;
      const sw = h("button", { class: "switch", type: "button", role: "switch", "aria-checked": String(on), onClick: () => { on = !on; sw.setAttribute("aria-checked", String(on)); } });
      const note = h("p", { class: "hint", "aria-live": "polite" });
      const locate = h("button", { class: "textbtn", type: "button" }, hi("compass"), "Use my precise location");
      locate.addEventListener("click", () => {
        if (!navigator.geolocation) { note.textContent = "This browser can't share its location."; return; }
        note.textContent = "Finding you…";
        navigator.geolocation.getCurrentPosition(async ({ coords }) => {
          try {
            // one look-up of the place name for these coordinates; nothing is stored anywhere but this browser
            const u = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude.toFixed(3)}&longitude=${coords.longitude.toFixed(3)}&localityLanguage=en`;
            const g = await fetch(u).then((r) => r.json());
            if (g.countryCode) country.value = g.countryCode;
            city.value = g.city || g.locality || "";
            note.textContent = `Found you in ${[city.value, regionName(country.value)].filter(Boolean).join(", ")}.`;
          } catch { note.textContent = "Couldn't look up where that is. Pick your country instead."; }
        }, () => { note.textContent = "Location wasn't shared. Pick your country instead."; }, { timeout: 10000, maximumAge: 3600e3 });
      });
      const save = () => {
        const cc = country.value, c = city.value.trim().slice(0, 60);
        const moved = cc !== S().cc || c !== (S().city || "");
        Object.assign(S(), { cc, name: regionName(cc), city: c, on, guessed: false });
        P.save();
        close();
        if (!on) { P.emit("prices"); P.toast("Prices are off."); return; }
        if (moved || !cal()) calibrate(); else P.emit("prices");
        P.toast(moved ? `Working out prices for ${place()}…` : "Saved.");
      };
      return [
        h("h3", { class: "sheet-h" }, "Prices where you are"),
        h("p", { class: "sheet-p" }, "Recipes, your shopping list and your meal plan show what the ingredients cost where you live, in your currency. They're AI estimates of typical supermarket prices, refreshed every week."),
        h("label", { class: "field" }, h("span", { class: "label" }, "Country"), country),
        h("label", { class: "field" }, h("span", { class: "label" }, "City"), city),
        h("div", { class: "row-btns" }, locate), note,
        h("label", { class: "auto-row check" }, sw, h("span", {}, "Show prices")),
        h("div", { class: "sheet-btns" }, h("button", { class: "btn ghost", type: "button", onClick: close }, "Cancel"), h("button", { class: "btn lime", type: "button", onClick: save }, "Save")),
      ];
    }, { label: "Prices where you are" });
  }

  /** The line under a recipe's stats: what it costs here, for the servings you chose. */
  function bar(r, servings) {
    if (S().on === false || !r.cost) return null;
    if (busy && !cal()?.for?.startsWith(S().cc)) return h("div", { class: "costbar", "data-role": "cost" }, h("span", { class: "spin" }), `Working out prices for ${place()}…`);
    const c = recipeCost(r, servings);
    if (!c) return null;
    return h("div", { class: "costbar", "data-role": "cost" }, hi("coins"),
      h("span", {}, h("b", {}, `≈ ${fmt(c.total)}`), ` for ${P.plural(servings, "serving")} · `, h("b", {}, fmt(c.per)), " each"),
      h("button", { class: "costbar-where", type: "button", title: "Change where prices are for", onClick: sheet },
        cal().fallback ? "US prices" : `${place()} prices`, " · estimate"));
  }

  P.prices = {
    start, sheet, calibrate, bar, fmt, amount, lineCost, recipeCost, perServing, place, kindsOf, kindOfLine,
    /** A US-dollar amount for a line of that kind, in your money here. */
    here: (usd, line) => usd * mult(kindOfLine(line)),
    show, busy: () => busy,
    summary: () => (S().on === false ? "Off" : cal() ? `${place()} · ${cal().currency}` : "Not set"),
    /** US-dollar costs for the lines a recipe puts on the shopping list (null where it has none). */
    costsFor: (r, f, keep) => (r.cost && r.cost.length === r.ing.length ? r.ing.map((_, i) => (keep(i) ? r.cost[i] * f : null)).filter((x) => x !== null) : null),
  };
})();
