// Port of components/UnitPriceForm.tsx + components/UnitPriceModal.tsx (Addendum 006).
// Shared by Catalogue pricing, the Product drawer and Bulk edit.

function UnitPriceModal(id, p) {
  K.props[`${id}:modal`] = p;
  if (!p.isOpen) {
    K.drop(`${id}:form`);
    return "";
  }
  return FormModal(`${id}:fm`, {
    open: true,
    onClose: p.onClose,
    title: p.isRawMaterial ? "Add Raw Material Unit & Pricing" : p.title || "Add Pricing and Unit Details",
    description: p.isRawMaterial ? "Configure purchasing units, conversion quantities, GST treatment, and prices." : "Configure selling units, conversion quantities, GST treatment, and prices.",
    size: "lg",
    zIndex: 9999,
    testId: "unit-price-modal",
    children: UnitPriceForm(`${id}:form`, {
      ...p,
      onSave: (payload) => {
        p.onSave(payload);
        p.onClose();
      },
    }),
  });
}

function UnitPriceForm(id, p) {
  p = { unitOptions: [], disabled: {}, tax: 0, priceMap: {}, offerPriceMap: {}, isRawMaterial: false, currency: PM.format.currency(), ...p };
  K.props[id] = p;
  const level = PM.unitLevel.getSupportedUnitIndexLevel();
  const showPalletUnit = level == null ? Boolean(p.enablePallets) : level >= 2;
  const showBaseUnit = level == null || level >= 1;
  const hasValue = (v) => v !== "" && v !== null && v !== undefined && parseFloat(String(v)) > 0;

  const s = K.state(id, () => ({
    baseUnit: null, secondaryUnit: null, palletUnit: null, conversionRate: 1, palletConversionRate: 1,
    price: "", secondaryPrice: "", palletPrice: "", taxValue: "", isNewUnitAdded: false, selectedTaxType: "With GST",
    prefillKey: null, taxKey: null,
  }));

  // useEffect([productId, originalPrice, unit]) — pre-fill.
  const prefillKey = `${p.productId}|${p.originalPrice}|${p.unit}`;
  if (s.prefillKey !== prefillKey) {
    s.prefillKey = prefillKey;
    const { originalPrice, unit, boxes, pallets, tax } = p;
    if (originalPrice != null && originalPrice !== "" && unit && boxes && (!showPalletUnit || (showPalletUnit && pallets))) {
      const [su, bu, pu] = unit.split("-");
      s.palletUnit = pu ?? null;
      s.baseUnit = bu ?? null;
      s.secondaryUnit = su ?? null;
      s.conversionRate = boxes;
      s.palletConversionRate = pallets ?? 1;
      const eff = { ...p.priceMap, ...p.offerPriceMap };
      const calc = PM.unitLevel.getPriceCalculationUnitIndex();
      const before = PM.taxUtil.addGstToExclusivePrice(originalPrice, tax);
      const pc = typeof pallets === "number" ? pallets : Number(pallets) || 1;
      const bc = typeof boxes === "number" ? boxes : Number(boxes) || 1;
      const conv = (to) => PM.unitLevel.convertUnitPrice({ price: before, boxes: bc, pallets: pc }, calc, to).toFixed(2);
      s.secondaryPrice = hasValue(eff[su]) ? PM.taxUtil.addGstToExclusivePrice(eff[su], tax).toFixed(2) : conv(0);
      s.price = hasValue(eff[bu]) ? PM.taxUtil.addGstToExclusivePrice(eff[bu], tax).toFixed(2) : conv(1);
      s.palletPrice = hasValue(eff[pu]) ? PM.taxUtil.addGstToExclusivePrice(eff[pu], tax).toFixed(2) : conv(2);
      s.isNewUnitAdded = false;
    } else if (!originalPrice && !unit) {
      Object.assign(s, { secondaryUnit: null, baseUnit: null, palletUnit: null, conversionRate: 1, palletConversionRate: 1, secondaryPrice: "", price: "", palletPrice: "" });
    }
  }
  // useEffect([productId, tax])
  const taxKey = `${p.productId}|${p.tax}`;
  if (s.taxKey !== taxKey) {
    s.taxKey = taxKey;
    s.taxValue = `${p.tax || 0}%`;
    s.selectedTaxType = "With GST";
  }

  const sets = [new Set(), new Set(), new Set()];
  for (const [a, b, c] of p.unitOptions) {
    if (a) sets[0].add(a);
    if (b) sets[1].add(b);
    if (c) sets[2].add(c);
  }
  const [secondaryUnitOptions, baseUnitOptions, palletUnitOptions] = sets.map((x) => Array.from(x));
  if (palletUnitOptions.length && !s.palletUnit && !p.unit && !showPalletUnit) s.palletUnit = "Pallet";
  if (baseUnitOptions.length && !s.baseUnit && !p.unit && !showBaseUnit) s.baseUnit = "Box";

  const unitsReady = s.baseUnit && s.secondaryUnit && (!showPalletUnit || (showPalletUnit && s.palletUnit));
  const isSaveDisabled = !s.baseUnit || !s.secondaryUnit || !s.conversionRate || Number(s.conversionRate) <= 0;
  const esc = K.esc;
  const unitPicker = (label, hint, tip, key, options, disabledKey, testId) => `
    <div>
      <label class="flex items-center text-sm font-medium text-blue-600 mb-0.5">${label}<span class="text-red-500 ml-1">*</span><span title="${esc(tip)}" class="ml-1 text-gray-400 cursor-help">ⓘ</span></label>
      <p class="text-xs text-gray-400 mb-1.5">${esc(hint)}</p>
      ${ProductSelect(`${id}:${key}`, {
        options,
        value: s[key],
        onChange: (v) => (s[key] = v),
        onAdd: (v) => {
          s[key] = v;
          s.isNewUnitAdded = true;
        },
        placeholder: "Select or add unit",
        addNewLabel: "Add new unit",
        addNewPlaceholder: "Enter unit name",
        disabled: p.disabled[disabledKey],
        testId,
      })}
    </div>`;
  const rateRow = (upper, lower, value, field, disabledKey, testId) => `
    <div>
      <label class="flex items-center text-sm font-medium text-blue-600 mb-1.5">How many <span class="uppercase mx-1">${esc(lower)}</span> per <span class="uppercase mx-1">${esc(upper)}</span>?<span class="text-red-500 ml-1">*</span></label>
      <div class="flex items-center gap-3">
        <span class="text-sm text-gray-400 shrink-0">1 <span class="font-semibold text-gray-600 uppercase">${esc(upper)}</span> =</span>
        <input type="number" inputmode="numeric" value="${esc(value)}" min="1" data-on-input="upf.${field}|${id}" data-on-blur="upf.${field}Blur|${id}" data-testid="${testId}" class="w-24 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center ${p.disabled[disabledKey] ? "cursor-not-allowed bg-gray-50 text-gray-400" : ""}"${K.attr("disabled", p.disabled[disabledKey])}>
        <span class="text-sm font-semibold text-gray-600 uppercase shrink-0">${esc(lower)}</span>
      </div>
    </div>`;
  const priceRow = (unitName, value, field, testId, pallet) => `
    <div>
      <label class="flex items-center text-sm font-medium text-blue-600 mb-1.5">${p.isRawMaterial ? "Purchasing Price Per" : "Selling Price Per"} <span class="uppercase ml-1">${esc(unitName)}</span></label>
      <div class="relative${pallet ? "" : " flex items-center"}">
        <span class="absolute left-1 top-1/2 ${pallet ? "transform " : ""}-translate-y-1/2 text-gray-500${pallet ? "" : " whitespace-nowrap"}">${esc(p.currency)}</span>
        <input type="number" value="${esc(value)}" min="0" data-on-input="upf.${field}|${id}"${field !== "secondaryPrice" ? ` data-on-blur="upf.${field}Blur|${id}"` : ""} step="0.01"${pallet ? "" : ` style="padding-left:calc(${p.currency.length}ch + 20px)"`} data-testid="${testId}" class="w-full ${pallet ? "pl-8 " : ""}pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="0.00">
      </div>
    </div>`;
  const gst = (value, label, description) => {
    const on = s.selectedTaxType === value;
    return `<button type="button" data-on-click="upf.gst|${id}|${value}" data-testid="unit-price-form-gst-treatment-${value === "With GST" ? "included" : "added-separately"}" class="flex min-h-[58px] items-start gap-2 rounded-md border p-2 text-left transition-colors ${on ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-gray-300 bg-white hover:border-gray-400"}">
      <span class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-blue-500" : "border-gray-400"}">${on ? `<span class="h-2 w-2 rounded-full bg-blue-500"></span>` : ""}</span>
      <span><span class="block text-xs font-semibold text-gray-800">${label}</span><span class="mt-0.5 block text-[10px] leading-3 text-gray-500">${description}</span></span></button>`;
  };

  return `
  <div class="grid grid-cols-1 ${showPalletUnit ? "sm:grid-cols-3" : showBaseUnit ? "sm:grid-cols-2" : ""} gap-4 mb-4">
    ${unitPicker("Smallest Unit", "e.g. Bottle, Piece, KG", "The individual item you sell — e.g. Bottle, Piece, KG", "secondaryUnit", secondaryUnitOptions, "secondaryUnit", "unit-price-form-secondary-unit-select")}
    ${showBaseUnit ? unitPicker("Base Unit", "e.g. Box, Carton, Dozen", "The pack that groups your smallest unit — e.g. Box, Carton, Dozen", "baseUnit", baseUnitOptions, "baseUnit", "unit-price-form-base-unit-select") : ""}
    ${showPalletUnit ? unitPicker("Largest Unit", "e.g. Pallet, Container", "Your bulk shipping unit — e.g. Pallet, Container", "palletUnit", palletUnitOptions, "palletUnit", "unit-price-form-pallet-unit-select") : ""}
  </div>
  ${
    unitsReady
      ? `<div class="mb-4 space-y-3">
      ${showPalletUnit ? rateRow(s.palletUnit, s.baseUnit, s.palletConversionRate, "palletRate", "palletConversionRate", "unit-price-form-pallet-conversion-rate-input") : ""}
      ${rateRow(s.baseUnit, s.secondaryUnit, s.conversionRate, "rate", "conversionRate", "unit-price-form-conversion-rate-input")}
    </div>`
      : ""
  }
  ${
    !p.isReturnableProduct && unitsReady
      ? `<div class="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div class="mb-3"><h3 class="flex items-center text-sm font-semibold text-gray-800">Tax Settings</h3><p class="mt-0.5 text-xs text-gray-500">Set the GST details for pricing.</p></div>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class="mb-1.5 flex items-center text-sm font-medium text-gray-700">GST Rate (%)<span class="ml-1 text-red-500">*</span></label>
          ${ProductSelect(`${id}:tax`, {
            options: ["0%", "5%", "12%", "18%", "28%"],
            value: s.taxValue,
            onChange: (v) => (s.taxValue = v),
            onAdd: (v) => (s.taxValue = `${v.replace("%", "").trim()}%`),
            placeholder: "Select tax rate",
            addNewLabel: "Add new GST rate",
            addNewPlaceholder: "Enter GST rate (e.g. 12)",
            disabled: p.disabled.tax,
            testId: "unit-price-form-tax-rate-select",
          })}
        </div>
        <fieldset><legend class="mb-1.5 text-sm font-medium text-gray-700">GST Treatment <span class="text-red-500">*</span></legend>
          <div class="grid grid-cols-2 gap-2">${gst("With GST", "Included in Price", "Price already includes GST.")}${gst("Without GST", "Added Separately", "GST will be added on top.")}</div>
        </fieldset>
      </div>
    </div>
    <div class="grid gap-4 mb-6">
      ${priceRow(s.secondaryUnit, s.secondaryPrice, "secondaryPrice", "unit-price-form-secondary-price-input")}
      ${priceRow(s.baseUnit, s.price, "price", "unit-price-form-base-price-input")}
      ${showPalletUnit ? priceRow(s.palletUnit, s.palletPrice, "palletPrice", "unit-price-form-pallet-price-input", true) : ""}
    </div>`
      : ""
  }
  <div class="mb-2"><button type="button" data-testid="unit-price-form-save-btn" class="w-full ${isSaveDisabled ? "bg-gray-300 cursor-not-allowed" : "bg-blue-500 hover:bg-blue-600"} text-white font-medium py-2 px-4 rounded-md transition-colors" data-on-click="upf.save|${id}"${K.attr("disabled", isSaveDisabled)}>SAVE</button></div>`;
}

(() => {
  const S = (id) => K.state(id);
  const P = (id) => K.props[id];
  const showPallet = (id) => {
    const level = PM.unitLevel.getSupportedUnitIndexLevel();
    return level == null ? Boolean(P(id).enablePallets) : level >= 2;
  };
  const fmt = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "");
  const pos = (v, f = 1) => {
    const n = parseFloat(String(v));
    return Number.isFinite(n) && n > 0 ? n : f;
  };
  const validPrice = (v) => /^\d*\.?\d{0,2}$/.test(v);
  const hasValue = (v) => v !== "" && v !== null && v !== undefined && parseFloat(String(v)) > 0;
  const clear = (s) => Object.assign(s, { secondaryPrice: "", price: "", palletPrice: "" });

  function fromSecondary(id, value, rate = S(id).conversionRate, prate = S(id).palletConversionRate) {
    const s = S(id);
    if (value === "") return clear(s);
    const secondary = parseFloat(value);
    if (!Number.isFinite(secondary)) return;
    const base = secondary * pos(rate);
    s.secondaryPrice = value;
    s.price = fmt(base);
    if (showPallet(id)) s.palletPrice = fmt(base * pos(prate));
  }
  function fromBase(id, value, rate = S(id).conversionRate, prate = S(id).palletConversionRate) {
    const s = S(id);
    if (value === "") return clear(s);
    const base = parseFloat(value);
    if (!Number.isFinite(base)) return;
    s.price = value;
    s.secondaryPrice = fmt(base / pos(rate));
    if (showPallet(id)) s.palletPrice = fmt(base * pos(prate));
  }
  function fromPallet(id, value, rate = S(id).conversionRate, prate = S(id).palletConversionRate) {
    const s = S(id);
    if (value === "") return clear(s);
    const pallet = parseFloat(value);
    if (!Number.isFinite(pallet)) return;
    const base = pallet / pos(prate);
    s.palletPrice = value;
    s.price = fmt(base);
    s.secondaryPrice = fmt(base / pos(rate));
  }

  for (const name of ["secondaryPrice", "price", "priceBlur", "palletPrice", "palletPriceBlur", "rate", "rateBlur", "palletRate", "palletRateBlur", "gst", "save"]) {
    queueMicrotask(() => {
      const fn = K.on[`upf.${name}`];
      K.on[`upf.${name}`] = (arg, ...rest) => K.props[String(arg).split("|")[0]] && fn(arg, ...rest);
    });
  }
  K.on["upf.secondaryPrice"] = (id, ev) => validPrice(ev.target.value) && fromSecondary(id, ev.target.value);
  K.on["upf.price"] = (id, ev) => validPrice(ev.target.value) && fromBase(id, ev.target.value);
  K.on["upf.priceBlur"] = (id, ev) => {
    const n = parseFloat(ev.target.value);
    if (!isNaN(n)) fromBase(id, n.toFixed(2));
  };
  K.on["upf.palletPrice"] = (id, ev) => validPrice(ev.target.value) && fromPallet(id, ev.target.value);
  K.on["upf.palletPriceBlur"] = (id, ev) => {
    const n = parseFloat(ev.target.value);
    if (!isNaN(n)) fromPallet(id, n.toFixed(2));
  };
  K.on["upf.rate"] = (id, ev) => {
    const s = S(id);
    s.conversionRate = ev.target.value;
    if (hasValue(s.secondaryPrice)) fromSecondary(id, s.secondaryPrice, ev.target.value);
  };
  K.on["upf.rateBlur"] = (id, ev) => {
    const s = S(id);
    let n = parseFloat(ev.target.value);
    if (isNaN(n) || n < 1) {
      n = 1;
      s.conversionRate = n;
    }
    if (hasValue(s.secondaryPrice)) fromSecondary(id, s.secondaryPrice, n);
  };
  K.on["upf.palletRate"] = (id, ev) => {
    const s = S(id);
    s.palletConversionRate = ev.target.value;
    if (hasValue(s.price)) fromBase(id, s.price, s.conversionRate, ev.target.value);
  };
  K.on["upf.palletRateBlur"] = (id, ev) => {
    const s = S(id);
    let n = parseFloat(ev.target.value);
    if (isNaN(n) || n < 1) {
      n = 1;
      s.palletConversionRate = n;
    }
    if (hasValue(s.price)) fromBase(id, s.price, s.conversionRate, n);
  };
  K.on["upf.gst"] = (arg) => {
    const [id, value] = arg.split("|");
    S(id).selectedTaxType = value;
  };
  K.on["upf.save"] = (id) => {
    const s = S(id);
    const p = P(id);
    let t = s.taxValue;
    if (t.includes("%")) t = t.split("%")[0];
    const taxPercent = Number(t);
    const strip = (val) => {
      const n = parseFloat(val) || 0;
      if (s.selectedTaxType === "With GST" && taxPercent > 0) return Number(PM.taxUtil.removeGstFromInclusivePrice(n, taxPercent).toFixed(4));
      return n;
    };
    const strippedBase = strip(s.price);
    p.onSave({
      baseUnit: s.baseUnit ?? "",
      secondaryUnit: s.secondaryUnit ?? "",
      conversionRate: Number(s.conversionRate),
      productId: p.productId,
      tax: taxPercent,
      price: strip(s.secondaryPrice),
      baseUnitPrice: strippedBase,
      palletUnitPrice: !showPallet(id) ? strippedBase : strip(s.palletPrice),
      isNewUnitAdded: s.isNewUnitAdded,
      palletUnit: s.palletUnit ?? "",
      palletConversionRate: parseFloat(String(s.palletConversionRate)),
    });
  };
})();
