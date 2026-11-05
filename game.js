"use strict";

// ============================================================
// GEOMETRY DASH — Complete Canvas Game
// ============================================================

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

// -------------------- Screen --------------------
let W, H, groundY;
const GROUND_RATIO = 0.78;
const CEIL_Y = 40;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  groundY = Math.floor(H * GROUND_RATIO);
}
resize();
window.addEventListener("resize", resize);

// -------------------- Constants --------------------
const PS = 38; // player size
const GRAVITY = 0.95;
const JUMP_VEL = -13;
const SHIP_GRAV = 0.42;
const SHIP_FLY = -0.92;
const BASE_SPEED = 6.2;
const SPEEDS = { slow: 4.2, normal: 6.2, fast: 9, veryfast: 11.5 };
const PAD_JUMP = -17.5;
const ORB_JUMP = -14;
const SPIKE_W = 36;
const SPIKE_H = 30;
const COL_SHRINK = 8; // collision forgiveness pixels
const FRAME_MS = 1000 / 60;

let simTime = 0;
let useSimTime = false;
function now() {
  return useSimTime
    ? simTime
    : (typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now());
}

// -------------------- State --------------------
let gameState = "menu"; // menu | playing | paused | dead | complete
let menuScreen = "main"; // main | levels
let menuSel = 0;
let practiceMode = false;
let muted = false;

let currentLevelIdx = 0;
let levelData = null;
let attemptNum = 0;
let deathNum = 0;
let levelTimer = 0;
let levelFinishTime = 0;
let cameraX = 0;

let particles = [];
let checkpoints = [];
let lastCpX = 0;

// Attempt flash
let attemptFlashAlpha = 0;
let attemptFlashText = "";

// Background
let bgPulse = 0;

// Screen shake
let shakeX = 0, shakeY = 0, shakeIntensity = 0;

// Player trail
let trail = [];

// -------------------- Persistence --------------------
let bestProg = {};
let totalAttempts = {};
try {
  const s = JSON.parse(localStorage.getItem("gd_save2") || "{}");
  bestProg = s.bp || {};
  totalAttempts = s.ta || {};
} catch (e) {}
function save() {
  try {
    localStorage.setItem(
      "gd_save2",
      JSON.stringify({ bp: bestProg, ta: totalAttempts })
    );
  } catch (e) {}
}

// -------------------- Player --------------------
const P = {
  x: 0,
  y: 0,
  vy: 0,
  rot: 0,
  tgtRot: 0,
  grounded: false,
  isShip: false,
  speed: BASE_SPEED,
  dead: false,
  done: false,
};

function resetPlayer(fromCp) {
  if (fromCp && practiceMode && checkpoints.length) {
    P.x = checkpoints[checkpoints.length - 1];
  } else {
    P.x = 250;
    checkpoints = [];
    lastCpX = 0;
  }
  P.y = groundY - PS;
  P.vy = 0;
  P.rot = 0;
  P.tgtRot = 0;
  P.grounded = true;
  P.isShip = false;
  P.speed = BASE_SPEED;
  P.dead = false;
  P.done = false;
  trail = [];
  cameraX = P.x - 250;
  _inputWasDown = inputHeld;
  inputJustDown = false;
  if (levelData) {
    for (const o of levelData.obs) {
      o._hit = false;
    }
  }
}

// -------------------- Input --------------------
let inputHeld = false;
let inputJustDown = false;
let _inputWasDown = false;

function iDown(e) {
  if (e) e.preventDefault();
  inputHeld = true;
}
function iUp(e) {
  if (e) e.preventDefault();
  inputHeld = false;
}

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const c = e.code;
  if (c === "Space" || c === "ArrowUp" || c === "KeyW") iDown(e);
  if (c === "KeyF") {
    toggleFullscreen();
    return;
  }

  if (c === "Escape") {
    if (gameState === "playing" || gameState === "paused") {
      goToMenu();
      return;
    }
  }
  if (c === "KeyP") {
    if (gameState === "playing") gameState = "paused";
    else if (gameState === "paused") gameState = "playing";
  }
  if (c === "KeyM") muted = !muted;

  if (gameState === "menu") {
    const max = menuScreen === "main" ? 2 : levels.length;
    if (c === "ArrowDown") menuSel = Math.min(menuSel + 1, max);
    if (c === "ArrowUp") menuSel = Math.max(menuSel - 1, 0);
    if (c === "Enter" || c === "Space") {
      e.preventDefault();
      menuAction();
    }
  }
  if (gameState === "dead" && (c === "Space" || c === "Enter")) restart();
  if (gameState === "complete" && (c === "Space" || c === "Enter")) goToMenu();
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") iUp(e);
});

function tapHandler(x, y) {
  if (gameState === "menu") {
    menuClickAt(x, y);
    return;
  }
  if (gameState === "dead") {
    restart();
    return;
  }
  if (gameState === "complete") {
    goToMenu();
    return;
  }
  if (gameState === "paused") {
    // Check if tapped on "Back to Menu" button area
    if (y > H / 2 + 30 && y < H / 2 + 70) {
      goToMenu();
      return;
    }
    gameState = "playing";
    return;
  }
  // Check mute button (top-right)
  if (x > W - 55 && y < 50) {
    muted = !muted;
    return;
  }
  // Check back button (top-left area, small)
  if (x < 50 && y < 50 && gameState === "playing") {
    goToMenu();
    return;
  }
  iDown();
}

canvas.addEventListener("mousedown", (e) => tapHandler(e.clientX, e.clientY));
canvas.addEventListener("mouseup", iUp);
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    tapHandler(e.touches[0].clientX, e.touches[0].clientY);
  },
  { passive: false }
);
canvas.addEventListener(
  "touchend",
  (e) => {
    e.preventDefault();
    iUp();
  },
  { passive: false }
);

// -------------------- Fullscreen --------------------
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    if (canvas.requestFullscreen) canvas.requestFullscreen().catch(() => {});
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}
document.addEventListener("fullscreenchange", () => resize());

function goToMenu() {
  gameState = "menu";
  menuScreen = "main";
  menuSel = 0;
  stopMusic();
  particles = [];
}

// -------------------- Audio --------------------
let ac = null,
  masterGain = null;

function initAudio() {
  if (ac) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ac.createGain();
    masterGain.gain.value = 0.25;
    masterGain.connect(ac.destination);
  } catch (e) {}
}

function tone(freq, dur, type, vol, delay) {
  if (!ac || muted) return;
  try {
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(masterGain);
    o.start(t);
    o.stop(t + dur);
  } catch (e) {}
}

function noise(dur, vol, hpFreq) {
  if (!ac || muted) return;
  try {
    const sz = ac.sampleRate * dur;
    const buf = ac.createBuffer(1, sz, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < sz; i++) d[i] = Math.random() * 2 - 1;
    const n = ac.createBufferSource();
    n.buffer = buf;
    const g = ac.createGain();
    g.gain.value = vol || 0.03;
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    const f = ac.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hpFreq || 6000;
    n.connect(f);
    f.connect(g);
    g.connect(masterGain);
    n.start();
    n.stop(ac.currentTime + dur + 0.01);
  } catch (e) {}
}

function sfxJump() {
  tone(500, 0.08, "square", 0.07);
  tone(620, 0.06, "square", 0.04, 0.02);
}
function sfxDie() {
  tone(180, 0.3, "sawtooth", 0.12);
  tone(120, 0.4, "sawtooth", 0.08, 0.1);
}
function sfxOrb() {
  tone(880, 0.12, "sine", 0.09);
  tone(1100, 0.08, "sine", 0.06, 0.04);
}
function sfxPad() {
  tone(660, 0.1, "square", 0.09);
  tone(880, 0.08, "sine", 0.06, 0.03);
}
function sfxLand() {
  tone(120, 0.04, "square", 0.03);
}
function sfxWin() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, "sine", 0.1, i * 0.12));
}

// Music
let musicInt = null,
  mStep = 0;
const bassNotes = [130.81, 146.83, 164.81, 146.83, 130.81, 164.81, 146.83, 130.81];
const melNotes = [523, 0, 659, 0, 784, 0, 659, 523, 0, 784, 659, 0, 523, 659, 784, 1047];

function startMusic() {
  stopMusic();
  mStep = 0;
  musicInt = setInterval(() => {
    if (muted || gameState !== "playing" || !ac) return;
    tone(bassNotes[mStep % bassNotes.length], 0.1, "square", 0.045);
    if (mStep % 2 === 0) {
      const n = melNotes[mStep % melNotes.length];
      if (n) tone(n, 0.07, "sine", 0.025);
    }
    if (mStep % 4 === 0) tone(55, 0.1, "sine", 0.08);
    if (mStep % 4 === 2) noise(0.03, 0.025, 8000);
    bgPulse = 0.6;
    mStep++;
  }, 175);
}
function stopMusic() {
  if (musicInt) {
    clearInterval(musicInt);
    musicInt = null;
  }
}

// -------------------- Particles --------------------
function emitP(x, y, col, n, spd) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * (spd || 8),
      vy: (Math.random() - 0.5) * (spd || 8) - 2,
      life: 1,
      decay: 0.012 + Math.random() * 0.025,
      sz: 2 + Math.random() * 4,
      col: col || "#fff",
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x - cameraX, p.y, p.sz, p.sz);
  }
  ctx.globalAlpha = 1;
}

// ================================================================
// LEVEL DEFINITIONS
// ================================================================
// Physics-validated spacing:
//   Normal speed (6.2): ~142px clearable above spike height in one jump
//     → singles, doubles at 70px spacing OK
//   Fast speed (9): ~207px clearable
//     → triples at 60px spacing OK
//   Gap max: ~150px at normal, ~220px at fast
//   Platform spikes: 60px+ clear landing zone before spike
// ================================================================

function makeLevels() {
  return [buildLevel1(), buildLevel2(), buildLevel3()];
}

function buildLevel1() {
  const o = [];
  let x = 700;

  // === Section 1: Gentle intro — single spikes ===
  o.push({ type: "spike", x: x });
  x += 350;
  o.push({ type: "spike", x: x });
  x += 300;
  o.push({ type: "spike", x: x });
  x += 350;

  // === Section 2: Double spikes (70px spacing — tighter but still fair) ===
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 70 });
  x += 400;

  // Low block to jump over
  o.push({ type: "block", x: x, y: groundY - 50, w: 70, h: 50 });
  x += 300;
  o.push({ type: "spike", x: x });
  x += 400;

  // === Section 3: First gap ===
  o.push({ type: "gap", x: x, w: 120 });
  x += 350;

  // === Section 4: Jump pad to platform ===
  o.push({ type: "pad", x: x });
  x += 60;
  // Platform with spike — spike placed 100px in, giving 100px safe landing zone
  o.push({ type: "plat", x: x + 30, y: groundY - 130, w: 200, h: 18 });
  o.push({ type: "spike", x: x + 140, surfY: groundY - 130 });
  x += 450;

  // === Section 5: Double spikes then gap ===
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 70 });
  x += 400;
  o.push({ type: "gap", x: x, w: 130 });
  o.push({ type: "orb", x: x + 65, y: groundY - 120 });
  x += 380;

  // === Section 6: Speed up section ===
  o.push({ type: "speedP", x: x, spd: "fast" });
  x += 180;
  // At fast speed, triples are clearable
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 60 });
  o.push({ type: "spike", x: x + 120 });
  x += 350;
  o.push({ type: "spike", x: x });
  x += 250;
  o.push({ type: "speedP", x: x, spd: "normal" });
  x += 300;

  // === Section 7: Mixed blocks and spikes ===
  o.push({ type: "block", x: x, y: groundY - 75, w: 55, h: 75 });
  o.push({ type: "spike", x: x + 70 });
  x += 350;
  o.push({ type: "gap", x: x, w: 110 });
  x += 350;

  // === Section 8: Pad to platform section ===
  o.push({ type: "pad", x: x });
  x += 60;
  o.push({ type: "plat", x: x + 50, y: groundY - 150, w: 160, h: 18 });
  x += 500;

  // === Section 9: Double spike + block ===
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 70 });
  x += 350;
  o.push({ type: "block", x: x, y: groundY - 42, w: 180, h: 42 });
  o.push({ type: "spike", x: x + 195 });
  x += 450;

  // === Section 10: Finale ===
  o.push({ type: "gap", x: x, w: 130 });
  o.push({ type: "orb", x: x + 65, y: groundY - 115 });
  x += 380;
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 70 });
  x += 350;
  o.push({ type: "pad", x: x });
  x += 400;

  o.push({ type: "finish", x: x });
  return { name: "Neon Pulse", hue: 200, obs: o, len: x + 300 };
}

function buildLevel2() {
  const o = [];
  let x = 650;

  // === Section 1: Quick start ===
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 70 });
  x += 350;
  o.push({ type: "block", x: x, y: groundY - 60, w: 55, h: 60 });
  o.push({ type: "spike", x: x + 70 });
  x += 300;
  o.push({ type: "gap", x: x, w: 110 });
  x += 330;
  o.push({ type: "spike", x: x });
  x += 250;
  o.push({ type: "block", x: x, y: groundY - 80, w: 70, h: 80 });
  o.push({ type: "spike", x: x + 85 });
  x += 350;

  // === Section 2: Ship mode — spikes on floor/ceiling + mid obstacles + funnel exit ===
  o.push({ type: "shipP", x: x });
  x += 200;

  // Ground + ceiling spike rhythm
  o.push({ type: "spike", x: x + 80 });
  o.push({ type: "spikeD", x: x + 160, surfY: CEIL_Y });
  o.push({ type: "spike", x: x + 280 });
  o.push({ type: "spikeD", x: x + 360, surfY: CEIL_Y });
  o.push({ type: "spike", x: x + 480 });

  // Floating obstacles (hand-placed, irregular)
  o.push({ type: "block", x: x + 120, y: groundY - 140, w: 40, h: 40 });
  o.push({ type: "block", x: x + 240, y: groundY - 210, w: 40, h: 55 });
  o.push({ type: "block", x: x + 390, y: groundY - 120, w: 45, h: 45 });
  o.push({ type: "mover", x: x + 520, y: groundY - 175, w: 36, h: 36, my: 60, ms: 0.02 });
  x += 700;

  // More spikes + staggered blocks
  o.push({ type: "spikeD", x: x + 40, surfY: CEIL_Y });
  o.push({ type: "spike", x: x + 160 });
  o.push({ type: "spikeD", x: x + 280, surfY: CEIL_Y });
  o.push({ type: "block", x: x + 110, y: groundY - 95, w: 36, h: 95 });
  o.push({ type: "block", x: x + 230, y: groundY - 210, w: 36, h: 70 });
  o.push({ type: "mover", x: x + 340, y: groundY - 150, w: 34, h: 34, my: 55, ms: 0.022 });
  x += 520;

  // Funnel: narrowing corridor (must align through opening)
  const f0 = x;
  for (let i = 0; i < 5; i++) {
    const fx = f0 + i * 120;
    const topY = CEIL_Y + 30 + i * 12;
    const botY = groundY - 30 - i * 12;
    o.push({ type: "block", x: fx, y: CEIL_Y, w: 70, h: topY - CEIL_Y });
    o.push({ type: "block", x: fx, y: botY, w: 70, h: groundY - botY });
    o.push({ type: "spikeD", x: fx + 80, surfY: CEIL_Y });
    o.push({ type: "spike", x: fx + 80 });
  }
  x = f0 + 5 * 120 + 80;

  // Final wall with small opening (miss it = crash)
  const gapH = 70;
  const gapMid = (CEIL_Y + groundY) / 2;
  const gapTop = gapMid - gapH / 2;
  const gapBot = gapMid + gapH / 2;
  o.push({ type: "block", x: x, y: CEIL_Y, w: 80, h: gapTop - CEIL_Y });
  o.push({ type: "block", x: x, y: gapBot, w: 80, h: groundY - gapBot });
  x += 140;

  o.push({ type: "cubeP", x: x });
  x += 200;

  // === Section 3: Speed section ===
  o.push({ type: "speedP", x: x, spd: "fast" });
  x += 180;
  o.push({ type: "spike", x: x });
  x += 200;
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 60 });
  x += 280;
  o.push({ type: "gap", x: x, w: 130 });
  x += 350;
  o.push({ type: "spike", x: x });
  x += 200;
  o.push({ type: "speedP", x: x, spd: "normal" });
  x += 250;

  // === Section 4: Pads + orbs ===
  o.push({ type: "gap", x: x, w: 180 });
  o.push({ type: "pad", x: x - 55 });
  o.push({ type: "orb", x: x + 90, y: groundY - 160 });
  x += 420;
  // Raised platform with spikes on top (safe landing zone = first 90px)
  o.push({ type: "block", x: x, y: groundY - 50, w: 280, h: 50 });
  o.push({ type: "spike", x: x + 100, surfY: groundY - 50 });
  o.push({ type: "spike", x: x + 190, surfY: groundY - 50 });
  x += 500;

  // === Section 5: Block gauntlet ===
  o.push({ type: "block", x: x, y: groundY - 70, w: 50, h: 70 });
  o.push({ type: "spike", x: x + 65 });
  x += 320;
  o.push({ type: "block", x: x, y: groundY - 90, w: 55, h: 90 });
  o.push({ type: "spike", x: x + 70 });
  x += 320;
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 70 });
  x += 300;
  o.push({ type: "gap", x: x, w: 140 });
  o.push({ type: "orb", x: x + 70, y: groundY - 130 });
  x += 400;

  // === Section 6: Fast finish ===
  o.push({ type: "speedP", x: x, spd: "fast" });
  x += 180;
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 60 });
  x += 250;
  o.push({ type: "block", x: x, y: groundY - 65, w: 50, h: 65 });
  x += 220;
  o.push({ type: "spike", x: x });
  x += 200;
  o.push({ type: "gap", x: x, w: 120 });
  x += 340;
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 60 });
  o.push({ type: "spike", x: x + 120 });
  x += 380;
  o.push({ type: "pad", x: x });
  x += 400;

  o.push({ type: "finish", x: x });
  return { name: "Rebound", hue: 270, obs: o, len: x + 300 };
}

function buildLevel3() {
  const o = [];
  let x = 550;

  // === Section 1: Hard opener at fast speed ===
  o.push({ type: "speedP", x: x, spd: "fast" });
  x += 160;
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 60 });
  o.push({ type: "spike", x: x + 120 });
  x += 320;
  o.push({ type: "block", x: x, y: groundY - 85, w: 50, h: 85 });
  o.push({ type: "spike", x: x + 65 });
  x += 280;
  o.push({ type: "gap", x: x, w: 140 });
  x += 340;
  o.push({ type: "spike", x: x });
  x += 200;
  o.push({ type: "block", x: x, y: groundY - 50, w: 50, h: 50 });
  o.push({ type: "block", x: x + 65, y: groundY - 100, w: 50, h: 100 });
  o.push({ type: "spike", x: x + 130 });
  x += 380;
  o.push({ type: "speedP", x: x, spd: "normal" });
  x += 250;

  // === Section 2: Orb chains over gap ===
  o.push({ type: "gap", x: x, w: 140 });
  o.push({ type: "orb", x: x + 45, y: groundY - 110 });
  o.push({ type: "orb", x: x + 100, y: groundY - 110 });
  x += 380;
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 70 });
  x += 300;
  // Pad to platform — 90px safe landing before spike
  o.push({ type: "pad", x: x });
  x += 60;
  o.push({ type: "plat", x: x + 50, y: groundY - 155, w: 180, h: 18 });
  o.push({ type: "spike", x: x + 150, surfY: groundY - 155 });
  x += 450;

  // === Section 3: Ship with tight corridors ===
  o.push({ type: "shipP", x: x });
  x += 200;
  o.push({ type: "block", x: x, y: groundY - 220, w: 500, h: 18 }); // ceiling
  o.push({ type: "block", x: x + 100, y: groundY - 55, w: 30, h: 55 }); // floor bump
  o.push({ type: "block", x: x + 220, y: groundY - 185, w: 30, h: 50 }); // ceiling drop
  o.push({ type: "block", x: x + 340, y: groundY - 55, w: 30, h: 55 }); // floor bump
  x += 700;
  o.push({ type: "cubeP", x: x });
  x += 200;

  // === Section 4: Fast precision ===
  o.push({ type: "speedP", x: x, spd: "fast" });
  x += 140;
  o.push({ type: "spike", x: x });
  x += 180;
  o.push({ type: "spike", x: x });
  x += 180;
  o.push({ type: "gap", x: x, w: 120 });
  x += 320;
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 60 });
  x += 250;
  o.push({
    type: "mover",
    x: x,
    y: groundY - 120,
    w: 45,
    h: 45,
    my: 70,
    ms: 0.028,
  });
  x += 280;
  o.push({
    type: "mover",
    x: x,
    y: groundY - 85,
    w: 45,
    h: 45,
    my: 55,
    ms: 0.032,
  });
  x += 280;
  o.push({ type: "spike", x: x });
  x += 220;
  o.push({ type: "speedP", x: x, spd: "normal" });
  x += 220;

  // === Section 5: Pad chain ===
  o.push({ type: "gap", x: x, w: 150 });
  o.push({ type: "pad", x: x - 55 });
  x += 380;
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 70 });
  x += 350;
  o.push({ type: "block", x: x, y: groundY - 105, w: 55, h: 105 });
  o.push({ type: "spike", x: x + 70 });
  x += 300;
  o.push({ type: "gap", x: x, w: 140 });
  o.push({ type: "orb", x: x + 50, y: groundY - 120 });
  o.push({ type: "orb", x: x + 100, y: groundY - 120 });
  x += 380;

  // === Section 6: Second ship section ===
  o.push({ type: "shipP", x: x });
  x += 200;
  o.push({ type: "block", x: x, y: groundY - 240, w: 800, h: 18 }); // ceiling
  o.push({
    type: "mover",
    x: x + 120,
    y: groundY - 155,
    w: 40,
    h: 40,
    my: 70,
    ms: 0.018,
  });
  o.push({
    type: "mover",
    x: x + 340,
    y: groundY - 100,
    w: 40,
    h: 40,
    my: 80,
    ms: 0.022,
  });
  o.push({ type: "block", x: x + 500, y: groundY - 60, w: 40, h: 60 });
  o.push({ type: "block", x: x + 500, y: groundY - 240, w: 40, h: 80 });
  o.push({
    type: "mover",
    x: x + 650,
    y: groundY - 135,
    w: 40,
    h: 40,
    my: 55,
    ms: 0.026,
  });
  x += 1000;
  o.push({ type: "cubeP", x: x });
  x += 200;

  // === Section 7: Very fast finale ===
  o.push({ type: "speedP", x: x, spd: "veryfast" });
  x += 130;
  o.push({ type: "spike", x: x });
  x += 220;
  o.push({ type: "spike", x: x });
  x += 220;
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 70 });
  x += 300;
  o.push({ type: "gap", x: x, w: 140 });
  x += 360;
  o.push({ type: "spike", x: x });
  x += 220;
  o.push({ type: "block", x: x, y: groundY - 60, w: 55, h: 60 });
  o.push({ type: "spike", x: x + 70 });
  x += 300;
  o.push({ type: "spike", x: x });
  o.push({ type: "spike", x: x + 70 });
  o.push({ type: "spike", x: x + 140 });
  x += 450;

  o.push({ type: "finish", x: x });
  return { name: "Spectral Drift", hue: 350, obs: o, len: x + 300 };
}

let levels = makeLevels();
window.addEventListener("resize", () => {
  setTimeout(() => {
    levels = makeLevels();
  }, 60);
});

// -------------------- Collision --------------------
function rr(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function ptInTri(px, py, x1, y1, x2, y2, x3, y3) {
  const d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
  const d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function spikeHit(sx, sy) {
  const tx1 = sx,
    ty1 = sy,
    tx2 = sx + SPIKE_W,
    ty2 = sy,
    tx3 = sx + SPIKE_W / 2,
    ty3 = sy - SPIKE_H;
  const s = COL_SHRINK;
  const corners = [
    [P.x + s, P.y + s],
    [P.x + PS - s, P.y + s],
    [P.x + s, P.y + PS - s],
    [P.x + PS - s, P.y + PS - s],
    [P.x + PS / 2, P.y + PS / 2],
  ];
  for (const [cx, cy] of corners) {
    if (ptInTri(cx, cy, tx1, ty1, tx2, ty2, tx3, ty3)) return true;
  }
  return false;
}

function spikeHitDown(sx, sy) {
  const tx1 = sx,
    ty1 = sy,
    tx2 = sx + SPIKE_W,
    ty2 = sy,
    tx3 = sx + SPIKE_W / 2,
    ty3 = sy + SPIKE_H;
  const s = COL_SHRINK;
  const corners = [
    [P.x + s, P.y + s],
    [P.x + PS - s, P.y + s],
    [P.x + s, P.y + PS - s],
    [P.x + PS - s, P.y + PS - s],
    [P.x + PS / 2, P.y + PS / 2],
  ];
  for (const [cx, cy] of corners) {
    if (ptInTri(cx, cy, tx1, ty1, tx2, ty2, tx3, ty3)) return true;
  }
  return false;
}

function isGround(wx) {
  if (!levelData) return true;
  for (const o of levelData.obs) {
    if (o.type === "gap" && wx > o.x && wx < o.x + o.w) return false;
  }
  return true;
}

// -------------------- Progress --------------------
function getProgress() {
  if (!levelData) return 0;
  return Math.min(
    100,
    Math.max(0, Math.floor(((P.x - 250) / (levelData.len - 550)) * 100))
  );
}

// -------------------- Start / Restart --------------------
function startLevel(idx) {
  initAudio();
  currentLevelIdx = idx;
  levels = makeLevels();
  levelData = levels[idx];
  deathNum = 0;
  attemptNum = (totalAttempts[idx] || 0) + 1;
  totalAttempts[idx] = attemptNum;
  levelTimer = now();
  levelFinishTime = 0;
  resetPlayer(false);
  gameState = "playing";
  startMusic();
  showAttemptFlash();
}

function restart() {
  if (practiceMode && checkpoints.length) {
    resetPlayer(true);
  } else {
    attemptNum++;
    totalAttempts[currentLevelIdx] = attemptNum;
    resetPlayer(false);
  }
  gameState = "playing";
  showAttemptFlash();
}

function showAttemptFlash() {
  attemptFlashAlpha = 1.5; // starts > 1 so it stays at full for a bit
  attemptFlashText = "Attempt " + attemptNum;
}

function kill() {
  if (P.dead) return;
  P.dead = true;
  deathNum++;
  shakeIntensity = 14;
  sfxDie();
  emitP(P.x + PS / 2, P.y + PS / 2, "#ff0040", 28, 12);
  emitP(P.x + PS / 2, P.y + PS / 2, "#ffcc00", 14, 8);
  const prog = getProgress();
  if (!bestProg[currentLevelIdx] || prog > bestProg[currentLevelIdx]) {
    bestProg[currentLevelIdx] = prog;
    save();
  }
  setTimeout(() => {
    if (gameState === "playing" || P.dead) gameState = "dead";
  }, 450);
}

function win() {
  P.done = true;
  gameState = "complete";
  bestProg[currentLevelIdx] = 100;
  save();
  sfxWin();
  emitP(P.x + PS / 2, P.y + PS / 2, "#00ff88", 45, 14);
  emitP(P.x + PS / 2, P.y + PS / 2, "#ffff00", 35, 10);
  emitP(P.x + PS / 2, P.y + PS / 2, "#ff44ff", 25, 8);
  stopMusic();
  levelFinishTime = (now() - levelTimer) / 1000;
}

// -------------------- Update --------------------
function update() {
  if (gameState !== "playing" || P.dead || P.done) return;
  if (!levelData) return;

  inputJustDown = inputHeld && !_inputWasDown;
  _inputWasDown = inputHeld;

  P.x += P.speed;

  // Update trail
  trail.push({ x: P.x + PS / 2, y: P.y + PS, life: 1 });
  if (trail.length > 18) trail.shift();
  for (let i = trail.length - 1; i >= 0; i--) {
    trail[i].life -= 0.06;
    if (trail[i].life <= 0) trail.splice(i, 1);
  }

  // Practice checkpoints
  if (practiceMode && P.x - lastCpX > 750) {
    checkpoints.push(P.x);
    lastCpX = P.x;
  }

  // Camera
  cameraX += (P.x - 250 - cameraX) * 0.12;

  const solidBelow = isGround(P.x + PS / 2);

  if (P.isShip) {
    // --- Ship mode ---
    if (inputHeld) P.vy += SHIP_FLY;
    else P.vy += SHIP_GRAV;
    P.vy = Math.max(-8.5, Math.min(8.5, P.vy));
    P.y += P.vy;
    if (P.y < CEIL_Y) {
      P.y = CEIL_Y;
      P.vy = 0;
    }
    if (solidBelow && P.y + PS >= groundY) {
      P.y = groundY - PS;
      P.vy = 0;
    }
    P.rot = P.vy * 2 * (Math.PI / 180);

    // Block collisions in ship mode
    for (const o of levelData.obs) {
      if (o.type !== "plat" && o.type !== "block") continue;
      if (rr(P.x + 5, P.y + 5, PS - 10, PS - 10, o.x, o.y, o.w, o.h)) {
        kill();
        return;
      }
    }
    if (P.y > H + 150) {
      kill();
      return;
    }
  } else {
    // --- Cube mode ---
    P.vy += GRAVITY;
    P.y += P.vy;

    let onPlat = false;

    for (const o of levelData.obs) {
      if (o.type !== "plat" && o.type !== "block") continue;
      const ox = o.x,
        oy = o.y,
        ow = o.w,
        oh = o.h;
      if (P.x + PS > ox && P.x < ox + ow) {
        // Land on top
        if (P.vy >= 0 && P.y + PS >= oy && P.y + PS <= oy + oh + P.vy + 2) {
          P.y = oy - PS;
          P.vy = 0;
          if (!P.grounded) sfxLand();
          P.grounded = true;
          onPlat = true;
        }
        // Bump head
        if (P.vy < 0 && P.y <= oy + oh && P.y >= oy - 2) {
          P.vy = 1;
          P.y = oy + oh;
        }
      }
      // Side collision
      if (P.y + PS > oy + 2 && P.y < oy + oh - 2) {
        if (P.x + PS > ox && P.x + PS < ox + P.speed + 4 && P.x < ox) {
          kill();
          return;
        }
      }
    }

    // Ground
    if (solidBelow && P.y + PS >= groundY) {
      // If player's top is below ground level, they fell through a gap — kill them
      if (P.y > groundY) {
        kill();
        return;
      }
      P.y = groundY - PS;
      if (P.vy > 0) {
        if (!P.grounded) sfxLand();
        P.grounded = true;
      }
      P.vy = 0;
    } else if (!onPlat && P.y + PS < groundY) {
      P.grounded = false;
    }

    // Fell into gap / void — kill as soon as player falls a full tile below ground
    if (P.y > groundY + PS) {
      kill();
      return;
    }

    // Jump
    if (inputJustDown && P.grounded) {
      P.vy = JUMP_VEL;
      P.grounded = false;
      P.tgtRot += Math.PI / 2;
      sfxJump();
    }

    // Rotation
    if (!P.grounded) {
      P.rot += (P.tgtRot - P.rot) * 0.14;
    } else {
      const snap = Math.round(P.rot / (Math.PI / 2)) * (Math.PI / 2);
      P.rot += (snap - P.rot) * 0.28;
    }
  }

  // --- Obstacle interactions ---
  for (const o of levelData.obs) {
    const dx = o.x - P.x;
    if (dx > 500 || dx < -500) continue;

    switch (o.type) {
      case "spike": {
        const surfY = o.surfY || groundY;
        if (spikeHit(o.x, surfY)) {
          kill();
          return;
        }
        break;
      }
      case "spikeD": {
        const surfY = o.surfY || CEIL_Y;
        if (spikeHitDown(o.x, surfY)) {
          kill();
          return;
        }
        break;
      }
      case "pad":
        if (
          !o._hit &&
          rr(P.x, P.y, PS, PS, o.x, groundY - 16, 40, 16)
        ) {
          P.vy = PAD_JUMP;
          P.grounded = false;
          P.tgtRot += Math.PI;
          sfxPad();
          o._hit = true;
        }
        break;
      case "orb":
        if (
          inputHeld &&
          !o._hit &&
          rr(P.x - 8, P.y - 8, PS + 16, PS + 16, o.x - 22, o.y - 22, 44, 44)
        ) {
          P.vy = ORB_JUMP;
          P.grounded = false;
          P.tgtRot += Math.PI / 2;
          sfxOrb();
          o._hit = true;
        }
        break;
      case "speedP":
        if (rr(P.x, P.y, PS, PS, o.x - 15, groundY - 80, 30, 80)) {
          P.speed = SPEEDS[o.spd] || BASE_SPEED;
        }
        break;
      case "shipP":
        if (rr(P.x, P.y, PS, PS, o.x - 10, groundY - 80, 50, 80)) {
          P.isShip = true;
          P.vy = 0;
        }
        break;
      case "cubeP":
        if (rr(P.x, P.y, PS, PS, o.x - 10, groundY - 80, 50, 80)) {
          P.isShip = false;
        }
        break;
      case "mover": {
        const my = o.y + Math.sin(now() * o.ms) * o.my;
        if (rr(P.x + 5, P.y + 5, PS - 10, PS - 10, o.x, my, o.w, o.h)) {
          kill();
          return;
        }
        break;
      }
      case "finish":
        if (rr(P.x, P.y, PS, PS, o.x - 5, groundY - 110, 50, 110)) {
          win();
          return;
        }
        break;
    }
  }
}

// ================================================================
// RENDERING
// ================================================================

function drawBG() {
  bgPulse *= 0.92;
  const hue = levelData ? levelData.hue : 220;
  const baseLit = 5;
  const pulseLit = bgPulse * 6;

  // Gradient background
  const bgGrd = ctx.createLinearGradient(0, 0, 0, H);
  bgGrd.addColorStop(0, `hsl(${hue}, 35%, ${baseLit + pulseLit + 2}%)`);
  bgGrd.addColorStop(0.7, `hsl(${hue}, 30%, ${baseLit + pulseLit}%)`);
  bgGrd.addColorStop(1, `hsl(${hue + 15}, 25%, ${baseLit + pulseLit - 1}%)`);
  ctx.fillStyle = bgGrd;
  ctx.fillRect(0, 0, W, H);

  // Parallax scrolling grid
  ctx.strokeStyle = `hsla(${hue}, 50%, ${15 + pulseLit * 2}%, 0.06)`;
  ctx.lineWidth = 1;
  const gs = 80;
  const ox = -(cameraX * 0.3 % gs);
  for (let gx = ox; gx < W; gx += gs) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, H);
    ctx.stroke();
  }
  for (let gy = 0; gy < H; gy += gs) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
  }

  // Slow parallax background shapes
  ctx.save();
  const shapes = 12;
  for (let i = 0; i < shapes; i++) {
    const sx = ((i * 317 + 100 - cameraX * (0.05 + i * 0.008)) % (W + 200)) - 100;
    const sy = (i * 73 + 50) % (groundY - 80);
    const r = 15 + (i * 7) % 20;
    ctx.globalAlpha = 0.025 + (i % 3) * 0.008;
    ctx.strokeStyle = `hsl(${hue + i * 30}, 50%, 40%)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (i % 3 === 0) {
      ctx.rect(sx - r, sy - r, r * 2, r * 2);
    } else if (i % 3 === 1) {
      ctx.moveTo(sx, sy - r);
      ctx.lineTo(sx + r, sy + r);
      ctx.lineTo(sx - r, sy + r);
      ctx.closePath();
    } else {
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawGroundAndCeil() {
  if (!levelData) return;
  const hue = levelData.hue;

  // Ground fill with gradient
  const gaps = levelData.obs
    .filter((o) => o.type === "gap")
    .sort((a, b) => a.x - b.x);
  let prev = -500;
  for (const g of gaps) {
    const gx = g.x - cameraX;
    const gg = ctx.createLinearGradient(0, groundY, 0, H);
    gg.addColorStop(0, `hsl(${hue}, 45%, 12%)`);
    gg.addColorStop(1, `hsl(${hue}, 35%, 6%)`);
    ctx.fillStyle = gg;
    ctx.fillRect(prev, groundY, gx - prev, H - groundY);
    prev = gx + g.w;
  }
  const gg2 = ctx.createLinearGradient(0, groundY, 0, H);
  gg2.addColorStop(0, `hsl(${hue}, 45%, 12%)`);
  gg2.addColorStop(1, `hsl(${hue}, 35%, 6%)`);
  ctx.fillStyle = gg2;
  ctx.fillRect(prev, groundY, W - prev + 2000, H - groundY);

  // Ground line blocks pattern
  ctx.save();
  ctx.strokeStyle = `hsla(${hue}, 70%, 30%, 0.15)`;
  ctx.lineWidth = 1;
  const bSz = 40;
  const bOx = -(cameraX % bSz);
  for (let bx = bOx; bx < W; bx += bSz) {
    const wx = bx + cameraX;
    if (!isGround(wx)) continue;
    ctx.beginPath();
    ctx.moveTo(bx, groundY);
    ctx.lineTo(bx, H);
    ctx.stroke();
  }
  for (let by = groundY + bSz; by < H; by += bSz) {
    ctx.beginPath();
    ctx.moveTo(0, by);
    ctx.lineTo(W, by);
    ctx.stroke();
  }
  ctx.restore();

  // Glowing ground line — thicker with double glow
  ctx.save();
  ctx.shadowColor = `hsl(${hue}, 100%, 55%)`;
  ctx.shadowBlur = 18;
  ctx.strokeStyle = `hsl(${hue}, 90%, 52%)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  let pen = false;
  for (let sx = 0; sx < W; sx += 2) {
    const wx = sx + cameraX;
    if (isGround(wx)) {
      if (!pen) {
        ctx.moveTo(sx, groundY);
        pen = true;
      } else ctx.lineTo(sx, groundY);
    } else {
      pen = false;
    }
  }
  ctx.stroke();

  // Ceiling line — subtle
  ctx.shadowBlur = 10;
  ctx.strokeStyle = `hsla(${hue}, 80%, 45%, 0.6)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, CEIL_Y);
  ctx.lineTo(W, CEIL_Y);
  ctx.stroke();
  ctx.restore();
}

function drawObs() {
  if (!levelData) return;
  const hue = levelData.hue;

  for (const o of levelData.obs) {
    const sx = o.x - cameraX;
    if (sx < -250 || sx > W + 250) continue;

    ctx.save();
    switch (o.type) {
      case "spike": {
        const surfY = o.surfY || groundY;
        // Gradient spike
        const sg = ctx.createLinearGradient(sx + SPIKE_W / 2, surfY - SPIKE_H, sx + SPIKE_W / 2, surfY);
        sg.addColorStop(0, `hsl(${hue + 30}, 100%, 60%)`);
        sg.addColorStop(1, `hsl(${hue + 30}, 80%, 35%)`);
        ctx.fillStyle = sg;
        ctx.shadowColor = `hsl(${hue + 30}, 100%, 55%)`;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(sx, surfY);
        ctx.lineTo(sx + SPIKE_W, surfY);
        ctx.lineTo(sx + SPIKE_W / 2, surfY - SPIKE_H);
        ctx.closePath();
        ctx.fill();
        // Inner highlight
        ctx.fillStyle = `hsla(${hue + 30}, 100%, 70%, 0.3)`;
        ctx.beginPath();
        ctx.moveTo(sx + SPIKE_W * 0.3, surfY);
        ctx.lineTo(sx + SPIKE_W * 0.7, surfY);
        ctx.lineTo(sx + SPIKE_W / 2, surfY - SPIKE_H * 0.6);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "spikeD": {
        const surfY = o.surfY || CEIL_Y;
        const sg = ctx.createLinearGradient(sx + SPIKE_W / 2, surfY, sx + SPIKE_W / 2, surfY + SPIKE_H);
        sg.addColorStop(0, `hsl(${hue + 30}, 80%, 35%)`);
        sg.addColorStop(1, `hsl(${hue + 30}, 100%, 60%)`);
        ctx.fillStyle = sg;
        ctx.shadowColor = `hsl(${hue + 30}, 100%, 55%)`;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(sx, surfY);
        ctx.lineTo(sx + SPIKE_W, surfY);
        ctx.lineTo(sx + SPIKE_W / 2, surfY + SPIKE_H);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = `hsla(${hue + 30}, 100%, 70%, 0.3)`;
        ctx.beginPath();
        ctx.moveTo(sx + SPIKE_W * 0.3, surfY);
        ctx.lineTo(sx + SPIKE_W * 0.7, surfY);
        ctx.lineTo(sx + SPIKE_W / 2, surfY + SPIKE_H * 0.6);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "plat": {
        const pg = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
        pg.addColorStop(0, `hsl(${hue}, 55%, 32%)`);
        pg.addColorStop(1, `hsl(${hue}, 45%, 22%)`);
        ctx.fillStyle = pg;
        ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
        ctx.shadowBlur = 8;
        ctx.fillRect(sx, o.y, o.w, o.h);
        ctx.strokeStyle = `hsl(${hue}, 90%, 55%)`;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(sx, o.y, o.w, o.h);
        break;
      }
      case "block": {
        const bg = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
        bg.addColorStop(0, `hsl(${hue + 10}, 40%, 24%)`);
        bg.addColorStop(1, `hsl(${hue + 10}, 30%, 14%)`);
        ctx.fillStyle = bg;
        ctx.shadowColor = `hsl(${hue}, 80%, 45%)`;
        ctx.shadowBlur = 8;
        ctx.fillRect(sx, o.y, o.w, o.h);
        ctx.strokeStyle = `hsl(${hue}, 65%, 45%)`;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, o.y, o.w, o.h);
        // Inner cross pattern
        ctx.strokeStyle = `hsla(${hue}, 50%, 35%, 0.25)`;
        ctx.lineWidth = 1;
        const cSz = 20;
        for (let cx = sx; cx < sx + o.w; cx += cSz) {
          ctx.beginPath();
          ctx.moveTo(cx, o.y);
          ctx.lineTo(cx, o.y + o.h);
          ctx.stroke();
        }
        break;
      }
      case "gap":
        break;
      case "pad": {
        const bounce = o._hit ? Math.sin(now() * 0.01) * 3 : 0;
        ctx.shadowColor = "#ffdd00";
        ctx.shadowBlur = 16;
        const pdg = ctx.createLinearGradient(sx + 20, groundY - 16, sx + 20, groundY);
        pdg.addColorStop(0, "#ffee44");
        pdg.addColorStop(1, "#cc9900");
        ctx.fillStyle = pdg;
        ctx.beginPath();
        ctx.moveTo(sx, groundY);
        ctx.lineTo(sx + 40, groundY);
        ctx.lineTo(sx + 30, groundY - 16 + bounce);
        ctx.lineTo(sx + 10, groundY - 16 + bounce);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "orb": {
        const pulse = Math.sin(now() * 0.005) * 4;
        const used = o._hit;
        ctx.shadowColor = "#aa44ff";
        ctx.shadowBlur = used ? 0 : 22;
        // Outer ring
        if (!used) {
          ctx.strokeStyle = "rgba(170, 68, 255, 0.3)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, o.y, 18 + pulse * 0.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Main orb
        const og = ctx.createRadialGradient(sx - 3, o.y - 3, 2, sx, o.y, 13 + pulse);
        og.addColorStop(0, used ? "#555" : "#dd88ff");
        og.addColorStop(1, used ? "#333" : "#7722cc");
        ctx.fillStyle = og;
        ctx.beginPath();
        ctx.arc(sx, o.y, 13 + pulse, 0, Math.PI * 2);
        ctx.fill();
        // Inner highlight
        if (!used) {
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.beginPath();
          ctx.arc(sx - 3, o.y - 3, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "speedP": {
        const cols = {
          slow: "#00aaff",
          normal: "#00ff88",
          fast: "#ff8800",
          veryfast: "#ff0044",
        };
        const c = cols[o.spd] || "#fff";
        ctx.strokeStyle = c;
        ctx.shadowColor = c;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx, groundY);
        ctx.lineTo(sx + 14, groundY - 80);
        ctx.lineTo(sx - 14, groundY - 40);
        ctx.lineTo(sx + 14, groundY - 40);
        ctx.lineTo(sx - 14, groundY - 80);
        ctx.lineTo(sx, groundY);
        ctx.stroke();
        break;
      }
      case "shipP":
      case "cubeP": {
        const c = o.type === "shipP" ? "#00ffcc" : "#ffcc00";
        ctx.strokeStyle = c;
        ctx.shadowColor = c;
        ctx.shadowBlur = 16;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx + 15, groundY - 42, 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        if (o.type === "shipP") {
          ctx.moveTo(sx + 4, groundY - 37);
          ctx.lineTo(sx + 26, groundY - 42);
          ctx.lineTo(sx + 4, groundY - 47);
        } else {
          ctx.rect(sx + 5, groundY - 52, 20, 20);
        }
        ctx.stroke();
        break;
      }
      case "mover": {
        const my = o.y + Math.sin(now() * o.ms) * o.my;
        const mg = ctx.createLinearGradient(sx, my, sx + o.w, my + o.h);
        mg.addColorStop(0, `hsl(${hue + 60}, 75%, 42%)`);
        mg.addColorStop(1, `hsl(${hue + 60}, 65%, 28%)`);
        ctx.fillStyle = mg;
        ctx.shadowColor = `hsl(${hue + 60}, 100%, 55%)`;
        ctx.shadowBlur = 12;
        ctx.fillRect(sx, my, o.w, o.h);
        ctx.strokeStyle = `hsl(${hue + 60}, 100%, 65%)`;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, my, o.w, o.h);
        // Danger indicator — pulsing inner
        ctx.fillStyle = `hsla(${hue + 60}, 100%, 65%, ${0.15 + Math.sin(now() * 0.008) * 0.1})`;
        ctx.fillRect(sx + 4, my + 4, o.w - 8, o.h - 8);
        break;
      }
      case "finish": {
        const t = now() * 0.003;
        const fcx = sx + 20, fcy = groundY - 55;
        // Outer glow
        const fg = ctx.createRadialGradient(fcx, fcy, 0, fcx, fcy, 55);
        fg.addColorStop(0, "rgba(255,255,255,0.15)");
        fg.addColorStop(0.5, "rgba(255,255,255,0.05)");
        fg.addColorStop(1, "transparent");
        ctx.fillStyle = fg;
        ctx.fillRect(fcx - 60, fcy - 60, 120, 120);
        // Spinning arcs
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 25;
        ctx.lineWidth = 3;
        const arcCols = ["#fff", "#00ff88", "#ffcc00"];
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = arcCols[i];
          ctx.beginPath();
          ctx.arc(fcx, fcy, 28 + i * 10, t + i * 0.7, t + i * 0.7 + Math.PI * 1.4);
          ctx.stroke();
        }
        // Center star
        ctx.fillStyle = "#fff";
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(fcx, fcy, 6 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }
}

function drawPlayer() {
  if (P.dead) return;
  const dx = P.x - cameraX;
  const cx = dx + PS / 2,
    cy = P.y + PS / 2;

  const hue = levelData ? levelData.hue : 200;
  const ph = hue + 120;

  // Draw trail behind player
  if (trail.length > 1) {
    for (let i = 0; i < trail.length; i++) {
      const t = trail[i];
      const tx = t.x - cameraX;
      const ty = t.y - PS / 2;
      ctx.globalAlpha = t.life * 0.35;
      ctx.fillStyle = `hsl(${ph}, 80%, 55%)`;
      const sz = PS * t.life * 0.6;
      ctx.fillRect(tx - sz / 2, ty - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(P.rot);

  if (P.isShip) {
    // Ship mode — improved with gradient
    ctx.save();
    ctx.shadowColor = "#00ffcc";
    ctx.shadowBlur = 18;
    const sg = ctx.createLinearGradient(-PS / 2, 0, PS / 2, 0);
    sg.addColorStop(0, "#009988");
    sg.addColorStop(1, "#00ffcc");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(PS / 2, 0);
    ctx.lineTo(-PS / 2, -PS / 3);
    ctx.lineTo(-PS / 3, 0);
    ctx.lineTo(-PS / 2, PS / 3);
    ctx.closePath();
    ctx.fill();
    // Engine glow
    ctx.globalAlpha = 0.3 + Math.sin(now() * 0.015) * 0.1;
    ctx.fillStyle = "#00ffcc";
    ctx.fillRect(-PS * 0.8, -4, PS * 0.35, 8);
    ctx.globalAlpha = 1;
    ctx.restore();
  } else {
    // Cube mode — improved with gradient, icon, and glow
    ctx.save();
    ctx.shadowColor = `hsl(${ph}, 100%, 60%)`;
    ctx.shadowBlur = 16;
    // Gradient fill
    const cg = ctx.createLinearGradient(-PS / 2, -PS / 2, PS / 2, PS / 2);
    cg.addColorStop(0, `hsl(${ph}, 80%, 55%)`);
    cg.addColorStop(1, `hsl(${ph}, 70%, 40%)`);
    ctx.fillStyle = cg;
    ctx.fillRect(-PS / 2, -PS / 2, PS, PS);
    // Border
    ctx.strokeStyle = `hsl(${ph}, 100%, 72%)`;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-PS / 2, -PS / 2, PS, PS);
    // Inner detail — eye/icon
    ctx.fillStyle = `hsl(${ph}, 100%, 80%)`;
    ctx.fillRect(-6, -6, 12, 12);
    ctx.fillStyle = `hsl(${ph}, 100%, 90%)`;
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }
  ctx.restore();

  // Trail sparkle particles
  if (gameState === "playing" && !P.dead && Math.random() < 0.3) {
    emitP(P.x, P.y + PS, `hsl(${ph}, 80%, 55%)`, 1, 3);
  }
}

function drawHUD() {
  if (gameState !== "playing" && gameState !== "paused") return;
  const prog = getProgress();
  const hue = levelData ? levelData.hue : 200;

  // === Progress bar (upscaled) ===
  const bw = Math.min(W * 0.45, 500),
    bx = (W - bw) / 2,
    by = 18,
    bh = 10,
    br = bh / 2;

  // Track background
  ctx.save();
  ctx.beginPath();
  rRect(bx, by, bw, bh, br);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();

  // Filled portion with gradient
  if (prog > 0) {
    ctx.save();
    ctx.beginPath();
    rRect(bx, by, bw, bh, br);
    ctx.clip();
    const grd = ctx.createLinearGradient(bx, 0, bx + bw * (prog / 100), 0);
    grd.addColorStop(0, `hsl(${hue + 120}, 80%, 55%)`);
    grd.addColorStop(1, `hsl(${hue + 140}, 90%, 65%)`);
    ctx.fillStyle = grd;
    ctx.shadowColor = `hsl(${hue + 120}, 100%, 60%)`;
    ctx.shadowBlur = 10;
    ctx.fillRect(bx, by, bw * (prog / 100), bh);
    ctx.restore();
  }

  // Track border
  ctx.beginPath();
  rRect(bx, by, bw, bh, br);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Percentage text
  ctx.fillStyle = "#fff";
  ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(prog + "%", W / 2, by + bh + 20);

  // Level name
  ctx.font = '13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText(levelData.name, W / 2, by + bh + 36);

  // Left info — larger
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
  ctx.fillText("Attempt " + attemptNum, 56, 34);
  ctx.font = '14px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("Deaths: " + deathNum, 56, 54);
  if (practiceMode) {
    ctx.fillStyle = "#00ff88";
    ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
    ctx.fillText("PRACTICE", 56, 74);
  }

  // Back button (top-left, bigger hitbox)
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "left";
  ctx.fillText("\u2190", 18, 34);

  // Mute button (top-right, bigger)
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = '20px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(muted ? "\u{1F507}" : "\u{1F50A}", W - 20, 34);

  // Attempt flash (larger)
  if (attemptFlashAlpha > 0) {
    attemptFlashAlpha -= 0.016;
    const a = Math.min(1, attemptFlashAlpha);
    ctx.globalAlpha = a;
    ctx.save();
    ctx.shadowColor = `hsl(${hue + 120}, 100%, 60%)`;
    ctx.shadowBlur = 30;
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.min(56, W * 0.075)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(attemptFlashText, W / 2, H * 0.4);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Pause overlay (improved)
  if (gameState === "paused") {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 25;
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.min(58, W * 0.08)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", W / 2, H / 2 - 35);
    ctx.restore();

    ctx.font = '18px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("Click to resume  \u00B7  P to unpause", W / 2, H / 2 + 15);

    ctx.fillStyle = "rgba(255,100,100,0.85)";
    ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillText("Esc \u2014 Back to Menu", W / 2, H / 2 + 55);
  }
}

function drawDeath() {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, H);

  // Red vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.8);
  vg.addColorStop(0, "transparent");
  vg.addColorStop(1, "rgba(255, 0, 40, 0.12)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.shadowColor = "#ff0040";
  ctx.shadowBlur = 35;
  ctx.fillStyle = "#ff0040";
  ctx.font = `bold ${Math.min(52, W * 0.07)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("You crashed!", W / 2, H / 2 - 55);
  ctx.restore();

  // Stats row
  const stats = [
    { label: "Progress", val: getProgress() + "%" },
    { label: "Attempt", val: "#" + attemptNum },
    { label: "Deaths", val: "" + deathNum },
  ];
  const statW = 100, gap = 20, totalW = stats.length * statW + (stats.length - 1) * gap;
  const sx = W / 2 - totalW / 2;
  stats.forEach((s, i) => {
    const bx = sx + i * (statW + gap);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    rRect(bx, H / 2 - 20, statW, 56, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(s.label, bx + statW / 2, H / 2 - 2);
    ctx.fillStyle = "#fff";
    ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(s.val, bx + statW / 2, H / 2 + 26);
  });

  ctx.fillStyle = "#fff";
  ctx.font = 'bold 17px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("Click or Space to retry", W / 2, H / 2 + 70);

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = '14px "Segoe UI", system-ui, sans-serif';
  ctx.fillText("Esc to go back to menu", W / 2, H / 2 + 96);
}

function drawWin() {
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, W, H);

  // Green glow vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, H * 0.7);
  vg.addColorStop(0, "rgba(0, 255, 136, 0.08)");
  vg.addColorStop(1, "transparent");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.shadowColor = "#00ff88";
  ctx.shadowBlur = 40;
  ctx.fillStyle = "#00ff88";
  ctx.font = `bold ${Math.min(58, W * 0.08)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("Level Complete!", W / 2, H / 2 - 90);
  ctx.restore();

  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.min(26, W * 0.035)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(levelData.name, W / 2, H / 2 - 50);

  // Stats in boxes
  const stats = [
    { label: "Attempts", val: "" + attemptNum },
    { label: "Deaths", val: "" + deathNum },
    { label: "Time", val: levelFinishTime.toFixed(1) + "s" },
  ];
  const statW = 110, gap = 18, totalW = stats.length * statW + (stats.length - 1) * gap;
  const sx = W / 2 - totalW / 2;
  stats.forEach((s, i) => {
    const bx = sx + i * (statW + gap);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    rRect(bx, H / 2 - 25, statW, 60, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,255,136,0.2)";
    ctx.lineWidth = 1;
    rRect(bx, H / 2 - 25, statW, 60, 8);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(s.label, bx + statW / 2, H / 2 - 5);
    ctx.fillStyle = "#fff";
    ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(s.val, bx + statW / 2, H / 2 + 25);
  });

  ctx.fillStyle = "#fff";
  ctx.font = 'bold 17px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("Click or Space to continue", W / 2, H / 2 + 80);
}

// -------------------- Menu --------------------
let menuBtns = [];

function rRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function colorAlpha(c, a) {
  if (c.startsWith("#")) {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("");
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
  }
  if (c.startsWith("hsl(")) return c.replace("hsl(", "hsla(").replace(")", `, ${a})`);
  return c;
}

function drawMenu() {
  // Clean dark background
  ctx.fillStyle = "#0b0b14";
  ctx.fillRect(0, 0, W, H);

  // Animated subtle grid with slight parallax
  const t = now() * 0.00008;
  ctx.strokeStyle = "rgba(60, 60, 120, 0.06)";
  ctx.lineWidth = 1;
  const gs = 70;
  const ox = (t * 400) % gs;
  for (let gx = -gs + ox; gx < W + gs; gx += gs) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, H);
    ctx.stroke();
  }
  for (let gy = 0; gy < H; gy += gs) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
  }

  // Floating ambient particles
  ctx.save();
  for (let i = 0; i < 25; i++) {
    const px = ((Math.sin(t * 800 + i * 7.3) + 1) / 2) * W;
    const py = ((Math.cos(t * 600 + i * 4.1) + 1) / 2) * H;
    const r = 1 + Math.sin(t * 1200 + i) * 0.8;
    ctx.globalAlpha = 0.08 + Math.sin(t * 900 + i * 2) * 0.04;
    ctx.fillStyle = `hsl(${(i * 47 + t * 3000) % 360}, 60%, 60%)`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  menuBtns = [];

  if (menuScreen === "main") {
    // Title with double glow
    ctx.save();
    ctx.shadowColor = "#00ff88";
    ctx.shadowBlur = 45;
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.min(68, W * 0.085)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("GEOMETRY DASH", W / 2, H * 0.2);
    ctx.restore();

    // Subtitle with accent
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = `${Math.min(16, W * 0.02)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("A browser-based tribute", W / 2, H * 0.2 + 36);

    // Decorative line
    const lineW = Math.min(240, W * 0.3);
    ctx.save();
    ctx.strokeStyle = "rgba(0, 255, 136, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - lineW / 2, H * 0.2 + 50);
    ctx.lineTo(W / 2 + lineW / 2, H * 0.2 + 50);
    ctx.stroke();
    ctx.restore();

    const bw = Math.min(280, W * 0.4),
      bh = 58,
      bx = W / 2 - bw / 2;
    const items = [
      { label: "\u25B6  Play", col: "#00ff88" },
      {
        label: "Practice: " + (practiceMode ? "ON" : "OFF"),
        col: practiceMode ? "#ffaa00" : "#555",
      },
      {
        label: "Sound: " + (muted ? "OFF" : "ON"),
        col: muted ? "#ff4444" : "#555",
      },
    ];
    items.forEach((it, i) => {
      const by = H * 0.37 + i * 76;
      const hov = menuSel === i;
      ctx.save();
      if (hov) {
        ctx.shadowColor = it.col;
        ctx.shadowBlur = 18;
      }
      // Button fill with gradient on hover
      if (hov) {
        const grd = ctx.createLinearGradient(bx, by, bx + bw, by);
        grd.addColorStop(0, it.col);
        grd.addColorStop(1, colorAlpha(it.col, 0.8));
        ctx.fillStyle = grd;
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
      }
      ctx.strokeStyle = it.col;
      ctx.lineWidth = hov ? 2.5 : 1.5;
      rRect(bx, by, bw, bh, 12);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = hov ? "#000" : "#fff";
      ctx.font = `bold ${Math.min(20, W * 0.028)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(it.label, W / 2, by + 37);
      menuBtns.push({ x: bx, y: by, w: bw, h: bh, act: i });
    });

    // Controls footer
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.font = `${Math.min(13, W * 0.016)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(
      "Space / Click to jump  \u00B7  P pause  \u00B7  Esc menu  \u00B7  M mute  \u00B7  F fullscreen",
      W / 2,
      H - 22
    );
  } else {
    // Level select — title
    ctx.save();
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 15;
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.min(42, W * 0.055)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Select Level", W / 2, H * 0.11);
    ctx.restore();

    const bw = Math.min(360, W * 0.5),
      bh = 78,
      bx = W / 2 - bw / 2;
    levels.forEach((lv, i) => {
      const by = H * 0.18 + i * 100;
      const hov = menuSel === i;
      const best = bestProg[i] || 0;
      const col = best >= 100 ? "#00ff88" : `hsl(${lv.hue}, 70%, 50%)`;
      ctx.save();
      if (hov) {
        ctx.shadowColor = col;
        ctx.shadowBlur = 18;
      }
      if (hov) {
        const grd = ctx.createLinearGradient(bx, by, bx + bw, by);
        grd.addColorStop(0, col);
        grd.addColorStop(1, colorAlpha(col, 0.7));
        ctx.fillStyle = grd;
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = hov ? 2.5 : 1.5;
      rRect(bx, by, bw, bh, 12);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Level name
      ctx.fillStyle = hov ? "#000" : "#fff";
      ctx.font = `bold ${Math.min(22, W * 0.03)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(lv.name, W / 2, by + 32);

      // Difficulty + best progress
      const diff = ["Easy", "Medium", "Hard"][i];
      ctx.font = `${Math.min(14, W * 0.018)}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillStyle = hov ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.45)";
      ctx.fillText(
        `${diff}  \u00B7  Best: ${best}%${best >= 100 ? " \u2605" : ""}`,
        W / 2,
        by + 56
      );

      // Mini progress bar inside level button
      const pbW = bw * 0.6, pbH = 4, pbX = W / 2 - pbW / 2, pbY = by + 64;
      ctx.fillStyle = hov ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.06)";
      ctx.fillRect(pbX, pbY, pbW, pbH);
      if (best > 0) {
        ctx.fillStyle = hov ? "rgba(0,0,0,0.4)" : col;
        ctx.fillRect(pbX, pbY, pbW * (best / 100), pbH);
      }

      menuBtns.push({ x: bx, y: by, w: bw, h: bh, act: 10 + i });
    });

    // Back button
    const backBw = Math.min(200, W * 0.28);
    const backBx = W / 2 - backBw / 2;
    const backY = H * 0.18 + levels.length * 100 + 16;
    const bhBack = 52;
    const hov = menuSel === levels.length;
    ctx.save();
    if (hov) {
      ctx.shadowColor = "#ff4444";
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = hov ? "#ff4444" : "rgba(255,255,255,0.04)";
    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = hov ? 2.5 : 1.5;
    rRect(backBx, backY, backBw, bhBack, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = hov ? "#000" : "#fff";
    ctx.font = `bold ${Math.min(18, W * 0.024)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("\u2190  Back", W / 2, backY + 34);
    menuBtns.push({ x: backBx, y: backY, w: backBw, h: bhBack, act: 99 });
  }
}

function menuAction() {
  if (menuScreen === "main") {
    if (menuSel === 0) {
      menuScreen = "levels";
      menuSel = 0;
    } else if (menuSel === 1) practiceMode = !practiceMode;
    else if (menuSel === 2) muted = !muted;
  } else {
    if (menuSel < levels.length) startLevel(menuSel);
    else {
      menuScreen = "main";
      menuSel = 0;
    }
  }
}

function menuClickAt(mx, my) {
  for (const b of menuBtns) {
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      if (b.act < 3) {
        menuSel = b.act;
        menuAction();
      } else if (b.act >= 10 && b.act < 10 + levels.length)
        startLevel(b.act - 10);
      else if (b.act === 99) {
        menuScreen = "main";
        menuSel = 0;
      }
      return;
    }
  }
}

// -------------------- Text State + Time Stepping --------------------
function renderGameToText() {
  const viewMin = cameraX - 200;
  const viewMax = cameraX + W + 200;
  const obs =
    levelData && levelData.obs
      ? levelData.obs
          .filter((o) => o.x <= viewMax && (o.x + (o.w || 0)) >= viewMin)
          .map((o) => {
            if (o.type === "mover") {
              const my = o.y + Math.sin(now() * o.ms) * o.my;
              return { type: o.type, x: Math.round(o.x), y: Math.round(my), w: o.w, h: o.h };
            }
            if (o.type === "spike")
              return { type: o.type, x: Math.round(o.x), y: Math.round(o.surfY || groundY), w: SPIKE_W, h: SPIKE_H };
            if (o.type === "spikeD")
              return { type: o.type, x: Math.round(o.x), y: Math.round(o.surfY || CEIL_Y), w: SPIKE_W, h: SPIKE_H };
            if (o.type === "gap") return { type: o.type, x: Math.round(o.x), w: o.w };
            if (o.type === "speedP") return { type: o.type, x: Math.round(o.x), speed: o.spd };
            if (o.type === "shipP" || o.type === "cubeP")
              return { type: o.type, x: Math.round(o.x) };
            if (o.type === "pad") return { type: o.type, x: Math.round(o.x) };
            if (o.type === "orb") return { type: o.type, x: Math.round(o.x), y: Math.round(o.y) };
            if (o.type === "finish") return { type: o.type, x: Math.round(o.x) };
            return {
              type: o.type,
              x: Math.round(o.x),
              y: Math.round(o.y || 0),
              w: o.w,
              h: o.h,
            };
          })
      : [];

  const payload = {
    coordinate_system: { origin: "top-left", x: "right", y: "down" },
    state: gameState,
    menu: gameState === "menu" ? menuScreen : null,
    level: levelData ? levelData.name : null,
    progress: levelData ? getProgress() : 0,
    attempt: attemptNum,
    deaths: deathNum,
    practice: practiceMode,
    player: {
      x: Math.round(P.x),
      y: Math.round(P.y),
      vy: Math.round(P.vy * 100) / 100,
      mode: P.isShip ? "ship" : "cube",
      grounded: P.grounded,
      speed: Math.round(P.speed * 100) / 100,
    },
    obstacles: obs,
  };
  return JSON.stringify(payload);
}
window.render_game_to_text = renderGameToText;

let simInitialized = false;
window.advanceTime = (ms) => {
  if (!simInitialized) {
    simTime = performance.now();
    simInitialized = true;
  }
  useSimTime = true;
  const steps = Math.max(1, Math.round(ms / FRAME_MS));
  for (let i = 0; i < steps; i++) {
    simTime += FRAME_MS;
    frame();
  }
  useSimTime = false;
};

// -------------------- Main Loop --------------------
let lastFrame = 0;

function frame() {
  // Decay screen shake
  if (shakeIntensity > 0) {
    shakeX = (Math.random() - 0.5) * shakeIntensity;
    shakeY = (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.85;
    if (shakeIntensity < 0.5) shakeIntensity = 0;
  } else {
    shakeX = 0;
    shakeY = 0;
  }

  if (gameState === "menu") {
    drawMenu();
  } else {
    if (gameState === "playing") update();
    updateParticles();
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBG();
    drawGroundAndCeil();
    drawObs();
    drawPlayer();
    drawParticles();
    ctx.restore();
    drawHUD();
    if (gameState === "dead") drawDeath();
    if (gameState === "complete") drawWin();
  }

  inputJustDown = false;
}

function loop(ts) {
  lastFrame = ts;
  frame();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
