/* Platter — the recipe helper, for "I don't understand this part".

   Three ways in: select any words in a recipe and tap "Ask AI about this"; tap Explain on a step; or open the helper
   and type. The recipe (scaled to your servings, in your units) goes along as context, and the answer streams in word
   by word. Each recipe keeps its own conversation until the page is reloaded. The panel isn't modal, so the
   recipe stays scrollable and selectable while it is open. */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });

  const talks = new Map();                   // recipe id → [{ role: "me" | "ai", text, focus, err }]
  let panel = null, live = {}, current = null, ctrl = null;
  const SUGGEST = ["How do I know when it's done?", "Can I make it ahead?", "What can I swap if I'm missing something?", "Which step is trickiest, and how do I get it right?"];
  const talk = (id) => { if (!talks.has(id)) talks.set(id, []); return talks.get(id); };

  /* ---------- a small, safe markdown: **bold**, "- " and "1." lists, paragraphs ---------- */
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const md = (text) => {
    let html = "", list = null, para = [];
    const endPara = () => { if (para.length) { html += `<p>${para.join("<br>")}</p>`; para = []; } };
    const endList = () => { if (list) { html += `<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`; list = null; } };
    for (const raw of P.esc(text).split("\n")) {
      const line = raw.trim();
      const m = /^(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(line);
      if (m) {
        endPara();
        const tag = m[1] ? "ol" : "ul";
        if (!list || list.tag !== tag) { endList(); list = { tag, items: [] }; }
        list.items.push(inline(m[2]));
      } else if (!line) { endPara(); endList(); }
      else { endList(); para.push(inline(line)); }
    }
    endPara(); endList();
    return html;
  };

  /* ---------- the panel ---------- */
  function build() {
    const input = h("textarea", { class: "hp-input", rows: "1", maxlength: "500", placeholder: "Ask anything about this recipe…", "aria-label": "Your question" });
    const grow = () => { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 132)}px`; };
    input.addEventListener("input", grow);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
      if (e.key === "Escape") { e.stopPropagation(); close(); }
    });
    const sendBtn = h("button", { class: "hp-send", type: "button", "aria-label": "Send", onClick: () => (ctrl ? ctrl.abort() : submit()) });
    const submit = () => { const q = input.value.trim(); if (q) { input.value = ""; grow(); send(q); } };
    const log = h("div", { class: "hp-log", "aria-live": "polite" });
    const sub = h("small", {});
    panel = h("aside", { class: "helper", role: "dialog", "aria-label": "Recipe helper" },
      h("header", { class: "hp-head" },
        h("span", { class: "hp-badge", html: P.icon("sparkle") }),
        h("div", { class: "hp-title" }, h("b", {}, "Recipe helper"), sub),
        h("button", { class: "hp-icon", type: "button", title: "Start over", "aria-label": "Clear this conversation", html: P.icon("trash"), onClick: clear }),
        h("button", { class: "hp-icon", type: "button", title: "Close  ( Esc )", "aria-label": "Close the helper", html: P.icon("x"), onClick: close })),
      log,
      h("form", { class: "hp-form", onSubmit: (e) => { e.preventDefault(); submit(); } }, input, sendBtn));
    panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
    document.body.append(panel);
    live = { input, sendBtn, log, sub };
  }

  function paint() {
    if (!panel || !current) return;
    live.sub.textContent = current.title;
    const items = talk(current.id);
    const busy = !!ctrl;
    live.sendBtn.innerHTML = P.icon(busy ? "stop" : "arrowUp");
    live.sendBtn.setAttribute("aria-label", busy ? "Stop" : "Send");
    live.sendBtn.classList.toggle("busy", busy);
    if (!items.length) {
      live.log.replaceChildren(h("div", { class: "hp-intro" },
        h("p", {}, h("b", {}, "Stuck on a step or a word?"), " Ask me anything about this recipe. You can also select any words in it and tap ", h("em", {}, "Ask AI about this"), "."),
        h("div", { class: "hp-suggest" }, SUGGEST.map((q) => h("button", { class: "ai-chip", type: "button", onClick: () => send(q) }, q)))));
      return;
    }
    live.log.replaceChildren(...items.map(bubble));
    live.log.scrollTop = live.log.scrollHeight;
  }

  const bubble = (m) => m.role === "me"
    ? h("div", { class: "hp-msg me" }, m.focus ? h("q", {}, m.focus.length > 140 ? `${m.focus.slice(0, 140)}…` : m.focus) : null, h("p", {}, m.text))
    : h("div", { class: "hp-msg ai" + (m.err ? " err" : "") + (m.live ? " live" : ""), html: md(m.text) || '<p class="dots"><i></i><i></i><i></i></p>' });

  /** Only the answer being written changes while it streams: redraw that one bubble. */
  function paintLast(m) {
    const el = live.log?.lastElementChild;
    if (!el) return;
    const nearBottom = live.log.scrollHeight - live.log.scrollTop - live.log.clientHeight < 80;
    el.innerHTML = md(m.text) || '<p class="dots"><i></i><i></i><i></i></p>';
    if (nearBottom) live.log.scrollTop = live.log.scrollHeight;
  }

  /* ---------- asking ---------- */
  async function send(q, focus = "") {
    if (!current || ctrl) return;
    const r = current, items = talk(r.id);
    const history = items.slice(-8).map((m) => ({ role: m.role, text: m.focus ? `(about "${m.focus}") ${m.text}` : m.text }));
    items.push({ role: "me", text: q, focus });
    const ans = { role: "ai", text: "", live: true };
    items.push(ans);
    ctrl = new AbortController();
    paint();
    const servings = P.scaleOf(r), f = servings / (r.serves || 4);
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q, focus, history,
          recipe: { title: r.title, serves: servings, min: r.min, ing: r.ing.map((l) => P.scaleLine(l, f)), steps: r.steps.map((s) => P.convertText(s)), notes: P.notesOf(r.id) },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw Object.assign(new Error(d.error || "Something went wrong. Try again."), { code: d.code });
      }
      const reader = res.body.getReader(), dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        ans.text += dec.decode(value, { stream: true });
        if (current === r) paintLast(ans);
      }
    } catch (e) {
      if (e.name === "AbortError") ans.text = ans.text ? `${ans.text} …` : "Stopped.";
      else {
        ans.err = true;
        ans.text = e.code === "off" ? "AI isn't switched on for this site yet: whoever runs it needs to add an OpenAI key." : navigator.onLine ? e.message : "You're offline. The helper needs a connection.";
      }
    } finally {
      ans.live = false;
      ctrl = null;
      if (current === r) paint();
    }
  }

  function clear() { if (current) { ctrl?.abort(); talks.delete(current.id); paint(); live.input.focus(); } }

  function close() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    document.body.classList.remove("helper-open");
  }

  /* ---------- select words in a recipe → "Ask AI about this" ---------- */
  let pill = null, picked = null;
  const hidePill = () => { pill?.remove(); pill = null; picked = null; };
  const coarse = matchMedia("(pointer: coarse)");
  function onSelection() {
    const sel = getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString().replace(/\s+/g, " ").trim() : "";
    const scroll = document.getElementById("detail-scroll");
    const anchor = sel?.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    const inRecipe = anchor && (scroll?.contains(anchor) || anchor.closest(".stepper")) && !anchor.closest("textarea, input, .helper, .notes-wrap");
    const r = P.route.mode === "view" && P.recipe(P.route.id);
    if (!text || text.length < 2 || text.length > 400 || !inRecipe || !r) return hidePill();
    const block = anchor.closest(".step, .ing, .sp-text, .about, .tip, .serve");
    const whole = block ? (block.querySelector(".step-main p, .txt") || block).textContent.trim() : "";
    picked = { r, text, focus: whole && whole !== text ? whole : "" };
    if (!pill) {
      pill = h("button", { class: "askpill", type: "button", onPointerdown: (e) => e.preventDefault() }, hi("sparkle"), "Ask AI about this");
      pill.addEventListener("click", () => {
        if (!picked) return;
        const { r: rec, text: t, focus } = picked;
        const q = t.split(" ").length <= 6 ? `What does “${t}” mean here, and how do I do it?` : `Can you explain this part: “${t}”`;
        getSelection().removeAllRanges();
        hidePill();
        P.help.open(rec, { q, focus });
      });
      document.body.append(pill);
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const w = pill.offsetWidth || 170;
    const below = coarse.matches || rect.top < 70;                    // phones put their own copy menu above the words
    pill.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, rect.left + rect.width / 2 - w / 2))}px`;
    pill.style.top = `${below ? rect.bottom + 10 : rect.top - 46}px`;
  }
  document.addEventListener("selectionchange", P.debounce(onSelection, 140));
  document.addEventListener("scroll", () => pill && hidePill(), true);

  /* ---------- what the rest of the app calls ---------- */
  P.help = {
    /** Open the helper for a recipe; with q, ask it straight away. */
    open(r, { q = "", focus = "" } = {}) {
      if (!r) return;
      if (!panel) build();
      current = r;
      panel.hidden = false;
      document.body.classList.add("helper-open");
      paint();
      if (q) send(q, focus);
      else if (!coarse.matches) live.input.focus({ preventScroll: true });
    },
    close,
    isOpen: () => !!panel && !panel.hidden,
    /** The route changed: follow the recipe that is now open, or step aside when none is. */
    sync(r) {
      hidePill();
      if (!panel || panel.hidden) return;
      if (!r) return close();
      if (current?.id !== r.id) { current = r; paint(); }
    },
    md,
  };
})();
