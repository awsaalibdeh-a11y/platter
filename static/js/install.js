/* Platter — "Install Platter": when you open it in a browser (not as an installed app) a bar says so, with an Install button.
   On an iPhone or iPad, where Apple has no install button, it shows the Share, Add to Home Screen steps instead. "Not now" hides it for a week.
   Settings has the same button (see settings.js). */
(() => {
  const P = window.P;
  const { h } = P;
  const KEY = "platter.install";
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
  const write = (o) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...o })); } catch { /* private mode */ } };
  let bar = null;

  const hide = () => { if (bar) { bar.remove(); bar = null; } };

  /** The Install button, here and in Settings: the browser's own prompt when it offers one, the steps when it does not. */
  P.installApp = async () => {
    if (P.installPrompt) {
      P.installPrompt.prompt();
      const choice = await P.installPrompt.userChoice.catch(() => null);
      P.installPrompt = null;
      hide();
      return !!choice && choice.outcome === "accepted";
    }
    P.sheet((close) => [
      h("h3", { class: "sheet-h" }, "Install Platter"),
      h("p", { class: "set-about" }, ios()
        ? "On your iPhone or iPad: open Platter in Safari, tap the Share button (the square with an arrow), scroll down and tap “Add to Home Screen”, then “Add”."
        : "In your browser's menu, choose “Install app” or “Add to Home screen”. Platter then opens like any other app, full screen, and works offline."),
      h("div", { class: "sheet-btns" }, h("button", { class: "btn lime", type: "button", onClick: close }, "Got it")),
    ], { label: "Install Platter" });
    return false;
  };

  const show = () => {
    if (bar || standalone()) return;
    const s = read();
    if (Date.now() - (s.at || 0) < 7 * 864e5) return;                                // said "not now" in the last week
    if (!P.installPrompt && !ios()) return;                                          // nothing to offer on this browser
    bar = h("div", { class: "install-bar", role: "region", "aria-label": "Install Platter" },
      h("span", { class: "ib-logo", "aria-hidden": "true" }, "P"),
      h("div", { class: "ib-t" }, h("b", {}, "Install Platter"), h("small", {}, "Open it like an app: its own icon, full screen, works offline.")),
      h("button", { class: "btn lime sm", type: "button", onClick: () => P.installApp() }, "Install"),
      h("button", { class: "ib-x", type: "button", "aria-label": "Not now", onClick: () => { write({ at: Date.now() }); hide(); } }, "Not now"));
    document.body.append(bar);
  };

  // wait until the page is up and the door (the "name the creator" question) is out of the way, then ask once it can be answered
  let tries = 0;
  const wait = () => {
    if (standalone()) return;
    if (P.gate?.blocking?.() || !document.querySelector("#app")) { if (++tries < 40) setTimeout(wait, 1000); return; }
    show();
  };
  addEventListener("load", () => setTimeout(wait, 1800));
  P.on("install", () => { if (P.installPrompt) show(); else hide(); });                // the browser said the page qualifies (or it was just installed)
  addEventListener("appinstalled", hide);
})();
