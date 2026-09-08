// The Chandlery of Calderwick — shared faction rig (ART_STYLE.md pass). Cel-shaded contractor parts used by
// content/enemies/chandler.js: waxed-canvas coat with a quicklime apron panel, a numbered lead tally-tag with the
// variant's wax seal at the throat, a single dark rubber respirator BAR across the nose (real eyes above it, a bare
// jaw below it — NOT twin bottle-glass discs, which merge into one pale bar on a 18px head), flat-topped canvas caps,
// leather bracers under quicklime sleeve wraps, quicklime gaiters over rubber boots, rubber gauntlets.
//
// THE FACTION TELL lives on the FLOOR, not the face: every Chandler carries one shuttered lamp somewhere different
// on the silhouette (`build.chand.lampJoint` + lampDX/lampDY) with three states driven by `rig.lamp` — 0 DARK (dead
// glass: on cooldown or rite-broken), 1 LIT (choosing a recipient), 2 RITE (flooded, and hooks.drawBefore paints a
// hard-edged limelight cone flat on the floor from the lamp to the recipient, with a 2px outline so it reads on pale
// marble as well as wet planks). hooks.drawAfter snaps a dashed limelight tether to the recipient's chest.
//
// THE FACTION RULE — the rite dies with the ritualist, however it died. Every rite is a custom named status whose
// onTick starts with riteSourceGone(): items.js ringOut() sets `dead = true` WITHOUT calling die(), so onDeath has a
// hole and the clearing cannot live there. tickStatuses runs onTick every frame, so a Chandler thrown off a railing
// pops every crust, dose and mend on the field in the same frame.
//
// Local spaces are the ones rig.js sets up (limbs: origin at the joint, +y along the segment; hand/weapon: +x along
// the forearm; torso: hip centre, y up negative; head: head centre). Far-side parts colour from `inf.pal`.
// SFX: this faction ships no new sounds (see the CANONICAL_SFX list) — the shutter is 'gear_slip', the bellows and
// the slake 'steam' / 'steam_vent', the hand-bell 'chime', the cork 'bomb_bat', the lamp going out 'prop_break'.
import { celRect, celBall, celPoly, celCapsule, tones, rimTop, band } from '../../art/shading.js';
import { drawFist, drawBoot, drawSkull, drawFace } from '../../art/rigParts.js';
import { getChain } from '../../art/secondary.js';
import { jointScreen } from '../../art/rig.js';
import { floatText } from '../../art/fx.js';
import { particles } from '../../engine/particles.js';
import { audio } from '../../engine/audio.js';
import { rad } from '../../engine/math.js';
import { FACE } from '../../art/poses.js';
import { FLOOR_TOP, ST } from '../../constants.js';
import { FK } from './common.js';

const R = Math.round, TAU = Math.PI * 2;

/** Chandlery colour constants (L* in the spec order: the game's first pale-bodied faction; darks at the extremities only). */
export const CH = {
  outline: '#20180F',      // pitch tallow, a warm tar-black (Oklab L* 21.6; every BASE tone below clears it by >= 9)
  // IDENTITY MASS 1 — tallow. Hue and Oklab lightness held from #C2AE84, chroma only (L* 75.8 -> 70.9, s 32 -> 62):
  // tallow is a yellow wax and 62 % is what tallow actually looks like. It sits ABOVE every floor band in the game
  // (max 68) so the coat, the thighs and the caps clear the stage from above.
  limedust: '#C29B4A',     // the long buttoned waxed-canvas coat (palette.primary)
  quicklime: '#E6ECDC',    // apron panel, sleeve wraps, gaiters, the dust on every boot (palette.sleeve)
  // IDENTITY MASS 2 — the same waxed duck at a much darker step, re-read as harness leather. It used to be the
  // faction's BIGGEST mass while being a listed neutral (36 % of the Wickboy's painted area against 18 % of tallow),
  // which is the assignment inversion the readability pass exists to fix, so the CHROMA (s 52 -> 71) stays.
  // The LIGHTNESS does not: #62451C sat at Oklab L* 41.4, which is INSIDE every plank band in the game rather than
  // below it (Sootfoot plank #443629 L* 34.4, dE 8.0; the dark plank row #3A2E24 dE 11.2; Gas-Halls WOOD_D #4C3A28
  // dE 5.9) -- the tool's own LOST threshold is dE 10, so the faction's biggest mass was merged into four floor
  // tones at once and chandler/Sootfoot-Docks became the worst-reading row in the game at 44.7 % lost.
  // #7A561E holds the saturation (s 75, Oklab C 6.90 -> 8.42, i.e. chroma actually up) and gives the lightness back:
  // L* 47.3, dE 14.0 / 17.2 against the two plank rows, both clear of LOST. A lightness sweep over L* 48-56 measured
  // on all seven sections picks 48: faction mean lost% 30.1 / overlap 38.9, against 30.5 / 40.7 at 53 and 30.3 / 41.2
  // at 56 -- above 50 the harness walks into the Mooring Spine's own #8A7A5A band (that row's overlap goes 31 -> 43).
  leather: '#7A561E',      // apron panel, belts, straps, bracers, cart shafts (palette.secondary)
  // #2B2620 was Oklab L* 27.2 against a 21.6 outline — dL 5.6, i.e. the respirator bar, the boots and the gauntlets
  // were drawing an outline their own fill then swallowed. #38312B is dL 10.3 and still a near-neutral (s 23).
  rubber: '#38312B',       // hose, gauntlets, respirator bar, boots, kiln body (palette.dark) — SMALL AREAS ONLY
  // the greened pewter the file always claimed it was: hue and Oklab lightness held exactly (L* 56.6 -> 57.0),
  // chroma 1.9 -> 4.4. It is 15-20 % of the two big rigs and at C 1.9 all of that mass sat in the lattice's
  // achromatic core, which every polychrome backdrop in the game also occupies. s27 keeps it a NEUTRAL.
  pewter: '#5E8072',       // tongs, shovel, cane ferrule, tally-tag, lamp bodies (palette.metal)
  lime: '#D8FF6E',         // the lamp, the floor cone, the tether, the rite rim
  hot: '#FFD27A',          // 1-2px hot core inside every lime glow (ART_STYLE 4)
  dead: '#3A3A34',         // dead lamp glass
  idleGlass: '#8FA34A',    // lamp lit but idle
  skin: '#DFC7A8', hair: '#6B5A44', shade: '#5E8A46',
};
/**
 * Value ladder (Oklab L*): quicklime wraps / gaiters 93.4 > limedust coat and thighs 70.9 > leather apron, belts and
 * bracers 47.3 > rubber boots, gloves, mask 31.9 > pitch-tallow ink 21.6. Four rungs, none closer than 15 L*, and
 * only the rubber rung is inside a stage floor band -- it is the one that is deliberately SMALL AREAS ONLY.
 */
export const CH_PAL = {
  skin: CH.skin, hair: CH.hair, primary: CH.limedust, sleeve: CH.quicklime, secondary: CH.leather,
  accent: CH.pewter, metal: CH.pewter, dark: CH.rubber, glow: CH.lime,
};
/** Long arms for the outstretched carry; height = 14 + 13 + 5 - 2 + 25 - 2 + 3 + 18 = 74 px at scale 1. */
export const CH_PROPS = {
  headR: 9, neck: 3, neckR: 3, torsoW: 22, torsoH: 25, hip: 19, upperArm: 14, lowerArm: 14, armR: 4.5, handR: 5,
  upperLeg: 14, lowerLeg: 13, legR: 5, footL: 12, footH: 5, bulge: 0.35, shoulderX: 3, hipX: 4,
};
/**
 * THE COMPANY LADDER — the variant's wax seal on the tally-tag and on one shape >= 4 px elsewhere on the rig
 * (Wickboy bucket band, Tallyman ledger spine, Limeburner kiln band, Purser cap cockade, Resurrection Man cart
 * lashing). Three of the five used to be ACHROMATIC (#F2F0E4 s6, #5B5F62 s7, #E8D9A8 s28) and the ladder was
 * monotone in nothing, so the rank mark said nothing on three of five men. Re-spaced fodder -> grabber so Oklab
 * CHROMA climbs STRICTLY with the rate — 9.2 / 10.7 / 13.4 / 14.1 / 14.5 — and every rung stays out of the coat's
 * own hue family (okH 84) and >= 12 L* from the GROUND it is painted on: the lead tally-tag is pewter at L* 56.6,
 * and the Purser's cockade rides his dark officer crown, which is why his amber may sit at the coat's own value.
 * The Limeburner's kiln red is held exactly; the Purser's company amber keeps its hue and value and moves only
 * chroma (#D08A2E -> #D68C24) so the top of the ladder stays strict. Re-run tools/chandler-census.mjs after any
 * edit here: the ladder is carried by AREA as well as chroma, and the five variants are five different sizes.
 */
export const CLAN = { wickboy: '#5F7A3E', tallyman: '#316AA2', limeburner: '#A8482A', purser: '#D68C24', resurrectionist: '#622E86' };

const EMPTY = Object.freeze({});
// jaw 0.62 (not 0.44): the respirator bar eats the middle of the head, so the chin polygon has to reach far enough
// down that 4 px of bare skin survives BELOW the bar (§0.5 head rows: cap / brow / eyes / bar / jaw).
const HEAD_MASKED = Object.freeze({ noNose: true, jaw: 0.62 });
const HEAD_BARE = Object.freeze({ jaw: 0.5 });
// BROW is its own value: rigParts.drawFace defaults brows to palette.hair, which is the hex of the cap sitting directly
// above them, so the brow row vanished into the fringe on every variant.
const BROW = '#3A2E20';
const FACE_MASK = Object.freeze({ big: true, noMouth: true, eyeY: -2, brow: BROW });
const FACE_BARE = Object.freeze({ big: true, eyeY: -1, mouthY: 1, brow: BROW });

// ---------------------------------------------------------------- parts
/** Human skull under a canvas cap; the respirator covers the nose on every variant but the Wickboy. */
export function chHead(ctx, rig, pose, inf) {
  const r = inf.r, pal = inf.pal, ch = rig.build.chand || EMPTY;
  if (ch.face === 'none') {
    // Resurrection Man: a flat leather cowl — no skin, no eyes. The one feature is the lamp-glass slit that chFace
    // draws over this, so the cowl itself carries no seam that would compete with it.
    celBall(ctx, rig, 0, 0, r, pal.secondary);
    return;
  }
  drawSkull(ctx, rig, r, pal.skin, null, ch.face === 'bare' ? HEAD_BARE : HEAD_MASKED);
  chHair(ctx, rig, r, pal.hair);
}
const HAIR_PTS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
/**
 * The faction hairline is a NAPE MASS, never a fringe. rigParts.drawHairCap reaches y -5.6 at the near eye and the brow
 * row sits at -7..-6, so every Chandler was drawing its brows on top of its own hair — and drawFace defaults the brow
 * colour to palette.hair, i.e. the exact hex underneath. Ending the hair behind x -0.6r leaves the brow row on skin.
 * (Module-level point list, refilled in place: no per-frame allocation, ARCHITECTURE 11.)
 */
function chHair(ctx, rig, r, hex) {
  HAIR_PTS[0] = R(-r * 0.15); HAIR_PTS[1] = R(-r * 1.0);
  HAIR_PTS[2] = R(-r * 0.75); HAIR_PTS[3] = R(-r * 0.88);
  HAIR_PTS[4] = R(-r * 1.05); HAIR_PTS[5] = R(-r * 0.3);
  HAIR_PTS[6] = R(-r * 0.98); HAIR_PTS[7] = R(r * 0.32);
  HAIR_PTS[8] = R(-r * 0.62); HAIR_PTS[9] = R(r * 0.12);
  HAIR_PTS[10] = R(-r * 0.58); HAIR_PTS[11] = R(-r * 0.72);
  celPoly(ctx, rig, HAIR_PTS, hex, 0.4, 0.3);
}
/** Eyes + brows above the bar, the dark rubber respirator across the nose, a bare jaw below it (ART_STYLE 0.5 rows). */
export function chFace(ctx, rig, pose, inf) {
  const r = inf.r, ch = rig.build.chand || EMPTY;
  if (ch.face === 'none') {
    // The cowl gets a horizontal lamp-glass slit that the POSE drives (the Brassbound lens pattern in common.js): with
    // no drawFace call the ~60 keys that set face: 'shout' / 'grit' / 'hurt' did nothing at all on him, and §11's
    // "face changes across idle -> attack -> hurt" could not hold on a featureless brown dome.
    const f = pose.face | 0, lit = f === FACE.shout || f === FACE.angry || f === FACE.grit;
    const w = R(r * 1.5), x = R(-r * 0.45), y = R(-r * 0.18);
    celRect(ctx, rig, x, y, w, 5, 1, CH.pewter, 0.4, 0.3);
    if (rig.override) return;
    ctx.fillStyle = rig.col(f === FACE.dazed || f === FACE.hurt ? CH.dead : lit ? CH.lime : CH.idleGlass);
    ctx.fillRect(x + 1, y + 1, w - 2, 3);
    if (lit) { ctx.fillStyle = rig.col(CH.hot); ctx.fillRect(x + 2, y + 2, w - 4, 1); }
    return;
  }
  drawFace(ctx, rig, r, pose.face | 0, ch.face === 'bare' ? FACE_BARE : FACE_MASK);
  if (ch.face === 'bare') return;
  // rows on a headR-9 skull: brows -7..-6 | eyes -4..-1 | BAR 0..3 | bare jaw 5..8. The bar used to start at r*0.34
  // and left 0-2 px of chin, so it merged with the hair shadow and read as a pale scratch instead of a dark bar.
  const y = R(r * 0.05), w = R(r * 1.95);
  celRect(ctx, rig, R(-r * 0.95), y, w, 4, 1, CH.rubber, 0.4, 0);
  if (rig.override) return;
  const t = tones(rig, CH.rubber);
  ctx.fillStyle = t.hi; ctx.fillRect(R(-r * 0.9), y, w - 2, 1);                          // the bar stays DARK: its own rim, not lime
  ctx.fillStyle = rig.col(CH.pewter); ctx.fillRect(R(r * 0.4), y + 1, 3, 2);            // filter stud
}
/** Flat-topped waxed-canvas cap with a short brim, above the hairline; 'peaked' for the Purser's officer cap. */
export function chHat(ctx, rig, pose, inf) {
  const r = inf.r, ch = rig.build.chand || EMPTY;
  if (ch.cap === 'none') return;
  const peaked = ch.cap === 'peaked', col = ch.capCol || CH.limedust, y = R(-r);
  const crown = peaked ? 9 : 6;
  // ONE mass, not two boards: the crown runs all the way down to the brim line (crown + 3) so the two shapes share a
  // bottom edge and sit ON the skull, and the 2 px t.deep band that used to split them horizontally is gone (§0.5).
  celRect(ctx, rig, R(-r * 0.95), y - crown, R(r * 1.9), crown + 3, 1, col, 0.36, 0.3);
  // brim trimmed from r*1.5 (13.5 px, a shelf) to r*1.25
  celPoly(ctx, rig, [R(-r * 1.1), y - 1, R(r * 1.2), y - 2, R(r * 1.25), y + 2, R(-r * 1.1), y + 2], col, 0.4, 0.2);
  if (rig.override) return;
  // THE OFFICER CAP IS THE PURSER'S RUNG of the company ladder — a hat band across the base of the crown plus the
  // wax cockade above it, both in the variant's own colour and both inked. It used to be one pewter stud, which is
  // why the elite carried less rank area than the fodder's bucket band (tools/chandler-census.mjs).
  if (peaked) {
    band(ctx, rig, R(-r * 0.95), y - 4, R(r * 1.9), 4, rig.build.clan || CH.pewter, 1);
    band(ctx, rig, R(-r * 0.2), y - crown + 3, 4, 4, rig.build.clan || CH.pewter, 1);
  }
  // Tallyman: the green celluloid eyeshade is the UNDERSIDE of the brim, not a second dark band across the eyes
  if (ch.shade) { ctx.fillStyle = rig.col(CH.shade); ctx.fillRect(R(-r * 0.6), y, R(r * 1.7), 2); }
}
/** The numbered lead tally-tag on a wire with the variant's wax seal (>= 3x3, ART_STYLE 0.7). */
function chTallyTag(ctx, rig, x, y) {
  celBall(ctx, rig, x, y + 4, 3, CH.pewter, false);
  if (rig.override) return;
  // a 2-step stair of whole pixels, not a lineWidth-1 diagonal: the only anti-aliased hairline in the rig read as a
  // grey smudge of dirt at the collar (§3 'joints snapped to whole pixels', §5 'integer coordinates for every detail')
  ctx.fillStyle = rig.col(CH.pewter);
  ctx.fillRect(x - 4, y - 2, 2, 1); ctx.fillRect(x - 2, y - 1, 2, 2);
  // the wax seal is a MATERIAL on the lead tag, so it takes the line (0.2) and goes to 4x4: at 3x3 unoutlined it
  // was the rank read of three variants and read as one stray warm pixel at 1x
  band(ctx, rig, x - 1, y + 2, 4, 4, rig.build.clan || CLAN.wickboy, 1);
}
/** Long buttoned waxed-canvas coat with a flaring skirt, a quicklime apron panel and the tally-tag at the throat. */
export function chTorso(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2), pal = inf.pal;
  celPoly(ctx, rig, [-hw - 1, -H + 5, -hw + 4, -H, hw - 4, -H, hw + 2, -H + 5, hw + 3, R(-H * 0.45), hw + 5, 6, hw - 4, 8, -hw + 3, 8, -hw - 4, 6, -hw - 2, R(-H * 0.45)], pal.primary, 0.38, 0.28);
  // THE APRON IS HARNESS LEATHER, NOT QUICKLIME. It used to take pal.sleeve, the same hex rig.js paints the upper-arm
  // capsule with, and the two touch on every carry pose — the near arm dissolved into the chest on all five variants.
  // Leaving palette.sleeve quicklime keeps the arm the LIGHT element against a mid torso, which is what §0.1 asks for.
  celPoly(ctx, rig, [2, -H + 5, hw - 2, -H + 3, hw + 2, R(-H * 0.45), hw + 4, 5, 1, 7], pal.secondary, 0.4, 0.25);
  if (rig.override) return;
  const t = tones(rig, pal.primary);
  ctx.fillStyle = t.deep; ctx.fillRect(-2, -H + 3, 3, H + 4);
  ctx.fillStyle = rig.col(pal.metal); ctx.fillRect(-2, R(-H * 0.5), 3, 3); ctx.fillRect(-2, R(-H * 0.24), 3, 3);
  ctx.fillStyle = rig.col(pal.sleeve); ctx.fillRect(R(hw * 0.3), R(-H * 0.18), R(hw * 0.7), 2);   // the apron hem
  // the tag moves off the placket column so it has clear ground (§0.7: one seam per garment, one detail per 6 px)
  chTallyTag(ctx, rig, R(-hw * 0.6), -H + 3);
}
/** Harness-leather belt block: the faction carries its load at the WAIST, and this is where it hangs. */
export function chHips(ctx, rig, pose, inf) {
  const hip = inf.w, hw = R(hip / 2), pal = inf.pal;
  celRect(ctx, rig, -hw, -5, hip, 11, 3, pal.secondary, 0.4, 0.2);
  if (rig.override) return;
  // ONE seam: a quicklime top edge that breaks the leather apron above from the leather belt block. Quicklime on
  // leather is a MATERIAL change, so it takes 1 px of ink (0.2) and 4 px of colour rather than 3 (0.7).
  band(ctx, rig, -hw + 1, -5, hip - 2, 4, pal.sleeve, 1);
  ctx.fillStyle = rig.col(pal.metal); ctx.fillRect(0, -5, 4, 5);
}
/** Leather bracer with a quicklime sleeve wrap at the elbow (limb space: origin at the elbow, +y along the forearm). */
export function chArmLower(ctx, rig, pose, inf) {
  const r = inf.r, len = inf.len, pal = inf.pal;
  celRect(ctx, rig, -r, 0, r * 2, len + 1, r, pal.secondary, 0.4, 0.2);
  if (rig.override) return;
  // the quicklime sleeve wrap is cloth over leather: inked, not faked. The 1 px tone line that used to sit under it
  // was doing the line's job badly and is gone (0.2 / 0.7).
  band(ctx, rig, -r, 0, r * 2, 4, pal.sleeve, 1);
}
/**
 * Limedust canvas trousers with a leather knee strap (limb space: origin at the hip).
 * Without this hook rig.js fills the thigh with pal.secondary, which put the belt block, BOTH leg segments and the
 * forearm on one hex — waist to knee was a single unbroken leather field ~12 game px tall (§0.1 / §11).
 */
export function chLegUpper(ctx, rig, pose, inf) {
  const r = inf.r, len = inf.len, pal = inf.pal;
  celRect(ctx, rig, -r, 0, r * 2, len + 1, r, pal.primary, 0.4, 0.25);
  if (rig.override) return;
  band(ctx, rig, -r, len - 3, r * 2, 4, pal.secondary, 1);   // the knee strap: leather on canvas takes the line
}
/** Quicklime gaiter over the shin with one leather strap (limb space: origin at the knee). */
export function chLegLower(ctx, rig, pose, inf) {
  const r = inf.r, len = inf.len, pal = inf.pal;
  celRect(ctx, rig, -r, 0, r * 2, len + 1, r, pal.sleeve, 0.4, 0.25);
  if (rig.override) return;
  // 4 px and inked, not 3 px with a tone line under it: a 3 px band that takes an outline on both edges leaves
  // 1 px of colour and fails 0.7 harder than the missing line did (0.2 / corollary d)
  band(ctx, rig, -r, len - 7, r * 2, 4, pal.secondary, 1);
}
/** Rubber boot with a pewter buckle and a cap of lime dust on the toe (ankle space, toe toward +x). */
export function chFoot(ctx, rig, pose, inf) {
  // far side takes LEATHER, not rubber: farPalette drops #2B2620 to ~(26,24,27) against a #20180F outline, so the
  // far boot rendered as a featureless hole that its own outline could not bound (§0.1 / §0.3 'never darken twice').
  drawBoot(ctx, rig, inf.w, inf.h, inf.far ? inf.pal.secondary : inf.pal.dark, inf.pal.metal);
  if (rig.override) return;
  const toe = R(inf.w * 0.62), sole = R(inf.h * 0.5);
  ctx.fillStyle = rig.col(inf.pal.sleeve); ctx.fillRect(toe - 6, sole - 4, 5, 3);
}
/** Rubber gauntlet with a quicklime wrist cuff (far gauntlet in leather — see chFoot). */
export function chHand(ctx, rig, pose, inf) {
  drawFist(ctx, rig, inf.r, inf.far ? inf.pal.secondary : inf.pal.dark);
  if (rig.override) return;
  // 4 px and inked: the cuff is the ONLY thing separating the far fist from the far forearm it shares a hex with,
  // and at 3 px unoutlined it was the single most repeated faked boundary in the faction
  band(ctx, rig, R(-inf.r * 0.6) - 2, R(-inf.r), 4, R(inf.r * 2), inf.pal.sleeve, 1);
}
/** Complete Chandlery part table. */
export const CH_PARTS = { head: chHead, face: chFace, hat: chHat, torso: chTorso, hips: chHips, armLower: chArmLower, legUpper: chLegUpper, legLower: chLegLower, foot: chFoot, hand: chHand };

// ---------------------------------------------------------------- the lamp, the cone and the tether
/** Glass colour for the current `rig.lamp` state: 0 dark / 1 idle / 2 rite. Three states, 30-70 L* points apart. */
export function lampGlass(rig) { const s = lampState(rig); return s === 2 ? CH.lime : s === 1 ? CH.idleGlass : CH.dead; }
/** Gallery / contact sheets never run the AI, so an unset lamp reads as LIT rather than a dead grey box. */
export function lampState(rig) { return rig.lamp == null ? 1 : rig.lamp | 0; }
/**
 * A shuttered lamp in whatever local space the caller is in: pewter body, glass in the current state with a hot core,
 * one shutter fin top and bottom. `k` scales it (the Resurrection Man's cart lamp is bigger than the Purser's bull's-eye).
 */
export function drawLamp(ctx, rig, x, y, k = 1) {
  const w = R(8 * k), h = R(10 * k), x0 = R(x - w / 2), y0 = R(y - h / 2);
  celRect(ctx, rig, x0, y0, w, h, 2, CH.pewter, 0.4, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(lampGlass(rig)); ctx.fillRect(x0 + 1, y0 + 2, w - 2, h - 4);
  if (lampState(rig) === 2) { ctx.fillStyle = rig.col(CH.hot); ctx.fillRect(x0 + 2, y0 + 3, w - 4, h - 6); }
  const t = tones(rig, CH.pewter);
  // ONE shutter fin, not two: three separate 1 px marks on an 8 px body is the clutter §0.7 bans
  ctx.fillStyle = t.deep; ctx.fillRect(x0, y0 + h - 2, w, 1);
  ctx.fillStyle = t.hi; ctx.fillRect(x0 + 1, y0, w - 2, 1);
}

const LAMP_PT = { x: 0, y: 0 };
/** Screen position of this Chandler's lamp (build.chand.lampJoint + a facing-mirrored offset). Reused scratch point. */
export function lampScreen(f) {
  const ch = f.rig.build.chand || EMPTY, sc = f.rig.scale;
  jointScreen(f.rig, ch.lampJoint || 'torso', LAMP_PT);
  LAMP_PT.x += f.facing * (ch.lampDX || 0) * sc;
  LAMP_PT.y += (ch.lampDY || 0) * sc;
  return LAMP_PT;
}
const CONE_MIN = 26, CONE_MAX = 38, CONE_REACH = 46, DASH = [3, 3], NODASH = [];
/** Where the cone lands: the recipient, or (Resurrection Man) the cart behind his heels. */
function riteSpotX(f, cam, t) {
  if (t && t !== f) return cam.toScreenX(t.x);
  const ch = f.rig.build.chand || EMPTY;
  return cam.toScreenX(f.x + f.facing * (ch.selfConeDX != null ? ch.selfConeDX : 26));
}
function riteSpotZ(f, t) { return t && t !== f ? t.z : f.z; }
/**
 * ONE cone. The apex is the lamp; the base is a wedge on the floor under the recipient. Two clamps keep it a SHAPE:
 * the base is pushed at least CONE_REACH px past the lamp (the hip-lamp variants mark allies ~30 px away, and a
 * 30 px-long cone from a hip lamp collapsed to a sliver), and the half-width grows with distance between MIN and MAX.
 * Outer 2 px pitch-tallow + inner 1 px hot core so it reads on wet planks AND on the Heart-Engine's pale marble.
 */
function drawOneCone(ctx, f, cam, t, strobe) {
  const L = lampScreen(f), ty = R(FLOOR_TOP + riteSpotZ(f, t) + cam.shakeY);
  let tx = riteSpotX(f, cam, t);
  const dist = Math.abs(tx - L.x);
  if (dist < CONE_REACH) tx = L.x + (tx >= L.x ? CONE_REACH : -CONE_REACH);
  const half = Math.max(CONE_MIN, Math.min(CONE_MAX, dist * 0.5));
  ctx.beginPath();
  ctx.moveTo(L.x, L.y);
  ctx.lineTo(tx - half, ty - 5);
  ctx.quadraticCurveTo(tx, ty + 8, tx + half, ty - 5);
  ctx.closePath();
  ctx.globalAlpha = strobe; ctx.fillStyle = CH.lime; ctx.fill();
  ctx.globalAlpha = Math.min(1, strobe + 0.4);
  ctx.strokeStyle = CH.outline; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = CH.hot; ctx.lineWidth = 1; ctx.stroke();
}
/**
 * THE SHUTTER CONE. Drawn from drawAfter at a low alpha rather than drawBefore: drawBefore runs under the Chandler and
 * before the z-sorted recipient, so the widest end of the cone landed exactly where the recipient's sprite covered it.
 * Every recipient gets one — the Purser doses TWO allies, and only one of them used to get a cone.
 */
export function drawRiteCone(ctx, f, cam) {
  if ((f.rig.lamp | 0) !== 2) return;
  const fr = f.anim.frame;
  if (!(fr && fr.tell)) return;
  const strobe = f.rig.tellWarn && (f.rig.tick & 2) ? 0.5 : 0.34;
  ctx.save();
  drawOneCone(ctx, f, cam, f.riteTarget, strobe);
  if (f.riteTarget2 && f.riteTarget2 !== f.riteTarget) drawOneCone(ctx, f, cam, f.riteTarget2, strobe);
  ctx.restore();
}
/** One tether: 1px dashed limelight from the lamp to a recipient's chest, going SOLID on the active frame. */
function drawOneTether(ctx, f, cam, t) {
  if (!t || t === f || t.dead) return;
  const L = lampScreen(f), tx = cam.toScreenX(t.x), ty = R(FLOOR_TOP + t.z + cam.shakeY) - R(t.h * 0.55);
  ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(tx, ty); ctx.stroke();
}
/** The tether (drawAfter): one per recipient, so the two-ally dram tethers both of its clients. */
export function drawRiteTether(ctx, f, cam) {
  if ((f.rig.lamp | 0) !== 2) return;
  ctx.save();
  ctx.strokeStyle = CH.lime; ctx.lineWidth = 1;
  ctx.setLineDash(f.riteHold > 0 ? NODASH : DASH);
  drawOneTether(ctx, f, cam, f.riteTarget);
  drawOneTether(ctx, f, cam, f.riteTarget2);
  ctx.setLineDash(NODASH);
  ctx.restore();
}
/** The lime rim every buffed ally wears: a 1px limelight outline around its hurtbox (status.draw). */
export function drawRiteRim(ctx, f, sx, sy, s) {
  const w = f.w + 6, h = f.h + 6, x = R(sx - w / 2), y = R(sy - f.h - 3);
  ctx.save();
  ctx.globalAlpha = 0.85; ctx.strokeStyle = s.rim || CH.lime; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------- the shared rite plumbing
/**
 * THE RITE DIES WITH THE RITUALIST, however it died. Every rite's onTick calls this first: items.js ringOut() sets
 * `dead = true` without calling die(), so a Chandler thrown over a railing never fires onDeath — but tickStatuses
 * still runs this every frame, and clearStatus fires onEnd, which restores exactly the fields the rite changed.
 * @returns {boolean} true when the status has just been cleared (the caller must return immediately)
 */
export function riteSourceGone(f, s) {
  const src = s.source;
  if (src && !src.dead && !src.removeMe && src.hp > 0) return false;
  f.clearStatus(s.name);
  return true;
}
/** THE COMPANY DOES NOT INSURE ITS OWN: no rite may ever land on another Chandler. */
export function isClient(e, f) {
  return e && e !== f && !e.dead && !e.removeMe && e.alive && e.def && e.def.faction !== 'chandler';
}
/** Light the lamp solid for the active frame and hold the tether there (called from every rite's anim event). */
export function riteFlash(f, world) {
  f.riteHold = 14;
  f.rig.lamp = 2;
  if (world) world.addFx('ring', f.x, R(f.h * 0.5), f.z, { r0: 4, r1: 22, color: CH.lime });
  audio.play('gear_slip'); // the tin shutter
}

/**
 * Hooks every Chandler shares. onUpdate drives `rig.lamp` and keeps the recipient; onHitTaken is the rite-break rule
 * (with the armour guard, because the hook runs BEFORE the armour branch in fighter.js takeHit); drawBefore paints the
 * cone, drawAfter the tether; onDeath is COSMETIC ONLY — the buffs are cleared by each rite's own onTick.
 */
export const BASE_HOOKS = {
  onSpawn(f) { f.riteTarget = null; f.riteTarget2 = null; f.riteBroken = 0; f.riteHold = 0; f.rig.lamp = 1; },
  onUpdate(f, world) {
    const ch = f.rig.build.chand || EMPTY, rig = f.rig;
    if (f.riteBroken > 0) f.riteBroken--;
    if (f.riteHold > 0) f.riteHold--;
    const fr = f.anim.frame;
    const telling = !!(fr && fr.tell) && f.state === ST.ATTACK && !!ch.rites && ch.rites.indexOf(f.anim.name) >= 0;
    if (telling || f.riteHold > 0) rig.lamp = 2;
    else if (f.riteBroken > 0 || (ch.cool ? ch.cool(f) : f.rangedCooldown) > 0) rig.lamp = 0;
    else rig.lamp = 1;
    if (!ch.find) return;
    if (telling) { if (!f.riteTarget || f.riteTarget.dead || f.riteTarget.removeMe) f.riteTarget = ch.find(f, world); }
    else if (rig.lamp === 1) f.riteTarget = ch.find(f, world);
    else if (f.riteHold <= 0) f.riteTarget = null;
    // the second slot exists only for the rite that hands out TWO buffs (the Purser's dram); the other four leave it null
    if (ch.find2) f.riteTarget2 = f.riteTarget && f.riteTarget !== f ? ch.find2(f, world, f.riteTarget) : null;
  },
  // ONE TOUCH BREAKS A RITE. Runs at fighter.js:416, BEFORE the armour branch, so frame armour has to be filtered by
  // hand (only the Limeburner's vent has any). Returns undefined so the hit still resolves normally.
  onHitTaken(f, hit) {
    if (f.armor && !hit.breaksArmor && hit.type !== 'launch' && hit.type !== 'knockdown') return undefined;
    const fr = f.anim.frame, ch = f.rig.build.chand || EMPTY;
    if (fr && fr.tell && ch.rites && ch.rites.indexOf(f.anim.name) >= 0) {
      f.rangedCooldown = Math.max(f.rangedCooldown, 120);
      f.attackCooldown = Math.max(f.attackCooldown, 90);
      if (f.tallyCd != null) f.tallyCd = Math.max(f.tallyCd, 120);
      f.riteBroken = 90; f.riteHold = 0; f.riteTarget = null; f.riteTarget2 = null; f.rig.lamp = 0;
      floatText(f.x, f.y + f.h + 10, f.z, 'RITE BROKEN', CH.lime, 1);
      audio.play('gear_slip');
    }
    return undefined;
  },
  drawAfter(ctx, f, sx, sy, cam) { drawRiteCone(ctx, f, cam); drawRiteTether(ctx, f, cam); },
  // cosmetic only: the lamp glass shatters, the tethers drop. The rites themselves pop from their own onTick.
  onDeath(f, world) {
    f.rig.lamp = 0; f.riteTarget = null; f.riteTarget2 = null; f.riteHold = 0;
    const y = f.y + f.h * 0.5;
    particles.burst('spark', f.x, y, f.z, 9, { speed: 3, up: 2, color: CH.lime, color2: CH.hot });
    particles.burst('debris', f.x, y, f.z, 4, { speed: 2.4, up: 2.6, color: CH.pewter });
    if (world) world.addFx('ring', f.x, R(f.h * 0.45), f.z, { r0: 4, r1: 26, color: CH.lime });
    audio.play('prop_break');
  },
};

// ---------------------------------------------------------------- the faction's gaits
/**
 * FOUR gaits, not one. The base set used to hand every variant the same 32f / 8-key cycle, which put a scampering boy,
 * a kiln-carrier at half speed and a straight-backed officer on identical feet (§10). `o.gait` picks the table; the
 * helper `w(legR, legL, armL, rootY, squash, footR, footL, headBob, armRdU, armRdL, torsoRock)` is closed over the
 * variant's own carry pose, so the load still rides where that variant carries it.
 */
const WALKS = {
  // the trudging contractor: contact / down (+2, squash) / pass / up (-1) x2, the off arm biased BACK
  work: (w, aL, A) => [
    FK(4, w([28, 4], [-22, 16], A(aL, 12, -4), 0, 0, -8, 0, 0, 4, -2, 2), { ease: 'out' }),
    FK(4, w([22, 12], [-14, 28], A(aL, 6, -6), 2, 1.04, 0, 0, 2, 6, -5, 5), { ease: 'out' }),
    FK(4, w([6, 24], [0, 10], A(aL, -8, -8), 1, 0, 0, 0, 1, 2, -3, 4), { ease: 'inout' }),
    FK(4, w([-10, 12], [16, -2], A(aL, -22, -10), -1, 0, 0, -6, -2, -3, 1, 1), { ease: 'in' }),
    FK(4, w([-22, 16], [28, 4], A(aL, -34, -12), 0, 0, 0, -8, 0, -5, 2, 2), { ease: 'out' }),
    FK(4, w([-14, 28], [22, 12], A(aL, -28, -12), 2, 1.04, 0, 0, 2, 0, -1, 5), { ease: 'out' }),
    FK(4, w([0, 10], [6, 24], A(aL, -16, -10), 1, 0, 0, 0, 1, 4, -4, 4), { ease: 'inout' }),
    FK(4, w([16, -2], [-10, 12], A(aL, -2, -6), -1, 0, -6, 0, -2, 6, -4, 1), { ease: 'in' }),
  ],
  // WICKBOY — 24f scamper, high knees, both boots clear of the deck on the two pass keys, the pole bouncing +-7 deg
  scamper: (w, aL, A) => [
    FK(3, w([36, 2], [-30, 30], A(aL, 16, -4), 2, 0, -10, 0, -1, 7, -3, 0), { ease: 'out' }),
    FK(3, w([26, 20], [-16, 46], A(aL, 8, -8), 3, 1.06, 0, 0, 3, 1, -6, 6), { ease: 'out' }),
    FK(3, w([4, 40], [6, 26], A(aL, -12, -10), 0, 0.94, 0, 0, -3, -6, 0, -2), { ease: 'out' }),
    FK(3, w([-16, 28], [24, -4], A(aL, -30, -12), 1, 0, 0, -10, -2, -2, 3, 1), { ease: 'in' }),
    FK(3, w([-30, 30], [36, 2], A(aL, -40, -14), 2, 0, 0, -10, -1, 7, -3, 0), { ease: 'out' }),
    FK(3, w([-16, 46], [26, 20], A(aL, -32, -14), 3, 1.06, 0, 0, 3, 1, -6, 6), { ease: 'out' }),
    FK(3, w([6, 26], [4, 40], A(aL, -20, -12), 0, 0.94, 0, 0, -3, -6, 0, -2), { ease: 'out' }),
    FK(3, w([24, -4], [-16, 28], A(aL, -4, -8), 1, 0, -10, 0, -2, -2, 3, 1), { ease: 'in' }),
  ],
  // RESURRECTION MAN — 44f, the slowest cycle in the game: one boot always planted, root bob +3, torso rocking S+-4
  trudge: (w, aL, A) => [
    FK(6, w([20, 6], [-16, 14], A(aL, 8, -2), 0, 0, -4, 0, 0, 3, -1, 4), { ease: 'inout' }),
    FK(6, w([16, 14], [-10, 26], A(aL, 4, -4), 3, 1.05, 0, 0, 3, 6, -4, 7), { ease: 'out' }),
    FK(5, w([6, 22], [-2, 14], A(aL, -4, -6), 1, 0, 0, 0, 2, 2, -2, 3), { ease: 'inout' }),
    FK(5, w([-6, 12], [12, 2], A(aL, -14, -8), 0, 0, 0, -4, -1, -3, 1, -1), { ease: 'in' }),
    FK(6, w([-16, 14], [20, 6], A(aL, -22, -8), 0, 0, 0, -4, 0, 3, -1, 4), { ease: 'inout' }),
    FK(6, w([-10, 26], [16, 14], A(aL, -18, -8), 3, 1.05, 0, 0, 3, 6, -4, 7), { ease: 'out' }),
    FK(5, w([-2, 14], [6, 22], A(aL, -10, -6), 1, 0, 0, 0, 2, 2, -2, 3), { ease: 'inout' }),
    FK(5, w([12, 2], [-6, 12], A(aL, -2, -4), 0, 0, -4, 0, -1, -3, 1, -1), { ease: 'in' }),
  ],
  // PURSER — parade march: the back never bends (torso rock 0), the cane arm swings from the SHOULDER, the off hand
  // stays clasped behind the back on every key
  parade: (w, aL, A) => [
    FK(4, w([26, 2], [-24, 12], A(aL, 0, 0), 0, 0, -6, 0, 0, 14, 0, 0), { ease: 'inout' }),
    FK(4, w([20, 10], [-16, 24], A(aL, 0, 0), 1, 1.03, 0, 0, 0, 9, 0, 0), { ease: 'out' }),
    FK(4, w([6, 20], [0, 10], A(aL, 0, 0), 0, 0, 0, 0, 0, 2, 0, 0), { ease: 'inout' }),
    FK(4, w([-10, 10], [14, 0], A(aL, 0, 0), -1, 0, 0, -6, 0, -6, 0, 0), { ease: 'in' }),
    FK(4, w([-24, 12], [26, 2], A(aL, 0, 0), 0, 0, 0, -6, 0, -12, 0, 0), { ease: 'inout' }),
    FK(4, w([-16, 24], [20, 10], A(aL, 0, 0), 1, 1.03, 0, 0, 0, -7, 0, 0), { ease: 'out' }),
    FK(4, w([0, 10], [6, 20], A(aL, 0, 0), 0, 0, 0, 0, 0, 0, 0, 0), { ease: 'inout' }),
    FK(4, w([14, 0], [-10, 10], A(aL, 0, 0), -1, 0, -6, 0, 0, 8, 0, 0), { ease: 'in' }),
  ],
};

// ---------------------------------------------------------------- shared base animation set
/**
 * LIGHT OUT FRONT, LOAD AT THE WAIST. Every key leans `o.stoop` degrees forward (0 for the Purser, the one straight
 * back in the faction) with the head down, the lamp arm out in front at hip height and the off hand hanging BACK
 * behind the load, so §0.6 open-rest falls out for free: nothing crosses the torso or the face.
 * States: idle 4 / walk 8 / run 8 / jump 3 / fall 2 / land 2 / hurt 3 / stagger 2 / hurtAir / knockdown / lying 2 /
 * getup 3 / dead 2 / dodge 5, plus the engine grab set (o.grab) for the Resurrection Man.
 * @param {object} c rest carry { armR, armL, weapon, weaponBack?, grip? }
 * @param {{ stoop?: number, head?: number, weaponFloor?: number, grab?: boolean, gait?: string }} o
 */
export function makeChandlerBase(c, o = {}) {
  const S = o.stoop != null ? o.stoop : 14, HD = o.head != null ? o.head : 2, wf = o.weaponFloor != null ? o.weaponFloor : -24;
  const K = (s) => ({ torso: S, head: HD, legR: [8, 4], legL: [-8, 6], ...c, ...s });
  const aR = c.armR, aL = c.armL, A = (a, du, dl) => [a[0] + du, a[1] + dl];
  const FLOOR = { armR: [-20, -6], weapon: wf, armL: [30, 20], torso: 2, head: -12, legR: [12, 10], legL: [-4, 8], root: [24, -8, -88], grip: 0, weaponBack: 0, face: 'dazed' };
  // `du`/`dl` are the LAMP-ARM drift for this key and `ts` the torso rock: a carry arm frozen at one offset through all
  // eight keys of a bobbing walk was the flattest thing in the set (§8 walk / §10 "the sheet must not look canned").
  const walk = (lr, ll, al, ty, sq, fr, fl, hb, du, dl, ts) => K({ legR: lr, legL: ll, armL: al, armR: A(aR, du != null ? du : 2, dl != null ? dl : -2), torso: S + (ts != null ? ts : 3), head: HD + (hb || 0), root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, footR: fr || 0, footL: fl || 0 });
  const run = (lr, ll, al, ty, sq, du, dl) => K({ legR: lr, legL: ll, armL: al, armR: A(aR, du != null ? du : -10, dl != null ? dl : -6), torso: S + 16, head: HD - 6, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, face: 'angry' });
  const anims = {
    // breathing carry: the lamp arm drifts 2 deg, the coat skirt settles, the head nods
    idle: { loop: true, frames: [
      FK(14, K({ root: [0, 0] }), { ease: 'inout' }),
      FK(13, K({ torso: S + 3, head: HD + 2, root: [0, 1], armR: A(aR, 2, -2), armL: A(aL, 3, 2), squash: 1.02, stretch: 0.98 }), { ease: 'inout' }),
      FK(14, K({ torso: S + 1, head: [HD - 1, 1, 0], root: [0, 0], armR: A(aR, 1, -1) }), { ease: 'inout' }),
      FK(13, K({ torso: S - 1, head: [HD + 1, 0, 0], root: [0, 0], armR: A(aR, -1, 1), armL: A(aL, -3, -2) }), { ease: 'inout' }),
    ] },
    walk: { loop: true, frames: WALKS[o.gait] ? WALKS[o.gait](walk, aL, A) : WALKS.work(walk, aL, A) },
    run: { loop: true, frames: [
      FK(3, run([52, 14], [-40, 56], A(aL, 40, -34), -2, 0, -14, -2), { ease: 'out' }),
      FK(3, run([40, 30], [-30, 70], A(aL, 22, -30), 1, 1.05, -6, -8), { ease: 'out' }),
      FK(3, run([10, 40], [10, 30], A(aL, -12, -26), -4, 0, -2, -10), { ease: 'inout' }),
      FK(3, run([-24, 50], [40, 8], A(aL, -42, -26), -3, 0, -8, -8), { ease: 'in' }),
      FK(3, run([-40, 56], [52, 14], A(aL, -52, -28), -2, 0, -16, -4), { ease: 'out' }),
      FK(3, run([-30, 70], [40, 30], A(aL, -38, -30), 1, 1.05, -8, -8), { ease: 'out' }),
      FK(3, run([10, 30], [10, 40], A(aL, -2, -30), -4, 0, -2, -10), { ease: 'inout' }),
      FK(3, run([40, 8], [-24, 50], A(aL, 28, -34), -3, 0, -6, -8), { ease: 'in' }),
    ] },
    jump: { loop: false, frames: [
      FK(3, K({ legR: [30, 40], legL: [-20, 44], torso: S + 10, root: [0, 4], squash: 1.1, stretch: 0.9, armL: A(aL, -20, 24) }), { ease: 'out' }),
      FK(4, K({ legR: [30, -30], legL: [10, -20], torso: S - 10, head: HD - 6, root: [0, -2], squash: 0.94, stretch: 1.08, armL: A(aL, -50, -12) }), { ease: 'out' }),
      FK(30, K({ legR: [40, -70], legL: [20, -50], torso: S - 6, head: HD - 4, armL: A(aL, -34, -8) }), { ease: 'inout' }),
    ] },
    fall: { loop: true, frames: [
      FK(10, K({ legR: [24, -30], legL: [8, -20], armL: A(aL, -58, -12), torso: S - 14, head: HD - 8, face: 'grit' }), { ease: 'inout' }),
      FK(10, K({ legR: [30, -40], legL: [4, -14], armL: A(aL, -70, -12), torso: S - 18, head: HD - 10, face: 'grit' }), { ease: 'inout' }),
    ] },
    land: { loop: false, frames: [
      FK(3, K({ legR: [34, 46], legL: [-24, 48], torso: S + 12, head: HD + 6, root: [0, 3], squash: 1.16, stretch: 0.86, armL: A(aL, -18, 22), face: 'grit' }), { ease: 'out' }),
      FK(5, K({ legR: [14, 16], legL: [-10, 18], torso: S + 2, root: [0, 1], squash: 1.02, stretch: 0.98 }), { ease: 'out' }),
    ] },
    hurt: { loop: false, frames: [
      FK(4, K({ torso: -12, head: HD - 24, armL: [-64, -30], armR: A(aR, -26, -28), weapon: (c.weapon || 0) - 16, root: [-5, 1], legR: [22, 4], legL: [-14, 12], face: 'hurt' }), { ease: 'out' }),
      FK(10, K({ torso: S - 8, head: HD - 12, armL: [-30, -12], armR: A(aR, -10, -10), weapon: (c.weapon || 0) - 6, root: [-2, 1], legR: [14, 2], legL: [-10, 8], face: 'hurt' }), { ease: 'out' }),
      FK(6, K({ torso: S + 2, face: 'angry' }), { ease: 'out' }),
    ] },
    // rite broken / stunned: the lamp arm drops, the load swings, the mask tips back
    stagger: { loop: true, frames: [
      FK(6, K({ torso: 2, head: HD - 14, root: [-3, 2], armR: [10, 20], armL: [-42, -14], weapon: (c.weapon || 0) + 26, legR: [22, 12], legL: [-22, 16], face: 'dazed' }), { ease: 'inout' }),
      FK(6, K({ torso: 18, head: HD + 8, root: [3, 1], armR: [16, 14], armL: [-24, -20], weapon: (c.weapon || 0) + 32, legR: [18, 14], legL: [-26, 12], face: 'dazed' }), { ease: 'inout' }),
    ] },
    // the load goes first: the tool arm stays clamped shut on the haft while the OFF arm windmills, which is the
    // opposite of the Sootborn's both-arms-flung flail (§10 — the wave recipes mix these two factions on one screen)
    hurtAir: { loop: true, frames: [
      FK(6, { armR: [-52, 34], weapon: (c.weapon || 0) + 22, armL: [-124, -34], torso: -22, head: -28, legR: [26, 52], legL: [4, 68], root: [0, 0, -12], grip: 0, face: 'hurt' }, { ease: 'inout' }),
      FK(6, { armR: [-64, 26], weapon: (c.weapon || 0) + 34, armL: [-148, -26], torso: -30, head: -34, legR: [40, 40], legL: [16, 58], root: [0, 0, -21], grip: 0, face: 'hurt' }, { ease: 'inout' }),
    ] },
    knockdown: { loop: true, frames: [
      FK(8, { armR: [-28, 44], weapon: (c.weapon || 0) + 30, armL: [-104, -18], torso: -46, head: -16, legR: [56, 26], legL: [34, 46], root: [0, -5, -28], grip: 0, face: 'hurt' }, { ease: 'inout' }),
      FK(8, { armR: [-36, 52], weapon: (c.weapon || 0) + 40, armL: [-118, -10], torso: -52, head: -22, legR: [66, 16], legL: [44, 34], root: [0, -5, -38], grip: 0, face: 'hurt' }, { ease: 'inout' }),
    ] },
    lying: { loop: true, frames: [
      FK(16, { ...FLOOR, face: 'hurt' }, { ease: 'inout' }),
      FK(16, { ...FLOOR, torso: 7, head: -14, legR: [16, 12], face: 'hurt' }, { ease: 'inout' }),
    ] },
    getup: { loop: false, frames: [
      FK(8, { ...FLOOR, face: 'hurt' }, { ease: 'in' }),
      FK(8, { armR: [60, 40], weapon: (c.weapon || 0) + 20, armL: [-30, 40], torso: 30, head: -10, legR: [70, 60], legL: [-20, 60], root: [8, 4, -20], face: 'grit', squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
      FK(6, K({ torso: S + 6, root: [0, 1], legR: [15, 20], legL: [-10, 15], face: 'angry' }), { ease: 'out' }),
    ] },
    // death: the knees fold under the load, the lamp goes down first, the coat settles over him
    dead: { loop: false, frames: [
      FK(8, { ...FLOOR, legR: [40, -24], legL: [30, -16], armR: [-34, -18], armL: [46, 12], torso: -4, root: [22, -12, -92], squash: 1.05, stretch: 0.95 }, { ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0, count: 6 }] }),
      FK(60, { ...FLOOR, torso: 8, head: -16, legR: [10, 2], legL: [-8, 6], armR: [-28, -10], armL: [38, 22], root: [24, -8, -92] }),
    ] },
    // side-step dodge (the Purser's evade, the shared whiff hop): crouch, hop back, land with a squash
    dodge: { loop: false, frames: [
      FK(4, K({ torso: S + 12, root: [0, 3], legR: [36, 40], legL: [-20, 40], armL: A(aL, -14, 22), face: 'grit', squash: 1.08, stretch: 0.92 }), { sfx: 'dodge', ease: 'in' }),
      FK(6, K({ torso: 4, head: HD - 10, root: [0, -16], legR: [40, -60], legL: [30, -50], armR: A(aR, -26, -18), armL: A(aL, -40, -24), face: 'closed', squash: 0.94, stretch: 1.06 }), { ease: 'out' }),
      FK(5, K({ torso: 8, head: HD - 8, root: [0, -8], legR: [30, -30], legL: [20, -20], armR: A(aR, -14, -8), armL: A(aL, -24, -14), face: 'closed' }), { ease: 'in' }),
      FK(4, K({ torso: S + 10, root: [0, 3], legR: [30, 36], legL: [-18, 36], armL: A(aL, -10, 16), face: 'grit', squash: 1.1, stretch: 0.9 }), { ease: 'out' }),
      FK(4, K({ torso: S + 2, root: [0, 1] }), { ease: 'out' }),
    ] },
  };
  if (o.grab) {
    // engine grab path (Cinder Hulk verbatim): grabTell / grab / grabHold / grabHit / throw / throwBack
    // grip 0 through the whole grab set: with grip 1 the far arm is IK-solved onto the haft and the grab keys put the
    // grip point 38px from the far shoulder (the reach limit is upperArm + lowerArm + 2 = 30), so it drew straight-armed
    // every frame. The near hand keeps the tool, the far hand poses on the victim (the Cinder Hulk pattern).
    const G = { armR: [86, 26], armL: [86, 26], weapon: 30, weaponBack: 0, grip: 0 };
    Object.assign(anims, {
      grabTell: { loop: false, frames: [
        FK(10, K({ armR: [-64, -26], armL: [-72, -26], weapon: -20, weaponBack: 0, grip: 0, torso: 2, head: HD - 12, root: [-2, 0], legR: [10, 8], legL: [-16, 10], face: 'shout' }), { tell: true, sfx: 'chime', ease: 'out' }),
        FK(10, K({ armR: [-92, -16], armL: [-98, -20], weapon: -26, weaponBack: 0, grip: 0, torso: -4, head: HD - 14, root: [-4, -1], legR: [8, 8], legL: [-18, 12], face: 'shout', squash: 0.97, stretch: 1.04 }), { tell: true, ease: 'inout' }),
      ] },
      grab: { loop: false, frames: [
        FK(4, K({ ...G, armR: [92, 8], armL: [92, 8], torso: S + 12, root: [4, 0], legR: [34, 8], legL: [-26, 24], face: 'shout', squash: 1.04, stretch: 0.97 }),
          { hitbox: { x: 4, y: -84, w: 48, h: 80, z: 22, type: 'grab', once: true, damage: 0 }, move: { x: 2 }, sfx: 'hit_grab', ease: 'overshoot' }),
        FK(6, K({ ...G, torso: S + 8, root: [3, 0], legR: [30, 8], legL: [-24, 22], face: 'angry' }), { ease: 'out' }),
        FK(10, K({ ...G, armR: [62, 28], armL: [62, 28], torso: S + 4, root: [2, 1], face: 'angry' }), { punish: true, ease: 'inout' }),
      ] },
      grabHold: { loop: true, frames: [
        FK(14, K({ ...G, torso: S, root: [0, 0], legR: [22, 6], legL: [-20, 12], face: 'angry' }), { ease: 'inout' }),
        FK(14, K({ ...G, armR: [88, 30], armL: [88, 30], torso: S + 3, root: [0, 1], legR: [22, 6], legL: [-20, 12], face: 'angry' }), { ease: 'inout' }),
      ] },
      grabHit: { loop: false, frames: [
        FK(4, K({ ...G, armR: [72, 36], armL: [72, 36], torso: S - 8, head: HD - 12, root: [-2, 0], legR: [20, 6], legL: [-20, 12], face: 'angry' }), { ease: 'in' }),
        FK(4, K({ ...G, armR: [98, 40], armL: [98, 40], torso: S + 14, head: HD + 8, root: [4, 1], legR: [30, 10], legL: [-24, 18], face: 'shout', squash: 1.06, stretch: 0.95 }), { sfx: 'piston_crush', ease: 'overshoot' }),
        FK(6, K({ ...G, torso: S, root: [0, 0], legR: [22, 6], legL: [-20, 12], face: 'angry' }), { ease: 'out' }),
      ] },
      throw: { loop: false, frames: [
        FK(5, K({ ...G, armR: [58, 28], armL: [58, 28], torso: S - 20, head: HD - 8, root: [-3, 0], legR: [16, 6], legL: [-20, 14], face: 'angry', squash: 1.04, stretch: 0.96 }), { ease: 'in' }),
        FK(6, K({ ...G, armR: [140, -10], armL: [140, -10], torso: S + 22, head: HD + 6, root: [6, 0], legR: [36, 8], legL: [-30, 30], face: 'shout', squash: 0.96, stretch: 1.04 }), { sfx: 'throw', ease: 'overshoot' }),
        FK(10, K({ ...G, armR: [130, 0], armL: [130, 0], torso: S + 16, head: HD + 4, root: [6, 1], legR: [32, 8], legL: [-28, 26], face: 'grit' }), { punish: true, ease: 'inout' }),
        FK(6, K({ torso: S + 4 }), { ease: 'out' }),
      ] },
      throwBack: { loop: false, frames: [
        FK(5, K({ ...G, armR: [-108, -16], armL: [-108, -16], torso: S - 24, head: HD - 10, root: [-3, 0], legR: [16, 6], legL: [-20, 14], face: 'angry' }), { ease: 'in' }),
        FK(6, K({ ...G, armR: [-158, -8], armL: [-158, -8], torso: -34, head: HD - 18, root: [-6, 4], legR: [30, 10], legL: [-24, 26], face: 'shout', squash: 0.96, stretch: 1.04 }), { sfx: 'throw', ease: 'overshoot' }),
        // root y 5 sank both boots 3.5 px through the floor line (audit FLOOR); 1 puts them back inside +-2.5
        FK(10, K({ ...G, armR: [-148, 0], armL: [-148, 0], torso: -26, head: HD - 14, root: [-6, 1], legR: [28, 10], legL: [-22, 24], face: 'grit' }), { punish: true, ease: 'inout' }),
        FK(6, K({ torso: S + 4 }), { ease: 'out' }),
      ] },
    });
  }
  return anims;
}

export { FK, getChain, celRect, celBall, celPoly, celCapsule, tones, rimTop, rad, TAU };
