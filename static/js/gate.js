/* Platter — the door: "What's the name of Platter's creator?"

   The first time someone opens Platter it asks. The right name opens it for good. A wrong one gives them
   30 minutes (a timer in the corner, and they can answer again any time), then Platter closes behind a lock
   screen that stays, reload after reload, until they name the creator.

   The state lives under its own key, so a backup, a restore or "clear everything" never touches it:
     { ok: true }          answered right
     { wrongAt: <ms> }     answered wrong at that moment; the 30 minutes run from then
   The inline script in <head> reads the same key before the first paint, so a locked visitor never sees the
   recipes flash up. Like everything else in Platter this lives in the browser; it is a door, not a vault. */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });
  const KEY = "platter.gate";
  const TRIAL = 30 * 60 * 1000;
  const NAME = atob("YXdz");                   // kept out of plain sight in the page source

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
  const store = () => { try { localStorage.setItem(KEY, JSON.stringify(g)); } catch { /* private mode: this visit only */ } };
  let g = load();

  const status = () => (g.ok ? "ok" : !g.wrongAt ? "ask" : Date.now() - g.wrongAt >= TRIAL ? "locked" : "trial");
  const mark = () => { document.documentElement.dataset.gate = status(); };
  /** "Aws", "aws", " AWS ", "Aws!" and "Aws Libdeh" all count; case never matters. */
  const isRight = (text) => (String(text).toLowerCase().replace(/[^a-z\s]/g, " ").trim().split(/\s+/)[0] || "") === NAME;

  let door = null, chip = null, tick = 0, warned = {};

  /* ---------- the card in the middle of the screen ---------- */
  function openDoor(mode) {                    // "ask" (first visit), "retry" (during the 30 minutes), "locked"
    closeDoor();
    const input = h("input", { class: "input", type: "text", placeholder: "The creator's name", "aria-label": "The creator's name", autocomplete: "off", spellcheck: "false", enterkeyhint: "go", maxlength: "60" });
    const msg = h("p", { class: "gate-msg", role: "alert" });
    const card = h("div", { class: "gate-card" });
    const submit = (e) => {
      e?.preventDefault();
      const answer = input.value.trim();
      if (!answer) { input.focus(); return; }
      if (isRight(answer)) return welcome(card);
      if (mode === "ask") return wrongFirst(card);
      msg.textContent = mode === "locked" ? "Still not it. Platter stays closed." : "Still not it. Your timer keeps running.";
      card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
      input.select();
    };
    const copy = {
      ask: ["Welcome to Platter", "Before you come in: what's the name of Platter's creator?"],
      retry: ["Know the name now?", "Name Platter's creator and the timer goes away for good."],
      locked: ["Platter is closed", "Your 30 minutes are up. It opens again when you name its creator."],
    }[mode];
    card.append(...[                              // DOM append() would print a null as the text "null"
      mode === "locked" ? h("span", { class: "gate-badge lock", html: P.icon("lock") }) : h("span", { class: "gate-badge", html: document.querySelector(".logo")?.innerHTML || "" }),
      h("h2", {}, copy[0]), h("p", {}, copy[1]),
      h("form", { class: "gate-form", onSubmit: submit }, input, h("button", { class: "btn lime", type: "submit" }, "Enter")),
      msg,
      mode === "retry" ? h("button", { class: "textbtn", type: "button", onClick: closeDoor }, "Keep looking around") : null,
    ].filter(Boolean));
    door = h("div", { class: "gate", role: "dialog", "aria-modal": "true", "aria-label": copy[0] }, card);
    door.addEventListener("keydown", (e) => { if (e.key === "Escape" && mode === "retry") closeDoor(); e.stopPropagation(); });
    document.body.append(door);
    setTimeout(() => input.focus(), 30);
  }

  function closeDoor() { door?.remove(); door = null; }

  function welcome(card) {
    g = { ok: true, at: Date.now() };
    store(); mark(); stopTimer();
    card.replaceChildren(h("span", { class: "gate-badge ok", html: P.icon("check") }), h("h2", {}, "That's right. Come on in!"), h("p", {}, "Platter is all yours."));
    setTimeout(closeDoor, 1100);
  }

  function wrongFirst(card) {
    g = { wrongAt: Date.now() };
    store();
    card.replaceChildren(
      h("span", { class: "gate-badge lock", html: P.icon("timer") }),
      h("h2", {}, "That's not it"),
      h("p", {}, "You can use Platter for 30 minutes. After that it closes until you name its creator. You can answer again any time from the timer in the corner."),
      h("button", { class: "btn lime", type: "button", "data-go": "", onClick: () => { closeDoor(); mark(); startTimer(); } }, hi("timer"), "Start my 30 minutes"));
    setTimeout(() => card.querySelector("[data-go]")?.focus(), 30);
  }

  /* ---------- the 30 minutes ---------- */
  const left = () => Math.max(0, TRIAL - (Date.now() - g.wrongAt));
  const clock = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  function startTimer() {
    stopTimer();
    chip = h("button", { class: "gate-chip", type: "button", title: "Name Platter's creator to keep it open", onClick: () => openDoor("retry") });
    document.body.append(chip);
    const update = () => {
      if (status() === "locked") return lock();
      const ms = left();
      chip.replaceChildren(hi("timer"), `${clock(ms)} left`, h("em", {}, " · Answer"));
      chip.classList.toggle("low", ms <= 5 * 60 * 1000);
      const m = [1, 5].find((x) => ms <= x * 60 * 1000);           // only the most urgent warning, once
      if (m && !warned[m]) {
        warned[1] = warned[5] = m === 1 || warned[5];
        warned[m] = true;
        P.toast(`${m === 1 ? "1 minute" : `${m} minutes`} left. Name Platter's creator to keep it open.`, { ms: 5000 });
      }
    };
    update();
    tick = setInterval(update, 1000);
  }
  function stopTimer() { clearInterval(tick); chip?.remove(); chip = null; }

  function lock() {
    stopTimer();
    mark();
    P.closeOverlay?.();
    P.help?.close();
    try { speechSynthesis.cancel(); } catch { /* no speech here */ }
    P.cook?.set(false);
    openDoor("locked");
  }

  // background tabs slow timers down: look at the clock again whenever the page comes back
  document.addEventListener("visibilitychange", () => { if (!document.hidden && status() === "locked" && g.wrongAt && !door) lock(); });

  P.gate = {
    status,
    /** True while the door stands in the way: the keyboard shortcuts stay quiet. */
    blocking: () => !!door,
    start() {
      mark();
      const s = status();
      if (s === "ask") openDoor("ask");
      else if (s === "trial") startTimer();
      else if (s === "locked") lock();
    },
  };
  P.gate.start();
})();
