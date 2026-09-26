// Port of components/CameraCaptureOverlay.tsx, components/ImageCropper.tsx and
// components/ImageGalleryBrowseView.tsx (Addendum 006). Uses the real camera
// (navigator.mediaDevices.getUserMedia), exactly as the module does; crop maths come from the
// module's own utils/imageCrop.ts via pm-core.js.

const MAX_PHOTOS = 4;
const IMAGE_FORMATS = [
  { label: "Square (1:1)", value: "square", aspect: 1, cssAspect: "aspect-square" },
  { label: "Landscape (4:3)", value: "landscape", aspect: 4 / 3, cssAspect: "aspect-[4/3]" },
  { label: "Portrait (3:4)", value: "portrait", aspect: 3 / 4, cssAspect: "aspect-[3/4]" },
];
const IMAGE_RESOLUTIONS = [
  { label: "Original", value: "original", maxSide: null, description: "Camera quality" },
  { label: "Full HD", value: "1920", maxSide: 1920, description: "1920 px" },
  { label: "High", value: "1280", maxSide: 1280, description: "1280 px" },
  { label: "Standard+", value: "1028", maxSide: 1028, description: "1028 px" },
  { label: "HD", value: "720", maxSide: 720, description: "720 px" },
  { label: "Medium", value: "480", maxSide: 480, description: "480 px" },
  { label: "Thumbnail", value: "240", maxSide: 240, description: "240 px" },
];
const resolutionDimensions = (r, aspect) => (!r.maxSide ? "Uses the camera's original resolution" : aspect >= 1 ? `${r.maxSide} × ${Math.round(r.maxSide / aspect)} px` : `${Math.round(r.maxSide * aspect)} × ${r.maxSide} px`);
const normalizeTags = (tags) => Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
function dataUrlToFile(dataUrl, filename) {
  const [header, base64] = dataUrl.split(",");
  const m = header.match(/:(.*?);/);
  const bytes = atob(base64);
  const buf = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
  return new File([buf], filename, { type: m ? m[1] : "image/jpeg" });
}

// ---- CameraCaptureOverlay ----------------------------------------------------------------
function CameraCaptureOverlay(id, p) {
  K.props[id] = p;
  if (!p.open) {
    const old = K.state(id, {});
    old.stream?.getTracks().forEach((t) => t.stop());
    K.drop(id);
    K.drop(`${id}:crop`);
    K.drop(`${id}:browse`);
    return "";
  }
  const s = K.state(id, () => ({
    view: "idle", capturedImage: null, cropSource: null, originalImage: null, errorMsg: "", facingMode: "environment", videoReady: false,
    imageFormat: IMAGE_FORMATS[0], imageResolution: IMAGE_RESOLUTIONS[3], photos: [], productCount: 1, saving: false, tags: [], tagInput: "", stream: null, started: false,
  }));
  if (!s.started) {
    s.started = true;
    queueMicrotask(() => cam.start(id));
  }
  const isFormatLocked = s.photos.length > 0 || !!s.capturedImage || !!s.cropSource;
  const canTakeAnother = s.photos.length < MAX_PHOTOS - 1;
  const isGallery = s.view === "gallery";
  if (s.view === "streaming") K.after(() => {
    const v = document.querySelector(`[data-cam-video="${id}"]`);
    if (v && v.srcObject !== s.stream) v.srcObject = s.stream;
  });
  const pending = s.view === "captured" || s.view === "cropping";
  const dots = Array.from({ length: MAX_PHOTOS }, (_, i) => {
    const saved = i < s.photos.length;
    const pend = i === s.photos.length && pending;
    return `<div class="h-3 w-3 rounded-full border-2 transition-all ${saved ? "border-green-500 bg-green-500" : pend ? "animate-pulse border-yellow-400 bg-yellow-400" : "border-gray-300 bg-transparent dark:border-gray-600"}"></div>`;
  }).join("");
  const btnGhost = "flex items-center gap-1.5 rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700";
  const btnGreenOutline = "flex items-center gap-1.5 rounded-xl border border-green-400 px-4 py-2.5 text-sm font-medium text-green-600 transition-colors hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20";
  const select = (label, minW, action, testId, options, current) => `<label class="flex ${minW} flex-col gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">${label}
    <select data-on-change="${action}|${id}"${K.attr("disabled", isFormatLocked)} data-testid="${testId}" class="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200">${options.map((o) => `<option value="${o.value}"${K.attr("selected", o.value === current)}>${K.esc(o.text)}</option>`).join("")}</select></label>`;

  let body = "";
  if (isGallery) body = ImageGalleryBrowseView(`${id}:browse`, { apiClient: p.apiClient, locationId: p.locationId });
  if (s.view === "idle") body += `<div data-testid="image-gallery-camera-starting" class="flex flex-col items-center justify-center gap-4 py-14"><div class="h-10 w-10 animate-spin rounded-full border-2 border-green-500 border-t-transparent"></div><p class="text-sm text-gray-400 dark:text-gray-500">Starting camera…</p></div>`;
  if (s.view === "streaming") body += `<div class="flex flex-col gap-3" data-testid="image-gallery-camera-streaming">
      <div class="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl bg-black ${s.imageFormat.cssAspect}"><video data-cam-video="${id}" autoplay playsinline muted data-on-loadedmetadata="cam.videoReady|${id}" class="h-full w-full object-cover"></video></div>
      <div class="flex justify-center gap-3 pt-1">
        <button type="button" data-on-click="cam.flip|${id}" data-testid="image-gallery-camera-flip-btn" class="${btnGhost}">${K.icon("FiRefreshCw", "text-sm")} Flip</button>
        <button type="button" data-on-click="cam.capture|${id}"${K.attr("disabled", !s.videoReady)} data-testid="image-gallery-camera-capture-btn" class="flex items-center gap-1.5 rounded-xl bg-green-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50">${K.icon("FiCamera", "text-sm")} Capture</button>
      </div></div>`;
  if (s.view === "cropping" && s.cropSource) body += ImageCropper(`${id}:crop`, { src: s.cropSource, aspect: s.imageFormat.aspect, maxOutputSide: s.imageResolution.maxSide, onApply: (d) => cam.applyCrop(id, d), onCancel: () => cam.cancelCrop(id) });
  if (s.view === "captured" && s.capturedImage) body += `<div class="flex flex-col gap-4" data-testid="image-gallery-camera-captured">
      <div class="mx-auto w-full max-w-sm overflow-hidden rounded-xl bg-black ${s.imageFormat.cssAspect}"><img src="${s.capturedImage}" alt="Captured" data-testid="image-gallery-camera-captured-image" class="h-full w-full object-contain"></div>
      <div class="mx-auto w-full max-w-sm rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-700/40">
        <div class="mb-2 flex items-center gap-2">${K.icon("FiTag", "text-sm text-green-500")}<span class="text-xs font-semibold text-gray-600 dark:text-gray-200">Image Tags</span></div>
        <div class="mb-2 flex min-h-[1.75rem] flex-wrap gap-1.5">${s.tags.length === 0 ? `<span class="text-xs text-gray-400">Add one or more tags for these photos</span>` : s.tags.map((t) => `<button type="button" data-on-click="cam.removeTag|${id}|${K.esc(t)}" data-testid="image-gallery-camera-tag-${K.esc(t)}" class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">${K.esc(t)}${K.icon("FiX", "text-[10px]")}</button>`).join("")}</div>
        <div class="flex gap-2"><input type="text" value="${K.esc(s.tagInput)}" data-on-input="cam.tagInput|${id}" data-on-keydown="cam.tagKey|${id}" placeholder="Add tag" data-testid="image-gallery-camera-tag-input" class="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
          <button type="button" data-on-click="cam.addTag|${id}" data-testid="image-gallery-camera-tag-add-btn" class="rounded-lg bg-green-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600">Add</button></div>
      </div>
      <div class="flex flex-wrap gap-2 pt-1">
        <button type="button" data-on-click="cam.retake|${id}" data-testid="image-gallery-camera-retake-btn" class="${btnGhost}">${K.icon("FiRefreshCw", "text-sm")} Retake</button>
        ${canTakeAnother ? `<button type="button" data-on-click="cam.another|${id}" data-testid="image-gallery-camera-take-another-btn" class="${btnGreenOutline}">${K.icon("FiCamera", "text-sm")} Take Another</button>` : ""}
        <button type="button" data-on-click="cam.editCrop|${id}" data-testid="image-gallery-camera-crop-btn" class="${btnGreenOutline}">${K.icon("FiCrop", "text-sm")} Crop</button>
        <button type="button" data-on-click="cam.save|${id}"${K.attr("disabled", s.saving)} data-testid="image-gallery-camera-save-btn" class="ml-auto flex items-center gap-1.5 rounded-xl bg-green-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60">${s.saving ? `<span class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>` : K.icon("FiCheck", "text-sm")}${s.saving ? "Uploading…" : "Save &amp; Next Product"}${!s.saving ? K.icon("FiArrowRight", "text-sm") : ""}</button>
      </div>
      ${!canTakeAnother ? `<p class="text-center text-xs text-amber-600 dark:text-amber-400">Maximum ${MAX_PHOTOS} photos per product reached.</p>` : ""}
    </div>`;
  if (s.view === "error") body += `<div data-testid="image-gallery-camera-error" class="flex flex-col items-center justify-center gap-5 py-12"><div class="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20">${K.icon("FiCamera", "text-3xl text-red-400")}</div><p class="max-w-xs text-center text-sm font-medium text-red-500 dark:text-red-400">${K.esc(s.errorMsg)}</p><button type="button" data-on-click="cam.retry|${id}" data-testid="image-gallery-camera-retry-btn" class="flex items-center gap-2 rounded-xl bg-green-500 px-5 py-2.5 text-sm text-white transition-colors hover:bg-green-600">${K.icon("FiRefreshCw")} Try Again</button></div>`;

  return K.portal(id, `<div class="fixed inset-0 z-[10050] flex flex-col bg-white dark:bg-gray-900" data-testid="image-directory-capture-portal">
    <div class="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 px-4 dark:border-gray-700">
      <span data-testid="image-directory-capture-title" class="text-sm font-semibold text-gray-800 dark:text-gray-100">Take photos</span>
      <button type="button" data-on-click="cam.close|${id}" aria-label="Done" data-testid="image-directory-capture-done-btn" class="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">${K.icon("FiX", "h-5 w-5")}</button>
    </div>
    <div class="flex-1 overflow-y-auto p-4"><div class="mx-auto flex w-full max-w-2xl flex-col items-center" data-testid="image-gallery-modal" data-status="${isGallery ? "gallery" : "camera"}">
      <div class="w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <div class="flex items-center gap-3">${isGallery
            ? `<button type="button" data-on-click="cam.back|${id}" data-testid="image-gallery-back-btn" class="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">${K.icon("FiArrowLeft", "text-base")} Back</button><span class="flex items-center gap-1.5 text-base font-semibold text-gray-700 dark:text-gray-200">${K.icon("FiImage", "text-green-500")} My Photos</span>`
            : `${K.icon("FiCamera", "shrink-0 text-xl text-green-500")}<h2 class="text-base font-semibold text-gray-700 dark:text-gray-200">Image Gallery</h2>`}</div>
          <div class="flex items-center gap-3">${!isGallery ? `<div class="flex items-center gap-2">${dots}<span class="ml-1 text-xs text-gray-500 dark:text-gray-400">${s.photos.length}/${MAX_PHOTOS} photos</span></div>
            <button type="button" data-on-click="cam.gallery|${id}" data-testid="image-gallery-view-gallery-btn" class="flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">${K.icon("FiImage", "text-sm")} Gallery</button>` : ""}</div>
        </div>
        ${!isGallery ? `<div class="flex flex-wrap items-end gap-3 border-b border-gray-100 bg-gray-50 px-5 py-2.5 dark:border-gray-700 dark:bg-gray-700/50">
          ${select("Image Format", "min-w-[8.5rem]", "cam.format", "image-gallery-camera-format-select", IMAGE_FORMATS.map((f) => ({ value: f.value, text: f.label })), s.imageFormat.value)}
          ${select("Resolution", "min-w-[9.5rem]", "cam.resolution", "image-gallery-camera-resolution-select", IMAGE_RESOLUTIONS.map((r) => ({ value: r.value, text: `${r.label} (${r.description})` })), s.imageResolution.value)}
          <span class="pb-1.5 text-[10px] font-medium text-gray-400 dark:text-gray-500">${resolutionDimensions(s.imageResolution, s.imageFormat.aspect)}</span>
          ${isFormatLocked ? `<span class="pb-1.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">Format and resolution locked until save</span>` : `<span class="pb-1.5 text-[10px] text-gray-400 dark:text-gray-500">Locks after the first capture</span>`}
        </div>` : ""}
        ${!isGallery && s.photos.length > 0 ? `<div class="flex gap-2 overflow-x-auto border-b border-gray-100 bg-gray-50 px-5 py-3 dark:border-gray-700 dark:bg-gray-700/50">${s.photos.map((d, i) => `<div data-testid="image-gallery-camera-photo-${i}" class="relative h-14 w-14 shrink-0"><img src="${d}" alt="Photo ${i + 1}" class="aspect-square h-14 w-14 rounded-lg border-2 border-green-400 object-cover"><span class="absolute -bottom-1.5 -left-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[9px] font-bold text-white">${i + 1}</span><button type="button" data-on-click="cam.removePhoto|${id}|${i}" data-testid="image-gallery-camera-photo-remove-${i}" aria-label="Remove photo ${i + 1}" class="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600">${K.icon("FiX", "text-[9px]")}</button></div>`).join("")}</div>` : ""}
        <div class="p-4 sm:p-5"><canvas data-cam-canvas="${id}" class="hidden"></canvas>${body}</div>
      </div>
    </div></div>
  </div>`);
}

const cam = {
  S: (id) => K.state(id),
  stop(id) {
    const s = cam.S(id);
    s.stream?.getTracks().forEach((t) => t.stop());
    s.stream = null;
  },
  async start(id, facing) {
    const s = cam.S(id);
    const mode = facing ?? s.facingMode;
    cam.stop(id);
    Object.assign(s, { errorMsg: "", videoReady: false, view: "idle" });
    K.update();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      if (!K.props[id]?.open) return stream.getTracks().forEach((t) => t.stop());
      s.stream = stream;
      s.view = "streaming";
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      s.errorMsg =
        name === "NotAllowedError" ? "Camera permission denied. Please allow camera access." : name === "NotFoundError" ? "No camera found on this device." : name === "NotReadableError" ? "Camera is in use by another application." : "Failed to access camera. Please try again.";
      s.view = "error";
    }
    K.update();
  },
  applyCrop(id, dataUrl) {
    Object.assign(cam.S(id), { capturedImage: dataUrl, cropSource: null, view: "captured" });
  },
  cancelCrop(id) {
    const s = cam.S(id);
    s.cropSource = null;
    if (s.capturedImage) s.view = "captured";
    else {
      s.originalImage = null;
      cam.start(id);
    }
  },
  resetForNextProduct(id) {
    const s = cam.S(id);
    Object.assign(s, { photos: [], capturedImage: null, cropSource: null, originalImage: null, tags: [], tagInput: "", productCount: s.productCount + 1, imageFormat: IMAGE_FORMATS[0], imageResolution: IMAGE_RESOLUTIONS[3] });
  },
};
K.on["cam.close"] = (id) => K.props[id].onClose();
K.on["cam.videoReady"] = (id) => (cam.S(id).videoReady = true);
K.on["cam.capture"] = (id) => {
  const s = cam.S(id);
  const video = document.querySelector(`[data-cam-video="${id}"]`);
  const canvas = document.querySelector(`[data-cam-canvas="${id}"]`);
  if (!video || !canvas) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, canvas.width, canvas.height);
  s.originalImage = canvas.toDataURL("image/jpeg", 0.9);
  s.capturedImage = PM.imageCrop.cropCanvasToAspect({ sourceCanvas: canvas, aspect: s.imageFormat.aspect, maxOutputSide: s.imageResolution.maxSide, quality: 0.9 });
  s.cropSource = null;
  cam.stop(id);
  s.view = "captured";
};
K.on["cam.flip"] = (id) => {
  const s = cam.S(id);
  s.facingMode = s.facingMode === "environment" ? "user" : "environment";
  cam.start(id, s.facingMode);
};
K.on["cam.format"] = (id, ev) => {
  const s = cam.S(id);
  const f = IMAGE_FORMATS.find((x) => x.value === ev.target.value);
  if (f && !(s.photos.length > 0 || s.capturedImage || s.cropSource)) s.imageFormat = f;
};
K.on["cam.resolution"] = (id, ev) => {
  const s = cam.S(id);
  const r = IMAGE_RESOLUTIONS.find((x) => x.value === ev.target.value);
  if (r && !(s.photos.length > 0 || s.capturedImage || s.cropSource)) s.imageResolution = r;
};
K.on["cam.retake"] = (id) => {
  Object.assign(cam.S(id), { capturedImage: null, cropSource: null, originalImage: null });
  cam.start(id);
};
K.on["cam.editCrop"] = (id) => {
  const s = cam.S(id);
  s.cropSource = s.originalImage || s.capturedImage;
  s.view = "cropping";
};
K.on["cam.another"] = (id) => {
  const s = cam.S(id);
  if (!s.capturedImage) return;
  s.photos = [...s.photos, s.capturedImage];
  s.capturedImage = null;
  s.originalImage = null;
  cam.start(id);
};
K.on["cam.removePhoto"] = (arg) => {
  const [id, i] = arg.split("|");
  cam.S(id).photos = cam.S(id).photos.filter((_, idx) => idx !== Number(i));
};
K.on["cam.tagInput"] = (id, ev) => (cam.S(id).tagInput = ev.target.value);
K.on["cam.addTag"] = (id) => {
  const s = cam.S(id);
  const next = s.tagInput.trim();
  if (!next) return;
  s.tags = normalizeTags([...s.tags, next]);
  s.tagInput = "";
};
K.on["cam.tagKey"] = (id, ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    K.on["cam.addTag"](id);
  }
};
K.on["cam.removeTag"] = (arg) => {
  const bar = arg.indexOf("|");
  const s = cam.S(arg.slice(0, bar));
  s.tags = s.tags.filter((t) => t !== arg.slice(bar + 1));
};
K.on["cam.save"] = async (id) => {
  const s = cam.S(id);
  if (!s.capturedImage) return;
  s.saving = true;
  K.update();
  try {
    const all = [...s.photos, s.capturedImage];
    const t = normalizeTags(s.tags);
    const tags = t.length > 0 ? Object.fromEntries(t.map((n) => [n, "true"])) : undefined;
    const inputs = all.map((d, i) => ({ filename: `product_${s.productCount}_${i + 1}.jpeg`, file: dataUrlToFile(d, `product_${s.productCount}_${i + 1}.jpeg`), contentType: "image/jpeg", tags }));
    await K.props[id].onUpload(inputs);
    cam.resetForNextProduct(id);
    cam.start(id);
  } finally {
    s.saving = false;
    K.update();
  }
};
K.on["cam.gallery"] = (id) => {
  cam.stop(id);
  cam.S(id).view = "gallery";
};
K.on["cam.back"] = (id) => cam.start(id);
K.on["cam.retry"] = (id) => cam.start(id);

// ---- ImageCropper ------------------------------------------------------------------------
const CROP_HANDLES = [
  { name: "nw", position: "-left-2.5 -top-2.5", cursor: "cursor-nwse-resize" },
  { name: "ne", position: "-right-2.5 -top-2.5", cursor: "cursor-nesw-resize" },
  { name: "sw", position: "-bottom-2.5 -left-2.5", cursor: "cursor-nesw-resize" },
  { name: "se", position: "-bottom-2.5 -right-2.5", cursor: "cursor-nwse-resize" },
];
function ImageCropper(id, p) {
  p = { aspect: 1, maxOutputSide: 1200, ...p };
  K.props[id] = p;
  const ic = PM.imageCrop;
  const s = K.state(id, () => ({ imageSize: { width: 0, height: 0 }, stageSize: { width: 0, height: 0 }, zoom: 1, crop: null, processing: false, key: null, initialized: false, interaction: null, observer: null }));
  const key = `${p.src}|${p.aspect}`;
  if (s.key !== key) Object.assign(s, { key, initialized: false, imageSize: { width: 0, height: 0 }, zoom: 1, crop: null });
  if (!s.observer) K.after(() => {
    const stage = document.querySelector(`[data-crop-stage="${id}"]`);
    if (!stage || s.observer) return;
    const measure = () => {
      const r = stage.getBoundingClientRect();
      if (r.width !== s.stageSize.width || r.height !== s.stageSize.height) {
        s.stageSize = { width: r.width, height: r.height };
        K.update();
      }
    };
    measure();
    s.observer = new ResizeObserver(measure);
    s.observer.observe(stage);
  });
  const imageBounds = ic.getRenderedImageBounds({ imageSize: s.imageSize, stageSize: s.stageSize, zoom: s.zoom, fit: "cover" });
  const visible = ic.getVisibleImageBounds(imageBounds, s.stageSize);
  if (visible?.width && visible?.height) {
    // useEffect([aspect, visibleBounds]) — first time: initial crop; afterwards: constrain.
    const vKey = JSON.stringify(visible);
    if (s.vKey !== vKey) {
      s.vKey = vKey;
      if (!s.initialized || !s.crop) {
        s.initialized = true;
        s.crop = ic.createInitialCrop(visible, p.aspect);
      } else s.crop = ic.constrainCrop(s.crop, visible, p.aspect);
    }
  }
  s.imageBounds = imageBounds;
  s.visible = visible;
  const c = s.crop;
  const shade = (style) => `<div class="pointer-events-none absolute ${style[0]} bg-black/55" style="${style[1]}"></div>`;
  return `<div class="flex flex-col gap-4" data-testid="image-cropper">
    <div class="text-center"><h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200">Crop your photo</h3><p class="mt-1 text-xs text-gray-400 dark:text-gray-500">Drag the selection to move it. Pull a green corner to resize.</p></div>
    <div data-crop-stage="${id}" data-testid="image-cropper-stage" class="relative mx-auto w-full max-w-sm touch-none select-none overflow-hidden rounded-xl bg-gray-950" style="aspect-ratio:${p.aspect}" data-on-pointermove="crop.move|${id}" data-on-pointerup="crop.end|${id}" data-on-pointercancel="crop.end|${id}">
      <img data-crop-img="${id}" src="${p.src}" alt="Crop source" draggable="false" data-on-load="crop.loaded|${id}" class="pointer-events-none absolute max-w-none select-none ${imageBounds ? "" : "invisible"}"${imageBounds ? ` style="left:${imageBounds.x}px;top:${imageBounds.y}px;width:${imageBounds.width}px;height:${imageBounds.height}px"` : ""}>
      ${c ? `${shade(["left-0 top-0 w-full", `height:${c.y}px`])}${shade(["bottom-0 left-0 w-full", `top:${c.y + c.height}px`])}${shade(["left-0", `top:${c.y}px;width:${c.x}px;height:${c.height}px`])}${shade(["right-0", `top:${c.y}px;left:${c.x + c.width}px;height:${c.height}px`])}
        <div role="presentation" data-testid="image-cropper-rect" class="absolute cursor-move border-2 border-green-400 shadow-[0_0_0_1px_rgba(255,255,255,0.75)]" style="left:${c.x}px;top:${c.y}px;width:${c.width}px;height:${c.height}px" data-on-pointerdown="crop.begin|${id}|move">
          <div class="pointer-events-none absolute left-1/3 top-0 h-full border-l border-white/45"></div><div class="pointer-events-none absolute left-2/3 top-0 h-full border-l border-white/45"></div><div class="pointer-events-none absolute left-0 top-1/3 w-full border-t border-white/45"></div><div class="pointer-events-none absolute left-0 top-2/3 w-full border-t border-white/45"></div>
          ${CROP_HANDLES.map((h) => `<button type="button" aria-label="Resize crop from ${h.name} corner" data-testid="image-cropper-handle-${h.name}" class="absolute z-10 h-6 w-6 rounded-full border-2 border-white bg-green-500 shadow-md ${h.position} ${h.cursor}" data-on-pointerdown="crop.begin|${id}|${h.name}"></button>`).join("")}
        </div>` : ""}
    </div>
    <div class="mx-auto w-full max-w-sm"><div class="flex items-center gap-3">${K.icon("FiZoomIn", "shrink-0 text-gray-400")}<input type="range" min="1" max="3" step="0.01" value="${s.zoom}" data-on-input="crop.zoom|${id}" aria-label="Image zoom" data-testid="image-cropper-zoom-slider" class="w-full accent-green-500"><span class="w-10 text-right text-xs font-medium text-gray-500 dark:text-gray-400">${Math.round(s.zoom * 100)}%</span></div></div>
    <div class="flex flex-wrap justify-center gap-2">
      <button type="button" data-on-click="crop.cancel|${id}" data-testid="image-cropper-cancel-btn" class="rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
      <button type="button" data-on-click="crop.reset|${id}" data-testid="image-cropper-reset-btn" class="flex items-center gap-1.5 rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">${K.icon("FiRefreshCw", "text-sm")} Reset</button>
      <button type="button" data-on-click="crop.apply|${id}"${K.attr("disabled", s.processing || !c)} data-testid="image-cropper-apply-btn" class="flex items-center gap-1.5 rounded-xl bg-green-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-60">${s.processing ? `<span class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>` : K.icon("FiCrop", "text-sm")}${s.processing ? "Cropping…" : "Apply Crop"}</button>
    </div>
  </div>`;
}
const stagePoint = (id, ev) => {
  const r = document.querySelector(`[data-crop-stage="${id}"]`).getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
};
K.on["crop.loaded"] = (id, ev) => (K.state(id).imageSize = { width: ev.target.naturalWidth, height: ev.target.naturalHeight });
K.on["crop.begin"] = (arg, ev, el) => {
  const [id, what] = arg.split("|");
  const s = K.state(id);
  if (!s.crop) return;
  ev.preventDefault();
  el.setPointerCapture(ev.pointerId);
  s.interaction = { pointerId: ev.pointerId, type: what === "move" ? "move" : "resize", handle: what === "move" ? null : what, start: stagePoint(id, ev), crop: s.crop };
};
K.on["crop.move"] = (id, ev) => {
  const s = K.state(id);
  const it = s.interaction;
  if (!it || it.pointerId !== ev.pointerId || !s.visible) return;
  ev.preventDefault();
  const pt = stagePoint(id, ev);
  s.crop = it.type === "move" ? PM.imageCrop.moveCrop(it.crop, { x: pt.x - it.start.x, y: pt.y - it.start.y }, s.visible) : PM.imageCrop.resizeCrop({ crop: it.crop, handle: it.handle, pointer: pt, bounds: s.visible, aspect: K.props[id].aspect });
};
K.on["crop.end"] = (id, ev) => {
  const s = K.state(id);
  if (s.interaction?.pointerId === ev.pointerId) s.interaction = null;
};
K.on["crop.zoom"] = (id, ev) => (K.state(id).zoom = Number(ev.target.value));
K.on["crop.cancel"] = (id) => K.props[id].onCancel();
K.on["crop.reset"] = (id) => {
  const s = K.state(id);
  const ic = PM.imageCrop;
  const vb = ic.getVisibleImageBounds(ic.getRenderedImageBounds({ imageSize: s.imageSize, stageSize: s.stageSize, zoom: 1, fit: "cover" }), s.stageSize);
  s.zoom = 1;
  s.initialized = true;
  s.crop = ic.createInitialCrop(vb, K.props[id].aspect);
};
K.on["crop.apply"] = (id) => {
  const s = K.state(id);
  const img = document.querySelector(`[data-crop-img="${id}"]`);
  if (!s.crop || !s.imageBounds || !img) return;
  s.processing = true;
  try {
    K.props[id].onApply(PM.imageCrop.cropImageToDataUrl({ image: img, crop: s.crop, imageBounds: s.imageBounds, maxOutputSide: K.props[id].maxOutputSide }));
  } finally {
    s.processing = false;
  }
};

// ---- ImageGalleryBrowseView -------------------------------------------------------------
function ImageGalleryBrowseView(id, p) {
  K.props[id] = p;
  const s = K.state(id, () => ({ images: [], total: 0, isLoading: true, isLoadingMore: false, error: null, selected: new Set(), selectedTag: "", confirmOpen: false, page: 1, fetching: false, started: false }));
  if (!s.started) {
    s.started = true;
    queueMicrotask(() => browse.fetch(id, 1));
  }
  if (s.isLoading) return `<div data-testid="image-gallery-browse-loading" class="flex flex-col items-center gap-3 py-14"><div class="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent"></div><p class="text-sm text-gray-400 dark:text-gray-500">Loading gallery…</p></div>`;
  if (s.error) return `<p data-testid="image-gallery-browse-error" class="py-8 text-center text-sm text-red-500 dark:text-red-400">${K.esc(s.error)}</p>`;
  if (s.images.length === 0) return `<div data-testid="image-gallery-browse-empty" class="flex flex-col items-center gap-3 py-14 text-gray-400 dark:text-gray-500">${K.icon("FiImage", "h-8 w-8")}<p class="text-sm">No photos uploaded yet.</p></div>`;
  const vt = PM.imageDirectory.visibleTags;
  const counts = new Map();
  for (const image of s.images)
    for (const raw of vt(image)) {
      const label = raw.trim();
      const key = label.toLowerCase();
      if (!key) continue;
      const e = counts.get(key);
      e ? e.count++ : counts.set(key, { label, count: 1 });
    }
  const tagFilters = Array.from(counts.entries()).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const filtered = !s.selectedTag ? s.images : s.images.filter((im) => vt(im).some((t) => t.trim().toLowerCase() === s.selectedTag));
  const hasMore = s.images.length < s.total;
  const chip = (active) => `inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-green-900/30 dark:hover:text-green-400"}`;
  return `<div class="flex flex-col gap-4">
    ${s.confirmOpen ? DeleteModal(`${id}:delete`, { open: true, isBulk: s.selected.size > 1, onConfirm: () => browse.deleteSelected(id), onClose: () => (s.confirmOpen = false) }) : ""}
    ${s.selected.size > 0 ? `<div class="sticky top-0 z-10 flex items-center justify-between rounded-xl border border-red-200 bg-red-50/95 px-3 py-2 shadow-sm backdrop-blur dark:border-red-800 dark:bg-red-900/90"><span data-testid="image-gallery-browse-selection-count" class="text-sm font-medium text-red-600 dark:text-red-400">${s.selected.size} photo${s.selected.size === 1 ? "" : "s"} selected</span><div class="flex gap-2"><button type="button" data-on-click="browse.clear|${id}" data-testid="image-gallery-browse-selection-clear-btn" class="rounded-lg px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">Clear</button><button type="button" data-on-click="browse.confirm|${id}" data-testid="image-gallery-browse-selection-delete-btn" class="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600">Delete</button></div></div>` : ""}
    ${tagFilters.length > 0 ? `<div class="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button type="button" data-on-click="browse.tag|${id}|" data-testid="image-gallery-browse-tag-all" data-status="${s.selectedTag ? "unselected" : "selected"}" class="${chip(!s.selectedTag)}">All<span class="${s.selectedTag ? "text-gray-400 dark:text-gray-500" : "text-white/75"}">${s.total}</span></button>
      ${tagFilters.map((t) => `<button type="button" data-on-click="browse.tag|${id}|${s.selectedTag === t.key ? "" : K.esc(t.key)}" data-testid="image-gallery-browse-tag-${K.esc(t.key)}" data-status="${s.selectedTag === t.key ? "selected" : "unselected"}" class="${chip(s.selectedTag === t.key)}">${K.esc(t.label)}<span class="${s.selectedTag === t.key ? "text-white/75" : "text-gray-400 dark:text-gray-500"}">${t.count}</span></button>`).join("")}
    </div>` : ""}
    ${filtered.length === 0 ? `<div data-testid="image-gallery-browse-tag-empty" class="flex flex-col items-center gap-2 py-12 text-gray-400 dark:text-gray-500">${K.icon("FiTag", "h-6 w-6")}<p class="text-sm">No photos found for this tag.</p></div>` : `<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">${filtered.map((im) => {
      const on = s.selected.has(im.key);
      const tags = vt(im);
      return `<button data-key="${K.esc(im.key)}" type="button" data-on-click="browse.toggle|${id}|${K.esc(im.key)}" aria-pressed="${on}" data-testid="image-gallery-browse-tile-${K.esc(im.key)}" data-status="${on ? "selected" : "unselected"}" class="group relative aspect-square overflow-hidden rounded-lg border-2 bg-gray-100 text-left transition-colors dark:bg-gray-700 ${on ? "border-red-400 dark:border-red-500" : "border-gray-200 hover:border-gray-400 dark:border-gray-600"}">
        <img src="${K.esc(im.url)}" alt="" class="h-full w-full object-cover">
        ${tags.length > 0 ? `<span class="absolute left-1.5 top-1.5 flex max-w-[calc(100%-2.5rem)] gap-1">${tags.slice(0, 2).map((t) => `<span class="max-w-[45%] truncate rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">${K.esc(t)}</span>`).join("")}${tags.length > 2 ? `<span class="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">+${tags.length - 2}</span>` : ""}</span>` : ""}
        <span class="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${on ? "border-red-500 bg-red-500" : "border-gray-400 bg-white/70"}">${on ? K.icon("FiCheck", "h-3 w-3 text-white") : ""}</span>
        ${on ? `<span class="absolute inset-0 bg-red-500/20"></span>` : ""}</button>`;
    }).join("")}</div>`}
    <div class="flex min-h-8 items-center justify-center py-3">${s.isLoadingMore ? `<div class="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent"></div>` : hasMore ? `<button type="button" data-on-click="browse.more|${id}" data-testid="image-gallery-browse-load-more-btn" class="rounded-lg bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-200">Load more photos</button>` : ""}</div>
  </div>`;
}
const browse = {
  async fetch(id, page) {
    const s = K.state(id);
    if (s.fetching) return;
    s.fetching = true;
    const more = page > 1;
    if (more) s.isLoadingMore = true;
    else {
      s.isLoading = true;
      s.selected = new Set();
    }
    s.error = null;
    K.update();
    try {
      const p = K.props[id];
      const res = await p.apiClient.listImageDirectory(p.locationId, page, 20);
      if (!more) s.images = res.images;
      else {
        const seen = new Set(s.images.map((i) => i.key));
        s.images = [...s.images, ...res.images.filter((i) => !seen.has(i.key))];
      }
      s.total = res.total;
      s.page = page;
    } catch (err) {
      s.error = err instanceof Error ? err.message : "Failed to load gallery.";
    } finally {
      s.fetching = false;
      if (more) s.isLoadingMore = false;
      else s.isLoading = false;
      K.update();
    }
  },
  async deleteSelected(id) {
    const s = K.state(id);
    const p = K.props[id];
    await p.apiClient.deleteImageDirectoryImages(p.locationId, Array.from(s.selected));
    s.selected = new Set();
    s.page = 1;
    await browse.fetch(id, 1);
  },
};
K.on["browse.clear"] = (id) => (K.state(id).selected = new Set());
K.on["browse.confirm"] = (id) => (K.state(id).confirmOpen = true);
K.on["browse.tag"] = (arg) => {
  const bar = arg.indexOf("|");
  K.state(arg.slice(0, bar)).selectedTag = arg.slice(bar + 1);
};
K.on["browse.toggle"] = (arg) => {
  const bar = arg.indexOf("|");
  const s = K.state(arg.slice(0, bar));
  const key = arg.slice(bar + 1);
  const next = new Set(s.selected);
  next.has(key) ? next.delete(key) : next.add(key);
  s.selected = next;
};
K.on["browse.more"] = (id) => {
  const s = K.state(id);
  if (s.fetching || s.images.length >= s.total) return;
  browse.fetch(id, s.page + 1);
};
