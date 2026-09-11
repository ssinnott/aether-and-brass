// Spawn-modifier art (issue #28 part 3). game/traits.js SPAWN_MODS adds accessories that look their drawing up BY NAME in
// MOD_ART at draw time; this module fills the names in when the enemy registry loads (content/enemies/index.js imports it), so
// the game layer never imports content and a stage can name a mod before its art exists without anything throwing.
// Every hook draws in the local space rig.js sets up for its attach point (ART_STYLE 5): 'back' / 'torso' = torso space, origin
// at the hip centre, y up negative, facing right. Cel rules apply: 1 px outline on every new boundary, three flat tones, no
// gradients, integer coordinates for details, `rig.col()` for raw colours so the hit flash still works, nothing under 2 px.
import { registerModArt } from '../../game/traits.js';
import { drawBladder, GLEAN } from './gleaningRig.js';
import { CH } from './chandlerRig.js';
import { celBall, celRect, tones } from '../../art/shading.js';

const R = Math.round;
/** Weathered hemp of the Gleaning's patch plates: a step lighter than the yoke (GLEAN.sack) so the plate separates from the hemp stripe under it. */
const HEMP_PLATE = '#AE9B4B';

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
  const x0 = R(hw * 0.45), w = hw - x0 + 2, y0 = -R(H * 0.75), h = R(H * 0.6);
  celRect(ctx, rig, x0, y0, w, h, 1, HEMP_PLATE, 0.36, 0.28);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, GLEAN.iron).base;
  const rx = x0 + R(w / 2) - 1;
  ctx.fillRect(rx, y0 + 2, 2, 2); ctx.fillRect(rx, y0 + h - 4, 2, 2);
});
