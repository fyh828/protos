// levels.js: cast, tuning numbers and the five levels for Color Chorus.
// World units are pixels of a 1280 x 720 stage, y down. GROUND_Y is the top
// of the stage floor. Ledges are one-way: [x0, x1, y].
'use strict';

const W = 1280, H = 720, GROUND_Y = 620;

const TUNE = {
  songTime: 5,         // a song lasts this long while the singer stays put
  ringEvery: 0.5,      // a new ring leaves the singer this often
  ringGrow: 1.1,       // seconds for a ring to grow to full range
  dyeTime: 10,         // a color stays this long after the last ring that touched the prop
  rangePerSize: 140,   // song range for size 1; range is proportional to body size
  itemRadius: 26,      // a ring touches a prop when it comes this close to the prop's centre
  footSlack: 0.25,     // a singer still stands on a ledge with its centre this far (x width) past the end
  walk: 250, jumpV: 900, gravity: 2400,
};

// Body size: k scales the song range; h and w are the body in pixels.
const SIZES = {
  S: { k: 1.0, h: 42, w: 40, zh: '小', en: 'S' },
  M: { k: 1.35, h: 57, w: 54, zh: '中', en: 'M' },
  L: { k: 1.8, h: 76, w: 80, zh: '大', en: 'L' },
};

// The choir. Each singer is named after a note and sings it; bigger means lower.
const CAST = {
  do:  { zh: '哆', en: 'Do',  color: 'red',    size: 'M', note: 60, look: 'bow' },
  re:  { zh: '来', en: 'Re',  color: 'yellow', size: 'S', note: 74, look: 'tuft' },
  mi:  { zh: '咪', en: 'Mi',  color: 'blue',   size: 'M', note: 64, look: 'phones' },
  fa:  { zh: '发', en: 'Fa',  color: 'red',    size: 'L', note: 53, look: 'tash' },
  sol: { zh: '嗦', en: 'Sol', color: 'blue',   size: 'S', note: 79, look: 'beanie' },
  la:  { zh: '拉', en: 'La',  color: 'yellow', size: 'L', note: 57, look: 'scarf' },
};

const ITEM_COLOR = { strawberry: 'red', banana: 'yellow', drop: 'blue', basketball: 'orange', cactus: 'green', grapes: 'purple', tophat: 'black' };

// Line-up on the stage floor in cast order (key 1 first), as body centres.
const LINE_GAP = 26;
function lineWidth(cast) { return cast.reduce((a, k) => a + SIZES[CAST[k].size].w, 0) + LINE_GAP * (cast.length - 1); }
function lineUp(cast, fromX = 60) {
  const xs = [];
  let x = fromX;
  for (const k of cast) { const w = SIZES[CAST[k].size].w; xs.push(x + w / 2); x += w + LINE_GAP; }
  return xs;
}

// items: [type, x, y, prop]; prop picks the little stand or string drawn with it.
// hints: shown once each; `later` is [seconds into the level, zh, en].
const LEVELS = [
  {
    zh: '花园', en: 'Garden', theme: 'garden',
    cast: ['do'],
    platforms: [[640, 840, 490], [900, 1120, 360]],
    items: [['strawberry', 520, 586, 'bush'], ['strawberry', 250, 400, 'branch'], ['strawberry', 1040, 326, 'bush']],
    hints: {
      start: ['← → 走动，空格 跳。落地时，或按 1 时，哆会唱歌', 'Walk with ← →, jump with Space. Do sings on landing, or when you press 1.'],
      firstDye: ['歌声碰到的东西会染上哆的颜色', 'Whatever the song touches takes on Do\'s color.'],
      firstFade: ['颜色 10 秒后会褪去：三颗草莓要同时是红色', 'Colors fade after 10 s: all three strawberries must be red at the same time.'],
    },
  },
  {
    zh: '野餐', en: 'Picnic', theme: 'picnic',
    cast: ['do', 're'],
    platforms: [[150, 330, 480], [820, 1020, 490]],
    items: [['strawberry', 560, 586, 'blanket'], ['basketball', 760, 400, 'hoop'], ['banana', 900, 456, 'basket']],
    hints: {
      start: ['按 1 / 2 切换角色，切换过去的角色会马上唱歌', 'Press 1 / 2 to switch. The singer you switch to sings at once.'],
      later: [7, '红 + 黄 = 橙。别让颜色沾到不需要它的东西上', 'Red + yellow = orange. Keep each color off the props that do not need it.'],
    },
  },
  {
    zh: '温室', en: 'Greenhouse', theme: 'greenhouse',
    cast: ['do', 're', 'mi'],
    platforms: [[200, 360, 490], [250, 430, 360], [560, 720, 360], [760, 920, 490]],
    items: [['grapes', 460, 280, 'vine'], ['drop', 820, 280, 'pipe'], ['cactus', 780, 456, 'pot'], ['banana', 600, 586, 'crate']],
    hints: {
      start: ['黄 + 蓝 = 绿，红 + 蓝 = 紫', 'Yellow + blue = green, red + blue = purple.'],
      later: [7, '虚线圈是歌声能到的范围，圈里的东西上方会出现小三角', 'The dashed circle is how far the song reaches; props inside it get a small marker.'],
    },
  },
  {
    zh: '魔术舞台', en: 'Magic Stage', theme: 'stage',
    cast: ['re', 'mi', 'fa', 'sol'],
    platforms: [[220, 380, 490], [400, 560, 360], [580, 700, 230], [740, 880, 360], [920, 1080, 490]],
    items: [['tophat', 640, 196, 'stand'], ['basketball', 500, 326, 'stand'], ['strawberry', 300, 330, 'wire'], ['grapes', 800, 326, 'stand'], ['drop', 1000, 456, 'stand']],
    hints: {
      start: ['三种颜色都有 = 黑。体型越大，歌声越远', 'All three colors make black. Bigger singers reach further.'],
      later: [8, '先把大家摆好位置，再快速按 1 2 3 4，让大家一起唱', 'Put everyone in place first, then press 1 2 3 4 quickly so they all sing together.'],
    },
  },
  {
    zh: '夜市', en: 'Night Market', theme: 'night',
    cast: ['la', 'do', 'mi', 'sol'],
    platforms: [[240, 380, 490], [420, 580, 360], [720, 900, 360], [940, 1080, 490]],
    items: [['tophat', 640, 330, 'lantern'], ['basketball', 640, 200, 'lantern'], ['grapes', 420, 450, 'lantern'], ['cactus', 860, 450, 'lantern'],
      ['strawberry', 330, 260, 'lantern'], ['banana', 950, 260, 'lantern'], ['drop', 560, 586, 'crate']],
    hints: {
      start: ['最后一幕：七种颜色，一次唱齐', 'Final act: all seven colors in one chord.'],
      later: [50, '两个蓝色角色可以分工合作', 'The two blue singers can split the work.'],
    },
  },
];
