// game.js: scene flow, singers and physics, songs and dye, input, sound,
// HUD and the main loop for Color Chorus.
'use strict';

const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const FINALE = { zh: '谢幕', en: 'Curtain Call', theme: 'finale', cast: ['do', 're', 'mi', 'fa', 'sol', 'la'], platforms: [], items: [], hints: {} };
const SCENES = [...LEVELS, FINALE];
const SLIDE_TIME = 1.7, GO_DELAY = 1.1, WARN_TIME = 2.5, HUD_H = 58;
const SONG_SLACK = 8;   // a singer may drift this far (e.g. sliding to a stop) before its song ends
const HINT_CLEAR = ['全部正确！按住 → 前往下一幕', 'All correct! Hold → to walk on to the next act.'];
const HINT_LAST = ['全部正确！按住 → 谢幕', 'All correct! Hold → for the curtain call.'];
const HINT_STUCK = ['按 R 可以重新开始这一幕', 'Press R to restart this act.'];

// Props per scene in level coordinates, with the surface each one rests above.
for (const L of SCENES) {
  L.props = L.items.map(([type, x, y, prop]) => {
    let below = GROUND_Y;
    for (const [x0, x1, py] of L.platforms) if (x >= x0 && x <= x1 && py >= y + 10 && py < below) below = py;
    return { type, x, y, prop, below };
  });
}
const sceneX = i => i * W;

const S = {
  phase: 'title',     // title | arrive | play | clear | slide | end
  scene: 0, camX: 0, wallL: 0, wallR: W, time: 0, sceneTime: 0,
  platforms: [], items: [], singers: [], gone: [], active: 0, rings: [], parts: [],
  held: new Set(), armed: false, goAt: 0, goShown: false, cheer: 0, slide: null, arriveT: 0,
  banner: null, hint: null, hintQueue: [], hintsSeen: new Set(), cards: [], fade: 0,
  view: { scale: 1, ox: 0, oy: 0, dpr: 1 },
};

// ---------- sound (synthesized placeholders) ----------
const Sfx = {
  ac: null, master: null, wet: null, noise: null, muted: false,
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try {
      const ac = this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.master = ac.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; this.master.connect(ac.destination);
      // a soft hall echo
      const d = ac.createDelay(1), fb = ac.createGain(), lp = ac.createBiquadFilter();
      d.delayTime.value = 0.21; fb.gain.value = 0.32; lp.type = 'lowpass'; lp.frequency.value = 2200;
      this.wet = ac.createGain(); this.wet.gain.value = 0.3;
      this.wet.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(this.master);
      const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch (e) { this.ac = null; }
  },
  ok() { return this.ac && !this.muted; },
  tone(freq, dur, type = 'sine', vol = 0.1, delay = 0, slide = 0, wet = 0) {
    if (!this.ok()) return;
    const ac = this.ac, t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); if (wet) g.connect(this.wet);
    o.start(t); o.stop(t + dur + 0.05);
  },
  // One sung note: a soft "ooh" with vibrato. Bigger singers are lower and louder.
  voice(s, n) {
    if (!this.ok()) return;
    const ac = this.ac, t = ac.currentTime, note = s.def.note + [0, 7, 12, 7][n % 4], f = 440 * Math.pow(2, (note - 69) / 12);
    const vol = { S: 0.075, M: 0.095, L: 0.12 }[s.def.size] * (n ? 0.8 : 1);
    const o1 = ac.createOscillator(), o2 = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain();
    const mix = ac.createGain(), lp = ac.createBiquadFilter(), g = ac.createGain();
    o1.type = 'triangle'; o2.type = 'sine'; o1.frequency.value = f; o2.frequency.value = f * 2;
    lfo.frequency.value = 5.4; lg.gain.value = f * 0.007; lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    mix.gain.value = 0.25; o2.connect(mix); mix.connect(lp); o1.connect(lp);
    lp.type = 'lowpass'; lp.frequency.value = Math.min(4200, f * 5); lp.Q.value = 1.5; lp.connect(g);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(vol * 0.55, t + 0.22); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    g.connect(this.master); g.connect(this.wet);
    for (const o of [o1, o2, lfo]) { o.start(t); o.stop(t + 0.66); }
  },
  noiseBurst(delay, dur, vol, freq, q = 1.2) {
    if (!this.ok()) return;
    const ac = this.ac, t = ac.currentTime + delay, src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  },
  plip(color) { this.tone({ red: 784, yellow: 988, blue: 1175 }[color], 0.13, 'sine', 0.06, 0, 120); },
  chime() { this.tone(1319, 0.5, 'triangle', 0.07, 0, 0, 1); this.tone(1760, 0.6, 'triangle', 0.05, 0.08, 0, 1); },
  fade() { this.tone(520, 0.22, 'sine', 0.035, 0, -160); },
  jump() { this.tone(330, 0.1, 'sine', 0.04, 0, 230); },
  thud() { this.tone(130, 0.09, 'sine', 0.07, 0, -50); },
  select() { this.tone(660, 0.05, 'triangle', 0.035); },
  hop(up) { this.tone(up ? 280 : 620, 0.18, 'sine', 0.06, 0, up ? 420 : -380); },
  go() { this.tone(880, 0.2, 'triangle', 0.07); this.tone(1320, 0.3, 'triangle', 0.06, 0.1); },
  restart() { this.noiseBurst(0, 0.25, 0.06, 700, 0.7); this.tone(500, 0.2, 'sine', 0.04, 0, -250); },
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.09, i * 0.11, 0, 1)); [523, 659, 784].forEach(f => this.tone(f, 1.1, 'triangle', 0.05, 0.5, 0, 1)); },
  applause() { for (let i = 0; i < 46; i++) this.noiseBurst(Math.random() * 1.6 * Math.sqrt(Math.random()), 0.035, 0.05 + Math.random() * 0.04, 1300 + Math.random() * 1400); },
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.9; },
};

// ---------- singers ----------
function makeSinger(key, x) {
  const def = CAST[key], sz = SIZES[def.size];
  return {
    key, def, w: sz.w, h: sz.h, range: sz.k * TUNE.rangePerSize,
    x, y: GROUND_Y, vx: 0, vy: 0, onGround: true, surface: 'floor', air: 0, coyote: 0, jumpBuf: 0, dropReq: false, drop: null,
    mode: 'normal', facing: 1, squash: 0, walk: 0, moving: false, mouth: 0, blink: 0, blinkIn: 1 + Math.random() * 3,
    seed: Math.random() * 10, wave: 0, song: null, songAt: 0,
  };
}
const onLedge = (s, p) => s.x >= p.x0 - s.w * TUNE.footSlack && s.x <= p.x1 + s.w * TUNE.footSlack;
const approach = (v, target, step) => v < target ? Math.min(target, v + step) : Math.max(target, v - step);

// Active singer control, then shared movement.
function control(s, dt, dir) {
  s.vx = approach(s.vx, dir * TUNE.walk, (dir ? 5000 : 9000) * dt);
  if (dir) s.facing = dir;
  if (s.jumpBuf > 0) {
    s.jumpBuf -= dt;
    if (s.onGround || s.coyote > 0) {
      Object.assign(s, { vy: -TUNE.jumpV, onGround: false, surface: null, coyote: 0, jumpBuf: 0, air: 0, squash: -0.6 });
      Sfx.jump();
    }
  }
  if (s.dropReq) {
    s.dropReq = false;
    if (s.onGround && s.surface !== 'floor') Object.assign(s, { drop: s.surface, onGround: false, surface: null, air: 0, vy: 60 });
  }
}

// mode: normal (ledges and floor) | descend (floor only) | join (rising from the pit) | leave (no collisions)
function move(s, dt) {
  s.x += s.vx * dt;
  if (s.mode === 'normal' || s.mode === 'descend') {
    const lo = S.wallL + s.w / 2, hi = S.wallR - s.w / 2;
    if (s.x < lo) { s.x = lo; s.vx = 0; } else if (s.x > hi) { s.x = hi; s.vx = 0; }
  }
  if (s.onGround) {
    if (s.surface === 'floor' || onLedge(s, s.surface)) return;
    Object.assign(s, { onGround: false, surface: null, coyote: 0.1, air: 0, vy: 0 });
  }
  const prevY = s.y;
  s.vy = Math.min(1600, s.vy + TUNE.gravity * dt);
  s.y += s.vy * dt; s.air += dt;
  if (s.coyote > 0) s.coyote -= dt;
  if (s.vy < 0 || s.mode === 'leave' || prevY > GROUND_Y + 0.5) return;
  let land = null;
  if (s.mode === 'normal') for (const p of S.platforms) {
    if (p === s.drop || prevY > p.y + 0.5 || s.y < p.y || !onLedge(s, p)) continue;
    if (!land || p.y < land.y) land = p;
  }
  if (land) landOn(s, land, land.y);
  else if (s.y >= GROUND_Y) landOn(s, 'floor', GROUND_Y);
}

function landOn(s, surface, y) {
  const air = s.air;
  Object.assign(s, { y, vy: 0, onGround: true, surface, drop: null, air: 0, squash: Math.min(1, 0.3 + air * 1.3) });
  if (s.mode !== 'normal') { if (s.mode === 'join') Sfx.thud(); s.mode = 'normal'; }
  if (air > 0.12) puff(s);
  if (air > 0.08 && S.phase === 'play') startSong(s);
  else if (air > 0.08) Sfx.thud();
}

function animate(s, dt) {
  s.squash *= Math.exp(-dt * 11);
  s.moving = s.onGround && Math.abs(s.vx) > 5;
  if (s.moving) s.walk += Math.abs(s.vx) * dt * 0.055;
  s.mouth = Math.max(0, s.mouth - dt * 2.6);
  s.wave = Math.max(0, s.wave - dt * 0.6);
  s.singing = !!s.song;
  if (s.blink > 0) s.blink -= dt;
  else if ((s.blinkIn -= dt) <= 0) { s.blink = 0.12; s.blinkIn = 2 + Math.random() * 3.5; }
}

// ---------- songs, rings and dye ----------
function startSong(s) {
  if (S.phase !== 'play' && S.phase !== 'end') return;
  s.song = { until: S.time + TUNE.songTime, next: S.time, x: s.x, y: s.y, n: 0 };
}

function updateSongs() {
  for (const s of S.singers) {
    const g = s.song;
    if (!g) continue;
    // moving off the spot ends the song; rings already sent keep growing
    if (!s.onGround || Math.abs(s.x - g.x) > SONG_SLACK || Math.abs(s.y - g.y) > 0.5) { s.song = null; continue; }
    while (S.time >= g.next && g.next < g.until) { emitRing(s, g.n++); g.next += TUNE.ringEvery; }
    if (S.time >= g.until) s.song = null;
  }
}

function emitRing(s, n) {
  S.rings.push({ x: s.x, y: s.y - s.h / 2, color: s.def.color, R: s.range, t0: S.time, hit: new Set() });
  s.mouth = 1;
  Sfx.voice(s, n);
  if (n % 2 === 0) S.parts.push({ kind: 'note', x: s.x + (Math.random() - 0.5) * s.w * 0.7, y: s.y - s.h - 6, vx: (Math.random() - 0.5) * 40, vy: -55 - Math.random() * 25, t0: S.time, dur: 1.5, color: s.def.color, k: Math.random() * 10 });
}

const ringEase = u => 1 - (1 - u) * (1 - u);
function updateRings(dyeing) {
  S.rings = S.rings.filter(r => S.time - r.t0 < TUNE.ringGrow + 0.4);
  if (!dyeing) return;
  for (const r of S.rings) {
    const rad = r.R * ringEase(Math.min(1, (S.time - r.t0) / TUNE.ringGrow));
    for (const it of S.items) {
      if (r.hit.has(it) || Math.hypot(it.x - r.x, it.y - r.y) > rad + TUNE.itemRadius) continue;
      r.hit.add(it);
      dye(it, r.color);
    }
  }
}

function dye(it, color) {
  const fresh = it.dye[color] <= 0;
  it.dye[color] = TUNE.dyeTime;
  if (!fresh) return;
  it.pop = 1;
  Sfx.plip(color);
  refresh(it);
  hintEvent('firstDye');
}

function refresh(it) {
  const bits = (it.dye.red > 0 ? 1 : 0) | (it.dye.yellow > 0 ? 2 : 0) | (it.dye.blue > 0 ? 4 : 0);
  const mix = MIX[bits], correct = mix === it.color;
  if (correct && !it.correct) { Sfx.chime(); sparkle(it.x, it.y, 10); }
  it.mix = mix; it.correct = correct;
}

function updateDye(dt) {
  for (const it of S.items) {
    let faded = false;
    for (const c of PRIMARIES) if (it.dye[c] > 0 && (it.dye[c] -= dt) <= 0) { it.dye[c] = 0; faded = true; }
    if (faded) { refresh(it); Sfx.fade(); hintEvent('firstFade'); }
  }
}

// ---------- scene flow ----------
function enterScene() {
  const L = SCENES[S.scene], ox = sceneX(S.scene);
  Object.assign(S, { camX: ox, wallL: ox, wallR: ox + W, rings: [], phase: 'arrive', arriveT: S.time, sceneTime: 0, active: 0, hint: null, hintQueue: [] });
  S.platforms = L.platforms.map(([x0, x1, y]) => ({ x0: x0 + ox, x1: x1 + ox, y }));
  S.items = L.props.map(p => ({ ...p, x: p.x + ox, color: ITEM_COLOR[p.type], dye: { red: 0, yellow: 0, blue: 0 }, mix: null, correct: false, pop: 0 }));
  const slots = lineUp(L.cast, L.theme === 'finale' ? (W - lineWidth(L.cast)) / 2 : 60);
  const keep = new Map(S.singers.map(s => [s.key, s]));
  let nj = 0, nl = 0;
  S.singers = L.cast.map((key, i) => {
    const tx = ox + slots[i];
    let s = keep.get(key);
    if (s) { keep.delete(key); Object.assign(s, { target: tx, delay: 0.32 }); return s; }
    s = makeSinger(key, tx);
    return Object.assign(s, { mode: 'join', y: H + 80, onGround: false, surface: null, target: tx, delay: 0.45 + 0.17 * nj++, launched: false });
  });
  for (const s of keep.values()) { Object.assign(s, { mode: 'leave', delay: 0.05 + 0.15 * nl++, launched: false, wave: 1, song: null }); S.gone.push(s); }
  S.banner = { t0: S.time + 0.15, zh: L.theme === 'finale' ? '谢幕' : `第 ${S.scene + 1} 幕 · ${L.zh}`, en: L.theme === 'finale' ? 'Curtain Call' : `Act ${S.scene + 1} · ${L.en}` };
}

function updateArrive(dt) {
  const t = S.time - S.arriveT;
  let busy = t < 0.6;
  for (const s of S.singers) {
    if (s.mode === 'join') {
      busy = true;
      if (!s.launched && t >= s.delay) { s.launched = true; s.vy = -1180; s.air = 0; Sfx.hop(true); }
      if (s.launched) move(s, dt);
      continue;
    }
    const dx = s.target - s.x;
    s.vx = t >= s.delay ? Math.sign(dx) * Math.min(TUNE.walk, Math.abs(dx) / dt) : 0;
    if (Math.abs(dx) > 0.5) { busy = true; s.facing = Math.sign(dx); }
    move(s, dt);
    if (!s.onGround) busy = true;
  }
  for (const s of S.gone) {
    if (!s.launched && t >= s.delay + 0.35) { Object.assign(s, { launched: true, onGround: false, surface: null, vy: -560, air: 0, vx: 0 }); Sfx.hop(false); }
    if (s.launched) move(s, dt);
  }
  S.gone = S.gone.filter(s => s.y < H + 160);
  if (!busy && !S.gone.length) beginPlay();
}

function beginPlay() {
  S.singers.forEach(s => { s.vx = 0; });
  if (SCENES[S.scene].theme === 'finale') { S.phase = 'end'; S.endAt = S.time; S.nextChord = S.time + 0.4; return; }
  S.phase = 'play'; S.sceneTime = 0; S.active = 0;
  hintEvent('start');
}

function updatePlay(dt) {
  const dir = (S.held.has('right') ? 1 : 0) - (S.held.has('left') ? 1 : 0);
  S.singers.forEach((s, i) => { if (i === S.active) control(s, dt, dir); else s.vx = 0; move(s, dt); });
  updateSongs();
  updateRings(true);
  updateDye(dt);
  const later = SCENES[S.scene].hints.later;
  if (later && S.sceneTime >= later[0]) hintEvent('later');
  if (S.sceneTime > 40) hintOnce('stuck' + S.scene, HINT_STUCK);
  if (S.items.length && S.items.every(it => it.correct)) clearScene();
}

function switchTo(i) {
  if (S.phase !== 'play' || i < 0 || i >= S.singers.length) return;
  if (i !== S.active) { const prev = S.singers[S.active]; prev.vx = 0; prev.jumpBuf = 0; S.active = i; Sfx.select(); }
  const s = S.singers[i];
  if (s.onGround) startSong(s);   // a singer in the air sings when it lands
}

function restartScene() {
  if (S.phase !== 'play') return;
  const slots = lineUp(SCENES[S.scene].cast), ox = sceneX(S.scene);
  S.singers.forEach((s, i) => {
    Object.assign(s, { x: ox + slots[i], y: GROUND_Y, vx: 0, vy: 0, onGround: true, surface: 'floor', song: null, mode: 'normal', drop: null, facing: 1, squash: 0.7, jumpBuf: 0 });
    puff(s);
  });
  for (const it of S.items) { it.dye = { red: 0, yellow: 0, blue: 0 }; it.mix = null; it.correct = false; }
  S.rings = []; S.active = 0; S.sceneTime = 0;
  Sfx.restart();
}

function clearScene() {
  Object.assign(S, { phase: 'clear', goAt: S.time + GO_DELAY, armed: false, goShown: false, cheer: 1 });
  for (const s of S.singers) s.song = null;
  for (const it of S.items) { it.pop = 1; sparkle(it.x, it.y, 14); }
  Sfx.fanfare(); Sfx.applause();
  S.hintQueue = []; S.hint = null;
  showHint(S.scene === LEVELS.length - 1 ? HINT_LAST : HINT_CLEAR, 1e9);
}

// The right-hand line-up the choir gathers into after a win.
function rightSlots() {
  const keys = S.singers.map(s => s.key);
  return lineUp(keys, W - 60 - lineWidth(keys)).map(x => x + sceneX(S.scene));
}

// Hold → alone to gather; anything else pauses. Singers on ledges hop down through them.
function updateClear(dt) {
  if (!S.goShown && S.time >= S.goAt) { S.goShown = true; Sfx.go(); }
  const adv = S.goShown && S.armed && S.held.has('right') && S.held.size === 1;
  const slots = rightSlots();
  let ready = true;
  S.singers.forEach((s, i) => {
    if (adv && s.onGround && s.surface !== 'floor') { Object.assign(s, { mode: 'descend', onGround: false, surface: null, vy: -340, air: 0, squash: -0.4 }); Sfx.jump(); }
    const dx = slots[i] - s.x;
    s.vx = adv ? Math.sign(dx) * Math.min(TUNE.walk, Math.abs(dx) / dt) : 0;
    if (adv && Math.abs(dx) > 0.5) s.facing = Math.sign(dx);
    move(s, dt);
    if (!s.onGround || s.surface !== 'floor' || Math.abs(slots[i] - s.x) > 0.75) ready = false;
  });
  if (adv && ready) startSlide();
}

function startSlide() {
  const keys = S.singers.map(s => s.key), ox = sceneX(S.scene + 1);
  S.slide = { t0: S.time, from: S.camX, xs: S.singers.map(s => s.x), to: lineUp(keys).map(x => x + ox) };
  Object.assign(S, { phase: 'slide', goShown: false, hint: null, hintQueue: [], wallL: -1e9, wallR: 1e9 });
}

const easeInOut = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
function updateSlide(dt) {
  const sl = S.slide, u = Math.min(1, (S.time - sl.t0) / SLIDE_TIME);
  S.camX = sl.from + W * easeInOut(u);
  S.singers.forEach((s, i) => { const nx = sl.xs[i] + (sl.to[i] - sl.xs[i]) * u; s.vx = (nx - s.x) / dt; s.x = nx; s.facing = 1; });
  if (u >= 1) { S.scene++; enterScene(); }
}

function updateEnd() {
  if (S.time >= S.nextChord) {
    S.nextChord = S.time + 5.6;
    S.singers.forEach((s, i) => { s.songAt = S.time + i * 0.22; });
  }
  for (const s of S.singers) if (s.songAt && S.time >= s.songAt) { s.songAt = 0; startSong(s); }
  if (Math.random() < 0.5) {
    const c = ['red', 'yellow', 'blue', 'orange', 'green', 'purple'][Math.floor(Math.random() * 6)];
    S.parts.push({ kind: 'confetti', x: S.camX + Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 60, vy: 80 + Math.random() * 80, t0: S.time, dur: 7, color: c, k: Math.random() * 10 });
  }
}

function startGame(at = 0) {
  Sfx.init();
  document.getElementById('start').classList.add('hidden');
  Object.assign(S, { scene: at, singers: [], gone: [], parts: [], fade: S.phase === 'title' ? 0 : 1 });
  enterScene();
}

// ---------- hints ----------
function showHint(h, dur) { S.hintQueue.push({ zh: h[0], en: h[1], dur: dur || Math.max(4.5, h[0].length * 0.22) }); }
function hintOnce(id, h) { if (S.hintsSeen.has(id)) return; S.hintsSeen.add(id); showHint(h); }
function hintEvent(name) {
  const h = SCENES[S.scene].hints[name];
  if (!h) return;
  hintOnce(S.scene + ':' + name, h.length === 3 ? h.slice(1) : h);
}
function updateHints() {
  if (S.hint && S.time - S.hint.t0 > S.hint.dur) S.hint = null;
  if (!S.hint && !S.banner && S.hintQueue.length) { S.hint = S.hintQueue.shift(); S.hint.t0 = S.time; }
}

// ---------- particles ----------
function sparkle(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, sp = 70 + Math.random() * 130;
    S.parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, t0: S.time, dur: 0.6 + Math.random() * 0.4 });
  }
}
function puff(s) {
  for (let i = 0; i < 6; i++) S.parts.push({ kind: 'puff', x: s.x + (i - 2.5) * s.w * 0.16, y: s.y - 3, vx: (i - 2.5) * 22, vy: -12 - Math.random() * 14, t0: S.time, dur: 0.45, r: 4 + Math.random() * 3 });
}

// ---------- main update ----------
function update(dt) {
  S.sceneTime += dt;
  if (S.phase === 'play') updatePlay(dt);
  else {
    if (S.phase === 'clear') updateClear(dt);
    else if (S.phase === 'slide') updateSlide(dt);
    else if (S.phase === 'arrive') updateArrive(dt);
    else if (S.phase === 'end') updateEnd();
    updateSongs();
    updateRings(false);
  }
  for (const s of S.singers) animate(s, dt);
  for (const s of S.gone) animate(s, dt);
  for (const it of S.items) if (it.pop > 0) it.pop = Math.max(0, it.pop - dt / 0.4);
  S.parts = S.parts.filter(p => S.time - p.t0 < p.dur);
  S.cheer = Math.max(0, S.cheer - dt / 3);
  S.fade = Math.max(0, S.fade - dt * 2.5);
  updateHints();
}

// ---------- rendering ----------
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1), iw = innerWidth, ih = innerHeight;
  const scale = Math.min(iw / W, ih / H);
  cv.width = Math.round(iw * dpr); cv.height = Math.round(ih * dpr);
  S.view = { scale, ox: (iw - W * scale) / 2, oy: (ih - H * scale) / 2, dpr };
  ART.px = scale * dpr;
}

let grainPattern = null;
function drawPanel(i, px) {
  const L = SCENES[i], live = i === S.scene && S.phase !== 'title' ? S.items : null;
  ctx.save();
  ctx.translate(px, 0);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, GROUND_Y + 2); ctx.clip();
  BACKDROPS[L.theme](ctx, S.time);
  if (!grainPattern) grainPattern = ctx.createPattern(GRAIN, 'repeat');
  ctx.fillStyle = grainPattern; ctx.fillRect(0, 0, W, GROUND_Y + 2);
  ctx.restore();
  for (const p of L.props) drawPropBack(ctx, p, p.below, S.time);
  L.platforms.forEach((p, k) => drawLedge(ctx, L.theme, p, k));
  L.props.forEach((p, k) => drawProp(p, live && live[k]));
  for (const p of L.props) drawPropFront(ctx, p, p.below);
  // the edge of the slide
  if (S.phase === 'slide') {
    const g = ctx.createLinearGradient(-18, 0, 0, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g; ctx.fillRect(-18, 0, 18, GROUND_Y);
  }
  ctx.restore();
}

// A prop in level coordinates; it is the live state (null: blank, as in the next scene).
function drawProp(p, it) {
  const bob = Math.sin(S.time * 1.6 + p.x * 0.013) * 2;
  let color = it ? it.mix : null;
  if (it && S.phase === 'play' && color) {
    // colors about to fade blink out of the mix
    let keep = 0, warn = false;
    for (const c of PRIMARIES) if (it.dye[c] > 0) { if (it.dye[c] < WARN_TIME) warn = true; else keep |= BITS[c]; }
    if (warn && Math.sin(S.time * 18) < -0.2) color = MIX[keep];
  }
  const sc = it && it.pop > 0 ? 1 + 0.2 * Math.sin(it.pop * Math.PI) : 1;
  drawItem(ctx, p.type, color, p.x, p.y + bob, { scale: sc, glow: it && it.correct ? 13 + 7 * Math.sin(S.time * 4 + p.x) : 0 });
  if (it && S.phase === 'play') drawPips(p, it);
}

// Small paint drops under a prop: which primaries it holds and how long each lasts.
function drawPips(p, it) {
  const have = PRIMARIES.filter(c => it.dye[c] > 0);
  if (!have.length) return;
  const y = p.y + 40, x0 = p.x - (have.length - 1) * 8;
  have.forEach((c, i) => {
    const x = x0 + i * 16, left = it.dye[c] / TUNE.dyeTime, warn = it.dye[c] < WARN_TIME && Math.sin(S.time * 18) < -0.2;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
    if (!warn) {
      ctx.fillStyle = COLORS[c].fill; ctx.beginPath(); ctx.moveTo(x, y);
      ctx.arc(x, y, 5.5, -Math.PI / 2, -Math.PI / 2 + TAU * left); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(30,25,40,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke();
  });
}

function drawRings() {
  for (const r of S.rings) {
    const age = S.time - r.t0, u = Math.min(1, age / TUNE.ringGrow), rad = r.R * ringEase(u);
    const a = (1 - 0.75 * u) * Math.max(0, 1 - Math.max(0, age - TUNE.ringGrow) / 0.4);
    const c = COLORS[r.color].fill;
    ctx.globalAlpha = 0.07 * a; ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.85 * a; ctx.strokeStyle = c; ctx.lineWidth = 5 - 2.5 * u;
    ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(0, rad - 3), 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// The active singer's reach, and markers on the props a song from here would touch.
function drawPreview() {
  if (S.phase !== 'play') return;
  const s = S.singers[S.active], cx = s.x, cy = s.y - s.h / 2, c = COLORS[s.def.color];
  ctx.save();
  ctx.setLineDash([10, 9]); ctx.lineDashOffset = -S.time * 14;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, s.range, 0, TAU); ctx.stroke();
  ctx.strokeStyle = c.fill; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(cx, cy, s.range, 0, TAU); ctx.stroke();
  ctx.restore();
  for (const it of S.items) {
    if (Math.hypot(it.x - cx, it.y - cy) > s.range + TUNE.itemRadius) continue;
    const y = it.y - 46 + Math.sin(S.time * 5) * 3;
    ctx.fillStyle = c.fill; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(it.x - 8, y - 8); ctx.lineTo(it.x + 8, y - 8); ctx.lineTo(it.x, y + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

function drawSingers() {
  const all = [...S.singers, ...S.gone];
  for (const s of all) drawSinger(ctx, s, S.time);
  if (S.phase !== 'play') return;
  S.singers.forEach((s, i) => {
    const top = s.y - s.h - 16, act = i === S.active;
    if (act) {
      const y = top - 20 + Math.sin(S.time * 6) * 3;
      ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#5a3d00'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x - 9, y - 7); ctx.lineTo(s.x + 9, y - 7); ctx.lineTo(s.x, y + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = act ? '#fff8e0' : 'rgba(255,255,255,0.75)'; ctx.strokeStyle = act ? '#5a3d00' : 'rgba(40,30,50,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(s.x, top, 10, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2b2733'; ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), s.x, top + 1);
  });
}

function drawParts() {
  for (const p of S.parts) {
    const u = (S.time - p.t0) / p.dur, t = S.time - p.t0;
    const x = p.x + p.vx * t, y = p.y + p.vy * t + (p.kind === 'spark' ? 90 * t * t : 0);
    if (p.kind === 'note') drawNote(ctx, x + Math.sin(t * 4 + p.k) * 8, y, p.color, Math.min(1, (1 - u) * 1.6), p.k + t);
    else if (p.kind === 'spark') {
      ctx.strokeStyle = `rgba(255, 196, 40, ${1 - u})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
    } else if (p.kind === 'puff') {
      ctx.fillStyle = `rgba(240, 230, 215, ${0.6 * (1 - u)})`;
      ctx.beginPath(); ctx.arc(x, y, p.r * (1 + u), 0, TAU); ctx.fill();
    } else if (p.kind === 'confetti') {
      ctx.save(); ctx.translate(x + Math.sin(t * 2 + p.k) * 20, y); ctx.rotate(t * 3 + p.k);
      ctx.fillStyle = COLORS[p.color].fill; ctx.fillRect(-4, -2.5, 8, 5); ctx.restore();
    }
  }
}

function text(str, x, y, size, color, weight = 600, align = 'center') {
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function drawHud() {
  S.cards = [];
  if (S.phase === 'title') return;
  const L = SCENES[S.scene];
  ctx.fillStyle = 'rgba(16, 12, 26, 0.62)'; ctx.fillRect(0, 0, W, HUD_H);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, HUD_H - 1, W, 1);
  if (L.theme === 'finale') { text('谢幕 · Curtain Call', W / 2, HUD_H / 2, 20, '#ffe7a8', 700); return; }
  text(`第 ${S.scene + 1} / ${LEVELS.length} 幕`, 22, 20, 14, 'rgba(255,255,255,0.7)', 500, 'left');
  text(`${L.zh}  ${L.en}`, 22, 40, 17, '#fff', 700, 'left');
  // singer cards (click to switch)
  const n = S.singers.length, cw = 148, gap = 10, x0 = (W - n * cw - (n - 1) * gap) / 2;
  S.singers.forEach((s, i) => {
    const x = x0 + i * (cw + gap), y = 7, h = 44, act = i === S.active && S.phase === 'play';
    S.cards.push({ x, y, w: cw, h, i });
    ctx.fillStyle = act ? 'rgba(255, 250, 235, 0.96)' : 'rgba(255,255,255,0.1)';
    ctx.strokeStyle = act ? '#ffd34d' : 'rgba(255,255,255,0.18)'; ctx.lineWidth = act ? 2.5 : 1;
    ctx.beginPath(); ctx.roundRect(x, y, cw, h, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = act ? '#2b2733' : 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.roundRect(x + 8, y + 11, 22, 22, 5); ctx.fill();
    text(String(i + 1), x + 19, y + 23, 14, act ? '#fff' : '#2b2733', 800);
    const k = 0.42;   // same scale for everyone, so the cards show relative sizes
    ctx.save(); ctx.translate(x + 53, y + h - 5); ctx.scale(k, k);
    drawSinger(ctx, { ...s, x: 0, y: 0, moving: false, squash: 0, wave: 0, shadow: false }, S.time);
    ctx.restore();
    const ink = act ? '#2b2733' : '#fff', sub = act ? '#6b6474' : 'rgba(255,255,255,0.6)';
    text(`${s.def.zh} ${s.def.en}`, x + 78, y + 16, 15, ink, 700, 'left');
    text(`${COLOR_ZH[s.def.color]} · ${SIZES[s.def.size].zh}`, x + 78, y + 33, 12, sub, 500, 'left');
    if (s.song) {
      ctx.strokeStyle = COLORS[s.def.color].fill; ctx.lineWidth = 2;
      for (let k2 = 0; k2 < 3; k2++) {
        const ph = (S.time * 2 + k2 * 0.33) % 1;
        ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.arc(x + cw - 20, y + h / 2, 4 + ph * 10, -0.7, 0.7); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  });
  const good = S.items.filter(it => it.correct).length;
  text(`✓ ${good} / ${S.items.length}`, W - 22, 21, 19, good === S.items.length ? '#ffe08a' : '#fff', 800, 'right');
  text(Sfx.muted ? '正确 correct · 已静音 muted' : '正确 correct', W - 22, 42, 12, 'rgba(255,255,255,0.6)', 500, 'right');
}

function drawHelp() {
  if (S.phase !== 'play') return;
  text('← → 移动 · 空格 跳 · ↓ 下落 · 1–4 切换并唱歌 · R 重来 · M 静音    ← → walk · Space jump · ↓ drop · 1–4 switch & sing · R restart · M mute',
    W / 2, 669, 13, 'rgba(255, 240, 220, 0.62)', 500);
}

function drawGo() {
  if (S.phase !== 'clear' || !S.goShown) return;
  const on = ((S.time - S.goAt) % 0.9) < 0.6, x = 1130, y = 300;
  if (!on) return;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 10 * ART.px;
  ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#5a3d00'; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 80, y - 30); ctx.lineTo(x + 10, y - 30); ctx.lineTo(x + 10, y - 62); ctx.lineTo(x + 84, y); ctx.lineTo(x + 10, y + 62); ctx.lineTo(x + 10, y + 30); ctx.lineTo(x - 80, y + 30);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  text('GO', x - 24, y + 2, 38, '#5a3d00', 900);
  text('按住 → Hold →', x, y + 88, 16, '#fff', 700);
}

function drawBanner() {
  const b = S.banner;
  if (!b) return;
  const t = S.time - b.t0;
  if (t < 0) return;
  if (t > 2.8) { S.banner = null; return; }
  const a = Math.min(1, t / 0.3, (2.8 - t) / 0.5), y = 150 - (1 - Math.min(1, t / 0.4)) * 12;
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(16, 12, 26, 0.55)';
  ctx.beginPath(); ctx.roundRect(W / 2 - 230, y - 40, 460, 84, 18); ctx.fill();
  text(b.zh, W / 2, y - 8, 32, '#fff', 800);
  text(b.en, W / 2, y + 24, 16, 'rgba(255,255,255,0.75)', 500);
  ctx.restore();
}

function drawHint() {
  const h = S.hint;
  if (!h) return;
  const t = S.time - h.t0, a = Math.min(1, t / 0.25, (h.dur - t) / 0.4);
  ctx.save(); ctx.globalAlpha = Math.max(0, a);
  ctx.font = `700 17px ${FONT}`;
  const w1 = ctx.measureText(h.zh).width;
  ctx.font = `500 13px ${FONT}`;
  const w = Math.max(w1, ctx.measureText(h.en).width) + 40, x = W / 2 - w / 2, y = HUD_H + 12;
  ctx.fillStyle = 'rgba(255, 252, 244, 0.95)'; ctx.strokeStyle = '#2b2733'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x, y, w, 52, 12); ctx.fill(); ctx.stroke();
  text(h.zh, W / 2, y + 18, 17, '#2b2733', 700);
  text(h.en, W / 2, y + 37, 13, '#6b6474', 500);
  ctx.restore();
}

function drawEnd() {
  if (S.phase !== 'end') return;
  const t = S.time - S.endAt, a = Math.min(1, t / 0.6);
  ctx.save(); ctx.globalAlpha = a;
  text('谢谢收听！', W / 2, 300, 46, '#ffe7a8', 800);
  text('Thanks for listening!', W / 2, 344, 20, 'rgba(255, 240, 220, 0.85)', 500);
  text('按 R 再演一遍 · Press R to play again', W / 2, 668, 15, 'rgba(255, 240, 220, 0.75)', 600);
  ctx.restore();
}

function render() {
  const { scale, ox, oy, dpr } = S.view, k = scale * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0c0a11'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(k, 0, 0, k, ox * dpr, oy * dpr);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  const first = Math.floor(S.camX / W + 1e-6);
  for (let i = first; i <= first + 1 && i < SCENES.length; i++) {
    const px = sceneX(i) - S.camX;
    if (px < W && px > -W) drawPanel(i, px);
  }
  drawFloor(ctx, S.camX);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, GROUND_Y + 30); ctx.clip();   // sound stays on the stage
  ctx.translate(-S.camX, 0);
  drawRings(); drawPreview();
  ctx.restore();
  ctx.save(); ctx.translate(-S.camX, 0);
  drawSingers(); drawParts();
  ctx.restore();
  drawAudience(ctx, S.time, S.cheer);
  drawHelp(); drawHud(); drawGo(); drawBanner(); drawHint(); drawEnd();
  if (S.fade > 0) { ctx.fillStyle = `rgba(12, 10, 17, ${S.fade})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// ---------- input ----------
function keyName(e) {
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': return 'left';
    case 'ArrowRight': case 'KeyD': return 'right';
    case 'Space': case 'ArrowUp': case 'KeyW': return 'jump';
    case 'ArrowDown': case 'KeyS': return 'down';
    case 'Digit1': case 'Numpad1': return 'n1';
    case 'Digit2': case 'Numpad2': return 'n2';
    case 'Digit3': case 'Numpad3': return 'n3';
    case 'Digit4': case 'Numpad4': return 'n4';
    case 'KeyR': return 'restart';
    case 'KeyM': return 'mute';
  }
  return e.code || e.key;
}

function onKeyDown(e) {
  const k = keyName(e);
  if (k === 'left' || k === 'right' || k === 'jump' || k === 'down') e.preventDefault();
  const fresh = !S.held.has(k);
  S.held.add(k);
  if (S.phase === 'title') { if (!e.repeat) startGame(START_AT); return; }
  Sfx.init();
  if (e.repeat || !fresh) return;
  if (k === 'mute') { Sfx.toggle(); return; }
  if (S.phase === 'play') {
    const a = S.singers[S.active];
    if (k === 'jump') a.jumpBuf = 0.12;
    else if (k === 'down') a.dropReq = true;
    else if (k[0] === 'n' && k.length === 2) switchTo(+k[1] - 1);
    else if (k === 'restart') restartScene();
  } else if (S.phase === 'clear') {
    if (k === 'right' && S.goShown) S.armed = true;
  } else if (S.phase === 'end' && k === 'restart') startGame(0);
}

function onPointerDown(e) {
  if (S.phase !== 'play') return;
  Sfx.init();
  const { scale, ox, oy } = S.view, x = (e.clientX - ox) / scale, y = (e.clientY - oy) / scale;
  const c = S.cards.find(c => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
  if (c) switchTo(c.i);
}

const START_AT = Math.max(0, Math.min(LEVELS.length - 1, (parseInt(new URLSearchParams(location.search).get('level'), 10) || 1) - 1));

let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000)); last = now;
  S.time += dt;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

function init() {
  resize();
  S.scene = START_AT; S.camX = sceneX(START_AT);
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', e => S.held.delete(keyName(e)));
  window.addEventListener('blur', () => S.held.clear());
  cv.addEventListener('pointerdown', onPointerDown);
  document.getElementById('startBtn').addEventListener('click', e => { e.stopPropagation(); startGame(START_AT); });
  document.getElementById('start').addEventListener('click', () => startGame(START_AT));
  requestAnimationFrame(frame);
}

window.__chorus = { S, SCENES, TUNE, LEVELS, CAST, startGame, switchTo, clearScene };
init();
