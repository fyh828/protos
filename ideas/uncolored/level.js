// level.js: map layout for Uncolored. Positions are region-local
// (0..2400 x 0..1600, y down); row 0 is the bottom row of the map.
'use strict';

const RW = 2400, RH = 1600, MAP_W = RW * 3, MAP_H = RH * 3;

const LEVEL = [
  { col: 0, row: 0, theme: 'meadow', zh: '草地', en: 'Meadow', label: [1250, 900],
    npc: [330, 1380], pot: ['red', 1950, 1180],
    items: [['snowman', 820, 1260], ['snowman', 1050, 1470], ['snowman', 1250, 250],
      ['strawberry', 2150, 1450], ['strawberry', 1680, 520], ['strawberry', 560, 420], ['strawberry', 2080, 300],
      ['cactus', 420, 600]] },
  { col: 1, row: 0, theme: 'beach', zh: '海滩', en: 'Beach', label: [1250, 150],
    pot: ['yellow', 1300, 700],
    items: [['banana', 500, 1200], ['banana', 1900, 400], ['basketball', 900, 350], ['basketball', 2000, 1300],
      ['strawberry', 1500, 1350], ['snowman', 350, 500], ['drop', 2100, 800], ['cactus', 950, 1000]] },
  { col: 2, row: 0, theme: 'desert', zh: '沙漠', en: 'Desert', label: [1300, 150],
    items: [['cactus', 400, 1100], ['cactus', 1700, 450], ['basketball', 900, 400], ['basketball', 2000, 1250],
      ['banana', 1300, 1000], ['tophat', 400, 450], ['strawberry', 1500, 1430]] },
  { col: 0, row: 1, theme: 'pond', zh: '池塘', en: 'Pond', label: [1250, 200],
    pot: ['blue', 1250, 800],
    items: [['drop', 400, 1150], ['drop', 1900, 450], ['grapes', 800, 300], ['grapes', 2000, 1250],
      ['strawberry', 1500, 1350], ['snowman', 300, 550], ['banana', 900, 1300], ['tophat', 2050, 800]] },
  { col: 1, row: 1, theme: 'town', zh: '小镇', en: 'Town', label: [1200, 150],
    items: [['cactus', 500, 400], ['cactus', 1800, 1200], ['tophat', 1200, 700], ['grapes', 2000, 350],
      ['basketball', 500, 1200], ['banana', 1150, 1350], ['drop', 1700, 600]] },
  { col: 2, row: 1, theme: 'hills', zh: '山丘', en: 'Hills', label: [1200, 150],
    items: [['tophat', 500, 400], ['tophat', 1700, 1150], ['cactus', 1900, 350], ['basketball', 600, 1200],
      ['banana', 1200, 750], ['grapes', 1150, 1350]] },
  { col: 0, row: 2, theme: 'vineyard', zh: '葡萄园', en: 'Vineyard', label: [850, 650],
    items: [['grapes', 500, 1150], ['grapes', 1700, 400], ['drop', 1200, 900], ['drop', 2000, 1250],
      ['tophat', 500, 450], ['cactus', 1150, 300], ['snowman', 1550, 1350]] },
  { col: 1, row: 2, theme: 'clouds', zh: '云端', en: 'Clouds', label: [1200, 140],
    items: [['tophat', 1200, 650], ['drop', 400, 400], ['grapes', 1950, 400], ['cactus', 500, 1200],
      ['strawberry', 1900, 1200], ['snowman', 1200, 1350]] },
  { col: 2, row: 2, theme: 'summit', zh: '山顶', en: 'Summit', label: [900, 820],
    items: [['tophat', 500, 500], ['cactus', 1800, 1150], ['basketball', 1250, 450], ['grapes', 550, 1150],
      ['banana', 1200, 1200], ['drop', 1950, 450]] },
];

// Region-local point to world coordinates.
function regionToWorld(col, row, x, y) { return [col * RW + x, (2 - row) * RH + y]; }

// Size grows with distance from the start corner, measured in region units.
function sizeAt(wx, wy) { return 0.8 + 0.4 * Math.hypot(wx / RW, (MAP_H - wy) / RH); }
