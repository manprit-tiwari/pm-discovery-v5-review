// Discovery v6 (Addendum 007) — Finished Goods operational workspace.
// NOT a port of the module: this is the new UX under discovery, layered onto the v5 Products
// shell (product-list.js), which still owns Import / Export / Zoho sync / inline price edit /
// the product drawer / delete. Numbers come only from the seed through the module's own mock
// ApiClient; anything with no data source is shown as "Not available" (spec §50 P4) — see the
// addendum's "Where each number comes from" table.

const FG_PAGE = 20;
const FG_STATUSES = [["DRAFT", "Draft"], ["ACTIVE", "Active"], ["TEMP_UNAVAILABLE", "Temporarily unavailable"], ["DISCONTINUED", "Discontinued"], ["ARCHIVED", "Archived"], ["INACTIVE", "Inactive"]];
const FG_STATUS_LABEL = Object.fromEntries(FG_STATUSES);
const FG_SELLABLE = new Set(["ACTIVE", "DRAFT"]);
const FG_STATUS_PILL = {
  ACTIVE: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  TEMP_UNAVAILABLE: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  DISCONTINUED: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300",
  ARCHIVED: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  INACTIVE: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300",
};
// Proposed field (not on the Product model): discovery derives a supplier from the brand.
const FG_SUPPLIER_BY_BRAND = { amul: "Kaira District Co-op", britannia: "Britannia Industries", "local dairy": "Sharma Dairy Suppliers", bikaji: "Bikaji Foods", haldiram: "Haldiram Snacks", farmstory: "FarmStory Agro", "sandbox mills": "ABC Foods", samrudhi: "ABC Foods", "sandbox co": "ABC Foods" };
const FG_UNITS = ["Piece", "KG", "Gram", "Litre", "ML", "Box", "Case", "Carton", "Pallet", "Pack"];
const FG_TAX_RATES = [0, 5, 12, 18, 28];
const FG_NA = "Not available";

function createFinishedGoodsWorkspace(ctx) {
  const { api, locationId, onNotify, S, refresh, openDrawer, detailPath, beginInlineEdit, requestBulkDelete, isInlineEditing } = ctx;
  const fmt = PM.format;
  const tc = PM.text.toTitleCase;
  const esc = K.esc;
  const norm = (v) => String(v ?? "").trim().toLowerCase();
  const round2 = (n) => Math.round(n * 100) / 100;
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const money = (n) => (n === undefined || n === null || Number.isNaN(n) ? "—" : fmt.formatPrice(n));
  const emptyFilters = () => ({ cats: [], brands: [], suppliers: [], statuses: [], taxes: [], stock: [], tags: [], catalogues: [], missing: [], attention: null, recent: null, priceMin: "", priceMax: "", rules: [] });

  const W = {
    all: [], byId: new Map(), info: new Map(), names: {}, leaves: [], catalogues: [], demand: {}, recipients: null, brandLabel: {},
    q: "", qDraft: "", f: emptyFilters(), sort: { key: "name", dir: 1 }, page: 1, filtered: [], cursor: -1, anchorId: null,
    sel: { queries: [], include: new Map(), exclude: new Set() },
    recent: { added: new Set(), edited: new Set(), priced: new Set(), inactive: new Set() },
    catUsed: [], activity: [], keepSeparate: new Set(), knownIds: null,
    open: null, pickerView: "home", pop: null, popDraft: null, wizard: null, quick: null, rowMenu: null, dupOpen: null,
    showSel: false, colEdit: null, // Addendum 008: C2 the table shows the selection; C3 one column in edit mode
  };
  let actSeq = 0;

  // ---- load ------------------------------------------------------------------------------
  async function load() {
    const [list, tree, demand, cats] = await Promise.all([api.listProducts(locationId, {}), api.listCategories(locationId), api.getStockDemand(locationId), api.listCatalogues(locationId, {})]);
    const full = (await Promise.all(cats.catalogues.map((c) => api.getCatalogue(c.id)))).filter(Boolean);
    let recipients = null;
    if (Scenario.get().campaignRecipients) {
      recipients = {};
      for (const c of full) recipients[c.id] = await api.listCampaignRecipients(c.id).catch(() => []);
    }
    const ids = new Set(list.products.map((p) => p.id));
    if (W.knownIds) for (const x of ids) if (!W.knownIds.has(x)) W.recent.added.add(x);
    W.knownIds = ids;
    Object.assign(W, { all: list.products, byId: new Map(list.products.map((p) => [p.id, p])), names: PM.mapProduct.categoryNameMap(tree), demand, catalogues: full, recipients });
    const walk = (nodes, parent) => nodes.flatMap((n) => (n.children.length ? walk(n.children, n.label) : [{ id: n.id, label: n.label, path: parent ? `${parent} / ${n.label}` : n.label }]));
    W.leaves = walk(PM.mapProduct.mapCategoryTreeToOptions(tree).flatMap((r) => r.children), "").filter((l) => !["DEFAULT", "DEFAULT-SUB", "RETURNABLE"].includes(l.label));
    buildInfo();
    view();
  }

  function buildInfo() {
    const spellings = {};
    for (const p of W.all) if (p.brand) (spellings[norm(p.brand)] ??= new Map()).set(p.brand, ((spellings[norm(p.brand)] ?? new Map()).get(p.brand) ?? 0) + 1);
    W.brandLabel = Object.fromEntries(Object.entries(spellings).map(([k, m]) => [k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]]));
    const bySku = groupBy(W.all, (p) => norm(p.articleNumber));
    const byBarcode = groupBy(W.all.filter((p) => p.barcode), (p) => norm(p.barcode));
    const byName = groupBy(W.all, (p) => norm(p.name).replace(/\s+/g, ""));
    W.info = new Map();
    for (const p of W.all) {
      const vm = PM.mapProduct.mapProductToListItem(p, false, W.names, W.demand);
      const tax = p.tax === undefined || p.tax === null || p.tax === "" ? null : Number(p.tax);
      const threshold = p.stockThreshold ?? 5;
      const stock = p.stock ?? 0;
      const catalogues = W.catalogues.filter((c) => (c.products ?? []).some((e) => e.id === p.id));
      const custom = catalogues.filter((c) => {
        const e = c.products.find((x) => x.id === p.id);
        return p.price !== undefined && e.price !== undefined && Math.abs(e.price - p.price) > 0.005;
      });
      const cat = p.categoryReference ? W.names[p.categoryReference] : undefined;
      const supplier = FG_SUPPLIER_BY_BRAND[norm(p.brand)] ?? "";
      const dupe = (p.articleNumber && bySku[norm(p.articleNumber)]?.length > 1) || (p.barcode && byBarcode[norm(p.barcode)]?.length > 1) || byName[norm(p.name).replace(/\s+/g, "")]?.length > 1;
      W.info.set(p.id, {
        vm, tax, cat, supplier, catalogues, custom, dupe,
        price: vm.price,
        mrp: p.maxRetailPrice > 0 ? p.maxRetailPrice : undefined,
        inOrders: W.demand[p.articleNumber] ?? 0,
        stockLvl: stock < 0 ? "negative" : stock === 0 ? "out" : stock <= threshold ? "low" : "in",
        hasImage: Boolean(p.thumbnailUrl || p.imagesReference?.length),
        brandVariant: p.brand && spellings[norm(p.brand)].size > 1,
        hay: norm([p.name, p.articleNumber, p.barcode, p.brand, cat, supplier].filter(Boolean).join(" ")),
      });
    }
    W.dupGroups = [
      ...Object.values(bySku).filter((g) => g.length > 1).map((g) => ({ key: `sku:${norm(g[0].articleNumber)}`, reason: "Same SKU", items: g })),
      ...Object.values(byBarcode).filter((g) => g.length > 1).map((g) => ({ key: `bar:${norm(g[0].barcode)}`, reason: "Same barcode", items: g })),
      ...Object.values(byName).filter((g) => g.length > 1).map((g) => ({ key: `name:${norm(g[0].name)}`, reason: "Same name", items: g })),
    ];
  }
  function groupBy(list, key) {
    const out = {};
    for (const x of list) (out[key(x)] ??= []).push(x);
    return out;
  }

  // ---- matching ------------------------------------------------------------------------------
  const MISSING = {
    tax: { label: "Tax", test: (p, i) => i.tax === null },
    category: { label: "Category", test: (p, i) => !i.cat },
    barcode: { label: "Barcode", test: (p) => !p.barcode },
    image: { label: "Image", test: (p, i) => !i.hasImage },
    supplier: { label: "Supplier", test: (p, i) => !i.supplier },
    mrp: { label: "MRP", test: (p, i) => i.mrp === undefined },
  };
  const ATTENTION = {
    missingTax: { label: "Missing tax", dot: "bg-red-500", test: (p, i) => i.tax === null, action: "tax", cta: "Set tax" },
    lowStock: { label: "Low stock", dot: "bg-orange-500", test: (p, i) => i.stockLvl === "low", action: "tags", cta: "Tag them" },
    outOfStock: { label: "Out of stock / negative", dot: "bg-red-400", test: (p, i) => i.stockLvl === "out" || i.stockLvl === "negative", action: "stock", cta: "Adjust stock" },
    missingCategory: { label: "Missing category", dot: "bg-yellow-400", test: (p, i) => !i.cat, action: "category", cta: "Set category" },
    priceConflict: { label: "Price above MRP", dot: "bg-blue-500", test: (p, i) => i.mrp !== undefined && i.price !== undefined && i.price > i.mrp, action: "mrp", cta: "Fix MRP" },
    duplicates: { label: "Possible duplicates", dot: "bg-purple-500", test: (p, i) => i.dupe, action: "dupes", cta: "Review" },
    brandVariants: { label: "Brand spelled differently", dot: "bg-pink-500", test: (p, i) => i.brandVariant, action: "brand", cta: "Fix brand" },
    missingBarcode: { label: "Missing barcode", dot: "bg-gray-400", test: (p) => !p.barcode },
    noCatalogue: { label: "Not in any catalogue", dot: "bg-teal-500", test: (p, i) => i.catalogues.length === 0, action: "catalogueAdd", cta: "Add to catalogue" },
  };
  const RULE_FIELDS = {
    stock: { label: "Stock", ops: [["lt", "less than"], ["gt", "greater than"]], input: "number" },
    category: { label: "Category", ops: [["is", "is"]], input: "category" },
    status: { label: "Status", ops: [["is", "is"], ["not", "is not"]], input: "status" },
    tax: { label: "Tax", ops: [["is", "is"], ["missing", "is missing"]], input: "tax" },
    missing: { label: "Missing field", ops: [["is", "is"]], input: "missing" },
    catalogue: { label: "Catalogue", ops: [["in", "is in"], ["none", "is in no catalogue"]], input: "catalogue" },
    customPrice: { label: "Catalogue-specific price", ops: [["exists", "exists"]], input: null },
    edited: { label: "Edited this session", ops: [["yes", "yes"]], input: null },
    priceAge: { label: "Last price update", ops: [["gt", "more than … days ago"]], input: "number", disabled: "Needs price history — no source yet" },
    sales: { label: "Sales in last … days", ops: [["zero", "= 0"]], input: "number", disabled: "Needs sales data — no source yet" },
  };
  function ruleTest(r, p, i) {
    switch (r.field) {
      case "stock": return r.value === "" ? true : r.op === "lt" ? (p.stock ?? 0) < Number(r.value) : (p.stock ?? 0) > Number(r.value);
      case "category": return !r.value || p.categoryReference === r.value;
      case "status": return !r.value || (r.op === "is" ? p.status === r.value : p.status !== r.value);
      case "tax": return r.op === "missing" ? i.tax === null : r.value === "" || i.tax === Number(r.value);
      case "missing": return !r.value || MISSING[r.value].test(p, i);
      case "catalogue": return r.op === "none" ? i.catalogues.length === 0 : !r.value || i.catalogues.some((c) => c.id === r.value);
      case "customPrice": return i.custom.length > 0;
      case "edited": return W.recent.edited.has(p.id);
      default: return true;
    }
  }
  function matches(p, query) {
    const i = W.info.get(p.id);
    const f = query.f;
    if (!i) return false;
    if (query.q && !norm(query.q).split(/\s+/).filter(Boolean).every((t) => i.hay.includes(t))) return false;
    if (f.cats.length && !f.cats.includes(p.categoryReference)) return false;
    if (f.brands.length && !f.brands.includes(norm(p.brand))) return false;
    if (f.suppliers.length && !f.suppliers.includes(i.supplier)) return false;
    if (f.statuses.length && !f.statuses.includes(p.status)) return false;
    if (f.taxes.length && !f.taxes.includes(i.tax === null ? "missing" : String(i.tax))) return false;
    if (f.stock.length && !f.stock.includes(i.stockLvl)) return false;
    if (f.tags.length && !(p.tags ?? []).some((t) => f.tags.includes(t))) return false;
    if (f.catalogues.length && !i.catalogues.some((c) => f.catalogues.includes(c.id))) return false;
    if (f.missing.length && !f.missing.every((m) => MISSING[m].test(p, i))) return false;
    if (f.priceMin !== "" && !(i.price >= Number(f.priceMin))) return false;
    if (f.priceMax !== "" && !(i.price <= Number(f.priceMax))) return false;
    if (f.attention && !ATTENTION[f.attention].test(p, i)) return false;
    if (f.recent && !W.recent[f.recent].has(p.id)) return false;
    if (f.rules.length && !f.rules.every((r) => ruleTest(r, p, i))) return false;
    return true;
  }
  const currentQuery = () => ({ q: W.q, f: structuredClone(W.f) });
  const hasCriteria = (query) => Boolean(query.q) || describeFilters(query.f).length > 0;
  function describeFilters(f) {
    const parts = [];
    const names = (ids, label) => ids.map(label).join(", ");
    if (f.cats.length) parts.push(["cats", `Category: ${names(f.cats, (x) => W.names[x] ?? x)}`]);
    if (f.brands.length) parts.push(["brands", `Brand: ${names(f.brands, (x) => W.brandLabel[x] ?? x)}`]);
    if (f.suppliers.length) parts.push(["suppliers", `Supplier: ${f.suppliers.join(", ")}`]);
    if (f.statuses.length) parts.push(["statuses", `Status: ${names(f.statuses, (x) => FG_STATUS_LABEL[x])}`]);
    if (f.taxes.length) parts.push(["taxes", `Tax: ${names(f.taxes, (x) => (x === "missing" ? "Missing" : `${x}%`))}`]);
    if (f.stock.length) parts.push(["stock", `Stock: ${names(f.stock, (x) => STOCK_LABEL[x])}`]);
    if (f.tags.length) parts.push(["tags", `Tag: ${f.tags.join(", ")}`]);
    if (f.catalogues.length) parts.push(["catalogues", `Catalogue: ${names(f.catalogues, (x) => W.catalogues.find((c) => c.id === x)?.name ?? x)}`]);
    if (f.missing.length) parts.push(["missing", `Missing: ${names(f.missing, (x) => MISSING[x].label)}`]);
    if (f.priceMin !== "" || f.priceMax !== "") parts.push(["price", `Price: ${f.priceMin || "0"}–${f.priceMax || "any"}`]);
    if (f.attention) parts.push(["attention", `Needs attention: ${ATTENTION[f.attention].label}`]);
    if (f.recent) parts.push(["recent", `Recently ${f.recent}`]);
    if (f.rules.length) parts.push(["rules", `Smart: ${f.rules.map(describeRule).join(" and ")}`]);
    return parts;
  }
  function describeQuery(query) {
    const parts = describeFilters(query.f).map(([, t]) => t);
    if (query.q) parts.unshift(`Search: “${query.q}”`);
    return parts.length ? parts.join(" · ") : "All products";
  }
  function describeRule(r) {
    const d = RULE_FIELDS[r.field];
    const op = d.ops.find(([k]) => k === r.op)?.[1] ?? "";
    const v = r.field === "category" ? W.names[r.value] : r.field === "status" ? FG_STATUS_LABEL[r.value] : r.field === "missing" ? MISSING[r.value]?.label : r.field === "catalogue" ? W.catalogues.find((c) => c.id === r.value)?.name : r.field === "tax" && r.value !== "" ? `${r.value}%` : r.value;
    return `${d.label} ${op}${v !== undefined && v !== "" && op !== "is missing" && op !== "is in no catalogue" ? ` ${v}` : ""}`;
  }
  const STOCK_LABEL = { in: "In stock", low: "Low stock", out: "Out of stock", negative: "Negative stock" };

  // ---- view: filter → sort → page -------------------------------------------------------------
  function view() {
    const query = currentQuery();
    if (W.showSel && !selectedIds().size) W.showSel = false;
    const list = W.showSel ? selectedProducts() : W.all.filter((p) => matches(p, query));
    const { key, dir } = W.sort;
    const val = (p) => {
      const i = W.info.get(p.id);
      return key === "price" ? i.price ?? -Infinity : key === "stock" ? p.stock ?? 0 : key === "sku" ? norm(p.articleNumber) : key === "category" ? norm(i.cat) : key === "brand" ? norm(p.brand) : key === "status" ? p.status : norm(p.name);
    };
    list.sort((a, b) => (val(a) < val(b) ? -dir : val(a) > val(b) ? dir : 0));
    W.filtered = list;
    const pages = Math.max(1, Math.ceil(list.length / FG_PAGE));
    if (W.page > pages) W.page = pages;
    const page = list.slice((W.page - 1) * FG_PAGE, W.page * FG_PAGE);
    S.products = page;
    S.items = page.map((p) => W.info.get(p.id).vm);
    S.totalDoc = list.length;
    S.currentPage = W.page;
    if (W.cursor >= page.length) W.cursor = page.length - 1;
  }

  // ---- selection engine (spec §8–24, §51–53) ------------------------------------------------
  // queries: [{query, label}] resolved on demand ("mode: query"); include: id → how it was added;
  // exclude: ids removed by hand. Resolved to ids only when an action runs.
  function selectedIds() {
    const ids = new Set(W.sel.include.keys());
    for (const { query } of W.sel.queries) for (const p of W.all) if (matches(p, query)) ids.add(p.id);
    for (const x of W.sel.exclude) ids.delete(x);
    return ids;
  }
  const selectedProducts = () => {
    const ids = selectedIds();
    return W.all.filter((p) => ids.has(p.id));
  };
  const inQueries = (id) => W.sel.queries.some(({ query }) => matches(W.byId.get(id), query));
  function setSelected(id, on, how = "Added manually") {
    if (on) {
      W.sel.exclude.delete(id);
      if (!inQueries(id)) W.sel.include.set(id, how);
    } else {
      W.sel.include.delete(id);
      if (inQueries(id)) W.sel.exclude.add(id);
    }
  }
  function addQuery(query, label) {
    W.sel.queries.push({ query, label: label ?? describeQuery(query) });
    const n = W.all.filter((p) => matches(p, query)).length;
    onNotify(`${plural(n, "product")} added to the selection`, "success");
  }
  function addIds(ids, how) {
    for (const id of ids) setSelected(id, true, how);
    onNotify(`${plural(ids.length, "product")} added to the selection`, "success");
  }
  const clearSelection = () => (W.sel = { queries: [], include: new Map(), exclude: new Set() });
  function provenance() {
    const out = [];
    for (const { query, label } of W.sel.queries) out.push({ kind: "from", text: label, count: W.all.filter((p) => matches(p, query)).length });
    const groups = {};
    for (const [id, how] of W.sel.include) (groups[how] ??= []).push(W.byId.get(id)?.name ?? id);
    for (const [how, names] of Object.entries(groups)) out.push({ kind: "added", text: how, names, count: names.length });
    if (W.sel.exclude.size) out.push({ kind: "removed", text: "Removed", names: [...W.sel.exclude].map((id) => W.byId.get(id)?.name ?? id), count: W.sel.exclude.size });
    return out;
  }

  // ---- handlers ------------------------------------------------------------------------------
  const H = (name, fn) => (K.on[`fg.${name}`] = fn);
  // Addendum 008 C2: the bucket is shown in the page's own table; searching or filtering goes back to all products.
  function showSelected(on = true) {
    W.open = null;
    W.showSel = on;
    W.page = 1;
    view();
  }
  H("showSel", (on) => showSelected(on === "1"));
  const applySearch = K.debounce((v) => ((W.q = v.trim()), (W.showSel = false), (W.page = 1), view(), K.update()), 250);
  H("search", (_, ev) => ((W.qDraft = ev.target.value), applySearch(W.qDraft)));
  H("searchKey", (_, ev) => {
    if (ev.key === "ArrowDown") (ev.preventDefault(), ev.target.blur(), (W.cursor = 0));
    if (ev.key === "Escape") (ev.target.blur());
  });
  H("sort", (key) => {
    W.sort = W.sort.key === key ? { key, dir: -W.sort.dir } : { key, dir: 1 };
    view();
  });
  H("page", (pg) => ((W.page = Number(pg)), view()));
  H("check", (id, ev) => {
    const on = !selectedIds().has(id);
    if (ev.shiftKey && W.anchorId) {
      const ids = W.filtered.map((p) => p.id);
      const [a, b] = [ids.indexOf(W.anchorId), ids.indexOf(id)].sort((x, y) => x - y);
      if (a >= 0 && b >= 0) for (const x of ids.slice(a, b + 1)) setSelected(x, on);
    } else setSelected(id, on);
    W.anchorId = id;
  });
  H("checkPage", () => {
    const sel = selectedIds();
    const all = S.products.every((p) => sel.has(p.id));
    for (const p of S.products) setSelected(p.id, !all, "Selected on page");
  });
  H("selectResults", () => addQuery(currentQuery()));
  H("clearSel", () => (clearSelection(), view()));
  H("removeSel", (id) => setSelected(id, false));
  H("dropSource", (idx) => W.sel.queries.splice(Number(idx), 1));
  H("clearFilter", (key) => {
    if (key === "search") (W.q = ""), (W.qDraft = "");
    else if (key === "price") (W.f.priceMin = ""), (W.f.priceMax = "");
    else W.f[key] = emptyFilters()[key];
    W.showSel = false;
    W.page = 1;
    view();
  });
  H("clearAll", () => ((W.f = emptyFilters()), (W.q = ""), (W.qDraft = ""), (W.showSel = false), (W.page = 1), view()));
  H("attention", (key) => {
    if (key === "duplicates") return (W.open = "dupes");
    W.f = { ...emptyFilters(), attention: W.f.attention === key ? null : key };
    W.showSel = false;
    W.page = 1;
    view();
  });
  H("open", (what) => {
    W.open = what;
    if (what === "picker") W.pickerView = "home";
  });
  H("close", () => (W.open = null));
  H("add", () => (W.quick = { tab: "quick", name: "", sku: "", category: "", price: "", unit: "Piece", tax: "", busy: false }));

  // filter popovers — draft until Apply (infographic panel 2)
  H("pop", (key) => {
    if (W.pop === key) return (W.pop = null);
    W.pop = key;
    W.popDraft = { values: [...(W.f[key] ?? [])], search: "", sort: "count", priceMin: W.f.priceMin, priceMax: W.f.priceMax, catalogues: [...W.f.catalogues], missing: [...W.f.missing] };
  });
  H("popOutside", (key, ev) => {
    if (ev.target.closest(`[data-fg-pop="${key}"]`)) return;
    W.pop = null;
  });
  H("popToggle", (v) => {
    const d = W.popDraft;
    d.values = d.values.includes(v) ? d.values.filter((x) => x !== v) : [...d.values, v];
  });
  H("popListToggle", (arg) => {
    const [list, v] = arg.split("|");
    const d = W.popDraft;
    d[list] = d[list].includes(v) ? d[list].filter((x) => x !== v) : [...d[list], v];
  });
  H("popSearch", (_, ev) => (W.popDraft.search = ev.target.value));
  H("popSearchClear", () => (W.popDraft.search = ""));
  H("popSort", (_, ev) => (W.popDraft.sort = ev.target.value));
  H("popPrice", (which, ev) => (W.popDraft[which] = ev.target.value));
  H("popClear", () => Object.assign(W.popDraft, { values: [], priceMin: "", priceMax: "", catalogues: [], missing: [] }));
  H("popApply", (key) => {
    const d = W.popDraft;
    if (key === "more") Object.assign(W.f, { priceMin: d.priceMin, priceMax: d.priceMax, catalogues: d.catalogues, missing: d.missing });
    else W.f[key] = d.values;
    if (key === "cats") W.catUsed = [...new Set([...d.values, ...W.catUsed])];
    W.pop = null;
    W.showSel = false;
    W.page = 1;
    view();
  });

  // row menu + keyboard
  H("rowMenu", (id, ev, el) => (W.rowMenu = W.rowMenu?.id === id ? null : { id, anchor: el.getBoundingClientRect() }));
  H("rowMenuClose", () => (W.rowMenu = null));
  H("rowAct", (arg) => {
    const [action, id] = arg.split("|");
    W.rowMenu = null;
    const p = W.byId.get(id);
    if (action === "edit") return openDrawer(id);
    if (action === "delete") return requestBulkDelete([id]);
    openWizard(action, [p], "row");
  });
  H("keys", () => (W.open = "keys"));
  document.addEventListener("keydown", (ev) => {
    const t = ev.target;
    if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
    if (W.open || W.wizard || W.quick || W.pop || W.rowMenu || W.colEdit || S.drawerOpen || S.pendingDelete || isInlineEditing()) return;
    const rows = S.products;
    const row = rows[W.cursor];
    const k = ev.key;
    if (k === "/") return (ev.preventDefault(), document.querySelector('[data-testid="fg-search-input"]')?.focus());
    if (k === "?") return ((W.open = "keys"), K.update());
    if (k === "ArrowDown" || k === "j") return (ev.preventDefault(), (W.cursor = Math.min(rows.length - 1, W.cursor + 1)), K.update());
    if (k === "ArrowUp" || k === "k") return (ev.preventDefault(), (W.cursor = Math.max(0, W.cursor - 1)), K.update());
    if (!row) return;
    if (k === "Enter") return (location.href = detailPath(row.id));
    if (k === "x" || k === " ") return (ev.preventDefault(), setSelected(row.id, !selectedIds().has(row.id)), K.update());
    const map = { e: "edit", p: "price", t: "tax", i: "status" };
    if (map[k]) {
      ev.preventDefault();
      if (map[k] === "edit") return openDrawer(row.id);
      openWizard(map[k], [row], "row");
      K.update();
    }
  });

  // ---- render: finder (search + filters + attention + selection bar) -----------------------------
  function filterButton(key, label, n) {
    const active = n > 0;
    return `<div class="relative" data-fg-pop="${key}"><button type="button" data-on-click="fg.pop|${key}" data-testid="fg-filter-${key}" class="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition ${active ? "border-red-300 bg-red-50 font-medium text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"}">${key === "more" ? K.icon("Filter", "h-3.5 w-3.5") : ""}${label}${active ? ` (${n})` : ""}${K.icon("ChevronDown", "h-3.5 w-3.5")}</button>${W.pop === key ? popover(key) : ""}</div>`;
  }
  function optionsFor(key) {
    const count = (fn) => {
      const m = {};
      for (const p of W.all) for (const v of [].concat(fn(p, W.info.get(p.id)))) if (v !== undefined && v !== "") m[v] = (m[v] ?? 0) + 1;
      return m;
    };
    if (key === "cats") {
      const c = count((p) => p.categoryReference);
      return W.leaves.map((l) => ({ value: l.id, label: l.path, count: c[l.id] ?? 0 }));
    }
    if (key === "brands") return Object.entries(count((p) => (p.brand ? norm(p.brand) : undefined))).map(([v, n]) => ({ value: v, label: W.brandLabel[v], count: n }));
    if (key === "suppliers") return Object.entries(count((p, i) => i.supplier)).map(([v, n]) => ({ value: v, label: v, count: n }));
    if (key === "statuses") {
      const c = count((p) => p.status);
      return FG_STATUSES.map(([v, l]) => ({ value: v, label: l, count: c[v] ?? 0 }));
    }
    if (key === "taxes") {
      const c = count((p, i) => (i.tax === null ? "missing" : String(i.tax)));
      return [...new Set([...FG_TAX_RATES.map(String), ...Object.keys(c).filter((x) => x !== "missing")])].sort((a, b) => a - b).map((v) => ({ value: v, label: `${v}%`, count: c[v] ?? 0 })).concat([{ value: "missing", label: "Missing", count: c.missing ?? 0 }]);
    }
    if (key === "stock") {
      const c = count((p, i) => i.stockLvl);
      return Object.entries(STOCK_LABEL).map(([v, l]) => ({ value: v, label: l, count: c[v] ?? 0 }));
    }
    if (key === "tags") return Object.entries(count((p) => p.tags ?? [])).map(([v, n]) => ({ value: v, label: v, count: n }));
    return [];
  }
  function checkRow(on, label, count, action) {
    return `<label class="mb-0.5 flex cursor-pointer items-center gap-2.5 rounded-md border px-2 py-1.5 text-sm ${on ? "border-green-500 bg-green-50 dark:bg-green-900/20" : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-700"}"><input type="checkbox"${K.attr("checked", on)} data-on-change="${action}" class="h-4 w-4 rounded border-gray-400 accent-emerald-600"><span class="min-w-0 flex-1 truncate ${on ? "font-medium text-green-800 dark:text-green-300" : "text-gray-700 dark:text-gray-200"}">${esc(label)}</span>${count !== undefined ? `<span class="text-xs tabular-nums text-gray-400">${count}</span>` : ""}</label>`;
  }
  function popover(key) {
    const d = W.popDraft;
    const shell = (title, body, footNote) => `<div data-on-outside="fg.popOutside|${key}" data-testid="fg-pop-${key}" class="absolute left-0 top-11 z-[60] w-80 rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
      <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700"><h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">${title}</h3><button type="button" data-on-click="fg.pop|${key}" aria-label="Close" class="text-gray-400 hover:text-gray-600">${K.icon("X", "h-4 w-4")}</button></div>
      ${body}
      <div class="flex items-center gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-700"><span class="mr-auto text-xs text-gray-500">${footNote}</span><button type="button" data-on-click="fg.popClear" class="h-8 rounded-md border border-gray-200 px-3 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300">Clear</button><button type="button" data-on-click="fg.popApply|${key}" data-testid="fg-pop-apply" class="h-8 rounded-md bg-green-600 px-4 text-xs font-semibold text-white hover:bg-green-700">Apply</button></div></div>`;
    if (key === "more") {
      return shell("More filters", `<div class="max-h-96 space-y-4 overflow-y-auto px-4 py-3">
        <div><p class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Price (list price)</p><div class="flex items-center gap-2"><input type="number" min="0" value="${esc(d.priceMin)}" data-on-input="fg.popPrice|priceMin" placeholder="Min" class="h-9 w-full rounded-md border border-gray-200 px-2 text-sm dark:border-gray-600 dark:bg-gray-700"><span class="text-gray-400">–</span><input type="number" min="0" value="${esc(d.priceMax)}" data-on-input="fg.popPrice|priceMax" placeholder="Max" class="h-9 w-full rounded-md border border-gray-200 px-2 text-sm dark:border-gray-600 dark:bg-gray-700"></div></div>
        <div><p class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">In catalogue</p>${W.catalogues.map((c) => checkRow(d.catalogues.includes(c.id), c.name, c.products.length, `fg.popListToggle|catalogues|${c.id}`)).join("")}</div>
        <div><p class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Missing</p>${Object.entries(MISSING).map(([k, m]) => checkRow(d.missing.includes(k), m.label, W.all.filter((p) => m.test(p, W.info.get(p.id))).length, `fg.popListToggle|missing|${k}`)).join("")}</div>
      </div>`, "");
    }
    const titles = { cats: "Select categories", brands: "Brand", suppliers: "Supplier", statuses: "Status", taxes: "Tax", stock: "Stock", tags: "Tags" };
    let opts = optionsFor(key);
    if (d.search) opts = opts.filter((o) => norm(o.label).includes(norm(d.search)));
    if (d.sort === "az") opts.sort((a, b) => a.label.localeCompare(b.label));
    else if (d.sort === "recent" && key === "cats") opts.sort((a, b) => (W.catUsed.indexOf(a.value) + 1 || 1e9) - (W.catUsed.indexOf(b.value) + 1 || 1e9));
    else opts.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const note = key === "suppliers" ? `<p class="px-4 pt-2 text-[11px] text-amber-600">Supplier is a proposed field — derived from brand in discovery.</p>` : "";
    // Addendum 008 C1: every multi-select has search, a ✕, and a "showing results for" row whose Clear keeps the ticks.
    return shell(titles[key], `${note}<div class="flex gap-2 px-4 pt-3"><div class="relative flex-1">${K.icon("Search", "pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400")}<input value="${esc(d.search)}" data-on-input="fg.popSearch" placeholder="Search ${titles[key].toLowerCase().replace("select ", "")}…" data-testid="fg-pop-search" class="h-9 w-full rounded-md border border-gray-200 pl-8 pr-8 text-sm dark:border-gray-600 dark:bg-gray-700">${d.search ? `<button type="button" data-on-click="fg.popSearchClear" aria-label="Clear search" data-testid="fg-pop-search-x" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">${K.icon("X", "h-3.5 w-3.5")}</button>` : ""}</div>${key === "cats" ? `<select data-on-change="fg.popSort" aria-label="Sort categories" class="h-9 rounded-md border border-gray-200 px-1 text-xs dark:border-gray-600 dark:bg-gray-700"><option value="count"${K.attr("selected", d.sort === "count")}>Most used</option><option value="az"${K.attr("selected", d.sort === "az")}>A–Z</option><option value="recent"${K.attr("selected", d.sort === "recent")}>Recently used</option></select>` : ""}</div>
      ${d.search ? `<div data-testid="fg-pop-results-for" class="mx-4 mt-2 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/10 dark:text-blue-300"><span class="min-w-0 flex-1 truncate">Showing ${plural(opts.length, "result")} for “${esc(d.search)}”${d.values.length ? ` · ${d.values.length} ticked kept` : ""}</span><button type="button" data-on-click="fg.popSearchClear" data-testid="fg-pop-results-clear" class="font-semibold hover:underline">Clear</button></div>` : ""}
      <div class="max-h-72 overflow-y-auto px-2 py-2">${opts.map((o) => checkRow(d.values.includes(o.value), o.label, o.count, `fg.popToggle|${o.value}`)).join("") || `<p class="px-2 py-4 text-center text-sm text-gray-400">No matches</p>`}</div>`, `${d.values.length} selected`);
  }

  function renderFinder() {
    if (isInlineEditing()) return "";
    const f = W.f;
    const n = (k) => (f[k] ?? []).length;
    const moreN = f.catalogues.length + f.missing.length + (f.priceMin !== "" || f.priceMax !== "" ? 1 : 0);
    const chips = describeFilters(f);
    if (W.q) chips.unshift(["search", `Search: “${W.q}”`]);
    const attention = Object.entries(ATTENTION).map(([k, a]) => [k, a, W.all.filter((p) => a.test(p, W.info.get(p.id))).length]).filter(([, , c]) => c > 0);
    return `<div class="min-w-0 rounded-lg ring-1 ring-black/5 bg-white dark:bg-gray-800 mb-4"><div class="p-4 space-y-3">
      <div class="flex flex-col md:flex-row gap-2">
        <div class="flex-1" style="position:relative">${K.icon("Search", "pointer-events-none text-gray-400").replace("<svg", '<svg style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);width:1rem;height:1rem"')}<input type="search" data-testid="fg-search-input" placeholder="Search product, SKU, barcode, brand or category…" value="${esc(W.qDraft)}" data-on-input="fg.search" data-on-keydown="fg.searchKey" class="block w-full h-10 border border-gray-200 bg-white pl-9 pr-10 py-1 text-sm focus:outline-none focus:border-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 leading-5 rounded-md"><kbd class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-gray-200 px-1.5 text-[11px] text-gray-400 dark:border-gray-600">/</kbd></div>
        <button type="button" data-on-click="fg.keys" title="Keyboard shortcuts" class="hidden md:inline-flex h-10 items-center gap-1.5 rounded-md border border-gray-200 px-3 text-xs text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300">${K.icon("Keyboard", "h-4 w-4")}Shortcuts</button>
      </div>
      <div class="flex flex-wrap gap-2" data-testid="fg-filters">
        ${filterButton("cats", "Category", n("cats"))}${filterButton("brands", "Brand", n("brands"))}${filterButton("suppliers", "Supplier", n("suppliers"))}${filterButton("statuses", "Status", n("statuses"))}${filterButton("taxes", "Tax", n("taxes"))}${filterButton("stock", "Stock", n("stock"))}${filterButton("tags", "Tags", n("tags"))}${filterButton("more", "More filters", moreN)}
      </div>
      ${chips.length ? `<div data-testid="fg-active-filters" class="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm dark:border-red-900/40 dark:bg-red-900/10">${K.icon("Filter", "h-4 w-4 text-red-500")}<span class="font-medium text-red-700 dark:text-red-300">${W.filtered.length} results shown for:</span>${chips.map(([k, t]) => `<span class="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2.5 py-0.5 text-xs font-medium text-red-600 dark:border-red-800 dark:bg-gray-800 dark:text-red-300">${esc(t)}<button type="button" data-on-click="fg.clearFilter|${k}" aria-label="Remove filter ${esc(t)}">${K.icon("X", "h-3 w-3")}</button></span>`).join("")}<button type="button" data-on-click="fg.clearAll" data-testid="fg-clear-all" class="ml-auto text-xs font-semibold text-red-600 hover:underline">Clear all</button></div>` : ""}
      ${attention.length ? `<div data-testid="fg-attention" class="flex flex-wrap items-center gap-2"><span class="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">${K.icon("AlertTriangle", "h-3.5 w-3.5 text-amber-500")}Needs attention</span>${attention.map(([k, a, c]) => `<button type="button" data-on-click="fg.attention|${k}" data-testid="fg-attention-${k}" class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${f.attention === k ? "border-gray-800 bg-gray-800 text-white dark:border-gray-200 dark:bg-gray-200 dark:text-gray-900" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"}"><span class="h-2 w-2 rounded-full ${a.dot}"></span><span class="font-semibold tabular-nums">${c}</span>${esc(a.label)}</button>`).join("")}</div>` : ""}
    </div></div>
    ${selectionBar()}`;
  }

  function selectionBar() {
    const ids = selectedIds();
    const query = currentQuery();
    const filtered = W.filtered.length;
    const allFilteredSelected = filtered > 0 && W.filtered.every((p) => ids.has(p.id));
    const pageAll = S.products.length > 0 && S.products.every((p) => ids.has(p.id));
    const attn = W.f.attention && ATTENTION[W.f.attention];
    const offerAll = !allFilteredSelected && (hasCriteria(query) || pageAll) && filtered > S.products.length - (pageAll ? 0 : 1);
    const resultsLine = W.showSel ? `<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-300"><span data-testid="fg-result-count">Showing <b class="tabular-nums">${filtered}</b> selected ${filtered === 1 ? "product" : "products"}</span><button type="button" data-on-click="fg.showSel|0" data-testid="fg-show-all" class="text-xs font-semibold text-green-700 hover:underline">Show all products</button></div>` : `<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-300"><span data-testid="fg-result-count">Showing <b class="tabular-nums">${filtered}</b> of ${plural(W.all.length, "product")}${hasCriteria(query) ? " for these filters" : ""}</span>
      ${offerAll ? `<button type="button" data-on-click="fg.selectResults" data-testid="fg-select-all-results" class="inline-flex items-center gap-1.5 rounded-md border border-green-600 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-50 dark:text-green-400">${K.icon("ListChecks", "h-3.5 w-3.5")}Select all ${filtered} results</button>` : ""}
      ${pageAll && !allFilteredSelected ? `<span class="text-xs text-gray-500">All ${S.products.length} on this page are selected.</span>` : ""}
      ${attn?.action && filtered ? `<button type="button" data-on-click="fg.attnAct" data-testid="fg-attention-cta" class="inline-flex items-center gap-1 rounded-md bg-gray-800 px-2.5 py-1 text-xs font-semibold text-white dark:bg-gray-200 dark:text-gray-900">${esc(attn.cta)} for ${filtered} →</button>` : ""}
      <button type="button" data-on-click="fg.open|activity" data-testid="fg-activity-btn" class="ml-auto inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-green-700">${K.icon("History", "h-3.5 w-3.5")}Recent changes${W.activity.length ? ` (${W.activity.length})` : ""}</button></div>`;
    if (!ids.size) return `<div class="mb-3 px-1">${resultsLine}</div>`;
    const prov = provenance();
    return `<div class="mb-3 px-1">${resultsLine}</div>
    <div data-testid="fg-selection-bar" class="sticky top-0 z-30 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 shadow-sm dark:border-green-900/40 dark:bg-green-900/10">
      <span class="inline-flex items-center gap-1.5 text-sm font-semibold text-green-800 dark:text-green-300">${K.icon("CheckCircle2", "h-4 w-4")}<span data-testid="fg-selected-count">${ids.size}</span> ${ids.size === 1 ? "product" : "products"} selected</span>
      <span class="min-w-0 max-w-[40%] truncate text-xs text-green-700/80 dark:text-green-300/80" title="${esc(prov.map((x) => `${x.text}${x.names ? `: ${x.names.join(", ")}` : ""}`).join(" · "))}">${esc(prov.map((x) => (x.kind === "from" ? `From ${x.text}` : x.kind === "removed" ? `−${x.count} removed` : `+${x.count} ${x.text.toLowerCase()}`)).join(" · "))}</span>
      <div class="ml-auto flex flex-wrap gap-2">
        <button type="button" data-on-click="fg.showSel|${W.showSel ? 0 : 1}" data-testid="fg-view-selected" class="h-8 rounded-md border border-green-300 bg-white px-3 text-xs font-medium text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-gray-800 dark:text-green-300">${W.showSel ? "Show all" : "View selected"}</button>
        <button type="button" data-on-click="fg.open|picker" data-testid="fg-add-more" class="h-8 rounded-md border border-green-300 bg-white px-3 text-xs font-medium text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-gray-800 dark:text-green-300">Add more</button>
        <button type="button" data-on-click="fg.saveSelOpen" disabled title="Coming soon — saved selections are not in the first release" data-testid="fg-save-selection" class="inline-flex h-8 items-center gap-1 rounded-md border border-green-300 bg-white px-3 text-xs font-medium text-green-800 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-green-800 dark:bg-gray-800 dark:text-green-300">${K.icon("Star", "h-3.5 w-3.5")}Save</button>
        <button type="button" data-on-click="fg.exportList" data-testid="fg-export-selection" class="inline-flex h-8 items-center gap-1 rounded-md border border-green-300 bg-white px-3 text-xs font-medium text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-gray-800 dark:text-green-300">${K.icon("Download", "h-3.5 w-3.5")}Export</button>
        <button type="button" data-on-click="fg.clearSel" data-testid="fg-clear-selection" class="h-8 rounded-md px-2 text-xs font-medium text-red-600 hover:bg-red-50">Clear</button>
        <button type="button" data-on-click="fg.open|actions" data-testid="fg-bulk-action-btn" class="inline-flex h-8 items-center gap-1 rounded-md bg-green-600 px-3 text-xs font-semibold text-white hover:bg-green-700">Bulk Action${K.icon("ChevronDown", "h-3.5 w-3.5")}</button>
      </div></div>`;
  }
  H("attnAct", () => {
    const a = ATTENTION[W.f.attention];
    if (a.action === "dupes") return (W.open = "dupes");
    openWizard(a.action, W.filtered.slice(), "attention", a.label);
  });

  // ---- render: table ------------------------------------------------------------------------------
  // Every unit price scales by the same factor, so the unit chain keeps its ratios.
  const sellingPatch = (p, f) => ({ patch: { price: round2(p.price * f), priceMap: scaleMap(p.priceMap, f), offerPriceMap: scaleMap(p.offerPriceMap, f) }, undo: { price: p.price, priceMap: p.priceMap, offerPriceMap: p.offerPriceMap } });

  // ---- Column edit (Addendum 008 C3): pencil on a header → that column becomes inputs for every row --
  const COL_EDIT = {
    price: { label: "Selling price", cur: (p) => W.info.get(p.id).price, show: (v) => money(v) },
    brand: { label: "Brand", cur: (p) => p.brand ?? "", show: (v) => v || "—" },
    category: { label: "Category", cur: (p) => p.categoryReference ?? "", show: (v) => W.names[v] ?? "—" },
  };
  H("colEdit", (key) => (W.colEdit = { key, drafts: {}, busy: false }));
  H("colSet", (id, ev) => (W.colEdit.drafts[id] = ev.target.value));
  H("colCancel", () => (W.colEdit = null));
  function colRows() {
    const { key, drafts } = W.colEdit;
    const c = COL_EDIT[key];
    return Object.entries(drafts).map(([id, raw]) => {
      const p = W.byId.get(id);
      const cur = c.cur(p);
      const row = { p, before: c.show(cur) };
      if (key === "price") {
        const n = round2(Number(raw));
        row.after = money(n);
        if (raw === "" || !(n > 0)) return { ...row, skip: "Enter a price above zero" };
        if (!(cur > 0)) return { ...row, skip: "No current price" };
        if (Math.abs(n - cur) < 0.005) return { ...row, skip: "No change" };
        return { ...row, ...sellingPatch(p, n / cur) };
      }
      const v = key === "brand" ? raw.trim() : raw;
      row.after = c.show(v);
      if (!v) return { ...row, skip: `Enter a ${c.label.toLowerCase()}` };
      if (v === cur) return { ...row, skip: "No change" };
      const field = key === "brand" ? "brand" : "categoryReference";
      return { ...row, patch: { [field]: v }, undo: { [field]: p[field] } };
    });
  }
  H("colSave", async () => {
    const ce = W.colEdit;
    const rows = colRows();
    ce.busy = true;
    K.update();
    try {
      const r = await execute({ action: "colEdit", cfg: {} }, rows);
      for (const x of r.ok) (W.recent.edited.add(x.p.id), ce.key === "price" && W.recent.priced.add(x.p.id));
      W.activity.unshift({
        id: ++actSeq, at: new Date(), action: `Edit ${COL_EDIT[ce.key].label.toLowerCase()} (column)`, count: rows.length,
        criteria: W.showSel ? "Selected products" : describeQuery(currentQuery()), detail: "Edited row by row in the table",
        ok: r.ok.length, skipped: r.skipped.length, failed: r.failed.length, rows: [...r.ok.map((x) => [x.p.name, "Updated", `${x.before} → ${x.after}`]), ...r.skipped.map((x) => [x.p.name, "Skipped", x.skip]), ...r.failed.map((x) => [x.p.name, "Failed", x.error])],
        undo: undoFor(null, r), undone: false,
      });
      onNotify(`${plural(r.ok.length, "product")} updated${r.failed.length ? `, ${r.failed.length} failed` : ""}`, r.failed.length ? "error" : "success");
      W.colEdit = null;
      await refresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Update failed", "error");
    } finally {
      if (W.colEdit) W.colEdit.busy = false;
      K.update();
    }
  });
  function colCell(p, key, html) {
    if (W.colEdit?.key !== key) return html;
    const d = W.colEdit.drafts[p.id];
    const v = d ?? COL_EDIT[key].cur(p) ?? "";
    const cls = `h-9 w-full rounded-md border ${d !== undefined ? "border-green-500 bg-green-50 dark:bg-green-900/20" : "border-gray-300 bg-white dark:bg-gray-800"} px-2 text-sm text-gray-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 dark:border-gray-600 dark:text-gray-100`;
    const on = `data-on-input="fg.colSet|${p.id}" data-testid="fg-col-${key}-${p.id}" aria-label="${esc(COL_EDIT[key].label)} for ${esc(p.name)}"`;
    if (key === "price") return `<input type="number" min="0" step="0.01" value="${esc(v)}" ${on} class="${cls} w-28 font-semibold tabular-nums">`;
    if (key === "brand") return `<input list="fg-brand-list" value="${esc(v)}" ${on} class="${cls} min-w-[8rem]">`;
    return `<select ${on.replace("data-on-input", "data-on-change")} class="${cls} min-w-[9rem]"><option value="">—</option>${W.leaves.map((l) => `<option value="${l.id}"${K.attr("selected", v === l.id)}>${esc(l.path)}</option>`).join("")}</select>`;
  }
  function colEditBar() {
    const ce = W.colEdit;
    if (!ce) return "";
    const changing = colRows().filter((r) => !r.skip).length;
    return `<div data-testid="fg-col-edit-bar" class="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-900/40 dark:bg-blue-900/10"><span class="mr-auto text-sm font-semibold text-blue-800 dark:text-blue-300">Editing ${esc(COL_EDIT[ce.key].label.toLowerCase())} · ${plural(changing, "change")}<span class="ml-3 text-xs font-normal text-blue-700/80 dark:text-blue-300/80">↑ ↓ or Enter move between rows${ce.key === "category" ? " · Alt+↓ opens the list" : ""}</span></span>
      ${secondaryBtn("fg.colCancel", "Cancel", ce.busy, "fg-col-cancel")}${primaryBtn("fg.colSave", ce.busy ? "Saving…" : `Save ${plural(changing, "change")}`, ce.busy || !changing, "fg-col-save")}</div>
      <datalist id="fg-brand-list">${Object.values(W.brandLabel).sort().map((b) => `<option value="${esc(b)}"></option>`).join("")}</datalist>`;
  }

  function renderTable() {
    const ids = selectedIds();
    const pageAll = S.products.length > 0 && S.products.every((p) => ids.has(p.id));
    const pageSome = S.products.some((p) => ids.has(p.id));
    const pencil = (key) => (COL_EDIT[key] && !W.colEdit ? `<button type="button" data-on-click="fg.colEdit|${key}" title="Edit ${COL_EDIT[key].label.toLowerCase()} for every row" aria-label="Edit ${COL_EDIT[key].label.toLowerCase()} column" data-testid="fg-col-edit-${key}" class="ml-1 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-green-700 dark:hover:bg-gray-700">${K.icon("FiEdit", "h-3.5 w-3.5")}</button>` : "");
    const th = (key, label, cls = "") => `<th class="px-4 py-2 ${cls}"><span class="inline-flex items-center"><button type="button" data-on-click="fg.sort|${key}" class="inline-flex items-center gap-1 uppercase hover:text-gray-800 dark:hover:text-gray-200">${label}${W.sort.key === key ? `<span class="text-green-600">${W.sort.dir > 0 ? "↑" : "↓"}</span>` : ""}</button>${pencil(key)}</span></th>`;
    const rows = S.products.map((p, idx) => {
      const i = W.info.get(p.id);
      const vm = i.vm;
      const on = ids.has(p.id);
      const name = tc(vm.displayName);
      const low = i.stockLvl === "low" || i.stockLvl === "out" || i.stockLvl === "negative";
      return `<tr data-key="${p.id}" data-testid="fg-row-${p.id}" class="border-b border-gray-200 ${on ? "bg-green-50/60 dark:bg-green-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-700/40"} ${W.cursor === idx ? "outline outline-2 -outline-offset-2 outline-green-500" : ""}">
        <td class="px-4 py-2"><input type="checkbox" data-testid="fg-select-${p.id}"${K.attr("checked", on)} data-on-click="fg.check|${p.id}" aria-label="Select ${esc(vm.displayName)}" class="h-4 w-4 rounded border-gray-400 accent-emerald-600"></td>
        <td class="px-4 py-2"><div class="flex items-center gap-3"><div class="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900">${ProductImage({ productId: p.id, directUrl: vm.thumbnailUrl, alt: name, className: "block h-10 w-10 rounded-lg object-cover" })}</div>
          <div class="min-w-[140px] max-w-80"><a href="${detailPath(p.id)}" data-testid="fg-name-${p.id}" class="block whitespace-normal break-words text-sm font-medium leading-5 text-gray-900 hover:text-green-700 dark:text-gray-100">${esc(name)}</a><span class="text-xs text-gray-500">${esc(p.measurement ? p.measurement.replace(/-/g, " · ") : "No unit set")}</span></div></div></td>
        <td class="px-4 py-2 text-sm tabular-nums"><span data-testid="fg-sku-${p.id}">${esc(p.articleNumber || "—")}</span>${i.dupe ? `<span title="Possible duplicate" class="ml-1 inline-block h-2 w-2 rounded-full bg-purple-500"></span>` : ""}</td>
        <td class="px-4 py-2 text-sm">${colCell(p, "category", i.cat ? esc(tc(i.cat)) : `<span class="text-yellow-600">Missing</span>`)}</td>
        <td class="px-4 py-2 text-sm">${colCell(p, "brand", p.brand ? esc(p.brand) : `<span class="text-gray-400">—</span>`)}</td>
        <td class="px-4 py-2"><div class="flex flex-col leading-tight">${colCell(p, "price", `<span data-testid="fg-price-${p.id}" class="text-sm font-semibold">${money(i.price)}</span>`)}<span class="text-xs text-gray-500">${i.mrp !== undefined ? `${money(i.mrp)} (MRP)` : "No MRP"}${i.tax === null ? ` · <span class="text-red-500">no tax</span>` : ` · ${i.tax}%`}</span></div></td>
        <td class="px-4 py-2"><div class="flex flex-col leading-tight"><span class="text-sm font-bold tabular-nums ${low ? "text-red-600" : "text-slate-800 dark:text-slate-200"}" data-testid="fg-stock-${p.id}">${i.stockLvl === "negative" ? p.stock : vm.stockLabel ?? 0} <span class="text-xs font-semibold text-slate-500">${esc(vm.stockUnitLabel ?? "")}</span></span><span class="text-xs ${low ? "text-red-500" : "text-gray-500"}">${i.stockLvl === "in" ? `${vm.canSell ?? 0} can sell · ${vm.inOrders ?? 0} in orders` : STOCK_LABEL[i.stockLvl]}</span></div></td>
        <td class="px-4 py-2"><span data-testid="fg-status-${p.id}" class="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${FG_STATUS_PILL[p.status] ?? FG_STATUS_PILL.DRAFT}"><span class="h-1.5 w-1.5 rounded-full bg-current"></span>${esc(FG_STATUS_LABEL[p.status] ?? p.status)}</span></td>
        <td class="px-4 py-2 text-right"><div class="flex items-center justify-end gap-1"><button type="button" data-on-click="pl.edit|${p.id}" title="Edit (E)" aria-label="Edit ${esc(vm.displayName)}" class="p-2 text-gray-600 hover:text-green-600">${K.icon("FiEdit")}</button><button type="button" data-on-click="fg.rowMenu|${p.id}" data-fg-rowmenu="${p.id}" title="More actions" aria-label="More actions for ${esc(vm.displayName)}" data-testid="fg-row-menu-${p.id}" class="p-2 text-gray-600 hover:text-green-600">${K.icon("FiMoreVertical")}</button></div></td>
      </tr>`;
    }).join("");
    const totalPages = Math.max(1, Math.ceil(W.filtered.length / FG_PAGE));
    return `${colEditBar()}<div class="hidden md:block w-full overflow-x-auto ring-1 ring-black/5 rounded-lg bg-white dark:bg-gray-800"><table class="w-full" data-testid="products-table">
      <thead class="text-xs font-medium tracking-wide text-left text-zinc-500 uppercase border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:text-gray-400 dark:bg-gray-800"><tr>
        <th class="px-4 py-2"><input type="checkbox"${K.attr("checked", pageAll)} data-on-click="fg.checkPage" aria-label="Select all on this page" title="Select all on this page" data-testid="fg-check-page" class="h-4 w-4 rounded border-gray-400 accent-emerald-600"${pageSome && !pageAll ? ' data-indeterminate="true"' : ""}></th>
        ${th("name", "Name")}${th("sku", "SKU")}${th("category", "Category")}${th("brand", "Brand")}${th("price", "Selling price")}${th("stock", "Stock")}${th("status", "Status")}<th class="px-4 py-2 text-right">Actions</th>
      </tr></thead>
      <tbody${K.attr("data-grid-nav", Boolean(W.colEdit))} class="bg-white divide-y divide-gray-100 dark:divide-gray-700 dark:bg-gray-800 text-gray-800 dark:text-gray-300">${rows}${S.products.length === 0 ? `<tr><td colspan="9" class="px-4 py-10 text-center text-sm text-gray-500" data-testid="products-list-empty">No products match. <button type="button" data-on-click="fg.clearAll" class="font-semibold text-green-700 hover:underline">Clear filters</button></td></tr>` : ""}</tbody>
    </table><div class="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">${Pagination("fg-pg", { currentPage: W.page, totalPages, resultsPerPage: FG_PAGE, totalResults: W.filtered.length, onPageChange: (pg) => ((W.page = pg), view()), testIdPrefix: "products" })}</div></div>
    ${W.rowMenu ? DropdownMenu("fg-row-menu", { anchor: W.rowMenu.anchor, anchorSelector: `[data-fg-rowmenu="${W.rowMenu.id}"]`, onClose: () => (W.rowMenu = null), testId: "fg-row-menu", children: [
      ["view", "View details", "FiEye"], ["edit", "Edit product", "FiEdit"], ["price", "Change price", "IndianRupee"], ["tax", "Change tax", "Percent"], ["category", "Change category", "FolderInput"], ["tags", "Add / remove tags", "Tag"], ["status", "Change status", "CircleDot"], ["stock", "Adjust stock", "Package"], ["catalogueAdd", "Add to catalogue", "BookOpen"], ["delete", "Delete", "FiTrash2"],
    ].map(([a, l, ic]) => (a === "view" ? `<a href="${detailPath(W.rowMenu.id)}" class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700">${K.icon(ic, "h-4 w-4")}${l}</a>` : DropdownMenuItem({ action: `fg.rowAct|${a}|${W.rowMenu.id}`, icon: K.icon(ic, "h-4 w-4"), label: l, danger: a === "delete", testId: `fg-row-act-${a}` }))).join("") }) : ""}`;
  }
  const isSelected = (id) => selectedIds().has(id);

  // ---- Select Products (method picker) — spec §8–21, infographic panel 3 ---------------------
  const METHODS = [
    ["search", "Search", "Search & add products", "Search and pick products one by one — searching again keeps what you picked"],
    ["filter", "Filter", "Filter products", "Use category, brand, status, tax, stock… then select all results"],
    ["catalogue", "BookOpen", "Select from catalogue", "All products in an existing catalogue"],
    ["supplier", "Building2", "Select by supplier / brand", "All products from a supplier or brand"],
    ["smart", "Zap", "Smart selection", "Rules like stock below 20, missing tax, edited recently"],
    ["attention", "AlertTriangle", "Needs attention", "Missing tax, low stock, missing category, duplicates…"],
    ["recent", "Clock", "Recently changed", "Added, edited, re-priced or deactivated in this session"],
    ["import", "ClipboardPaste", "Import product list", "Paste SKUs or upload an Excel / CSV file"],
    ["saved", "Star", "Saved selections", "Reuse a selection you saved before"],
  ];
  // Addendum 008 C4/C5: the first release builds only these; the rest stay visible as "Coming soon".
  const LIVE_METHODS = new Set(["search", "smart"]);
  const LIVE_ACTIONS = new Set(["price", "inline", "category", "tags", "export", "delete"]);
  const soon = `<span class="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">Coming soon</span>`;
  // Addendum 008 C6: one header on both dialogs — ① is always a way back to add more products.
  function steps(cur) {
    const n = selectedIds().size;
    const step = (no, label, action, on, disabled) => `<button type="button" data-on-click="${action}"${K.attr("disabled", disabled)} data-testid="fg-step-${no}" class="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-green-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"}"><span class="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${on ? "bg-white text-green-700" : "bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-200"}">${no}</span>${label}</button>`;
    return `<div data-testid="fg-steps" class="mb-4 flex items-center gap-1 border-b border-gray-100 pb-3 dark:border-gray-700">${step(1, "Select products", "fg.open|picker", cur === 1, false)}${K.icon("ChevronRight", "h-4 w-4 text-gray-300")}${step(2, `Bulk action${n ? ` (${n})` : ""}`, "fg.open|actions", cur === 2, !n)}</div>`;
  }
  const PK = () => K.state("fg-picker", () => ({ search: "", cat: "", supplier: "", brand: "", rules: [{ field: "stock", op: "lt", value: "20" }], review: false, paste: "", match: null, fileName: "" }));
  H("pickView", (v) => {
    if (v === "filter") {
      W.open = null;
      W.pop = "cats";
      W.popDraft = { values: [...W.f.cats], search: "", sort: "count", priceMin: W.f.priceMin, priceMax: W.f.priceMax, catalogues: [...W.f.catalogues], missing: [...W.f.missing] };
      return;
    }
    W.pickerView = v;
    PK().review = false;
  });
  H("pkSearch", (_, ev) => (PK().search = ev.target.value));
  H("pkToggle", (id) => setSelected(id, !selectedIds().has(id), "Search & add"));
  H("pkSet", (k, ev) => (PK()[k] = ev.target.value));
  H("pkQuery", (kind) => {
    const pk = PK();
    const f = emptyFilters();
    let label;
    if (kind === "catalogue") (f.catalogues = [pk.cat]), (label = `Catalogue = ${W.catalogues.find((c) => c.id === pk.cat)?.name}`);
    if (kind === "category") (f.cats = [pk.cat]), (label = `Category = ${W.names[pk.cat]}`);
    if (kind === "supplier") {
      if (pk.supplier) f.suppliers = [pk.supplier];
      if (pk.brand) f.brands = [pk.brand];
      label = [pk.supplier && `Supplier = ${pk.supplier}`, pk.brand && `Brand = ${W.brandLabel[pk.brand]}`].filter(Boolean).join(", ");
    }
    if (kind === "smart") (f.rules = structuredClone(pk.rules)), (label = `Smart: ${pk.rules.map(describeRule).join(" and ")}`);
    if (kind.startsWith("attention:")) (f.attention = kind.split(":")[1]), (label = `Needs attention: ${ATTENTION[f.attention].label}`);
    if (kind.startsWith("recent:")) (f.recent = kind.split(":")[1]), (label = `Recently ${f.recent}`);
    addQuery({ q: "", f }, label);
    W.pickerView = "home"; // Addendum 008 C6: back to step ① — add more, or go on to ②
  });
  H("pkRule", (arg, ev) => {
    const [idx, k] = arg.split("|");
    const r = PK().rules[Number(idx)];
    r[k] = ev.target.value;
    if (k === "field") Object.assign(r, { op: RULE_FIELDS[r.field].ops[0][0], value: "" });
  });
  H("pkRuleAdd", () => PK().rules.push({ field: "status", op: "is", value: "ACTIVE" }));
  H("pkRuleDel", (idx) => PK().rules.splice(Number(idx), 1));
  H("pkReview", () => (PK().review = !PK().review));
  H("pkPaste", (_, ev) => ((PK().paste = ev.target.value), (PK().match = null)));
  H("pkFind", () => (PK().match = matchSkus(PK().paste.split(/[\n,;\t]+/))));
  H("pkFile", async (_, ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    try {
      const lower = file.name.toLowerCase();
      const { headers, records } = lower.endsWith(".xls") || lower.endsWith(".xlsx") ? await PM.excel.readExcelFile(file) : PM.csv.csvToRecords(await K.readText(file));
      const col = headers.find((h) => /^(sku|article ?(no|number)?|code)$/i.test(h.trim())) ?? headers[0];
      Object.assign(PK(), { fileName: file.name, match: matchSkus(records.map((r) => r[col])), paste: "" });
    } catch {
      onNotify("Could not read that file — use CSV or Excel with a SKU column", "error");
    }
    K.update();
  });
  H("pkPickFile", (_, ev, el) => el.parentElement.querySelector('input[type="file"]').click());
  H("pkSelectMatched", () => {
    const m = PK().match;
    addIds(m.found.map((x) => x.p.id), PK().fileName ? `From file ${PK().fileName}` : "Pasted SKU list");
    W.pickerView = "home"; // Addendum 008 C6: back to step ① — add more, or go on to ②
  });
  function matchSkus(raw) {
    const skus = raw.map((s) => String(s ?? "").trim()).filter(Boolean);
    const seen = new Map();
    const found = [], notFound = [], duplicates = [];
    for (const sku of skus) {
      if (seen.has(norm(sku))) {
        duplicates.push({ sku, why: "Listed more than once" });
        continue;
      }
      seen.set(norm(sku), true);
      const hits = W.all.filter((p) => norm(p.articleNumber) === norm(sku) || (p.barcode && norm(p.barcode) === norm(sku)));
      if (!hits.length) notFound.push({ sku });
      else {
        if (hits.length > 1) duplicates.push({ sku, why: `Matches ${hits.length} products: ${hits.map((p) => p.name).join(", ")}` });
        for (const p of hits) found.push({ sku, p });
      }
    }
    return { total: skus.length, found, notFound, duplicates };
  }

  function productPickRow(p, on, action) {
    const i = W.info.get(p.id);
    return `<label data-key="${p.id}" class="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${on ? "border-green-500 bg-green-50 dark:bg-green-900/20" : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"}"><input type="checkbox"${K.attr("checked", on)} data-on-change="${action}" class="h-4 w-4 accent-emerald-600"><span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">${esc(tc(p.name))}</span><span class="block truncate text-xs text-gray-500">${esc(p.articleNumber || "No SKU")} · ${esc(i.cat ?? "No category")}${p.brand ? ` · ${esc(p.brand)}` : ""}</span></span><span class="text-sm font-semibold">${money(i.price)}</span></label>`;
  }
  const countFor = (f) => W.all.filter((p) => matches(p, { q: "", f: { ...emptyFilters(), ...f } })).length;
  const selectCls = "h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200";
  const primaryBtn = (action, label, disabled, testId) => `<button type="button" data-on-click="${action}"${K.attr("disabled", disabled)}${K.attr("data-testid", testId)} class="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">${label}</button>`;
  const secondaryBtn = (action, label, disabled, testId) => `<button type="button" data-on-click="${action}"${K.attr("disabled", disabled)}${K.attr("data-testid", testId)} class="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">${label}</button>`;

  function pickerFooter() {
    const n = selectedIds().size;
    return n ? `<div class="mt-5 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-700">${secondaryBtn("fg.showSel|1", `Show ${n} in list`, false, "fg-pick-show-list")}${primaryBtn("fg.open|actions", `Next: Bulk action${K.icon("ArrowRight", "h-4 w-4")}`, false, "fg-pick-next")}</div>` : "";
  }
  function pickerBody() {
    const pk = PK();
    const back = `<button type="button" data-on-click="fg.pickView|home" class="mb-4 inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:underline">${K.icon("FiArrowLeft", "h-4 w-4")}All methods</button>`;
    const sel = selectedIds();
    switch (W.pickerView) {
      case "home":
        return `<div class="grid gap-3 sm:grid-cols-2">${METHODS.map(([k, ic, t, d]) => `<button type="button" data-on-click="fg.pickView|${k}"${K.attr("disabled", !LIVE_METHODS.has(k))} data-testid="fg-method-${k}" class="flex items-start gap-3 rounded-xl border border-gray-200 p-4 text-left transition enabled:hover:border-green-400 enabled:hover:bg-green-50/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:enabled:hover:bg-gray-700"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600 dark:bg-green-900/30">${K.icon(ic, "h-5 w-5")}</span><span class="flex-1"><span class="block text-sm font-semibold text-gray-900 dark:text-gray-100">${t}</span><span class="block text-xs text-gray-500">${d}</span></span>${LIVE_METHODS.has(k) ? "" : soon}</button>`).join("")}</div>
          <p class="mt-4 text-xs text-gray-500">Every method adds to the same selection. You can also tick rows in the table.</p>`;
      case "search": {
        const q = norm(pk.search);
        const hits = q ? W.all.filter((p) => q.split(/\s+/).every((t) => W.info.get(p.id).hay.includes(t))).slice(0, 40) : [];
        return `${back}<div class="relative mb-2">${K.icon("Search", "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400")}<input value="${esc(pk.search)}" data-on-input="fg.pkSearch" placeholder="Search products, SKU, barcode…" data-testid="fg-pick-search" autofocus class="h-10 w-full rounded-md border border-gray-200 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-700"></div>
          <p class="mb-3 text-sm text-gray-600 dark:text-gray-300">Selected: <b data-testid="fg-pick-selected">${sel.size}</b> <span class="text-xs text-gray-400">— change the search and keep picking; nothing is cleared.</span></p>
          <div class="max-h-[50vh] space-y-2 overflow-y-auto">${hits.map((p) => productPickRow(p, sel.has(p.id), `fg.pkToggle|${p.id}`)).join("") || `<p class="py-8 text-center text-sm text-gray-400">${q ? "No products match" : "Start typing to find products"}</p>`}</div>`;
      }
      case "catalogue": {
        const n = pk.cat ? countFor({ catalogues: [pk.cat] }) : 0;
        return `${back}<label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Catalogue</label><select data-on-change="fg.pkSet|cat" data-testid="fg-pick-catalogue" class="${selectCls}"><option value="">Choose a catalogue</option>${W.catalogues.map((c) => `<option value="${c.id}"${K.attr("selected", pk.cat === c.id)}>${esc(c.name)} (${c.products.length})</option>`).join("")}</select>
          ${pk.cat ? `<p class="mt-4 text-sm text-gray-700 dark:text-gray-300"><b>${n}</b> products in this catalogue</p>` : ""}
          <div class="mt-4 flex justify-end">${primaryBtn("fg.pkQuery|catalogue", `Select all ${n}`, !n, "fg-pick-catalogue-select")}</div>`;
      }
      case "supplier": {
        const suppliers = [...new Set(W.all.map((p) => W.info.get(p.id).supplier).filter(Boolean))].sort();
        const brands = Object.keys(W.brandLabel).sort();
        const n = pk.supplier || pk.brand ? countFor({ suppliers: pk.supplier ? [pk.supplier] : [], brands: pk.brand ? [pk.brand] : [] }) : 0;
        return `${back}<p class="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">Supplier is a proposed product field — in discovery it is derived from the brand.</p>
          <div class="grid gap-3 sm:grid-cols-2"><div><label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Supplier</label><select data-on-change="fg.pkSet|supplier" data-testid="fg-pick-supplier" class="${selectCls}"><option value="">All</option>${suppliers.map((s) => `<option${K.attr("selected", pk.supplier === s)}>${esc(s)}</option>`).join("")}</select></div>
          <div><label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Brand</label><select data-on-change="fg.pkSet|brand" data-testid="fg-pick-brand" class="${selectCls}"><option value="">All</option>${brands.map((b) => `<option value="${esc(b)}"${K.attr("selected", pk.brand === b)}>${esc(W.brandLabel[b])}</option>`).join("")}</select></div></div>
          ${n ? `<p class="mt-4 text-sm text-gray-700 dark:text-gray-300"><b>${n}</b> products</p>` : ""}
          <div class="mt-4 flex justify-end">${primaryBtn("fg.pkQuery|supplier", `Select all ${n}`, !n, "fg-pick-supplier-select")}</div>`;
      }
      case "smart": {
        const matched = W.all.filter((p) => pk.rules.every((r) => ruleTest(r, p, W.info.get(p.id))));
        const valueInput = (r, idx) => {
          const d = RULE_FIELDS[r.field];
          const on = `data-on-change="fg.pkRule|${idx}|value"`;
          if (!d.input || (r.field === "tax" && r.op === "missing") || (r.field === "catalogue" && r.op === "none")) return `<span></span>`;
          if (d.input === "number") return `<input type="number" value="${esc(r.value)}" data-on-input="fg.pkRule|${idx}|value"${K.attr("disabled", d.disabled)} class="${selectCls}">`;
          const opts = d.input === "category" ? W.leaves.map((l) => [l.id, l.path]) : d.input === "status" ? FG_STATUSES : d.input === "tax" ? FG_TAX_RATES.map((x) => [String(x), `${x}%`]) : d.input === "missing" ? Object.entries(MISSING).map(([k, m]) => [k, m.label]) : W.catalogues.map((c) => [c.id, c.name]);
          return `<select ${on} class="${selectCls}"><option value="">Any</option>${opts.map(([v, l]) => `<option value="${esc(v)}"${K.attr("selected", r.value === v)}>${esc(l)}</option>`).join("")}</select>`;
        };
        return `${back}<p class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Select products where:</p>
          <div class="space-y-2">${pk.rules.map((r, idx) => `<div class="grid grid-cols-[1fr_1fr_1fr_auto] gap-2"><select data-on-change="fg.pkRule|${idx}|field" data-testid="fg-rule-field-${idx}" class="${selectCls}">${Object.entries(RULE_FIELDS).map(([k, d]) => `<option value="${k}"${K.attr("selected", r.field === k)}${K.attr("disabled", Boolean(d.disabled))}>${esc(d.label)}${d.disabled ? " (no data yet)" : ""}</option>`).join("")}</select><select data-on-change="fg.pkRule|${idx}|op" class="${selectCls}">${RULE_FIELDS[r.field].ops.map(([k, l]) => `<option value="${k}"${K.attr("selected", r.op === k)}>${esc(l)}</option>`).join("")}</select>${valueInput(r, idx)}<button type="button" data-on-click="fg.pkRuleDel|${idx}" aria-label="Remove rule" class="flex h-10 w-10 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500">${K.icon("X", "h-4 w-4")}</button></div>`).join("")}</div>
          <button type="button" data-on-click="fg.pkRuleAdd" class="mt-2 inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:underline">${K.icon("Plus", "h-4 w-4")}Add rule</button>
          <p class="mt-4 text-xs text-gray-400">Not available yet: sales in last X days and price-age rules need sales and price history.</p>
          <div class="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4 dark:border-gray-700"><span class="text-sm"><b data-testid="fg-smart-count">${matched.length}</b> products match</span>${secondaryBtn("fg.pkReview", pk.review ? "Hide products" : "Review products", !matched.length)}<span class="ml-auto">${primaryBtn("fg.pkQuery|smart", `Select all ${matched.length}`, !matched.length || !pk.rules.length, "fg-smart-select")}</span></div>
          ${pk.review ? `<ul class="mt-3 max-h-60 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-100 text-sm dark:divide-gray-700 dark:border-gray-700">${matched.map((p) => `<li class="flex justify-between px-3 py-1.5"><span>${esc(tc(p.name))}</span><span class="text-gray-500">${esc(p.articleNumber)} · stock ${p.stock ?? 0}</span></li>`).join("")}</ul>` : ""}`;
      }
      case "attention":
        return `${back}<div class="space-y-2">${Object.entries(ATTENTION).map(([k, a]) => {
          const n = W.all.filter((p) => a.test(p, W.info.get(p.id))).length;
          return `<div class="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700"><span class="h-2.5 w-2.5 rounded-full ${a.dot}"></span><span class="w-8 text-right text-sm font-bold tabular-nums">${n}</span><span class="flex-1 text-sm text-gray-700 dark:text-gray-200">${esc(a.label)}</span>${primaryBtn(`fg.pkQuery|attention:${k}`, `Select ${n}`, !n, `fg-pick-attention-${k}`)}</div>`;
        }).join("")}</div><p class="mt-3 text-xs text-gray-400">Low stock uses each product's reorder level (5 when none is set).</p>`;
      case "recent":
        return `${back}<div class="space-y-2">${[["added", "Recently added"], ["edited", "Recently edited"], ["priced", "Recently priced"], ["inactive", "Recently deactivated"]].map(([k, l]) => {
          const n = W.recent[k].size;
          return `<div class="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700"><span class="w-8 text-right text-sm font-bold tabular-nums">${n}</span><span class="flex-1 text-sm text-gray-700 dark:text-gray-200">${l}</span>${primaryBtn(`fg.pkQuery|recent:${k}`, `Select ${n}`, !n)}</div>`;
        }).join("")}</div><p class="mt-3 text-xs text-gray-400">Discovery tracks changes made in this browser session only — products have no created / modified dates yet. Imports count as “added”.</p>`;
      case "import": {
        const m = pk.match;
        return `${back}<div class="grid gap-4 sm:grid-cols-2">
          <div><label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Paste SKU codes</label><textarea data-on-input="fg.pkPaste" data-testid="fg-pick-paste" rows="7" placeholder="SB-1&#10;SB-10&#10;8901000005" class="w-full rounded-md border border-gray-200 p-2 font-mono text-sm dark:border-gray-600 dark:bg-gray-700">${esc(pk.paste)}</textarea>${secondaryBtn("fg.pkFind", "Find products", !pk.paste.trim(), "fg-pick-find")}</div>
          <div><label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">…or upload a list</label><div class="flex h-[168px] flex-col items-center justify-center rounded-md border border-dashed border-gray-300 text-center text-sm text-gray-500 dark:border-gray-600"><input type="file" accept=".csv,.xls,.xlsx,text/csv" class="hidden" data-on-change="fg.pkFile" data-testid="fg-pick-file">${K.icon("UploadCloud", "mb-2 h-6 w-6 text-green-500")}<button type="button" data-on-click="fg.pkPickFile" class="font-semibold text-green-700 hover:underline">Choose Excel / CSV</button><span class="mt-1 text-xs">Required column: SKU · optional: Product name</span>${pk.fileName ? `<span class="mt-1 text-xs text-gray-700 dark:text-gray-300">${esc(pk.fileName)}</span>` : ""}</div></div></div>
          ${m ? `<div class="mt-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700" data-testid="fg-sku-match"><div class="grid grid-cols-3 gap-2 text-center"><div><p class="text-2xl font-bold text-green-600">${new Set(m.found.map((x) => x.p.id)).size}</p><p class="text-xs text-gray-500">Found</p></div><div><p class="text-2xl font-bold ${m.notFound.length ? "text-red-500" : "text-gray-400"}">${m.notFound.length}</p><p class="text-xs text-gray-500">Not found</p></div><div><p class="text-2xl font-bold ${m.duplicates.length ? "text-amber-500" : "text-gray-400"}">${m.duplicates.length}</p><p class="text-xs text-gray-500">Duplicates</p></div></div>
            ${m.notFound.length || m.duplicates.length ? `<button type="button" data-on-click="fg.pkReview" class="mt-3 text-sm font-medium text-green-700 hover:underline">${pk.review ? "Hide" : "Review"} exceptions</button>${pk.review ? `<ul class="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">${m.notFound.map((x) => `<li class="text-red-600">Not found: ${esc(x.sku)}</li>`).join("")}${m.duplicates.map((x) => `<li class="text-amber-600">${esc(x.sku)} — ${esc(x.why)}</li>`).join("")}</ul>` : ""}` : ""}
            <div class="mt-4 flex justify-end">${primaryBtn("fg.pkSelectMatched", `Select ${new Set(m.found.map((x) => x.p.id)).size} products`, !m.found.length, "fg-pick-select-matched")}</div></div>` : ""}`;
      }
      case "saved": {
        const saved = savedSelections();
        return `${back}${saved.length ? `<div class="space-y-2">${saved.map((s, idx) => {
          const n = resolveSaved(s).length;
          return `<div class="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700">${K.icon("Star", "h-4 w-4 text-amber-400")}<span class="min-w-0 flex-1"><span class="block text-sm font-semibold text-gray-900 dark:text-gray-100">${esc(s.name)}</span><span class="block truncate text-xs text-gray-500">${esc(s.queries.map((x) => x.label).concat(s.include.length ? [`+${s.include.length} picked`] : [], s.exclude.length ? [`−${s.exclude.length} removed`] : []).join(" · "))}</span></span><span class="text-xs text-gray-500">${n} now</span>${primaryBtn(`fg.useSaved|${idx}`, "Use", false, `fg-use-saved-${idx}`)}<button type="button" data-on-click="fg.delSaved|${idx}" aria-label="Delete saved selection" class="p-2 text-gray-400 hover:text-red-500">${K.icon("Trash2", "h-4 w-4")}</button></div>`;
        }).join("")}</div><p class="mt-3 text-xs text-gray-400">Rule-based parts are re-evaluated each time, so a saved selection stays current as the catalogue changes. Stored in this browser only (discovery).</p>` : `<p class="py-10 text-center text-sm text-gray-400">No saved selections yet. Build a selection, then press “Save”.</p>`}`;
      }
    }
    return "";
  }

  // ---- saved selections (spec §24) — browser storage in discovery; proposed entity for Development
  const SAVED_KEY = "discovery.v6.savedSelections";
  function savedSelections() {
    try {
      return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    } catch {
      return [];
    }
  }
  function writeSaved(list) {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(list));
    } catch {}
  }
  function resolveSaved(s) {
    const ids = new Set(s.include.map(([id]) => id));
    for (const { query } of s.queries) for (const p of W.all) if (matches(p, query)) ids.add(p.id);
    for (const x of s.exclude) ids.delete(x);
    return [...ids].filter((id) => W.byId.has(id));
  }
  H("saveSelOpen", () => (W.open = "save"));
  H("saveName", (_, ev) => (K.state("fg-save", { name: "" }).name = ev.target.value));
  H("saveSel", () => {
    const name = K.state("fg-save", { name: "" }).name.trim();
    if (!name) return;
    writeSaved([...savedSelections().filter((s) => s.name !== name), { name, queries: W.sel.queries, include: [...W.sel.include], exclude: [...W.sel.exclude] }]);
    K.drop("fg-save");
    W.open = null;
    onNotify(`Saved “${name}”`, "success");
  });
  H("useSaved", (idx) => {
    const s = savedSelections()[Number(idx)];
    for (const q of s.queries) W.sel.queries.push(q);
    for (const [id, how] of s.include) if (W.byId.has(id)) setSelected(id, true, `${how} (${s.name})`);
    for (const id of s.exclude) setSelected(id, false);
    W.pickerView = "home"; // Addendum 008 C6: back to step ① — add more, or go on to ②
  });
  H("delSaved", (idx) => writeSaved(savedSelections().filter((_, i) => i !== Number(idx))));

  // ---- Selected Products set (infographic panel 4) — shown in the main table (Addendum 008 C2) -----
  H("exportList", () => {
    const rows = selectedProducts().map((p) => [p.articleNumber ?? "", p.name, W.info.get(p.id).cat ?? "", p.brand ?? ""]);
    K.download("selected-products.csv", new Blob([PM.csv.toCsv([["SKU", "Product name", "Category", "Brand"], ...rows])], { type: "text/csv;charset=utf-8;" }));
  });

  // ---- Bulk Action menu (infographic panel 5) ---------------------------------------------------
  const MENU = [
    ["Pricing", [["price", "Change selling price", "IndianRupee"], ["mrp", "Change MRP", "IndianRupee"], ["customerPrice", "Change catalogue (customer) price", "Users"], ["inline", "Edit prices row by row", "SlidersHorizontal"]]],
    ["Product details", [["category", "Change category", "FolderInput"], ["tax", "Change tax", "Percent"], ["tags", "Add / remove tags", "Tag"], ["brand", "Change brand", "Building2"], ["activate", "Activate", "CheckCircle2"], ["status", "Deactivate / change status", "CircleDot"]]],
    ["Inventory", [["stock", "Adjust stock", "Package"], ["warehouse", "Change warehouse", "Warehouse", "One stock location today — needs multi-warehouse stock"], ["reorder", "Change reorder level", "AlertTriangle"]]],
    ["Packaging", [["unit", "Change unit / conversion", "Layers", "Unit chains differ per product — edit them per product for now"]]],
    ["Catalogue", [["catalogueAdd", "Add to catalogue", "BookOpen"], ["catalogueRemove", "Remove from catalogue", "BookOpen"]]],
    ["Other", [["export", "Export selected", "Download"], ["delete", "Delete selected", "Trash2"]]],
  ];
  H("menu", (action) => {
    const products = selectedProducts();
    W.open = null;
    if (action === "inline") return beginInlineEdit(products, products.map((p) => W.info.get(p.id).vm));
    if (action === "delete") return requestBulkDelete(products.map((p) => p.id));
    if (action === "export") {
      api.listCategories(locationId).then((tree) => K.download("selected-products.csv", new Blob([PM.productCsv.productsToCsv(products, tree)], { type: "text/csv;charset=utf-8;" })));
      return;
    }
    openWizard(action, products, "selection");
  });
  function actionsModal() {
    const n = selectedIds().size;
    return FormModal("fg-actions", {
      open: true, onClose: () => (W.open = null), title: `Bulk actions (${plural(n, "product")})`, size: "lg", testId: "fg-actions-modal",
      children: `${steps(2)}<div class="grid gap-x-8 gap-y-5 sm:grid-cols-2">${MENU.map(([group, items]) => `<div><p class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">${group}</p>${items.map(([a, l, ic, why]) => `<button type="button" data-on-click="fg.menu|${a}"${K.attr("disabled", Boolean(why) || !LIVE_ACTIONS.has(a))}${K.attr("title", why)} data-testid="fg-menu-${a}" class="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${a === "delete" ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"}">${K.icon(ic, "h-4 w-4 shrink-0")}<span class="flex-1">${l}</span>${why || !LIVE_ACTIONS.has(a) ? soon : ""}</button>`).join("")}</div>`).join("")}</div>`,
    });
  }

  // ---- Bulk wizard: Configure → Preview + Impact → Confirm → Result (spec §26–34, §47–48, §55) ----
  const WIZ = {
    price: { title: "Change selling price", cfg: () => ({ mode: "incPct", value: "", target: "selling", catalogueId: "" }) },
    mrp: { title: "Change MRP", cfg: () => ({ mode: "set", value: "", target: "mrp", catalogueId: "" }) },
    customerPrice: { title: "Change catalogue price", cfg: () => ({ mode: "incPct", value: "", target: "catalogue", catalogueId: "" }) },
    tax: { title: "Change tax", cfg: () => ({ rate: "5" }) },
    category: { title: "Change category", cfg: () => ({ categoryId: "" }) },
    brand: { title: "Change brand", cfg: () => ({ brand: "" }) },
    tags: { title: "Manage tags", cfg: () => ({ tags: [], mode: "add" }) },
    status: { title: "Change status", cfg: () => ({ status: "DISCONTINUED", effect: "stop", reason: "Discontinued product" }) },
    activate: { title: "Activate", cfg: () => ({ status: "ACTIVE", effect: "stop", reason: "" }) },
    stock: { title: "Update stock", cfg: () => ({ type: "inc", qty: "", unit: "0", reason: "Stock received", reference: "", perRow: false, rows: {} }) },
    reorder: { title: "Change reorder level", cfg: () => ({ value: "" }) },
    catalogueAdd: { title: "Add to catalogue", cfg: () => ({ catalogueId: "" }) },
    catalogueRemove: { title: "Remove from catalogue", cfg: () => ({ catalogueId: "" }) },
  };
  function openWizard(action, targets, scope, scopeLabel) {
    if (action === "dupes") return (W.open = "dupes");
    if (action === "activate") action = "activate";
    W.wizard = { action, targets, scope, scopeLabel, step: "configure", cfg: WIZ[action].cfg(), result: null, busy: false };
    W.open = null;
  }
  const wz = () => W.wizard;
  H("wzSet", (k, ev) => {
    const el = ev.target;
    wz().cfg[k] = el.type === "checkbox" ? el.checked : el.value;
  });
  H("wzRow", (id, ev) => (wz().cfg.rows[id] = ev.target.value));
  H("wzStep", (step) => (wz().step = step));
  H("wzClose", () => (W.wizard = null));

  function transform(cur, cfg) {
    const v = Number(cfg.value);
    if (cfg.value === "" || !Number.isFinite(v)) return undefined;
    switch (cfg.mode) {
      case "set": return v;
      case "incPct": return cur * (1 + v / 100);
      case "decPct": return cur * (1 - v / 100);
      case "incAmt": return cur + v;
      case "decAmt": return cur - v;
    }
  }
  const scaleMap = (m, f) => (m ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round2(v * f)])) : m);
  const unitLabels = (p) => {
    const parts = (p.measurement ?? "").split("-").filter(Boolean);
    return [parts[0] || "unit", parts[1] || parts[0] || "unit"];
  };

  // plan → rows: { p, before, after, change?, skip?, warn?, patch?, undo?, apply? }
  function plan(w) {
    const { action, cfg, targets } = w;
    const cat = W.catalogues.find((c) => c.id === cfg.catalogueId);
    return targets.map((p) => {
      const i = W.info.get(p.id);
      const row = { p };
      if (action === "price" || action === "mrp" || action === "customerPrice") {
        let cur;
        if (cfg.target === "selling") cur = i.price;
        else if (cfg.target === "mrp") cur = i.mrp ?? (cfg.mode === "set" ? 0 : undefined);
        else {
          const e = cat?.products.find((x) => x.id === p.id);
          if (!cat) return { ...row, skip: "Choose a catalogue" };
          if (!e) return { ...row, before: "—", after: "—", skip: "Not in this catalogue" };
          cur = e.price;
        }
        row.before = cur ? money(cur) : "—";
        if (cur === undefined || (cur <= 0 && cfg.mode !== "set")) return { ...row, skip: cfg.target === "mrp" ? "No MRP yet — use “Set new price”" : "No current price" };
        const next = transform(cur, cfg);
        if (next === undefined) return { ...row, after: "—", skip: "Enter a value" };
        const n = round2(next);
        row.after = money(n);
        row.change = cur > 0 ? `${n >= cur ? "+" : ""}${(((n - cur) / cur) * 100).toFixed(1)}%` : "new";
        if (!(n > 0)) return { ...row, skip: "Would be zero or below" };
        if (Math.abs(n - cur) < 0.005) return { ...row, skip: "No change" };
        if (cfg.target === "selling") {
          Object.assign(row, sellingPatch(p, n / cur));
          if (i.mrp !== undefined && n > i.mrp) row.warn = `Above MRP ${money(i.mrp)}`;
          if (i.custom.length) row.warn = [row.warn, `Custom price in ${i.custom.map((c) => c.name).join(", ")} kept`].filter(Boolean).join(" · ");
        } else if (cfg.target === "mrp") {
          row.patch = { maxRetailPrice: n };
          row.undo = { maxRetailPrice: p.maxRetailPrice };
          if (i.price !== undefined && n < i.price) row.warn = `Below selling price ${money(i.price)}`;
        } else row.catalogue = { id: cat.id, price: n, f: n / cur };
        return row;
      }
      if (action === "tax") {
        const r = Number(cfg.rate);
        Object.assign(row, { before: i.tax === null ? "Missing" : `${i.tax}%`, after: `${r}%` });
        if (i.tax === r) return { ...row, skip: "Already this rate" };
        return { ...row, patch: { tax: r }, undo: { tax: p.tax } };
      }
      if (action === "category") {
        Object.assign(row, { before: i.cat ?? "Missing", after: W.names[cfg.categoryId] ?? "—" });
        if (!cfg.categoryId) return { ...row, skip: "Choose a category" };
        if (p.categoryReference === cfg.categoryId) return { ...row, skip: "Already in this category" };
        return { ...row, patch: { categoryReference: cfg.categoryId }, undo: { categoryReference: p.categoryReference } };
      }
      if (action === "brand") {
        const b = cfg.brand.trim();
        Object.assign(row, { before: p.brand || "—", after: b || "—" });
        if (!b) return { ...row, skip: "Enter a brand" };
        if (p.brand === b) return { ...row, skip: "Already this brand" };
        return { ...row, patch: { brand: b }, undo: { brand: p.brand } };
      }
      if (action === "tags") {
        const cur = p.tags ?? [];
        const has = (t) => cur.some((x) => norm(x) === norm(t));
        const next = cfg.mode === "add" ? [...cur, ...cfg.tags.filter((t) => !has(t))] : cfg.mode === "remove" ? cur.filter((x) => !cfg.tags.some((t) => norm(t) === norm(x))) : [...cfg.tags];
        Object.assign(row, { before: cur.join(", ") || "No tags", after: next.join(", ") || "No tags" });
        if (!cfg.tags.length) return { ...row, skip: "Add at least one tag" };
        if (next.join("|") === cur.join("|")) return { ...row, skip: cfg.mode === "remove" ? "Doesn't have these tags" : "Already tagged" };
        return { ...row, patch: { tags: next }, undo: { tags: cur } };
      }
      if (action === "status" || action === "activate") {
        Object.assign(row, { before: FG_STATUS_LABEL[p.status] ?? p.status, after: FG_STATUS_LABEL[cfg.status] });
        if (p.status === cfg.status) return { ...row, skip: `Already ${FG_STATUS_LABEL[cfg.status].toLowerCase()}` };
        if (!FG_SELLABLE.has(cfg.status) && cfg.effect === "remove" && i.catalogues.length) row.warn = `Removed from ${plural(i.catalogues.length, "catalogue")}`;
        return { ...row, patch: { status: cfg.status }, undo: { status: p.status } };
      }
      if (action === "stock") {
        const [small, big] = unitLabels(p);
        const conv = cfg.unit === "1" ? p.boxes || 1 : 1;
        const cur = p.stock ?? 0;
        const raw = cfg.perRow ? cfg.rows[p.id] : cfg.qty;
        row.before = `${cur} ${small}`;
        if (raw === undefined || raw === "") return { ...row, after: "—", skip: "Enter a quantity" };
        const q = Number(raw) * (cfg.perRow ? 1 : conv);
        const next = cfg.perRow || cfg.type === "set" ? q : cfg.type === "inc" ? cur + q : cur - q;
        row.after = `${next} ${small}`;
        row.change = `${next - cur >= 0 ? "+" : ""}${next - cur}`;
        if (cfg.unit === "1" && !cfg.perRow) row.warn = `1 ${big} = ${conv} ${small}`;
        if (next < 0) return { ...row, skip: "Would go below zero" };
        if (next === cur) return { ...row, skip: "No change" };
        row.stock = { next, prev: cur };
        return row;
      }
      if (action === "reorder") {
        const v = cfg.value === "" ? undefined : Number(cfg.value);
        Object.assign(row, { before: p.stockThreshold ?? "Not set (5)", after: v ?? "—" });
        if (v === undefined || v < 0) return { ...row, skip: "Enter a level" };
        if (p.stockThreshold === v) return { ...row, skip: "No change" };
        return { ...row, patch: { stockThreshold: v }, undo: { stockThreshold: p.stockThreshold } };
      }
      if (action === "catalogueAdd" || action === "catalogueRemove") {
        const inIt = cat?.products.some((e) => e.id === p.id);
        Object.assign(row, { before: inIt ? "In catalogue" : "Not in catalogue", after: action === "catalogueAdd" ? "In catalogue" : "Not in catalogue" });
        if (!cat) return { ...row, skip: "Choose a catalogue" };
        if (action === "catalogueAdd" && inIt) return { ...row, skip: "Already in this catalogue" };
        if (action === "catalogueRemove" && !inIt) return { ...row, skip: "Not in this catalogue" };
        row.catalogue = { id: cat.id };
        return row;
      }
      return row;
    });
  }

  // Impact (spec §28, §40): only counts with a real source; the rest say "Not available".
  function impact(rows) {
    const changing = rows.filter((r) => !r.skip);
    const catIds = new Map();
    for (const r of changing) for (const c of W.info.get(r.p.id).catalogues) catIds.set(c.id, (catIds.get(c.id) ?? 0) + 1);
    let customers = null;
    if (W.recipients) {
      const set = new Set();
      for (const id of catIds.keys()) for (const c of W.recipients[id] ?? []) set.add(c.id);
      customers = set.size;
    }
    const units = changing.reduce((n, r) => n + W.info.get(r.p.id).inOrders, 0);
    const withOrders = changing.filter((r) => W.info.get(r.p.id).inOrders > 0).length;
    const custom = changing.filter((r) => W.info.get(r.p.id).custom.length > 0);
    // Catalogue entries hold their own copy of the price, so ones that equal the standard price
    // today will stop matching it after a selling-price change (open question O1, Addendum 007).
    const following = changing.reduce((n, r) => n + W.info.get(r.p.id).catalogues.length - W.info.get(r.p.id).custom.length, 0);
    return { following, changing: changing.length, catalogues: [...catIds].map(([id, n]) => ({ name: W.catalogues.find((c) => c.id === id)?.name, n })), customers, units, withOrders, custom };
  }
  function impactBlock(rows, action) {
    const im = impact(rows);
    const tile = (value, label, icon, na) => `<div class="rounded-lg border ${na ? "border-dashed border-gray-300 dark:border-gray-600" : "border-blue-100 bg-white dark:border-blue-900/40 dark:bg-gray-800"} px-3 py-2.5"><div class="flex items-center gap-2">${K.icon(icon, `h-4 w-4 ${na ? "text-gray-300" : "text-blue-500"}`)}<span class="text-lg font-bold tabular-nums ${na ? "text-gray-400 text-xs font-medium" : "text-gray-900 dark:text-gray-100"}">${value}</span></div><p class="mt-0.5 text-xs text-gray-500">${label}</p></div>`;
    const priceLike = ["price", "mrp", "customerPrice", "status", "activate", "catalogueRemove", "tax"].includes(action);
    return `<div class="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-900/10" data-testid="fg-impact">
      <p class="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-200">${K.icon("Info", "h-4 w-4")}Impact summary</p>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        ${tile(im.changing, "Products changing", "Package")}
        ${tile(im.catalogues.length, "Catalogues affected", "BookOpen")}
        ${im.customers === null ? tile(FG_NA, "Customers affected — turn on “catalogues have customers” in Discovery controls", "Users", true) : tile(im.customers, "Customers affected", "Users")}
        ${tile(im.units, `Units in open orders (${plural(im.withOrders, "product")})`, "ShieldAlert")}
        ${priceLike ? tile(FG_NA, "Price lists — no source yet", "FileText", true) + tile(FG_NA, "Active schemes — no source yet", "Zap", true) : ""}
      </div>
      ${im.catalogues.length ? `<details class="mt-3 text-sm"><summary class="cursor-pointer font-medium text-blue-800 dark:text-blue-300">View affected catalogues</summary><ul class="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-300">${im.catalogues.map((c) => `<li>${esc(c.name)} — ${plural(c.n, "product")}</li>`).join("")}</ul></details>` : ""}
      ${action === "price" && im.following ? `<p class="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" data-testid="fg-following-note">${K.icon("AlertTriangle", "mr-1 inline h-3.5 w-3.5")}${plural(im.following, "catalogue price is", "catalogue prices are")} the same as the standard price today but stored separately — ${im.following === 1 ? "it" : "they"} will <b>not</b> follow this change. Use “Change catalogue price” to move ${im.following === 1 ? "it" : "them"} too.</p>` : ""}
      ${action === "price" && im.custom.length ? `<p class="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" data-testid="fg-custom-price-note">${K.icon("AlertTriangle", "mr-1 inline h-3.5 w-3.5")}${plural(im.custom.length, "product has", "products have")} a catalogue-specific price. Those catalogue prices are <b>not</b> overwritten — change them with “Change catalogue price”.</p>` : ""}
    </div>`;
  }

  function configureBody(w) {
    const c = w.cfg;
    const radio = (k, v, label, extra = "") => `<label class="flex items-center gap-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200"><input type="radio" name="fg-${k}" value="${v}"${K.attr("checked", c[k] === v)} data-on-change="fg.wzSet|${k}" class="h-4 w-4 accent-emerald-600">${label}${extra}</label>`;
    const field = (label, html, hint = "") => `<div><label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">${label}</label>${html}${hint ? `<p class="mt-1 text-xs text-gray-500">${hint}</p>` : ""}</div>`;
    const catalogueSelect = () => field("Catalogue", `<select data-on-change="fg.wzSet|catalogueId" data-testid="fg-wz-catalogue" class="${selectCls}"><option value="">Choose a catalogue</option>${W.catalogues.map((x) => `<option value="${x.id}"${K.attr("selected", c.catalogueId === x.id)}>${esc(x.name)} (${x.products.length})</option>`).join("")}</select>`);
    switch (w.action) {
      case "price":
      case "mrp":
      case "customerPrice": {
        const unit = c.mode.endsWith("Pct") ? "%" : fmt.currency();
        return `<p class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">How do you want to change prices?</p>
          ${radio("mode", "set", "Set new price")}${radio("mode", "incPct", "Increase by percentage")}${radio("mode", "decPct", "Decrease by percentage")}${radio("mode", "incAmt", "Increase by amount")}${radio("mode", "decAmt", "Decrease by amount")}
          <div class="mt-3 grid gap-4 sm:grid-cols-2">${field(c.mode === "set" ? "New price" : c.mode.includes("inc") ? "Increase by" : "Decrease by", `<div class="relative"><input type="number" min="0" step="0.01" value="${esc(c.value)}" data-on-input="fg.wzSet|value" data-testid="fg-wz-value" class="${selectCls} pr-8"><span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">${esc(unit)}</span></div>`)}
          ${field("Apply to price type", `<select data-on-change="fg.wzSet|target" data-testid="fg-wz-target" class="${selectCls}"><option value="selling"${K.attr("selected", c.target === "selling")}>Selling price</option><option value="mrp"${K.attr("selected", c.target === "mrp")}>MRP</option><option value="catalogue"${K.attr("selected", c.target === "catalogue")}>Catalogue (customer) price</option></select>`)}
          ${c.target === "catalogue" ? catalogueSelect() : ""}</div>
          ${c.target === "selling" ? `<p class="mt-3 text-xs text-gray-500">Every unit level of a product moves by the same ratio, so box and pallet prices stay consistent.</p>` : ""}`;
      }
      case "tax":
        return `${field("New tax rate", `<select data-on-change="fg.wzSet|rate" data-testid="fg-wz-rate" class="${selectCls}">${FG_TAX_RATES.map((r) => `<option value="${r}"${K.attr("selected", c.rate === String(r))}>${r}% GST</option>`).join("")}</select>`, "Selling prices are stored without tax, so the amount the customer pays changes with the rate.")}`;
      case "category":
        return `${field("New category", `<select data-on-change="fg.wzSet|categoryId" data-testid="fg-wz-category" class="${selectCls}"><option value="">Choose a category</option>${W.leaves.map((l) => `<option value="${l.id}"${K.attr("selected", c.categoryId === l.id)}>${esc(l.path)}</option>`).join("")}</select>`, "Products sit in one sub-category; its parent follows automatically, so there is no separate “also update sub-category” step.")}
          <p class="mt-4 flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">${K.icon("Info", "h-4 w-4")}This will change the category for ${plural(w.targets.length, "product")}.</p>`;
      case "brand": {
        const brands = [...new Set(W.all.map((p) => p.brand).filter(Boolean))];
        return field("Brand", `<input list="fg-brand-list" value="${esc(c.brand)}" data-on-input="fg.wzSet|brand" data-testid="fg-wz-brand" class="${selectCls}"><datalist id="fg-brand-list">${brands.map((b) => `<option value="${esc(b)}">`).join("")}</datalist>`, "Tip: fixes spellings like “amul” vs “Amul” in one go.");
      }
      case "tags":
        return `${MultiTagInput("fg-wz-tags", { value: c.tags, onChange: (t) => (c.tags = t), placeholder: "e.g. Fast Moving, Seasonal", buttonLabel: "Add" })}
          <p class="mb-1 mt-4 text-sm font-medium text-gray-700 dark:text-gray-300">Action</p>${radio("mode", "add", "Add tag")}${radio("mode", "remove", "Remove tag")}${radio("mode", "replace", "Replace all tags with these")}`;
      case "status":
      case "activate": {
        const leaving = !FG_SELLABLE.has(c.status);
        return `${field("New status", `<select data-on-change="fg.wzSet|status" data-testid="fg-wz-status" class="${selectCls}">${FG_STATUSES.filter(([v]) => v !== "INACTIVE").map(([v, l]) => `<option value="${v}"${K.attr("selected", c.status === v)}>${l}</option>`).join("")}</select>`, "No stock is not the same as discontinued — use “Temporarily unavailable” for a stock-out.")}
          ${leaving ? `<div class="mt-4"><p class="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">What should happen?</p>${radio("effect", "stop", "Stop new orders", ' <span class="text-xs text-gray-400">(recommended)</span>')}${radio("effect", "remove", "Stop new orders and remove from catalogues")}${radio("effect", "keep", "Keep existing orders active, hide from new catalogues")}</div>
          <div class="mt-3">${field("Reason", `<select data-on-change="fg.wzSet|reason" class="${selectCls}">${["Discontinued product", "Seasonal — out of season", "Supplier stopped", "Quality issue", "Replaced by another product", "Other"].map((r) => `<option${K.attr("selected", c.reason === r)}>${r}</option>`).join("")}</select>`)}</div>` : ""}`;
      }
      case "stock": {
        const sample = w.targets[0];
        const [small, big] = sample ? unitLabels(sample) : ["unit", "unit"];
        return `<div class="grid gap-4 sm:grid-cols-2">
          ${field("Adjustment type", `<select data-on-change="fg.wzSet|type" data-testid="fg-wz-stock-type"${K.attr("disabled", c.perRow)} class="${selectCls}"><option value="inc"${K.attr("selected", c.type === "inc")}>Increase stock</option><option value="dec"${K.attr("selected", c.type === "dec")}>Decrease stock</option><option value="set"${K.attr("selected", c.type === "set")}>Set stock to</option></select>`)}
          ${field("Quantity", `<input type="number" min="0" value="${esc(c.qty)}" data-on-input="fg.wzSet|qty"${K.attr("disabled", c.perRow)} data-testid="fg-wz-qty" class="${selectCls}">`)}
          ${field("Unit", `<select data-on-change="fg.wzSet|unit"${K.attr("disabled", c.perRow)} class="${selectCls}"><option value="0"${K.attr("selected", c.unit === "0")}>Smallest unit (e.g. ${esc(small)})</option><option value="1"${K.attr("selected", c.unit === "1")}>Next unit up (e.g. ${esc(big)})</option></select>`, "Each product converts with its own units.")}
          ${field("Warehouse", `<select disabled class="${selectCls}"><option>This location</option></select>`, "One stock location today — multi-warehouse is proposed.")}
          ${field("Reason", `<select data-on-change="fg.wzSet|reason" class="${selectCls}">${["Stock received", "Stock count correction", "Damaged / expired", "Returned by customer", "Transfer"].map((r) => `<option${K.attr("selected", c.reason === r)}>${r}</option>`).join("")}</select>`)}
          ${field("Reference (optional)", `<input value="${esc(c.reference)}" data-on-input="fg.wzSet|reference" placeholder="Supplier invoice #12345" class="${selectCls}">`)}</div>
          <label class="mt-4 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"><input type="checkbox"${K.attr("checked", c.perRow)} data-on-change="fg.wzSet|perRow" data-testid="fg-wz-perrow" class="h-4 w-4 accent-emerald-600">Different quantity per product (enter the new stock for each)</label>
          ${c.perRow ? `<table class="mt-3 w-full text-sm"><thead class="text-xs uppercase text-gray-500"><tr><th class="py-1 text-left">Product</th><th class="py-1 text-right">Current</th><th class="py-1 text-right">New</th></tr></thead><tbody data-grid-nav>${w.targets.map((p) => `<tr data-key="${p.id}" class="border-t border-gray-100 dark:border-gray-700"><td class="py-1.5">${esc(tc(p.name))}</td><td class="py-1.5 text-right tabular-nums">${p.stock ?? 0} ${esc(unitLabels(p)[0])}</td><td class="py-1.5 text-right"><input type="number" min="0" value="${esc(c.rows[p.id] ?? "")}" data-on-input="fg.wzRow|${p.id}" class="h-8 w-24 rounded border border-gray-200 px-2 text-right text-sm dark:border-gray-600 dark:bg-gray-700"></td></tr>`).join("")}</tbody></table>` : ""}`;
      }
      case "reorder":
        return field("Reorder level (low-stock threshold)", `<input type="number" min="0" value="${esc(c.value)}" data-on-input="fg.wzSet|value" data-testid="fg-wz-reorder" class="${selectCls}">`, "Stored as the product's stock threshold; Needs Attention uses it for “Low stock”.");
      case "catalogueAdd":
      case "catalogueRemove":
        return `${catalogueSelect()}${w.action === "catalogueAdd" ? `<p class="mt-3 text-xs text-gray-500">Products join at their current selling price — adjust later with “Change catalogue price”.</p>` : ""}`;
    }
    return "";
  }

  function previewBody(w, rows) {
    const changing = rows.filter((r) => !r.skip);
    const skipped = rows.filter((r) => r.skip);
    const show = changing.slice(0, 50);
    return `<p class="mb-3 text-sm text-gray-700 dark:text-gray-300"><b>${plural(changing.length, "product")}</b> will change${skipped.length ? `, <span class="text-amber-600">${skipped.length} skipped</span>` : ""}.</p>
      <div class="max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700"><table class="w-full text-sm" data-testid="fg-preview-table"><thead class="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900"><tr><th class="px-3 py-2 text-left">Product</th><th class="px-3 py-2 text-left">Current</th><th class="px-3 py-2 text-left">New</th>${rows.some((r) => r.change) ? `<th class="px-3 py-2 text-left">Change</th>` : ""}</tr></thead><tbody class="divide-y divide-gray-100 dark:divide-gray-700">${show.map((r) => `<tr data-key="${r.p.id}"><td class="px-3 py-2"><span class="font-medium text-gray-900 dark:text-gray-100">${esc(tc(r.p.name))}</span>${r.warn ? `<span class="block text-xs text-amber-600">${esc(r.warn)}</span>` : ""}</td><td class="px-3 py-2 text-gray-500">${esc(r.before)}</td><td class="px-3 py-2 font-semibold">${esc(r.after)}</td>${rows.some((x) => x.change) ? `<td class="px-3 py-2 ${String(r.change).startsWith("-") ? "text-red-600" : "text-green-600"}">${esc(r.change ?? "")}</td>` : ""}</tr>`).join("")}${changing.length > show.length ? `<tr><td colspan="4" class="px-3 py-2 text-center text-xs text-gray-500">…and ${changing.length - show.length} more</td></tr>` : ""}${!changing.length ? `<tr><td colspan="4" class="px-3 py-6 text-center text-sm text-gray-400">Nothing would change.</td></tr>` : ""}</tbody></table></div>
      ${skipped.length ? `<details class="mt-3 text-sm"><summary class="cursor-pointer font-medium text-amber-700">Review ${plural(skipped.length, "exception")}</summary><ul class="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-gray-600 dark:text-gray-300">${skipped.map((r) => `<li>${esc(tc(r.p.name))} — ${esc(r.skip)}</li>`).join("")}</ul></details>` : ""}
      ${impactBlock(rows, w.action)}`;
  }

  async function execute(w, rows) {
    const changing = rows.filter((r) => !r.skip);
    const ok = [], failed = [];
    const catSnap = {};
    const patchRows = changing.filter((r) => r.patch);
    if (patchRows.length) {
      const res = await api.bulkEditProducts(patchRows.map((r) => ({ id: r.p.id, name: r.p.name, articleNumber: r.p.articleNumber, ...r.patch })));
      for (const r of patchRows) {
        const x = res.find((y) => y.id === r.p.id);
        x?.status === "ok" ? ok.push(r) : failed.push({ ...r, error: x?.error?.message ?? "Update failed" });
      }
    }
    for (const r of changing.filter((x) => x.stock)) {
      // Proposed stock-movement endpoint: editProduct strips `stock` (Opening Stock is create-only),
      // so discovery writes the mock's product in place — see the addendum's data table.
      const live = await api.getProduct(r.p.id);
      if (!live) failed.push({ ...r, error: "Product not found" });
      else ((live.stock = r.stock.next), ok.push(r));
    }
    const catRows = changing.filter((r) => r.catalogue);
    const removeToo = (w.action === "status" || w.action === "activate") && !FG_SELLABLE.has(w.cfg.status) && w.cfg.effect === "remove";
    const catOps = new Map();
    for (const r of catRows) (catOps.get(r.catalogue.id) ?? catOps.set(r.catalogue.id, []).get(r.catalogue.id)).push(r);
    if (removeToo) for (const r of ok) for (const c of W.info.get(r.p.id).catalogues) (catOps.get(c.id) ?? catOps.set(c.id, []).get(c.id)).push({ ...r, remove: true });
    for (const [catId, list] of catOps) {
      const cat = await api.getCatalogue(catId);
      catSnap[catId] = cat.products.map((e) => ({ ...e }));
      const ids = new Set(list.map((r) => r.p.id));
      let entries = cat.products;
      if (w.action === "catalogueAdd") entries = [...entries, ...list.map((r) => ({ id: r.p.id, price: r.p.price ?? 0, offerPrice: r.p.price ?? 0, priceMap: r.p.priceMap, tax: r.p.tax }))];
      else if (w.action === "catalogueRemove" || removeToo) entries = entries.filter((e) => !ids.has(e.id));
      else entries = entries.map((e) => {
        const r = list.find((x) => x.p.id === e.id);
        return r ? { ...e, price: r.catalogue.price, offerPrice: round2((e.offerPrice ?? e.price) * r.catalogue.f), priceMap: scaleMap(e.priceMap, r.catalogue.f), offerPriceMap: scaleMap(e.offerPriceMap, r.catalogue.f) } : e;
      });
      try {
        await api.updateCatalogue(catId, { products: entries });
        if (!removeToo) ok.push(...list);
      } catch (err) {
        failed.push(...list.map((r) => ({ ...r, error: err.message })));
      }
    }
    return { ok, failed, skipped: rows.filter((r) => r.skip), catSnap };
  }

  H("wzApply", async () => {
    const w = wz();
    const rows = plan(w);
    w.busy = true;
    K.update();
    try {
      const r = await execute(w, rows);
      w.result = r;
      w.step = "result";
      const ids = r.ok.map((x) => x.p.id);
      for (const id of ids) W.recent.edited.add(id);
      if (["price", "mrp", "customerPrice"].includes(w.action)) for (const id of ids) W.recent.priced.add(id);
      if ((w.action === "status" || w.action === "activate") && !FG_SELLABLE.has(w.cfg.status)) for (const id of ids) W.recent.inactive.add(id);
      W.activity.unshift({
        id: ++actSeq, at: new Date(), action: WIZ[w.action].title, count: rows.length,
        criteria: w.scope === "row" ? `Single product: ${w.targets[0].name}` : w.scope === "attention" ? `Needs attention: ${w.scopeLabel}` : provenance().map((x) => (x.kind === "from" ? x.text : `${x.text} (${x.count})`)).join(" · "),
        detail: configSummary(w), ok: r.ok.length, skipped: r.skipped.length, failed: r.failed.length, rows: [...r.ok.map((x) => [x.p.name, "Updated", `${x.before} → ${x.after}`]), ...r.skipped.map((x) => [x.p.name, "Skipped", x.skip]), ...r.failed.map((x) => [x.p.name, "Failed", x.error])],
        undo: undoFor(w, r), undone: false,
      });
      await refresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Update failed", "error");
    } finally {
      w.busy = false;
      K.update();
    }
  });
  H("wzRetry", async () => {
    const w = wz();
    const failedIds = new Set(w.result.failed.map((r) => r.p.id));
    w.targets = w.targets.filter((p) => failedIds.has(p.id));
    w.step = "preview";
  });
  H("wzExport", () => {
    const r = wz().result;
    const rows = [...r.skipped.map((x) => [x.p.articleNumber ?? "", x.p.name, "Skipped", x.skip]), ...r.failed.map((x) => [x.p.articleNumber ?? "", x.p.name, "Failed", x.error])];
    K.download("bulk-exceptions.csv", new Blob([PM.csv.toCsv([["SKU", "Product", "Outcome", "Reason"], ...rows])], { type: "text/csv;charset=utf-8;" }));
  });
  H("wzUndo", () => undo(W.activity[0]));
  H("undo", (id) => undo(W.activity.find((a) => a.id === Number(id))));
  function configSummary(w) {
    const c = w.cfg;
    const modes = { set: "Set to", incPct: "Increase by", decPct: "Decrease by", incAmt: "Increase by", decAmt: "Decrease by" };
    if (["price", "mrp", "customerPrice"].includes(w.action)) return `${modes[c.mode]} ${c.mode.endsWith("Pct") ? `${c.value}%` : money(Number(c.value))} · ${c.target === "catalogue" ? `catalogue ${W.catalogues.find((x) => x.id === c.catalogueId)?.name}` : c.target === "mrp" ? "MRP" : "selling price"}`;
    if (w.action === "tax") return `${c.rate}% GST`;
    if (w.action === "category") return `→ ${W.names[c.categoryId]}`;
    if (w.action === "tags") return `${c.mode} ${c.tags.join(", ")}`;
    if (w.action === "status" || w.action === "activate") return `→ ${FG_STATUS_LABEL[c.status]}${!FG_SELLABLE.has(c.status) ? ` · ${c.reason}` : ""}`;
    if (w.action === "stock") return `${c.perRow ? "Per-product quantities" : `${{ inc: "Increase", dec: "Decrease", set: "Set" }[c.type]} ${c.qty}`} · ${c.reason}${c.reference ? ` · ${c.reference}` : ""}`;
    if (w.action === "brand") return `→ ${c.brand}`;
    if (w.action === "reorder") return `→ ${c.value}`;
    return W.catalogues.find((x) => x.id === c.catalogueId)?.name ?? "";
  }
  function undoFor(w, r) {
    const patches = r.ok.filter((x) => x.undo).map((x) => ({ id: x.p.id, name: x.p.name, articleNumber: x.p.articleNumber, ...x.undo }));
    const stock = r.ok.filter((x) => x.stock).map((x) => [x.p.id, x.stock.prev]);
    const cats = Object.entries(r.catSnap);
    if (!patches.length && !stock.length && !cats.length) return null;
    return async () => {
      if (patches.length) await api.bulkEditProducts(patches);
      for (const [id, prev] of stock) {
        const live = await api.getProduct(id);
        if (live) live.stock = prev;
      }
      for (const [id, products] of cats) await api.updateCatalogue(id, { products });
    };
  }
  async function undo(entry) {
    if (!entry?.undo || entry.undone) return;
    try {
      await entry.undo();
      entry.undone = true;
      onNotify(`Undone: ${entry.action} (${plural(entry.ok, "product")})`, "success");
      if (W.wizard) W.wizard = null;
      await refresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Undo failed", "error");
    }
    K.update();
  }

  function wizardModal() {
    const w = W.wizard;
    const rows = w.step === "result" ? [] : plan(w);
    const changing = rows.filter((r) => !r.skip).length;
    const steps = [["configure", "Configure"], ["preview", "Preview & impact"], ["result", "Done"]];
    const at = steps.findIndex(([k]) => k === w.step);
    const stepper = `<ol class="mb-5 flex items-center gap-2 text-xs">${steps.map(([k, l], i) => `<li class="flex items-center gap-2"><span class="flex h-6 w-6 items-center justify-center rounded-full ${i < at ? "bg-green-600 text-white" : i === at ? "border-2 border-green-600 font-bold text-green-700" : "border border-gray-300 text-gray-400"}">${i < at ? K.icon("Check", "h-3.5 w-3.5") : i + 1}</span><span class="${i === at ? "font-semibold text-gray-800 dark:text-gray-100" : "text-gray-500"}">${l}</span>${i < steps.length - 1 ? `<span class="mx-1 h-px w-8 bg-gray-200"></span>` : ""}</li>`).join("")}</ol>`;
    const scope = w.scope === "row" ? tc(w.targets[0].name) : plural(w.targets.length, "product");
    let body, foot;
    if (w.step === "configure") {
      body = configureBody(w);
      foot = `${secondaryBtn("fg.wzClose", "Cancel")}${primaryBtn("fg.wzStep|preview", "Preview changes", false, "fg-wz-preview")}`;
    } else if (w.step === "preview") {
      body = previewBody(w, rows);
      foot = `${secondaryBtn("fg.wzStep|configure", "Back", w.busy)}${primaryBtn("fg.wzApply", w.busy ? "Applying…" : `Apply ${changing} ${changing === 1 ? "change" : "changes"}`, w.busy || !changing, "fg-wz-apply")}`;
    } else {
      const r = w.result;
      const entry = W.activity[0];
      body = `<div class="text-center" data-testid="fg-wz-result"><span class="mx-auto flex h-12 w-12 items-center justify-center rounded-full ${r.failed.length ? "bg-amber-100 text-amber-600" : "bg-green-100 text-green-600"}">${K.icon(r.failed.length ? "AlertTriangle" : "Check", "h-6 w-6")}</span><p class="mt-3 text-lg font-semibold text-gray-900 dark:text-gray-100">${r.failed.length ? "Changes applied with exceptions" : "Changes made"}</p><p class="text-sm text-gray-500">${esc(WIZ[w.action].title)} · ${esc(configSummary(w))}</p></div>
        <div class="mt-5 grid grid-cols-3 gap-2 text-center"><div class="rounded-lg bg-green-50 py-3 dark:bg-green-900/20"><p class="text-2xl font-bold text-green-600" data-testid="fg-result-ok">${r.ok.length}</p><p class="text-xs text-gray-500">updated</p></div><div class="rounded-lg bg-amber-50 py-3 dark:bg-amber-900/20"><p class="text-2xl font-bold text-amber-600">${r.skipped.length}</p><p class="text-xs text-gray-500">skipped</p></div><div class="rounded-lg bg-red-50 py-3 dark:bg-red-900/20"><p class="text-2xl font-bold text-red-600">${r.failed.length}</p><p class="text-xs text-gray-500">failed</p></div></div>
        ${r.skipped.length || r.failed.length ? `<details class="mt-4 text-sm"><summary class="cursor-pointer font-medium text-gray-700 dark:text-gray-200">View exceptions</summary><ul class="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">${r.skipped.map((x) => `<li class="text-amber-700">Skipped — ${esc(tc(x.p.name))}: ${esc(x.skip)}</li>`).join("")}${r.failed.map((x) => `<li class="text-red-600">Failed — ${esc(tc(x.p.name))}: ${esc(x.error)}</li>`).join("")}</ul></details>` : ""}`;
      foot = `${r.skipped.length || r.failed.length ? secondaryBtn("fg.wzExport", "Export exceptions") : ""}${r.failed.length ? secondaryBtn("fg.wzRetry", "Retry failed") : ""}${entry?.undo && !entry.undone ? secondaryBtn("fg.wzUndo", `${K.icon("Undo2", "h-4 w-4")}Undo`, false, "fg-wz-undo") : ""}${primaryBtn("fg.wzClose", "Done", false, "fg-wz-done")}`;
    }
    return FormModal("fg-wizard", {
      open: true, onClose: () => !w.busy && (W.wizard = null), size: "lg", testId: "fg-wizard",
      title: `${WIZ[w.action].title} — ${scope}`,
      description: w.scope === "selection" ? "Applies to your current selection." : w.scope === "attention" ? `Needs attention: ${w.scopeLabel}` : "",
      children: `${stepper}${body}<div class="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-700">${foot}</div>`,
    });
  }

  // ---- Quick Add (spec §35, infographic panel 11) ----------------------------------------------
  H("qa", (k, ev) => (W.quick[k] = ev.target.value));
  H("qaTab", (tab) => {
    if (tab === "detail") {
      W.quick = null;
      return openDrawer(undefined);
    }
  });
  H("qaClose", () => (W.quick = null));
  H("qaSave", async (again) => {
    const q = W.quick;
    if (!q.name.trim() || !q.sku.trim() || !(Number(q.price) > 0) || W.all.some((p) => norm(p.articleNumber) === norm(q.sku))) return;
    q.busy = true;
    K.update();
    try {
      const created = await api.createProduct(locationId, { name: q.name.trim(), articleNumber: q.sku.trim(), categoryReference: q.category || undefined, price: Number(q.price), measurement: q.unit, tax: q.tax === "" ? undefined : Number(q.tax), status: "ACTIVE", catalogueType: "DEFAULT" });
      onNotify(`${created.name} added`, "success");
      W.quick = again ? { ...q, name: "", sku: "", price: "", busy: false } : null;
      await refresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Could not add product", "error");
      q.busy = false;
    }
    K.update();
  });
  function quickAddModal() {
    const q = W.quick;
    const skuTaken = q.sku.trim() && W.all.find((p) => norm(p.articleNumber) === norm(q.sku));
    const similar = q.name.trim().length > 2 ? W.all.filter((p) => norm(p.name).includes(norm(q.name)) || norm(q.name).includes(norm(p.name))).slice(0, 3) : [];
    const valid = q.name.trim() && q.sku.trim() && Number(q.price) > 0 && !skuTaken;
    const input = (k, label, extra = "", req = false) => `<div><label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">${label}${req ? ' <span class="text-red-500">*</span>' : ""}</label><input value="${esc(q[k])}" data-on-input="fg.qa|${k}" data-testid="fg-qa-${k}" ${extra} class="${selectCls}"></div>`;
    return FormModal("fg-quick", {
      open: true, onClose: () => (W.quick = null), title: "Add product", size: "md", testId: "fg-quick-add",
      children: `<div class="mb-5 flex border-b border-gray-200 dark:border-gray-700"><button type="button" class="-mb-px border-b-2 border-green-600 px-4 py-2 text-sm font-semibold text-green-700">Quick add</button><button type="button" data-on-click="fg.qaTab|detail" data-testid="fg-qa-detail" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Add in detail</button></div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">${input("name", "Product name", 'autofocus placeholder="Milk 500ml"', true)}${similar.length ? `<p class="mt-1 text-xs text-amber-600">Similar: ${similar.map((p) => `${esc(p.name)} (${esc(p.articleNumber)})`).join(", ")}</p>` : ""}</div>
          <div>${input("sku", "SKU", 'placeholder="ML500"', true)}${skuTaken ? `<p class="mt-1 text-xs text-red-600" data-testid="fg-qa-sku-taken">SKU already used by ${esc(skuTaken.name)}</p>` : ""}</div>
          <div><label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label><select data-on-change="fg.qa|category" class="${selectCls}"><option value="">Choose later</option>${W.leaves.map((l) => `<option value="${l.id}"${K.attr("selected", q.category === l.id)}>${esc(l.path)}</option>`).join("")}</select></div>
          ${input("price", `Selling price (${esc(fmt.currency())})`, 'type="number" min="0" step="0.01"', true)}
          <div><label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Unit</label><select data-on-change="fg.qa|unit" class="${selectCls}">${FG_UNITS.map((u) => `<option${K.attr("selected", q.unit === u)}>${u}</option>`).join("")}</select></div>
          <div><label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tax</label><select data-on-change="fg.qa|tax" class="${selectCls}"><option value="">Set later</option>${FG_TAX_RATES.map((r) => `<option value="${r}"${K.attr("selected", q.tax === String(r))}>${r}% GST</option>`).join("")}</select></div>
        </div>
        <p class="mt-4 text-xs text-gray-500">Everything else (images, barcode, packaging, opening stock) can be added later from “Edit”, or use “Add in detail”.</p>
        <div class="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-700">${secondaryBtn("fg.qaClose", "Cancel")}${secondaryBtn("fg.qaSave|again", "Add & add another", !valid || q.busy)}${primaryBtn("fg.qaSave", q.busy ? "Adding…" : "Add product", !valid || q.busy, "fg-qa-save")}</div>`,
    });
  }

  // ---- Duplicates review (spec §43) --------------------------------------------------------------
  H("dupCompare", (key) => (W.dupOpen = W.dupOpen === key ? null : key));
  H("dupKeep", (key) => (W.keepSeparate.add(key), onNotify("Marked as separate products", "success")));
  function dupesModal() {
    const groups = W.dupGroups.filter((g) => !W.keepSeparate.has(g.key));
    const fields = [["SKU", (p) => p.articleNumber], ["Barcode", (p) => p.barcode], ["Brand", (p) => p.brand], ["Category", (p) => W.info.get(p.id).cat], ["Unit", (p) => p.measurement], ["Price", (p) => money(W.info.get(p.id).price)], ["Status", (p) => FG_STATUS_LABEL[p.status]], ["Stock", (p) => p.stock]];
    return FormModal("fg-dupes", {
      open: true, onClose: () => (W.open = null), title: "Possible duplicates", description: "Never merged automatically — compare, then decide.", size: "lg", testId: "fg-dupes",
      children: groups.length ? `<div class="space-y-3">${groups.map((g) => {
        const same = fields.filter(([, fn]) => { const v = g.items.map((p) => norm(fn(p))); return v[0] && v.every((x) => x === v[0]); }).map(([l]) => l);
        return `<div data-key="${esc(g.key)}" class="rounded-lg border border-gray-200 p-3 dark:border-gray-700"><div class="flex flex-wrap items-start gap-3"><div class="min-w-0 flex-1">${g.items.map((p) => `<p class="text-sm"><a href="${detailPath(p.id)}" class="font-medium text-gray-900 hover:text-green-700 dark:text-gray-100">${esc(tc(p.name))}</a> <span class="text-xs text-gray-500">${esc(p.articleNumber)}</span></p>`).join("")}<p class="mt-1 text-xs text-purple-700">${esc(g.reason)}${same.length ? ` · Same: ${same.join(", ")}` : ""}</p></div>
          <div class="flex gap-2">${secondaryBtn(`fg.dupCompare|${esc(g.key)}`, W.dupOpen === g.key ? "Hide" : "Compare")}<button type="button" disabled title="Merging needs a merge flow — proposed, not in this iteration" class="h-10 rounded-md border border-gray-200 px-4 text-sm text-gray-400">Merge</button>${secondaryBtn(`fg.dupKeep|${esc(g.key)}`, "Keep separate")}</div></div>
          ${W.dupOpen === g.key ? `<table class="mt-3 w-full text-xs"><tbody>${fields.map(([l, fn]) => { const vals = g.items.map((p) => String(fn(p) ?? "—")); const diff = new Set(vals.map(norm)).size > 1; return `<tr class="border-t border-gray-100 dark:border-gray-700"><th class="w-24 py-1 text-left font-medium text-gray-500">${l}</th>${vals.map((v) => `<td class="py-1 ${diff ? "text-amber-700 font-medium" : ""}">${esc(v)}</td>`).join("")}</tr>`; }).join("")}</tbody></table>` : ""}</div>`;
      }).join("")}</div>` : `<p class="py-8 text-center text-sm text-gray-400">No possible duplicates left to review.</p>`,
    });
  }

  // ---- Activity (spec §54) ---------------------------------------------------------------------
  function activityDrawer() {
    return SlideDrawer("fg-activity", {
      open: true, width: "narrow", onClose: () => (W.open = null), title: "Recent changes", description: "Bulk changes made in this session. Undo restores the previous values.", testId: "fg-activity",
      children: W.activity.length ? `<ul class="space-y-3">${W.activity.map((a) => `<li data-key="act-${a.id}" class="rounded-lg border border-gray-200 p-3 dark:border-gray-700"><div class="flex items-start justify-between gap-2"><div><p class="text-sm font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-100">${esc(a.action)}${a.undone ? ' <span class="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium normal-case text-gray-500">undone</span>' : ""}</p><p class="text-xs text-gray-500">Performed by: You (discovery) · ${a.at.toLocaleString()}</p></div>${a.undo && !a.undone ? `<button type="button" data-on-click="fg.undo|${a.id}" class="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200">${K.icon("Undo2", "h-3.5 w-3.5")}Undo</button>` : ""}</div>
        <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">${plural(a.count, "product")} · ${esc(a.detail)}</p><p class="text-xs text-gray-500">Selection: ${esc(a.criteria)}</p>
        <p class="mt-1 text-xs"><span class="text-green-600">${a.ok} successful</span> · <span class="text-amber-600">${a.skipped} skipped</span> · <span class="text-red-600">${a.failed} failed</span></p>
        <details class="mt-2 text-xs"><summary class="cursor-pointer text-gray-600 dark:text-gray-300">View details</summary><ul class="mt-1 max-h-40 space-y-0.5 overflow-y-auto">${a.rows.map(([n, o, d]) => `<li><span class="font-medium">${esc(n)}</span> — ${o}: ${esc(d)}</li>`).join("")}</ul></details></li>`).join("")}</ul>` : `<p class="py-10 text-center text-sm text-gray-400">No bulk changes yet in this session.</p>`,
    });
  }

  function keysModal() {
    const rows = [["/", "Focus search"], ["↑ / ↓", "Move between rows"], ["x or Space", "Select / unselect row"], ["Enter", "Open product"], ["E", "Edit"], ["P", "Change price"], ["T", "Change tax"], ["I", "Change status (activate / deactivate)"], ["?", "Show this help"]];
    return FormModal("fg-keys", { open: true, onClose: () => (W.open = null), title: "Keyboard shortcuts", size: "sm", children: `<table class="w-full text-sm">${rows.map(([k, d]) => `<tr class="border-b border-gray-100 dark:border-gray-700"><td class="py-2 pr-4"><kbd class="rounded border border-gray-300 bg-gray-50 px-2 py-0.5 font-mono text-xs dark:border-gray-600 dark:bg-gray-700">${k}</kbd></td><td class="py-2 text-gray-700 dark:text-gray-200">${d}</td></tr>`).join("")}</table><p class="mt-3 text-xs text-gray-500">Shortcuts are off while typing in a field or when a dialog is open.</p>` });
  }

  function saveModal() {
    const s = K.state("fg-save", { name: "" });
    const parts = W.sel.queries.map((q) => q.label);
    return FormModal("fg-save-modal", {
      open: true, onClose: () => (W.open = null), title: "Save selection", size: "sm", testId: "fg-save-modal",
      children: `<label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label><input value="${esc(s.name)}" data-on-input="fg.saveName" autofocus placeholder="Punjab Dairy Products" data-testid="fg-save-name" class="${selectCls}">
        <p class="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Rules</p><ul class="mt-1 space-y-0.5 text-sm text-gray-700 dark:text-gray-300">${parts.map((p) => `<li>• ${esc(p)} <span class="text-xs text-gray-400">(re-evaluated each time)</span></li>`).join("")}${W.sel.include.size ? `<li>• ${plural(W.sel.include.size, "product")} picked by hand</li>` : ""}${W.sel.exclude.size ? `<li>• ${plural(W.sel.exclude.size, "product")} removed by hand</li>` : ""}</ul>
        <div class="mt-6 flex justify-end gap-3">${secondaryBtn("fg.close", "Cancel")}${primaryBtn("fg.saveSel", "Save", !s.name.trim(), "fg-save-confirm")}</div>`,
    });
  }

  function renderModals() {
    return `${W.open === "picker" ? FormModal("fg-picker-modal", { open: true, onClose: () => (W.open = null), title: W.pickerView === "home" ? "Select products for bulk action" : METHODS.find(([k]) => k === W.pickerView)[2], description: `${plural(selectedIds().size, "product")} selected so far`, size: "lg", testId: "fg-picker", children: `${steps(1)}${pickerBody()}${pickerFooter()}` }) : ""}
      ${W.open === "actions" ? actionsModal() : ""}
      ${W.open === "dupes" ? dupesModal() : ""}
      ${W.open === "activity" ? activityDrawer() : ""}
      ${W.open === "keys" ? keysModal() : ""}
      ${W.open === "save" ? saveModal() : ""}
      ${W.wizard ? wizardModal() : ""}
      ${W.quick ? quickAddModal() : ""}`;
  }

  // Toolbar: Bulk Actions opens the method picker when nothing is selected (spec §8).
  const bulkButton = (mobile) =>
    mobile
      ? `<button type="button" data-on-click="fg.bulk" data-testid="fg-bulk-btn-mobile" class="group flex min-w-0 w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition">${K.icon("ListChecks", "h-5 w-5 text-gray-600 dark:text-gray-300")}<span class="max-w-full truncate text-[10px] font-medium text-gray-600 dark:text-gray-300">Bulk${selectedIds().size ? ` (${selectedIds().size})` : ""}</span></button>`
      : `<button type="button" data-on-click="fg.bulk" data-testid="fg-bulk-btn" class="border text-sm flex justify-center items-center h-10 px-4 bg-white hover:bg-gray-100 border-gray-200 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 cursor-pointer rounded-md">${K.icon("ListChecks", "mr-2 h-4 w-4")}Bulk Actions${selectedIds().size ? ` (${selectedIds().size})` : ""}${K.icon("ChevronDown", "ml-1 h-4 w-4")}</button>`;
  H("bulk", () => (selectedIds().size ? (W.open = "actions") : ((W.open = "picker"), (W.pickerView = "home"))));

  // Product detail (iteration 2) reuses the same wizard, impact and activity for one product.
  const forProduct = (id) => ({ p: W.byId.get(id), i: W.info.get(id), catalogues: W.catalogues, recipients: W.recipients, names: W.names, dupGroups: W.dupGroups.filter((g) => g.items.some((x) => x.id === id)), attention: Object.values(ATTENTION).filter((a) => W.byId.get(id) && a.test(W.byId.get(id), W.info.get(id))).map((a) => a.label), activity: W.activity.filter((a) => a.rows.some(([n]) => n === W.byId.get(id)?.name)) });
  H("act", (arg) => {
    const [action, id] = arg.split("|");
    openWizard(action, [W.byId.get(id)], "row");
  });
  return { load, view, renderFinder, renderTable, renderModals, bulkButton, isSelected, toggle: (id) => setSelected(id, !isSelected(id)), forProduct, undo: (id) => undo(W.activity.find((a) => a.id === id)) };
}
