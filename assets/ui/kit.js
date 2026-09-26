// Discovery v5 UI kit (Addendum 006) — vanilla JS, no framework (R5).
//
// A screen is `K.app(root, render)`: `render()` returns an HTML string built with the module's
// own Tailwind class strings; `K.update()` re-renders by morphing the live DOM (so typing keeps
// focus/caret, like React). Events are delegated: an element carries
// `data-on-click="handlerName|arg"` (also -input, -change, -blur, -keydown, -mousedown,
// -outside for "mousedown outside this element"). Handlers live in `K.on` and receive
// (arg, event, element).
//
// Components that React keeps state for keep it in `K.state(id, init)` — one persistent object
// per instance id — and their callback props are stored at render time in `K.props[id]`, so an
// event handler always calls the callbacks from the latest render (same as React closures).

const K = (() => {
  const on = {};
  const props = {};
  const store = {};
  let root = null;
  let renderFn = null;
  let scheduled = false;
  let escapeStack = [];

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const cx = (...parts) => parts.filter(Boolean).join(" ");
  const attr = (name, value) => (value === undefined || value === null || value === false ? "" : value === true ? ` ${name}` : ` ${name}="${esc(value)}"`);
  const icon = (name, cls = "") => ICONS[name](cls);

  function state(id, init) {
    if (!store[id]) store[id] = typeof init === "function" ? init() : { ...(init || {}) };
    return store[id];
  }
  function drop(id) {
    delete store[id];
    delete props[id];
  }

  // ---- DOM morph -------------------------------------------------------------------------
  function syncFormState(from, to) {
    if (from.tagName === "INPUT") {
      if (from.type === "checkbox" || from.type === "radio") from.checked = to.hasAttribute("checked");
      else if (from.type !== "file") {
        const v = to.getAttribute("value") ?? "";
        if (from.value !== v) from.value = v;
      }
    } else if (from.tagName === "TEXTAREA") {
      const v = to.textContent;
      if (from.value !== v) from.value = v;
    } else if (from.tagName === "SELECT") {
      const sel = to.querySelector("option[selected]") || to.querySelector("option");
      const v = sel ? (sel.getAttribute("value") ?? sel.textContent) : "";
      if (from.value !== v) from.value = v;
    }
  }
  function morphAttrs(from, to) {
    for (const a of Array.from(from.attributes)) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
    for (const a of Array.from(to.attributes)) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
  }
  const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute("data-key") ?? (n.id || null) : null);
  function sameNode(a, b) {
    if (a.nodeType !== b.nodeType) return false;
    if (a.nodeType !== 1) return true;
    return a.tagName === b.tagName && keyOf(a) === keyOf(b);
  }
  // Keyed children are MOVED to their new position (never re-created), so a focused input
  // inside a keyed subtree survives siblings appearing/disappearing — React's key semantics.
  function morphChildren(from, to) {
    if (from.tagName === "TEXTAREA") return;
    const next = Array.from(to.childNodes);
    // Drop keyed nodes that no longer exist first — moving a node that holds focus (e.g.
    // insertBefore on the input's container) would blur it, as React never does.
    const wanted = new Set(next.map(keyOf).filter((k) => k != null));
    for (const c of Array.from(from.childNodes)) {
      const k = keyOf(c);
      if (k != null && !wanted.has(k)) from.removeChild(c);
    }
    const keyed = new Map();
    for (const c of Array.from(from.childNodes)) {
      const k = keyOf(c);
      if (k != null) keyed.set(k, c);
    }
    for (let i = 0; i < next.length; i++) {
      const want = next[i];
      const k = keyOf(want);
      const cur = from.childNodes[i];
      if (k != null && keyed.has(k)) {
        const match = keyed.get(k);
        keyed.delete(k);
        if (match.tagName === want.tagName) {
          if (match !== cur) from.insertBefore(match, cur || null);
          morphNode(match, want);
          continue;
        }
      }
      if (!cur) from.appendChild(want);
      else if (keyOf(cur) != null && keyed.has(keyOf(cur))) from.insertBefore(want, cur);
      else if (!sameNode(cur, want)) from.replaceChild(want, cur);
      else morphNode(cur, want);
    }
    while (from.childNodes.length > next.length) from.removeChild(from.lastChild);
  }
  function morphNode(from, to) {
    if (from.nodeType === 3 || from.nodeType === 8) {
      if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
      return;
    }
    morphAttrs(from, to);
    morphChildren(from, to);
    syncFormState(from, to);
  }
  // JSX drops whitespace-only text that contains a line break; do the same so the DOM matches
  // React's (and keyed children aren't separated by stray indentation text nodes).
  function stripJsxWhitespace(node) {
    for (const c of Array.from(node.childNodes)) {
      if (c.nodeType === 3) {
        if (/^\s*$/.test(c.nodeValue) && c.nodeValue.includes("\n")) node.removeChild(c);
      } else if (c.nodeType === 1 && c.tagName !== "PRE" && c.tagName !== "TEXTAREA") stripJsxWhitespace(c.tagName === "TEMPLATE" ? c.content : c);
    }
  }
  function morph(el, html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    stripJsxWhitespace(tpl.content);
    const wrapper = document.createElement(el.tagName);
    wrapper.appendChild(tpl.content);
    morphChildren(el, wrapper);
  }

  // ---- render loop -----------------------------------------------------------------------
  // createPortal(…, document.body) stand-in: a component returns K.portal(id, html) and the
  // markup is rendered after the screen, in first-mount order (React appends a portal's DOM
  // to body when it mounts, so a later-opened dialog sits above an earlier one at equal z).
  let portals = {};
  const portalSeq = {};
  let seq = 0;
  function portal(id, html) {
    if (!html) return "";
    if (!(id in portalSeq)) portalSeq[id] = ++seq;
    portals[id] = html;
    return "";
  }
  const afterRender = [];
  function renderNow() {
    scheduled = false;
    escapeStack = [];
    portals = {};
    const main = renderFn();
    for (const id of Object.keys(portalSeq)) if (!(id in portals)) delete portalSeq[id];
    const layer = Object.keys(portals)
      .sort((a, b) => portalSeq[a] - portalSeq[b])
      .map((id) => `<div data-key="portal:${esc(id)}">${portals[id]}</div>`)
      .join("");
    morph(root, `<div data-key="main">${main}</div><div data-key="portals">${layer}</div>`);
    document.body.style.overflow = root.querySelector("[data-lock-scroll]") ? "hidden" : "";
    for (const fn of afterRender.splice(0)) fn();
  }
  function update() {
    if (scheduled || !root) return;
    scheduled = true;
    queueMicrotask(renderNow);
  }
  function after(fn) {
    afterRender.push(fn);
  }
  function onEscape(fn) {
    escapeStack.push(fn);
  }

  // ---- events ----------------------------------------------------------------------------
  function dispatch(kind, ev) {
    let el = ev.target instanceof Element ? ev.target : ev.target.parentElement;
    while (el && el !== document) {
      const spec = el.getAttribute && el.getAttribute(`data-on-${kind}`);
      if (spec) {
        if (el.disabled) return;
        const bar = spec.indexOf("|");
        const name = bar < 0 ? spec : spec.slice(0, bar);
        const arg = bar < 0 ? undefined : spec.slice(bar + 1);
        if (!on[name]) throw new Error(`no handler: ${name}`);
        on[name](arg, ev, el);
        update();
        if (kind !== "mousedown") return;
      }
      el = el.parentElement;
    }
  }
  function app(el, fn) {
    root = el;
    renderFn = fn;
    for (const kind of ["click", "input", "change", "keydown", "mousedown", "pointerdown", "pointermove", "pointerup", "pointercancel", "dragover", "drop", "mouseover", "submit"]) document.addEventListener(kind, (ev) => dispatch(kind, ev));
    document.addEventListener("focusout", (ev) => dispatch("blur", ev));
    document.addEventListener("focusin", (ev) => dispatch("focus", ev));
    // <img> load errors don't bubble — catch them in the capture phase (data-on-error).
    for (const kind of ["error", "load", "loadedmetadata"]) {
      document.addEventListener(kind, (ev) => ev.target instanceof Element && ev.target.hasAttribute(`data-on-${kind}`) && dispatch(kind, ev), true);
    }
    document.addEventListener("mousedown", (ev) => {
      for (const node of Array.from(document.querySelectorAll("[data-on-outside]"))) {
        if (node.contains(ev.target)) continue;
        const spec = node.getAttribute("data-on-outside");
        const bar = spec.indexOf("|");
        on[bar < 0 ? spec : spec.slice(0, bar)](bar < 0 ? undefined : spec.slice(bar + 1), ev, node);
        update();
      }
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && escapeStack.length) {
        // Every open drawer/modal listens independently in the module (document-level
        // listeners), so all registered handlers fire, topmost first.
        for (const fn of escapeStack.slice().reverse()) fn();
        update();
      }
    });
    renderNow();
  }

  // ---- host stand-ins (not module UI) ----------------------------------------------------
  // The module renders no toast UI of its own (utils/notify.ts) — the host passes onNotify.
  // This stands in for the host's react-toastify container so the messages are visible.
  function notify(message, type) {
    let box = document.getElementById("host-toasts");
    if (!box) {
      box = document.createElement("div");
      box.id = "host-toasts";
      box.style.cssText = "position:fixed;top:16px;right:16px;z-index:20000;display:flex;flex-direction:column;gap:8px;max-width:360px";
      document.body.appendChild(box);
    }
    const t = document.createElement("div");
    t.setAttribute("data-testid", `host-toast-${type}`);
    t.style.cssText = `background:#fff;border-left:6px solid ${type === "error" ? "#e74c3c" : "#07bc0c"};box-shadow:0 1px 10px rgba(0,0,0,.1),0 2px 15px rgba(0,0,0,.05);border-radius:4px;padding:14px 16px;font:14px/1.4 system-ui,sans-serif;color:#333`;
    t.textContent = message;
    box.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  const debounce = (fn, ms = 400) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  const readText = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ""));
      r.onerror = () => reject(r.error ?? new Error("Failed to read file"));
      r.readAsText(file);
    });

  return { on, props, state, drop, esc, cx, attr, icon, app, portal, update, after, onEscape, notify, debounce, download, readText };
})();

// ==========================================================================================
// Shared components — each is a string-returning port of the same-named module component.
// ==========================================================================================

// components/DeleteModal.tsx
function DeleteModal(id, p) {
  const s = K.state(id, { submitting: false });
  K.props[id] = p;
  if (!p.open) {
    s.submitting = false;
    return "";
  }
  return `
  <div class="fixed inset-0 z-[10000] flex items-end bg-black bg-opacity-50 sm:items-center sm:justify-center" data-lock-scroll data-on-click="delm.backdrop|${id}">
    <div class="w-full px-6 py-4 overflow-hidden bg-white rounded-t-lg dark:bg-gray-800 sm:rounded-lg sm:m-4 sm:max-w-xl" data-on-click="noop" role="dialog" aria-modal="true" data-testid="confirm-delete-modal">
      <div class="text-center px-6 pt-8 pb-2">
        <span class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30">${K.icon("FiTrash2", "h-5 w-5 text-red-600")}</span>
        <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">Delete ${p.title ? `<span class="text-red-600">${K.esc(p.title)}</span>` : ""}?</h2>
        <p class="mt-1.5 text-sm text-gray-500 dark:text-gray-400">${p.isBulk ? "Are you sure you want to delete these items?" : "Are you sure you want to delete this item?"}</p>
      </div>
      <div class="flex flex-col items-center justify-end px-6 py-3 -mx-6 -mb-4 space-y-3 sm:space-y-0 sm:space-x-4 sm:flex-row bg-gray-50 dark:bg-gray-800">
        <div class="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end sm:gap-3">
          <button type="button" data-on-click="delm.close|${id}"${K.attr("disabled", s.submitting)} data-testid="confirm-delete-modal-cancel-btn" class="inline-flex h-10 w-full items-center justify-center rounded-md border border-gray-300 bg-white px-5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:pointer-events-none disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 sm:w-auto">Keep</button>
          <button type="button" data-on-click="delm.confirm|${id}"${K.attr("disabled", s.submitting)} data-testid="confirm-delete-modal-confirm-btn" class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-transparent bg-red-600 px-5 text-sm font-medium text-white transition-colors hover:bg-red-700 active:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:pointer-events-none disabled:opacity-70 sm:w-auto">${
            s.submitting ? `<span class="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true"></span>Processing` : "Delete"
          }</button>
        </div>
      </div>
    </div>
  </div>`;
}
K.on.noop = () => {};
// The panel carries data-on-click="noop", so this only fires for a click on the backdrop
// itself (the module's stopPropagation on the panel).
K.on["delm.backdrop"] = (id) => K.on["delm.close"](id);
K.on["delm.close"] = (id) => {
  if (K.state(id).submitting) return;
  K.props[id].onClose();
};
K.on["delm.confirm"] = async (id) => {
  const s = K.state(id);
  s.submitting = true;
  K.update();
  try {
    await K.props[id].onConfirm();
    K.props[id].onClose();
  } finally {
    s.submitting = false;
    K.update();
  }
};

// components/DiscardChangesModal.tsx
function DiscardChangesModal(id, p) {
  K.props[id] = p;
  if (!p.open) return "";
  return K.portal(id, `
  <div class="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true" data-testid="discard-changes-modal" data-lock-scroll data-on-mousedown="discard.backdrop|${id}">
    <div class="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl dark:bg-gray-800">
      <span class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/30">${K.icon("AlertTriangle", "h-5 w-5 text-amber-600")}</span>
      <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100">${K.esc(p.title || "Discard changes?")}</h1>
      <p class="mt-1.5 text-sm text-gray-500 dark:text-gray-400">${K.esc(p.description || "Your unsaved changes will be lost.")}</p>
      <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center sm:gap-3">
        <button type="button" data-on-click="discard.cancel|${id}" data-testid="discard-changes-modal-cancel-btn" class="inline-flex h-10 w-full items-center justify-center rounded-md border border-gray-300 bg-white px-5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 sm:w-auto">No, Wait</button>
        <button type="button" data-on-click="discard.confirm|${id}" data-testid="discard-changes-modal-confirm-btn" class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-transparent bg-amber-600 px-5 text-sm font-medium text-white transition-colors hover:bg-amber-700 active:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-300 sm:w-auto">Yes, Discard</button>
      </div>
    </div>
  </div>`);
}
K.on["discard.backdrop"] = (id, ev, el) => {
  if (ev.target === el) K.props[id].onCancelDiscard();
};
K.on["discard.cancel"] = (id) => K.props[id].onCancelDiscard();
K.on["discard.confirm"] = (id) => K.props[id].onConfirmDiscard();

// components/Pagination.tsx
function Pagination(id, p) {
  K.props[id] = p;
  const { currentPage, totalPages, resultsPerPage, totalResults, testIdPrefix } = p;
  const start = (currentPage - 1) * resultsPerPage + 1;
  const end = Math.min(currentPage * resultsPerPage, totalResults);
  const pages = [];
  if (totalPages <= 6) for (let i = 1; i <= totalPages; i++) pages.push(i);
  else {
    pages.push(1);
    if (currentPage > 3) pages.push("left-ellipsis");
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("right-ellipsis");
    pages.push(totalPages);
  }
  const tid = (s) => (testIdPrefix ? K.attr("data-testid", `${testIdPrefix}-${s}`) : "");
  return `
  <div class="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm">
    <span class="font-semibold tracking-wide uppercase text-xs">SHOWING ${totalResults === 0 ? 0 : start}–${end} OF ${totalResults}</span>
    <div class="mt-2 sm:mt-0"><nav aria-label="Table navigation"><ul class="inline-flex items-center space-x-2">
      <li><button type="button" data-on-click="page.go|${id}|${currentPage - 1}"${K.attr("disabled", currentPage === 1)}${tid("prev-btn")} class="px-2 py-1 text-sm rounded-md text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50">‹</button></li>
      ${pages
        .map((page) =>
          typeof page === "string"
            ? `<span class="px-2 text-gray-500 dark:text-gray-400 font-medium">...</span>`
            : `<li><button type="button" data-on-click="page.go|${id}|${page}"${tid(`page-${page}`)} class="align-bottom inline-flex items-center justify-center cursor-pointer leading-5 transition-colors duration-150 font-medium focus:outline-none px-3 py-1 rounded-md text-xs ${
                currentPage === page ? "text-white bg-green-500 hover:bg-green-600" : "text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }">${page}</button></li>`,
        )
        .join("")}
      <li><button type="button" data-on-click="page.go|${id}|${currentPage + 1}"${K.attr("disabled", currentPage === totalPages)}${tid("next-btn")} class="px-2 py-1 text-sm rounded-md text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50">›</button></li>
    </ul></nav></div>
  </div>`;
}
K.on["page.go"] = (arg) => {
  const [id, page] = arg.split("|");
  K.props[id].onPageChange(Number(page));
};

// components/BulkActionDropdown.tsx
function BulkActionDropdown(id, p) {
  const s = K.state(id, { open: false, top: 0, left: 0 });
  p = { extraActions: [], label: "Bulk Action", updateLabel: "Update", deleteLabel: "Delete", updateDescription: "Move the selected items into a new category", deleteDescription: "Permanently remove the selected items", mobile: false, mobileVariant: "menu", testIdPrefix: "bulk-action", ...p };
  K.props[id] = p;
  const disabled = p.selectedIds.length < 1 && p.fallbackIds.length < 1;
  const useSheet = p.mobile && p.mobileVariant === "sheet";
  const t = p.testIdPrefix;
  const trigger = p.mobile
    ? `<span class="relative">${K.icon(p.onUpdate ? "FiEdit" : "FiTrash2", `w-5 h-5 ${p.onUpdate ? "text-gray-600 dark:text-gray-300" : "text-red-400"}`)}${K.icon("FiChevronDown", "absolute -right-3 -bottom-1 w-3 h-3 text-gray-500 dark:text-gray-400")}</span><span class="max-w-[5rem] truncate text-[10px] font-medium text-gray-600 dark:text-gray-300">${K.esc(p.label)}</span>`
    : `${K.icon("FiEdit", "w-4 h-4 shrink-0")}<span class="leading-none">${K.esc(p.label)}</span>${K.icon("FiChevronDown", "w-3.5 h-3.5 shrink-0")}`;
  const sheetRow = (iconName, title, description, tone, action, testId) => `
    <button type="button" data-on-click="bulk.run|${id}|${action}" data-testid="${testId}" class="flex w-full items-center gap-3 border-b border-gray-100 px-5 py-4 text-left transition last:border-b-0 hover:bg-gray-50 active:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-700">
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone === "red" ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"}">${K.icon(iconName, "h-5 w-5")}</span>
      <span class="min-w-0 flex-1"><span class="block text-sm font-semibold ${tone === "red" ? "text-red-600 dark:text-red-400" : "text-gray-800 dark:text-gray-100"}">${K.esc(title)}</span>${description ? `<span class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">${K.esc(description)}</span>` : ""}</span>
    </button>`;
  let menu = "";
  if (s.open && useSheet) {
    menu = `
    <div class="fixed inset-0 z-[9998] flex items-end md:hidden">
      <button type="button" aria-label="Close actions" class="absolute inset-0 bg-black/45 backdrop-blur-[1px]" data-on-click="bulk.close|${id}"></button>
      <section role="dialog" aria-modal="true" aria-label="${K.esc(`${p.entityLabel || p.label} bulk actions`)}" class="relative z-10 w-full rounded-t-2xl bg-white pb-[max(env(safe-area-inset-bottom),16px)] shadow-2xl dark:bg-gray-800">
        <div class="mx-auto mt-2 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600"></div>
        <header class="flex h-14 items-center border-b border-gray-100 px-4 dark:border-gray-700"><span class="w-9"></span>
          <h2 class="flex-1 text-center text-base font-semibold text-gray-900 dark:text-gray-100">${K.esc(p.entityLabel ? `${p.entityLabel} Actions` : p.label)}</h2>
          <button type="button" aria-label="Close" data-on-click="bulk.close|${id}" data-testid="${t}-sheet-close-btn" class="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">${K.icon("X", "h-5 w-5")}</button>
        </header>
        <div class="py-1">
          ${p.onUpdate ? sheetRow("Edit", p.updateLabel, p.updateDescription, "emerald", "update", `${t}-sheet-update`) : ""}
          ${p.extraActions.map((a, i) => sheetRow(a.icon || "Edit", a.label, a.description, a.tone, `extra:${i}`, `${t}-sheet-extra-${i}`)).join("")}
          ${p.onDelete ? sheetRow("Trash2", p.deleteLabel, p.deleteDescription, "red", "delete", `${t}-sheet-delete`) : ""}
        </div>
      </section>
    </div>`;
  } else if (s.open) {
    const item = (action, iconHtml, label, testId, red) =>
      `<button type="button" data-on-click="bulk.run|${id}|${action}" data-testid="${testId}" class="w-full flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm ${red ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20" : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"} transition">${iconHtml}${K.esc(label)}</button>`;
    menu = `
    <div class="fixed inset-0 z-[9998]" data-on-click="bulk.close|${id}"></div>
    <div style="position:fixed;top:${s.top}px;left:${s.left}px;${p.mobile ? "transform:translate(-50%, -100%)" : ""}" class="z-[9999] w-max min-w-52 max-w-xs overflow-hidden rounded-md bg-white shadow-lg border border-gray-100 dark:bg-gray-800 dark:border-gray-700 focus:outline-none">
      ${p.onUpdate ? item("update", K.icon("FiEdit", "w-4 h-4"), p.updateLabel, `${t}-menu-update`) : ""}
      ${p.extraActions.map((a, i) => item(`extra:${i}`, K.icon(a.icon || "Edit", "w-4 h-4"), a.label, `${t}-menu-extra-${i}`)).join("")}
      ${p.onDelete ? item("delete", K.icon("Trash2", "w-4 h-4"), p.deleteLabel, `${t}-menu-delete`, true) : ""}
    </div>`;
  }
  return `
  <div class="relative ${p.mobile ? "" : "min-w-[136px]"}">
    <button type="button" title="${K.esc(p.label)}"${K.attr("disabled", disabled)} data-on-click="bulk.toggle|${id}" data-testid="${t}-trigger-btn" class="${
      p.mobile
        ? `w-full flex flex-col items-center justify-center gap-0.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition ${disabled ? "opacity-35" : ""} disabled:cursor-not-allowed`
        : `border text-sm font-medium inline-flex justify-center items-center gap-2 h-10 w-full min-w-[136px] bg-white hover:bg-gray-100 border-gray-200 dark:text-gray-300 cursor-pointer px-3 py-2 rounded-md whitespace-nowrap ${disabled ? "opacity-50" : ""} disabled:cursor-not-allowed disabled:hover:bg-white`
    }">${trigger}</button>
  </div>${K.portal(`${id}:menu`, menu)}`;
}
K.on["bulk.toggle"] = (id, ev, el) => {
  const s = K.state(id);
  const p = K.props[id];
  if (!(p.mobile && p.mobileVariant === "sheet")) {
    const rect = el.getBoundingClientRect();
    s.top = p.mobile ? rect.top - 16 : rect.bottom + 4;
    s.left = p.mobile ? rect.left + rect.width / 2 : Math.min(rect.left, window.innerWidth - 208 - 8);
  }
  s.open = !s.open;
};
K.on["bulk.close"] = (id) => {
  K.state(id).open = false;
};
K.on["bulk.run"] = (arg) => {
  const [id, action] = arg.split("|");
  const p = K.props[id];
  K.state(id).open = false;
  let handler;
  let skipAutoSelect = false;
  if (action === "update") handler = p.onUpdate;
  else if (action === "delete") handler = p.onDelete;
  else {
    const a = p.extraActions[Number(action.split(":")[1])];
    handler = a.onClick;
    skipAutoSelect = Boolean(a.skipAutoSelect);
  }
  if (!handler) return;
  if (!skipAutoSelect && p.selectedIds.length < 1 && p.fallbackIds.length > 0 && p.onAutoSelect) {
    p.onAutoSelect();
    return;
  }
  const ids = p.selectedIds.length > 0 ? p.selectedIds : p.fallbackIds;
  if (ids.length === 0) return;
  handler(ids);
};

// components/SlideDrawer.tsx — `entered` flips on the frame after first render (slide-in).
function SlideDrawer(id, p) {
  const s = K.state(id, { entered: false });
  p = { zIndex: 9999, closeOnBackdrop: true, dimmed: true, width: "default", ...p };
  K.props[id] = p;
  if (!p.open) {
    s.entered = false;
    return "";
  }
  if (!s.entered) K.after(() => requestAnimationFrame(() => ((s.entered = true), K.update())));
  if (p.closeOnBackdrop) K.onEscape(() => p.onClose && p.onClose());
  const w0 = p.width === "narrow" ? "sm:w-[42%] lg:w-[42%]" : p.width === "medium" ? "sm:w-[70%] lg:w-[70%]" : "sm:w-[82%] lg:w-[82%]";
  const tid = p.testId;
  return K.portal(id, `
  <div class="fixed inset-0 transition-opacity duration-300 ${p.dimmed ? "bg-black/50" : "bg-transparent"} ${s.entered ? "opacity-100" : "opacity-0"}" style="z-index:${p.zIndex}" role="dialog" aria-modal="true" data-lock-scroll data-on-mousedown="drawer.backdrop|${id}">
    <div data-drawer-panel${K.attr("data-testid", tid)} class="fixed inset-y-0 right-0 flex h-full w-full flex-col bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.15)] transition-transform duration-300 ease-out dark:bg-gray-800 ${w0} ${s.entered ? "translate-x-0" : "translate-x-full"}">
      <button data-on-click="drawer.close|${id}" aria-label="Close drawer" type="button" class="absolute right-[1.5rem] top-[1.5rem] z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-red-500 shadow-md transition-colors duration-150 hover:bg-red-100 hover:text-gray-700 dark:bg-gray-700 dark:text-red-400">${K.icon("FiX", "mx-auto")}</button>
      <div class="w-full shrink-0 border-b border-gray-100 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
        <div class="mr-16 flex items-center gap-3">${p.icon || ""}<div>
          <h2${K.attr("data-testid", tid && `${tid}-title`)} class="text-xl font-medium text-gray-800 dark:text-gray-100">${K.esc(p.title)}</h2>
          ${p.description ? `<div${K.attr("data-testid", tid && `${tid}-description`)} class="mb-0 text-sm text-gray-500 dark:text-gray-400">${p.description}</div>` : ""}
        </div></div>
      </div>
      ${p.tabs || ""}
      <div class="flex-1 overflow-y-auto px-6 pt-8 pb-6">${p.children || ""}</div>
      ${p.footer ? `<div class="flex w-full shrink-0 gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 lg:gap-6 lg:py-8">${p.footer}</div>` : ""}
    </div>
  </div>`);
}
K.on["drawer.backdrop"] = (id, ev) => {
  const p = K.props[id];
  if (!p.closeOnBackdrop) return;
  if (ev.target.closest("[data-drawer-panel]")) return;
  p.onClose && p.onClose();
};
K.on["drawer.close"] = (id) => K.props[id].onClose && K.props[id].onClose();

// components/FormModal.tsx
function FormModal(id, p) {
  p = { size: "md", hideCloseButton: false, zIndex: 9999, closeOnBackdrop: true, ...p };
  K.props[id] = p;
  if (!p.open) return "";
  K.onEscape(() => p.onClose && p.onClose());
  const size = { sm: "max-w-lg", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl", full: "max-w-none w-[98%]" }[p.size];
  return K.portal(id, `
  <div class="fixed inset-0 bg-black/50" style="z-index:${p.zIndex}" role="dialog" aria-modal="true" data-lock-scroll data-on-mousedown="fmodal.backdrop|${id}">
    <div class="h-full w-full overflow-y-auto px-4 py-4"><div class="min-h-full flex items-start justify-center sm:items-center">
      <div data-modal-panel${K.attr("data-testid", p.testId)} class="relative w-full ${size} rounded-xl bg-white dark:bg-gray-800 shadow-2xl overflow-visible">
        ${
          p.title || !p.hideCloseButton
            ? `<div class="flex items-center justify-between gap-4 px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700">
                ${p.title ? `<div><h2${K.attr("data-testid", p.testId && `${p.testId}-title`)} class="text-lg font-semibold text-gray-800 dark:text-gray-100">${K.esc(p.title)}</h2>${p.description ? `<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">${K.esc(p.description)}</p>` : ""}</div>` : "<div></div>"}
                ${p.hideCloseButton ? "" : `<button data-on-click="fmodal.close|${id}" class="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition" aria-label="Close modal" type="button">${K.icon("X", "w-5 h-5")}</button>`}
              </div>`
            : ""
        }
        <div class="p-6 overflow-visible">${p.children || ""}</div>
      </div>
    </div></div>
  </div>`);
}
K.on["fmodal.backdrop"] = (id, ev) => {
  const p = K.props[id];
  if (!p.closeOnBackdrop || ev.target.closest("[data-modal-panel]")) return;
  p.onClose && p.onClose();
};
K.on["fmodal.close"] = (id) => K.props[id].onClose && K.props[id].onClose();

// components/ProductSelect.tsx
function ProductSelect(id, p) {
  const s = K.state(id, { isOpen: false, isAdding: false, newValue: "" });
  p = { addNewLabel: "Add new", addNewPlaceholder: "Enter name", disabled: false, isAddNewEnabled: true, ...p };
  K.props[id] = p;
  if (p.disabled) s.isOpen = false;
  const valid = (v) => /^[a-zA-Z0-9 ]+$/.test(v);
  const addDisabled = !s.newValue.trim() || !valid(s.newValue);
  const tid = p.testId;
  const tc = PM.text.toTitleCase;
  return `
  <div class="relative"${p.disabled ? "" : ` data-on-outside="psel.outside|${id}"`}>
    <button type="button" data-on-click="psel.toggle|${id}"${K.attr("disabled", p.disabled)}${K.attr("data-testid", tid)} class="w-full px-3 py-2 text-left text-sm bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between ${p.disabled ? "bg-gray-100 cursor-not-allowed opacity-70" : ""}">
      <span class="text-gray-900">${K.esc(p.value ? tc(p.value) : p.placeholder)}</span>${K.icon("ChevronDown", `w-5 h-5 text-gray-400 ${p.disabled ? "opacity-50" : ""}`)}
    </button>
    ${
      s.isOpen && !p.disabled
        ? `<div${K.attr("data-testid", tid && `${tid}-menu`)} class="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
        ${p.options
          .map(
            (o, i) =>
              `<div data-on-click="psel.pick|${id}|${i}"${K.attr("data-testid", tid && `${tid}-option-${o}`)} class="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 flex items-center justify-between text-gray-900"><span>${K.esc(tc(o))}</span>${p.value === o ? K.icon("Check", "w-5 h-5 text-green-600") : ""}</div>`,
          )
          .join("")}
        ${
          p.isAddNewEnabled
            ? `<div class="border-t border-gray-200">${
                !s.isAdding
                  ? `<div data-on-click="psel.adding|${id}"${K.attr("data-testid", tid && `${tid}-add-new-toggle`)} class="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 flex items-center gap-2 text-blue-600">${K.icon("Plus", "w-4 h-4")}<span>${K.esc(p.addNewLabel)}</span></div>`
                  : `<div class="px-3 py-2 flex items-center gap-2"><input type="text" value="${K.esc(s.newValue)}" data-on-input="psel.newValue|${id}"${K.attr("data-testid", tid && `${tid}-add-new-input`)} class="w-[75%] px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1" placeholder="${K.esc(p.addNewPlaceholder)}" data-autofocus>
                     <button type="button" data-on-click="psel.addConfirm|${id}"${K.attr("disabled", addDisabled)}${K.attr("data-testid", tid && `${tid}-add-new-confirm-btn`)} class="shrink-0 ${!addDisabled ? "text-green-600" : "text-gray-300 cursor-not-allowed"}">${ICONS.Check("w-5 h-5").replace('stroke-width="2"', 'stroke-width="2.5"')}</button></div>`
              }</div>`
            : ""
        }
      </div>`
        : ""
    }
  </div>`;
}
K.on["psel.toggle"] = (id) => {
  const s = K.state(id);
  if (K.props[id].disabled) return;
  s.isOpen = !s.isOpen;
  s.isAdding = false;
  s.newValue = "";
};
K.on["psel.outside"] = (id) => Object.assign(K.state(id), { isOpen: false, isAdding: false, newValue: "" });
K.on["psel.pick"] = (arg) => {
  const [id, i] = arg.split("|");
  const p = K.props[id];
  p.onChange(p.options[Number(i)]);
  K.state(id).isOpen = false;
};
K.on["psel.adding"] = (id) => {
  K.state(id).isAdding = true;
  K.after(() => document.querySelector("[data-autofocus]")?.focus());
};
K.on["psel.newValue"] = (id, ev) => (K.state(id).newValue = ev.target.value);
K.on["psel.addConfirm"] = (id) => {
  const s = K.state(id);
  const v = s.newValue.trim();
  if (!v || !/^[a-zA-Z0-9 ]+$/.test(v)) return;
  K.props[id].onAdd && K.props[id].onAdd(v);
  Object.assign(s, { newValue: "", isAdding: false, isOpen: false });
};

// ---- host config inputs the module reads from browser storage ---------------------------
// utils/unitLevel.ts reads localStorage.appProp; utils/hostFeatures.ts reads
// localStorage.globalSetting. In the sandbox both are unset — v5 defaults to that.
const HostConfig = {
  appProp() {
    try {
      return JSON.parse(localStorage.getItem("appProp") || "null");
    } catch {
      return null;
    }
  },
};


// components/DropdownMenu.tsx — anchored under `anchor` (a DOMRect captured at open time).
function DropdownMenu(id, p) {
  K.props[id] = p;
  if (!p.anchor) return "";
  K.onEscape(() => p.onClose());
  const left = Math.max(8, Math.min(p.anchor.left, window.innerWidth - 220 - 8));
  return K.portal(id, `<div data-on-outside="ddm.outside|${id}"${K.attr("data-testid", p.testId)} style="position:fixed;top:${p.anchor.bottom + 6}px;left:${left}px;z-index:10000;width:220px" class="overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">${p.children}</div>`);
}
K.on["ddm.outside"] = (id, ev) => {
  const p = K.props[id];
  // DropdownMenu ignores mousedown on its own anchor (the toggle button handles that click).
  if (p.anchorSelector && ev.target.closest(p.anchorSelector)) return;
  p.onClose();
};
function DropdownMenuItem({ action, icon = "", danger, disabled, testId, label }) {
  return `<button type="button" data-on-click="${action}"${K.attr("disabled", disabled)}${K.attr("data-testid", testId)} class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    danger ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20" : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
  }">${icon}${K.esc(label)}</button>`;
}

// components/MultiTagInput.tsx
function MultiTagInput(id, p) {
  const s = K.state(id, { input: "" });
  p = { maxTags: 10, placeholder: "Add a tag", buttonLabel: "Add", ...p };
  K.props[id] = p;
  return `<div class="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-2 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/15 dark:border-gray-700 dark:bg-gray-800">
    <div class="mb-2 flex min-h-7 flex-wrap gap-1.5" data-testid="multi-tag-input-chips">
      ${p.value.map((tag) => `<span data-key="${K.esc(tag)}" data-testid="multi-tag-input-chip-${K.esc(tag)}" class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/35 dark:text-green-300">${K.esc(tag)}<button type="button" data-on-click="mti.remove|${id}|${K.esc(tag)}" aria-label="Remove ${K.esc(tag)}">${K.icon("X", "h-3 w-3")}</button></span>`).join("")}
      ${!p.value.length ? `<span class="px-1 py-1 text-xs text-gray-400">Add one or more tags</span>` : ""}
    </div>
    <div class="flex gap-2">
      <input value="${K.esc(s.input)}" data-on-input="mti.input|${id}" data-on-keydown="mti.key|${id}" placeholder="${K.esc(p.placeholder)}" data-testid="multi-tag-input-field" class="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-500/15 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
      <button type="button" data-on-click="mti.add|${id}"${K.attr("disabled", !s.input.trim() || p.value.length >= p.maxTags)} data-testid="multi-tag-input-add-btn" class="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">${K.icon("Plus", "h-3.5 w-3.5")} ${K.esc(p.buttonLabel)}</button>
    </div>
    <p class="mt-1 px-1 text-[10px] text-gray-400">${p.value.length}/${p.maxTags} tags · Enter or comma to add</p>
  </div>`;
}
K.on["mti.input"] = (id, ev) => (K.state(id).input = ev.target.value);
K.on["mti.add"] = (id) => {
  const s = K.state(id);
  const p = K.props[id];
  const tag = s.input.trim();
  if (!tag || p.value.length >= p.maxTags) return;
  if (!p.value.some((t) => t.toLowerCase() === tag.toLowerCase())) p.onChange([...p.value, tag]);
  s.input = "";
};
K.on["mti.key"] = (id, ev) => {
  if (ev.key === "Enter" || ev.key === ",") {
    ev.preventDefault();
    K.on["mti.add"](id);
  }
};
K.on["mti.remove"] = (arg) => {
  const bar = arg.indexOf("|");
  const id = arg.slice(0, bar);
  const tag = arg.slice(bar + 1);
  K.props[id].onChange(K.props[id].value.filter((t) => t !== tag));
};

// components/ProductImage.tsx — probes the candidate URL once (skeleton until settled), then
// renders it or the product fallback.
const ProductImageProbe = {};
function ProductImage({ productId, directUrl, alt = "", className, testId }) {
  const candidate = directUrl || PM.productImage.getProductImageUrl(productId);
  if (candidate && !(candidate in ProductImageProbe)) {
    ProductImageProbe[candidate] = undefined;
    const img = new Image();
    img.onload = () => ((ProductImageProbe[candidate] = true), K.update());
    img.onerror = () => ((ProductImageProbe[candidate] = false), K.update());
    img.src = candidate;
  }
  const checked = !candidate || ProductImageProbe[candidate] !== undefined;
  if (!checked) return `<div data-testid="product-image-skeleton" aria-hidden="true" class="animate-pulse bg-gray-200 dark:bg-gray-700 ${className}"></div>`;
  const src = ProductImageProbe[candidate] && candidate ? candidate : PM.PRODUCT_IMAGE_FALLBACK_URL;
  return `<img src="${K.esc(src)}" alt="${K.esc(alt)}" loading="lazy" decoding="async"${K.attr("data-testid", testId)} class="${className}" data-on-error="pimg.error">`;
}
K.on["pimg.error"] = (_, ev) => {
  if (ev.target.src !== PM.PRODUCT_IMAGE_FALLBACK_URL) ev.target.src = PM.PRODUCT_IMAGE_FALLBACK_URL;
};

// ---- react-select stand-in (CategorySelect / AddCategoryModal use react-select v5) ----------
// Same DOM shape and inline styles as react-select's own emotion output (captured from the
// sandbox): control, value container, placeholder/single value, input, indicators, portaled
// menu. Behaviour: mousedown opens, typing filters on "label value", arrows/Enter/Escape,
// blur closes, clear indicator when isClearable.
const RS_CHEVRON = '<svg height="20" width="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false" style="display:inline-block;fill:currentColor;line-height:1;stroke:currentColor;stroke-width:0"><path d="M4.516 7.548c0.436-0.446 1.043-0.481 1.576 0l3.908 3.747 3.908-3.747c0.533-0.481 1.141-0.446 1.574 0 0.436 0.445 0.408 1.197 0 1.615-0.406 0.418-4.695 4.502-4.695 4.502-0.217 0.223-0.502 0.335-0.787 0.335s-0.57-0.112-0.789-0.335c0 0-4.287-4.084-4.695-4.502s-0.436-1.17 0-1.615z"></path></svg>';
const RS_CROSS = '<svg height="20" width="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false" style="display:inline-block;fill:currentColor;line-height:1;stroke:currentColor;stroke-width:0"><path d="M14.348 14.849c-0.469 0.469-1.229 0.469-1.697 0l-2.651-3.030-2.651 3.029c-0.469 0.469-1.229 0.469-1.697 0-0.469-0.469-0.469-1.229 0-1.697l2.758-3.15-2.759-3.152c-0.469-0.469-0.469-1.228 0-1.697s1.228-0.469 1.697 0l2.652 3.031 2.651-3.031c0.469-0.469 1.228-0.469 1.697 0s0.469 1.229 0 1.697l-2.758 3.152 2.758 3.15c0.469 0.469 0.469 1.229 0 1.698z"></path></svg>';
function RSelect(id, p) {
  p = { placeholder: "Select...", isClearable: false, showSeparator: true, maxMenuHeight: 300, menuZIndex: 1, portal: true, menuPlacement: "bottom", singleValueStyle: () => "color:#111827", ...p };
  K.props[id] = p;
  const s = K.state(id, { open: false, input: "", focusedIndex: 0, focused: false, rect: null });
  const needle = s.input.trim().toLowerCase();
  const filtered = p.options.filter((o) => !needle || `${o.label} ${o.value}`.toLowerCase().includes(needle));
  s.filtered = filtered;
  const selected = p.options.find((o) => o.value === p.value) ?? p.selectedOption ?? null;
  const indicator = (inner, extra = "") => `<div aria-hidden="true" style="display:flex;padding:8px;transition:color 150ms;color:${s.focused ? "hsl(0, 0%, 40%)" : "hsl(0, 0%, 80%)"};box-sizing:border-box"${extra}>${inner}</div>`;
  const control = `<div data-rs-control="${id}" data-on-mousedown="rs.down|${id}" style="align-items:center;cursor:default;display:flex;flex-wrap:wrap;justify-content:space-between;min-height:40px;outline:0!important;position:relative;transition:all 100ms;background-color:#fff;border-color:${s.focused ? "#2684FF" : "hsl(0, 0%, 80%)"};border-radius:0.375rem;border-style:solid;border-width:1px;box-shadow:none;box-sizing:border-box;padding-left:0.75rem;font-size:0.875rem">
    <div style="align-items:center;display:grid;flex:1;flex-wrap:wrap;-webkit-overflow-scrolling:touch;position:relative;overflow:hidden;padding:0;box-sizing:border-box">
      ${!s.input ? (selected ? `<div data-key="rs-value" style="grid-area:1/1/2/3;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:2px;margin-right:2px;box-sizing:border-box;font-size:0.875rem;${p.singleValueStyle(selected)}">${K.esc(selected.label)}</div>` : `<div data-key="rs-value" id="react-select-${s.rsId ?? ""}-placeholder" style="grid-area:1/1/2/3;margin-left:2px;margin-right:2px;box-sizing:border-box;color:#9ca3af;font-size:0.875rem">${K.esc(p.placeholder)}</div>`) : ""}
      <div data-key="rs-input" style="visibility:visible;flex:1 1 auto;display:inline-grid;grid-area:1/1/2/3;grid-template-columns:0 min-content;margin:0;padding:0;color:hsl(0, 0%, 20%);box-sizing:border-box" data-value="${K.esc(s.input)}"><input${K.attr("id", p.inputId)} autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="${s.open}" aria-haspopup="true" role="combobox" value="${K.esc(s.input)}" data-on-input="rs.input|${id}" data-on-keydown="rs.key|${id}" data-on-blur="rs.blur|${id}" data-on-focus="rs.focus|${id}" data-rs-input="${id}" style="color:inherit;background:0;opacity:1;width:100%;grid-area:1/2;font:inherit;min-width:2px;border:0;margin:0;outline:0;padding:0"></div>
    </div>
    <div style="align-items:center;align-self:stretch;display:flex;flex-shrink:0;box-sizing:border-box">
      ${p.isClearable && selected ? indicator(RS_CROSS, ` data-on-mousedown="rs.clear|${id}"`) : ""}
      ${p.showSeparator ? `<span style="align-self:stretch;width:1px;background-color:hsl(0, 0%, 80%);margin-bottom:8px;margin-top:8px;box-sizing:border-box"></span>` : ""}
      ${indicator(RS_CHEVRON)}
    </div>
  </div>`;
  let menu = "";
  if (s.open) {
    const opts = filtered.length === 0
      ? `<div style="color:hsl(0, 0%, 60%);padding:8px 12px;text-align:center;box-sizing:border-box">No options</div>`
      : filtered.map((o, i) => `<div data-key="${K.esc(o.value)}" data-on-mousedown="rs.pickDown|${id}" data-on-click="rs.pick|${id}|${i}" data-on-mouseover="rs.hover|${id}|${i}" data-rs-option="${i}">${p.renderOption ? p.renderOption(o, i === s.focusedIndex, selected?.value === o.value) : `<div style="cursor:default;display:block;font-size:0.875rem;width:100%;user-select:none;padding:8px 12px;box-sizing:border-box;background-color:${selected?.value === o.value ? "#2684FF" : i === s.focusedIndex ? "#DEEBFF" : "transparent"};color:${selected?.value === o.value ? "hsl(0, 0%, 100%)" : "inherit"};${p.optionStyle ? p.optionStyle(o) : ""}">${K.esc(o.label)}</div>`}</div>`).join("");
    const top = p.menuPlacement === "top";
    const inner = `<div style="position:absolute;${top ? "bottom:100%" : "top:100%"};left:0;width:100%;z-index:${p.menuZIndex};background-color:hsl(0, 0%, 100%);border-radius:4px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);margin-bottom:8px;margin-top:8px;box-sizing:border-box;font-size:0.875rem${p.menuMaxHeight ? `;max-height:${p.menuMaxHeight}px` : ""}" data-on-mousedown="rs.menuDown|${id}"><div style="max-height:${p.maxMenuHeight}px;overflow-y:auto;padding-bottom:4px;padding-top:4px;position:relative;-webkit-overflow-scrolling:touch;box-sizing:border-box">${opts}</div></div>`;
    if (p.portal && s.rect) menu = K.portal(`${id}:menu`, `<div style="position:fixed;left:${s.rect.left}px;top:${top ? s.rect.top : s.rect.bottom}px;width:${s.rect.width}px;z-index:${p.menuZIndex}"><div style="position:relative">${inner.replace(top ? "bottom:100%" : "top:100%", top ? "bottom:0" : "top:0")}</div></div>`);
    else menu = inner;
  }
  // react-select's LiveRegion: an initial-focus region and a role="log" region, both visually
  // hidden, carrying the same four spans (messages captured from the sandbox's react-select).
  const a11y = "z-index:9999;border:0;clip:rect(1px, 1px, 1px, 1px);height:1px;width:1px;position:absolute;overflow:hidden;padding:0;white-space:nowrap";
  if (s.rsId == null) s.rsId = ++RSelect.seq;
  const results = s.open ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""} available${s.input ? ` for search term ${s.input}` : ""}.` : "";
  const guidance = s.open ? "Use Up and Down to choose options, press Enter to select the currently focused option, press Escape to exit the menu, press Tab to select the option and exit the menu." : s.initialFocus ? "Select is focused ,type to refine list, press Down to open the menu, " : "";
  const spans = `<span id="aria-selection">${K.esc(s.ariaSelection || "")}</span><span id="aria-focused"></span><span id="aria-results">${K.esc(results)}</span><span id="aria-guidance">${K.esc(guidance)}</span>`;
  const live = `<span id="react-select-${s.rsId}-live-region" style="${a11y}">${s.focused && s.initialFocus ? spans : ""}</span><span aria-live="polite" aria-atomic="false" aria-relevant="additions text" role="log" style="${a11y}">${s.focused && !s.initialFocus ? spans : ""}</span>`;
  return `<div style="position:relative;box-sizing:border-box">${live}${control}${menu}</div>`;
}
RSelect.seq = 0;
(() => {
  const open = (id) => {
    const s = K.state(id);
    const p = K.props[id];
    if (s.open) return;
    const el = document.querySelector(`[data-rs-control="${id}"]`);
    s.rect = el ? el.getBoundingClientRect() : null;
    s.open = true;
    if (s.initialFocus) {
      s.initialFocus = false;
      s.ariaSelection = "";
    }
    const idx = p.options.findIndex((o) => o.value === p.value);
    s.focusedIndex = Math.max(0, idx);
    p.onMenuOpen && p.onMenuOpen(el);
  };
  const close = (id) => {
    const s = K.state(id);
    if (!s.open) return;
    s.open = false;
    s.input = "";
    K.props[id].onMenuClose && K.props[id].onMenuClose();
  };
  const choose = (id, opt) => {
    close(id);
    const s = K.state(id);
    s.initialFocus = false;
    s.ariaSelection = `option ${opt.label}, selected.`;
    K.props[id].onChange(opt);
  };
  const focus = (id) => {
    const s = K.state(id);
    if (s.focused) return;
    s.focused = true;
    s.initialFocus = true;
    const p = K.props[id];
    const cur = p.options.find((o) => o.value === p.value);
    s.ariaSelection = `option ${cur ? cur.label : ""}, selected.`;
  };
  K.on["rs.focus"] = (id) => focus(id);
  K.on["rs.down"] = (id, ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const s = K.state(id);
    focus(id);
    document.querySelector(`[data-rs-input="${id}"]`)?.focus();
    s.open ? close(id) : open(id);
  };
  K.on["rs.clear"] = (id, ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const s = K.state(id);
    s.initialFocus = false;
    s.ariaSelection = "All selected options are cleared.";
    K.props[id].onChange(null);
  };
  K.on["rs.input"] = (id, ev) => {
    const s = K.state(id);
    s.input = ev.target.value;
    s.focusedIndex = 0;
    if (!s.open) open(id);
  };
  K.on["rs.key"] = (id, ev) => {
    const s = K.state(id);
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (!s.open) return open(id);
      const n = s.filtered.length;
      if (n) s.focusedIndex = (s.focusedIndex + (ev.key === "ArrowDown" ? 1 : n - 1)) % n;
    } else if (ev.key === "Enter" && s.open) {
      ev.preventDefault();
      const opt = s.filtered[s.focusedIndex];
      if (opt) choose(id, opt);
    } else if (ev.key === "Escape" && s.open) {
      ev.stopPropagation();
      close(id);
    }
  };
  K.on["rs.blur"] = (id) => {
    const s = K.state(id);
    if (s.keepFocus) return;
    s.focused = false;
    s.initialFocus = false;
    s.ariaSelection = "";
    close(id);
  };
  K.on["rs.menuDown"] = (id, ev) => {
    ev.preventDefault();
  };
  K.on["rs.pickDown"] = (id, ev) => ev.preventDefault();
  K.on["rs.hover"] = (arg) => {
    const [id, i] = arg.split("|");
    K.state(id).focusedIndex = Number(i);
  };
  K.on["rs.pick"] = (arg) => {
    const [id, i] = arg.split("|");
    const opt = K.state(id).filtered[Number(i)];
    if (opt) choose(id, opt);
  };
})();

// Discovery v6 (Addendum 007 round 2): spreadsheet-style keyboard movement in editable tables.
// Inside any [data-grid-nav] tbody: ↑/↓ (or Enter / Shift+Enter) move to the same field in the
// previous/next row; Tab still moves across. Alt+↓ still opens a select's list. Entering a text
// or number field selects its value so typing replaces it.
const GRID_FIELDS = "input:not([disabled]):not([type=checkbox]):not([type=hidden]), select:not([disabled]), button:not([disabled])";
document.addEventListener("keydown", (ev) => {
  const k = ev.key;
  if (!(k === "ArrowUp" || k === "ArrowDown" || k === "Enter") || ev.altKey || ev.ctrlKey || ev.metaKey) return;
  const el = ev.target;
  const grid = el instanceof Element && el.closest("[data-grid-nav]");
  if (!grid || !el.matches(GRID_FIELDS) || (k === "Enter" && el.tagName === "BUTTON")) return;
  const td = el.closest("td");
  const tr = el.closest("tr");
  if (!td || !tr) return;
  const col = Array.from(tr.children).indexOf(td);
  const slot = Array.from(td.querySelectorAll(GRID_FIELDS)).indexOf(el);
  const rows = Array.from(grid.querySelectorAll("tr")).filter((r) => r.querySelector(GRID_FIELDS));
  const next = rows[rows.indexOf(tr) + (k === "ArrowUp" || (k === "Enter" && ev.shiftKey) ? -1 : 1)];
  const cell = next?.children[col];
  const fields = cell ? Array.from(cell.querySelectorAll(GRID_FIELDS)) : [];
  const target = fields[Math.min(slot, fields.length - 1)];
  ev.preventDefault(); // also on the first/last row, so ↑/↓ never step a number
  if (!target) return;
  target.focus();
  if (target instanceof HTMLInputElement) target.select();
}, true); // capture: runs before a number input's own ↑/↓ step
document.addEventListener("focusin", (ev) => {
  const el = ev.target;
  if (!(el instanceof HTMLInputElement) || !el.closest("[data-grid-nav]") || !["text", "number", "search"].includes(el.type)) return;
  const before = el.value;
  // After a mouse click places the caret — but never once the user has started typing.
  setTimeout(() => document.activeElement === el && el.value === before && el.select(), 0);
});
