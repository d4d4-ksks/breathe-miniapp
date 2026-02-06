console.log("app.js loaded ✅");

const must = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element with id="${id}"`);
  return el;
};

// --- Telegram WebApp integration ---
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

  // helpers for "isDark"
  const hexToRgb = (hex) => {
    const h = String(hex).replace("#", "").trim();
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  const luminance = ({ r, g, b }) => {
    const toLin = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const R = toLin(r), G = toLin(g), B = toLin(b);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  };

  let isDark = false;
  try {
    isDark = luminance(hexToRgb(bg)) < 0.35;
  } catch (e) {
    isDark = false;
  }

  // safe text/hint
  let safeText = text;
  let safeMuted = hint;
  try {
    const textLum = luminance(hexToRgb(text));
    const hintLum = luminance(hexToRgb(hint));
    if (isDark && textLum < 0.55) safeText = "#ffffff";
    if (isDark && hintLum < 0.45) safeMuted = "rgba(255,255,255,0.7)";
  } catch (e) {
    if (isDark) {
      safeText = "#ffffff";
      safeMuted = "rgba(255,255,255,0.7)";
    }
  }

  document.documentElement.style.setProperty("--bg", bg);
  document.documentElement.style.setProperty("--text", safeText);
  document.documentElement.style.setProperty("--muted", safeMuted);
  document.documentElement.style.setProperty("--accent", link);
  document.documentElement.style.setProperty("--button", btn);
  document.documentElement.style.setProperty("--buttonText", btnText);

  // segmented (чтобы disabled не сливался)
  document.documentElement.style.setProperty("--segBg", isDark ? "rgba(255,255,255,0.10)" : "#f1f5f9");
  document.documentElement.style.setProperty("--segText", isDark ? "rgba(255,255,255,0.92)" : "#334155");
  document.documentElement.style.setProperty("--segDisabledText", isDark ? "rgba(255,255,255,0.55)" : "rgba(51,65,85,0.45)");

  // фон квадрата
  document.documentElement.style.setProperty(
    "--square-bg",
    isDark ? "rgba(255,255,255,0.25)" : "rgba(15,23,42,0.12)"
  );

  // цифры секунд внутри квадрата
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

// SVG progress path (ВАЖНО: в HTML должен быть path/rect с id="squareProgress")
const squareProgress = must("squareProgress");

// SVG progress metrics
let totalLen = 0;
let segmentLen = 0;

function initSvgProgress() {
  totalLen = squareProgress.getTotalLength();
  segmentLen = totalLen / 4;

  // базово "ничего не рисуем"
  squareProgress.style.strokeDasharray = `0 ${totalLen}`;
  squareProgress.style.strokeDashoffset = "0";
}

initSvgProgress();

// Рисуем только 1 сторону (¼ контура) в рамках текущей фазы.
// stepIdx: 0..3, t01: 0..1
function setSideProgress(stepIdx, t01) {
  const t = Math.max(0, Math.min(1, t01));
  const visible = segmentLen * t;

  squareProgress.style.strokeDasharray = `${visible} ${totalLen}`;
  // отрицательный offset двигает "окно" дальше по контуру
  squareProgress.style.strokeDashoffset = String(-segmentLen * stepIdx);
}

// state
let mode = "countdown"; // "countdown" | "breathing"
let countdownLeft = 3;

let stepIndex = 0;
let secondsLeft = SQUARE_FLOW[0].seconds;

let timerId = null; // 1s tick
let rafId = null;   // smooth tick
let paused = false;

let stepStartedAt = 0; // performance.now()
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

function render() {
  if (mode === "countdown") {
    elCountdown.hidden = false;
    elSquareCard.hidden = true;
    elCountdown.textContent = String(countdownLeft);
    pauseBtn.textContent = "Пауза";

    // на отсчёте не рисуем прогресс
    setSideProgress(0, 0);

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
      setSideProgress(0, 0);
      stopRaf();
      return;
    }

    if (!paused) {
      const duration = SQUARE_FLOW[stepIndex].seconds * 1000;
      const elapsed = now - stepStartedAt - pausedTotal;
      const t = elapsed / duration; // 0..1
      setSideProgress(stepIndex, t);
    }

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
}

function startCountdown() {
  mode = "countdown";
  countdownLeft = 3;

  clearTimer();
  stopRaf();
  setSideProgress(0, 0);

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
  mode = "breathing";

  stepIndex = 0;
  secondsLeft = SQUARE_FLOW[0].seconds;

  paused = false;
  pausedTotal = 0;
  stepStartedAt = performance.now();

  clearTimer();
  render();
  setSideProgress(stepIndex, 0);
  startRaf();

  timerId = setInterval(() => {
    if (mode !== "breathing") return;
    if (paused) return;

    secondsLeft -= 1;

    if (secondsLeft <= 0) {
      stepIndex = (stepIndex + 1) % SQUARE_FLOW.length;
      secondsLeft = SQUARE_FLOW[stepIndex].seconds;

      haptic("soft");

      stepStartedAt = performance.now();
      pausedTotal = 0;

      setSideProgress(stepIndex, 0);
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

// auto start on open
startCountdown();
