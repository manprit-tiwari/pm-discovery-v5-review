/* Store Setup · the model. Pure logic, no DOM: what is kept, and everything
   worked out from it (prices, routes, first orders, what is missing).
   The screens (app.js) and the export (export.js) both read from here, and
   the headless tests run it in node. */

(function (root) {
  "use strict";

  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const VERSION = 1;

  /* Per ₹100 of MRP: what the distributor pays, and what he sells to a shop
     for. Every product starts from this standard margin; he changes a
     product's own price where his differs. (Until 26 Sep 2026 a "Your rates"
     step asked for it once per company; old saves still carry those answers,
     marked `seen`, and they still price their products.) */
  const DEFAULT_RULE = { buy: 80, sell: 87 };

  /* 26 Sep 2026: Phone contacts, Customers, Staff and Suppliers are one step,
     "people": he brings contacts in once and tags each one. */
  const RULES_N = 6;   // Daily operation questions (Order steps went 26 Sep 2026; expiry dates 28 Sep 2026)
  const ALL_STEPS = ["store", "items", "people", "stock", "rules", "finish"];   // Usual orders went 26 Sep 2026 (owner)
  /* Hidden for now (owner, 1 Oct 2026): Products and Warehouse stock. Nothing is deleted -- their
     screens, words, answers and export stay as they are; both pages just don't show or ask them,
     and What's missing doesn't name them. To bring a step back, take it off this list. */
  const HIDDEN_STEPS = ["items", "stock"];
  function shown(step) { return HIDDEN_STEPS.indexOf(step) < 0; }
  /* Contacts is only marking who is who (owner, 1 Oct 2026): the details asked after it -- a
     customer's days, area and terms ("days"), staff jobs and a delivery person ("team") -- are
     hidden, not deleted. Remove one from the list to ask it again. */
  const HIDDEN_ASKS = ["days", "team"];
  function asked(x) { return HIDDEN_ASKS.indexOf(x) < 0; }
  const ASK_OF = { shopNoDay: "days", shopNoArea: "days", shopNoPay: "days", noDelivery: "team", staffNoRole: "team" };
  const STEPS = ALL_STEPS.filter(shown);

  function blank() {
    return {
      v: VERSION,
      lang: "en",           // English first (owner, 26 Sep 2026); हिंदी one tap away on Welcome and in ⋯
      startedAt: null,
      updatedAt: null,
      store: { name: "", owner: "", mobile: "", gst: "", type: "", types: [], typeOther: "", makes: null, photo: null, loc: null, address: "", godownAtShop: null, godowns: [], warehouses: null, areas: [] },
      companies: {},        // companyId -> { buy, sell, seen? }  (presence = he sells its products; kept by syncCompanies)
      customCompanies: [],  // [{ id, name, color }]
      items: {},            // itemId -> { mrp?, sell?, buy?, unit, caseQty?, speed, gst?, barcode, stockCases, stockLoose, touched:{} }
      customItems: {},      // itemId -> { name, brand, company, pack, mrp, caseQty, cat, photo, barcode }
      people: {},           // id -> person
      order: [],            // people ids in the order they were added
      usual: {},            // shopId -> { itemId: qty }; no longer asked (26 Sep 2026), kept so old saves open
      rules: { payMethods: [], routes: null, selfOrder: null, partPay: null, returns: null, batches: null, morning: null, note: "", payMethodsOther: "", returnsOther: "", morningOther: "" },   // Order steps went 26 Sep 2026 (owner)
      notes: { people: "", products: "", end: "" },   // v6: "anything else?" after contacts, products, and at the end
      comments: {},         // v8: question id -> { q, text, at } — what he typed or said instead of a choice
      skipped: {},          // step -> true when the owner said "none / later"
      papers: [],           // [{ id, kind: photo|voice, step, at, mime }]
      stockSel: null,       // Godown stock: the products on his count, newest first (null: not opened yet)
    };
  }

  /* ─────────────────────────────── helpers ── */

  function uid(prefix) {
    return (prefix || "x") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /* Only a mobile loses its +91 / 0: a landline keeps its STD code. */
  function phone10(raw) {
    let d = String(raw || "").replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("91") && /[6-9]/.test(d[2])) d = d.slice(2);
    if (d.length === 11 && d.startsWith("0") && /[6-9]/.test(d[1])) d = d.slice(1);
    return d;
  }

  /* v10 (addendum-019): the platform's own sign-in rule (storefront Step1SignIn): 7–10 digits, any first digit. */
  function phoneOk(raw) { return /^\d{7,10}$/.test(phone10(raw)); }

  function phoneShow(raw) {
    const d = phone10(raw);
    return d.length === 10 ? d.slice(0, 5) + " " + d.slice(5) : String(raw || "");
  }

  const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  function gstOk(g) { return GSTIN_RE.test(String(g || "").toUpperCase().trim()); }
  /* The login mobile is the one thing the Shop step must have (owner, 28 Sep 2026):
     its Save waits for a valid one (v10: the sign-in rule, phoneOk). Everything else on it is optional. */
  function storeReady(s) { return phoneOk(s.store.mobile); }

  /* ──────────────────────────── catalogue ── */

  function companyList(cat, s) {
    return cat.companies.concat(s.customCompanies || []);
  }

  function companyById(cat, s, id) {
    return companyList(cat, s).find(function (c) { return c.id === id; }) || null;
  }

  /* One item as the screens see it: catalogue row + custom row + his changes. */
  function item(cat, s, id) {
    const base = cat.items.find(function (x) { return x.id === id; }) || (s.customItems[id] ? Object.assign({ id: id, custom: true }, s.customItems[id]) : null);
    if (!base) return null;
    const mine = s.items[id] || {};
    const c = cat.categories[base.cat] || cat.categories.other;
    const rule = s.companies[base.company] || DEFAULT_RULE;
    const mrp = base.loose ? null : mine.mrp != null ? mine.mrp : base.mrp;
    const caseQty = mine.caseQty != null ? mine.caseQty : base.caseQty || 1;
    return {
      id: id,
      custom: !!base.custom,
      company: base.company,
      brand: base.brand,
      name: base.name,
      hi: base.hi || "",
      pack: base.pack,
      cat: base.cat,
      icon: base.emoji || c.icon,
      loose: !!base.loose,     // sold per kg / dozen / …: no brand, no MRP, no case
      per: base.per || "",
      hsn: base.hsn || c.hsn,
      gst: mine.gst != null ? mine.gst : c.gst,
      mrp: mrp,
      caseQty: caseQty,
      sell: mine.sell != null ? mine.sell : (mrp ? round2(mrp * rule.sell / 100) : null),
      buy: mine.buy != null ? mine.buy : (mrp ? round2(mrp * rule.buy / 100) : null),
      unit: base.loose ? "piece" : mine.unit || "case",
      speed: mine.speed || null,
      barcode: mine.barcode || base.barcode || "",
      stockCases: mine.stockCases != null ? mine.stockCases : null,
      stockLoose: mine.stockLoose != null ? mine.stockLoose : null,
      photo: base.photo || null,
      img: base.img || null,
      on: !!s.items[id],
      touched: mine.touched || {},
    };
  }

  /* The companies he sells are the companies of the products he chose: a
     company arrives with its first product, at the standard margin, and
     leaves with its last. A rule he already gave is kept. */
  function syncCompanies(cat, s) {
    const need = {};
    Object.keys(s.items).forEach(function (id) {
      const base = cat.items.find(function (x) { return x.id === id; }) || s.customItems[id];
      if (base && base.company) need[base.company] = 1;
    });
    Object.keys(s.companies).forEach(function (k) { if (!need[k]) delete s.companies[k]; });
    Object.keys(need).forEach(function (k) { if (!s.companies[k]) s.companies[k] = { buy: DEFAULT_RULE.buy, sell: DEFAULT_RULE.sell }; });
    return s;
  }

  /* Products that left the catalogue (26 Sep 2026: everything but food) leave
     his list too, then the companies follow what is left. */
  function tidy(cat, s) {
    Object.keys(s.items).forEach(function (id) {
      if (!s.customItems[id] && !cat.items.some(function (x) { return x.id === id; })) delete s.items[id];
    });
    return syncCompanies(cat, s);
  }

  /* The aisle a category sits in, for "by type". */
  function aisleOf(cat, catId) {
    return (cat.aisles || []).find(function (a) { return a.cats.indexOf(catId) >= 0; }) || null;
  }

  function chosenItems(cat, s) {
    return Object.keys(s.items).map(function (id) { return item(cat, s, id); }).filter(Boolean);
  }

  /* Price of one selling unit (a piece, or a whole case). */
  function unitPrice(it, which) {
    const p = which === "buy" ? it.buy : it.sell;
    if (p == null) return null;
    return it.unit === "case" ? round2(p * it.caseQty) : p;
  }

  /* Words match a product's name, brand, pack, category or company, so
     "surf", "hul" and "detergent" all find Surf Excel. */
  function search(cat, s, q, companyId) {
    const words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    const all = cat.items.concat(Object.keys(s.customItems).map(function (id) { return Object.assign({ id: id }, s.customItems[id]); }));
    const byName = [], byKind = [];
    all.forEach(function (x) {
      if (companyId && x.company !== companyId) return;
      if (!words.length) { byName.push(x.id); return; }
      const own = (x.name + " " + (x.hi || "") + " " + (x.brand || "")).toLowerCase();
      const co = companyById(cat, s, x.company);
      const hay = own + " " + ((x.pack || "") + " " + (co ? co.name + " " + co.short : "") + " " +
        (cat.categories[x.cat] ? cat.categories[x.cat].en + " " + cat.categories[x.cat].hi : "")).toLowerCase();
      if (!words.every(function (w) { return hay.indexOf(w) >= 0; })) return;
      /* The product's own name first; things that only share its company or kind after. */
      (words.every(function (w) { return own.indexOf(w) >= 0; }) ? byName : byKind).push(x.id);
    });
    return byName.concat(byKind);
  }

  /* A scanned barcode → the item it is: his own changes first, then the
     catalogue (every catalogue item carries its real barcode), then his new
     products. */
  function findBarcode(cat, s, code) {
    code = String(code || "").trim();
    if (!code) return null;
    for (const id in s.items) if (s.items[id].barcode === code) return id;
    const hit = cat.items.find(function (x) { return x.barcode === code; });
    if (hit) return hit.id;
    for (const id in s.customItems) if (s.customItems[id].barcode === code) return id;
    return null;
  }

  /* ─────────────────────────────── people ── */

  function addPerson(s, p) {
    const ph = phone10(p.phone);
    if (ph) {
      for (const id in s.people) if (phone10(s.people[id].phone) === ph) return { id: id, dup: true };
    }
    const id = uid("p");
    s.people[id] = Object.assign({ id: id, name: "", phone: "", type: null, src: "typed", at: Date.now() }, p, { id: id });
    s.order.push(id);
    return { id: id, dup: false };
  }

  function peopleOf(s, type) {
    return s.order.map(function (id) { return s.people[id]; }).filter(function (p) { return p && p.type === type; });
  }

  function unsorted(s) { return peopleOf(s, null); }

  /* A contact leaves for good: from the list, the order, and any usual order. */
  function removePerson(s, id) {
    delete s.people[id];
    delete s.usual[id];
    s.order = s.order.filter(function (x) { return x !== id; });
    return s;
  }

  /* A first guess from the name, to show as a hint while sorting. It never
     tags anyone by itself. Distributors save customers as "Gupta Kirana",
     suppliers as "… Agency", staff as "Raju Driver". */
  const GUESS = [
    ["staff", /\b(driver|salesman|sales ?man|helper|delivery|staff|munshi|accountant|loader|office)\b/i],
    ["supplier", /\b(agency|agencies|depot|distributors?|stockist|super ?stockist|c ?& ?f|cnf|wholesale|company|ltd|limited|pvt)\b/i],
    ["shop", /\b(kirana|store|stores|general|provision|provisions|mart|bhandar|dukan|medical|dairy|bakery|sweets|hotel|restaurant|dhaba|canteen|supermarket|traders|enterprises)\b/i],
  ];
  function guessType(name) {
    const hit = GUESS.find(function (g) { return g[1].test(String(name || "")); });
    return hit ? hit[0] : null;
  }

  /* ─────────────────────────── worked out ── */

  function routes(s) {
    const shops = peopleOf(s, "shop");
    const staff = peopleOf(s, "staff");
    const out = [];
    DAYS.forEach(function (day) {
      const onDay = shops.filter(function (p) { return (p.days || []).indexOf(day) >= 0; });
      const areas = {};
      onDay.forEach(function (p) { const a = p.area || ""; (areas[a] = areas[a] || []).push(p); });
      Object.keys(areas).sort().forEach(function (a) {
        out.push({
          day: day,
          area: a,
          shops: areas[a],
          staff: staff.filter(function (st) { return (st.days || []).indexOf(day) >= 0; }),
        });
      });
    });
    return out;
  }

  function money(s) {
    const owedToHim = peopleOf(s, "shop").reduce(function (t, p) { return t + (Number(p.owes) || 0); }, 0);
    const heOwes = peopleOf(s, "supplier").reduce(function (t, p) { return t + (Number(p.owe) || 0); }, 0);
    return { owedToHim: owedToHim, heOwes: heOwes };
  }

  /* The files and photos he added on a step (1 Oct 2026). A file can stand in for a step's work:
     a rate list for choosing products, a stock sheet or a photo of the register for counting,
     a customer list for typing contacts. The team sets the step up from it, so the step counts
     as done and its gaps are not asked again; the export names the file instead. */
  const FILE_STEPS = ["items", "people", "stock"];
  function filesFor(s, step) {
    return (s.papers || []).filter(function (p) { return p.step === step && p.kind !== "voice"; });
  }
  function fromFile(s, step) { return FILE_STEPS.indexOf(step) >= 0 && filesFor(s, step).length > 0; }

  /* How far each step is. `done` drives the tick on the home screen; `n` is
     the one number its row shows. Continue is never blocked by any of this. */
  function progress(cat, s) {
    const items = Object.keys(s.items).length;
    const shops = peopleOf(s, "shop");
    const staff = peopleOf(s, "staff");
    const sups = peopleOf(s, "supplier");
    const counted = chosenItems(cat, s).filter(function (it) { return it.stockCases != null || it.stockLoose != null; }).length;
    const r = s.rules;
    const given = function (v) { return Array.isArray(v) ? v.length > 0 : v != null && v !== ""; };   // v6: returns, morning may be several
    const rulesAnswered = [r.payMethods.length > 0, r.routes != null, r.selfOrder != null, r.partPay != null, given(r.returns), given(r.morning)].filter(Boolean).length;
    const sorted = s.order.filter(function (id) { return s.people[id] && s.people[id].type; }).length;
    return {
      store:     { done: storeReady(s), n: null },
      items:     { done: items > 0 || fromFile(s, "items"), n: items, file: fromFile(s, "items") },
      people:    { done: sorted > 0 && unsorted(s).length === 0 && shops.length > 0 && shops.every(function (p) { return (p.days || []).length; }) &&
                   (staff.length > 0 && staff.every(function (p) { return p.role; }) || !!s.skipped.staff) && (sups.length > 0 || !!s.skipped.suppliers) ||
                   fromFile(s, "people") && unsorted(s).length === 0,   // a list on paper: done once what it brought in is sorted
                   n: sorted, shops: shops.length, staff: staff.length, suppliers: sups.length, left: unsorted(s).length, file: fromFile(s, "people") },
      stock:     { done: counted > 0 || !!s.skipped.stock || fromFile(s, "stock"), n: counted, file: fromFile(s, "stock") },
      rules:     { done: rulesAnswered === RULES_N, n: rulesAnswered },
      finish:    { done: false, n: null },
    };
  }

  /* What is still missing, for the week-one follow-up. Each gap names the
     step that fixes it. */
  function missing(cat, s, opts) {
    const gaps = [];
    const all = !!(opts && opts.all);   // all: the hidden steps' gaps too (the tests)
    /* A step set up from his file: what it would ask is in the file, and To follow up says so. */
    const ASKED_IN_FILE = { noItems: "items", noMrp: "items", noPrice: "items", noShops: "people", shopNoDay: "people", shopNoArea: "people", shopNoPay: "people",
      noDelivery: "people", noSuppliers: "people", notCounted: "stock" };
    function add(step, key, n) {
      if (!n) return;
      if (!all && !shown(step)) return;   // a hidden step is not asked (HIDDEN_STEPS)
      if (!all && ASK_OF[key] && !asked(ASK_OF[key])) return;   // nor a hidden question (HIDDEN_ASKS)
      if (ASKED_IN_FILE[key] && fromFile(s, ASKED_IN_FILE[key])) return;
      const tab = { shops: "shop", staff: "staff", suppliers: "supplier" }[step];
      gaps.push(tab ? { step: "people", tab: tab, key: key, n: n } : { step: step, key: key, n: n });
    }
    /* No shop name is asked any more; GST is optional, so only one that looks wrong is a gap. */
    add("store", "noMobile", storeReady(s) ? 0 : 1);
    add("store", "noGst", s.store.gst && !gstOk(s.store.gst) ? 1 : 0);
    add("items", "noItems", Object.keys(s.items).length ? 0 : 1);
    const its = chosenItems(cat, s);
    add("items", "noMrp", its.filter(function (it) { return !it.loose && !it.mrp; }).length);
    add("items", "noPrice", its.filter(function (it) { return it.loose && it.sell == null; }).length);
    add("people", "unsorted", unsorted(s).length);   // tab: to sort (the default)
    const shops = peopleOf(s, "shop");
    add("shops", "noShops", shops.length ? 0 : 1);
    add("shops", "shopNoDay", shops.filter(function (p) { return !(p.days || []).length; }).length);
    add("shops", "shopNoPhone", shops.filter(function (p) { return !phoneOk(p.phone); }).length);
    add("shops", "shopNoArea", shops.filter(function (p) { return !p.area; }).length);
    add("shops", "shopNoPay", shops.filter(function (p) { return p.pay == null; }).length);
    const staff = peopleOf(s, "staff");
    add("staff", "noDelivery", staff.some(function (p) { return p.role === "delivery"; }) ? 0 : 1);
    add("staff", "staffNoRole", staff.filter(function (p) { return !p.role; }).length);
    const sups = peopleOf(s, "supplier");
    add("suppliers", "noSuppliers", sups.length || s.skipped.suppliers ? 0 : 1);
    /* "Suppliers without company" went 1 Oct 2026 (owner): companies are not asked of a supplier any more. */
    add("stock", "notCounted", its.filter(function (it) { return it.stockCases == null && it.stockLoose == null; }).length);
    add("rules", "rulesOpen", RULES_N - progress(cat, s).rules.n);
    return gaps;
  }

  /* Old saves keep working: anything missing is filled from a blank state. */
  function migrate(s) {
    const b = blank();
    if (!s || typeof s !== "object") return b;
    const out = Object.assign(b, s);
    out.store = Object.assign(blank().store, s.store || {});
    if (out.lang !== "hi" && out.lang !== "en") out.lang = "en";
    /* One godown (same place as shop, or one other address) became many on 26 Sep 2026. */
    if ("godownSame" in out.store) {
      if (out.store.godownAtShop == null) out.store.godownAtShop = out.store.godownSame;
      if (out.store.godownSame === false && !out.store.godowns.length) out.store.godowns = [out.store.godownAddress || ""];
      delete out.store.godownSame;
      delete out.store.godownAddress;
    }
    if (!Array.isArray(out.store.godowns)) out.store.godowns = [];
    /* The godown list (the shop and each address) became a count of warehouses on 28 Sep 2026. */
    if (out.store.warehouses == null) {
      const n = (out.store.godownAtShop ? 1 : 0) + out.store.godowns.filter(function (g) { return String(g || "").trim(); }).length;
      if (n) out.store.warehouses = n;
    }
    /* C&F agent left the business types on 28 Sep 2026: an older save's becomes Other, typed. */
    if (out.store.type === "cnf") { out.store.type = "other"; out.store.typeOther = out.store.typeOther || "C&F agent"; }
    out.rules = Object.assign(blank().rules, s.rules || {});
    /* v6: a business may be several (types); the first stays in type, as before. Returns and mornings may be several. */
    if (!Array.isArray(out.store.types) || !out.store.types.length) out.store.types = out.store.type ? [out.store.type] : [];
    out.notes = Object.assign(blank().notes, s.notes && typeof s.notes === "object" ? s.notes : {});
    ["companies", "items", "customItems", "people", "usual", "skipped", "comments"].forEach(function (k) { if (!out[k] || typeof out[k] !== "object") out[k] = {}; });
    ["customCompanies", "order", "papers"].forEach(function (k) { if (!Array.isArray(out[k])) out[k] = []; });
    delete out.stockDraft;   // 26 Sep 2026: counts save as he taps; the unsaved draft of the first cut is dropped
    if (!Array.isArray(out.stockSel)) out.stockSel = null;
    out.order = out.order.filter(function (id) { return out.people[id]; });
    Object.keys(out.people).forEach(function (id) { if (out.order.indexOf(id) < 0) out.order.push(id); });
    out.v = VERSION;
    return out;
  }

  /* ── Godown stock: a stock audit of his own godown ──
     26 Sep 2026: one line per product, one number in one unit -- pieces or
     boxes for a pack, kg / dozen / … for loose goods. Blank is not counted;
     0 is "looked, none there". Like every other step it saves as he taps,
     into the stockCases (boxes) or stockLoose (pieces, kg…) the export reads.
     s.stockSel is the list he is counting, newest first. */
  function countUnits(it) {
    if (it.loose) return [{ k: it.per || "kg", per: 1 }];
    const u = [{ k: "piece", per: 1 }];
    if (it.caseQty > 1) u.push({ k: "case", per: it.caseQty });
    return u;
  }
  function countUnit(it) { return !it.loose && it.unit === "case" && it.caseQty > 1 ? "case" : countUnits(it)[0].k; }
  function unitPer(it, k) { const u = countUnits(it).find(function (x) { return x.k === k; }); return u ? u.per : 1; }

  /* What he counted, as one number in one unit; null when not counted. */
  function countOf(it) {
    if (it.stockCases == null && it.stockLoose == null) return null;
    if (it.loose) return { qty: it.stockLoose || 0, unit: countUnits(it)[0].k };
    if (it.stockLoose == null && it.caseQty > 1) return { qty: it.stockCases, unit: "case" };
    return { qty: (it.stockCases || 0) * it.caseQty + (it.stockLoose || 0), unit: "piece" };
  }
  /* The unit his count is in: the counted one, else the one he picked, else how he sells it. */
  function lineUnit(s, it) {
    const c = countOf(it);
    if (c) return c.unit;
    const k = (s.items[it.id] || {}).countUnit;
    return k && countUnits(it).some(function (u) { return u.k === k; }) ? k : countUnit(it);
  }
  function setCount(s, it, qty, unit) {
    const mine = s.items[it.id];
    if (!mine) return;
    delete mine.stockCases;
    delete mine.stockLoose;
    mine.countUnit = unit;
    if (qty == null) return;
    if (!it.loose && unit === "case") mine.stockCases = qty; else mine.stockLoose = qty;
  }
  /* The list being counted: from before 26 Sep, what was already counted. */
  function stockSel(cat, s) {
    if (!Array.isArray(s.stockSel)) s.stockSel = chosenItems(cat, s).filter(function (it) { return countOf(it); }).map(function (it) { return it.id; });
    const list = s.stockSel;   // cleaned in place: callers add to the array they were given
    for (let i = list.length - 1; i >= 0; i--) if (!s.items[list[i]] || list.indexOf(list[i]) !== i) list.splice(i, 1);
    return list;
  }

  /* ── Sample data, one step at a time (owner, 28 Sep 2026) ──
     A step's Sample button fills only what is still empty on that step: what he
     entered or picked stays as it is (owner: "additive, not replacing"). Warehouse
     stock counts the chosen products, so with none chosen it adds sample products
     first. Every name and number here is made up. */
  const SAMPLE_STEPS = ["store", "items", "people", "stock", "rules"].filter(shown);
  const SAMPLE_PACKS = ["par01", "par02", "par04", "bri01", "nes01", "nes04", "itc01", "itc04", "amu01", "amu05", "hul20", "hul24"];
  const SAMPLE_LOOSE = { veg01: 30, veg02: 40, veg03: 35 };   // ₹ a kg
  const SAMPLE_PEOPLE = [
    ["Sharma Kirana", "9820011001", { type: "shop", area: "Kurla", days: ["tue", "fri"], pay: 15, big: true }],
    ["Balaji Stores", "9820011002", { type: "shop", area: "Sion", days: ["mon", "thu"], pay: "cash" }],
    ["Om Sai Provision", "9820011003", { type: "shop", area: "Kurla", days: ["tue", "fri"], pay: 7 }],
    ["New Ganesh Mart", "9820011004", { type: "shop", area: "Chembur", days: ["wed", "sat"], pay: "cash" }],
    ["Patel General Store", "9820011005", { type: "shop", area: "Sion", days: ["mon", "thu"], pay: 15 }],
    ["Raju", "9820011006", { type: "staff", role: "delivery", days: ["mon", "tue", "wed", "thu", "fri", "sat"], cash: true }],
    ["Suresh", "9820011007", { type: "staff", role: "salesman", days: ["mon", "tue", "wed", "thu", "fri", "sat"] }],
    ["Parle Super Stockist", "9820011008", { type: "supplier", companies: ["parle"] }],
    ["Metro Agencies", "9820011009", { type: "supplier", companies: ["nestle", "hul"] }]];
  function blankish(v) { return v == null || v === "" || (Array.isArray(v) && !v.length); }
  function fillEmpty(obj, vals) { Object.keys(vals).forEach(function (k) { if (blankish(obj[k])) obj[k] = vals[k]; }); }
  function fillSample(cat, s, step) {
    const inCat = function (id) { return cat.items.some(function (x) { return x.id === id; }); };
    if (step === "store") {
      if (!phoneOk(s.store.mobile) && !String(s.store.mobile || "").trim()) s.store.mobile = "98200 11223";
      fillEmpty(s.store, { gst: "27AAPFG1234K1Z5", type: "distributor", warehouses: 2 });
    } else if (step === "items") {
      SAMPLE_PACKS.forEach(function (id) { if (inCat(id) && !s.items[id]) s.items[id] = { unit: "case" }; });
      Object.keys(SAMPLE_LOOSE).forEach(function (id) { if (inCat(id) && !s.items[id]) s.items[id] = { unit: "case", sell: SAMPLE_LOOSE[id] }; });
      syncCompanies(cat, s);
    } else if (step === "people") {
      SAMPLE_PEOPLE.forEach(function (x) {
        const r = addPerson(s, { name: x[0], phone: x[1], src: "typed" });
        if (!r.dup) Object.assign(s.people[r.id], x[2]);   // a number already on his list is left as he has it
      });
    } else if (step === "stock") {
      if (!Object.keys(s.items).length) fillSample(cat, s, "items");
      const sel = stockSel(cat, s);
      chosenItems(cat, s).forEach(function (it, i) {
        if (countOf(it)) return;   // what he counted stays
        setCount(s, it, it.loose ? 20 + (i % 4) * 10 : 3 + (i * 5) % 13, countUnit(it));
        if (sel.indexOf(it.id) < 0) sel.unshift(it.id);
      });
    } else if (step === "rules") {
      fillEmpty(s.rules, { payMethods: ["cash", "upi", "credit"], routes: true, selfOrder: false, partPay: true, returns: ["credit"], morning: ["money"] });
    }
    return s;
  }

  const api = {
    DAYS: DAYS, STEPS: STEPS, ALL_STEPS: ALL_STEPS, HIDDEN_STEPS: HIDDEN_STEPS, shown: shown, HIDDEN_ASKS: HIDDEN_ASKS, asked: asked, VERSION: VERSION, DEFAULT_RULE: DEFAULT_RULE,
    blank: blank, migrate: migrate, uid: uid, round2: round2,
    phone10: phone10, phoneOk: phoneOk, phoneShow: phoneShow, gstOk: gstOk, storeReady: storeReady,
    companyList: companyList, companyById: companyById, item: item, syncCompanies: syncCompanies, tidy: tidy, aisleOf: aisleOf, chosenItems: chosenItems, unitPrice: unitPrice,
    search: search, findBarcode: findBarcode,
    countUnits: countUnits, countUnit: countUnit, unitPer: unitPer, countOf: countOf, lineUnit: lineUnit, setCount: setCount, stockSel: stockSel,
    addPerson: addPerson, removePerson: removePerson, guessType: guessType, peopleOf: peopleOf, unsorted: unsorted,
    routes: routes, money: money,
    progress: progress, missing: missing, filesFor: filesFor, fromFile: fromFile, FILE_STEPS: FILE_STEPS, RULES_N: RULES_N, SAMPLE_STEPS: SAMPLE_STEPS, fillSample: fillSample,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FB_MODEL = api;
})(typeof window !== "undefined" ? window : globalThis);
