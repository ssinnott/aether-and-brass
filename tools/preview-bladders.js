// The Gleaning's bladder, every bag shape in one view — the review page for the one mark this faction is built on.
// Open tools/preview-bladders.html (served by tools/server.js):
//   &rows=chaff,winnow,thresher,sickle,harvestman,riggerman   which rigs, in order (default: all six bagged variants)
//   &zoom=4 &cw=90 &ch=150
// Three columns per rig, because the bag has three states the player ever sees and the contact sheets show only one:
//   idle    rig.gas 0.25 — the bag at rest
//   tell    rig.gas 1, rig.swell 1.12 — the faction's two-channel tell (gleaningRig.js BASE_HOOKS)
//   squint  the flash silhouette, which is the §0.8 black-fill read
// The hooks that drive rig.gas / rig.swell live on the fighter, so nothing in a sheet or a menu ever lights a bag:
// this page sets those two fields by hand, which is the only way to look at the tell without running a fight.
import { getEnemyDef } from '../src/content/enemies/index.ts';
import { buildRig, drawRig } from '../src/lib/art/rig.ts';
import { AnimPlayer } from '../src/lib/art/animation.ts';

const q = new URLSearchParams(location.search);
const ZOOM = Number(q.get('zoom') || 4);
const CW = Number(q.get('cw') || 90), CH = Number(q.get('ch') || 150), FEET = CH - 12;
const ROWS = (q.get('rows') || 'chaff,winnow,thresher,sickle,harvestman,riggerman').split(',');
/** [label, rig.gas, rig.swell, flash] */
const COLS = [['idle', 0.25, 1, false], ['tell', 1, 1.12, false], ['squint', 0.25, 1, true]];

const scratch = document.createElement('canvas'); scratch.width = CW; scratch.height = CH;
const s = scratch.getContext('2d');
const sheet = document.getElementById('sheet'), out = sheet.getContext('2d');
sheet.width = 70 + COLS.length * CW * ZOOM; sheet.height = 24 + ROWS.length * (CH * ZOOM + 4);
out.fillStyle = '#15121c'; out.fillRect(0, 0, sheet.width, sheet.height);
out.imageSmoothingEnabled = false;

function lbl(t, x, y, c = '#e2b34a', px = 13) { out.fillStyle = c; out.font = `bold ${px}px monospace`; out.textBaseline = 'top'; out.fillText(t, x, y); }
function floor(c) {
  s.fillStyle = c % 2 ? '#332e3e' : '#3a3446'; s.fillRect(0, 0, CW, CH);
  s.fillStyle = 'rgba(0,0,0,0.25)'; s.fillRect(0, FEET, CW, CH - FEET);
}
COLS.forEach((c, i) => lbl(c[0], 70 + i * CW * ZOOM + 4, 4));

for (let r = 0; r < ROWS.length; r++) {
  const def = getEnemyDef('gleaning', ROWS[r]);
  const rig = buildRig(def.build || {}), anim = new AnimPlayer(def.anims || {});
  anim.play('idle', { restart: true, fallback: 'idle' });
  const y = 24 + r * (CH * ZOOM + 4);
  lbl(ROWS[r].slice(0, 8), 2, y + 6, '#9CC4D6', 12);
  lbl(def.build.bagShape, 2, y + 22, '#FF57B0', 11);
  for (let c = 0; c < COLS.length; c++) {
    const [, gas, swell, flash] = COLS[c];
    rig.gas = gas; rig.swell = swell; rig.strobe = false; rig.gasDead = false; rig.gasDeadAt = null;
    // warm the bag chain the way the contact sheets do (it hangs UPWARD and takes a few draws to settle), then
    // clear the cell and draw the frame that is actually shown
    floor(c);
    for (let i = 0; i < 10; i++) { anim.tick(); drawRig(s, rig, anim.pose, { x: CW / 2, y: FEET, facing: 1 }); }
    floor(c);
    drawRig(s, rig, anim.pose, { x: CW / 2, y: FEET, facing: 1, flash });
    out.drawImage(scratch, 0, 0, CW, CH, 70 + c * CW * ZOOM, y, CW * ZOOM, CH * ZOOM);
  }
}
window.__sheet = { ready: true, error: null, width: sheet.width, height: sheet.height };
