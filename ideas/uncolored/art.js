// art.js: shapes and drawing for Uncolored.
// Objects are defined in local units (about 100 across) and drawn either as a
// wobbly unfinished doodle or as a settled, colored drawing.
'use strict';

const TAU = Math.PI * 2;

const COLORS = {
  red:    { fill: '#e0453a', line: '#7c1f17' },
  yellow: { fill: '#f2c230', line: '#7d5f0a' },
  blue:   { fill: '#3a78d8', line: '#18386e' },
  orange: { fill: '#f08a2c', line: '#7f3e08' },
  green:  { fill: '#4caf50', line: '#1f5a22' },
  purple: { fill: '#8e4fc2', line: '#41206a' },
  black:  { fill: '#2a2a2e', line: '#000000', detail: '#9a9aa4' },
  white:  { fill: '#ffffff', line: '#6b6459' },
};
// Index is a bitmask of primaries: red 1, yellow 2, blue 4.
const MIX = ['white', 'red', 'yellow', 'orange', 'blue', 'purple', 'green', 'black'];
const PAINT_BITS = { red: 1, yellow: 2, blue: 4 };
const COLOR_ZH = { red: '红', yellow: '黄', blue: '蓝', orange: '橙', green: '绿', purple: '紫', black: '黑', white: '白' };
const INK = '#3b3631';
const SCENERY_INK = 'rgba(120, 110, 95, 0.32)';

// ---------- geometry helpers ----------
function arc(cx, cy, rx, ry, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
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

// Split long segments so the wobble bends straight edges too.
function subdivide(pts, closed, maxLen = 6) {
  const out = [], n = pts.length, last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen));
    for (let k = 0; k < steps; k++) out.push([a[0] + (b[0] - a[0]) * k / steps, a[1] + (b[1] - a[1]) * k / steps]);
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

function polyArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
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
function scaleToArea(pts, target) {
  const k = Math.sqrt(target / polyArea(pts));
  return pts.map(([x, y]) => [x * k, y * k]);
}

// Small seeded RNG so scenery and wobble phases are stable between loads.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

// ---------- object types ----------
// outline: closed silhouette (used for paint, collecting and bag coverage)
// lines: open detail strokes; loops: closed detail strokes
// dots: [x, y, r]; hi: highlight strokes drawn only once settled
function defineTypes() {
  const T = {};

  T.strawberry = {
    color: 'red', zh: '草莓', en: 'Strawberry',
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
    color: 'yellow', zh: '香蕉', en: 'Banana',
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
    color: 'blue', zh: '水滴', en: 'Water drop',
    outline: smooth([[0, -50], [9, -32], [22, -12], [30, 6], [28, 24], [16, 38], [0, 42], [-16, 38], [-28, 24], [-30, 6], [-22, -12], [-9, -32]], true),
    lines: [smooth([[-19, 4], [-19, 19], [-10, 30]], false)],
    dots: [[-15, -8, 2.6]],
    hi: [smooth([[-20, 6], [-20, 18], [-12, 28]], false)],
  };

  T.basketball = {
    color: 'orange', zh: '篮球', en: 'Basketball',
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
    color: 'green', zh: '仙人掌', en: 'Cactus',
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
    color: 'purple', zh: '葡萄', en: 'Grapes',
    outline: radialUnion(grapes, 0, -2, 110),
    lines: [[[0, -34], [2, -42], [6, -49]]],
    loops: [smooth([[5, -41], [14, -51], [28, -48], [19, -39]], true), ...grapes.map(([x, y, r]) => circle(x, y, r, 18))],
    dots: [],
    grapes,
    hi: grapes.map(([x, y]) => arc(x, y, 7, 7, 3.6, 4.6, 4)),
  };

  T.tophat = {
    color: 'black', zh: '礼帽', en: 'Top hat',
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

  T.snowman = {
    color: 'white', zh: '雪人', en: 'Snowman',
    outline: radialUnion([[0, 20, 28], [0, -24, 19]], 0, -6, 90),
    lines: [
      arc(0, -24, 19, 19, 0.36 * Math.PI, 0.64 * Math.PI, 6),
      [[-24, 4], [-38, -6], [-46, -16]], [[-38, -6], [-47, -4]],
      [[24, 4], [38, -6], [46, -18]], [[38, -6], [45, 0]],
    ],
    loops: [[[0, -23], [12, -20], [0, -18]]],
    dots: [[-6, -28, 2.2], [6, -28, 2.2], [-7, -15, 1.2], [-2.5, -13, 1.2], [2.5, -13, 1.2], [7, -15, 1.2], [0, 6, 2.5], [0, 18, 2.5], [0, 30, 2.5]],
    hi: [arc(0, 20, 21, 21, 3.5, 4.3, 6), arc(0, -24, 13, 13, 3.5, 4.3, 5)],
  };

  for (const k in T) {
    const t = T[k];
    t.key = k;
    t.loops = t.loops || [];
    t.area = polyArea(t.outline);
    t.bb = bboxOf(t.outline);
    t.path = pathOf(t.outline);
    t.wOutline = subdivide(t.outline, true);
    t.wLines = t.lines.map(l => subdivide(l, false));
    t.wLoops = t.loops.map(l => subdivide(l, true));
  }
  return T;
}
const TYPES = defineTypes();

// ---------- drawing ----------
// Sketchy wobble offset (world units) for point i at time t.
function wob(i, t, seed, amp) {
  return [
    amp * (0.7 * Math.sin(t * 2.1 + i * 0.9 + seed) + 0.3 * Math.sin(t * 3.7 + i * 0.37 + seed * 1.7)),
    amp * (0.7 * Math.cos(t * 1.8 + i * 1.1 + seed * 0.6) + 0.3 * Math.sin(t * 3.1 + i * 0.53 + seed * 2.3)),
  ];
}

// One wobbly stroke in world space. Closed outlines are drawn unfinished:
// pass 0 stops short of closing, pass 1 starts late and overshoots.
function doodleStroke(ctx, pts, closed, ox, oy, s, seed, t, pass) {
  const n = pts.length;
  let i0 = 0, i1 = n;
  if (closed) {
    if (pass === 0) i1 = n - Math.max(1, Math.round(n * 0.05));
    else { i0 = Math.round(n * 0.04) + (Math.floor(seed) % 3); i1 = n + Math.round(n * 0.06); }
  } else if (pass === 1) { i0 = Math.min(n - 2, 1); }
  const amp = 1.0 + 0.35 * s, dx = pass * 0.9, dy = -pass * 0.7;
  ctx.beginPath();
  for (let k = i0; k < i1; k++) {
    const p = pts[k % n], w = wob(k + pass * 17, t, seed + pass * 5, amp);
    const x = ox + p[0] * s + w[0] + dx, y = oy + p[1] * s + w[1] + dy;
    k === i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawDoodle(ctx, type, ox, oy, s, seed, t) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = pass ? 0.38 : 0.85;
    ctx.lineWidth = (pass ? 1.3 : 1.9) * (0.75 + 0.25 * s);
    doodleStroke(ctx, type.wOutline, true, ox, oy, s, seed, t, pass);
    type.wLines.forEach((l, i) => doodleStroke(ctx, l, false, ox, oy, s, seed + i * 3, t, pass));
    type.wLoops.forEach((l, i) => doodleStroke(ctx, l, true, ox, oy, s, seed + i * 7, t, pass));
  }
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1.4 * (0.75 + 0.25 * s);
  for (const [x, y, r] of type.dots) {
    const w = wob(x + y, t, seed, 0.8);
    const cx = ox + x * s + w[0], cy = oy + y * s + w[1];
    ctx.beginPath();
    if (type.seedDots) { ctx.moveTo(cx - 1.2 * s, cy - 1.6 * s); ctx.lineTo(cx + 1.0 * s, cy + 1.8 * s); }
    else ctx.arc(cx, cy, r * s * 0.8, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function strokeLocal(ctx, pts, closed) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  if (closed) ctx.closePath();
  ctx.stroke();
}

// Settled drawing in local units. The caller sets the transform; worldScale is
// the object's size factor so line widths stay constant on screen.
function drawRefined(ctx, type, colorKey, worldScale, opts = {}) {
  const c = COLORS[colorKey], lw = 1 / worldScale;
  const bb = type.bb;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (opts.glow) {
    ctx.save();
    ctx.shadowColor = 'rgba(255, 196, 40, 0.95)';
    ctx.shadowBlur = opts.glow;
    ctx.strokeStyle = 'rgba(255, 210, 80, 0.95)';
    ctx.lineWidth = 7 * lw;
    ctx.stroke(type.path);
    ctx.stroke(type.path);
    ctx.restore();
  }
  ctx.fillStyle = c.fill;
  ctx.fill(type.path);
  if (type.grapes) {
    for (const [x, y, r] of type.grapes) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = c.fill; ctx.fill();
      ctx.strokeStyle = c.detail || c.line; ctx.lineWidth = 1.6 * lw; ctx.stroke();
    }
  }
  // soft light from the top left, shade toward the bottom right
  const g = ctx.createLinearGradient(bb.x, bb.y, bb.x + bb.w, bb.y + bb.h);
  g.addColorStop(0, 'rgba(255,255,255,0.28)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, colorKey === 'white' ? 'rgba(120,140,170,0.22)' : 'rgba(0,0,0,0.16)');
  ctx.fillStyle = g;
  ctx.fill(type.path);

  ctx.strokeStyle = c.detail || c.line;
  ctx.lineWidth = 1.8 * lw;
  type.lines.forEach(l => strokeLocal(ctx, l, false));
  type.loops.forEach((l, i) => { if (!type.grapes || i === 0) strokeLocal(ctx, l, true); });
  for (const [x, y, r] of type.dots) {
    ctx.beginPath();
    if (type.seedDots) { ctx.ellipse(x, y, r * 0.8, r * 1.3, 0.3, 0, TAU); ctx.fillStyle = 'rgba(255, 236, 190, 0.95)'; }
    else { ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = c.detail || c.line; }
    ctx.fill();
  }
  ctx.strokeStyle = colorKey === 'white' ? 'rgba(170,190,215,0.8)' : 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2.6 * lw;
  type.hi.forEach(h => strokeLocal(ctx, h, false));
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 2.6 * lw;
  ctx.stroke(type.path);
}

// ---------- brush textures ----------
function makeBristle(color) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d'), r = rng(color.length * 977 + 13);
  g.fillStyle = color;
  for (let i = 0; i < 260; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 30;
    g.globalAlpha = (0.35 + 0.6 * r()) * (1 - d / 34);
    g.beginPath();
    g.ellipse(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 0.8 + r() * 2.6, 0.6 + r() * 1.2, r() * TAU, 0, TAU);
    g.fill();
  }
  return cv;
}

// ---------- the creature's bags ----------
const BAGS = [
  { zh: '小布袋', en: 'Pouch', reward: 1,
    pts: scaleToArea(smooth([[-12, -34], [-22, -46], [-8, -45], [0, -40], [8, -45], [22, -46], [12, -34], [30, -24], [46, -2], [48, 22],
      [34, 46], [0, 56], [-34, 46], [-48, 22], [-46, -2], [-30, -24]], true), 8000) },
  { zh: '挎包', en: 'Satchel', reward: 2,
    pts: scaleToArea(smooth([[-70, -30], [-40, -44], [-12, -46], [-6, -58], [6, -58], [12, -46], [40, -44], [70, -30], [74, 0], [70, 34],
      [40, 44], [0, 46], [-40, 44], [-70, 34], [-74, 0]], true), 16000) },
  { zh: '双肩包', en: 'Backpack', reward: 3,
    pts: scaleToArea(smooth([[0, -92], [14, -90], [20, -80], [40, -76], [58, -60], [62, -20], [78, -14], [82, 20], [66, 30], [64, 64],
      [48, 82], [0, 88], [-48, 82], [-64, 64], [-66, 30], [-82, 20], [-78, -14], [-62, -20], [-58, -60], [-40, -76], [-20, -80], [-14, -90]], true), 30000) },
  { zh: '巨型麻袋', en: 'Giant sack', reward: 'trophy',
    pts: scaleToArea(smooth([[0, -100], [16, -112], [30, -104], [18, -92], [56, -80], [100, -40], [118, 10], [110, 60], [80, 96], [30, 112],
      [-30, 112], [-80, 96], [-110, 60], [-118, 10], [-100, -40], [-56, -80], [-18, -92], [-30, -104], [-16, -112]], true), 55000) },
];
for (const b of BAGS) { b.area = polyArea(b.pts); b.bb = bboxOf(b.pts); b.path = pathOf(b.pts); b.wPts = subdivide(b.pts, true, 8); }

// ---------- the creature ----------
function drawCreature(ctx, x, y, t, bagIndex) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const bob = Math.sin(t * 2.2) * 3;
  // sack on its back
  const sack = smooth([[-40, -120], [-30, -132], [-22, -122], [-6, -112], [6, -80], [2, -40], [-20, -22], [-62, -24], [-84, -50], [-80, -92], [-60, -114]], true);
  ctx.fillStyle = '#fffaf0';
  ctx.strokeStyle = '#7a5a3a';
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = pass ? 0.4 : 0.9; ctx.lineWidth = pass ? 1.4 : 2.4;
    if (!pass) { ctx.beginPath(); sack.forEach(([px, py], i) => i ? ctx.lineTo(x + px, y + py + bob) : ctx.moveTo(x + px, y + py + bob)); ctx.fill(); }
    doodleStroke(ctx, subdivide(sack, true), true, x, y + bob, 1, 11, t, pass);
  }
  // body
  const body = circle(20, -62, 44, 34).map(([px, py]) => [px, (py + 62) * 1.12 - 62]);
  ctx.fillStyle = '#fffdf7';
  ctx.globalAlpha = 1;
  ctx.beginPath(); body.forEach(([px, py], i) => i ? ctx.lineTo(x + px, y + py + bob) : ctx.moveTo(x + px, y + py + bob)); ctx.fill();
  ctx.strokeStyle = '#2f4a6a';
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = pass ? 0.4 : 0.9; ctx.lineWidth = pass ? 1.4 : 2.4;
    doodleStroke(ctx, subdivide(body, true), true, x, y + bob, 1, 3, t, pass);
    doodleStroke(ctx, [[2, -8], [-2, 4], [-10, 6]], false, x, y, 1, 5, t, pass);
    doodleStroke(ctx, [[38, -8], [42, 4], [50, 6]], false, x, y, 1, 6, t, pass);
    doodleStroke(ctx, smooth([[8, -60], [20, -52], [32, -60]], false), false, x, y + bob, 1, 9, t, pass);
    doodleStroke(ctx, [[-14, -70], [-26, -90]], false, x, y + bob, 1, 12, t, pass);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#2f4a6a';
  const blink = (t % 4) < 0.12 ? 0.2 : 1;
  ctx.beginPath(); ctx.ellipse(x + 8, y - 76 + bob, 3.2, 4.5 * blink, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 32, y - 76 + bob, 3.2, 4.5 * blink, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------- paint pots ----------
function drawPaintPot(ctx, x, y, colorKey, t) {
  const bob = Math.sin(t * 2.6 + x) * 4, c = COLORS[colorKey];
  const jar = [[-26, -30], [26, -30], [24, 26], [18, 32], [-18, 32], [-24, 26]];
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.translate(x, y + bob);
  // glow
  const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 80);
  g.addColorStop(0, c.fill + '55'); g.addColorStop(1, c.fill + '00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 80, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fffdf7';
  ctx.beginPath(); jar.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.fill();
  // paint inside and a blob spilling over the rim
  ctx.fillStyle = c.fill;
  ctx.beginPath(); ctx.moveTo(-25, -12); ctx.lineTo(25, -12); ctx.lineTo(24, 26); ctx.lineTo(18, 32); ctx.lineTo(-18, 32); ctx.lineTo(-24, 26); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-30, -30);
  ctx.bezierCurveTo(-20, -48, 20, -48, 30, -30);
  ctx.bezierCurveTo(24, -24, 20, -10, 14, -12);
  ctx.bezierCurveTo(10, -20, 4, -24, 0, -26);
  ctx.bezierCurveTo(-6, -22, -10, -2, -16, -4);
  ctx.bezierCurveTo(-20, -18, -26, -24, -30, -30);
  ctx.fill();
  ctx.strokeStyle = INK;
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = pass ? 0.35 : 0.85; ctx.lineWidth = pass ? 1.3 : 2.2;
    doodleStroke(ctx, subdivide(jar, true), true, 0, 0, 1, 21, t, pass);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath(); ctx.ellipse(-10, -34, 6, 3, -0.3, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------- scenery ----------
// Light, still strokes per region theme. Returns [{pts, closed, w}] in world units.
function makeScenery(theme, rx, ry, rw, rh, seed, avoid) {
  const r = rng(seed), out = [];
  const free = (x, y, pad) => !avoid.some(a => Math.hypot(a[0] - x, a[1] - y) < a[2] + pad);
  const spot = pad => { for (let i = 0; i < 30; i++) { const x = rx + 60 + r() * (rw - 120), y = ry + 60 + r() * (rh - 120); if (free(x, y, pad)) return [x, y]; } return null; };
  const add = (pts, closed = false, w = 1.6) => out.push({ pts, closed, w });
  const tuft = (x, y, k = 1) => { for (let i = -1; i <= 1; i++) add([[x + i * 6 * k, y], [x + i * 9 * k + (r() - 0.5) * 4, y - (10 + r() * 8) * k]]); };
  const pebble = (x, y) => add(circle(x, y, 5 + r() * 6, 10).map(([px, py]) => [px, y + (py - y) * 0.6]), true);
  const flower = (x, y) => { add([[x, y], [x + 2, y - 18]]); add(circle(x + 2, y - 22, 4, 8), true); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; add(circle(x + 2 + Math.cos(a) * 8, y - 22 + Math.sin(a) * 8, 4, 8), true); } };
  const wave = (x, y, len) => { const p = []; for (let i = 0; i <= len; i += 10) p.push([x + i, y + Math.sin(i / 18) * 5]); add(p); };
  const hill = (x, y, w, h) => add(smooth([[x, y], [x + w * 0.3, y - h * 0.8], [x + w * 0.5, y - h], [x + w * 0.7, y - h * 0.7], [x + w, y]], false, 8), false, 2);
  const cloud = (x, y, k) => add(radialUnion([[x - 30 * k, y, 22 * k], [x, y - 12 * k, 30 * k], [x + 32 * k, y, 22 * k], [x, y + 8 * k, 24 * k]], x, y, 60), true, 1.8);
  const bird = (x, y) => add([[x - 10, y - 4], [x - 4, y], [x, y - 3], [x + 4, y], [x + 10, y - 4]]);
  const house = (x, y) => { add([[x - 40, y], [x - 40, y - 50], [x + 40, y - 50], [x + 40, y]], false, 1.8); add([[x - 48, y - 46], [x, y - 86], [x + 48, y - 46]], false, 1.8); add([[x - 10, y], [x - 10, y - 26], [x + 10, y - 26], [x + 10, y]]); };
  const reed = (x, y) => { add([[x, y], [x + 3, y - 50]]); add(circle(x + 3, y - 52, 4, 8).map(([px, py]) => [px, y - 52 + (py - y + 52) * 2.2]), true); };
  const post = (x, y) => add([[x, y], [x, y - 70]], false, 2);
  const peak = (x, y, w, h) => { add([[x, y], [x + w / 2, y - h], [x + w, y]], false, 2); add([[x + w * 0.38, y - h * 0.76], [x + w * 0.45, y - h * 0.7], [x + w * 0.5, y - h * 0.78], [x + w * 0.56, y - h * 0.7], [x + w * 0.62, y - h * 0.76]]); };
  const dune = (x, y, w) => add(smooth([[x, y], [x + w * 0.4, y - 26], [x + w, y]], false, 8), false, 1.8);

  const many = (n, pad, fn) => { for (let i = 0; i < n; i++) { const p = spot(pad); if (p) fn(p[0], p[1]); } };
  if (theme === 'meadow') { many(60, 40, tuft); many(14, 50, flower); many(16, 30, pebble); }
  if (theme === 'beach') { many(26, 110, (x, y) => wave(x - 60, y, 120)); many(30, 30, pebble); many(20, 30, tuft); }
  if (theme === 'desert') { many(18, 140, (x, y) => dune(x - 90, y, 180)); many(26, 30, pebble); }
  if (theme === 'pond') {
    const p = spot(260);
    if (p) { add(smooth(circle(p[0], p[1], 210, 10).map(([x, y]) => [x + (r() - 0.5) * 40, p[1] + (y - p[1]) * 0.55]), true), true, 2); for (let i = 0; i < 6; i++) add(arc(p[0] + (r() - 0.5) * 240, p[1] + (r() - 0.5) * 100, 22, 7, 3.4, 6.0, 8)); avoid.push([p[0], p[1], 260]); }
    many(22, 40, reed); many(30, 40, tuft);
  }
  if (theme === 'town') { many(7, 160, house); many(30, 30, pebble); many(24, 30, tuft); }
  if (theme === 'hills') { many(14, 170, (x, y) => hill(x - 120, y, 240, 70 + r() * 50)); many(30, 30, tuft); }
  if (theme === 'vineyard') { many(26, 60, post); many(20, 60, (x, y) => add(smooth([[x - 60, y - 60], [x - 20, y - 70], [x + 20, y - 58], [x + 60, y - 66]], false, 6))); many(20, 30, tuft); }
  if (theme === 'clouds') { many(16, 150, (x, y) => cloud(x, y, 0.8 + r() * 0.8)); many(20, 30, bird); }
  if (theme === 'summit') { many(9, 220, (x, y) => peak(x - 140, y + 60, 280, 160 + r() * 80)); many(14, 30, bird); many(20, 30, pebble); }
  return out;
}
