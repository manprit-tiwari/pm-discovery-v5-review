// Port of components/ProductListShell.tsx and everything it mounts (Addendum 006):
// useProductListController, useBulkEditController, useBulkRecategorizeController,
// useBulkTagController, useZohoSyncController, BulkEditPriceCells, MobileProductCards,
// MobileCategoryChips, ExportDropdown, ImportButton, ImportModal, ZohoSyncResultsModal,
// RecategorizeDrawer, TagAssignmentDrawer (+ ProductDrawer/AddCategoryModal in product-drawer.js).
// One shell for both screens — catalogueType "DEFAULT" (Products) or "RAW-MATERIAL".

const PL_PAGE_SIZE = 20;
function mountProductList(api, locationId, el, catalogueType, onNotify) {
  const isRaw = catalogueType === "RAW-MATERIAL";
  const title = isRaw ? "Raw Materials" : "Products";
  const detailPath = (id) => (isRaw ? `product-detail.html?type=raw&id=${encodeURIComponent(id)}` : `product-detail.html?id=${encodeURIComponent(id)}`);

  // ---- useProductListController ----------------------------------------------------------
  const S = {
    items: [], products: [], totalDoc: 0, isLoading: true, error: null, categoryOptions: [], searchInput: "", searchDraft: "", category: undefined,
    availableTags: [], tag: undefined, currentPage: 1, checkedIds: [], pendingDelete: null, drawerOpen: false, importParsed: null, isExporting: false,
  };
  let seq = 0;
  async function load() {
    const my = ++seq;
    S.isLoading = true;
    K.update();
    try {
      const [list, tree, demand, tags] = await Promise.all([
        api.listProducts(locationId, { catalogueType, category: S.category, title: S.searchInput || undefined, tag: S.tag, page: S.currentPage, limit: PL_PAGE_SIZE }),
        api.listCategories(locationId),
        api.getStockDemand(locationId),
        api.listProductTags(locationId),
      ]);
      if (my !== seq) return;
      const names = PM.mapProduct.categoryNameMap(tree);
      S.items = list.products.map((p) => PM.mapProduct.mapProductToListItem(p, isRaw, names, demand));
      S.products = list.products;
      S.totalDoc = list.totalDoc;
      S.categoryOptions = PM.mapProduct.mapCategoryTreeToOptions(tree);
      S.availableTags = tags;
      S.checkedIds = [];
      S.isLoading = false;
      S.error = null;
    } catch (err) {
      if (my !== seq) return;
      S.isLoading = false;
      S.error = err;
      onNotify(`Something went wrong: ${err.message}`, "error");
    }
    K.update();
  }
  const refresh = () => load();
  const setPage = (p) => ((S.currentPage = p), load());
  async function createCategory(name, parentCategoryReference, description, icon) {
    const created = await api.createCategory(locationId, { name, parentCategoryReference, description, icon });
    S.categoryOptions = PM.mapProduct.mapCategoryTreeToOptions(await api.listCategories(locationId));
    return created;
  }

  // ---- useBulkEditController ------------------------------------------------------------
  const BE = { isActive: false, isSaving: false, drafts: {}, unitTriples: [], rowTarget: null };
  const bpe = PM.bulkPriceEdit;
  const bulkEdit = {
    begin(ids) {
      BE.isActive = true;
      const sel = new Set(ids);
      BE.drafts = Object.fromEntries(S.products.filter((p) => sel.has(p.id)).map((p) => [p.id, bpe.createProductEditDraft(p)]));
      api.getUnitOptions(locationId).then((u) => ((BE.unitTriples = Object.values(u)), K.update())).catch(() => {});
    },
    toggleRow(product, checked) {
      if (checked) {
        if (!BE.drafts[product.id]) BE.drafts = { ...BE.drafts, [product.id]: bpe.createProductEditDraft(product) };
      } else if (BE.drafts[product.id]) {
        const next = { ...BE.drafts };
        delete next[product.id];
        BE.drafts = next;
      }
    },
    selectAll(checked) {
      BE.drafts = checked ? Object.fromEntries(S.products.map((p) => [p.id, bpe.createProductEditDraft(p)])) : {};
    },
    set(id, field, value) {
      if (BE.drafts[id]) BE.drafts = { ...BE.drafts, [id]: { ...BE.drafts[id], [field]: value } };
    },
    resync(product, o) {
      const cur = BE.drafts[product.id];
      if (!cur) return;
      const eff = bpe.getEffectiveProductForDraft(product, cur);
      const map = bpe.deriveUnitPriceMapFromEntry(eff, o.unitIndex ?? cur.unitIndex, o.taxType ?? cur.taxType, o.taxRate ?? cur.taxRate, o.price ?? cur.price);
      if (map) BE.drafts = { ...BE.drafts, [product.id]: { ...cur, priceMapExclusive: map } };
    },
    unitChange(product, unitIndex) {
      const cur = BE.drafts[product.id];
      if (!cur) return;
      const eff = bpe.getEffectiveProductForDraft(product, cur);
      const suggested = bpe.getSuggestedPriceForUnit(eff, unitIndex, cur.taxType, cur.taxRate, cur.priceMapExclusive);
      bulkEdit.set(product.id, "unitIndex", unitIndex);
      bulkEdit.set(product.id, "price", suggested);
    },
    priceInput(product, raw) {
      const v = Number(raw);
      bulkEdit.set(product.id, "price", Number.isFinite(v) ? v : 0);
      bulkEdit.resync(product, { price: Number.isFinite(v) ? v : undefined });
    },
    taxType(product, t) {
      bulkEdit.set(product.id, "taxType", t);
      bulkEdit.resync(product, { taxType: t });
    },
    taxRate(product, r) {
      bulkEdit.set(product.id, "taxRate", r);
      bulkEdit.resync(product, { taxRate: r });
    },
    applyModal(product, payload) {
      const cur = BE.drafts[product.id] ?? bpe.createProductEditDraft(product);
      BE.drafts = { ...BE.drafts, [product.id]: bpe.applyUnitModalResultToDraft(product, cur, payload) };
    },
    cancel() {
      Object.assign(BE, { isActive: false, unitTriples: [], drafts: {} });
    },
    async save() {
      const items = S.products
        .map((p) => {
          const d = BE.drafts[p.id];
          if (!d) return null;
          const fields = bpe.buildBulkEditFields(p, d);
          return fields ? { id: p.id, name: p.name, articleNumber: p.articleNumber, ...fields } : null;
        })
        .filter(Boolean);
      if (items.length === 0) return bulkEdit.cancel(), [];
      BE.isSaving = true;
      K.update();
      try {
        const r = await api.bulkEditProducts(items);
        bulkEdit.cancel();
        return r;
      } finally {
        BE.isSaving = false;
      }
    },
  };

  // ---- useBulkRecategorizeController + useBulkTagController ---------------------------------
  const RC = { isOpen: false, isSaving: false, targets: [], categoryReference: "", addOpen: false };
  const TG = { isOpen: false, isSaving: false, products: [], categoryNameById: {}, selectedIds: [], page: 1, hasMore: true, loadingMore: false, openSeq: 0 };
  const unionTags = (existing, additions) => {
    const r = [...(existing ?? [])];
    for (const t of additions) if (!r.some((x) => x.toLowerCase() === t.toLowerCase())) r.push(t);
    return r;
  };
  const bulkTag = {
    open(ids) {
      Object.assign(TG, { isOpen: true, selectedIds: ids, page: 1, hasMore: true, openSeq: TG.openSeq + 1 });
      K.drop("tag-assign");
      api.listProducts(locationId, { page: 1, limit: 20 }).then(({ products, totalDoc }) => ((TG.products = products), (TG.hasMore = products.length < totalDoc), K.update())).catch(() => {});
      api.listCategories(locationId).then((t) => ((TG.categoryNameById = PM.mapProduct.categoryNameMap(t)), K.update())).catch(() => {});
    },
    async loadMore() {
      if (!TG.hasMore || TG.loadingMore) return;
      TG.loadingMore = true;
      K.update();
      try {
        const next = TG.page + 1;
        const { products, totalDoc } = await api.listProducts(locationId, { page: next, limit: 20 });
        const seen = new Set(TG.products.map((p) => p.id));
        TG.products = [...TG.products, ...products.filter((p) => !seen.has(p.id))];
        TG.page = next;
        TG.hasMore = next * 20 < totalDoc;
      } finally {
        TG.loadingMore = false;
        K.update();
      }
    },
    cancel() {
      Object.assign(TG, { isOpen: false, products: [], selectedIds: [] });
    },
    async confirm(finalIds, names) {
      TG.isSaving = true;
      K.update();
      try {
        const byId = new Map(TG.products.map((p) => [p.id, p]));
        const missing = finalIds.filter((x) => !byId.has(x));
        if (missing.length) for (const p of await Promise.all(missing.map((x) => api.getProduct(x)))) if (p) byId.set(p.id, p);
        const items = finalIds.map((x) => byId.get(x)).filter(Boolean).map((p) => ({ id: p.id, name: p.name, articleNumber: p.articleNumber, tags: unionTags(p.tags, names) }));
        const r = await api.bulkEditProducts(items);
        Object.assign(TG, { isOpen: false, products: [], selectedIds: [] });
        return r;
      } finally {
        TG.isSaving = false;
      }
    },
  };

  // ---- useZohoSyncController -----------------------------------------------------------
  let zohoEnabled = false;
  try {
    zohoEnabled = !isRaw && JSON.parse(localStorage.getItem("globalSetting") || "null")?.appProp?.productManagementFeatures?.zohoSyncEnabled === true;
  } catch {}
  const Z = { status: null, lastFinished: null, localPhase: "idle", generation: 0, timer: null, resultsOpen: false };
  const REFUSAL = {
    SYNC_IN_PROGRESS: "A Zoho sync is already running for this location",
    NO_BASELINE: "Run the Zoho item backfill for this location first",
    ZOHO_NOT_CONFIGURED: "Zoho is not configured for this location",
    ZOHO_NOT_MASTER: "Zoho sync is not enabled for this location. Contact your administrator to turn it on.",
  };
  const zoho = {
    stop() {
      Z.generation++;
      clearTimeout(Z.timer);
      Z.timer = null;
    },
    follow(jobId) {
      zoho.stop();
      const mine = Z.generation;
      let errors = 0;
      const poll = async () => {
        try {
          const next = await api.getZohoSyncStatus(locationId, jobId);
          if (Z.generation !== mine) return;
          errors = 0;
          Z.status = next;
          K.update();
          if (next.status === "RUNNING") return (Z.timer = setTimeout(poll, 3000));
          Z.lastFinished = next;
          const view = PM.zohoSyncStatus.toZohoSyncStatusView(next, "idle");
          onNotify(view.message, next.status === "SYNCED" ? "success" : "error");
          if (next.itemsCreated > 0) refresh();
        } catch {
          if (Z.generation !== mine) return;
          if (++errors < 3) return (Z.timer = setTimeout(poll, 3000));
          Z.status = null;
          onNotify("Lost track of the Zoho sync — refresh the page to check its result", "error");
          K.update();
        }
      };
      Z.timer = setTimeout(poll, 3000);
    },
    view: () => PM.zohoSyncStatus.toZohoSyncStatusView(Z.status, Z.localPhase),
    async start() {
      if (!zohoEnabled || zoho.view().isBusy) return;
      Z.localPhase = "starting";
      Z.status = null;
      K.update();
      try {
        const r = await api.startZohoSync(locationId);
        if (r.started) {
          zoho.follow(r.jobId);
          Z.status = { jobId: r.jobId, status: "RUNNING", cursor: "", itemsCreated: 0, itemsUpdated: 0, itemsFailed: 0, updatedAt: new Date().toISOString() };
          return;
        }
        onNotify(REFUSAL[r.code], "error");
        if (r.code === "SYNC_IN_PROGRESS" && r.jobId) zoho.follow(r.jobId);
      } catch (err) {
        onNotify(err instanceof Error ? err.message : "Could not start the Zoho sync", "error");
      } finally {
        Z.localPhase = "idle";
        K.update();
      }
    },
  };
  if (zohoEnabled)
    api.getLatestZohoSync(locationId).then((latest) => {
      if (!latest) return;
      if (latest.status === "RUNNING") {
        Z.status = latest;
        zoho.follow(latest.jobId);
      } else Z.lastFinished = latest;
      K.update();
    }).catch(() => {});
  const zohoSlot = () => (zohoEnabled ? { isBusy: zoho.view().isBusy, onSync: () => zoho.start(), onViewResults: Z.lastFinished ? () => (Z.resultsOpen = true) : undefined } : undefined);

  // ---- handlers --------------------------------------------------------------------------
  const applySearch = K.debounce((v) => ((S.searchInput = v), (S.currentPage = 1), load()), 400);
  const H = (name, fn) => (K.on[`pl.${name}`] = fn);
  H("search", (_, ev) => ((S.searchDraft = ev.target.value), applySearch(S.searchDraft)));
  H("category", (_, ev) => ((S.category = ev.target.value || undefined), (S.currentPage = 1), load()));
  H("chip", (id) => ((S.category = id || undefined), (S.currentPage = 1), load()));
  H("tag", (t) => ((S.tag = S.tag === t ? undefined : t), (S.currentPage = 1), load()));
  H("tagAll", () => ((S.tag = undefined), (S.currentPage = 1), load()));
  H("checkAll", (_, ev) => (BE.isActive ? bulkEdit.selectAll(ev.target.checked) : (S.checkedIds = S.checkedIds.length === S.items.length ? [] : S.items.map((i) => i.id))));
  H("check", (id, ev) => {
    if (BE.isActive) {
      const p = S.products.find((x) => x.id === id);
      if (p) return bulkEdit.toggleRow(p, ev.target.checked);
    }
    S.checkedIds = S.checkedIds.includes(id) ? S.checkedIds.filter((x) => x !== id) : [...S.checkedIds, id];
  });
  H("add", () => openDrawer(undefined));
  H("edit", (id) => openDrawer(id));
  H("delete", (arg) => {
    const i = arg.indexOf("|");
    S.pendingDelete = { kind: "single", id: arg.slice(0, i), name: arg.slice(i + 1) };
  });
  H("beCancel", () => bulkEdit.cancel());
  H("beSave", async () => {
    try {
      const r = await bulkEdit.save();
      if (r.length > 0) {
        const ok = r.filter((x) => x.status === "ok").length;
        const bad = r.length - ok;
        bad === 0 ? onNotify(`${ok} product${ok === 1 ? "" : "s"} updated`, "success") : onNotify(`${ok} updated, ${bad} failed`, "error");
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Update failed", "error");
    }
    refresh();
  });
  const productOf = (id) => S.products.find((p) => p.id === id);
  H("beUnit", (id, ev) => bulkEdit.unitChange(productOf(id), Number(ev.target.value)));
  H("bePrice", (id, ev) => bulkEdit.priceInput(productOf(id), ev.target.value));
  H("beTaxType", (arg) => {
    const [id, t] = arg.split("|");
    bulkEdit.taxType(productOf(id), t);
  });
  H("beTaxRate", (id, ev) => bulkEdit.taxRate(productOf(id), Number(ev.target.value)));
  H("beModal", (id) => (BE.rowTarget = productOf(id) ?? null));

  function openDrawer(productId) {
    S.drawerOpen = true;
    openProductDrawer("product-drawer", {
      apiClient: api, locationId, catalogueType, productId,
      onClose: () => (S.drawerOpen = false),
      onNotify,
      onSaved: (product) => {
        onNotify(productId ? `${product.name} updated` : `${product.name} added`, "success");
        S.drawerOpen = false;
        refresh();
      },
    });
  }

  // ---- ExportDropdown -------------------------------------------------------------------
  async function handleExport(format) {
    S.isExporting = format;
    K.update();
    try {
      const [exported, tree] = await Promise.all([api.exportProducts(locationId, { catalogueType, category: S.category, title: S.searchInput || undefined }), api.listCategories(locationId)]);
      const base = title.toLowerCase().replace(/\s+/g, "-");
      if (format === "excel") {
        const { header, rows } = PM.productCsv.productsToExportRows(exported, tree);
        K.download(`${base}.xlsx`, PM.excel.rowsToExcelBlob(header, rows));
      } else K.download(`${base}.csv`, new Blob([PM.productCsv.productsToCsv(exported, tree)], { type: "text/csv;charset=utf-8;" }));
    } finally {
      S.isExporting = false;
      K.update();
    }
  }
  function ExportDropdown(id, mobile) {
    const s = K.state(id, { open: false, top: 0, left: 0 });
    const disabled = S.isExporting !== false;
    if (s.open) K.onEscape(() => (s.open = false));
    const label = S.isExporting ? `Exporting ${S.isExporting === "excel" ? "Excel" : "CSV"}…` : "Export";
    const item = (fmt, iconHtml, text) => `<li><button type="button" data-testid="${id}-${fmt}-btn" data-on-click="pl.export|${id}|${fmt}" class="w-full flex items-center gap-3 whitespace-nowrap px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700 transition">${iconHtml}${text}</button></li>`;
    const menu = s.open ? K.portal(`${id}:menu`, `<div class="fixed inset-0 z-[9998]" data-on-click="pl.exportClose|${id}"></div><ul style="position:fixed;top:${s.top}px;left:${s.left}px${mobile ? ";transform:translateY(-100%)" : ""}" class="z-[9999] w-56 overflow-hidden rounded-md bg-white shadow-lg border border-gray-100 dark:bg-gray-800 dark:border-gray-700 focus:outline-none">${item("excel", K.icon("FileSpreadsheet", "w-4 h-4 text-green-600"), "Export to Excel")}${item("csv", K.icon("FileText", "w-4 h-4"), "Export to CSV")}</ul>`) : "";
    return mobile
      ? `<div class="relative"><button type="button" title="Export" data-testid="${id}-btn" data-on-click="pl.exportToggle|${id}|m"${K.attr("disabled", disabled)} class="group flex min-w-0 w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-50">${K.icon("FiUpload", "h-5 w-5 text-gray-600 dark:text-gray-300")}<span class="max-w-full truncate text-[10px] font-medium text-gray-600 dark:text-gray-300">${label}</span></button>${menu}</div>`
      : `<div class="relative"><button type="button" data-testid="${id}-btn" data-on-click="pl.exportToggle|${id}|d"${K.attr("disabled", disabled)} class="border text-sm flex justify-center items-center h-10 px-4 bg-white hover:bg-gray-100 border-gray-200 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 cursor-pointer rounded-md disabled:opacity-50">${K.icon("FiUpload", "mr-2")}${label}</button>${menu}</div>`;
  }
  H("exportToggle", (arg, ev, el) => {
    const [id, m] = arg.split("|");
    const s = K.state(id);
    if (S.isExporting !== false) return;
    const r = el.getBoundingClientRect();
    Object.assign(s, m === "m" ? { top: r.top - 8, left: r.left } : { top: r.bottom + 4, left: r.left });
    s.open = !s.open;
  });
  H("exportClose", (id) => (K.state(id).open = false));
  H("export", (arg) => {
    const [id, fmt] = arg.split("|");
    K.state(id).open = false;
    handleExport(fmt);
  });

  // ---- ImportButton ---------------------------------------------------------------------
  function ImportButton(id, mobile) {
    const s = K.state(id, { open: false, top: 0, left: 0, file: null, isParsing: false, parseError: null, isSampleOpen: false });
    const zs = zohoSlot();
    if (s.open) K.onEscape(() => importClose(id));
    const trigger = mobile
      ? `<button type="button" title="Import" data-testid="${id}-btn" data-on-click="pl.importToggle|${id}|m" data-import-trigger="${id}" class="group flex min-w-0 w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition">${K.icon("FiDownload", "h-5 w-5 text-gray-600 dark:text-gray-300")}<span class="max-w-full truncate text-[10px] font-medium text-gray-600 dark:text-gray-300">Import</span></button>`
      : `<button type="button" data-testid="${id}-btn" data-on-click="pl.importToggle|${id}|d" data-import-trigger="${id}" class="border text-sm flex justify-center items-center h-10 px-4 bg-white hover:bg-gray-100 border-gray-200 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 cursor-pointer rounded-md">${K.icon("FiDownload", "mr-2")}Import</button>`;
    const popup = !s.open ? "" : K.portal(`${id}:popup`, `<div data-on-outside="pl.importOutside|${id}" style="position:fixed;top:${s.top}px;left:${s.left}px${mobile ? ";transform:translateY(-100%)" : ""}" class="z-[9999] w-56 rounded-lg bg-white shadow-2xl dark:bg-gray-800 focus:outline-none" data-testid="${id}-popup"><div class="px-4 py-2">
      <div class="h-10 rounded-md border border-dashed transition-colors duration-300 ${s.file ? "border-green-500" : "border-gray-300 dark:border-gray-600"}">
        <input type="file" accept=".csv,.xls,.xlsx,text/csv" class="hidden" data-testid="${id}-file-input" data-on-change="pl.importFile|${id}">
        <div role="button" tabindex="0" class="flex h-10 w-full cursor-pointer items-center justify-center rounded-md text-xs leading-none dark:text-gray-400" data-on-click="pl.importPick|${id}">${s.file
          ? `<span class="flex w-full items-center justify-between px-2"><span class="overflow-hidden text-ellipsis whitespace-nowrap">${K.esc(s.file.name)}</span><button type="button" aria-label="Clear selected file" data-on-click="pl.importClear|${id}" class="ml-2 shrink-0 text-red-500">${K.icon("FiXCircle")}</button></span>`
          : `<span class="flex items-center text-gray-500 dark:text-gray-400">${K.icon("FiUploadCloud", "mx-2 text-green-500 dark:text-gray-400")}Select ${title} File</span>`}</div>
      </div>
      ${s.parseError ? `<p class="mt-2 text-xs text-red-600" data-testid="${id}-error">${K.esc(s.parseError)}</p>` : ""}
      ${s.file ? `<div class="mt-3 flex justify-center"><button type="button" data-on-click="pl.importParse|${id}"${K.attr("disabled", s.isParsing)} data-testid="${id}-popup-import-btn" class="h-9 rounded-md bg-green-500 px-4 text-xs font-semibold text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60">${s.isParsing ? "Parsing…" : "+ Import"}</button></div>` : ""}
      <div class="mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
        <button type="button" data-testid="${id}-sample-toggle-btn" data-on-click="pl.importSampleToggle|${id}" class="flex h-9 w-full items-center px-1 text-left text-xs font-medium text-gray-600 transition hover:text-emerald-600 dark:text-gray-300 dark:hover:text-emerald-400">${K.icon("FiDownload", "mr-2 h-3.5 w-3.5 text-emerald-500")}Download Sample File</button>
        ${s.isSampleOpen ? `<ul class="mt-1 w-full rounded-md border border-gray-100 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 focus:outline-none">
          <li class="border-b border-gray-100 py-2 pl-4 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-green-500 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"><button type="button" data-testid="${id}-sample-excel-btn" data-on-click="pl.importSample|${id}|excel" class="w-full text-left focus:outline-none"><span class="flex items-center text-xs">${K.icon("FileSpreadsheet", "mr-3 h-4 w-4 text-green-600").replace("<svg", '<svg aria-hidden="true"')}Download Excel Sample</span></button></li>
          <li class="py-2 pl-4 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-green-500 dark:text-gray-400 dark:hover:bg-gray-700"><button type="button" data-testid="${id}-sample-csv-btn" data-on-click="pl.importSample|${id}|csv" class="w-full text-left focus:outline-none"><span class="flex items-center text-xs">${K.icon("FileText", "mr-3 h-4 w-4").replace("<svg", '<svg aria-hidden="true"')}Download CSV Sample</span></button></li>
        </ul>` : ""}
      </div>
      ${zs ? `<div class="mt-2 border-t border-gray-100 pt-2 dark:border-gray-700">
        <button type="button" data-testid="${id}-zoho-sync-btn"${K.attr("disabled", zs.isBusy)} data-on-click="pl.zohoSync|${id}" class="flex h-9 w-full items-center px-1 text-left text-xs font-medium text-gray-600 transition hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-60 dark:text-gray-300 dark:hover:text-emerald-400">${K.icon("FiRefreshCw", `mr-2 h-3.5 w-3.5 text-emerald-500${zs.isBusy ? " animate-spin" : ""}`)}${zs.isBusy ? "Syncing…" : "Sync from Zoho"}</button>
        ${zs.onViewResults ? `<button type="button" data-testid="${id}-zoho-results-btn" data-on-click="pl.zohoResults|${id}" class="flex h-9 w-full items-center px-1 text-left text-xs font-medium text-gray-600 transition hover:text-emerald-600 dark:text-gray-300 dark:hover:text-emerald-400">${K.icon("FiList", "mr-2 h-3.5 w-3.5 text-emerald-500")}View last Zoho sync</button>` : ""}
      </div>` : ""}
    </div></div>`);
    return `<div class="relative">${trigger}${popup}</div>`;
  }
  function importClose(id) {
    Object.assign(K.state(id), { open: false, file: null, parseError: null, isSampleOpen: false });
  }
  H("importToggle", (arg, ev, el) => {
    const [id, m] = arg.split("|");
    const s = K.state(id);
    if (s.open) return importClose(id);
    const r = el.getBoundingClientRect();
    Object.assign(s, m === "m" ? { top: r.top - 8, left: Math.max(8, Math.min(r.left, window.innerWidth - 232)) } : { top: r.bottom + 6, left: r.left });
    s.open = true;
  });
  H("importOutside", (id, ev) => {
    if (ev.target.closest(`[data-import-trigger="${id}"]`)) return;
    importClose(id);
  });
  H("importPick", (id, ev, el) => el.parentElement.querySelector('input[type="file"]').click());
  H("importFile", (id, ev) => {
    const s = K.state(id);
    s.file = ev.target.files?.[0] ?? null;
    s.parseError = null;
    ev.target.value = "";
  });
  H("importClear", (id) => Object.assign(K.state(id), { file: null, parseError: null }));
  H("importSampleToggle", (id) => (K.state(id).isSampleOpen = !K.state(id).isSampleOpen));
  H("importSample", (arg) => {
    const [id, fmt] = arg.split("|");
    const { header, rows } = PM.importSample.sampleImportRow(isRaw);
    const base = `${isRaw ? "raw-materials" : "products"}_sample`;
    if (fmt === "excel") K.download(`${base}.xlsx`, PM.excel.rowsToExcelBlob(header, rows));
    else K.download(`${base}.csv`, new Blob([PM.csv.toCsv([header, ...rows])], { type: "text/csv;charset=utf-8;" }));
    K.state(id).isSampleOpen = false;
  });
  H("importParse", async (id) => {
    const s = K.state(id);
    if (!s.file) return;
    s.isParsing = true;
    s.parseError = null;
    K.update();
    try {
      const lower = s.file.name.toLowerCase();
      const result = lower.endsWith(".xls") || lower.endsWith(".xlsx") ? await PM.excel.readExcelFile(s.file) : PM.csv.csvToRecords(await K.readText(s.file));
      if (result.headers.length === 0 || result.records.length === 0) return (s.parseError = "File is empty or invalid.");
      S.importParsed = { fileName: s.file.name, ...result };
      K.drop("import-modal");
      importClose(id);
    } catch {
      s.parseError = "Failed to parse file. Please check the file format.";
    } finally {
      s.isParsing = false;
      K.update();
    }
  });
  H("zohoSync", (id) => (importClose(id), zoho.start()));
  H("zohoResults", (id) => (importClose(id), (Z.resultsOpen = true), K.drop("zoho-results")));

  // ---- ImportModal ----------------------------------------------------------------------
  function ImportModal() {
    const parsed = S.importParsed;
    if (!parsed) return "";
    const s = K.state("import-modal", () => ({ records: parsed.records, isEditing: false, snapshot: null, isImporting: false }));
    const cur = s.records ?? parsed.records;
    const v = PM.productCsv.validateProductRecords(parsed.headers, cur);
    const valid = v.rows.filter((r) => r.errors.length === 0);
    const invalid = v.rows.filter((r) => r.errors.length > 0);
    return `<div class="fixed inset-0 z-[10000] flex items-end bg-black bg-opacity-50 p-2 sm:items-center sm:justify-center sm:p-4" data-on-click="pl.imClose"><div class="max-h-[90vh] w-full overflow-hidden rounded-t-2xl bg-white dark:bg-gray-800 flex flex-col sm:max-w-6xl sm:rounded-2xl" data-on-click="noop" role="dialog" aria-modal="true" data-testid="import-modal">
      <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700 sm:px-6 sm:py-4"><div class="flex items-center gap-3"><h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">Preview Import</h2>
        ${cur.length > 0 ? `<button type="button" data-testid="import-preview-edit-btn"${K.attr("disabled", s.isImporting)} data-on-click="pl.imEdit" class="flex items-center text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm">${K.icon("FiEdit2", "mr-1 h-4 w-4")}${s.isEditing ? "Cancel Edit" : "Edit"}</button>` : ""}</div>
        <button type="button" data-on-click="pl.imClose" aria-label="Close" class="text-gray-400 hover:text-gray-600">${K.icon("FiX", "h-5 w-5")}</button></div>
      <div class="flex-1 overflow-hidden px-3 py-3 sm:px-6 sm:py-4 flex flex-col" data-testid="import-preview">
        <div class="mb-3 space-y-2 text-sm">
          ${v.missingRequiredColumns.length > 0 ? `<p class="text-red-600" data-testid="import-missing-columns">Missing required column${v.missingRequiredColumns.length > 1 ? "s" : ""}: ${K.esc(v.missingRequiredColumns.join(", "))}</p>` : ""}
          ${v.unrecognizedColumns.length > 0 ? `<p class="text-amber-600" data-testid="import-unrecognized-columns">Unrecognized column${v.unrecognizedColumns.length > 1 ? "s" : ""} (ignored): ${K.esc(v.unrecognizedColumns.join(", "))}</p>` : ""}
          <p class="text-gray-700 dark:text-gray-300"><span data-testid="import-valid-count">${valid.length}</span> row${valid.length === 1 ? "" : "s"} ready to import${invalid.length > 0 ? `, <span class="text-red-600" data-testid="import-invalid-count">${invalid.length}</span> with errors (skipped)` : ""}</p>
        </div>
        <div class="min-h-0 flex-1 overflow-auto rounded-xl border border-gray-200 dark:border-gray-700"><table class="min-w-max text-xs sm:text-sm">
          <thead class="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900"><tr class="border-b dark:border-gray-700"><th class="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">#</th>${parsed.headers.map((h) => `<th class="whitespace-nowrap px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">${K.esc(h)}</th>`).join("")}</tr></thead>
          <tbody>${cur.map((rec, idx) => {
            const errs = v.rows[idx]?.errors ?? [];
            return `<tr class="border-t transition-colors dark:border-gray-700 ${errs.length > 0 ? "bg-red-50/60 dark:bg-red-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-700/40"}"><td class="whitespace-nowrap px-3 py-2 text-gray-500">${idx + 1}</td>${parsed.headers.map((h) => `<td class="min-w-[120px] whitespace-nowrap px-3 py-2">${s.isEditing ? `<input class="h-8 w-full rounded border border-gray-200 px-2 text-xs dark:border-gray-600 dark:bg-gray-900 sm:text-sm" value="${K.esc(rec[h] ?? "")}" data-on-input="pl.imCell|${idx}|${K.esc(h)}" data-testid="import-preview-cell-${idx}-${K.esc(h)}">` : K.esc(rec[h])}</td>`).join("")}</tr>`;
          }).join("")}</tbody></table></div>
        ${invalid.length > 0 && !s.isEditing ? `<ul class="mt-2 max-h-24 overflow-y-auto rounded-md border border-red-100 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/10">${invalid.map((r) => `<li>Row ${r.rowNumber}: ${K.esc(r.errors.join("; "))}</li>`).join("")}</ul>` : ""}
      </div>
      <div class="flex-shrink-0 border-t bg-gray-50 dark:border-gray-700 dark:bg-gray-900"><div class="flex items-center justify-end gap-2 px-3 py-3 sm:gap-3 sm:px-6">
        <button type="button" data-on-click="pl.imClose"${K.attr("disabled", s.isImporting)} data-testid="import-preview-cancel-btn" class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 sm:px-5 sm:text-sm">Cancel</button>
        ${s.isEditing ? `<button type="button" data-on-click="pl.imSave" data-testid="import-preview-save-btn" class="rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-700 sm:px-5 sm:text-sm">Save</button>`
          : `<button type="button" data-on-click="pl.imConfirm"${K.attr("disabled", valid.length === 0 || v.missingRequiredColumns.length > 0 || s.isImporting)} data-testid="import-confirm-btn" class="rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:text-sm">${s.isImporting ? "Importing…" : `Import ${valid.length || ""}`}</button>`}
      </div></div>
    </div></div>`;
  }
  const im = () => K.state("import-modal");
  H("imClose", () => ((S.importParsed = null), K.drop("import-modal")));
  H("imEdit", () => {
    const s = im();
    if (s.isEditing) {
      if (s.snapshot) s.records = s.snapshot;
      Object.assign(s, { snapshot: null, isEditing: false });
      return;
    }
    s.snapshot = (s.records ?? S.importParsed.records).map((r) => ({ ...r }));
    s.isEditing = true;
  });
  H("imSave", () => Object.assign(im(), { snapshot: null, isEditing: false }));
  H("imCell", (arg, ev) => {
    const bar = arg.indexOf("|");
    const idx = Number(arg.slice(0, bar));
    const h = arg.slice(bar + 1);
    const s = im();
    s.records = (s.records ?? S.importParsed.records).map((r, i) => (i === idx ? { ...r, [h]: ev.target.value } : r));
  });
  H("imConfirm", async () => {
    const s = im();
    const parsed = S.importParsed;
    s.isImporting = true;
    K.update();
    try {
      const v = PM.productCsv.validateProductRecords(parsed.headers, s.records ?? parsed.records);
      const valid = v.rows.filter((r) => r.errors.length === 0);
      const tree = await api.listCategories(locationId);
      const resolved = await PM.productCsv.resolveCsvCategoryReferences(valid, tree, locationId, (loc, input) => api.createCategory(loc, input));
      const still = resolved.filter((r) => r.errors.length === 0);
      const results = await api.bulkImportProducts(locationId, still.map((r) => ({ ...r.request, catalogueType })));
      refresh();
      const ok = results.filter((r) => r.status === "ok").length;
      const bad = results.length - ok;
      bad === 0 ? onNotify(`${ok} product${ok === 1 ? "" : "s"} imported`, "success") : onNotify(`${ok} imported, ${bad} failed`, "error");
      S.importParsed = null;
      K.drop("import-modal");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Import failed", "error");
    } finally {
      s.isImporting = false;
      K.update();
    }
  });

  // ---- ZohoSyncResultsModal -------------------------------------------------------------
  const ZTABS = [
    { outcome: "created", label: "Created", count: (j) => j.itemsCreated },
    { outcome: "updated", label: "Updated", count: (j) => j.itemsUpdated ?? 0 },
    { outcome: "skipped", label: "Skipped" },
    { outcome: "failed", label: "Failed", count: (j) => j.itemsFailed },
  ];
  const ZSTATUS = { RUNNING: "Running", SYNCED: "Completed", PARTIAL: "Completed with failures", FAILED: "Failed" };
  function ZohoResults() {
    if (!Z.resultsOpen || !Z.lastFinished) return "";
    const job = Z.lastFinished;
    const s = K.state("zoho-results", () => ({ outcome: "created", searchDraft: "", search: "", page: 1, rows: [], total: 0, isLoading: true, error: null, key: null }));
    const key = `${s.outcome}|${s.search}|${s.page}`;
    if (s.key !== key) {
      s.key = key;
      s.isLoading = true;
      s.error = null;
      const term = s.search.trim();
      api.getZohoSyncItems(locationId, job.jobId, { outcome: s.outcome, ...(term ? { search: term } : {}), page: s.page, limit: 20 })
        .then((r) => {
          if (s.key !== key) return;
          s.rows = r.items.map(PM.zohoSyncStatus.toZohoSyncResultRow);
          s.total = r.total;
        })
        .catch((e) => s.key === key && (s.error = e instanceof Error ? e.message : "Could not load the sync results"))
        .finally(() => s.key === key && ((s.isLoading = false), K.update()));
    }
    const when = Number.isNaN(new Date(job.updatedAt).getTime()) ? "" : new Date(job.updatedAt).toLocaleString();
    const totalPages = Math.max(1, Math.ceil(s.total / 20));
    const list = s.error ? `<p role="alert" class="text-sm text-red-600">${K.esc(s.error)}</p>`
      : s.isLoading && s.rows.length === 0 ? `<p class="text-sm text-gray-500 dark:text-gray-400">Loading…</p>`
      : s.rows.length === 0 ? `<p class="text-sm text-gray-500 dark:text-gray-400">${s.search.trim() ? "No matches" : "Nothing here for this sync"}</p>`
      : `<ul class="divide-y divide-gray-100 dark:divide-gray-700 ${s.isLoading ? "opacity-60" : ""}">${s.rows.map((row) => `<li data-testid="zoho-sync-results-row" class="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between"><div class="min-w-0">${row.productPath ? `<a href="${K.esc(detailPath(row.productPath.split("/").pop()))}" class="truncate text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400" data-on-click="pl.zohoClose">${K.esc(row.name)}</a>` : `<span class="truncate text-sm font-medium text-gray-800 dark:text-gray-100">${K.esc(row.name)}</span>`}${row.codeLabel ? `<span class="ml-2 text-xs text-gray-500 dark:text-gray-400">${K.esc(row.codeLabel)}</span>` : ""}</div>${row.detail ? `<span class="text-xs text-gray-500 dark:text-gray-400">${K.esc(row.detail)}</span>` : ""}</li>`).join("")}</ul>`;
    return FormModal("zoho-results:fm", {
      open: true, onClose: () => (Z.resultsOpen = false), title: "Last Zoho sync", description: `${ZSTATUS[job.status]} · ${when}`, size: "lg", testId: "zoho-sync-results-modal",
      children: `<div role="tablist" class="flex flex-wrap gap-2 border-b border-gray-100 pb-3 dark:border-gray-700">${ZTABS.map((t) => `<button type="button" role="tab" aria-selected="${s.outcome === t.outcome}" data-testid="zoho-sync-results-tab-${t.outcome}" data-on-click="pl.zohoTab|${t.outcome}" class="rounded-md px-3 py-1.5 text-sm font-medium transition ${s.outcome === t.outcome ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"}">${t.count ? `${t.label} (${t.count(job)})` : t.label}</button>`).join("")}</div>
        <div class="mt-4" style="position:relative">${K.icon("Search", "pointer-events-none text-gray-400").replace("<svg", '<svg aria-hidden="true" style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);width:1rem;height:1rem"')}<input type="search" value="${K.esc(s.searchDraft)}" data-on-input="pl.zohoSearch" placeholder="Search by name, article number or SKU" data-testid="zoho-sync-results-search" style="padding-left:2.25rem" class="block h-10 w-full rounded-md border border-gray-200 bg-white pr-3 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"></div>
        <div class="mt-4 min-h-[12rem]">${list}</div>
        ${s.total > 20 ? `<div class="mt-2 border-t border-gray-100 dark:border-gray-700">${Pagination("zoho-results-pg", { currentPage: s.page, totalPages, resultsPerPage: 20, totalResults: s.total, onPageChange: (pg) => (s.page = pg), testIdPrefix: "zoho-sync-results" })}</div>` : ""}`,
    });
  }
  const zr = () => K.state("zoho-results");
  const zohoSearchApply = K.debounce((v) => ((zr().search = v), (zr().page = 1), (zr().rows = []), (zr().total = 0), K.update()), 300);
  H("zohoTab", (o) => Object.assign(zr(), { outcome: o, page: 1, rows: [], total: 0 }));
  H("zohoSearch", (_, ev) => ((zr().searchDraft = ev.target.value), zohoSearchApply(ev.target.value)));
  H("zohoClose", () => (Z.resultsOpen = false));

  // ---- RecategorizeDrawer ----------------------------------------------------------------
  H("rcCancel", () => Object.assign(RC, { isOpen: false, targets: [] }));
  H("rcConfirm", async () => {
    RC.isSaving = true;
    K.update();
    try {
      const items = RC.targets.map((p) => ({ id: p.id, name: p.name, articleNumber: p.articleNumber, categoryReference: RC.categoryReference }));
      const r = await api.bulkEditProducts(items);
      Object.assign(RC, { isOpen: false, targets: [] });
      const ok = r.filter((x) => x.status === "ok").length;
      const bad = r.length - ok;
      bad === 0 ? onNotify(`${ok} ${title.toLowerCase()} recategorized`, "success") : onNotify(`${ok} recategorized, ${bad} failed`, "error");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Recategorize failed", "error");
    } finally {
      RC.isSaving = false;
    }
    refresh();
  });
  function RecategorizeDrawer() {
    if (!RC.isOpen) return "";
    return SlideDrawer("recategorize-drawer", {
      open: true, onClose: () => K.on["pl.rcCancel"](), title: "Recategorize Products", description: "Move the selected products into a new category in one go.", testId: "recategorize-drawer", zIndex: 9997, dimmed: !RC.addOpen, closeOnBackdrop: !RC.addOpen,
      footer: `<button type="button" data-on-click="pl.rcCancel"${K.attr("disabled", RC.isSaving)} data-testid="recategorize-cancel-btn" class="h-12 min-w-0 flex-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-red-500 hover:border-red-100 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-red-700">Cancel</button><button type="button" data-on-click="pl.rcConfirm"${K.attr("disabled", RC.isSaving || !RC.categoryReference)} data-testid="recategorize-confirm-btn" class="h-12 min-w-0 flex-1 rounded-md bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">${RC.isSaving ? "Recategorizing…" : "Recategorize Products"}</button>`,
      children: `<div class="grid grid-cols-6 gap-3 md:gap-5 lg:gap-6 xl:gap-6 mb-6"><label for="recategorize-category-select" class="col-span-6 sm:col-span-2 self-center font-medium text-sm text-gray-700 dark:text-gray-300">Categories</label><div class="col-span-6 sm:col-span-4">${CategorySelect("recategorize-category-select", { categoryOptions: S.categoryOptions, value: RC.categoryReference, onChange: (v) => (RC.categoryReference = v), onAddNew: () => (RC.addOpen = true) })}</div></div>`,
    });
  }

  // ---- TagAssignmentDrawer ------------------------------------------------------------------
  function TagAssignmentDrawer() {
    if (!TG.isOpen) return "";
    const s = K.state("tag-assign", () => ({ query: "", selected: new Set(TG.selectedIds), visibleCount: 40, tagNames: [] }));
    const rows = TG.products.map((product) => ({ product, vm: PM.frontendModel.toProductListItemViewModel(product, isRaw, TG.categoryNameById[product.categoryReference ?? ""]) }));
    const needle = s.query.trim().toLowerCase();
    const filtered = !needle ? rows : rows.filter(({ vm }) => `${vm.displayName} ${vm.categoryLabel ?? ""}`.toLowerCase().includes(needle));
    const visible = filtered.slice(0, s.visibleCount);
    return SlideDrawer("tag-assignment-drawer", {
      open: true, onClose: () => bulkTag.cancel(), title: "Create product tag", description: "Name the tag, search products and select the products that belong to it.", testId: "tag-assignment-drawer", zIndex: 9998,
      footer: `<div class="w-full"><p class="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">${s.selected.size} selected</p><div class="grid gap-3 sm:grid-cols-2">
        <button type="button" data-on-click="pl.taCancel" data-testid="tag-assignment-cancel-btn" class="h-12 w-full rounded-lg border border-red-200 bg-white px-5 text-sm font-semibold text-red-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800">Cancel</button>
        <button type="button"${K.attr("disabled", TG.isSaving || s.tagNames.length === 0 || s.selected.size === 0)} data-on-click="pl.taSave" data-testid="tag-assignment-save-btn" class="h-12 w-full rounded-lg bg-green-600 px-5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500">${TG.isSaving ? "Saving…" : "Save"}</button></div></div>`,
      children: `<label class="mb-4 flex items-center gap-2 rounded-xl border bg-gray-50 px-3 py-2.5 focus-within:ring-2 focus-within:ring-green-500/30 dark:border-gray-700 dark:bg-gray-800">${K.icon("Search", "h-4 w-4 text-gray-400")}<input value="${K.esc(s.query)}" data-on-input="pl.taQuery" placeholder="Search…" data-testid="tag-assignment-search" class="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none dark:text-gray-100">${s.query ? `<button type="button" data-on-click="pl.taClear" aria-label="Clear search" class="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">${K.icon("X", "h-4 w-4")}</button>` : ""}</label>
        ${MultiTagInput("tag-assign-tags", { value: s.tagNames, onChange: (t) => (s.tagNames = t), placeholder: "e.g. Seasonal, High margin", buttonLabel: "Add Tag" })}
        <div class="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">${visible.map(({ product, vm }) => {
          const on = s.selected.has(product.id);
          const tags = product.tags ?? [];
          return `<button data-key="${product.id}" type="button" data-on-click="pl.taToggle|${product.id}" aria-pressed="${on}" data-testid="tag-assignment-item-${product.id}" class="group relative flex h-full min-h-[112px] w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl border p-3 text-left transition ${on ? "border-green-500 bg-green-50 ring-1 ring-green-500/20 dark:border-green-600 dark:bg-green-900/20" : "border-gray-200 bg-white hover:border-green-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-green-700 dark:hover:bg-gray-700"}">
            <span class="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-gray-100 dark:border-gray-700 dark:bg-gray-700">${ProductImage({ productId: product.id, directUrl: vm.thumbnailUrl, alt: vm.displayName, className: "block h-full w-full rounded-lg object-cover" })}</span>
            <span class="flex min-w-0 flex-1 flex-col self-stretch py-0.5"><span class="flex min-w-0 items-start justify-between gap-3 pr-8"><span class="min-w-0"><span class="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">${K.esc(vm.displayName)}</span><span class="mt-0.5 block truncate text-[11px] text-gray-500 dark:text-gray-400">${K.esc(vm.articleNumberLabel)}</span></span>${vm.price !== undefined ? `<span class="shrink-0 text-sm font-bold text-gray-900 dark:text-gray-100">${K.esc(PM.format.formatPrice(vm.price))}</span>` : ""}</span>
              ${vm.categoryLabel ? `<span class="mt-1.5 w-fit max-w-full truncate rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">${K.esc(vm.categoryLabel)}</span>` : ""}
              <span class="mt-auto flex min-h-5 flex-wrap items-end gap-1 pt-1.5">${tags.slice(0, 2).map((t) => `<span class="max-w-[45%] truncate rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/35 dark:text-green-300">${K.esc(t)}</span>`).join("")}${tags.length > 2 ? `<span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-300">+${tags.length - 2}</span>` : ""}${!tags.length ? `<span class="text-[10px] text-gray-400">No tags</span>` : ""}</span></span>
            <span class="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-md border shadow-sm transition ${on ? "border-green-600 bg-green-600 text-white" : "border-gray-300 bg-white text-transparent dark:border-gray-600 dark:bg-gray-800"}">${on ? K.icon("Check", "h-3.5 w-3.5") : ""}</span></button>`;
        }).join("")}</div>
        ${filtered.length === 0 ? `<p class="py-12 text-center text-sm text-gray-400" data-testid="tag-assignment-empty">No matches found.</p>` : ""}
        ${s.visibleCount < filtered.length ? `<button type="button" data-on-click="pl.taMore" data-testid="tag-assignment-show-more-btn" class="mt-4 mb-3 w-full rounded-xl border border-dashed py-3 text-sm font-semibold text-green-700 hover:bg-green-50 dark:border-gray-600 dark:hover:bg-gray-800">Show more (${filtered.length - s.visibleCount} remaining)</button>`
          : TG.hasMore && !s.query.trim() ? `<button type="button" data-on-click="pl.taLoadMore"${K.attr("disabled", TG.loadingMore)} data-testid="tag-assignment-load-more" class="mt-4 mb-3 w-full rounded-xl border border-dashed border-green-300 bg-green-50/60 py-3 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-green-800 dark:bg-green-900/10">${TG.loadingMore ? "Loading..." : "Load 20 more"}</button>` : ""}`,
    });
  }
  const ta = () => K.state("tag-assign");
  H("taQuery", (_, ev) => Object.assign(ta(), { query: ev.target.value, visibleCount: 40 }));
  H("taClear", () => Object.assign(ta(), { query: "", visibleCount: 40 }));
  H("taToggle", (pid) => {
    const n = new Set(ta().selected);
    n.has(pid) ? n.delete(pid) : n.add(pid);
    ta().selected = n;
  });
  H("taMore", () => (ta().visibleCount += 40));
  H("taLoadMore", () => bulkTag.loadMore());
  H("taCancel", () => bulkTag.cancel());
  H("taSave", async () => {
    try {
      const r = await bulkTag.confirm(Array.from(ta().selected), ta().tagNames);
      const ok = r.filter((x) => x.status === "ok").length;
      const bad = r.length - ok;
      bad === 0 ? onNotify(`Tags updated for ${ok} product${ok === 1 ? "" : "s"}`, "success") : onNotify(`${ok} updated, ${bad} failed`, "error");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Assign tags failed", "error");
    }
    refresh();
  });

  // ---- render ----------------------------------------------------------------------------
  const tc = PM.text.toTitleCase;
  const fmt = PM.format;
  function flattenLeaves(roots) {
    const flat = (nodes) => nodes.flatMap((n) => (n.children.length > 0 ? flat(n.children) : [{ id: n.id, label: n.label }]));
    return roots.flatMap((r) => flat(r.children));
  }
  function bulkEditCells(item, product, draft) {
    if (!product || !draft)
      return `<td class="px-4 py-2"><span data-testid="product-unit-readonly-${item.id}" class="text-sm text-gray-400 dark:text-gray-500">${K.esc(item.stockUnitLabel ?? "—")}</span></td><td class="px-4 py-2"><span data-testid="product-price-readonly-${item.id}" class="text-sm font-semibold text-gray-500 dark:text-gray-400">${item.price !== undefined ? K.esc(fmt.formatPrice(item.price)) : "—"}</span></td><td class="px-4 py-2"><span data-testid="product-tax-readonly-${item.id}" class="text-xs text-gray-400 dark:text-gray-500">${item.tax !== undefined ? `${K.esc(item.tax)}%` : "—"}</span></td>`;
    const eff = bpe.getEffectiveProductForDraft(product, draft);
    const units = bpe.getUnitLevelOptions(eff);
    const rates = Array.from(new Set([0, 5, 12, 18, 28, draft.taxRate])).sort((a, b) => a - b);
    const cur = fmt.currency();
    return `<td class="px-4 py-2"><div class="flex items-center gap-1"><select data-on-change="pl.beUnit|${item.id}" aria-label="Pricing unit for ${K.esc(item.displayName)}" data-testid="product-unit-select-${item.id}" class="h-9 w-full min-w-[4.5rem] rounded-md border border-gray-300 bg-white px-1.5 text-sm text-gray-700 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">${units.map((u) => `<option value="${u.index}"${K.attr("selected", draft.unitIndex === u.index)}>${K.esc(u.label)}</option>`).join("")}</select>
        <button type="button" title="Edit unit &amp; pricing details" data-on-click="pl.beModal|${item.id}" aria-label="Edit unit and pricing details for ${K.esc(item.displayName)}" data-testid="product-unit-modal-btn-${item.id}" class="flex h-9 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-500 transition hover:border-green-500 hover:text-green-600 dark:border-gray-600 dark:text-gray-400">${K.icon("SlidersHorizontal", "h-3.5 w-3.5")}</button></div></td>
      <td class="px-4 py-2"><div class="relative w-32"><span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">${K.esc(cur)}</span><input type="number" min="0" step="0.01" value="${K.esc(draft.price)}" data-on-input="pl.bePrice|${item.id}" aria-label="Price for ${K.esc(item.displayName)}" data-testid="product-price-input-${item.id}" style="padding-left:calc(${cur.length}ch + 16px)" class="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pr-2 text-base font-semibold tabular-nums text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"></div></td>
      <td class="px-4 py-2"><div class="flex items-center gap-1.5"><div class="inline-flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-600">${[["With GST", "Incl", "Price includes GST"], ["Without GST", "Excl", "Price excludes GST"]].map(([v, l, t]) => `<button type="button" title="${t}" data-on-click="pl.beTaxType|${item.id}|${v}" data-testid="product-tax-type-btn-${item.id}-${l.toLowerCase()}" class="px-2 py-1.5 text-xs font-medium transition ${draft.taxType === v ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"}">${l}</button>`).join("")}</div>
        <select data-on-change="pl.beTaxRate|${item.id}" aria-label="GST rate for ${K.esc(item.displayName)}" data-testid="product-tax-rate-select-${item.id}" class="h-9 w-16 rounded-md border border-gray-300 bg-white px-1 text-xs text-gray-700 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">${rates.map((r) => `<option value="${r}"${K.attr("selected", draft.taxRate === r)}>${r}%</option>`).join("")}</select></div></td>`;
  }
  function mobileCards(actionsDisabled) {
    return `<div class="md:hidden space-y-2 pb-2">${S.items.map((item) => {
      const total = item.stockLabel ?? 0;
      const avail = item.isRawMaterial ? total : item.canSell ?? total;
      const st = total <= 0 ? { label: "Out of Stock", c: "bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-300" } : avail <= 5 ? { label: "Low Stock", c: "bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-300" } : { label: "In Stock", c: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300" };
      const taxLabel = fmt.formatTaxLabel(item.tax);
      const name = tc(item.displayName);
      const cat = item.categoryLabel ? tc(item.categoryLabel) : undefined;
      return `<article data-key="${item.id}" data-testid="product-card-${item.id}" class="relative overflow-hidden rounded-xl border px-2.5 pb-0 shadow-sm dark:border-gray-700 dark:bg-gray-800 border-gray-200 bg-white">
        <span data-testid="product-card-stock-status-${item.id}" class="absolute right-2.5 top-2.5 z-10 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-medium ${st.c}"><span class="h-1.5 w-1.5 rounded-full bg-current"></span>${st.label}</span>
        <div class="grid min-h-[86px] grid-cols-[18px_70px_minmax(0,1fr)] gap-2 py-2"><div class="flex items-start pt-0.5"><input type="checkbox"${K.attr("checked", S.checkedIds.includes(item.id))} data-on-change="pl.check|${item.id}" aria-label="Select ${K.esc(item.displayName)}" class="h-4 w-4 rounded border-gray-400 accent-emerald-600 dark:border-gray-500"></div>
          <div class="flex items-center"><div class="h-[70px] w-[70px] overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900">${ProductImage({ productId: item.id, directUrl: item.thumbnailUrl, alt: name || "Product image", className: "block h-full w-full rounded-lg object-cover" })}</div></div>
          <div class="flex min-w-0 flex-col justify-center py-0.5 pr-[96px]"><h3 data-testid="product-card-name-${item.id}" class="truncate text-[13px] font-semibold leading-[18px] text-gray-900 dark:text-gray-100">${K.esc(name)}</h3><p class="truncate text-[10px] leading-[14px] text-gray-400"><span data-testid="product-card-article-no-${item.id}">${K.esc(item.articleNumberLabel)}</span></p>${cat ? `<span data-testid="product-card-category-${item.id}" class="mt-0.5 inline-block max-w-full self-start truncate rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-medium leading-3 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">${K.esc(cat)}</span>` : ""}</div></div>
        ${item.price !== undefined ? `<div class="absolute bottom-[48px] right-2.5 text-right"><p data-testid="product-card-price-${item.id}" class="whitespace-nowrap text-[14px] font-bold leading-[17px] text-gray-900 dark:text-gray-100">${K.esc(fmt.formatPrice(item.price))}</p>${taxLabel ? `<p data-testid="product-card-tax-${item.id}" class="whitespace-nowrap text-[9px] leading-3 text-gray-400">${taxLabel}</p>` : ""}</div>` : ""}
        <div class="flex h-[42px] items-center border-t border-gray-100 dark:border-gray-700"><div class="grid min-w-0 flex-1 divide-x divide-gray-100 dark:divide-gray-700 ${item.isRawMaterial ? "grid-cols-1" : "grid-cols-3"}">
          <div class="text-center"><p data-testid="product-card-stock-total-${item.id}" class="text-[11px] font-semibold leading-4 ${total <= 0 ? "text-orange-500 dark:text-orange-400" : "text-gray-700 dark:text-gray-200"}">${total}</p><p class="truncate px-1 text-[9px] leading-3 text-gray-400"><span data-testid="product-card-stock-unit-${item.id}">${K.esc(item.stockUnitLabel ?? "")}</span>${item.isRawMaterial ? " available" : " total"}</p></div>
          ${!item.isRawMaterial ? `<div class="text-center"><p data-testid="product-card-stock-sellable-${item.id}" class="text-[11px] font-semibold leading-4 ${(item.canSell ?? 0) > 0 ? "text-emerald-500" : "text-rose-500 dark:text-rose-400"}">${item.canSell ?? 0}</p><p class="truncate px-1 text-[9px] leading-3 text-gray-400">Can sell</p></div><div class="text-center"><p data-testid="product-card-stock-ordered-${item.id}" class="text-[11px] font-semibold leading-4 ${(item.inOrders ?? 0) > 0 ? "text-orange-500" : "text-slate-400"}">${item.inOrders ?? 0}</p><p class="truncate px-1 text-[9px] leading-3 ${(item.inOrders ?? 0) > 0 ? "text-orange-400" : "text-gray-400"}">In orders</p></div>` : ""}</div>
          <div class="ml-2 flex shrink-0 justify-end gap-1"><a href="${detailPath(item.id)}" aria-label="View ${K.esc(item.displayName)}" data-testid="product-card-view-btn-${item.id}" class="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-[12px] text-gray-500 dark:border-gray-600">${K.icon("FiEye")}</a>
            <button type="button"${K.attr("disabled", actionsDisabled)} data-on-click="pl.edit|${item.id}" aria-label="Edit ${K.esc(item.displayName)}" data-testid="product-card-edit-btn-${item.id}" class="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-[12px] text-emerald-500 disabled:text-gray-300 dark:border-gray-600">${K.icon("FiEdit")}</button>
            <button type="button"${K.attr("disabled", actionsDisabled)} data-on-click="pl.delete|${item.id}|${K.esc(item.displayName)}" aria-label="Delete ${K.esc(item.displayName)}" data-testid="product-card-delete-btn-${item.id}" class="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-[12px] text-red-400 disabled:text-gray-300 dark:border-gray-600">${K.icon("FiTrash2")}</button></div></div>
      </article>`;
    }).join("")}</div>`;
  }
  const bulkProps = (extra) => ({
    selectedIds: S.checkedIds,
    fallbackIds: S.items.map((i) => i.id),
    onUpdate: (ids) => {
      RC.categoryReference = "";
      RC.isOpen = true;
      const sel = new Set(ids);
      RC.targets = S.products.filter((p) => sel.has(p.id));
      K.drop("recategorize-category-select:rs");
    },
    onDelete: (ids) => (S.pendingDelete = { kind: "bulk", ids }),
    onAutoSelect: () => onNotify(isRaw ? "Select raw materials first, then choose a bulk action." : "Select products first, then choose a bulk action.", "error"),
    label: "Bulk Action",
    ...extra,
  });

  function render() {
    if (S.error) return `<p role="alert" data-testid="products-list-error">Something went wrong: ${K.esc(S.error.message)}</p>`;
    const totalPages = Math.max(1, Math.ceil(S.totalDoc / PL_PAGE_SIZE));
    const actionsDisabled = S.checkedIds.length > 0;
    const byId = new Map(S.products.map((p) => [p.id, p]));
    const allInEdit = S.products.length > 0 && S.products.every((p) => BE.drafts[p.id]);
    const leaves = flattenLeaves(S.categoryOptions);
    const zBusy = zoho.view().isBusy;
    const extra = (mobile) =>
      isRaw ? [] : [
        { label: "Update prices", ...(mobile ? { description: "Edit unit price and tax for the selected products" } : {}), icon: "IndianRupee", onClick: (ids) => bulkEdit.begin(ids), skipAutoSelect: true },
        { label: "Assign tags", ...(mobile ? { description: "Add or remove tags on the selected products" } : {}), icon: "Tag", onClick: (ids) => bulkTag.open(ids) },
      ];
    const chip = (active) => `rounded-full border px-3 h-8 text-xs font-semibold ${active ? "border-green-600 bg-green-600 text-white" : "border-gray-200 bg-white text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`;
    const rows = S.items.map((item) => {
      const name = tc(item.displayName);
      const cat = item.categoryLabel ? tc(item.categoryLabel) : undefined;
      const taxLabel = fmt.formatTaxLabel(item.tax);
      const product = byId.get(item.id);
      const draft = BE.drafts[item.id];
      return `<tr data-key="${item.id}" data-testid="product-row-${item.id}" class="border-b border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40">
        <td class="px-4 py-2"><input type="checkbox" data-testid="product-select-${item.id}"${K.attr("checked", BE.isActive ? Boolean(draft) : S.checkedIds.includes(item.id))} data-on-change="pl.check|${item.id}" aria-label="Select ${K.esc(item.displayName)}" class="h-4 w-4 rounded border-gray-400 accent-emerald-600"></td>
        <td class="px-4 py-2"><div class="flex items-center gap-3"><div class="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900">${ProductImage({ productId: item.id, directUrl: item.thumbnailUrl, alt: name, className: "block h-11 w-11 rounded-lg object-cover", testId: `product-image-${item.id}` })}</div>
          <div class="min-w-[160px] max-w-96"><div data-testid="product-name-${item.id}" class="whitespace-normal break-words text-base font-medium leading-5 text-black dark:text-gray-100">${K.esc(name)}</div><span class="text-xs block text-gray-500"><span data-testid="product-article-no-${item.id}">${K.esc(item.articleNumberLabel)}</span></span></div></div></td>
        ${!BE.isActive ? `<td class="px-4 py-2"><span data-testid="product-category-${item.id}" class="text-sm">${K.esc(cat ?? "—")}</span></td>` : ""}
        ${BE.isActive ? bulkEditCells(item, product, draft) : `<td class="px-4 py-2">${item.price !== undefined ? `<div class="flex flex-col leading-tight"><span data-testid="product-price-${item.id}" class="text-sm font-semibold">${K.esc(fmt.formatPrice(item.price))}</span>${taxLabel ? `<span data-testid="product-tax-${item.id}" class="text-xs text-gray-500 mt-0.5">${taxLabel}</span>` : ""}</div>` : `<span class="text-sm text-gray-400">—</span>`}</td>`}
        ${!BE.isActive ? `<td class="px-4 py-2"><div class="flex flex-col leading-tight gap-0.5"><div class="flex items-baseline gap-1"><span data-testid="product-stock-total-${item.id}" class="text-sm font-bold text-slate-800 dark:text-slate-200 tabular-nums">${item.stockLabel ?? 0}</span>${item.stockUnitLabel ? `<span data-testid="product-stock-unit-${item.id}" class="text-xs font-semibold text-slate-600 dark:text-slate-400">${K.esc(item.stockUnitLabel)}</span>` : ""}<span class="text-xs text-slate-400">total stock</span></div>
          ${!isRaw && item.canSell !== undefined ? `<div class="flex items-baseline gap-1.5 text-xs"><span class="font-medium tabular-nums ${item.canSell > 0 ? "text-green-600" : "text-rose-500"}"><span data-testid="product-stock-cansell-${item.id}">${item.canSell}</span> can sell</span><span class="text-slate-300">·</span><span class="font-medium tabular-nums ${(item.inOrders ?? 0) > 0 ? "text-orange-500" : "text-slate-400"}"><span data-testid="product-stock-inorders-${item.id}">${item.inOrders ?? 0}</span> in orders</span></div>` : ""}</div></td>` : ""}
        ${!BE.isActive ? `<td class="px-4 py-2 w-[170px] text-right"><div class="flex items-center justify-end gap-1"><a href="${detailPath(item.id)}" title="View" aria-label="View ${K.esc(item.displayName)}" class="p-2 text-gray-600 hover:text-green-600 focus:outline-none">${K.icon("FiEye")}</a>
          <button type="button"${K.attr("disabled", actionsDisabled)} data-on-click="pl.edit|${item.id}" title="Edit" aria-label="Edit ${K.esc(item.displayName)}" class="p-2 focus:outline-none ${actionsDisabled ? "text-gray-400" : "text-gray-600 hover:text-green-600"}">${K.icon("FiEdit")}</button>
          <button type="button"${K.attr("disabled", actionsDisabled)} data-on-click="pl.delete|${item.id}|${K.esc(item.displayName)}" title="Delete" aria-label="Delete ${K.esc(item.displayName)}" class="p-2 focus:outline-none ${actionsDisabled ? "text-gray-400" : "text-gray-600 hover:text-red-600"}">${K.icon("FiTrash2")}</button></div></td>` : ""}
      </tr>`;
    }).join("");

    return `<div>
      <div class="hidden md:block min-w-0 rounded-lg overflow-visible ring-1 ring-black/5 dark:bg-gray-800 mb-4"><div class="p-4 flex flex-col sm:flex-row gap-2">
        ${ExportDropdown("products-export", false)}
        ${ImportButton("products-import", false)}
        ${zBusy ? `<span data-testid="products-zoho-syncing" class="inline-flex h-10 items-center text-sm text-gray-500 dark:text-gray-400">${K.icon("FiRefreshCw", "mr-2 h-4 w-4 animate-spin text-emerald-500")}Syncing…</span>` : ""}
        ${BulkActionDropdown("products-bulk", bulkProps({ extraActions: extra(false), updateLabel: "Recategorize products", testIdPrefix: "products-bulk-action" }))}
        <button type="button" data-testid="products-add-btn" data-on-click="pl.add" class="align-bottom inline-flex items-center justify-center cursor-pointer leading-5 transition-colors duration-150 font-medium focus:outline-none px-4 py-2 rounded-md text-sm text-white bg-green-600 border border-transparent hover:bg-green-700 h-10 w-full sm:w-auto sm:ml-auto">${K.icon("FiPlus", "mr-2")}Add ${isRaw ? "Raw Material" : "Product"}</button>
      </div></div>
      <div class="min-w-0 rounded-lg overflow-hidden ring-1 ring-black/5 dark:bg-gray-800 mb-4"><div class="p-4 flex flex-col md:flex-row gap-2">
        <div class="flex-1" style="position:relative">${K.icon("Search", "pointer-events-none text-gray-400").replace("<svg", '<svg style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);width:1rem;height:1rem"')}<input type="search" data-testid="products-search-input" placeholder="Search ${title}" value="${K.esc(S.searchDraft)}" data-on-input="pl.search" class="block w-full h-10 border border-gray-200 bg-white pl-9 pr-9 py-1 text-sm focus:outline-none dark:text-gray-300 leading-5 rounded-md focus:bg-white dark:focus:bg-gray-700"></div>
        <div class="hidden md:block md:w-[192px]"><select data-testid="products-category-filter" data-on-change="pl.category" class="block w-full h-10 border border-gray-200 bg-white px-2 py-1 text-sm dark:text-gray-300 focus:outline-none rounded-md focus:bg-white dark:focus:bg-gray-700"><option value=""${K.attr("selected", !S.category)}>All categories</option>${leaves.map((l) => `<option value="${l.id}"${K.attr("selected", S.category === l.id)}>${K.esc(l.label)}</option>`).join("")}</select></div>
      </div>
      <div class="px-4">${leaves.length === 0 ? "" : `<div class="md:hidden -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-2" aria-label="Filter products by category"><button type="button" data-testid="products-category-chip-all" data-status="${!S.category ? "selected" : "unselected"}" data-on-click="pl.chip|" class="shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition-colors ${!S.category ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-200 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"}">All</button>${leaves.map((l) => `<button type="button" data-testid="products-category-chip-${l.id}" data-status="${S.category === l.id ? "selected" : "unselected"}" data-on-click="pl.chip|${l.id}" class="shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition-colors ${S.category === l.id ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-200 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"}">${K.esc(l.label)}</button>`).join("")}</div>`}</div>
      </div>
      ${!isRaw && !(S.availableTags.length === 0 && !S.tag) ? `<div class="flex flex-wrap gap-2 mb-4" data-testid="tag-filter-chips"><button type="button" data-on-click="pl.tagAll" data-testid="tag-filter-chip-all" class="${chip(!S.tag)}">All</button>${S.availableTags.map((t) => `<button type="button" data-on-click="pl.tag|${K.esc(t)}" data-testid="tag-filter-chip-${K.esc(t)}" class="inline-flex items-center gap-1 ${chip(S.tag === t)}">${K.icon("Tag", "h-3 w-3")}${K.esc(t)}</button>`).join("")}</div>` : ""}
      ${BE.isActive ? `<div data-testid="bulk-edit-panel" class="mb-4 flex flex-nowrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-900/40 dark:bg-blue-900/10"><span class="mr-auto min-w-0 truncate text-sm font-semibold text-blue-800 dark:text-blue-300">Editing ${Object.keys(BE.drafts).length} product${Object.keys(BE.drafts).length === 1 ? "" : "s"}</span>
        <button type="button" data-on-click="pl.beCancel"${K.attr("disabled", BE.isSaving)} data-testid="bulk-edit-cancel-btn" class="align-bottom inline-flex items-center justify-center cursor-pointer leading-5 transition-colors duration-150 font-medium focus:outline-none px-3 py-1.5 rounded-md text-sm text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50">Cancel</button>
        <button type="button" data-on-click="pl.beSave"${K.attr("disabled", BE.isSaving || Object.keys(BE.drafts).length === 0)} data-testid="bulk-edit-save-btn" class="align-bottom inline-flex items-center justify-center cursor-pointer leading-5 transition-colors duration-150 font-medium focus:outline-none px-3 py-1.5 rounded-md text-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">${BE.isSaving ? "Saving…" : "Save changes"}</button></div>` : ""}
      ${S.isLoading ? `<p class="py-8 text-center text-sm text-gray-500" data-testid="products-list-loading">Loading…</p>` : `
        <div class="hidden md:block w-full overflow-hidden ring-1 ring-black/5 rounded-lg"><table class="w-full" data-testid="products-table">
          <thead class="text-sm font-medium tracking-wide text-left text-zinc-500 uppercase border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:text-gray-400 dark:bg-gray-800"><tr>
            <th class="px-4 py-2"><input type="checkbox"${K.attr("checked", BE.isActive ? allInEdit : S.items.length > 0 && S.checkedIds.length === S.items.length)} data-on-change="pl.checkAll" aria-label="Select all" class="h-4 w-4 rounded border-gray-400 accent-emerald-600"></th>
            <th class="px-4 py-2">Name</th>${!BE.isActive ? `<th class="px-4 py-2">Category</th>` : ""}${BE.isActive ? `<th class="px-4 py-2">Unit</th><th class="px-4 py-2">Price</th><th class="px-4 py-2">Tax</th>` : `<th class="px-4 py-2">${isRaw ? "Purchasing Price" : "Selling Price"}</th>`}${!BE.isActive ? `<th class="px-4 py-2">Stock</th><th class="px-4 py-2 w-[170px] text-right">Actions</th>` : ""}
          </tr></thead>
          <tbody class="bg-white divide-y divide-gray-100 dark:divide-gray-700 dark:bg-gray-800 text-gray-800 dark:text-gray-400">${rows}${S.items.length === 0 ? `<tr><td colspan="${BE.isActive ? 5 : 6}" class="px-4 py-6 text-center text-sm text-gray-500" data-testid="products-list-empty">No ${title.toLowerCase()} found.</td></tr>` : ""}</tbody>
        </table><div class="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">${Pagination("products-pg", { currentPage: S.currentPage, totalPages, resultsPerPage: PL_PAGE_SIZE, totalResults: S.totalDoc, onPageChange: setPage, testIdPrefix: "products" })}</div></div>
        ${BE.isActive ? `<p class="md:hidden py-8 text-center text-sm text-gray-500">Use a larger screen to bulk-edit prices.</p>` : `${mobileCards(actionsDisabled)}${S.items.length === 0 ? `<p class="md:hidden py-8 text-center text-sm text-gray-500" data-testid="products-list-empty-mobile">No ${title.toLowerCase()} found.</p>` : ""}<div class="md:hidden mb-4 rounded-lg bg-white dark:bg-gray-800">${Pagination("products-mobile-pg", { currentPage: S.currentPage, totalPages, resultsPerPage: PL_PAGE_SIZE, totalResults: S.totalDoc, onPageChange: setPage, testIdPrefix: "products-mobile" })}</div>`}`}
      ${BE.rowTarget ? UnitPriceModal("bulk-edit-upm", { isOpen: true, onClose: () => (BE.rowTarget = null), onSave: (payload) => { bulkEdit.applyModal(BE.rowTarget, payload); BE.rowTarget = null; }, unitOptions: BE.unitTriples, originalPrice: PM.catalogueDrawer.resolveBasePrice(BE.rowTarget), unit: BE.rowTarget.measurement, boxes: BE.rowTarget.boxes, pallets: BE.rowTarget.pallets, enablePallets: false, productId: BE.rowTarget.id, tax: BE.rowTarget.tax, priceMap: BE.rowTarget.priceMap, isRawMaterial: isRaw }) : UnitPriceModal("bulk-edit-upm", { isOpen: false })}
      ${RecategorizeDrawer()}
      ${AddCategoryModal("recategorize-addcat", { open: RC.addOpen, onClose: () => (RC.addOpen = false), categoryOptions: S.categoryOptions, apiClient: api, locationId, onCreate: async (name, parentRef, description, icon) => { const created = await createCategory(name, parentRef, description, icon); RC.categoryReference = created.id; } })}
      ${TagAssignmentDrawer()}
      ${K.portal("import-modal", ImportModal())}
      ${ZohoResults()}
      ${DeleteModal("products-delete", { open: S.pendingDelete !== null, title: S.pendingDelete?.kind === "single" ? S.pendingDelete.name : undefined, isBulk: S.pendingDelete?.kind === "bulk", onClose: () => (S.pendingDelete = null), onConfirm: async () => {
        const pd = S.pendingDelete;
        try {
          if (pd?.kind === "single") {
            await api.deleteProduct(pd.id);
            refresh();
            onNotify(`${pd.name} deleted`, "success");
          }
          if (pd?.kind === "bulk") {
            const r = await api.bulkDeleteProducts(pd.ids);
            refresh();
            const ok = r.filter((x) => x.status === "ok").length;
            const bad = r.length - ok;
            bad === 0 ? onNotify(`${ok} ${title.toLowerCase()} deleted`, "success") : onNotify(`${ok} deleted, ${bad} failed`, "error");
          }
        } catch (err) {
          onNotify(err instanceof Error ? err.message : "Delete failed", "error");
        }
      } })}
      ${S.drawerOpen ? ProductDrawer("product-drawer") : ""}
      <div class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]"><div class="flex w-full items-center justify-around px-1 py-2 pb-[env(safe-area-inset-bottom,8px)]">
        <div class="min-w-0 flex-1">${ExportDropdown("products-export-mobile", true)}</div>
        <div class="min-w-0 flex-1">${ImportButton("products-import-mobile", true)}</div>
        <button type="button" title="Add ${isRaw ? "Raw Material" : "Product"}" data-testid="products-add-btn-mobile" data-on-click="pl.add" class="group flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-emerald-700 hover:bg-emerald-50 transition"><span class="rounded-lg bg-emerald-600 px-3 py-1 text-white">${K.icon("FiPlus", "h-5 w-5")}</span><span class="max-w-full truncate text-[10px] font-medium">${isRaw ? "Raw Material" : "Product"}</span></button>
        <div class="relative min-w-0 flex-1 px-1">${BulkActionDropdown("products-bulk-mobile", bulkProps({ extraActions: extra(true), updateLabel: `Recategorize ${title.toLowerCase()}`, updateDescription: `Move the selected ${title.toLowerCase()} into a new category`, deleteDescription: `Permanently remove the selected ${title.toLowerCase()}`, mobile: true, mobileVariant: "sheet", entityLabel: title, testIdPrefix: "products-bulk-action-mobile" }))}</div>
      </div></div>
      <div class="md:hidden h-20"></div>
    </div>`;
  }

  K.app(el, render);
  load();
}
