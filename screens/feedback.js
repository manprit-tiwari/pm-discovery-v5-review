/* Assistant discovery · Give feedback (5 Oct 2026).

   The owner shares the published discovery with people and wants their feedback captured. It goes to the
   FoodBridge feedback store the v7 demo already uses (the bridge's POST /api/feedback — the owner's choice,
   5 Oct 2026): { rating 1–5, comment, name?, phone?, screen, version, at }.

   Honest delivery, as v7's exit-demo does it:
     200            saved → "Thank you — sent to FoodBridge."
     400            can never be saved (a bad rating) → dropped
     anything else  (503 not_configured: the store has no keys yet; offline; 5xx) → kept on this device and
                    sent on the next visit, and the tester is told exactly that.
   This is a discovery aid around the prototype, not part of the product. */
(function () {
  "use strict";

  const VERSION = "assistant-v8";
  const QUEUE = "fb.assistant.feedback.queue", LOG = "fb.assistant.feedback.log";
  const BRIDGE = "https://zoho-function-nu.vercel.app";
  const FACES = [["1", "😞", "Very poor"], ["2", "🙁", "Poor"], ["3", "😐", "Okay"], ["4", "🙂", "Good"], ["5", "😍", "Excellent"]];
  const esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };

  function base() {
    try { const b = localStorage.getItem("fb-api-base"); if (b) return b.replace(/\/+$/, ""); } catch (e) { /* private window */ }
    return BRIDGE;
  }
  function read(k) { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window */ } }

  /* Where he is: the screen, the question in hand, phone or computer. */
  function where() {
    const page = location.pathname.split("/").pop() || "index.html";
    let at = "";
    try { const st = window.FBAssistant && window.FBAssistant._state(); at = st && st.F && st.F.at ? " · " + st.F.at : ""; } catch (e) { /* not the chat */ }
    return (page.replace(".html", "") + at + " · " + (window.matchMedia("(min-width: 900px)").matches ? "desktop" : "phone")).slice(0, 120);
  }

  function post(entry) {
    return fetch(base() + "/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) })
      .then(function (r) { return r.status; }, function () { return 0; });
  }
  /* Send what waits: delivered or refused-for-good leaves the queue; anything else stays. */
  async function flush() {
    const q = read(QUEUE), keep = [];
    let sent = 0;
    for (const e of q) {
      const st = await post(e);
      if (st === 200) sent++;
      else if (st >= 400 && st < 500) { /* can never be saved */ }
      else keep.push(e);
    }
    write(QUEUE, keep);
    return { sent: sent, waiting: keep.length };
  }

  let wrap = null;
  function css() {
    if (document.getElementById("fbk-css")) return;
    const s = document.createElement("style");
    s.id = "fbk-css";
    s.textContent =
      ".fbk-wrap{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(11,20,26,.42);font-family:'Segoe UI',-apple-system,Roboto,sans-serif}" +
      ".fbk{width:min(460px,94vw);max-height:92vh;overflow:auto;background:#fff;border-radius:12px;box-shadow:0 17px 50px rgba(11,20,26,.25);color:#111B21}" +
      ".fbk h2{margin:0;padding:18px 22px 4px;font-size:18px;font-weight:600}.fbk p.s{margin:0;padding:0 22px 12px;color:#667781;font-size:14px}" +
      ".fbk .faces{display:flex;justify-content:space-between;gap:6px;padding:4px 22px 14px}.fbk .faces label{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 2px;border-radius:10px;cursor:pointer;font-size:11.5px;color:#667781;border:1.5px solid transparent}" +
      ".fbk .faces span{font-size:28px;line-height:1}.fbk .faces input{position:absolute;opacity:0}.fbk .faces label:has(input:checked){border-color:#00A884;background:#EFFAF6;color:#008069}" +
      ".fbk .faces label:has(input:focus-visible){outline:2px solid #027EB5}" +
      ".fbk .f{padding:0 22px 12px}.fbk .f label{display:block;font-size:13px;color:#54656F;margin-bottom:4px}" +
      ".fbk textarea,.fbk input[type=text],.fbk input[type=tel]{width:100%;box-sizing:border-box;border:1px solid #D1D7DB;border-radius:8px;padding:10px 12px;font:inherit;font-size:15px;color:#111B21}" +
      ".fbk textarea{min-height:96px;resize:vertical}.fbk textarea:focus,.fbk input:focus{outline:none;border-color:#00A884;box-shadow:0 0 0 2px rgba(0,168,132,.2)}" +
      ".fbk .row2{display:flex;gap:10px}.fbk .row2>div{flex:1}" +
      ".fbk .foot{display:flex;gap:10px;justify-content:flex-end;padding:6px 22px 18px}.fbk button{height:42px;padding:0 18px;border-radius:21px;font:600 15px/1 inherit;cursor:pointer}" +
      ".fbk .go{border:0;background:#00A884;color:#fff}.fbk .go:disabled{opacity:.45;cursor:default}.fbk .no{border:1px solid #D1D7DB;background:#fff;color:#008069}" +
      ".fbk .done{padding:28px 22px 22px;text-align:center}.fbk .done b{display:block;font-size:18px;margin:8px 0 6px}.fbk .done p{margin:0 0 16px;color:#667781;font-size:14px;line-height:20px}";
    document.head.appendChild(s);
  }
  function close() { if (wrap) { wrap.remove(); wrap = null; } }
  function open() {
    css(); close();
    wrap = document.createElement("div");
    wrap.className = "fbk-wrap";
    wrap.innerHTML = '<form class="fbk" role="dialog" aria-label="Give feedback">' +
      "<h2>How was it?</h2><p class=\"s\">Your feedback goes to the FoodBridge team. Tell us what worked and what didn't.</p>" +
      '<div class="faces" role="radiogroup" aria-label="Rating">' + FACES.map(function (f) {
        return '<label><input type="radio" name="r" value="' + f[0] + '"><span aria-hidden="true">' + f[1] + "</span>" + f[2] + "</label>";
      }).join("") + "</div>" +
      '<div class="f"><label for="fbk-c">What should we change? (optional)</label><textarea id="fbk-c" maxlength="1200" placeholder="Anything confusing, missing or great"></textarea></div>' +
      '<div class="f row2"><div><label for="fbk-n">Your name (optional)</label><input type="text" id="fbk-n" maxlength="80" autocomplete="name"></div>' +
        '<div><label for="fbk-p">Mobile (optional)</label><input type="tel" id="fbk-p" maxlength="14" autocomplete="tel" inputmode="tel"></div></div>' +
      '<div class="foot"><button type="button" class="no" data-x>Cancel</button><button type="submit" class="go" disabled>Send feedback</button></div></form>';
    document.body.appendChild(wrap);
    const form = wrap.querySelector("form"), go = wrap.querySelector(".go");
    form.addEventListener("change", function () { go.disabled = !form.querySelector("input[name=r]:checked"); });
    wrap.addEventListener("click", function (e) { if (e.target === wrap || e.target.closest("[data-x]")) close(); });
    wrap.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); close(); } });
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const r = form.querySelector("input[name=r]:checked");
      if (!r) return;
      const entry = { rating: Number(r.value), comment: form.querySelector("#fbk-c").value.trim(), name: form.querySelector("#fbk-n").value.trim(),
        phone: form.querySelector("#fbk-p").value.trim(), screen: where(), version: VERSION, at: new Date().toISOString() };
      write(LOG, read(LOG).concat([entry]).slice(-50));
      write(QUEUE, read(QUEUE).concat([entry]));
      go.disabled = true; go.textContent = "Sending…";
      const res = await flush();
      const ok = res.waiting === 0;
      form.innerHTML = '<div class="done"><span style="font-size:40px">' + (ok ? "🙏" : "🕓") + "</span><b>" + (ok ? "Thank you — sent to FoodBridge." : "Thank you — saved on this device.") + "</b><p>" +
        (ok ? "The team reads every one." : "FoodBridge couldn't take it just now, so it waits here and goes by itself the next time you open this page.") +
        '</p><button type="button" class="go" data-x>Close</button></div>';
    });
    setTimeout(function () { const f = wrap && wrap.querySelector("input[name=r]"); if (f) f.focus(); }, 30);
  }

  /* What an earlier visit couldn't send goes now. */
  if (read(QUEUE).length) setTimeout(flush, 1500);
  window.FBFeedback = { open: open, flush: flush, waiting: function () { return read(QUEUE).length; } };
})();
