/* Platter — Cook Mode: keep the screen awake, and turn "simmer for 10 minutes" into a timer. */
(() => {
  const P = window.P;
  const { h } = P;
  const timers = [];
  let lock = null, on = false, audio = null, tickId = 0, seq = 0, dock = null;

  /* ---------- finding times in a step ---------- */
  const DUR = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to|or)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;
  const unitSecs = (u) => (/^h/i.test(u) ? 3600 : /^m/i.test(u) ? 60 : 1);
  const unitName = (u) => (/^h/i.test(u) ? "hr" : /^m/i.test(u) ? "min" : "sec");

  const findTimers = (text) => {
    const out = [];
    DUR.lastIndex = 0;
    let m;
    while ((m = DUR.exec(text)) && out.length < 3) {
      const a = parseFloat(m[1]), u = m[3];
      const seconds = a * unitSecs(u);
      const prev = out[out.length - 1];
      // "1 hour 30 minutes" is one timer, not two
      if (prev && prev.hours && /^m/i.test(u) && m.index - prev.end <= 8) {
        prev.seconds += seconds;
        prev.label += ` ${a} min`;
        prev.hours = false;
        prev.end = m.index + m[0].length;
        continue;
      }
      out.push({ seconds, label: `${a}${m[2] ? `–${m[2]}` : ""} ${unitName(u)}`, hours: /^h/i.test(u), end: m.index + m[0].length });
    }
    return out.filter((t) => t.seconds >= 10 && t.seconds <= 12 * 3600).map(({ seconds, label }) => ({ seconds, label }));
  };

  /* ---------- keeping the screen on ---------- */
  const acquire = async () => {
    try {
      if (navigator.wakeLock && !lock) {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => { lock = null; });
      }
    } catch { /* not allowed right now — Cook Mode still works, the screen just may dim */ }
  };
  const release = () => { try { lock?.release?.(); } catch { /* already gone */ } lock = null; };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (on) acquire();
    tick();
  });

  const set = (v) => {
    on = !!v;
    document.documentElement.classList.toggle("cooking", on);
    if (on) acquire(); else release();
  };

  /* ---------- timers ---------- */
  const fmt = (s) => {
    s = Math.max(0, Math.ceil(s));
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return hh ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`;
  };

  const prime = () => {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      audio.resume?.();
    } catch { /* no audio: the pill and the toast still tell you */ }
  };

  const beep = (times = 3) => {
    if (!audio) return;
    const now = audio.currentTime;
    for (let i = 0; i < times; i++) {
      const o = audio.createOscillator(), g = audio.createGain(), t0 = now + i * 0.36;
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      o.connect(g).connect(audio.destination);
      o.start(t0);
      o.stop(t0 + 0.3);
    }
  };

  /* kept on the device, so a reload (or the phone dropping the tab) doesn't lose the pasta */
  const KEY = "platter.timers";
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(timers.map(({ label, total, end, left, paused, done }) => ({ label, total, end, left, paused, done })))); } catch { /* private mode */ }
  };
  const restore = () => {
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { /* ignore */ }
    const now = Date.now(), missed = [];
    for (const t of Array.isArray(saved) ? saved : []) {
      if (!t || !(t.total > 0) || typeof t.label !== "string") continue;
      if (!t.paused && !t.done && t.end <= now) {
        if (now - t.end > 20 * 60e3) continue;                                  // long gone: not worth ringing about
        t.done = true; missed.push(t.label);
      }
      if (t.done && now - t.end > 20 * 60e3) continue;
      timers.push({ id: ++seq, label: t.label.slice(0, 60), total: t.total, end: t.end, left: t.paused ? t.left : Math.max(0, Math.ceil((t.end - now) / 1000)), paused: !!t.paused, done: !!t.done });
    }
    if (!timers.length) return;
    render(); run(); save();
    if (missed.length) setTimeout(() => P.toast(`${missed.join(", ")}: time's up (while you were away).`, { ms: 6000 }), 600);
  };

  const ensureDock = () => {
    if (!dock) { dock = h("div", { class: "dock", "aria-live": "polite" }); document.body.append(dock); }
    return dock;
  };

  const progress = (t) => (t.done ? 1 : Math.min(1, Math.max(0, 1 - t.left / t.total)));
  const pill = (t) => {
    const time = h("span", { class: "t-time" }, t.done ? "Done" : fmt(t.left));
    const el = h("div", { class: "timer" + (t.done ? " done" : "") + (t.paused ? " paused" : ""), role: "timer", style: `--p:${progress(t)}` },
      h("button", { class: "t-main", type: "button", title: t.done ? "Dismiss" : t.paused ? "Resume" : "Pause", onClick: () => (t.done ? remove(t) : toggle(t)) },
        h("span", { class: "t-ic", html: P.icon(t.paused ? "play" : "timer") }), h("span", { class: "t-label" }, t.label), time),
      h("button", { class: "t-plus", type: "button", title: "One more minute", "aria-label": `Add a minute to ${t.label}`, onClick: () => more(t, 60) }, "+1"),
      h("button", { class: "t-x", type: "button", "aria-label": `Cancel ${t.label}`, html: P.icon("x"), onClick: () => remove(t) }));
    t.el = time; t.box = el;
    return el;
  };

  const render = () => {
    const d = ensureDock();
    d.replaceChildren(...timers.map(pill),
      timers.length ? h("button", { class: "t-new", type: "button", onClick: () => sheet() }, h("span", { class: "ic-wrap", html: P.icon("plus") }), "Timer") : null);
    d.hidden = !timers.length;
    title();
  };

  /* the soonest timer in the tab's title, so it can be seen from another tab */
  const TITLE = /^(?:⏲ [\d:]+|⏰ Time's up) · /;
  const title = () => {
    const base = document.title.replace(TITLE, "");
    const next = timers.filter((t) => !t.done && !t.paused).sort((a, b) => a.end - b.end)[0];
    const want = timers.some((t) => t.done) ? `⏰ Time's up · ${base}` : next ? `⏲ ${fmt(next.left)} · ${base}` : base;
    if (document.title !== want) document.title = want;
  };
  P.on("route", () => setTimeout(title, 0));

  const tick = () => {
    const now = Date.now();
    for (const t of timers) {
      if (t.paused || t.done) continue;
      t.left = Math.ceil((t.end - now) / 1000);
      if (t.left <= 0) finish(t);
      else { if (t.el) t.el.textContent = fmt(t.left); t.box?.style.setProperty("--p", progress(t)); }
    }
    title();
    if (!timers.some((t) => !t.paused && !t.done)) { clearInterval(tickId); tickId = 0; }
  };

  const run = () => { if (!tickId) tickId = setInterval(tick, 250); };

  const finish = (t) => {
    t.done = true;
    t.left = 0;
    render(); save();
    beep(3);
    setTimeout(() => t.done && timers.includes(t) && beep(3), 4000);
    setTimeout(() => t.done && timers.includes(t) && beep(3), 9000);
    try { navigator.vibrate?.([250, 120, 250, 120, 250]); } catch { /* not everywhere */ }
    P.toast(`${t.label}: time's up.`, { ms: 6000 });
  };

  const toggle = (t) => {
    if (t.paused) { t.end = Date.now() + t.left * 1000; t.paused = false; run(); }
    else { t.left = Math.ceil((t.end - Date.now()) / 1000); t.paused = true; }
    render(); save();
  };

  /** A little longer: a running timer gets the time added, a finished one starts again with it. */
  const more = (t, seconds) => {
    prime();
    if (t.done) { t.done = false; t.total = seconds; t.left = seconds; t.end = Date.now() + seconds * 1000; }
    else if (t.paused) { t.left += seconds; t.total += seconds; }
    else { t.end += seconds * 1000; t.total += seconds; t.left = Math.ceil((t.end - Date.now()) / 1000); }
    render(); run(); save();
  };

  const remove = (t) => {
    const i = timers.indexOf(t);
    if (i >= 0) timers.splice(i, 1);
    render(); save();
  };

  const start = (seconds, label) => {
    prime();
    seconds = Math.round(seconds);
    const t = { id: ++seq, label, total: seconds, left: seconds, end: Date.now() + seconds * 1000, paused: false, done: false };
    timers.push(t);
    render(); run(); save();
    P.toast(`${label}: ${fmt(seconds)} timer started.`);
  };

  /* ---------- a timer for anything: pasta, eggs, the oven ---------- */
  const human = (s) => {
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return [hh ? `${hh} hr` : "", mm ? `${mm} min` : "", ss ? `${ss} sec` : ""].filter(Boolean).join(" ") || "0 sec";
  };
  const PRESETS = [1, 3, 5, 8, 10, 12, 15, 20, 25, 30, 45, 60];
  const IDEAS = ["Pasta", "Eggs", "Rice", "Oven", "Resting", "Tea"];
  function sheet() {
    prime();
    P.sheet((close) => {
      const label = h("input", { class: "input", maxlength: "40", placeholder: "What's it for? (optional)", "aria-label": "Timer name", enterkeyhint: "done" });
      const mins = h("input", { class: "input t-num", type: "number", inputmode: "numeric", min: "0", max: "720", placeholder: "0", "aria-label": "Minutes", "data-autofocus": "" });
      const secs = h("input", { class: "input t-num", type: "number", inputmode: "numeric", min: "0", max: "59", placeholder: "00", "aria-label": "Seconds" });
      const go = (seconds) => {
        if (!(seconds >= 1)) { mins.classList.add("bad"); mins.focus(); return; }
        close();
        start(Math.min(seconds, 12 * 3600), label.value.trim() || `${human(seconds)} timer`);
      };
      const custom = () => go((+mins.value || 0) * 60 + Math.min(59, +secs.value || 0));
      for (const el of [label, mins, secs]) el.addEventListener("keydown", (e) => { if (e.key === "Enter") custom(); });
      mins.addEventListener("input", () => mins.classList.remove("bad"));
      return [
        h("h3", { class: "sheet-h" }, h("span", { class: "ic-wrap", html: P.icon("timer") }), "New timer"),
        label,
        h("div", { class: "chips t-ideas" }, IDEAS.map((w) => h("button", { class: "chip", type: "button", onClick: () => { label.value = w; label.focus(); } }, w))),
        h("div", { class: "t-presets" }, PRESETS.map((m) => h("button", { class: "t-preset", type: "button", onClick: () => go(m * 60) }, h("b", {}, m === 60 ? "1" : String(m)), m === 60 ? "hour" : "min"))),
        h("div", { class: "t-custom" }, h("span", {}, "Or exactly"), mins, h("span", {}, "min"), secs, h("span", {}, "sec"),
          h("button", { class: "btn lime", type: "button", onClick: custom }, h("span", { class: "ic-wrap", html: P.icon("play") }), "Start")),
        timers.length ? h("p", { class: "sheet-p t-note" }, `${P.plural(timers.length, "timer")} running in the corner. Tap one to pause it.`) : null,
      ];
    }, { class: "small timer-sheet", label: "New timer" });
  }

  P.cook = { findTimers, start, set, isOn: () => on };
  P.timers = { sheet, list: () => timers.slice(), clear: () => { timers.splice(0); render(); save(); } };
  restore();
})();
