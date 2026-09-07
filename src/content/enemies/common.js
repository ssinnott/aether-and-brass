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
