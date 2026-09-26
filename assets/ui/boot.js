// Screen bootstrap (Addendum 006). Loads ../seed-data/seed.json and builds the same mock
// ApiClient the sandbox route would use, then mounts the screen inside a host-like content
// frame (storefront-frontend layout/Main.jsx's padding) — host chrome itself is not rendered.
//
// Screens are mounted the way the HOST mounts them (storefront-frontend/src/pages/*.jsx):
// showHeading={false}, onNotify wired to the host's toasts, currency from the host (₹ unless
// the Discovery panel sets another). Data is the sandbox's own seed.

const Boot = {
  seed: null,
  locationId: null,
  onNotify: (message, type) => K.notify(message, type),

  async start(seedKey, mount) {
    const res = await fetch("../seed-data/seed.json");
    this.seed = await res.json();
    this.locationId = this.seed.locationId;
    // v6 (Addendum 007): Finished Goods also reads catalogues (selection by catalogue, impact).
    const seed = seedKey === "finishedGoods" ? { ...this.seed.products, catalogues: this.seed.catalogues.catalogues } : this.seed[seedKey];
    const client = PM.createMockApiClient(Scenario.apply(seedKey, structuredClone(seed)));
    document.body.className = "bg-gray-50";
    document.body.innerHTML = `<main class="flex-1 overflow-y-auto overflow-x-hidden min-h-0"><div id="screen" class="w-full mx-auto px-3 sm:px-4 lg:px-6 pt-3 sm:pt-4"></div></main>`;
    DiscoveryPanel.mount();
    mount(client, document.getElementById("screen"));
  },
};

// Discovery-only knobs (NOT module UI): the host inputs the module reads, and seed scenarios
// for outcomes the plain sandbox seed never produces (e.g. a catalogue with customers
// assigned). Persisted in localStorage under the same keys the module itself reads.
const Scenario = {
  get() {
    try {
      return JSON.parse(localStorage.getItem("discovery.scenario") || "{}");
    } catch {
      return {};
    }
  },
  apply(seedKey, seed) {
    const sc = this.get();
    if ((seedKey === "catalogues" || seedKey === "finishedGoods") && sc.campaignRecipients) {
      seed.campaignRecipients = Object.fromEntries(
        seed.catalogues.map((c) => [c.id, Array.from({ length: 6 }, (_, i) => ({ id: `${c.id}-cust-${i + 1}`, name: `Customer ${i + 1}`, phone: `98765 4321${i}` }))]),
      );
    }
    if (sc.zohoSync) seed.zohoSync = ZohoScenarios[sc.zohoSync];
    return seed;
  },
};

// Outcomes the sandbox seed never produces, fed through the mock's own MockZohoSyncSeed
// contract (api-client/mock.ts) — discovery-only, not parity-checked against the sandbox.
const zohoItem = (outcome, i, extra = {}) => ({ outcome, zohoItemId: `z-${outcome}-${i}`, name: `Zoho item ${i}`, sku: `ZS-${i}`, articleNumber: outcome === "failed" ? null : `ZS-${i}`, productId: outcome === "created" || outcome === "updated" ? `sb-${i}` : null, reason: null, ...extra });
const ZohoScenarios = {
  "partial: 3 created, 2 updated, 2 failed": {
    progress: [{}, { status: "PARTIAL", itemsCreated: 3, itemsUpdated: 2, itemsFailed: 2 }],
    items: [1, 2, 3].map((i) => zohoItem("created", i)).concat([4, 5].map((i) => zohoItem("updated", i, { changedFields: ["price", "tax"] })), [6, 7].map((i) => zohoItem("failed", i, { reason: "INVALID_ZOHO_ITEM: rate" })), [8].map((i) => zohoItem("skipped", i, { reason: "ALREADY_SYNCED" }))),
  },
  "refused: Zoho not master": { start: { started: false, code: "ZOHO_NOT_MASTER", message: "not master" } },
  "refused: not configured": { start: { started: false, code: "ZOHO_NOT_CONFIGURED", message: "not configured" } },
  "running on page load": { latest: { jobId: "job-running", status: "RUNNING", cursor: "", itemsCreated: 0, itemsUpdated: 0, itemsFailed: 0, updatedAt: new Date().toISOString() }, progress: [{}, { status: "SYNCED", itemsCreated: 1 }], items: [zohoItem("created", 1)] },
  "last sync failed (rate limited)": { latest: { jobId: "job-failed", status: "FAILED", cursor: "", itemsCreated: 0, itemsUpdated: 0, itemsFailed: 0, errorCode: "ZOHO_RATE_LIMITED", errorMessage: "Rate limited", updatedAt: new Date().toISOString() } },
};

const DiscoveryPanel = {
  mount() {
    const ap = HostConfig.appProp() || {};
    let gs = {};
    try {
      gs = JSON.parse(localStorage.getItem("globalSetting") || "{}");
    } catch {}
    const sc = Scenario.get();
    PM.format.configureCurrency(localStorage.getItem("discovery.currency") || undefined);
    const box = document.createElement("details");
    box.id = "discovery-panel";
    box.style.cssText = "position:fixed;left:0;bottom:96px;z-index:30000;font:12px system-ui;background:#111827;color:#f9fafb;border-radius:8px;padding:6px 10px;max-width:320px;opacity:.9";
    const opt = (v, cur) => `<option value="${v}"${String(cur ?? "") === v ? " selected" : ""}>${v === "" ? "unset" : v}</option>`;
    box.innerHTML = `<summary style="cursor:pointer">Discovery controls (not module UI)</summary>
      <div style="display:grid;gap:6px;margin-top:8px">
        <label>Currency (host prop) <input id="dc-currency" style="color:#111;width:60px" value="${localStorage.getItem("discovery.currency") || ""}" placeholder="₹"></label>
        <label>appProp.supportedUnitIndexLevel <select id="dc-level" style="color:#111">${["", "0", "1", "2"].map((v) => opt(v, ap.supportedUnitIndexLevel)).join("")}</select></label>
        <label>appProp.priceCalculationUnitIndex <select id="dc-pci" style="color:#111">${["", "0", "1", "2"].map((v) => opt(v, ap.priceCalculationUnitIndex)).join("")}</select></label>
        <label><input type="checkbox" id="dc-zoho"${gs?.appProp?.productManagementFeatures?.zohoSyncEnabled === true ? " checked" : ""}> globalSetting…zohoSyncEnabled</label>
        <label><input type="checkbox" id="dc-recipients"${sc.campaignRecipients ? " checked" : ""}> seed: catalogues have customers</label>
        <label>seed: Zoho sync outcome <select id="dc-zohosync" style="color:#111">${["", ...Object.keys(ZohoScenarios)].map((v) => opt(v, sc.zohoSync)).join("")}</select></label>
        <button id="dc-apply" style="background:#16a34a;border-radius:4px;padding:2px 8px">Apply &amp; reload</button>
      </div>`;
    document.body.appendChild(box);
    box.querySelector("#dc-apply").onclick = () => {
      const level = box.querySelector("#dc-level").value;
      const pci = box.querySelector("#dc-pci").value;
      const nextAp = { ...ap };
      level === "" ? delete nextAp.supportedUnitIndexLevel : (nextAp.supportedUnitIndexLevel = Number(level));
      pci === "" ? delete nextAp.priceCalculationUnitIndex : (nextAp.priceCalculationUnitIndex = Number(pci));
      Object.keys(nextAp).length ? localStorage.setItem("appProp", JSON.stringify(nextAp)) : localStorage.removeItem("appProp");
      const zoho = box.querySelector("#dc-zoho").checked;
      const nextGs = { ...gs, appProp: { ...(gs.appProp || {}), productManagementFeatures: { ...(gs.appProp?.productManagementFeatures || {}), zohoSyncEnabled: zoho } } };
      localStorage.setItem("globalSetting", JSON.stringify(nextGs));
      const cur = box.querySelector("#dc-currency").value.trim();
      cur ? localStorage.setItem("discovery.currency", cur) : localStorage.removeItem("discovery.currency");
      localStorage.setItem("discovery.scenario", JSON.stringify({ campaignRecipients: box.querySelector("#dc-recipients").checked, zohoSync: box.querySelector("#dc-zohosync").value || undefined }));
      location.reload();
    };
  },
};
