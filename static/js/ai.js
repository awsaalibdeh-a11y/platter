/* Platter — the Ask AI pane: say what you feel like making, get a few dishes with real photos,
   pick one and it writes the full recipe into your library. */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });
  const spinner = () => h("span", { class: "spin", "aria-hidden": "true" });

  // what survives leaving the pane and coming back
  const ai = { q: "", ideas: [], note: "", loading: false, error: "", enabled: null, making: "", made: {} };
  const QUICK = ["Quick weeknight dinner", "Vegetarian", "Kid-friendly", "Uses chicken thighs", "Cheap and filling", "Under 30 minutes", "Impress guests", "Something sweet"];
  const SURPRISE = "Surprise me with something delicious for dinner tonight";

  P.ai = { prefill: (q) => { ai.q = String(q || "").slice(0, 240); } };

  const tags = () => P.tags().map((t) => ({ id: t.id, name: t.name }));
  const api = async (path, body) => {
    const res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Something went wrong. Try again.");
      err.code = data.code;
      throw err;
    }
    return data;
  };

  let ctx = null;                        // { top, scroll, close } of the pane being shown
  let live = {};                         // the parts that change without rebuilding the pane

  /* ---------- talking to the server ---------- */
  const loadPhoto = async (idea) => {
    idea.photoState = "pending";
    try {
      const d = await api(`/api/ai/photo?title=${encodeURIComponent(idea.title)}&wiki=${encodeURIComponent(idea.wiki || "")}`);
      idea.photo = d.url ? d : null;
    } catch { idea.photo = null; }
    idea.photoState = "done";
    paintCards();
  };

  async function suggest(more) {
    const q = (live.input?.value ?? ai.q).trim();
    if (q.length < 2) { live.input?.focus(); return; }
    if (ai.loading) return;
    ai.q = q;
    ai.loading = true;
    ai.error = "";
    if (!more) { ai.ideas = []; ai.note = ""; ai.made = {}; }
    build();
    try {
      const d = await api("/api/ai/ideas", { query: q, n: 4, tags: tags(), avoid: ai.ideas.map((i) => i.title), diet: P.diet.text() });
      const fresh = d.ideas.map((i) => ({ ...i, photo: null, photoState: "pending" }));
      ai.ideas = more ? [...ai.ideas, ...fresh] : fresh;
      ai.note = d.note || "";
      for (const idea of fresh) loadPhoto(idea);
    } catch (e) {
      ai.error = e.message;
      if (e.code === "off") ai.enabled = false;
    } finally {
      ai.loading = false;
      build();
    }
  }

  async function make(idea) {
    if (ai.making) return;
    ai.making = idea.title;
    ai.error = "";
    paintCards();
    try {
      const d = await api("/api/ai/recipe", { title: idea.title, blurb: idea.blurb, serves: idea.serves, query: ai.q, tags: tags(), diet: P.diet.text() });
      const tag = P.validTag(d.tag) && !P.isSpecial(d.tag) ? d.tag : P.validTag(idea.tag) ? idea.tag : "mains";
      const photo = idea.photo;
      const id = P.saveRecipe({
        title: d.title || idea.title, tag, sub: d.sub || idea.sub,
        img: photo?.url || "", cr: photo?.credit || "", crl: photo?.link || "",
        dom: "AI recipe", min: d.min || idea.min || null, serves: d.serves || idea.serves || 4, ing: d.ing, steps: d.steps,
        about: d.about, level: d.level, serve: d.serve, diet: d.diet, nut: d.nut, kcal: d.kcal, cost: d.cost,
      });
      if (d.notes) P.setNotes(id, d.notes);
      ai.made[idea.title] = id;
      P.toast(`Added to ${P.tagName(tag)}.`, { action: { label: "Undo", fn: () => { P.deleteRecipe(id); delete ai.made[idea.title]; } } });
      P.go(P.pathFor({ tag, id }));
    } catch (e) {
      ai.error = e.message;
      if (e.code === "off") ai.enabled = false;
    } finally {
      ai.making = "";
      if (P.route.mode === "ai") build();
    }
  }

  /* ---------- drawing ---------- */
  const cardEl = (idea) => {
    const madeId = ai.made[idea.title];
    const busy = ai.making === idea.title;
    const url = idea.photo && /^https:\/\//.test(idea.photo.url || "") ? idea.photo.url : "";
    const shot = url
      ? [h("img", { src: url, alt: idea.title, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" }),
        idea.photo.link ? h("a", { class: "credit", href: idea.photo.link, target: "_blank", rel: "noopener noreferrer", title: idea.photo.credit }, idea.photo.credit) : null]
      : idea.photoState === "pending" ? null : h("span", { class: "idea-ph", html: P.icon("plate") });
    return h("article", { class: "idea" },
      h("div", { class: "idea-photo" + (idea.photoState === "pending" ? " loading" : "") }, shot),
      h("div", { class: "idea-body" },
        h("h3", {}, idea.title),
        h("p", {}, idea.blurb),
        h("div", { class: "chips" },
          idea.min ? h("span", { class: "chip" }, hi("clock"), P.fmtMin(idea.min)) : null,
          h("span", { class: "chip" }, hi("tree"), P.tagName(P.validTag(idea.tag) && !P.isSpecial(idea.tag) ? idea.tag : "mains"))),
        madeId && P.recipe(madeId)
          ? h("button", { class: "btn ghost sm", type: "button", onClick: () => { const r = P.recipe(madeId); P.go(P.pathFor({ tag: r.tag, id: r.id })); } }, hi("check"), "Saved — open it")
          : h("button", { class: "btn lime sm", type: "button", disabled: !!ai.making, onClick: () => make(idea) }, busy ? spinner() : hi("book"), busy ? "Writing the recipe…" : "Make this recipe")));
  };

  function paintCards() {
    if (!live.grid || !live.grid.isConnected) return;
    const skeleton = () => h("article", { class: "idea skeleton", "aria-hidden": "true" }, h("div", { class: "idea-photo loading" }), h("div", { class: "idea-body" }, h("i"), h("i"), h("i")));
    live.grid.replaceChildren(...ai.ideas.map(cardEl), ...(ai.loading ? [skeleton(), skeleton(), skeleton(), skeleton()].slice(0, ai.ideas.length ? 2 : 4) : []));
    live.note.textContent = ai.error ? "" : ai.note;
    live.note.hidden = !!ai.error || !ai.note;
    live.error.textContent = ai.error;
    live.error.hidden = !ai.error;
    live.more.hidden = !ai.ideas.length || ai.loading;
    live.more.disabled = !!ai.making;
  }

  /** The dishes AI has written for you, newest first: easy to find again once the ideas are gone. */
  function madeWithAI() {
    if (ai.ideas.length || ai.loading) return null;
    const mine = Object.keys(P.S.user).reverse().map((id) => P.recipe(id)).filter((r) => r && /^AI /.test(r.dom || "")).slice(0, 8);
    if (!mine.length) return null;
    return h("section", { class: "ai-made" },
      h("div", { class: "sec-head" }, h("h2", { class: "section-h" }, "Made with AI"), h("span", { class: "count-note" }, P.plural(mine.length, "recipe"))),
      h("div", { class: "book-share" }, mine.map((r) => h("button", { class: "dplan-item ai-made-item", type: "button", onClick: () => P.go(P.pathFor({ tag: r.tag, id: r.id })) },
        h("span", { class: "pi-thumb" }, r.img ? h("img", { src: P.photo(r.img, "small"), alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null),
        h("span", { class: "pi-title" }, r.title),
        h("small", {}, [r.dom === "AI remix" ? "Remix" : P.tagName(r.tag), r.min ? P.fmtMin(r.min) : ""].filter(Boolean).join(" · "))))));
  }

  function build() {
    if (!ctx || !ctx.scroll.isConnected) return;
    const off = ai.enabled === false;
    const input = h("textarea", { class: "input ai-input", rows: "2", maxlength: "240", placeholder: "e.g. spicy peanut noodles in under 30 minutes", "aria-label": "What do you want to make?", disabled: off });
    input.value = ai.q;
    input.addEventListener("input", () => { ai.q = input.value; });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); suggest(false); } });
    const go = h("button", { class: "btn lime", type: "button", disabled: ai.loading || off, onClick: () => suggest(false) },
      ai.loading ? spinner() : hi("sparkle"), ai.loading ? "Thinking…" : "Suggest dishes");
    const chip = (label, fn) => h("button", { class: "ai-chip", type: "button", disabled: off, onClick: fn }, label);
    const chips = [
      ...QUICK.map((q) => chip(q, () => {
        input.value = `${input.value.replace(/[.,\s]+$/, "")}${input.value.trim() ? ", " : ""}${q.toLowerCase()}`;
        ai.q = input.value;
        input.focus();
      })),
      chip("Surprise me", () => { input.value = SURPRISE; ai.q = SURPRISE; suggest(false); }),
      h("button", { class: "ai-chip fridge", type: "button", disabled: off, onClick: () => P.aitools.fridge((d) => {
        if (!d.items.length) { P.toast("I couldn't spot any food in that photo."); return; }
        input.value = `Something for dinner using what's in my fridge: ${d.items.join(", ")}`;
        ai.q = input.value;
        suggest(false);
      }) }, hi("camera"), "From a photo of my fridge"),
    ];
    live = {
      input,
      note: h("p", { class: "ai-note", "aria-live": "polite" }),
      error: h("p", { class: "ai-error", role: "alert" }),
      grid: h("div", { class: "ai-grid" }),
      more: h("button", { class: "btn ghost", type: "button", onClick: () => suggest(true) }, hi("sparkle"), "More ideas"),
    };
    const keep = ctx.scroll.scrollTop;
    ctx.scroll.replaceChildren(h("div", { class: "recipe ai" },
      h("h1", { class: "title" }, "What do you want to make?"),
      h("p", { class: "lead" }, "Describe a craving, a diet, or what's in the fridge. You get a few dishes with photos, then the full recipe for the one you pick."),
      off ? h("div", { class: "banner" }, hi("sparkle"), h("div", {}, h("strong", {}, "AI isn't switched on for this site yet."),
        h("p", {}, "Whoever runs the site needs to add an OpenAI key (OPENAI_API_KEY) to the server. Everything else works without it."))) : null,
      P.diet.has() ? h("p", { class: "ai-diet" }, hi("leaf"), "Following your diet: ", h("b", {}, P.diet.summary()), " ", h("button", { class: "textbtn", type: "button", onClick: () => P.diet.sheet() }, "Change")) : null,
      h("div", { class: "ai-form" }, input, go),
      h("div", { class: "ai-chips" }, chips),
      live.note, live.error, live.grid,
      h("div", { class: "ai-more" }, live.more),
      madeWithAI()));
    paintCards();
    ctx.scroll.scrollTop = keep;
  }

  P.panes.ai = (top, scroll, pane) => {
    ctx = { top, scroll, close: pane.close };
    top.replaceChildren(
      h("span", { class: "tagpill ghost" }, "Ask AI"),
      h("div", { class: "acts" }, h("button", { class: "editbtn", type: "button", onClick: pane.close }, hi("check"), "Done")));
    build();
    if (ai.enabled === null) {
      api("/api/ai/status").then((d) => { ai.enabled = !!d.enabled; build(); }).catch(() => { ai.enabled = true; });
    }
    if (!ai.ideas.length && !P.isNarrow()) requestAnimationFrame(() => live.input?.focus({ preventScroll: true }));
  };
})();
