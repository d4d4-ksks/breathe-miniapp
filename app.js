console.log("app.js loaded ✅");

const must = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element with id="${id}"`);
  return el;
};

// --- Telegram WebApp integration (если не в Telegram — просто пропустится) ---
const tg = window.Telegram?.WebApp;

function applyTelegramTheme() {
  if (!tg) return;

  const p = tg.themeParams || {};
  const bg = p.bg_color || "#ffffff";
  const text = p.text_color || "#0f172a";
  const hint = p.hint_color || "#64748b";
  const link = p.link_color || "#2563eb";
  const btn = p.button_color || link || "#2563eb";
  const btnText = p.button_text_color || "#ffffff";

  document.documentElement.style.setProperty("--bg", bg);
  document.documentElement.style.setProperty("--text", text);
  document.documentElement.style.setProperty("--muted", hint);
  document.documentElement.style.setProperty("--accent", link);
  document.documentElement.style.setProperty("--button", btn);
  document.documentElement.style.setProperty("--buttonText", btnText);

  // segmented (чтобы disabled не сливался)
  // определяем тёмный фон грубо по строке: если фон почти чёрный — считаем dark
  // (можно усложнять, но для UI достаточно)
  const isDark = typeof bg === "string" && bg.toLowerCase().startsWith("#")
    ? (() => {
        const h = bg.replace("#", "");
        const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
        const n = parseInt(full, 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        return lum < 0.35;
      })()
    : false;

  document.documentElement.style.setProperty("--segBg", isDark ? "rgba(255,255,255,0.10)" : "#f1f5f9");
  document.documentElement.style.setProperty("--segText", isDark ? "rgba(255,255,255,0.92)" : "#334155");
  document.documentElement.style.setProperty("--segDisabledText", isDark ? "rgba(255,255,255,0.55)" : "rgba(51,65,85,0.45)");
  // цвет цифр внутри квадрата (секунды)
document.documentElement.style.setProperty(
  "--counter",
  isDark ? "rgba(255,255,255,0.65)" : "rgba(15,23,42,0.55)"
);
}

function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  applyTelegramTheme();
  tg.onEvent?.("themeChanged", applyTelegramTheme);
  document.body.style.webkitTapHighlightColor = "transparent";
}

initTelegram();

// --- haptic ---
function haptic(type = "soft") {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type);
}

// --- breathing flow ---
const SQUARE_FLOW = [
  { key: "inhale", label: "Вдох", seconds: 4 },
  { key: "hold1",  label: "Задержка", seconds: 4 },
  { key: "exhale", label: "Выдох", seconds: 4 },
  { key: "hold2",  label: "Задержка", seconds: 4 },
];

// UI
const elCountdown = must("countdown");
const elSquareCard = must("squareCard");
const elPhaseTitle = must("phaseTitle");
const elPhaseSeconds = must("phaseSeconds");
const restartBtn = must("restartBtn");
const pauseBtn = must("pauseBtn");

// SVG progress element (обязательно должен быть в HTML)
const squareProgress = must("squareProgress");

let progressLen = 0; // длина контура

function initSvgProgress() {
  // для rect/path работает getTotalLength()
  progressLen = squareProgress.getTotalLength();
  squareProgress.style.strokeDasharray = String(progressLen);
  squareProgress.style.strokeDashoffset = String(progressLen); // 0% прогресса
}
initSvgProgress();

// state
let mode = "countdown"; // "countdown" | "breathing"
let countdownLeft = 3;

let stepIndex = 0;      // 0..3
let secondsLeft = SQUARE_FLOW[0].seconds;

let timerId = null;     // 1s ticks
let rafId = null;       // smooth ticks
let paused = false;

let stepStartedAt = 0;  // performance.now()
let pausedAt = 0;
let pausedTotal = 0;

function clearTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function stopRaf() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function setProgress01(p01) {
  // p01: 0..1
  const p = Math.max(0, Math.min(1, p01));
  const offset = progressLen * (1 - p);
  squareProgress.style.strokeDashoffset = String(offset);
}

function render() {
  if (mode === "countdown") {
    elCountdown.hidden = false;
    elSquareCard.hidden = true;
    elCountdown.textContent = String(countdownLeft);
    pauseBtn.textContent = "Пауза";

    // на отсчёте прячем прогресс
    setProgress01(0);
    paused = false;
    return;
  }

  elCountdown.hidden = true;
  elSquareCard.hidden = false;

  const step = SQUARE_FLOW[stepIndex];
  elPhaseTitle.textContent = step.label;
  elPhaseSeconds.textContent = String(secondsLeft);

  pauseBtn.textContent = paused ? "Продолжить" : "Пауза";
}

function startRaf() {
  stopRaf();

  const tick = (now) => {
    if (mode !== "breathing") {
      setProgress01(0);
      stopRaf();
      return;
    }

    const step = SQUARE_FLOW[stepIndex];
    const duration = step.seconds * 1000;

    if (!paused) {
      const elapsed = now - stepStartedAt - pausedTotal;
      const t = elapsed / duration; // 0..1 в рамках текущей фазы

      // общий прогресс по квадрату: (фаза + прогресс в фазе) / 4
      // 0..1, потом по кругу (мы сбрасываем на 0 при новом цикле)
      const total = (stepIndex + Math.max(0, Math.min(1, t))) / SQUARE_FLOW.length;
      setProgress01(total);
    }

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
}

function startCountdown() {
  document.body.classList.remove("is-breathing");
  mode = "countdown";
  countdownLeft = 3;

  clearTimer();
  stopRaf();
  setProgress01(0);
  render();

  timerId = setInterval(() => {
    countdownLeft -= 1;

    if (countdownLeft <= 0) {
      startBreathing();
      return;
    }
    render();
  }, 1000);
}

function startBreathing() {
  document.body.classList.add("is-breathing");
  mode = "breathing";

  stepIndex = 0;
  secondsLeft = SQUARE_FLOW[0].seconds;

  paused = false;
  pausedTotal = 0;
  stepStartedAt = performance.now();

  clearTimer();
  render();
  startRaf();

  timerId = setInterval(() => {
    if (mode !== "breathing") return;
    if (paused) return;

    secondsLeft -= 1;

    if (secondsLeft <= 0) {
      // переход на следующую фазу
      stepIndex = (stepIndex + 1) % SQUARE_FLOW.length;
      secondsLeft = SQUARE_FLOW[stepIndex].seconds;

      haptic("soft");

      // новый старт для плавного прогресса
      stepStartedAt = performance.now();
      pausedTotal = 0;

      // если начался новый цикл — сбросить контур на 0
      if (stepIndex === 0) setProgress01(0);
    }

    render();
  }, 1000);
}

pauseBtn.addEventListener("click", () => {
  if (mode !== "breathing") return;

  const now = performance.now();
  if (!paused) {
    paused = true;
    pausedAt = now;
  } else {
    paused = false;
    pausedTotal += (now - pausedAt);
  }
  render();
});

restartBtn.addEventListener("click", () => {
  startCountdown();
});

// автостарт
startCountdown();
