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
import { celRect, celBall, celPoly, celCapsule, tones, rimTop } from '../../art/shading.js';
import { drawFist, drawBoot, drawSkull, drawFace } from '../../art/rigParts.js';
import { getChain } from '../../art/secondary.js';
import { jointScreen } from '../../art/rig.js';
import { floatText } from '../../art/fx.js';
import { particles } from '../../engine/particles.js';
import { audio } from '../../engine/audio.js';
import { rad } from '../../engine/math.js';
import { FLOOR_TOP, ST } from '../../constants.js';
import { FK } from './common.js';

const R = Math.round, TAU = Math.PI * 2;

/** Chandlery colour constants (L* in the spec order: the game's first pale-bodied faction; darks at the extremities only). */
export const CH = {
  outline: '#20180F',      // pitch tallow, a warm tar-black
  limedust: '#C2AE84',     // the long buttoned waxed-canvas coat (palette.primary)
  quicklime: '#E6ECDC',    // apron panel, sleeve wraps, gaiters, the dust on every boot (palette.sleeve)
  leather: '#7C5F3C',      // belts, straps, cart shafts, bracers (palette.secondary)
  rubber: '#2B2620',       // hose, gauntlets, respirator bar, boots, kiln body (palette.dark) — SMALL AREAS ONLY
  pewter: '#6C7A74',       // tongs, shovel, cane ferrule, tally-tag, lamp bodies (palette.metal)
  lime: '#D8FF6E',         // the lamp, the floor cone, the tether, the rite rim
  hot: '#FFD27A',          // 1-2px hot core inside every lime glow (ART_STYLE 4)
  dead: '#3A3A34',         // dead lamp glass
  idleGlass: '#8FA34A',    // lamp lit but idle
  skin: '#DFC7A8', hair: '#6B5A44', shade: '#5E8A46',
};
/** Value ladder: limedust coat > quicklime apron / wraps / gaiters > leather bracers and belts > rubber boots, gloves, mask. */
export const CH_PAL = {
  skin: CH.skin, hair: CH.hair, primary: CH.limedust, sleeve: CH.quicklime, secondary: CH.leather,
  accent: CH.pewter, metal: CH.pewter, dark: CH.rubber, glow: CH.lime,
};
/** Long arms for the outstretched carry; height = 14 + 13 + 5 - 2 + 25 - 2 + 3 + 18 = 74 px at scale 1. */
export const CH_PROPS = {
  headR: 9, neck: 3, neckR: 3, torsoW: 22, torsoH: 25, hip: 19, upperArm: 14, lowerArm: 14, armR: 4.5, handR: 5,
  upperLeg: 14, lowerLeg: 13, legR: 5, footL: 12, footH: 5, bulge: 0.35, shoulderX: 3, hipX: 4,
};
/** Per-variant wax seal on the tally-tag (build.clan). */
export const CLAN = { wickboy: '#E8D9A8', tallyman: '#F2F0E4', limeburner: '#A8482A', purser: '#D08A2E', resurrectionist: '#5B5F62' };

const EMPTY = Object.freeze({});
const HEAD_MASKED = Object.freeze({ noNose: true, jaw: 0.44 });
const HEAD_BARE = Object.freeze({ jaw: 0.4 });
const FACE_MASK = Object.freeze({ big: true, noMouth: true, eyeY: -2 });
const FACE_BARE = Object.freeze({ big: true, eyeY: -1, mouthY: 1 });

// ---------------------------------------------------------------- parts
/** Human skull under a canvas cap; the respirator covers the nose on every variant but the Wickboy. */
export function chHead(ctx, rig, pose, inf) {
  const r = inf.r, pal = inf.pal, ch = rig.build.chand || EMPTY;
  if (ch.face === 'none') {
    // Resurrection Man: a flat leather cowl and nothing else — no skin, no eyes
    celBall(ctx, rig, 0, 0, r, pal.secondary);
    if (rig.override) return;
    ctx.fillStyle = tones(rig, pal.secondary).deep; ctx.fillRect(R(-r * 0.9), R(-r * 0.2), R(r * 1.8), 2);
    return;
  }
  drawSkull(ctx, rig, r, pal.skin, pal.hair, ch.face === 'bare' ? HEAD_BARE : HEAD_MASKED);
}
/** Eyes + brows above the bar, the dark rubber respirator across the nose, a bare jaw below it (ART_STYLE 0.5 rows). */
export function chFace(ctx, rig, pose, inf) {
  const r = inf.r, ch = rig.build.chand || EMPTY;
  if (ch.face !== 'none') drawFace(ctx, rig, r, pose.face | 0, ch.face === 'bare' ? FACE_BARE : FACE_MASK);
  if (ch.face === 'bare') return;
  const y = R(r * 0.34), w = R(r * 1.95);
  celRect(ctx, rig, R(-r * 0.95), y, w, 4, 1, CH.rubber, 0.4, 0);
  if (rig.override) return;
  ctx.fillStyle = rig.col(CH.pewter); ctx.fillRect(R(r * 0.4), y + 1, 3, 2);            // filter stud
  ctx.fillStyle = rig.col(CH.quicklime); ctx.fillRect(R(-r * 0.9), y, w - 2, 1);        // lime dust on the top edge
}
/** Flat-topped waxed-canvas cap with a short brim, above the hairline; 'peaked' for the Purser's officer cap. */
export function chHat(ctx, rig, pose, inf) {
  const r = inf.r, ch = rig.build.chand || EMPTY;
  if (ch.cap === 'none') return;
  const peaked = ch.cap === 'peaked', col = ch.capCol || CH.limedust, y = R(-r);
  const crown = peaked ? 9 : 6;
  celRect(ctx, rig, R(-r * 0.95), y - crown, R(r * 1.9), crown + 1, 1, col, 0.36, 0.3);
  celPoly(ctx, rig, [R(-r * 1.1), y - 1, R(r * 1.45), y - 2, R(r * 1.5), y + 2, R(-r * 1.1), y + 2], col, 0.4, 0.2);
  if (rig.override) return;
  const t = tones(rig, col);
  ctx.fillStyle = t.deep; ctx.fillRect(R(-r * 0.95), y - 2, R(r * 1.9), 2);
  if (peaked) { ctx.fillStyle = rig.col(CH.pewter); ctx.fillRect(R(-r * 0.2), y - crown + 2, 4, 4); }
  else { ctx.fillStyle = t.sh; ctx.fillRect(R(-r * 0.9), y - crown + 1, 3, crown - 1); }
  // Tallyman: the green celluloid eyeshade is the UNDERSIDE of the brim, not a second dark band across the eyes
  if (ch.shade) { ctx.fillStyle = rig.col(CH.shade); ctx.fillRect(R(-r * 0.6), y, R(r * 2.05), 2); }
}
/** The numbered lead tally-tag on a wire with the variant's wax seal (>= 3x3, ART_STYLE 0.7). */
function chTallyTag(ctx, rig, x, y) {
  celBall(ctx, rig, x, y + 4, 3, CH.pewter, false);
  if (rig.override) return;
  ctx.strokeStyle = rig.col(CH.pewter); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x - 4, y - 2); ctx.lineTo(x, y + 2); ctx.stroke();
  ctx.fillStyle = rig.col(rig.build.clan || CLAN.wickboy); ctx.fillRect(x - 1, y + 3, 3, 3);
}
/** Long buttoned waxed-canvas coat with a flaring skirt, a quicklime apron panel and the tally-tag at the throat. */
export function chTorso(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2), pal = inf.pal;
  celPoly(ctx, rig, [-hw - 1, -H + 5, -hw + 4, -H, hw - 4, -H, hw + 2, -H + 5, hw + 3, R(-H * 0.45), hw + 5, 6, hw - 4, 8, -hw + 3, 8, -hw - 4, 6, -hw - 2, R(-H * 0.45)], pal.primary, 0.38, 0.28);
  celPoly(ctx, rig, [2, -H + 5, hw - 2, -H + 3, hw + 2, R(-H * 0.45), hw + 4, 5, 1, 7], pal.sleeve, 0.4, 0.25);
  if (rig.override) return;
  const t = tones(rig, pal.primary);
  ctx.fillStyle = t.deep; ctx.fillRect(-2, -H + 3, 3, H + 4);
  ctx.fillStyle = rig.col(pal.metal); ctx.fillRect(-2, R(-H * 0.62), 3, 3); ctx.fillRect(-2, R(-H * 0.26), 3, 3);
  ctx.fillStyle = tones(rig, pal.sleeve).sh; ctx.fillRect(R(hw * 0.3), R(-H * 0.2), R(hw * 0.6), 2);
  chTallyTag(ctx, rig, R(-hw * 0.25), -H + 3);
}
/** Harness-leather belt block: the faction carries its load at the WAIST, and this is where it hangs. */
export function chHips(ctx, rig, pose, inf) {
  const hip = inf.w, hw = R(hip / 2), pal = inf.pal;
  celRect(ctx, rig, -hw, -5, hip, 11, 3, pal.secondary, 0.4, 0.2);
  if (rig.override) return;
  const t = tones(rig, pal.secondary);
  ctx.fillStyle = rig.col(pal.sleeve); ctx.fillRect(-hw + 1, -5, hip - 2, 2);
  ctx.fillStyle = t.deep; ctx.fillRect(-hw + 1, 0, hip - 2, 2);
  ctx.fillStyle = rig.col(pal.metal); ctx.fillRect(0, -5, 4, 5);
}
/** Leather bracer with a quicklime sleeve wrap at the elbow (limb space: origin at the elbow, +y along the forearm). */
export function chArmLower(ctx, rig, pose, inf) {
  const r = inf.r, len = inf.len, pal = inf.pal;
  celRect(ctx, rig, -r, 0, r * 2, len + 1, r, pal.secondary, 0.4, 0.2);
  if (rig.override) return;
  ctx.fillStyle = rig.col(pal.sleeve); ctx.fillRect(-r, 0, r * 2, 4);
  ctx.fillStyle = tones(rig, pal.sleeve).sh; ctx.fillRect(-r, 3, r * 2, 1);
}
/** Quicklime gaiter over the shin with one leather strap (limb space: origin at the knee). */
export function chLegLower(ctx, rig, pose, inf) {
  const r = inf.r, len = inf.len, pal = inf.pal;
  celRect(ctx, rig, -r, 0, r * 2, len + 1, r, pal.sleeve, 0.4, 0.25);
  if (rig.override) return;
  ctx.fillStyle = rig.col(pal.secondary); ctx.fillRect(-r, len - 7, r * 2, 3);
  ctx.fillStyle = tones(rig, pal.secondary).deep; ctx.fillRect(-r, len - 4, r * 2, 1);
}
/** Rubber boot with a pewter buckle and a cap of lime dust on the toe (ankle space, toe toward +x). */
export function chFoot(ctx, rig, pose, inf) {
  drawBoot(ctx, rig, inf.w, inf.h, inf.pal.dark, inf.pal.metal);
  if (rig.override) return;
  const toe = R(inf.w * 0.62), sole = R(inf.h * 0.5);
  ctx.fillStyle = rig.col(inf.pal.sleeve); ctx.fillRect(toe - 6, sole - 4, 5, 3);
}
/** Rubber gauntlet with a quicklime wrist cuff. */
export function chHand(ctx, rig, pose, inf) {
  drawFist(ctx, rig, inf.r, inf.pal.dark);
  if (rig.override) return;
  ctx.fillStyle = rig.col(inf.pal.sleeve); ctx.fillRect(R(-inf.r * 0.6) - 2, R(-inf.r), 2, R(inf.r * 2));
}
/** Complete Chandlery part table. */
export const CH_PARTS = { head: chHead, face: chFace, hat: chHat, torso: chTorso, hips: chHips, armLower: chArmLower, legLower: chLegLower, foot: chFoot, hand: chHand };

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
  ctx.fillStyle = t.deep; ctx.fillRect(x0, y0 + 1, w, 1); ctx.fillRect(x0, y0 + h - 2, w, 1);
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
const CONE_HALF = 35, DASH = [3, 3], NODASH = [];
/** Where the cone lands: the recipient, or (Resurrection Man) the cart behind his heels. */
function riteSpotX(f, cam) {
  const t = f.riteTarget;
  if (t && t !== f) return cam.toScreenX(t.x);
  const ch = f.rig.build.chand || EMPTY;
  return cam.toScreenX(f.x + f.facing * (ch.selfConeDX != null ? ch.selfConeDX : 26));
}
function riteSpotZ(f) { const t = f.riteTarget; return t && t !== f ? t.z : f.z; }
/**
 * THE SHUTTER CONE (drawBefore): a hard-edged limelight cone flat on the floor from the lamp to the recipient, with a
 * 2px pitch-tallow outline so it reads on the Heart-Engine's pale marble as well as on wet planks. Strobes on tellWarn.
 */
export function drawRiteCone(ctx, f, cam) {
  if ((f.rig.lamp | 0) !== 2) return;
  const fr = f.anim.frame;
  if (!(fr && fr.tell)) return;
  const L = lampScreen(f), tx = riteSpotX(f, cam), ty = R(FLOOR_TOP + riteSpotZ(f) + cam.shakeY);
  const strobe = f.rig.tellWarn && (f.rig.tick & 2) ? 0.72 : 0.5;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(L.x, L.y);
  ctx.lineTo(tx - CONE_HALF, ty - 5);
  ctx.quadraticCurveTo(tx, ty + 8, tx + CONE_HALF, ty - 5);
  ctx.closePath();
  ctx.globalAlpha = strobe; ctx.fillStyle = CH.lime; ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = CH.outline; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}
/** The tether (drawAfter): 1px dashed limelight from the lamp to the recipient's chest, going SOLID on the active frame. */
export function drawRiteTether(ctx, f, cam) {
  const t = f.riteTarget;
  if (!t || t === f || t.dead || (f.rig.lamp | 0) !== 2) return;
  const L = lampScreen(f), tx = cam.toScreenX(t.x), ty = R(FLOOR_TOP + t.z + cam.shakeY) - R(t.h * 0.55);
  ctx.save();
  ctx.strokeStyle = CH.lime; ctx.lineWidth = 1;
  ctx.setLineDash(f.riteHold > 0 ? NODASH : DASH);
  ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(tx, ty); ctx.stroke();
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
  onSpawn(f) { f.riteTarget = null; f.riteBroken = 0; f.riteHold = 0; f.rig.lamp = 1; },
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
      f.riteBroken = 90; f.riteHold = 0; f.riteTarget = null; f.rig.lamp = 0;
      floatText(f.x, f.y + f.h + 10, f.z, 'RITE BROKEN', CH.lime, 1);
      audio.play('gear_slip');
    }
    return undefined;
  },
  drawBefore(ctx, f, sx, sy, cam) { drawRiteCone(ctx, f, cam); },
  drawAfter(ctx, f, sx, sy, cam) { drawRiteTether(ctx, f, cam); },
  // cosmetic only: the lamp glass shatters, the tethers drop. The rites themselves pop from their own onTick.
  onDeath(f, world) {
    f.rig.lamp = 0; f.riteTarget = null; f.riteHold = 0;
    const y = f.y + f.h * 0.5;
    particles.burst('spark', f.x, y, f.z, 9, { speed: 3, up: 2, color: CH.lime, color2: CH.hot });
    particles.burst('debris', f.x, y, f.z, 4, { speed: 2.4, up: 2.6, color: CH.pewter });
    if (world) world.addFx('ring', f.x, R(f.h * 0.45), f.z, { r0: 4, r1: 26, color: CH.lime });
    audio.play('prop_break');
  },
};

// ---------------------------------------------------------------- shared base animation set
/**
 * LIGHT OUT FRONT, LOAD AT THE WAIST. Every key leans `o.stoop` degrees forward (0 for the Purser, the one straight
 * back in the faction) with the head down, the lamp arm out in front at hip height and the off hand hanging BACK
 * behind the load, so §0.6 open-rest falls out for free: nothing crosses the torso or the face.
 * States: idle 4 / walk 8 / run 8 / jump 3 / fall 2 / land 2 / hurt 3 / stagger 2 / hurtAir / knockdown / lying 2 /
 * getup 3 / dead 2 / dodge 5, plus the engine grab set (o.grab) for the Resurrection Man.
 * @param {object} c rest carry { armR, armL, weapon, weaponBack?, grip? }
 * @param {{ stoop?: number, head?: number, weaponFloor?: number, grab?: boolean }} o
 */
export function makeChandlerBase(c, o = {}) {
  const S = o.stoop != null ? o.stoop : 14, HD = o.head != null ? o.head : 2, wf = o.weaponFloor != null ? o.weaponFloor : -24;
  const K = (s) => ({ torso: S, head: HD, legR: [8, 4], legL: [-8, 6], ...c, ...s });
  const aR = c.armR, aL = c.armL, A = (a, du, dl) => [a[0] + du, a[1] + dl];
  const FLOOR = { armR: [-20, -6], weapon: wf, armL: [30, 20], torso: 2, head: -12, legR: [12, 10], legL: [-4, 8], root: [24, -8, -88], grip: 0, weaponBack: 0, face: 'dazed' };
  const walk = (lr, ll, al, ty, sq, fr, fl, hb) => K({ legR: lr, legL: ll, armL: al, armR: A(aR, 2, -2), torso: S + 3, head: HD + (hb || 0), root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, footR: fr || 0, footL: fl || 0 });
  const run = (lr, ll, al, ty, sq) => K({ legR: lr, legL: ll, armL: al, armR: A(aR, -10, -6), torso: S + 16, head: HD - 6, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, face: 'angry' });
  const anims = {
    // breathing carry: the lamp arm drifts 2 deg, the coat skirt settles, the head nods
    idle: { loop: true, frames: [
      FK(14, K({ root: [0, 0] }), { ease: 'inout' }),
      FK(13, K({ torso: S + 3, head: HD + 2, root: [0, 1], armR: A(aR, 2, -2), armL: A(aL, 3, 2), squash: 1.02, stretch: 0.98 }), { ease: 'inout' }),
      FK(14, K({ torso: S + 1, head: [HD - 1, 1, 0], root: [0, 0], armR: A(aR, 1, -1) }), { ease: 'inout' }),
      FK(13, K({ torso: S - 1, head: [HD + 1, 0, 0], root: [0, 0], armR: A(aR, -1, 1), armL: A(aL, -3, -2) }), { ease: 'inout' }),
    ] },
    // trudging contractor's walk: contact / down (+2, squash) / pass / up (-1) x2; the off arm swings biased BACK
    walk: { loop: true, frames: [
      FK(4, walk([28, 4], [-22, 16], A(aL, 12, -4), 0, 0, -8, 0, 0), { ease: 'out' }),
      FK(4, walk([22, 12], [-14, 28], A(aL, 6, -6), 2, 1.04, 0, 0, 2), { ease: 'out' }),
      FK(4, walk([6, 24], [0, 10], A(aL, -8, -8), 1, 0, 0, 0, 1), { ease: 'inout' }),
      FK(4, walk([-10, 12], [16, -2], A(aL, -22, -10), -1, 0, 0, -6, -2), { ease: 'in' }),
      FK(4, walk([-22, 16], [28, 4], A(aL, -34, -12), 0, 0, 0, -8, 0), { ease: 'out' }),
      FK(4, walk([-14, 28], [22, 12], A(aL, -28, -12), 2, 1.04, 0, 0, 2), { ease: 'out' }),
      FK(4, walk([0, 10], [6, 24], A(aL, -16, -10), 1, 0, 0, 0, 1), { ease: 'inout' }),
      FK(4, walk([16, -2], [-10, 12], A(aL, -2, -6), -1, 0, -6, 0, -2), { ease: 'in' }),
    ] },
    run: { loop: true, frames: [
      FK(3, run([52, 14], [-40, 56], A(aL, 40, -34), -2), { ease: 'out' }),
      FK(3, run([40, 30], [-30, 70], A(aL, 22, -30), 1, 1.05), { ease: 'out' }),
      FK(3, run([10, 40], [10, 30], A(aL, -12, -26), -4), { ease: 'inout' }),
      FK(3, run([-24, 50], [40, 8], A(aL, -42, -26), -3), { ease: 'in' }),
      FK(3, run([-40, 56], [52, 14], A(aL, -52, -28), -2), { ease: 'out' }),
      FK(3, run([-30, 70], [40, 30], A(aL, -38, -30), 1, 1.05), { ease: 'out' }),
      FK(3, run([10, 30], [10, 40], A(aL, -2, -30), -4), { ease: 'inout' }),
      FK(3, run([40, 8], [-24, 50], A(aL, 28, -34), -3), { ease: 'in' }),
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
        FK(10, K({ ...G, armR: [-148, 0], armL: [-148, 0], torso: -26, head: HD - 14, root: [-6, 5], legR: [28, 10], legL: [-22, 24], face: 'grit' }), { punish: true, ease: 'inout' }),
        FK(6, K({ torso: S + 4 }), { ease: 'out' }),
      ] },
    });
  }
  return anims;
}

export { FK, getChain, celRect, celBall, celPoly, celCapsule, tones, rimTop, rad, TAU };
