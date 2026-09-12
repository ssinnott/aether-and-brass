// Spawn-modifier art (issue #28 part 3). game/traits.js SPAWN_MODS adds accessories that look their drawing up BY NAME in
// MOD_ART at draw time; this module fills the names in when the enemy registry loads (content/enemies/index.js imports it), so
// the game layer never imports content and a stage can name a mod before its art exists without anything throwing.
// Every hook draws in the local space rig.js sets up for its attach point (ART_STYLE 5): 'back' / 'torso' = torso space, origin
// at the hip centre, y up negative, facing right. Cel rules apply: 1 px outline on every new boundary, three flat tones, no
// gradients, integer coordinates for details, `rig.col()` for raw colours so the hit flash still works, nothing under 2 px.
import { registerModArt } from '../../game/traits.js';
import { drawBladder } from './gleaningRig.js';
import { CH } from './chandlerRig.js';
import { celBall, celRect, tones } from '../../art/shading.js';

const R = Math.round;
/**
 * Weathered hemp of the Gleaning's patch plates. Measured against every colour it actually touches (ART_STYLE 0.1 wants
 * >= 25% luminance separation OR a hue-family change on each adjacent pair): brass 0.39, the hemp stripe it crosses 0.29,
 * the plum plastron 126 deg of hue. The old #AE9B4B sat 3.8% and 7 deg off BRASS.brass — drawn over the pauldron gear,
 * the two read as one gold blob.
 */
const HEMP_PLATE = '#6E6136';
/**
 * The rivets punched through that plate. NOT GLEAN.iron: the plate is the only thing they are ever drawn on, and
 * tones(rig, GLEAN.iron).base is #4A4E56, which measures 0.19 against the plate and 0.22 against its shadow band —
 * both under the 0.25 the rule above is written to. Too dark to be iron-in-daylight, which is the point: these are
 * punched through hemp from the inside, in the shadow of the plate.
 */
const RIVET_IRON = '#2A2620';

/**
 * 'winged': the Gleaning's own bladder, strapped on. drawBladder is self-contained — it reads rig.p / rig.build.bagShape (the mod
 * sets 'slack', the Chaff's bag) / rig.swell / rig.gas (the mod's onUpdate lights it while airborne) and lazily makes its own swing
 * chain — so a Brassbound or a goblin hangs under exactly the silk a Gleaner does, and inherits the bag weak point above the head.
 */
registerModArt('bladder', drawBladder);

/**
 * 'scrip': the Company's lime-ringed badge pinned beside the Sootborn's numbered brass one (gobTorso paints that at
 * (hw*0.35, -H*0.6); this sits the same height, a badge-width toward the back). A pewter tally disc inside a 2 px lime ring.
 */
registerModArt('scripBadge', (ctx, rig) => {
  const p = rig.p, hw = R(p.torsoW / 2), x = R(hw * 0.35) - 9, y = -R(p.torsoH * 0.6);
  celBall(ctx, rig, x, y, 4.5, CH.lime, false);
  if (rig.override) return;
  ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fillStyle = rig.col(CH.pewter); ctx.fill();
  ctx.fillStyle = tones(rig, CH.pewter).deep; ctx.fillRect(x - 1, y - 1, 2, 2);
});

/**
 * 'salvaged': a hemp-coloured patch plate riveted down the FRONT edge of the torso, clear of the aether-core window at the
 * centre (the tell must stay readable) and crossing both plastron bands. Two iron rivets, 2 px, top and bottom.
 */
registerModArt('salvagePlate', (ctx, rig) => {
  const p = rig.p, hw = R(p.torsoW / 2), H = p.torsoH;
  // x0 >= 8, not hw*0.45: brassTorsoB draws the aether-core bezel as a radius-6 ball at x 0 (-7..+7 with its outline), and
  // 0.45 put the plate's edge at x 5 on every Brassbound variant — over the bezel the hook's own docstring promises to clear.
  const x0 = Math.max(8, R(hw * 0.45)), w = hw - x0 + 2, y0 = -R(H * 0.75), h = R(H * 0.6);
  celRect(ctx, rig, x0, y0, w, h, 1, HEMP_PLATE, 0.36, 0.28);
  if (rig.override) return;
  ctx.fillStyle = rig.col(RIVET_IRON);
  // 3x3, not 2x2: ART_STYLE 0.7 bans studs and sets the floor for a buckle-class mark at 3x3, and 2 px is the floor
  // itself rather than clearance — on the Sapper's 0.9 scale a 2 px rivet measured under 2 device px.
  const rx = x0 + R(w / 2) - 2;
  ctx.fillRect(rx, y0 + 2, 3, 3); ctx.fillRect(rx, y0 + h - 5, 3, 3);
});
