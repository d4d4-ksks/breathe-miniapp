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
  } catch {
    isDark = false;
  }

  // Safe text/hint
  let safeText = text;
  let safeMuted = hint;
  try {
    const textLum = luminance(hexToRgb(text));
    const hintLum = luminance(hexToRgb(hint));
    if (isDark && textLum < 0.55) safeText = "#ffffff";
    if (isDark && hintLum < 0.45) safeMuted = "rgba(255,255,255,0.7)";
  } catch {
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

  // segmented colors
  document.documentElement.style.setProperty("--segBg", isDark ? "rgba(255,255,255,0.10)" : "#f1f5f9");
  document.documentElement.style.setProperty("--segText", isDark ? "rgba(255,255,255,0.92)" : "#334155");
  document.documentElement.style.setProperty("--segDisabledText", isDark ? "rgba(255,255,255,0.55)" : "rgba(51,65,85,0.45)");

  // square/circle base stroke
  document.documentElement.style.setProperty("--square-bg", isDark ? "rgba(255,255,255,0.25)" : "rgba(15,23,42,0.12)");

  // seconds inside figure
  document.documentElement.style.setProperty("--counter", isDark ? "rgba(255,255,255,0.65)" : "rgba(15,23,42,0.55)");
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

// --- UI ---
const elCountdown = must("countdown");
const elSquareCard = must("squareCard");
const elPhaseTitle = must("phaseTitle");
const elPhaseSeconds = must("phaseSeconds");
const restartBtn = must("restartBtn");
const pauseBtn = must("pauseBtn");

const tabSquare = must("tabSquare");
const tab478 = must("tab478");

const subSquare = must("subSquare");
const sub478 = must("sub478");

// Phase container (for text animations)
const phaseBox = document.querySelector(".phase.phase-inSquare");

// Figures (SVG progress)
const squareProgress = must("squareProgress");
const circleProgress = must("circleProgress");

// --- Patterns ---
const PATTERNS = {
  square: {
    key: "square",
    flow: [
      { key: "inhale", label: "Вдох", seconds: 4 },
      { key: "hold1", label: "Задержка", seconds: 4 },
      { key: "exhale", label: "Выдох", seconds: 4 },
      { key: "hold2", label: "Задержка", seconds: 4 },
    ],
  },
  "478": {
    key: "478",
    flow: [
      { key: "inhale", label: "Вдох", seconds: 4 },
      { key: "hold", label: "Задержка", seconds: 7 },
      { key: "exhale", label: "Выдох", seconds: 8 },
    ],
  },
};

let patternKey = "square";
let FLOW = PATTERNS[patternKey].flow;

// --- Progress math ---
let squareTotalLen = 0;
let squareSegmentLen = 0;

let circleTotalLen = 0;
let circleSegmentLens = []; // recalculated when flow changes

function initSquareProgress() {
  squareTotalLen = squareProgress.getTotalLength();
  squareSegmentLen = squareTotalLen / 4;
  squareProgress.style.strokeDasharray = String(squareTotalLen);
  squareProgress.style.strokeDashoffset = String(squareTotalLen);
}

function initCircleProgress() {
  const r = parseFloat(circleProgress.getAttribute("r") || "0");
  circleTotalLen = 2 * Math.PI * r;

  circleProgress.style.strokeDasharray = String(circleTotalLen);
  circleProgress.style.strokeDashoffset = String(circleTotalLen);
}


initSquareProgress();
initCircleProgress();

function resetProgressNow() {
  squareProgress.style.strokeDashoffset = String(squareTotalLen);
  circleProgress.style.strokeDashoffset = String(circleTotalLen);
}

function setSquareCumulative(stepIndex, t01) {
  const t = Math.max(0, Math.min(1, t01));
  const len = squareSegmentLen * (stepIndex + t);
  const L = Math.max(0, Math.min(squareTotalLen, len));
  squareProgress.style.strokeDashoffset = String(squareTotalLen - L);
}

function ensureCircleSegmentLens() {
  const totalDur = FLOW.reduce((acc, s) => acc + s.seconds, 0);
  circleSegmentLens = FLOW.map((s) => (circleTotalLen * s.seconds) / totalDur);
}

function setCircleCumulative(stepIndex, t01) {
  const t = Math.max(0, Math.min(1, t01));
  if (circleSegmentLens.length !== FLOW.length) ensureCircleSegmentLens();

  let base = 0;
  for (let i = 0; i < stepIndex; i++) base += circleSegmentLens[i];

  const len = base + circleSegmentLens[stepIndex] * t;
  const L = Math.max(0, Math.min(circleTotalLen, len));
  circleProgress.style.strokeDashoffset = String(circleTotalLen - L);
}

function setCumulativeProgress(stepIndex, t01) {
  if (patternKey === "square") {
    setSquareCumulative(stepIndex, t01);
    // hide circle progress
    circleProgress.style.strokeDashoffset = String(circleTotalLen);
  } else {
    setCircleCumulative(stepIndex, t01);
    // hide square progress
    squareProgress.style.strokeDashoffset = String(squareTotalLen);
  }
}

function softResetProgress() {
  const el = patternKey === "square" ? squareProgress : circleProgress;
  el.classList.add("is-resetting");
  setTimeout(() => {
    resetProgressNow();
    el.classList.remove("is-resetting");
  }, 180);
}

// --- Text animations ---
function animatePhaseTextChange() {
  if (!phaseBox) {
    render();
    return;
  }
  phaseBox.classList.add("is-fading");
  setTimeout(() => {
    render();
    phaseBox.classList.remove("is-fading");
  }, 110);
}

function animateSecondTick() {
  elPhaseSeconds.classList.remove("is-ticking");
  void elPhaseSeconds.offsetWidth;
  elPhaseSeconds.classList.add("is-ticking");
}

// --- Circle breathing visual (4-7-8 only) ---
function updateCircleBreathVisual(stepKey) {
  if (patternKey !== "478") return;

  const circle = document.querySelector(".circleOnly");
  if (!circle) return;

  circle.classList.remove("circle-breath-in", "circle-breath-out");

  if (stepKey === "inhale") circle.classList.add("circle-breath-in");
  if (stepKey === "exhale") circle.classList.add("circle-breath-out");
  // hold: keep current scale (no change)
}

// --- State machine ---
let mode = "countdown"; // countdown | breathing
let countdownLeft = 3;

let stepIndex = 0;
let secondsLeft = FLOW[0].seconds;

let timerId = null; // 1s
let rafId = null;   // smooth progress
let paused = false;

let stepStartedAt = 0;
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
  // Tabs
  tabSquare.classList.toggle("active", patternKey === "square");
  tabSquare.setAttribute("aria-selected", patternKey === "square" ? "true" : "false");

  tab478.classList.toggle("active", patternKey === "478");
  tab478.setAttribute("aria-selected", patternKey === "478" ? "true" : "false");

  // Subtext
  subSquare.classList.toggle("active", patternKey === "square");
  sub478.classList.toggle("active", patternKey === "478");

  // Body mode for CSS (show square/circle)
  document.body.classList.toggle("mode-478", patternKey === "478");

  if (mode === "countdown") {
    elCountdown.hidden = false;
    elSquareCard.hidden = true;
    elCountdown.textContent = String(countdownLeft);
    pauseBtn.textContent = "Пауза";

    resetProgressNow();
    elPhaseSeconds.classList.remove("is-ticking");
    paused = false;
    return;
  }

  elCountdown.hidden = true;
  elSquareCard.hidden = false;

  const step = FLOW[stepIndex];
  elPhaseTitle.textContent = step.label;
  elPhaseSeconds.textContent = String(secondsLeft);
  pauseBtn.textContent = paused ? "Продолжить" : "Пауза";

  updateCircleBreathVisual(step.key);
}

function startRaf() {
  stopRaf();

  const tick = (now) => {
    if (mode !== "breathing") {
      resetProgressNow();
      stopRaf();
      return;
    }

    if (!paused) {
      const duration = FLOW[stepIndex].seconds * 1000;
      const elapsed = now - stepStartedAt - pausedTotal;
      const t = elapsed / duration;
      setCumulativeProgress(stepIndex, t);
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
  resetProgressNow();
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
  secondsLeft = FLOW[0].seconds;

  paused = false;
  pausedTotal = 0;
  stepStartedAt = performance.now();

  clearTimer();
  render();
  resetProgressNow();
  startRaf();
  animateSecondTick();

  timerId = setInterval(() => {
    if (mode !== "breathing") return;
    if (paused) return;

    secondsLeft -= 1;

    if (secondsLeft <= 0) {
      const prevIndex = stepIndex;

      stepIndex = (stepIndex + 1) % FLOW.length;
      secondsLeft = FLOW[stepIndex].seconds;

      haptic("soft");

      stepStartedAt = performance.now();
      pausedTotal = 0;

      if (prevIndex === FLOW.length - 1 && stepIndex === 0) {
        softResetProgress();
      }

      animatePhaseTextChange();
      return;
    }

    render();
    animateSecondTick();
  }, 1000);
}

function setPattern(nextKey) {
  if (nextKey === patternKey) return;

  patternKey = nextKey;
  FLOW = PATTERNS[patternKey].flow;

  // Recalc circle segments for new flow
  circleSegmentLens = [];
  if (patternKey === "478") ensureCircleSegmentLens();

  // Restart flow for clarity
  startCountdown();
}

// --- Events ---
tabSquare.addEventListener("click", () => setPattern("square"));
tab478.addEventListener("click", () => setPattern("478"));

pauseBtn.addEventListener("click", () => {
  if (mode !== "breathing") return;

  const now = performance.now();

  if (!paused) {
    paused = true;
    pausedAt = now;
    elPhaseSeconds.classList.remove("is-ticking");
  } else {
    paused = false;
    pausedTotal += (now - pausedAt);
    animateSecondTick();
  }

  render();
});

restartBtn.addEventListener("click", () => {
  startCountdown();
});

// auto start
startCountdown();
