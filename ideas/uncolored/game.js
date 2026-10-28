// game.js: map, camera, painting, collecting, fog and the main loop.
'use strict';

const VIEW_H = 900, VIEW_W_MAX = 1700, PEEK_X = 260, PEEK_Y = 200;
const EDGE = 100, EDGE_PAINTING = 30, EDGE_SPEED = 1100, KEY_SPEED = 900, DRAG_SLOP = 6;
const BRUSH_R = 22, ERASER_R = 46, CELL = 4, MASK_RES = 1.5;
const PAPER = '#f6f2e8';

const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const HIT = document.createElement('canvas').getContext('2d');
const $ = id => document.getElementById(id);

const S = {
  started: false, won: false, time: 0, playTime: 0,
  cam: { x: 0, y: 0 }, view: { w: 0, h: 0, scale: 1, dpr: 1 },
  tool: null, paints: { red: false, yellow: false, blue: false },
  keys: 0, round: 0, given: 0,
  regions: [], grid: [[], [], []], objects: [], pots: [], npc: null, scenery: [], labels: [],
  backpack: [], trails: [], fx: [],
  ptr: { x: 0, y: 0, inside: false, overUI: false, down: false, lwx: 0, lwy: 0, downAt: 0, downX: 0, downY: 0, downObj: null, speed: 0, travel: 0 },
  pan: null, glide: null,
  held: new Set(), panelOpen: false, camMoved: false, hints: {},
};

const BRISTLE = { mask: makeBristle('#000') };
for (const c of ['red', 'yellow', 'blue']) BRISTLE[c] = makeBristle(COLORS[c].fill);

// ---------- sound (synthesized placeholders) ----------
const Sfx = {
  ac: null, master: null, scratchGain: null, muted: false,
  init() {
    if (this.ac) return;
    try {
      const ac = this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.master = ac.createGain(); this.master.connect(ac.destination);
      const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.7;
      this.scratchGain = ac.createGain(); this.scratchGain.gain.value = 0;
      src.connect(bp); bp.connect(this.scratchGain); this.scratchGain.connect(this.master); src.start();
    } catch (e) { this.ac = null; }
  },
  tone(freq, dur, type = 'sine', vol = 0.15, delay = 0, slide = 0) {
    if (!this.ac || this.muted) return;
    const ac = this.ac, t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  pop() { this.tone(520, 0.14, 'sine', 0.2, 0, 420); },
  settle() { this.tone(300, 0.18, 'triangle', 0.1, 0, -60); },
  chime() { this.tone(880, 0.5, 'triangle', 0.12); this.tone(1320, 0.7, 'triangle', 0.08, 0.09); },
  unlock() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.12, i * 0.09)); },
  success() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.55, 'triangle', 0.13, i * 0.11)); },
  nope() { this.tone(190, 0.22, 'sine', 0.14, 0, -50); },
  scratch(level) {
    if (!this.scratchGain) return;
    this.scratchGain.gain.setTargetAtTime(this.muted ? 0 : level * 0.06, this.ac.currentTime, 0.05);
  },
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 1; },
};

// ---------- world setup ----------
function buildTypeGrids() {
  for (const k in TYPES) {
    const t = TYPES[k], bb = t.bb, gw = Math.ceil(bb.w / CELL), gh = Math.ceil(bb.h / CELL);
    const inside = new Uint8Array(gw * gh), list = [];
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      if (HIT.isPointInPath(t.path, bb.x + (i + 0.5) * CELL, bb.y + (j + 0.5) * CELL)) { inside[j * gw + i] = 1; list.push(j * gw + i); }
    }
    t.grid = { gw, gh, inside, list: Int32Array.from(list) };
  }
}

function buildWorld() {
  buildTypeGrids();
  let id = 1;
  for (const L of LEVEL) {
    const reg = { col: L.col, row: L.row, x0: L.col * RW, y0: (2 - L.row) * RH, unlocked: L.col === 0 && L.row === 0, fog: 1, L };
    if (reg.unlocked) reg.fog = 0;
    S.regions.push(reg); S.grid[L.row][L.col] = reg;
    const avoid = [];
    for (const [key, lx, ly] of L.items) {
      const [x, y] = regionToWorld(L.col, L.row, lx, ly), type = TYPES[key], s = sizeAt(x, y), n = type.grid.gw * type.grid.gh;
      const o = { id: id++, type, x, y, s, seed: (id * 7.31) % 10, reg, cells: new Float32Array(n), bits: new Uint8Array(n),
        mask: null, tint: null, tintDirty: false, dirty: false, filled: false, blank: true, mixKey: null, colorKey: 'white',
        refined: false, correct: false, pop: 0, coverage: 0, collected: false };
      updateState(o, true);
      S.objects.push(o); avoid.push([x, y, 70 * s]);
    }
    if (L.pot) { const [x, y] = regionToWorld(L.col, L.row, L.pot[1], L.pot[2]); S.pots.push({ color: L.pot[0], x, y, taken: false, reg }); avoid.push([x, y, 110]); }
    if (L.npc) { const [x, y] = regionToWorld(L.col, L.row, L.npc[0], L.npc[1]); S.npc = { x, y }; avoid.push([x - 10, y - 70, 130], [x + 30, y - 230, 190]); }
    const [lx, ly] = regionToWorld(L.col, L.row, L.label[0], L.label[1]);
    S.labels.push({ x: lx, y: ly, zh: L.zh, en: L.en }); avoid.push([lx, ly, 180]);
    for (const st of makeScenery(L.theme, reg.x0, reg.y0, RW, RH, 1000 + L.col * 31 + L.row * 97, avoid)) { st.bb = bboxOf(st.pts); S.scenery.push(st); }
  }
}

// ---------- camera ----------
const unlockedAt = (c, r) => c >= 0 && c < 3 && r >= 0 && r < 3 && S.grid[r][c].unlocked;

// The view centre must sit in an unlocked region, and the view may only look
// PEEK units into a locked neighbour (0 past the map edge).
function camAllowed(cx, cy) {
  const { w, h } = S.view;
  if (cx - w / 2 < -0.01 || cx + w / 2 > MAP_W + 0.01 || cy - h / 2 < -0.01 || cy + h / 2 > MAP_H + 0.01) return false;
  const c = Math.min(2, Math.max(0, Math.floor(cx / RW))), r = Math.min(2, Math.max(0, 2 - Math.floor(cy / RH)));
  if (!unlockedAt(c, r)) return false;
  const x0 = c * RW, y0 = (2 - r) * RH;
  if (!unlockedAt(c - 1, r) && cx - w / 2 < x0 - (c > 0 ? PEEK_X : 0)) return false;
  if (!unlockedAt(c + 1, r) && cx + w / 2 > x0 + RW + (c < 2 ? PEEK_X : 0)) return false;
  if (!unlockedAt(c, r + 1) && cy - h / 2 < y0 - (r < 2 ? PEEK_Y : 0)) return false;
  if (!unlockedAt(c, r - 1) && cy + h / 2 > y0 + RH + (r > 0 ? PEEK_Y : 0)) return false;
  return true;
}

function tryMove(dx, dy) {
  if (!dx && !dy) return;
  const c = S.cam;
  let lo = 0;
  if (camAllowed(c.x + dx, c.y + dy)) lo = 1;
  else { let hi = 1; for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (camAllowed(c.x + dx * m, c.y + dy * m)) lo = m; else hi = m; } }
  if (lo > 0) { c.x += dx * lo; c.y += dy * lo; S.camMoved = true; }
}

function repairCamera() {
  const c = S.cam, { w, h } = S.view;
  if (camAllowed(c.x, c.y)) return;
  let best = null, bd = Infinity;
  for (const reg of S.regions) if (reg.unlocked) {
    const d = Math.hypot(reg.x0 + RW / 2 - c.x, reg.y0 + RH / 2 - c.y);
    if (d < bd) { bd = d; best = reg; }
  }
  c.x = Math.min(Math.max(c.x, best.x0 + w / 2), best.x0 + RW - w / 2);
  c.y = Math.min(Math.max(c.y, best.y0 + h / 2), best.y0 + RH - h / 2);
}

function updateCamera(dt) {
  let vx = 0, vy = 0;
  const p = S.ptr, W = innerWidth, H = innerHeight;
  // edge band: speed ramps up toward the screen edge; narrow while painting, off over HUD buttons
  if (p.inside && !p.overUI && !S.pan && !S.panelOpen) {
    const band = p.down ? EDGE_PAINTING : EDGE;
    const push = d => d < band ? ((band - Math.max(0, d)) / band) ** 1.5 : 0;
    vx = (push(W - p.x) - push(p.x)) * EDGE_SPEED;
    vy = (push(H - p.y) - push(p.y)) * EDGE_SPEED;
  }
  const g = S.glide;
  if (g) {
    vx += g.vx; vy += g.vy;
    const f = Math.exp(-dt * 6);
    g.vx *= f; g.vy *= f;
    if (Math.hypot(g.vx, g.vy) < 15) S.glide = null;
  }
  const k = S.held;
  if (!S.panelOpen) {
    if (k.has('arrowleft') || k.has('a')) vx -= KEY_SPEED;
    if (k.has('arrowright') || k.has('d')) vx += KEY_SPEED;
    if (k.has('arrowup') || k.has('w')) vy -= KEY_SPEED;
    if (k.has('arrowdown') || k.has('s')) vy += KEY_SPEED;
  }
  tryMove(vx * dt, 0);
  tryMove(0, vy * dt);
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const scale = Math.max(H / VIEW_H, W / VIEW_W_MAX);
  S.view = { w: W / scale, h: H / scale, scale, dpr };
  repairCamera();
  if (S.panelOpen) Panel.layout();
}
const screenToWorld = (sx, sy) => [S.cam.x - S.view.w / 2 + sx / S.view.scale, S.cam.y - S.view.h / 2 + sy / S.view.scale];
const worldToScreen = (wx, wy) => [(wx - S.cam.x + S.view.w / 2) * S.view.scale, (wy - S.cam.y + S.view.h / 2) * S.view.scale];

// ---------- painting ----------
function makeMask(o) {
  const bb = o.type.bb, w = Math.max(4, Math.ceil(bb.w * o.s * MASK_RES)), h = Math.max(4, Math.ceil(bb.h * o.s * MASK_RES));
  o.mask = document.createElement('canvas'); o.mask.width = w; o.mask.height = h; o.mctx = o.mask.getContext('2d');
  o.tint = document.createElement('canvas'); o.tint.width = w; o.tint.height = h; o.tctx = o.tint.getContext('2d');
}

function dabObject(o, wx, wy, R, tool) {
  const t = o.type, g = t.grid, bb = t.bb, s = o.s;
  const lx = (wx - o.x) / s, ly = (wy - o.y) / s, lr = R / s, bit = PAINT_BITS[tool] || 0;
  const i0 = Math.max(0, Math.floor((lx - lr - bb.x) / CELL)), i1 = Math.min(g.gw - 1, Math.floor((lx + lr - bb.x) / CELL));
  const j0 = Math.max(0, Math.floor((ly - lr - bb.y) / CELL)), j1 = Math.min(g.gh - 1, Math.floor((ly + lr - bb.y) / CELL));
  let hit = false;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const idx = j * g.gw + i;
    if (!g.inside[idx]) continue;
    const d = Math.hypot(bb.x + (i + 0.5) * CELL - lx, bb.y + (j + 0.5) * CELL - ly) / lr;
    if (d >= 1) continue;
    hit = true;
    if (tool === 'eraser') {
      o.cells[idx] *= 1 - 0.6 * (d < 0.7 ? 1 : (1 - d) / 0.3);
      if (o.cells[idx] < 0.05) { o.cells[idx] = 0; o.bits[idx] = 0; }
    } else {
      o.cells[idx] += (1 - o.cells[idx]) * 0.09 * (1 - d) * (0.6 + 0.8 * Math.random());
      o.bits[idx] |= bit;
    }
  }
  if (!hit) return;
  if (!o.mask) makeMask(o);
  const m = o.mctx, mx = (lx - bb.x) * s * MASK_RES, my = (ly - bb.y) * s * MASK_RES, rp = R * MASK_RES;
  if (tool === 'eraser') {
    m.globalCompositeOperation = 'destination-out'; m.globalAlpha = 0.7;
    const gr = m.createRadialGradient(mx, my, rp * 0.5, mx, my, rp);
    gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = gr; m.beginPath(); m.arc(mx, my, rp, 0, TAU); m.fill();
  } else {
    m.globalCompositeOperation = 'source-over'; m.globalAlpha = 0.2;
    m.save(); m.translate(mx, my); m.rotate(Math.random() * TAU);
    m.drawImage(BRISTLE.mask, -rp * 1.07, -rp * 1.07, rp * 2.14, rp * 2.14); m.restore();
  }
  m.globalAlpha = 1; m.globalCompositeOperation = 'source-over';
  o.dirty = true; o.tintDirty = true;
}

function paintAt(wx, wy) {
  const tool = S.tool, R = tool === 'eraser' ? ERASER_R : BRUSH_R;
  for (const o of S.objects) {
    if (o.collected || !o.reg.unlocked) continue;
    const bb = o.type.bb, s = o.s;
    if (wx + R < o.x + bb.x * s || wx - R > o.x + (bb.x + bb.w) * s || wy + R < o.y + bb.y * s || wy - R > o.y + (bb.y + bb.h) * s) continue;
    dabObject(o, wx, wy, R, tool);
  }
  if (tool !== 'eraser') S.trails.push({ x: wx, y: wy, t: S.time, rot: Math.random() * TAU, color: tool });
  if (S.trails.length > 900) S.trails.splice(0, S.trails.length - 900);
}

// Recompute mix, settling and correctness from the paint grid.
function updateState(o, silent) {
  const list = o.type.grid.list, N = list.length;
  let painted = 0, any = 0, c1 = 0, c2 = 0, c4 = 0;
  for (let k = 0; k < N; k++) {
    const idx = list[k], a = o.cells[idx];
    if (a >= 0.8) painted++;
    if (a > 0.05) { any++; const b = o.bits[idx]; if (b & 1) c1++; if (b & 2) c2++; if (b & 4) c4++; }
  }
  const thr = Math.max(2, 0.03 * N);
  let bits = (c1 >= thr ? 1 : 0) | (c2 >= thr ? 2 : 0) | (c4 >= thr ? 4 : 0);
  if (!bits && any) bits = c1 >= c2 && c1 >= c4 ? 1 : c2 >= c4 ? 2 : 4;
  if (!o.filled && painted >= 0.9 * N) {
    for (let k = 0; k < N; k++) { o.cells[list[k]] = 1; o.bits[list[k]] |= bits; }
    painted = any = N; o.filled = true;
    if (o.mctx) { o.mctx.fillStyle = '#000'; o.mctx.fillRect(0, 0, o.mask.width, o.mask.height); }
  } else if (o.filled && painted < 0.9 * N) o.filled = false;
  const mixKey = bits ? MIX[bits] : null;
  if (mixKey !== o.mixKey) o.tintDirty = true;
  o.mixKey = mixKey;
  o.coverage = painted / N;
  o.blank = !o.filled && any <= 0.04 * N;
  o.colorKey = o.blank ? 'white' : (mixKey || 'white');
  const refined = o.filled || (o.blank && o.type.color === 'white');
  const correct = refined && o.colorKey === o.type.color;
  if (!silent) {
    if (refined && !o.refined) { o.pop = 1; if (!correct) { Sfx.settle(); hint('wrong', '颜色不对就不会发光：用橡皮擦掉再涂<small>No glow means the color is wrong: erase it and try again.</small>'); } }
    if (correct && !o.correct) {
      Sfx.chime(); sparkle(o);
      hint('correct', '它在发光！右键放下画笔，再点击它收进背包<small>It glows! Right-click to put the brush away, then click it to collect.</small>');
    }
  }
  o.refined = refined; o.correct = correct;
}

function retint(o) {
  const t = o.tctx;
  t.globalCompositeOperation = 'copy'; t.drawImage(o.mask, 0, 0);
  t.globalCompositeOperation = 'source-in'; t.fillStyle = COLORS[o.mixKey].fill; t.fillRect(0, 0, o.tint.width, o.tint.height);
  t.globalCompositeOperation = 'source-over';
  o.tintDirty = false;
}

// Lay dabs at even spacing from the last dab to the pointer. Called on every
// pointer move and every frame (the camera may scroll under a still pointer).
function strokeTo(sx, sy) {
  const p = S.ptr;
  if (!p.down || !S.tool) return;
  const [wx, wy] = screenToWorld(sx, sy), dx = wx - p.lwx, dy = wy - p.lwy, dist = Math.hypot(dx, dy);
  const step = S.tool === 'eraser' ? 8 : 5;
  if (dist < step) return;
  const n = Math.floor(dist / step), ux = dx / dist, uy = dy / dist;
  for (let i = 1; i <= n; i++) paintAt(p.lwx + ux * step * i, p.lwy + uy * step * i);
  p.lwx += ux * step * n; p.lwy += uy * step * n; p.travel += n * step;
}

function updatePainting(dt) {
  const p = S.ptr;
  strokeTo(p.x, p.y);
  p.speed += ((dt > 0 ? p.travel / dt : 0) - p.speed) * 0.3;
  p.travel = 0;
  Sfx.scratch(p.down && S.tool ? Math.min(1, p.speed / 1400) : 0);
  for (const o of S.objects) if (o.dirty) { o.dirty = false; updateState(o, false); }
}

// ---------- picking things ----------
function objectAt(wx, wy) {
  for (let i = S.objects.length - 1; i >= 0; i--) {
    const o = S.objects[i];
    if (o.collected || !o.reg.unlocked) continue;
    if (HIT.isPointInPath(o.type.path, (wx - o.x) / o.s, (wy - o.y) / o.s)) return o;
  }
  return null;
}
const potAt = (wx, wy) => S.pots.find(p => !p.taken && p.reg.unlocked && Math.hypot(p.x - wx, p.y - wy) < 50);
function npcAt(wx, wy) {
  const n = S.npc;
  return (wx > n.x - 95 && wx < n.x + 75 && wy > n.y - 140 && wy < n.y + 10) || (S.bubble && wx > S.bubble.x && wx < S.bubble.x + S.bubble.w && wy > S.bubble.y && wy < S.bubble.y + S.bubble.h);
}

function collect(o) {
  o.collected = true;
  S.backpack.push({ id: o.id, type: o.type.key, s: o.s, color: o.colorKey });
  const [sx, sy] = worldToScreen(o.x, o.y), r = $('bagStat').getBoundingClientRect();
  S.fx.push({ kind: 'fly', type: o.type, color: o.colorKey, s: o.s * S.view.scale, sx, sy, tx: r.left + r.width / 2, ty: r.top + r.height / 2, t0: S.time, dur: 0.7 });
  Sfx.pop(); updateHud();
  hint('collect', '收进背包了！集够了就去找左下角的小家伙<small>Collected! Take your finds to the creature at the bottom left.</small>');
}

function takePot(p) {
  p.taken = true; S.paints[p.color] = true;
  const [sx, sy] = worldToScreen(p.x, p.y), r = document.querySelector(`.slot[data-tool="${p.color}"]`).getBoundingClientRect();
  S.fx.push({ kind: 'blob', color: p.color, sx, sy, tx: r.left + r.width / 2, ty: r.top + r.height / 2, t0: S.time, dur: 0.8 });
  Sfx.unlock(); updateHud();
  const n = { red: 1, yellow: 2, blue: 3 }[p.color];
  toast(`获得<b style="color:${COLORS[p.color].fill}">${COLOR_ZH[p.color]}色</b>颜料！点左上角的颜料或按 <kbd>${n}</kbd> 拿起画笔<small>Got ${p.color} paint! Click it at the top left or press ${n}.</small>`, 5000);
}

function setTool(tool) {
  if (tool && tool !== 'eraser' && !S.paints[tool]) { toast(`还没找到${COLOR_ZH[tool]}色颜料<small>You have not found ${tool} paint yet.</small>`); Sfx.nope(); return; }
  S.tool = S.tool === tool ? null : tool;
  S.ptr.down = false;
  updateHud();
}

// ---------- fog and unlocking ----------
function unlockRegion(reg) {
  if (S.keys < 1) {
    Sfx.nope();
    toast('还没有钥匙：帮左下角的小家伙填满背包来获得<small>No keys yet: fill the creature\'s bag to earn some.</small>');
    return;
  }
  S.keys--; reg.unlocked = true; Sfx.unlock(); updateHud();
  toast(`解锁了新区域：<b>${reg.L.zh}</b><small>Unlocked: ${reg.L.en}</small>`);
}

const unlockButtons = [];
function updateUnlockButtons() {
  const { w, h, scale } = S.view, vx0 = S.cam.x - w / 2, vy0 = S.cam.y - h / 2, vx1 = vx0 + w, vy1 = vy0 + h;
  const spots = [];
  if (S.started && !S.panelOpen && !S.won) for (const L of S.regions) {
    if (L.unlocked) continue;
    let best = null;
    for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (!unlockedAt(L.col + dc, L.row + dr)) continue;
      let x, y, len;
      if (dc) {
        const bx = dc < 0 ? L.x0 : L.x0 + RW, depth = dc < 0 ? vx1 - bx : bx - vx0;
        const ya = Math.max(L.y0, vy0), yb = Math.min(L.y0 + RH, vy1);
        len = yb - ya;
        if (depth < 110 || len < 160) continue;
        x = bx + (dc < 0 ? 1 : -1) * Math.min(depth, 400) / 2; y = (ya + yb) / 2;
      } else {
        const by = dr < 0 ? L.y0 + RH : L.y0, depth = dr < 0 ? by - vy0 : vy1 - by;
        const xa = Math.max(L.x0, vx0), xb = Math.min(L.x0 + RW, vx1);
        len = xb - xa;
        if (depth < 90 || len < 220) continue;
        x = (xa + xb) / 2; y = by + (dr < 0 ? -1 : 1) * Math.min(depth, 400) / 2;
      }
      if (!best || len > best.len) best = { x, y, len, L };
    }
    if (best) spots.push(best);
  }
  while (unlockButtons.length < spots.length) {
    const b = document.createElement('button');
    b.className = 'unlock';
    b.addEventListener('click', () => { if (b._reg) unlockRegion(b._reg); });
    $('unlockLayer').appendChild(b); unlockButtons.push(b);
  }
  unlockButtons.forEach((b, i) => {
    const sp = spots[i];
    if (!sp) { b.style.display = 'none'; b._reg = null; return; }
    const html = `${KEY_SVG}<span>解锁${sp.L.L.zh}<small>需要 1 把钥匙 · Unlock: 1 key</small></span>`;
    if (b._html !== html) { b.innerHTML = html; b._html = html; }
    b._reg = sp.L;
    b.classList.toggle('poor', S.keys < 1);
    b.style.display = '';
    // keep clear of the HUD row at the top, the help bar at the bottom and the screen edges
    const hw = b.offsetWidth / 2, hh = b.offsetHeight / 2;
    const sx = Math.min(Math.max((sp.x - vx0) * scale, hw + 16), innerWidth - hw - 16);
    const sy = Math.min(Math.max((sp.y - vy0) * scale, 140 + hh), innerHeight - 100 - hh);
    b.style.transform = `translate(${sx - hw}px, ${sy - hh}px)`;
  });
}

function drawFog(reg, vx0, vy0, vx1, vy1) {
  const F = 170, x0 = reg.x0, y0 = reg.y0, x1 = x0 + RW, y1 = y0 + RH;
  if (x1 + F < vx0 || x0 - F > vx1 || y1 + F < vy0 || y0 - F > vy1) return;
  const core = 'rgba(224,226,231,0.97)', clear = 'rgba(224,226,231,0)';
  ctx.save();
  ctx.globalAlpha = reg.fog;
  ctx.fillStyle = core; ctx.fillRect(x0, y0, RW, RH);
  const side = (gx0, gy0, gx1, gy1, rx, ry, rw, rh) => {
    const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1); g.addColorStop(0, clear); g.addColorStop(1, core);
    ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
  };
  side(x0 - F, 0, x0, 0, x0 - F, y0, F, RH);
  side(x1 + F, 0, x1, 0, x1, y0, F, RH);
  side(0, y0 - F, 0, y0, x0, y0 - F, RW, F);
  side(0, y1 + F, 0, y1, x0, y1, RW, F);
  // drifting puffs, kept inside the region so neighbouring fog banks do not stack
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, RW, RH); ctx.clip();
  for (let i = 0; i < 16; i++) {
    const r = 170 + (i * 53) % 120;
    const px = x0 - 150 + ((i * 397 + S.time * (10 + (i % 5) * 4)) % (RW + 300)), py = y0 + ((i * 613) % RH);
    if (px + r < vx0 || px - r > vx1 || py + r < vy0 || py - r > vy1) continue;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
  }
  ctx.restore();
  // a sketched, scalloped cloud bank along borders that face unlocked land
  ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  for (const [dc, dr, ax, ay, bx, by, nx, ny] of [[-1, 0, x0, y0, x0, y1, -1, 0], [1, 0, x1, y0, x1, y1, 1, 0], [0, 1, x0, y0, x1, y0, 0, -1], [0, -1, x0, y1, x1, y1, 0, 1]]) {
    if (!unlockedAt(reg.col + dc, reg.row + dr)) continue;
    const len = Math.hypot(bx - ax, by - ay), n = Math.round(len / 80), seg = len / n, ux = (bx - ax) / len, uy = (by - ay) / len;
    for (let i = 0; i < n; i++) {
      const d = (i + 0.5) * seg, wob = 5 * Math.sin(S.time * 1.3 + i * 1.7);
      const cx = ax + ux * d + nx * wob, cy = ay + uy * d + ny * wob, r = seg / 2 + 8 + 6 * Math.sin(i * 2.3);
      if (cx + r < vx0 || cx - r > vx1 || cy + r < vy0 || cy - r > vy1) continue;
      const an = Math.atan2(ny, nx);
      ctx.beginPath(); ctx.arc(cx, cy, r, an - Math.PI / 2, an + Math.PI / 2); ctx.closePath();
      ctx.fillStyle = core; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, r, an - Math.PI / 2 + 0.15, an + Math.PI / 2 - 0.15);
      ctx.strokeStyle = 'rgba(130,134,145,0.5)'; ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(130,134,145,0.35)'; ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    const cx = x0 + 200 + ((i * 731) % (RW - 400)) + Math.sin(S.time * 0.4 + i) * 30, cy = y0 + 160 + ((i * 457) % (RH - 320));
    if (cx + 120 < vx0 || cx - 120 > vx1 || cy + 60 < vy0 || cy - 60 > vy1) continue;
    ctx.beginPath();
    for (let a = 0; a <= 1; a += 0.04) {
      const ang = Math.PI * (1 + a * 1.6), rr = 26 + a * 40;
      ctx.lineTo(cx + Math.cos(ang) * rr * 1.8, cy + Math.sin(ang) * rr * 0.8);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- effects, HUD, hints ----------
function sparkle(o) {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * TAU, sp = 80 + Math.random() * 140;
    S.fx.push({ kind: 'spark', x: o.x, y: o.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, t0: S.time, dur: 0.6 + Math.random() * 0.4 });
  }
}

function toast(html, ms = 3400) {
  const box = $('toasts'), d = document.createElement('div');
  d.className = 'toast'; d.innerHTML = html; box.appendChild(d);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => d.classList.add('out'), ms);
  setTimeout(() => d.remove(), ms + 600);
}
function hint(key, html) { if (S.hints[key]) return; S.hints[key] = true; toast(html, 5500); }

const KEY_SVG = '<svg viewBox="0 0 32 32" class="ico"><circle cx="10" cy="16" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M16.5 16h12M24 16v5M28 16v4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

function updateHud() {
  document.querySelectorAll('.slot').forEach(b => {
    const t = b.dataset.tool;
    b.classList.toggle('locked', t !== 'eraser' && !S.paints[t]);
    b.classList.toggle('active', S.tool === t);
  });
  $('keysN').textContent = S.keys;
  $('bagN').textContent = S.backpack.length;
  $('roundN').textContent = `${Math.min(S.round + 1, BAGS.length)}/${BAGS.length}`;
  cv.style.cursor = S.tool ? 'none' : '';
}

function bump(id) { const el = $(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

// ---------- rendering ----------
const GRAIN = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = rng(42);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(90,80,60,${0.02 + r() * 0.05})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 1.5, 1 + r() * 1.5); }
  g.strokeStyle = 'rgba(90,80,60,0.05)';
  for (let i = 0; i < 40; i++) { const x = r() * 256, y = r() * 256, a = r() * TAU; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); g.stroke(); }
  return c;
})();
let grainPattern = null;

function drawObject(o) {
  const s = o.s * (o.pop > 0 ? 1 + 0.12 * Math.sin(o.pop * Math.PI) : 1);
  if (o.refined) {
    ctx.save(); ctx.translate(o.x, o.y); ctx.scale(s, s);
    drawRefined(ctx, o.type, o.colorKey, s, { glow: o.correct ? (12 + 9 * Math.sin(S.time * 4 + o.seed)) * S.view.dpr * S.view.scale : 0 });
    ctx.restore();
    return;
  }
  if (o.mask && o.mixKey) {
    if (o.tintDirty) retint(o);
    const bb = o.type.bb;
    ctx.save(); ctx.translate(o.x, o.y); ctx.scale(s, s); ctx.clip(o.type.path);
    ctx.drawImage(o.tint, bb.x, bb.y, bb.w, bb.h);
    ctx.restore();
  }
  drawDoodle(ctx, o.type, o.x, o.y, s, o.seed, S.time);
}

function drawBubble() {
  const n = S.npc, lines = ['收集地图上的东西，', '填满我的背包，获得奖励！'];
  const bag = BAGS[S.round], reward = !bag ? '谢谢你！' : bag.reward === 'trophy' ? '奖励：奖杯' : `奖励：钥匙 × ${bag.reward}`;
  ctx.font = '600 22px "KaiTi","STKaiti","Kaiti SC","Microsoft YaHei",sans-serif';
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 44, h = 128, x = n.x - 40, y = n.y - 300 + Math.sin(S.time * 1.7) * 4;
  S.bubble = { x, y, w, h: h + 30 };
  ctx.fillStyle = '#fffdf8'; ctx.strokeStyle = '#2f4a6a'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.moveTo(x + 70, y + h); ctx.lineTo(x + 84, y + h + 26); ctx.lineTo(x + 100, y + h);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fffdf8'; ctx.fillRect(x + 72, y + h - 3, 26, 5);
  ctx.fillStyle = '#2f3a4a'; ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, x + 22, y + 16 + i * 28));
  ctx.font = '15px "Segoe UI",sans-serif'; ctx.fillStyle = '#7a7468';
  ctx.fillText('Fill my bag, get a reward', x + 22, y + 74);
  ctx.font = '600 18px "KaiTi","STKaiti","Kaiti SC","Microsoft YaHei",sans-serif'; ctx.fillStyle = '#b8860b';
  ctx.fillText(reward + (bag ? '  · 点我' : ''), x + 22, y + 98);
}

function drawCursor() {
  if (!S.tool || !S.ptr.inside || S.panelOpen || (S.pan && S.pan.moved)) return;
  const { scale, dpr } = S.view, x = S.ptr.x, y = S.ptr.y, R = (S.tool === 'eraser' ? ERASER_R : BRUSH_R) * scale;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(60,54,49,0.7)';
  ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.7);
  if (S.tool === 'eraser') {
    ctx.fillStyle = '#f3a7b5'; ctx.strokeStyle = '#6b4a50'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-8, -40, 16, 40, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7fa7d9'; ctx.fillRect(-8, -40, 16, 12); ctx.strokeRect(-8, -40, 16, 12);
  } else {
    ctx.fillStyle = '#c99a5b'; ctx.strokeStyle = '#4a3b2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-4, -56, 8, 34, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b8b8c0'; ctx.fillRect(-5, -24, 10, 9); ctx.strokeRect(-5, -24, 10, 9);
    ctx.fillStyle = COLORS[S.tool].fill;
    ctx.beginPath(); ctx.moveTo(-5, -15); ctx.quadraticCurveTo(-6, -4, 0, 0); ctx.quadraticCurveTo(6, -4, 5, -15); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawFx() {
  const { dpr } = S.view;
  S.fx = S.fx.filter(f => S.time - f.t0 < f.dur);
  for (const f of S.fx) {
    const u = (S.time - f.t0) / f.dur;
    if (f.kind === 'spark') continue;
    const e = u * u * (3 - 2 * u), x = f.sx + (f.tx - f.sx) * e, y = f.sy + (f.ty - f.sy) * e - Math.sin(u * Math.PI) * 80;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (f.kind === 'fly') {
      const sc = f.s * (1 - 0.75 * e);
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); drawRefined(ctx, f.type, f.color, sc); ctx.restore();
    } else {
      ctx.fillStyle = COLORS[f.color].fill; ctx.beginPath(); ctx.arc(x, y, 18 * (1 - 0.5 * e), 0, TAU); ctx.fill();
    }
    if (u > 0.93 && !f.done) { f.done = true; bump(f.kind === 'fly' ? 'bagStat' : 'toolsBox'); }
  }
}

function render() {
  const { w, h, scale, dpr } = S.view, k = scale * dpr;
  const vx0 = S.cam.x - w / 2, vy0 = S.cam.y - h / 2, vx1 = vx0 + w, vy1 = vy0 + h;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(k, 0, 0, k, -vx0 * k, -vy0 * k);
  if (!grainPattern) grainPattern = ctx.createPattern(GRAIN, 'repeat');
  ctx.fillStyle = grainPattern; ctx.fillRect(vx0, vy0, w, h);

  // scenery
  ctx.strokeStyle = SCENERY_INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const st of S.scenery) {
    const b = st.bb;
    if (b.x > vx1 || b.x + b.w < vx0 || b.y > vy1 || b.y + b.h < vy0) continue;
    ctx.lineWidth = st.w;
    strokeLocal(ctx, st.pts, st.closed);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const l of S.labels) {
    if (l.x + 300 < vx0 || l.x - 300 > vx1 || l.y + 80 < vy0 || l.y - 80 > vy1) continue;
    ctx.fillStyle = 'rgba(120,110,95,0.2)';
    ctx.font = '700 64px "KaiTi","STKaiti","Kaiti SC","Microsoft YaHei",sans-serif'; ctx.fillText(l.zh, l.x, l.y);
    ctx.font = 'italic 30px Georgia,serif'; ctx.fillText(l.en, l.x, l.y + 52);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  for (const p of S.pots) if (!p.taken && p.x > vx0 - 100 && p.x < vx1 + 100 && p.y > vy0 - 100 && p.y < vy1 + 100) drawPaintPot(ctx, p.x, p.y, p.color, S.time);
  for (const o of S.objects) {
    if (o.collected) continue;
    const r = 70 * o.s;
    if (o.x + r < vx0 || o.x - r > vx1 || o.y + r < vy0 || o.y - r > vy1) continue;
    drawObject(o);
  }
  const n = S.npc;
  if (n.x - 120 < vx1 && n.x + 400 > vx0 && n.y - 330 < vy1 && n.y + 20 > vy0) { drawCreature(ctx, n.x, n.y, S.time, S.round); drawBubble(); }

  // brush marks on bare paper fade out
  S.trails = S.trails.filter(tr => S.time - tr.t < 0.9);
  for (const tr of S.trails) {
    ctx.globalAlpha = 0.45 * (1 - (S.time - tr.t) / 0.9);
    ctx.save(); ctx.translate(tr.x, tr.y); ctx.rotate(tr.rot);
    ctx.drawImage(BRISTLE[tr.color], -BRUSH_R * 1.07, -BRUSH_R * 1.07, BRUSH_R * 2.14, BRUSH_R * 2.14);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  for (const f of S.fx) {
    if (f.kind !== 'spark') continue;
    const u = (S.time - f.t0) / f.dur, x = f.x + f.vx * u, y = f.y + f.vy * u + 60 * u * u;
    ctx.strokeStyle = `rgba(240,180,30,${1 - u})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
  }
  for (const reg of S.regions) if (reg.fog > 0.01) drawFog(reg, vx0, vy0, vx1, vy1);
  drawCursor();
  drawFx();
}

// ---------- input ----------
// A left press with a tool paints at once. Any other press (left with no tool,
// right, middle) becomes a map drag once it moves DRAG_SLOP px; if it never
// moves it is a click: left picks things up, right puts the tool away.
function onPointerDown(e) {
  if (!S.started || S.panelOpen || S.won || S.pan || S.ptr.down) return;
  Sfx.init();
  S.glide = null;
  if (e.button === 1) e.preventDefault();
  if (e.button > 2) return;
  if (e.button === 0 && S.tool) {
    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    const pot = potAt(wx, wy);
    if (pot) return takePot(pot);
    if (npcAt(wx, wy)) return Panel.open();
    const p = S.ptr;
    Object.assign(p, { down: true, lwx: wx, lwy: wy, downAt: S.time, downX: e.clientX, downY: e.clientY, downObj: objectAt(wx, wy) });
    cv.setPointerCapture(e.pointerId);
    paintAt(wx, wy);
    return;
  }
  S.pan = { button: e.button, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, lt: performance.now(), moved: false, vx: 0, vy: 0 };
  cv.setPointerCapture(e.pointerId);
}

function panMove(e) {
  const pan = S.pan;
  if (!pan.moved && Math.hypot(e.clientX - pan.x0, e.clientY - pan.y0) < DRAG_SLOP) return;
  pan.moved = true;
  const now = performance.now(), dt = Math.max(1, now - pan.lt) / 1000, sc = S.view.scale;
  const dx = -(e.clientX - pan.lx) / sc, dy = -(e.clientY - pan.ly) / sc;
  tryMove(dx, 0); tryMove(0, dy);
  pan.vx = pan.vx * 0.5 + dx / dt * 0.5; pan.vy = pan.vy * 0.5 + dy / dt * 0.5;
  pan.lx = e.clientX; pan.ly = e.clientY; pan.lt = now;
}

function clickAt(sx, sy) {
  const [wx, wy] = screenToWorld(sx, sy);
  const pot = potAt(wx, wy);
  if (pot) return takePot(pot);
  if (npcAt(wx, wy)) return Panel.open();
  const o = objectAt(wx, wy);
  if (!o) return;
  if (o.correct) collect(o);
  else {
    Sfx.nope();
    if (o.refined) toast('颜色不对，所以拿不起来。用橡皮擦掉再涂<small>Wrong color, so it will not come loose. Erase it and repaint.</small>');
    else toast('还只是线稿：先把它涂成正确的颜色<small>Just a sketch: paint it its true color first.</small>');
  }
}

function onPointerUp(e) {
  const pan = S.pan;
  if (pan) {
    if (e.button !== pan.button) return;
    S.pan = null;
    if (pan.moved) {
      // a drag released while still moving glides on a little
      const v = Math.hypot(pan.vx, pan.vy), cap = Math.min(1, 2500 / (v || 1));
      if (performance.now() - pan.lt < 80 && v > 300) S.glide = { vx: pan.vx * cap, vy: pan.vy * cap };
    } else if (pan.button === 0) clickAt(e.clientX, e.clientY);
    else if (pan.button === 2) setTool(null);
    return;
  }
  const p = S.ptr;
  if (!p.down) return;
  p.down = false;
  if (p.downObj && p.downObj.correct && S.time - p.downAt < 0.3 && Math.hypot(e.clientX - p.downX, e.clientY - p.downY) < 6)
    toast('右键放下画笔，再点击就能收集<small>Right-click to put the tool away, then click to collect.</small>');
}

function onKey(e) {
  const k = e.key.toLowerCase();
  if (!S.started) { if (!e.repeat) startGame(); return; }
  if (S.panelOpen) { Panel.onKey(e); return; }
  if (S.won) return;
  if (k === 'escape') return setTool(null);
  if (k === '1') return setTool('red');
  if (k === '2') return setTool('yellow');
  if (k === '3') return setTool('blue');
  if (k === 'e') return setTool('eraser');
  if (k === 'm') { Sfx.toggle(); toast(Sfx.muted ? '已静音<small>Muted</small>' : '声音已打开<small>Sound on</small>', 1500); return; }
  if (k.startsWith('arrow')) e.preventDefault();
  S.held.add(k);
}

function updateHover() {
  if (!S.started || S.panelOpen || S.won) return;
  let cursor = 'none';
  if (S.pan && S.pan.moved) cursor = 'grabbing';
  else if (!S.tool) {
    const [wx, wy] = screenToWorld(S.ptr.x, S.ptr.y), o = objectAt(wx, wy);
    cursor = potAt(wx, wy) || npcAt(wx, wy) || (o && o.correct) ? 'pointer' : 'grab';
  }
  if (cv.style.cursor !== cursor) cv.style.cursor = cursor;
}

// ---------- flow ----------
function startGame() {
  if (S.started) return;
  S.started = true;
  Sfx.init();
  $('start').classList.add('hidden');
  setTimeout(() => { if (!S.camMoved) hint('edge', '把鼠标靠近屏幕边缘，或按住鼠标拖动地图，就能看看四周<small>Move the mouse near a screen edge, or drag the map, to look around.</small>'); }, 1500);
  setTimeout(() => { if (!S.backpack.length) hint('white', '发光的东西已经是正确的颜色，点击就能收集<small>Glowing things already have the right color: click to collect.</small>'); }, 7000);
}

function win() {
  S.won = true; S.tool = null; updateHud();
  const t = Math.round(S.playTime), regions = S.regions.filter(r => r.unlocked).length;
  $('winStats').innerHTML = `用时 Time <b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b> · 交给小家伙的物品 Items handed over <b>${S.given}</b> · 解锁区域 Regions <b>${regions}/9</b>`;
  $('win').classList.remove('hidden');
  Sfx.success();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  S.time += dt;
  if (S.started && !S.won) {
    S.playTime += dt;
    if (!S.panelOpen) { updateCamera(dt); updatePainting(dt); updateHover(); }
    for (const o of S.objects) if (o.pop > 0) o.pop = Math.max(0, o.pop - dt / 0.35);
    for (const reg of S.regions) if (reg.unlocked && reg.fog > 0) reg.fog = Math.max(0, reg.fog - dt / 1.2);
  }
  if (S.panelOpen) Panel.frame(dt);
  else render();
  updateUnlockButtons();
  requestAnimationFrame(frame);
}

function init() {
  buildWorld();
  resize();
  S.cam.x = S.view.w / 2; S.cam.y = MAP_H - S.view.h / 2;
  repairCamera();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', e => {
    S.ptr.x = e.clientX; S.ptr.y = e.clientY; S.ptr.inside = true;
    S.ptr.overUI = e.target !== cv;
    if (!S.started || S.panelOpen || S.won) return;
    if (S.pan) panMove(e); else strokeTo(e.clientX, e.clientY);
  });
  document.documentElement.addEventListener('mouseleave', () => { S.ptr.inside = false; });
  window.addEventListener('blur', () => { S.ptr.inside = false; S.held.clear(); S.ptr.down = false; S.pan = null; });
  cv.addEventListener('pointerdown', onPointerDown);
  cv.addEventListener('auxclick', e => e.preventDefault());
  cv.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
  window.addEventListener('pointerup', onPointerUp);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', e => S.held.delete(e.key.toLowerCase()));
  document.querySelectorAll('.slot').forEach(b => b.addEventListener('click', () => { Sfx.init(); setTool(b.dataset.tool); }));
  $('start').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', () => location.reload());
  Panel.init();
  updateHud();
  requestAnimationFrame(frame);
}

window.__uncolored = { S, TYPES, BAGS, get Panel() { return Panel; } };
init();
