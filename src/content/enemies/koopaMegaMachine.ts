// THE MEGA DESTROYER: the Mega King's machine (koopaMega.ts, phase 1). It is drawn around him rather than as part of
// his rig: the hull, treads, drill, cannon, smokestack and tree nursery go down in `drawBefore` UNDER the rig, the rig
// is then drawn LIFTED into the cockpit (a canvas translate, so none of his poses change), and the cockpit's front
// rim goes over his legs in `drawAfter`. Screen space, feet at (sx, sy), +x toward his facing.
//
// Everything on it is one of the kings' powers made enormous — tin plate from the Tin Man, a volcano for a
// smokestack and a fire cannon from the Volcano King, a drill that digs under the floor and vines up the hull from
// Earth's Away, Earth Stones set in the prow from the Mega King himself — and one thing none of them have: the
// NURSERY on the back, where the living trees grow before he plants them (koopaTree.ts).
import { VOLC, TIN, EARTH } from './koopaKit.ts';
import { EARTH_STONES } from './koopaRig.ts';
import { drawText } from '../../engine/text.ts';

const R = Math.round;
/** Screen px from the floor to the cockpit floor he stands on. */
export const MACHINE_LIFT = 70;
const INK = '#141418';

/** What the machine is doing this frame, read off the Mega King's animation (the draw has no state of its own). */
function machineState(f) {
  const a = f.anim, n = a.name, i = a.frameIndex;
  const moving = n === 'walk' || n === 'run' || n === 'ram';
  return {
    moving,
    drillOut: n === 'drill' ? (i === 2 || i === 3 ? 30 : i === 1 ? 10 : i === 4 ? 16 : 0) : n === 'dig' ? (i >= 2 && i <= 3 ? 14 : 0) : 0,
    drillDown: n === 'dig' && i >= 1 && i <= 4,
    cannonHot: n === 'cannon' && i <= 2,
    growing: n === 'grow' ? Math.min(1, (i + 1) / 3) : 0,
    ramming: n === 'ram' && i >= 2 && i <= 3,
  };
}

function poly(ctx, pts: number[], fill: string, stroke = INK) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
}
function rect(ctx, x: number, y: number, w: number, h: number, fill: string) { ctx.fillStyle = fill; ctx.fillRect(R(x), R(y), R(w), R(h)); }

/** The hull and everything behind the Mega King (drawBefore). `t` is the world frame. */
export function drawMachineBack(ctx, f, sx, sy, t: number) {
  const st = machineState(f), flash = f.flashTimer > 0;
  const ramShake = st.ramming ? ((t >> 1) & 1) : 0;
  ctx.save();
  ctx.translate(sx, sy - ramShake); ctx.scale(f.facing, 1);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 110, 10, 0, 0, Math.PI * 2); ctx.fill();
  // ---- the nursery on the back: a planter of earth with a sapling in it that grows while he calls the trees
  poly(ctx, [-104, -64, -62, -64, -64, -80, -102, -80], EARTH.dirt);
  rect(ctx, -100, -78, 34, 3, EARTH.dirtDk);
  const g = 0.45 + st.growing * 0.55, th = R(34 * g), cr = R(14 * g);
  rect(ctx, -85, -80 - th, 4, th, '#6A4A30');
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-83, -80 - th, cr + 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5E9A3A'; ctx.beginPath(); ctx.arc(-83, -80 - th, cr, 0, Math.PI * 2); ctx.fill();
  rect(ctx, -88, -84 - th, 4, 3, '#86B04A');
  if (st.growing > 0) { ctx.fillStyle = EARTH.spore; rect(ctx, -92 + (t % 16), -90 - th - (t & 7), 2, 2, EARTH.spore); }
  // ---- the smokestack is a little volcano, and it is lit
  poly(ctx, [-58, -70, -34, -70, -40, -118, -52, -118], VOLC.obsidian);
  rect(ctx, -52, -120, 12, 4, VOLC.cone);
  rect(ctx, -50, -124 - ((t >> 2) & 1) * 2, 8, 4, VOLC.lava);
  rect(ctx, -48, -126 - ((t >> 2) & 1) * 2, 4, 2, VOLC.hot);
  rect(ctx, -50, -104, 1, 20, VOLC.lava); rect(ctx, -44, -96, 1, 14, VOLC.lava);
  // ---- the treads
  poly(ctx, [-100, -30, 100, -30, 108, -18, 100, 0, -100, 0, -108, -18], '#2A2A30');
  const off = st.moving ? (t >> 1) % 12 : 0;
  for (let x = -100 + off; x < 100; x += 12) { rect(ctx, x, -30, 5, 3, '#4A4A54'); rect(ctx, x, -3, 5, 3, '#4A4A54'); }
  for (const wx of [-78, -26, 26, 78]) {
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(wx, -15, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = TIN.tinDk; ctx.beginPath(); ctx.arc(wx, -15, 10, 0, Math.PI * 2); ctx.fill();
    rect(ctx, wx - 2, -17, 4, 4, TIN.rivet);
  }
  // ---- the drill, on the prow at tread height: it spins, it lunges, and it goes down into the floor to dig
  const dx = 92 + st.drillOut, dy = st.drillDown ? -6 : -18;
  poly(ctx, [dx, dy - 12, dx + 38, dy + (st.drillDown ? 10 : 0), dx, dy + 12], TIN.steel);
  const spin = (t >> 1) % 8;
  ctx.fillStyle = TIN.tinDk;
  for (let k = 0; k < 4; k++) { const x = dx + 4 + k * 8 + (spin >> 1); ctx.fillRect(R(x), R(dy - 10 + k * 2.5), 2, R(20 - k * 5)); }
  rect(ctx, dx - 8, dy - 8, 10, 16, TIN.cuff);
  // ---- the hull: tin plate, a red volcano stripe, vines creeping up it from the treads, Earth Stones in the prow
  poly(ctx, [-96, -30, 96, -30, 90, -MACHINE_LIFT, 30, -MACHINE_LIFT - 6, -30, -MACHINE_LIFT - 6, -92, -MACHINE_LIFT], flash ? '#FFFFFF' : TIN.shell);
  if (!flash) {
    rect(ctx, -92, -48, 184, 6, VOLC.scale); rect(ctx, -92, -42, 184, 1, VOLC.scaleDk);
    rect(ctx, -90, -68, 178, 1, TIN.rim);
    ctx.fillStyle = TIN.rivet;
    for (let x = -86; x <= 86; x += 14) { ctx.fillRect(x, -36, 2, 2); ctx.fillRect(x, -62, 2, 2); }
    // vines
    ctx.fillStyle = EARTH.vine;
    for (const [x, h] of [[-80, 26], [-20, 18], [40, 30]]) { ctx.fillRect(x, -30 - h, 2, h); ctx.fillRect(x + 2, -30 - h + 6, 4, 2); ctx.fillRect(x - 4, -30 - R(h * 0.4), 4, 2); }
    // earth stones in the prow
    EARTH_STONES.forEach((c, i) => { const gx = 50 + i * 9, gy = -60 + (i & 1) * 3; rect(ctx, gx - 1, gy - 1, 7, 7, '#8A8A82'); rect(ctx, gx, gy, 5, 5, c); rect(ctx, gx, gy, 1, 1, '#FFFFFF'); });
    // damage: past half the machine's bar it smokes and sparks
    if (f.phaseIndex === 0 && f.hp < f.maxHp * 0.5 && (t & 15) < 8) { rect(ctx, -10 + (t & 7), -58, 3, 3, VOLC.hot); rect(ctx, 20, -52 - (t & 3), 2, 2, VOLC.lava); }
  }
  // ---- the fire cannon on the fore-deck, glowing down its bore while it charges
  poly(ctx, [62, -MACHINE_LIFT - 4, 104, -MACHINE_LIFT - 10, 106, -MACHINE_LIFT + 2, 62, -MACHINE_LIFT + 4], VOLC.obsidian);
  rect(ctx, 100, -MACHINE_LIFT - 8, 6, 8, st.cannonHot && ((t >> 2) & 1) ? VOLC.hot : VOLC.lava);
  ctx.restore();
  // the name, painted on the hull (drawn un-mirrored, so it reads whichever way he faces)
  if (!flash) drawText(ctx, 'MEGA DESTROYER', sx - f.facing * 6, sy - 60, { size: 1, color: '#F2E6C8', align: 'center' });
}

/** The cockpit's front rim, over his legs (drawAfter, after the lifted rig has been drawn and the lift undone). */
export function drawMachineFront(ctx, f, sx, sy) {
  const flash = f.flashTimer > 0, y0 = sy - MACHINE_LIFT;
  ctx.save();
  ctx.translate(sx, y0); ctx.scale(f.facing, 1);
  poly(ctx, [-40, 2, 44, 2, 40, -44, -36, -44], flash ? '#FFFFFF' : TIN.tin);
  if (!flash) {
    rect(ctx, -34, -42, 72, 3, TIN.rim);
    rect(ctx, -30, -26, 64, 5, VOLC.scale);
    ctx.fillStyle = TIN.rivet; for (let x = -30; x <= 34; x += 10) ctx.fillRect(x, -36, 2, 2);
    // the controls: two levers he hauls on, and the red button every king knows (tree mode)
    rect(ctx, 30, -54, 2, 12, INK); rect(ctx, 28, -58, 6, 5, VOLC.hot);
    rect(ctx, -26, -54, 2, 12, INK); rect(ctx, -28, -58, 6, 5, EARTH.leaf);
    rect(ctx, 6, -16, 6, 5, '#D8323C'); rect(ctx, 6, -16, 2, 1, '#FFFFFF');
  }
  ctx.restore();
}
