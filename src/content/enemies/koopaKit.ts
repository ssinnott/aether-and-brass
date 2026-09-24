// THE KOOPA TRIO's kit: the three kings' colours, the Tin Man's two weapons (drawn in hand space, and also carried by
// game/weapons.ts as the TIN AXE and CLAW SHOVEL pickups he drops), and the things the kings throw — the Volcano
// King's fire bombs and underground lava wave, and the dirt the Tin Man's shovel flings.
// Draw-only: no sim state, and nothing here imports a game/ module, so game/weapons.ts can import it without a cycle.
import { celRect, celPoly, tones, band } from '../../lib/art/shading.ts';
import { circle } from '../../lib/art/shapes.ts';

const R = Math.round;

// ---------------------------------------------------------------- colours
/** The Volcano King: basalt-red scales, an obsidian shell, a mane of flame, lava in every seam. */
export const VOLC = {
  scale: '#B4462C', scaleDk: '#7A2C22', upper: '#842E20', belly: '#E4B26A', jaw: '#E8BE7A', mane: '#FF7A22', lava: '#FF8A2A', hot: '#FFE070',
  glow: '#FFB43A', obsidian: '#33262E', rim: '#EADCC0', cone: '#4A3A40', bone: '#F2E4C4', claw: '#F4EAD2', cuff: '#231A20',
  eye: '#FFD24A', maw: '#5A1A14', ash: '#2A1E22',
};
/** The Tin Man: tin plate, rivets, a funnel for a crown, and a red heart behind the belly plate. */
export const TIN = {
  tin: '#A7B2BC', tinDk: '#7A8692', sleeve: '#8C98A4', plate: '#D2D9DE', shell: '#95A1AC', rim: '#D8DFE4', cone: '#B8C2CA',
  rivet: '#EEF2F4', bright: '#DDE4E9', horn: '#C6CFD6', claw: '#E2E8EC', cuff: '#4A525C', eye: '#F2D060', maw: '#2A2E36',
  jaw: '#BCC6CE', heart: '#D8323C', oil: '#3A2E22', wood: '#7A5230', steel: '#C9D3DA', edge: '#EEF3F6', dark: '#343A42',
};
/** Earth's Away: a body of vines, a head of dirt, a shell of stone, and every spike and claw a thorn. */
export const EARTH = {
  vine: '#4E7A32', vineDk: '#365626', sleeve: '#40662A', leaf: '#86B04A', bark: '#8C6A44', dirt: '#6A4A2C', dirtDk: '#5A3E24',
  stone: '#86867E', stoneDk: '#5E5E58', pebble: '#9A9A90', thorn: '#5E8A38', point: '#D8CC84', horn: '#6A9A40', claw: '#C8BE78',
  coil: '#2E4A20', eye: '#E8F070', maw: '#2A1C12', spore: '#D8F070', bloom: '#E85A8A',
};

// ---------------------------------------------------------------- the Tin Man's weapons (hand space, +x along the haft)
/**
 * The axe: a long hickory haft and a broad tin-smith's blade, the edge side up (-y) the way the Halberd's is, so a
 * raised carry shows the blade and an overhead chop leads with it. 46 px, head at 40.
 */
export function drawTinAxe(ctx, rig) {
  celRect(ctx, rig, -10, -2, 56, 4, 1, TIN.wood, 0.4, 0.2);
  celPoly(ctx, rig, [34, -2, 38, -14, 46, -20, 54, -16, 54, -4, 48, 3, 36, 3], TIN.steel, 0.36, 0.3);
  celPoly(ctx, rig, [33, 2, 30, 7, 37, 6], TIN.steel, 0.4, 0);
  if (rig.override) return;
  ctx.fillStyle = rig.col(TIN.edge); ctx.fillRect(52, -15, 2, 10);   // the honed edge
  band(ctx, rig, 30, -3, 5, 6, TIN.cuff, 1);                          // the collar that holds the head on
}
/**
 * The clawed shovel: a short haft and a scoop with three iron claws on the lip — a shovel that digs AND rakes.
 * 44 px, head at 38. The claws are the part that matters, so they are the brightest thing on it.
 */
export function drawClawShovel(ctx, rig) {
  celRect(ctx, rig, -10, -2, 40, 4, 1, TIN.wood, 0.4, 0.2);
  celPoly(ctx, rig, [26, -10, 40, -12, 46, 0, 40, 12, 26, 10], TIN.steel, 0.36, 0.3);
  for (const dy of [-8, 0, 8]) celPoly(ctx, rig, [44, dy - 3, 54, dy, 44, dy + 3], TIN.claw, 0.3, 0);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, TIN.steel).deep; ctx.fillRect(28, -1, 14, 2);
  band(ctx, rig, 22, -3, 5, 6, TIN.cuff, 1);
}

// ---------------------------------------------------------------- projectiles (ctx, projectile, sx, sy at the floor)
/** The Volcano King's fire bomb: a ball of cooled crust with the fire showing through, and a flame licking off the top. */
export function drawFireBomb(ctx, p, sx, sy) {
  const r = p.r, cy = sy - r - 1, flick = (p.life >> 2) & 1;
  circle(ctx, sx, cy, r + 1, VOLC.lava, VOLC.ash, 1);
  circle(ctx, sx, cy, r - 2, VOLC.obsidian, null, 0);
  ctx.fillStyle = VOLC.hot; ctx.fillRect(sx - 2, cy - 1, 4, 2); ctx.fillRect(sx - 1, cy - 3, 2, 6);
  ctx.fillStyle = VOLC.lava;
  ctx.beginPath(); ctx.moveTo(sx - 4, cy - r + 1); ctx.lineTo(sx + (flick ? 2 : -2), cy - r - 7); ctx.lineTo(sx + 4, cy - r + 1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = VOLC.hot; ctx.fillRect(sx - 1, cy - r - 3, 2, 3);
}
/**
 * The lava wave: it runs UNDER the floor. What you see is the crack it opens behind it (a glowing seam that cools as
 * it closes) and the hump of magma bulging up through the boards where it is now — jump it, or be under it when it
 * breaks the surface. Drawn at the floor line; the sim body is the hump.
 */
export function drawLavaWave(ctx, p, sx, sy) {
  const dir = p.vx >= 0 ? 1 : -1, t = p.life, tall = 10 + ((t >> 1) % 3);
  // the seam it leaves: dark crack, lava inside, cooling back to black over 40 px
  const behind = (len: number) => R(dir > 0 ? sx - len : sx);
  ctx.fillStyle = VOLC.ash; ctx.fillRect(behind(42), sy - 1, 42, 3);
  ctx.fillStyle = VOLC.lava; ctx.fillRect(behind(30), sy, 30, 1);
  ctx.fillStyle = VOLC.hot; ctx.fillRect(behind(12), sy, 12, 1);
  // the hump: magma pushing up through the floor
  ctx.fillStyle = VOLC.ash;
  ctx.beginPath(); ctx.ellipse(sx, sy, 11, tall + 1, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = VOLC.lava;
  ctx.beginPath(); ctx.ellipse(sx, sy, 9, tall, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = VOLC.hot;
  ctx.beginPath(); ctx.ellipse(sx + dir, sy, 4, tall - 4, 0, Math.PI, 0); ctx.fill();
  // spatter off the crest
  ctx.fillStyle = VOLC.glow;
  const k = t % 6;
  ctx.fillRect(sx - 6 + k, sy - tall - 3 - (k & 1) * 2, 2, 2); ctx.fillRect(sx + 4 - k, sy - tall - 5 + (k & 1), 2, 2);
}
/** A clod of dirt off the Tin Man's shovel. */
export function drawClod(ctx, p, sx, sy) {
  const cy = sy - p.r;
  circle(ctx, sx, cy, p.r, EARTH.dirt, '#1A1210', 1);
  ctx.fillStyle = EARTH.dirtDk; ctx.fillRect(sx - 1, cy, 3, 2);
  ctx.fillStyle = EARTH.pebble; ctx.fillRect(sx - 2, cy - 2, 2, 2);
}
/** A pool of lava left where a fire bomb burst: a flat, bubbling puddle that burns whoever stands in it. */
export function drawLavaPool(ctx, p, sx, sy) {
  const r = p.r, bub = (p.life >> 3) & 3;
  ctx.fillStyle = VOLC.ash; ctx.beginPath(); ctx.ellipse(sx, sy, r + 2, R((r + 2) * 0.4), 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = VOLC.lava; ctx.beginPath(); ctx.ellipse(sx, sy, r, R(r * 0.36), 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = VOLC.hot; ctx.beginPath(); ctx.ellipse(sx - 3, sy - 1, R(r * 0.45), R(r * 0.14), 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = VOLC.glow; ctx.fillRect(sx - 8 + bub * 4, sy - 2 - (bub & 1), 2, 2);
}
/**
 * Earth's Away's bramble: a row of thorned vines tearing up out of the floor as it travels, the newest one tallest.
 * Like the lava wave it runs under the boards, so a hero in the air clears it.
 */
export function drawBramble(ctx, p, sx, sy) {
  const dir = p.vx >= 0 ? 1 : -1, grow = (p.life >> 1) & 1;
  ctx.fillStyle = EARTH.dirtDk; ctx.fillRect(R(dir > 0 ? sx - 34 : sx), sy - 1, 34, 3);
  for (let i = 0; i < 3; i++) {
    const x = sx - dir * i * 11, h = 16 - i * 4 + (i === 0 ? grow * 2 : 0);
    ctx.fillStyle = '#1A1210';
    ctx.beginPath(); ctx.moveTo(x - 4, sy + 1); ctx.lineTo(x + dir * 2, sy - h - 1); ctx.lineTo(x + 4, sy + 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = EARTH.thorn;
    ctx.beginPath(); ctx.moveTo(x - 3, sy); ctx.lineTo(x + dir * 2, sy - h); ctx.lineTo(x + 3, sy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = EARTH.point; ctx.fillRect(x + dir * 2 - 1, sy - h, 2, 2);
    ctx.fillStyle = EARTH.leaf; ctx.fillRect(x - dir * 3, sy - R(h * 0.5), 3, 2);
  }
}
/** The mound over Earth's Away while he is under the floor: heaped dirt, cracking, with a thorn showing through. */
export function drawMound(ctx, sx, sy, t) {
  const w = 20 + (t & 3);
  ctx.fillStyle = '#1A1210'; ctx.beginPath(); ctx.ellipse(sx, sy, w + 1, 9, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = EARTH.dirt; ctx.beginPath(); ctx.ellipse(sx, sy, w, 8, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = EARTH.dirtDk; ctx.fillRect(sx - 8, sy - 5, 6, 1); ctx.fillRect(sx + 3, sy - 3, 5, 1);
  ctx.fillStyle = EARTH.pebble; ctx.fillRect(sx - 12, sy - 3, 2, 2); ctx.fillRect(sx + 9, sy - 5, 2, 2);
  ctx.fillStyle = EARTH.thorn; ctx.fillRect(sx - 1, sy - 9 - (t & 1), 2, 4);
}
