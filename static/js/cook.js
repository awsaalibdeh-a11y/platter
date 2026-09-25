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

  const ensureDock = () => {
    if (!dock) { dock = h("div", { class: "dock", "aria-live": "polite" }); document.body.append(dock); }
    return dock;
  };

  const pill = (t) => {
    const time = h("span", { class: "t-time" }, fmt(t.left));
    t.el = time;
    return h("div", { class: "timer" + (t.done ? " done" : "") + (t.paused ? " paused" : ""), role: "timer" },
      h("button", { class: "t-main", type: "button", title: t.done ? "Dismiss" : t.paused ? "Resume" : "Pause", onClick: () => (t.done ? remove(t) : toggle(t)) },
        h("span", { class: "t-ic", html: P.icon("timer") }), h("span", { class: "t-label" }, t.label), time),
      h("button", { class: "t-x", type: "button", "aria-label": "Cancel timer", html: P.icon("x"), onClick: () => remove(t) }));
  };

  const render = () => {
    const d = ensureDock();
    d.replaceChildren(...timers.map(pill));
    d.hidden = !timers.length;
  };

  const tick = () => {
    const now = Date.now();
    for (const t of timers) {
      if (t.paused || t.done) continue;
      t.left = Math.ceil((t.end - now) / 1000);
      if (t.left <= 0) finish(t);
      else if (t.el) t.el.textContent = fmt(t.left);
    }
    if (!timers.some((t) => !t.paused && !t.done)) { clearInterval(tickId); tickId = 0; }
  };

  const run = () => { if (!tickId) tickId = setInterval(tick, 250); };

  const finish = (t) => {
    t.done = true;
    t.left = 0;
    render();
    beep(3);
    setTimeout(() => t.done && timers.includes(t) && beep(3), 4000);
    setTimeout(() => t.done && timers.includes(t) && beep(3), 9000);
    try { navigator.vibrate?.([250, 120, 250, 120, 250]); } catch { /* not everywhere */ }
    P.toast(`${t.label}: time's up.`, { ms: 6000 });
  };

  const toggle = (t) => {
    if (t.paused) { t.end = Date.now() + t.left * 1000; t.paused = false; run(); }
    else { t.left = Math.ceil((t.end - Date.now()) / 1000); t.paused = true; }
    render();
  };

  const remove = (t) => {
    const i = timers.indexOf(t);
    if (i >= 0) timers.splice(i, 1);
    render();
  };

  const start = (seconds, label) => {
    prime();
    const t = { id: ++seq, label, total: seconds, left: seconds, end: Date.now() + seconds * 1000, paused: false, done: false };
    timers.push(t);
    render();
    run();
    P.toast(`${label}: ${fmt(seconds)} timer started.`);
  };

  P.cook = { findTimers, start, set, isOn: () => on };
})();
