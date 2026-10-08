/* ==========================================================================
   CONTROL TOWER · ASSISTANT — what the chat says. (22 Sep 2026)

   Assistant discovery copy (5 Oct 2026): copied from foodbridge-mock-platform v7/assets/ct/chat.js
   @ 2a7ead3 and changed in three places only, each marked "assistant discovery":
     1. Production is a lever here too (the board has had it since 3 Oct 2026; the copy did not):
        LEVERS, MENU (8) and WORDS;
     2. rupees() is local -- this module does not load the tower's levers.js;
     3. reply() hands an intent it does not know back (null) instead of the menu, so the assistant
        page can offer its own options (Set up my store) next to the tower's;
     4. "…and N more" counts the tile, not the rows kept (the snapshot keeps six), and a tile whose
        label and word are the same says it once.

   The owner asked for a floating assistant over the tower, a chat that looks
   and works like a WhatsApp Business bot: reply buttons, a list menu, and
   "reply with a number". There is no model behind it and nothing leaves the
   page: it understands a message by its words (English and the Hinglish a
   distributor types: paisa, udhaar, maal, gaadi) and answers from the same
   lever model and Timeline the screen draws. Proven numbers only (D-015).
   It never changes anything: a button opens the lever, or the lever's own
   confirm sheet.

     understand(text)          → intent id, or null
     reply(input, ctx)         → [message]
       input  { text } | { intent }
       ctx    { model: CTLevers.build(…), timeline: CTTimeline.build(…) }
     welcome(ctx)              → the first messages of a conversation

   A message: { kind: "text" | "image" | "sticker", text?, image?,
                buttons?: [{ id, label }]   (reply buttons, at most 3)
                list?: { button, title, rows: [{ n, id, label, desc }] } }
   Button ids: "intent:<id>", "open:<lever>[:<tile>]", "act:<lever>",
   "open:timeline", "menu". Text may carry *bold*, as on WhatsApp.

   Pure: no DOM, no storage, no clock. Runs under node.
   ========================================================================== */

(function (root) {
  "use strict";

  const LEVERS = ["deliveries", "collections", "purchase", "inventory", "order", "production"];   // assistant discovery: + production
  const DOT = { ugly: "🔴", bad: "🟠", good: "🟢", preview: "⚪" };
  const WORD = { ugly: "Urgent", bad: "Needs work", good: "On track", preview: "Not connected" };
  const MASCOT = { hello: "hello.png", present: "present.png", shrug: "shrug.png", proud: "proud.png" };

  /* The menu: the owner's order, then the news. Numbers are the IVR. */
  const MENU = [
    { n: 1, id: "needs", label: "What needs me today", desc: "Where each part of the business stands" },
    { n: 2, id: "deliveries", label: "Deliveries", desc: "Trips, late and missed drops" },
    { n: 3, id: "collections", label: "Collections", desc: "Who owes you, and how much" },
    { n: 4, id: "purchase", label: "Purchase", desc: "What to buy this week" },
    { n: 5, id: "inventory", label: "Inventory", desc: "Out of stock and dead stock" },
    { n: 6, id: "order", label: "Orders", desc: "Customers late to reorder" },
    { n: 7, id: "production", label: "Production", desc: "What the plant must make, and what's short" },   // assistant discovery
    { n: 8, id: "news", label: "Today's news", desc: "The latest from your Business Timeline" },
  ];

  /* What a message means, by its words. Whole words or phrases; English and
     the Hinglish of the trade. Where two intents share a word the more
     specific phrase wins ("purchase order" is Purchase, "order" alone is
     Orders; "what happened today" is news, "today" alone is what needs you). */
  const WORDS = {
    thanks: ["thanks", "thank you", "thank", "thx", "dhanyavad", "dhanyawad", "shukriya", "great", "super"],
    greet: ["hi", "hello", "hey", "hii", "namaste", "namaskar", "good morning", "good evening", "good afternoon", "ram ram"],
    menu: ["menu", "help", "options", "madad", "start", "main menu", "back"],
    news: ["news", "timeline", "what happened", "kya hua", "updates", "update", "latest", "todays news", "business news", "khabar"],
    purchase: ["purchase", "purchase order", "buy", "supplier", "suppliers", "po", "kharid", "kharidna", "kharidi", "mangana", "mangwana", "procure"],
    collections: ["collect", "collection", "collections", "owe", "owes", "owed", "due", "overdue", "payment", "payments", "paisa", "paise",
      "udhaar", "udhar", "baaki", "baki", "bakaya", "outstanding", "credit", "reminder", "reminders", "vasooli", "wasooli", "money"],
    deliveries: ["deliver", "delivery", "deliveries", "trip", "trips", "van", "vans", "gaadi", "gadi", "truck", "route", "driver",
      "late", "missed", "drop", "drops", "dispatch"],
    inventory: ["stock", "inventory", "maal", "dead stock", "out of stock", "khatam", "godown", "warehouse", "expiry", "slow"],
    order: ["order", "orders", "reorder", "usual order", "usual orders", "late to reorder", "not ordered", "order nahi", "booking", "bookings"],
    production: ["production", "produce", "plant", "factory", "batch", "batches", "plan", "production plan", "make", "banana", "banao", "utpadan", "cartons not covered"],   // assistant discovery
    needs: ["what needs me", "needs me", "urgent", "today", "aaj", "priority", "problem", "problems", "kya karna", "status",
      "summary", "overview", "business", "kaisa", "sab", "everything", "all"],
  };
  const ORDER = ["thanks", "greet", "news", "production", "purchase", "collections", "deliveries", "inventory", "order", "needs", "menu"];

  function norm(s) { return " " + String(s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9₹\s]/g, " ").replace(/\s+/g, " ").trim() + " "; }
  function understand(text) {
    const t = norm(text);
    const n = t.trim();
    if (!n) return null;
    if (/^\d+$/.test(n)) { const m = MENU[Number(n) - 1]; return n === "0" ? "menu" : m ? m.id : null; }
    let best = null, score = 0;
    ORDER.forEach(function (id) {
      let s = 0;
      WORDS[id].forEach(function (w) { if (t.indexOf(" " + w + " ") !== -1) s += w.indexOf(" ") !== -1 ? 3 : 1; });   // a phrase counts more than a word
      if (s > score) { best = id; score = s; }
    });
    /* A greeting or thanks with a question in it is the question. */
    if ((best === "greet" || best === "thanks") && n.split(" ").length > 4) {
      const rest = ORDER.filter(function (id) { return id !== "greet" && id !== "thanks"; });
      let b2 = null, s2 = 0;
      rest.forEach(function (id) { let s = 0; WORDS[id].forEach(function (w) { if (t.indexOf(" " + w + " ") !== -1) s += 1; }); if (s > s2) { b2 = id; s2 = s; } });
      if (b2) best = b2;
    }
    return best;
  }

  /* ── answers ─────────────────────────────────────────────────────────── */
  /* assistant discovery: the tower's own rupees() (levers.js), local -- ₹ in lakh / crore. */
  function rupees(n) {
    const a = Math.abs(n), sign = n < 0 ? "-" : "";
    if (a >= 1e7) return sign + "₹" + (Math.round(a / 1e5) / 100).toString().replace(/\.?0+$/, "") + " Cr";
    if (a >= 1e5) return sign + "₹" + (Math.round(a / 1e3) / 100).toString().replace(/\.?0+$/, "") + " L";
    return sign + "₹" + Math.round(a).toLocaleString("en-IN");
  }
  function lever(ctx, id) { return ctx.model.levers.filter(function (x) { return x.id === id; })[0]; }
  /* The tile the lever opens on: the one its status promised, or the next
     one down that holds something — the screen's own rule. */
  function tileOf(lv) {
    const t = lv.tiles, land = { good: "good", bad: "bad", ugly: "ugly" }[lv.status];
    if (land && t[land].count) return land;
    return t.ugly.count ? "ugly" : t.bad.count ? "bad" : "good";
  }
  function figure(r) { return typeof r.value === "number" ? rupees(r.value) : null; }
  const menuButton = { button: "Menu", title: "How can I help?", rows: MENU };
  const btnMenu = { id: "menu", label: "Main menu" };

  function menuMessage(lead) {
    return { kind: "text", text: (lead ? lead + "\n\n" : "") + "What would you like to know? Tap *Menu*, or reply with a number:\n" +
      MENU.map(function (m) { return m.n + "  " + m.label; }).join("\n"), list: menuButton };
  }

  function leverAnswer(ctx, id) {
    const lv = lever(ctx, id);
    if (!lv) return [menuMessage("I couldn't find that.")];
    if (lv.status === "preview") {
      return [{ kind: "text", text: DOT.preview + " *" + lv.label + "* isn't connected yet.\n" + lv.preview.promise + ".",
        buttons: [{ id: "open:" + id, label: "Open " + lv.label }, btnMenu] }];
    }
    const k = tileOf(lv), tile = lv.tiles[k];
    const rows = tile.rows.slice(0, 3);
    const lines = [DOT[lv.status] + " *" + lv.label + " · " + WORD[lv.status] + "*",
      lv.headline.value + (lv.headline.context ? " · " + lv.headline.context : "")];
    if (rows.length) {
      lines.push("", "*" + tile.label + (tile.word !== tile.label ? " · " + tile.word : "") + "*");   // assistant discovery: Production's tiles say one word twice
      rows.forEach(function (r) {
        const f = figure(r);
        lines.push("• " + r.title + (f ? " — " + f : "") + (r.note ? " (" + r.note + ")" : ""));
      });
      const total = Math.max(tile.rows.length, tile.count || 0);   // assistant discovery: the snapshot keeps 6 rows a tile; count says how many
      if (total > rows.length) lines.push("…and " + (total - rows.length) + " more");
    }
    const buttons = [];
    if (lv.action && k !== "good") buttons.push({ id: "act:" + id, label: lv.action.label });
    buttons.push({ id: "open:" + id + ":" + k, label: "Open " + lv.label });
    buttons.push(btnMenu);
    const out = [{ kind: "text", text: lines.join("\n"), buttons: buttons.slice(0, 3) }];
    if (lv.status === "good") out.unshift({ kind: "sticker", image: MASCOT.proud, alt: "All good" });
    return out;
  }

  function needsAnswer(ctx) {
    const rank = { ugly: 0, bad: 1, good: 2, preview: 3 };
    const lvs = LEVERS.map(function (id) { return lever(ctx, id); }).filter(Boolean)
      .sort(function (a, b) { return rank[a.status] - rank[b.status] || LEVERS.indexOf(a.id) - LEVERS.indexOf(b.id); });
    const need = lvs.filter(function (x) { return x.status === "ugly" || x.status === "bad"; });
    const line = function (x) {
      if (x.status === "preview") return DOT.preview + " *" + x.label + "* — not connected";
      if (x.status === "good") return DOT.good + " *" + x.label + "* — on track";
      /* Deliveries' tiles count stops; its headline says what went wrong. */
      if (x.id === "deliveries") return DOT[x.status] + " *" + x.label + "* — " + x.headline.value + (x.headline.context ? " · " + x.headline.context : "");
      const t = x.tiles[tileOf(x)];
      return DOT[x.status] + " *" + x.label + "* — " + t.value + " " + t.word.toLowerCase();
    };
    if (!need.length) {
      return [{ kind: "sticker", image: MASCOT.proud, alt: "All good" },
        { kind: "text", text: "Everything is on track right now 🎉\n\n" + lvs.map(line).join("\n"),
          buttons: [{ id: "intent:news", label: "Today's news" }, btnMenu] }];
    }
    const first = need[0];
    return [{ kind: "text", text: "Here's your business right now:\n\n" + lvs.map(line).join("\n") + "\n\nStart with *" + first.label + "*.",
      buttons: [{ id: "intent:" + first.id, label: first.label + " in detail" }, { id: "open:" + first.id, label: "Open " + first.label }, btnMenu] }];
  }

  function newsAnswer(ctx) {
    const days = ctx.timeline ? ctx.timeline.days : [];
    const today = days[0] && days[0].label === "Today" ? days[0].items : [];
    if (!today.length) {
      return [{ kind: "text", text: "Nothing has happened in your business yet today.", buttons: [{ id: "open:timeline", label: "Open Timeline" }, btnMenu] }];
    }
    const top = today.slice(0, 5);
    const mark = { good: "🟢", bad: "🔴", info: "⚪" };
    return [{ kind: "text", text: "*Latest in your business*\n\n" + top.map(function (it) { return mark[it.tone] + " " + (it.time ? it.time + " — " : "") + it.text; }).join("\n") +
      (today.length > top.length ? "\n\n…and " + (today.length - top.length) + " more today" : ""),
      buttons: [{ id: "open:timeline", label: "Open Timeline" }, { id: "intent:needs", label: "What needs me today" }, btnMenu] }];
  }

  function reply(input, ctx) {
    const intent = input.intent || understand(input.text);
    if (!intent) {
      if (input.quiet) return null;   // assistant discovery: the page tries its own words first
      return [{ kind: "sticker", image: MASCOT.shrug, alt: "Not sure" },
        menuMessage("Sorry, I didn't get that. I can tell you about deliveries, collections, purchase, stock, orders, production and today's news.")];
    }
    if (intent === "menu") return [menuMessage()];
    if (intent === "greet") return [menuMessage("Namaste 🙏")];
    if (intent === "thanks") return [{ kind: "text", text: "Happy to help 🙂 Anything else?", buttons: [{ id: "intent:needs", label: "What needs me today" }, btnMenu] }];
    if (intent === "needs") return needsAnswer(ctx);
    if (intent === "news") return newsAnswer(ctx);
    if (LEVERS.indexOf(intent) !== -1) return leverAnswer(ctx, intent);
    return null;   // assistant discovery: not the tower's -- the page answers it
  }

  function welcome() {
    return [{ kind: "image", image: MASCOT.present, alt: "The FoodBridge Assistant",
              text: "Namaste 🙏 I'm your *FoodBridge Assistant*.\nI read your business records and tell you what needs you, in plain words." },
      Object.assign(menuMessage(), { buttons: [{ id: "intent:needs", label: "What needs me today" }, { id: "intent:news", label: "Today's news" }] })];
  }

  const API = { understand: understand, reply: reply, welcome: welcome, menuMessage: menuMessage, MENU: MENU, MASCOT: MASCOT, LEVERS: LEVERS, rupees: rupees };
  root.CTChat = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
