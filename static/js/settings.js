/* Platter — Settings: everything you can set, in one place, in plain words.
   Appearance, units, your diet, prices, your data, help. (Before this lived in a small unlabelled menu.) */
(() => {
  const P = window.P;
  const { h } = P;
  const hi = (name) => h("span", { class: "ic-wrap", html: P.icon(name) });

  const THEMES = [
    ["white", "White", "Crisp and bright. The default"],
    ["warm", "Warm", "Soft paper tones"],
    ["dark", "Dark", "Calm charcoal, easy on the eyes at night"],
    ["auto", "Auto", "Follows your device: white by day, dark at night"],
  ];

  /** A little picture of the three panes in that theme's colours: sidebar, list, recipe (with a title, a line and the lime button). */
  const PV = { white: ["#f1f1f4", "#f7f7f9", "#ffffff", "#111114"], warm: ["#f0efe9", "#f5f4f0", "#fafaf8", "#171715"], dark: ["#1a1b20", "#16171c", "#121317", "#ededf2"] };
  function preview(t) {
    const bg = (i) => (t === "auto" ? `linear-gradient(135deg, ${PV.white[i]} 50%, ${PV.dark[i]} 50%)` : PV[t][i]);
    const ink = t === "dark" ? PV.dark[3] : PV.white[3];
    return h("span", { class: "theme-pv", "aria-hidden": "true" }, h("i", { style: { background: bg(0) } }), h("i", { style: { background: bg(1) } }),
      h("i", { style: { background: bg(2) } }, h("b", { style: { background: ink, opacity: "0.85" } }), h("b", { style: { background: ink, opacity: "0.3" } }), h("b", { style: { background: "#c6e66c" } })));
  }

  const section = (title, sub, ...kids) => h("section", { class: "set-sec" },
    h("div", { class: "set-head" }, h("h2", {}, title), sub ? h("p", {}, sub) : null), ...kids);
  const row = (ic, title, sub, ...right) => h("div", { class: "set-row" }, hi(ic), h("div", { class: "set-txt" }, h("b", {}, title), sub ? h("small", {}, sub) : null), ...right);
  const toggle = (on, fn, label) => h("button", { class: "switch", type: "button", role: "switch", "aria-checked": String(on), "aria-label": label, onClick: fn });

  function backup() { P.download(`platter-backup-${new Date().toISOString().slice(0, 10)}.json`, P.exportData()); P.toast("Backup downloaded."); }
  function restore() {
    const input = h("input", { type: "file", accept: "application/json,.json" });
    input.addEventListener("change", async () => {
      try { P.importData(await input.files[0].text()); P.toast("Library restored."); }
      catch (e) { P.toast(e instanceof SyntaxError ? "Couldn't read that file." : e.message); }
    });
    input.click();
  }
  async function startFresh() {
    const ok = await P.confirm({ title: "Start fresh?", body: "This removes your own recipes, edits, favorites, ratings, notes, plans, lists and settings from this browser. Download a backup first if you might want them back.", ok: "Remove everything", danger: true });
    if (!ok) return;
    P.importData(JSON.stringify({ app: "platter", v: 1, data: {} }));
    P.applyTheme();
    P.prices.start();
    P.toast("Everything's back to how it started.");
  }

  P.panes.settings = (top, scroll, ctx) => {
    const ui = P.S.ui;
    top.replaceChildren(h("span", { class: "tagpill ghost" }, "Settings"),
      h("div", { class: "acts" }, h("button", { class: "editbtn", type: "button", onClick: ctx.close }, hi("check"), "Done")));
    const redraw = () => P.panes.settings(top, scroll, ctx);
    const keep = scroll.scrollTop;
    const unit = P.unitMode();
    const units = [["orig", "As written", "Exactly as the recipe says"], ["us", "US", "Cups, ounces, pounds, °F"], ["metric", "Metric", "Millilitres, grams, °C"]];
    scroll.replaceChildren(h("div", { class: "recipe settings" },
      h("h1", { class: "title" }, "Settings"),
      h("p", { class: "lead" }, "Everything here is saved in this browser only."),

      section("Appearance", null,
        h("div", { class: "theme-grid" }, THEMES.map(([k, label, sub]) => h("button", {
          class: "theme-card" + (P.theme() === k ? " on" : ""), type: "button", "aria-pressed": String(P.theme() === k),
          onClick: () => { P.setTheme(k); redraw(); },
        }, preview(k), h("b", {}, label), h("small", {}, sub))))),

      section("Units", "How amounts and oven temperatures are shown in every recipe.",
        h("div", { class: "choice-list" }, units.map(([k, label, sub]) => h("button", {
          class: "choice" + (unit === k ? " on" : ""), type: "button", "aria-pressed": String(unit === k), onClick: () => { P.setUnitMode(k); redraw(); },
        }, h("span", { class: "radio" }), h("span", {}, h("b", {}, label), h("small", {}, sub)))))),

      section("Your diet", "Recipes are checked against it, and every AI answer follows it.",
        row("leaf", P.diet.has() ? P.diet.summary() : "No diet set", P.diet.has() ? null : "Low fat, no milk, vegetarian, no pork…",
          h("button", { class: "btn ghost sm", type: "button", onClick: () => P.diet.sheet() }, P.diet.has() ? "Change" : "Set it")),
        P.diet.has() ? row("book", "Only show recipes that fit", null, toggle(P.diet.active(), () => { P.diet.setOn(!P.diet.active()); redraw(); }, "Only show recipes that fit")) : null),

      section("Prices", "What recipes and your shopping list cost where you live. AI estimates, refreshed weekly.",
        row("coins", P.prices.summary(), P.S.prices.guessed ? "Guessed from your time zone" : null,
          h("button", { class: "btn ghost sm", type: "button", onClick: () => P.prices.sheet() }, "Change"))),

      (() => {
        const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        return section("Get the app", "Open Platter like any other app: its own icon, full screen, and it works offline.",
          installed ? row("check", "Installed", "You're using Platter as an app.")
            : P.installPrompt ? h("button", { class: "btn lime sm", type: "button", onClick: async () => {
              P.installPrompt.prompt();
              await P.installPrompt.userChoice.catch(() => null);
              P.installPrompt = null;
              redraw();
            } }, hi("download"), "Install Platter")
              : h("p", { class: "set-about" }, ios ? "On iPhone or iPad: tap the Share button, then “Add to Home Screen”." : "In your browser's menu, choose “Install app” or “Add to Home screen”."));
      })(),
      section("Your data", "Your recipes, favorites, plans and lists live in this browser. Back them up to move them to another device.",
        h("div", { class: "row-btns" },
          h("button", { class: "btn ghost sm", type: "button", onClick: backup }, hi("download"), "Download a backup"),
          h("button", { class: "btn ghost sm", type: "button", onClick: restore }, hi("upload"), "Restore a backup"),
          h("button", { class: "btn ghost sm", type: "button", onClick: async () => { await P.copyText(location.origin); P.toast("Link copied."); } }, hi("link"), "Copy the link to Platter"),
          h("button", { class: "btn danger-ghost sm", type: "button", onClick: startFresh }, hi("trash"), "Start fresh"))),

      section("Help", null,
        h("div", { class: "row-btns" },
          h("button", { class: "btn ghost sm", type: "button", onClick: () => P.views.shortcuts() }, hi("keyboard"), "Keyboard shortcuts"),
          h("button", { class: "btn ghost sm", type: "button", onClick: () => { ui.welcomed = false; P.save(); P.go("discover"); } }, hi("sparkle"), "Show the welcome tips again"))),

      section("About", null,
        h("p", { class: "set-about" }, `Platter · ${P.recipes().length.toLocaleString()} recipes. Most come from `,
          h("a", { href: "https://www.themealdb.com", target: "_blank", rel: "noopener noreferrer" }, "TheMealDB"),
          "; the ones marked “AI recipe” were written by AI. Photos from Wikipedia and Wikimedia Commons, credited on each. Descriptions, nutrition, prices and diet checks are estimates: check labels if you have an allergy."))));
    scroll.scrollTop = keep;
  };
})();
