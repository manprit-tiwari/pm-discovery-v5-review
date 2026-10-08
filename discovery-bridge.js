/* Assistant discovery — a stand-in for the bridge AND for Claude, in the browser (5 Oct 2026).

   COPIED from modules/store-setup/discovery/versions/store-setup-v5/discovery-bridge.js (frozen,
   2 Oct 2026) and changed only where this module needs it -- the two modules share nothing at run time:
     - its own Cache Storage ("assistant-discovery-bridge"), so the two never read each other's builds;
     - the stand-in contact picker serves the copied phone page (screens/store/send/?demoPicker) and holds
       fourteen invented contacts, mixed so the chat's "who is who" guess has something to do;
     - NEW: /api/mystores -- the owner's own builds only, by the mobile on the request (x-owner-mobile), as
       production must do it: /api/stores lists every store and is the team's. GET → {stores} of his; GET
       ?id=&file= → a file of one of his builds; anyone else's → 404. No 10-digit mobile → 401.
     - assistant-v9 (addendum-018): /api/extract and its stand-in reader are removed -- the chat reads no product file;
       every file goes to the assistant.
     - v7 (addendum-014): /api/assistant/account and /api/assistant/link -- the FoodBridge Digital Assistant's two scopes
       the chat asks (an existing account by mobile; an owner login link). It is not connected yet, so both refuse:
       503 ASSISTANT_NOT_CONNECTED. Nothing is made up.
     - v7: tickets/<id>.json -- the Business Panel's ticket step per request (new → inReview → setUp → ready), which
       his builds carry as `status` on /api/mystores (in production: the panel's readiness, read through a contract,
       never its tables). PUT /api/tickets {id, status} is a discovery aid that stands in for the team.
   Everything below "the bridge's rules" is the store-setup copy, unchanged.

   ---- the store-setup copy's own header follows ----

/* Store Setup discovery — a stand-in for the bridge, in the browser (2026-10-01; v4; the draft added for v5).

   The prototype (screens/prototype/, byte-identical to foodbridge-mock-platform v7/store-setup @ 3c840e6)
   talks to a server for two things: sending a build (`/api/stores`) and the phone hand-off
   (`/api/handoff`). Discovery has no server and makes no real API calls, so this service worker answers
   those two paths itself — whatever host the prototype aims at (localhost:8787 or the live bridge) —
   and keeps everything in this browser's Cache Storage. Every other request goes to the network
   untouched, so the prototype's own files stay exactly as they were.

   It applies the bridge's own rules at mock-platform 3c840e6 (zoho-function/stores.js, handoff.js,
   api/stores.js, api/handoff.js), so the prototype meets the same answers:
   - POST /api/stores {id, meta?, files?|file?} → 200 {ok, id, stored:true, emailed:false}; or 400 bad_json /
     bad_id / bad_name / empty_file / nothing_sent, 413 too_large (a refused file: the prototype drops it and
     names it as missing). The summary is cleaned as the bridge cleans it.
   - GET  /api/stores                         → {store:"discovery", stores:[{id, meta, files, missing}]}, newest first
   - GET  /api/stores?id=&file=               → that file's bytes (a pieced file, joined)
   - POST /api/handoff {code, people?|file?|hello?} → {ok, n}; or 400 bad_code / bad_type / empty_file /
     nothing_sent, 413 too_large
   - GET  /api/handoff?code=                  → {opened, people, files, more}: taken once, about 3 MB per read,
     void after an hour
   - v5 (2026-10-02, owner — Sync): his saved store, under his mobile, as the module's server keeps it
     (store-setup SSOT-1 saveDraft; the module's PUT/GET /api/store-setup/draft):
     PUT /api/draft {v, at, state, papers} with x-owner-mobile → 200 {ok}; GET /api/draft → 200 {v, at, state, papers}
     or 404 no_draft; no 10-digit mobile → 401 OWNER_IDENTITY_MISSING. His answers only: files stay where added.
   (Not the team's key: the team's side is the customer-success module's. No email backup: emailed:false.)

   Two discovery-only aids. Nothing else is changed:
   - FoodBridge down: a switch on the screens (discovery.js) makes the prototype's calls fail as an
     unreachable bridge does, so “Waiting to send” / “Send now” and “Can't reach FoodBridge right now” can be
     seen. What already reached FoodBridge still shows on its own screen.
   - A stand-in contact picker: where the browser has no picker of its own and is not an iPhone — a
     computer, or a phone preview of Android — the phone layout (prototype/index.html, “Add from phone”) and
     the QR phone page opened with ?demoPicker (send/) “pick” six invented contacts. An iPhone, real or
     previewed, behaves as in the prototype: Safari's one-time setting, or “Open in Safari”. */

const STORE = "assistant-discovery-bridge";
const BASE = self.registration.scope + "__bridge__/";
const DEMO_CONTACTS = [
  { name: ["Gupta Kirana Store"], tel: ["+91 98765 00011"] },
  { name: ["Shree Ganesh Kirana"], tel: ["98765 00012"] },
  { name: ["Balaji General Stores"], tel: ["098765 00013"] },
  { name: ["Om Sai Provision"], tel: ["9876500014"] },
  { name: ["New Punjab Mart"], tel: ["98765 00015"] },
  { name: ["Haveli Dhaba"], tel: ["98765 00016"] },
  { name: ["Sethi Sweets"], tel: ["98765 00017"] },
  { name: ["Laxmi Agencies"], tel: ["98765 00018"] },
  { name: ["Metro Distributors"], tel: ["98765 00019"] },
  { name: ["Raju Driver"], tel: ["98765 00020"] },
  { name: ["Suresh Salesman"], tel: ["98765 00021"] },
  { name: ["Pinky Didi"], tel: ["98765 00022"] },
  { name: ["Mukesh Bhai"], tel: ["98765 00023"] },
  { name: ["Dr. Arora"], tel: ["98765 00024"] },
];

importScripts("screens/store/model.js", "screens/store/catalogue.js", "screens/store/import.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  const api = /\/api\/stores$/.test(u.pathname) ? stores : /\/api\/handoff$/.test(u.pathname) ? handoff : /\/api\/draft$/.test(u.pathname) ? draft :
    /\/api\/mystores$/.test(u.pathname) ? mystores :
    /\/api\/assistant\/(account|link)$/.test(u.pathname) ? assistant : /\/api\/tickets$/.test(u.pathname) ? tickets : null;
  if (api) e.respondWith(down(u).then((d) => (d ? Response.error() : api(e.request, u))).catch(fail));
  else if (e.request.mode === "navigate" && u.searchParams.has("demoPicker") && /\/store\/send\/(index\.html)?$/.test(u.pathname)) e.respondWith(withDemoPicker(e.request));
});

/* FoodBridge down: only the prototype's calls (to its bridge's host) fail; this scope's own pages still read. */
async function down(u) {
  if (u.origin === self.location.origin && u.pathname.startsWith(new URL(self.registration.scope).pathname)) return false;
  return !!(await get("settings/down"));
}

/* ── storage: Cache Storage under synthetic URLs ── */
const cache = () => caches.open(STORE);
async function put(path, body, type) {
  await (await cache()).put(BASE + path, new Response(body, { headers: { "Content-Type": type || "application/octet-stream" } }));
}
async function get(path) { const r = await (await cache()).match(BASE + path); return r || null; }
async function list(prefix) {
  return (await (await cache()).keys()).map((r) => r.url.slice(BASE.length)).filter((p) => p.startsWith(prefix)).sort();
}
async function del(path) { await (await cache()).delete(BASE + path); }

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fail = (err) => json(err && err.status ? err.status : 500, { error: (err && err.reason) || "unexpected", message: String((err && err.message) || err) });
class Refused extends Error { constructor(reason, status, message) { super(message || reason); this.reason = reason; this.status = status; } }
function fromB64(s) { const bin = atob(s || ""), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }

/* ── the bridge's rules (stores.js @ 3c840e6) ── */
const ID = /^FB-[a-z0-9]{6,14}-[a-z0-9]{4,10}$/;
const MAX_FILE = 3 * 1024 * 1024;
const RAW_EXT = "jpg|jpeg|png|webp|gif|heic|heif|bmp|tif|tiff|pdf|xlsx|xls|xlsm|csv|tsv|txt|vcf|doc|docx|ppt|pptx|odt|ods|json|xml|zip|mp3|m4a|aac|ogg|opus|wav|webm|mp4|mov|3gp|amr|bin";
const RAW = "raw\\/[A-Za-z0-9\\u0900-\\u097F_()-][A-Za-z0-9\\u0900-\\u097F._()-]{0,110}\\.(" + RAW_EXT + ")(\\.part\\d{1,3}of\\d{1,3})?";
const NAME = new RegExp("^(setup\\.json|[A-Za-z0-9\\u0900-\\u097F._-]{1,120}\\.xlsx|photos\\/[A-Za-z0-9_-]{1,40}\\.(jpg|png|webp)|voice\\/[A-Za-z0-9_-]{1,40}\\.(webm|ogg|m4a|mp4|mp3|wav|aac)|" + RAW + ")$", "i");
const PART = /\.part(\d{1,3})of(\d{1,3})$/;
const TYPES = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", json: "application/json",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif",
  pdf: "application/pdf", csv: "text/csv", txt: "text/plain", vcf: "text/vcard", xls: "application/vnd.ms-excel",
  webm: "audio/webm", ogg: "audio/ogg", m4a: "audio/mp4", mp4: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav", aac: "audio/aac" };
function typeOf(name) {
  const n = String(name).replace(PART, "");
  if (/^raw\//.test(n) && /\.mp4$/i.test(n)) return "video/mp4";
  return TYPES[n.split(".").pop().toLowerCase()] || "application/octet-stream";
}
function cleanUpload(b) {
  b = b || {};
  const id = String(b.id || "");
  if (!ID.test(id)) throw new Refused("bad_id", 400, "Not a Store Setup id.");
  const out = { id };
  if (b.meta) out.meta = cleanMeta(b.meta, id);
  const listed = (Array.isArray(b.files) ? b.files : []).concat(b.file ? [b.file] : []);
  let total = 0;
  out.files = listed.map((f) => {
    const name = String((f && f.name) || "");
    if (!NAME.test(name)) throw new Refused("bad_name", 400, "Not a file Store Setup sends.");
    const bytes = fromB64(String(f.data || ""));
    if (!bytes.length) throw new Refused("empty_file", 400, "The file is empty.");
    total += bytes.length;
    if (bytes.length > MAX_FILE || total > MAX_FILE) throw new Refused("too_large", 413, "Over 3 MB.");
    return { name, bytes };
  });
  if (!out.meta && !out.files.length) throw new Refused("nothing_sent", 400, "Neither a summary nor a file.");
  return out;
}
function cleanMeta(m, id) {
  const str = (v, max) => String(v == null ? "" : v).trim().replace(/\s+/g, " ").slice(0, max);
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0);
  const now = Date.now(), built = Date.parse(m.at);
  const trusted = Number.isFinite(built) && built <= now + 5 * 60e3 && built > now - 180 * 864e5;
  const c = m.counts || {};
  return {
    id, at: new Date(trusted ? built : now).toISOString(), received: new Date(now).toISOString(),
    shop: str(m.shop, 80), owner: str(m.owner, 80), mobile: str(m.mobile, 20), gst: str(m.gst, 20), type: str(m.type, 120),
    counts: { products: num(c.products), productFiles: num(c.productFiles), customers: num(c.customers), suppliers: num(c.suppliers), staff: num(c.staff),
      counted: num(c.counted), answered: num(c.answered), photos: num(c.photos), gaps: num(c.gaps) },
    files: (Array.isArray(m.files) ? m.files : []).map((f) => str(f, 140)).filter((f) => NAME.test(f)).slice(0, 200),
    lang: str(m.lang, 4), version: str(m.version, 24),
  };
}

/* ── /api/stores ── */
async function stores(req, u) {
  if (req.method === "POST") {
    const b = await req.json().catch(() => null);
    if (!b) return json(400, { error: "bad_json" });
    const up = cleanUpload(b);
    for (const f of up.files) await put("stores/" + up.id + "/files/" + f.name, f.bytes, typeOf(f.name));
    if (up.meta) await put("stores/" + up.id + "/meta.json", JSON.stringify(up.meta), "application/json");
    return json(200, { ok: true, id: up.id, stored: true, emailed: false });
  }
  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });
  const id = u.searchParams.get("id"), file = u.searchParams.get("file");
  if (id || file) {
    if (!ID.test(String(id)) || !(NAME.test(String(file)) || file === "meta.json")) return json(400, { error: "bad_name" });
    if (file === "meta.json") { const m = await get("stores/" + id + "/meta.json"); return m ? new Response(await m.arrayBuffer(), { headers: { "Content-Type": "application/json" } }) : json(404, { error: "not_found" }); }
    const r = await get("stores/" + id + "/files/" + file);
    if (r) return new Response(await r.arrayBuffer(), { status: 200, headers: { "Content-Type": typeOf(file) } });
    /* a file that came in pieces is downloaded as one */
    const parts = (await list("stores/" + id + "/files/" + file + ".part")).filter((p) => PART.test(p));
    if (!parts.length) return json(404, { error: "not_found" });
    parts.sort((a, b) => +a.match(PART)[1] - +b.match(PART)[1]);
    const bufs = [];
    for (const p of parts) bufs.push(await (await get(p)).arrayBuffer());
    return new Response(new Blob(bufs), { status: 200, headers: { "Content-Type": typeOf(file) } });
  }
  const all = await list("stores/");
  const byId = {};
  for (const p of all) {
    const [, sid, kind, ...rest] = p.split("/");
    const s = byId[sid] || (byId[sid] = { id: sid, meta: null, files: [] });
    if (kind === "meta.json") s.meta = await (await get(p)).json();
    else if (kind === "files") s.files.push({ name: rest.join("/"), size: (await (await get(p)).arrayBuffer()).byteLength });
  }
  const out = Object.values(byId).map((s) => {
    const joined = [], big = {};
    s.files.forEach((f) => {
      const m = f.name.match(PART);
      if (!m) { joined.push(f); return; }
      const name = f.name.replace(PART, ""), g = big[name] || (big[name] = { name, size: 0, parts: +m[2], got: 0 });
      g.size += f.size; g.got++;
    });
    Object.values(big).forEach((g) => joined.push(g.got < g.parts ? { name: g.name, size: g.size, parts: g.parts, partial: true } : { name: g.name, size: g.size, parts: g.parts }));
    const have = joined.filter((f) => !f.partial).map((f) => f.name);
    const expected = (s.meta && s.meta.files) || [];
    return { id: s.id, meta: s.meta, files: joined, missing: expected.filter((n) => have.indexOf(n) < 0) };
  }).sort((a, b) => String((b.meta && b.meta.at) || "").localeCompare(String((a.meta && a.meta.at) || "")));
  return json(200, { store: "discovery", stores: out });
}

/* ── /api/handoff (handoff.js @ 3c840e6) ── */
const CODE = /^[a-z0-9]{12}$/;
const TTL = 60 * 60e3, MAX_PEOPLE = 3000, MAX_PHOTO = 2.5 * 1024 * 1024, TAKE_BYTES = 3 * 1024 * 1024;
const PHOTO_TYPE = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;
function cleanPost(b) {
  b = b || {};
  const code = String(b.code || "");
  if (!CODE.test(code)) throw new Refused("bad_code", 400, "Not a hand-off code.");
  const str = (v, max) => String(v == null ? "" : v).trim().replace(/\s+/g, " ").slice(0, max);
  const people = (Array.isArray(b.people) ? b.people : []).slice(0, MAX_PEOPLE).map((p) => ({
    name: str(p && p.name, 80), phone: str(p && p.phone, 20).replace(/[^\d+ -]/g, ""),
  })).filter((p) => p.name || p.phone);
  let file = null;
  if (b.file) {
    const type = String(b.file.type || "");
    if (!PHOTO_TYPE.test(type)) throw new Refused("bad_type", 400, "Photos and PDFs only.");
    const data = String(b.file.data || ""), size = Math.floor(data.length * 3 / 4);
    if (!size) throw new Refused("empty_file", 400, "The file is empty.");
    if (size > MAX_PHOTO) throw new Refused("too_large", 413, "Over 2.5 MB.");
    file = { name: str(b.file.name, 80).replace(/[^\w .()ऀ-ॿ-]/g, "") || "photo.jpg", type, data };
  }
  if (!people.length && !file && !b.hello) throw new Refused("nothing_sent", 400, "Nothing sent.");
  return { code, people, file, hello: !!b.hello && !people.length && !file };
}
let seq = 0;
async function handoff(req, u) {
  if (req.method === "POST") {
    const b = await req.json().catch(() => null);
    if (!b) return json(400, { error: "bad_json" });
    const p = cleanPost(b);
    const name = Date.now() + "-" + String(seq++ % 10000).padStart(4, "0") + Math.random().toString(36).slice(2, 6) + ".json";
    await put("handoff/" + p.code + "/" + name, JSON.stringify({ at: Date.now(), hello: p.hello || undefined, people: p.people, file: p.file || undefined }), "application/json");
    return json(200, { ok: true, n: p.people.length });
  }
  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });
  const code = u.searchParams.get("code") || "";
  if (!CODE.test(code)) return json(400, { error: "bad_code" });
  const now = Date.now(), entries = [];
  let more = false, bytes = 0;
  for (const p of await list("handoff/" + code + "/")) {
    const r = await get(p);
    const text = r ? await r.text() : "";
    if (bytes && bytes + text.length > TAKE_BYTES) { more = true; break; }
    try { entries.push(JSON.parse(text)); } catch (e) { /* a broken entry is dropped */ }
    await del(p);
    bytes += text.length;
  }
  const fresh = entries.filter((e) => e && now - Number(e.at || 0) < TTL);
  return json(200, { opened: fresh.length > 0, people: [].concat(...fresh.map((e) => e.people || [])), files: fresh.filter((e) => e.file).map((e) => e.file), more });
}

/* ── /api/draft (v5): his saved store, keyed by the mobile on the request ── */
async function draft(req) {
  const m = String(req.headers.get("x-owner-mobile") || "").replace(/\D/g, "").slice(-10);
  if (!/^\d{7,10}$/.test(m)) return json(401, { error: "OWNER_IDENTITY_MISSING", message: "No owner on this request." });
  if (req.method === "PUT") {
    const b = await req.json().catch(() => null);
    if (!b || typeof b.state !== "object") return json(400, { error: "bad_draft", message: "Not a Store Setup draft." });
    await put("drafts/" + m + ".json", JSON.stringify({ v: 1, at: Number(b.at) || Date.now(), state: b.state, papers: Number(b.papers) || 0 }), "application/json");
    return json(200, { ok: true });
  }
  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });
  const r = await get("drafts/" + m + ".json");
  return r ? new Response(await r.text(), { status: 200, headers: { "Content-Type": "application/json" } }) : json(404, { error: "no_draft" });
}

/* ── the phone layout and the phone page, with a stand-in contact picker (discovery only) ── */
async function withDemoPicker(req) {
  const page = new URL(req.url); page.search = "";
  const r = await fetch(page.href);
  const html = await r.text();
  const stub = "<script>/* discovery: a stand-in for the phone's contact picker — not on an iPhone, and not where the browser has one */" +
    "(function(){var ua=navigator.userAgent||\"\";" +
    "var iphone=/iPhone|iPad|iPod/.test(ua)||(navigator.platform===\"MacIntel\"&&navigator.maxTouchPoints>1);" +
    "if(iphone||(navigator.contacts&&navigator.contacts.select))return;" +
    "navigator.contacts={select:function(){return Promise.resolve(" + JSON.stringify(DEMO_CONTACTS) + ");}};})();</script>";
  return new Response(html.replace("<script", stub + "<script"), { status: r.status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/* ── /api/mystores (assistant): an owner sees only the stores built under his mobile ── */
async function mystores(req, u) {
  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });
  const m = String(req.headers.get("x-owner-mobile") || "").replace(/\D/g, "").slice(-10);
  if (!/^\d{7,10}$/.test(m)) return json(401, { error: "OWNER_IDENTITY_MISSING", message: "No owner on this request." });
  const all = await (await stores(new Request(self.registration.scope + "api/stores"), new URL(self.registration.scope + "api/stores"))).json();
  const mine = (all.stores || []).filter((s) => s.meta && String(s.meta.mobile || "").replace(/\D/g, "").slice(-10) === m);
  for (const s of mine) { const t = await get("tickets/" + s.id + ".json"); s.status = t ? (await t.json()).status : "new"; }
  const id = u.searchParams.get("id"), file = u.searchParams.get("file");
  if (id || file) {
    if (!mine.some((s) => s.id === id)) return json(404, { error: "not_found" });
    return stores(new Request(u.href), u);
  }
  return json(200, { stores: mine });
}

/* ── v7: the FoodBridge Digital Assistant — not connected yet, so it refuses (addendum-014 D-4) ── */
async function assistant(req) {
  const m = String(req.headers.get("x-owner-mobile") || "").replace(/\D/g, "").slice(-10);
  if (!/^\d{7,10}$/.test(m)) return json(401, { error: "OWNER_IDENTITY_MISSING", message: "No owner on this request." });
  return json(503, { error: "ASSISTANT_NOT_CONNECTED", message: "Not connected to FoodBridge Digital Assistant." });
}

/* ── v7: the ticket step per request (the Business Panel's) — PUT is the discovery's stand-in for the team ── */
const STEPS = ["new", "inReview", "setUp", "ready"];
async function tickets(req) {
  if (req.method !== "PUT") return json(405, { error: "method_not_allowed" });
  const b = await req.json().catch(() => null);
  if (!b || !ID.test(String(b.id || ""))) return json(404, { error: "no_such_store" });
  if (STEPS.indexOf(b.status) < 0) return json(400, { error: "bad_status" });
  if (!(await get("stores/" + b.id + "/meta.json"))) return json(404, { error: "no_such_store" });
  const cur = await get("tickets/" + b.id + ".json"), was = cur ? (await cur.json()).status : "new";
  /* the panel's rule: Ready to use only once it is Set up */
  if (b.status === "ready" && was !== "setUp" && was !== "ready") return json(409, { error: "READY_BEFORE_SET_UP" });
  await put("tickets/" + b.id + ".json", JSON.stringify({ status: b.status, since: Date.now() }), "application/json");
  return json(200, { ok: true, status: b.status });
}
