/* Assistant discovery · the question tree (5 Oct 2026; v8: a comment on every question, addendum-016; assistant-v6 the same day — addendum-013: mobile first, then the
   shop's name; many answers where they suit; "anything else?" after contacts, products and at the end; it stops at the
   store request; every word cut).

   The owner (voice note, 5 Oct 2026, discovery/instructions/inputs/2026-10-05-voice-note.md):
   "someone says hi, give an option of onboarding ... what is your name, phone number ... onboard your
   users: on the phone the address book, on desktop a QR code ... then all the static questions --
   wholesaler, distributor or manufacturer, how many warehouses -- make a question tree for it, throw a
   question one by one, a dropdown somewhere, a radio button somewhere ... products: whatever file,
   image, send that to Claude ... then let Claude define the whole situation of the store ... your store
   is created, what would you like to do next?" -- and first, "move the step-wise flow you built, whole,
   into the chat app".

   So the store's questions (Shop · Contacts · Who is who · Daily work · Files · Send) are asked one at a time, with
   the owner's additions: products read from any file and a store summary. v6: the mobile first, then the shop's
   name; it stops at the store request.

   Every answer is written into the store state (screens/store/model.js), so the Excel, setup.json and the build the
   FoodBridge team receives carry exactly what he said.

   Pure: no DOM, no fetch, no clock of its own (ctx.now). The page (app.js) draws what this returns and
   runs the hooks it names (a draft lookup, a build).

     ctx   { S: the store state, F: flow state, CAT, M (FB_MODEL), IMP (FB_IMPORT), now: ms }
     ask(ctx, id)        → [message]     asks node id (F.at = id)
     step(ctx, input)    → { msgs, hook? }   answers the node in F.at
     advance(ctx)        → [message]     the next node that applies
     input   { text } | { value } | { values } | { contacts, src } | { people } |
             { products } | { papers } | { pick }
     message { kind: "text"|"image"|"sticker"|"card", text?, buttons?, list?, widget?, compose? }
             buttons [{ id: "ans:<value>" | "next:<action>" | "intent:<id>" | "menu", label }] (≤ 3)
             widget  { type: "contacts"|"files"|"select"|"multi"|"products"|"summary"|"people"|"pick", … }
             compose { type: "text"|"tel"|"upper", hint }   what the message box asks for next */

(function (root) {
  "use strict";

  const NODE = typeof module !== "undefined" && module.exports;

  /* ── words ───────────────────────────────────────────────────────────── */
  const YES = /^(y|yes|yeah|yep|ya|haan?|ha+|han|ji|ji haan|hmm+|ok|okay|sure|right|correct|sahi|theek|thik)\b/i;
  const NO = /^(n|no|nope|nahi|nahin|na|nai|mat)\b/i;
  const SKIP = /\b(skip|later|baad|baad mein|not now|no gst|nothing( more)?|none|nahi hai|koi nahi|that'?s all|done|ho gaya|bas)\b/i;
  const BACK = /^(back|go back|undo|peeche|wapas|pichhe|previous)$/i;

  function txt(text, extra) { return Object.assign({ kind: "text", text: text }, extra || {}); }
  function btn(value, label) { return { id: "ans:" + value, label: label }; }
  function first(name) { return String(name || "").trim().split(/\s+/)[0] || ""; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many || one + "s"); }
  function titleCase(s) { return String(s || "").trim().replace(/\s+/g, " ").replace(/(^|\s)(\p{Ll})/gu, function (m, a, b) { return a + b.toUpperCase(); }); }
  function norm(s) { return String(s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9ऀ-ॿ\s]/g, " ").replace(/\s+/g, " ").trim(); }
  /* "3" picks the third row of a list; words pick a row whose label or keys hold them. */
  function pickRow(rows, text) {
    const t = norm(text);
    if (!t) return null;
    if (/^\d+$/.test(t)) return rows[Number(t) - 1] || null;
    return rows.find(function (r) { return (r.keys || []).concat([r.label]).some(function (k) { return t === norm(k) || (" " + t + " ").indexOf(" " + norm(k) + " ") >= 0; }); }) || null;
  }
  function yesNo(text) { const t = norm(text); return YES.test(t) ? true : NO.test(t) ? false : null; }

  /* ── what each list offers (Store Setup's own words, i18n.js en) ─────── */
  const TYPES = [
    { v: "distributor", label: "Distributor", keys: ["distributer", "distribution"] },
    { v: "supplier", label: "Supplier", keys: ["supply", "supplier"] },
    { v: "superstockist", label: "Super stockist", keys: ["super stockist", "superstockist", "ss"] },
    { v: "wholesaler", label: "Wholesaler", keys: ["wholesale", "holesaler", "wholeseller"] },
    { v: "retailer", label: "Retailer", keys: ["retail", "shop", "dukaan", "kirana"] },
    { v: "manufacturer", label: "Manufacturer", keys: ["manufacturing", "factory", "maker", "plant"] },
    { v: "other", label: "Kuch aur", keys: ["other", "something else", "kuch aur"] },
  ];
  const PAYS = [
    { v: "cash", label: "Cash", keys: ["nakad"] }, { v: "upi", label: "UPI", keys: ["gpay", "phonepe", "paytm", "online"] },
    { v: "cheque", label: "Cheque", keys: ["check"] }, { v: "credit", label: "Udhaar", keys: ["credit", "udhaar", "udhar"] },
    { v: "other", label: "Kuch aur", keys: ["other"] },
  ];
  const RETURNS = [
    { v: "credit", label: "Credit dete hain", keys: ["credit", "credit note"] }, { v: "replace", label: "Maal badal dete hain", keys: ["replace", "badal", "exchange"] },
    { v: "none", label: "Wapas nahi lete", keys: ["dont", "no", "nahi"] }, { v: "other", label: "Kuch aur", keys: ["other"] },
  ];
  const MORNING = [
    { v: "orders", label: "Orders", keys: ["order"] }, { v: "money", label: "Payment collection", keys: ["money", "payment", "collection", "paisa", "vasooli"] },
    { v: "stock", label: "Stock", keys: ["maal", "inventory"] }, { v: "trucks", label: "Gaadi / delivery", keys: ["truck", "gaadi", "van", "delivery"] },
    { v: "other", label: "Kuch aur", keys: ["other"] },
  ];
  const KIND = { shop: "Customer", supplier: "Supplier", staff: "Staff", none: "Remove" };

  function listMsg(text, title, rows, extra) {
    return txt(text, Object.assign({ list: { button: "Chuniye", title: title, rows: rows.map(function (r, i) { return { n: i + 1, id: "ans:" + r.v, label: r.label }; }) } }, extra || {}));
  }
  /* Many answers (v6, the owner: "multi-option"): ticks, or typed words like "cash, UPI". */
  function ticks(text, rows, picked) { return txt(text, { widget: { type: "multi", options: rows.map(function (r) { return { v: r.v, label: r.label, on: (picked || []).indexOf(r.v) >= 0 }; }) } }); }
  function manyOf(rows, i) {
    let vs = i.values;
    if (!vs && i.value) vs = [i.value];
    if (!vs && i.text) vs = norm(i.text).split(/[\s,]+|\band\b|\baur\b/).map(function (w) { const r = pickRow(rows, w); return r && r.v; }).filter(Boolean);
    return (vs || []).filter(function (v, k, a) { return a.indexOf(v) === k && rows.some(function (r) { return r.v === v; }); });
  }
  function many(v) { return Array.isArray(v) ? v : v == null || v === "" ? [] : [v]; }

  /* ── the sections, in the order they are asked ─────────────────────────── */
  const SECTIONS = [
    /* v10 (addendum-019): Change asks only the one thing he picks, then the summary again — Mobile and Shop name, and
       Business type, Warehouses and GST, are each their own; the rest stay as before. */
    { id: "mobile", label: "Mobile number", first: "mobile" },
    { id: "shop", label: "Dukaan ka naam", first: "shop" },
    { id: "type", label: "Business type", first: "type" },
    { id: "warehouses", label: "Godown", first: "warehouses" },
    { id: "gst", label: "GST", first: "gst" },
    { id: "day", label: "Roz ka kaam", first: "routes" },
    { id: "products", label: "Products", first: "products" },
    { id: "people", label: "Customers, suppliers, staff", first: "contacts" },
    { id: "sort", label: "Kaun customer, kaun supplier", first: "sort" },
  ];

  /* ── the nodes ────────────────────────────────────────────────────────── */
  const N = {};

  /* v6 (decision R5): no owner's name. The mobile first; a store already saved under it is confirmed by its name;
     otherwise the shop's name is asked — it is the shop's (store.name). */
  N.mobile = {
    section: "mobile",
    /* v11 (owner): what setting up takes is said once he has chosen it, not in the welcome; not again on a Change */
    ask: function (c) {
      return [txt((c && c.F.returnTo ? "" : "Chaliye, aapka store banate hain! 6 chhote steps, lagbhag 5 minute 😊\n\n") +
        "*1/6* · Aapka *mobile number*? 📱\nIsi number se aap store mein login karenge.", { compose: { type: "tel", hint: "98200 11223" } })];
    },
    now: function (c) { return c.S.store.mobile; },
    answered: function (c) { return c.M.storeReady(c.S); },
    accept: function (c, i) {
      const d = c.M.phone10(i.text);
      if (!c.M.phoneOk(i.text)) return { ok: false, msgs: [txt(phoneWhy(d), { compose: { type: "tel", hint: "98200 11223" } })] };
      c.S.store.mobile = c.M.phoneShow(d);
      return { ok: true, hook: "draftLookup" };   // is a store already saved under it? The page asks FoodBridge.
    },
  };

  /* v10 (addendum-019): what is wrong with a number, in his words — the rule is the platform's sign-in (7–10 digits). */
  function phoneWhy(d) {
    if (!d.length) return "Mobile number digits mein likhiye, jaise 98200 11223.";
    return "Isme " + plural(d.length, "digit") + " hain, yeh number poora nahi lag raha. 10 digit ka mobile number daaliye.";
  }

  /* A store saved under this mobile: by its name when it has one ("Sharma Agencies — is this you?"). v7 (addendum-014 D-1):
     with nothing saved, an existing FoodBridge account the Digital Assistant finds by the mobile is confirmed the same
     way — its business name, never read from the host's database by the chat. */
  function found(c) { return c.F.draft ? { name: c.F.draft.name, saved: true } : c.F.account && c.F.account.found ? { name: c.F.account.name } : null; }
  N.sync = {
    section: "mobile",
    onComment: function (c) { c.F.draft = null; c.F.account = null; },   // a comment is not a yes: nothing of his is filled
    skip: function (c) { return !found(c); },
    ask: function (c) {
      const n = found(c).name;
      return [txt(n ? "*" + n + "* — yeh aapka business hai?" : "Is number se aapka store aadha bana hua hai. Wahin se continue karein?", { buttons: n ? [btn("sync", "Haan"), btn("fresh", "Nahi")] : [btn("sync", "Continue"), btn("fresh", "Naye se shuru")] })];
    },
    accept: function (c, i) {
      const t = i.value || (yesNo(i.text) === true ? "sync" : yesNo(i.text) === false ? "fresh" : null);
      if (!t) return { ok: false, msgs: N.sync.ask(c) };
      const saved = !!c.F.draft;
      if (t === "sync" && saved) {
        const keep = { mobile: c.S.store.mobile };
        const s = c.M.migrate(JSON.parse(JSON.stringify(c.F.draft.state)));
        Object.keys(c.S).forEach(function (k) { delete c.S[k]; });
        Object.assign(c.S, s);
        c.S.store.mobile = keep.mobile;
        c.F.resume = true;   // from here, what the saved store already answers is not asked again
        c.F.synced = true;
      }
      if (t === "sync" && !saved) c.S.store.name = String(c.F.account.name || "").slice(0, 80);   // his account's name: the shop is not asked
      c.F.draft = null; c.F.account = null;
      if (t === "sync" && !saved) return { ok: true, goto: "type" };   // v11: the question after the shop's name
      return { ok: true, msgs: t === "sync" && saved ? [txt("Welcome back! Bas jo baaki hai wahi poochhunga.")] : [] };
    },
  };

  N.shop = {
    section: "shop",
    answered: function (c) { return !!String(c.S.store.name || "").trim(); },
    now: function (c) { return c.S.store.name; },
    ask: function () { return [txt("*2/6* · Aapki *dukaan / business ka naam*?\nYahi naam aapke customers ko dikhega.", { compose: { type: "text", hint: "Sharma Agencies" } })]; },
    accept: function (c, i) {
      const v = String(i.text || "").trim().replace(/\s+/g, " ");
      if (v.replace(/[^\p{L}]/gu, "").length < 2) return { ok: false, msgs: [txt("Dukaan ka poora naam likhiye.", { compose: { type: "text", hint: "Sharma Agencies" } })] };
      c.S.store.name = v.slice(0, 80);
      return { ok: true };
    },
  };

  /* Contacts (v11, team review R2): a list file only — Excel, CSV, Tally/Busy export, a contacts .vcf — or names and
     numbers typed in. No phone address book, no QR code: both needed phone settings users could not find. A sample
     Excel (Name · Mobile · Type) shows the shape; its Type column marks each person, so "who is who" asks nothing. */
  const NO_PHOTO = "📷 Abhi photo nahi le sakte — sirf Excel, PDF ya CSV file.";
  const PEOPLE_FILE = { type: "files", purpose: "people", sample: true };
  const LATER = btn("skip", "Baad mein");
  N.contacts = {
    section: "people",
    ask: function () {
      return [txt("*6/6* · Last step! Apne *customers, suppliers aur staff* ki list bhejiye 👥\nExcel mein naam aur mobile number. Phir unke order aur payment seedha store se.\n\n" + NO_PHOTO,
        { widget: PEOPLE_FILE, buttons: [LATER], compose: { type: "text", hint: "Ya type kariye: Ramesh 9820011223" } })];
    },
    answered: function (c) { return c.S.order.length > 0; },
    accept: function (c, i) {
      let list = i.contacts;
      if (!list && i.text) {
        if (SKIP.test(i.text) || yesNo(i.text) === false) return { ok: true };   // v8: "no" is Skip
        list = c.IMP.fromText(i.text);
        /* v11: a line with a number in it was meant as a contact — say how to type it, never keep it as a comment */
        if (!list.length) return { ok: false, retry: /\d{3}/.test(i.text), msgs: [txt("Isme naam aur mobile number nahi mile 😕 Aise likhiye: Ramesh 9820011223 — ya sample Excel jaisi file bhejiye.", { widget: PEOPLE_FILE, buttons: [LATER] })] };
      }
      if (i.value === "skip" || i.value === "done") return { ok: true };
      if (i.value === "more") return { ok: true, stay: true, msgs: [txt("Agli file bhejiye 📎", { widget: PEOPLE_FILE, buttons: [LATER] })] };
      if (!list) return { ok: false, msgs: [] };
      let added = 0, dup = 0;
      list.forEach(function (p) {
        if (!p.name && !p.phone) return;
        const r = c.M.addPerson(c.S, { name: p.name || p.phone, phone: c.M.phone10(p.phone) || p.phone || "", src: i.src || "contact", type: p.type || null });
        if (r.dup) dup++; else added++;
      });
      return { ok: true, stay: true, msgs: [txt("✅ " + (added === 1 ? "1 contact mila" : added ? added + " contacts mil gaye" : "Koi naya contact nahi") + (dup ? " (" + dup + " pehle se the)" : "") + ". Total *" + c.S.order.length + "*.",
        { buttons: [btn("done", "Ho gaya"), btn("more", "Aur file bhejiye")] })] };
    },
  };

  /* Who is who: a first guess from each name ("… Kirana" a customer, "… Agency" a supplier, "… Driver" staff),
     confirmed in one tap, and a list with a radio per person to fix any. */
  function guessCounts(c) {
    const g = { shop: 0, supplier: 0, staff: 0, unsure: 0 };
    /* v11: everyone — those already marked (a typed file, the sheet) and the rest by their name's guess */
    c.S.order.forEach(function (id) { const p = c.S.people[id]; const k = p && (p.type || c.M.guessType(p.name)); if (k && g[k] != null) g[k]++; else if (p) g.unsure++; });
    return g;
  }
  function peopleWidget(c) {
    return { type: "people", rows: c.S.order.map(function (id) { const p = c.S.people[id]; return { id: id, name: p.name, phone: p.phone, type: p.type || c.M.guessType(p.name) || "" }; }) };
  }
  const SORT_BTNS = [btn("ok", "Sahi hai"), btn("check", "Change karein")];
  N.sort = {
    section: "people",   // contacts and marking them go together: changing one asks both
    /* v11 (owner): asked whenever there are contacts — a file that marked everyone (the sample Excel) still gets a quick check */
    skip: function (c) { return !c.S.order.length; },
    answered: function (c) { return c.S.order.length > 0 && c.M.unsorted(c.S).length === 0; },
    ask: function (c) {
      const g = guessCounts(c), left = c.M.unsorted(c.S).length;
      if (!left) return [txt("Ek baar check kar lijiye — kaun customer, kaun supplier:\n" + sortedLine(c), { widget: peopleWidget(c), buttons: SORT_BTNS })];
      return [txt("Ek baar check kar lijiye — kaun customer, kaun supplier:\n🏪 Customers: " + g.shop + "\n🚚 Suppliers: " + g.supplier + "\n👤 Staff: " + g.staff + (g.unsure ? "\n❔ Pata nahi: " + g.unsure : ""),
        { widget: peopleWidget(c), buttons: SORT_BTNS })];
    },
    accept: function (c, i) {
      const v = i.value || (yesNo(i.text) === true ? "ok" : /check|list|dekh|change/i.test(i.text || "") ? "check" : /customer|grahak/i.test(i.text || "") ? "rest" : null);
      if (i.people) {
        Object.keys(i.people).forEach(function (id) {
          const t = i.people[id];
          if (!c.S.people[id]) return;
          if (t === "none") c.M.removePerson(c.S, id); else if (t) c.S.people[id].type = t;
        });
        const left = c.M.unsorted(c.S).length;
        if (left) return { ok: true, stay: true, msgs: [txt(plural(left, "contact") + " ka pata nahi chala. Yeh customers hain?", { widget: peopleWidget(c), buttons: [btn("rest", "Haan, customers"), btn("check", "Change karein")] })] };
        return { ok: true, msgs: [txt(sortedLine(c))] };
      }
      if (v === "check") return { ok: true, stay: true, open: "people", msgs: [] };
      if (v === "ok") {
        c.M.unsorted(c.S).forEach(function (p) { const k = c.M.guessType(p.name); if (k) p.type = k; });
        const left = c.M.unsorted(c.S).length;
        const names = c.M.unsorted(c.S).slice(0, 3).map(function (p) { return p.name; }).join(", ") + (left > 3 ? "…" : "");
        if (left) return { ok: true, stay: true, msgs: [txt("❔ " + names + " — yeh customers hain?", { widget: peopleWidget(c), buttons: [btn("rest", "Haan, customers"), btn("check", "Change karein")] })] };
        return { ok: true, msgs: [txt(sortedLine(c))] };
      }
      if (v === "rest") {
        c.M.unsorted(c.S).forEach(function (p) { p.type = "shop"; });
        return { ok: true, msgs: [txt(sortedLine(c))] };
      }
      return { ok: false, msgs: [txt("*Sahi hai* ya *Change karein* dabaiye.", { buttons: SORT_BTNS })] };
    },
  };
  function sortedLine(c) {
    const n = function (t) { return c.M.peopleOf(c.S, t).length; };
    return [n("shop") ? "🏪 " + plural(n("shop"), "customer") : "", n("supplier") ? "🚚 " + plural(n("supplier"), "supplier") : "", n("staff") ? "👤 " + n("staff") + " staff" : ""].filter(Boolean).join(" · ") || "Abhi koi nahi";
  }

  /* v11 (team review R3, R5): the four "Anything else?" questions are gone — users could not tell what they asked.
     Whatever he types at any question is still kept for the team (comment(), "📝 Note kar liya"). */

  /* Your business: as many as apply (v6, the owner: "distributor, also supplier, also super stockist"). */
  N.type = {
    section: "type",
    answered: function (c) { return many(c.S.store.types).length > 0 || !!c.S.store.type; },
    ask: function (c) { return [ticks("*3/6* · Aapka *business* kya hai? Jo jo laagu ho, sab chuniye.", TYPES, many(c.S.store.types))]; },
    accept: function (c, i) {
      const vs = manyOf(TYPES, i);
      if (!vs.length) return { ok: false, msgs: [ticks("Kam se kam ek chuniye.", TYPES)] };
      c.S.store.types = vs;
      c.S.store.type = vs[0];
      if (vs.indexOf("other") < 0) c.S.store.typeOther = "";
      return { ok: true };
    },
  };
  N.typeOther = {
    section: "type",
    skip: function (c) { return many(c.S.store.types).indexOf("other") < 0 && c.S.store.type !== "other"; },
    answered: function (c) { return !!c.S.store.typeOther; },
    ask: function () { return [txt("Kaunsa business? Likhiye.", { compose: { type: "text", hint: "Jaise C&F agent" } })]; },
    accept: function (c, i) {
      if (!String(i.text || "").trim()) return { ok: false, msgs: N.typeOther.ask() };
      c.S.store.typeOther = String(i.text).trim().slice(0, 60);
      return { ok: true };
    },
  };

  /* A dropdown here (owner: "a dropdown somewhere, a radio button somewhere"). */
  const WH = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20];
  N.warehouses = {
    section: "warehouses",
    answered: function (c) { return c.S.store.warehouses != null; },
    ask: function () { return [txt("Aapke kitne *godown* hain?", { widget: { type: "select", label: "Godown", options: WH.map(function (n) { return { v: String(n), label: n === 0 ? "Koi nahi" : String(n) }; }), ph: "Chuniye" } })]; },
    accept: function (c, i) {
      const raw = i.value != null ? i.value : i.text;
      const t = norm(raw);
      const n = /^(none|no|nahi|zero|koi nahi)$/.test(t) ? 0 : /^(one|ek)$/.test(t) ? 1 : /^(two|do)$/.test(t) ? 2 : /^(three|teen)$/.test(t) ? 3 : parseInt(t, 10);
      if (!(n >= 0 && n <= 999)) return { ok: false, msgs: [txt("Sirf number chuniye ya likhiye.", { widget: N.warehouses.ask()[0].widget })] };
      c.S.store.warehouses = n;
      return { ok: true };
    },
  };

  const GST_ASK = { compose: { type: "upper", hint: "27ABCDE1234F1Z5" }, buttons: [btn("later", "Baad mein")] };
  N.gst = {
    section: "gst",
    answered: function (c) { return !!c.S.store.gst; },
    ask: function () { return [txt("*GST number* hai? Nahi hai to baad mein bhi de sakte hain.", GST_ASK)]; },
    accept: function (c, i) {
      if (i.value === "later" || SKIP.test(i.text || "") || yesNo(i.text) === false) return { ok: true };
      const g = String(i.text || "").toUpperCase().replace(/\s+/g, "");
      if (!c.M.gstOk(g)) return { ok: false, msgs: [txt("Yeh GST number sahi nahi lag raha, ek baar check kar lijiye.", GST_ASK)] };
      c.S.store.gst = g;
      return { ok: true };
    },
  };

  /* Your day: six questions (rules.*) and a note. */
  function yn(id, path, question) {
    N[id] = {
      section: "day",
      answered: function (c) { return c.S.rules[path] != null; },
      ask: function () { return [txt(question, { buttons: [btn("yes", "Haan"), btn("no", "Nahi")] })]; },
      accept: function (c, i) {
        const v = i.value ? i.value === "yes" : yesNo(i.text);
        if (v == null) return { ok: false, msgs: [txt("*Haan* ya *Nahi* dabaiye.", { buttons: [btn("yes", "Haan"), btn("no", "Nahi")] })] };
        c.S.rules[path] = v;
        return { ok: true };
      },
    };
  }
  /* v11: the day's questions stay (owner, 8 Oct 2026: they help the team talk to him); the first one says why they are asked. */
  yn("routes", "routes", "*4/6* · Ab aapke roz ke kaam ke baare mein 6 chhote sawaal — isse hamari team aapka store aapke tareeke se set karegi.\n\nKya aap *fix din* par alag-alag area mein maal bhejte hain? (jaise Monday ko A area, Tuesday ko B)");
  yn("selfOrder", "selfOrder", "Kya customers *khud order* bhejte hain? (phone ya WhatsApp par)");
  yn("partPay", "partPay", "Kya customers *thoda-thoda karke* payment karte hain?");

  /* Many answers on the day: how they pay (as before), what he does with damaged goods, what he checks each morning. */
  function multiRule(id, path, question, rows) {
    N[id] = {
      section: "day",
      answered: function (c) { return many(c.S.rules[path]).length > 0; },
      ask: function (c) { return [ticks(question, rows, many(c.S.rules[path]))]; },
      accept: function (c, i) {
        const vs = manyOf(rows, i);
        if (!vs.length) return { ok: false, msgs: [ticks("Kam se kam ek chuniye.", rows)] };
        c.S.rules[path] = vs;
        if (vs.indexOf("other") < 0) c.S.rules[path + "Other"] = "";
        return { ok: true };
      },
    };
  }
  function otherText(id, path, check, q) {
    N[id] = {
      section: "day",
      skip: function (c) { return !check(c); },
      answered: function (c) { return !!c.S.rules[path]; },
      ask: function () { return [txt(q, { compose: { type: "text", hint: "Yahan likhiye" } })]; },
      accept: function (c, i) {
        if (!String(i.text || "").trim()) return { ok: false, msgs: N[id].ask() };
        c.S.rules[path] = String(i.text).trim().slice(0, 120);
        return { ok: true };
      },
    };
  }
  multiRule("payMethods", "payMethods", "Customers payment *kaise* karte hain? Sab chuniye.", PAYS);
  otherText("payOther", "payMethodsOther", function (c) { return many(c.S.rules.payMethods).indexOf("other") >= 0; }, "Aur kaise? Likhiye.");
  multiRule("returns", "returns", "*Kharab ya toota maal* wapas aaye to aap kya karte hain?", RETURNS);
  otherText("returnsOther", "returnsOther", function (c) { return many(c.S.rules.returns).indexOf("other") >= 0; }, "Aur kya karte hain? Likhiye.");
  multiRule("morning", "morning", "Subah sabse pehle kya *check* karte hain?", MORNING);
  otherText("morningOther", "morningOther", function (c) { return many(c.S.rules.morning).indexOf("other") >= 0; }, "Aur kya? Likhiye.");

  /* Products: his file is kept as it came and uploaded; the Digital Assistant reads it when it sets up his store (chat-app:
     no reading in the browser). v11 (team review R4): no photos for now — said before he picks a file, and a photo sent
     anyway is turned away (app.js); "Baad mein" is on every message of this step, so he is never stuck. */
  const PROD_ASK = [btn("later", "Baad mein")];
  N.products = {
    section: "products",
    answered: function (c) { return Object.keys(c.S.items).length > 0 || c.F.productsSeen; },
    ask: function () { return [txt("*5/6* · Apne *products ki list* bhejiye 📦\nExcel, PDF ya CSV — naam, pack aur rate ho to aur achha. Saare products hum store mein daal denge.\n\n" + NO_PHOTO, { widget: { type: "files", purpose: "products" }, buttons: PROD_ASK })]; },
    accept: function (c, i) {
      c.F.productsSeen = true;
      if (i.papers) return { ok: true, stay: true, msgs: [txt("✅ File mil gayi! Store banate time saare products daal denge.", { buttons: [btn("done", "Ho gaya"), btn("another", "Aur file")] })] };
      const v = i.value || (SKIP.test(i.text || "") ? "done" : yesNo(i.text) === false ? "done" : null);   // v8: "no" here is Later, not a comment
      if (v === "another" || v === "more") return { ok: true, stay: true, msgs: [txt("Agli file bhejiye 📎", { widget: { type: "files", purpose: "products" }, buttons: PROD_ASK })] };
      if (v === "done" || v === "later") return { ok: true };
      return { ok: false, msgs: [txt("📎 se file bhejiye, ya *Baad mein* dabaiye.", { buttons: PROD_ASK })] };
    },
  };
  /* Rows (Claude's shape) → items. A match is the catalogue item with his MRP and rate; a row with no match is his
     own new item. Both are marked as his (export: "Owner"). */
  function applyProducts(c, rows) {
    let n = 0;
    (rows || []).forEach(function (p) {
      if (!p || p.keep === false || !String(p.name || "").trim()) return;
      const touched = {};
      let id;
      if (p.match && p.match.id && c.CAT.items.some(function (x) { return x.id === p.match.id; })) {
        id = p.match.id;
        const base = c.CAT.items.find(function (x) { return x.id === id; });
        const mine = c.S.items[id] || { unit: "case" };
        if (p.mrp != null && p.mrp !== base.mrp) { mine.mrp = p.mrp; touched.mrp = true; }
        if (p.caseQty != null && p.caseQty !== base.caseQty) mine.caseQty = p.caseQty;
        if (p.barcode && !base.barcode) mine.barcode = p.barcode;
        if (p.sell != null) { mine.sell = p.sell; touched.sell = true; }
        if (p.buy != null) { mine.buy = p.buy; touched.buy = true; }
        mine.touched = Object.assign(mine.touched || {}, touched);
        c.S.items[id] = mine;
      } else {
        id = c.M.uid("ci");
        c.S.customItems[id] = { name: String(p.name).trim().slice(0, 120), brand: p.brand || "", company: "", pack: p.pack || "", mrp: p.mrp != null ? p.mrp : null,
          caseQty: p.caseQty || 1, cat: "other", photo: null, barcode: p.barcode || "" };
        c.S.items[id] = { unit: "case", sell: p.sell != null ? p.sell : undefined, buy: p.buy != null ? p.buy : undefined, touched: { mrp: true, sell: p.sell != null, buy: p.buy != null } };
        if (p.gst != null) c.S.items[id].gst = p.gst;
      }
      n++;
    });
    c.M.syncCompanies(c.CAT, c.S);
    return n;
  }
  /* v11: no Papers step (khata, bills, route chart): nothing in the store is built from them, and it leaned on the photo
     upload and the QR code that are gone. */

  /* The store, summed up. The facts are the model's own counts and gaps — proven numbers only. In production Claude
     words them (TD-1, claude/store-summary.md); here the template below does. */
  const SUM_BTNS = [btn("create", "Store banayein ✅"), btn("change", "Change karein")];
  N.summary = {
    section: null,
    ask: function (c) {
      const f = facts(c);
      return [txt("Sab check kar lijiye 👇", { widget: { type: "summary", facts: f } }), txt(summaryText(f), { buttons: SUM_BTNS })];
    },
    accept: function (c, i) {
      const v = i.value || (/create|build|bana|yes|ok|haan|done/i.test(i.text || "") ? "create" : /change|edit|badal/i.test(i.text || "") ? "change" : null);
      if (v === "create") return { ok: true, hook: "build", stay: true };
      if (v === "change") return { ok: true, stay: true, msgs: [listMsg("Kya change karna hai?", "Change", SECTIONS.map(function (s) { return { v: "edit:" + s.id, label: s.label }; }))] };
      if (v && v.indexOf("edit:") === 0) {
        const s = SECTIONS.find(function (x) { return x.id === v.slice(5); });
        if (s) { c.F.returnTo = "summary"; c.F.resume = false; return { ok: true, goto: s.first }; }
      }
      return { ok: false, msgs: [txt("Sab sahi hai to *Store banayein* dabaiye.", { buttons: SUM_BTNS })] };
    },
  };

  /* After the request (v6, decision R3): it stops here. What he does next — an order, a collection, a campaign — is
     the assistant inside his store, once the team has set it up; he reaches it from a login link. */
  N.done = {
    section: null,
    ask: function (c) { return created(c); },
    accept: function () { return { ok: false, msgs: [txt("Aapka store ban raha hai 🙏 Ready hote hi yahin bataunga.")] }; },
  };

  /* v11: the quick typed answers first, the two files last (products, then his people), each section numbered 1/6 … 6/6. */
  const ORDER = ["mobile", "sync", "shop", "type", "typeOther", "warehouses", "gst",
    "routes", "selfOrder", "partPay", "payMethods", "payOther", "returns", "returnsOther", "morning", "morningOther",
    "products", "contacts", "sort", "summary"];

  /* ── the engine ───────────────────────────────────────────────────────── */
  function ask(c, id) {
    c.F.at = id;
    const out = N[id].ask(c);
    /* v10 (addendum-019): changing one thing from the summary — he can keep what he had and go straight back. */
    if (c.F.returnTo && out.length) {
      const last = out[out.length - 1], now = N[id].now ? String(N[id].now(c) || "").trim() : "";
      last.buttons = (last.buttons || []).concat([btn("keep", now ? "Jaisa hai: " + now : "Koi change nahi")]);
    }
    return out;
  }
  function applies(c, id) {
    const n = N[id];
    if (n.skip && n.skip(c)) return false;
    if (c.F.resume && n.answered && n.answered(c)) return false;
    if (c.F.resume && c.S.comments && c.S.comments[id]) return false;   // v8: a comment answered it
    return true;
  }
  function advance(c) {
    const at = c.F.at, i = ORDER.indexOf(at);
    if (i < 0) return [];
    for (let k = i + 1; k < ORDER.length; k++) {
      const id = ORDER[k];
      if (!applies(c, id)) continue;
      /* Changing one thing from the summary: when that section is done, back to the summary. */
      if (c.F.returnTo && N[id].section !== N[at].section) { const r = c.F.returnTo; c.F.returnTo = null; return ask(c, r); }
      return ask(c, id);
    }
    return ask(c, "summary");
  }
  /* One answer → what the page says next. A hook is run by the page, which then calls resume(). */
  function step(c, input) {
    const at = c.F.at;
    if (!at || !N[at]) return { msgs: [] };
    if (input.text != null && BACK.test(norm(input.text))) return { msgs: back(c) };
    if (input.value === "keep" && c.F.returnTo) { const r = c.F.returnTo; c.F.returnTo = null; return { msgs: ask(c, r) }; }
    const r = N[at].accept(c, input) || { ok: false, msgs: [] };
    if (!r.ok && !r.retry && canComment(at, input)) return { msgs: [comment(c, at, input.text)].concat(advance(c)) };
    if (!r.ok) return { msgs: r.msgs || [] };
    if (r.hook) return { msgs: r.msgs || [], hook: r.hook, after: r };
    if (r.open) return { msgs: r.msgs || [], open: r.open };
    return { msgs: (r.msgs || []).concat(r.goto ? ask(c, r.goto) : r.stay ? [] : advance(c)) };
  }
  /* v8 (addendum-016): never a forced selection. What he types or says that a question cannot take as its answer is that
     question's comment, kept with the question for the team, and the chat moves on. Not the mobile (it is who he is),
     not the summary (create or change) and not the end. */
  const NO_COMMENT = ["mobile", "summary", "done"];
  function canComment(at, input) { return NO_COMMENT.indexOf(at) < 0 && typeof input.text === "string" && !!input.text.trim(); }
  function comment(c, at, text) {
    const q = String(((N[at].ask(c) || [])[0] || {}).text || at).replace(/[*_]/g, "").replace(/\s+/g, " ").trim();
    if (N[at].onComment) N[at].onComment(c);
    if (!c.S.comments || typeof c.S.comments !== "object") c.S.comments = {};
    const was = c.S.comments[at];
    c.S.comments[at] = { q: q, text: (was ? was.text + "\n" : "") + String(text).trim().slice(0, 1000), at: c.now };
    return txt("📝 Note kar liya.");
  }

  /* A voice note the page kept for the team (no speech to text here): that question's comment, never its answer. */
  function commentOn(c, text) {
    const at = c.F.at;
    if (!canComment(at, { text: text })) return null;
    return [comment(c, at, text)].concat(advance(c));
  }

  /* After the page ran a hook (draftLookup, build). */
  function resume(c, hook, result) {
    if (hook === "draftLookup") return (c.F.assistant === "off" && !found(c) ? [OFF] : []).concat(advance(c));
    if (hook === "build") { c.F.built = result; c.F.at = "done"; c.F.returnTo = null; return created(c); }
    return [];
  }
  function back(c) {
    const i = ORDER.indexOf(c.F.at);
    for (let k = i - 1; k >= 0; k--) { const id = ORDER[k]; if (id !== "sync" && !(N[id].skip && N[id].skip(c))) return ask(c, id); }
    return ask(c, c.F.at);
  }

  /* ── the store, summed up ──────────────────────────────────────────────── */
  const GAP_WORDS = { noMobile: "mobile", noGst: "GST number", unsorted: "contacts to mark", noShops: "customers",
    shopNoPhone: "customers' mobiles", noSuppliers: "suppliers", rulesOpen: "daily-work answers" };
  function typeLabels(st) {
    return many(st.types && st.types.length ? st.types : st.type).map(function (v) { return v === "other" ? st.typeOther || "Other" : (TYPES.find(function (t) { return t.v === v; }) || {}).label || v; });
  }
  function facts(c) {
    const S = c.S, M = c.M, its = M.chosenItems(c.CAT, S);
    const P = M.progress(c.CAT, S);
    const gaps = M.missing(c.CAT, S).map(function (g) { return { key: g.key, n: g.n, label: GAP_WORDS[g.key] || g.key }; });
    const noPrice = its.filter(function (it) { return S.items[it.id] && S.items[it.id].sell == null && !(S.items[it.id].touched || {}).sell; }).length;
    return {
      name: S.store.name || "", mobile: S.store.mobile || "", type: typeLabels(S.store).join(", "), warehouses: S.store.warehouses, gst: S.store.gst || "",
      products: its.length, fromCatalogue: its.filter(function (it) { return !it.custom; }).length, newProducts: its.filter(function (it) { return it.custom; }).length,
      companies: Object.keys(S.companies).length, noPrice: noPrice,
      customers: M.peopleOf(S, "shop").length, suppliers: M.peopleOf(S, "supplier").length, staff: M.peopleOf(S, "staff").length, unsorted: M.unsorted(S).length,
      answered: P.rules.n, of: M.RULES_N, files: S.papers.length, gaps: gaps,
      notes: ["people", "products", "end"].filter(function (k) { return S.notes && S.notes[k]; }).length + (S.rules.note ? 1 : 0) +
        Object.keys(S.comments || {}).length,
      /* product files sent at Products: the Digital Assistant reads them when it sets up the store (gaps A1+A2) */
      productFiles: S.papers.filter(function (p) { return p.step === "items"; }).length,
      /* v10 (addendum-019): a customer, supplier or staff with no valid phone is not added to his store — said before Create */
      notAdded: ["shop", "supplier", "staff"].reduce(function (out, t) {
        return out.concat(M.peopleOf(S, t).filter(function (p) { return !M.phoneOk(p.phone); }).map(function (p) { return { name: p.name, type: t, phone: String(p.phone || "") }; }));
      }, []),
    };
  }
  /* v11: one line each for what he gave; who won't be added. No files/notes lines and no "we'll follow up" list. */
  function summaryText(f) {
    const lines = [];
    lines.push("🏷️ " + [f.type || "Business nahi bataya", f.warehouses != null ? (f.warehouses === 0 ? "godown nahi" : f.warehouses + " godown") : "", f.gst ? "GST ✓" : "GST baad mein"].filter(Boolean).join(" · "));
    const prod = [f.products ? plural(f.products, "product") : "", f.productFiles ? plural(f.productFiles, "product file") : ""].filter(Boolean).join(" · ");
    lines.push("📦 " + (prod || "Products baad mein"));
    lines.push("👥 " + (f.customers + f.suppliers + f.staff ? [plural(f.customers, "customer"), plural(f.suppliers, "supplier"), f.staff + " staff"].join(" · ") : "Customers baad mein"));
    lines.push("🗓️ Roz ka kaam: " + f.answered + "/" + f.of);
    if (f.notAdded.length) {
      lines.push("", "⚠️ In ka mobile number sahi nahi hai, inhe abhi add nahi karenge: " + f.notAdded.map(function (p) {
        return p.name + (p.phone ? " (" + p.phone + ")" : "");
      }).join(", ") + ". Theek karne ke liye *Change karein* dabaiye.");
    }
    return lines.join("\n");
  }
  function created(c) {
    return [{ kind: "sticker", image: "proud.png", alt: "Done" },
      txt(c.F.built && c.F.built.sent === false ? "✅ Save ho gaya. Internet aate hi FoodBridge ko chala jayega." : "✅ Ho gaya! Aapka store ban raha hai 👇")];
  }

  /* ── v10 (addendum-019): the build, step by step ──────────────────────────
     What the assistant reports (chat-app SSOT-7: the build's progress on the login-link answer):
       { state: "running" | "waiting" | "team" | "done", link?, steps: [{ id, state: "running" | "done" | "none", count?, notAdded?: [{ name, why }] }] }
     One card shows them all, ticked in place. Nothing is shown done before the assistant wrote it. */
  const BUILD_STEPS = [
    { id: "store", icon: "🛠️", label: "Store" },
    { id: "products", icon: "📦", label: "Products", one: "product", many: "products" },
    { id: "customers", icon: "👥", label: "Customers", one: "customer", many: "customers" },
    { id: "suppliers", icon: "🚚", label: "Suppliers", one: "supplier", many: "suppliers" },
    { id: "staff", icon: "🧑‍🍳", label: "Staff", one: "staff", many: "staff" },
  ];
  const STORE_READY = function (name) { return "✅ *" + (name || "Aapka store") + "* ready hai! Login karke dekhiye — products, customers aur staff hum add kar rahe hain."; };
  /* the hand-over to the team, said once under the card */
  const BUILD_TEAM = "Sorry, hamari taraf se kuch problem aa gayi 🙏 FoodBridge team baaki kaam karke aapko call karegi.";
  /* one card (owner, 8 Oct 2026: "go with b"): every step's row, ticked in place */
  function progressCard(p, name) {
    const steps = (p && p.steps) || [];
    return { type: "progress", name: name || "", state: (p && p.state) || "running", link: (p && p.link) || "", ready: STORE_READY(name),
      rows: BUILD_STEPS.map(function (d) {
        let st = steps.find(function (x) { return x.id === d.id; }) || { state: "todo" };
        /* v10.1 (owner O15): the team took over — a step that was still running stops: what was written, no spinner */
        if (p && p.state === "team" && st.state === "running") st = { state: "stopped", count: st.count };
        const sub = st.state === "stopped" ? (st.count ? "Abhi tak " + plural(st.count, d.one, d.many) + " add hue" : "Hamari team poora karegi")
          : st.state === "running" ? (d.id === "store" ? "Ban raha hai…" : "Add ho rahe hain…")
          : st.state === "none" ? "Kuch add karne ko nahi tha"
          : st.state === "done" ? (d.id === "store" ? "Ready — login karke dekhiye" : plural(st.count || 0, d.one, d.many) + " add ho gaye") : "";
        return { id: d.id, icon: d.icon, label: d.label, state: st.state, sub: sub, notAdded: st.notAdded || [] };
      }) };
  }

  /* ── v7 (addendum-014): his store, once the team marks it Ready to use ───────────────
     Each option asks the FoodBridge Digital Assistant for a login link that lands him on that screen (cafex's smart
     link, the event named). Not connected yet: it says so and shows a sample, labelled as one (D-2, D-4). */
  const OFF = { kind: "note", text: "🔌 FoodBridge Digital Assistant se connect nahi hai" };
  const STORE_ACTIONS = [
    /* v11: "Order for tomorrow" (the same event as a new order) and "Send a campaign" (only opened the store) are gone. */
    { id: "store:open", label: "Store kholiye", event: "AUTO_LOGIN" },
    { id: "store:order", label: "Naya order", event: "CREATE_PROXY_ORDER" },
    { id: "store:collect", label: "Payment link bhejiye", event: "PAYMENT_LINK" },
    { id: "store:customers", label: "Customer add kariye", event: "ADD_CUSTOMER" },
    { id: "store:products", label: "Product add kariye", event: "ADD_PRODUCT" },
    { id: "store:staff", label: "Staff add kariye", event: "ADD_STAFF" },
  ];
  const SAMPLE = "foodbridge.io/platform/smart-link?code=xYz12A";
  function storeMenu(lead) {
    const rows = STORE_ACTIONS.map(function (a, i) { return { n: i + 1, id: a.id, label: a.label }; });
    return txt((lead ? lead + "\n" : "") + rows.map(function (r) { return r.n + "  " + r.label; }).join("\n"), {
      list: { button: "Chuniye", title: "Aapka store", rows: rows }, numbered: rows.map(function (r) { return { id: r.id, label: r.label }; }),
      buttons: [{ id: "store:open", label: "Store kholiye" }, { id: "store:order", label: "Naya order" }] });
  }
  function ready(c) { return [txt("🟢 *" + (c.S.store.name || "Aapka store") + "* ready hai! Ab kya karna hai?"), storeMenu()]; }
  function linkFor(id, res) {
    const a = STORE_ACTIONS.find(function (x) { return x.id === id; });
    if (!a) return [];
    if (res && res.url) return [txt(a.label + ": " + res.url + "\nIs link se seedha login ho jayega.")];
    return [OFF, txt("Sample link:\n" + SAMPLE)];
  }

  /* Whose store this conversation is (5 Oct 2026, owner: the team's inbox "only appears if found a store already"):
     nobody until the mobile is a valid 10 digits; then that mobile. Builds belong to the mobile they were made under,
     and show only to it. */
  function ownerOf(S, M) { return M.storeReady(S) ? M.phone10(S.store.mobile) : ""; }
  function owned(list, mobile, M, key) {
    if (!mobile) return [];
    return (list || []).filter(function (x) { const v = key(x); return v && M.phone10(v) === mobile; });
  }

  const API = { ownerOf: ownerOf, owned: owned, N: N, ORDER: ORDER, SECTIONS: SECTIONS, TYPES: TYPES, PAYS: PAYS, RETURNS: RETURNS, MORNING: MORNING, KIND: KIND,
    progressCard: progressCard, BUILD_TEAM: BUILD_TEAM,
    ask: ask, step: step, advance: advance, resume: resume, back: back, applies: applies,
    STORE_ACTIONS: STORE_ACTIONS, storeMenu: storeMenu, ready: ready, linkFor: linkFor, OFF: OFF, found: found,
    facts: facts, summaryText: summaryText, typeLabels: typeLabels, many: many, created: created, applyProducts: applyProducts,
    canComment: canComment, commentOn: commentOn, NO_COMMENT: NO_COMMENT,
    yesNo: yesNo, pickRow: pickRow, guessCounts: guessCounts, txt: txt };
  if (NODE) module.exports = API;
  else root.ASSIST_FLOW = API;
})(typeof window !== "undefined" ? window : globalThis);
