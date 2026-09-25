/* Platter — share any recipe as a link.

   A sample recipe is shared by its address. Your own recipes and your edits live only in your browser, so for those
   the recipe itself travels inside the link: compressed, base64 in the part after #, which never reaches the server.
   Whoever opens it sees the recipe and can save a copy of their own. */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });
  const FIELDS = ["title", "tag", "sub", "img", "cr", "crl", "src", "dom", "min", "serves", "video", "ing", "steps", "about", "level", "serve", "tip", "diet", "nut", "kcal"];

  const toB64 = (bytes) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const through = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

  async function encode(r) {
    const o = {};
    for (const k of FIELDS) { const v = r[k]; if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) o[k] = v; }
    if (String(o.img || "").startsWith("data:")) { delete o.img; delete o.cr; delete o.crl; }     // an uploaded photo is too big for a link
    const json = new TextEncoder().encode(JSON.stringify(o));
    return "CompressionStream" in window ? `z${toB64(await through(json, new CompressionStream("deflate-raw")))}` : `j${toB64(json)}`;
  }
  async function decode(s) {
    const bytes = fromB64(s.slice(1));
    const json = s[0] === "z" ? await through(bytes, new DecompressionStream("deflate-raw")) : bytes;
    return JSON.parse(new TextDecoder().decode(json));
  }

  const web = (u) => (/^https:\/\//.test(String(u || "")) ? String(u) : "");
  const strs = (a, n, len) => (Array.isArray(a) ? a.filter((x) => typeof x === "string" && x.trim()).slice(0, n).map((x) => x.slice(0, len)) : []);
  /** Whatever arrived in a link is somebody else's data: keep only the fields and shapes a recipe has. */
  function clean(o) {
    const r = {
      title: String(o.title || "").slice(0, 120), tag: String(o.tag || ""), sub: String(o.sub || "").slice(0, 24), img: web(o.img),
      cr: String(o.cr || "").slice(0, 80), crl: web(o.crl), src: web(o.src), dom: String(o.dom || "").slice(0, 40), video: web(o.video),
      min: Math.max(0, Math.min(2000, +o.min || 0)) || null, serves: Math.max(1, Math.min(99, +o.serves || 4)),
      ing: strs(o.ing, 60, 200), steps: strs(o.steps, 40, 900), about: String(o.about || "").slice(0, 600),
      level: ["Easy", "Medium", "Hard"].includes(o.level) ? o.level : "", serve: String(o.serve || "").slice(0, 100),
      tip: String(o.tip || "").slice(0, 300), diet: strs(o.diet, 5, 20), kcal: +o.kcal || null,
      nut: Array.isArray(o.nut) && o.nut.length === 4 && o.nut.every((x) => Number.isFinite(+x)) ? o.nut.map((x) => +x) : null,
    };
    if (!r.title || !r.ing.length) throw new Error("incomplete");
    return r;
  }

  P.shareLink = async (r) => {
    if (!r.user && !r.edited) return `${location.origin}/#/t/${r.tag}/r/${encodeURIComponent(r.id)}`;
    return `${location.origin}/#/shared/${await encode(r)}`;
  };

  /* ---------- the page a shared link opens ---------- */
  P.panes.shared = async (top, scroll, ctx) => {
    top.replaceChildren(h("span", { class: "tagpill ghost" }, "Shared with you"),
      h("div", { class: "acts" }, h("button", { class: "btn ghost sm", type: "button", onClick: ctx.close }, "Close")));
    scroll.replaceChildren(h("div", { class: "blank" }, h("span", { class: "spin big" }), h("p", {}, "Opening the recipe…")));
    const data = P.route.data;
    let r;
    try { r = clean(await decode(data)); }
    catch {
      if (P.route.mode === "shared") scroll.replaceChildren(h("div", { class: "blank" }, hi("plate"), h("p", {}, "This link is damaged or cut short. Ask for it again.")));
      return;
    }
    if (P.route.mode !== "shared" || P.route.data !== data) return;              // they moved on while it was opening
    let savedId = null;
    const save = () => {
      if (savedId && P.recipe(savedId)) return P.go(P.pathFor({ tag: P.recipe(savedId).tag, id: savedId }));
      const tag = P.validTag(r.tag) && !P.isSpecial(r.tag) ? r.tag : P.guessTag(r.title, "", r.ing);
      savedId = P.saveRecipe({ ...r, tag, dom: r.dom || "Shared recipe" });
      P.toast("Saved to your recipes.");
      P.go(P.pathFor({ tag, id: savedId }));
    };
    const stat = (ic, v, label) => h("div", { class: "stat" }, hi(ic), h("b", {}, v), h("small", {}, label));
    scroll.replaceChildren(
      h("div", { class: "hero" + (r.img ? "" : " empty") }, r.img ? h("img", { src: P.photo(r.img), alt: r.title, referrerpolicy: "no-referrer" }) : h("span", { class: "hero-ph", html: P.icon("plate") }),
        r.cr ? h("span", { class: "credit" }, `Photo: ${r.cr}`) : null),
      h("div", { class: "recipe shared" },
        h("div", { class: "shared-bar" }, hi("share"), h("span", {}, "Someone shared this recipe with you."),
          h("button", { class: "btn lime sm", type: "button", onClick: save }, hi("plus"), "Save to my recipes")),
        h("h1", { class: "title" }, r.title),
        r.about ? h("p", { class: "about" }, r.about) : null,
        h("div", { class: "stats" }, stat("clock", r.min ? P.fmtMin(r.min) : "—", "Total time"), stat("people", String(r.serves), "Servings"),
          stat("bars", r.level || "—", "Difficulty"), stat("fire", r.kcal ? String(r.kcal) : "—", "kcal / serving")),
        r.diet.length ? h("div", { class: "chips" }, r.diet.map((d) => h("span", { class: `chip diet ${d}` }, hi(d === "spicy" ? "fire" : "leaf"), d))) : null,
        h("div", { class: "sec-head" }, h("h2", { class: "section-h" }, "Ingredients")),
        h("ul", { class: "ings" }, r.ing.map((l) => h("li", { class: "ing" }, h("span", { class: "txt" }, P.scaleLine(l, 1))))),
        h("div", { class: "sec-head" }, h("h2", { class: "section-h" }, "Directions")),
        h("ol", { class: "steps" }, r.steps.map((s, i) => h("li", { class: "step" }, h("span", { class: "step-n" }, String(i + 1)), h("div", { class: "step-main" }, h("p", {}, P.convertText(s)))))),
        r.tip ? h("div", { class: "tip" }, h("span", { class: "tip-h" }, hi("chefHat"), "Tip"), h("p", {}, r.tip)) : null,
        h("div", { class: "shop-foot" }, h("button", { class: "btn lime", type: "button", onClick: save }, hi("plus"), "Save to my recipes"))));
  };
})();
