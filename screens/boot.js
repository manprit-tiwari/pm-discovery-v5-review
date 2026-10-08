/* Assistant discovery · every screen starts the stand-in bridge first (../discovery-bridge.js), so the
   chat's calls -- the saved store, the build, the phone hand-off, Claude's product reading -- are
   answered in this browser with no server; then the chat mounts. Serve over HTTP: a service worker does
   not run from file://. */
(function () {
  "use strict";
  /* v11 (owner): reset the whole demo, not only "Naye se shuru" — the chat (localStorage), the files (IndexedDB), the saved
     stores and builds the stand-in keeps (the service worker's cache) and the worker itself; then a fresh page.
     Discovery only. Same origin = every version served from here starts clean too. Also: chat.html?reset */
  window.FB_RESET = async function () {
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* private mode */ }
    try {
      const dbs = indexedDB.databases ? await indexedDB.databases() : [];
      await Promise.all(dbs.map(function (d) { return new Promise(function (ok) { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = ok; }); }));
    } catch (e) { /* no IndexedDB */ }
    try { const ks = await caches.keys(); await Promise.all(ks.map(function (k) { return caches.delete(k); })); } catch (e) { /* no caches */ }
    try { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(function (r) { return r.unregister(); })); } catch (e) { /* no worker */ }
    location.replace(location.pathname);
  };
  if (/[?&]reset\b/.test(location.search)) { window.FB_RESET(); return; }
  function go() { if (window.FBAssistant) window.FBAssistant.mount(); }
  if (!("serviceWorker" in navigator)) { go(); return; }
  navigator.serviceWorker.register("../discovery-bridge.js", { scope: "../" })
    .then(function () { return navigator.serviceWorker.ready; })
    .then(function () {
      if (navigator.serviceWorker.controller) return;
      return new Promise(function (ok) { navigator.serviceWorker.addEventListener("controllerchange", ok, { once: true }); setTimeout(ok, 3000); });
    })
    .then(go, function (e) { console.warn("discovery bridge not started:", e); go(); });
})();
