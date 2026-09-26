/* Platter — start-up and keyboard shortcuts. */
(() => {
  const P = window.P;
  const typing = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

  addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !P.gate?.blocking()) { e.preventDefault(); P.palette.open(); return; }
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (P.gate?.blocking()) return;                     // the "name the creator" door is up
    if (typing(e.target)) { if (e.key === "Escape") e.target.blur(); return; }
    if (P.overlayOpen()) return;
    const inList = !!e.target.closest?.("#rows");
    switch (e.key) {
      case "/": e.preventDefault(); P.views.focusSearch(); break;
      case "j": P.views.next(1); break;
      case "k": P.views.next(-1); break;
      case "ArrowDown": if (inList) { e.preventDefault(); P.views.next(1); } break;   // elsewhere the arrows scroll the page
      case "ArrowUp": if (inList) { e.preventDefault(); P.views.next(-1); } break;
      case "e": P.views.edit(); break;
      case "f": P.views.fav(); break;
      case "c": P.views.toggleCook(); break;
      case "n": P.views.add(); break;
      case "a": P.views.openAI(); break;
      case "s": P.views.openShop(); break;
      case "p": P.views.openPantry(); break;
      case "m": P.views.openPlan(); break;
      case "r": P.views.surprise(); break;
      case "d": P.views.openDiscover(); break;
      case "y": P.go("stats"); break;
      case "h": P.views.help(); break;
      case "g": P.views.cookSteps(); break;
      case "t": P.views.toggleTheme(); break;
      case "w": P.timers.sheet(); break;
        case "u": P.convert.sheet(); break;
      case "?": P.views.shortcuts(); break;
      case "[": P.views.toggleSidebar(); break;
      default:
    }
  });

  // offline: once it has loaded, the app and the library are kept on the device (see static/sw.js)
  if ("serviceWorker" in navigator && (location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    addEventListener("load", () => navigator.serviceWorker.register(`/sw.js?v=${window.PLATTER.v}`).catch(() => {}));
  }
  addEventListener("offline", () => P.toast("You're offline. Your recipes still work; photos and AI need a connection.", { ms: 4200 }));
  addEventListener("online", () => P.toast("Back online."));

  // a newer Platter was deployed while this tab stayed open: offer to reload (checked when you come back to it)
  let told = false;
  const checkVersion = async () => {
    if (told || document.hidden || !navigator.onLine) return;
    try {
      const d = await fetch("/version", { cache: "no-store" }).then((r) => r.json());
      if (d.v && d.v !== window.PLATTER.v) {
        told = true;
        P.toast("A new version of Platter is ready.", { action: { label: "Reload", fn: () => location.reload() }, ms: 20000 });
      }
    } catch { /* offline or asleep: try again next time */ }
  };
  document.addEventListener("visibilitychange", checkVersion);
  setInterval(checkVersion, 20 * 60 * 1000);

  // "Install Platter": the browser offers it once the page qualifies; Settings shows the button
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); P.installPrompt = e; P.emit("install"); });
  addEventListener("appinstalled", () => { P.installPrompt = null; P.toast("Platter is installed. Find it with your other apps."); P.emit("install"); });

  (async () => {
    P.hydrateIcons();
    P.views.init();
    try { await P.loadLibrary(); }
    catch (e) { console.error(e); P.views.fail(); return; }
    P.views.start();
    P.loadDetails();                        // descriptions, tips and nutrition: after the first screen is up
    P.prices.start();                       // your currency: guessed from the time zone, then priced once a week
  })();
})();
