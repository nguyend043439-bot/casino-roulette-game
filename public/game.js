'use strict';

// ============================================================
// CONSTANTS
// ============================================================

const WHEEL_SEQ = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED_NUMS  = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

const CHIP_LIST = [
  {name:'10',   value:10,      color:'#1565C0'},
  {name:'20',   value:20,      color:'#7B1FA2'},
  {name:'50',   value:50,      color:'#B71C1C'},
  {name:'100',  value:100,     color:'#E65100'},
  {name:'500',  value:500,     color:'#2E7D32'},
  {name:'1K',   value:1000,    color:'#4E342E'},
  {name:'5K',   value:5000,    color:'#37474F'},
  {name:'10K',  value:10000,   color:'#880E4F'},
  {name:'50K',  value:50000,   color:'#006064'},
  {name:'100K', value:100000,  color:'#827717'},
  {name:'500K', value:500000,  color:'#BF360C'},
  {name:'1M',   value:1000000, color:'#1A237E'},
  {name:'ALL',  value:-1,      color:'#212121'}
];

const FORTUNE_PRIZES = [500,1000,2000,5000,10000,20000,50000,100000];
const FORTUNE_COLORS = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e91e63'];

function payoutCalc(count, chipVal) {
  return Math.floor(36 / count - 1) * chipVal;
}

// ============================================================
// BETS DEFINITION
// ============================================================

const BETS = {};

// Straight up (single number)
for (let n = 0; n <= 36; n++) {
  BETS[`num_${n}`] = {nums:[n]};
}

// Column bets (portrait table columns)
// col A: numbers 1,4,7,...,34 (leftmost number column)
BETS['col_A'] = {nums:[1,4,7,10,13,16,19,22,25,28,31,34]};
// col B: numbers 2,5,8,...,35 (middle number column)
BETS['col_B'] = {nums:[2,5,8,11,14,17,20,23,26,29,32,35]};
// col C: numbers 3,6,9,...,36 (rightmost number column)
BETS['col_C'] = {nums:[3,6,9,12,15,18,21,24,27,30,33,36]};

// Dozens
BETS['dozen_1'] = {nums:[1,2,3,4,5,6,7,8,9,10,11,12]};
BETS['dozen_2'] = {nums:[13,14,15,16,17,18,19,20,21,22,23,24]};
BETS['dozen_3'] = {nums:[25,26,27,28,29,30,31,32,33,34,35,36]};

// Outside
const ALL18 = Array.from({length:18},(_,i)=>i+1);
BETS['low']   = {nums:Array.from({length:18},(_,i)=>i+1)};
BETS['high']  = {nums:Array.from({length:18},(_,i)=>i+19)};
BETS['even']  = {nums:[2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36]};
BETS['odd']   = {nums:[1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35]};
BETS['red']   = {nums:[...RED_NUMS]};
BETS['black'] = {nums:[2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35]};

// ============================================================
// GAME STATE
// ============================================================

const G = {
  money: 5000,
  bet: 0,
  chips: [],          // {betId, value, elRect}
  lastChips: [],
  lastNum: null,
  history: [],
  selectedChip: CHIP_LIST[2],  // 50 default
  spinning: false,
  musicOn: true,
  fortuneUsed: false,
  fortuneDate: null
};

// ============================================================
// AUDIO ENGINE
// ============================================================

let aCtx = null;
let bgGain = null;
let bgNodes = [];

function initAudio() {
  try {
    aCtx = new (window.AudioContext || window.webkitAudioContext)();
    bgGain = aCtx.createGain();
    bgGain.gain.value = 0.08;
    bgGain.connect(aCtx.destination);
  } catch(e) { aCtx = null; }
}

function resumeAudio() {
  if (aCtx && aCtx.state === 'suspended') aCtx.resume();
}

function startBGMusic() {
  if (!aCtx || !G.musicOn) return;
  stopBGMusic();
  // Simple casino ambient: slow pad + soft bass
  const notes = [220, 261.6, 329.6, 392, 440, 392, 329.6, 261.6];
  let step = 0;
  function playNote() {
    if (!aCtx || !G.musicOn) return;
    const o = aCtx.createOscillator();
    const g = aCtx.createGain();
    o.connect(g); g.connect(bgGain);
    o.type = 'sine';
    o.frequency.value = notes[step % notes.length];
    g.gain.setValueAtTime(0, aCtx.currentTime);
    g.gain.linearRampToValueAtTime(0.6, aCtx.currentTime + 0.3);
    g.gain.linearRampToValueAtTime(0, aCtx.currentTime + 1.4);
    o.start(aCtx.currentTime);
    o.stop(aCtx.currentTime + 1.5);
    step++;
    bgNodes.push(setTimeout(playNote, 1600));
  }
  playNote();
}

function stopBGMusic() {
  bgNodes.forEach(t => clearTimeout(t));
  bgNodes = [];
}

function playChipSound() {
  if (!aCtx || !G.musicOn) return;
  const o = aCtx.createOscillator(), g = aCtx.createGain();
  o.connect(g); g.connect(aCtx.destination);
  o.type = 'triangle'; o.frequency.value = 900;
  g.gain.setValueAtTime(0.4, aCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, aCtx.currentTime + 0.08);
  o.start(); o.stop(aCtx.currentTime + 0.08);
  // clink layer
  const buf = aCtx.createBuffer(1, aCtx.sampleRate * 0.05, aCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/d.length, 4);
  const src = aCtx.createBufferSource(), g2 = aCtx.createGain();
  src.buffer = buf; src.connect(g2); g2.connect(aCtx.destination);
  g2.gain.value = 0.2;
  src.start();
}

function playSpinSound() {
  if (!aCtx || !G.musicOn) return;
  // Mechanical whirring
  const o = aCtx.createOscillator(), g = aCtx.createGain();
  const lfo = aCtx.createOscillator(), lfog = aCtx.createGain();
  lfo.connect(lfog); lfog.connect(o.frequency);
  lfo.frequency.value = 12; lfog.gain.value = 40;
  lfo.start();
  o.connect(g); g.connect(aCtx.destination);
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(80, aCtx.currentTime);
  o.frequency.linearRampToValueAtTime(200, aCtx.currentTime + 3);
  o.frequency.linearRampToValueAtTime(60, aCtx.currentTime + 9);
  g.gain.setValueAtTime(0, aCtx.currentTime);
  g.gain.linearRampToValueAtTime(0.15, aCtx.currentTime + 0.5);
  g.gain.linearRampToValueAtTime(0.1, aCtx.currentTime + 8);
  g.gain.linearRampToValueAtTime(0, aCtx.currentTime + 9.5);
  o.start(); o.stop(aCtx.currentTime + 9.5);
  lfo.stop(aCtx.currentTime + 9.5);
}

function playBallSound(duration) {
  if (!aCtx || !G.musicOn) return;
  // Clicking ball: impulse train slowing down
  const totalClicks = 40;
  for (let i = 0; i < totalClicks; i++) {
    const t = (i / totalClicks) * (i / totalClicks) * duration;
    const o = aCtx.createOscillator(), g = aCtx.createGain();
    o.connect(g); g.connect(aCtx.destination);
    o.type = 'square'; o.frequency.value = 800 + Math.random()*400;
    g.gain.setValueAtTime(0.12, aCtx.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.001, aCtx.currentTime + t + 0.025);
    o.start(aCtx.currentTime + t);
    o.stop(aCtx.currentTime + t + 0.03);
  }
}

function playWinSound() {
  if (!aCtx || !G.musicOn) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const o = aCtx.createOscillator(), g = aCtx.createGain();
    o.connect(g); g.connect(aCtx.destination);
    o.type = 'sine'; o.frequency.value = freq;
    const t = aCtx.currentTime + i * 0.15;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.05);
    g.gain.linearRampToValueAtTime(0, t + 0.35);
    o.start(t); o.stop(t + 0.4);
  });
}

function playLoseSound() {
  if (!aCtx || !G.musicOn) return;
  const notes = [400, 300, 200, 150];
  notes.forEach((freq, i) => {
    const o = aCtx.createOscillator(), g = aCtx.createGain();
    o.connect(g); g.connect(aCtx.destination);
    o.type = 'sawtooth'; o.frequency.value = freq;
    const t = aCtx.currentTime + i * 0.18;
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.start(t); o.stop(t + 0.35);
  });
}

function playResetSound() {
  if (!aCtx || !G.musicOn) return;
  // Whoosh using noise
  const buf = aCtx.createBuffer(1, aCtx.sampleRate * 0.4, aCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * Math.sin(Math.PI * i/d.length);
  const src = aCtx.createBufferSource();
  const filter = aCtx.createBiquadFilter();
  filter.type = 'bandpass'; filter.frequency.value = 800; filter.Q.value = 0.5;
  filter.frequency.linearRampToValueAtTime(200, aCtx.currentTime + 0.4);
  const g = aCtx.createGain(); g.gain.value = 0.3;
  src.buffer = buf; src.connect(filter); filter.connect(g); g.connect(aCtx.destination);
  src.start(); src.stop(aCtx.currentTime + 0.4);
}

function playFortuneSound() {
  if (!aCtx || !G.musicOn) return;
  const notes = [523,659,784,880,1047,1319];
  notes.forEach((f, i) => {
    const o = aCtx.createOscillator(), g = aCtx.createGain();
    o.connect(g); g.connect(aCtx.destination);
    o.type = 'sine'; o.frequency.value = f;
    const t = aCtx.currentTime + i * 0.12;
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.start(t); o.stop(t + 0.3);
  });
}

// ============================================================
// WHEEL CANVAS (3D Style)
// ============================================================

let wCanvas, wCtx;
let wAngle = 0;
let ballAngle = 0, ballR = 0, ballActive = false;
let wAnimId = null;
let wSpinning = false;

function setWheelSize() {
  const maxSz = Math.min(window.innerWidth * 0.55, 170);
  const sz = Math.max(130, maxSz);
  wCanvas.width = sz;
  wCanvas.height = sz;
}

function drawWheel(angle) {
  const ctx = wCtx;
  const W = wCanvas.width, H = wCanvas.height;
  const cx = W / 2, cy = H / 2;
  const R = W / 2 - 2;
  ctx.clearRect(0, 0, W, H);

  // --- Outermost wooden rim ---
  const rimGrad = ctx.createRadialGradient(cx - R*0.15, cy - R*0.15, R*0.1, cx, cy, R);
  rimGrad.addColorStop(0, '#A0522D');
  rimGrad.addColorStop(0.4, '#6B3410');
  rimGrad.addColorStop(0.8, '#3D1E08');
  rimGrad.addColorStop(1, '#1a0a00');
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2);
  ctx.fillStyle = rimGrad; ctx.fill();

  // Gold outer border ring
  ctx.beginPath(); ctx.arc(cx, cy, R*0.97, 0, Math.PI*2);
  ctx.strokeStyle = '#DAA520'; ctx.lineWidth = R*0.025; ctx.stroke();

  // Second gold ring
  ctx.beginPath(); ctx.arc(cx, cy, R*0.92, 0, Math.PI*2);
  ctx.strokeStyle = '#B8860B'; ctx.lineWidth = R*0.015; ctx.stroke();

  // --- Ball track (dark green groove) ---
  const trackR = R * 0.88;
  ctx.beginPath(); ctx.arc(cx, cy, trackR, 0, Math.PI*2);
  const trackGrad = ctx.createRadialGradient(cx, cy, trackR*0.85, cx, cy, trackR);
  trackGrad.addColorStop(0, '#1a3a18'); trackGrad.addColorStop(1, '#0d2010');
  ctx.fillStyle = trackGrad; ctx.fill();

  // --- Number pockets (rotating) ---
  const pocketR = trackR * 0.92;
  const coneR   = pocketR * 0.48;
  const N = WHEEL_SEQ.length;
  const sliceA = (Math.PI * 2) / N;

  for (let i = 0; i < N; i++) {
    const num = WHEEL_SEQ[i];
    const sA = angle + i * sliceA - Math.PI / 2;
    const eA = sA + sliceA;

    // Pocket fill
    let pColor = num === 0 ? '#1a6e1a' : RED_NUMS.has(num) ? '#c0392b' : '#111';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(sA)*coneR, cy + Math.sin(sA)*coneR);
    ctx.arc(cx, cy, pocketR, sA, eA);
    ctx.lineTo(cx + Math.cos(eA)*coneR, cy + Math.sin(eA)*coneR);
    ctx.arc(cx, cy, coneR, eA, sA, true);
    ctx.closePath();
    ctx.fillStyle = pColor;
    ctx.fill();

    // Separator wall
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(sA)*coneR, cy + Math.sin(sA)*coneR);
    ctx.lineTo(cx + Math.cos(sA)*pocketR, cy + Math.sin(sA)*pocketR);
    ctx.strokeStyle = '#DAA520'; ctx.lineWidth = R*0.018; ctx.stroke();

    // Number text
    const midA = sA + sliceA / 2;
    const textR = (pocketR + coneR) / 2;
    const tx = cx + Math.cos(midA) * textR;
    const ty = cy + Math.sin(midA) * textR;
    ctx.save();
    ctx.translate(tx, ty); ctx.rotate(midA + Math.PI/2);
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${Math.max(6, R*0.085)}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(num), 0, 0);
    ctx.restore();
  }

  // --- Inner cone / green velvet disk ---
  const innerGrad = ctx.createRadialGradient(cx, cy - coneR*0.2, 0, cx, cy, coneR);
  innerGrad.addColorStop(0, '#3a8a3a');
  innerGrad.addColorStop(0.6, '#1e5a1e');
  innerGrad.addColorStop(1, '#0d3a0d');
  ctx.beginPath(); ctx.arc(cx, cy, coneR*0.97, 0, Math.PI*2);
  ctx.fillStyle = innerGrad; ctx.fill();

  // Inner gold ring
  ctx.beginPath(); ctx.arc(cx, cy, coneR*0.97, 0, Math.PI*2);
  ctx.strokeStyle = '#DAA520'; ctx.lineWidth = R*0.02; ctx.stroke();

  // --- Decorative spokes (rotate with wheel) ---
  const hubR = coneR * 0.42;
  const spokeCount = 8;
  for (let s = 0; s < spokeCount; s++) {
    const sa = angle + (Math.PI*2/spokeCount) * s;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(sa)*hubR*1.1, cy + Math.sin(sa)*hubR*1.1);
    ctx.lineTo(cx + Math.cos(sa)*coneR*0.88, cy + Math.sin(sa)*coneR*0.88);
    ctx.strokeStyle = 'rgba(218,165,32,0.55)'; ctx.lineWidth = R*0.022; ctx.stroke();
  }

  // --- Center brass hub ---
  const hubGrad = ctx.createRadialGradient(cx-hubR*0.25, cy-hubR*0.3, 0, cx, cy, hubR);
  hubGrad.addColorStop(0, '#FFF0A0');
  hubGrad.addColorStop(0.3, '#DAA520');
  hubGrad.addColorStop(0.7, '#B8860B');
  hubGrad.addColorStop(1, '#7a5600');
  ctx.beginPath(); ctx.arc(cx, cy, hubR, 0, Math.PI*2);
  ctx.fillStyle = hubGrad; ctx.fill();
  ctx.strokeStyle = '#8B6914'; ctx.lineWidth = R*0.015; ctx.stroke();

  // Hub cross pattern
  for (let k = 0; k < 4; k++) {
    const ka = angle + (Math.PI/2)*k;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ka)*hubR*0.85, cy + Math.sin(ka)*hubR*0.85);
    ctx.strokeStyle = 'rgba(255,230,80,0.6)'; ctx.lineWidth = R*0.016; ctx.stroke();
  }

  // Hub center knob
  const knobGrad = ctx.createRadialGradient(cx-hubR*0.1, cy-hubR*0.15, 0, cx, cy, hubR*0.32);
  knobGrad.addColorStop(0, '#fffff0'); knobGrad.addColorStop(1, '#DAA520');
  ctx.beginPath(); ctx.arc(cx, cy, hubR*0.32, 0, Math.PI*2);
  ctx.fillStyle = knobGrad; ctx.fill();

  // --- Glossy reflection overlay ---
  ctx.beginPath();
  ctx.ellipse(cx - R*0.18, cy - R*0.28, R*0.32, R*0.13, -Math.PI/4, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.09)'; ctx.fill();

  // --- Ball ---
  if (ballActive) {
    ctx.save();
    const bx = cx + Math.cos(ballAngle) * ballR;
    const by = cy + Math.sin(ballAngle) * ballR;
    const bR = R * 0.048;
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    const ballGrad = ctx.createRadialGradient(bx-bR*0.3, by-bR*0.4, 0, bx, by, bR);
    ballGrad.addColorStop(0, '#fff'); ballGrad.addColorStop(0.4, '#ddd'); ballGrad.addColorStop(1, '#aaa');
    ctx.beginPath(); ctx.arc(bx, by, bR, 0, Math.PI*2);
    ctx.fillStyle = ballGrad; ctx.fill();
    ctx.restore();
  }

  // --- Marker at top (gold arrow) ---
  const mS = R * 0.04;
  ctx.beginPath();
  ctx.moveTo(cx, cy - R + R*0.02);
  ctx.lineTo(cx - mS, cy - R - mS*1.8);
  ctx.lineTo(cx + mS, cy - R - mS*1.8);
  ctx.closePath();
  ctx.fillStyle = '#f0c840'; ctx.fill();
}

function spinTo(winNum, duration, onDone) {
  const N = WHEEL_SEQ.length;
  const sliceA = (Math.PI * 2) / N;
  const idx = WHEEL_SEQ.indexOf(winNum);
  // target: winning number at top (top = -PI/2 in standard canvas)
  const targetWheel = -Math.PI/2 - idx * sliceA;
  const fullSpins = Math.PI * 2 * (5 + Math.floor(Math.random()*4));
  const startAngle = wAngle;
  const endAngle = targetWheel - fullSpins;
  const startTime = performance.now();
  const R = wCanvas.width / 2 - 2;

  wSpinning = true;
  ballActive = true;
  const outerBallR = R * 0.84;
  const innerBallR = R * 0.63;
  ballR = outerBallR;
  ballAngle = 0;

  function ease(t) { return t < 0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }

  function frame(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const e = ease(t);
    wAngle = startAngle + (endAngle - startAngle) * e;

    // Ball counter-rotates and spirals in
    const speedFactor = 1 - e;
    ballAngle -= 0.1 * (speedFactor * 6 + 0.5);
    ballR = outerBallR - (outerBallR - innerBallR) * e;

    drawWheel(wAngle);

    if (t < 1) {
      wAnimId = requestAnimationFrame(frame);
    } else {
      // Settle ball on winning pocket
      wSpinning = false;
      wAngle = endAngle;
      const winIdx = WHEEL_SEQ.indexOf(winNum);
      ballAngle = wAngle + winIdx * sliceA + sliceA/2 - Math.PI/2;
      ballR = innerBallR * 1.02;
      drawWheel(wAngle);
      if (onDone) onDone();
    }
  }

  if (wAnimId) cancelAnimationFrame(wAnimId);
  wAnimId = requestAnimationFrame(frame);
}

// Idle slow rotation
let idleAngle = 0;
let idleRaf = null;
function startIdleWheel() {
  function idle() {
    if (!wSpinning) {
      idleAngle += 0.003;
      wAngle = idleAngle;
      drawWheel(idleAngle);
    }
    idleRaf = requestAnimationFrame(idle);
  }
  idle();
}

// ============================================================
// TABLE BUILDER (HTML-based)
// ============================================================

function buildTable() {
  const grid = document.getElementById('number-grid');
  grid.innerHTML = '';

  // Numbers 1..36, arranged as rows of 3: [1,2,3], [4,5,6], ...
  for (let row = 0; row < 12; row++) {
    const n1 = row*3 + 1;
    const n2 = row*3 + 2;
    const n3 = row*3 + 3;
    [n1, n2, n3].forEach(n => {
      const cell = document.createElement('div');
      cell.className = 'num-cell bet-zone';
      cell.dataset.bet = `num_${n}`;
      const circ = document.createElement('div');
      circ.className = 'num-circle ' + (RED_NUMS.has(n) ? 'r' : 'b');
      circ.textContent = n;
      cell.appendChild(circ);
      grid.appendChild(cell);
    });
  }
}

// ============================================================
// CHIP SELECTOR UI
// ============================================================

function buildChips() {
  const list = document.getElementById('chips-list');
  list.innerHTML = '';
  CHIP_LIST.forEach(chip => {
    const el = document.createElement('div');
    el.className = 'chip-item' + (chip === G.selectedChip ? ' selected' : '');
    el.title = chip.value === -1 ? 'All In' : '$'+chip.value.toLocaleString();
    el.textContent = chip.name;
    el.style.background = `radial-gradient(circle at 35% 35%, ${lighten(chip.color,55)}, ${chip.color})`;
    el.addEventListener('click', () => {
      G.selectedChip = chip;
      buildChips();
      resumeAudio();
      playChipSound();
    });
    list.appendChild(el);
  });
}

function lighten(hex, amt) {
  const n = parseInt(hex.replace('#',''),16);
  const r = Math.min(255,(n>>16)+amt);
  const g = Math.min(255,((n>>8)&0xff)+amt);
  const b = Math.min(255,(n&0xff)+amt);
  return `rgb(${r},${g},${b})`;
}

// ============================================================
// CHIP PLACEMENT ON TABLE
// ============================================================

function getBetZoneCenter(betId) {
  // First try to find the DOM element
  const el = document.querySelector(`[data-bet="${betId}"]`);
  if (!el) return null;
  const tableWrap = document.getElementById('table-wrap');
  const wrapRect = tableWrap.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return {
    x: elRect.left - wrapRect.left + elRect.width/2,
    y: elRect.top  - wrapRect.top  + elRect.height/2
  };
}

function renderChips() {
  const overlay = document.getElementById('chip-overlays');
  overlay.innerHTML = '';
  G.chips.forEach((c, idx) => {
    const chip = CHIP_LIST.find(ch => ch.value === c.value) || CHIP_LIST[0];
    const center = getBetZoneCenter(c.betId);
    if (!center) return;
    const div = document.createElement('div');
    div.className = 'placed-chip';
    div.style.background = chip.color;
    div.style.left = (center.x + (idx % 3)*2) + 'px';
    div.style.top  = (center.y - (Math.floor(idx/3))*2) + 'px';
    div.textContent = chip.name;
    overlay.appendChild(div);
  });
}

// ============================================================
// GAME LOGIC
// ============================================================

function placeBet(betId) {
  if (G.spinning) return;
  if (!BETS[betId]) return;

  let val = G.selectedChip.value;
  if (val === -1) val = G.money;

  if (val <= 0) { toast('Không đủ tiền để đặt!'); return; }
  if (val > G.money) { toast('Số tiền không đủ!'); return; }

  G.money -= val;
  G.bet   += val;
  G.chips.push({ betId, value: val });

  resumeAudio(); playChipSound();
  updateHUD();
  renderChips();
}

function undo() {
  if (G.spinning || G.chips.length === 0) return;
  const last = G.chips.pop();
  G.money += last.value;
  G.bet   -= last.value;
  playChipSound();
  updateHUD(); renderChips();
}

function resetBets() {
  if (G.spinning || G.chips.length === 0) return;
  G.chips.forEach(c => { G.money += c.value; G.bet -= c.value; });
  G.chips = [];
  playResetSound();
  updateHUD(); renderChips();
}

function restoreBets() {
  if (G.spinning) return;
  if (G.lastChips.length === 0) { toast('Không có dữ liệu lần trước!'); return; }
  resetBets();
  G.lastChips.forEach(c => {
    if (c.value <= G.money) {
      G.money -= c.value; G.bet += c.value;
      G.chips.push({...c});
    }
  });
  playChipSound();
  toast('Đã khôi phục cược lần trước');
  updateHUD(); renderChips();
}

function spin() {
  if (G.spinning) return;
  if (G.chips.length === 0) { toast('Hãy đặt chip trước!'); return; }
  resumeAudio();

  G.spinning = true;
  document.getElementById('btn-play').disabled = true;
  document.getElementById('spinning-overlay').classList.add('active');
  document.getElementById('win-display').classList.add('hidden');

  G.lastChips = G.chips.map(c => ({...c}));

  const winNum = Math.floor(Math.random() * 37);
  const spinDur = 7000 + Math.random() * 3000;

  playSpinSound();
  setTimeout(() => playBallSound(spinDur - 1500), 1500);

  spinTo(winNum, spinDur, () => {
    setTimeout(() => finishRound(winNum), 600);
  });
}

function finishRound(winNum) {
  G.lastNum = winNum;
  G.history.unshift(winNum);
  if (G.history.length > 10) G.history.pop();

  // Show win number
  const wd = document.getElementById('win-display');
  wd.textContent = winNum;
  wd.style.background = winNum === 0 ? '#1a6e1a' : RED_NUMS.has(winNum) ? '#c0392b' : '#111';
  wd.style.color = '#f0c840';
  wd.classList.remove('hidden');

  // Calculate payment
  let totalPayout = 0;
  const betTotal = G.bet;

  G.chips.forEach(c => {
    const bet = BETS[c.betId];
    if (bet && bet.nums.includes(winNum)) {
      totalPayout += payoutCalc(bet.nums.length, c.value) + c.value;
    }
  });

  G.money += totalPayout;
  G.bet = 0;
  G.chips = [];

  updateHUD();
  renderChips();
  updateHistory();

  const net = totalPayout - betTotal;

  setTimeout(() => {
    G.spinning = false;
    document.getElementById('btn-play').disabled = false;
    document.getElementById('spinning-overlay').classList.remove('active');

    if (totalPayout > 0) playWinSound();
    else playLoseSound();

    showResult(winNum, net, totalPayout);

    if (G.money <= 0) {
      setTimeout(() => {
        G.money = 5000;
        toast('Bạn phá sản! Nhận thêm $5,000 để tiếp tục 🎁');
        updateHUD();
      }, 3000);
    }
  }, 400);
}

function showResult(num, net, total) {
  const modal = document.getElementById('result-modal');
  const title = document.getElementById('res-title');
  const amt   = document.getElementById('res-amount');
  const numEl = document.getElementById('res-num');

  const color = num === 0 ? '#2ecc71' : RED_NUMS.has(num) ? '#e74c3c' : '#aaa';

  if (net > 0) {
    title.textContent = '🎉 THẮNG!';  title.style.color = '#2ecc71';
    amt.textContent = '+$' + net.toLocaleString(); amt.style.color = '#2ecc71';
  } else if (net === 0) {
    title.textContent = '🤝 HÒA'; title.style.color = '#f0c040';
    amt.textContent = '$0'; amt.style.color = '#f0c040';
  } else {
    title.textContent = '😔 THUA'; title.style.color = '#e74c3c';
    amt.textContent = '-$' + Math.abs(net).toLocaleString(); amt.style.color = '#e74c3c';
  }

  numEl.innerHTML = `Số: <span style="background:${color};color:#f0c840;padding:2px 12px;border-radius:20px;font-weight:bold">${num}</span>`;
  if (total > 0) numEl.innerHTML += `  Nhận: $${total.toLocaleString()}`;

  modal.classList.remove('hidden');
}

// ============================================================
// SAVE / LOAD
// ============================================================

function saveGame() {
  const data = {
    money: G.money, bet: G.bet,
    chips: G.chips, lastChips: G.lastChips,
    history: G.history, lastNum: G.lastNum,
    fortuneUsed: G.fortuneUsed, fortuneDate: G.fortuneDate
  };
  try {
    localStorage.setItem('cRouletteV2', JSON.stringify(data));
    toast('Đã lưu game! 💾');
  } catch(e) { toast('Lỗi khi lưu!'); }
}

function loadGame() {
  try {
    const raw = localStorage.getItem('cRouletteV2');
    if (!raw) { toast('Không có dữ liệu đã lưu!'); return; }
    const d = JSON.parse(raw);
    G.money = d.money||5000; G.bet = d.bet||0;
    G.chips = d.chips||[]; G.lastChips = d.lastChips||[];
    G.history = d.history||[]; G.lastNum = d.lastNum||null;
    G.fortuneUsed = d.fortuneUsed||false;
    G.fortuneDate = d.fortuneDate||null;
    updateHUD(); renderChips(); updateHistory(); checkFortune();
    toast('Đã tải game! 📂');
  } catch(e) { toast('Lỗi khi tải!'); }
}

// ============================================================
// FORTUNE WHEEL
// ============================================================

let fCanvas, fCtx;
let fAngle = 0, fSpinning = false;

function checkFortune() {
  const today = new Date().toDateString();
  if (G.fortuneDate !== today) G.fortuneUsed = false;
  const btn = document.getElementById('fortune-spin-btn');
  btn.disabled = G.fortuneUsed;
  btn.textContent = G.fortuneUsed ? 'Đã nhận hôm nay' : 'QUAY';
}

function drawFortune(angle) {
  const ctx = fCtx;
  const W = fCanvas.width, H = fCanvas.height;
  const cx = W/2, cy = H/2, R = W/2 - 8;
  ctx.clearRect(0, 0, W, H);

  ctx.beginPath(); ctx.arc(cx,cy,R+6,0,Math.PI*2);
  ctx.fillStyle='#8B6914'; ctx.fill();

  const N = FORTUNE_PRIZES.length, sA = Math.PI*2/N;
  for (let i=0;i<N;i++){
    const s = angle + i*sA, e = s + sA;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,R,s,e); ctx.closePath();
    ctx.fillStyle = FORTUNE_COLORS[i]; ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
    const mid = s+sA/2;
    const tx = cx+Math.cos(mid)*R*0.65, ty = cy+Math.sin(mid)*R*0.65;
    ctx.save(); ctx.translate(tx,ty); ctx.rotate(mid+Math.PI/2);
    ctx.fillStyle='#fff'; ctx.font=`bold ${Math.max(9,R*0.1)}px Arial`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const p = FORTUNE_PRIZES[i];
    ctx.fillText(p>=1000?`${p/1000}K`:String(p),0,0);
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(cx,cy,R*0.14,0,Math.PI*2);
  ctx.fillStyle='#f0c840'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx,cy-R-2); ctx.lineTo(cx-9,cy-R-18); ctx.lineTo(cx+9,cy-R-18);
  ctx.closePath(); ctx.fillStyle='#f0c840'; ctx.fill();
}

function spinFortune() {
  if (fSpinning || G.fortuneUsed) return;
  fSpinning = true;
  document.getElementById('fortune-spin-btn').disabled = true;

  const prizeIdx = Math.floor(Math.random() * FORTUNE_PRIZES.length);
  const N = FORTUNE_PRIZES.length, sA = Math.PI*2/N;
  const target = -Math.PI/2 - prizeIdx*sA - sA/2;
  const start = fAngle, end = target - Math.PI*2*(6+Math.floor(Math.random()*3));
  const dur = 4500, t0 = performance.now();

  function ease(t){ return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2; }
  function frame(now){
    const t = Math.min((now-t0)/dur,1);
    fAngle = start+(end-start)*ease(t);
    drawFortune(fAngle);
    if(t<1){ requestAnimationFrame(frame); }
    else {
      fSpinning=false;
      const prize = FORTUNE_PRIZES[prizeIdx];
      G.money += prize; G.fortuneUsed=true;
      G.fortuneDate = new Date().toDateString();
      document.getElementById('fortune-result').textContent=`🎉 +$${prize.toLocaleString()}!`;
      document.getElementById('fortune-spin-btn').textContent='Đã nhận hôm nay';
      playFortuneSound();
      updateHUD(); saveGame();
    }
  }
  playSpinSound();
  requestAnimationFrame(frame);
}

// ============================================================
// HUD / HISTORY
// ============================================================

function updateHUD() {
  document.getElementById('money-val').textContent = G.money.toLocaleString();
  document.getElementById('bet-val').textContent   = G.bet.toLocaleString();
}

function updateHistory() {
  const el = document.getElementById('last-nums');
  el.innerHTML = '';
  G.history.slice(0,8).forEach(n => {
    const d = document.createElement('div');
    d.className = 'ln ' + (n===0?'g': RED_NUMS.has(n)?'r':'b');
    d.textContent = n;
    el.appendChild(d);
  });
}

// ============================================================
// TOAST
// ============================================================

let _toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.opacity = '1';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.classList.add('hidden'), 400);
  }, 2200);
}

// ============================================================
// EVENT BINDING
// ============================================================

function bindEvents() {
  // Bet zones (click)
  document.addEventListener('click', e => {
    const zone = e.target.closest('.bet-zone');
    if (zone && zone.dataset.bet) placeBet(zone.dataset.bet);
  });

  // Highlight on hover
  document.addEventListener('mouseover', e => {
    const zone = e.target.closest('.bet-zone');
    document.querySelectorAll('.bet-zone.hover-hl').forEach(el => el.classList.remove('hover-hl'));
    if (zone) zone.classList.add('hover-hl');
  });
  document.addEventListener('mouseleave', () => {
    document.querySelectorAll('.bet-zone.hover-hl').forEach(el => el.classList.remove('hover-hl'));
  }, true);

  // Touch highlight
  document.addEventListener('touchstart', e => {
    const zone = e.target.closest('.bet-zone');
    document.querySelectorAll('.bet-zone.hover-hl').forEach(el => el.classList.remove('hover-hl'));
    if (zone) zone.classList.add('hover-hl');
  }, {passive:true});

  // Controls
  document.getElementById('btn-play').addEventListener('click', () => { resumeAudio(); spin(); });
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-reset').addEventListener('click', resetBets);
  document.getElementById('btn-restore').addEventListener('click', restoreBets);
  document.getElementById('btn-save').addEventListener('click', () => { resumeAudio(); saveGame(); });
  document.getElementById('btn-load').addEventListener('click', loadGame);

  document.getElementById('btn-music').addEventListener('click', () => {
    resumeAudio();
    G.musicOn = !G.musicOn;
    document.getElementById('btn-music').textContent = G.musicOn ? '🔊' : '🔇';
    if (G.musicOn) startBGMusic(); else stopBGMusic();
    toast(G.musicOn ? 'Đã bật âm thanh' : 'Đã tắt âm thanh');
  });

  // Fortune
  document.getElementById('reward-btn').addEventListener('click', () => {
    resumeAudio();
    checkFortune();
    document.getElementById('fortune-result').textContent = '';
    drawFortune(fAngle);
    document.getElementById('fortune-modal').classList.remove('hidden');
  });
  document.getElementById('fortune-spin-btn').addEventListener('click', spinFortune);
  document.getElementById('fortune-close-btn').addEventListener('click', () => {
    document.getElementById('fortune-modal').classList.add('hidden');
  });

  // Result modal
  document.getElementById('res-close-btn').addEventListener('click', () => {
    document.getElementById('result-modal').classList.add('hidden');
  });

  // Resize
  window.addEventListener('resize', () => {
    clearTimeout(window._rsz);
    window._rsz = setTimeout(() => {
      setWheelSize();
      drawWheel(wAngle);
      renderChips();
    }, 200);
  });

  // Fortune timer
  setInterval(updateFortuneTimer, 1000);
}

function updateFortuneTimer() {
  const el = document.getElementById('fortune-timer');
  if (!G.fortuneUsed) { el.textContent = 'Sẵn sàng!'; return; }
  const now = new Date(), midnight = new Date();
  midnight.setHours(24,0,0,0);
  const diff = midnight - now;
  const h = Math.floor(diff/3600000);
  const m = Math.floor((diff%3600000)/60000);
  const s = Math.floor((diff%60000)/1000);
  el.textContent = `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ============================================================
// INIT
// ============================================================

function init() {
  // Initialize canvas elements (must be inside init so DOM is ready)
  wCanvas = document.getElementById('wheel-canvas');
  wCtx = wCanvas.getContext('2d');
  fCanvas = document.getElementById('fortune-canvas');
  fCtx = fCanvas.getContext('2d');

  initAudio();
  setWheelSize();
  buildTable();
  buildChips();
  updateHUD();
  updateHistory();
  checkFortune();
  bindEvents();
  startIdleWheel();

  // Start background music after first interaction
  document.addEventListener('click', () => {
    resumeAudio();
    if (G.musicOn && bgNodes.length === 0) startBGMusic();
  }, {once: true});

  setTimeout(() => toast('Chào mừng đến Casino Roulette! 🎰'), 600);
}

window.addEventListener('DOMContentLoaded', init);
