/* Assistant discovery · a stand-in for the Digital Assistant's build progress (v10, addendum-019). DISCOVERY ONLY:
   production asks the chat backend, which has it from the assistant's real writes (chat-app SSOT-7). Here the steps are
   played from his own answers (the plan the page hands in at Create), on a clock, so both looks can be seen end to end.
   Products from a file: the assistant counts what it reads; the stand-in says 17 a file (the sample rate list).
   Demo switches on the page's URL: ?wait (a slow step: "taking longer"), ?team (it stops in the middle of products: the team finishes). */
(function (root) {
  const OB = root.FB_OUTBOX;
  if (!OB) return;
  const q = new URLSearchParams(location.search);
  const SLOW = q.has("wait"), TEAM = q.has("team");
  const STEP_S = 5;   // seconds a step runs, here

  OB.progress = function (id, plan) {
    if (!plan || !plan.at) return Promise.resolve(null);
    let t = (Date.now() - plan.at) / 1000;
    const todo = [
      { id: "store", count: 1 },
      { id: "products", count: plan.products || 0 },
      { id: "customers", count: plan.customers || 0, notAdded: plan.notAdded.customers },
      { id: "suppliers", count: plan.suppliers || 0, notAdded: plan.notAdded.suppliers },
      { id: "staff", count: plan.staff || 0, notAdded: plan.notAdded.staff },
    ];
    const steps = [];
    let state = "running", waits = 0;
    for (const s of todo) {
      const len = !s.count && !(s.notAdded || []).length && s.id !== "store" ? 0 : STEP_S + (SLOW && s.id === "products" ? 12 : 0);
      if (TEAM && s.id === "products" && t >= 3) { steps.push({ id: "products", state: "running", count: plan.products || 3 }); state = "team"; break; }   // v10.1: stops mid products
      if (t < len) {
        steps.push({ id: s.id, state: "running" });
        if (SLOW && s.id === "products" && t > STEP_S) { state = "waiting"; waits = 1; }
        break;
      }
      t -= len;
      steps.push(len ? { id: s.id, state: "done", count: s.count, notAdded: s.notAdded || [] } : { id: s.id, state: "none" });
    }
    if (steps.length === todo.length && steps[steps.length - 1].state !== "running") state = "done";
    const ready = steps[0] && steps[0].state === "done";
    /* no real link in discovery (SSOT-7 v4 §4: nothing stands in for a login link) — the page shows the button, going nowhere */
    return Promise.resolve({ id: id, state: state, waits: waits, link: ready ? "#demo-store" : "", steps: steps });
  };
})(typeof window !== "undefined" ? window : globalThis);
