// --- Telegram WebApp integration ---
const tg = window.Telegram?.WebApp;

function applyTelegramTheme() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  const p = tg.themeParams || {};

  // базовые цвета Telegram (с фолбэками)
  const bg = p.bg_color || "#000000";
  const text = p.text_color || "#ffffff";
  const hint = p.hint_color || "#9ca3af";
  const link = p.link_color || "#60a5fa";
  const btn = p.button_color || link || "#2563eb";
  const btnText = p.button_text_color || "#ffffff";

  // helpers
  const hexToRgb = (hex) => {
    const h = String(hex).replace("#", "").trim();
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  const luminance = (c) => {
    const toLin = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const r = toLin(c.r), g = toLin(c.g), b = toLin(c.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  const mix = (a, b, t) => {
    // a,b: {r,g,b}, t 0..1
    t = clamp01(t);
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t),
    };
  };

  const rgbToCss = (c, alpha = 1) => {
    alpha = clamp01(alpha);
    return `rgba(${c.r},${c.g},${c.b},${alpha})`;
  };

  // определяем "тёмная ли тема" по яркости фона
  let isDark = true;
  let bgRgb = { r: 0, g: 0, b: 0 };

  try {
    bgRgb = hexToRgb(bg);
    const bgLum = luminance(bgRgb);
    isDark = bgLum < 0.35;
  } catch (e) {
    isDark = true;
  }

  // безопасные текстовые цвета (если Telegram отдал странные значения)
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

  // прокидываем основные переменные
  document.documentElement.style.setProperty("--bg", bg);
  document.documentElement.style.setProperty("--text", safeText);
  document.documentElement.style.setProperty("--muted", safeMuted);
  document.documentElement.style.setProperty("--accent", link);
  document.documentElement.style.setProperty("--button", btn);
  document.documentElement.style.setProperty("--buttonText", btnText);

  // -------- segmented (чтобы disabled не сливался) --------
  // идея: в dark theme делаем подложку сегмента темнее,
  // а текст — светлым; disabled — приглушённым.
  // В light theme оставляем как раньше.

  if (isDark) {
    // подложка: светлый "туман" на тёмном фоне
    document.documentElement.style.setProperty("--segBg", "rgba(255,255,255,0.10)");
    document.documentElement.style.setProperty("--segText", "rgba(255,255,255,0.92)");
    document.documentElement.style.setProperty("--segDisabledText", "rgba(255,255,255,0.55)");
  } else {
    document.documentElement.style.setProperty("--segBg", "#f1f5f9");
    document.documentElement.style.setProperty("--segText", "#334155");
    document.documentElement.style.setProperty("--segDisabledText", "rgba(51,65,85,0.45)");
  }
}




function initTelegram() {
  if (!tg) return;

  tg.ready();      // говорим Telegram “мы готовы”
  tg.expand();     // попросим развернуть на максимум по высоте
  applyTelegramTheme();

  // реагируем на смену темы
  tg.onEvent?.("themeChanged", applyTelegramTheme);

  // (опционально) чуть приятнее поведение на мобилках
  document.body.style.webkitTapHighlightColor = "transparent";
}

initTelegram();
// --- /Telegram WebApp integration ---
function haptic(type = "soft") {
  const tg = window.Telegram?.WebApp;
  tg?.HapticFeedback?.impactOccurred?.(type);
}

console.log("app.js loaded ✅");

const must = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element with id="${id}"`);
  return el;
};

// 4 фазы квадрата, бесконечно
const SQUARE_FLOW = [
  { key: "inhale", label: "Вдох", seconds: 4, side: 1 },
  { key: "hold1",  label: "Задержка", seconds: 4, side: 2 },
  { key: "exhale", label: "Выдох", seconds: 4, side: 3 },
  { key: "hold2",  label: "Задержка", seconds: 4, side: 4 },
];

// UI
const elCountdown = must("countdown");
const elSquareCard = must("squareCard");
const elPhaseTitle = must("phaseTitle");
const elPhaseSeconds = must("phaseSeconds");

const restartBtn = must("restartBtn");
const pauseBtn = must("pauseBtn");

// bars
const barLeft = must("barLeft");
const barTop = must("barTop");
const barRight = must("barRight");
const barBottom = must("barBottom");

// state
let mode = "countdown"; // "countdown" | "breathing"
let countdownLeft = 3;

let stepIndex = 0;
let secondsLeft = SQUARE_FLOW[0].seconds;

let timerId = null; // 1s tick
let rafId = null;   // smooth progress tick

let paused = false;

// rAF timing for progress
let stepStartedAt = 0; // performance.now() when current phase began
let pausedAt = 0;      // performance.now() when pause pressed
let pausedTotal = 0;   // ms paused within current phase

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

function hideAllBars() {
  for (const b of [barLeft, barTop, barRight, barBottom]) {
    b.style.opacity = "0";
  }
}

function setSideProgress(side, t) {
  // t: 0..1
  t = Math.max(0, Math.min(1, t));
  hideAllBars();

  if (side === 1) {
    // left side: bottom -> top
    barLeft.style.opacity = "1";
    barLeft.style.transform = `scaleY(${t})`;
  } else if (side === 2) {
    // top side: left -> right
    barTop.style.opacity = "1";
    barTop.style.transform = `scaleX(${t})`;
  } else if (side === 3) {
    // right side: top -> bottom
    barRight.style.opacity = "1";
    barRight.style.transform = `scaleY(${t})`;
  } else if (side === 4) {
    // bottom side: right -> left
    barBottom.style.opacity = "1";
    barBottom.style.transform = `scaleX(${t})`;
  }
}

function startRaf() {
  stopRaf();

  const tick = (now) => {
    if (mode !== "breathing") {
      hideAllBars();
      stopRaf();
      return;
    }

    const step = SQUARE_FLOW[stepIndex];
    const duration = step.seconds * 1000;

    if (!paused) {
      const elapsed = now - stepStartedAt - pausedTotal;
      const t = elapsed / duration;
      setSideProgress(step.side, t);
    }

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
}

function render() {
  if (mode === "countdown") {
    elCountdown.hidden = false;
    elSquareCard.hidden = true;

    elCountdown.textContent = String(countdownLeft);
    pauseBtn.textContent = "Пауза";

    paused = false;
    return;
  }

  // breathing
  elCountdown.hidden = true;
  elSquareCard.hidden = false;

  const step = SQUARE_FLOW[stepIndex];
  elPhaseTitle.textContent = step.label;
  elPhaseSeconds.textContent = String(secondsLeft);

  pauseBtn.textContent = paused ? "Продолжить" : "Пауза";
}

function startCountdown() {
  mode = "countdown";
  countdownLeft = 3;

  clearTimer();
  stopRaf();
  hideAllBars();

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
  startRaf();

  timerId = setInterval(() => {
    if (mode !== "breathing") return;
    if (paused) return;

    secondsLeft -= 1;

    if (secondsLeft <= 0) {
      stepIndex = (stepIndex + 1) % SQUARE_FLOW.length;
      secondsLeft = SQUARE_FLOW[stepIndex].seconds;

      haptic("soft");


      // reset smooth progress timer for the new phase
      stepStartedAt = performance.now();
      pausedTotal = 0;
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

// автостарт при открытии
startCountdown();
