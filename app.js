const canvas = document.querySelector("#preview");
const ctx = canvas.getContext("2d");
const video = document.querySelector("#videoSource");
const sampleCanvas = document.createElement("canvas");
const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
const tintCanvas = document.createElement("canvas");
const tintCtx = tintCanvas.getContext("2d");

const stateNames = ["Shadow", "Darks", "Low Mid", "Mid", "High Mid", "Lights", "Highlight"];
const defaultColors = ["#141414", "#303133", "#55575a", "#777f7a", "#a1aca0", "#d6dfc3", "#fbffd9"];
const defaultSvgPaths = [
  "symbols/01-shadow-singularity.svg",
  "symbols/02-dark-orbit.svg",
  "symbols/03-low-mid-wormhole.svg",
  "symbols/04-mid-light-cone.svg",
  "symbols/05-high-mid-spacetime-grid.svg",
  "symbols/06-light-timewave.svg",
  "symbols/07-highlight-chronal-flare.svg",
];

const controls = {
  mediaInput: document.querySelector("#mediaInput"),
  bulkSvgInput: document.querySelector("#bulkSvgInput"),
  gridResolution: document.querySelector("#gridResolution"),
  cellPadding: document.querySelector("#cellPadding"),
  backgroundColor: document.querySelector("#backgroundColor"),
  invertTones: document.querySelector("#invertTones"),
  minScale: document.querySelector("#minScale"),
  midScale: document.querySelector("#midScale"),
  maxScale: document.querySelector("#maxScale"),
  autoRotate: document.querySelector("#autoRotate"),
  rotationInterval: document.querySelector("#rotationInterval"),
  playPause: document.querySelector("#playPause"),
  recordVideo: document.querySelector("#recordVideo"),
  exportPng: document.querySelector("#exportPng"),
};

const outputs = {
  grid: document.querySelector("#gridValue"),
  padding: document.querySelector("#paddingValue"),
  minScale: document.querySelector("#minScaleValue"),
  midScale: document.querySelector("#midScaleValue"),
  maxScale: document.querySelector("#maxScaleValue"),
  interval: document.querySelector("#intervalValue"),
  sourceStatus: document.querySelector("#sourceStatus"),
  canvasReadout: document.querySelector("#canvasReadout"),
  frameReadout: document.querySelector("#frameReadout"),
};

const state = {
  sourceType: "placeholder",
  image: null,
  imageUrl: null,
  videoUrl: null,
  mediaRecorder: null,
  recordingChunks: [],
  aspect: "original",
  fit: "cover",
  rotation: 0,
  lastRotationAt: 0,
  animationId: null,
  svgSlots: stateNames.map((name, index) => ({
    name,
    color: defaultColors[index],
    fileName: defaultSvgPaths[index].split("/").pop(),
    image: null,
    objectUrl: null,
    cacheKey: "",
    cache: null,
  })),
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function radians(degrees) {
  return (degrees * Math.PI) / 180;
}

function config() {
  return {
    grid: Number(controls.gridResolution.value),
    padding: Number(controls.cellPadding.value) / 100,
    background: controls.backgroundColor.value,
    invert: controls.invertTones.checked,
    minScale: Number(controls.minScale.value) / 100,
    midScale: Number(controls.midScale.value) / 100,
    maxScale: Number(controls.maxScale.value) / 100,
    autoRotate: controls.autoRotate.checked,
    interval: Number(controls.rotationInterval.value),
  };
}

function buildStateRows() {
  const rows = document.querySelector("#stateRows");
  rows.innerHTML = "";

  state.svgSlots.forEach((slot, index) => {
    const row = document.createElement("div");
    row.className = "state-row";

    const name = document.createElement("div");
    name.className = "state-name";
    name.textContent = slot.name;

    const color = document.createElement("input");
    color.type = "color";
    color.value = slot.color;
    color.setAttribute("aria-label", `${slot.name} color`);
    color.addEventListener("input", () => {
      slot.color = color.value;
      slot.cacheKey = "";
      render();
    });

    const svgName = document.createElement("div");
    svgName.className = "svg-name";
    svgName.textContent = slot.fileName;

    const upload = document.createElement("label");
    upload.className = "svg-button";
    upload.textContent = "SVG";

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".svg,image/svg+xml";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) loadSvgFile(file, index);
    });

    upload.append(input);
    row.append(name, color, svgName, upload);
    rows.append(row);
  });
}

function updateStateRows() {
  document.querySelectorAll(".state-row").forEach((row, index) => {
    const color = row.querySelector('input[type="color"]');
    const label = row.querySelector(".svg-name");
    color.value = state.svgSlots[index].color;
    label.textContent = state.svgSlots[index].fileName;
  });
}

function updateOutputs() {
  outputs.grid.textContent = controls.gridResolution.value;
  outputs.padding.textContent = `${controls.cellPadding.value}%`;
  outputs.minScale.textContent = `${controls.minScale.value}%`;
  outputs.midScale.textContent = `${controls.midScale.value}%`;
  outputs.maxScale.textContent = `${controls.maxScale.value}%`;
  outputs.interval.textContent = `${controls.rotationInterval.value}ms`;
  outputs.canvasReadout.textContent = `${canvas.width} x ${canvas.height}`;
}

function sourceSize() {
  if (state.sourceType === "image" && state.image?.naturalWidth) {
    return { width: state.image.naturalWidth, height: state.image.naturalHeight };
  }
  if (state.sourceType === "video" && video.videoWidth) {
    return { width: video.videoWidth, height: video.videoHeight };
  }
  return { width: 1200, height: 900 };
}

function resizeCanvas() {
  const source = sourceSize();
  const width = 1200;
  const aspect = state.aspect === "square" ? 1 : source.height / source.width;
  canvas.width = width;
  canvas.height = Math.max(1, Math.round(width * aspect));
  sampleCanvas.width = canvas.width;
  sampleCanvas.height = canvas.height;
  updateOutputs();
}

function mediaRect(sourceWidth, sourceHeight, targetWidth, targetHeight, fit) {
  const scale =
    fit === "contain"
      ? Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
      : Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  };
}

function drawSource() {
  sampleCtx.fillStyle = controls.backgroundColor.value;
  sampleCtx.fillRect(0, 0, sampleCanvas.width, sampleCanvas.height);

  if (state.sourceType === "image" && state.image) {
    const rect = mediaRect(
      state.image.naturalWidth,
      state.image.naturalHeight,
      sampleCanvas.width,
      sampleCanvas.height,
      state.fit,
    );
    sampleCtx.drawImage(state.image, rect.x, rect.y, rect.width, rect.height);
    return;
  }

  if (state.sourceType === "video" && video.videoWidth) {
    const rect = mediaRect(video.videoWidth, video.videoHeight, sampleCanvas.width, sampleCanvas.height, state.fit);
    sampleCtx.drawImage(video, rect.x, rect.y, rect.width, rect.height);
    return;
  }

  const gradient = sampleCtx.createLinearGradient(0, sampleCanvas.height, sampleCanvas.width, 0);
  gradient.addColorStop(0, "#050505");
  gradient.addColorStop(0.28, "#303030");
  gradient.addColorStop(0.5, "#8f9289");
  gradient.addColorStop(0.74, "#d4dcc9");
  gradient.addColorStop(1, "#ffffff");
  sampleCtx.fillStyle = gradient;
  sampleCtx.fillRect(0, 0, sampleCanvas.width, sampleCanvas.height);
  sampleCtx.fillStyle = "#101010";
  sampleCtx.fillRect(sampleCanvas.width * 0.12, sampleCanvas.height * 0.18, sampleCanvas.width * 0.28, sampleCanvas.height * 0.58);
  sampleCtx.fillStyle = "#eeeece";
  sampleCtx.beginPath();
  sampleCtx.arc(sampleCanvas.width * 0.68, sampleCanvas.height * 0.48, sampleCanvas.height * 0.22, 0, Math.PI * 2);
  sampleCtx.fill();
}

function averageLuma(data, width, height, x0, y0, x1, y1) {
  const startX = clamp(Math.floor(x0), 0, width - 1);
  const startY = clamp(Math.floor(y0), 0, height - 1);
  const endX = clamp(Math.ceil(x1), startX + 1, width);
  const endY = clamp(Math.ceil(y1), startY + 1, height);
  const stepX = Math.max(1, Math.floor((endX - startX) / 4));
  const stepY = Math.max(1, Math.floor((endY - startY) / 4));
  let total = 0;
  let count = 0;

  for (let y = startY; y < endY; y += stepY) {
    for (let x = startX; x < endX; x += stepX) {
      const offset = (y * width + x) * 4;
      total += data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
      count += 1;
    }
  }

  return count ? total / (255 * count) : 0;
}

function stateIndexForLuma(luma, invert) {
  const value = invert ? 1 - luma : luma;
  return clamp(Math.floor(value * 7), 0, 6);
}

function scaleForState(index, cfg) {
  const t = index / 6;
  if (t <= 0.5) {
    return lerp(cfg.minScale, cfg.midScale, t / 0.5);
  }
  return lerp(cfg.midScale, cfg.maxScale, (t - 0.5) / 0.5);
}

function drawDefaultSymbol(index, cx, cy, size, angle, color) {
  const half = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.13);
  ctx.lineJoin = "round";

  if (index === 0) {
    ctx.fillRect(-half, -half, size, size);
  } else if (index === 1) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(half, half);
    ctx.lineTo(-half, half);
    ctx.closePath();
    ctx.fill();
  } else if (index === 2) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(half, 0);
    ctx.lineTo(0, half);
    ctx.lineTo(-half, 0);
    ctx.closePath();
    ctx.fill();
  } else if (index === 3) {
    ctx.beginPath();
    ctx.arc(0, 0, half, 0, Math.PI * 2);
    ctx.fill();
  } else if (index === 4) {
    ctx.beginPath();
    ctx.rect(-half, -half, size, size);
    ctx.moveTo(-half, -half);
    ctx.lineTo(half, half);
    ctx.moveTo(half, -half);
    ctx.lineTo(-half, half);
    ctx.stroke();
  } else if (index === 5) {
    ctx.beginPath();
    ctx.arc(0, 0, half * 0.78, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const spoke = size * 0.2;
    ctx.fillRect(-spoke / 2, -half, spoke, size);
    ctx.fillRect(-half, -spoke / 2, size, spoke);
  }

  ctx.restore();
}

function cachedTintedSvg(slot) {
  if (!slot.image) return null;
  const cacheKey = `${slot.color}:${slot.image.src}`;
  if (slot.cache && slot.cacheKey === cacheKey) return slot.cache;

  const size = 256;
  tintCanvas.width = size;
  tintCanvas.height = size;
  tintCtx.clearRect(0, 0, size, size);
  tintCtx.drawImage(slot.image, 0, 0, size, size);
  tintCtx.globalCompositeOperation = "source-in";
  tintCtx.fillStyle = slot.color;
  tintCtx.fillRect(0, 0, size, size);
  tintCtx.globalCompositeOperation = "source-over";

  const cache = document.createElement("canvas");
  cache.width = size;
  cache.height = size;
  cache.getContext("2d").drawImage(tintCanvas, 0, 0);
  slot.cache = cache;
  slot.cacheKey = cacheKey;
  return cache;
}

function drawSymbol(index, cx, cy, size, angle) {
  const slot = state.svgSlots[index];
  const tinted = cachedTintedSvg(slot);

  if (!tinted) {
    drawDefaultSymbol(index, cx, cy, size, angle, slot.color);
    return;
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.drawImage(tinted, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function render(timestamp = performance.now()) {
  const cfg = config();
  if (cfg.autoRotate && timestamp - state.lastRotationAt >= cfg.interval) {
    state.rotation = (state.rotation + 90) % 360;
    state.lastRotationAt = timestamp;
    syncButtons("#rotationButtons", "rotation", String(state.rotation));
  }

  drawSource();
  const pixels = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
  const cols = cfg.grid;
  const cell = canvas.width / cols;
  const rows = Math.max(1, Math.round(canvas.height / cell));
  const cellHeight = canvas.height / rows;
  const angle = radians(state.rotation);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = cfg.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < rows; row += 1) {
    const y = row * cellHeight;
    for (let col = 0; col < cols; col += 1) {
      const x = col * cell;
      const luma = averageLuma(pixels, sampleCanvas.width, sampleCanvas.height, x, y, x + cell, y + cellHeight);
      const index = stateIndexForLuma(luma, cfg.invert);
      const baseSize = Math.min(cell, cellHeight) * (1 - cfg.padding);
      const size = Math.max(1, baseSize * scaleForState(index, cfg));
      drawSymbol(index, x + cell / 2, y + cellHeight / 2, size, angle);
    }
  }

  outputs.frameReadout.textContent = `${cols} x ${rows} cells`;
}

function loop(timestamp) {
  render(timestamp);
  state.animationId = requestAnimationFrame(loop);
}

function ensureLoop() {
  if (!state.animationId) {
    state.lastRotationAt = performance.now();
    state.animationId = requestAnimationFrame(loop);
  }
}

function shouldAnimate() {
  return controls.autoRotate.checked || (state.sourceType === "video" && !video.paused && !video.ended);
}

function stopLoopIfStatic() {
  if (!shouldAnimate() && state.animationId) {
    cancelAnimationFrame(state.animationId);
    state.animationId = null;
  }
}

function requestRender() {
  render();
  if (shouldAnimate()) {
    ensureLoop();
  } else {
    stopLoopIfStatic();
  }
}

function syncButtons(selector, key, value) {
  document.querySelectorAll(`${selector} button`).forEach((button) => {
    button.classList.toggle("is-active", button.dataset[key] === value);
  });
}

function revokeSlotUrl(index) {
  const slot = state.svgSlots[index];
  if (slot.objectUrl) URL.revokeObjectURL(slot.objectUrl);
  slot.objectUrl = null;
  slot.cache = null;
  slot.cacheKey = "";
}

function loadSvgFile(file, index) {
  if (!file.type.includes("svg") && !file.name.toLowerCase().endsWith(".svg")) return;
  revokeSlotUrl(index);

  const slot = state.svgSlots[index];
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.addEventListener("load", () => {
    slot.image = image;
    slot.objectUrl = url;
    slot.fileName = file.name;
    slot.cacheKey = "";
    updateStateRows();
    requestRender();
  });
  image.src = url;
}

function loadDefaultSvg(path, index) {
  const slot = state.svgSlots[index];
  const image = new Image();
  image.addEventListener("load", () => {
    slot.image = image;
    slot.fileName = path.split("/").pop();
    slot.cacheKey = "";
    updateStateRows();
    requestRender();
  });
  image.src = path;
}

function clearMediaUrls() {
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.imageUrl = null;
  state.videoUrl = null;
  state.image = null;
  video.removeAttribute("src");
  video.load();
}

function loadMedia(file) {
  clearMediaUrls();
  controls.playPause.disabled = true;
  controls.playPause.textContent = "Play";

  if (file.type.startsWith("video/")) {
    const url = URL.createObjectURL(file);
    state.sourceType = "video";
    state.videoUrl = url;
    video.src = url;
    video.addEventListener(
      "loadedmetadata",
      () => {
        resizeCanvas();
        outputs.sourceStatus.textContent = file.name;
        controls.playPause.disabled = false;
        video
          .play()
          .then(() => {
            controls.playPause.textContent = "Pause";
            ensureLoop();
          })
          .catch(() => {
            controls.playPause.textContent = "Play";
            requestRender();
          });
      },
      { once: true },
    );
    return;
  }

  if (file.type.startsWith("image/")) {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener("load", () => {
      state.sourceType = "image";
      state.image = image;
      state.imageUrl = url;
      outputs.sourceStatus.textContent = file.name;
      resizeCanvas();
      requestRender();
    });
    image.src = url;
  }
}

function exportPng() {
  render();
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dither-filter.png";
    document.body.append(link);
    link.click();
    setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 300);
  }, "image/png");
}

function supportedRecordingType() {
  if (!("MediaRecorder" in window) || !canvas.captureStream) return "";
  const options = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return options.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 300);
}

function toggleRecording() {
  if (state.mediaRecorder?.state === "recording") {
    state.mediaRecorder.stop();
    return;
  }

  const mimeType = supportedRecordingType();
  if (!mimeType) return;

  state.recordingChunks = [];
  const stream = canvas.captureStream(30);
  state.mediaRecorder = new MediaRecorder(stream, { mimeType });
  state.mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) state.recordingChunks.push(event.data);
  });
  state.mediaRecorder.addEventListener("stop", () => {
    stream.getTracks().forEach((track) => track.stop());
    controls.recordVideo.textContent = "Record WebM";
    const blob = new Blob(state.recordingChunks, { type: mimeType });
    downloadBlob(blob, "dither-filter.webm");
  });
  controls.recordVideo.textContent = "Stop";
  ensureLoop();
  state.mediaRecorder.start();
}

Object.entries({
  "#aspectButtons": "aspect",
  "#fitButtons": "fit",
  "#rotationButtons": "rotation",
}).forEach(([selector, key]) => {
  document.querySelectorAll(`${selector} button`).forEach((button) => {
    button.addEventListener("click", () => {
      if (key === "rotation") {
        state.rotation = Number(button.dataset.rotation);
      } else {
        state[key] = button.dataset[key];
      }
      syncButtons(selector, key, String(state[key]));
      if (key === "aspect") resizeCanvas();
      requestRender();
    });
  });
});

[
  controls.gridResolution,
  controls.cellPadding,
  controls.backgroundColor,
  controls.invertTones,
  controls.minScale,
  controls.midScale,
  controls.maxScale,
  controls.rotationInterval,
].forEach((control) => {
  control.addEventListener("input", () => {
    updateOutputs();
    requestRender();
  });
});

controls.autoRotate.addEventListener("input", requestRender);

controls.mediaInput.addEventListener("change", () => {
  const file = controls.mediaInput.files?.[0];
  if (file) loadMedia(file);
});

controls.bulkSvgInput.addEventListener("change", () => {
  const files = Array.from(controls.bulkSvgInput.files || [])
    .filter((file) => file.type.includes("svg") || file.name.toLowerCase().endsWith(".svg"))
    .slice(0, 7);
  files.forEach((file, index) => loadSvgFile(file, index));
});

controls.playPause.addEventListener("click", () => {
  if (video.paused) {
    video.play();
    controls.playPause.textContent = "Pause";
    ensureLoop();
  } else {
    video.pause();
    controls.playPause.textContent = "Play";
    requestRender();
  }
});

controls.recordVideo.addEventListener("click", toggleRecording);
controls.exportPng.addEventListener("click", exportPng);

buildStateRows();
controls.recordVideo.disabled = !supportedRecordingType();
defaultSvgPaths.forEach(loadDefaultSvg);
resizeCanvas();
updateOutputs();
requestRender();
