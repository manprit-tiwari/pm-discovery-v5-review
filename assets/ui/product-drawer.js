// Port of components/ProductDrawer.tsx + controllers/useProductFormController.ts and the pieces
// it mounts: CategorySelect, AddCategoryModal, ImagesRow, BrowseGalleryModal, CameraCaptureModal
// (Addendum 006). Shared by the Products / Raw Materials lists and the Product detail page.

const iconSized = (name, cls, size) => K.icon(name, cls).replace(/height="1em" width="1em"/, `height="${size}" width="${size}"`);
const randomArticleSuffix = () => {
  const dict = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let out = "";
  for (let i = 0; i < 6; i++) out += dict[Math.floor(Math.random() * dict.length)];
  return out;
};

// ---- CategorySelect -----------------------------------------------------------------------
const ADD_NEW_VALUE = "__add_new__";
function flattenCategoryLeaves(roots) {
  const flat = (nodes) => nodes.flatMap((n) => (n.children.length > 0 ? flat(n.children) : [{ value: n.id, label: n.label, rawLabel: n.label }]));
  return roots.flatMap((r) => flat(r.children));
}
function CategorySelect(id, p) {
  const s = K.state(`${id}:cs`, { menuIsOpen: false, placement: "auto" });
  const compact = window.innerWidth <= 640 || (window.visualViewport?.height || window.innerHeight) <= 680;
  const options = [{ value: ADD_NEW_VALUE, label: "Add New Category", isAddNewOption: true }, ...flattenCategoryLeaves(p.categoryOptions)];
  const maxMenuHeight = compact ? 208 : 400;
  const estimate = Math.min(maxMenuHeight, Math.max(72, options.length * 38));
  return `<div data-testid="${id}-control" class="w-full transition-[min-height] duration-150"${compact && s.menuIsOpen ? ` style="min-height:${estimate + 48}px"` : ""}>
    ${RSelect(`${id}:rs`, {
      inputId: id,
      options,
      value: p.value,
      isClearable: true,
      showSeparator: false,
      placeholder: "Select Category",
      maxMenuHeight,
      menuMaxHeight: maxMenuHeight,
      menuZIndex: compact ? 1 : 9999,
      portal: !compact,
      menuPlacement: s.placement === "top" ? "top" : "bottom",
      onMenuOpen: (el) => {
        s.menuIsOpen = true;
        if (compact) {
          s.placement = "bottom";
          requestAnimationFrame(() => el?.closest(`[data-testid="${id}-control"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
          return;
        }
        const rect = el?.closest(`[data-testid="${id}-control"]`)?.getBoundingClientRect();
        s.placement = !rect ? "auto" : window.innerHeight - rect.bottom < estimate && rect.top > window.innerHeight - rect.bottom ? "top" : "bottom";
      },
      onMenuClose: () => ((s.menuIsOpen = false), (s.placement = "auto")),
      onChange: (opt) => {
        if (!opt) return p.onChange("");
        if (opt.value === ADD_NEW_VALUE) return p.onAddNew();
        p.onChange(opt.value);
      },
      renderOption: (o, focused) =>
        o.isAddNewOption
          ? `<div class="flex items-center justify-between p-2 cursor-pointer bg-blue-50 hover:bg-blue-100 border-b border-gray-200"><span class="flex items-center gap-2 text-blue-700 font-semibold">${K.icon("Plus").replace('width="24" height="24"', 'width="16" height="16"')} ${K.esc(o.label)}</span></div>`
          : `<div class="p-2 cursor-pointer ${focused ? "bg-blue-600 text-white" : "bg-white text-black"}">${K.esc(o.label)}</div>`,
    })}
    <input aria-hidden="true" tabindex="-1" required value="${K.esc(p.value)}" class="sr-only">
  </div>`;
}

// ---- AddCategoryModal -------------------------------------------------------------------
const ADD_NEW_PARENT = "__add_new_parent__";
function AddCategoryModal(id, p) {
  K.props[id] = p;
  const s = K.state(id, () => ({ name: "", description: "", parent: null, addingNewParent: false, newParentName: "", newParentError: null, previewUrl: undefined, imageError: null, parentError: null, isSubmitting: false, error: null }));
  if (!p.open) return "";
  if (!s.addingNewParent) s.focusedNewParent = false;
  const parentOptions = [{ value: ADD_NEW_PARENT, label: "+ Add New Parent Category" }, ...p.categoryOptions.map((c) => ({ value: c.id, label: c.label }))];
  const addDisabled = s.isSubmitting || !s.name.trim() || (s.addingNewParent ? !s.newParentName.trim() : !s.parent);
  const blue = (o) => (o.value === ADD_NEW_PARENT ? "color:#1d4ed8;font-weight:600" : "");
  const children = `
    ${s.error ? `<p role="alert" class="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">${K.esc(s.error.message)}</p>` : ""}
    <div class="grid grid-cols-6 gap-3 md:gap-5 lg:gap-6 xl:gap-6 mb-6"><div class="col-span-6 sm:col-span-2 flex items-center gap-1 self-center"><label for="add-category-name" class="font-medium text-sm text-gray-700 dark:text-gray-300">Name</label><span class="text-red-500" aria-hidden="true">*</span></div>
      <div class="col-span-6 sm:col-span-4"><input id="add-category-name" required${!s.focusedName ? " data-autofocus-once" : ""} value="${K.esc(s.name)}" data-on-input="acm.name|${id}" placeholder="Category title" class="w-full h-10 rounded-md border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"></div></div>
    <div class="grid grid-cols-6 gap-3 md:gap-5 lg:gap-6 xl:gap-6 mb-6"><label for="add-category-description" class="col-span-6 sm:col-span-2 self-start pt-2 font-medium text-sm text-gray-700 dark:text-gray-300">Description</label>
      <div class="col-span-6 sm:col-span-4"><textarea id="add-category-description" data-on-input="acm.desc|${id}" placeholder="Description" rows="3" class="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200">${K.esc(s.description)}</textarea></div></div>
    <div class="grid grid-cols-6 gap-3 md:gap-5 lg:gap-6 xl:gap-6 mb-6"><div class="col-span-6 sm:col-span-2 flex items-center gap-1 self-center"><label for="add-category-parent" class="font-medium text-sm text-gray-700 dark:text-gray-300">Parent Category</label><span class="text-red-500" aria-hidden="true">*</span></div>
      <div class="col-span-6 sm:col-span-4" data-testid="add-category-modal-parent-select">
        ${RSelect(`${id}:parent`, {
          inputId: "add-category-parent",
          options: parentOptions,
          value: s.addingNewParent ? ADD_NEW_PARENT : s.parent?.value,
          placeholder: "Select Parent Category",
          menuZIndex: 9999,
          singleValueStyle: (o) => (o.value === ADD_NEW_PARENT ? "color:#1d4ed8;font-weight:600" : "color:#111827;font-weight:400"),
          optionStyle: blue,
          onChange: (sel) => {
            if (sel?.value === ADD_NEW_PARENT) return Object.assign(s, { addingNewParent: true, parent: null, parentError: null });
            Object.assign(s, { addingNewParent: false, newParentName: "", newParentError: null, parent: sel, parentError: null });
          },
        })}
        ${!s.addingNewParent ? `<p class="mt-2 flex gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-slate-600 dark:border-blue-900 dark:bg-blue-900/20 dark:text-slate-300"><span><strong>Note:</strong> A parent category is required — only subcategories can be assigned to a product.</span></p>` : ""}
        ${s.parentError ? `<p role="alert" data-testid="add-category-modal-parent-error" class="mt-1 text-xs text-red-600">${K.esc(s.parentError)}</p>` : ""}
      </div></div>
    ${s.addingNewParent ? `<div class="grid grid-cols-6 gap-3 md:gap-5 lg:gap-6 xl:gap-6 mb-6"><label for="add-category-new-parent" class="col-span-6 sm:col-span-2 flex items-center gap-1 self-center font-medium text-sm text-gray-700 dark:text-gray-300">Parent Category Name<span class="text-red-500" aria-hidden="true">*</span></label>
      <div class="col-span-6 sm:col-span-4"><input id="add-category-new-parent" type="text"${!s.focusedNewParent ? " data-autofocus-once" : ""} value="${K.esc(s.newParentName)}" data-on-input="acm.newParent|${id}" placeholder="Enter new parent category name" data-testid="add-category-modal-new-parent-input" class="w-full h-10 rounded-md border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:bg-gray-700 dark:text-gray-200 ${s.newParentError ? "border-red-400" : "border-gray-200 dark:border-gray-600"}">
      ${s.newParentError ? `<p role="alert" data-testid="add-category-modal-new-parent-error" class="mt-1 text-xs text-red-600">${K.esc(s.newParentError)}</p>` : ""}</div></div>` : ""}
    <div class="grid grid-cols-6 gap-3 md:gap-5 lg:gap-6 xl:gap-6 mb-6"><label class="col-span-6 sm:col-span-2 self-start pt-2 font-medium text-sm text-gray-700 dark:text-gray-300">Image</label>
      <div class="col-span-6 sm:col-span-4" data-image-field><input type="file" accept="image/*" class="hidden" data-testid="add-category-modal-image-input" data-on-change="acm.file|${id}">
        <div class="relative inline-block h-24 w-24"><button type="button" data-on-click="acm.pick|${id}" data-testid="add-category-modal-image-uploader" aria-label="${s.previewUrl ? "Change category image" : "Upload category image"}" class="flex h-full w-full items-center justify-center overflow-hidden rounded-lg ${s.previewUrl ? "border border-gray-100 dark:border-gray-700" : "border-2 border-dashed border-gray-300 bg-gray-50 hover:border-green-400 dark:border-gray-600 dark:bg-gray-700"}">${s.previewUrl ? `<img src="${K.esc(s.previewUrl)}" alt="" data-testid="add-category-modal-image-preview" class="h-full w-full object-cover" data-on-error="acm.previewError|${id}">` : K.icon("FiPlusCircle", "text-3xl text-green-500")}</button>
        ${s.previewUrl ? `<div class="absolute right-0 top-0 z-30 flex gap-1 p-1"><button type="button" title="Change image" data-on-click="acm.pick|${id}" data-testid="add-category-modal-image-replace-btn" class="rounded-full bg-white/90 p-1 text-blue-500 shadow-sm">${K.icon("FiEdit", "h-3 w-3")}</button><button type="button" title="Remove image" data-on-click="acm.remove|${id}" data-testid="add-category-modal-image-remove-btn" class="rounded-full bg-white/90 p-1 text-red-500 shadow-sm">${K.icon("FiXCircle", "h-3 w-3")}</button></div>` : ""}</div>
        ${s.imageError ? `<p role="alert" data-testid="add-category-modal-image-error" class="mt-1 text-xs text-red-600">${K.esc(s.imageError)}</p>` : ""}</div></div>
    <div class="flex justify-end gap-4 border-t border-gray-200 dark:border-gray-700 pt-4">
      <button type="button" data-on-click="acm.close|${id}" data-testid="add-category-modal-cancel-btn" class="h-10 rounded-md border border-gray-200 px-6 text-sm font-medium text-red-500 hover:bg-red-50 hover:border-red-100 hover:text-red-600 dark:border-gray-600">Cancel</button>
      <button type="button" data-on-click="acm.add|${id}"${K.attr("disabled", addDisabled)} data-testid="add-category-modal-submit-btn" class="h-10 rounded-md bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">${s.isSubmitting ? "Adding…" : "Add Category"}</button>
    </div>`;
  // autoFocus: focus each field once, when it first mounts.
  K.after(() => {
    const el = document.querySelector("[data-autofocus-once]");
    if (!el) return;
    if (el.id === "add-category-name") s.focusedName = true;
    if (el.id === "add-category-new-parent") s.focusedNewParent = true;
    el.focus();
  });
  return FormModal(`${id}:fm`, { open: true, onClose: () => K.on["acm.close"](id), title: "Add Category", description: "Add a new category and necessary information from here", size: "md", testId: "add-category-modal", children });
}
(() => {
  const reserved = (v) => PM.mapCategory.isReservedCategoryName(v);
  const msg = (v) => `"${v.trim()}" is a reserved system category name and can't be used.`;
  const reset = (id) => K.drop(id);
  K.on["acm.name"] = (id, ev) => (K.state(id).name = ev.target.value);
  K.on["acm.desc"] = (id, ev) => (K.state(id).description = ev.target.value);
  K.on["acm.newParent"] = (id, ev) => {
    const s = K.state(id);
    s.newParentName = ev.target.value;
    s.newParentError = reserved(ev.target.value) ? msg(ev.target.value) : null;
  };
  K.on["acm.pick"] = (id, ev, el) => el.closest("[data-image-field]").querySelector('input[type="file"]').click();
  K.on["acm.file"] = (id, ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    const s = K.state(id);
    if (!file.type.startsWith("image/")) return (s.imageError = "Please choose an image file.");
    s.imageError = null;
    const r = new FileReader();
    r.onload = () => ((s.previewUrl = typeof r.result === "string" ? r.result : ""), K.update());
    r.readAsDataURL(file);
  };
  K.on["acm.previewError"] = (id) => (K.state(id).previewUrl = undefined);
  K.on["acm.remove"] = (id) => (K.state(id).previewUrl = undefined);
  K.on["acm.close"] = (id) => {
    const p = K.props[id];
    reset(id);
    p.onClose();
  };
  K.on["acm.add"] = async (id) => {
    const s = K.state(id);
    const p = K.props[id];
    if (!s.name.trim()) return;
    if (s.addingNewParent) {
      if (!s.newParentName.trim()) return (s.newParentError = "Parent category name is required");
      if (reserved(s.newParentName)) return (s.newParentError = msg(s.newParentName));
    } else if (!s.parent) return (s.parentError = "Parent category is required — only subcategories can be assigned to a product.");
    s.isSubmitting = true;
    s.error = null;
    K.update();
    try {
      let parentRef = s.parent?.value;
      if (s.addingNewParent) parentRef = (await p.apiClient.createCategory(p.locationId, { name: s.newParentName.trim() })).id;
      await p.onCreate(s.name.trim(), parentRef, s.description.trim() || undefined, s.previewUrl);
      reset(id);
      p.onClose();
    } catch (err) {
      s.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      s.isSubmitting = false;
      K.update();
    }
  };
})();

// ---- BrowseGalleryModal ------------------------------------------------------------------
function BrowseGalleryModal(id, p) {
  K.props[id] = p;
  const s = K.state(id, () => ({ images: [], loading: true, loadingMore: false, page: 1, hasMore: false, selectedUrl: null, imgErrors: {}, searchQuery: "", fetching: false, started: false }));
  if (!s.started) {
    s.started = true;
    queueMicrotask(() => bgm.fetch(id, 1));
  }
  K.onEscape(() => p.onClose());
  const visible = s.images.filter((i) => !s.imgErrors[i.url]);
  const q = s.searchQuery.trim().toLowerCase();
  const filtered = !q ? visible : visible.filter((i) => i.url.toLowerCase().includes(q));
  let grid;
  if (s.loading) grid = `<div class="flex h-64 flex-col items-center justify-center gap-3"><div class="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-emerald-500 dark:border-gray-700"></div><p class="text-sm text-gray-400">Loading images...</p></div>`;
  else if (filtered.length === 0) grid = `<div class="flex h-64 flex-col items-center justify-center gap-3 text-gray-400">${iconSized("FiImage", "opacity-25", 40)}<p class="text-sm">${s.searchQuery ? "No images match your search" : "No images found"}</p></div>`;
  else
    grid = `<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">${filtered.map((im) => {
      const on = s.selectedUrl === im.url;
      return `<button data-key="${K.esc(im.id)}" type="button" data-on-click="bgm.select|${id}|${K.esc(im.url)}" data-testid="browse-gallery-image-${K.esc(im.id)}" class="relative aspect-square overflow-hidden rounded-lg border-2 bg-gray-100 transition-all duration-150 focus:outline-none dark:bg-gray-800 ${on ? "border-emerald-500 shadow-lg ring-2 ring-emerald-400/40" : "border-gray-200 hover:border-emerald-300 hover:shadow-md dark:border-gray-700"}"><img src="${K.esc(im.url)}" alt="" class="h-full w-full object-cover" loading="lazy" data-on-error="bgm.imgError|${id}|${K.esc(im.url)}">${on ? `<div class="absolute inset-0 flex items-end justify-end bg-emerald-500/20 p-1"><div class="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 shadow ring-2 ring-white">${iconSized("FiCheckCircle", "text-white", 12)}</div></div>` : ""}</button>`;
    }).join("")}</div><div class="flex min-h-[2rem] justify-center py-4">${s.loadingMore ? `<div class="flex items-center gap-2 text-sm text-gray-400"><div class="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-emerald-500"></div>Loading more...</div>` : s.hasMore ? `<button type="button" data-on-click="bgm.more|${id}" class="rounded-lg bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-200">Load more images</button>` : ""}</div>`;
  return K.portal(id, `<div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4" data-on-mousedown="bgm.backdrop|${id}">
    <div class="relative flex w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-950" style="height:88dvh" data-testid="browse-gallery-modal">
      <div class="flex shrink-0 items-center justify-between px-4 pb-3 pt-4 sm:px-6 sm:pt-5"><div class="flex items-center gap-2.5"><div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500 shadow-sm">${iconSized("FiImage", "text-white", 16)}</div><div><span class="text-sm font-bold tracking-tight text-gray-900 dark:text-gray-100">Foodbridge Directory</span><p class="mt-0.5 text-xs leading-none text-gray-400 dark:text-gray-500">Local image catalogue</p></div></div>
        <div class="flex items-center gap-3"><span class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Local</span><button type="button" data-on-click="bgm.close|${id}" aria-label="Close" class="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200">${iconSized("FiX", "", 16)}</button></div></div>
      <div class="shrink-0 px-4 pb-3 sm:px-6"><div class="flex items-center gap-3 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 shadow-sm transition-all focus-within:border-transparent focus-within:ring-2 focus-within:ring-emerald-500/50 dark:border-gray-700 dark:bg-gray-900 sm:px-5">
        <svg class="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
        <input type="text" value="${K.esc(s.searchQuery)}" data-on-input="bgm.search|${id}" placeholder="Search images..." data-testid="browse-gallery-search-input" class="min-w-0 flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder-gray-500">
        ${s.searchQuery ? `<button type="button" data-on-click="bgm.clearSearch|${id}" class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-500 transition hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600">${iconSized("FiX", "", 12)}</button>` : ""}</div></div>
      <div class="flex shrink-0 items-center gap-2 px-4 pb-3 sm:px-6"><span class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm">All<span class="text-white/75">${visible.length}</span></span>
        <span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold ${s.selectedUrl ? "bg-emerald-600 text-white shadow-sm" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}">${s.selectedUrl ? iconSized("FiCheckCircle", "", 11) : ""}${s.selectedUrl ? 1 : 0}/1 selected</span></div>
      <div class="flex-1 overflow-y-auto px-4 pb-4 sm:px-6">${grid}</div>
      <div class="flex shrink-0 items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-900/60 sm:px-6"><p class="text-xs text-gray-400">${s.selectedUrl ? "1 image ready to import" : "Select an image"}</p>
        <div class="flex items-center gap-2"><button type="button" data-on-click="bgm.close|${id}" data-testid="browse-gallery-cancel-btn" class="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">Cancel</button><button type="button"${K.attr("disabled", !s.selectedUrl)} data-on-click="bgm.import|${id}" data-testid="browse-gallery-import-btn" class="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">Import</button></div></div>
    </div>
  </div>`);
}
const bgm = {
  async fetch(id, page) {
    const s = K.state(id);
    if (s.fetching) return;
    s.fetching = true;
    const more = page > 1;
    more ? (s.loadingMore = true) : (s.loading = true);
    K.update();
    try {
      const res = await K.props[id].apiClient.listGalleryImages(page, 20);
      s.images = more ? [...s.images, ...res.images] : res.images;
      s.hasMore = (page - 1) * 20 + res.images.length < res.total;
      s.page = page;
    } finally {
      s.fetching = false;
      s.loading = false;
      s.loadingMore = false;
      K.update();
    }
  },
};
K.on["bgm.backdrop"] = (id, ev, el) => ev.target === el && K.props[id].onClose();
K.on["bgm.close"] = (id) => K.props[id].onClose();
K.on["bgm.search"] = (id, ev) => (K.state(id).searchQuery = ev.target.value);
K.on["bgm.clearSearch"] = (id) => (K.state(id).searchQuery = "");
K.on["bgm.select"] = (arg) => {
  const bar = arg.indexOf("|");
  K.state(arg.slice(0, bar)).selectedUrl = arg.slice(bar + 1);
};
K.on["bgm.imgError"] = (arg) => {
  const bar = arg.indexOf("|");
  const s = K.state(arg.slice(0, bar));
  s.imgErrors = { ...s.imgErrors, [arg.slice(bar + 1)]: true };
};
K.on["bgm.more"] = (id) => {
  const s = K.state(id);
  if (!s.hasMore || s.fetching) return;
  bgm.fetch(id, s.page + 1);
};
K.on["bgm.import"] = (id) => {
  const s = K.state(id);
  if (s.selectedUrl) K.props[id].onSelect(s.selectedUrl);
};

// ---- CameraCaptureModal -----------------------------------------------------------------
function CameraCaptureModal(id, p) {
  K.props[id] = p;
  const s = K.state(id, () => ({ ready: false, error: "", stream: null, started: false }));
  if (!s.started) {
    s.started = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!K.props[id]) return stream.getTracks().forEach((t) => t.stop());
        s.stream = stream;
        K.after(() => {
          const v = document.querySelector(`[data-ccm-video="${id}"]`);
          if (!v) return;
          v.srcObject = stream;
          v.onloadedmetadata = () => {
            v.play();
            s.ready = true;
            K.update();
          };
        });
        K.update();
      } catch (err) {
        if (!K.props[id]) return;
        const name = err instanceof DOMException ? err.name : "";
        s.error = name === "NotAllowedError" ? "Camera access was denied. Please allow camera permission in your browser and try again." : name === "NotFoundError" ? "No camera found. Make sure a camera is connected." : `Camera error: ${err instanceof Error ? err.message : String(err)}`;
        K.update();
      }
    })();
  }
  return FormModal(`${id}:fm`, {
    open: true, onClose: p.onClose, title: "Take Photo", size: "sm", testId: "camera-capture-modal", zIndex: 10000,
    children: `<div class="relative overflow-hidden rounded-lg bg-black" style="aspect-ratio:16/9">${s.error
      ? `<div class="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">${iconSized("FiXCircle", "text-red-400", 36)}<p class="text-sm text-red-300">${K.esc(s.error)}</p></div>`
      : `<video data-ccm-video="${id}" class="h-full w-full object-cover" playsinline muted></video>${!s.ready ? `<div class="absolute inset-0 flex items-center justify-center"><div class="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white"></div></div>` : ""}`}</div>
      <div class="mt-4 flex items-center justify-center"><button type="button" data-on-click="ccm.shutter|${id}"${K.attr("disabled", !s.ready)} data-testid="camera-capture-shutter-btn" title="Capture photo" class="flex h-16 w-16 items-center justify-center rounded-full border-4 border-gray-300 bg-white shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">${iconSized("FiCamera", "text-gray-800", 24)}</button></div>`,
  });
}
function dropCamera(id) {
  K.state(id, {}).stream?.getTracks().forEach((t) => t.stop());
  K.drop(id);
}
K.on["ccm.shutter"] = (id) => {
  const s = K.state(id);
  const v = document.querySelector(`[data-ccm-video="${id}"]`);
  if (!v || !s.ready) return;
  const c = document.createElement("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(v, 0, 0);
  c.toBlob((blob) => {
    if (!blob) return;
    s.stream?.getTracks().forEach((t) => t.stop());
    K.props[id].onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
    K.update();
  }, "image/jpeg", 0.92);
};

// ---- ImagesRow -------------------------------------------------------------------------
const IMAGE_SLOTS = [0, 1, 2, 3];
function ImagesRow(id, p) {
  K.props[id] = p;
  const s = K.state(id, () => ({ imagesBySlot: {}, stagedBySlot: {}, clearedSlots: new Set(), failedUrlBySlot: {}, uploadingSlot: null, errorsBySlot: {}, openMenuSlot: null, resolution: PM.imageResize.IMAGE_RESOLUTION_OPTIONS[0].value, browseGallerySlot: null, cameraSlot: null, mutationVersion: 0, fetchedFor: undefined }));
  if (s.fetchedFor !== p.productId) {
    s.fetchedFor = p.productId;
    if (!p.productId) {
      s.imagesBySlot = {};
      s.clearedSlots = new Set();
    } else {
      const v = s.mutationVersion;
      p.apiClient.getProductImages(p.productId).then(({ images, clearedSlots }) => {
        if (s.mutationVersion !== v) return;
        s.imagesBySlot = Object.fromEntries(images.filter((i) => IMAGE_SLOTS.includes(i.slot)).map((i) => [i.slot, i.url]));
        s.clearedSlots = new Set(clearedSlots.filter((x) => IMAGE_SLOTS.includes(x)));
        K.update();
      });
    }
  }
  const dialogOpen = s.browseGallerySlot !== null || s.cameraSlot !== null;
  if (s.lastDialogOpen !== dialogOpen) {
    s.lastDialogOpen = dialogOpen;
    p.onDialogOpenChange && p.onDialogOpenChange(dialogOpen);
  }
  const tiles = IMAGE_SLOTS.map((slot) => {
    const staged = s.stagedBySlot[slot];
    const stagedUrl = staged?.kind === "file" ? staged.previewUrl : staged?.url;
    const url = stagedUrl ?? s.imagesBySlot[slot] ?? (p.productId && !s.clearedSlots.has(slot) ? PM.productImage.getProductImageUrl(p.productId, slot) : undefined);
    const loadFailed = url !== undefined && s.failedUrlBySlot[slot] === url;
    const uploading = s.uploadingSlot === slot;
    const error = s.errorsBySlot[slot];
    const menuOpen = s.openMenuSlot === slot;
    return `<div data-key="${slot}" class="relative text-center"${menuOpen ? ` data-on-outside="ir.outside|${id}"` : ""}>
      <input type="file" accept="image/*" class="hidden" data-testid="images-row-file-input-${slot}" data-on-change="ir.file|${id}|${slot}">
      <div class="relative mx-auto inline-block h-16 w-16 sm:h-24 sm:w-24">
        <button type="button"${K.attr("disabled", uploading)} title="${url ? "Change image" : "Add image"}" data-on-click="ir.menu|${id}|${slot}" data-testid="images-row-slot-${slot}" class="relative flex h-full w-full items-center justify-center overflow-hidden rounded-md cursor-pointer ${url ? "border border-gray-100 dark:border-gray-700" : "border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"}">
          ${url ? (loadFailed ? `<img src="${PM.PRODUCT_IMAGE_FALLBACK_URL}" alt="" class="w-full h-full object-contain p-2">` : `<img src="${K.esc(url)}" alt="" class="w-full h-full object-cover" data-on-error="ir.imgError|${id}|${slot}">`) : K.icon("FiPlusCircle", "text-2xl text-green-500 sm:text-3xl")}
          ${uploading ? `<span class="absolute inset-0 flex items-center justify-center bg-black/45">${K.icon("FiLoader", "w-5 h-5 animate-spin text-white")}</span>` : ""}
        </button>
        ${url ? `<div class="absolute top-0 right-0 z-30 flex gap-1 p-1"><button type="button"${K.attr("disabled", uploading)} title="${uploading ? "Uploading..." : "Change image"}" data-on-click="ir.menu|${id}|${slot}" class="rounded-full bg-white/90 p-1 text-blue-500 shadow-sm ${uploading ? "cursor-not-allowed opacity-50" : ""}">${K.icon("FiEdit", "w-3 h-3")}</button><button type="button"${K.attr("disabled", uploading)} title="Remove image" data-on-click="ir.remove|${id}|${slot}" data-testid="images-row-remove-${slot}" class="rounded-full bg-white/90 p-1 text-red-500 shadow-sm ${uploading ? "cursor-not-allowed opacity-50" : ""}">${K.icon("FiXCircle", "w-3 h-3")}</button></div>` : ""}
        ${menuOpen ? `<div data-testid="images-row-menu-${slot}" class="absolute left-0 top-full z-50 mt-1.5 min-w-[160px] overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-xl dark:border-gray-700 dark:bg-gray-800">
          <div class="border-b border-gray-100 px-3 py-2 dark:border-gray-700"><label class="mb-1 block text-[11px] font-semibold text-gray-500 dark:text-gray-400">Resolution</label><select data-on-change="ir.resolution|${id}" data-testid="images-row-resolution-${slot}" class="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">${PM.imageResize.IMAGE_RESOLUTION_OPTIONS.map((o) => `<option value="${o.value}"${K.attr("selected", s.resolution === o.value)}>${o.label}</option>`).join("")}</select></div>
          <button type="button" data-on-click="ir.choose|${id}|${slot}" class="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700">${iconSized("FiImage", "shrink-0 text-blue-500", 14)}<span class="whitespace-nowrap font-medium">Choose Photo</span></button>
          <div class="h-px bg-gray-100 dark:bg-gray-700"></div>
          <button type="button" data-on-click="ir.browse|${id}|${slot}" data-testid="images-row-browse-gallery-btn-${slot}" class="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700">${iconSized("FiImage", "shrink-0 text-emerald-600", 14)}<span class="whitespace-nowrap font-medium">Browse Gallery</span></button>
          <div class="h-px bg-gray-100 dark:bg-gray-700"></div>
          <button type="button" data-on-click="ir.camera|${id}|${slot}" data-testid="images-row-take-photo-btn-${slot}" class="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700">${iconSized("FiCamera", "shrink-0 text-emerald-500", 14)}<span class="whitespace-nowrap font-medium">Take Photo</span></button>
        </div>` : ""}
      </div>
      ${error ? `<p class="mt-1 text-[11px] text-red-500" data-testid="images-row-error-${slot}">${K.esc(error)}</p>` : ""}
    </div>`;
  }).join("");
  const browse = s.browseGallerySlot !== null ? BrowseGalleryModal(`${id}:bgm`, { apiClient: p.apiClient, onSelect: (url) => ir.selectFromGallery(id, s.browseGallerySlot, url), onClose: () => ((s.browseGallerySlot = null), K.drop(`${id}:bgm`)) }) : "";
  const camera = s.cameraSlot !== null ? CameraCaptureModal(`${id}:ccm`, { onCapture: (file) => { const slot = s.cameraSlot; s.cameraSlot = null; dropCamera(`${id}:ccm`); ir.uploadFile(id, slot, file); }, onClose: () => ((s.cameraSlot = null), dropCamera(`${id}:ccm`)) }) : "";
  return `<div class="grid grid-cols-4 gap-4">${tiles}${browse}${camera}</div>`;
}
const ir = {
  stage(id, slot, entry) {
    const s = K.state(id);
    const old = s.stagedBySlot[slot];
    if (old?.kind === "file") URL.revokeObjectURL(old.previewUrl);
    s.stagedBySlot = { ...s.stagedBySlot, [slot]: entry };
  },
  async uploadFile(id, slot, file) {
    const s = K.state(id);
    const p = K.props[id];
    s.errorsBySlot = { ...s.errorsBySlot, [slot]: undefined };
    s.uploadingSlot = slot;
    K.update();
    try {
      const resized = await PM.imageResize.resizeImageFile(file, s.resolution);
      if (!p.productId) return ir.stage(id, slot, { kind: "file", file: resized, previewUrl: URL.createObjectURL(resized) });
      const { url } = await p.apiClient.uploadProductImage(p.productId, slot, resized, resized.type);
      s.mutationVersion++;
      const cb = PM.productImage.recordImageWrite(p.productId, slot);
      s.imagesBySlot = { ...s.imagesBySlot, [slot]: PM.productImage.withCacheBust(url, cb) };
      if (s.clearedSlots.has(slot)) s.clearedSlots = new Set([...s.clearedSlots].filter((x) => x !== slot));
    } catch (err) {
      s.errorsBySlot = { ...s.errorsBySlot, [slot]: err instanceof Error ? err.message : "Failed to upload image" };
    } finally {
      s.uploadingSlot = null;
      K.update();
    }
  },
  async selectFromGallery(id, slot, url) {
    const s = K.state(id);
    const p = K.props[id];
    s.browseGallerySlot = null;
    K.drop(`${id}:bgm`);
    s.errorsBySlot = { ...s.errorsBySlot, [slot]: undefined };
    if (!p.productId) return ir.stage(id, slot, { kind: "url", url });
    s.uploadingSlot = slot;
    K.update();
    try {
      const r = await p.apiClient.selectGalleryImage(p.productId, slot, url);
      s.mutationVersion++;
      s.imagesBySlot = { ...s.imagesBySlot, [slot]: r.url };
      if (s.clearedSlots.has(slot)) s.clearedSlots = new Set([...s.clearedSlots].filter((x) => x !== slot));
    } catch (err) {
      s.errorsBySlot = { ...s.errorsBySlot, [slot]: err instanceof Error ? err.message : "Failed to select image" };
    } finally {
      s.uploadingSlot = null;
      K.update();
    }
  },
  async uploadStaged(id, newProductId) {
    const s = K.state(id);
    const p = K.props[id];
    let hadFailure = false;
    for (const [slotKey, staged] of Object.entries(s.stagedBySlot)) {
      const slot = Number(slotKey);
      try {
        if (staged.kind === "file") {
          const { url } = await p.apiClient.uploadProductImage(newProductId, slot, staged.file, staged.file.type);
          s.imagesBySlot = { ...s.imagesBySlot, [slot]: PM.productImage.withCacheBust(url, PM.productImage.recordImageWrite(newProductId, slot)) };
          URL.revokeObjectURL(staged.previewUrl);
        } else {
          const r = await p.apiClient.selectGalleryImage(newProductId, slot, staged.url);
          s.imagesBySlot = { ...s.imagesBySlot, [slot]: r.url };
        }
      } catch (err) {
        hadFailure = true;
        s.errorsBySlot = { ...s.errorsBySlot, [slot]: err instanceof Error ? err.message : "Failed to upload image" };
      }
    }
    s.stagedBySlot = {};
    if (hadFailure) p.onNotify && p.onNotify("Error uploading images", "error");
  },
};
const irArg = (arg) => {
  const [id, slot] = arg.split("|");
  return [id, Number(slot)];
};
K.on["ir.menu"] = (arg) => {
  const [id, slot] = irArg(arg);
  const s = K.state(id);
  s.openMenuSlot = s.openMenuSlot === slot ? null : slot;
};
K.on["ir.outside"] = (id) => (K.state(id).openMenuSlot = null);
K.on["ir.resolution"] = (id, ev) => (K.state(id).resolution = ev.target.value);
K.on["ir.choose"] = (arg, ev, el) => {
  const [id] = irArg(arg);
  K.state(id).openMenuSlot = null;
  el.closest(".relative.text-center").querySelector('input[type="file"]').click();
};
K.on["ir.browse"] = (arg) => {
  const [id, slot] = irArg(arg);
  Object.assign(K.state(id), { openMenuSlot: null, browseGallerySlot: slot });
};
K.on["ir.camera"] = (arg) => {
  const [id, slot] = irArg(arg);
  Object.assign(K.state(id), { openMenuSlot: null, cameraSlot: slot });
};
K.on["ir.file"] = (arg, ev) => {
  const [id, slot] = irArg(arg);
  const file = ev.target.files?.[0];
  K.state(id).openMenuSlot = null;
  if (file) ir.uploadFile(id, slot, file);
  ev.target.value = "";
};
K.on["ir.imgError"] = (arg, ev) => {
  const [id, slot] = irArg(arg);
  const s = K.state(id);
  s.failedUrlBySlot = { ...s.failedUrlBySlot, [slot]: ev.target.getAttribute("src") };
};
K.on["ir.remove"] = async (arg) => {
  const [id, slot] = irArg(arg);
  const s = K.state(id);
  const p = K.props[id];
  s.openMenuSlot = null;
  if (!p.productId) {
    const old = s.stagedBySlot[slot];
    if (old?.kind === "file") URL.revokeObjectURL(old.previewUrl);
    const next = { ...s.stagedBySlot };
    delete next[slot];
    s.stagedBySlot = next;
    return;
  }
  s.uploadingSlot = slot;
  s.errorsBySlot = { ...s.errorsBySlot, [slot]: undefined };
  K.update();
  try {
    await p.apiClient.removeProductImage(p.productId, slot);
    s.mutationVersion++;
    const next = { ...s.imagesBySlot };
    delete next[slot];
    s.imagesBySlot = next;
    s.clearedSlots = new Set([...s.clearedSlots, slot]);
  } catch (err) {
    s.errorsBySlot = { ...s.errorsBySlot, [slot]: err instanceof Error ? err.message : "Failed to remove image" };
  } finally {
    s.uploadingSlot = null;
    K.update();
  }
};

// ---- ProductDrawer + useProductFormController ----------------------------------------------
const EMPTY_FORM = { articleNo: "", name: "", description: "", taxClassificationCode: "", barcode: "", categoryReference: "", brand: "", measurement: "", priceMap: {}, offerPriceMap: {}, boxes: "", pallets: "", tax: "", stockThreshold: "", stock: "" };
function toFormValues(product) {
  if (!product) return { ...EMPTY_FORM };
  const vm = PM.mapProduct.toProductFormViewModel(product);
  return {
    articleNo: vm.articleNo, name: vm.name, description: vm.description ?? "", taxClassificationCode: vm.taxClassificationCode ?? "", barcode: vm.barcode ?? "",
    categoryReference: vm.categoryReference ?? "", brand: vm.brand ?? "", measurement: vm.measurement ?? "", priceMap: vm.priceMap ?? {}, offerPriceMap: vm.offerPriceMap ?? {},
    boxes: vm.boxes ?? "", pallets: vm.pallets ?? "", tax: vm.tax !== undefined ? String(vm.tax) : "", stockThreshold: vm.stockThreshold ?? "", stock: "",
  };
}
const treeToOptions = (tree) => tree.map((r) => ({ id: r.id, label: r.name, children: r.children.map((c) => ({ id: c.id, label: c.name, children: [] })) }));

function openProductDrawer(id, p) {
  // p: { apiClient, locationId, catalogueType, productId, onClose, onSaved, onNotify }
  K.drop(id);
  K.drop(`${id}:images`);
  K.drop(`${id}:addcat`);
  K.drop(`${id}:upm:form`);
  const d = K.state(id, () => ({ values: { ...EMPTY_FORM }, initial: { ...EMPTY_FORM }, isLoading: true, isSubmitting: false, error: null, categoryOptions: [], unitTriples: [], originalAttributes: {}, originalCostPrice: undefined, autoFilled: false, isAddCategoryModalOpen: false, showDiscardModal: false, submitError: null, unitModalOpen: false, imagesDialogOpen: false }));
  K.props[id] = p;
  Promise.all([p.productId ? p.apiClient.getProduct(p.productId) : Promise.resolve(null), p.apiClient.listCategories(p.locationId), p.apiClient.getUnitOptions(p.locationId)])
    .then(([product, tree, units]) => {
      const v = toFormValues(product);
      d.values = v;
      d.initial = { ...v };
      d.originalAttributes = product?.attributes ?? {};
      d.originalCostPrice = product?.costPrice;
      d.categoryOptions = treeToOptions(tree);
      d.unitTriples = Object.values(units);
      d.isLoading = false;
      d.error = null;
      if (!p.productId && !d.autoFilled) {
        d.autoFilled = true;
        const suffix = randomArticleSuffix();
        d.values.articleNo = suffix;
        d.initial.articleNo = suffix;
      }
      K.update();
    })
    .catch((err) => {
      d.isLoading = false;
      d.error = err;
      p.onNotify && p.onNotify(`Failed to load: ${err.message}`, "error");
      K.update();
    });
}
const pdDirty = (d) => JSON.stringify(d.values) !== JSON.stringify(d.initial);
function pdClose(id) {
  const d = K.state(id);
  if (pdDirty(d)) return (d.showDiscardModal = true);
  K.props[id].onClose();
}
K.on["pd.close"] = (id) => pdClose(id);
K.on["pd.field"] = (arg, ev) => {
  const [id, field] = arg.split("|");
  const d = K.state(id);
  const raw = ev.target.value;
  d.values = { ...d.values, [field]: field === "stock" || field === "stockThreshold" ? (raw === "" ? "" : Number(raw)) : raw };
};
K.on["pd.generate"] = (id) => {
  const d = K.state(id);
  d.values = { ...d.values, articleNo: randomArticleSuffix() };
};
K.on["pd.unitModal"] = (id) => (K.state(id).unitModalOpen = true);
K.on["pd.submit"] = async (id, ev) => {
  ev.preventDefault();
  const d = K.state(id);
  const p = K.props[id];
  d.submitError = null;
  d.isSubmitting = true;
  K.update();
  try {
    const v = d.values;
    const attributes = { ...d.originalAttributes };
    if (v.taxClassificationCode) attributes.taxClassificationCode = v.taxClassificationCode;
    else delete attributes.taxClassificationCode;
    const smallest = PM.catalogueDrawer.resolveSmallestUnitPrice({ measurement: v.measurement, priceMap: v.priceMap });
    const costPrice = d.originalCostPrice ? d.originalCostPrice : smallest;
    const request = PM.mapProduct.fromProductFormInput(
      {
        name: v.name, articleNumber: v.articleNo, description: v.description || undefined, attributes, categoryReference: v.categoryReference || undefined, brand: v.brand || undefined, barcode: v.barcode || undefined,
        measurement: v.measurement || undefined, priceMap: Object.keys(v.priceMap).length ? v.priceMap : undefined, offerPriceMap: Object.keys(v.offerPriceMap).length ? v.offerPriceMap : undefined,
        price: smallest, costPrice, boxes: v.boxes !== "" ? Number(v.boxes) : undefined, pallets: v.pallets !== "" ? Number(v.pallets) : undefined, tax: v.tax !== "" ? Number(v.tax) : undefined,
        stockThreshold: v.stockThreshold !== "" ? Number(v.stockThreshold) : undefined, stock: !p.productId && v.stock !== "" ? Number(v.stock) : undefined,
      },
      p.catalogueType,
    );
    const product = p.productId ? await p.apiClient.editProduct(p.productId, request) : await p.apiClient.createProduct(p.locationId, request);
    d.initial = { ...v };
    d.isSubmitting = false;
    if (!p.productId) await ir.uploadStaged(`${id}:images`, product.id);
    p.onSaved(product);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    d.submitError = e;
    p.onNotify && p.onNotify(e.message, "error");
  } finally {
    d.isSubmitting = false;
    K.update();
  }
};

function ProductDrawer(id) {
  const d = K.state(id);
  const p = K.props[id];
  const v = d.values;
  const isRaw = p.catalogueType === "RAW-MATERIAL";
  const [secondaryUnit, baseUnit] = v.measurement ? v.measurement.split("-") : ["", ""];
  const calc = { measurement: v.measurement, priceMap: v.priceMap, offerPriceMap: v.offerPriceMap, boxes: v.boxes === "" ? undefined : v.boxes, pallets: v.pallets === "" ? undefined : v.pallets };
  const basePrice = PM.catalogueDrawer.resolveBasePrice(calc);
  const unitSuffix = PM.catalogueDrawer.resolveOrderingUnit(calc);
  const withUnit = (l) => (unitSuffix ? `${l} (${unitSuffix})` : l);
  const nested = d.unitModalOpen || d.isAddCategoryModalOpen || d.showDiscardModal || d.imagesDialogOpen;
  const inputClass = "w-full h-10 rounded-md border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500";
  const row = ({ label, htmlFor, required, hint, alignTop }, inner) => `<div class="grid grid-cols-6 gap-3 md:gap-5 lg:gap-6 xl:gap-6 mb-6"><div class="col-span-6 sm:col-span-2 flex items-center gap-1 ${alignTop ? "pt-2" : "self-center"}"><label${K.attr("for", htmlFor)} class="font-medium text-sm text-gray-700 dark:text-gray-300">${K.esc(label)}</label>${required ? `<span class="text-red-500" aria-hidden="true">*</span>` : ""}${hint ? `<span title="${K.esc(hint)}" aria-hidden="true">${K.icon("FiInfo", "w-3 h-3 text-gray-400")}</span>` : ""}</div><div class="col-span-6 sm:col-span-4">${inner}</div></div>`;
  const field = (name) => `value="${K.esc(v[name])}" data-on-input="pd.field|${id}|${name}"`;
  const taxLabel = PM.format.formatTaxLabel(v.tax);
  const form = `<form id="product-drawer-form" data-on-submit="pd.submit|${id}">
    ${row({ label: "Article No", htmlFor: "product-drawer-article-no" }, `<div class="flex gap-1"><input id="product-drawer-article-no" ${field("articleNo")} placeholder="Article No" class="${inputClass}"><button type="button" data-on-click="pd.generate|${id}" data-testid="product-drawer-generate-article-no-btn" class="h-10 shrink-0 rounded-md border border-transparent bg-green-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-green-700">Generate</button></div>`)}
    ${row({ label: "Title/Name", htmlFor: "product-drawer-name", required: true }, `<input id="product-drawer-name" required ${field("name")} placeholder="Title/Name" class="${inputClass}">`)}
    ${row({ label: "Description", htmlFor: "product-drawer-description", alignTop: true }, `<textarea id="product-drawer-description" rows="4" data-on-input="pd.field|${id}|description" placeholder="Description" class="${inputClass} h-auto bg-gray-50 py-2 dark:bg-gray-700">${K.esc(v.description)}</textarea>`)}
    ${row({ label: "Images" }, ImagesRow(`${id}:images`, { apiClient: p.apiClient, productId: p.productId, onDialogOpenChange: (o) => (d.imagesDialogOpen = o), onNotify: p.onNotify }))}
    ${row({ label: "HSN/SAC", htmlFor: "product-drawer-hsn-sac" }, `<input id="product-drawer-hsn-sac" ${field("taxClassificationCode")} placeholder="HSN/SAC" class="${inputClass}">`)}
    ${row({ label: "Barcode", htmlFor: "product-drawer-barcode" }, `<input id="product-drawer-barcode" ${field("barcode")} placeholder="Barcode" class="${inputClass}">`)}
    ${row({ label: "Category", htmlFor: "product-drawer-category", required: true }, CategorySelect("product-drawer-category", { categoryOptions: d.categoryOptions, value: v.categoryReference, onChange: (cid) => (d.values = { ...d.values, categoryReference: cid }), onAddNew: () => (d.isAddCategoryModalOpen = true) }))}
    ${row({ label: "Unit & Price", required: true }, v.measurement
      ? `<div class="flex flex-wrap items-center gap-2"><button type="button" data-on-click="pd.unitModal|${id}" data-testid="product-drawer-unit-price-edit-btn" class="h-10 shrink-0 rounded-md border border-blue-200 bg-blue-50 px-4 text-sm font-medium text-blue-700 hover:bg-blue-100">Edit Unit &amp; Price</button>
        <span data-testid="product-drawer-unit-conversion" class="text-sm font-medium text-blue-600 whitespace-nowrap">1 ${K.esc(baseUnit)} = ${K.esc(v.boxes)} ${K.esc(secondaryUnit)}</span>
        ${basePrice !== undefined ? `<span data-testid="product-drawer-unit-price-value" class="text-sm font-medium text-green-600 whitespace-nowrap">${K.esc(PM.format.formatPrice(Number(basePrice)))}</span>` : ""}
        ${taxLabel ? `<span data-testid="product-drawer-unit-tax-label" class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">${taxLabel}</span>` : ""}</div>`
      : `<button type="button" data-on-click="pd.unitModal|${id}" data-testid="product-drawer-unit-price-select-btn" class="h-10 rounded-md border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">Select Unit &amp; Price</button>`)}
    ${row({ label: withUnit(isRaw ? "Purchasing Price" : "Price"), htmlFor: "product-drawer-base-price", hint: isRaw ? "Purchasing price is set in the Unit & Price selection above" : "Price is set in the Unit & Price selection above" }, `<input id="product-drawer-base-price" type="number" required value="${basePrice !== undefined ? basePrice.toFixed(2) : ""}" data-on-input="pd.noop" placeholder="${isRaw ? "Purchasing Price" : "Original Price"}" data-testid="unit-price-required-input" class="${inputClass} cursor-not-allowed bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-400">`)}
    ${!p.productId ? row({ label: withUnit("Opening Stock"), htmlFor: "product-drawer-opening-stock" }, `<input id="product-drawer-opening-stock" type="number" ${field("stock")} data-testid="opening-stock-input" placeholder="Enter opening stock quantity" class="${inputClass}">`) : ""}
    ${isRaw ? row({ label: withUnit("Minimum Stock Level"), htmlFor: "product-drawer-stock-threshold" }, `<input id="product-drawer-stock-threshold" type="number" ${field("stockThreshold")} data-testid="stock-threshold-input" placeholder="0" class="${inputClass}">`) : ""}
    ${row({ label: "Brand", htmlFor: "product-drawer-brand" }, `<input id="product-drawer-brand" ${field("brand")} placeholder="Enter product brand" class="${inputClass}">`)}
  </form>`;
  const body = `${d.error ? `<p role="alert" data-testid="product-drawer-load-error" class="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Failed to load: ${K.esc(d.error.message)}</p>` : ""}
    ${d.submitError ? `<p role="alert" data-testid="product-drawer-submit-error" class="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">${K.esc(d.submitError.message)}</p>` : ""}
    ${d.isLoading ? `<p class="py-8 text-center text-sm text-gray-500" data-testid="product-drawer-loading">Loading…</p>` : form}
    ${UnitPriceModal(`${id}:upm`, { isOpen: d.unitModalOpen, onClose: () => (d.unitModalOpen = false), onSave: (payload) => (d.values = { ...d.values, ...PM.unitPriceMapping.unitPriceSaveToWriteFields(payload) }), unitOptions: d.unitTriples, originalPrice: basePrice, unit: v.measurement || undefined, boxes: v.boxes, pallets: v.pallets, enablePallets: false, productId: p.productId, tax: v.tax, priceMap: v.priceMap, isRawMaterial: isRaw })}
    ${AddCategoryModal(`${id}:addcat`, { open: d.isAddCategoryModalOpen, onClose: () => (d.isAddCategoryModalOpen = false), categoryOptions: d.categoryOptions, apiClient: p.apiClient, locationId: p.locationId, onCreate: async (name, parentRef, description, icon) => {
      const created = await p.apiClient.createCategory(p.locationId, { name, parentCategoryReference: parentRef, description, icon });
      d.categoryOptions = treeToOptions(await p.apiClient.listCategories(p.locationId));
      d.values = { ...d.values, categoryReference: created.id };
    } })}
    ${DiscardChangesModal(`${id}:discard`, { open: d.showDiscardModal, onCancelDiscard: () => (d.showDiscardModal = false), onConfirmDiscard: () => ((d.showDiscardModal = false), p.onClose()), title: "Discard Changes", description: "Are you sure you want to discard the changes?" })}`;
  return SlideDrawer(`${id}:drawer`, {
    open: true, onClose: () => pdClose(id), zIndex: 9999, testId: "product-drawer", dimmed: !nested, closeOnBackdrop: !nested,
    title: `${p.productId ? "Edit" : "Add"} ${isRaw ? "Raw Material" : "Product"}`,
    description: `${p.productId ? "Update" : "Add"} your ${isRaw ? "raw material" : "product"} and necessary information from here`,
    footer: !d.isLoading ? `<button type="submit" form="product-drawer-form"${K.attr("disabled", d.isSubmitting)} data-testid="product-drawer-save-btn" class="h-12 min-w-0 flex-1 rounded-md bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">${d.isSubmitting ? "Saving…" : `${p.productId ? "Update" : "Add"} ${isRaw ? "Raw Material" : "Product"}`}</button><button type="button" data-on-click="pd.close|${id}" class="h-12 min-w-0 flex-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-red-500 hover:border-red-100 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-red-700">Cancel</button>` : "",
    children: body,
  });
}
K.on["pd.noop"] = (_, ev) => {
  // Controlled input with a no-op onChange: React re-renders the old value.
  K.update();
};
