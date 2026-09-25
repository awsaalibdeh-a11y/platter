/* Platter — cook step by step: one step at a time, full screen, big type.

   The screen stays awake. Under each step sit the ingredients it uses (scaled, in your units) and its timers.
   It can read each step aloud, the helper is one tap away, and arrows, space or a swipe move between steps.
   Moving on ticks the step off on the recipe page too. The last step ends with "I made this". */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });

  /* ---------- which ingredients a step mentions ---------- */
  const GENERIC = new Set(["sauce", "oil", "powder", "paste", "seed", "leaf", "leave", "juice", "stock", "broth", "water", "vinegar", "flake",
    "mix", "spice", "seasoning", "cheese", "cream", "milk", "sugar", "flour", "pepper", "salt", "fresh", "ground", "large", "small"]);
  // a describing word is never the ingredient itself: "heavy cream" must not match "a heavy pot"
  const ADJ = new Set(["heavy", "light", "dark", "whole", "sweet", "unsalted", "salted", "plain", "dried", "green", "yellow", "white", "black",
    "brown", "extra", "virgin", "mild", "thick", "thin", "double", "single", "baby", "boneless", "skinless", "chopped", "minced", "sliced",
    "frozen", "canned", "cooked", "lean", "fine", "coarse", "kosher", "toasted", "roasted", "smoked", "grated", "shredded", "crushed", "fresh"]);
  for (const w of ADJ) GENERIC.add(w);
  const bare = (w) => w.replace(/(?:ies)$/, "y").replace(/(?:oes|es|s)$/, (m) => (m === "oes" ? "o" : ""));
  function mentions(step, line) {
    const name = P.shop.nameOf(line);
    if (!name) return false;
    const s = ` ${step.toLowerCase().replace(/[^a-z]+/g, " ")} `;
    const words = name.toLowerCase().replace(/[^a-z ]+/g, " ").split(/\s+/).filter((w) => w.length > 2);
    if (!words.length) return false;
    if (s.includes(` ${words.join(" ")}`)) return true;                           // the whole name: "soy sauce"
    const has = (w) => { const b = bare(w); return b.length > 3 && !GENERIC.has(b) && new RegExp(`\\b${b}`).test(s); };
    return has(words[words.length - 1]) || (words.length > 1 && has(words[0]));   // "chicken thighs" → thigh, chicken
  }

  /* ---------- reading aloud ---------- */
  const canSpeak = "speechSynthesis" in window;
  const say = (text) => {
    if (!canSpeak) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.98;
    speechSynthesis.speak(u);
  };
  const hush = () => canSpeak && speechSynthesis.cancel();

  /* ---------- hands-free: say "next", "back", "repeat"… ---------- */
  const Recognizer = window.SpeechRecognition || window.webkitSpeechRecognition;
  /** What a heard phrase asks for. Kept apart from the microphone so it can be tested without one. */
  const heard = (t) => {
    t = ` ${String(t).toLowerCase()} `;
    if (/\b(close|exit|quit)\b/.test(t)) return "close";
    if (/\b(back|previous|last step|go back)\b/.test(t)) return "back";
    if (/\b(repeat|again|read( it)?|say (it|that)|what was that)\b/.test(t)) return "repeat";
    if (/\btimer\b/.test(t)) return "timer";
    if (/\b(stop|quiet|shush|silence|pause)\b/.test(t)) return "hush";
    if (/\b(next|forward|continue|go on|done|ok(ay)? next|finished)\b/.test(t)) return "next";
    return "";
  };

  P.stepper = {
    heard,
    open(r) {
      if (!r || !r.steps.length) return;
      const done = P.stepsDone(r.id);
      let i = r.steps.findIndex((_, n) => !done.has(n));
      if (i < 0) i = 0;
      let finished = false;
      const servings = P.scaleOf(r), f = servings / (r.serves || 4);
      const wasAwake = P.views.cookOn();
      P.cook.set(true);

      const els = {};
      const view = P.fullscreen((close) => {
        els.close = close;
        els.count = h("span", { class: "sp-count" });
        els.bar = h("i");
        els.body = h("div", { class: "sp-body" });
        els.prev = h("button", { class: "btn ghost sp-prev", type: "button", onClick: () => go(-1) }, hi("chevron"), "Back");
        els.next = h("button", { class: "btn lime sp-next", type: "button", onClick: () => go(1) });
        els.speak = h("button", { class: "sp-tool", type: "button", onClick: toggleSpeak });
        els.voice = h("button", { class: "sp-tool", type: "button", onClick: toggleVoice });
        return [
          h("header", { class: "sp-head" },
            h("button", { class: "sp-tool", type: "button", title: "Close  ( Esc )", "aria-label": "Close", html: P.icon("x"), onClick: close }),
            h("div", { class: "sp-title" }, h("b", {}, r.title), els.count),
            Recognizer ? els.voice : null,
            canSpeak ? els.speak : null,
            h("button", { class: "sp-tool ask", type: "button", onClick: askStep }, hi("sparkle"), h("span", {}, "Ask AI"))),
          h("div", { class: "sp-bar" }, els.bar),
          els.body,
          h("footer", { class: "sp-foot" }, els.prev, els.next),
        ];
      }, { label: `Cook ${r.title} step by step`, class: "stepper", onClose: () => { stopVoice(); hush(); P.cook.set(wasAwake); document.removeEventListener("keydown", onKey); P.emit("steps", r.id); } });

      function show() {
        const n = r.steps.length;
        els.count.textContent = finished ? "All done" : `Step ${i + 1} of ${n}`;
        els.bar.style.width = `${finished ? 100 : ((i + 1) / n) * 100}%`;
        els.prev.disabled = !finished && i === 0;
        if (finished) {
          const stars = h("div", { class: "rating big" }, [1, 2, 3, 4, 5].map((k) => h("button", {
            class: "rstar" + (k <= P.rating(r.id) ? " on" : ""), type: "button", "aria-label": `${k} of 5`, html: P.icon("star"),
            onClick: () => { P.setRating(r.id, k); show(); },
          })));
          els.body.replaceChildren(h("div", { class: "sp-done" },
            h("span", { class: "sp-done-ic", html: P.icon("chefHat") }),
            h("h2", {}, "Enjoy your meal!"),
            h("p", {}, "How did it turn out?"), stars,
            h("button", { class: "btn lime", type: "button", onClick: () => { const undo = P.markMade(r.id); els.close(); P.toast(`Logged. You've made it ${P.plural(P.madeTimes(r.id).length, "time")}.`, { action: { label: "Undo", fn: undo } }); } }, hi("check"), "I made this")));
          els.next.replaceChildren(hi("x"), "Close");
          return;
        }
        const text = P.convertText(r.steps[i]);
        const uses = r.ing.filter((l) => mentions(r.steps[i], l));
        const timers = P.cook.findTimers(r.steps[i]);
        els.body.replaceChildren(
          h("div", { class: "sp-num" }, String(i + 1)),
          h("p", { class: "sp-text" }, text),
          uses.length ? h("div", { class: "sp-uses" }, h("span", { class: "label" }, "You'll need"),
            h("div", { class: "sp-chips" }, uses.map((l) => h("span", { class: "sp-chip" }, P.scaleLine(l, f))))) : null,
          timers.length ? h("div", { class: "sp-timers" }, timers.map((t) =>
            h("button", { class: "timer-chip", type: "button", onClick: () => P.cook.start(t.seconds, `Step ${i + 1}`) }, hi("timer"), `Start ${t.label} timer`))) : null);
        els.next.replaceChildren(...(i === n - 1 ? [hi("check"), "Finish"] : ["Next step", hi("chevronRight")]));
        paintSpeak();
        if (P.S.ui.speak) say(`Step ${i + 1}. ${text}`);
      }

      function go(d) {
        if (finished) { if (d < 0) { finished = false; show(); } else els.close(); return; }
        if (d > 0 && !P.stepsDone(r.id).has(i)) P.toggleStep(r.id, i);             // moving on ticks the step off
        if (d > 0 && i === r.steps.length - 1) { finished = true; hush(); return show(); }
        i = Math.max(0, Math.min(r.steps.length - 1, i + d));
        show();
      }

      function paintSpeak() {
        const on = !!P.S.ui.speak;
        els.speak.classList.toggle("on", on);
        els.speak.setAttribute("aria-pressed", String(on));
        els.speak.title = on ? "Stop reading aloud" : "Read each step aloud";
        els.speak.replaceChildren(hi(on ? "volume" : "volumeOff"), h("span", {}, on ? "Reading aloud" : "Read aloud"));
      }
      /* voice: the browser listens (Chrome and Edge, with microphone permission); a silence ends a listening
         session, so it starts again until it is switched off */
      let rec = null, listening = false;
      function paintVoice() {
        if (!Recognizer) return;
        els.voice.classList.toggle("on", listening);
        els.voice.setAttribute("aria-pressed", String(listening));
        els.voice.title = listening ? "Stop listening" : "Hands-free: say “next”, “back”, “repeat” or “timer”";
        els.voice.replaceChildren(hi("mic"), h("span", {}, listening ? "Listening" : "Voice"));
      }
      function startVoice() {
        rec = new Recognizer();
        rec.lang = navigator.language || "en-US";
        rec.continuous = true;
        rec.interimResults = false;
        rec.onresult = (e) => {
          const said = e.results[e.results.length - 1][0].transcript;
          const act = heard(said);
          if (act === "next") go(1);
          else if (act === "back") go(-1);
          else if (act === "repeat" && !finished) say(`Step ${i + 1}. ${P.convertText(r.steps[i])}`);
          else if (act === "timer" && !finished) { const t = P.cook.findTimers(r.steps[i])[0]; if (t) P.cook.start(t.seconds, `Step ${i + 1}`); else P.toast("This step has no time in it."); }
          else if (act === "hush") hush();
          else if (act === "close") els.close();
        };
        rec.onerror = (e) => {
          if (e.error === "not-allowed" || e.error === "service-not-allowed") { listening = false; paintVoice(); P.toast("Voice needs permission to use the microphone."); }
        };
        rec.onend = () => { if (listening) { try { rec.start(); } catch { /* already started */ } } };
        listening = true;
        try { rec.start(); } catch { /* already started */ }
        paintVoice();
        P.toast("Listening. Say “next”, “back”, “repeat”, “timer” or “close”.", { ms: 4000 });
      }
      function stopVoice() { listening = false; try { rec?.stop(); } catch { /* not running */ } rec = null; if (els.voice) paintVoice(); }
      function toggleVoice() { if (listening) stopVoice(); else startVoice(); }

      function toggleSpeak() {
        P.S.ui.speak = !P.S.ui.speak;
        P.save();
        paintSpeak();
        if (P.S.ui.speak && !finished) say(`Step ${i + 1}. ${P.convertText(r.steps[i])}`); else hush();
      }
      function askStep() {
        if (finished) return P.help.open(r);
        P.help.open(r, { q: `I'm on step ${i + 1}. Explain it in more detail: what should I watch for?`, focus: P.convertText(r.steps[i]) });
      }

      function onKey(e) {
        if (e.target.closest?.(".helper") || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
        if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter" && e.target === document.body) { e.preventDefault(); go(1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      }
      document.addEventListener("keydown", onKey);

      // swipe left or right on a touch screen
      let x0 = null;
      view.el.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse" && !e.target.closest("button")) x0 = e.clientX; });
      view.el.addEventListener("pointerup", (e) => {
        if (x0 == null) return;
        const dx = e.clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
      });

      paintVoice();
      show();
      els.next.focus({ preventScroll: true });
    },
  };
})();
