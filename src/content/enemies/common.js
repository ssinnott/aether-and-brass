// Shared authoring helpers for enemy content: faction rig part hooks (Brassbound / Sootborn), the enemy animation
// builder and the def assembly helper. Pure data + small draw hooks (ARCHITECTURE.md section 14). No game logic.
import { makeBaseAnims, strike, frontBox, areaBox, STYLES } from '../../art/animLib.js';
import { P } from '../../art/poses.js';
import { rrect, circle, pathPoly, paint, line, gear } from '../../art/shapes.js';

export { strike, frontBox, areaBox, STYLES, P };

/** GDD rig sizes were written for a 48px base; the engine rig is ~72px (RECONCILIATION: x1.4). */
export const GDD_SCALE = 1.4;
/** Faction colours (GDD 1 / 3 / 4). */
export const BRASS = { steel: '#7F8C99', darkSteel: '#4A5563', brass: '#C89B3C', lens: '#4DF0E0', lensTell: '#FF5C5C' };
export const SOOT = { skin: '#6BA84F', shade: '#3F6B2E', rags: '#5A4A3A', scrap: '#B0B0B0', eye: '#F2C94C' };
export const OUTLINE = '#2B2B30';

// ---------------------------------------------------------------- Brassbound hooks
/** Boxy automaton head with one lens (cyan, red while `rig.tell` is set by the AI during wind-ups). */
export function brassHead(ctx, rig, pose, info) {
  const r = info.r, ol = rig.col(rig.outline), pal = rig.palette;
  rrect(ctx, -r, -r, r * 2, r * 2, 3, rig.col(pal.primary), ol, rig.ow);
  ctx.fillStyle = rig.col('rgba(0,0,0,0.22)'); ctx.fillRect(-r + 1, 1, r * 2 - 2, r - 2);
  ctx.fillStyle = rig.col(pal.secondary); ctx.fillRect(-r + 2, -r + 2, r * 2 - 4, 3);
  circle(ctx, r * 0.35, -r * 0.1, r * 0.34, rig.col(rig.tell ? BRASS.lensTell : pal.glow), ol, 1);
  if (rig.tell) { ctx.fillStyle = rig.col('rgba(255,92,92,0.35)'); ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.1, r * 0.6, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = rig.col('#ffffff'); ctx.fillRect(r * 0.2, -r * 0.3, 1.5, 1.5);
  ctx.fillStyle = rig.col(pal.accent); ctx.fillRect(-r * 0.6, r * 0.45, r * 0.8, 2); // jaw plate
}
export function noFace() {}
/** Rigid torso plate with the aether-core window and the regiment stripe (`rig.build.stripe`). */
export function brassTorso(ctx, rig, pose, info) {
  const w = info.w, h = info.h, ol = rig.col(rig.outline), pal = rig.palette;
  rrect(ctx, -w / 2, -h, w, h + 4, 3, rig.col(pal.primary), ol, rig.ow);
  ctx.fillStyle = rig.col('rgba(0,0,0,0.22)'); ctx.fillRect(-w / 2 + 1, -h / 2, w - 2, h / 2 + 2);
  ctx.fillStyle = rig.col(rig.build.stripe || '#3E5C8A'); ctx.fillRect(-w / 2 + 2, -h + 3, w - 4, 4);
  circle(ctx, 0, -h * 0.45, Math.max(3, w * 0.16), rig.col(rig.tell ? BRASS.lensTell : pal.glow), ol, 1);
  ctx.fillStyle = rig.col('rgba(255,255,255,0.35)'); ctx.fillRect(-1, -h * 0.45 - 2, 1.5, 1.5);
  // gear pauldrons
  gear(ctx, w / 2, -h + 2, 5, 6, rig.col(pal.accent), ol, 1, 0, 1.5);
  gear(ctx, -w / 2, -h + 2, 5, 6, rig.col(pal.accent), ol, 1, 0.3, 1.5);
}
/** Wind-up key on the back; the AI spins `rig.keyAngle` while the automaton acts. */
export function windKey(ctx, rig) {
  const p = rig.p, ol = rig.col(rig.outline), a = rig.keyAngle || 0;
  const x = -p.torsoW / 2 - 3, y = -p.torsoH * 0.55;
  rrect(ctx, x - 6, y - 2, 8, 4, 1, rig.col(rig.palette.accent), ol, 1);
  ctx.save(); ctx.translate(x - 8, y); ctx.rotate(a);
  rrect(ctx, -2, -7, 4, 14, 1, rig.col(rig.palette.accent), ol, 1);
  circle(ctx, 0, -7, 3, rig.col(rig.palette.accent), ol, 1); circle(ctx, 0, 7, 3, rig.col(rig.palette.accent), ol, 1);
  ctx.restore();
}
/** Ball-jointed limb segment (any limb part hook). */
export function brassLimb(ctx, rig, pose, info) {
  const ol = rig.col(rig.outline), r = info.r, len = info.len;
  rrect(ctx, -r + 1, 0, r * 2 - 2, len, 2, rig.col(info.far ? rig.paletteFar.secondary : rig.palette.secondary), ol, rig.ow);
  circle(ctx, 0, 0, r * 0.9, rig.col(info.far ? rig.paletteFar.accent : rig.palette.accent), ol, 1);
}
/** Plate boot. */
export function brassFoot(ctx, rig, pose, info) {
  const ol = rig.col(rig.outline);
  rrect(ctx, -info.w * 0.35, -info.h * 0.5, info.w, info.h, 1, rig.col(rig.palette.dark), ol, rig.ow);
  ctx.fillStyle = rig.col(rig.palette.accent); ctx.fillRect(-info.w * 0.35 + 2, -info.h * 0.5 + 1, info.w - 4, 1.5);
}

// ---------------------------------------------------------------- Sootborn hooks
/** Oversized goblin head: nose triangle, ear triangles, yellow eye. */
export function sootHead(ctx, rig, pose, info) {
  const r = info.r, ol = rig.col(rig.outline), pal = rig.palette;
  pathPoly(ctx, [-r * 0.5, -r * 0.2, -r * 1.6, -r * 0.9, -r * 0.6, r * 0.3]); paint(ctx, rig.col(pal.skin), ol, 1.5); // back ear
  circle(ctx, 0, 0, r, rig.col(pal.skin), ol, rig.ow);
  ctx.fillStyle = rig.col('rgba(0,0,0,0.18)'); ctx.beginPath(); ctx.arc(0, 0, r - 1, 0.1, Math.PI - 0.1); ctx.fill();
  pathPoly(ctx, [r * 0.7, -r * 0.1, r * 1.7, r * 0.1, r * 0.7, r * 0.45]); paint(ctx, rig.col(pal.skin), ol, 1.5); // nose
  ctx.fillStyle = rig.col(pal.glow); ctx.fillRect(r * 0.15, -r * 0.45, 3.5, 3); // eye
  ctx.fillStyle = rig.col(rig.outline); ctx.fillRect(r * 0.3, -r * 0.4, 1.5, 2);
  ctx.fillStyle = rig.col(rig.outline); ctx.fillRect(r * 0.2, r * 0.5, r * 0.6, 1.5); // grin
  ctx.fillStyle = rig.col('#ffffff'); ctx.fillRect(r * 0.55, r * 0.5, 2, 2);
}
/** Numbered brass badge on the chest (every Sootborn wears one). */
export function sootBadge(ctx, rig) {
  const p = rig.p, ol = rig.col(rig.outline);
  circle(ctx, p.torsoW * 0.15, -p.torsoH * 0.6, 3.5, rig.col(BRASS.brass), ol, 1);
  ctx.fillStyle = rig.col(rig.outline); ctx.fillRect(p.torsoW * 0.15 - 1, -p.torsoH * 0.6 - 1.5, 1.5, 3);
}
/** Ragged torso with a clan-colour sash. */
export function sootTorso(ctx, rig, pose, info) {
  const w = info.w, h = info.h, ol = rig.col(rig.outline), pal = rig.palette;
  rrect(ctx, -w / 2, -h, w, h + 4, 5, rig.col(pal.primary), ol, rig.ow);
  ctx.fillStyle = rig.col('rgba(0,0,0,0.22)'); ctx.fillRect(-w / 2 + 1, -h / 2, w - 2, h / 2 + 2);
  ctx.save(); ctx.beginPath(); ctx.rect(-w / 2, -h, w, h + 4); ctx.clip();
  ctx.fillStyle = rig.col(rig.build.clan || '#9A4A22');
  ctx.beginPath(); ctx.moveTo(-w / 2, -h + 2); ctx.lineTo(-w / 2 + 6, -h); ctx.lineTo(w / 2, h * 0.1); ctx.lineTo(w / 2 - 6, h * 0.25); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- weapons (hand space: +x along the forearm)
export function drawClub(ctx, rig) {
  const ol = rig.col(rig.outline);
  rrect(ctx, -4, -2, 20, 4, 2, rig.col('#6a4a2a'), ol, rig.ow);
  rrect(ctx, 12, -4, 10, 8, 3, rig.col('#4a3018'), ol, rig.ow);
}
export function drawHalberd(ctx, rig) {
  const ol = rig.col(rig.outline), pal = rig.palette;
  rrect(ctx, -14, -1.5, 58, 3, 1, rig.col('#5a3a22'), ol, rig.ow);
  pathPoly(ctx, [34, -3, 46, -12, 54, -8, 56, 0, 50, 6, 36, 3]); paint(ctx, rig.col(pal.metal), ol, rig.ow);
  pathPoly(ctx, [44, -1, 62, -1, 44, 1]); paint(ctx, rig.col(pal.metal), ol, 1);
}
export function drawMace(ctx, rig) {
  const ol = rig.col(rig.outline), pal = rig.palette;
  rrect(ctx, -6, -2, 30, 4, 2, rig.col('#4a4a52'), ol, rig.ow);
  circle(ctx, 28, 0, 7, rig.col(pal.metal), ol, rig.ow);
  ctx.fillStyle = rig.col(pal.metal); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; pathPoly(ctx, [28 + Math.cos(a) * 6, Math.sin(a) * 6, 28 + Math.cos(a) * 11, Math.sin(a) * 11, 28 + Math.cos(a + 0.5) * 6, Math.sin(a + 0.5) * 6]); paint(ctx, rig.col(pal.metal), ol, 1); }
}
export function drawRapier(ctx, rig) {
  const ol = rig.col(rig.outline), pal = rig.palette;
  circle(ctx, 2, 0, 4, rig.col(pal.accent), ol, 1);
  rrect(ctx, 4, -1, 40, 2, 1, rig.col(pal.metal), ol, 1.5);
}
export function drawKnife(ctx, rig) {
  const ol = rig.col(rig.outline);
  rrect(ctx, -3, -2, 8, 4, 1, rig.col('#4a3020'), ol, 1);
  pathPoly(ctx, [5, -2.5, 18, -1, 5, 2.5]); paint(ctx, rig.col(SOOT.scrap), ol, 1.5);
}
export function drawSling(ctx, rig, pose) {
  const ol = rig.col(rig.outline), t = (pose.weapon && pose.weapon.rot) || 0;
  line(ctx, 0, 0, 12, -10 - Math.abs(t) * 0.05, rig.col('#5a4a3a'), 2);
  circle(ctx, 12, -10 - Math.abs(t) * 0.05, 3.5, rig.col('#8a8a80'), ol, 1);
}
export function drawNozzle(ctx, rig) {
  const ol = rig.col(rig.outline);
  rrect(ctx, -4, -3, 18, 6, 2, rig.col('#6a6a70'), ol, rig.ow);
  rrect(ctx, 14, -2, 6, 4, 1, rig.col(BRASS.brass), ol, 1);
  circle(ctx, 22, 0, 2, rig.col('#F08A24'), null, 0);
}
export function drawAnvilClub(ctx, rig) {
  const ol = rig.col(rig.outline);
  rrect(ctx, -8, -2.5, 44, 5, 2, rig.col('#5a3a22'), ol, rig.ow);
  pathPoly(ctx, [30, -9, 58, -9, 62, -3, 62, 6, 30, 8]); paint(ctx, rig.col('#4a4a52'), ol, rig.ow);
  ctx.fillStyle = rig.col('rgba(255,255,255,0.25)'); ctx.fillRect(34, -7, 22, 2);
}
export function drawWhip(ctx, rig, pose) {
  const ol = rig.col(rig.outline), w = (pose.weapon && pose.weapon.rot) || 0;
  rrect(ctx, -3, -2, 10, 4, 1, rig.col('#4a3020'), ol, 1);
  ctx.strokeStyle = rig.col('#3a2a1a'); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(7, 0);
  for (let i = 1; i <= 6; i++) ctx.lineTo(7 + i * 7, Math.sin(i * 1.3 + w * 0.05) * (2 + i * 0.8));
  ctx.stroke();
}
/** Tower shield in the off hand (accessory attach 'handL'). */
export function drawShield(ctx, rig) {
  if (rig.shieldStripped) return;
  const ol = rig.col(rig.outline);
  rrect(ctx, -6, -24, 22, 46, 4, rig.col(rig.tell ? '#4DF0E0' : '#3A3A44'), ol, rig.ow);
  rrect(ctx, -2, -18, 14, 34, 3, rig.col(rig.tell ? '#8ff8f0' : '#5B2A86'), ol, 1);
  circle(ctx, 5, -1, 3, rig.col(BRASS.brass), ol, 1);
}
/** Cape (back accessory, torso space). */
export function drawCape(ctx, rig) {
  const p = rig.p, ol = rig.col(rig.outline);
  pathPoly(ctx, [-p.torsoW / 2 + 2, -p.torsoH + 2, -p.torsoW / 2 - 10, p.torsoH * 0.6, -p.torsoW / 2 + 4, p.torsoH * 0.4]); paint(ctx, rig.col('#2E4A6B'), ol, rig.ow);
}
/** Bomb backpack (back accessory). */
export function drawBombPack(ctx, rig) {
  const p = rig.p, ol = rig.col(rig.outline);
  rrect(ctx, -p.torsoW / 2 - 9, -p.torsoH + 4, 10, p.torsoH - 6, 3, rig.col('#5a4a3a'), ol, rig.ow);
  for (let i = 0; i < 3; i++) circle(ctx, -p.torsoW / 2 - 4, -p.torsoH + 9 + i * 7, 3.2, rig.col('#2a2a30'), ol, 1);
}
/** Fuel tank backpack (back accessory). */
export function drawTank(ctx, rig) {
  const p = rig.p, ol = rig.col(rig.outline);
  rrect(ctx, -p.torsoW / 2 - 10, -p.torsoH + 2, 11, p.torsoH - 2, 5, rig.col('#8a4a2a'), ol, rig.ow);
  ctx.fillStyle = rig.col('#F08A24'); ctx.fillRect(-p.torsoW / 2 - 8, -p.torsoH + 6, 7, 3);
  line(ctx, -p.torsoW / 2 - 4, -p.torsoH + 2, p.torsoW / 2, -p.torsoH * 0.4, rig.col('#3a3a40'), 2);
}
/** Shoulder smokestack (torso accessory). */
export function drawStack(ctx, rig) {
  const p = rig.p, ol = rig.col(rig.outline);
  rrect(ctx, -p.torsoW / 2 - 2, -p.torsoH - 12, 6, 14, 1, rig.col('#2a2a30'), ol, rig.ow);
}
/** Stolen top hat + monocle (head accessory). */
export function drawTopHat(ctx, rig, pose, r = rig.p.headR) {
  const ol = rig.col(rig.outline);
  rrect(ctx, -r - 3, -r * 0.7, r * 2 + 6, 3, 1, rig.col('#1a1418'), ol, 1);
  rrect(ctx, -r + 1, -r * 0.7 - 14, r * 2 - 2, 14, 1, rig.col('#1a1418'), ol, rig.ow);
  ctx.fillStyle = rig.col(rig.build.clan || '#7A1E2A'); ctx.fillRect(-r + 1, -r * 0.7 - 5, r * 2 - 2, 3);
  circle(ctx, r * 0.35, -r * 0.1, 2.5, null, rig.col(BRASS.brass), 1);
}
/** Bandana (head accessory). */
export function drawBandana(ctx, rig) {
  const r = rig.p.headR, ol = rig.col(rig.outline);
  rrect(ctx, -r - 1, -r * 0.8, r * 2 + 2, 4, 1, rig.col(rig.build.clan || '#9A4A22'), ol, 1);
  pathPoly(ctx, [-r, -r * 0.6, -r - 7, -r * 0.2, -r - 2, r * 0.2]); paint(ctx, rig.col(rig.build.clan || '#9A4A22'), ol, 1);
}
/** Flat cap (head accessory). */
export function drawCap(ctx, rig) {
  const r = rig.p.headR, ol = rig.col(rig.outline);
  pathPoly(ctx, [-r - 1, -r * 0.5, r + 5, -r * 0.5, r, -r - 2, -r + 2, -r - 3]); paint(ctx, rig.col(rig.build.clan || '#D9A62B'), ol, 1.5);
}
/** Welding goggles (head accessory). */
export function drawWeldGoggles(ctx, rig) {
  const r = rig.p.headR, ol = rig.col(rig.outline);
  ctx.fillStyle = rig.col('#2a2a30'); ctx.fillRect(-r + 1, -r * 0.55, r * 2 - 2, 3);
  circle(ctx, r * 0.3, -r * 0.45, 3.5, rig.col('#3a4a3a'), ol, 1); circle(ctx, -r * 0.4, -r * 0.45, 3.5, rig.col('#3a4a3a'), ol, 1);
}
/** Crested helmet (head accessory). */
export function drawCrest(ctx, rig) {
  const r = rig.p.headR, ol = rig.col(rig.outline);
  pathPoly(ctx, [-r * 0.4, -r, r * 0.6, -r, r * 0.3, -r - 9, -r * 0.7, -r - 9]); paint(ctx, rig.col(rig.build.stripe || '#8A2E2E'), ol, 1.5);
}
/** Half mask (head accessory). */
export function drawHalfMask(ctx, rig) {
  const r = rig.p.headR, ol = rig.col(rig.outline);
  rrect(ctx, -r * 0.2, -r * 0.5, r * 1.1, r * 0.9, 2, rig.col('#DDE6EE'), ol, 1);
}
/** Collar + wrist chains (torso accessory). */
export function drawCollar(ctx, rig) {
  const p = rig.p, ol = rig.col(rig.outline);
  rrect(ctx, -p.torsoW / 2 - 2, -p.torsoH - 2, p.torsoW + 4, 6, 2, rig.col(rig.build.clan || '#B8692E'), ol, 1.5);
}

// ---------------------------------------------------------------- animation builder
/**
 * Build a complete enemy animation table: base set + named attacks + stagger.
 * attacks: { name: { style, tell, active, recovery, reach, dmg, type, kbX, kbY, hitstun, behind, area, low, high, move, sfx, tellSfx, hitSfx,
 *   event, projectile, armor, invuln, hitboxes, extraActive, rehit, once, fx, aimEvent } }
 */
export function makeEnemyAnims({ carry = {}, attacks = {}, extra = {} }) {
  const anims = makeBaseAnims(carry);
  for (const name of Object.keys(attacks)) anims[name] = enemyAttack(attacks[name], carry);
  anims.stagger = { loop: true, frames: [
    { dur: 6, pose: P({ ...carry, torso: -14, head: -10, root: [-2, 2, -6], legR: [15, 10], legL: [-10, 12], armL: [-40, -30] }) },
    { dur: 6, pose: P({ ...carry, torso: -10, head: 8, root: [2, 2, 6], legR: [12, 8], legL: [-8, 10], armL: [-30, -40] }) },
  ] };
  anims.flee = anims.run;
  Object.assign(anims, extra);
  return anims;
}

/** One telegraphed enemy attack: tell (wind-up, `tell:true` frames light the lens red) -> active -> recovery -> return. */
export function enemyAttack(o, carry = {}) {
  const st = STYLES[o.style] || STYLES.swing;
  const hit = { damage: o.dmg != null ? o.dmg : 6, type: o.type || 'light', kbX: o.kbX != null ? o.kbX : 3, kbY: o.kbY || 0, hitstun: o.hitstun || 16, once: o.once !== false, rehit: o.rehit };
  const hb = o.hitboxes ? null : (o.hitbox || (o.area ? areaBox(o.area, hit) : frontBox(o.reach || 40, hit, { low: o.low, high: o.high, behind: o.behind })));
  const frames = [];
  const tellFrames = o.tell || 20;
  const w = { dur: Math.max(1, Math.round(tellFrames * 0.6)), pose: st.w, tell: true, sfx: o.tellSfx, armor: o.armor || undefined, event: o.aimEvent };
  frames.push(w);
  frames.push({ dur: Math.max(1, tellFrames - w.dur), pose: P({ ...st.w, root: [(st.w.root ? st.w.root.x : 0) - 2, st.w.root ? st.w.root.y : 0] }), tell: true, armor: o.armor || undefined, interp: true });
  const h = { dur: o.active || 8, pose: st.h, sfx: o.sfx, fx: o.fx, move: o.move, armor: o.armor || undefined, invuln: o.invuln || undefined, event: o.event, projectile: o.projectile, summon: o.summon, radius: o.radius, hit: o.hit, shake: o.shake, offset: o.offset };
  if (o.hitboxes) h.hitboxes = o.hitboxes; else if (!o.noHitbox) h.hitbox = hb;
  if (o.hitSfx) h.hitSfx = o.hitSfx;
  frames.push(h);
  if (o.extraActive) for (const ex of o.extraActive) frames.push({ dur: ex.dur || 4, pose: ex.pose || st.h, hitbox: ex.hitbox, hitboxes: ex.hitboxes, event: ex.event, projectile: ex.projectile, move: ex.move, fx: ex.fx, sfx: ex.sfx, radius: ex.radius, hit: ex.hit, summon: ex.summon });
  frames.push({ dur: o.recovery || 20, pose: st.r, punish: true });
  frames.push({ dur: 6, pose: P({ ...carry, torso: 6 }) });
  return { loop: false, frames };
}

/**
 * Assemble an enemy def from a base and a variant patch. Numbers follow ARCHITECTURE section 8.
 * @param {object} base { type, build, anims, walkSpeed, sfx, ai }
 * @param {object} v { variant, name, role, hp, damage, speed, score, drops, build, anims, ai, ...flags }
 */
export function makeEnemyDef(base, v) {
  const walk = (base.walkSpeed || 1.6) * (v.speed || 1);
  return {
    id: `${base.type}:${v.variant}`, type: base.type, variant: v.variant, name: v.name, role: v.role || 'fodder', faction: base.faction,
    build: { ...base.build, ...(v.build || {}) },
    anims: v.anims || base.anims,
    hp: v.hp, maxHp: v.hp, damageMult: v.damage != null ? v.damage : 1, walkSpeed: walk, runSpeed: walk * 1.6, score: v.score || 100, drops: v.drops || 'none',
    elite: !!v.elite, armor: !!v.armor, unlaunchable: !!v.unlaunchable, grabbable: v.grabbable, grabbableByGrappler: v.grabbableByGrappler,
    throwDamageMult: v.throwDamageMult != null ? v.throwDamageMult : base.throwDamageMult, damageTaken: v.damageTaken || 1,
    lyingFrames: v.lyingFrames || 40, sfx: { ...(base.sfx || {}), ...(v.sfx || {}) },
    ai: { ...(base.ai || {}), ...(v.ai || {}) },
    onSpawn: v.onSpawn || null, onDeath: v.onDeath || null, onUpdate: v.onUpdate || null,
    moves: v.moves || null,
  };
}

// ================================================================ Brassbound clockwork rig (ART_STYLE.md pass)
// Upgraded cel-shaded automaton parts + the shared base animation set used by content/enemies/brassbound.js. Every hook draws in
// the local space rig.js sets up (limbs: origin at the joint, +y along the segment; hand/weapon: +x along the forearm; torso:
// origin at the hip centre, y up negative; head: origin at the head centre). Far-side parts colour from `inf.pal`.
import { celRect, celBall, celPoly, celPath, celCapsule, tones } from '../../art/shading.js';
import { drawFist } from '../../art/rigParts.js';
import { FACE } from '../../art/poses.js';
import { pathGear } from '../../art/shapes.js';

const RB = Math.round, TAU2 = Math.PI * 2;
/** Brassbound outline (ART_STYLE 3). */
export const BRASS_OUTLINE = '#1A1E24';
/** Base Brassbound value ladder: steel plates (light) over a dark-steel skeleton with brass ball joints; mid-steel fists. */
export const BRASS_PAL = { skin: '#6E7A88', hair: '#4A5563', primary: '#8593A0', sleeve: '#4A5563', secondary: '#4A5563', accent: '#C89B3C', joint: '#C89B3C', metal: '#C8D0D8', dark: '#2E3340', glow: '#4DF0E0' };
/** GDD rig sizes x1.4: 17px head, 22x26 torso, 8px limbs, 12px plate feet (~74px tall at scale 1). */
export const BRASS_PROPS = { headR: 8.5, neck: 3, neckR: 3, torsoW: 22, torsoH: 26, hip: 18, upperArm: 13, lowerArm: 12, armR: 4, handR: 4.5, upperLeg: 14, lowerLeg: 13, legR: 4.5, footL: 12, footH: 5, bulge: 0, shoulderX: 3, hipX: 4 };
/** Keyframe shorthand: FK(dur, poseSpec, extraFrameFields). */
export const FK = (dur, spec, extra) => ({ dur, pose: P(spec), ...(extra || {}) });

/** Boxy automaton head (head space): rounded 17px plate, dark brow band, brass jaw plate, hinge bolt at the back. */
export function brassHeadB(ctx, rig, pose, inf) {
  const r = inf.r, pal = inf.pal;
  celRect(ctx, rig, -r, -r, r * 2, r * 2, 3, pal.primary, 0.34, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(pal.secondary); ctx.fillRect(-r + 2, -r + 3, r * 2 - 4, 3);
  ctx.fillStyle = rig.col(pal.accent); ctx.fillRect(-RB(r * 0.5), RB(r * 0.5), RB(r * 1.3), 3);
  ctx.fillStyle = tones(rig, pal.primary).sh; ctx.fillRect(-RB(r * 0.5), RB(r * 0.5) + 3, RB(r * 1.3), 1);
  celBall(ctx, rig, -r + 3, 0, 2.5, pal.accent, false);
}
/**
 * The lens (face hook): brass bezel + glass. Cyan at rest, RED while `rig.tell` (attack wind-up), white blinks in the last tell
 * frames (`rig.tellWarn`) and during the Duelist's stance flash (`rig.stanceFlash`), flickers dim on `face: hurt`, dead grey on `dazed`.
 */
export function brassLensB(ctx, rig, pose, inf) {
  const r = inf.r, face = pose.face | 0, cx = RB(r * 0.35), cy = -1;
  const dead = face === FACE.dazed, tell = rig.tell && !dead;
  const blink = (rig.tick & 2) !== 0;
  const flash = tell && ((rig.tellWarn && blink) || (rig.stanceFlash > 12 && (((rig.stanceFlash / 3) | 0) & 1) === 1));
  const col = dead ? '#3A3F4B' : flash ? '#FFFFFF' : tell ? BRASS.lensTell : (face === FACE.hurt && blink ? '#2A6660' : rig.palette.glow);
  if (tell && !rig.override) { ctx.fillStyle = flash ? 'rgba(255,255,255,0.3)' : 'rgba(255,92,92,0.3)'; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU2); ctx.fill(); }
  celBall(ctx, rig, cx, cy, 5, rig.palette.accent, false);
  ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, TAU2); ctx.fillStyle = rig.col(col); ctx.fill();
  if (rig.override || dead) return;
  ctx.fillStyle = rig.col('#FFFFFF'); ctx.fillRect(cx - 2, cy - 2, 2, 2);
}
/** Rigid torso plate (torso space): square shoulders, regiment stripe (`build.stripe`), aether-core window (red on tells). */
export function brassTorsoB(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = RB(W / 2), pal = inf.pal;
  celPoly(ctx, rig, [-hw - 1, -H + 3, -hw + 2, -H, hw - 2, -H, hw + 1, -H + 3, hw, 1, -hw, 1], pal.primary, 0.36, 0.28);
  if (rig.override) return;
  const t = tones(rig, pal.primary), face = pose.face | 0;
  ctx.fillStyle = rig.col(rig.build.stripe || '#3E5C8A'); ctx.fillRect(-hw + 2, -H + 5, W - 4, 4);
  ctx.fillStyle = t.deep; ctx.fillRect(-hw + 2, -H + 9, W - 4, 1);
  ctx.fillStyle = t.sh; ctx.fillRect(-hw + 2, -RB(H * 0.2), W - 4, 1);
  const cy = -RB(H * 0.44);
  const col = face === FACE.dazed ? '#3A3F4B' : rig.tell ? BRASS.lensTell : pal.glow;
  celBall(ctx, rig, 0, cy, 6, pal.accent, false);
  ctx.beginPath(); ctx.arc(0, cy, 4, 0, TAU2); ctx.fillStyle = rig.col(col); ctx.fill();
  if (face !== FACE.dazed) { ctx.fillStyle = rig.col('#FFFFFF'); ctx.fillRect(-3, cy - 3, 2, 2); }
}
/** Gear pauldron at the shoulder joint (shoulder hook, torso space); ticks round with the wind-up key while the automaton acts. */
export function brassPauldronB(ctx, rig, pose, inf) {
  const p = rig.p, hw = RB(p.torsoW / 2), a = (rig.keyAngle || 0) * 0.5 * (inf.far ? -1 : 1);
  // the shoulder joints sit near the torso centre: push the gear out to the torso's top corner so it clears the stripe / core
  const dx = inf.far ? -hw + 4 + p.shoulderX + 2 : hw - 3 - p.shoulderX, dy = inf.far ? 0 : -1;
  pathGear(ctx, dx, dy, 6.5, 6, a, 2);
  celPath(ctx, rig, inf.pal.accent, dx, dy, 6.5, 0.36, 0.3);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, inf.pal.accent).deep; ctx.fillRect(dx - 1, dy - 1, 3, 3);
}
/** Ball-jointed limb segment (any limb hook): dark-steel bar with a brass ball at the joint. */
export function brassLimbB(ctx, rig, pose, inf) {
  const r = inf.r, pal = inf.pal;
  celCapsule(ctx, rig, 0, r * 0.6, 0, inf.len - 1, r - 0.5, pal.secondary, 0); // clip-free bar (perf: no celRect clips on limbs)
  celBall(ctx, rig, 0, 0, r * 0.95, pal.joint || pal.accent, false);
}
/** Plate boot (ankle space): steel plate with a deep sole and a brass toe cap. */
export function brassFootB(ctx, rig, pose, inf) {
  const w = inf.w, h = inf.h, pal = inf.pal, heel = RB(w * 0.4), toe = RB(w * 0.62);
  celPoly(ctx, rig, [-heel, -h, toe - 3, -h, toe, -h + 2, toe, 2, -heel, 2], pal.primary, 0.34, 0.3);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, pal.primary).deep; ctx.fillRect(-heel, 1, toe + heel, 2);
  ctx.fillStyle = rig.col(pal.accent); ctx.fillRect(toe - 4, -h + 2, 4, 3);
}
/** Mitten fist with a brass wrist ball (hand space). */
export function brassHandB(ctx, rig, pose, inf) {
  drawFist(ctx, rig, inf.r, inf.pal.skin);
  celBall(ctx, rig, -1, 0, 2.5, inf.pal.joint || inf.pal.accent, false);
}
/** Pelvis plate with a brass buckle plate (hip space). */
export function brassHipsB(ctx, rig, pose, inf) {
  const hw = RB(inf.w / 2), pal = inf.pal;
  celRect(ctx, rig, -hw, -5, inf.w, 10, 2, pal.secondary, 0.4, 0.2);
  if (rig.override) return;
  ctx.fillStyle = rig.col(pal.accent); ctx.fillRect(-2, -4, 5, 4);
}
/**
 * Wind-up key on the back (back accessory, torso space): brass shaft + a flat double-loop bow that spins around the shaft
 * (`rig.keyAngle`, advanced by the AI while the automaton walks / attacks, frozen while staggered: the universal "it's open" read).
 */
export function brassKeyB(ctx, rig) {
  const p = rig.p, pal = rig.palette, x = -RB(p.torsoW / 2) - 1, y = -RB(p.torsoH * 0.6);
  const bh = Math.max(2.5, Math.abs(Math.cos(rig.keyAngle || 0)) * 8);
  celCapsule(ctx, rig, x - 8, y, x, y, 2, pal.accent, 0);
  celCapsule(ctx, rig, x - 11, y - bh + 2.5, x - 11, y + bh - 2.5, 2.5, pal.accent, 0);
  if (rig.override || bh <= 4) return;
  ctx.fillStyle = tones(rig, pal.accent).deep;
  ctx.fillRect(x - 13, RB(y - bh) + 2, 3, RB(bh) - 3); ctx.fillRect(x - 13, RB(y) + 1, 3, RB(bh) - 3);
}
/** Soft steam puff (no outline, merged discs); fillStyle must be set by the caller. */
export function brassPuff(ctx, x, y, r, alpha) {
  if (alpha <= 0.02) return;
  const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * alpha;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU2); ctx.arc(x - r * 0.8, y + r * 0.45, r * 0.7, 0, TAU2); ctx.arc(x + r * 0.75, y + r * 0.5, r * 0.6, 0, TAU2); ctx.fill();
  ctx.globalAlpha = a0;
}
/** Complete Brassbound part table. */
export const BRASS_PARTS = { head: brassHeadB, face: brassLensB, torso: brassTorsoB, shoulder: brassPauldronB, armUpper: brassLimbB, armLower: brassLimbB, legUpper: brassLimbB, legLower: brassLimbB, foot: brassFootB, hand: brassHandB, hips: brassHipsB };
export const BRASS_KEY = { attach: 'back', draw: brassKeyB };

/** Arm shorthand: nudge an [upper, lower] pair. */
const AD = (a, du, dl) => [a[0] + du, a[1] + dl];
/** Body face-down on the floor (root rot +88: the back and the wind-up key face up; body-space +y runs along the ground toward the feet). */
const FLOOR_POSE = { armR: [-24, -4], weapon: -24, armL: [25, 20], torso: 4, head: -10, legR: [10, 8], legL: [-4, 6], root: [-30, -9, 88] };

/**
 * Shared Brassbound base animation set (idle 4 / walk 8 / run 8 / jump / fall / land / hurt 3 / stagger 4 / hurtAir / knockdown /
 * lying 2 / getup 3 / dead), parameterised by the rest carry `c` ({ armR, armL, weapon, legR?, legL? }).
 * o.stagger: partial pose merged into the gear-slip keys (e.g. the Warden lowers his shield); o.weaponFloor: weapon.rot while lying;
 * o.holdOffArm: the off arm stays in its carry during walk / run (a strapped shield must not wave about).
 */
export function makeBrassBase(c, o = {}) {
  const st = o.stagger || {}, wf = o.weaponFloor != null ? o.weaponFloor : -24, hold = !!o.holdOffArm;
  const floor = { ...FLOOR_POSE, weapon: wf };
  const walk = (lr, ll, al, ty, sq, fr, fl) => ({ ...c, legR: lr, legL: ll, armL: hold ? c.armL : al, torso: 5, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, footR: fr || 0, footL: fl || 0 });
  const run = (lr, ll, al, ty, sq) => ({ ...c, armR: AD(c.armR, 10, -6), legR: lr, legL: ll, armL: hold ? AD(c.armL, 20, -20) : al, torso: 20, head: -4, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1 });
  return {
    idle: { loop: true, frames: [
      FK(14, { ...c, torso: 1, root: [0, 0] }, { ease: 'inout' }),
      FK(14, { ...c, torso: 3, head: 1, root: [0, 1], armR: AD(c.armR, 2, -2), armL: AD(c.armL, -2, -2) }, { ease: 'inout' }),
      FK(12, { ...c, torso: 2, head: 2, root: [0, 1], armR: AD(c.armR, 1, -1) }, { ease: 'inout' }),
      FK(14, { ...c, torso: 0, head: -1, root: [0, 0], armR: AD(c.armR, -1, 1), armL: AD(c.armL, 1, 1) }, { ease: 'inout' }),
    ] },
    // stiff marching gait: contact / down (root +2, squash) / pass / up (root -1) x2; the free arm swings biased back
    walk: { loop: true, frames: [
      FK(4, walk([28, 4], [-22, 16], [6, -6], 0, 0, -8, 0), { ease: 'out' }),
      FK(4, walk([22, 12], [-14, 28], [-2, -8], 2, 1.03, 0, 0), { ease: 'out' }),
      FK(4, walk([6, 24], [0, 10], [-14, -12], 1), { ease: 'inout' }),
      FK(4, walk([-10, 12], [16, -2], [-30, -14], -1, 0, 0, -6), { ease: 'in' }),
      FK(4, walk([-22, 16], [28, 4], [-42, -16], 0, 0, 0, -8), { ease: 'out' }),
      FK(4, walk([-14, 28], [22, 12], [-36, -16], 2, 1.03), { ease: 'out' }),
      FK(4, walk([0, 10], [6, 24], [-22, -14], 1), { ease: 'inout' }),
      FK(4, walk([16, -2], [-10, 12], [-8, -10], -1, 0, -6, 0), { ease: 'in' }),
    ] },
    run: { loop: true, frames: [
      FK(3, run([52, 14], [-40, 56], [40, 50], -2), { ease: 'out' }),
      FK(3, run([40, 30], [-30, 70], [20, 50], 1, 1.04), { ease: 'out' }),
      FK(3, run([10, 40], [10, 30], [-10, 40], 2), { ease: 'inout' }),
      FK(3, run([-24, 50], [40, 8], [-40, 40], -3), { ease: 'in' }),
      FK(3, run([-40, 56], [52, 14], [-50, 40], -3), { ease: 'out' }),
      FK(3, run([-30, 70], [40, 30], [-30, 44], 1, 1.04), { ease: 'out' }),
      FK(3, run([10, 30], [10, 40], [0, 46], 2), { ease: 'inout' }),
      FK(3, run([40, 8], [-24, 50], [30, 50], -3), { ease: 'in' }),
    ] },
    jump: { loop: false, frames: [
      FK(3, { ...c, legR: [30, 40], legL: [-20, 44], torso: 14, root: [0, 4], squash: 1.1, stretch: 0.9 }, { ease: 'out' }),
      FK(30, { ...c, legR: [40, -70], legL: [20, -50], torso: 2, armL: [-50, -20], squash: 0.96, stretch: 1.04 }),
    ] },
    fall: { loop: true, frames: [
      FK(10, { ...c, legR: [24, -30], legL: [8, -20], armL: [-80, -30], torso: -6, head: -6, face: 'grit' }, { ease: 'inout' }),
      FK(10, { ...c, legR: [30, -40], legL: [4, -14], armL: [-95, -30], torso: -8, head: -8, face: 'grit' }, { ease: 'inout' }),
    ] },
    land: { loop: false, frames: [
      FK(3, { ...c, legR: [34, 46], legL: [-24, 48], torso: 22, head: 4, root: [0, 3], squash: 1.16, stretch: 0.86 }, { ease: 'out' }),
      FK(5, { ...c, legR: [14, 16], legL: [-10, 18], torso: 8, root: [0, 1], squash: 1.02, stretch: 0.98 }, { ease: 'out' }),
    ] },
    hurt: { loop: false, frames: [
      FK(4, { ...c, torso: -26, head: -24, armL: [-60, -30], armR: AD(c.armR, 12, -20), weapon: c.weapon - 16, root: [-5, 1], legR: [22, 4], legL: [-14, 12], face: 'hurt' }, { ease: 'out' }),
      FK(10, { ...c, torso: -12, head: -10, armL: [-30, -10], armR: AD(c.armR, 4, -6), weapon: c.weapon - 6, root: [-2, 1], legR: [14, 2], legL: [-10, 8], face: 'hurt' }, { ease: 'out' }),
      FK(6, { ...c, torso: 0 }, { ease: 'out' }),
    ] },
    // gear slip: the whole frame rattles, arms drop, steam hisses from the joints; the key stops (AI) and the lens dims
    stagger: { loop: true, frames: [
      FK(5, { ...c, torso: -14, head: -12, root: [-2, 2], armR: [8, 14], armL: [-12, 10], legR: [16, 12], legL: [-12, 14], weapon: c.weapon + 30, face: 'hurt', ...st }, { ease: 'out', fx: [{ kind: 'steam', x: -8, y: 46, count: 2 }] }),
      FK(5, { ...c, torso: 6, head: 10, root: [2, 1], armR: [14, 10], armL: [-6, 14], legR: [14, 14], legL: [-10, 12], weapon: c.weapon + 34, face: 'hurt', ...st }, { ease: 'out' }),
      FK(5, { ...c, torso: -10, head: -8, root: [-2, 2], armR: [10, 12], armL: [-14, 8], legR: [18, 10], legL: [-14, 16], weapon: c.weapon + 28, face: 'hurt', ...st }, { ease: 'out', fx: [{ kind: 'steam', x: 10, y: 40, count: 2 }] }),
      FK(5, { ...c, torso: 4, head: 6, root: [1, 1], armR: [12, 14], armL: [-8, 12], legR: [14, 12], legL: [-10, 12], weapon: c.weapon + 32, face: 'hurt', ...st }, { ease: 'out' }),
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
      FK(16, { ...floor, face: 'hurt' }, { ease: 'inout' }),
      FK(16, { ...floor, torso: 7, head: -13, legR: [12, 10], face: 'hurt' }, { ease: 'inout' }),
    ] },
    getup: { loop: false, frames: [
      FK(8, { ...floor, face: 'hurt' }, { ease: 'in' }),
      FK(8, { armR: [60, 40], weapon: 30, armL: [-30, 40], torso: 30, head: -10, legR: [70, 60], legL: [-20, 60], root: [8, 4, -20], squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
      FK(6, { ...c, torso: 8, root: [0, 1], legR: [15, 20], legL: [-10, 15] }, { ease: 'out' }),
    ] },
    dead: { loop: false, frames: [
      FK(60, { ...floor, torso: 8, head: -16, legR: [6, 4], legL: [-6, 6], root: [-30, -9, 90], face: 'dazed' }),
    ] },
  };
}

// ================================================================ Sootborn goblin rig (ART_STYLE.md pass)
// Cel-shaded goblin parts shared by content/enemies/sootborn.js (and any goblin rig): oversized head with swept-back ear
// triangles (a 1-segment chain wiggles them), wedge nose under the eye row, yellow eyes whose pupils follow `rig.look`
// (the AI writes it) and flash hot-white with a red rim while `rig.tell` (blinking on `rig.tellWarn`), expression-driven mouth
// (grin / gritted teeth / shout / X-eyes + tongue on `dazed`), ragged tunic with a clan sash and the numbered brass badge, rag
// shorts on a rope belt, wrapped bare feet, clawed fists (optional wrist chains for the Cinder Hulk). Far-side parts colour from
// `inf.pal`. Build knobs: build.clan (sash / trims), build.gob = { tunic: 'rags'|'skin'|'waistcoat', shorts, chains, shirt }.
import { flat as flatFill, rimTop as gobRim } from '../../art/shading.js';
import { getChain as gobChain } from '../../art/secondary.js';
import { rad as gobRad } from '../../engine/math.js';

const GR = Math.round;
/** Sootborn colour constants (GDD 4 hues, values re-spaced for the ART_STYLE value ladder). */
export const GOB = { skin: '#6BA84F', shade: '#3F6B2E', rags: '#5A4A3A', ragsDark: '#3A2E26', scrap: '#B0B0B0', eye: '#F2C94C', wrap: '#B8A98C', rope: '#B89A6A',
  brass: '#C89B3C', tell: '#FFF6D0', warn: '#FF5C5C', tongue: '#D9536B', tooth: '#F8F4EC', iron: '#6A6E78', outline: '#1E1A14' };
/** Base goblin value ladder: mid green skin (bare arms + legs), dark rag tunic, darker rag shorts, light tan foot wraps, brass badge, light scrap. */
export const GOB_PAL = { skin: GOB.skin, hair: GOB.shade, primary: GOB.rags, sleeve: GOB.skin, secondary: GOB.skin, accent: GOB.brass, metal: GOB.scrap, dark: GOB.wrap, glow: GOB.eye };
/** GDD 40px goblin x1.4: 24px head, 20x20 torso, long 29px arms, short 17px legs (~64px at scale 1, 54px at the 0.85 Sootborn scale). */
export const GOB_PROPS = { headR: 12, neck: 2, neckR: 3, torsoW: 20, torsoH: 20, hip: 18, upperArm: 15, lowerArm: 14, armR: 4.5, handR: 5, upperLeg: 10, lowerLeg: 9, legR: 5, footL: 11, footH: 5, shoulderX: 3, hipX: 4, bulge: 0.3 };

/** One swept-back ear triangle at (x, y) in head space, rotated by `ang` (the wiggle chain). */
function gobEar(ctx, rig, x, y, r, ang, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(gobRad(ang));
  ctx.beginPath(); ctx.moveTo(0, -GR(r * 0.3)); ctx.lineTo(-GR(r * 1.15), -GR(r * 0.7)); ctx.lineTo(-GR(r * 0.2), GR(r * 0.35)); ctx.closePath();
  celPath(ctx, rig, col, -r * 0.5, -r * 0.2, r * 0.6, 0.38, 0);
  if (!rig.override) { ctx.beginPath(); ctx.moveTo(-GR(r * 0.3), -GR(r * 0.2)); ctx.lineTo(-GR(r * 0.9), -GR(r * 0.5)); ctx.lineTo(-GR(r * 0.3), GR(r * 0.1)); ctx.closePath(); ctx.fillStyle = tones(rig, col).sh; ctx.fill(); }
  ctx.restore();
}
/** Oversized goblin skull (head space): far ear behind, ball skull, near ear, big wedge nose BELOW the eye row. */
export function gobHead(ctx, rig, pose, inf) {
  const r = inf.r, pal = inf.pal;
  const ch = gobChain(rig, 'ear', 1, { joint: 'head', rest: [-1, 0], stiffness: 0.22, damping: 0.6, gain: 1.6, rotGain: 0.5, maxAng: 24 });
  gobEar(ctx, rig, GR(-r * 0.55), GR(-r * 0.2), r, ch.ang[0] - 6, rig.paletteFar.skin);
  celBall(ctx, rig, 0, 0, r, pal.skin);
  gobEar(ctx, rig, GR(-r * 0.4), GR(-r * 0.05), r * 0.95, ch.ang[0] * 0.8, pal.skin);
  ctx.beginPath(); ctx.moveTo(GR(r * 0.55), GR(-r * 0.05)); ctx.lineTo(GR(r * 1.55), GR(r * 0.3)); ctx.lineTo(GR(r * 0.6), GR(r * 0.62)); ctx.closePath();
  celPath(ctx, rig, pal.skin, r * 0.9, r * 0.3, r * 0.5, 0.42, 0);
  if (rig.override) return;
  // soot smudge on the crown + chin shadow
  ctx.fillStyle = tones(rig, pal.skin).sh; ctx.fillRect(GR(-r * 0.2), GR(r * 0.8), GR(r * 0.7), 2);
}
/**
 * Goblin face (head space): yellow eyes (near 5x4, far 4x4) with pupils shifted by `rig.look` (AI: toward the nearest player),
 * hot-white + red rim while `rig.tell`, red blink on `rig.tellWarn`; brows + mouth by expression; X-eyes and tongue when dazed.
 */
export function gobFace(ctx, rig, pose, inf) {
  const r = inf.r, face = pose.face | 0, ink = rig.col(rig.outline), look = rig.look;
  const lx = look ? GR(look.x * 1.5) : 0, ly = look ? GR(look.y) : 0;
  const ey = GR(-r * 0.45), nx = GR(r * 0.25), fx = GR(-r * 0.5);
  const dazed = face === FACE.dazed, hurt = face === FACE.hurt, angry = face === FACE.angry || face === FACE.shout || face === FACE.grit;
  const closed = face === FACE.happy || face === FACE.closed, tell = !!rig.tell && !dazed, warn = tell && !!rig.tellWarn && (rig.tick & 2) !== 0;
  if (dazed) {
    ctx.fillStyle = ink;
    for (let i = 0; i < 5; i++) { ctx.fillRect(nx + i, ey + i, 2, 1); ctx.fillRect(nx + 4 - i, ey + i, 2, 1); ctx.fillRect(fx + i, ey + i, 2, 1); ctx.fillRect(fx + 4 - i, ey + i, 2, 1); }
  } else if (closed) {
    ctx.fillStyle = ink; ctx.fillRect(nx, ey + 1, 5, 2); ctx.fillRect(fx, ey + 1, 4, 2);
    if (face === FACE.happy) { ctx.fillRect(nx - 1, ey + 2, 1, 2); ctx.fillRect(nx + 5, ey + 2, 1, 2); }
  } else {
    const w = hurt ? 6 : 5, h = hurt ? 5 : 4, top = hurt ? ey - 1 : ey;
    if (tell && !rig.override) { ctx.fillStyle = rig.col(GOB.warn); ctx.fillRect(nx - 2, top - 1, w + 2, h + 2); ctx.fillRect(fx - 2, top - 1, w + 1, h + 2); }
    ctx.fillStyle = rig.col(warn ? GOB.warn : tell ? GOB.tell : rig.palette.glow);
    ctx.fillRect(nx - 1, top, w, h); ctx.fillRect(fx - 1, top, w - 1, h);
    if (!rig.override) {
      const pw = hurt ? 1 : 2;
      ctx.fillStyle = ink; ctx.fillRect(nx + 1 + lx, top + 1 + ly, pw, pw); ctx.fillRect(fx + lx, top + 1 + ly, pw, pw);
      if (angry || tell) { ctx.fillRect(nx - 1, top, w, 1); ctx.fillRect(fx - 1, top, w - 1, 1); }
    }
  }
  if (rig.override) return;
  // brows (2px, shade green): angry = slanted in, hurt = raised, else flat
  ctx.fillStyle = tones(rig, rig.palette.skin).deep;
  const by = ey - 4;
  if (angry || tell) { ctx.fillRect(nx - 2, by - 1, 2, 2); ctx.fillRect(nx, by, 2, 2); ctx.fillRect(nx + 2, by + 1, 3, 2); ctx.fillRect(fx - 1, by, 2, 2); ctx.fillRect(fx + 1, by + 1, 2, 2); }
  else if (hurt) { ctx.fillRect(nx - 1, by - 2, 5, 2); ctx.fillRect(fx - 1, by - 2, 4, 2); }
  else { ctx.fillRect(nx - 1, by, 5, 2); ctx.fillRect(fx - 1, by, 4, 2); }
  // mouth row under the nose base
  const my = GR(r * 0.66), x0 = GR(-r * 0.35), x1 = GR(r * 0.5);
  ctx.fillStyle = ink;
  if (face === FACE.shout) { ctx.fillRect(x0 + 2, my - 2, 7, 7); ctx.fillStyle = rig.col('#a03030'); ctx.fillRect(x0 + 3, my + 1, 5, 3); ctx.fillStyle = rig.col(GOB.tooth); ctx.fillRect(x0 + 3, my - 1, 2, 2); ctx.fillRect(x0 + 6, my - 1, 2, 2); }
  else if (hurt) { ctx.fillRect(x0 + 3, my - 1, 4, 4); }
  else if (dazed) { ctx.fillRect(x0, my, x1 - x0, 2); ctx.fillStyle = rig.col(GOB.tongue); ctx.fillRect(x0 + 4, my + 2, 4, 4); ctx.fillStyle = ink; ctx.fillRect(x0 + 4, my + 6, 4, 1); }
  else if (angry) { ctx.fillRect(x0, my - 1, x1 - x0 + 1, 5); ctx.fillStyle = rig.col(GOB.tooth); ctx.fillRect(x0 + 1, my, x1 - x0 - 1, 2); ctx.fillStyle = ink; ctx.fillRect(x0 + 4, my, 1, 2); ctx.fillRect(x0 + 8, my, 1, 2); }
  else { ctx.fillRect(x0, my, x1 - x0, 2); ctx.fillRect(x0 - 1, my - 2, 2, 2); ctx.fillRect(x1 - 1, my - 2, 2, 2); ctx.fillStyle = rig.col(GOB.tooth); ctx.fillRect(x0 + 5, my + 2, 2, 3); }
}
/** Ragged tunic (torso space): hunched back, potbelly, jagged hem, clan sash, one patch and the numbered brass badge. */
export function gobTorso(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = GR(W / 2), pal = inf.pal, g = rig.build.gob || {}, clan = rig.build.clan || '#9A4A22';
  const skin = g.tunic === 'skin', vest = g.tunic === 'waistcoat';
  const pts = [-hw - 3, -H + 8, -hw + 1, -H + 1, hw - 4, -H, hw + 2, -H + 5, hw + 4, GR(-H * 0.4), hw + 3, 1, hw - 2, 4, hw - 6, 1, -hw + 4, 4, -hw - 1, 1, -hw - 3, GR(-H * 0.4)];
  celPoly(ctx, rig, pts, skin ? pal.skin : vest ? (g.shirt || '#C9BB95') : pal.primary, 0.38, skin ? 0.3 : 0.22);
  if (vest) celPoly(ctx, rig, [-hw - 2, -H + 6, -hw + 2, -H + 2, -2, GR(-H * 0.35), hw - 1, -H + 3, hw + 3, -H + 6, hw + 3, 1, -hw - 1, 1], pal.primary, 0.4, 0.2);
  if (rig.override) return;
  const t = tones(rig, skin ? pal.skin : pal.primary);
  if (skin) { ctx.fillStyle = t.sh; ctx.fillRect(hw - 4, GR(-H * 0.45), 6, 2); ctx.fillStyle = rig.col(GOB.ragsDark); ctx.fillRect(-hw + 2, -H + 2, 4, H); }
  else if (vest) { ctx.fillStyle = rig.col(pal.accent); ctx.fillRect(GR(hw * 0.2), GR(-H * 0.35), 3, 3); ctx.fillRect(GR(hw * 0.2), GR(-H * 0.1), 3, 3); ctx.fillStyle = tones(rig, pal.primary).sh; ctx.fillRect(-hw, -H + 8, 3, H - 8); }
  else {
    ctx.beginPath(); ctx.moveTo(-hw + 1, -H + 3); ctx.lineTo(-hw + 6, -H + 1); ctx.lineTo(hw + 3, GR(-H * 0.25)); ctx.lineTo(hw + 1, GR(-H * 0.25) + 5); ctx.closePath();
    ctx.fillStyle = rig.col(clan); ctx.fill();
    ctx.fillStyle = tones(rig, clan).sh; ctx.fillRect(hw - 4, GR(-H * 0.25) + 2, 6, 2);
    ctx.fillStyle = t.deep; ctx.fillRect(-hw + 2, GR(-H * 0.45), 4, 4);
  }
  gobBadgeAt(ctx, rig, GR(hw * 0.35), GR(-H * 0.6));
}
/** Numbered brass badge (a brass disc with a dark '1' mark): drawn by gobTorso; also usable as a torso accessory. */
export function gobBadgeAt(ctx, rig, x, y) {
  celBall(ctx, rig, x, y, 4, rig.palette.accent, false);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, rig.palette.accent).deep; ctx.fillRect(x - 1, y - 2, 2, 5); ctx.fillRect(x - 2, y - 1, 1, 1);
}
/** Rag shorts on a rope belt with a knot (hip space). */
export function gobHips(ctx, rig, pose, inf) {
  const hip = inf.w, hw = GR(hip / 2), g = rig.build.gob || {};
  celRect(ctx, rig, -hw, -5, hip, 11, 3, g.shorts || GOB.ragsDark, 0.4, 0.2);
  if (rig.override) return;
  const t = tones(rig, GOB.rope);
  ctx.fillStyle = t.base; ctx.fillRect(-hw + 1, -5, hip - 2, 3);
  ctx.fillStyle = t.sh; ctx.fillRect(-hw + 1, -2, hip - 2, 1);
  ctx.fillStyle = t.base; ctx.fillRect(2, -7, 4, 6); ctx.fillStyle = t.sh; ctx.fillRect(3, -3, 2, 2);
}
/** Bare goblin foot with a cloth wrap and a skin toe (ankle space, toe toward +x). */
export function gobFoot(ctx, rig, pose, inf) {
  const L = inf.w, Hh = inf.h, heel = GR(L * 0.4), toe = GR(L * 0.7), sole = GR(Hh * 0.5);
  celPoly(ctx, rig, [-heel, -Hh, GR(heel * 0.5), -Hh, toe - 2, sole - 3, toe + 1, sole, -heel, sole], inf.pal.dark, 0.34, 0.25);
  if (rig.override) return;
  const t = tones(rig, inf.pal.dark);
  ctx.fillStyle = t.deep; ctx.fillRect(-heel, sole - 1, toe + heel + 1, 2);
  ctx.fillStyle = t.sh; ctx.fillRect(GR(heel * 0.2), -Hh + 1, 2, Hh - 2);
  ctx.fillStyle = rig.col(inf.pal.skin); ctx.fillRect(toe - 4, sole - 4, 4, 3);
  ctx.fillStyle = tones(rig, inf.pal.skin).sh; ctx.fillRect(toe - 3, sole - 2, 2, 1);
}
/** Clawed mitten fist (hand space); Cinder Hulk builds (gob.chains) hang a 2-link wrist chain that lags with a torso chain. */
export function gobHand(ctx, rig, pose, inf) {
  drawFist(ctx, rig, inf.r, inf.pal.skin);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, inf.pal.skin).deep; ctx.fillRect(GR(inf.r * 1.4), -inf.r + 1, 2, 2); ctx.fillRect(GR(inf.r * 1.4), 2, 2, 2);
  const g = rig.build.gob;
  if (!g || !g.chains) return;
  const ang = inf.far ? rig.joints.armF.hand : rig.joints.armN.hand;
  const ch = gobChain(rig, inf.far ? 'chainF' : 'chainN', 2, { joint: 'torso', rest: [0, 1], stiffness: 0.18, damping: 0.62, gain: 1.4, rotGain: 0.3, maxAng: 45 });
  ctx.save(); ctx.translate(-2, 0); ctx.rotate(gobRad(ang - 90));
  const tI = tones(rig, GOB.iron);
  for (let i = 0; i < ch.n; i++) {
    ctx.rotate(gobRad(ch.ang[i]));
    celRect(ctx, rig, -3, 0, 6, 8, 2, GOB.iron, 0.4, 0);
    ctx.fillStyle = tI.deep; ctx.fillRect(-1, 2, 2, 4);
    ctx.translate(0, 7);
  }
  ctx.restore();
}
/** Clan-colour cuff on the forearm (armLower hook; limb space: origin at the elbow, +y along the forearm). Firebrand / Wrangler. */
export function gobCuffArm(ctx, rig, pose, inf) {
  const r = inf.r, len = inf.len, col = inf.pal.skin;
  celRect(ctx, rig, -r, 0, r * 2, len + 1, r, col, 0.4, 0);
  if (rig.override) return;
  ctx.fillStyle = rig.col(rig.build.clan || '#9A4A22'); ctx.fillRect(-r, len - 6, r * 2, 4);
  ctx.fillStyle = tones(rig, rig.build.clan || '#9A4A22').sh; ctx.fillRect(-r, len - 2, r * 2, 1);
}
/** Complete goblin part table. */
export const GOB_PARTS = { head: gobHead, face: gobFace, torso: gobTorso, hips: gobHips, foot: gobFoot, hand: gobHand };
/** Rim-light helper re-export for goblin accessories (keeps sootborn.js free of extra shading imports). */
export const gobRimTop = gobRim;
/** Flat-fill helper re-export (outline + fill, no bands) for goblin accessories. */
export const gobFlat = flatFill;
