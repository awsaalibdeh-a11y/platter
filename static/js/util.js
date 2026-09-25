/* Platter — utilities: DOM helper, icon set, quantity maths for the servings scaler. */
(() => {
  const P = (window.P = {});

  P.$ = (sel, root = document) => root.querySelector(sel);
  P.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /** Tiny element builder: h("button", {class: "x", onClick: fn}, child, child…) */
  P.h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return el;
  };

  P.debounce = (fn, ms = 100) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  P.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- icons (24-unit grid, drawn in the same soft rounded style as the reference) ---------- */
  const ICONS = {
    sidebar: '<rect x="3" y="4.5" width="18" height="15" rx="3.4"/><path d="M9.6 4.5v15"/><path d="M5.7 8.6h1.9M5.7 11.2h1.9M5.7 13.8h1.9"/>',
    pencil: '<path d="M4.2 19.8l3.6-.9L19.2 7.5a2.1 2.1 0 0 0-3-3L4.9 16.2l-.7 3.6z"/><path d="M14.7 6l3.3 3.3"/>',
    slash: '<path d="M18.5 5.5l-13 13"/>',
    folder: '<path d="M3.5 7.4A2.3 2.3 0 0 1 5.8 5.1h3.4l2.1 2.3h7a2.3 2.3 0 0 1 2.3 2.3v7.5a2.3 2.3 0 0 1-2.3 2.3H5.8a2.3 2.3 0 0 1-2.3-2.3V7.4z"/>',
    people: '<circle cx="9" cy="8.2" r="3.1"/><path d="M3.3 19.4c.4-3.2 2.7-5 5.7-5s5.3 1.8 5.7 5"/><circle cx="17.2" cy="9.2" r="2.5"/><path d="M15.7 14.6c2.7-.3 4.6 1.3 5 4.3"/>',
    peopleFill: '<circle cx="9" cy="8.2" r="3.3" fill="currentColor"/><path d="M2.6 19.6c.3-3.5 2.8-5.6 6.4-5.6s6.1 2.1 6.4 5.6z" fill="currentColor"/><circle cx="17.3" cy="9.3" r="2.6" fill="currentColor"/><path d="M15.6 14.3c3.2-.4 5.4 1.3 5.8 5.3h-4.2c-.1-2.1-.6-3.9-1.6-5.3z" fill="currentColor"/>',
    plus: '<path d="M12 5.2v13.6M5.2 12h13.6"/>',
    minus: '<path d="M5.5 12h13"/>',
    arrowUp: '<path d="M12 19V5.2M6.2 10.8L12 5l5.8 5.8"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.6"/><path d="M15.8 15.8l4.7 4.7"/>',
    printer: '<path d="M7 9V3.8h10V9"/><rect x="3.4" y="9" width="17.2" height="8.6" rx="2.3"/><rect x="7" y="14" width="10" height="6.4" rx="1.2"/><path d="M9.6 16.6h4.8"/>',
    share: '<path d="M12 15.2V3.6M8.2 7.3L12 3.5l3.8 3.8"/><path d="M8.4 10.4H7a2.3 2.3 0 0 0-2.3 2.3v5.6A2.3 2.3 0 0 0 7 20.6h10a2.3 2.3 0 0 0 2.3-2.3v-5.6A2.3 2.3 0 0 0 17 10.4h-1.4"/>',
    copy: '<rect x="8.6" y="8.6" width="11.4" height="11.8" rx="2.3"/><path d="M15.4 8.6V6.4a2.3 2.3 0 0 0-2.3-2.3H6.5a2.3 2.3 0 0 0-2.3 2.3v7.7a2.3 2.3 0 0 0 2.3 2.3h2.1"/>',
    star: '<path d="M12 3.7l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.9l5.9-.8L12 3.7z"/>',
    clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 1.9"/>',
    doc: '<path d="M6.6 3.5h7l4 4v11.9a1.6 1.6 0 0 1-1.6 1.6H6.6A1.6 1.6 0 0 1 5 19.4V5.1a1.6 1.6 0 0 1 1.6-1.6z"/><path d="M13.4 3.6v4.1h4.1"/>',
    tree: '<circle cx="6.2" cy="7.2" r="1.9" fill="currentColor"/><path d="M11 7.2h8.6"/><circle cx="6.2" cy="16.6" r="1.9"/><path d="M11 16.6h8.6"/>',
    expand: '<path d="M14.2 4H20v5.8M9.8 20H4v-5.8M19.8 4.2l-6.6 6.6M4.2 19.8l6.6-6.6"/>',
    play: '<path d="M8 5.6v12.8l10.6-6.4L8 5.6z" fill="currentColor" stroke="none"/>',
    chevron: '<path d="M14.8 5.2L8 12l6.8 6.8"/>',
    chevronRight: '<path d="M9.2 5.2L16 12l-6.8 6.8"/>',
    check: '<path d="M5.2 12.6l4.4 4.4L18.8 7.6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4.6 7h14.8M9.4 7V4.6h5.2V7M6.6 7l.8 11.9a1.9 1.9 0 0 0 1.9 1.7h5.4a1.9 1.9 0 0 0 1.9-1.7L17.4 7M10 11v6M14 11v6"/>',
    dots: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>',
    link: '<path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l3-3a3.6 3.6 0 0 0-5.1-5.1l-1 1"/><path d="M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-3 3a3.6 3.6 0 0 0 5.1 5.1l1-1"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.6"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17.5l4.7-4.3 3.6 3.2 3-2.7 4.7 4.2"/>',
    download: '<path d="M12 4v11M7.8 11l4.2 4.2 4.2-4.2M5 19.5h14"/>',
    upload: '<path d="M12 15.5V4.6M7.8 8.7L12 4.5l4.2 4.2M5 19.5h14"/>',
    timer: '<circle cx="12" cy="13.2" r="7.4"/><path d="M12 9.2v4.2l2.6 1.6M9.6 3h4.8"/>',
    flame: '<path d="M12 3.5c.6 3.2 4.5 4.8 4.5 9.2a4.5 4.5 0 0 1-9 0c0-1.7.8-2.9 1.7-3.9.3 1.3 1 2 1.8 2.4C11 8.5 10.8 6 12 3.5z"/>',
    sort: '<path d="M7 5v14M3.8 8.2L7 5l3.2 3.2M17 19V5M13.8 15.8L17 19l3.2-3.2"/>',
    book: '<path d="M5 4.6h9.6a3.4 3.4 0 0 1 3.4 3.4v12H8.4A3.4 3.4 0 0 1 5 16.6V4.6z"/><path d="M5 16.6A3.4 3.4 0 0 1 8.4 13.2H18"/>',
    clockArrow: '<path d="M4.6 12a7.4 7.4 0 1 0 2.2-5.2L4.4 9.2"/><path d="M4.4 4.8v4.4h4.4M12 8v4.2l2.8 1.7"/>',
    plate: '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.6"/>',
    sparkle: '<path d="M11 3.6l1.9 5.1 5.1 1.9-5.1 1.9L11 17.6l-1.9-5.1L4 10.6l5.1-1.9L11 3.6z"/><path d="M18.4 14.6l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/>',
    cart: '<circle cx="9.5" cy="19.6" r="1.4"/><circle cx="17.5" cy="19.6" r="1.4"/><path d="M2.8 4h2.6l2.2 10.9a1.7 1.7 0 0 0 1.7 1.4h7.6a1.7 1.7 0 0 0 1.7-1.3L20.6 8H6.2"/>',
    basket: '<path d="M4 9.5h16l-1.6 9a1.8 1.8 0 0 1-1.8 1.5H7.4a1.8 1.8 0 0 1-1.8-1.5L4 9.5z"/><path d="M8 9.5l3-5.5M16 9.5l-3-5.5"/>',
  };
  P.icon = (name, cls = "") =>
    `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  P.hydrateIcons = (root = document) => {
    for (const el of root.querySelectorAll("[data-icon]")) el.innerHTML = P.icon(el.dataset.icon);
  };

  /* ---------- small formatters ---------- */
  P.fmtMin = (m) => {
    m = Math.round(m || 0);
    if (!m) return "";
    const h = Math.floor(m / 60), r = m % 60;
    return h ? (r ? `${h} hr ${r} min` : `${h} hr`) : `${r} min`;
  };
  P.domainOf = (url) => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  };
  P.plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

  /** Route a themealdb photo to the size that fits the surface; anything else passes through. */
  P.photo = (url, size) => {
    if (!url) return "";
    return /themealdb\.com\/images\/media\/meals\//.test(url) && size ? `${url}/${size}` : url;
  };

  /* ---------- quantities: "1 1/2 cups flour" ⇄ {q, unit, rest} ---------- */
  const UNI = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875 };
  const FRACS = [[1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"], [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"]];
  const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?\s*[½⅓⅔¼¾⅛⅜⅝⅞]|[½⅓⅔¼¾⅛⅜⅝⅞]|\d+(?:[.,]\d+)?)`;
  const LEAD = new RegExp(String.raw`^\s*(${NUM})(?:\s*(?:-|–|—|to)\s*(${NUM}))?`, "i");

  const PLURALS = [
    ["cup", "cups"], ["tablespoon", "tablespoons"], ["teaspoon", "teaspoons"], ["clove", "cloves"], ["slice", "slices"],
    ["can", "cans"], ["tin", "tins"], ["stick", "sticks"], ["sprig", "sprigs"], ["piece", "pieces"], ["pinch", "pinches"],
    ["bunch", "bunches"], ["fillet", "fillets"], ["jar", "jars"], ["pack", "packs"], ["packet", "packets"], ["sheet", "sheets"],
    ["head", "heads"], ["stalk", "stalks"], ["bulb", "bulbs"], ["rasher", "rashers"], ["handful", "handfuls"], ["dash", "dashes"],
    ["knob", "knobs"], ["sachet", "sachets"], ["bottle", "bottles"], ["pint", "pints"], ["quart", "quarts"], ["gallon", "gallons"],
    ["litre", "litres"], ["liter", "liters"], ["ounce", "ounces"], ["pound", "pounds"], ["drop", "drops"], ["cube", "cubes"],
    ["leaf", "leaves"], ["bag", "bags"], ["block", "blocks"], ["ball", "balls"], ["punnet", "punnets"], ["carton", "cartons"],
    ["tub", "tubs"], ["strip", "strips"], ["wedge", "wedges"], ["floret", "florets"], ["rib", "ribs"], ["ear", "ears"],
  ];
  const FIXED = ["tsp", "tbsp", "tbs", "tbls", "tblsp", "oz", "lb", "lbs", "g", "kg", "mg", "ml", "l", "cl", "dl"];
  const TIGHT_OK = new Set(["g", "kg", "mg", "ml", "l", "cl", "dl", "oz", "lb", "lbs"]);
  const UNIT = {};
  for (const [one, many] of PLURALS) { UNIT[one] = { one, many }; UNIT[many] = { one, many }; }
  for (const w of FIXED) UNIT[w] = { one: w, many: w };

  const num = (s) => {
    s = s.trim().replace(",", ".");
    let m;
    if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
    if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
    if ((m = s.match(/^(\d+(?:\.\d+)?)\s*([½⅓⅔¼¾⅛⅜⅝⅞])$/))) return +m[1] + UNI[m[2]];
    if (UNI[s]) return UNI[s];
    const n = parseFloat(s);
    return Number.isNaN(n) ? null : n;
  };

  /** 1.5 → "1 ½", 0.333 → "⅓", 250 → "250", 2.35 → "2.4" — the way a recipe card writes it. */
  const fmt = (v) => {
    if (!Number.isFinite(v)) return "";
    if (v >= 10) return String(Math.round(v));
    const whole = Math.floor(v + 1e-9), frac = v - whole;
    if (frac < 0.03) return String(whole);
    if (frac > 0.97) return String(whole + 1);
    let best = null;
    for (const [f, ch] of FRACS) {
      const d = Math.abs(frac - f);
      if (!best || d < best.d) best = { d, ch };
    }
    if (best.d < 0.045) return (whole ? `${whole} ` : "") + best.ch;
    return String(Math.round(v * 10) / 10);
  };

  const parse = (line) => {
    const m = LEAD.exec(line);
    if (!m) return null;
    const q = num(m[1]);
    if (q == null) return null;
    const q2 = m[2] ? num(m[2]) : null;
    let rest = line.slice(m[0].length);
    const tight = /^[A-Za-z]/.test(rest);
    rest = rest.replace(/^\s+/, "");
    const um = /^([A-Za-z]+)\.?(?=\s|$|,|\/|\))/.exec(rest);
    let unit = null;
    if (um && UNIT[um[1].toLowerCase()]) {
      unit = UNIT[um[1].toLowerCase()];
      rest = rest.slice(um[0].length).replace(/^\s+/, "");
    }
    if (tight && !(unit && TIGHT_OK.has(unit.one))) return null;     // "2x", "3rd": not a quantity
    return { q, q2, unit, tight, rest };
  };

  // the shopping list needs the same reading of a line the scaler uses
  P.parseLine = parse;
  P.fmtQty = fmt;
  P.units = UNIT;
  P.panes = {};                                   // the modules that draw a whole pane register here

  /** Scale a printed ingredient line by `factor`; lines without a leading quantity pass through. */
  P.scaleLine = (line, factor = 1) => {
    const p = parse(line);
    if (!p) return line;
    let q = p.q * factor, q2 = p.q2 == null ? null : p.q2 * factor;
    if (!p.unit && !p.tight && factor !== 1) {
      // a count of things: nobody wants 4 ⅔ chicken thighs
      const tidy = (v) => (v >= 3 ? Math.round(v) : v >= 2 ? Math.round(v * 2) / 2 : v);
      q = tidy(q);
      if (q2 != null) q2 = tidy(q2);
    }
    const many = (q2 ?? q) > 1.0001;
    const unit = p.unit ? (many ? p.unit.many : p.unit.one) : "";
    const qty = fmt(q) + (q2 == null ? "" : `–${fmt(q2)}`);
    return qty + (unit ? (p.tight ? "" : " ") + unit : "") + (p.rest ? " " + p.rest : "");
  };

  /** Is there something to scale? (the UI greys the pill out for a recipe with no quantities) */
  P.hasQuantities = (lines) => lines.some((l) => parse(l));

  /* ---------- text export (copy button, share sheet) ---------- */
  P.recipeText = (r, servings) => {
    const f = servings && r.serves ? servings / r.serves : 1;
    const bits = [];
    if (servings) bits.push(`Serves ${servings}`);
    if (r.min) bits.push(P.fmtMin(r.min));
    if (r.dom) bits.push(r.dom);
    return [
      r.title,
      bits.join(" · "),
      "",
      "INGREDIENTS",
      ...r.ing.map((l) => `- ${P.scaleLine(l, f)}`),
      "",
      "DIRECTIONS",
      ...r.steps.map((s, i) => `${i + 1}. ${s}`),
      r.src ? `\nSource: ${r.src}` : "",
    ].join("\n").trim();
  };

  /** Best-guess tag for a recipe that arrives without one (an imported link). */
  P.guessTag = (title = "", category = "", ing = []) => {
    const t = `${title} ${category}`.toLowerCase();
    const all = `${t} ${ing.join(" ")}`.toLowerCase();
    if (/\b(soup|chowder|bisque|broth|stew)\b/.test(t)) return "soup";
    if (/\b(salad|slaw)\b/.test(t)) return "salad";
    if (/\b(pasta|spaghetti|noodle|ramen|lasagn|macaroni|penne|linguine|fettuccine|pad thai)\b/.test(t)) return "pasta";
    if (/\b(dessert|cake|cookie|brownie|pie|tart|pudding|ice cream|cupcake|muffin|fudge|cheesecake)\b/.test(t)) return "desserts";
    if (/\b(breakfast|pancake|waffle|omelet|omelette|granola|oatmeal|french toast)\b/.test(t)) return "breakfast";
    if (/\b(appetizer|starter|dip|hummus|bruschetta|nachos|canap)/.test(t)) return "appetizers";
    if (/\b(chicken|turkey|duck)\b/.test(t)) return "poultry";
    if (/\b(beef|steak|brisket|burger|meatball|meatloaf)\b/.test(t)) return "beef";
    if (/\b(salmon|shrimp|prawn|fish|tuna|cod|crab|lobster|scallop|seafood)\b/.test(t)) return "seafood";
    if (/\b(pork|bacon|ham|sausage|ribs)\b/.test(t)) return "pork";
    if (/\b(lamb|mutton|goat)\b/.test(t)) return "lamb";
    if (/\b(vegetarian|vegan|tofu|veggie|lentil|chickpea)\b/.test(all)) return "vegetarian";
    if (/\b(side|potato|rice|slaw)\b/.test(t)) return "sides";
    return "mains";
  };
})();
