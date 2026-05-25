const STORAGE_KEY = "drawingCanvasSnapshot";
const SETTINGS_KEY = "drawingCanvasSettings";
const MAX_UNDO = 50;
const FILL_TOLERANCE = 32;

const SWATCH_COLORS = [
  "#e85d75", "#f4a261", "#e9c46a", "#4ecdc4",
  "#7b8cde", "#9b5de5", "#ffffff", "#1a1b26",
];

const TOOLS = [
  "pen", "highlighter", "spray", "eraser",
  "line", "arrow", "rect", "circle", "triangle",
  "fill", "eyedropper", "text",
];
const SHAPE_TOOLS = ["line", "arrow", "rect", "circle", "triangle"];
const FREEHAND_TOOLS = ["pen", "highlighter", "spray", "eraser"];
const FILL_SHAPES = ["rect", "circle", "triangle"];

const els = {
  board: document.getElementById("board"),
  colorPicker: document.getElementById("colorPicker"),
  fillColorPicker: document.getElementById("fillColorPicker"),
  fillColorWrap: document.getElementById("fillColorWrap"),
  bgColorPicker: document.getElementById("bgColorPicker"),
  shapeFillToggle: document.getElementById("shapeFillToggle"),
  shapeFill: document.getElementById("shapeFill"),
  brushSize: document.getElementById("brushSize"),
  sizeValue: document.getElementById("sizeValue"),
  strokeOpacity: document.getElementById("strokeOpacity"),
  opacityValue: document.getElementById("opacityValue"),
  swatches: document.getElementById("swatches"),
  toolButtons: document.querySelectorAll(".tool[data-tool]"),
  undo: document.getElementById("undo"),
  redo: document.getElementById("redo"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
  copyBtn: document.getElementById("copyBtn"),
  clear: document.getElementById("clear"),
  download: document.getElementById("download"),
  toast: document.getElementById("toast"),
};

const ctx = els.board.getContext("2d", { willReadFrequently: true });

let activeTool = "pen";
let strokeColor = els.colorPicker.value;
let fillColor = els.fillColorPicker.value;
let canvasBgColor = els.bgColorPicker.value;
let brushSize = Number(els.brushSize.value);
let strokeOpacity = Number(els.strokeOpacity.value) / 100;
let shapeFillEnabled = els.shapeFill.checked;
let isDrawing = false;
let startPoint = null;
let snapshotImageData = null;
let undoStack = [];
let redoStack = [];
let toastTimeout = null;

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => els.toast.classList.remove("visible"), 2200);
}

function fillBackground() {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = canvasBgColor;
  ctx.fillRect(0, 0, els.board.width, els.board.height);
  ctx.restore();
}

function resizeCanvas() {
  const wrap = els.board.parentElement;
  const width = Math.min(wrap.clientWidth, 1068);
  const height = Math.max(320, Math.min(Math.round(width * 0.62), 560));

  const snapshot = els.board.width > 0 ? els.board.toDataURL("image/png") : null;

  els.board.width = width;
  els.board.height = height;
  fillBackground();

  if (snapshot) restoreFromDataUrl(snapshot);
}

function pushUndo() {
  if (!els.board.width) return;
  undoStack.push(els.board.toDataURL("image/png"));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = [];
  els.undo.disabled = false;
  els.redo.disabled = true;
}

function restoreFromDataUrl(dataUrl, onDone) {
  const img = new Image();
  img.onload = () => {
    fillBackground();
    ctx.drawImage(img, 0, 0, els.board.width, els.board.height);
    if (onDone) onDone();
  };
  img.src = dataUrl;
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(els.board.toDataURL("image/png"));
  restoreFromDataUrl(undoStack.pop());
  els.undo.disabled = undoStack.length === 0;
  els.redo.disabled = false;
  showToast("Undone");
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(els.board.toDataURL("image/png"));
  restoreFromDataUrl(redoStack.pop());
  els.redo.disabled = redoStack.length === 0;
  els.undo.disabled = false;
  showToast("Redone");
}

function getCanvasPoint(e) {
  const rect = els.board.getBoundingClientRect();
  const scaleX = els.board.width / rect.width;
  const scaleY = els.board.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

function getStrokeAlpha() {
  if (activeTool === "highlighter") return strokeOpacity * 0.4;
  if (activeTool === "eraser") return 1;
  return strokeOpacity;
}

function applyStrokeStyle() {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = brushSize;
  ctx.globalAlpha = getStrokeAlpha();

  if (activeTool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.fillStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
  }
}

function resetCtxAlpha() {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawArrow(from, to) {
  const headLen = Math.max(10, brushSize * 2.5);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLen * Math.cos(angle - Math.PI / 6),
    to.y - headLen * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    to.x - headLen * Math.cos(angle + Math.PI / 6),
    to.y - headLen * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}

function drawTriangle(from, to) {
  const top = { x: from.x + (to.x - from.x) / 2, y: from.y };
  const left = { x: from.x, y: to.y };
  const right = { x: to.x, y: to.y };

  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();

  if (shapeFillEnabled) {
    ctx.save();
    resetCtxAlpha();
    ctx.fillStyle = fillColor;
    ctx.globalAlpha = strokeOpacity;
    ctx.fill();
    ctx.restore();
    applyStrokeStyle();
    ctx.stroke();
  } else {
    ctx.stroke();
  }
}

function fillShapeRect(from, to) {
  const w = to.x - from.x;
  const h = to.y - from.y;
  if (shapeFillEnabled) {
    ctx.save();
    resetCtxAlpha();
    ctx.fillStyle = fillColor;
    ctx.globalAlpha = strokeOpacity;
    ctx.fillRect(from.x, from.y, w, h);
    ctx.restore();
    applyStrokeStyle();
    ctx.strokeRect(from.x, from.y, w, h);
  } else {
    ctx.strokeRect(from.x, from.y, w, h);
  }
}

function fillShapeCircle(from, to) {
  const radius = Math.hypot(to.x - from.x, to.y - from.y);
  ctx.beginPath();
  ctx.arc(from.x, from.y, radius, 0, Math.PI * 2);
  if (shapeFillEnabled) {
    ctx.save();
    resetCtxAlpha();
    ctx.fillStyle = fillColor;
    ctx.globalAlpha = strokeOpacity;
    ctx.fill();
    ctx.restore();
    applyStrokeStyle();
    ctx.beginPath();
    ctx.arc(from.x, from.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.stroke();
  }
}

function drawShapePreview(from, to) {
  if (!snapshotImageData) return;
  ctx.putImageData(snapshotImageData, 0, 0);
  applyStrokeStyle();
  ctx.beginPath();

  if (activeTool === "line") {
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    resetCtxAlpha();
    return;
  }

  if (activeTool === "arrow") {
    drawArrow(from, to);
    resetCtxAlpha();
    return;
  }

  if (activeTool === "rect") {
    fillShapeRect(from, to);
    resetCtxAlpha();
    return;
  }

  if (activeTool === "circle") {
    fillShapeCircle(from, to);
    resetCtxAlpha();
    return;
  }

  if (activeTool === "triangle") {
    drawTriangle(from, to);
    resetCtxAlpha();
  }
}

function commitShape(from, to) {
  drawShapePreview(from, to);
  snapshotImageData = null;
  resetCtxAlpha();
}

function sprayAt(point) {
  const density = Math.max(12, Math.floor(brushSize * 3));
  const radius = brushSize * 2;

  applyStrokeStyle();
  for (let i = 0; i < density; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    const x = point.x + Math.cos(angle) * dist;
    const y = point.y + Math.sin(angle) * dist;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  resetCtxAlpha();
}

function pickColorAt(x, y) {
  const px = Math.floor(x);
  const py = Math.floor(y);
  const data = ctx.getImageData(px, py, 1, 1).data;
  if (data[3] === 0) return;
  const hex = `#${[data[0], data[1], data[2]]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
  setStrokeColor(hex);
  showToast(`Picked ${hex}`);
}

function placeText(point) {
  const text = prompt("Enter text:");
  if (!text || !text.trim()) return;

  pushUndo();
  applyStrokeStyle();
  resetCtxAlpha();
  ctx.globalAlpha = strokeOpacity;
  ctx.fillStyle = strokeColor;
  ctx.font = `${Math.max(14, brushSize * 4)}px "DM Sans", system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(text.trim(), point.x, point.y);
  resetCtxAlpha();
  saveToStorage();
  showToast("Text added");
}

function floodFill(startX, startY, fillHex) {
  const x = Math.floor(startX);
  const y = Math.floor(startY);
  if (x < 0 || y < 0 || x >= els.board.width || y >= els.board.height) return;

  const imageData = ctx.getImageData(0, 0, els.board.width, els.board.height);
  const data = imageData.data;
  const width = els.board.width;
  const height = els.board.height;
  const startIndex = (y * width + x) * 4;

  const target = [
    data[startIndex],
    data[startIndex + 1],
    data[startIndex + 2],
    data[startIndex + 3],
  ];

  const fill = hexToRgba(fillHex);
  if (colorsMatch(target, fill, 0)) return;

  const stack = [[x, y]];
  const visited = new Uint8Array(width * height);

  while (stack.length) {
    const [px, py] = stack.pop();
    const key = py * width + px;
    if (visited[key]) continue;
    visited[key] = 1;

    const index = key * 4;
    const current = [
      data[index],
      data[index + 1],
      data[index + 2],
      data[index + 3],
    ];

    if (!colorsMatch(current, target, FILL_TOLERANCE)) continue;

    data[index] = fill[0];
    data[index + 1] = fill[1];
    data[index + 2] = fill[2];
    data[index + 3] = 255;

    if (px > 0) stack.push([px - 1, py]);
    if (px < width - 1) stack.push([px + 1, py]);
    if (py > 0) stack.push([px, py - 1]);
    if (py < height - 1) stack.push([px, py + 1]);
  }

  ctx.putImageData(imageData, 0, 0);
}

function hexToRgba(hex) {
  const value = hex.replace("#", "");
  const full = value.length === 3
    ? value.split("").map((c) => c + c).join("")
    : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
    255,
  ];
}

function colorsMatch(a, b, tolerance) {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance &&
    Math.abs(a[2] - b[2]) <= tolerance &&
    Math.abs(a[3] - b[3]) <= tolerance
  );
}

function onPointerDown(e) {
  if (e.button !== 0) return;
  els.board.setPointerCapture(e.pointerId);
  const point = getCanvasPoint(e);

  if (activeTool === "fill") {
    pushUndo();
    floodFill(point.x, point.y, fillColor);
    saveToStorage();
    return;
  }

  if (activeTool === "eyedropper") {
    pickColorAt(point.x, point.y);
    return;
  }

  if (activeTool === "text") {
    placeText(point);
    return;
  }

  isDrawing = true;
  startPoint = point;
  pushUndo();

  if (SHAPE_TOOLS.includes(activeTool)) {
    snapshotImageData = ctx.getImageData(0, 0, els.board.width, els.board.height);
  }

  if (FREEHAND_TOOLS.includes(activeTool)) {
    if (activeTool === "spray") {
      sprayAt(point);
    } else {
      applyStrokeStyle();
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    }
  }
}

function onPointerMove(e) {
  if (!isDrawing || !startPoint) return;
  const point = getCanvasPoint(e);

  if (activeTool === "spray") {
    sprayAt(point);
    return;
  }

  if (FREEHAND_TOOLS.includes(activeTool)) {
    applyStrokeStyle();
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    resetCtxAlpha();
    return;
  }

  if (SHAPE_TOOLS.includes(activeTool)) {
    drawShapePreview(startPoint, point);
  }
}

function onPointerUp(e) {
  if (!isDrawing) return;
  const point = getCanvasPoint(e);

  if (SHAPE_TOOLS.includes(activeTool) && startPoint) {
    commitShape(startPoint, point);
    saveToStorage();
  } else if (FREEHAND_TOOLS.includes(activeTool)) {
    saveToStorage();
  }

  isDrawing = false;
  startPoint = null;
  snapshotImageData = null;
  resetCtxAlpha();

  try {
    els.board.releasePointerCapture(e.pointerId);
  } catch {
    /* already released */
  }
}

function setStrokeColor(hex) {
  strokeColor = hex;
  els.colorPicker.value = hex;
  updateSwatchActive(hex);
}

function setTool(tool) {
  if (!TOOLS.includes(tool)) return;
  activeTool = tool;

  els.toolButtons.forEach((btn) => {
    const isActive = btn.dataset.tool === tool;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });

  els.board.className = "";
  if (["eraser", "fill", "eyedropper", "text", "spray"].includes(tool)) {
    els.board.classList.add(`tool-${tool}`);
  }

  els.fillColorWrap.hidden = !(tool === "fill" || FILL_SHAPES.includes(tool));
  els.shapeFillToggle.hidden = !FILL_SHAPES.includes(tool);
}

function clearCanvas() {
  if (!confirm("Clear the entire canvas?")) return;
  pushUndo();
  fillBackground();
  localStorage.removeItem(STORAGE_KEY);
  showToast("Canvas cleared");
}

function downloadPng() {
  const link = document.createElement("a");
  link.download = `drawing-${Date.now()}.png`;
  link.href = els.board.toDataURL("image/png");
  link.click();
  showToast("Saved as PNG");
}

async function copyToClipboard() {
  try {
    const blob = await new Promise((resolve) =>
      els.board.toBlob(resolve, "image/png"),
    );
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    showToast("Copied to clipboard");
  } catch {
    showToast("Copy failed — try Save PNG");
  }
}

function importImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      pushUndo();
      const maxW = els.board.width * 0.85;
      const maxH = els.board.height * 0.85;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (els.board.width - w) / 2;
      const y = (els.board.height - h) / 2;
      ctx.drawImage(img, x, y, w, h);
      saveToStorage();
      showToast("Image imported");
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, els.board.toDataURL("image/png"));
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        strokeColor,
        fillColor,
        canvasBgColor,
        brushSize,
        strokeOpacity: strokeOpacity * 100,
        shapeFillEnabled,
      }),
    );
  } catch {
    /* quota exceeded */
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.strokeColor) setStrokeColor(s.strokeColor);
    if (s.fillColor) {
      fillColor = s.fillColor;
      els.fillColorPicker.value = s.fillColor;
    }
    if (s.canvasBgColor) {
      canvasBgColor = s.canvasBgColor;
      els.bgColorPicker.value = s.canvasBgColor;
    }
    if (s.brushSize) {
      brushSize = s.brushSize;
      els.brushSize.value = s.brushSize;
      els.sizeValue.textContent = String(s.brushSize);
    }
    if (s.strokeOpacity != null) {
      els.strokeOpacity.value = s.strokeOpacity;
      strokeOpacity = s.strokeOpacity / 100;
      els.opacityValue.textContent = String(s.strokeOpacity);
    }
    if (s.shapeFillEnabled != null) {
      shapeFillEnabled = s.shapeFillEnabled;
      els.shapeFill.checked = s.shapeFillEnabled;
    }
  } catch {
    /* ignore */
  }
}

function loadFromStorage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  restoreFromDataUrl(saved);
}

function initSwatches() {
  SWATCH_COLORS.forEach((color) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch";
    btn.style.background = color;
    btn.title = color;
    btn.setAttribute("aria-label", `Color ${color}`);
    btn.addEventListener("click", () => setStrokeColor(color));
    els.swatches.appendChild(btn);
  });
  updateSwatchActive(strokeColor);
}

function updateSwatchActive(hex) {
  els.swatches.querySelectorAll(".swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.title.toLowerCase() === hex.toLowerCase());
  });
}

const KEY_TOOL_MAP = {
  p: "pen",
  h: "highlighter",
  s: "spray",
  e: "eraser",
  l: "line",
  a: "arrow",
  r: "rect",
  c: "circle",
  t: "triangle",
  f: "fill",
  i: "eyedropper",
  x: "text",
};

els.toolButtons.forEach((btn) => {
  btn.addEventListener("click", () => setTool(btn.dataset.tool));
});

els.colorPicker.addEventListener("input", (e) => setStrokeColor(e.target.value));

els.fillColorPicker.addEventListener("input", (e) => {
  fillColor = e.target.value;
});

els.bgColorPicker.addEventListener("input", (e) => {
  canvasBgColor = e.target.value;
});

els.brushSize.addEventListener("input", (e) => {
  brushSize = Number(e.target.value);
  els.sizeValue.textContent = String(brushSize);
});

els.strokeOpacity.addEventListener("input", (e) => {
  strokeOpacity = Number(e.target.value) / 100;
  els.opacityValue.textContent = e.target.value;
});

els.shapeFill.addEventListener("change", (e) => {
  shapeFillEnabled = e.target.checked;
});

els.undo.addEventListener("click", undo);
els.redo.addEventListener("click", redo);
els.clear.addEventListener("click", clearCanvas);
els.download.addEventListener("click", downloadPng);
els.copyBtn.addEventListener("click", copyToClipboard);
els.importBtn.addEventListener("click", () => els.importFile.click());
els.importFile.addEventListener("change", (e) => {
  importImage(e.target.files[0]);
  e.target.value = "";
});

els.board.addEventListener("pointerdown", onPointerDown);
els.board.addEventListener("pointermove", onPointerMove);
els.board.addEventListener("pointerup", onPointerUp);
els.board.addEventListener("pointercancel", onPointerUp);
els.board.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea")) return;

  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
    e.preventDefault();
    redo();
    return;
  }

  const tool = KEY_TOOL_MAP[e.key.toLowerCase()];
  if (tool) setTool(tool);
});

window.addEventListener("resize", () => {
  const snapshot = els.board.toDataURL("image/png");
  resizeCanvas();
  restoreFromDataUrl(snapshot);
});

initSwatches();
loadSettings();
resizeCanvas();
loadFromStorage();
setTool("pen");
