// Stormcrow rig: the shared cel-shaded aeronaut paper-doll used by content/enemies/stormcrow.js and the two
// Stage 2 bosses (midboss2.js, boss2.js). Pure art + animation data (ARCHITECTURE.md section 14).
//
// Faction read (docs/STAGE2.md section 2, art direction "sky privateers"): the Ninth Aeronaut Wing is not a
// uniformed regiment — it is a press-ganged crew of aeronaut freebooters who bought their own kit. Where the
// Brassbound are boxy steel and the Sootborn are round green, a Stormcrow is a WEATHERED FLYER: bare face under
// goggles, a scarf streaming off the neck, oiled canvas sleeves, patched leather and brass. Silhouette, headgear
// and back piece change completely from variant to variant; what makes them one faction is the kit language —
// a WING ARMBAND on the upper arm (in the wearer's rank colour), a brass wing badge in the same place on the chest
// of all seven, goggles or a lens somewhere on the head, and STATIC VIOLET as the only energy colour (never aether
// cyan, which belongs to the Concordat's machinery).
//
// RANK (docs/STAGE2.md section 2): one rate ladder, read at a glance. The colour is `crowRank()` (the variant's
// `palette.rank`, mirrored into `build.clan`), a single warm ramp heated one step per rate — ash rust, brick red,
// ember orange, flame amber, signal gold — and it is the ONLY high-chroma warm left on a rig, so nothing competes
// with it. The ladder is carried by COUNT and AREA, not by hue alone, and it climbs the body as it climbs the
// rates: 1 carrier on the Crimper (armband) -> 2 on the Corsair (+ hatband) -> 3 on the Bosun (brow band, smock
// collar, waist sash; nothing on his bare arms) -> 4 on the Galewright (brow band, gorget, armband, trouser lace)
// -> 6 on the Marine (helm-crest edge, cuirass band, armband, cuff, lace, wing-plate boss).
// COUNT AND AREA MUST AGREE. The Bosun is the trap: he is the widest body in the faction at scale 1.15, so a band
// given the full width of a part outranks the same band on the smaller elite above him. His brow band and the
// Galewright's are both kept to strap width for exactly that reason - measure the rank-hue pixel census before
// widening any of these, and Bosun < Galewright < Marine must hold.
// Flag rank (`crow.flag`) is NOT one rung further up the ramp - the two bosses wear the Wing's red in a gold frame
// no line trooper ever gets: cloth alone = rated, cloth in a gold frame = flag rank. The frame goes through the
// same 3px band floor as the band it frames, or it degrades into the red's own shadow and says nothing.
//
// SEALED HEADS: `crow.sealed` swaps the bare skull + face for a beaked storm helm (crowHelmShell + crowVisorMask).
// THE HIGHER THE RATE, THE MORE SEALED THE MASK — bandana, slouch hat and brass loupe keep their faces; the two
// elites are welded shut behind a lens. Only the two elites set it; the three line troops and both bosses never do.
//
// Value ladder (docs/ART_STYLE.md section 0.1 / 3): light canvas sleeves > warm skin > pale slate trousers >
// slate/teal/violet coat > dark plum leather boots > near-black outline. Sleeves are NEVER the coat colour and the
// trousers, boots and every Stage 2 floor (grey grate, brown plank, pale timber) sit in three different bands.
//
// Every hook draws in the local space art/rig.js sets up (limbs: origin at the joint, +y along the segment; hand and
// weapon: +x along the forearm; torso: origin at the hip centre, y up negative; head: origin at the head centre).
// Far-side parts colour from `inf.pal` (module constants go through farTone once, at module level).
import { P, FACE } from '../../art/poses.js';
import { celRect, celBall, celPoly, celCapsule, celTaper, tones, rimTop, band, flat } from '../../art/shading.js';
import { drawFist, drawSkull, drawFace, drawBelt } from '../../art/rigParts.js';
import { farShade } from '../../art/palettes.js';
import { getChain } from '../../art/secondary.js';
import { rad } from '../../engine/math.js';

const R = Math.round, TAU = Math.PI * 2;
const EMPTY = {};

/** Stormcrow colour constants. */
export const CROW = {
  // STORM NAVY, and the chroma is the faction. The coat family used to sit at 42% saturation and 6.5 Oklab chroma,
  // i.e. inside the low-chroma core of the colour lattice that every polychrome backdrop also occupies - which is
  // why a Stormcrow lost 30-39% of its pixels into the ground on five of seven sections. Hue and value are HELD
  // (265 deg, L* 40.6 / 33.8); only chroma moves, and it moves COOL: every gram of warm chroma on this rig belongs
  // to the rank ladder and nothing else may compete with it (see the RANK note above).
  coat: '#2C4682', coatDark: '#1E3468',
  // THE LEATHER IS A NEUTRAL AND IT WAS NOT BEHAVING LIKE ONE. At s51 the strap family was over the 40% ceiling
  // this palette sets for everything that is not an identity mass, and - worse - it sat in the same warm amber
  // wedge six of the seven stages are built out of, so the belts, brims, patches and pouches landed in lattice
  // cells the ground already owned on four to six sections each. Pulled under the ceiling and, on the darkest
  // step, a shade toward the faction's own plum boot; at that value the hue barely reads and the collision goes.
  // It also takes warm chroma OFF the body, which is the one thing the rank ladder needs (see RANK above).
  leather: '#614438', leatherDark: '#422F33', strap: '#7A6258',
  // the duck trousers are the rig's LIGHT step (L* 56-64 against the coat's 33-48 and the canvas sleeve's 85): the
  // faction straddles every stage's floor band from above and below instead of sitting inside it. They are the
  // SECOND identity mass, so they carry real chroma (s 46-53) rather than the old near-achromatic slate.
  canvas: '#D8CDB2', canvasSh: '#A99C80', duck: '#6F8CCC',
  // pewter and pewterDark keep their value and stay NEUTRAL (both under the 40% ceiling), but carry enough cool
  // chroma to be separable from a grey ground; they are steel, not a blue uniform.
  pewter: '#85A0D2', pewterDark: '#4E637F', copper: '#9E7248', brass: '#C89B3C',
  glass: '#BBD4E8', glassHot: '#FFF4CE',
  // sealed-helm set: the gun-metal beak, the WARM taupe mask plate that keeps pewter off gun (only ~17% apart in
  // luminance, so they may never touch), and the two dead states of the sighting lens.
  gun: '#7286A8', mask: '#6A5F55', glassDim: '#7E93A6', glassDead: '#4E5460',
  // flag-rank hardware: the dark-gold edge that frames a boss's rank band and no line trooper's
  goldDark: '#8A6A26',
  boot: '#4C3450',   // the same dark plum at the same value, with enough chroma to be separable from a grey ground
  // hair lifted off the ink (#3A2A24 was 6.5 Oklab L* over the outline, so its own line died in it) and an
  // actually GREY privateer beard: at s23 the old one was a warm neutral sitting in four stages' own cells.
  skin: '#E2AE83', hair: '#46352A', beard: '#6E6E68',
  wine: '#8E2F38', spark: '#9B7BFF', sparkPale: '#D7CBFF',
  rope: '#B8A484', outline: '#1B1E28',
};
/** Far-side copies of the module constants (never darken twice: far parts pick these, near parts the originals). */
export const farTone = (hex) => farShade(hex, 0.62, 0.25);
const LEATHER_F = farTone(CROW.leather), STRAP_F = farTone(CROW.strap),
  PEWTER_F = farTone(CROW.pewter), ROPE_F = farTone(CROW.rope);

/**
 * THE rank colour — one source of truth for every rank mark on the faction. `palette.rank` is authoritative because
 * `farPalette()` shades it once at buildRig, so far limbs get a correct dark copy for free (`inf.pal.rank`);
 * `build.clan` stays as the fallback for the few marks that predate it. Rule: rank on torso / head / hips (no far
 * copy) goes through `rig.col(crowRank(rig))`, rank on arms and legs through `inf.pal.rank` — never darken twice.
 */
export function crowRank(rig) { return rig.palette.rank || rig.build.clan || CROW.wine; }
/** Flag rank: a boss's rank band carries a gold underscore the line rates never get. */
const crowFlag = (rig) => !!(rig.build.crow && rig.build.crow.flag);
/** Band thickness in LOCAL units, floored so the mark still clears ART_STYLE section 0.7's 3px band floor at 1x. */
export const rankH = (rig, n) => Math.max(n || 3, Math.ceil(3 / (rig.build.scale || 1)));
/**
 * A rank band and its 1px shadow, in a space with no far copy (torso / head / hips). Detail, not silhouette: call it
 * AFTER the part's `if (rig.override) return;` so the smear and hit-flash passes stay one flat colour.
 */
export function rankBand(ctx, rig, x, y, w, h) {
  const c = crowRank(rig);
  // INKED, not a bare fill: cloth over plate is a MATERIAL change and section 0.2 says it carries the line. band()
  // is one stroke + one fill and ZERO clips, so the ink costs no clip budget - and outlining a rank mark changes no
  // hex at all while making an elite's band read harder against its own sleeve, which STRENGTHENS the ladder.
  // The flag frame is drawn INSIDE the same inked field (one device, one outline) with a 1px seam at the join:
  // stroking a 2-3px gold bar on its own edges would leave a line and no gold, failing section 0.7 harder.
  const flag = crowFlag(rig), fh = flag ? rankH(rig, 2) : 0;
  band(ctx, rig, x, y, w, h + fh, c);
  ctx.fillStyle = tones(rig, c).sh; ctx.fillRect(R(x), R(y) + R(h) - 1, R(w), 1);
  if (flag) { ctx.fillStyle = rig.col(CROW.goldDark); ctx.fillRect(R(x), R(y) + R(h), R(w), fh); }
}
/** The sealed-helm kit, or null. The ONE predicate every sealed branch keys off: unsealed rigs never set it. */
const sealedOf = (rig) => { const k = rig.build.crow; return k && k.sealed ? k : null; };

/** Base value ladder: light canvas sleeves over a slate coat, pale slate trousers, dark plum boots, brass fittings. */
export const CROW_PAL = {
  skin: CROW.skin, hair: CROW.hair, primary: CROW.coat, sleeve: CROW.canvas, secondary: CROW.duck,
  accent: CROW.brass, metal: CROW.pewter, dark: CROW.boot, glow: CROW.spark, rank: CROW.wine,
};
/** Lean aeronaut build: the five variants each re-space this (see stormcrow.js). ~74px tall at scale 1. */
export const CROW_PROPS = {
  headR: 8.5, neck: 3, neckR: 3.2, torsoW: 21, torsoH: 27, hip: 17, upperArm: 14, lowerArm: 13, armR: 4,
  handR: 4.5, upperLeg: 16, lowerLeg: 15, legR: 5, footL: 12, footH: 5, bulge: 0.45, shoulderX: 3, hipX: 4,
};
/** Keyframe shorthand: FK(dur, poseSpec, extraFrameFields). */
export const FK = (dur, spec, extra) => ({ dur, pose: P(spec), ...(extra || {}) });

// ---------------------------------------------------------------- head, face, the faction tell
/**
 * Bare aeronaut skull (head hook). `build.crow.hair`: 'crop' (default cap), 'bald', 'loose' (drawn by the headgear),
 * 'queue' (a braid on a 2-link chain down the back).
 */
export function crowHead(ctx, rig, pose, inf) {
  const r = inf.r, k = rig.build.crow || EMPTY, pal = inf.pal;
  const sk = sealedOf(rig);
  if (sk) { crowHelmShell(ctx, rig, r, sk); return; }
  if (k.hair === 'queue' && !rig.override) drawQueue(ctx, rig, r, pal.hair);
  drawSkull(ctx, rig, r, pal.skin, k.hair === 'bald' || k.hair === 'loose' ? null : pal.hair, null);
  if (rig.override || !k.stubble) return;
  ctx.fillStyle = tones(rig, pal.skin).sh;
  ctx.fillRect(R(-r * 0.5), R(r * 0.52), R(r * 1.4), 3);
}
/** Tarred queue: a 2-segment braid hanging off the back of the skull (drawn under the skull). */
function drawQueue(ctx, rig, r, hair) {
  const ch = getChain(rig, 'queue', 2, { joint: 'head', rest: [-1, 0.5], stiffness: 0.15, damping: 0.66, gain: 2, rotGain: 0.5, maxAng: 34 });
  const tie = (rig.build.crow || EMPTY).tie;
  ctx.save(); ctx.translate(R(-r * 0.8), R(-r * 0.2));
  for (let i = 0; i < 2; i++) {
    ctx.rotate(rad(ch.ang[i] + (i ? 12 : 26)));
    celPoly(ctx, rig, [-2, 0, 3, 0, 2, 10, -2, 10], hair, 0.4, 0.25);
    // rank ribbon knotted at the top of the braid (Skree on foot: her rank came off the machine and onto her)
    if (!i && tie) rankBand(ctx, rig, -3, 2, 7, rankH(rig, 3));
    ctx.translate(0, 10);
  }
  ctx.restore();
}
/**
 * Face (face hook): the eyes are the whole point of this pass — the Stormcrows are people, not masks. Pupils track
 * the target through `rig.look`; a wind-up floods the sockets with static (see crowTell, drawn over the headgear).
 */
export function crowFace(ctx, rig, pose, inf) {
  const r = inf.r, k = rig.build.crow || EMPTY;
  const sk = sealedOf(rig);
  if (sk) { crowVisorMask(ctx, rig, r, pose, sk); return; }
  drawFace(ctx, rig, r, pose.face | 0, k.faceOpts || null);
  if (rig.override) return;
  const look = rig.look;
  if (!look || (pose.face | 0) === FACE.dazed || (pose.face | 0) === FACE.closed) return;
  // 1px pupil nudge toward the target (kept inside the whites drawn above)
  const ey = R(-r * 0.15) + (k.faceOpts && k.faceOpts.eyeY || 0), dx = look.x > 0.35 ? 1 : look.x < -0.35 ? -1 : 0;
  if (!dx) return;
  ctx.fillStyle = rig.col('#1a1418');
  ctx.fillRect(R(r * 0.45) + 1 + dx, ey, 2, 2); ctx.fillRect(R(-r * 0.12) - 1 + dx, ey, 2, 2);
}
/**
 * SEALED HELM, shell half (head hook). Everything that must sit BEHIND the mask lives here, because art/rig.js draws
 * head -> hair -> face -> beard -> hat: the crest and the fin would land ON the mask plate if they were hat marks.
 * Value ladder on this head, top to bottom, and it may not be re-spaced: lens / specular > pewter dome > gun beak >
 * taupe mask plate > copper can. Anything a HAT adds above the hairline has to be entered into that ladder too: a
 * rank band dropped into a brass fitting made a third mark brighter than the lens and the sealed read collapsed.
 */
export function crowHelmShell(ctx, rig, r, k) {
  // a. crest / fin FIRST, behind the dome. The body of the fin is dark and the RANK rides its LEADING EDGE - a
  // whole crest in signal gold turns the top of the head into one bright slab and eats the helm underneath it.
  if (k.cowl === 'storm') {
    // Galewright: a swept storm cowl off the back of the helm. No rank on it - it points backwards, and
    // ART_STYLE section 0.6 keeps her rank in front where the player reads it (her mark is the brow band).
    celPoly(ctx, rig, [r * 0.3, -r * 1.1, -r * 0.7, -r * 2.05, -r * 1.85, -r * 1.6, -r * 2.05, -r * 0.1, -r * 1.25, r * 1.2, -r * 0.2, r * 1.0], CROW.coatDark, 0.4, 0.26);
  } else if (k.cowl === 'iron') {
    // Ironwing Marine: A's own crest, then a nape / cheek plate hanging behind the jaw
    celPoly(ctx, rig, [-r * 1.15, -r * 0.95, -r * 0.85, -r * 2.2, r * 0.1, -r * 2.5, r * 0.9, -r * 1.7, r * 0.7, -r * 1.0], CROW.pewterDark, 0.4, 0.3);
    celPoly(ctx, rig, [r * 0.1, -r * 2.5, r * 0.9, -r * 1.7, r * 0.7, -r * 1.0, r * 0.35, -r * 1.05, r * 0.5, -r * 1.72, -r * 0.15, -r * 2.3], crowRank(rig), 0.4, 0.3);
    celPoly(ctx, rig, [r * 0.2, -r * 1.2, -r * 1.35, -r * 1.0, -r * 1.65, r * 0.35, -r * 1.1, r * 1.25, r * 0.1, r * 1.0], CROW.pewterDark, 0.36, 0.3);
  }
  // b. the dome, in A's pewter so the two elites stay LIGHT against the board-2 grating like the rest of the cast
  celPoly(ctx, rig, [-r * 1.06, r * 0.4, -r * 1.02, -r * 0.55, -r * 0.55, -r * 1.1, r * 0.35, -r * 1.12, r * 1.02, -r * 0.4, r * 1.06, r * 0.35, r * 0.45, r * 1.0, -r * 0.6, r * 1.0], CROW.pewter, 0.34, 0.34);
  // c. gorget, drawn in HEAD space (registering a neck part would seal all five and both bosses): it covers exactly
  // the strip of warm throat the other three show, and the head draws after the torso so it laps the coat collar.
  celCapsule(ctx, rig, R(-r * 0.5), R(r * 1.0), R(r * 0.35), R(r * 1.0), 3.2, CROW.mask, 0.25);
  if (rig.override) return;
  // NO rim light here: the hat hook owns everything above the hairline, and a shell rim crossing hatHelm's rim
  // stacked two near-white strokes on one dome (section 0.4 / 3) and out-blazed the sighting lens.
  ctx.fillStyle = tones(rig, CROW.pewter).deep; ctx.fillRect(R(-r * 0.9), R(-r * 0.6), R(r * 1.8), 2);
}
/**
 * SEALED HELM, face half (face hook). A welded head cannot emote, so `pose.face` is rerouted into the LENS - the
 * colour is the mood and a pewterDark shutter dropped over the top of the glass is the eyelid. No animation data
 * changes: makeCrowBase and every crowStrike key already carry `face:` on every frame and this only re-reads them.
 * Row geometry is keyed to drawFace's own eye rows, so the sealed pair's eye height and eye spacing match the three
 * bare faces exactly - that, the brass socket, the copper filter can and the shared crowTell are what keep these two
 * in the same species as the men who still have chins.
 */
export function crowVisorMask(ctx, rig, r, pose, k) {
  const face = pose.face | 0;
  const cx = R(r * 0.45) + 1, cy = R(-r * 0.15);          // drawFace's near-eye row
  const fx = R(-r * 0.12);                                // drawFace's far-eye column
  const coil = rig.coil || 0;
  // the lens grows and lights with rig.coil; the SILHOUETTE half of the Galewright's 36f gale charge (12 damage +
  // 30 frames stunned) is hatVisor's storm ridge rearing up, because a lens that gains two rows is not a lane-wide
  // wind-up. Between them they may never get quieter than A's standing-on-end hair was.
  const lr = Math.max(3, R(r * 0.42 * (k.lens || 1)) + R(coil * 2));
  const jolt = face === FACE.hurt ? 1 : 0;                // the helm knocked askew on its straps
  ctx.save(); ctx.translate(jolt, jolt);
  // a. beak: a long keel on the Galewright, a short grilled muzzle on the Marine - with the inverted lens sizes,
  // this is what stops two pewter heads reading as the same man. BOTH are CROW.gun, which is the only value far
  // enough off the warm mask plate behind them (25.0 vs 11.9) to survive section 0.1: the SHAPE differentiates
  // them, not the colour - pewterDark on the muzzle was 8.9% off the plate it sits on.
  if (k.beak === 'keel') celPoly(ctx, rig, [r * 0.05, -r * 0.22, r * 2.05, r * 0.06, r * 2.1, r * 0.4, r * 1.3, r * 0.7, r * 0.05, r * 0.84], CROW.gun, 0.34, 0.34);
  else celPoly(ctx, rig, [r * 0.05, -r * 0.24, r * 1.5, -r * 0.02, r * 1.6, r * 0.72, r * 0.05, r * 0.92], CROW.gun, 0.34, 0.3);
  // b. mask plate across the eye row (the value step that keeps pewter off gun)
  celPoly(ctx, rig, [-r * 1.02, -r * 0.66, r * 1.0, -r * 0.74, r * 1.14, -r * 0.04, -r * 1.0, r * 0.06], CROW.mask, 0.4, 0.3);
  // d. socket in BRASS, not pewter: the sealed lens is one of the faction's own goggles bolted shut (crowGoggles' rim)
  celBall(ctx, rig, cx, cy, lr + 1.8, CROW.brass, false);
  // g. copper filter can under the jaw - the one warm mark on a metal head, exactly where the bare three have a chin
  celBall(ctx, rig, R(r * 0.05), R(r * 0.92), 3.2, CROW.copper, false);
  // e. the lens itself
  const down = !!rig.down, tell = !!rig.tell && !down;
  const warn = tell && rig.tellWarn && (rig.tick & 2) !== 0;
  const flick = (rig.tick >> 2) & 1;
  const glass = down ? CROW.glassDead                                  // dead: flat grey, and it stays there
    : warn ? '#FFFFFF'                                                 // pure white ONLY here (crowTell's warn colour)
    : tell ? (coil > 0.05 && coil < 0.6 ? CROW.sparkPale : CROW.glassHot)  // charge ramps violet -> A's warm hot
    : face === FACE.dazed ? (flick ? CROW.glassDim : CROW.glassDead)   // stagger: the lights stuttering, not out
    : face === FACE.hurt ? CROW.glassDim
    : CROW.glass;
  // shutter = px of iris plate dropped over the TOP of the lens; the mask's version of drawFace's pressed-down lids
  const shut = down ? lr                                               // half-lidded on the deck
    : face === FACE.closed ? lr * 2                                    // winks out (the dodge frames)
    : (face === FACE.angry || face === FACE.shout || face === FACE.grit) ? 2   // hooded = a glare
    : face === FACE.dazed ? 1 : 0;
  const look = rig.look, dx = look && Math.abs(look.x) > 0.35 ? Math.sign(look.x) : 0;  // crowFace's pupil nudge
  ctx.beginPath(); ctx.arc(cx + dx, cy, lr, 0, TAU); ctx.fillStyle = rig.col(glass); ctx.fill();
  if (rig.override) { ctx.restore(); return; }
  // c. far eye = a dead slot (drawFace's far column, so the spacing matches the bare heads)
  ctx.fillStyle = rig.col(CROW.outline); ctx.fillRect(fx - 1, cy - 1, 3, 2);
  if (shut > 0) { ctx.fillStyle = rig.col(CROW.pewterDark); ctx.fillRect(cx + dx - lr + 1, cy - lr, lr * 2 - 2, Math.min(shut, lr * 2)); }
  // the same 2x2 white pixel crowGoggles puts on every other head in the faction
  if (!down && shut < lr) { ctx.fillStyle = rig.col('#FFFFFF'); ctx.fillRect(cx + dx - R(lr * 0.75), cy - R(lr * 0.8), 3, 2); }
  // f. one detail mark per beak, and one only (section 0.7)
  // the grille lives on the BEAK, clear of the brass socket's lower edge (r*0.46 vs the socket bottom at ~0.42r):
  // punched through the socket it read as black chips bitten out of the head's one focal ring.
  if (k.beak === 'iron') { ctx.fillStyle = rig.col(CROW.outline); for (let i = 0; i < 3; i++) ctx.fillRect(R(r * 0.8) + i * 3, R(r * 0.46), 2, 3); }
  else { ctx.fillStyle = tones(rig, CROW.gun).deep; ctx.fillRect(R(r * 0.6), R(r * 0.24), R(r * 0.9), 2); }
  // damage sputter: deliberately the opposite SHAPE from crowTell, which is 3 arcs radiating off this same centre.
  // Two radial arcs here differed from a wind-up by one arc and a halo, so a hurt Marine read as one about to
  // shove; a 1px bar stuttering across the glass is a flicker, not a discharge.
  if (!down && (face === FACE.hurt || face === FACE.dazed)) {
    ctx.fillStyle = rig.col(CROW.sparkPale);
    ctx.fillRect(cx + dx - lr + 1, cy + ((rig.tick >> 1) & 1 ? -1 : 1), lr * 2 - 2, 1);
  }
  // h. the shared faction light, on the lens centre - the same call the other three heads make
  crowTell(ctx, rig, r, cx, cy);
  ctx.restore();
}
/**
 * The faction tell, drawn by every headgear as its last mark: while `rig.tell` runs, static crawls off the goggle
 * glass in violet arcs (hot white and blinking once `rig.tellWarn` says the hit is about to land). One unmistakable
 * light per head, whatever the head is wearing.
 */
export function crowTell(ctx, rig, r, gx, gy) {
  if (rig.override || !rig.tell) return;
  const warn = rig.tellWarn && (rig.tick & 2) !== 0;
  ctx.fillStyle = warn ? 'rgba(255,255,255,0.4)' : 'rgba(155,123,255,0.3)';
  ctx.beginPath(); ctx.arc(gx, gy, r * 0.85, 0, TAU); ctx.fill();
  ctx.strokeStyle = rig.col(warn ? '#FFFFFF' : CROW.sparkPale); ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = rig.tick * 0.5 + i * 2.1;
    ctx.beginPath(); ctx.moveTo(gx, gy);
    ctx.lineTo(gx + Math.cos(a) * (r * 0.9), gy + Math.sin(a) * (r * 0.9));
    ctx.stroke();
  }
}
/** Goggle pair on a strap (head space, `cy` above the brow line): two brass rims with sky-glass, the shared kit mark. */
export function crowGoggles(ctx, rig, r, cy, glass) {
  if (!rig.override) { ctx.fillStyle = rig.col(CROW.leatherDark); ctx.fillRect(R(-r * 1.1), cy - 2, R(r * 2.2), 4); }
  const g = glass || CROW.glass;
  for (let i = 0; i < 2; i++) {
    const cx = i ? R(r * 0.55) : R(-r * 0.35);
    celBall(ctx, rig, cx, cy, 4.6, CROW.brass, false);
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, TAU); ctx.fillStyle = rig.col(rig.tell ? CROW.glassHot : g); ctx.fill();
    if (!rig.override) { ctx.fillStyle = rig.col('#FFFFFF'); ctx.fillRect(cx - 2, cy - 2, 2, 1); }
  }
}
/** Grey privateer beard: ONE chain-sheared polygon in two segments, a value step off both skin and smock. */
export function crowBeard(ctx, rig, pose, inf) {
  const k = rig.build.crow || EMPTY;
  if (!k.beard) return;
  const r = inf.r, col = k.beard === true ? CROW.beard : k.beard;
  const ch = getChain(rig, 'beard', 2, { joint: 'head', rest: [0, 1], stiffness: 0.16, damping: 0.66, gain: 1.5, rotGain: 0.4, maxAng: 26 });
  ctx.save(); ctx.translate(R(r * 0.1), R(r * 0.5));
  for (let i = 0; i < 2; i++) {
    ctx.rotate(rad(ch.ang[i] + (i ? 5 : 0)));
    // jaw first (a wedge that follows the cheek down to the chin), then the hanging tip
    if (i) celPoly(ctx, rig, [-3, 0, 6, -2, 5, 8, -1, 9], col, 0.4, 0.3);
    else celPoly(ctx, rig, [-6, -2, 2, -4, 9, 0, 8, 6, -4, 7], col, 0.4, 0.3);
    ctx.translate(0, 6);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- torso / hips / limbs
/**
 * Body garment (torso hook). `build.crow.coat` picks the cut, and the cut is most of the silhouette:
 * 'jerkin' short cut-down leather bolero over a shirt | 'oilskin' long coat with a shoulder capelet |
 * 'smock' barrel-chested powder smock with a canvas apron | 'duster' narrow closed duster with a rubber gorget |
 * 'plate' riveted breastplate. Everyone wears the brass Wing badge; the RANK bands are per-cut (`crow.collar` on the
 * smock, the duster's gorget, the cuirass band + `crow.epaulette` on the plate) and all read `crowRank()`.
 */
export function crowCoat(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2), pal = inf.pal, k = rig.build.crow || EMPTY, cut = k.coat || 'oilskin';
  const t = tones(rig, pal.primary);
  if (cut === 'jerkin') {
    // shirt first (the whole trunk), then a short leather bolero that stops well above the belt
    celPoly(ctx, rig, [-hw + 1, -H + 3, hw - 1, -H + 3, hw + 2, 2, -hw - 2, 2], CROW.canvas, 0.36, 0.3);
    celPoly(ctx, rig, [-hw - 2, -H + 5, -hw + 2, -H - 1, hw - 2, -H - 1, hw + 2, -H + 5, hw + 1, R(-H * 0.34), R(W * 0.16), R(-H * 0.26), R(-W * 0.14), R(-H * 0.4), -hw - 1, R(-H * 0.3)], pal.primary, 0.36, 0.28);
    if (rig.override) return;
    ctx.fillStyle = rig.col(CROW.canvasSh); ctx.fillRect(-hw + 2, R(-H * 0.2), W - 4, 3);
  } else if (cut === 'smock') {
    celPoly(ctx, rig, [-hw - 3, -H + 6, -hw + 2, -H - 1, hw - 2, -H - 1, hw + 3, -H + 6, hw + 4, 2, -hw - 4, 2], pal.primary, 0.36, 0.28);
    // canvas powder apron: light, narrow, hung from a neck cord
    celPoly(ctx, rig, [R(-W * 0.22), R(-H * 0.6), R(W * 0.24), R(-H * 0.64), R(W * 0.3), 2, R(-W * 0.3), 2], CROW.canvasSh, 0.36, 0.24);
    if (rig.override) return;
    // the apron's neck cord IS the Powder Bosun's rank collar: a wide cloth field, since an ember band on his
    // bare warm forearms would fail section 0.1 (his `sleeve` is skin)
    if (k.collar) rankBand(ctx, rig, R(-W * 0.3), R(-H * 0.62), R(W * 0.6), rankH(rig, 5));
    else { ctx.fillStyle = rig.col(CROW.leatherDark); ctx.fillRect(R(-W * 0.24), R(-H * 0.64), R(W * 0.5), 3); }
    ctx.fillStyle = tones(rig, CROW.canvasSh).deep; ctx.fillRect(R(-W * 0.2), R(-H * 0.26), R(W * 0.44), 2);
  } else if (cut === 'duster') {
    celPoly(ctx, rig, [-hw - 1, -H + 4, -hw + 2, -H - 2, hw - 2, -H - 2, hw + 1, -H + 4, hw + 2, 2, -hw - 2, 2], pal.primary, 0.36, 0.28);
    // insulated rubber gorget standing up round the throat + a row of storm buttons
    celRect(ctx, rig, -hw + 1, -H - 5, W - 2, 7, 2, CROW.pewterDark, 0.36, 0.3);
    if (rig.override) return;
    // the Galewright's rank rides the gorget, the cuffs and the trouser lace - front and low, never near the rods
    if (k.gorget) rankBand(ctx, rig, -hw + 2, -H - 5, W - 4, rankH(rig, 6));
    ctx.fillStyle = rig.col(CROW.brass);
    for (let i = 0; i < 3; i++) ctx.fillRect(R(W * 0.06), -H + 6 + i * 7, 3, 3);
  } else if (cut === 'plate') {
    celPoly(ctx, rig, [-hw - 2, -H + 4, -hw + 2, -H - 1, hw - 2, -H - 1, hw + 2, -H + 4, hw + 3, 2, -hw - 3, 2], pal.primary, 0.36, 0.28);
    // riveted breastplate over the chest, two bands
    celPoly(ctx, rig, [R(-W * 0.42), -H + 2, R(W * 0.42), -H + 2, R(W * 0.46), R(-H * 0.3), 0, R(-H * 0.12), R(-W * 0.46), R(-H * 0.3)], CROW.pewterDark, 0.34, 0.34);
    if (rig.override) return;
    rankBand(ctx, rig, R(-W * 0.4), R(-H * 0.52), R(W * 0.8), rankH(rig, 5));
    rimTop(ctx, rig, R(-W * 0.4), -H + 3, R(W * 0.4), -H + 3, CROW.pewter);
  } else {
    // oilskin: long storm coat with a lapel V and a short shoulder capelet over it
    celPoly(ctx, rig, [-hw - 2, -H + 4, -hw + 1, -H - 1, hw - 1, -H - 1, hw + 2, -H + 4, hw + 3, 2, -hw - 3, 2], pal.primary, 0.36, 0.28);
    celPoly(ctx, rig, [-hw - 3, -H + 2, -hw + 2, -H - 2, hw - 2, -H - 2, hw + 3, -H + 2, hw + 2, R(-H * 0.52), -hw - 2, R(-H * 0.52)], CROW.coatDark, 0.4, 0.22);
    if (rig.override) return;
    // the lapel V is a bare fill introducing a new internal boundary: flat() strokes the outline under it (§0.2).
    ctx.beginPath(); ctx.moveTo(R(-W * 0.2), -H + 1); ctx.lineTo(R(W * 0.2), -H + 1); ctx.lineTo(0, R(-H * 0.5)); ctx.closePath();
    flat(ctx, rig, CROW.canvas);
  }
  crowChest(ctx, rig, W, H, t);
}
/**
 * The one mark that says "Ninth Wing" on every cut and both bosses: the brass wing badge, in the SAME chest position
 * on all seven. It is grown to 7x4 here because the old 1.4-2.5px chest chevron is gone - that zigzag sat under
 * section 0.7's band floor on every variant and was the reason the rank read went soft; rank is now carried by the
 * big per-variant bands instead, and the badge is what is left holding the faction together.
 */
function crowChest(ctx, rig, W, H, t) {
  if (rig.override) return;
  const hw = R(W / 2);
  ctx.fillStyle = rig.col(CROW.brass); ctx.fillRect(R(W * 0.2), R(-H * 0.78), 7, 4);
  ctx.fillStyle = tones(rig, CROW.brass).deep; ctx.fillRect(R(W * 0.2), R(-H * 0.74), 7, 2);
  ctx.fillStyle = t.deep; ctx.fillRect(-hw + 1, R(-H * 0.14), W - 2, 1);
}
/** Trousers + a broad leather belt with a brass buckle, one hip pouch, and the rank waist sash (hips hook). */
export function crowHips(ctx, rig, pose, inf) {
  const hip = inf.w, hw = R(hip / 2), pal = inf.pal, k = rig.build.crow || EMPTY;
  drawBelt(ctx, rig, hip, pal.secondary, CROW.leatherDark, pal.accent);
  if (rig.override) return;
  // rank sash wound above the belt: on the widest hips in the faction this is the biggest single rank field on the
  // deck. fillRect, not celRect, so it never leaks into the smear or hit-flash pass.
  if (k.sash) { const sh = rankH(rig, 5); rankBand(ctx, rig, -hw, -5 - sh, hip, sh); }
  // hip pouch: leather on duck trousers, INKED (§0.2). Its 7x2 shadow strip went with the line that replaced it -
  // a 2px mark under the noise floor whose only job was to fake the edge the outline now draws properly.
  band(ctx, rig, -hw - 2, -3, 7, 8, CROW.leather);
}
/**
 * Sleeve with the WING ARMBAND above the elbow (armUpper hook). It used to be one shared wine for the whole faction;
 * it is now the variant's rank colour, which is the biggest single lever in the rank read - so `inf.pal.rank`, never
 * a module constant, or the far arm's band would glow as bright as the near one (section 0.3).
 */
export function crowArmUpper(ctx, rig, pose, inf) {
  const r = inf.r, len = inf.len, sleeve = inf.pal.sleeve || inf.pal.primary;
  celTaper(ctx, rig, 0, 0, 0, len, r * 1.12, r * 0.95, sleeve, 0.3);
  // `crow.bareArm`: the Powder Bosun's sleeve IS his skin, and a warm band on warm tan fails section 0.1 - his
  // rank rides cloth only (sash, brow band, smock collar).
  if (rig.override || (rig.build.crow || EMPTY).bareArm) return;
  const rank = inf.pal.rank || CROW.wine, h = rankH(rig, 4), y = R(len * 0.5);
  // INKED (section 0.2): the armband is cloth on canvas, and it is the one rank carrier every rate above the
  // Crimper shares - it has to survive against the sleeve behind it, not blend into it.
  band(ctx, rig, -r, y, r * 2, h, rank);
  ctx.fillStyle = tones(rig, rank).sh; ctx.fillRect(R(-r), y + h - 1, R(r * 2), 1);
  ctx.fillStyle = rig.col(inf.far ? farTone(CROW.brass) : CROW.brass); ctx.fillRect(-1, y + 1, 3, 3);
}
/** Bare forearm rolled out of the sleeve, with the sleeve turned back into a 3px cuff (armLower hook). */
export function crowArmLower(ctx, rig, pose, inf) {
  const r = inf.r, len = inf.len, pal = inf.pal;
  celCapsule(ctx, rig, 0, 0, 0, len, r, pal.skin, 0.3);
  if (rig.override) return;
  // petty officer and up turn the cuff out in the rank colour; ratings keep a plain sleeve cuff
  const h = rankH(rig, 4);
  const col = (rig.build.crow || EMPTY).cuff ? (pal.rank || CROW.wine) : (pal.sleeve || pal.primary);
  // INKED: cloth turned back over a bare forearm is the sharpest material change on the arm, and this one line is
  // shared by all five rates AND by Skree and Kestrel through CROW_PARTS - it was the single largest unoutlined
  // fill on the faction (8-9 px x 13 px, on every keyframe, on both arms).
  band(ctx, rig, R(-r) - 1, 0, r * 2 + 2, h, col);
  ctx.fillStyle = tones(rig, col).sh; ctx.fillRect(R(-r) - 1, h - 1, R(r * 2) + 2, 1);
}
/** Fingerless flight glove: bare knuckles with a leather strap across the back of the hand (hand hook). */
export function crowHand(ctx, rig, pose, inf) {
  drawFist(ctx, rig, inf.r, inf.pal.skin);
  if (rig.override) return;
  ctx.fillStyle = rig.col(inf.far ? LEATHER_F : CROW.leather);
  ctx.fillRect(R(-inf.r * 0.5), R(-inf.r * 0.9), R(inf.r * 1.1), 3);
}
/**
 * Officer lace: a stripe of rank down the outer trouser seam, on `crow.lace` rigs only. `inf.pal.rank` so the far leg
 * darkens for free through farPalette (this is why the rank colour is a palette key and not a module constant).
 */
function crowLace(ctx, rig, inf, y0, len) {
  // NEAR LEG ONLY. On the far leg the stripe is farPalette's 38%-darker copy of the rank colour laid on the
  // 38%-darker copy of the trousers: two dark values against each other, which reads as nothing and costs two cel
  // shapes and two ink strokes a keyframe on the two rigs that already carry the most rank in the faction.
  if (rig.override || inf.far || !(rig.build.crow || EMPTY).lace) return;
  // the trouser lace runs the whole length of the leg, so its footprint is large however narrow the stripe is:
  // it takes the line (§0.2), and it is widened to 4 px so there is something for the line to bound.
  band(ctx, rig, R(-inf.r * 0.95), y0, rankH(rig, 4), len, inf.pal.rank || CROW.wine);
}
/** Thigh: tapered so it swells at the hip and narrows into the knee (legUpper hook). */
export function crowLegUpper(ctx, rig, pose, inf) {
  celTaper(ctx, rig, 0, 0, 0, inf.len, inf.r * 1.1, inf.r * 0.96, inf.pal.secondary, 0.3);
  crowLace(ctx, rig, inf, 2, inf.len - 3);
}
/** Shin with a strapped leather knee patch at the top so the leg reads as two bones, not one tube (legLower hook). */
export function crowLegLower(ctx, rig, pose, inf) {
  const r = inf.r, len = inf.len, pal = inf.pal;
  celCapsule(ctx, rig, 0, 0, 0, len, r, pal.secondary, 0.3);
  if (rig.override) return;
  // knee patch: leather over duck trousers, INKED. The 1px strap highlight that used to sit under it is gone -
  // it was below the 2px detail floor and the outline says the same thing at full strength.
  band(ctx, rig, R(-r) - 1, -1, r * 2 + 2, 4, inf.far ? LEATHER_F : CROW.leather);
  crowLace(ctx, rig, inf, 6, len - 7);
}
/** Flight boot: dark plum leather with a turned-down canvas cuff and a pewter toe cap (foot hook, ankle space). */
export function crowBoot(ctx, rig, pose, inf) {
  const w = inf.w, h = inf.h, pal = inf.pal, heel = R(w * 0.4), toe = R(w * 0.66);
  celPoly(ctx, rig, [-heel, -h - 3, toe - 5, -h - 3, toe, -h + 2, toe, 2, -heel, 2], pal.dark, 0.36, 0.26);
  if (rig.override) return;
  const t = tones(rig, pal.dark);
  // the turned-down canvas cuff is widened from 3 to 4 px (section 0.7's band floor); at that width it and the
  // 6x4 toe cap are both under what an outline can bound, so they stay tone-separated marks rather than inked ones.
  ctx.fillStyle = rig.col(inf.far ? ROPE_F : CROW.rope); ctx.fillRect(R(-heel), R(-h) - 3, R(toe + heel) - 4, 4);
  ctx.fillStyle = rig.col(inf.far ? PEWTER_F : CROW.pewter); ctx.fillRect(R(toe) - 6, R(-h) + 2, 6, 4);
  ctx.fillStyle = t.deep; ctx.fillRect(R(-heel), 1, R(toe + heel), 2);
}

// ---------------------------------------------------------------- shared kit: scarf, coat tails
/** Neck scarf on a 3-link chain — the signature streamer of the freebooter silhouette (torso accessory). */
export function crowScarf(ctx, rig) {
  const p = rig.p, k = rig.build.crow || EMPTY, col = k.scarf || CROW.wine, n = k.scarfLen || 3;
  const ch = getChain(rig, 'scarf', n, { joint: 'torso', rest: [-1, 0.2], stiffness: 0.14, damping: 0.66, gain: 2.4, rotGain: 0.6, maxAng: 44 });
  const y = -p.torsoH + 1;
  celRect(ctx, rig, R(-p.torsoW * 0.32), y - 3, R(p.torsoW * 0.64), 5, 2, col, 0.4, 0.25);
  // the loose end streams back and down over the shoulder (never across the chest: ART_STYLE section 0.6)
  ctx.save(); ctx.translate(R(-p.torsoW * 0.28), y + 1);
  for (let i = 0; i < n; i++) {
    ctx.rotate(rad(ch.ang[i] + (i ? 8 : 46)));
    celPoly(ctx, rig, [-2, 0, 3, 0, 2, 8, -3, 7], col, 0.42, 0);
    ctx.translate(0, 7);
  }
  ctx.restore();
}
/** Coat tails: two swept panels on a 2-link chain so they lag behind the run (back accessory, torso space). */
export function crowTails(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), k = rig.build.crow || EMPTY, len = k.tailLen || 22;
  const ch = getChain(rig, 'tails', 2, { joint: 'torso', rest: [0, 1], stiffness: 0.15, damping: 0.68, gain: 2.2, rotGain: 0.5, maxAng: 42 });
  for (let i = 0; i < 2; i++) {
    ctx.save(); ctx.translate(i ? -hw + 3 : hw - 5, -2); ctx.rotate(rad(ch.ang[0] * (i ? 1.15 : 0.85)));
    celPoly(ctx, rig, [-4, 0, 5, 0, 4, len - 4, -1, len, -6, len - 4], i ? CROW.coatDark : rig.palette.primary, 0.4, 0.2);
    ctx.restore();
  }
}
/**
 * Folded wing-pack (back accessory, torso space): a copper spine canister and two RIBBED vanes with visible feather
 * spars, splayed even when stowed so the shape reads as a wing rather than a grey lozenge. The vanes snap open (and
 * spark violet) while `rig.wings` is set by a hook — the faction's "I am about to move" read.
 */
export function crowWings(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), open = rig.wings ? 1 : 0;
  const x = -hw - 2, y = -R(p.torsoH * 0.74);
  for (let i = 0; i < 2; i++) {
    const a = -26 - i * 34 - open * 30;
    ctx.save(); ctx.translate(x + 1, y + i * 6); ctx.rotate(rad(a));
    const L = 24 + open * 9;
    celPoly(ctx, rig, [0, -4, -L * 0.5, -8, -L, -5, -L - 5, 2, -L * 0.55, 5, 0, 5], i ? CROW.coatDark : CROW.pewterDark, 0.38, 0.24);
    if (!rig.override) {
      const t = tones(rig, i ? CROW.coatDark : CROW.pewterDark);
      ctx.fillStyle = t.hi;
      for (let s = 0; s < 3; s++) ctx.fillRect(R(-6 - s * (L / 3)), -4 + s, 2, 8 - s * 2);
      ctx.fillStyle = rig.col(CROW.canvasSh); ctx.fillRect(R(-L + 3), -3, R(L * 0.6), 3);
    }
    ctx.restore();
  }
  celCapsule(ctx, rig, x, y - 4, x, y + 12, 4, CROW.copper, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(open ? CROW.sparkPale : CROW.spark);
  ctx.fillRect(x - 2, y + 3, 3, 4);
}

// ---------------------------------------------------------------- shared animation set
/** Body face-up on the deck (root rot -88: the coat spreads, the goggles point at the sky). */
const FLOOR = { armR: [-22, -6], weapon: -14, armL: [28, 18], torso: 3, head: -12, legR: [12, 10], legL: [-4, 8], root: [26, -8, -88], grip: 0, face: 'dazed' };
/** Arm shorthand: nudge an [upper, lower] pair. */
export const AD = (a, du, dl) => [a[0] + du, a[1] + dl];

/**
 * Shared Stormcrow base animation set, parameterised by the rest carry `c` ({ armR, armL, weapon, grip? }) and the
 * variant's STANCE (`o.lean` torso angle, `o.legR` / `o.legL` planted legs, `o.head`) — the stance is half of what
 * makes five aeronauts read as five people rather than one uniform. Sea-legs gait: the torso counter-rotates on
 * every step, the free arm swings wide and the scarf / coat tails (secondary chains) do the rest.
 * Covers idle 4 / walk 8 / run 8 / jump / fall / land / hurt 3 / stagger 4 / hurtAir / knockdown / lying 2 /
 * getup 3 / dead 2 / dodge 5 (the wing-pack back-hop). `o.holdOffArm` keeps a strapped shield still while moving.
 */
export function makeCrowBase(c, o = {}) {
  const hold = !!o.holdOffArm, st = o.stagger || EMPTY;
  const lean = o.lean != null ? o.lean : 3, hd = o.head != null ? o.head : -2;
  const LR = o.legR || [8, 4], LL = o.legL || [-8, 6];
  const K = (s) => ({ torso: lean, head: hd, legR: LR, legL: LL, ...c, ...s });
  const walk = (lr, ll, al, ty, tw, sq, fr, fl) => K({ legR: lr, legL: ll, armL: hold ? c.armL : al, armR: AD(c.armR, 4, -4), torso: lean + tw, head: hd - tw * 0.5, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, footR: fr || 0, footL: fl || 0 });
  const run = (lr, ll, al, ty, sq) => K({ legR: lr, legL: ll, armL: hold ? AD(c.armL, 18, -18) : al, armR: AD(c.armR, -14, -6), torso: lean + 19, head: hd - 10, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, face: 'grit' });
  return {
    // idle: weight shifting from boot to boot, the coat settling, a slow scan of the deck
    idle: { loop: true, frames: [
      FK(16, K({ root: [0, 0] }), { ease: 'inout' }),
      FK(14, K({ torso: lean + 2, head: [hd + 3, 1, 0], root: [0, 1], armR: AD(c.armR, 2, -2), armL: AD(c.armL, -3, -2), squash: 1.02, stretch: 0.98 }), { ease: 'inout' }),
      FK(16, K({ torso: lean - 1, head: [hd - 3, 0, 0], root: [0, 0], armR: AD(c.armR, 1, -1) }), { ease: 'inout' }),
      FK(14, K({ torso: lean, head: [hd + 5, -1, 0], root: [0, 1], armL: AD(c.armL, 3, 2) }), { ease: 'inout' }),
    ] },
    // walk: contact / down (squash) / pass / up, torso counter-rotating so the scarf and tails swing
    walk: { loop: true, frames: [
      FK(4, walk([30, 4], [-24, 18], [10, -6], 0, 3, 0, -8, 0), { ease: 'out' }),
      FK(4, walk([24, 14], [-16, 30], [2, -8], 2, 2, 1.03, 0, 0), { ease: 'out' }),
      FK(4, walk([6, 26], [0, 10], [-14, -12], 1, 0, 0, 0, 0), { ease: 'inout' }),
      FK(4, walk([-10, 14], [18, -2], [-30, -14], -1, -2, 0, 0, -6), { ease: 'in' }),
      FK(4, walk([-24, 18], [30, 4], [-42, -16], 0, -3, 0, 0, -8), { ease: 'out' }),
      FK(4, walk([-16, 30], [24, 14], [-36, -16], 2, -2, 1.03, 0, 0), { ease: 'out' }),
      FK(4, walk([0, 10], [6, 26], [-22, -14], 1, 0, 0, 0, 0), { ease: 'inout' }),
      FK(4, walk([18, -2], [-10, 14], [-8, -10], -1, 2, 0, -6, 0), { ease: 'in' }),
    ] },
    run: { loop: true, frames: [
      FK(3, run([56, 14], [-44, 58], [44, -46], -2), { ease: 'out' }),
      FK(3, run([44, 30], [-32, 72], [26, -44], 1, 1.05), { ease: 'out' }),
      FK(3, run([12, 42], [10, 30], [-8, -40], -4), { ease: 'inout' }),
      FK(3, run([-26, 52], [42, 8], [-42, -40], -3), { ease: 'in' }),
      FK(3, run([-44, 58], [56, 14], [-54, -44], -2), { ease: 'out' }),
      FK(3, run([-32, 72], [44, 30], [-38, -46], 1, 1.05), { ease: 'out' }),
      FK(3, run([10, 30], [12, 42], [2, -44], -4), { ease: 'inout' }),
      FK(3, run([42, 8], [-26, 52], [30, -46], -3), { ease: 'in' }),
    ] },
    jump: { loop: false, frames: [
      FK(3, K({ legR: [32, 42], legL: [-20, 46], torso: lean + 9, root: [0, 4], squash: 1.1, stretch: 0.9, armL: [-28, 30] }), { ease: 'out' }),
      FK(4, K({ legR: [30, -30], legL: [10, -20], torso: lean - 9, head: hd - 6, root: [0, -2], squash: 0.94, stretch: 1.08, armL: [-70, -30] }), { ease: 'out' }),
      FK(30, K({ legR: [42, -70], legL: [20, -52], torso: lean - 5, armL: [-52, -20], head: hd - 4 }), { ease: 'inout' }),
    ] },
    fall: { loop: true, frames: [
      FK(10, K({ legR: [26, -32], legL: [8, -20], armL: [-82, -30], torso: lean - 13, head: hd - 8, face: 'grit' }), { ease: 'inout' }),
      FK(10, K({ legR: [32, -42], legL: [4, -14], armL: [-96, -30], torso: lean - 17, head: hd - 10, face: 'grit' }), { ease: 'inout' }),
    ] },
    land: { loop: false, frames: [
      FK(3, K({ legR: [36, 48], legL: [-26, 50], torso: lean + 15, head: hd + 6, root: [0, 3], squash: 1.16, stretch: 0.86, armL: [-28, 30], face: 'grit' }), { ease: 'out' }),
      FK(5, K({ legR: [14, 16], legL: [-10, 18], torso: lean + 3, root: [0, 1], squash: 1.02, stretch: 0.98 }), { ease: 'out' }),
    ] },
    hurt: { loop: false, frames: [
      FK(4, K({ torso: lean - 27, head: hd - 20, armL: [-62, -30], armR: AD(c.armR, -22, -28), weapon: (c.weapon || 0) - 18, root: [-5, 1], legR: [22, 4], legL: [-14, 12], face: 'hurt' }), { ease: 'out' }),
      FK(10, K({ torso: lean - 11, head: hd - 10, armL: [-30, -10], armR: AD(c.armR, -8, -10), weapon: (c.weapon || 0) - 6, root: [-2, 1], legR: [14, 2], legL: [-10, 8], face: 'hurt' }), { ease: 'out' }),
      FK(6, K({ torso: lean - 1, face: 'angry' }), { ease: 'out' }),
    ] },
    // stagger: knocked off balance, arms out for trim, eyes rolling
    stagger: { loop: true, frames: [
      FK(5, K({ torso: -12, head: -12, root: [-3, 2], armR: [10, 16], armL: [-20, 14], legR: [18, 12], legL: [-14, 14], weapon: (c.weapon || 0) + 26, face: 'dazed', ...st }), { ease: 'out' }),
      FK(5, K({ torso: 8, head: 10, root: [3, 1], armR: [16, 10], armL: [-8, 16], legR: [14, 14], legL: [-10, 12], weapon: (c.weapon || 0) + 30, face: 'dazed', ...st }), { ease: 'out' }),
      FK(5, K({ torso: -8, head: -8, root: [-2, 2], armR: [12, 14], armL: [-22, 10], legR: [20, 10], legL: [-16, 16], weapon: (c.weapon || 0) + 24, face: 'dazed', ...st }), { ease: 'out' }),
      FK(5, K({ torso: 6, head: 6, root: [2, 1], armR: [14, 16], armL: [-10, 14], legR: [14, 12], legL: [-10, 12], weapon: (c.weapon || 0) + 28, face: 'dazed', ...st }), { ease: 'out' }),
    ] },
    hurtAir: { loop: true, frames: [
      FK(6, { armR: [-90, -40], weapon: 40, armL: [-100, -30], torso: -30, head: -25, legR: [40, 40], legL: [10, 60], root: [0, 0, -15], face: 'hurt' }, { ease: 'inout' }),
      FK(6, { armR: [-100, -50], weapon: 50, armL: [-110, -30], torso: -35, head: -30, legR: [50, 30], legL: [20, 50], root: [0, 0, -25], face: 'hurt' }, { ease: 'inout' }),
    ] },
    knockdown: { loop: true, frames: [
      FK(8, { armR: [-60, -40], weapon: 40, armL: [-80, -30], torso: -50, head: -20, legR: [50, 30], legL: [30, 50], root: [0, -6, -25], face: 'hurt' }, { ease: 'inout' }),
      FK(8, { armR: [-70, -50], weapon: 50, armL: [-90, -30], torso: -55, head: -25, legR: [60, 20], legL: [40, 40], root: [0, -6, -35], face: 'hurt' }, { ease: 'inout' }),
    ] },
    lying: { loop: true, frames: [
      FK(16, { ...FLOOR, face: 'hurt' }, { ease: 'inout' }),
      FK(16, { ...FLOOR, torso: 8, head: -14, legR: [16, 12], face: 'hurt' }, { ease: 'inout' }),
    ] },
    getup: { loop: false, frames: [
      FK(8, { ...FLOOR, face: 'hurt' }, { ease: 'in' }),
      FK(8, { armR: [58, 40], weapon: 26, armL: [-30, 40], torso: 32, head: -10, legR: [70, 60], legL: [-20, 60], root: [8, 4, -20], face: 'grit', squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
      FK(6, K({ torso: lean + 5, root: [0, 1], legR: [15, 20], legL: [-10, 15], face: 'angry' }), { ease: 'out' }),
    ] },
    dead: { loop: false, frames: [
      FK(8, { ...FLOOR, legR: [40, -26], legL: [30, -18], armR: [-40, -20], armL: [48, 10], torso: -4, root: [26, -12, -92], squash: 1.05, stretch: 0.95 }, { ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0, count: 6 }] }),
      FK(60, { ...FLOOR, torso: 8, head: -16, legR: [10, 2], legL: [-8, 6], armR: [-28, -10], armL: [38, 22], root: [26, -8, -92] }),
    ] },
    // dodge: a wing-pack / kick-off back-hop (the vanes flare: hooks set rig.wings from the anim name)
    dodge: { loop: false, frames: [
      FK(4, K({ torso: lean + 11, root: [0, 3], legR: [36, 42], legL: [-20, 42], armL: [-30, 30], face: 'grit', squash: 1.08, stretch: 0.92 }), { sfx: 'dodge', ease: 'in' }),
      FK(6, K({ torso: lean - 9, head: hd - 8, root: [0, -20], legR: [40, -60], legL: [30, -50], armR: AD(c.armR, -28, -18), armL: [-64, -40], face: 'closed', squash: 0.94, stretch: 1.06 }), { ease: 'out', fx: [{ kind: 'spark', x: -14, y: 40, count: 2 }] }),
      FK(5, K({ torso: lean - 3, head: hd - 6, root: [0, -10], legR: [30, -30], legL: [20, -20], armR: AD(c.armR, -14, -10), armL: [-42, -30], face: 'closed' }), { ease: 'in' }),
      FK(4, K({ torso: lean + 9, root: [0, 3], legR: [30, 38], legL: [-18, 38], armL: [-20, 20], face: 'grit', squash: 1.1, stretch: 0.9 }), { ease: 'out' }),
      FK(4, K({ torso: lean, root: [0, 1] }), { ease: 'out' }),
    ] },
  };
}

/**
 * Hand-keyed telegraphed attack (docs/ART_STYLE.md section 8): anticipation -> deeper anticipation -> smeared hit key
 * -> hit hold -> punishable follow-through -> return, with an `ease` on every key. It replaces the parametric
 * `enemyAttack()` builder while keeping its FROZEN budget exactly: the two `tell: true` frames still sum to
 * `o.tell`, the hitbox still lives on a single `o.active`-frame key, and the `punish: true` recovery is still
 * `o.recovery` long. Poses are the caller's: `w1` / `w2` anticipation, `h` hit, `hold` (defaults to `h` nudged by
 * `hold` hit-hold (a few degrees past the hit key), `r` follow-through, and `carry` to return to.
 */
export function crowStrike(o) {
  const tell = o.tell || 20, t0 = Math.max(1, Math.round(tell * 0.55));
  const hold = o.hold || o.h, holdDur = o.holdDur || 3;
  const frames = [
    { dur: t0, pose: P(o.w1), tell: true, sfx: o.tellSfx, armor: o.armor || undefined, event: o.aimEvent, ease: 'in' },
    { dur: Math.max(1, tell - t0), pose: P(o.w2), tell: true, armor: o.armor || undefined, ease: 'out' },
  ];
  const h = { dur: o.active || 8, pose: P(o.h), sfx: o.sfx, fx: o.fx, move: o.move, smear: o.smear, ease: 'overshoot',
    armor: o.armor || undefined, invuln: o.invuln || undefined, event: o.event, projectile: o.projectile, summon: o.summon };
  if (o.hitboxes) h.hitboxes = o.hitboxes; else if (o.hitbox) h.hitbox = o.hitbox;
  frames.push(h);
  frames.push({ dur: holdDur, pose: P(hold), ease: 'out' });
  frames.push({ dur: o.recovery || 20, pose: P(o.r), punish: true, ease: 'inout', fx: o.recoverFx });
  frames.push({ dur: 6, pose: P({ ...o.carry, torso: (o.lean || 3) + 3 }), ease: 'out' });
  return { loop: false, frames };
}
