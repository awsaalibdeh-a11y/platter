/* Platter — AI tools on recipes.

   Remix: "make it vegetarian / lighter / quicker / spicier…" or anything you type. The AI rewrites the recipe and it
   is saved as a new one next to the original, with what changed written into its notes.
   Read a recipe in: from a photo (a cookbook page, a card, handwriting, a screenshot) or from pasted text. */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });
  const MEAT_TAGS = new Set(["chicken", "poultry", "beef", "pork", "lamb", "seafood"]);

  const REMIXES = [
    ["Vegetarian", "leaf", "Make it vegetarian: no meat or fish."],
    ["Vegan", "leaf", "Make it vegan: no animal products at all."],
    ["Healthier", "sparkle", "Make it lighter and healthier: less fat, sugar and salt, more vegetables, just as satisfying."],
    ["Quicker", "clock", "Make it quicker: under 30 minutes if at all possible, with fewer steps."],
    ["Spicier", "fire", "Make it properly spicy."],
    ["Kid-friendly", "people", "Make it mild and kid-friendly: no chili heat, familiar flavours."],
    ["Dairy-free", "leaf", "Make it dairy-free."],
    ["Gluten-free", "leaf", "Make it gluten-free."],
    ["High-protein", "bars", "Make it high-protein without changing the character of the dish."],
    ["Air fryer", "flame", "Adapt it for an air fryer."],
    ["Slow cooker", "timer", "Adapt it for a slow cooker."],
    ["One pan", "plate", "Make it a one-pan or one-pot dish, with less washing up."],
  ];

  async function post(path, body) {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.code === "off" ? "AI isn't switched on for this site yet." : data.error || (navigator.onLine ? "Something went wrong. Try again." : "You're offline. This needs a connection."));
    return data;
  }

  /** A dialog that says what the AI is doing; it can't be clicked away, and the result lands either way. */
  const working = (title, sub) => P.sheet(() => [
    h("div", { class: "working" }, h("span", { class: "spin big", "aria-hidden": "true" }), h("h3", { class: "sheet-h" }, title), h("p", { class: "sheet-p" }, sub)),
  ], { persistent: true, class: "small", label: title });

  /* ---------- remix ---------- */
  function menu(anchor, r) {
    P.popover(anchor, (close) => {
      const input = h("input", { class: "input sm", placeholder: "Or say it: no cream, have coconut milk…", maxlength: "160", "aria-label": "Your own change" });
      const go = (label, how) => { close(); remix(r, how, label); };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter" && input.value.trim().length > 2) go("your change", input.value.trim()); });
      return [
        h("div", { class: "pop-h" }, "Remix with AI"),
        h("p", { class: "pop-note" }, "The AI rewrites this recipe and saves it as a new one. The original stays as it is."),
        h("div", { class: "remix-grid" }, REMIXES.map(([label, ic, how]) =>
          h("button", { class: "remix-opt", type: "button", onClick: () => go(label.toLowerCase(), how) }, hi(ic), label))),
        h("div", { class: "pop-input" }, input, h("button", { class: "btn lime sm", type: "button", onClick: () => input.value.trim().length > 2 && go("your change", input.value.trim()) }, "Remix")),
      ];
    }, { class: "wide remix", align: "left" });
  }

  async function remix(r, how, label) {
    const busy = working(`Remixing ${r.title}…`, "Rewriting the ingredients and the method. This takes about ten seconds.");
    try {
      const d = await post("/api/ai/remix", { how, diet: P.diet.text(), recipe: { title: r.title, serves: r.serves, ing: r.ing, steps: r.steps } });
      busy.close();
      const veg = (d.diet || []).includes("vegetarian");
      const tag = veg && MEAT_TAGS.has(r.tag) ? "vegetarian" : r.tag;
      const id = P.saveRecipe({
        title: d.title, tag, sub: r.sub, img: r.img, cr: r.cr, crl: r.crl, dom: "AI remix", min: d.min, serves: d.serves,
        ing: d.ing, steps: d.steps, about: d.about, level: d.level, serve: d.serve, diet: d.diet, nut: d.nut, kcal: d.kcal, tip: d.notes, cost: d.cost,
      });
      if (d.changes?.length) P.setNotes(id, `Remixed from “${r.title}” (${label}):\n${d.changes.map((c) => `• ${c}`).join("\n")}`);
      P.toast(`Saved “${d.title}” as a new recipe.`, { action: { label: "Undo", fn: () => { const back = P.recipe(r.id); P.deleteRecipe(id); if (back) P.go(P.pathFor({ tag: back.tag, id: back.id })); } } });
      P.go(P.pathFor({ tag, id }));
    } catch (e) {
      busy.close();
      P.toast(e.message, { ms: 5000 });
    }
  }

  /* ---------- read a recipe in ---------- */
  async function fromPhoto(onData) {
    const file = h("input", { type: "file", accept: "image/*" });
    file.addEventListener("change", async () => {
      const f = file.files[0];
      if (!f) return;
      let image;
      try { image = await P.resizeImage(f, 1600, 0.85); } catch (e) { P.toast(e.message); return; }
      const busy = working("Reading the recipe…", "Picking out the title, the ingredients and the steps from your photo.");
      try { const d = await post("/api/ai/extract", { image }); busy.close(); onData(d, "photo"); }
      catch (e) { busy.close(); P.toast(e.message, { ms: 5000 }); }
    });
    file.click();
  }

  function fromText(onData) {
    P.sheet((close) => {
      const ta = h("textarea", { class: "input area", rows: "10", maxlength: "14000", placeholder: "Paste the whole recipe here: the title, the ingredients and the method, in any layout.", "data-autofocus": "" });
      const msg = h("p", { class: "hint", "aria-live": "polite" });
      const go = h("button", { class: "btn lime", type: "button" }, hi("sparkle"), "Read it");
      go.addEventListener("click", async () => {
        const text = ta.value.trim();
        if (text.length < 20) { msg.textContent = "Paste a little more: the ingredients and the steps."; ta.focus(); return; }
        go.disabled = true;
        go.replaceChildren(h("span", { class: "spin" }), "Reading…");
        try { const d = await post("/api/ai/extract", { text }); close(); onData(d, "text"); }
        catch (e) { msg.textContent = e.message; msg.classList.add("err"); go.disabled = false; go.replaceChildren(hi("sparkle"), "Read it"); }
      });
      return [
        h("h3", { class: "sheet-h" }, "Paste a recipe"),
        h("p", { class: "sheet-p" }, "From a website, a message or a note. The AI sorts it into ingredients and steps, and copies it faithfully."),
        ta, msg,
        h("div", { class: "sheet-btns" }, h("button", { class: "btn ghost", type: "button", onClick: close }, "Cancel"), go),
      ];
    }, { label: "Paste a recipe" });
  }

  /* ---------- what's in the fridge? ---------- */
  function fridge(onData) {
    const file = h("input", { type: "file", accept: "image/*" });
    file.addEventListener("change", async () => {
      const f = file.files[0];
      if (!f) return;
      let image;
      try { image = await P.resizeImage(f, 1400, 0.85); } catch (e) { P.toast(e.message); return; }
      const busy = working("Looking in your fridge…", "Spotting the food you've got. This takes a few seconds.");
      try { const d = await post("/api/ai/fridge", { image }); busy.close(); onData({ ...d, image }); }
      catch (e) { busy.close(); P.toast(e.message, { ms: 5000 }); }
    });
    file.click();
  }

  P.aitools = { menu, remix, fromPhoto, fromText, fridge };
})();
