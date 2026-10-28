// art.js: drawing for Color Chorus. Palette, prop line art (outlines adapted
// from the Uncolored prototype), singers, backdrops, ledges, the stage floor
// and the audience. Everything is in stage units (1280 x 720, y down).
'use strict';

const TAU = Math.PI * 2;
const ART = { px: 1 };   // device pixels per stage unit, set by the game on resize

const COLORS = {
  red:    { fill: '#e0453a', line: '#7c1f17' },
  yellow: { fill: '#f2c230', line: '#7d5f0a' },
  blue:   { fill: '#3a78d8', line: '#18386e' },
  orange: { fill: '#f08a2c', line: '#7f3e08' },
  green:  { fill: '#4caf50', line: '#1f5a22' },
  purple: { fill: '#8e4fc2', line: '#41206a' },
  black:  { fill: '#2a2a2e', line: '#000000', detail: '#9a9aa4' },
};
// Index is a bitmask of primaries: red 1, yellow 2, blue 4.
const MIX = [null, 'red', 'yellow', 'orange', 'blue', 'purple', 'green', 'black'];
const BITS = { red: 1, yellow: 2, blue: 4 };
const PRIMARIES = ['red', 'yellow', 'blue'];
const COLOR_ZH = { red: '红', yellow: '黄', blue: '蓝', orange: '橙', green: '绿', purple: '紫', black: '黑' };
const INK = '#2b2733';
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Segoe UI", sans-serif';

// ---------- geometry helpers ----------
function arc(cx, cy, rx, ry, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return pts;
}
function circle(cx, cy, r, n = 28) { const p = arc(cx, cy, r, r, 0, TAU, n); p.pop(); return p; }

// Catmull-Rom spline through control points.
function smooth(ctrl, closed, seg = 6) {
  const out = [], n = ctrl.length;
  const get = i => closed ? ctrl[(i + n) % n] : ctrl[Math.max(0, Math.min(n - 1, i))];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let j = 0; j < seg; j++) {
      const t = j / seg, t2 = t * t, t3 = t2 * t;
      const f = k => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  if (!closed) out.push(ctrl[n - 1]);
  return out;
}
function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function pathOf(pts, closed = true) {
  const p = new Path2D();
  pts.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y));
  if (closed) p.closePath();
  return p;
}
// Outline of a union of circles, sampled along rays from (cx, cy).
function radialUnion(circles, cx, cy, n = 96) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, dx = Math.cos(a), dy = Math.sin(a);
    let best = 0;
    for (const [x, y, r] of circles) {
      const ox = cx - x, oy = cy - y, b = ox * dx + oy * dy, disc = b * b - (ox * ox + oy * oy - r * r);
      if (disc >= 0) best = Math.max(best, -b + Math.sqrt(disc));
    }
    out.push([cx + dx * best, cy + dy * best]);
  }
  return out;
}
function strokePts(ctx, pts, closed) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  if (closed) ctx.closePath();
  ctx.stroke();
}
// Small seeded RNG so scenery is the same on every load.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

// ---------- prop types ----------
// Shapes are in local units about 100 across, drawn at ITEM_SCALE.
// outline: closed silhouette; lines: open details; loops: closed details;
// dots: [x, y, r]; hi: highlight strokes shown once colored.
const ITEM_SCALE = 0.6;
const ITEM_TYPES = (() => {
  const T = {};
  T.strawberry = {
    zh: '草莓', en: 'Strawberry',
    outline: smooth([[0, -30], [22, -34], [40, -24], [44, -4], [34, 20], [16, 38], [0, 46], [-16, 38], [-34, 20], [-44, -4], [-40, -24], [-22, -34]], true),
    lines: [
      [[-30, -30], [-22, -41], [-14, -31], [-6, -45], [0, -33], [6, -45], [14, -31], [22, -41], [30, -30]],
      [[0, -40], [2, -49], [6, -55]],
    ],
    dots: [[-24, -12, 1.8], [-8, -16, 1.8], [8, -16, 1.8], [24, -12, 1.8], [-29, 5, 1.8], [-12, 2, 1.8], [4, 0, 1.8], [20, 5, 1.8],
      [-19, 20, 1.8], [0, 17, 1.8], [16, 22, 1.8], [-6, 32, 1.8], [8, 33, 1.8]],
    seedDots: true,
    hi: [smooth([[-31, -14], [-35, 0], [-30, 13]], false)],
  };
  T.banana = {
    zh: '香蕉', en: 'Banana',
    outline: smooth([[-46, -20], [-40, -2], [-24, 18], [0, 26], [22, 20], [38, 4], [47, -16], [48, -24], [38, -12],
      [24, -4], [2, 2], [-20, -2], [-36, -12]], true),
    lines: [
      smooth([[-38, -10], [-22, 7], [0, 14], [22, 9], [40, -7]], false),
      [[45, -21], [49, -31], [55, -34], [53, -24]],
      [[-46, -20], [-42, -14]],
    ],
    dots: [],
    hi: [smooth([[-22, 1], [-4, 6], [14, 3]], false)],
  };
  T.drop = {
    zh: '水滴', en: 'Water drop',
    outline: smooth([[0, -50], [9, -32], [22, -12], [30, 6], [28, 24], [16, 38], [0, 42], [-16, 38], [-28, 24], [-30, 6], [-22, -12], [-9, -32]], true),
    lines: [smooth([[-19, 4], [-19, 19], [-10, 30]], false)],
    dots: [[-15, -8, 2.6]],
    hi: [smooth([[-20, 6], [-20, 18], [-12, 28]], false)],
  };
  T.basketball = {
    zh: '篮球', en: 'Basketball',
    outline: circle(0, 0, 44, 44),
    lines: [
      smooth([[0, -44], [3, -15], [3, 15], [0, 44]], false),
      smooth([[-44, 0], [-15, 3], [15, 3], [44, 0]], false),
      smooth([[-30, -32], [-18, -12], [-16, 0], [-18, 12], [-30, 32]], false),
      smooth([[30, -32], [18, -12], [16, 0], [18, 12], [30, 32]], false),
    ],
    dots: [],
    hi: [arc(0, 0, 36, 36, 3.55, 4.45, 10)],
  };
  T.cactus = {
    zh: '仙人掌', en: 'Cactus',
    outline: [[0, -50], [10, -46], [13, -36], [13, -12], [24, -12], [26, -16], [26, -32], [29, -38], [32, -39], [35, -38], [38, -32],
      [38, -4], [35, 1], [30, 3], [13, 3], [13, 44], [8, 46], [-8, 46], [-13, 44], [-13, 18], [-30, 18], [-35, 16], [-38, 11],
      [-38, -16], [-35, -22], [-32, -23], [-29, -22], [-26, -16], [-26, 4], [-24, 6], [-13, 6], [-13, -36], [-10, -46]],
    lines: [
      [[-5, -40], [-5, 40]], [[5, -40], [5, 40]], [[32, -32], [32, -3]], [[-32, -16], [-32, 12]],
      [[-14, -24], [-19, -26]], [[14, -22], [19, -24]], [[-14, 30], [-19, 32]], [[14, 24], [19, 26]],
      [[39, -20], [44, -21]], [[-39, -2], [-44, -3]], [[0, -51], [0, -56]], [[37, -36], [41, -40]], [[-37, -20], [-41, -24]],
    ],
    dots: [],
    hi: [[[-9, -38], [-9, 36]]],
  };
  const grapes = [[-27, -22], [-9, -22], [9, -22], [27, -22], [-18, -3], [0, -3], [18, -3], [-9, 16], [9, 16], [0, 34]].map(([x, y]) => [x, y, 12]);
  T.grapes = {
    zh: '葡萄', en: 'Grapes',
    outline: radialUnion(grapes, 0, -2, 110),
    lines: [[[0, -34], [2, -42], [6, -49]]],
    loops: [smooth([[5, -41], [14, -51], [28, -48], [19, -39]], true)],
    dots: [],
    grapes,
    hi: grapes.map(([x, y]) => arc(x, y, 7, 7, 3.6, 4.6, 4)),
  };
  T.tophat = {
    zh: '礼帽', en: 'Top hat',
    outline: smooth([[-28, -44], [-14, -48], [0, -49], [14, -48], [28, -44], [26, -10], [25, 18], [44, 20], [48, 24], [44, 29], [24, 33],
      [0, 34], [-24, 33], [-44, 29], [-48, 24], [-44, 20], [-25, 18], [-26, -10]], true, 4),
    lines: [
      smooth([[-28, -44], [-14, -40], [0, -39], [14, -40], [28, -44]], false),
      smooth([[-26, 5], [0, 9], [26, 5]], false),
      smooth([[-25, 16], [0, 19], [25, 16]], false),
      smooth([[-44, 20], [-24, 24], [0, 25], [24, 24], [44, 20]], false),
    ],
    dots: [],
    hi: [[[-17, -36], [-16, 0]], [[-12, -38], [-11, -24]]],
  };
  for (const k in T) {
    const t = T[k];
    t.loops = t.loops || [];
    t.bb = bboxOf(t.outline);
    t.path = pathOf(t.outline);
  }
  return T;
})();

// A prop, centred on (x, y). colorKey null draws blank line art.
function drawItem(ctx, type, colorKey, x, y, opts = {}) {
  const T = ITEM_TYPES[type], s = ITEM_SCALE * (opts.scale || 1), lw = 1 / s;
  const c = colorKey ? COLORS[colorKey] : null, bb = T.bb;
  ctx.save();
  ctx.translate(x, y);
  if (opts.rot) ctx.rotate(opts.rot);
  ctx.scale(s * (opts.sx || 1), s * (opts.sy || 1));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (opts.glow) {
    ctx.save();
    ctx.shadowColor = 'rgba(255, 205, 60, 0.95)';
    ctx.shadowBlur = opts.glow * ART.px;
    ctx.strokeStyle = 'rgba(255, 214, 90, 0.95)';
    ctx.lineWidth = 9 * lw;
    ctx.stroke(T.path); ctx.stroke(T.path);
    ctx.restore();
  }
  // soft drop shadow lifts the prop off the painted backdrop
  ctx.save();
  if (!opts.flat) { ctx.shadowColor = 'rgba(25, 18, 45, 0.3)'; ctx.shadowBlur = 9 * ART.px; ctx.shadowOffsetY = 3 * ART.px; }
  ctx.fillStyle = c ? c.fill : '#fffdf7';
  ctx.fill(T.path);
  ctx.restore();
  const ink = c ? (c.detail || c.line) : INK;
  if (T.grapes) for (const [gx, gy, r] of T.grapes) {
    ctx.beginPath(); ctx.arc(gx, gy, r, 0, TAU);
    ctx.fillStyle = c ? c.fill : '#fffdf7'; ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = (c ? 1.8 : 2.2) * lw; ctx.stroke();
  }
  if (c) {
    const g = ctx.createLinearGradient(bb.x, bb.y, bb.x + bb.w, bb.y + bb.h);
    g.addColorStop(0, 'rgba(255,255,255,0.3)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = g; ctx.fill(T.path);
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = (c ? 1.9 : 2.2) * lw;
  T.lines.forEach(l => strokePts(ctx, l, false));
  T.loops.forEach(l => strokePts(ctx, l, true));
  for (const [dx, dy, r] of T.dots) {
    ctx.beginPath();
    if (T.seedDots) {
      ctx.ellipse(dx, dy, r * 0.8, r * 1.3, 0.3, 0, TAU);
      ctx.fillStyle = c ? 'rgba(255, 236, 190, 0.95)' : INK;
    } else { ctx.arc(dx, dy, r, 0, TAU); ctx.fillStyle = ink; }
    ctx.fill();
  }
  if (c) {
    ctx.strokeStyle = colorKey === 'black' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 2.8 * lw;
    T.hi.forEach(h => strokePts(ctx, h, false));
  }
  ctx.strokeStyle = c ? c.line : INK;
  ctx.lineWidth = (c ? 2.8 : 3.2) * lw;
  ctx.stroke(T.path);
  ctx.restore();
}

// ---------- singers ----------
function bodyPath(w, h) {
  const r = w / 2, rb = Math.min(w * 0.22, h * 0.3), p = new Path2D();
  p.moveTo(-r, -h + r);
  p.arc(0, -h + r, r, Math.PI, 0);
  p.lineTo(r, -rb);
  p.quadraticCurveTo(r, 0, r - rb, 0);
  p.lineTo(-r + rb, 0);
  p.quadraticCurveTo(-r, 0, -r, -rb);
  p.closePath();
  return p;
}
const BODY_PATHS = {};
function bodyFor(w, h) { const k = w + 'x' + h; return BODY_PATHS[k] || (BODY_PATHS[k] = bodyPath(w, h)); }

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// s: { def, w, h, x, y (feet), facing, squash, walk, mouth, blink, singing, wave }
function drawSinger(ctx, s, t) {
  const col = COLORS[s.def.color], w = s.w, h = s.h, f = s.facing || 1;
  const sq = s.squash || 0, breathe = s.moving ? 0 : 0.018 * Math.sin(t * 2.4 + s.seed);
  const bob = s.moving ? Math.abs(Math.sin(s.walk)) * 2.2 : 0;
  ctx.save();
  ctx.translate(s.x, s.y);
  // ground shadow
  if (s.shadow !== false) {
    ctx.fillStyle = 'rgba(20, 12, 30, 0.22)';
    ctx.beginPath(); ctx.ellipse(0, 1, w * 0.46 * (1 + 0.1 * sq), 4.5, 0, 0, TAU); ctx.fill();
  }
  // feet
  const fy = -2, step = s.moving ? Math.sin(s.walk) * 3.5 : 0;
  ctx.fillStyle = shade(col.fill, -0.45);
  ctx.beginPath(); ctx.ellipse(-w * 0.2 + step, fy, w * 0.14, 4.2, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(w * 0.2 - step, fy, w * 0.14, 4.2, 0, 0, TAU); ctx.fill();
  ctx.translate(0, -3 - bob);
  ctx.scale(1 + 0.17 * sq, 1 - 0.17 * sq + breathe);
  if (s.wave) ctx.rotate(Math.sin(t * 9) * 0.08 * s.wave);
  const body = bodyFor(w, h - 3);
  const g = ctx.createLinearGradient(-w / 2, -h, w / 2, 0);
  g.addColorStop(0, shade(col.fill, 0.28)); g.addColorStop(0.55, col.fill); g.addColorStop(1, shade(col.fill, -0.16));
  ctx.fillStyle = g; ctx.fill(body);
  // belly
  ctx.save(); ctx.clip(body);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath(); ctx.ellipse(f * w * 0.04, -h * 0.2, w * 0.32, h * 0.24, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(-w * 0.22, -h * 0.74, w * 0.1, h * 0.07, -0.6, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = shade(col.fill, -0.5); ctx.lineWidth = 2.4; ctx.stroke(body);

  const ey = -h * 0.6, ex = w * 0.19, er = Math.max(4.5, w * 0.12), look = f * er * 0.32;
  const open = s.blink > 0 ? 0.12 : 1;
  for (const side of [-1, 1]) {
    const cx = side * ex + f * w * 0.05;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(cx, ey, er, er * 1.18 * open, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = shade(col.fill, -0.55); ctx.lineWidth = 1.4; ctx.stroke();
    if (open > 0.5) {
      ctx.fillStyle = '#1e1a26';
      ctx.beginPath(); ctx.arc(cx + look, ey + er * 0.12, er * 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx + look - er * 0.2, ey - er * 0.15, er * 0.18, 0, TAU); ctx.fill();
    }
  }
  // cheeks
  ctx.fillStyle = 'rgba(255, 150, 170, 0.45)';
  ctx.beginPath(); ctx.ellipse(-ex * 1.55 + f * 3, ey + er * 1.55, er * 0.55, er * 0.32, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(ex * 1.55 + f * 3, ey + er * 1.55, er * 0.55, er * 0.32, 0, 0, TAU); ctx.fill();
  // mouth
  const my = -h * 0.36, mx = f * w * 0.05;
  if (s.singing) {
    const m = 0.35 + 0.65 * (s.mouth || 0);
    ctx.fillStyle = '#5a1e2a';
    ctx.beginPath(); ctx.ellipse(mx, my, w * 0.09 + 2 * m, (w * 0.06 + 5) * m + 1.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e86a7e';
    ctx.beginPath(); ctx.ellipse(mx, my + ((w * 0.06 + 5) * m) * 0.45, w * 0.06 + m, 2.2 * m + 0.5, 0, 0, TAU); ctx.fill();
  } else {
    ctx.strokeStyle = '#3a1a24'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my - w * 0.05, w * 0.1, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
  }
  drawLook(ctx, s.def.look, w, h, f, ey, er, my);
  ctx.restore();
}

function drawLook(ctx, look, w, h, f, ey, er, my) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (look === 'bow') {
    const y = -h * 0.13;
    ctx.fillStyle = '#2c2f52'; ctx.strokeStyle = '#15172e'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(-11, y - 7); ctx.lineTo(-11, y + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(11, y - 7); ctx.lineTo(11, y + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, y, 3.4, 0, TAU); ctx.fill();
  } else if (look === 'tuft') {
    ctx.strokeStyle = '#9a6d0c'; ctx.lineWidth = 2.6;
    for (const [dx, a] of [[-4, -0.5], [0, 0], [4, 0.5]]) {
      ctx.beginPath(); ctx.moveTo(dx, -h + 2);
      ctx.quadraticCurveTo(dx + Math.sin(a) * 6 + 3, -h - 9, dx + Math.sin(a) * 10 + 6 * Math.sign(a || 1), -h - 11); ctx.stroke();
    }
  } else if (look === 'phones') {
    ctx.strokeStyle = '#2b2d38'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, -h + w / 2 + 2, w / 2 + 3, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    ctx.fillStyle = '#3d4152';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(side * (w / 2 + 1), -h * 0.62, 5.5, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e9e4d8'; ctx.beginPath(); ctx.ellipse(side * (w / 2 + 2), -h * 0.62, 2.2, 5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3d4152';
    }
  } else if (look === 'tash') {
    ctx.fillStyle = '#4a2c1c';
    const y = my - 7;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(f * 3, y);
      ctx.bezierCurveTo(f * 3 + side * 10, y - 7, f * 3 + side * 20, y - 3, f * 3 + side * 21, y + 4);
      ctx.bezierCurveTo(f * 3 + side * 16, y, f * 3 + side * 9, y + 4, f * 3, y + 3);
      ctx.fill();
    }
    ctx.strokeStyle = '#4a2c1c'; ctx.lineWidth = 3.2;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * w * 0.12 + f * 4, ey - er * 1.6); ctx.lineTo(side * w * 0.3 + f * 4, ey - er * 1.35 - 3); ctx.stroke(); }
  } else if (look === 'beanie') {
    ctx.fillStyle = '#f1ece2'; ctx.strokeStyle = '#8f8a80'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, -h + w / 2, w / 2 + 1, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(w / 2 + 1, -h + w / 2 + 4); ctx.lineTo(-w / 2 - 1, -h + w / 2 + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#b9b2a4'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w / 2, -h + w / 2 - 1); ctx.lineTo(w / 2, -h + w / 2 - 1); ctx.stroke();
    ctx.fillStyle = '#f7f3ea'; ctx.strokeStyle = '#8f8a80'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, -h - 3, 5, 0, TAU); ctx.fill(); ctx.stroke();
  } else if (look === 'scarf') {
    const y = -h * 0.27;
    ctx.fillStyle = '#e9e1cf'; ctx.strokeStyle = '#8c826e'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-w / 2 + 2, y - 5); ctx.quadraticCurveTo(0, y + 4, w / 2 - 2, y - 5); ctx.lineTo(w / 2 - 1, y + 4); ctx.quadraticCurveTo(0, y + 13, -w / 2 + 1, y + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-f * w * 0.18, y + 6); ctx.lineTo(-f * w * 0.18 - f * 4, y + 26); ctx.lineTo(-f * w * 0.18 + f * 8, y + 25); ctx.lineTo(-f * w * 0.18 + f * 9, y + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#7fa8a0'; ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * w * 0.16, y - 1); ctx.lineTo(i * w * 0.16, y + 7); ctx.stroke(); }
  }
}

// A music note particle.
function drawNote(ctx, x, y, color, a, k) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(x, y); ctx.rotate(Math.sin(k * 3) * 0.25);
  ctx.fillStyle = COLORS[color].fill; ctx.strokeStyle = COLORS[color].line; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 4, -0.4, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = COLORS[color].line;
  ctx.beginPath(); ctx.moveTo(4.6, -1.5); ctx.lineTo(4.6, -17); ctx.quadraticCurveTo(9, -14, 11, -9); ctx.stroke();
  ctx.restore();
}

// ---------- props (stands, strings, plants) ----------
// it: { type, x, y, prop }, level-local coordinates. below: y of the surface under it.
function drawPropBack(ctx, it, below, t) {
  const x = it.x, y = it.y, top = y - 34, bot = y + 30;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (it.prop) {
    case 'bush': {
      ctx.fillStyle = '#5e9c4f';
      for (const [dx, dy, r] of [[-34, -6, 22], [-12, -16, 26], [14, -14, 25], [34, -4, 20], [0, -2, 26]]) { ctx.beginPath(); ctx.arc(x + dx, below - 14 + dy, r, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#76b465';
      for (const [dx, dy, r] of [[-20, -22, 12], [10, -26, 13], [30, -14, 9]]) { ctx.beginPath(); ctx.arc(x + dx, below - 14 + dy, r, 0, TAU); ctx.fill(); }
      break;
    }
    case 'branch': {
      ctx.strokeStyle = '#7b5a40'; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(x - 110, top - 10); ctx.quadraticCurveTo(x - 40, top - 34, x + 30, top - 30); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = '#6a4d35';
      ctx.beginPath(); ctx.moveTo(x + 2, top - 28); ctx.lineTo(x + 2, top + 4); ctx.stroke();
      ctx.fillStyle = '#6fae5c';
      for (const [dx, dy] of [[-60, -44], [-20, -48], [24, -42]]) { ctx.beginPath(); ctx.ellipse(x + dx, top + dy, 16, 9, -0.4, 0, TAU); ctx.fill(); }
      break;
    }
    case 'blanket': {
      ctx.save();
      ctx.beginPath(); ctx.moveTo(x - 92, below); ctx.lineTo(x + 92, below); ctx.lineTo(x + 70, below - 22); ctx.lineTo(x - 70, below - 22); ctx.closePath();
      ctx.fillStyle = '#f4efe2'; ctx.fill(); ctx.clip();
      ctx.fillStyle = 'rgba(110, 170, 190, 0.55)';
      for (let i = -6; i <= 6; i++) ctx.fillRect(x + i * 16 - 4, below - 24, 8, 26);
      ctx.fillStyle = 'rgba(110, 170, 190, 0.35)';
      for (let j = 0; j < 3; j++) ctx.fillRect(x - 100, below - 20 + j * 8, 200, 4);
      ctx.restore();
      break;
    }
    case 'hoop': {
      // backboard and pole to the right, net under the rim
      ctx.fillStyle = '#7d8590'; ctx.fillRect(x + 66, top - 10, 8, below - top + 10);
      ctx.fillRect(x + 40, top - 4, 30, 6);
      ctx.fillStyle = '#fbfaf6'; ctx.strokeStyle = '#7d8590'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(x + 30, top - 64, 14, 92, 3); ctx.fill(); ctx.stroke();
      break;
    }
    case 'basket': {
      ctx.fillStyle = '#c89a62'; ctx.strokeStyle = '#8a6438'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 42, below - 26); ctx.lineTo(x + 42, below - 26); ctx.lineTo(x + 34, below); ctx.lineTo(x - 34, below); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, below - 26, 42, 10, 0, Math.PI, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(120, 85, 45, 0.5)';
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(x + i * 11, below - 25); ctx.lineTo(x + i * 9, below - 1); ctx.stroke(); }
      break;
    }
    case 'vine': {
      ctx.strokeStyle = '#8b6a4b'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(x - 120, top - 40); ctx.lineTo(x + 100, top - 40); ctx.stroke();
      ctx.strokeStyle = '#5f8f4a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 120, top - 38);
      for (let i = 0; i <= 11; i++) ctx.quadraticCurveTo(x - 110 + i * 20, top - 28 + (i % 2) * 10, x - 100 + i * 20, top - 36);
      ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 4, top - 36); ctx.lineTo(x + 3, top + 6); ctx.stroke();
      ctx.fillStyle = '#6aa055';
      for (const dx of [-90, -50, 40, 80]) { ctx.beginPath(); ctx.ellipse(x + dx, top - 28, 11, 7, 0.5, 0, TAU); ctx.fill(); }
      break;
    }
    case 'pipe': {
      ctx.fillStyle = '#9aa7ad'; ctx.strokeStyle = '#6b777d'; ctx.lineWidth = 2;
      ctx.fillRect(x + 60, 0, 16, top - 36); ctx.strokeRect(x + 60, -2, 16, top - 34);
      ctx.beginPath(); ctx.roundRect(x - 8, top - 52, 84, 16, 6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(x - 9, top - 44, 18, 22, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c4d1d6'; ctx.beginPath(); ctx.roundRect(x + 26, top - 66, 22, 12, 4); ctx.fill(); ctx.stroke();
      break;
    }
    case 'stand': {
      const h0 = Math.max(0, below - bot);
      ctx.fillStyle = '#6b4f7a'; ctx.strokeStyle = '#3a2a45'; ctx.lineWidth = 2;
      if (h0 > 6) { ctx.beginPath(); ctx.rect(x - 7, bot + 4, 14, h0 - 4); ctx.fill(); ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(x, below - 2, 24, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8f6aa0';
      ctx.beginPath(); ctx.ellipse(x, bot + 3, 30, 7, 0, 0, TAU); ctx.fill(); ctx.stroke();
      break;
    }
    case 'wire': case 'lantern': {
      ctx.strokeStyle = it.prop === 'wire' ? 'rgba(230, 225, 240, 0.7)' : 'rgba(40, 32, 50, 0.85)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, top + 4); ctx.stroke();
      if (it.prop === 'lantern') {
        const gl = ctx.createRadialGradient(x, y, 10, x, y, 70);
        gl.addColorStop(0, 'rgba(255, 214, 140, 0.35)'); gl.addColorStop(1, 'rgba(255, 214, 140, 0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, 70, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3a2f40'; ctx.beginPath(); ctx.roundRect(x - 7, top - 3, 14, 8, 2); ctx.fill();
      }
      break;
    }
  }
}

// Parts drawn in front of the prop (pot rims, crates, the net).
function drawPropFront(ctx, it, below) {
  const x = it.x, y = it.y, top = y - 34;
  if (it.prop === 'pot') {
    ctx.fillStyle = '#e8e2d6'; ctx.strokeStyle = '#8c8577'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 24, below - 22); ctx.lineTo(x + 24, below - 22); ctx.lineTo(x + 18, below); ctx.lineTo(x - 18, below); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(x - 28, below - 27, 56, 8, 3); ctx.fill(); ctx.stroke();
  } else if (it.prop === 'crate') {
    ctx.fillStyle = '#c49a6c'; ctx.strokeStyle = '#7d5b3a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(x - 42, below - 22, 84, 22); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 42, below - 11); ctx.lineTo(x + 42, below - 11); ctx.moveTo(x - 30, below - 22); ctx.lineTo(x - 30, below); ctx.moveTo(x + 30, below - 22); ctx.lineTo(x + 30, below); ctx.stroke();
  } else if (it.prop === 'hoop') {
    ctx.strokeStyle = 'rgba(250, 250, 250, 0.85)'; ctx.lineWidth = 1.6;
    const ry = top + 6;
    for (let i = 0; i <= 6; i++) { const a = x - 30 + i * 10, b = x - 20 + i * 6.6; ctx.beginPath(); ctx.moveTo(a, ry); ctx.lineTo(b, ry + 40); ctx.stroke(); }
    for (let j = 1; j <= 3; j++) { const k = j / 3.4, hw = 30 - 10 * k; ctx.beginPath(); ctx.moveTo(x - hw, ry + 40 * k); ctx.lineTo(x + hw, ry + 40 * k); ctx.stroke(); }
    ctx.strokeStyle = '#d0573a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(x, ry, 32, 6, 0, 0, TAU); ctx.stroke();
  }
}

// ---------- ledges ----------
// p: [x0, x1, y] in level coordinates.
function drawLedge(ctx, theme, p, i) {
  const [x0, x1, y] = p, w = x1 - x0;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (theme === 'garden') {
    ctx.fillStyle = '#8f6a48'; ctx.fillRect(x0 + 8, y + 2, w - 16, 26);
    ctx.fillStyle = '#6d4f35'; ctx.fillRect(x0 + 8, y + 22, w - 16, 6);
    ctx.fillStyle = '#7fbf5c'; ctx.beginPath(); ctx.roundRect(x0, y - 4, w, 12, 6); ctx.fill();
    ctx.fillStyle = '#9bd57a';
    for (let x = x0 + 10; x < x1 - 6; x += 14) { ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 4, y - 11); ctx.lineTo(x + 8, y - 3); ctx.fill(); }
  } else if (theme === 'picnic') {
    if (i === 0) { // the tree branch
      ctx.fillStyle = '#7b5a40'; ctx.beginPath(); ctx.moveTo(x0 - 50, y + 22); ctx.quadraticCurveTo(x0 + w * 0.5, y + 14, x1 + 6, y + 4); ctx.lineTo(x1 + 8, y - 2); ctx.quadraticCurveTo(x0 + w * 0.5, y - 6, x0 - 50, y - 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9a7354'; ctx.fillRect(x0, y - 4, w, 4);
      ctx.fillStyle = '#6fae5c'; for (const dx of [30, 90, 150]) { ctx.beginPath(); ctx.ellipse(x0 + dx, y + 12, 14, 7, 0.4, 0, TAU); ctx.fill(); }
    } else { // the picnic table
      ctx.fillStyle = '#8a6a4b'; ctx.fillRect(x0 + 20, y + 10, 10, GROUND_Y - y - 10); ctx.fillRect(x1 - 30, y + 10, 10, GROUND_Y - y - 10);
      ctx.fillStyle = '#b28456'; ctx.fillRect(x0, y, w, 14);
      ctx.fillStyle = '#eaf4f2'; ctx.fillRect(x0 - 4, y - 2, w + 8, 10);
      ctx.fillStyle = 'rgba(100, 170, 175, 0.6)'; for (let x = x0; x < x1; x += 20) ctx.fillRect(x, y - 2, 10, 10);
      ctx.beginPath(); ctx.moveTo(x0 - 4, y + 8); for (let x = x0 - 4; x <= x1 + 4; x += 12) ctx.lineTo(x + 6, y + 15), ctx.lineTo(x + 12, y + 8); ctx.lineTo(x1 + 4, y + 8); ctx.fillStyle = '#eaf4f2'; ctx.fill();
    }
  } else if (theme === 'greenhouse') {
    ctx.fillStyle = '#a77b52'; ctx.fillRect(x0, y, w, 12);
    ctx.fillStyle = '#c69a6c'; ctx.fillRect(x0, y, w, 4);
    ctx.strokeStyle = '#7d5a3c'; ctx.lineWidth = 3;
    for (const bx of [x0 + 18, x1 - 18]) { ctx.beginPath(); ctx.moveTo(bx, y + 12); ctx.lineTo(bx, y + 34); ctx.lineTo(bx + (bx < x0 + w / 2 ? 18 : -18), y + 12); ctx.stroke(); }
  } else if (theme === 'stage') {
    const g = ctx.createLinearGradient(0, y, 0, y + 30);
    g.addColorStop(0, '#5b3d6e'); g.addColorStop(1, '#3a2549');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x0, y, w, 26, 5); ctx.fill();
    ctx.fillStyle = '#e2b45a'; ctx.fillRect(x0, y, w, 4); ctx.fillRect(x0 + 6, y + 21, w - 12, 2);
    ctx.fillStyle = 'rgba(226, 180, 90, 0.8)';
    for (let x = x0 + 22; x < x1 - 10; x += 34) { ctx.beginPath(); ctx.arc(x, y + 13, 2.6, 0, TAU); ctx.fill(); }
  } else if (theme === 'night') {
    ctx.fillStyle = '#5a4637'; ctx.fillRect(x0 + 10, y + 8, 7, 40); ctx.fillRect(x1 - 17, y + 8, 7, 40);
    ctx.save(); ctx.beginPath(); ctx.moveTo(x0 - 10, y); ctx.lineTo(x1 + 10, y); ctx.lineTo(x1, y + 22); ctx.lineTo(x0, y + 22); ctx.closePath(); ctx.clip();
    for (let k = 0, x = x0 - 10; x < x1 + 10; x += 20, k++) { ctx.fillStyle = k % 2 ? '#e9dfc8' : '#4f8f8a'; ctx.fillRect(x, y, 20, 22); }
    ctx.restore();
    ctx.fillStyle = '#e9dfc8';
    for (let k = 0, x = x0; x < x1; x += 20, k++) { ctx.beginPath(); ctx.arc(x + 10, y + 22, 10, 0, Math.PI); ctx.fillStyle = k % 2 ? '#e9dfc8' : '#4f8f8a'; ctx.fill(); }
    ctx.fillStyle = '#f5ecd8'; ctx.fillRect(x0 - 10, y - 2, w + 20, 4);
  }
}

// ---------- backdrops ----------
function skyGradient(ctx, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND_Y + 2);
}
function hills(ctx, base, amp, color, seed, step = 90) {
  const r = rng(seed);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y + 2); ctx.lineTo(0, base);
  let prev = [0, base];
  for (let x = step; x <= W + step; x += step) {
    const y = base - r() * amp;
    ctx.quadraticCurveTo(prev[0] + step / 2, prev[1] - amp * 0.4, x, y);
    prev = [x, y];
  }
  ctx.lineTo(W, GROUND_Y + 2); ctx.closePath(); ctx.fill();
}
function cloud(ctx, x, y, k, a = 0.9) {
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  for (const [dx, dy, r] of [[-38, 6, 24], [-10, -10, 32], [24, -4, 28], [48, 8, 20], [6, 10, 26]]) { ctx.beginPath(); ctx.arc(x + dx * k, y + dy * k, r * k, 0, TAU); ctx.fill(); }
}
function treeBlob(ctx, x, y, r, c1, c2) {
  ctx.fillStyle = c1;
  for (const [dx, dy, k] of [[0, 0, 1], [-0.7, 0.3, 0.75], [0.7, 0.35, 0.72], [-0.3, -0.55, 0.7], [0.4, -0.5, 0.65]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, r * k, 0, TAU); ctx.fill(); }
  ctx.fillStyle = c2;
  for (const [dx, dy, k] of [[-0.35, -0.5, 0.32], [0.2, -0.65, 0.26], [-0.7, 0, 0.24]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, r * k, 0, TAU); ctx.fill(); }
}

const BACKDROPS = {
  garden(ctx, t) {
    skyGradient(ctx, [[0, '#9ed4f2'], [0.62, '#d9eff2'], [1, '#fbf1d6']]);
    const sg = ctx.createRadialGradient(1090, 130, 10, 1090, 130, 170);
    sg.addColorStop(0, 'rgba(255, 240, 180, 0.95)'); sg.addColorStop(0.3, 'rgba(255, 236, 170, 0.5)'); sg.addColorStop(1, 'rgba(255, 236, 170, 0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(1090, 130, 170, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff1b8'; ctx.beginPath(); ctx.arc(1090, 130, 44, 0, TAU); ctx.fill();
    for (let i = 0; i < 3; i++) cloud(ctx, ((i * 470 + t * (6 + i * 2)) % (W + 300)) - 150, 120 + i * 50, 0.9 + i * 0.25, 0.75);
    hills(ctx, 470, 60, '#c3e2b1', 11, 160);
    hills(ctx, 530, 50, '#a4d190', 23, 120);
    // tree on the left
    ctx.fillStyle = '#86644a';
    ctx.beginPath(); ctx.moveTo(128, GROUND_Y); ctx.quadraticCurveTo(150, 460, 140, 300); ctx.lineTo(176, 300); ctx.quadraticCurveTo(178, 470, 196, GROUND_Y); ctx.closePath(); ctx.fill();
    treeBlob(ctx, 160, 250, 95, '#6aa95a', '#86c070');
    // picket fence
    ctx.fillStyle = '#f6f1e7'; ctx.strokeStyle = '#cfc4b0'; ctx.lineWidth = 1.5;
    ctx.fillRect(380, 572, 900, 8); ctx.fillRect(380, 598, 900, 8);
    for (let x = 384; x < W; x += 28) { ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.lineTo(x, 556); ctx.lineTo(x + 7, 546); ctx.lineTo(x + 14, 556); ctx.lineTo(x + 14, GROUND_Y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    const r = rng(5);
    for (let i = 0; i < 26; i++) {
      const x = r() * W, y = 596 + r() * 22, c = ['#f8d3dc', '#ffffff', '#f6e6b0', '#dcd0f2'][i % 4];
      ctx.fillStyle = c; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5, 2.8, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#f3c86a'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 2; i++) { // butterflies
      const bx = 500 + i * 380 + Math.sin(t * 0.7 + i) * 120, by = 230 + i * 90 + Math.sin(t * 1.3 + i * 2) * 30, fl = Math.abs(Math.sin(t * 12 + i));
      ctx.fillStyle = i ? '#e8d2f5' : '#fbe2ec';
      ctx.beginPath(); ctx.ellipse(bx - 5 * fl, by, 6 * fl + 1, 5, 0.3, 0, TAU); ctx.ellipse(bx + 5 * fl, by, 6 * fl + 1, 5, -0.3, 0, TAU); ctx.fill();
    }
  },

  picnic(ctx, t) {
    skyGradient(ctx, [[0, '#86cbf0'], [0.7, '#d4eef6'], [1, '#eef7e4']]);
    for (let i = 0; i < 4; i++) cloud(ctx, ((i * 360 + t * (8 + i * 3)) % (W + 300)) - 150, 100 + (i % 2) * 70, 0.8 + (i % 3) * 0.3, 0.92);
    hills(ctx, 455, 50, '#bfe0a8', 31, 150);
    const r = rng(9);
    for (let i = 0; i < 9; i++) { const x = 380 + r() * 880, y = 470 + r() * 30; ctx.fillStyle = '#86b874'; ctx.fillRect(x - 2, y, 4, 28); treeBlob(ctx, x, y - 6, 16 + r() * 10, '#8fc27b', '#a5d390'); }
    hills(ctx, 540, 40, '#9fd08a', 37, 110);
    ctx.fillStyle = '#7f5d43';
    ctx.beginPath(); ctx.moveTo(60, GROUND_Y); ctx.quadraticCurveTo(96, 470, 86, 330); ctx.lineTo(126, 330); ctx.quadraticCurveTo(124, 480, 150, GROUND_Y); ctx.closePath(); ctx.fill();
    treeBlob(ctx, 104, 260, 105, '#66a657', '#81bd6b');
  },

  greenhouse(ctx, t) {
    skyGradient(ctx, [[0, '#cdeee6'], [0.6, '#dff3ea'], [1, '#eef6e6']]);
    // glass panes and frames
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let x = 0; x < W; x += 160) ctx.fillRect(x + 10, 70, 70, GROUND_Y - 70);
    ctx.strokeStyle = '#f7fbf8'; ctx.lineWidth = 7;
    for (let x = 0; x <= W; x += 160) { ctx.beginPath(); ctx.moveTo(x, 60); ctx.lineTo(x, GROUND_Y); ctx.stroke(); }
    for (const y of [210, 410]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(0, 64); ctx.lineTo(W, 64); ctx.stroke();
    ctx.lineWidth = 4;
    for (let x = 0; x <= W; x += 160) { ctx.beginPath(); ctx.moveTo(x, 64); ctx.lineTo(W / 2 + (x - W / 2) * 0.6, 0); ctx.stroke(); }
    // light rays
    ctx.fillStyle = 'rgba(255, 255, 240, 0.22)';
    for (let i = 0; i < 4; i++) { const x = 160 + i * 300; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 90, 0); ctx.lineTo(x + 330, GROUND_Y); ctx.lineTo(x + 200, GROUND_Y); ctx.closePath(); ctx.fill(); }
    // big leaves at the bottom corners
    const leaf = (x, y, a, s, c) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(30, -30, 90, -40, 120, 0); ctx.bezierCurveTo(90, 30, 30, 25, 0, 0); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2 / s; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(112, 0); ctx.stroke(); ctx.restore(); };
    leaf(20, GROUND_Y, -1.2, 1.1, '#5d9a5a'); leaf(60, GROUND_Y, -0.7, 0.9, '#6fae66'); leaf(0, GROUND_Y - 60, -0.3, 0.8, '#4f8a50');
    leaf(1260, GROUND_Y, -2.0, 1.1, '#5d9a5a'); leaf(1220, GROUND_Y, -2.4, 0.9, '#6fae66'); leaf(1280, GROUND_Y - 70, -2.9, 0.8, '#4f8a50');
    // hanging pots
    for (const hx of [1040, 1160]) {
      ctx.strokeStyle = '#8f8a80'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hx, 64); ctx.lineTo(hx, 130); ctx.stroke();
      ctx.fillStyle = '#ece6da'; ctx.beginPath(); ctx.moveTo(hx - 22, 130); ctx.lineTo(hx + 22, 130); ctx.lineTo(hx + 15, 156); ctx.lineTo(hx - 15, 156); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#5f9a55'; ctx.lineWidth = 3;
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(hx + k * 7, 132); ctx.quadraticCurveTo(hx + k * 14, 160, hx + k * 12, 185 + Math.abs(k) * -8 + Math.sin(t + k) * 3); ctx.stroke(); }
    }
    // steam
    for (let i = 0; i < 5; i++) {
      const u = ((t * 0.08 + i / 5) % 1), x = 200 + i * 230 + Math.sin(t * 0.5 + i) * 20, y = GROUND_Y - u * 300;
      ctx.fillStyle = `rgba(255,255,255,${0.25 * Math.sin(u * Math.PI)})`;
      ctx.beginPath(); ctx.arc(x, y, 30 + u * 40, 0, TAU); ctx.fill();
    }
  },

  stage(ctx, t) {
    skyGradient(ctx, [[0, '#2a1f4d'], [0.6, '#3b2a5e'], [1, '#4b3365']]);
    const r = rng(77);
    for (let i = 0; i < 70; i++) {
      const x = r() * W, y = 70 + r() * 460, tw = 0.5 + 0.5 * Math.sin(t * (1 + r() * 2) + i);
      ctx.fillStyle = `rgba(255, 246, 220, ${0.25 + 0.55 * tw})`;
      ctx.beginPath(); ctx.arc(x, y, 0.8 + r() * 1.6, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 244, 214, 0.85)'; ctx.beginPath(); ctx.arc(1010, 150, 40, 0, TAU); ctx.fill();
    ctx.fillStyle = '#33265a'; ctx.beginPath(); ctx.arc(1026, 140, 36, 0, TAU); ctx.fill();
    // spotlights
    for (let i = 0; i < 2; i++) {
      const ox = i ? 1040 : 240, a = Math.sin(t * 0.5 + i * 2) * 0.35, tx = ox + Math.sin(a) * 700 * (i ? -1 : 1) + (i ? -250 : 250);
      const g = ctx.createLinearGradient(ox, 0, tx, GROUND_Y);
      g.addColorStop(0, 'rgba(255, 244, 210, 0.3)'); g.addColorStop(1, 'rgba(255, 244, 210, 0.04)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ox - 14, 0); ctx.lineTo(ox + 14, 0); ctx.lineTo(tx + 110, GROUND_Y); ctx.lineTo(tx - 110, GROUND_Y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255, 244, 210, 0.08)'; ctx.beginPath(); ctx.ellipse(tx, GROUND_Y - 4, 120, 12, 0, 0, TAU); ctx.fill();
    }
    // curtains
    const curtain = (x0, dir) => {
      for (let k = 0; k < 5; k++) {
        const x = x0 + dir * k * 22, g = ctx.createLinearGradient(x, 0, x + dir * 22, 0);
        g.addColorStop(0, '#6a1c35'); g.addColorStop(0.5, '#93304e'); g.addColorStop(1, '#5a1630');
        ctx.fillStyle = g; ctx.fillRect(Math.min(x, x + dir * 22), 0, 22, GROUND_Y);
      }
      ctx.fillStyle = '#e2b45a'; ctx.fillRect(dir > 0 ? x0 + 104 : x0 - 110, 380, 6, 30);
    };
    curtain(0, 1); curtain(W, -1);
    ctx.fillStyle = '#7d2440';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 60);
    for (let x = W; x >= 0; x -= 80) ctx.quadraticCurveTo(x - 40, 92, x - 80, 60);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e2b45a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 60); for (let x = W; x >= 0; x -= 80) ctx.quadraticCurveTo(x - 40, 92, x - 80, 60); ctx.stroke();
  },

  night(ctx, t) {
    skyGradient(ctx, [[0, '#121838'], [0.55, '#262b5a'], [1, '#4a3e6c']]);
    const r = rng(101);
    for (let i = 0; i < 90; i++) {
      const x = r() * W, y = 60 + r() * 330, tw = 0.5 + 0.5 * Math.sin(t * (0.8 + r() * 2.5) + i * 1.7);
      ctx.fillStyle = `rgba(255, 250, 230, ${0.2 + 0.6 * tw})`;
      ctx.beginPath(); ctx.arc(x, y, 0.7 + r() * 1.4, 0, TAU); ctx.fill();
    }
    const mg = ctx.createRadialGradient(1130, 120, 20, 1130, 120, 110);
    mg.addColorStop(0, 'rgba(255, 246, 214, 0.5)'); mg.addColorStop(1, 'rgba(255, 246, 214, 0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(1130, 120, 110, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f6efd8'; ctx.beginPath(); ctx.arc(1130, 120, 34, 0, TAU); ctx.fill();
    // city silhouette with lit windows
    const rb = rng(55);
    for (let x = -10; x < W; ) {
      const bw = 50 + rb() * 70, bh = 90 + rb() * 170, y = GROUND_Y - bh;
      ctx.fillStyle = '#1f2348'; ctx.fillRect(x, y, bw, bh);
      for (let wy = y + 12; wy < GROUND_Y - 30; wy += 22) for (let wx = x + 8; wx < x + bw - 12; wx += 16) {
        if (rb() < 0.45) { ctx.fillStyle = rb() < 0.08 && Math.sin(t * 2 + wx) > 0.7 ? '#fff1c4' : 'rgba(255, 214, 140, 0.55)'; ctx.fillRect(wx, wy, 7, 10); }
      }
      x += bw + 6 + rb() * 20;
    }
    // string lights
    for (const [a, b, sag] of [[[0, 96], [640, 110], 40], [[640, 110], [1280, 96], 40]]) {
      ctx.strokeStyle = 'rgba(30, 24, 40, 0.9)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo((a[0] + b[0]) / 2, Math.max(a[1], b[1]) + sag, b[0], b[1]); ctx.stroke();
      for (let k = 1; k < 16; k++) {
        const u = k / 16, x = (1 - u) * (1 - u) * a[0] + 2 * u * (1 - u) * (a[0] + b[0]) / 2 + u * u * b[0];
        const y = (1 - u) * (1 - u) * a[1] + 2 * u * (1 - u) * (Math.max(a[1], b[1]) + sag) + u * u * b[1];
        const on = 0.65 + 0.35 * Math.sin(t * 3 + k * 1.3);
        ctx.fillStyle = `rgba(255, 228, 160, ${on})`; ctx.beginPath(); ctx.arc(x, y + 5, 4, 0, TAU); ctx.fill();
      }
    }
    // fireflies
    for (let i = 0; i < 10; i++) {
      const x = (i * 137 + Math.sin(t * 0.4 + i) * 60) % W, y = 380 + Math.sin(t * 0.7 + i * 2.1) * 120;
      ctx.fillStyle = `rgba(255, 240, 170, ${0.35 + 0.35 * Math.sin(t * 3 + i)})`; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TAU); ctx.fill();
    }
  },

  finale(ctx, t) {
    skyGradient(ctx, [[0, '#4a1830'], [1, '#2a0f20']]);
    for (let k = 0; k < W; k += 64) {
      const g = ctx.createLinearGradient(k, 0, k + 64, 0);
      g.addColorStop(0, '#5e1a35'); g.addColorStop(0.5, '#8e2c4c'); g.addColorStop(1, '#561730');
      ctx.fillStyle = g; ctx.fillRect(k, 0, 64, GROUND_Y);
    }
    ctx.fillStyle = 'rgba(255, 236, 190, 0.1)'; ctx.beginPath(); ctx.ellipse(W / 2, GROUND_Y, 520, 160, 0, Math.PI, TAU); ctx.fill();
    // garland of all seven props in their true colors
    ctx.strokeStyle = '#e2b45a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(140, 100); ctx.quadraticCurveTo(640, 220, 1140, 100); ctx.stroke();
    const order = ['strawberry', 'basketball', 'banana', 'cactus', 'drop', 'grapes', 'tophat'];
    order.forEach((k, i) => {
      const u = (i + 1) / 8, x = 140 + u * 1000, y = (1 - u) * (1 - u) * 100 + 2 * u * (1 - u) * 220 + u * u * 100;
      drawItem(ctx, k, ITEM_COLOR[k], x, y + 30 + Math.sin(t * 2 + i) * 3, { scale: 0.75, rot: Math.sin(t * 1.5 + i) * 0.08 });
    });
  },
};

// Paper grain laid over every backdrop.
const GRAIN = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = rng(42);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(60,40,30,${0.02 + r() * 0.05})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 1.5, 1 + r() * 1.5); }
  return c;
})();

// ---------- stage floor, pit and audience ----------
// camX: world x at the left screen edge (the floor is continuous in world space).
function drawFloor(ctx, camX) {
  const top = GROUND_Y, face = 30;
  ctx.fillStyle = '#e8b97f'; ctx.fillRect(0, top, W, 6);
  const g = ctx.createLinearGradient(0, top + 6, 0, top + face);
  g.addColorStop(0, '#b98250'); g.addColorStop(1, '#8e5c34');
  ctx.fillStyle = g; ctx.fillRect(0, top + 6, W, face - 6);
  ctx.strokeStyle = 'rgba(70, 40, 20, 0.45)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, top + 18); ctx.lineTo(W, top + 18); ctx.stroke();
  const off = ((camX % 160) + 160) % 160;
  for (let x = -off; x < W; x += 160) {
    ctx.beginPath(); ctx.moveTo(x, top + 6); ctx.lineTo(x, top + 18); ctx.moveTo(x + 80, top + 18); ctx.lineTo(x + 80, top + face); ctx.stroke();
  }
  ctx.fillStyle = '#5c3a22'; ctx.fillRect(0, top + face, W, 4);
  const pg = ctx.createLinearGradient(0, top + face + 4, 0, H);
  pg.addColorStop(0, '#2c2233'); pg.addColorStop(1, '#100c16');
  ctx.fillStyle = pg; ctx.fillRect(0, top + face + 4, W, H - top - face - 4);
}

const AUDIENCE = (() => {
  const r = rng(303), out = [];
  for (let x = 14; x < W; x += 34 + r() * 18) out.push({ x, s: 0.8 + r() * 0.45, ph: r() * TAU, hand: r() < 0.35 });
  return out;
})();
function drawAudience(ctx, t, cheer) {
  for (const a of AUDIENCE) {
    const jump = cheer > 0 ? Math.max(0, Math.sin(t * 9 + a.ph)) * 7 * cheer : Math.sin(t * 1.2 + a.ph) * 0.6;
    const y = H + 6 - jump, s = a.s;
    ctx.fillStyle = '#07050b';
    ctx.beginPath(); ctx.ellipse(a.x, y, 22 * s, 14 * s, 0, Math.PI, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(a.x, y - 22 * s, 11 * s, 0, TAU); ctx.fill();
    if (a.hand && cheer > 0.15) {
      ctx.strokeStyle = '#07050b'; ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
      const hx = a.x + 14 * s, hy = y - 30 * s - jump * 0.8;
      ctx.beginPath(); ctx.moveTo(a.x + 10 * s, y - 8 * s); ctx.lineTo(hx + Math.sin(t * 12 + a.ph) * 4, hy); ctx.stroke();
    }
  }
}
