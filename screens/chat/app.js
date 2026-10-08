/* Assistant discovery · the chat page (5 Oct 2026).

   One assistant, two places (decision 2, 5 Oct 2026):
     - its own page (chat.html), which opens on "hi": onboarding comes before there is a business to show;
     - the Control Tower (tower.html), the same chat in a panel, where it also answers about the business.
   It looks and works like WhatsApp -- the tower assistant's look (shell.css), reply buttons, a list
   menu, "reply with a number" -- and adds what onboarding needs inside a bubble: a dropdown, ticks, the
   contacts card (address book on a phone, QR on a computer), files (📎), products read back, the store.

   What it asks is onboard.js (pure, tested); what the tower says is tower-brain.js (pure, tested).
   This file only draws, listens, and runs the hooks the tree names:
     draftLookup    GET  /api/draft      (his saved store, under his mobile)
                    GET  /api/assistant/account   (v7: an existing FoodBridge account, from the Digital Assistant)
     build          POST /api/stores     (the build: Excel + setup.json + files, to the team)
   and the files: each one goes to S3 (outbox.js), shown in the chat with its upload state; the Digital Assistant reads them.
   v7 (addendum-014): his requests' ticket step rides on /api/mystores (`status`); "ready" switches on his store's options,
   each asking POST /api/assistant/link for a login link (the Digital Assistant; not connected yet → a sample).
   In discovery every /api call is answered by the service worker (../discovery-bridge.js). */

(function () {
  "use strict";

  const CAT = window.FB_CATALOGUE, M = window.FB_MODEL, X = window.FB_EXPORT, IMP = window.FB_IMPORT, OB = window.FB_OUTBOX;
  const FLOW = window.ASSIST_FLOW, BRAIN = window.CTChat;
  const MODE = document.documentElement.dataset.mode === "tower" ? "tower" : "page";
  const KEY = "fb.assistant.v1", CAP = 300;
  const MASCOT = "chat/mascot/";
  /* Decision 1 (5 Oct 2026): his store goes to the team; the next actions open over the Vasu Foods demo
     -- foodbridge-mock-platform v7, as published. ?vasu= points at another copy (a local :8007). */
  const VASU = (new URLSearchParams(location.search).get("vasu") || "https://nishant-devekar.github.io/foodbridge-mock-platform/v7/").replace(/\/?$/, "/");
  const VASU_ORDER = "modules/foodbridge-sales-orders-mockup/screens/orders/screen-12-create-sales-orders.html";
  const VASU_TOWER = "screens/control-tower.html";
  const FLOW_NODES = FLOW.ORDER;

  const esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  const md = function (s) { return esc(s).replace(/\*([^*\n]+)\*/g, "<b>$1</b>").replace(/(^|\s)_([^_\n]+)_/g, "$1<i>$2</i>").replace(/\n/g, "<br>"); };
  const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  const $ = function (s, r) { return (r || document).querySelector(s); };
  function clock(t) { const d = new Date(t), h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + ":" + String(m).padStart(2, "0") + " " + (h < 12 ? "am" : "pm"); }
  function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round((n || 0) / 1024)) + " KB"; }
  function b64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }

  const I = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l1.4 1.4L7.8 11H20v2H7.8l5.6 5.6L12 20l-8-8z" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z" fill="currentColor"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 20.9 12 3.4 3.6 3.4 10.1 15.9 12 3.4 13.9z" fill="currentColor"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h2v2H4zm4 0h12v2H8zM4 11h2v2H4zm4 0h12v2H8zm-4 5h2v2H4zm4 0h12v2H8z" fill="currentColor"/></svg>',
    reply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" fill="currentColor"/></svg>',
    ticks: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M17.4 4.3 16.7 3.8a.4.4 0 0 0-.5.1L9.5 12.3 7.9 10.8l-.7.8 2 2a.4.4 0 0 0 .6 0l7.6-8.7a.4.4 0 0 0 0-.6zM12.6 4.3 12 3.8a.4.4 0 0 0-.5.1L4.8 12.3 1.9 9.6a.4.4 0 0 0-.5 0l-.6.6a.4.4 0 0 0 0 .5l3.7 3.5a.4.4 0 0 0 .6 0l7.6-9.3a.4.4 0 0 0-.1-.6z" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4z" fill="currentColor"/></svg>',
    clip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6z" fill="currentColor"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" fill="currentColor"/></svg>',
    contacts: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 0H4v2h16zM4 24h16v-2H4zM20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 2.8a2.3 2.3 0 1 1 0 4.5 2.3 2.3 0 0 1 0-4.5zM17 17H7v-1.5c0-1.7 3.3-2.5 5-2.5s5 .8 5 2.5z" fill="currentColor"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 7V3.5L18.5 9z" fill="currentColor"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
    chats: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.6 21l4.3-1.1A9.5 9.5 0 1 0 12 2.5zm0 17.2a7.7 7.7 0 0 1-4-1.1l-.3-.2-2.5.7.7-2.4-.2-.3A7.7 7.7 0 1 1 12 19.7z" fill="currentColor"/></svg>',
    store: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16l1 5a3 3 0 0 1-2 2.8V20H5v-8.2A3 3 0 0 1 3 9zm2 8v6h4v-4h4v4h4v-6a3 3 0 0 1-2-1 3 3 0 0 1-4 0 3 3 0 0 1-4 0 3 3 0 0 1-2 1zm-.4-6-.6 3a1 1 0 0 0 2 0V6zm3.4 0v3a1 1 0 0 0 2 0V6zm4 0v3a1 1 0 0 0 2 0V6zm4 0v3a1 1 0 0 0 2 0l-.6-3z" fill="currentColor"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7z" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z" fill="currentColor"/></svg>',
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1a7 7 0 0 0 6-6.9z" fill="currentColor"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5zm7-16-6 6h4v6h4v-6h4z" fill="currentColor"/></svg>',
  };

  /* ── state: the store's answers (S), where the conversation is (F), what was said (msgs) ── */
  let S, F, msgs;
  function blankF() { return { at: null, device: device(), code: code(), code2: code(), built: null, draft: null, returnTo: null, resume: false, prod: null }; }
  function load() {
    let v = null;
    try { v = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { /* a new conversation */ }
    S = M.migrate(v && v.S);
    F = Object.assign(blankF(), v && v.F, { device: device() });
    msgs = v && Array.isArray(v.msgs) ? v.msgs : [];
    M.tidy(CAT, S);
  }
  function save() {
    S.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, S: S, F: F, msgs: msgs.slice(-CAP) })); } catch (e) { /* this tab only */ }
    saveDraft();
    if (owner() !== shownFor) loadBuilds();   // a mobile typed, changed, or cleared: his chats, or none
  }
  function ctx() { return { S: S, F: F, CAT: CAT, M: M, IMP: IMP, now: Date.now() }; }
  function code() { const a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a, function (b) { return "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]; }).join(""); }
  /* Phone or computer (the owner: "if the user is on the phone, it's easy to figure out"). ?device= pins it. */
  function device() {
    const pin = new URLSearchParams(location.search).get("device");
    if (pin === "phone" || pin === "desktop") return pin;
    const ua = navigator.userAgent || "";
    return /Android|iPhone|iPad|iPod|Mobile/.test(ua) || (window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 900) ? "phone" : "desktop";
  }
  /* An iPad says "MacIntel" with touch points; an Android (or a computer previewing one) never is an iPhone. */

  /* ── the bridge (in discovery: the service worker) ── */
  function api(path, opts) { return fetch(OB.bridge() + path, opts); }
  let draftTimer = null;
  /* Every answer is also saved under his mobile, a moment after he stops. */
  /* Never under a number before FoodBridge was asked what it already holds, nor while he hasn't chosen
     between it and starting fresh (5 Oct 2026: an empty store overwrote a saved one in that gap). */
  function canSaveDraft() { return M.storeReady(S) && !F.draft && F.lookedUp === owner(); }
  function saveDraft() {
    if (!canSaveDraft()) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      if (!canSaveDraft()) return;   // the number changed, or a saved store turned up, while waiting
      api("/api/draft", { method: "PUT", headers: { "Content-Type": "application/json", "x-owner-mobile": M.phone10(S.store.mobile) },
        body: JSON.stringify({ v: 1, at: Date.now(), state: S, papers: S.papers.length }) }).catch(function () { /* next answer tries again */ });
    }, 800);
  }

  /* ── the DOM ───────────────────────────────────────────────────────── */
  let root, body, input, status, sendBtn, fileIn, open = false, talking = Promise.resolve();
  function build() {
    root = document.createElement("section");
    root.className = "cb-chat";
    root.hidden = MODE === "tower";
    root.setAttribute("role", MODE === "tower" ? "dialog" : "main");
    root.setAttribute("aria-label", "FoodBridge Assistant");
    root.innerHTML =
      '<header class="cb-head">' +
        '<button type="button" class="cb-hbtn cb-back" data-close aria-label="Close chat">' + I.back + "</button>" +
        '<span class="cb-ava" style="background-image:url(' + MASCOT + 'hello-128.png)" aria-hidden="true"></span>' +
        '<span class="cb-who"><b>FoodBridge Assistant</b><small class="cb-status"></small></span>' +
        '<button type="button" class="cb-hbtn cb-info" data-info aria-label="Aapka store setup" title="Aapka store setup">' + I.info + "</button>" +
        '<button type="button" class="cb-hbtn cb-more" data-menu aria-label="More">' + I.more + "</button>" +
        (MODE === "tower" ? '<button type="button" class="cb-hbtn cb-x" data-close aria-label="Close chat">' + I.close + "</button>" : "") +
      "</header>" +
      '<div class="cb-body" role="log" aria-live="polite" aria-label="Conversation"></div>' +
      '<div class="cb-hi" hidden></div>' +
      '<form class="cb-bar" autocomplete="off">' +
        '<button type="button" class="cb-clip" data-clip aria-label="File bhejiye">' + I.clip + "</button>" +
        '<textarea class="cb-input" rows="1" enterkeyhint="send" placeholder="Message likhiye" aria-label="Message the assistant" maxlength="2000"></textarea>' +
        '<button type="button" class="cb-mic" data-mic aria-label="Speak">' + I.mic + "</button>" +
        '<button type="submit" class="cb-send" aria-label="Send" disabled>' + I.send + "</button>" +
      "</form>" +
      '<div class="wa-ro" role="note"></div>' +
      '<input type="file" class="cb-file" multiple hidden>' +
      '<div class="cb-dropzone">Drop files to send</div>' +
      '<div class="cb-sheetwrap" hidden></div>';
    if (MODE === "page") buildDesk(); else document.body.appendChild(root);
    body = $(".cb-body", root); input = $(".cb-input", root); status = $(".cb-status", root); sendBtn = $(".cb-send", root); fileIn = $(".cb-file", root);

    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    input.addEventListener("input", function () { barState(); grow(); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
    $(".cb-bar", root).addEventListener("submit", function (e) { e.preventDefault(); submit(); });
    fileIn.addEventListener("change", function () { const fs = Array.from(fileIn.files || []); fileIn.value = ""; if (fs.length) sendFiles(fs); });
    /* Files dropped on the chat, or pasted into it, are sent as if with 📎. */
    let depth = 0;
    root.addEventListener("dragenter", function (e) { if (hasFiles(e)) { depth++; root.classList.add("is-dragging"); } });
    root.addEventListener("dragleave", function () { if (--depth <= 0) { depth = 0; root.classList.remove("is-dragging"); } });
    root.addEventListener("dragover", function (e) { if (hasFiles(e)) e.preventDefault(); });
    root.addEventListener("drop", function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; root.classList.remove("is-dragging"); sendFiles(Array.from(e.dataTransfer.files)); });
    input.addEventListener("paste", function (e) { const fs = Array.from((e.clipboardData && e.clipboardData.files) || []); if (fs.length) { e.preventDefault(); sendFiles(fs); } });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !open) return;
      const w = $(".cb-sheetwrap", root);
      if (!w.hidden) { e.preventDefault(); closeSheet(); } else if (MODE === "tower") { e.preventDefault(); closeChat(); }
    }, true);
  }
  function hasFiles(e) { return e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf("Files") >= 0; }
  function grow() { input.style.height = "46px"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; }

  function openChat() {
    if (open) return;
    open = true;
    root.hidden = false;
    document.documentElement.classList.add("cb-open");
    render();
    if (window.matchMedia("(min-width: 768px)").matches) input.focus({ preventScroll: true });
    if (MODE === "tower" && !msgs.length) say(towerWelcome());
    else if (!msgs.length) say(welcome());   // v11: the assistant speaks first — no "Hi" to tap
  }
  function closeChat() {
    if (MODE !== "tower" || !open) return;
    open = false; closeSheet(); root.hidden = true;
    document.documentElement.classList.remove("cb-open");
    const b = document.getElementById("as-open"); if (b) b.focus({ preventScroll: true });
  }

  /* ── talking ───────────────────────────────────────────────────────── */
  function mine(m) { if (!m) return; msgs.push(Object.assign({ from: "me", at: Date.now(), read: false }, typeof m === "string" ? { kind: "text", text: m } : m)); save(); render(); }
  function say(list) {
    list = (list || []).filter(Boolean);
    talking = talking.then(async function () {
      msgs.forEach(function (m) { if (m.from === "me") m.read = true; });
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (m.kind === "text" && !m.text && !m.list && !m.widget) continue;
        typing(true);
        await sleep(i ? 300 : 420 + Math.min(450, (m.text || "").length * 2));
        typing(false);
        msgs.push(Object.assign({ from: "bot", at: Date.now() }, m));
        save(); render();
      }
      composeFor();
    });
    return talking;
  }
  function typing(on) {
    isTyping = on;
    if (VIEW === "assistant") status.textContent = on ? "likh raha hai…" : "";
    renderSide();
    const t = $(".cb-typing", body);
    if (on && !t) { body.insertAdjacentHTML("beforeend", '<div class="cb-row in"><div class="cb-bub cb-typing" aria-label="typing"><i></i><i></i><i></i></div></div>'); stick(); }
    if (!on && t) t.parentNode.remove();
  }
  /* The message box asks for what the question wants: a name, a mobile, a GST number. */
  function composeFor() {
    const last = msgs.slice().reverse().find(function (m) { return m.from === "bot" && m.compose; });
    const lastBot = msgs.slice().reverse().find(function (m) { return m.from === "bot"; });
    const c = last && last === lastBot ? last.compose : null;
    /* v8: on a question with choices, he may type or say anything instead (addendum-016) */
    input.placeholder = c ? c.hint : inFlow() && FLOW.NO_COMMENT.indexOf(F.at) < 0 ? "Ya type kariye / 🎤 boliye" : "Message likhiye";
    input.setAttribute("inputmode", c && c.type === "tel" ? "tel" : "text");
    input.setAttribute("autocapitalize", c && c.type === "upper" ? "characters" : "sentences");
  }
  /* v8 (addendum-016): 🎤 where the box is empty, send where it has words — as WhatsApp. */
  function barState() { const has = !!input.value.trim(); sendBtn.disabled = !has; $(".cb-bar", root).classList.toggle("has-text", has); }
  /* Speech to text where the browser has it: his words land in the box, to check and send. Where it has none (or it is
     refused), the recording is kept for the team as a voice note — that question's comment. The browser's recogniser sends
     his audio to its maker's service: discovery only; in production the Digital Assistant transcribes. */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, rcd = null;
  function micUi(on) { const b = $(".cb-mic", root); if (b) b.classList.toggle("is-on", on); if (on) input.placeholder = "Sun raha hoon… rokne ke liye 🎤 dabaiye"; else composeFor(); }
  function mic() {
    if (rec) { rec.stop(); return; }
    if (rcd) { rcd.stop(); return; }
    if (!SR) return recordNote();
    rec = new SR();
    rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = false;
    const base = input.value.trim() ? input.value.trim() + " " : "";
    let heard = false;
    rec.onresult = function (e) { heard = true; input.value = base + Array.from(e.results).map(function (r) { return r[0].transcript; }).join(""); barState(); grow(); };
    rec.onerror = function (e) { if (!heard && /not-allowed|service-not-allowed|network|audio-capture/.test(e.error)) { rec = null; micUi(false); recordNote(); } };
    rec.onend = function () { rec = null; micUi(false); input.focus(); };
    try { rec.start(); micUi(true); } catch (e) { rec = null; recordNote(); }
  }
  async function recordNote() {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder)) return say([FLOW.txt("🎤 Not on this browser. Type instead.")]);
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return say([FLOW.txt("🎤 No microphone. Type instead.")]); }
    const chunks = [];
    rcd = new MediaRecorder(stream);
    rcd.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rcd.onstop = function () {
      stream.getTracks().forEach(function (t) { t.stop(); });
      const type = (rcd && rcd.mimeType) || "audio/webm";
      rcd = null; micUi(false);
      keepVoice(new Blob(chunks, { type: type }));
    };
    rcd.start(); micUi(true);
  }
  async function keepVoice(blob) {
    if (!blob || blob.size < 800) return;
    const type = blob.type || "audio/webm", ext = /ogg/.test(type) ? "ogg" : /mp4|aac/.test(type) ? "m4a" : "webm";
    const at = F.at || "chat";
    const f = new File([blob], "voice-" + at + "-" + Date.now().toString(36) + "." + ext, { type: type });
    mine({ kind: "file", name: "🎤 Voice note", size: f.size });
    const p = await OB.take(X, M, null, S, f, at);
    save();
    if (!p || p.error) return say([FLOW.txt("⚠️ Bahut lamba hai. Thoda chhota bhejiye.")]);
    const out = inFlow() ? FLOW.commentOn(ctx(), "🎤 Voice note: " + p.file) : null;
    if (out) { save(); await say(out); return; }
    say([FLOW.txt("🎤 Voice note saved.")]);
  }
  window.ASSIST_VOICE = { keep: keepVoice };   // discovery: lets a test hand in a recording where there is no microphone

  /* ── what he types ─────────────────────────────────────────────────── */
  function submit() {
    const t = input.value.trim();
    if (!t) return;
    input.value = ""; barState(); grow();
    mine(t);
    route({ text: t });
  }
  const W_SETUP = /\b(set ?up|setup|onboard|onboarding|start|shuru|register|new store|create (my )?store|store banao|dukaan|dukan)\b/i;
  const W_HELP = /\b(how|help|madad|kaise|what can you do)\b/i;
  const W_MENU = /^(menu|main menu|0|options)$/i;
  const W_HI = /^(hi+|hello|hey|hii+|namaste|namaskar|ram ram|good (morning|evening|afternoon)|sat sri akal)\b/i;

  function inFlow() { return F.at && F.at !== "done" && FLOW_NODES.indexOf(F.at) >= 0; }
  function routeText(input) {
    const t = input.text != null ? String(input.text).trim() : null;
    if (t != null && W_MENU.test(t)) return say([mainMenu()]);
    if (inFlow()) {
      /* "hi" in the middle of setting up: where we were. */
      if (t != null && W_HI.test(t) && t.split(/\s+/).length <= 2) return say(FLOW.ask(ctx(), F.at));
      return answer(input);
    }
    if (t == null) return;
    if (W_SETUP.test(t)) return startSetup();
    if (MODE === "tower") { const r = BRAIN.reply({ text: t, quiet: true }, towerCtx()); if (r) return say(r); }
    if (W_HI.test(t)) return say(welcome());
    if (W_HELP.test(t)) return say(help());
    say([{ kind: "sticker", image: "shrug.png", alt: "Not sure" }, Object.assign(mainMenu(), { text: "Sorry, samajh nahi aaya 🙏\n" + mainMenu().text })]);
  }

  /* One answer to the question in hand → the tree → what it says, and any hook it names. */
  async function answer(inp) {
    const c = ctx();
    const r = FLOW.step(c, inp);
    save();
    if (r.open) { await say(r.msgs); return openSheetFor(r.open); }
    if (r.hook) {
      await say(r.msgs);
      try { await HOOKS[r.hook](); }
      catch (e) { console.warn(r.hook, e); say([FLOW.txt("⚠️ Yeh nahi hua. Phir se try kariye.")]); }
      return;
    }
    await say(r.msgs);
  }

  const HOOKS = {
    draftLookup: async function () {
      typing(true);
      let d = null, known = false;
      try {
        const res = await api("/api/draft", { headers: { "x-owner-mobile": M.phone10(S.store.mobile) } });
        known = res.ok || res.status === 404;   // 404: nothing saved under it — also an answer
        if (res.ok) {
          const j = await res.json(), st = j && j.state && M.migrate(j.state);
          const answers = st ? M.progress(CAT, st).rules.n : 0;
          if (st && (st.store.name || st.order.length || Object.keys(st.items).length || answers || st.store.type)) d = { state: j.state, name: st.store.name || "", people: st.order.length, products: Object.keys(st.items).length, answers: answers };
        }
      } catch (e) { /* FoodBridge not reached: start fresh */ }
      F.draft = d; F.account = null; F.assistant = null;
      /* v7 (D-1): nothing saved here → an existing FoodBridge account, from the Digital Assistant (never the host's DB) */
      if (!d) {
        try {
          const res = await api("/api/assistant/account", { headers: { "x-owner-mobile": M.phone10(S.store.mobile) } });
          const j = await res.json().catch(function () { return {}; });
          if (res.ok) F.account = { found: !!j.found, name: String(j.name || "") };
          else if (j.error === "ASSISTANT_NOT_CONNECTED") F.assistant = "off";
        } catch (e) { F.assistant = "off"; }
      }
      typing(false);
      /* asked and answered: saving may follow once he has chosen (the sync question clears F.draft). Unreachable:
         we don't know what is saved under it, so nothing is saved under it until it can be asked again. */
      F.lookedUp = known ? owner() : null;
      const out = FLOW.resume(ctx(), "draftLookup");
      save();
      await say(out);
    },
    build: async function () {
      /* Every file he added is in S3 before the store is built (audio keeps the byte fallback). Not yet: say which, build later. */
      const missing = OB.retry ? S.papers.filter(function (p) { return !/^audio\//.test(p.mime || "") && !p.fileId && p.up !== "unsupported"; }) : [];
      if (missing.length) {
        return say([FLOW.txt(missing.length + " file(s) aren't uploaded yet: " + missing.map(function (p) { return p.name; }).join(", "), { buttons: [{ id: "retry:files", label: "Retry" }] })]);
      }
      typing(true);
      const b = await OB.make(CAT, X, S);
      S.lastBuild = { id: b.id, at: b.at };
      let sent = false;
      try { sent = await OB.deliver(X, b); } catch (e) { sent = false; }
      typing(false);
      const out = FLOW.resume(ctx(), "build", { id: b.id, at: b.at, sent: sent });
      if (sent) F.watch = { id: b.id, plan: planOf(), said: [], over: false };
      loadBuilds();
      save();
      await say(out);
      if (sent) watchBuild();
    },
  };
  function owner() { return S ? FLOW.ownerOf(S, M) : ""; }

  /* ── v10 (addendum-019): the store build, step by step ──────────────────
     Asked every 3 s while it runs (20 min at most); a reload picks it up again (F.watch). One card, ticked in place
     (owner, 8 Oct 2026: "go with b"); a hand-over to the team is said once under it. */
  const POLL_MS = 3000, POLL_MAX = 400;
  /* what he gave, for the discovery stand-in only (production has it from the assistant's writes) */
  function planOf() {
    const f = FLOW.facts(ctx()), by = function (t) { return f.notAdded.filter(function (p) { return p.type === t; }).map(function (p) { return { name: p.name, why: (p.phone || "no number") + " is not a phone number" }; }); };
    const na = { customers: by("shop"), suppliers: by("supplier"), staff: by("staff") };
    return { at: Date.now(), products: f.products + 17 * f.productFiles, customers: f.customers - na.customers.length, suppliers: f.suppliers - na.suppliers.length, staff: f.staff - na.staff.length, notAdded: na };
  }
  function watchBuild() {
    const w = F.watch;
    if (!w || w.over || !OB.progress) return;
    let n = 0;
    (function ask() {
      if (F.watch !== w) return;   // he started again: this build's news is not this conversation's
      OB.progress(w.id, w.plan).then(function (p) {
        if (F.watch !== w) return;
        if (p) showProgress(w, p);
        if (p && (p.state === "done" || p.state === "team")) { w.over = true; save(); return; }
        if (++n < POLL_MAX) setTimeout(ask, POLL_MS);
      }, function () { if (++n < POLL_MAX) setTimeout(ask, POLL_MS); });
    })();
  }
  function showProgress(w, p) {
    const card = FLOW.progressCard(p, S.store.name);
    card.build = w.id;
    const at = msgs.findIndex(function (m) { return m.widget && m.widget.type === "progress" && m.widget.build === w.id; });
    if (at < 0 && w.said.indexOf("card") < 0) { w.said.push("card"); say([FLOW.txt("", { widget: card })]); }
    else if (at >= 0) { msgs[at].widget = card; save(); render(); }
    if (p.state === "team" && w.said.indexOf("team") < 0) { w.said.push("team"); save(); say([FLOW.txt(FLOW.BUILD_TEAM)]); }
  }

  /* v7 (D-2): a store option → the Digital Assistant's login link for that screen. Not connected → says so, a sample. */
  async function storeLink(id) {
    if (!isReady()) return say([FLOW.txt("Aapka store ban raha hai. Ready hote hi yahin bataunga.")]);
    const a = FLOW.STORE_ACTIONS.find(function (x) { return x.id === id; });
    typing(true);
    let j = null;
    try {
      const res = await api("/api/assistant/link", { method: "POST", headers: { "Content-Type": "application/json", "x-owner-mobile": owner() },
        body: JSON.stringify({ event: a.event, store: F.readyFor }) });
      j = res.ok ? await res.json() : null;
    } catch (e) { j = null; }
    typing(false);
    return say(FLOW.linkFor(id, j));
  }
  /* v7 (D-3): the team marks his request Ready to use → his store's options switch on, said once. */
  function checkReady() {
    if (F.at !== "done" || F.readyFor) return;
    const r = builds.find(function (b) { return b.status === "ready"; });
    if (!r) return;
    F.readyFor = r.id; save();
    say(FLOW.ready(ctx()));
  }
  /* Discovery: nothing pushes to this page, so while he waits it looks every few seconds (production: a push). */
  let readyT = null;
  function watchReady() {
    clearInterval(readyT);
    readyT = setInterval(function () {
      if (!open || document.hidden || F.at !== "done" || F.readyFor || !owner()) return;
      api("/api/mystores", { headers: { "x-owner-mobile": owner() }, cache: "no-store" }).then(function (r) { return r.ok ? r.json() : { stores: [] }; }).then(function (j) {
        const was = builds.map(function (b) { return b.id + b.status; }).join();
        if ((j.stores || []).filter(function (b) { return b.meta; }).map(function (b) { return b.id + b.status; }).join() !== was) loadBuilds();
      }).catch(function () {});
    }, 4000);
  }

  /* ── the options around the tree ───────────────────────────────────── */
  function started() { return !!(S.store.name || F.at); }
  function isReady() { return F.at === "done" && !!F.readyFor; }
  function welcome() {
    if (isReady()) return FLOW.ready(ctx());
    if (F.at === "done") return [FLOW.txt("Namaste 🙏 Aapka store ban raha hai. Ready hote hi yahin bataunga.")];
    if (started() && inFlow()) return [FLOW.txt("Welcome back 🙏 Jahan chhoda tha wahin se continue karein?", { buttons: [{ id: "intent:carry", label: "Continue" }, { id: "intent:restart", label: "Naye se shuru" }] })];
    return [{ kind: "image", image: "present.png", alt: "The FoodBridge Assistant", text: "Namaste 🙏 Main *FoodBridge Assistant* hoon." },
      /* v11 (owner): store setup is the first of the assistant's jobs, not the only one — he picks what to do */
      FLOW.txt("Bataiye, aaj kya karna hai?", { buttons: [{ id: "intent:setup", label: "Naya store banayein" }] })];
  }
  function help() {
    return [FLOW.txt("Neeche se chuniye kya karna hai. Button dabaiye, type kariye ya 🎤 boliye. File 📎 se bhejiye.", { buttons: [{ id: "intent:setup", label: "Naya store banayein" }] })];
  }
  function mainMenu() {
    if (isReady() && MODE !== "tower") return FLOW.storeMenu();
    let rows;
    if (isReady()) rows = FLOW.STORE_ACTIONS.map(function (a) { return { id: a.id, label: a.label }; });
    else if (F.at === "done") rows = [];
    else if (inFlow()) rows = [{ id: "intent:carry", label: "Continue" }, { id: "intent:restart", label: "Naye se shuru" }];
    else rows = [{ id: "intent:setup", label: "Naya store banayein" }];
    if (MODE === "tower") rows = BRAIN.MENU.map(function (m) { return { id: "intent:" + m.id, label: m.label }; }).concat(rows);
    rows.forEach(function (r, i) { r.n = i + 1; });
    if (!rows.length) return FLOW.txt("Aapka store ban raha hai. Ready hote hi yahin bataunga.");
    return FLOW.txt("Number likh kar bhejiye:\n" + rows.map(function (r) { return r.n + "  " + r.label; }).join("\n"),
      { list: { button: "Menu", title: "Menu", rows: rows }, numbered: rows.map(function (r) { return { id: r.id, label: r.label }; }) });
  }
  function startSetup() {
    if (isReady()) return say(FLOW.ready(ctx()));
    if (F.at === "done") return say([FLOW.txt("Aapka store ban raha hai. Ready hote hi yahin bataunga.")]);
    if (inFlow()) return say(FLOW.ask(ctx(), F.at));
    F.at = null; save();
    return say(FLOW.ask(ctx(), "mobile"));
  }
  function restart() {
    const keep = msgs.slice(-1);
    S = M.blank(); F = blankF(); msgs = keep;
    save();
    say([FLOW.txt("Theek hai, naye se shuru karte hain.")].concat(FLOW.ask(ctx(), "mobile")));
  }
  /* The tower's own answers (tower mode): the Vasu Foods snapshot (seed-data/tower-snapshot.json). */
  let SNAP = null;
  function towerCtx() { return SNAP ? { model: SNAP.model, timeline: SNAP.timeline } : { model: { levers: [] }, timeline: { days: [] } }; }
  function towerWelcome() {
    const w = BRAIN.welcome();
    w[1].buttons = [{ id: "intent:needs", label: "What needs me today" }, { id: "intent:setup", label: "Set up a new store" }];
    w[1].text = w[1].text.replace(/\n8  Today's news$/, "\n8  Today's news\n9  Set up a new store");
    w[1].list = mainMenu().list;
    return w;
  }

  function go(url) {
    const frame = document.getElementById("tower-frame");
    if (MODE === "tower" && frame && url.indexOf(VASU_TOWER) >= 0) { frame.src = url; setTimeout(closeChat, 900); return; }
    window.open(url, "_blank", "noopener");
  }

  /* ── taps ──────────────────────────────────────────────────────────── */
  function onClick(e) {
    const el = e.target.closest("[data-close],[data-info],[data-file],[data-menu],[data-clip],[data-mic],[data-btn],[data-retry],[data-list],[data-row],[data-sheet-close],[data-say],[data-act]");
    if (!el) { if (e.target.classList.contains("cb-sheetwrap")) closeSheet(); return; }
    if (el.closest(".cb-row.is-past")) return;
    if (el.hasAttribute("data-file")) return downloadBuildFile(el.dataset.id, el.dataset.file);
    if (el.hasAttribute("data-close")) return closeChat();
    if (el.hasAttribute("data-info")) return toggleInfo();
    if (el.hasAttribute("data-menu")) return openMoreSheet();
    if (el.hasAttribute("data-clip")) return pickFile();
    if (el.hasAttribute("data-mic")) return mic();
    if (el.hasAttribute("data-say")) { mine(el.dataset.say); return route({ text: el.dataset.say }); }
    if (el.hasAttribute("data-sheet-close")) return closeSheet();
    if (el.hasAttribute("data-btn")) return press(el.dataset.btn, el.dataset.label);
    if (el.hasAttribute("data-retry")) return OB.retry && OB.retry(S, el.dataset.retry);
    if (el.hasAttribute("data-list")) return openListSheet(+el.dataset.list);
    if (el.hasAttribute("data-row")) { closeSheet(); return press(el.dataset.row, el.dataset.label); }
    if (el.hasAttribute("data-act")) return ACT[el.dataset.act] && ACT[el.dataset.act](el, e);
  }
  function onChange(e) {
    const t = e.target;
    if (t.matches(".aw-tick input")) { const w = t.closest(".aw"); $(".aw-go", w).disabled = !w.querySelector("input:checked"); }
    if (t.matches(".aw select")) { const w = t.closest(".aw"); $(".aw-go", w).disabled = !t.value; }
    if (t.matches(".pf input[type=checkbox]")) { t.closest("tr").classList.toggle("is-off", !t.checked); countProducts(); }
    if (t.matches(".pk input[type=checkbox]")) countPick();
  }
  function press(id, label) {
    if (id === "menu") { mine(label || "Menu"); return say([mainMenu()]); }
    if (id.indexOf("ans:") === 0) {
      if (F.at === "done" || !inFlow()) {   // an answer to a tree that has moved on: only Change still applies
        if (id.indexOf("ans:edit:") === 0) { mine(label); return answer({ value: id.slice(4) }); }
        return;
      }
      mine(label);
      return answer({ value: id.slice(4) });
    }
    if (id.indexOf("intent:") === 0) {
      const it = id.slice(7);
      mine(label);
      if (it === "setup") return startSetup();
      if (it === "carry") return say(FLOW.ask(ctx(), F.at && F.at !== "done" ? F.at : "mobile"));
      if (it === "restart") return restart();
      if (it === "help") return say(help());
      if (MODE === "tower") { const r = BRAIN.reply({ intent: it }, towerCtx()); if (r) return say(r); }
      return say([mainMenu()]);
    }
    if (id === "retry:files") { mine(label); return retryAll(); }
    if (id.indexOf("store:") === 0) { mine(label || (FLOW.STORE_ACTIONS.find(function (a) { return a.id === id; }) || {}).label); return storeLink(id); }
    if (id.indexOf("open:") === 0 || id.indexOf("act:") === 0) {   // the tower's own buttons: open the lever on the board
      mine(label);
      const lv = id.split(":")[1];
      go(VASU + VASU_TOWER + (lv === "timeline" ? "?view=updates" : "?lever=" + lv));
      return say([FLOW.txt(id.indexOf("act:") === 0 ? "Here it is, prepared for you on the board. Check it and confirm — nothing goes out until you do." : "Opening it on the board.")]);
    }
  }

  /* Widget actions. */
  const ACT = {
    select: function (el) { const w = el.closest(".aw"), s = $("select", w); if (!s.value) return; mine(s.options[s.selectedIndex].text); answer({ value: s.value }); },
    multi: function (el) {
      const w = el.closest(".aw"), on = Array.from(w.querySelectorAll("input:checked"));
      if (!on.length) return;
      mine(on.map(function (x) { return x.dataset.label; }).join(", "));
      answer({ values: on.map(function (x) { return x.value; }) });
    },
    attach: function () { pickFile(); },
    sheetPeople: function () { openSheetFor("people"); },
    savePeople: function () {
      const out = {}; let n = 0;
      $(".cb-sheet", root).querySelectorAll(".sf-row").forEach(function (r) { const v = r.querySelector("input:checked"); if (v) { out[r.dataset.id] = v.value; n++; } });
      closeSheet();
      mine(n + " contacts check kiye");
      answer({ people: out });
    },
    saveProducts: function () {
      const rows = [];
      $(".cb-sheet", root).querySelectorAll("tr[data-i]").forEach(function (tr) {
        const p = Object.assign({}, F.prod.products[+tr.dataset.i]);
        p.keep = tr.querySelector("input[type=checkbox]").checked;
        const val = function (k) { const x = tr.querySelector('[data-k="' + k + '"]'); return x ? x.value.trim() : ""; };
        p.name = val("name") || p.name; p.pack = val("pack");
        const num = function (k) { const v = val(k); return v === "" ? null : Number(v); };
        p.mrp = num("mrp"); p.sell = num("sell");
        rows.push(p);
      });
      closeSheet();
      const n = rows.filter(function (r) { return r.keep; }).length;
      mine("Add " + n + " products");
      answer({ products: { rows: rows } });
    },
    savePick: function () {
      const ids = Array.from($(".cb-sheet", root).querySelectorAll(".pk input:checked")).map(function (x) { return x.value; });
      if (!ids.length) return;
      closeSheet();
      mine(ids.length + " customers");
      answer({ pick: ids });
    },
    demoStep: function (el) {
      /* the team's side, stood in: Ready to use only after Set up, as the panel rules — so the stand-in walks through it */
      const id = el.dataset.id, to = el.dataset.step, order = STEPS.map(function (x) { return x[0]; });
      const b = builds.find(function (x) { return x.id === id; }), from = Math.max(0, order.indexOf(b && b.status));
      const path = order.slice(from + 1, order.indexOf(to) + 1);
      path.reduce(function (p, st) { return p.then(function () { return api("/api/tickets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id, status: st }) }); }); }, Promise.resolve())
        .then(loadBuilds, loadBuilds);
    },
    more: function (el) { closeSheet(); const k = el.dataset.k; if (k === "feedback") return window.FBFeedback.open(); if (k === "reset") { if (confirm("Reset everything? The chat, his answers, the files and every saved store and build in this browser are deleted.")) window.FB_RESET(); return; } if (k === "restart") { mine("Naye se shuru"); restart(); } else if (k === "sent") {
      /* the desktop has the Team chat; the phone and the tower panel open the page, for his mobile only */
      if (shell && window.matchMedia("(min-width: 900px)").matches && (builds.length || waiting.length)) setView("team");
      else location.href = "sent.html?mobile=" + encodeURIComponent(owner());
    } },
  };
  /* ── files (📎, drop, paste, the phone's photos) ───────────────────── */
  /* The first rows of a spreadsheet, for the bubble only (no product matching): { rows: ≤5 × ≤5 cells, more }. */
  async function peekOf(f) {
    const ext = (/\.([a-z0-9]+)$/i.exec(f.name) || [])[1] || "";
    try {
      let rows = null;
      if (/^xlsx$/i.test(ext)) rows = await IMP.xlsxRows(new Uint8Array(await f.arrayBuffer()));
      else if (/^(csv|tsv)$/i.test(ext)) rows = IMP.parseCsv(await f.text());
      rows = (rows || []).filter(function (r) { return r && r.some(function (c) { return String(c == null ? "" : c).trim(); }); });
      if (!rows.length) return null;
      const cut = function (c) { c = String(c == null ? "" : c).trim(); return c.length > 16 ? c.slice(0, 15) + "…" : c; };
      return { rows: rows.slice(0, 5).map(function (r) { return r.slice(0, 5).map(cut); }), more: Math.max(0, rows.length - 5) };
    } catch (e) { return null; }
  }
  /* v11 (team review R4): at Products and at Contacts photos are not taken for now — the question says so, the picker
     offers documents only, and a photo sent anyway (drop, paste, an "All files" pick) is turned away with a way on. */
  const NO_PHOTO_STEPS = ["products", "contacts"];
  const DOCS = ".xlsx,.xls,.csv,.tsv,.pdf,.txt,.vcf,.doc,.docx";
  function isPhoto(f) { return /^image\//.test(f.type || "") || /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(f.name || ""); }
  function pickFile() { fileIn.accept = NO_PHOTO_STEPS.indexOf(F.at) >= 0 ? DOCS : ""; fileIn.click(); }
  async function sendFiles(files) {
    const at = F.at, step = at === "contacts" ? "people" : at === "products" ? "items" : "finish";
    if (NO_PHOTO_STEPS.indexOf(at) >= 0 && files.some(isPhoto)) {
      await say([FLOW.txt("📷 Photo abhi nahi le sakte 🙏 Excel, PDF ya CSV file bhejiye — ya *Baad mein* dabaiye.",
        { buttons: [{ id: "ans:" + (at === "products" ? "later" : "skip"), label: "Baad mein" }] })]);
      files = files.filter(function (f) { return !isPhoto(f); });
      if (!files.length) return;
    }
    const papers = [], list = [];
    for (const f of files) {
      const p = await OB.take(X, M, null, S, f, step);   // kept as it came, uploaded to S3
      if (!p || p.error) { mine({ kind: "file", name: f.name, size: f.size }); await say([FLOW.txt("⚠️ " + f.name + " bahut badi hai (40 MB se zyada). Chhoti file bhejiye.")]); continue; }
      p.peek = await peekOf(f);
      if (at === "contacts") {   // the one reading left in the browser: names and numbers for "Who is who"
        try { const r = await IMP.readFile(f.name, new Uint8Array(await f.arrayBuffer())); const ppl = r.people || []; if (ppl.length) { p.found = ppl.length; ppl.forEach(function (x) { list.push(x); }); } } catch (e) { /* not a list */ }
      }
      papers.push(p);
      mine({ kind: "file", name: f.name, size: f.size, paper: p.id, mime: f.type || "" });
    }
    save();
    if (!papers.length) return;
    if (at === "contacts") {
      const unread = papers.filter(function (p) { return !p.found; });
      if (!list.length) return say([FLOW.txt("✅ File mil gayi! Store banate time isme se customers, suppliers aur staff add kar denge.", { buttons: [{ id: "ans:done", label: "Ho gaya" }, { id: "ans:more", label: "Aur file bhejiye" }] })]);
      if (unread.length) await say([FLOW.txt("✅ " + unread.map(function (p) { return p.name; }).join(", ") + " mil gayi — store banate time padh lenge.")]);
      return answer({ contacts: list, src: "file" });
    }
    if (at === "products") return answer({ papers: papers });
    say([FLOW.txt("✅ File mil gayi! Store banate time padh lenge.")]);
  }
  function retryAll() {
    const todo = S.papers.filter(function (p) { return !/^audio\//.test(p.mime || "") && !p.fileId && p.up !== "unsupported"; });
    return Promise.all(todo.map(function (p) { return OB.retry(S, p.id); })).then(function () { save(); render(); });
  }
  /* A file's copy in this browser, as an object URL: the render is a string, so the picture and the open link are filled in after it. */
  const fileUrls = {};
  function fileUrl(id) {
    if (!fileUrls[id]) fileUrls[id] = OB.DB.get(id).then(function (b) { return b ? URL.createObjectURL(b) : ""; }, function () { return ""; });
    return fileUrls[id];
  }
  function fillPapers() {
    body.querySelectorAll("[data-paper]").forEach(function (el) {
      fileUrl(el.dataset.paper).then(function (u) { if (u && el.isConnected) el[el.tagName === "IMG" ? "src" : "href"] = u; });
    });
  }
  const TYPES = { pdf: "PDF", doc: "Word", docx: "Word", txt: "Text", xls: "Excel", xlsx: "Excel", csv: "CSV", tsv: "CSV", vcf: "Contacts" };
  /* the coloured badge on a file: its kind at a glance */
  const BADGE = { pdf: ["PDF", "#E5484D"], doc: ["DOC", "#2B7FD8"], docx: ["DOC", "#2B7FD8"], xls: ["XLS", "#1D9A5B"], xlsx: ["XLS", "#1D9A5B"], csv: ["XLS", "#1D9A5B"], tsv: ["XLS", "#1D9A5B"], txt: ["TXT", "#7A8790"], vcf: ["VCF", "#0F9AA0"] };
  /* a long name keeps its start and its ending (the type): "20260921064302…khan.pdf" */
  function shortName(n) { n = String(n || ""); return n.length > 20 ? n.slice(0, 10) + "…" + n.slice(-9) : n; }
  function fileBubble(m) {
    const p = m.paper && S.papers.find(function (x) { return x.id === m.paper; });
    const ext = (((/\.([a-z0-9]+)$/i.exec((p && p.name) || m.name || "") || [])[1]) || "").toLowerCase();
    const b = BADGE[ext] || [(ext || "file").slice(0, 4).toUpperCase(), "#7A8790"];
    const peek = p && !p.found && p.peek && /^(xlsx|xls|csv|tsv)$/.test(ext) ? p.peek : null;
    const rows = peek ? peek.rows.length + peek.more - 1 : 0;   // the first row is its header
    const head = '<span class="cb-doc-badge" style="background:' + b[1] + '">' + esc(b[0]) + '</span><span class="cb-doc-name"><b title="' + esc(m.name) + '">' + esc(shortName(m.name)) + "</b><small>" +
      kb(m.size) + (TYPES[ext] ? " · " + TYPES[ext] : "") + (rows > 0 ? " · " + rows + " row" + (rows > 1 ? "s" : "") : "") + "</small></span>";
    const tag = p && !peek && !p.found ? "a" : "span";   // a document opens in a new tab, as before
    let out = "<" + tag + ' class="cb-doc-head"' + (tag === "a" ? ' data-paper="' + esc(p.id) + '" target="_blank" rel="noopener"' : "") + ">" + head + "</" + tag + ">";
    if (!p) return '<span class="cb-doc">' + out + "</span>";
    if (/^image\//.test(p.mime || m.mime || "")) {
      out = '<a data-paper="' + esc(p.id) + '" target="_blank" rel="noopener" class="cb-img"><img data-paper="' + esc(p.id) + '" alt="' + esc(p.name) + '" onerror="this.style.display=\'none\'" style="max-width:240px;width:100%;display:block"></a>' +
        '<span class="cb-txt"><small style="color:#667781">' + esc(m.name) + " · " + kb(m.size) + "</small></span>";   // the name stays when the browser cannot draw it (HEIC)
    } else if (p.found) {
      out = '<span class="cb-doc">' + out + '<span class="cb-doc-more">📇 ' + p.found + " contacts found</span></span>";
    } else if (peek) {
      out = '<span class="cb-doc">' + out + '<span class="cb-doc-more"><table class="cb-peek">' + peek.rows.map(function (r, k) {
        return "<tr>" + r.map(function (c) { return (k ? "<td>" : "<th>") + esc(c) + (k ? "</td>" : "</th>"); }).join("") + "</tr>";
      }).join("") + "</table>" + (peek.more ? "<small>…" + peek.more + " more rows</small>" : "") + "</span></span>";
    } else out = '<span class="cb-doc">' + out + "</span>";
    const up = p.up === "done" ? "✓ Upload ho gayi" : p.up === "uploading" ? "Upload ho rahi hai…" : p.up === "failed" ? "⚠ Upload nahi hui" : p.up === "unsupported" ? "⚠ Yeh file nahi chalegi. Excel, PDF ya CSV bhejiye." : "";
    if (up) out += '<span class="cb-up is-' + esc(p.up) + '">' + (p.up === "uploading" ? '<i class="cb-up-bar"></i>' : "") + "<span>" + up + "</span>" +
      (p.up === "failed" ? '<button type="button" class="cb-up-retry" data-retry="' + esc(p.id) + '">Phir se try</button>' : "") + "</span>";
    return out;
  }

  /* ── drawing ───────────────────────────────────────────────────────── */
  function widgetHTML(w, i) {
    if (!w) return "";
    if (w.type === "select") {
      return '<div class="aw is-form"><div class="aw-row"><select aria-label="' + esc(w.label) + '"><option value="">' + esc(w.ph || "Choose") + "</option>" +
        w.options.map(function (o) { return '<option value="' + esc(o.v) + '">' + esc(o.label) + "</option>"; }).join("") +
        '</select><button type="button" class="aw-go" data-act="select" disabled>Send</button></div></div>';
    }
    if (w.type === "multi") {
      return '<div class="aw is-form"><div class="aw-ticks">' + w.options.map(function (o) {
        return '<label class="aw-tick"><input type="checkbox" value="' + esc(o.v) + '" data-label="' + esc(o.label) + '"' + (o.on ? " checked" : "") + ">" + esc(o.label) + "</label>";
      }).join("") + '</div><button type="button" class="aw-go" data-act="multi"' + (w.options.some(function (o) { return o.on; }) ? "" : " disabled") + ">Done</button></div>";
    }
    if (w.type === "files") {
      /* v11 (R2): the contacts step gets a sample Excel — Name · Mobile · Type — whose Type column marks each person */
      const sample = w.sample ? '<a class="aw-link" href="store/sample-contacts.xlsx" download="FoodBridge-sample-contacts.xlsx">⬇️ Sample Excel download kariye</a>' : "";
      return '<div class="aw"><button type="button" class="aw-drop" data-act="attach">' + I.up + "<span><b>File bhejiye</b><small>Excel · PDF · CSV</small></span></button>" + sample + "</div>";
    }
    if (w.type === "products") {
      const rows = w.rows || [], show = rows.slice(0, 8);
      return '<div class="aw"><table class="aw-prod"><thead><tr><th>Product</th><th>Pack</th><th class="n">MRP</th><th class="n">Rate</th></tr></thead><tbody>' +
        show.map(function (p) {
          return "<tr><td>" + esc(p.name) + (p.match ? '<span class="m">✓ ' + esc(p.match.name) + "</span>" : '<span class="m is-new">New</span>') + "</td><td>" + esc(p.pack || "") + '</td><td class="n">' +
            (p.mrp != null ? "₹" + p.mrp : "—") + '</td><td class="n">' + (p.sell != null ? "₹" + p.sell : '<span class="no">—</span>') + "</td></tr>";
        }).join("") + "</tbody></table>" + (rows.length > show.length ? '<div class="aw-more">…and ' + (rows.length - show.length) + " more</div>" : "") + "</div>";
    }
    if (w.type === "progress") {
      const HEAD = { running: "Kaam chal raha hai…", waiting: "⏳ Thoda zyada time lag raha hai, kaam chal raha hai", team: "Baaki kaam FoodBridge team karegi", done: "Sab ho gaya 🎉" };
      const IC = { done: "✓", none: "–", running: "", todo: "", stopped: "‖" };
      return '<div class="aw"><div class="aw-prog"><div class="pg-head"><img src="store/foodbridge-mark-green.png" alt=""><span><b>' + esc(w.name || "Aapka store") + " ban raha hai</b><small>" + esc(HEAD[w.state] || HEAD.running) + "</small></span></div>" +
        w.rows.map(function (r) {
          const warn = r.notAdded.length ? '<span class="pg-warn">⚠️ Add nahi hue: ' + esc(r.notAdded.map(function (x) { return x.name + (x.why ? " — " + x.why : ""); }).join("; ")) + "</span>" : "";
          return '<div class="pg-row is-' + esc(r.state) + '"><span class="pg-ic" aria-hidden="true">' + (IC[r.state] || "") + '</span><span class="pg-lb"><b>' + r.icon + " " + esc(r.label) + "</b>" + (r.sub ? "<small>" + esc(r.sub) + "</small>" : "") + warn + "</span></div>";
        }).join("") +
        (w.rows[0].state === "done" ? '<div class="pg-foot">' + md(w.state === "done" ? "🎉 *Sab ho gaya!* Aapka store poori tarah ready hai." : w.state === "team" ? "✅ *" + w.name + "* ready hai — login karke dekhiye." : w.ready) +
          (w.link ? '<br><a class="pg-btn" href="' + esc(w.link) + '" target="_blank" rel="noopener">Store kholiye ↗</a>' : "") + "</div>" : "") + "</div></div>";
    }
    if (w.type === "summary") {
      const f = w.facts;
      const cell = function (n, l) { return "<div><b>" + n + "</b><small>" + esc(l) + "</small></div>"; };
      return '<div class="aw"><div class="aw-store"><div class="st-head"><img src="store/foodbridge-mark-green.png" alt=""><span><b>' + esc(f.name || "Aapka store") + "</b><small>" +
        esc([f.type, f.mobile].filter(Boolean).join(" · ")) + '</small></span></div><div class="st-grid">' +
        /* v10 (addendum-019): a product file is counted — never "0 products" when he sent one */
        (!f.products && f.productFiles ? cell("📄 " + f.productFiles, f.productFiles === 1 ? "product file" : "product files") : cell(f.products, f.productFiles ? "products + file" : "products")) + cell(f.customers, "customers") + cell(f.suppliers, "suppliers") +
        cell(f.staff, "staff") + cell(f.answered + "/" + f.of, "roz ka kaam") + "</div></div></div>";
    }
    if (w.type === "people") return '<div class="aw"><button type="button" class="aw-go is-quiet" data-act="sheetPeople">Sabko dekhiye (' + w.rows.length + ")</button></div>";
    return "";
  }

  function render() {
    if (!open) return;
    if (VIEW !== "assistant") { renderSide(); return renderOther(); }
    root.classList.remove("is-readonly");
    if (shell) head("mascot", "FoodBridge Assistant", isTyping ? "likh raha hai…" : "");
    seen = msgs.length;
    renderSide(); renderInfo();
    let html = '<div class="cb-chip">Today</div>';
    let lastMe = -1;
    msgs.forEach(function (m, i) { if (m.from === "me") lastMe = i; });
    msgs.forEach(function (m, i) {
      const prev = msgs[i - 1];
      const tail = !prev || prev.from !== m.from || prev.kind === "sticker";
      const side = m.from === "me" ? "out" : "in";
      const past = m.from === "bot" && i < lastMe ? " is-past" : "";
      const t = '<span class="cb-time">' + clock(m.at) + (m.from === "me" ? '<span class="cb-ticks' + (m.read ? " is-read" : "") + '">' + I.ticks + "</span>" : "") + "</span>";
      if (m.kind === "note") { html += '<div class="cb-chip cb-note">' + md(m.text) + "</div>"; return; }
      if (m.kind === "sticker") {
        html += '<div class="cb-row in cb-tail' + past + '"><div class="cb-stk"><img src="' + MASCOT + esc(m.image) + '" alt="' + esc(m.alt || "") + '" width="120" height="120">' + t + "</div></div>";
        return;
      }
      let inner = "";
      if (m.kind === "image") inner += '<span class="cb-img"><img src="' + MASCOT + esc(m.image) + '" alt="' + esc(m.alt || "") + '" width="240" height="240"></span>';
      if (m.kind === "file") inner += fileBubble(m);
      if (m.text) inner += '<span class="cb-txt">' + (m.quote ? '<span class="cb-quote">' + md(m.text) + "</span>" : md(m.text)) + "</span>";
      inner += t;
      inner += widgetHTML(m.widget, i);
      if (m.list) inner += '<button type="button" class="cb-listbtn" data-list="' + i + '">' + I.list + esc(m.list.button) + "</button>";
      const btns = m.buttons && m.buttons.length ? '<div class="cb-btns">' + m.buttons.map(function (b) {
        return '<button type="button" class="cb-btn" data-btn="' + esc(b.id) + '" data-label="' + esc(b.label) + '" aria-label="' + esc(b.label) + '">' + I.reply + "<span>" + esc(b.label) + "</span></button>";
      }).join("") + "</div>" : "";
      const wide = m.widget && /products|summary|contacts|progress/.test(m.widget.type) ? " is-wide" : "";
      html += '<div class="cb-row ' + side + (tail ? " cb-tail" : "") + past + '"><div class="cb-grp' + wide + '"><div class="cb-bub' + (m.kind === "image" ? " is-img" : "") + '">' + inner + "</div>" + btns + "</div></div>";
    });
    body.innerHTML = html;
    fillPapers();
    stick();
  }
  function stick() { body.scrollTop = body.scrollHeight; }

  /* "reply with a number" for the menu: a number typed while the last message is a numbered menu. */
  function route(inp) {
    const last = msgs.slice().reverse().find(function (m) { return m.from === "bot"; });
    const t = inp.text != null ? String(inp.text).trim() : "";
    if (last && last.numbered && /^\d+$/.test(t) && !inFlow()) {
      const r = last.numbered[Number(t) - 1];
      if (r) return press(r.id, null) || undefined;
    }
    if (MODE === "tower" && !inFlow() && /^\d+$/.test(t) && t === "9") return startSetup();
    return routeText(inp);
  }

  /* ── sheets ────────────────────────────────────────────────────────── */
  function sheet(title, html, cls) {
    const w = $(".cb-sheetwrap", root);
    w.innerHTML = '<div class="cb-sheet' + (cls ? " " + cls : "") + '" role="dialog" aria-label="' + esc(title) + '"><div class="cb-sh"><button type="button" class="cb-hbtn" data-sheet-close aria-label="Close">' + I.close + "</button><b>" + esc(title) + "</b></div>" + html + "</div>";
    w.hidden = false;
  }
  function closeSheet() { const w = root && $(".cb-sheetwrap", root); if (w) { w.hidden = true; w.innerHTML = ""; } }
  function openListSheet(i) {
    const m = msgs[i]; if (!m || !m.list) return;
    sheet(m.list.title, '<div class="cb-rows">' + m.list.rows.map(function (r) {
      return '<button type="button" class="cb-rowbtn" data-row="' + esc(r.id) + '" data-label="' + esc(r.label) + '"><span class="cb-rn">' + r.n + '</span><span class="cb-rt"><b>' + esc(r.label) + "</b>" +
        (r.desc ? "<small>" + esc(r.desc) + "</small>" : "") + '</span><i class="cb-radio" aria-hidden="true"></i></button>';
    }).join("") + "</div>");
  }
  function openMoreSheet() {
    const rows = (builds.length || waiting.length ? [["sent", "FoodBridge ko bheja"]] : [])
      .concat([["restart", "Naye se shuru"]])
      .concat(window.FBFeedback ? [["feedback", "Feedback dijiye"]] : [])
      .concat(window.FB_RESET ? [["reset", "Reset everything (demo)"]] : []);   // discovery only: boot.js
    sheet("More", '<div class="cb-rows">' + rows.map(function (r) {
      return '<button type="button" class="cb-rowbtn" data-act="more" data-k="' + r[0] + '"><span class="cb-rt"><b>' + esc(r[1]) + "</b></span></button>";
    }).join("") + "</div>");
  }
  function avatar(n) { return String(n || "?").trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase(); }
  function openSheetFor(kind) {
    if (kind === "people") {
      const rows = S.order.map(function (id) { return S.people[id]; }).filter(Boolean);
      sheet("Kaun customer, kaun supplier", '<div class="cb-rows">' + rows.map(function (p) {
        const cur = p.type || M.guessType(p.name) || "";
        return '<div class="sf-row" data-id="' + esc(p.id) + '"><span class="sf-av">' + esc(avatar(p.name)) + '</span><span class="sf-who"><b>' + esc(p.name) + "</b><small>" + esc(M.phoneShow(p.phone)) + "</small></span>" +
          '<span class="sf-seg" role="radiogroup" aria-label="' + esc(p.name) + '">' + ["shop", "supplier", "staff", "none"].map(function (k) {
            return '<label><input type="radio" name="t-' + esc(p.id) + '" value="' + k + '"' + (cur === k ? " checked" : "") + ">" + FLOW.KIND[k] + "</label>";
          }).join("") + "</span></div>";
      }).join("") + '</div><div class="sf-foot"><span class="sf-n">' + rows.length + ' contacts</span><button type="button" data-act="savePeople">Save kariye</button></div>', "is-form");
    }
    if (kind === "products" && F.prod) {
      sheet("Products", '<div class="cb-rows pf-wrap"><table class="pf"><thead><tr><th></th><th>Product</th><th>Pack</th><th>MRP ₹</th><th>Rate ₹</th></tr></thead><tbody>' +
        F.prod.products.map(function (p, i) {
          return '<tr data-i="' + i + '"><td><input type="checkbox" checked aria-label="Keep"></td><td><input type="text" data-k="name" value="' + esc(p.name) + '">' +
            (p.match ? '<span class="m">✓ ' + esc(p.match.name) + "</span>" : '<span class="m is-new">New</span>') + "</td>" +
            '<td><input type="text" data-k="pack" value="' + esc(p.pack || "") + '" style="width:90px"></td>' +
            '<td><input type="number" step="0.01" min="0" data-k="mrp" value="' + (p.mrp != null ? p.mrp : "") + '"></td>' +
            '<td><input type="number" step="0.01" min="0" data-k="sell" value="' + (p.sell != null ? p.sell : "") + '"></td></tr>';
        }).join("") + '</tbody></table></div><div class="sf-foot"><span class="sf-n" id="pf-n"></span><button type="button" data-act="saveProducts">Add</button></div>', "is-form");
      countProducts();
    }
    if (kind === "pick") {
      const shops = M.peopleOf(S, "shop");
      sheet("Pick customers", '<div class="cb-rows">' + shops.map(function (p) {
        return '<label class="sf-row pk"><span class="sf-av">' + esc(avatar(p.name)) + '</span><span class="sf-who"><b>' + esc(p.name) + "</b><small>" + esc(M.phoneShow(p.phone)) + '</small></span><input type="checkbox" value="' + esc(p.id) + '" style="width:20px;height:20px;accent-color:#00A884"></label>';
      }).join("") + '</div><div class="sf-foot"><span class="sf-n" id="pk-n">0 picked</span><button type="button" data-act="savePick">Done</button></div>', "is-form");
    }
  }
  function countProducts() { const s = $(".cb-sheet", root), n = s ? s.querySelectorAll("tr[data-i] input[type=checkbox]:checked").length : 0; const el = document.getElementById("pf-n"); if (el) el.textContent = n + " to add"; }
  function countPick() { const s = $(".cb-sheet", root), n = s ? s.querySelectorAll(".pk input:checked").length : 0; const el = document.getElementById("pk-n"); if (el) el.textContent = n + " picked"; }

  /* ── the desktop as WhatsApp Web (assistant-v2, owner 5 Oct 2026: "make it look like WhatsApp Web
     desktop … enterprise grade"). desk.css shows it at 900 px and wider; narrower, only the chat shows.
     Two chats, both real: the Assistant; the FoodBridge team's inbox (what reached FoodBridge from this browser,
     read-only). The info drawer is the store's setup. */
  let VIEW = "assistant", seen = 0, isTyping = false, infoOpen = false, builds = [], waiting = [], shownFor = null, shell = null;
  function buildDesk() {
    document.documentElement.classList.add("has-wa");
    shell = document.createElement("div");
    shell.className = "wa";
    /* Only what does something (owner, 5 Oct 2026: "don't keep things just for the sake of UI"): no rail, search,
       filters or footer — three chats can't need them, and the menu and setup are in the chat header (⋯, ⓘ). */
    shell.innerHTML =
      '<aside class="wa-side" aria-label="Chats">' +
        '<header class="wa-sh"><h1><img src="store/foodbridge-mark-green.png" alt="">FoodBridge</h1></header>' +
        '<div class="wa-list" id="wa-list" role="listbox"></div>' +
        (window.FBFeedback ? '<button type="button" class="wa-fb" data-feedback>' + I.chats + "Give feedback</button>" : "") +
      "</aside>" +
      '<div class="wa-main"></div>' +
      '<aside class="wa-info" id="wa-info" hidden aria-label="Your store setup"></aside>';
    document.body.appendChild(shell);
    $(".wa-main", shell).appendChild(root);
    shell.addEventListener("click", function (e) {
      if (root.contains(e.target)) return;
      const v = e.target.closest("[data-view]"); if (v) return setView(v.dataset.view);
      if (e.target.closest("[data-feedback]")) return window.FBFeedback.open();
      if (e.target.closest("[data-info-close]")) return toggleInfo(false);
      const a = e.target.closest("[data-info-act]");
      if (a && a.dataset.infoAct === "restart") { toggleInfo(false); setView("assistant"); mine("Naye se shuru"); return restart(); }
      if (a && a.dataset.infoAct === "carry") { toggleInfo(false); setView("assistant"); return press("intent:carry", "Continue"); }
    });
  }
  function setView(v) {
    if (!shell) return;
    VIEW = v;
    if (v === "team") loadBuilds();
    render();
    if (v === "assistant") composeFor();
  }
  function preview(m) {
    if (!m) return "";
    if (m.kind === "image" || m.kind === "sticker") return m.text ? strip(m.text) : "🙂 Sticker";
    if (m.kind === "file") return "📎 " + m.name;
    if (m.widget && m.widget.type === "summary") return "🏪 Your store";
    if (m.widget && m.widget.type === "progress") return m.widget.state === "done" ? "🎉 All done! Your store is fully set up." : "🛠️ Setting up " + (m.widget.name || "your store");
    return strip(m.text || (m.list ? m.list.title : ""));
  }
  function strip(t) { return String(t || "").replace(/[*_]/g, "").replace(/\s+/g, " ").trim(); }
  function unread() { return msgs.slice(seen).filter(function (m) { return m.from === "bot"; }).length; }
  function rowHTML(o) {
    return '<button type="button" class="wa-row' + (VIEW === o.view ? " on" : "") + '" data-view="' + o.view + '" role="option" aria-selected="' + (VIEW === o.view) + '">' + o.av +
      '<span class="wa-rm"><span class="wa-r1"><b>' + esc(o.name) + "</b>" + (o.time ? '<time class="' + (o.n ? "is-new" : "") + '">' + esc(o.time) + "</time>" : "") + "</span>" +
      '<span class="wa-r2">' + (o.tick ? '<span class="wa-tick">' + I.ticks + "</span>" : "") + '<span class="' + (o.typing ? "is-typing" : "") + '">' + esc(o.prev) + "</span>" +
      (o.n ? "<i>" + o.n + "</i>" : "") + "</span></span></button>";
  }
  function day(t) {
    const d = new Date(t), now = new Date();
    if (d.toDateString() === now.toDateString()) return clock(t);
    const y = new Date(now); y.setDate(now.getDate() - 1);
    return d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }
  function renderSide() {
    if (!shell) return;
    const last = msgs[msgs.length - 1], n = VIEW === "assistant" ? 0 : unread();
    const b0 = builds[0], w0 = waiting[0];
    const rows = [
      { view: "assistant", name: "FoodBridge Assistant", n: n, typing: isTyping, tick: last && last.from === "me" && !isTyping,
        av: '<span class="wa-av" style="background-image:url(' + MASCOT + 'hello-128.png)"></span>',
        time: last ? day(last.at) : "", prev: isTyping ? "typing…" : last ? preview(last) : "" },
      (b0 || w0) && { view: "team", name: "FoodBridge Team", av: '<span class="wa-av is-logo"><img src="store/foodbridge-mark-green.png" alt=""></span>',
        time: w0 ? day(w0.at) : day(Date.parse((b0.meta || {}).received || (b0.meta || {}).at)),
        prev: w0 ? "🕓 Waiting to send" : "📦 Received · " + countsLine(b0.meta) },
    ].filter(Boolean);
    if (VIEW !== "assistant" && !rows.some(function (r) { return r.view === VIEW; })) { VIEW = "assistant"; setTimeout(render, 0); }   // its chat went (Start again, another owner)
    $("#wa-list", shell).innerHTML = rows.map(rowHTML).join("");
  }
  /* v10 (addendum-019): a product file is counted — never "0 products" when he sent one */
  function productsWord(c) { return !c.products && c.productFiles ? c.productFiles + (c.productFiles === 1 ? " product file" : " product files") : c.products + " products"; }
  function countsLine(m) { const c = (m && m.counts) || {}; return [productsWord(c), c.customers + " customers"].join(", "); }
  /* His builds: what reached FoodBridge under his mobile (/api/mystores), and what still waits in this
     browser to be sent (the outbox of builds). Nobody identified → nothing. */
  let loadSeq = 0;
  function loadBuilds() {
    const me = owner(), seq = ++loadSeq;
    shownFor = me;
    if (!me) { builds = []; waiting = []; render(); renderSide(); return Promise.resolve(); }
    const got = api("/api/mystores", { headers: { "x-owner-mobile": me } }).then(function (r) { return r.ok ? r.json() : { stores: [] }; }).catch(function () { return { stores: [] }; });
    const wait = OB.OUTBOX.all().catch(function () { return []; });
    return Promise.all([got, wait]).then(function (x) {
      if (seq !== loadSeq) return;   // the owner changed meanwhile
      builds = (x[0].stores || []).filter(function (b) { return b.meta; });
      waiting = FLOW.owned(x[1], me, M, function (b) { return b.meta && b.meta.mobile; });
      renderSide(); render();
      checkReady();   // render: a chat that just went away hands back to the Assistant
    });
  }
  function downloadBuildFile(id, file) {
    api("/api/mystores?id=" + encodeURIComponent(id) + "&file=" + encodeURIComponent(file), { headers: { "x-owner-mobile": owner() } }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); }).then(function (bl) {
      const a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = file.split("/").pop(); a.click();
    }).catch(function () {});
  }
  /* The read-only chat, drawn as a conversation. */
  function head(av, name, sub, verified) {
    const ava = $(".cb-ava", root);
    ava.className = "cb-ava" + (av === "logo" ? " is-logo" : av === "icon" ? " is-icon" : "");
    ava.style.backgroundImage = av === "mascot" ? "url(" + MASCOT + "hello-128.png)" : "";
    $(".cb-who b", root).textContent = name;
    status.textContent = sub;
  }
  /* v7 (D-3): the request's ticket step (the Business Panel's), and a discovery stand-in for the team that moves it. */
  const STEPS = [["new", "Bheja gaya"], ["inReview", "Check ho raha hai"], ["setUp", "Ban raha hai"], ["ready", "Ready"]];
  function stepsHTML(b) {
    const at = Math.max(0, STEPS.findIndex(function (x) { return x[0] === b.status; }));
    return '<ol class="ro-steps">' + STEPS.map(function (x, i) { return '<li class="' + (i < at ? "is-done" : i === at ? "is-now" : "") + (x[0] === "ready" && i === at ? " is-ready" : "") + '">' + esc(x[1]) + "</li>"; }).join("") + "</ol>" +
      (at < 3 ? '<div class="ro-demo"><span>Demo · team:</span>' + STEPS.slice(at + 1).map(function (x) { return '<button type="button" data-act="demoStep" data-id="' + esc(b.id) + '" data-step="' + x[0] + '">' + esc(x[1]) + "</button>"; }).join("") + "</div>" : "");
  }
  function renderOther() {
    root.classList.add("is-readonly");
    let html = '<div class="cb-chip">FoodBridge ko bheja</div>';
    head("logo", "FoodBridge Team", "");
    $(".wa-ro", root).innerHTML = I.lock + "<span>Read-only</span>";
    waiting.forEach(function (b) {
      html += '<div class="cb-row out cb-tail"><div class="cb-grp is-wide"><div class="cb-bub"><span class="cb-txt">' +
        md("🕓 *Waiting to send* — " + b.sent + "/" + b.total + " files") +
        '</span><span class="cb-time"><span class="ro-held">' + I.clock + "</span>" + day(b.at) + "</span></div></div></div>";
    });
    builds.slice().reverse().forEach(function (b) {
      const m = b.meta || {}, c = m.counts || {};
      html += '<div class="cb-row in cb-tail"><div class="cb-grp is-wide"><div class="cb-bub"><span class="cb-txt">' +
        md("📦 *Received*" + (m.shop ? " — " + m.shop : "") + "\n" +
          [productsWord(c), c.customers + " customers", c.suppliers + " suppliers", c.staff + " staff", c.answered + "/6 daily work", c.photos + " files"].join(" · ") +
          (c.gaps ? "\nTo follow up: " + c.gaps : "")) + "</span>" +
        '<span class="cb-time">' + day(Date.parse(m.received || m.at)) + "</span>" + stepsHTML(b) +
        '<div class="ro-files">' + (b.files || []).map(function (f) { const nm = f.name || f; return '<button type="button" data-file="' + esc(nm) + '" data-id="' + esc(b.id) + '">' + I.doc + esc(nm) + "</button>"; }).join("") + "</div>" +
        "</div></div></div>";
    });
    body.innerHTML = html;
    stick();
    renderInfo();
  }
  /* Business info: who the Assistant is, and how far his store's setup has come. */
  function toggleInfo(on) {
    if (!shell) return openMoreSheet();
    infoOpen = on == null ? !infoOpen : on;
    $(".cb-info", root).classList.toggle("on", infoOpen);
    renderInfo();
  }
  function renderInfo() {
    if (!shell) return;
    const box = $("#wa-info", shell);
    box.hidden = !infoOpen;
    if (!infoOpen) return;
    const f = FLOW.facts(ctx()), P = M.progress(CAT, S);
    const steps = [
      ["Mobile aur dukaan", M.storeReady(S) && !!S.store.name, [S.store.name, S.store.mobile].filter(Boolean).join(" · ")],
      ["Business", !!(f.type), f.type || ""],
      ["Roz ka kaam", P.rules.n === M.RULES_N, P.rules.n + "/" + M.RULES_N],
      ["Products", f.products > 0 || f.productFiles > 0, f.products ? f.products + " products" : f.productFiles ? f.productFiles + " file" : ""],
      ["Customers, suppliers, staff", S.order.length > 0 && !f.unsorted, f.customers + f.suppliers + f.staff ? f.customers + " customers · " + f.suppliers + " suppliers · " + f.staff + " staff" : ""],
      ["Bheja", !!F.built, ""],
      ["Store ready", isReady(), ""],
    ];
    const done = steps.filter(function (x) { return x[1]; }).length, nowAt = steps.findIndex(function (x) { return !x[1]; });
    const action = F.at && F.at !== "done" ? '<button type="button" class="wi-act is-plain" data-info-act="carry">' + I.chats + "Continue</button>" : "";
    box.innerHTML = '<header class="wi-h"><button type="button" class="wa-ib" data-info-close aria-label="Close">' + I.close + "</button>Aapka store setup</header>" +
      '<div class="wi-b">' +
        '<div class="wi-card"><p class="wi-k">' + done + "/" + steps.length + " ho gaye</p>" +
          '<div class="wi-bar"><i style="width:' + Math.round(done / steps.length * 100) + '%"></i></div><ul class="wi-steps">' +
          steps.map(function (x, i) {
            return '<li class="' + (x[1] ? "is-done" : i === nowAt ? "is-now" : "") + '"><span class="d">' + (x[1] ? I.check : "") + "</span><span>" + esc(x[0]) + (x[2] ? "<br><small>" + esc(x[2]) + "</small>" : "") + "</span></li>";
          }).join("") + "</ul></div>" +
        action +
        '<button type="button" class="wi-act" data-info-act="restart">' + I.trash + "Naye se shuru</button>" +
      "</div>";
  }

  /* ── start ─────────────────────────────────────────────────────────── */
  async function mount() {
    load();
    if (MODE === "tower") SNAP = await fetch("../seed-data/tower-snapshot.json").then(function (r) { return r.json(); }).catch(function () { return null; });
    build();
    if (MODE === "page") openChat();
    const b = document.getElementById("as-open");
    if (b) b.addEventListener("click", function () { openChat(); });
    if (MODE === "tower" && /[?&]chat=1/.test(location.search)) openChat();
    composeFor();
    loadBuilds();
    watchReady();
    watchBuild();   // v10: a build still running when the page was closed
    window.addEventListener("fb-upload", function () { save(); render(); });
    /* A reload mid-upload resumes: every file not in S3 yet (audio keeps the byte fallback) goes up once more. */
    if (OB.retry) S.papers.forEach(function (p) { if (!p.fileId && !/^audio\//.test(p.mime || "") && p.up !== "done" && p.up !== "unsupported") OB.retry(S, p.id); });
    /* What he sent while the page was away (a build waiting to go) leaves now. */
    OB.OUTBOX.all().then(function (list) { (list || []).forEach(function (b) { OB.deliver(X, b).then(loadBuilds, function () {}); }); }).catch(function () {});
  }
  window.FBAssistant = { mount: mount, open: function () { openChat(); }, _state: function () { return { S: S, F: F, msgs: msgs }; } };
})();
