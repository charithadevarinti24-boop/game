const MODES = {
  focus: { label: "Time to focus", title: "Focus" },
  short: { label: "Short break", title: "Short break" },
  long: { label: "Long break", title: "Long break" },
};

const RING_CIRCUMFERENCE = 2 * Math.PI * 54;
const STORAGE_KEY = "pomodoroSettings";
const SESSION_KEY = "pomodoroSessions";

const els = {
  body: document.body,
  timer: document.getElementById("timer"),
  ringProgress: document.getElementById("ringProgress"),
  modeLabel: document.getElementById("modeLabel"),
  sessionCount: document.getElementById("sessionCount"),
  startPause: document.getElementById("startPause"),
  startPauseLabel: document.getElementById("startPauseLabel"),
  reset: document.getElementById("reset"),
  skip: document.getElementById("skip"),
  modeTabs: document.querySelectorAll(".mode-tab"),
  settingsToggle: document.getElementById("settingsToggle"),
  settingsPanel: document.getElementById("settingsPanel"),
  focusMinutes: document.getElementById("focusMinutes"),
  shortMinutes: document.getElementById("shortMinutes"),
  longMinutes: document.getElementById("longMinutes"),
  autoStart: document.getElementById("autoStart"),
  soundEnabled: document.getElementById("soundEnabled"),
  saveSettings: document.getElementById("saveSettings"),
  toast: document.getElementById("toast"),
};

let interval = null;
let mode = "focus";
let timeLeft = 0;
let totalTime = 0;
let isRunning = false;
let focusCount = 0;
let toastTimeout = null;

const defaultSettings = {
  focus: 25,
  short: 5,
  long: 15,
  autoStart: false,
  sound: true,
};

let settings = { ...defaultSettings };

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) settings = { ...defaultSettings, ...saved };
  } catch {
    settings = { ...defaultSettings };
  }
  els.focusMinutes.value = settings.focus;
  els.shortMinutes.value = settings.short;
  els.longMinutes.value = settings.long;
  els.autoStart.checked = settings.autoStart;
  els.soundEnabled.checked = settings.sound;
}

function saveSettingsToStorage() {
  settings = {
    focus: clampMinutes(els.focusMinutes.value, 25),
    short: clampMinutes(els.shortMinutes.value, 5),
    long: clampMinutes(els.longMinutes.value, 15),
    autoStart: els.autoStart.checked,
    sound: els.soundEnabled.checked,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  if (!isRunning) resetTimer();
  showToast("Settings saved");
}

function clampMinutes(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 1 && n <= 120 ? n : fallback;
}

function loadSessions() {
  try {
    const data = JSON.parse(localStorage.getItem(SESSION_KEY));
    const today = new Date().toDateString();
    if (data?.date === today) {
      focusCount = data.count ?? 0;
    } else {
      focusCount = 0;
    }
  } catch {
    focusCount = 0;
  }
  updateSessionDisplay();
}

function saveSessions() {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ date: new Date().toDateString(), count: focusCount })
  );
  updateSessionDisplay();
}

function updateSessionDisplay() {
  els.sessionCount.textContent = String(focusCount);
}

function getDurationSeconds(m) {
  const key = m === "focus" ? "focus" : m === "short" ? "short" : "long";
  return settings[key] * 60;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateRing() {
  const progress = totalTime > 0 ? timeLeft / totalTime : 0;
  const offset = RING_CIRCUMFERENCE * (1 - progress);
  els.ringProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);
  els.ringProgress.style.strokeDashoffset = String(offset);
}

function updateDisplay() {
  els.timer.textContent = formatTime(timeLeft);
  updateRing();
  document.title = isRunning
    ? `${formatTime(timeLeft)} — ${MODES[mode].title}`
    : `Pomodoro — ${MODES[mode].title}`;
}

function setMode(newMode) {
  if (newMode === mode && !isRunning) return;
  stopInterval();
  mode = newMode;
  els.body.dataset.mode = mode;
  els.modeLabel.textContent = MODES[mode].label;
  totalTime = getDurationSeconds(mode);
  timeLeft = totalTime;
  isRunning = false;
  updateStartPauseUI();
  els.modeTabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active);
  });
  updateDisplay();
}

function resetTimer() {
  stopInterval();
  totalTime = getDurationSeconds(mode);
  timeLeft = totalTime;
  isRunning = false;
  updateStartPauseUI();
  updateDisplay();
}

function stopInterval() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

function startInterval() {
  stopInterval();
  interval = setInterval(tick, 1000);
}

function tick() {
  if (timeLeft <= 0) return;
  timeLeft--;
  updateDisplay();
  if (timeLeft === 0) onTimerComplete();
}

function toggleStartPause() {
  if (isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  if (timeLeft <= 0) {
    totalTime = getDurationSeconds(mode);
    timeLeft = totalTime;
  }
  isRunning = true;
  updateStartPauseUI();
  startInterval();
}

function pauseTimer() {
  isRunning = false;
  stopInterval();
  updateStartPauseUI();
  updateDisplay();
}

function updateStartPauseUI() {
  els.startPause.classList.toggle("running", isRunning);
  els.startPauseLabel.textContent = isRunning ? "Pause" : "Start";
}

function playChime() {
  if (!settings.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playTone = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.15, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    playTone(523.25, 0, 0.15);
    playTone(659.25, 0.18, 0.2);
    playTone(783.99, 0.38, 0.35);
  } catch {
    /* audio unavailable */
  }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => els.toast.classList.remove("show"), 3200);
}

function getNextModeAfterComplete() {
  if (mode === "focus") {
    const nextIsLong = (focusCount + 1) % 4 === 0;
    return nextIsLong ? "long" : "short";
  }
  return "focus";
}

function getCompleteMessage() {
  if (mode === "focus") return "Focus session complete! Take a break.";
  if (mode === "short") return "Break over. Ready to focus?";
  return "Long break done. Back to work!";
}

function onTimerComplete() {
  stopInterval();
  isRunning = false;
  updateStartPauseUI();
  playChime();

  if (mode === "focus") {
    focusCount++;
    saveSessions();
  }

  const message = getCompleteMessage();
  showToast(message);

  const nextMode = getNextModeAfterComplete();
  if (settings.autoStart) {
    setMode(nextMode);
    startTimer();
  } else {
    setMode(nextMode);
  }
}

function skipPhase() {
  stopInterval();
  isRunning = false;
  updateStartPauseUI();
  const next = mode === "focus" ? getNextModeAfterComplete() : "focus";
  setMode(next);
  showToast(`Skipped to ${MODES[next].label.toLowerCase()}`);
}

function toggleSettings() {
  const open = els.settingsPanel.hidden;
  els.settingsPanel.hidden = !open;
  els.settingsToggle.setAttribute("aria-expanded", String(open));
}

els.modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    if (isRunning) pauseTimer();
    setMode(tab.dataset.mode);
  });
});

els.startPause.addEventListener("click", toggleStartPause);
els.reset.addEventListener("click", resetTimer);
els.skip.addEventListener("click", skipPhase);
els.settingsToggle.addEventListener("click", toggleSettings);
els.saveSettings.addEventListener("click", saveSettingsToStorage);

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input")) return;
  if (e.code === "Space") {
    e.preventDefault();
    toggleStartPause();
  } else if (e.key === "r" || e.key === "R") {
    resetTimer();
  }
});

loadSettings();
loadSessions();
setMode("focus");
