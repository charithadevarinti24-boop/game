const STORAGE_KEY = "drawingCanvasSnapshot";
const MAX_UNDO = 40;
const FILL_TOLERANCE = 32;

const TOOLS = ["pen", "eraser", "line", "rect", "circle", "fill"];
const SHAPE_TOOLS = ["line", "rect", "circle"];
const FREEHAND_TOOLS = ["pen", "eraser"];

const els = {
  board: document.getElementById("board"),
  colorPicker: document.getElementById("colorPicker"),
  fillColorPicker: document.getElementById("fillColorPicker"),
  fillColorWrap: document.getElementById("fillColorWrap"),
  brushSize: document.getElementById("brushSize"),
  sizeValue: document.getElementById("sizeValue"),
  toolButtons: document.querySelectorAll(".tool[data-tool]"),
  undo: document.getElementById("undo"),
  clear: document.getElementById("clear"),
  download: document.getElementById("download"),
  toast: document.getElementById("toast"),
};

const ctx = els.board.getContext("2d", { willReadFrequently: true });

let activeTool = "pen";
let strokeColor = els.colorPicker.value;
let fillColor = els.fillColorPicker.value;
let brushSize = Number(els.brushSize.value);
let isDrawing = false;
let startPoint = null;
let snapshotImageData = null;
let undoStack = [];
let toastTimeout = null;

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => els.toast.classList.remove("visible"), 2200);
}

function resizeCanvas() {
  const wrap = els.board.parentElement;
  const width = Math.min(wrap.clientWidth, 1068);
  const height = Math.max(320, Math.min(Math.round(width * 0.62), 560));

  const image = ctx.getImageData(0, 0, els.board.width, els.board.height);
  const hadContent = els.board.width > 0 && els.board.height > 0;

  els.board.width = width;
  els.board.height = height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (hadContent && image.width && image.height) {
    ctx.putImageData(image, 0, 0);
  }
}

function pushUndo() {
  if (!els.board.width) return;
  undoStack.push(els.board.toDataURL("image/png"));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  els.undo.disabled = false;
}

function restoreFromDataUrl(dataUrl) {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, els.board.width, els.board.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, els.board.width, els.board.height);
    ctx.drawImage(img, 0, 0, els.board.width, els.board.height);
  };
  img.src = dataUrl;
}

function undo() {
  if (!undoStack.length) return;
  const previous = undoStack.pop();
  restoreFromDataUrl(previous);
  els.undo.disabled = undoStack.length === 0;
  showToast("Undone");
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

function applyStrokeStyle() {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = brushSize;

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

function drawShapePreview(from, to) {
  if (!snapshotImageData) return;
  ctx.putImageData(snapshotImageData, 0, 0);

  applyStrokeStyle();
  ctx.beginPath();

  if (activeTool === "line") {
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    return;
  }

  if (activeTool === "rect") {
    ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
    if (els.fillColorWrap.hidden === false) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = fillColor;
      ctx.fillRect(from.x, from.y, to.x - from.x, to.y - from.y);
      ctx.restore();
    }
    return;
  }

  if (activeTool === "circle") {
    const radius = Math.hypot(to.x - from.x, to.y - from.y);
    ctx.arc(from.x, from.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (els.fillColorWrap.hidden === false) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.restore();
    }
  }
}

function commitShape(from, to) {
  drawShapePreview(from, to);
  snapshotImageData = null;
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

  isDrawing = true;
  startPoint = point;
  pushUndo();

  if (SHAPE_TOOLS.includes(activeTool)) {
    snapshotImageData = ctx.getImageData(0, 0, els.board.width, els.board.height);
  }

  if (FREEHAND_TOOLS.includes(activeTool)) {
    applyStrokeStyle();
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }
}

function onPointerMove(e) {
  if (!isDrawing || !startPoint) return;
  const point = getCanvasPoint(e);

  if (FREEHAND_TOOLS.includes(activeTool)) {
    applyStrokeStyle();
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
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

  try {
    els.board.releasePointerCapture(e.pointerId);
  } catch {
    /* already released */
  }
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
  if (tool === "eraser") els.board.classList.add("tool-eraser");
  if (tool === "fill") els.board.classList.add("tool-fill");

  const showFillOption = tool === "rect" || tool === "circle";
  els.fillColorWrap.hidden = !showFillOption;
}

function clearCanvas() {
  if (!confirm("Clear the entire canvas?")) return;
  pushUndo();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, els.board.width, els.board.height);
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

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, els.board.toDataURL("image/png"));
  } catch {
    /* quota exceeded */
  }
}

function loadFromStorage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  restoreFromDataUrl(saved);
}

const KEY_TOOL_MAP = {
  p: "pen",
  e: "eraser",
  l: "line",
  r: "rect",
  c: "circle",
  f: "fill",
};

els.toolButtons.forEach((btn) => {
  btn.addEventListener("click", () => setTool(btn.dataset.tool));
});

els.colorPicker.addEventListener("input", (e) => {
  strokeColor = e.target.value;
});

els.fillColorPicker.addEventListener("input", (e) => {
  fillColor = e.target.value;
});

els.brushSize.addEventListener("input", (e) => {
  brushSize = Number(e.target.value);
  els.sizeValue.textContent = String(brushSize);
});

els.undo.addEventListener("click", undo);
els.clear.addEventListener("click", clearCanvas);
els.download.addEventListener("click", downloadPng);

els.board.addEventListener("pointerdown", onPointerDown);
els.board.addEventListener("pointermove", onPointerMove);
els.board.addEventListener("pointerup", onPointerUp);
els.board.addEventListener("pointercancel", onPointerUp);
els.board.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input")) return;

  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    undo();
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

resizeCanvas();
loadFromStorage();
setTool("pen");
