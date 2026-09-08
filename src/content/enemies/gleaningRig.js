// The Gleaning (faction rig): the salvage guild that hangs off tailings-gas bladders and strips whatever falls out of a
// fight. Shared cel-shaded parts + the hand-authored base animation set used by content/enemies/gleaning.js.
//
// Silhouette law (docs/ART_STYLE.md 0.1 / 0.6): a DARK RAG BODY HANGING UNDER A PALE BULB. The bladder is a `back`
// accessory (torso space, behind the body) so it legitimately rises clear above the skull with the dark sack hood
// silhouetted on it; the Gleaning is the only faction whose head is not the highest point. Value is placed by HEIGHT —
// night-rag boots at the floor, rag trousers, the soot-plum coat at the chest, the mandatory sackcloth yoke at the
// shoulders, bladder silk above the head. Check that ladder with the BLACK-FILL silhouette (`rig.override`) and the 0.5x
// squint, never the coloured render: colour hid both a one-value lower body and a hood/bag fusion in the first pass.
//
// Tell (both channels above the head, where no other faction puts anything): the bag SWELLS (rig.swell) and the gas
// LIGHTS (rig.gas, strobing on rig.strobe) while the core sets rig.tell / rig.tellWarn. Airborne attack keys hold both
// channels from the per-variant hooks, because enemy.js clears rig.tell the moment the wind-up ends. Death: the gas goes
// out of the colour over 12 draws (rig.gasOut), keyed on BASE_HOOKS' rig.gasDead — never on the pose face, which
// `stagger` also sets to `dazed`.
//
// Sheet note: the Harvestman draws ~135px tall at scale 1.3 (the canopy rises ~30px above the skull) against a 108px
// default cell, so tools/sheet.js clips its bag off every cell. Capture it with `&ch=190&cw=130`.
import { P, FK } from './common.js';
import { celRect, celPoly, celBall, celPath, celCapsule, tones, band, flat } from '../../art/shading.js';
import { getChain } from '../../art/secondary.js';
import { pathEllipse } from '../../art/shapes.js';
import { drawFist, drawBoot } from '../../art/rigParts.js';
import { FACE } from '../../art/poses.js';
import { rad } from '../../engine/math.js';
import { particles } from '../../engine/particles.js';
import { ST } from '../../constants.js';

const R = Math.round;

// ---------------------------------------------------------------- palette (ART_STYLE 0.1: the ladder runs bottom to top)
/**
 * Warm violet-black outline: distinct from Brassbound #1A1E24, Sootborn #1E1A14, Stormcrow #191E2A.
 * DARKENED from #15121A (Oklab L* 19.0) to 13.6. The Gleaning is the only faction whose darkest identity mass is a
 * near-black that a QUARTER of the rig is painted in, so its ink had almost nothing to be dark against: `night` was
 * 3.2 L* above this line and its own `deep` tone was BELOW it, i.e. the hood, wraps, hips and boots had outlines that
 * were drawn and then swallowed. Dropping the ink is the half of that fix that costs no actor value -- lifting `night`
 * alone would have had to carry it to HSV v33, straight into the Mooring Spine and Gas-Halls floor bands (v31-33).
 * Ink at 13.6 lets `night` sit at v27, BELOW every stage floor band in the game, and still clear the line by 9.8.
 */
export const GLEAN_OUTLINE = '#0A0612';
export const GLEAN = {
  // The four cloths are the faction's colour: a violet body under a tan yoke. Every one of them holds its HUE FAMILY
  // and (bar `night`, see below) its HSV VALUE, and moves only CHROMA — s37/28/24/28 -> s77/63/58/59. That is the
  // whole saturation pass: this was the least saturated faction in the game (actS 26) because its three biggest
  // masses were all near-neutral, which is also why its colour landed in the Oklab lattice's low-chroma core that
  // every backdrop occupies too (ovlap 41.5 mean, 75.0 on the Cold Sovereign). Chroma is one fix for both.
  // `night` is the exception and it is the INK FLOOR fix: at #1D1826 it was Oklab L* 22.2 against the outline's 19.0,
  // a 3.2 gap, with its own `deep` tone BELOW the line -- so the outline on the hood, the wraps, the hips and the
  // boots (a quarter of the rig) was drawn and then swallowed. #201046 is Oklab 23.4, dL 9.8 over the new ink, and
  // its `sh` and `deep` tones clear it too, so the line survives all three bands instead of dying in the darkest.
  // THE THREE VIOLETS ARE SPACED IN LIGHTNESS FIRST AND CHROMA SECOND, in that order, because they are ADJACENT
  // masses: the coat (primary, torso) sits directly on the trousers (secondary, hips + thighs + shins) and the hood
  // and boots (dark) sit directly on both. Buying all of the separation in chroma collapsed the value ladder --
  // #4E445E/#6A5E7C -> #4C2666/#51347C put coat and trousers at Oklab L* 35.2 / 39.6, dE 4.9, i.e. BELOW the
  // project's own LOST threshold of 10, and the whole lower body read as one violet column at 1x and at squint
  // scale. It also overshot into grape: the two cloths went to Oklab C 11.2 / 11.8, 2.5x the old chroma.
  // Half the chroma gain is kept (C ~9.0, s 50 / 38 against the old 28 / 24) and the ladder is re-cut in L*:
  //   night 23.4 -> plum 38.5 -> rag 51.1, i.e. dE(night, plum) 15.4 and dE(plum, rag) 12.6, both clear of 10.
  // The ladder is FORCED from the bottom: the ink is L* 13.6, `night` has to clear it by ~9 to carry its own outline,
  // and each cloth step then has to clear the one below it by >= 12 -- which puts the trousers at ~51 and nowhere
  // else. Measured over all seven sections this costs nothing: lost% 20.6 -> 20.9, reservation overlap 18.1 -> 18.3.
  // In HSV the same move is a de-candying, because lifting L* at constant Oklab chroma drops saturation: the coat
  // goes s63 -> s56 and the trousers s58 -> s44 while keeping 94 % of the chroma the pass bought.
  night: '#201046',   // L* 23.4 — hood, forearm wraps, hip belt-line and BOOTS: the value that touches the floor
  rag: '#705799',     // 51.1 — the trousers. Its own step so hips -> thigh -> shin -> boot is dark/mid/mid/dark, not one blot
  plum: '#52326F',    // 38.5 — the coat above the belt: a clear step DARKER than the trousers below the belt
  // undyed hemp, not ochre. The tan family is the ONE part of this rig that lives in the stage's own colour space:
  // six of seven backdrops sit in a 44-76 degree amber wedge, and at hue 38 the sackcloth and the rope landed inside
  // it on every board -- 18 of the faction's ~29 points of reservation overlap were these two colours and their tone
  // ramps, more than the violets, the silk and the ink put together. Twelve degrees toward hemp (38 -> 50) and one
  // step of value walks the whole ramp out of those cells without touching what the cloth IS.
  // ... but four degrees of that walk are given back, and no more. A review asked for hue 88-90 on the grounds that
  // the reservation win came from the first six degrees; MEASURED over all seven sections, it does not -- the whole
  // walk is load-bearing and it is nearly all in the last four degrees. Faction mean reservation overlap by sack hue:
  //   h90 25.7   h92 22.3   h94 19.6   h96 19.3   h98 18.3
  // h94 is the compromise: it costs 1.3 points of the faction's best metric and takes the material back toward tan.
  sack: '#857434',    // 56.0 — upper arms, cuffs, ankle wraps and the MANDATORY yoke: the de-blobbing win
  iron: '#4A4E56',    // 33.1 — the ONE dark metal: the Sickle's grapnel, which has to silhouette ON the pale silk
  // pewter-zinc, taken DOWN a step. It used to be Oklab L* 81.1 against the silk's 80.8 -- the file's own note that
  // "zinc vanishes into silk" (which is why the Sickle's grapnel is drawn in iron) was a value collision, and it was
  // also the last near-achromatic light mass sitting in the pale cells the Cold Sovereign and the Heart-Engine claim.
  // 72.7 gives it a 7-point step under the bladder it must never be mistaken for, and moves it out of those cells.
  zinc: '#9EA9AC',    // 68.5 — hooks, gaffs, winch drums, clogs. Never above the shoulders, never on the bladder
  // the gasbag stays the pale near-achromatic counterweight -- chroma on the biggest, lightest, highest shape in the
  // game is the fastest route to candy, and at Oklab L* 80 it is already above every floor band (max 68), so its
  // lightness is not where its overlap came from. What it lacked was ANY chroma: at C 2.7 its whole mass sat in the
  // lattice's neutral core, which the Heart-Engine's pale ground occupies too. C 5.0 at s27 is the ceiling, and held.
  silk: '#9CC4D6',    // 76.9 — the gasbag: lightest value, biggest shape, the only mass above the head
  rose: '#FF57B0',    // 62.7 — tailings gas. Flat, no ramp (ART_STYLE 4)
  hot: '#FFD27A',     // the mandated 1-2px hot core inside every glow
  skin: '#E0C4A4',    // 80.7 — only the Harvestman shows a face; 31 over the sackcloth eye-slot beside it
  rope: '#64603C',    // 40.2 — belts, yoke spars, the ballast lines (hemp, same 12-degree walk as the sackcloth)
};
/**
 * Chalk crop-marks (guild tallies, not clan dye): dry marks on rubberised silk. Spaced against GLEAN.silk (L* 76.9),
 * NOT against white — chaff 42.2 / winnow ochre (hue) / thresher 53.2 / sickle 39.5 / harvestman green (hue).
 */
export const CHALK = { chaff: '#6E6252', winnow: '#D2A44E', thresher: '#C4634E', sickle: '#4A5E7E', harvestman: '#7E9E6A' };
/**
 * Value ladder, and every ADJACENT pair of it (ART_STYLE 0.1 wants >= 25 pts OR a hue-family change per boundary):
 * boot 10.0 -> shin/thigh 28.5 (18.5 pts) -> night hips 10.0 (18.5) -> the rope belt band on top of them 40.2 -> coat
 * 23.3 (30.2 pts of rope over hips, then 16.9 of coat over rope: warm hemp rope against cool violet cloth on both
 * sides, plus the zinc ring and, since this pass, a real 1px line under the belt -- the hue-and-ink branch, not value)
 * -> sackcloth collar, yoke and sleeves 49.2 (warm hemp on cool violet again) -> zinc 68.5 / silk 76.9 above the head.
 * The lower body lost value range when `night` came up off the floor for the ink floor. It is bought back in
 * LIGHTNESS, not in chroma: night 23.4 -> plum 38.5 -> rag 51.1 in Oklab L*, so dE(night, plum) is 15.3 and
 * dE(plum, rag) is 12.7 -- both clear of the project's LOST threshold of 10 -- and every one of those boundaries
 * carries ink (belt, ankle wrap, cuff) as well, rather than relying on the value step alone.
 * `sleeve` is deliberately NOT `primary`, and `secondary` (legs) is deliberately NOT `dark` (boots) — those two hexes
 * being equal is what made hips + both leg segments + boots one black hole from the belt down.
 */
export const GLEAN_PAL = {
  skin: GLEAN.night, hair: GLEAN.night, primary: GLEAN.plum, sleeve: GLEAN.sack, secondary: GLEAN.rag,
  accent: GLEAN.sack, metal: GLEAN.zinc, dark: GLEAN.night, glow: GLEAN.rose,
};
/** ~72px at scale 1: 16px head, 20x24 torso, long thin dangling legs, small pointed feet. */
export const GLEAN_PROPS = {
  headR: 8, neck: 3, neckR: 3, torsoW: 20, torsoH: 24, hip: 17, upperArm: 14, lowerArm: 14, armR: 4, handR: 4.5,
  upperLeg: 15, lowerLeg: 14, legR: 4, footL: 10, footH: 4, bulge: 0.25, shoulderX: 3, hipX: 4,
};

// ---------------------------------------------------------------- the bladder (back accessory, torso space)
/** Per-variant bag geometry: [rx, ry, dx, dy]. The bag never leaves the top of the silhouette — only its SHAPE changes. */
const BAG = {
  slack: [17, 10, -8, -5],  // Chaff: half-filled, flopping off one shoulder — the only asymmetric bag
  tall: [10, 20, 0, -5],    // Winnow: standing on end like a zeppelin upended
  twin: [19, 13, 0, 0],     // Thresher: two over-pressured bags in a rope net
  taut: [15, 15, 0, -5],    // Sickle: a small taut SPHERE, with the dark grapnel crooked over it
  canopy: [20, 14, 0, -7],  // Harvestman: a canopy held clear on a four-spar yoke
};
// dy is the notch: every bag centre must clear the skull (head centre ~ -(torsoH + neck + headR)) or the hood and the
// bag fuse into one mushroom in the black-fill silhouette — the §0.8 squint pass, not the coloured render, is the check.

/** One gas bladder: rubberised silk with a patch seam, the gas inside it, and the hot core. */
function bagBody(ctx, rig, cx, cy, rx, ry, gas) {
  pathEllipse(ctx, cx, cy, rx, ry);
  celPath(ctx, rig, GLEAN.silk, cx, cy, Math.max(rx, ry), 0.34, 0.3);
  if (rig.override) return;
  const t = tones(rig, GLEAN.silk);
  ctx.fillStyle = t.sh; ctx.fillRect(R(cx - rx * 0.75), R(cy + ry * 0.1), R(rx * 0.7), 3);   // patch
  ctx.fillStyle = t.deep; ctx.fillRect(R(cx - rx * 0.2), R(cy - ry * 0.8), 1, R(ry * 1.6));  // seam
  if (gas <= 0.02) return;
  const gr = Math.max(3, R(rx * 0.5)), gy = R(cy + ry * 0.18);
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * (0.14 + gas * 0.62);
  ctx.fillStyle = rig.col(GLEAN.rose);
  pathEllipse(ctx, cx, gy, gr, Math.max(2.5, R(ry * 0.45))); ctx.fill();
  ctx.globalAlpha = a0;
  if (gas > 0.6) { ctx.fillStyle = rig.col(GLEAN.hot); ctx.fillRect(R(cx) - 1, gy - 1, 2, 2); }
}
/** Chalk crop-cross guild mark, stretched by the swell so the mark distorts as a second read. */
function cropMark(ctx, rig, cx, cy, k, col, tally) {
  if (rig.override) return;
  ctx.fillStyle = rig.col(col);
  const w = R(9 * k), h = R(8 * k);
  ctx.fillRect(R(cx - w / 2), R(cy) - 1, w, 2);
  ctx.fillRect(R(cx) - 1, R(cy - h / 2), 2, h);
  ctx.fillRect(R(cx - w / 2), R(cy - h / 2), 2, 2);   // corner block INSIDE the cross's own extent (never off the silk)
  for (let i = 0; i < tally; i++) ctx.fillRect(R(cx) + 6, R(cy - h / 2) + i * 3, 2, 2);
}
/** Rope-lashed yoke under the bag (never zinc, never sackcloth: at sleeve value and 3px it read as a second pair of arms). */
function bagYoke(ctx, rig, cy, spars) {
  const p = rig.p, top = -p.torsoH + 1;
  ctx.strokeStyle = rig.col(GLEAN.rope); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < spars; i++) {
    const x = (i - (spars - 1) / 2) * (spars > 2 ? 11 : 9);
    ctx.moveTo(R(x * 0.55), top); ctx.lineTo(R(x), R(cy));
  }
  ctx.stroke();
}
/**
 * The gas bladder (back accessory): the faction's whole read. Reads rig.swell (tell inflation), rig.gas (0..1),
 * rig.strobe (last tell frames), rig.bags (Winnow's remaining ballast) and build.bagShape / build.chalk.
 */
export function drawBladder(ctx, rig, pose) {
  const p = rig.p, b = rig.build, s = BAG[b.bagShape] || BAG.taut;
  // Death, NOT the pose face: `stagger` also poses `dazed`, and the old face test latched the fade on the first stagger
  // and never reset it, so a staggered Gleaner lost the colour half of its tell for the rest of the fight. The flag comes
  // from BASE_HOOKS (onDeath sets it, onUpdate clears it); fighter.js skips onUpdate once dead, so the RAMP has to live
  // here — but it now resets whenever the rig is not dying. `gasDead == null` = no fighter driving it (sheets, menus):
  // fall back to the face so the contact sheet's `dead` row still goes out.
  const dead = rig.gasDead != null ? !!rig.gasDead : (pose.face | 0) === FACE.dazed;
  // PURE READ, and it has to stay one. The fade used to advance a `rig.gasOut` counter from inside this draw, so two
  // draws of the same (pose, tick) produced different command streams and every variant's `stagger` and `dead` keys
  // measured non-deterministic. The stamp is written where it belongs, in BASE_HOOKS (onDeath sets rig.gasDeadAt,
  // onUpdate clears it); `rig.tick` counts draws (rig.js), so this is the same 12-draw ramp, read instead of written.
  // No fighter driving the rig (sheets, menus, the invariant suite) = no stamp: a dead pose draws the gas fully out
  // with no ramp, which keeps the contact sheet's `dead` row honest and is deterministic by construction.
  const since = rig.gasDeadAt != null ? Math.max(0, (rig.tick | 0) - rig.gasDeadAt) : 12;
  const out = dead ? 1 - Math.min(12, since) / 12 : 1;
  const k = (rig.swell || 1) * (dead ? 0.66 : 1);
  let gas = (rig.gas != null ? rig.gas : 0.25) * out;
  if (rig.strobe && (rig.tick & 2)) gas = Math.min(1, gas + 0.6);
  const rx = R(s[0] * k), ry = R(s[1] * k), cx = R(s[2]), cy = R(-(p.torsoH + 21) + s[3] - (ry - s[1]));
  bagYoke(ctx, rig, cy + ry * 0.5, b.bagShape === 'canopy' ? 4 : 2);
  if (b.bagShape === 'twin') {
    // lobes pushed out to tangent so a real notch opens at the top: at 0.48/0.56 the pair was one wide circle at squint
    const lr = R(rx * 0.6), lx = R(rx * 0.58);
    bagBody(ctx, rig, cx - lx, cy + 1, lr, ry, gas);
    bagBody(ctx, rig, cx + lx, cy - 1, lr, ry, gas);
    if (!rig.override) {  // the rope net: the only cross-hatched shape on any Gleaner. Nothing crosses the notch.
      ctx.strokeStyle = rig.col(GLEAN.rope); ctx.lineWidth = 2; ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        const hy = R(cy + i * 7), hw = R(rx * (i ? 0.9 : 1.16));
        ctx.moveTo(cx - hw, hy); ctx.lineTo(cx + hw, hy);
        if (i) { const vh = R(ry * 0.8); ctx.moveTo(cx + i * lx, cy - vh); ctx.lineTo(cx + i * lx, cy + vh); }
      }
      ctx.stroke();
    }
  } else bagBody(ctx, rig, cx, cy, rx, ry, gas);
  if (b.bagShape === 'taut') grapnelCoil(ctx, rig, cx, cy - ry, rx);
  if (b.bags != null || rig.bags != null) bandolier(ctx, rig, cy + ry);
  // the mark has to sit INSIDE silk: on `twin` the centreline is the notch between the two lobes, so ride the near lobe
  const mx = b.bagShape === 'twin' ? cx - R(rx * 0.48) : cx + R(rx * (b.bagShape === 'taut' ? 0.34 : 0.15));
  const my = b.bagShape === 'twin' ? cy + R(ry * 0.1) : cy - R(ry * (b.bagShape === 'taut' ? 0.15 : 0.5));
  cropMark(ctx, rig, mx, my, k, b.chalk || CHALK.chaff, rig.tally || (b.bagShape === 'canopy' ? 4 : 0));
}
/**
 * Sickle only: a rope coil with a three-fluke grapnel crooked OVER the bag — nothing else has that overhead crook.
 * Drawn in GLEAN.iron, not zinc: zinc is L* 78.2 on silk L* 77.9, so the hook used to vanish into the bag it sits on
 * (and the faction rule is that zinc never touches the bladder).
 */
function grapnelCoil(ctx, rig, cx, cy, rx) {
  const gx = R(cx + rx * 1.15), gy = R(cy + 3);
  ctx.strokeStyle = rig.col(GLEAN.rope); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx - 4, cy - 1, 5, -0.5, 3.4); ctx.stroke();          // the coil, over the bag's shoulder
  ctx.beginPath(); ctx.moveTo(cx - 1, cy - 5); ctx.lineTo(gx - 1, gy - 9); ctx.stroke();
  celCapsule(ctx, rig, gx, gy - 9, gx, gy, 2, GLEAN.iron, 0.3);                  // shank, clear of the silk
  if (rig.override) return;
  ctx.strokeStyle = rig.col(GLEAN.iron); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(gx - 5, gy - 2); ctx.quadraticCurveTo(gx, gy + 3, gx + 5, gy - 2); ctx.stroke();
  ctx.fillStyle = tones(rig, GLEAN.iron).deep; ctx.fillRect(gx - 1, gy - 9, 2, 3);
}
/** Winnow only: the ballast bandolier hanging down the BACK (never across the torso), emptying one bag at a time. */
function bandolier(ctx, rig, y0) {
  const n = rig.bags != null ? rig.bags : 6, ch = lineChain(rig);
  ctx.save(); ctx.translate(-15, R(y0)); ctx.rotate(rad(ch.ang[0] * 0.7));   // the load swings on its lines
  if (!rig.override && n > 0) {   // the line runs from the yoke it hangs off to the LAST bag: it never ends in open air
    ctx.strokeStyle = rig.col(GLEAN.rope); ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R(-1 - ((n - 1) & 1) * 3), R(8 + (n - 1) * 6)); ctx.stroke();
  }
  for (let i = 0; i < n; i++) celBall(ctx, rig, R(-1 - (i & 1) * 3), R(8 + i * 6), 3, GLEAN.sack, false);
  ctx.restore();
}

// ---------------------------------------------------------------- parts
/** Sack hood (head space): a soft peaked bag over the skull, open only at the chin. No visible face on four of five. */
export function gleanHood(ctx, rig, pose, inf) {
  // night, NOT pal.secondary: secondary is now the rag trousers. The hood stays the darkest value on the rig.
  // (drawHead always passes the NEAR palette — a head is never a far part — so a module constant is safe here.)
  const r = inf.r, hood = GLEAN.night;
  celPoly(ctx, rig, [R(r * 0.95), R(r * 0.15), R(r * 0.8), R(r * 0.7), R(-r * 0.3), R(r * 0.95), R(-r * 1.1), R(r * 0.5),
    R(-r * 1.5), R(-r * 0.5), R(-r * 0.9), R(-r * 1.1), R(r * 0.2), R(-r * 1.25), R(r * 0.95), R(-r * 0.6)], hood, 0.36, 0.26);
  if (rig.override) return;
  const t = tones(rig, hood);
  ctx.fillStyle = t.deep; ctx.fillRect(R(r * 0.1), R(r * 0.05), R(r * 0.85), 2);          // brim shadow over the slot
  // NO second sackcloth mark up here: the old drawstring knot was the same colour and size as the chin slot, 3px away,
  // so the hood read as a face with two square eyes and the facing was ambiguous (ART_STYLE 0.5). The slot is the face.
}
/**
 * The lit chin-slot (face hook): the only opening in the hood. It tightens on `grit`, opens on `shout`, dims on `hurt`
 * and goes dark when dazed; `build.jawFace` (the Harvestman officer) draws a real old man's jaw instead.
 */
export function gleanSlot(ctx, rig, pose, inf) {
  const r = inf.r, face = pose.face | 0, look = rig.look;
  const dazed = face === FACE.dazed, hurt = face === FACE.hurt;
  const lx = look ? R(look.x) : 0;
  if (rig.build.jawFace) {
    celPoly(ctx, rig, [R(r * 0.2), R(r * 0.15), R(r * 0.95), R(r * 0.2), R(r * 0.85), R(r * 0.75), R(r * 0.15), R(r * 0.9)], GLEAN.skin, 0.36, 0.3);
    if (rig.override) return;
    ctx.fillStyle = rig.col(dazed ? '#3A2A48' : '#2A1C3A');   // the mouth, on lifted jaw SKIN — violet-black, not grey
    if (face === FACE.shout) ctx.fillRect(R(r * 0.4), R(r * 0.35), 5, 5);
    else if (hurt || dazed) ctx.fillRect(R(r * 0.4), R(r * 0.45), 5, 3);
    else ctx.fillRect(R(r * 0.35), R(r * 0.5), 6, 2);
    ctx.fillStyle = tones(rig, GLEAN.skin).deep; ctx.fillRect(R(r * 0.25), R(r * 0.72), 6, 2);   // jaw shadow
    // one lit eye-slot under the brim: sackcloth 49.2 against the lifted jaw skin 80.7 = 31.5 pts, so the officer's face
    // reads as jaw + slot rather than two same-value tan rectangles (GLEAN.skin was #C9A98C / 71.3 before this pass)
    ctx.fillStyle = rig.col(GLEAN.sack); ctx.fillRect(R(r * 0.15), R(-r * 0.1), 5, 3);
    return;
  }
  if (rig.override) return;
  // dazed = the slot goes DARK, so it has to be darker than the hood it is cut into. It used to be a fixed #3A3440,
  // which read only because the hood was near-black; with `night` lifted off the ink floor that grey now sits within
  // 1.3 Oklab L* of the hood and the slot would disappear. Take it from the hood's own deep tone instead.
  const lit = dazed ? tones(rig, GLEAN.night).deep : hurt ? tones(rig, GLEAN.sack).sh : GLEAN.sack;
  const w = face === FACE.shout ? 6 : 5, h = face === FACE.grit || face === FACE.angry ? 2 : 3;
  ctx.fillStyle = rig.col(lit); ctx.fillRect(R(r * 0.2) + lx, R(r * 0.25), w, h);
  if (dazed) return;
  ctx.fillStyle = rig.col(rig.tell ? GLEAN.rose : tones(rig, GLEAN.sack).deep);
  ctx.fillRect(R(r * 0.2) + lx, R(r * 0.25) + h, w, 1);
}
/**
 * Soot-plum coat (torso space) with the MANDATORY sackcloth yoke: a collar band plus a broad strap crossing the chest,
 * which is what separates the sackcloth sleeves from a near-black body and carries the chalk crop-marks.
 */
export function gleanCoat(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2), pal = inf.pal;
  celPoly(ctx, rig, [-hw + 1, -H + 3, -hw + 5, -H, hw - 4, -H, hw, -H + 4, hw + 1, R(-H * 0.35), hw - 1, 3, -hw + 1, 3, -hw - 1, R(-H * 0.35)], pal.primary, 0.3, 0.3);
  if (rig.override) return;
  const t = tones(rig, pal.primary), ts = tones(rig, pal.sleeve);
  ctx.fillStyle = t.deep; ctx.fillRect(-hw + 1, R(-H * 0.14), W - 2, 1);                               // one seam, no skirt fill:
  // the old night-rag skirt made coat -> hips -> thigh -> shin -> boot five adjacent parts at the same hex
  // COLLAR and YOKE STRAP both take ink: sackcloth over coat cloth is a MATERIAL change (0.2, 0.4d), and these two
  // fills were the WHOLE of this faction's error tier -- 66-75 faked boundaries a variant, on the one shape this file
  // calls "the de-blobbing win". A bare fill cannot de-blob anything: with no line the yoke read as a smear of tan.
  band(ctx, rig, -hw - 1, -H + 1, W + 2, 6, pal.sleeve);                                               // collar
  ctx.beginPath(); ctx.moveTo(hw - 2, -H + 5); ctx.lineTo(hw - 2, -H + 11); ctx.lineTo(-hw + 2, R(-H * 0.2)); ctx.lineTo(-hw + 2, R(-H * 0.2) - 6); ctx.closePath();
  flat(ctx, rig, pal.sleeve);                                                                          // 6px yoke strap
  ctx.fillStyle = ts.sh; ctx.fillRect(R(-hw * 0.4), R(-H * 0.45), 5, 2);
  ctx.fillStyle = rig.col(rig.build.chalk || CHALK.chaff);
  ctx.fillRect(R(hw * 0.1), -H + 2, 2, 4); ctx.fillRect(R(hw * 0.1) - 3, -H + 3, 2, 2);                // chalk tick on the yoke
}
/** Night-rag hips on a rope belt with a zinc ring (hip space). */
export function gleanHips(ctx, rig, pose, inf) {
  const hip = inf.w, hw = R(hip / 2);
  celRect(ctx, rig, -hw, -5, hip, 11, 3, GLEAN.night, 0.4, 0.2);
  if (rig.override) return;
  // the belt is rope over night-rag: a MATERIAL change, so it takes ink, widened 3 -> 4 px first because a 3 px band
  // inked on both edges leaves 1 px of colour and fails 0.7 harder than the missing line did. It is also the ONE
  // mediator between the coat and the hips, so it has to be a real edge and not a tone.
  band(ctx, rig, -hw + 1, -5, hip - 2, 4, GLEAN.rope);
  ctx.fillStyle = tones(rig, GLEAN.rope).sh; ctx.fillRect(-hw + 2, -2, hip - 4, 1);   // form inside the rope: tone seam
  band(ctx, rig, 1, -6, 4, 4, GLEAN.zinc);                                            // the ring, on the belt it hangs off
}
/** Hooked hand (hand space): a sackcloth-wrapped mitt against the night-rag forearm, with a zinc lift-hook. */
export function gleanHand(ctx, rig, pose, inf) {
  drawFist(ctx, rig, inf.r, inf.pal.sleeve);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, inf.pal.sleeve).deep; ctx.fillRect(R(inf.r * 1.3), R(-inf.r * 0.8), 2, R(inf.r * 1.6));
  ctx.strokeStyle = rig.col(inf.pal.metal); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(R(inf.r * 1.5), R(inf.r * 0.9), 3.5, -1.4, 1.9); ctx.stroke();
}
/** Night-rag clog (ankle space): small pointed foot with a zinc cap and a sackcloth ankle wrap. */
export function gleanFoot(ctx, rig, pose, inf) {
  drawBoot(ctx, rig, inf.w, inf.h, inf.pal.dark, inf.pal.metal);
  if (rig.override) return;
  const toe = R(inf.w * 0.62);
  // both are MATERIAL changes on the boot (zinc on rag, sackcloth on rag) so both take ink, and the 3 px ankle wrap
  // widens to 4 first rather than being inked down to a single pixel of colour (§0.7).
  band(ctx, rig, toe - 5, -1, 5, 4, inf.pal.metal);                                    // 5px cap: what separates a boot from the deck
  band(ctx, rig, R(-inf.w * 0.4), R(-inf.h) - 4, R(inf.w * 0.8), 4, inf.pal.sleeve);   // sack ankle wrap: the boot/shin edge
}
/** Complete Gleaning part table. Arms and legs use the defaults: sackcloth sleeve + cuff over night-rag wraps. */
export const GLEAN_PARTS = { head: gleanHood, face: gleanSlot, torso: gleanCoat, hips: gleanHips, hand: gleanHand, foot: gleanFoot };

// ---------------------------------------------------------------- the hanging tools (ONE chain per rig: 'line')
/** Rotate into root space (hand accessories are entered rotated by the forearm angle) so a tool hangs straight down. */
function hangSpace(ctx, rig, far) {
  ctx.rotate(rad((far ? rig.joints.armF.hand : rig.joints.armN.hand) - 90));
}
/** The 'line' chain: 3 lagging segments hanging from the torso (ART_STYLE 7). */
function lineChain(rig) {
  return getChain(rig, 'line', 3, { joint: 'torso', rest: [0, 1], stiffness: 0.12, damping: 0.68, gain: 1.6, rotGain: 0.4, maxAng: 40 });
}
/**
 * Whatever a Gleaner carries hangs BELOW the hand on a wrist loop, never levelled out front: build.tool selects
 * 'gaff' (Chaff), 'hook' (Sickle) or 'horn' (Harvestman, the one strapped tool).
 */
export function drawWristTool(ctx, rig, pose) {
  const tool = rig.build.tool;
  if (tool === 'horn') {   // brass hailing horn strapped along the forearm (no line, it is lashed on)
    celPoly(ctx, rig, [1, -2.5, 10, -4, 15, -7, 16, 7, 10, 4, 1, 2.5], GLEAN.zinc, 0.36, 0.3);
    if (!rig.override) { ctx.fillStyle = tones(rig, GLEAN.zinc).deep; ctx.fillRect(4, -2, 6, 2); }
    return;
  }
  const ch = lineChain(rig);
  ctx.save(); hangSpace(ctx, rig, false); ctx.translate(0, 4);
  ctx.rotate(rad(ch.ang[0]));
  ctx.strokeStyle = rig.col(GLEAN.rope); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 6); ctx.stroke();
  ctx.translate(0, 6); ctx.rotate(rad(ch.ang[1]));
  if (tool === 'hook') {
    celCapsule(ctx, rig, 0, 0, 0, 7, 2, GLEAN.zinc, 0.3);
    if (!rig.override) { ctx.strokeStyle = rig.col(GLEAN.zinc); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-3, 7, 4, -0.6, 2.6); ctx.stroke(); }
  } else {
    celCapsule(ctx, rig, 0, 0, 0, 12, 2, GLEAN.zinc, 0.3);
    if (!rig.override) { ctx.strokeStyle = rig.col(GLEAN.zinc); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(-4, 12, 4.5, -0.5, 2.2); ctx.stroke(); }
  }
  ctx.restore();
}
/** Hip gear on the same line: 'drum' (Winnow's hand-crank winch), 'apron' (Thresher's kettle ballast), 'tags' (claim tags). */
export function drawHipGear(ctx, rig) {
  const kind = rig.build.hipGear;
  if (!kind) return;
  const hw = R(rig.p.hip / 2);
  if (kind === 'drum') {
    celRect(ctx, rig, hw - 3, -6, 11, 12, 3, GLEAN.zinc, 0.36, 0.3);
    celRect(ctx, rig, hw + 4, -15, 4, 4, 1, GLEAN.zinc, 0.4, 0);   // the crank HANDLE (silhouette, so before the flash return)
    if (rig.override) return;
    ctx.fillStyle = tones(rig, GLEAN.zinc).deep; ctx.fillRect(hw - 1, -4, 7, 2); ctx.fillRect(hw - 1, 1, 7, 2);
    ctx.strokeStyle = rig.col(GLEAN.rope); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hw + 3, -6); ctx.lineTo(hw + 6, -12); ctx.stroke();      // ...and the crank arm reaching it
    return;
  }
  const ch = lineChain(rig);
  ctx.save(); ctx.translate(0, 4); ctx.rotate(rad(ch.ang[0] * 0.6));
  if (kind === 'apron') {
    celPoly(ctx, rig, [-hw - 1, 1, hw + 1, 1, hw - 2, 13, -hw + 2, 13], GLEAN.zinc, 0.36, 0.3);
    if (!rig.override) { ctx.fillStyle = tones(rig, GLEAN.zinc).deep; ctx.fillRect(-hw + 2, 5, hw * 2 - 4, 2); ctx.fillRect(-hw + 2, 9, hw * 2 - 4, 2); }
  } else {
    // ONE zinc claim plate, not three sackcloth tags: at sleeve value they were a fourth tan cluster on a rig that
    // already carries sleeves, ankle wraps and the yoke in the same colour (ART_STYLE 0.7).
    celRect(ctx, rig, -6, 2, 12, 6, 2, GLEAN.zinc, 0.4, 0);
    if (!rig.override) { ctx.fillStyle = tones(rig, GLEAN.zinc).deep; ctx.fillRect(-3, 4, 7, 2); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- shared animation set
/** Body on its back, bag crushed under it, arms flung: root rot -88 puts body-space +y along the ground. */
// root y -4 (not -8): the lying body is ON the deck, which also plants `getup` #0 — the one ground-classed key in the
// faction that is authored as a lying pose (the audit's air regex covers lying/dead but not getup).
const FLOOR = { armR: [-24, -8], armL: [28, 18], torso: 2, head: -10, legR: [12, 10], legL: [-4, 8], footR: 0, footL: 0, root: [16, -4, -88], face: 'dazed' };
const AD = (a, du, dl) => [a[0] + du, a[1] + dl];

/**
 * Base Gleaning animation set for a rest carry `c` ({ armR, armL }): idle 4 / walk 8 / run 8 / flee 6 / jump / fall /
 * land / hurt 3 / stagger 2 / hurtAir 2 / knockdown 2 / lying 2 / getup 3 / dead 2 / dodge 5 (the bag-vent back-hop the
 * Sickle and Harvestman need for ai.evadeChance). Ground keys hang the feet with footR/footL rotation (toe down, heel
 * off) and keep root.y on the floor: window.__sheet.audit() must flag `run`, `flee` and airborne attack keys only.
 */
export function makeGleanBase(c, o = {}) {
  // root y 0 on the neutral, NOT -2: the old base lifted the whole body off the deck and printed 26-32 FLOOR flags a
  // variant (idle, every walk key, every attack hold). The hanging read is carried by footR/footL (toe down, heel off),
  // which costs nothing in the audit, and by the stance: legR/legL are splayed enough that the far leg clears the near
  // one instead of stacking into a single column.
  const K = (s) => ({ torso: -3, head: 6, legR: [14, 6], legL: [-16, 8], footR: -18, footL: -15, root: [0, 0], ...c, ...s });
  const aR = c.armR, aL = c.armL;
  const walk = (lr, ll, ar, al, ty, sq) => K({ legR: lr, legL: ll, armR: ar, armL: al, torso: -3, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1 });
  const run = (lr, ll, ar, al, ty, sq) => K({ legR: lr, legL: ll, armR: ar, armL: al, torso: 10, head: -2, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, face: 'angry' });
  const flee = (lr, ll, i, ty) => K({ legR: lr, legL: ll, armR: [-150 + i * 12, -24], armL: [-168 - i * 8, -20], torso: 4, head: -8 + i * 4, root: [0, ty], face: 'hurt' });
  const anims = {
    // idle: the whole body swings a little under the bag instead of breathing from the chest
    idle: { loop: true, frames: [
      FK(14, K({ root: [0, 0] }), { ease: 'inout' }),
      FK(13, K({ torso: -5, head: 8, root: [1, -1], armR: AD(aR, 3, 2), armL: AD(aL, -3, 2), squash: 0.99, stretch: 1.01 }), { ease: 'inout' }),
      FK(14, K({ torso: -2, head: 5, root: [0, 1], armR: AD(aR, -2, -1), armL: AD(aL, 2, -1) }), { ease: 'inout' }),
      FK(13, K({ torso: -4, head: 7, root: [-1, 0], armR: AD(aR, 1, 1), armL: AD(aL, -1, 1) }), { ease: 'inout' }),
    ] },
    // walk: a light, toe-first drift — contact / down / pass / up x2. The free arm swings ~38 deg biased BACK (the old
    // +-9 read as locked arms over a striding pair of legs) and the tool on the 'line' chain swings with it.
    walk: { loop: true, frames: [
      FK(4, walk([30, 4], [-24, 18], AD(aR, -20, 2), AD(aL, 18, 2), 1), { ease: 'out' }),
      FK(4, walk([22, 14], [-14, 30], AD(aR, -10, 0), AD(aL, 6, 0), 2, 1.03), { ease: 'out' }),
      FK(4, walk([6, 26], [2, 14], AD(aR, 6, -2), AD(aL, -10, -2), 0), { ease: 'inout' }),
      FK(4, walk([-10, 18], [20, 2], AD(aR, 18, -2), AD(aL, -20, -2), -1), { ease: 'in' }),
      FK(4, walk([-24, 18], [30, 4], AD(aR, 18, 2), AD(aL, -20, 2), 1), { ease: 'out' }),
      FK(4, walk([-14, 30], [22, 14], AD(aR, 6, 0), AD(aL, -10, 0), 2, 1.03), { ease: 'out' }),
      FK(4, walk([2, 14], [6, 26], AD(aR, -10, -2), AD(aL, 6, -2), 0), { ease: 'inout' }),
      FK(4, walk([20, 2], [-10, 18], AD(aR, -20, -2), AD(aL, 18, -2), -1), { ease: 'in' }),
    ] },
    run: { loop: true, frames: [
      FK(3, run([48, 12], [-38, 52], [40, -30], [-56, -20], -2), { ease: 'out' }),
      FK(3, run([36, 28], [-26, 66], [26, -28], [-44, -18], 1, 1.04), { ease: 'out' }),
      FK(3, run([8, 40], [8, 28], [-4, -26], [-20, -18], -4), { ease: 'inout' }),
      FK(3, run([-22, 48], [36, 8], [-34, -24], [4, -20], -3), { ease: 'in' }),
      FK(3, run([-38, 52], [48, 12], [-56, -20], [40, -30], -2), { ease: 'out' }),
      FK(3, run([-26, 66], [36, 28], [-44, -18], [26, -28], 1, 1.04), { ease: 'out' }),
      FK(3, run([8, 28], [8, 40], [-20, -18], [-4, -26], -4), { ease: 'inout' }),
      FK(3, run([36, 8], [-22, 48], [4, -20], [-34, -24], -3), { ease: 'in' }),
    ] },
    // bolting: arms up on the lines, hauling the bag along
    flee: { loop: true, frames: [
      FK(3, flee([46, 10], [-36, 50], 0, -1), { ease: 'out' }), FK(3, flee([28, 36], [-18, 56], 1, 2), { ease: 'out' }), FK(3, flee([-8, 40], [22, 18], 2, -3), { ease: 'in' }),
      FK(3, flee([-36, 50], [46, 10], 1, -1), { ease: 'out' }), FK(3, flee([-18, 56], [28, 36], 0, 2), { ease: 'out' }), FK(3, flee([22, 18], [-8, 40], 2, -3), { ease: 'in' }),
    ] },
    jump: { loop: false, frames: [
      FK(3, K({ legR: [28, 38], legL: [-18, 42], torso: 8, root: [0, 2], squash: 1.1, stretch: 0.9, armR: AD(aR, -20, 10), armL: AD(aL, -20, 10) }), { ease: 'out' }),
      FK(4, K({ legR: [26, -26], legL: [10, -18], torso: -10, head: 2, root: [0, -6], squash: 0.94, stretch: 1.08, armR: AD(aR, -50, -20), armL: AD(aL, -50, -20) }), { ease: 'out' }),
      FK(30, K({ legR: [34, -60], legL: [16, -44], torso: -8, head: 4, armR: AD(aR, -34, -16), armL: AD(aL, -34, -16) }), { ease: 'inout' }),
    ] },
    fall: { loop: true, frames: [
      FK(10, K({ legR: [22, -28], legL: [6, -18], torso: -12, head: 2, armR: AD(aR, -60, -18), armL: AD(aL, -60, -18), face: 'grit' }), { ease: 'inout' }),
      FK(10, K({ legR: [28, -38], legL: [2, -12], torso: -16, head: 0, armR: AD(aR, -72, -18), armL: AD(aL, -72, -18), face: 'grit' }), { ease: 'inout' }),
    ] },
    land: { loop: false, frames: [
      FK(3, K({ legR: [32, 44], legL: [-22, 46], torso: 12, head: 10, root: [0, 2], squash: 1.16, stretch: 0.86, armR: AD(aR, -14, 14), armL: AD(aL, -14, 14), face: 'grit' }), { ease: 'out' }),
      FK(5, K({ legR: [14, 16], legL: [-10, 18], torso: 0, root: [0, 1], squash: 1.02, stretch: 0.98 }), { ease: 'out' }),
    ] },
    hurt: { loop: false, frames: [
      FK(4, K({ torso: -22, head: -18, armR: AD(aR, -30, -20), armL: AD(aL, -34, -20), root: [-5, 1], legR: [20, 4], legL: [-14, 12], face: 'hurt' }), { ease: 'out' }),
      FK(10, K({ torso: -10, head: -4, armR: AD(aR, -12, -8), armL: AD(aL, -14, -8), root: [-2, 1], legR: [12, 2], legL: [-10, 8], face: 'hurt' }), { ease: 'out' }),
      FK(6, K({ torso: -3, face: 'angry' }), { ease: 'out' }),
    ] },
    stagger: { loop: true, frames: [
      FK(6, K({ torso: 4, head: -12, root: [-3, 1], armR: [-36, -28], armL: [-48, -26], legR: [20, 12], legL: [-20, 16], face: 'dazed' }), { ease: 'inout' }),
      FK(6, K({ torso: -14, head: 10, root: [3, 0], armR: [-18, -38], armL: [-64, -18], legR: [16, 14], legL: [-24, 12], face: 'dazed' }), { ease: 'inout' }),
    ] },
    hurtAir: { loop: true, frames: [
      FK(6, { armR: [-92, -36], armL: [-104, -28], torso: -30, head: -22, legR: [40, 40], legL: [10, 58], root: [0, 0, -15], face: 'hurt' }, { ease: 'inout' }),
      FK(6, { armR: [-104, -46], armL: [-114, -28], torso: -36, head: -28, legR: [50, 30], legL: [20, 48], root: [0, 0, -26], face: 'hurt' }, { ease: 'inout' }),
    ] },
    knockdown: { loop: true, frames: [
      FK(8, { armR: [-62, -38], armL: [-82, -28], torso: -50, head: -18, legR: [50, 30], legL: [30, 50], root: [0, -6, -26], face: 'hurt' }, { ease: 'inout' }),
      FK(8, { armR: [-72, -48], armL: [-92, -28], torso: -56, head: -24, legR: [60, 20], legL: [40, 40], root: [0, -6, -36], face: 'hurt' }, { ease: 'inout' }),
    ] },
    lying: { loop: true, frames: [
      FK(16, { ...FLOOR, face: 'hurt' }, { ease: 'inout' }),
      FK(16, { ...FLOOR, torso: 6, head: -13, legR: [16, 12], face: 'hurt' }, { ease: 'inout' }),
    ] },
    getup: { loop: false, frames: [
      FK(8, { ...FLOOR, face: 'hurt' }, { ease: 'in' }),
      FK(8, { armR: [58, 38], armL: [-28, 38], torso: 28, head: -8, legR: [68, 58], legL: [-18, 58], root: [8, 2, -20], face: 'grit', squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
      FK(6, K({ torso: 2, root: [0, 1], legR: [14, 18], legL: [-10, 14], face: 'angry' }), { ease: 'out' }),
    ] },
    // death: the bladder rips, the body drops out of the air and the gas goes out of the colour (drawBladder)
    dead: { loop: false, frames: [
      FK(7, { ...FLOOR, legR: [42, -26], legL: [30, -18], armR: [-38, -18], armL: [46, 12], torso: -4, root: [16, -8, -92], squash: 1.06, stretch: 0.94 }, { ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0, count: 6 }] }),
      FK(60, { ...FLOOR, torso: 7, head: -14, legR: [10, 2], legL: [-8, 6], armR: [-28, -10], armL: [38, 22], root: [16, -8, -92] }, { ease: 'out' }),
    ] },
    // dodge: a bag-vent back-hop (ai.evadeChance) — crouch, vent, tuck, land
    dodge: { loop: false, frames: [
      FK(4, K({ torso: 10, root: [0, 1], legR: [34, 38], legL: [-18, 38], armR: AD(aR, -10, 12), armL: AD(aL, -10, 12), face: 'grit', squash: 1.08, stretch: 0.92 }), { sfx: 'dodge', ease: 'in' }),
      FK(6, K({ torso: -12, head: -6, root: [0, -20], legR: [38, -56], legL: [28, -46], armR: AD(aR, -40, -22), armL: AD(aL, -40, -22), face: 'closed', squash: 0.94, stretch: 1.06 }),
        { sfx: 'steam_vent', fx: [{ kind: 'steam', x: -10, y: 30, count: 3 }], ease: 'out' }),
      FK(5, K({ torso: -8, head: -2, root: [0, -12], legR: [30, -30], legL: [20, -22], armR: AD(aR, -22, -12), armL: AD(aL, -22, -12), face: 'closed' }), { ease: 'in' }),
      FK(4, K({ torso: 8, root: [0, 2], legR: [28, 34], legL: [-16, 34], armR: AD(aR, -8, 10), armL: AD(aL, -8, 10), face: 'grit', squash: 1.1, stretch: 0.9 }), { ease: 'out' }),
      FK(4, K({ torso: -3, root: [0, 0] }), { ease: 'out' }),
    ] },
  };
  if (o.extra) Object.assign(anims, o.extra);
  return anims;
}

/**
 * Shared hooks (every variant merges these first): the two-channel tell state the bladder reads, and the faction rule.
 * SHOT DOWN — this 1.25x on top of the core's own 1.2x air bonus (fighter.js) makes any hit on an airborne Gleaner 1.5x,
 * and the engine's juggle branch has already turned it into a juggle before the hook returns. Air time is the liability.
 */
export const BASE_HOOKS = {
  onUpdate(f) {
    const r = f.rig;
    r.swell = r.tell ? (r.tellWarn ? 1.18 : 1.12) : 1;
    r.gas = r.tell ? 1 : 0.25;
    r.strobe = !!r.tellWarn;
    r.gasDead = false;   // alive: the bladder is lit. fighter.js only calls onUpdate while !dead, so this is the reset
    r.gasDeadAt = null;  // ...and the fade stamp with it. Written HERE and in onDeath, never in a draw (drawBladder)
    if (f.aiState === 'FLEE' && f.state === ST.RUN && f.anim.name === 'run') f.play('flee');
  },
  /** The ONLY thing that puts the gas out (a stagger poses `dazed` too — see drawBladder). */
  onDeath(f) { f.rig.gasDead = true; f.rig.gasDeadAt = f.rig.tick | 0; },
  onHitTaken(f, h) {
    if (!f.airborne || f.dead) return undefined;
    return { ...h, damage: Math.round((h.damage || 0) * 1.25) };
  },
  onLanded(f, world) {
    if (f.dead) return;
    ventPuff(f, 4, 0.8);
    world.addFx('dust', f.x, 0, f.z, { count: 4 });
  },
};

/** Rose vapour vented out of the bag (release, landings, the airborne trail). */
export function ventPuff(f, count = 5, up = 1.2) {
  particles.burst('steam', f.x - f.facing * 8, f.y + f.h * 0.8, f.z, count, { speed: 1.2, up, color: GLEAN.rose, sizeJitter: 1.2 });
}

export { P, FK };
