// In-page renderer for tools/compare.js: rows are git refs, columns are subjects, every cell is the same rig in
// the same pose drawn by a DIFFERENT src/ tree. Driven headlessly; tools/compare.js builds the query and screenshots
// #sheet. Publishes window.__cmp = { ready, error, w, h, cells } — `cells` is what the CLI checks for silent rig
// substitution (see the substitution guard there).
//
//   ?refs=<slug>,<slug>[,...]   snapshot directory names under ./.compare/, in row order
//   &titles=<a>|<b>             row labels, '|'-separated (labels contain commas far more often than pipes)
//   &who=char:brunhild,enemy:sootborn:cutthroat,...      columns, in column order
//   &pick=idle:0|walk:6|attack1:hit    animation and frame ('hit' seeks the first hitbox frame)
//   &zoom=6 &cw=84 &ch=104 &feet=12 &bg=%233a3446 &facing=1 &head=1 &view=normal|edges|squint &tick=0 &still=1
//
// NOTE ON DUPLICATION: the ~40 lines of cell code below (fit, warm, pick, floor) are a deliberate second copy of
// tools/sheet.js:69-102,187-192. sheet.js binds its art modules with STATIC imports, so one document can only point
// it at one src/ tree; sharing would mean extracting a module-bag-injected cell renderer out of sheet.js, which is
// the tool the art-invariant render tier and every capture script depend on. That extraction is worth doing, but
// not in the same landing as an art change — a sheet regression and a sprite regression would be indistinguishable.
// The two copies differ on purpose in two places: the body-fit box (82/74 pad 2 here vs 80/72 pad 4 there) and the
// floor line (ch-12 vs ch-16), both inherited from the review sheets this tool has to reproduce.
import { edgeMap, squint } from './views.js';

const q = new URLSearchParams(location.search);
const slugs = (q.get('refs') || '').split(',').filter(Boolean);
const titles = (q.get('titles') || '').split('|');
const who = (q.get('who') || 'char:brunhild').split(',');
const pick = q.get('pick') || 'idle:0';
const zoom = Number(q.get('zoom') || 6);
const CELL_W = Number(q.get('cw') || 84), CELL_H = Number(q.get('ch') || 104);
const FEET = CELL_H - Number(q.get('feet') || 12);
const HEADMODE = q.get('head') === '1';
const STILL = q.get('still') === '1';
const FACING = Number(q.get('facing') || 1) < 0 ? -1 : 1;
const view = q.get('view') || 'normal';
const TICK = Number(q.get('tick') || 0);
const BG = q.get('bg') || '#3a3446';
const HDR = 26, LBL = 150, GAP = 6;

/** One ref's art modules. Dynamic import: a static specifier is fixed at parse time and cannot vary per row. */
async function load(slug) {
  const b = `./.compare/${slug}/src/`;
  const [rig, anim, chars, enemies, fx] = await Promise.all([
    import(b + 'art/rig.js'), import(b + 'game/animation.js'), import(b + 'content/characters/index.js'),
    import(b + 'content/enemies/index.js'), import(b + 'art/fx.js'),
  ]);
  return { rig, anim, chars, enemies, fx };
}

const sheet = document.getElementById('sheet');
const out = sheet.getContext('2d');
const scratch = document.createElement('canvas');
const sctx = scratch.getContext('2d', { willReadFrequently: true });
const vcan = document.createElement('canvas');
scratch.width = CELL_W; scratch.height = CELL_H;

/**
 * Render one cell into `scratch` and return the def it actually resolved to.
 * `plain` drops the floor band and the cast shadow: they are their own colour boundaries and would otherwise
 * dominate an edge map or a squint.
 */
function cell(m, spec, plain) {
  const p = spec.split(':');
  const def = p[0] === 'char' ? m.chars.getCharacter(p[1]) : m.enemies.getEnemyDef(p[1], p[2]);
  const rig = m.rig.buildRig(def.build || {});
  const anim = new m.anim.AnimPlayer(def.anims || {});
  const fit = HEADMODE ? 1 : Math.min(1, (FEET - 2) / (82 * rig.scale), (CELL_W - 2) / (74 * rig.scale));
  // head framing: put the head centre mid-cell whatever the rig's height and scale
  const FY = HEADMODE ? Math.round(CELL_H * 0.52 + (rig.height - rig.p.headR * 0.9) * rig.scale * fit) : FEET;
  const draw = () => m.rig.drawRig(sctx, rig, anim.pose, { x: CELL_W / 2, y: FY, facing: FACING, scale: fit, still: STILL });
  const tickDraw = (n) => { for (let i = 0; i < n; i++) { anim.tick(); draw(); } };
  const [name, sel] = pick.split(':');
  // warm the secondary-motion chains: play through once, then replay
  anim.play(name, { restart: true, fallback: 'idle' }); tickDraw(Math.max(8, anim.length));
  anim.play(name, { restart: true, fallback: 'idle' }); draw();
  if (sel === 'hit') { let g = 0; while (!(anim.frame.hitbox || anim.frame.hitboxes) && g++ < 200 && !anim.done) tickDraw(1); tickDraw(1); }
  else tickDraw(Number(sel || 0));
  sctx.fillStyle = BG; sctx.fillRect(0, 0, CELL_W, CELL_H);
  if (!plain && !HEADMODE) {
    sctx.fillStyle = 'rgba(0,0,0,0.22)'; sctx.fillRect(0, FEET, CELL_W, CELL_H - FEET);
    m.fx.drawShadowScreen(sctx, CELL_W / 2, FY, 30 * rig.scale * fit, 0.45);
  }
  // Pin the blink/strobe phase before the final draw so two rows cannot land on different halves of a
  // (rig.tick & 2) blink and read as a regression. drawRig increments first, so tick=N means writing N-1.
  rig.tick = TICK - 1;
  draw();
  return { def, scale: (def.build && def.build.scale) || 1 };
}

const cw = CELL_W * zoom, ch = CELL_H * zoom;
let err = null;
const cells = [];
try {
  if (slugs.length < 2) throw new Error('compare needs at least two refs');
  const mods = {};
  for (const s of slugs) {
    try { mods[s] = await load(s); } catch (e) { throw new Error(`ref '${s}': ${e && e.message} (does src/ exist in that ref, with every module this page imports?)`); }
  }
  sheet.width = LBL + who.length * cw + GAP;
  sheet.height = HDR + slugs.length * (ch + GAP);
  // setting width/height resets the context, so the smoothing flag has to be set after sizing
  out.fillStyle = '#14111a'; out.fillRect(0, 0, sheet.width, sheet.height);
  out.imageSmoothingEnabled = false;
  const label = (t, x, y, c, s) => { out.fillStyle = c; out.font = `bold ${s}px ui-monospace,monospace`; out.textBaseline = 'top'; out.fillText(t, x, y); };

  slugs.forEach((slug, ri) => {
    const y = HDR + ri * (ch + GAP);
    out.fillStyle = ri === 0 ? '#221d2c' : '#1b1724';
    out.fillRect(0, y, LBL, ch);
    who.forEach((spec, ci) => {
      const { def, scale } = cell(mods[slug], spec, view !== 'normal');
      if (view === 'edges') { vcan.width = CELL_W; vcan.height = CELL_H; edgeMap(scratch, vcan); }
      else if (view === 'squint') { vcan.width = CELL_W; vcan.height = CELL_H; squint(scratch, vcan); }
      out.drawImage(view === 'normal' ? scratch : vcan, 0, 0, CELL_W, CELL_H, LBL + ci * cw, y, cw, ch);
      cells.push({ row: ri, col: ci, spec, id: def.id || '', name: def.name || '', type: def.type || '', variant: def.variant || '', scale });
      if (ri === 0) label(`${def.name || def.id}  x${scale}`, LBL + ci * cw + 8, 6, '#e2b34a', 15);
    });
    // row label, wrapped by character count into the fixed gutter (never from measureText: metrics vary)
    const words = (titles[ri] || slug).split(' ');
    let line = '', ly = y + 12;
    for (const w of words) {
      if ((line + ' ' + w).trim().length > 15) { label(line, 10, ly, ri === 0 ? '#8c8398' : '#f0e4cc', 15); ly += 20; line = w; }
      else line = (line + ' ' + w).trim();
    }
    label(line, 10, ly, ri === 0 ? '#8c8398' : '#f0e4cc', 15);
  });
} catch (e) {
  err = String((e && e.stack) || e);
  console.error(e);
}

/** Stamp a cell the CLI judged substituted, so the PNG carries its own warning after it leaves the terminal. */
window.__cmpMark = (row, col) => {
  const y = HDR + row * (ch + GAP), x = LBL + col * cw;
  out.strokeStyle = '#e03a3a'; out.lineWidth = 3; out.strokeRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
  out.fillStyle = '#e03a3a'; out.font = 'bold 15px ui-monospace,monospace'; out.textBaseline = 'top';
  out.fillText('SUBSTITUTED', x + 6, y + ch - 20);
};
window.__cmp = { ready: true, error: err, w: sheet.width, h: sheet.height, cells };
