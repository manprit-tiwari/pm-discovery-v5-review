/* Store Setup · where a store's files wait, shared by the phone page
   (app.js) and the desktop page (desktop/desk.js), so both keep one set of
   answers, one set of photos and one queue of builds in this browser.

   - DB: photos and voice notes (IndexedDB "fb-assistant-store").
   - OUTBOX: builds on their way to FoodBridge (IndexedDB "fb-assistant-store-outbox").
   - make(): one build from the answers -- the Excel, setup.json and every
     photo and voice note -- queued in the outbox.
   - deliver(): sends what is left of one build, file by file.

   Build my store (26 Sep 2026, owner): the build goes to FoodBridge, where
   the customer success team opens it (the bridge's /api/stores, read back
   at v7/stores.html). It is NOT kept in this browser: a build waits here only
   until it is delivered, file by file, and each file is deleted as it lands.
   Offline or no bridge yet, it stays queued and goes on the next chance. */

(function (root) {
  "use strict";

  const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const PIECE = 2.5 * 1024 * 1024;   // under the bridge's 3 MB a request (zoho-function/stores.js MAX_FILE)
  const MAX_DROP = 40 * 1024 * 1024;   // the largest file he can drop in: sixteen pieces

  function store(name, dbName, opts) {
    let opening = null;
    function open() {
      if (!opening) opening = new Promise(function (res, rej) {
        const r = indexedDB.open(dbName, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore(name, opts); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
      return opening;
    }
    return function run(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (res, rej) {
          const tx = db.transaction(name, mode);
          const req = fn(tx.objectStore(name));
          tx.oncomplete = function () { res(req ? req.result : undefined); };
          tx.onerror = function () { rej(tx.error); };
        });
      });
    };
  }

  const blobs = store("blobs", "fb-assistant-store");
  const DB = {
    put: function (id, blob) { return blobs("readwrite", function (st) { return st.put(blob, id); }); },
    get: function (id) { return blobs("readonly", function (st) { return st.get(id); }); },
    del: function (id) { return blobs("readwrite", function (st) { return st.delete(id); }); },
    clear: function () { return blobs("readwrite", function (st) { return st.clear(); }); },
  };

  const builds = store("builds", "fb-assistant-store-outbox", { keyPath: "id" });
  const OUTBOX = {
    all: function () { return builds("readonly", function (st) { return st.getAll(); }); },
    put: function (b) { return builds("readwrite", function (st) { return st.put(b); }); },
    del: function (id) { return builds("readwrite", function (st) { return st.delete(id); }); },
  };

  const BRIDGE = "https://zoho-function-nu.vercel.app", BRIDGE_LOCAL = "http://localhost:8787";
  function bridge() {
    let b = "";
    try { b = localStorage.getItem("fb-api-base") || ""; } catch (e) { /* private window */ }
    if (b) return b.replace(/\/+$/, "");
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? BRIDGE_LOCAL : BRIDGE;
  }

  function post(body) {
    return fetch(bridge() + "/api/stores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.status; }, function () { return 0; });
  }
  function bytesOf(blob) { return blob.arrayBuffer().then(function (b) { return new Uint8Array(b); }); }

  /* Sends what is left of one build. 200 lands it; a 4xx is about the file and
     will never pass, so it is dropped (and named in the summary as missing);
     anything else is about the network or the bridge, so it waits.
     onFile runs after each file lands, for a screen that shows the count. */
  async function deliver(X, b, onFile) {
    /* The first request is the summary with the Excel and setup.json: the
       bridge stores them and emails the Excel to the team as a backup. */
    if (!b.metaSent) {
      const first = b.files.filter(function (f) { return /\.xlsx$|^setup\.json$/.test(f.name); });
      const enc = await Promise.all(first.map(async function (f) { return { name: f.name, data: X.b64(await bytesOf(f.blob)) }; }));
      const st = await post({ id: b.id, meta: b.meta, files: enc });
      if (st !== 200 && (st < 400 || st >= 500)) return false;
      b.metaSent = true;
      b.files = b.files.filter(function (f) { return first.indexOf(f) < 0; });
      b.sent += first.length;
      await OUTBOX.put(b);
    }
    while (b.files.length) {
      const f = b.files[0];
      /* A file bigger than one request (a dropped PDF, a phone photo as it came) goes in pieces,
         "<name>.part2of5"; the bridge lists them as one and the team downloads them as one.
         f.part is how many are in, so a dropped connection resends one piece, not the file. */
      const n = Math.ceil(f.blob.size / PIECE);
      if (n > 1) {
        f.part = f.part || 0;
        while (f.part < n) {
          const piece = f.blob.slice(f.part * PIECE, (f.part + 1) * PIECE);
          const st = await post({ id: b.id, file: { name: f.name + ".part" + (f.part + 1) + "of" + n, data: X.b64(await bytesOf(piece)) } });
          if (st !== 200 && (st < 400 || st >= 500)) return false;
          if (st !== 200) break;   // refused for good: the rest of this file would be too
          f.part += 1;
          await OUTBOX.put(b);
        }
      } else {
        const st = await post({ id: b.id, file: { name: f.name, data: X.b64(await bytesOf(f.blob)) } });
        if (st !== 200 && (st < 400 || st >= 500)) return false;
      }
      b.files.shift();
      b.sent += 1;
      await OUTBOX.put(b);
      if (onFile) onFile(b);
    }
    await OUTBOX.del(b.id);
    return true;
  }

  async function gatherBlobs(s) {
    const out = {};
    for (const p of s.papers) {
      const b = await DB.get(p.id).catch(function () { return null; });
      if (b) out[p.id] = { bytes: new Uint8Array(await b.arrayBuffer()), mime: b.type || p.mime };
    }
    return out;
  }

  /* One build of the store as it is now, queued. The caller sets S.lastBuild and saves. */
  async function make(CAT, X, s) {
    const now = new Date();
    const files = X.parts(CAT, s, await gatherBlobs(s), now).map(function (f) {
      return { name: f.name, blob: new Blob([f.bytes], { type: /\.xlsx$/.test(f.name) ? XLSX : "application/octet-stream" }) };
    });
    const id = "FB-" + now.getTime().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    const b = { id: id, at: now.getTime(), meta: X.summary(CAT, s, now, files.map(function (f) { return f.name; })), files: files, sent: 0, total: files.length, metaSent: false };
    await OUTBOX.put(b);
    return b;
  }

  /* One file he added, kept as it came (1 Oct 2026): into IndexedDB, and onto the answers as a
     paper of kind "file" named for raw/. A contacts file or a list is also read, and its people
     arrive unsorted; the paper remembers them, so removing the file takes back what is still
     unsorted. Returns the paper, or { error } for a file too big to send. */
  async function take(X, M, IMP, s, f, step) {
    if (f.size > MAX_DROP) return { error: "tooBig" };
    const id = M.uid("fl");
    await DB.put(id, f);
    const p = { id: id, kind: "file", file: X.rawName(s, f.name), name: f.name, mime: f.type || "", size: f.size, step: step, at: Date.now() };
    let r = null;
    if (IMP) { try { r = await IMP.readFile(f.name, new Uint8Array(await f.arrayBuffer())); } catch (e) { r = null; } }
    if (r && r.people.length) {
      p.people = []; p.contacts = 0; p.dup = 0;
      r.people.forEach(function (c) {
        const x = M.addPerson(s, { name: c.name, phone: c.phone, src: "vcf", type: c.type || null });
        if (x.dup) p.dup++; else { p.contacts++; p.people.push(x.id); }
      });
    }
    s.papers.push(p);
    return p;
  }

  /* A paper off the answers: its file, and the contacts it brought that are still unsorted. */
  function drop(M, s, id) {
    const gone = s.papers.find(function (p) { return p.id === id; });
    (gone && gone.people || []).forEach(function (pid) { if (s.people[pid] && !s.people[pid].type) M.removePerson(s, pid); });
    s.papers = s.papers.filter(function (p) { return p.id !== id; });
    if (s.store.photo === id) s.store.photo = null;
    DB.del(id).catch(function () {});
  }

  root.FB_OUTBOX = { take: take, drop: drop, DB: DB, OUTBOX: OUTBOX, bridge: bridge, deliver: deliver, make: make, MAX_DROP: MAX_DROP };
})(window);
