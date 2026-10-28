// panel.js: the creature's window. Drag backpack items over the bag outline;
// at 98% coverage the creature takes every item touching the outline.
'use strict';

const COVER_GOAL = 0.98, CELL_PX = 88, ROT_STEP = Math.PI / 12;
const TYPE_ORDER = Object.keys(TYPES);

const Panel = {
  placed: [], drag: null, hover: null, cover: 0, dirty: true, scroll: 0, celebrate: null,

  init() {
    this.cv = document.getElementById('pc');
    this.ctx = this.cv.getContext('2d');
    this.cov = document.createElement('canvas');
    this.cctx = this.cov.getContext('2d', { willReadFrequently: true });
    this.cv.addEventListener('pointerdown', e => this.onDown(e));
    this.cv.addEventListener('pointermove', e => this.onMove(e));
    this.cv.addEventListener('pointerup', e => this.onUp(e));
    this.cv.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    this.cv.addEventListener('contextmenu', e => e.preventDefault());
    document.getElementById('pClose').addEventListener('click', () => this.close());
  },

  open() {
    if (S.round >= BAGS.length) return;
    S.panelOpen = true; S.ptr.down = false; Sfx.scratch(0);
    this.placed = []; this.drag = null; this.scroll = 0; this.celebrate = null;
    document.getElementById('panel').classList.remove('hidden');
    this.layout();
    hint('panel', '把背包里的东西拖到虚线轮廓上，盖住它<small>Drag your items onto the dashed outline to cover it.</small>');
  },

  close(silent) {
    if (this.celebrate) return;
    if (!silent && this.placed.length) toast('物品都退回背包了<small>Your items went back into the backpack.</small>', 2200);
    this.placed = []; this.drag = null;
    S.panelOpen = false;
    document.getElementById('panel').classList.add('hidden');
  },

  layout() {
    const r = this.cv.getBoundingClientRect(), dpr = S.view.dpr || 1;
    this.W = r.width; this.H = r.height; this.dpr = dpr;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
    this.trayH = Math.min(210, Math.max(120, this.H * 0.3));
    this.trayTop = this.H - this.trayH;
    const bag = BAGS[S.round];
    if (!bag) return;
    const bb = bag.bb, areaW = this.W - 220, areaH = this.trayTop - 30;
    this.k = Math.min(3.2, areaW * 0.62 / bb.w, areaH * 0.82 / bb.h);
    this.ox = 200 + areaW / 2 - (bb.x + bb.w / 2) * this.k;
    this.oy = 15 + areaH / 2 - (bb.y + bb.h / 2) * this.k;
    this.res = 260 / Math.max(bb.w, bb.h);
    this.cov.width = Math.ceil(bb.w * this.res) + 2; this.cov.height = Math.ceil(bb.h * this.res) + 2;
    this.bagPixels = this.countBag([]);
    this.dirty = true;
    const reward = bag.reward === 'trophy' ? '奖杯 Trophy' : `钥匙 Key × ${bag.reward}`;
    document.getElementById('pRound').textContent = `第 ${S.round + 1} / ${BAGS.length} 个背包：${bag.zh} · ${bag.en}`;
    document.getElementById('pReward').textContent = `奖励 Reward：${reward}`;
  },

  // Rasterise the bag, cut out the given placements, return opaque pixels left.
  countBag(list) {
    const c = this.cctx, bag = BAGS[S.round], res = this.res, w = this.cov.width, h = this.cov.height;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
    c.setTransform(res, 0, 0, res, -bag.bb.x * res + 1, -bag.bb.y * res + 1);
    c.globalCompositeOperation = 'source-over'; c.fillStyle = '#000'; c.fill(bag.path);
    c.globalCompositeOperation = 'destination-out';
    for (const pl of list) this.fillItem(c, pl);
    c.globalCompositeOperation = 'source-over';
    const d = c.getImageData(0, 0, w, h).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 127) n++;
    return n;
  },
  fillItem(c, pl) {
    c.save(); c.translate(pl.x, pl.y); c.rotate(pl.rot); c.scale(pl.item.s, pl.item.s);
    c.fill(TYPES[pl.item.type].path); c.restore();
  },
  touches(pl) {
    const c = this.cctx, bag = BAGS[S.round], res = this.res, w = this.cov.width, h = this.cov.height;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
    c.setTransform(res, 0, 0, res, -bag.bb.x * res + 1, -bag.bb.y * res + 1);
    c.fillStyle = '#000'; this.fillItem(c, pl);
    c.globalCompositeOperation = 'destination-in'; c.fill(bag.path); c.globalCompositeOperation = 'source-over';
    const d = c.getImageData(0, 0, w, h).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 127 && ++n > 2) return true;
    return false;
  },
  measure() {
    const list = this.placed.slice();
    if (this.drag && !this.overTray && !list.includes(this.drag.pl)) list.push(this.drag.pl);
    this.cover = 1 - this.countBag(list) / this.bagPixels;
    // leave the uncovered part in the coverage canvas, tinted, to show the gaps
    const c = this.cctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#e0453a'; c.fillRect(0, 0, this.cov.width, this.cov.height);
    c.globalCompositeOperation = 'source-over';
    const pct = Math.floor(this.cover * 100);
    document.getElementById('pPct').textContent = `覆盖 ${pct}% / 98%`;
    const bar = document.getElementById('pBar');
    bar.style.width = `${Math.min(100, this.cover / COVER_GOAL * 100)}%`;
    bar.classList.toggle('full', this.cover >= COVER_GOAL);
  },

  // ----- tray -----
  trayItems() {
    const placedIds = new Set(this.placed.map(p => p.item.id));
    if (this.drag) placedIds.add(this.drag.pl.item.id);
    return S.backpack.filter(it => !placedIds.has(it.id))
      .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || b.s - a.s);
  },
  trayCols() { return Math.max(1, Math.floor((this.W - 40) / CELL_PX)); },
  trayCell(i) {
    const cols = this.trayCols();
    return { x: 20 + (i % cols) * CELL_PX, y: this.trayTop + 34 + Math.floor(i / cols) * CELL_PX - this.scroll };
  },
  trayHit(x, y) {
    const items = this.trayItems();
    for (let i = 0; i < items.length; i++) {
      const c = this.trayCell(i);
      if (x >= c.x && x < c.x + CELL_PX - 8 && y >= c.y && y < c.y + CELL_PX - 8 && y > this.trayTop + 30) return items[i];
    }
    return null;
  },

  // ----- input -----
  toBag(x, y) { return [(x - this.ox) / this.k, (y - this.oy) / this.k]; },
  local(e) { const r = this.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; },
  placedAt(x, y) {
    const [bx, by] = this.toBag(x, y);
    for (let i = this.placed.length - 1; i >= 0; i--) {
      const pl = this.placed[i], dx = bx - pl.x, dy = by - pl.y, c = Math.cos(-pl.rot), s = Math.sin(-pl.rot);
      if (HIT.isPointInPath(TYPES[pl.item.type].path, (dx * c - dy * s) / pl.item.s, (dx * s + dy * c) / pl.item.s)) return pl;
    }
    return null;
  },
  onDown(e) {
    if (this.celebrate) return;
    const [x, y] = this.local(e);
    if (e.button === 2) {
      const pl = y < this.trayTop && this.placedAt(x, y);
      if (pl) { this.placed.splice(this.placed.indexOf(pl), 1); this.dirty = true; }
      return;
    }
    if (e.button !== 0) return;
    if (y >= this.trayTop) {
      const item = this.trayHit(x, y);
      if (!item) return;
      const [bx, by] = this.toBag(x, y);
      this.drag = { pl: { item, x: bx, y: by, rot: 0 }, dx: 0, dy: 0 };
    } else {
      const pl = this.placedAt(x, y);
      if (!pl) return;
      const [bx, by] = this.toBag(x, y);
      this.placed.splice(this.placed.indexOf(pl), 1);
      this.drag = { pl, dx: bx - pl.x, dy: by - pl.y };
    }
    this.overTray = y >= this.trayTop;
    this.cv.setPointerCapture(e.pointerId);
    Sfx.tone(420, 0.08, 'sine', 0.08);
    this.dirty = true;
  },
  onMove(e) {
    const [x, y] = this.local(e);
    this.mouse = [x, y];
    if (!this.drag) return;
    const [bx, by] = this.toBag(x, y);
    this.drag.pl.x = bx - this.drag.dx; this.drag.pl.y = by - this.drag.dy;
    this.overTray = y >= this.trayTop;
    this.dirty = true;
  },
  onUp(e) {
    if (!this.drag) return;
    const pl = this.drag.pl;
    this.drag = null;
    if (!this.overTray) { this.placed.push(pl); Sfx.tone(300, 0.1, 'triangle', 0.1); }
    this.measure();
    this.dirty = false;
    if (this.cover >= COVER_GOAL) this.complete();
  },
  rotate(dir) {
    const pl = this.drag ? this.drag.pl : this.mouse && this.mouse[1] < this.trayTop && this.placedAt(...this.mouse);
    if (!pl) return false;
    pl.rot += dir * ROT_STEP; this.dirty = true;
    if (!this.drag) { this.measure(); this.dirty = false; if (this.cover >= COVER_GOAL) this.complete(); }
    return true;
  },
  onWheel(e) {
    e.preventDefault();
    if (this.celebrate) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    if (this.rotate(dir)) return;
    if (this.mouse && this.mouse[1] >= this.trayTop) {
      const rows = Math.ceil(this.trayItems().length / this.trayCols()), max = Math.max(0, rows * CELL_PX - (this.trayH - 40));
      this.scroll = Math.max(0, Math.min(max, this.scroll + dir * CELL_PX * 0.5));
    }
  },
  onKey(e) {
    const k = e.key.toLowerCase();
    if (k === 'escape') this.close();
    else if (k === 'r') this.rotate(e.shiftKey ? -1 : 1);
    else if (k === 'm') Sfx.toggle();
  },

  complete() {
    const bag = BAGS[S.round], used = this.placed.filter(pl => this.touches(pl)), ids = new Set(used.map(pl => pl.item.id));
    S.backpack = S.backpack.filter(it => !ids.has(it.id));
    S.given += used.length;
    this.placed = [];
    if (bag.reward !== 'trophy') S.keys += bag.reward;
    S.round++;
    this.celebrate = { t0: S.time, used, bag };
    Sfx.success();
    updateHud();
  },
  endCelebrate() {
    const bag = this.celebrate.bag;
    this.celebrate = null;
    if (bag.reward === 'trophy') { this.close(true); win(); return; }
    this.layout();
    this.measure();
    toast(`获得 ${bag.reward} 把钥匙！到地图边缘的雾气旁解锁新区域<small>Got ${bag.reward} key${bag.reward > 1 ? 's' : ''}! Unlock new regions at the edge of the fog.</small>`, 5000);
  },

  // ----- drawing -----
  drawItem(c, pl, alpha = 1) {
    const L = pl.item.s * this.k;
    c.save(); c.globalAlpha = alpha;
    c.translate(this.ox + pl.x * this.k, this.oy + pl.y * this.k); c.rotate(pl.rot); c.scale(L, L);
    drawRefined(c, TYPES[pl.item.type], pl.item.color, L);
    c.restore();
  },
  frame() {
    if (this.dirty) { this.measure(); this.dirty = false; }
    if (this.celebrate && S.time - this.celebrate.t0 > 1.7) this.endCelebrate();
    if (!S.panelOpen) return;
    const c = this.ctx, W = this.W, H = this.H, bag = BAGS[S.round];
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.save(); c.translate(110, this.trayTop - 30); c.scale(0.9, 0.9); drawCreature(c, 0, 0, S.time, S.round); c.restore();

    if (this.celebrate) {
      const u = Math.min(1, (S.time - this.celebrate.t0) / 1.2);
      for (const pl of this.celebrate.used) {
        const q = { ...pl, x: pl.x + ((110 - this.ox) / this.k - pl.x) * u * u, y: pl.y + ((this.trayTop - 120 - this.oy) / this.k - pl.y) * u * u };
        q.item = { ...pl.item, s: pl.item.s * (1 - 0.85 * u) };
        this.drawItem(c, q, 1 - u * 0.6);
      }
      const b = this.celebrate.bag, msg = b.reward === 'trophy' ? '谢谢！这是你的奖杯！' : `谢谢！给你 ${b.reward} 把钥匙！`;
      c.font = '700 40px "KaiTi","STKaiti","Kaiti SC","Microsoft YaHei",sans-serif'; c.textAlign = 'center';
      c.fillStyle = '#b8860b'; c.fillText(msg, W / 2 + 80, 70);
      c.font = '18px "Segoe UI",sans-serif'; c.fillStyle = '#7a7468';
      c.fillText(b.reward === 'trophy' ? 'Thank you! The trophy is yours!' : `Thank you! Here ${b.reward > 1 ? 'are' : 'is'} ${b.reward} key${b.reward > 1 ? 's' : ''}!`, W / 2 + 80, 100);
      c.textAlign = 'left';
    } else if (bag) {
      const k = this.k;
      c.save(); c.translate(this.ox, this.oy); c.scale(k, k);
      c.fillStyle = 'rgba(160,120,70,0.12)'; c.fill(bag.path);
      c.setLineDash([10 / k, 7 / k]); c.strokeStyle = '#7a5a3a'; c.lineWidth = 3 / k; c.stroke(bag.path);
      c.restore();
      for (const pl of this.placed) this.drawItem(c, pl);
      if (this.placed.length || this.drag) {
        const bb = bag.bb, res = this.res;
        c.save(); c.globalAlpha = 0.3 + 0.15 * Math.sin(S.time * 5);
        c.drawImage(this.cov, this.ox + (bb.x - 1 / res) * k, this.oy + (bb.y - 1 / res) * k, this.cov.width * k / res, this.cov.height * k / res);
        c.restore();
      }
      c.save(); c.translate(this.ox, this.oy); c.scale(k, k);
      c.globalAlpha = 0.6; c.setLineDash([10 / k, 7 / k]); c.strokeStyle = '#7a5a3a'; c.lineWidth = 2 / k; c.stroke(bag.path);
      c.restore();
    }

    // tray
    c.fillStyle = 'rgba(250,246,236,0.96)'; c.strokeStyle = '#cbbfa8'; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(8, this.trayTop, W - 16, this.trayH - 8, 14); c.fill(); c.stroke();
    const items = this.trayItems();
    c.font = '600 15px "Segoe UI","Helvetica Neue","KaiTi","STKaiti","Kaiti SC","Microsoft YaHei",sans-serif'; c.fillStyle = '#6b6459';
    c.fillText(`我的背包 My backpack（${items.length}）· 滚轮翻页 Scroll with the wheel`, 22, this.trayTop + 22);
    c.save(); c.beginPath(); c.rect(8, this.trayTop + 30, W - 16, this.trayH - 40); c.clip();
    if (!items.length) {
      c.fillStyle = '#9a917f';
      c.fillText('背包是空的：去地图上收集发光的物品吧 · Empty: collect glowing things on the map first.', 22, this.trayTop + 70);
    }
    items.forEach((it, i) => {
      const cell = this.trayCell(i), t = TYPES[it.type];
      if (cell.y > this.H || cell.y + CELL_PX < this.trayTop) return;
      c.fillStyle = '#fffdf8'; c.strokeStyle = '#e0d6c3'; c.lineWidth = 1;
      c.beginPath(); c.roundRect(cell.x, cell.y, CELL_PX - 8, CELL_PX - 8, 10); c.fill(); c.stroke();
      const L = Math.min(62 / t.bb.w, 62 / t.bb.h) * (0.62 + 0.38 * Math.min(1, (it.s - 0.8) / 1.6));
      c.save(); c.translate(cell.x + 40 - (t.bb.x + t.bb.w / 2) * L, cell.y + 38 - (t.bb.y + t.bb.h / 2) * L); c.scale(L, L);
      drawRefined(c, t, it.color, L); c.restore();
      c.font = '12px "Segoe UI",sans-serif'; c.fillStyle = '#8a8170'; c.textAlign = 'right';
      c.fillText(`×${it.s.toFixed(1)}`, cell.x + CELL_PX - 13, cell.y + CELL_PX - 13); c.textAlign = 'left';
    });
    c.restore();
    if (this.drag) this.drawItem(c, this.drag.pl, this.overTray ? 0.5 : 0.92);
  },
};
