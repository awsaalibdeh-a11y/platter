/* Platter ↔ Homebase: plan a recipe on a day in Platter and it appears on the family's meal plan in Homebase, with the recipe in it.

   Homebase gives a parent a link ("Link Platter"). Opening that link here connects this Platter: the key it carries is kept in this browser and the
   address bar is cleaned straight away. After that, every add, move, change of servings or removal on the meal plan is sent to Homebase.
   The key can only add and remove meals, and Homebase can unlink it at any time. This page may only talk to the Homebase addresses the server allows. */
(() => {
  const P = window.P;
  const { h } = P;
  const KEY = "platter.hb", PEND = "platter.hb.pending";
  const ALLOWED = (window.PLATTER && window.PLATTER.hb) || [];
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch { return d; } };
  const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
  let conn = read(KEY, null);
  let pending = read(PEND, {});                                                    // what could not be sent yet: { "<entry id>": { k: day } or { del: 1 } }
  const today = () => P.plan.key(new Date());

  const call = async (method, path, body) => {
    const r = await fetch(conn.base + path, {
      method, headers: { Authorization: "Bearer " + conn.key, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { conn = null; write(KEY, null); P.emit("homebase"); throw Object.assign(new Error("Homebase says this link is not valid any more."), { final: true }); }
    if (!r.ok) throw Object.assign(new Error((await r.json().catch(() => ({}))).error || "Homebase did not accept that."), { final: r.status < 500 && r.status !== 429 });
    return r.json().catch(() => ({}));
  };

  /** What Homebase gets for a planned recipe: the title, photo, a link back, and the ingredients and method scaled to the servings planned. */
  const payload = (k, e) => {
    const r = P.recipe(e.id);
    if (!r) return null;
    const f = (e.servings || P.scaleOf(r)) / (r.serves || 4);
    return {
      ext_id: "platter:" + e.u, day: k, slot: "dinner", title: r.title, servings: e.servings || P.scaleOf(r),
      photo: /^https:/.test(r.img || "") ? P.photo(r.img, "medium") : "", source: location.origin + "/#/" + P.pathFor({ tag: r.tag, id: r.id }),
      ingredients: (r.ing || []).map((l) => P.scaleLine(l, f)), steps: (r.steps || []).map((s) => P.convertText(s)),
    };
  };
  const later = (u, op) => { pending[u] = op; write(PEND, pending); };
  const put = async (k, e) => {
    if (!conn) return false;
    const p = payload(k, e);
    if (!p) return false;
    try { await call("POST", "/api/ext/meals", p); delete pending[e.u]; write(PEND, pending); return true; }
    catch (err) { if (!err.final) later(e.u, { k }); return false; }
  };
  const drop = async (e) => {
    if (!conn) return;
    try { await call("DELETE", "/api/ext/meals/" + encodeURIComponent("platter:" + e.u)); delete pending[e.u]; write(PEND, pending); }
    catch (err) { if (!err.final) later(e.u, { del: 1 }); }
  };
  const find = (k, u) => (P.S.plan[k] || []).find((x) => x.u === u);
  const flush = async () => {
    if (!conn || !navigator.onLine) return;
    for (const [u, op] of Object.entries(pending)) {
      if (op.del) await drop({ u });
      else { const e = find(op.k, u); if (e) await put(op.k, e); else delete pending[u]; }
    }
    write(PEND, pending);
  };

  /** Sends every meal planned from today on (used right after connecting, and by "Send my plan now"). */
  const syncAll = async () => {
    let n = 0;
    for (const k of Object.keys(P.S.plan).filter((d) => d >= today()).sort()) for (const e of P.plan.on(k)) if (await put(k, e)) n++;
    return n;
  };

  // ---------- every change to the meal plan goes along ----------
  const plan = P.plan, add = plan.add, remove = plan.remove, move = plan.move, servings = plan.servings, clearWeek = plan.clearWeek;
  plan.add = (id, k, n) => { const undo = add(id, k, n); const e = (P.S.plan[k] || []).slice(-1)[0]; if (e) put(k, e); return undo; };    // undo goes through plan.remove, which sends the removal
  plan.remove = (k, u) => { const e = find(k, u), undo = remove(k, u); if (e) drop(e); return () => { undo(); if (e) put(k, e); }; };
  plan.move = (k, u, to) => { const undo = move(k, u, to), e = find(to, u); if (e) put(to, e); return undo; };
  const timers = {};
  plan.servings = (k, u, n) => { servings(k, u, n); clearTimeout(timers[u]); timers[u] = setTimeout(() => { const e = find(k, u); if (e) put(k, e); }, 700); };
  plan.clearWeek = (from) => {
    const snap = () => Object.entries(P.S.plan).flatMap(([k, l]) => l.map((e) => [k, e]));
    const before = snap(), undo = clearWeek(from), kept = new Set(snap().map(([, e]) => e.u)), gone = before.filter(([, e]) => !kept.has(e.u));
    gone.forEach(([, e]) => drop(e));
    return () => { undo(); gone.forEach(([k, e]) => put(k, e)); };
  };

  // ---------- connecting ----------
  const decode = (c) => { try { return JSON.parse(decodeURIComponent(escape(atob(c.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(c.length / 4) * 4, "="))))); } catch { return null; } };
  const connect = async (code) => {
    const d = decode(code);
    if (!d || !d.b || !d.k) { P.toast("That Homebase link is not valid."); return false; }
    if (!ALLOWED.includes(d.b)) { P.toast("This Homebase address is not one Platter is allowed to talk to."); return false; }
    try {
      const r = await fetch(d.b + "/api/ext/ping", { headers: { Authorization: "Bearer " + d.k } });
      if (!r.ok) throw new Error("no");
      const info = await r.json();
      conn = { base: d.b, key: d.k, family: info.family };
      write(KEY, conn);
      P.emit("homebase");
      const n = await syncAll();
      P.toast(`Connected to ${info.family}. ${n ? `${n} planned meal${n === 1 ? "" : "s"} sent. ` : ""}Recipes you plan now appear in Homebase.`, { ms: 8000 });
      return true;
    } catch { P.toast("Could not connect to Homebase. Open the link from Homebase again."); return false; }
  };
  const fromHash = () => {
    const m = location.hash.match(/^#\/homebase\?c=([A-Za-z0-9_-]+)$/);
    if (!m) return;
    history.replaceState(null, "", location.pathname);                              // the key must not stay in the address bar, the history or a screenshot
    connect(m[1]);
  };
  fromHash();
  addEventListener("hashchange", fromHash);
  addEventListener("online", flush);
  addEventListener("load", () => setTimeout(flush, 2500));

  P.hb = {
    connected: () => !!conn,
    family: () => (conn && conn.family) || "",
    base: () => (conn && conn.base) || ALLOWED[0] || "",
    syncAll,
    disconnect() { conn = null; pending = {}; write(KEY, null); write(PEND, {}); P.emit("homebase"); },
    /** A sheet to paste the link into (for when it was opened on another device). */
    paste() {
      P.sheet((close) => {
        const input = h("input", { class: "input", placeholder: "Paste the link from Homebase", autocomplete: "off", "data-autofocus": "" });
        return [
          h("h3", { class: "sheet-h" }, "Connect to Homebase"),
          h("p", { class: "set-about" }, "In Homebase open More, then Linked apps, then Link Platter, and copy the link. Paste it here."),
          input,
          h("div", { class: "sheet-btns" },
            h("button", { class: "btn ghost", type: "button", onClick: close }, "Cancel"),
            h("button", { class: "btn lime", type: "button", onClick: async () => { const m = input.value.match(/[#?&]c=([A-Za-z0-9_-]+)/); if (m && (await connect(m[1]))) close(); else if (!m) P.toast("That does not look like a Homebase link."); } }, "Connect")),
        ];
      }, { label: "Connect to Homebase" });
    },
  };
})();
