/* Platter — start-up and keyboard shortcuts. */
(() => {
  const P = window.P;
  const typing = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

  addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
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
      case "[": P.views.toggleSidebar(); break;
      default:
    }
  });

  (async () => {
    P.hydrateIcons();
    P.views.init();
    try { await P.loadLibrary(); }
    catch (e) { console.error(e); P.views.fail(); return; }
    P.views.start();
  })();
})();
