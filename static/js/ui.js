/* Platter — overlays: popovers, dialogs, toasts, the photo viewer, and a few browser helpers. */
(() => {
  const P = window.P;
  const { h } = P;
  const layer = () => document.getElementById("layer");
  let current = null;                                  // the one open popover / dialog / viewer

  P.closeOverlay = () => current && current.close();
  P.overlayOpen = () => !!current;

  /** Wire up Esc, and put focus back where it was when the thing closes. */
  const track = (nodes, onClose) => {
    const prev = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = [...nodes.pop.querySelectorAll?.(".pop-item") || []];
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
      }
    };
    const close = () => {
      if (current?.close !== close) return;
      current = null;
      document.removeEventListener("keydown", onKey, true);
      for (const n of nodes.all) n.remove();
      onClose?.();
      if (prev?.isConnected) prev.focus?.({ preventScroll: true });
    };
    document.addEventListener("keydown", onKey, true);
    current = { close };
    return close;
  };

  const place = (pop, anchor, align) => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, m = 8;
    let left = align === "left" ? r.left : r.right - pw;
    left = Math.max(m, Math.min(left, innerWidth - pw - m));
    let top = r.bottom + 8;
    if (top + ph > innerHeight - m) top = Math.max(m, r.top - ph - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  };

  /** A small menu anchored to a button. build(close) returns the nodes to show. */
  P.popover = (anchor, build, opts = {}) => {
    P.closeOverlay();
    const scrim = h("div", { class: "scrim clear" });
    const pop = h("div", { class: "popover" + (opts.class ? ` ${opts.class}` : ""), role: opts.role || "menu" });
    const close = track({ all: [scrim, pop], pop }, () => anchor?.setAttribute("aria-expanded", "false"));
    scrim.addEventListener("click", close);
    pop.append(...[build(close)].flat(Infinity).filter(Boolean));
    pop.style.visibility = "hidden";
    layer().append(scrim, pop);
    place(pop, anchor, opts.align);
    pop.style.visibility = "";
    anchor?.setAttribute("aria-expanded", "true");
    queueMicrotask(() => (pop.querySelector("[data-autofocus]") || pop.querySelector(".pop-item.on") || pop.querySelector(".pop-item"))?.focus({ preventScroll: true }));
    return { close, el: pop };
  };

  /** One row in a menu. */
  P.menuItem = ({ label, icon, on, count, danger, onClick, sub }) =>
    h("button", { class: "pop-item" + (on ? " on" : "") + (danger ? " danger" : ""), type: "button", role: "menuitem", onClick },
      icon ? h("span", { class: "pop-ic", html: P.icon(icon) }) : null,
      h("span", { class: "pop-label" }, label, sub ? h("small", {}, sub) : null),
      count != null ? h("span", { class: "count" }, count) : null,
      on ? h("span", { class: "pop-check", html: P.icon("check") }) : null);

  /** A centred dialog. build(close) returns the nodes to show. */
  P.sheet = (build, opts = {}) => {
    P.closeOverlay();
    const scrim = h("div", { class: "scrim" });
    const sheet = h("div", { class: "sheet" + (opts.class ? ` ${opts.class}` : ""), role: "dialog", "aria-modal": "true", "aria-label": opts.label || "Dialog" });
    const close = track({ all: [scrim, sheet], pop: sheet }, opts.onClose);
    if (!opts.persistent) scrim.addEventListener("click", close);
    sheet.append(...[build(close)].flat(Infinity).filter(Boolean));
    layer().append(scrim, sheet);
    queueMicrotask(() => (sheet.querySelector("[data-autofocus]") || sheet.querySelector("input, textarea, button"))?.focus({ preventScroll: true }));
    return { close, el: sheet };
  };

  P.confirm = ({ title, body, ok = "OK", cancel = "Cancel", danger = false }) =>
    new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      P.sheet((close) => [
        h("h3", { class: "sheet-h" }, title),
        body ? h("p", { class: "sheet-p" }, body) : null,
        h("div", { class: "sheet-btns" },
          h("button", { class: "btn ghost", type: "button", onClick: () => { done(false); close(); } }, cancel),
          h("button", { class: "btn " + (danger ? "danger" : "lime"), type: "button", "data-autofocus": "", onClick: () => { done(true); close(); } }, ok)),
      ], { class: "small", label: title, onClose: () => done(false) });
    });

  /** A short message at the bottom of the screen, optionally with an Undo. */
  P.toast = (msg, opts = {}) => {
    const box = document.getElementById("toasts");
    if (!box) return () => {};
    while (box.children.length >= 3) box.firstChild.remove();
    const el = h("div", { class: "toast", role: "status" }, h("span", {}, msg));
    let timer;
    const dismiss = () => { clearTimeout(timer); el.classList.remove("in"); setTimeout(() => el.remove(), 220); };
    if (opts.action) el.append(h("button", { class: "toast-act", type: "button", onClick: () => { opts.action.fn(); dismiss(); } }, opts.action.label));
    box.append(el);
    requestAnimationFrame(() => el.classList.add("in"));
    timer = setTimeout(dismiss, opts.ms || (opts.action ? 5500 : 2600));
    return dismiss;
  };

  P.lightbox = (src, alt = "") => {
    P.closeOverlay();
    const box = h("div", { class: "lightbox", role: "dialog", "aria-modal": "true", "aria-label": alt || "Photo" },
      h("img", { src, alt }),
      h("button", { class: "lb-x", type: "button", "aria-label": "Close photo", html: P.icon("x") }));
    const close = track({ all: [box], pop: box });
    box.addEventListener("click", close);
    layer().append(box);
    box.querySelector(".lb-x").focus({ preventScroll: true });
  };

  /* ---------- browser helpers ---------- */
  P.copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
    const ta = h("textarea", { style: { position: "fixed", opacity: "0", top: "0", left: "0" } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* no clipboard at all */ }
    ta.remove();
    return ok;
  };

  P.download = (name, text, mime = "application/json") => {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = h("a", { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  /** Shrink a photo the person picked so it fits comfortably in localStorage. */
  P.resizeImage = (file, max = 1000, quality = 0.82) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let q = quality, out = c.toDataURL("image/jpeg", q);
        while (out.length > 420000 && q > 0.4) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file doesn't look like an image.")); };
      img.src = url;
    });
})();
