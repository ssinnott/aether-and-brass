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
// THE HEAD IS A GAS HOOD, NOT A LUMP (ART_STYLE 0.5, 6 — the sanctioned masked-rig pattern the two sealed Stormcrows
// use). The hood shell is ONE unioned path in `cowl`, the opening is a real inked hole in it, and the face is a pale
// GOGGLE LENS on drawFace's own eye row whose colour is the mood, with a dead far-eye slot and a sackcloth breather
// under it. `build.jawFace` (the Harvestman) lifts the goggles onto the brow and shows a real face instead — the
// officer is the one Gleaner who does not need the mask, and that is his rank read.
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
import { celRect, celPoly, celBall, celPath, celCapsule, tones, band, flat, rimTop } from '../../art/shading.js';
import { getChain } from '../../art/secondary.js';
import { pathEllipse } from '../../art/shapes.js';
import { drawFist, drawBoot, drawFace } from '../../art/rigParts.js';
import { FACE } from '../../art/poses.js';
import { rad } from '../../engine/math.js';
import { particles } from '../../engine/particles.js';
import { ST } from '../../constants.js';

const R = Math.round;

// ---------------------------------------------------------------- palette (ART_STYLE 0.1: the ladder runs bottom to top)
/**
 * Warm violet-black outline: distinct from Brassbound #1A1E24, Sootborn #1E1A14, Stormcrow #191E2A.
 * Held at Oklab L* 13.6 through this pass. It is the floor every cloth below has to clear, and the cloths were the
 * half of that relationship that moved (see THE INK SHARE below).
 */
export const GLEAN_OUTLINE = '#0A0612';
export const GLEAN = {
  // THE INK SHARE, and it is the measurement this pass turns on. tools/stage-values.js reports `ink%` — the share of
  // an actor's pixels that sit below Oklab L 0.25, i.e. the mandated near-black outline and anything painted dark
  // enough to join it. ART_STYLE 3 records the cast band as 10-27 %, 17 % across the roster; the other four factions
  // measure 6-13 %. The Gleaning measured 31-35 % on all seven sections — three times the cast — because `night`
  // (#201046, L* 23.4) sat under that line WITH BOTH ITS TONES (sh 20.6, deep 18.5) and four masses were painted in
  // it: the hood, the forearm wraps, the hip block and the boots. That is the number behind "the violets and the
  // hood merge into one dark column": not a hue problem and not a ladder-step problem (every adjacent pair already
  // cleared its baseline), but a third of the rig rendering as ink.
  //
  // So the ladder is LIFTED, not re-spaced, and the two masses that had no business being near-black are moved off
  // `night` entirely — the hood onto its own `cowl` and the wraps onto `oil`. What is left on `night` is what the
  // name always meant: the value that touches the floor. Every step is still >= 12 Oklab dE from its neighbour, the
  // ordering is unchanged, and the whole ladder now runs ABOVE the ink instead of straddling it:
  //   ink 13.6 | night 27.3 | oil 34.6 | cowl 36.5 | plum 43.7 | rope 51.5 | rag 56.9 | sack 63.2 | zinc 72.7 | silk 79.7 | glass 86.9
  //
  // `night` at L* 27.3 (HSV v32) is the one number that gives ground: the old note kept it at v27 so it sat BELOW
  // every stage floor band (v24-68, two of them at v31-33). It now brushes the Mooring Spine and Gas-Halls floors on
  // value — and it can afford to, because those boots carry a 5 px zinc cap and a 4 px sackcloth ankle wrap, and
  // because this faction had by far the most separation headroom in the game to spend: lost% 20.2 mean against
  // stormcrow 27.5, brassbound 28.9, chandler 35.6. Chroma is what holds the line instead of value (s71 against a
  // floor band at s26-45), which is the same trade the Stormcrow coat made.
  //
  // MEASURED, tools/stage-values.js --faction=gleaning over all seven sections, before -> after:
  //   ink%    33.0 -> 19.1   (the point of the pass; the cast band is 10-27 and the other factions are 6-13)
  //   ovlapC  19.6 -> 17.7   (the number ART_STYLE 3 says to chase — BETTER, not merely paid for)
  //   lostC%  22.5 -> 20.4   dE 23.2 -> 23.3   edge 15.5 -> 15.6   lost% 20.2 -> 20.5   ovlap 18.3 -> 20.1
  // i.e. every mass came up a step and the faction did not give back any of the stage separation it had. The one
  // section that pays is the Heart-Engine, whose brass ground now shares a cell with the lifted sackcloth (8.2 % of
  // the actor's colour mass, ovlap 24.0 -> 29.7). It is also the section this faction reads BEST on — dE 28.1 and
  // lost% 14.5, the highest and lowest of the seven — so that is where the headroom was, and it is where it went.
  night: '#2C1852',   // L* 27.3 — the hip block and the BOOTS: the value that touches the floor
  // OILCLOTH WRAPS, GREENED BY THE TAILINGS, and they are a HUE, not a value. `skin` on this rig is the forearm wraps
  // and the throat, and it used to be `night` — so the arm's elbow crossing and the strip under the hood were both
  // painted in the ink colour. This is the mark that pays for the head/hair ladder pair on the hue-family branch
  // rather than on the exemption this faction used to hold.
  // WHY GREEN AND NOT BROWN. The first version of this wrap was a tarred brown (#4A3624) and it MEASURED WORSE than
  // what it replaced: `stage-values --cells` put its cell (#4a3825) as the single largest colliding mass on SIX of
  // the seven sections at ~5 % each, with its shadow ramp adding another 2-5 — because a warm dark is precisely what
  // every board in this game is built out of (six of seven sit in a 44-76 degree amber wedge, and their SHADOWED
  // timber is the darkest part of it). Hue 138 is the far side of that wedge, no backdrop band in the game sits
  // near it, and against violet cloth it separates harder than the brown did, not less.
  oil: '#28402F',     // 34.6 — forearm wraps and throat: the arm's one crossing, at the elbow where an arm changes
  // THE HOOD'S OWN VALUE. ART_STYLE 0.5 wants a head to be the thing a player finds first; the hood was `night`,
  // which made the head the darkest mass on the rig and the same colour as the boots. It is now the CHROMA carrier
  // (C 13.0, the highest on the body) at L* 36.5: still 43 points under the silk it silhouettes against, so the
  // faction's own silhouette law is untouched, but 23 points over the ink and a clear step off both the throat
  // below it (hue) and the coat under the collar (value).
  cowl: '#452A7A',    // 36.5 — the sack hood. `palette.hair`, so the ladder rule can see it
  plum: '#61407E',    // 43.7 — the coat above the belt
  rope: '#6E6942',    // 51.5 — belts, yoke spars, bag ties, the ballast lines (hemp)
  rag: '#8069A8',     // 56.9 — the trousers, so hips -> thigh -> shin -> boot is dark/mid/mid/dark, not one blot
  // undyed hemp, not ochre. The tan family is the ONE part of this rig that lives in the stage's own colour space:
  // six of seven backdrops sit in a 44-76 degree amber wedge, so this colour walked twelve degrees toward hemp to
  // get its ramp out of those cells, and that walk is HELD here (hue 48, unchanged) — only its VALUE moves.
  // It moves because this is `sleeve`, and ART_STYLE 0.1 calls a light sleeve the single biggest de-blobbing win:
  // at L* 56.1 the sackcloth was a mid, 12 points over the coat it lies on, and the arms and the yoke read as murk.
  // At 63.2 it is a real light on a dark body, 20 points over the coat and 6 under the trousers it crosses at the
  // ankle (where the hue family, not the value, is doing the separating — as it already did at 56).
  sack: '#9C893F',    // 63.2 — upper arms, mitts, ankle wraps and the MANDATORY yoke: the de-blobbing win
  iron: '#4A4E56',    // 42.3 — the ONE dark metal: the Sickle's grapnel, which has to silhouette ON the pale silk
  // pewter-zinc: hooks, gaffs, winch drums, clogs. Held at 72.7 — a 7-point step under the bladder it must never be
  // mistaken for. Never above the shoulders (the goggle lens is `glass`, a different material), never on the bladder.
  zinc: '#9EA9AC',    // 72.7
  silk: '#9CC4D6',    // 79.7 — the gasbag: biggest shape, the only mass above the head
  // GOGGLE GLASS: the brightest value on the rig, and it is 6 px across. That is deliberate — it is the only mark on
  // the body that beats the bladder, so the eye lands on the face first and the bag second, which is the read the
  // silhouette law wants and the old featureless hood could not deliver. It is TINTED rather than near-white (L* 86.9,
  // 7 over the silk) because the 2x2 specular has to read ON it, and on a #CFE4EE lens it did not: the whole disc
  // went white and the head grew a googly eye.
  glass: '#BCD9E8',   // 86.9 — the lens. Colour carries the mood (ART_STYLE 6); rose when the gas is up
  rose: '#FF57B0',    // 70.7 — tailings gas. Flat, no ramp (ART_STYLE 4)
  hot: '#FFD27A',     // the mandated 1-2px hot core inside every glow
  skin: '#E0C4A4',    // 83.6 — only the Harvestman shows a face
};
/**
 * Chalk crop-marks (guild tallies, not clan dye): dry marks on rubberised silk. Spaced against GLEAN.silk (L* 79.7),
 * NOT against white — chaff 42.2 / winnow ochre (hue) / thresher 53.2 / sickle 39.5 / harvestman green (hue).
 */
export const CHALK = { chaff: '#6E6252', winnow: '#D2A44E', thresher: '#C4634E', sickle: '#4A5E7E', harvestman: '#7E9E6A' };
/**
 * The ladder, and every ADJACENT pair of it (ART_STYLE 0.1 wants >= 25 pts of value OR a hue-family change per
 * boundary). Read it as the body reads, bottom to top:
 *   boot (night 27.3) -> sack ankle wrap (63.2, hue) -> shin/thigh (rag 56.9) -> night hip block (27.3) ->
 *   rope belt on top of them (51.5, warm on cool) -> coat (plum 43.7, value + hue off the rope) ->
 *   sackcloth collar / yoke / sleeves (63.2, warm hemp on cool violet) -> oilcloth forearm wrap (34.6, off the
 *   sleeve by 28 points) -> sack mitt (63.2) ... and above the collar, throat (oil 34.6) -> hood (cowl 36.5, a hue
 *   family apart) -> goggle glass (86.9) -> bladder silk (79.7).
 * Every one of those boundaries carries INK as well (belt, ankle wrap, collar, yoke strap, hood opening), rather
 * than relying on the value step alone.
 * `sleeve` is deliberately NOT `primary`, `secondary` (legs) is deliberately NOT `dark` (boots), and `skin` and
 * `hair` are now two real materials rather than two names for the hood colour — which is what retired the five
 * head/hair exemptions this faction used to carry in tools/art-invariants/exemptions.js.
 */
export const GLEAN_PAL = {
  skin: GLEAN.oil, hair: GLEAN.cowl, primary: GLEAN.plum, sleeve: GLEAN.sack, secondary: GLEAN.rag,
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

/**
 * One gas bladder: rubberised silk with a patched seam, the gas inside it, and the hot core.
 * The gas is CLIPPED INSIDE the bag path (ART_STYLE 0.2's material-change branch: the silhouette carries the ink, the
 * glow is a colour change within it). It used to be a free ellipse laid over the top, which at squint scale read as a
 * pink kite stuck on a grey disc rather than as light inside a bag — and on the swelled tell keys it could and did
 * cross the silk's own outline.
 */
function bagBody(ctx, rig, cx, cy, rx, ry, gas) {
  pathEllipse(ctx, cx, cy, rx, ry);
  // sh 0.30 / hi 0.26, down from 0.34 / 0.30: on a shape this big the two bands met as one hard diagonal across the
  // middle and the bladder read as a cut gem. A narrower shadow and a thinner cap leave a wide lit belly, which is
  // what a taut bag looks like.
  celPath(ctx, rig, GLEAN.silk, cx, cy, Math.max(rx, ry), 0.3, 0.26);
  if (rig.override) return;
  const t = tones(rig, GLEAN.silk);
  ctx.save();
  pathEllipse(ctx, cx, cy, rx, ry); ctx.clip();
  ctx.fillStyle = t.deep; ctx.fillRect(R(cx - rx * 0.2), R(cy - ry * 0.9), 1, R(ry * 1.8));    // gore seam: form, no ink
  if (gas > 0.02) {
    const gy = R(cy + ry * 0.22), a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * (0.16 + gas * 0.66);
    ctx.fillStyle = rig.col(GLEAN.rose);
    pathEllipse(ctx, cx, gy, Math.max(3, R(rx * 0.72)), Math.max(2.5, R(ry * 0.52))); ctx.fill();
    ctx.globalAlpha = a0;
    if (gas > 0.6) { ctx.fillStyle = rig.col(GLEAN.hot); ctx.fillRect(R(cx) - 1, gy - 1, 2, 3); }
  }
  ctx.restore();
  // ONE 1px rim on the lit edge of a big shape (ART_STYLE 0.4 / 3), which is the light mark a bag this size is
  // allowed and the celPath cap alone was not giving it: the cap lands inside the silhouette, the rim lands on it.
  rimTop(ctx, rig, R(cx - rx * 0.62), R(cy - ry * 0.82), R(cx + rx * 0.1), R(cy - ry * 0.99), GLEAN.silk);
  // the sackcloth patch: a real MATERIAL on the silk, so it takes ink (0.2), and it is the reason a bag reads as
  // salvage rather than as a balloon. Kept small and low on the shadowed side — at 0.62 rx it was a bar across the
  // widest part of the bag and broke the silhouette it is supposed to decorate.
  if (rx >= 12) band(ctx, rig, R(cx - rx * 0.68), R(cy + ry * 0.24), R(rx * 0.45), 4, GLEAN.sack, 2);
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
/**
 * Rope-lashed yoke under the bag (never zinc, never sackcloth: at sleeve value and 3px it read as a second pair of
 * arms). The spars now leave the body at the SHOULDERS and land on the bag's own shoulders, so a pair of lines
 * passes either side of the hood: the old yoke started at x +-2.5, directly behind the neck, where the head covered
 * both spars and the bag read as a balloon parked above a man rather than as the thing he is hanging from. This is
 * the single mark that answers "blob on a stick", and it is two strokes.
 */
function bagYoke(ctx, rig, cy, spars, rx) {
  const p = rig.p, top = -p.torsoH + 2, sx = R(p.torsoW * 0.5 - 1);
  ctx.strokeStyle = rig.col(GLEAN.rope); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < spars; i++) {
    const f = spars > 1 ? (i - (spars - 1) / 2) / ((spars - 1) / 2) : 0;
    ctx.moveTo(R(f * sx), top); ctx.lineTo(R(f * rx * 0.72), R(cy));
  }
  ctx.stroke();
}
/** The 'bag' chain: the bladder lags the torso on its lines (ART_STYLE 7). Two segments; only the first is used to rotate. */
function bagChain(rig) {
  // rest [0,-1]: the only chain in the cast that hangs UPWARD, because the load is above the anchor. rotGain 0.7 (the
  // Vane queue's value, and the top of the measured band) because the torso ROCK is where a walking Gleaner's swing
  // comes from — the root barely translates in rig space, so a low rotGain left the bladder nailed to the shoulders.
  return getChain(rig, 'bag', 2, { joint: 'torso', rest: [0, -1], stiffness: 0.1, damping: 0.74, gain: 1.5, rotGain: 0.7, maxAng: 22 });
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
  // +23, not +21: two pixels of daylight between the bag's underside and the crown of the hood. The bag still
  // OVERLAPS the head in the coloured render (it is behind it, and the faction's silhouette law wants the hood
  // silhouetted on the silk), but in the black-fill pass the notch is now open and head and bag are two shapes.
  const rx = R(s[0] * k), ry = R(s[1] * k), cx = R(s[2]), cy = R(-(p.torsoH + 23) + s[3] - (ry - s[1]));
  const ch = bagChain(rig), pivot = R(-p.torsoH + 2);
  ctx.save();
  ctx.translate(0, pivot); ctx.rotate(rad(ch.ang[0] * 0.8)); ctx.translate(0, -pivot);   // the load swings on its lines
  bagYoke(ctx, rig, cy + ry * 0.5, b.bagShape === 'canopy' ? 4 : 2, rx);
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
  // the throat: the bag is GATHERED and lashed where the spars meet it. Two rope bands under the belly, which is what
  // makes the silk read as a tied sack rather than as a sphere hovering over a man's shoulders.
  if (!rig.override && b.bagShape !== 'twin') {
    band(ctx, rig, R(cx - rx * 0.26), R(cy + ry * 0.78), R(rx * 0.52), 4, GLEAN.rope, 2);
  }
  if (b.bagShape === 'taut') grapnelCoil(ctx, rig, cx, cy - ry, rx);
  if (b.bags != null || rig.bags != null) bandolier(ctx, rig, cy + ry);
  // the mark has to sit INSIDE silk: on `twin` the centreline is the notch between the two lobes, so ride the near lobe
  const mx = b.bagShape === 'twin' ? cx - R(rx * 0.48) : cx + R(rx * (b.bagShape === 'taut' ? 0.34 : 0.15));
  const my = b.bagShape === 'twin' ? cy + R(ry * 0.1) : cy - R(ry * (b.bagShape === 'taut' ? 0.15 : 0.5));
  cropMark(ctx, rig, mx, my, k, b.chalk || CHALK.chaff, rig.tally || (b.bagShape === 'canopy' ? 4 : 0));
  ctx.restore();
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
/** drawFace options for the one Gleaner who has a face. Module scope: no per-frame allocation inside a hook (ART_STYLE 9). */
const JAW_FACE = { brow: '#2A1C3A', noMouth: false };
/**
 * The lens colour IS the expression (ART_STYLE 6, the sanctioned pattern for a sealed head). No animation data
 * changes: every key of every Gleaning animation already carries `face:`, and this only re-reads it.
 * `rig.tell` beats the face, because the gas coming up is the thing the player has to react to.
 */
function lensColour(rig, face) {
  if (rig.tell) return rig.tellWarn && (rig.tick & 2) ? GLEAN.hot : GLEAN.rose;
  if (face === FACE.dazed) return tones(rig, GLEAN.cowl).sh;      // lights out, and it must be darker than the hood
  if (face === FACE.hurt) return tones(rig, GLEAN.glass).sh;
  return GLEAN.glass;
}
/**
 * Sack hood (head space): ONE unioned path — crown peak, forward brim, back droop and shoulder cape — in `pal.hair`.
 *
 * It used to be a near-black blob painted from GLEAN.night, i.e. the same hex as the boots, the hips and the forearm
 * wraps, with a 5x3 lit chin slot as its only mark. At 1x that is a lump: no facing cue, no focal point, and (the
 * measurement behind it) 5.9 head marks per keyframe against a cast mean of 20.1 — the least-drawn head in the game.
 * Three things fix it and all three are here or in gleanSlot: its own value (`cowl`, 13 L* over the wraps and a hue
 * family off the throat), a real BRIM that points where the rig faces, and an inked opening with a lens in it.
 */
export function gleanHood(ctx, rig, pose, inf) {
  // pal.hair, not a module constant: `hair` is the hood's palette key on this faction (GLEAN_PAL), which is what
  // lets palette/value-ladder-adjacent see the hood/throat boundary that is actually on screen.
  // (drawHead always passes the NEAR palette — a head is never a far part.)
  const r = inf.r, hood = inf.pal.hair;
  celPoly(ctx, rig, [
    R(r * 1.26), R(-r * 0.30),   // brim tip: the facing cue, and the only point forward of the face
    R(r * 1.20), R(r * 0.34),
    R(r * 1.02), R(r * 0.86),
    R(r * 0.40), R(r * 1.16),    // jaw / cape front
    R(-r * 0.86), R(r * 1.06),
    R(-r * 1.40), R(r * 0.34),   // the sack's back droop
    R(-r * 1.28), R(-r * 0.48),
    R(-r * 0.70), R(-r * 1.08),
    R(r * 0.14), R(-r * 1.32),   // crown peak
    R(r * 0.92), R(-r * 1.00),
  ], hood, 0.34, 0.28);
  if (rig.override) return;
  const t = tones(rig, hood);
  ctx.fillStyle = t.deep; ctx.fillRect(R(-r * 0.1), R(-r * 0.78), R(r * 1.2), 2);   // brim shadow, above the opening
  ctx.fillStyle = t.sh; ctx.fillRect(R(-r * 1.12), R(-r * 0.2), 1, R(r * 0.9));     // one fold down the back: form, no ink
  // ONE light mark, on the crown, where the top-left light actually lands (ART_STYLE 0.4)
  rimTop(ctx, rig, R(-r * 0.6), R(-r * 1.16), R(r * 0.55), R(-r * 1.22), hood);
}
/**
 * The face (face hook). Four of five Gleaners are sealed behind a tailings-gas hood, so the face is a GOGGLE — a pale
 * lens on drawFace's own eye row whose colour is the mood, a dead far-eye slot on drawFace's far column, and a
 * sackcloth breather where a chin would be. `build.jawFace` (the Harvestman) lifts the goggles onto the brow and
 * shows a real face instead: the officer is the one who does not need the mask, and that is his rank read.
 *
 * The old version drew a 5x3 sackcloth rectangle and nothing else. It was the whole face, it was the same value as
 * the sleeves and the yoke, and at 1x it read as a tab stuck on a lump — which is why the head, the biggest single
 * complaint about this faction, had no facing cue at all.
 */
export function gleanSlot(ctx, rig, pose, inf) {
  const r = inf.r, face = pose.face | 0, hood = inf.pal.hair;
  const t = tones(rig, hood);
  const look = rig.look, dx = look && Math.abs(look.x) > 0.35 ? Math.sign(look.x) : 0;
  if (rig.build.jawFace) {
    // THE OFFICER. A bare face inside the hood: the goggles are pushed up onto the brow (ART_STYLE 0.5 keeps
    // headgear above the hairline) and the crop has to look him in the eye.
    celPoly(ctx, rig, [R(-r * 0.2), R(-r * 0.5), R(r * 1.02), R(-r * 0.44), R(r * 1.06), R(r * 0.52),
      R(r * 0.4), R(r * 1.0), R(-r * 0.26), R(r * 0.74)], GLEAN.skin, 0.36, 0.3);
    if (rig.override) return;
    drawFace(ctx, rig, r, face, JAW_FACE);
    ctx.fillStyle = tones(rig, GLEAN.skin).deep; ctx.fillRect(R(r * 0.24), R(r * 0.78), 5, 2);   // jaw shadow
    // the lifted goggles: an iron strap across the brow with the two lenses sitting on it, dark-rimmed so they are a
    // fitting and not two more eyes (the old drawstring knot failed exactly that test). Width is set by the HOOD's
    // own contour at that height, not by the head radius: at 1.9r the strap ran past the crown on both sides and
    // read as a bar floating on the bladder behind him.
    band(ctx, rig, R(-r * 0.7), R(-r * 0.98), R(r * 1.5), 4, GLEAN.iron, 1);
    ctx.fillStyle = rig.col(lensColour(rig, face));
    ctx.fillRect(R(r * 0.14), R(-r * 0.94), 4, 3); ctx.fillRect(R(-r * 0.56), R(-r * 0.94), 4, 3);
    return;
  }
  if (rig.override) return;
  // GEOMETRY IS drawFace's OWN (ART_STYLE 6: keep a sealed head's lenses on the row and the columns the bare heads
  // use, so masked and unmasked variants of one faction read as the same species). `ey` is drawFace's eye row, `ex`
  // and `fx` its near and far eye columns, and the two lenses are its two whites with glass in them.
  const ey = R(-r * 0.15), ex = R(r * 0.30), fx = R(-r * 0.42);
  // a. THE OPENING: a real hole cut in the hood, and a hole is a boundary, so it takes ink (ART_STYLE 0.2).
  band(ctx, rig, R(-r * 0.56), R(-r * 0.62), R(r * 1.72), R(r * 1.56), t.deep, 3);
  // b. FAR LENS: the second goggle, dimmed and undersized the way drawFace undersizes the far white. Without it the
  // hood has one eye in the middle of its face, which is a cyclops, not a man in a gas hood.
  ctx.fillStyle = tones(rig, GLEAN.glass).sh; ctx.fillRect(fx + dx, ey - 2, 4, 4);
  // c. NEAR LENS in an IRON socket. The ring is not decoration: a pale disc floating in a dark hole reads as an
  // eyeball, and the whole point of a sealed head is that the eye is a fitting bolted to it.
  band(ctx, rig, ex + dx, ey - 3, 8, 7, GLEAN.iron, 2);
  ctx.fillStyle = rig.col(lensColour(rig, face)); ctx.fillRect(ex + 1 + dx, ey - 2, 6, 5);
  // the shutter = px of iron lid dropped over the TOP of the glass: this rig's version of drawFace's pressed lids
  const shut = face === FACE.closed ? 5
    : (face === FACE.angry || face === FACE.shout || face === FACE.grit) ? 2
      : face === FACE.hurt ? 1 : 0;
  if (shut > 0) { ctx.fillStyle = tones(rig, GLEAN.iron).sh; ctx.fillRect(ex + 1 + dx, ey - 2, 6, shut); }
  if (shut < 3) { ctx.fillStyle = rig.col('#FFFFFF'); ctx.fillRect(ex + 1 + dx, ey - 1, 2, 2); }   // one specular, top-left (the light)
  // d. the breather: sackcloth over the mouth, which is where the old chin slot was and what it should always have
  // been. It opens on `shout` and clamps on `grit` — the expression the lens cannot carry.
  band(ctx, rig, R(-r * 0.34), R(r * 0.44), R(r * 1.24), 5, GLEAN.sack, 1);
  ctx.fillStyle = rig.col(rig.tell ? GLEAN.rose : tones(rig, GLEAN.sack).deep);
  ctx.fillRect(R(-r * 0.1), R(r * 0.44) + (face === FACE.shout ? 1 : 2), R(r * 0.7), face === FACE.grit || face === FACE.angry ? 1 : 2);
}
/**
 * Soot-plum coat (torso space) with the MANDATORY yoke: a sackcloth collar band plus a broad ROPE strap crossing the
 * chest, which is what separates the sackcloth sleeves from the body and carries the chalk crop-marks.
 * The strap used to be sackcloth too, and that was the last blob on this rig: collar, strap and both upper arms are
 * four adjacent shapes and they were all one hex, so at 0.5x squint the whole shoulder girdle merged into a single
 * tan mass with the head sitting on top of it. A strap cannot separate the sleeves from anything while it IS the
 * sleeve colour. Rope is 12 L* under the sackcloth and 8 over the coat with a hue family between it and both, which
 * makes the chest read collar / strap / coat instead of tan / tan / violet — and the yoke is rope-lashed anyway,
 * which is what bagYoke has always drawn above it.
 */
export function gleanCoat(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2), pal = inf.pal;
  celPoly(ctx, rig, [-hw + 1, -H + 3, -hw + 5, -H, hw - 4, -H, hw, -H + 4, hw + 1, R(-H * 0.35), hw - 1, 3, -hw + 1, 3, -hw - 1, R(-H * 0.35)], pal.primary, 0.3, 0.3);
  if (rig.override) return;
  const t = tones(rig, pal.primary);
  ctx.fillStyle = t.deep; ctx.fillRect(-hw + 1, R(-H * 0.14), W - 2, 1);                               // one seam, no skirt fill:
  // the old night-rag skirt made coat -> hips -> thigh -> shin -> boot five adjacent parts at the same hex
  // COLLAR and YOKE STRAP both take ink: sackcloth over coat cloth is a MATERIAL change (0.2, 0.4d), and these two
  // fills were the WHOLE of this faction's error tier -- 66-75 faked boundaries a variant, on the one shape this file
  // calls "the de-blobbing win". A bare fill cannot de-blob anything: with no line the yoke read as a smear of tan.
  band(ctx, rig, -hw - 1, -H + 1, W + 2, 6, pal.sleeve);                                               // collar
  rimTop(ctx, rig, -hw, -H + 1, hw, -H + 1, pal.sleeve);                                               // the shoulder line: one light mark
  ctx.beginPath(); ctx.moveTo(hw - 2, -H + 5); ctx.lineTo(hw - 2, -H + 11); ctx.lineTo(-hw + 2, R(-H * 0.2)); ctx.lineTo(-hw + 2, R(-H * 0.2) - 6); ctx.closePath();
  flat(ctx, rig, GLEAN.rope);                                                                          // 6px yoke strap
  // no tone seam down the strap: on a 6 px band it is a 2 px mark, which renders 1.8 device px on the Chaff and put
  // geom/detail-floor over its organic-mook baseline (5.43 -> 6.43 sub-2 px rects a keyframe). The strap's own ink
  // is the boundary; a shadow inside it was never legible (ART_STYLE 0.7).
  // THE REGULATOR, lashed to the yoke where the bladder's feed enters it. Two jobs: it is the only place on the BODY
  // where the faction's own gas colour appears (every other gram of rose is above the head, which is why the bag read
  // as a balloon parked over a stranger), and its pilot lamp is a third, chest-height channel of the two-channel tell
  // — it reads `rig.gas` exactly as drawBladder does, so it lights on the same frames and never on any other.
  // It rides the BACK half of the chest, where the yoke strap ends and the bag's feed actually comes down, because
  // that is the one part of this torso the carry arm never crosses: at the front it was under a bicep in every idle
  // and walk key, which is a mark the player cannot see.
  const gx = R(-hw * 0.8), gy = R(-H * 0.58);
  band(ctx, rig, gx, gy, 7, 6, pal.metal, 2);
  ctx.fillStyle = tones(rig, pal.metal).deep; ctx.fillRect(gx + 1, gy + 4, 5, 1);
  // FLAT, no ramp (ART_STYLE 4, and geom/glow-flat-and-cored enforces it — a banked-lamp version of this pip painted
  // in tones(rose).sh fired the rule 67-95 times a variant, correctly: a cel band on a glow stops it reading as light).
  // The lamp is therefore always burning and the TELL is the step up to the hot core, which is the same grammar the
  // bladder uses two feet above it.
  ctx.fillStyle = rig.col((rig.gas != null ? rig.gas : 0.25) > 0.6 ? GLEAN.hot : GLEAN.rose);
  ctx.fillRect(gx + 2, gy + 1, 3, 3);
  ctx.fillStyle = rig.col(rig.build.chalk || CHALK.chaff);
  ctx.fillRect(R(hw * 0.1), -H + 2, 2, 4); ctx.fillRect(R(hw * 0.1) - 3, -H + 3, 2, 2);                // chalk tick on the yoke
}
/** Hip block on a rope belt with a zinc ring (hip space): `night`, the value that touches the floor. */
export function gleanHips(ctx, rig, pose, inf) {
  const hip = inf.w, hw = R(hip / 2);
  celRect(ctx, rig, -hw, -5, hip, 11, 3, GLEAN.night, 0.4, 0.2);
  if (rig.override) return;
  // the belt is rope over the hip block: a MATERIAL change, so it takes ink, widened 3 -> 4 px first because a 3 px band
  // inked on both edges leaves 1 px of colour and fails 0.7 harder than the missing line did. It is also the ONE
  // mediator between the coat and the hips, so it has to be a real edge and not a tone.
  band(ctx, rig, -hw + 1, -5, hip - 2, 4, GLEAN.rope);
  ctx.fillStyle = tones(rig, GLEAN.rope).sh; ctx.fillRect(-hw + 2, -2, hip - 4, 1);   // form inside the rope: tone seam
  band(ctx, rig, 1, -6, 4, 4, GLEAN.zinc);                                            // the ring, on the belt it hangs off
}
/** Hooked hand (hand space): a sackcloth mitt against the oilcloth forearm wrap, with a zinc lift-hook. */
export function gleanHand(ctx, rig, pose, inf) {
  drawFist(ctx, rig, inf.r, inf.pal.sleeve);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, inf.pal.sleeve).deep; ctx.fillRect(R(inf.r * 1.3), R(-inf.r * 0.8), 2, R(inf.r * 1.6));
  ctx.strokeStyle = rig.col(inf.pal.metal); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(R(inf.r * 1.5), R(inf.r * 0.9), 3.5, -1.4, 1.9); ctx.stroke();
}
/** Iron-shod clog (ankle space): small pointed foot in `night` with a zinc cap and a sackcloth ankle wrap. */
export function gleanFoot(ctx, rig, pose, inf) {
  drawBoot(ctx, rig, inf.w, inf.h, inf.pal.dark, inf.pal.metal);
  if (rig.override) return;
  const toe = R(inf.w * 0.62);
  // both are MATERIAL changes on the boot (zinc on rag, sackcloth on rag) so both take ink, and the 3 px ankle wrap
  // widens to 4 first rather than being inked down to a single pixel of colour (§0.7).
  band(ctx, rig, toe - 5, -1, 5, 4, inf.pal.metal);                                    // 5px cap: what separates a boot from the deck
  band(ctx, rig, R(-inf.w * 0.4), R(-inf.h) - 4, R(inf.w * 0.8), 4, inf.pal.sleeve);   // sack ankle wrap: the boot/shin edge
}
/**
 * Complete Gleaning part table. Arms and legs are deliberately UNHOOKED: rig.js's drawLimbSegs draws each limb as one
 * unioned shape with the second material (here the oilcloth wrap, `palette.skin`) clipped inside that silhouette, which
 * is the ART_STYLE 0.7 "one crossing per limb" result the faction rigs that DO hook their limbs had to be rewritten
 * to get. Sackcloth sleeve above the elbow, oilcloth below it, sack mitt on the end.
 */
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
  // `tw` is the torso ROCK, and it is not decoration: a body hanging off a gasbag pendulums, and with the torso pinned
  // at -3 for all eight keys the walk read as a pair of legs under a statue. It also drives the 'bag' chain, which
  // lags the bladder off the torso's own rotation — so one number buys the swing at both ends of the rig.
  const walk = (lr, ll, ar, al, ty, sq, tw, hd) => K({ legR: lr, legL: ll, armR: ar, armL: al, torso: tw, head: hd, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1 });
  // lean 18, not 10: ART_STYLE 8 asks a run for a real lean and anim/locomotion-shape measures the cast at 20-33.
  // A Gleaner runs by pulling its own bag along, so the lean is what the arms are doing anyway.
  const run = (lr, ll, ar, al, ty, sq) => K({ legR: lr, legL: ll, armR: ar, armL: al, torso: 18, head: -6, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, face: 'angry' });
  const flee = (lr, ll, i, ty) => K({ legR: lr, legL: ll, armR: [-150 + i * 12, -24], armL: [-168 - i * 8, -20], torso: 4, head: -8 + i * 4, root: [0, ty], face: 'hurt' });
  const anims = {
    // idle: the whole body swings under the bag instead of breathing from the chest. The torso range is widened
    // 3 -> 6 degrees so the 'bag' chain has something to lag against: at +-1.5 the bladder never moved, and a rig
    // whose whole silhouette is a bag needs the bag to be the thing that breathes (ART_STYLE 1, 8).
    idle: { loop: true, frames: [
      FK(14, K({ torso: -1, head: 4, root: [0, 0] }), { ease: 'inout' }),
      FK(13, K({ torso: -7, head: 9, root: [1, -1], armR: AD(aR, 3, 2), armL: AD(aL, -3, 2), squash: 0.99, stretch: 1.01 }), { ease: 'inout' }),
      FK(14, K({ torso: -2, head: 5, root: [0, 1], armR: AD(aR, -2, -1), armL: AD(aL, 2, -1) }), { ease: 'inout' }),
      FK(13, K({ torso: -6, head: 8, root: [-1, 0], armR: AD(aR, 1, 1), armL: AD(aL, -1, 1) }), { ease: 'inout' }),
    ] },
    // walk: a light, toe-first drift — contact / down / pass / up x2. The free arm swings ~38 deg biased BACK (the old
    // +-9 read as locked arms over a striding pair of legs) and the tool on the 'line' chain swings with it.
    walk: { loop: true, frames: [
      FK(4, walk([30, 4], [-24, 18], AD(aR, -20, 2), AD(aL, 18, 2), 1, 1, 0, 4), { ease: 'out' }),
      FK(4, walk([22, 14], [-14, 30], AD(aR, -10, 0), AD(aL, 6, 0), 2, 1.03, -6, 9), { ease: 'out' }),
      FK(4, walk([6, 26], [2, 14], AD(aR, 6, -2), AD(aL, -10, -2), 0, 1, -2, 6), { ease: 'inout' }),
      FK(4, walk([-10, 18], [20, 2], AD(aR, 18, -2), AD(aL, -20, -2), -1, 1, -8, 10), { ease: 'in' }),
      FK(4, walk([-24, 18], [30, 4], AD(aR, 18, 2), AD(aL, -20, 2), 1, 1, 0, 4), { ease: 'out' }),
      FK(4, walk([-14, 30], [22, 14], AD(aR, 6, 0), AD(aL, -10, 0), 2, 1.03, -6, 9), { ease: 'out' }),
      FK(4, walk([2, 14], [6, 26], AD(aR, -10, -2), AD(aL, 6, -2), 0, 1, -2, 6), { ease: 'inout' }),
      FK(4, walk([20, 2], [-10, 18], AD(aR, -20, -2), AD(aL, 18, -2), -1, 1, -8, 10), { ease: 'in' }),
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
