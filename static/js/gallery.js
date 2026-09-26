/* Platter — more photos of every dish: the gallery at the top of a recipe, and the full-screen viewer.

   A recipe's photos are, in order: its cover, the ones you added (kept in this browser, and in the backup), and
   more real photographs of the dish found online. Those come from GET /api/photos, which looks in Wikipedia,
   Wikimedia Commons, Openverse and TheMealDB, checks each against the dish's name, and says whose photo it is.
   The lookup waits a moment after a recipe opens, so flicking through the list with j/k doesn't ask for each one. */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });
  const MAX_OWN = 8;                                   // your photos per recipe; each is ~150 KB of this browser's storage
  const found = new Map();                             // recipe id → photos found online, this visit
  const asking = new Map();                            // recipe id → the lookup on its way
  const pos = new Map();                               // recipe id → the photo you were on, so a redraw keeps your place
  const calm = matchMedia("(prefers-reduced-motion: reduce)");

  /** "https://en.wikipedia.org/wiki/Butter_chicken" → "Butter chicken": the article a photo credit points at. */
  const wikiOf = (r) => {
    const m = /^https:\/\/en\.wikipedia\.org\/wiki\/([^?#]+)/.exec(r.crl || "");
    try { return m ? decodeURIComponent(m[1]).replace(/_/g, " ") : ""; } catch { return ""; }
  };

  /** Every photo of the recipe, its cover first: { src, credit, link, own, at }. */
  function photos(r) {
    const list = [];
    if (r.img) list.push({ src: r.img, credit: r.cr || "", link: r.crl || "", cover: true });
    for (const p of P.S.photos[r.id] || []) list.push({ src: p.src, credit: "", own: true, at: p.at });
    for (const p of found.get(r.id) || []) if (p.url !== r.img) list.push({ src: p.url, credit: p.credit || "", link: p.link || "" });
    return list;
  }

  function lookup(r) {
    if (found.has(r.id)) return Promise.resolve(found.get(r.id));
    if (asking.has(r.id)) return asking.get(r.id);
    const q = new URLSearchParams({ title: r.title.slice(0, 80) });
    const wiki = wikiOf(r);
    if (wiki) q.set("wiki", wiki);
    if (/^https:\/\//.test(r.img || "")) q.set("have", r.img.slice(0, 400));
    const job = fetch(`/api/photos?${q}`)
      .then((res) => (res.ok ? res.json() : { photos: [] }))
      .catch(() => ({ photos: [] }))
      .then((d) => {
        const list = (Array.isArray(d.photos) ? d.photos : []).filter((p) => /^https:\/\//.test(p?.url || "")).slice(0, 8);
        found.set(r.id, list);
        asking.delete(r.id);
        return list;
      });
    asking.set(r.id, job);
    return job;
  }

  const creditEl = (p) => {
    if (p.own) return h("span", { class: "credit own" }, hi("people"), "Your photo");
    if (!p.credit) return null;
    const attrs = p.link ? { href: p.link, target: "_blank", rel: "noopener noreferrer" } : {};
    return h(p.link ? "a" : "span", { class: "credit", title: p.credit, ...attrs, onClick: (e) => e.stopPropagation() }, `Photo: ${p.credit}`);
  };

  /* ---------- the gallery on the recipe page ---------- */
  function el(r) {
    const root = h("div", { class: "gal", "data-id": r.id });
    const waiting = () => !found.has(r.id) && navigator.onLine && !!r.title;
    root._draw = () => draw(root, r, waiting());
    draw(root, r, waiting());
    if (waiting()) {
      setTimeout(() => {
        if (!root.isConnected) return;                                            // they've already moved on
        lookup(r).then(() => { if (root.isConnected) root._draw(); });
      }, 380);
    }
    return root;
  }

  function draw(root, r, loading) {
    const list = photos(r), n = list.length;
    let index = Math.min(pos.get(r.id) || 0, Math.max(0, n - 1));
    const fav = P.isFav(r.id);

    const track = h("div", { class: "gal-track", role: "group", "aria-roledescription": "carousel", "aria-label": `Photos of ${r.title}`, tabindex: n > 1 ? "0" : null });
    list.forEach((p, i) => {
      const slide = h("figure", { class: "gal-slide", "aria-label": `Photo ${i + 1} of ${n}` },
        h("img", { src: P.photo(p.src), alt: i ? `${r.title}, photo ${i + 1}` : r.title, decoding: "async", loading: i ? "lazy" : "eager", fetchpriority: i ? null : "high", draggable: "false" }),
        creditEl(p));
      slide.addEventListener("click", () => viewer(r, i));
      track.append(slide);
    });
    const count = h("span", { class: "gal-count", "aria-live": "polite" }, hi("images"), h("b", {}, `${index + 1} / ${n}`));
    const arrow = (dir) => h("button", {
      class: `gal-arrow ${dir < 0 ? "prev" : "next"}`, type: "button", "aria-label": dir < 0 ? "Previous photo" : "Next photo",
      html: P.icon(dir < 0 ? "chevron" : "chevronRight"), onClick: (e) => { e.stopPropagation(); go(index + dir); },
    });
    const hero = h("div", { class: "hero gal-hero" + (n ? "" : " empty") },
      n ? track : h("button", { class: "hero-ph add", type: "button", onClick: () => add(r) }, hi("camera"), h("span", {}, "Add a photo")),
      n > 1 ? [arrow(-1), arrow(1), count] : null,
      n === 1 && !loading ? h("button", { class: "gal-add-chip", type: "button", title: "Add a photo of how yours turned out", onClick: (e) => { e.stopPropagation(); add(r); } }, hi("camera"), "Add photo") : null,
      h("div", { class: "hero-btns" },
        h("button", { class: "starbtn fav" + (fav ? " on" : ""), type: "button", "aria-pressed": String(fav), "aria-label": "Favorite", title: "Favorite  ( F )", html: P.icon("star"), onClick: (e) => { e.stopPropagation(); P.toggleFav(r.id); } })));

    const thumbs = n > 1 || loading ? h("div", { class: "gal-thumbs", role: "tablist", "aria-label": "Photos" },
      list.map((p, i) => h("button", {
        class: "gal-th" + (i === index ? " on" : ""), type: "button", role: "tab", "aria-selected": String(i === index),
        "aria-label": `Photo ${i + 1}${p.own ? ", yours" : ""}`, onClick: () => go(i),
      }, h("img", { src: P.photo(p.src, "small"), alt: "", loading: "lazy", decoding: "async", draggable: "false" }), p.own ? h("span", { class: "gal-own", html: P.icon("people") }) : null)),
      loading ? [1, 2, 3].map(() => h("span", { class: "gal-th sk", "aria-hidden": "true" })) : null,
      h("button", { class: "gal-th add", type: "button", title: "Add a photo of yours", onClick: () => add(r) }, hi("camera"), h("span", {}, "Add"))) : null;

    root.replaceChildren(...[hero, thumbs].filter(Boolean));
    root.classList.toggle("many", n > 1);

    // which photo is showing follows the swipe, the arrows and the thumbnails alike
    const mark = (i) => {
      index = i;
      pos.set(r.id, i);
      count.querySelector("b").textContent = `${i + 1} / ${n}`;
      hero.classList.toggle("first", i === 0);
      hero.classList.toggle("last", i === n - 1);
      if (!thumbs) return;
      const all = thumbs.querySelectorAll(".gal-th:not(.sk):not(.add)");
      all.forEach((t, k) => { t.classList.toggle("on", k === i); t.setAttribute("aria-selected", String(k === i)); });
      const t = all[i];
      if (t) thumbs.scrollTo({ left: t.offsetLeft - thumbs.clientWidth / 2 + t.clientWidth / 2, behavior: calm.matches ? "auto" : "smooth" });
    };
    const go = (i) => {
      const k = Math.max(0, Math.min(n - 1, i));
      track.scrollTo({ left: k * track.clientWidth, behavior: calm.matches ? "auto" : "smooth" });
      mark(k);
    };
    let raf = 0;
    track.addEventListener("scroll", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { const i = Math.round(track.scrollLeft / (track.clientWidth || 1)); if (i !== index) mark(i); });
    }, { passive: true });
    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
      else if (e.key === "Enter") { e.preventDefault(); viewer(r, index); }
    });
    hero.classList.toggle("first", index === 0);
    hero.classList.toggle("last", index === n - 1);
    if (index) requestAnimationFrame(() => { track.scrollLeft = index * track.clientWidth; });
  }

  /** Redraw every gallery of this recipe that is on screen (after you add or remove a photo). */
  const refresh = (id) => { for (const g of document.querySelectorAll(".gal")) if (g.dataset.id === id) g._draw?.(); };

  /* ---------- your own photos ---------- */
  function add(r) {
    const input = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
    input.addEventListener("change", async () => {
      const files = [...(input.files || [])];
      input.remove();
      let added = 0;
      for (const f of files) {
        const mine = (P.S.photos[r.id] ||= []);
        if (mine.length >= MAX_OWN) { P.toast(`That's the most a recipe can keep: ${MAX_OWN} of your photos.`); break; }
        let src;
        try { src = await P.resizeImage(f, 1000, 0.8); } catch (e) { P.toast(e.message); continue; }
        mine.push({ src, at: Date.now() });
        if (!P.saveNow()) {
          mine.pop();
          if (!mine.length) delete P.S.photos[r.id];
          P.toast("Your browser's storage is full. Remove a photo or two, then try again.", { ms: 5000 });
          break;
        }
        added++;
      }
      if (!added) return;
      pos.set(r.id, (r.img ? 1 : 0) + P.S.photos[r.id].length - 1);          // show the one you just added
      refresh(r.id);
      P.toast(added === 1 ? "Added your photo." : `Added ${added} photos.`, { action: { label: "View", fn: () => viewer(r, pos.get(r.id)) } });
    });
    document.body.append(input);                         // some browsers only open a picker for an input in the page
    input.click();
  }

  function removeOwn(r, at) {
    const mine = P.S.photos[r.id] || [];
    const k = mine.findIndex((p) => p.at === at);
    if (k < 0) return;
    const [gone] = mine.splice(k, 1);
    if (!mine.length) delete P.S.photos[r.id];
    P.save();
    pos.set(r.id, 0);
    refresh(r.id);
    P.toast("Removed your photo.", { action: { label: "Undo", fn: () => { (P.S.photos[r.id] ||= []).splice(k, 0, gone); P.save(); refresh(r.id); } } });
  }

  /* ---------- full screen: swipe, arrow keys, and every photo's credit ---------- */
  function viewer(r, start = 0) {
    const list = photos(r);
    if (!list.length) return;
    let i = start;
    const img = h("img", { class: "vw-img", alt: "", draggable: "false" });
    const count = h("span", { class: "vw-count" });
    const cap = h("div", { class: "vw-cap" });
    const rm = h("button", { class: "vw-btn", type: "button" }, hi("trash"), "Remove my photo");
    const show = (k, dir = 0) => {
      i = (k + list.length) % list.length;
      const p = list[i];
      img.classList.remove("in", "from-l", "from-r");
      void img.offsetWidth;                                        // restart the slide-in
      img.src = P.photo(p.src);
      img.alt = `${r.title}, photo ${i + 1} of ${list.length}`;
      img.classList.add("in", dir > 0 ? "from-r" : dir < 0 ? "from-l" : "fade");
      count.textContent = `${i + 1} / ${list.length}`;
      cap.replaceChildren(...[creditEl(p)].filter(Boolean));
      rm.hidden = !p.own;
      for (const d of [1, -1]) { const q = list[(i + d + list.length) % list.length]; if (q && q !== p) new Image().src = P.photo(q.src); }
    };
    const many = list.length > 1;
    const nav = (dir) => h("button", { class: `vw-nav ${dir < 0 ? "prev" : "next"}`, type: "button", "aria-label": dir < 0 ? "Previous photo" : "Next photo", html: P.icon(dir < 0 ? "chevron" : "chevronRight"), onClick: (e) => { e.stopPropagation(); show(i + dir, dir); } });
    const onKey = (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); show(i + 1, 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); show(i - 1, -1); }
    };
    const box = P.fullscreen((close) => {
      rm.addEventListener("click", (e) => { e.stopPropagation(); const p = list[i]; close(); removeOwn(r, p.at); });
      return [
        h("div", { class: "vw-bar" },
          h("div", { class: "vw-title" }, h("b", {}, r.title), many ? count : null),
          h("button", { class: "vw-x", type: "button", "aria-label": "Close photos", html: P.icon("x"), onClick: close })),
        h("div", { class: "vw-stage" }, many ? nav(-1) : null, img, many ? nav(1) : null),
        h("div", { class: "vw-foot" }, cap, rm),
      ];
    }, { class: "viewer", label: `Photos of ${r.title}`, onClose: () => document.removeEventListener("keydown", onKey) });
    document.addEventListener("keydown", onKey);
    // a tap on the dark around the photo closes it; a swipe sideways goes to the next one
    const stage = box.el.querySelector(".vw-stage");
    stage.addEventListener("click", (e) => { if (e.target === stage) box.close(); });
    let x0 = null, y0 = 0;
    stage.addEventListener("pointerdown", (e) => { x0 = e.clientX; y0 = e.clientY; });
    stage.addEventListener("pointerup", (e) => {
      if (x0 == null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      if (many && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) show(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    });
    show(i);
    box.el.querySelector(".vw-x").focus({ preventScroll: true });
  }

  P.gallery = { el, photos, add, viewer, lookup };
})();
