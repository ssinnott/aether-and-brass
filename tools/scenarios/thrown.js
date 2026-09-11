// Thrown weapons scenario for tools/playtest.js (issue #21). Receives the harness helpers so this file shares one
// browser, one assert and one results list with the main harness — the same pattern as tools/scenarios/weapons.js.
//
// Block A (step 21.1, GDD 7 / docs/ARCHITECTURE.md section 13 "3d"): pressing attack + a direction while a weapon
// is held starts a throw (not a swing), the weapon leaves the hand at release as a flying projectile carrying its
// own throw feel, it hits an enemy in its path for extra damage (Brassbound's throwDamageTakenMult applies to a
// thrown weapon's `hit.body`), a miss lands the weapon as a fresh pickup one hit lighter, a weapon thrown on its
// last hit shatters instead, an up/down direction adds a z drift rather than turning, and an armed bot's in-range
// autopilot never combines a turn or a z-align step with an attack (game/bot.js), so it never throws by accident.
/**
 * @param {object} server
 * @param {{ withPage: Function, assert: Function }} deps
 */
export async function thrown(server, { withPage, assert }) {
  await withPage(server, 'seed=1&skipTo=gameplay&chars=0,1&nowaves=1&godmode=1', async (g) => {
    await g.step(30);

    // -- local helpers (game/weapons.js WEAPONS, game/player.js pickUpWeapon, game/throwables.js) --
    const equip = (slot, id, hits) => g.eval(([sl, i, h]) => window.__game.world.players[sl].pickUpWeapon({ weaponId: i, weaponHits: h }), [slot, id, hits]);
    const clearEnemies = () => g.eval(() => window.__game.killAllEnemies());
    const clearItems = () => g.eval(() => { for (const e of window.__game.world.entities) if (e.kind === 'item') e.removeMe = true; });
    const clearProjectiles = () => g.eval(() => { for (const e of window.__game.world.entities) if (e.kind === 'projectile') e.removeMe = true; });
    const projectiles = () => g.eval(() => window.__game.world.entities.filter((e) => e.kind === 'projectile' && !e.removeMe)
      .map((e) => ({ thrownWeapon: e.thrownWeapon || null, x: e.x, z: e.z, vx: e.vx, vy: e.vy, vz: e.vz, weaponHits: e.weaponHits })));
    const dropped = (id) => g.eval((i) => window.__game.world.entities.filter((e) => e.kind === 'item' && e.weaponId === i && !e.removeMe)
      .map((e) => ({ hits: e.weaponHits, x: e.x, z: e.z })), id);
    const park = (slot, x, z) => g.eval(([sl, xx, zz]) => { const p = window.__game.world.players[sl]; p.x = xx; p.z = zz; p.facing = 1; }, [slot, x, z]);
    const waitForProjectile = async (id, max = 20) => {
      for (let i = 0; i < max; i++) { if ((await projectiles()).some((p) => p.thrownWeapon === id)) return true; await g.step(1); }
      return false;
    };
    const waitForLanding = async (id, max = 90) => {
      for (let i = 0; i < max; i++) { if (!(await projectiles()).some((p) => p.thrownWeapon === id)) return true; await g.step(1); }
      return false;
    };
    // The throw anim keeps the thrower in ST.GRAB (thinkGrab, not thinkGround) until it finishes playing out, well
    // after release; a subsequent equip + press must wait for `actionable` first or the press is silently ignored.
    const waitActionable = async (slot, max = 90) => {
      for (let i = 0; i < max; i++) { if (await g.eval((sl) => window.__game.world.players[sl].actionable, slot)) return true; await g.step(1); }
      return false;
    };

    await park(1, 400, 130); // partner well clear of P1's own pickup / hit checks
    await park(0, 200, 70);
    await clearEnemies(); await clearItems();

    // (a) Pressing attack + a direction while armed throws instead of swinging: ST.GRAB (grabTarget stays null),
    // the hero's own forward `throw` anim plays (not attack1), and the weapon is still held during the windup.
    await equip(0, 'halberd', 12);
    await g.press(0, { attack: true, right: true }, 2, 0);
    const s0 = await g.eval(() => { const p = window.__game.world.players[0]; return { state: p.state, anim: p.anim.name, grabTarget: !!p.grabTarget, weapon: p.weaponId }; });
    assert(s0.state === 'GRAB' && s0.anim === 'throw' && !s0.grabTarget, `a held weapon + direction + attack starts a throw, not a swing (got ${JSON.stringify(s0)})`);
    assert(s0.weapon === 'halberd', 'the weapon is still held during the throw windup');

    // release: the weapon leaves the hand and a thrown-weapon projectile appears flying toward facing, one hit
    // lighter than it was carried with (durability spent whether or not it connects, GDD 7).
    for (let i = 0; i < 20 && (await g.eval(() => window.__game.world.players[0].weaponId)); i++) await g.step(1);
    const afterRelease = (await g.summary()).players[0];
    assert(afterRelease.weapon === '', 'the weapon leaves the hand at release');
    const ps = await projectiles();
    assert(ps.some((p) => p.thrownWeapon === 'halberd' && p.weaponHits === 11 && p.vx > 0), `a thrown halberd flies forward with 11 hits left (got ${JSON.stringify(ps)})`);
    await g.shot('92-thrown-weapon-release');
    await clearProjectiles();

    // (b) It hits an enemy in its path: Brassbound's throwDamageTakenMult (1.5x, GDD 3) applies to the thrown
    // weapon's `hit.body` (fighter.js takeHit), so a footman standing in the halberd's way takes real damage.
    await clearEnemies();
    const foot0 = await g.eval(() => window.__game.spawnEnemy('typeA', 'grunt', 100, 0).hp);
    assert(await waitActionable(0), 'P1 is actionable again after the first throw finishes playing out');
    await equip(0, 'halberd', 12);
    await g.press(0, { attack: true, right: true }, 2, 0);
    assert(await waitForProjectile('halberd'), 'the second throw releases a halberd projectile');
    assert(await waitForLanding('halberd', 60), 'the thrown halberd resolves (hits or reaches its max distance)');
    const foot1 = await g.eval(() => (window.__game.world.enemies[0] ? { hp: window.__game.world.enemies[0].hp, lastHitWasThrow: window.__game.world.enemies[0].lastHitWasThrow } : null));
    assert(foot1 !== null && foot1.hp < foot0, `the thrown halberd damages an enemy in its path (${foot0} -> ${foot1 && foot1.hp})`);
    // exact damage (THROW_HALBERD.damage 22 * the footman's throwDamageTakenMult 1.5, fighter.js takeHit hit.body
    // branch) and the throw-kill note (Player.onKill's x1.5 bonus, GDD 7 decision 8) — a plain 22-damage hit with
    // no `hit.body` / throwDamageTakenMult, or a dropped `lastHitWasThrow`, would also satisfy the weaker `< foot0`
    // check above (review finding 5).
    assert(foot1 && foot0 - foot1.hp === 33, `a thrown halberd deals its 1.5x Brassbound-thrown damage exactly (22 * 1.5 = 33, got ${foot0 - (foot1 && foot1.hp)})`);
    assert(foot1 && foot1.lastHitWasThrow === true, 'the thrown halberd hit is noted as a throw (lastHitWasThrow) for the kill-score bonus');
    await clearEnemies(); await clearItems();

    // (b2) Killing off a footman with a thrown halberd pays the GDD 7 throw-kill score bonus (x1.5, Player.onKill)
    // on top of its normal score (150) — the credit lands via world.js onDeath only once the death plays out, so
    // this polls until the enemy is fully gone rather than reading score the instant hp hits 0.
    await waitActionable(0);
    await park(0, 200, 70);
    await g.eval(() => { const e = window.__game.spawnEnemy('typeA', 'grunt', 100, 0); e.hp = 1; });
    const score0 = await g.eval(() => window.__game.world.players[0].score);
    await equip(0, 'halberd', 12);
    await g.press(0, { attack: true, right: true }, 2, 0);
    assert(await waitForProjectile('halberd'), 'the kill-bonus throw releases a halberd projectile');
    let killed = false;
    for (let i = 0; i < 120 && !killed; i++) { await g.step(1); killed = !(await g.eval(() => !!window.__game.world.enemies[0])); }
    assert(killed, 'the 1hp footman dies to the thrown halberd within 120 frames');
    const after = await g.eval(() => ({ score: window.__game.world.players[0].score, kills: window.__game.world.players[0].kills }));
    assert(after.kills === 1, `the kill is counted (got ${JSON.stringify(after)})`);
    assert(after.score - score0 >= Math.round(150 * 1.5), `a throw kill pays the x1.5 score bonus (footman score 150, got +${after.score - score0})`);
    await clearItems(); await clearProjectiles();

    // (b3) Per-weapon pierce/knockdown (GDD 7 / game/weapons.js: cutlass and sabre pierce: 1, halberd pierce: 0
    // type: 'knockdown'): every single-enemy throw above (b/b2) only tells apart "hits" from "misses", so pierce
    // could be swapped to 0 for every weapon, or the halberd's type swapped away from 'knockdown', with none of
    // them failing (review finding 1). Two grunts are frozen in the throw's straight-line path (walkSpeed and
    // runSpeed = 0, the same fields Enemy's own movement reads, enemy.js:203) so the lineup can't drift before the
    // throw resolves.
    const freezeTwo = async (d1, d2) => g.eval(([x1, x2]) => {
      const a = window.__game.spawnEnemy('typeA', 'grunt', x1, 0);
      const b = window.__game.spawnEnemy('typeA', 'grunt', x2, 0);
      a.walkSpeed = a.runSpeed = 0; b.walkSpeed = b.runSpeed = 0;
      return [a.hp, b.hp];
    }, [d1, d2]);

    // A thrown cutlass (pierce: 1) hits BOTH frozen grunts in its path and still lands as an ordinary pickup.
    await waitActionable(0);
    await park(0, 200, 70);
    await equip(0, 'cutlass', 15);
    const cutHp0 = await freezeTwo(80, 150);
    await g.press(0, { attack: true, right: true }, 2, 0);
    assert(await waitForProjectile('cutlass'), 'the two-target cutlass throw releases a projectile');
    assert(await waitForLanding('cutlass'), 'the piercing cutlass throw eventually lands');
    const cutHp1 = await g.eval(() => window.__game.world.enemies.map((e) => e.hp));
    assert(cutHp1.length === 2 && cutHp1[0] < cutHp0[0] && cutHp1[1] < cutHp0[1],
      `a thrown cutlass (pierce: 1) hits both grunts in its path (before ${JSON.stringify(cutHp0)}, after ${JSON.stringify(cutHp1)})`);
    const cutLand = await dropped('cutlass');
    assert(cutLand.length === 1 && cutLand[0].hits === 14, `a piercing cutlass still lands as a pickup with hits - 1 (got ${JSON.stringify(cutLand)})`);
    // The cutlass is otherwise only ever thrown at 1 hit (block A(d), shatters) -- neither case alone covers the
    // "lands and can be re-picked" acceptance bullet for this weapon (review finding 8). The thrower's own throw
    // anim (started at release) is still playing out well after a pierced throw resolves, so wait for actionable
    // before parking on the pickup or the walk-over press is silently ignored (same reason every other repick
    // check in this scenario waits first).
    await waitActionable(0);
    await park(0, cutLand[0].x, cutLand[0].z);
    await g.step(4);
    const cutRepicked = (await g.summary()).players[0];
    assert(cutRepicked.weapon === 'cutlass', 'the landed cutlass can be re-picked');
    await g.eval(() => window.__game.world.players[0].clearWeapon());
    await clearEnemies(); await clearItems();

    // A thrown halberd (pierce: 0, type: 'knockdown') stops on the FIRST grunt, knocking it down, and never
    // touches the second one standing right behind it.
    await waitActionable(0);
    await park(0, 200, 70);
    await equip(0, 'halberd', 12);
    const halbHp0 = await freezeTwo(80, 150);
    await g.press(0, { attack: true, right: true }, 2, 0);
    assert(await waitForProjectile('halberd'), 'the two-target halberd throw releases a projectile');
    assert(await waitForLanding('halberd'), 'the two-target halberd throw eventually lands');
    const halbAfter = await g.eval(() => window.__game.world.enemies.map((e) => ({ hp: e.hp, state: e.state })));
    assert(halbAfter.length === 2 && halbAfter[0].hp < halbHp0[0] && (halbAfter[0].state === 'KNOCKDOWN' || halbAfter[0].state === 'LYING'),
      `a thrown halberd knocks down the first grunt in its path (before ${JSON.stringify(halbHp0)}, after ${JSON.stringify(halbAfter)})`);
    assert(halbAfter[1].hp === halbHp0[1], `a thrown halberd (pierce: 0) never touches the second grunt behind the first (got ${JSON.stringify(halbAfter)})`);
    await clearEnemies(); await clearItems();

    // (c) Missing everything, the weapon lands as a fresh pickup with one less hit than it flew with.
    await waitActionable(0);
    await park(0, 200, 70);
    await equip(0, 'halberd', 12);
    await g.press(0, { attack: true, right: true }, 2, 0);
    assert(await waitForProjectile('halberd'), 'the third throw releases a halberd projectile');
    assert(await waitForLanding('halberd'), 'a missed thrown halberd eventually lands (max distance / life)');
    const landed = await dropped('halberd');
    assert(landed.length === 1 && landed[0].hits === 11, `a missed throw lands as a pickup with hits - 1 (got ${JSON.stringify(landed)})`);
    await clearItems();

    // (d) A weapon thrown on its last hit shatters instead of leaving a pickup behind.
    await waitActionable(0);
    await equip(0, 'cutlass', 1);
    await g.press(0, { attack: true, right: true }, 2, 0);
    assert(await waitForProjectile('cutlass'), 'a last-hit throw still releases a projectile');
    assert(await waitForLanding('cutlass'), 'a last-hit thrown cutlass eventually lands');
    const shatterDrop = await dropped('cutlass');
    assert(shatterDrop.length === 0, 'a weapon thrown on its last hit shatters (no pickup left behind)');
    await clearItems();

    // (d2) The sabre (the fourth weapon, never exercised elsewhere in this scenario) throws, lands and can be
    // re-picked exactly like the halberd above -- the acceptance bullet in issue #21 calls for all four weapons
    // (review finding 6). throwHeldItem (throwables.js) clears the held weapon before checking `def.throw` exists,
    // so a regression dropping the sabre's throw spec would silently delete it with nothing else here to catch it.
    await waitActionable(0);
    await park(0, 200, 70);
    await equip(0, 'sabre', 8);
    await g.press(0, { attack: true, right: true }, 2, 0);
    assert(await waitForProjectile('sabre'), 'the sabre throw releases a projectile');
    const sabreProj = (await projectiles()).find((p) => p.thrownWeapon === 'sabre');
    assert(!!sabreProj && sabreProj.weaponHits === 7, `the thrown sabre carries hits - 1 (got ${JSON.stringify(sabreProj)})`);
    assert(await waitForLanding('sabre'), 'the thrown sabre eventually lands');
    const sabreDrop = await dropped('sabre');
    assert(sabreDrop.length === 1 && sabreDrop[0].hits === 7, `the sabre lands as a pickup with hits - 1 (got ${JSON.stringify(sabreDrop)})`);
    await park(0, sabreDrop[0].x, sabreDrop[0].z);
    await g.step(4);
    const repicked = (await g.summary()).players[0];
    assert(repicked.weapon === 'sabre', 'the landed sabre can be re-picked');
    await g.eval(() => window.__game.world.players[0].clearWeapon()); // so the next step below can equip a fresh weapon
    await clearItems();

    // (e) An up/down direction adds a z drift (THROW.vz) instead of turning: pressing down alone (no left/right)
    // still throws, and the projectile's vz matches the pressed direction.
    await waitActionable(0);
    await park(0, 200, 70);
    await equip(0, 'halberd', 12);
    await g.press(0, { attack: true, down: true }, 2, 0);
    assert(await waitForProjectile('halberd'), 'attack + down (no left/right) still throws the held weapon');
    const drifted = (await projectiles()).find((p) => p.thrownWeapon === 'halberd');
    assert(!!drifted && drifted.vz > 0, `pressing down adds a positive z drift to the throw (got ${drifted && drifted.vz})`);
    await clearProjectiles(); await clearItems();

    // (f) Bot guard (game/bot.js botIntent): an armed bot's in-range branch never combines a turn or a z-align
    // step with an attack, so it never throws its weapon away by accident. The grunt is spawned close enough
    // (dx -40 / dx 40, dz 0/12) that gap stays inside `reach + 20`, so the deliberate throwChance branch (block E)
    // can never open here either — only the turn/z-align guard under test is exercised.
    await waitActionable(0);
    await g.eval(() => { const p = window.__game.world.players[0]; p.bot = true; p.botStyle = 'balanced'; });
    const noAccidentalThrow = async (dx, dz, frames) => {
      await waitActionable(0);
      await park(0, 200, 70);
      await equip(0, 'halberd', 12);
      await g.eval(([x, z]) => { const e = window.__game.spawnEnemy('typeA', 'grunt', x, z); e.invuln = 999999; }, [dx, dz]);
      let bad = false;
      for (let i = 0; i < frames && !bad; i++) {
        // The dz === 0 (turning) case: bot.js's own attack press turns `p.facing` to the grunt within the SAME
        // frame `turning` first goes true (player.js thinkGround: `if (it.x) this.facing = it.x;`), so left alone
        // `turning` is true for exactly one frame -- not reliably the one f % attackEvery === 0 frame that would
        // actually combine with an attack press. Re-facing the hero away every frame keeps `turning` true for the
        // whole window instead, so dropping the bot.js guard now actually fails this assertion (review finding 6).
        if (dz === 0) await g.eval(() => { window.__game.world.players[0].facing = 1; });
        await g.step(1);
        bad = await g.eval(() => { const p = window.__game.world.players[0]; return !!(p.throwPending && p.throwPending.kind === 'weapon'); });
      }
      await clearEnemies();
      return !bad;
    };
    assert(await noAccidentalThrow(-40, 0, 60), 'an armed bot never throws while turning to face a target behind it');
    assert(await noAccidentalThrow(40, 12, 60), 'an armed bot never throws while stepping to align z with its target');
    await g.eval(() => { window.__game.world.players[0].bot = false; });
    await clearItems();
  });

  // Block B (step 21.2, GDD 7 decision 9): a `rails` zone with `open: true` (hazards.js Zone) discards a thrown
  // weapon that drifts past its front/back edge instead of letting it land -- and a landed weapon well inside the
  // band is unaffected, still an ordinary walk-over pickup. Stage 2's Mooring Spine (m1, x 0..1900) is the only
  // `open: true` zone P1 starts inside of: screens/gameplay.js START_X places P1 at x ~100, and m1's rails zone
  // is not gated behind a boss state, so it is live from frame 0.
  await withPage(server, 'seed=1&skipTo=gameplay&stage=2&chars=0&nowaves=1&godmode=1', async (g) => {
    await g.step(30);
    const equip = (slot, id, hits) => g.eval(([sl, i, h]) => window.__game.world.players[sl].pickUpWeapon({ weaponId: i, weaponHits: h }), [slot, id, hits]);
    const clearItems = () => g.eval(() => { for (const e of window.__game.world.entities) if (e.kind === 'item') e.removeMe = true; });
    const clearProjectiles = () => g.eval(() => { for (const e of window.__game.world.entities) if (e.kind === 'projectile') e.removeMe = true; });
    const projectiles = () => g.eval(() => window.__game.world.entities.filter((e) => e.kind === 'projectile' && !e.removeMe).map((e) => e.thrownWeapon || null));
    const dropped = (id) => g.eval((i) => window.__game.world.entities.filter((e) => e.kind === 'item' && e.weaponId === i && !e.removeMe)
      .map((e) => ({ hits: e.weaponHits, x: e.x, z: e.z })), id);
    const park = (slot, x, z) => g.eval(([sl, xx, zz]) => { const p = window.__game.world.players[sl]; p.x = xx; p.z = zz; p.facing = 1; }, [slot, x, z]);
    const waitFor = async (pred, max) => { for (let i = 0; i < max; i++) { if (await pred()) return true; await g.step(1); } return false; };
    const waitActionable = (slot, max = 90) => waitFor(() => g.eval((sl) => window.__game.world.players[sl].actionable, slot), max);
    const waitForLanded = (id, max) => waitFor(async () => !(await projectiles()).includes(id), max);

    await g.eval(() => window.__game.killAllEnemies());
    await clearItems(); await clearProjectiles();

    // (a) a throw that lands well inside the open zone's z band (RAIL..Z_MAX-RAIL is 12..128, hazards.js) is an
    // ordinary pickup: it lands, and walking onto it re-collects it, exactly as on a stage with no open zone at all.
    await park(0, 300, 70);
    await equip(0, 'halberd', 12);
    await g.press(0, { attack: true, right: true }, 2, 0);
    assert(await waitFor(async () => (await projectiles()).includes('halberd'), 20), 'stage 2 m1: the throw releases a halberd projectile');
    assert(await waitForLanded('halberd', 90), 'stage 2 m1: a mid-band throw still lands (the open zone only discards past its edge)');
    const land = await dropped('halberd');
    assert(land.length === 1 && land[0].hits === 11, `stage 2 m1: a mid-band throw lands as an ordinary pickup (got ${JSON.stringify(land)})`);
    await park(0, land[0].x, land[0].z);
    await g.step(4);
    const picked = (await g.summary()).players[0];
    assert(picked.weapon === 'halberd', 'stage 2 m1: walking onto the landed weapon still re-collects it inside the open zone');
    await clearItems();

    // (b) a throw whose z drift (it.y, THROW.vz) carries it past the open edge is lost: no pickup lands. Parked 8px
    // inside the back rail (z = 20, edge at RAIL = 12), an "up" z drift (vz < 0) crosses it in a few frames.
    assert(await waitActionable(0), 'stage 2 m1: P1 is actionable again before the edge throw');
    await park(0, 300, 20);
    await equip(0, 'halberd', 12);
    await g.press(0, { attack: true, up: true }, 2, 0);
    assert(await waitFor(async () => (await projectiles()).includes('halberd'), 20), 'stage 2 m1: the edge throw releases a projectile');
    assert(await waitForLanded('halberd', 60), 'stage 2 m1: the projectile drifting past the open edge is gone within a handful of frames');
    const lost = await dropped('halberd');
    assert(lost.length === 0, `stage 2 m1: a thrown weapon lost over the open rails edge leaves no pickup behind (got ${JSON.stringify(lost)})`);
    await clearItems(); await clearProjectiles();
  });

  // Block C (step 21.2, GDD 7 decision 10): a thrown lime rake leaves a lime patch at its landing spot; anyone
  // standing in it is slowed (not damaged), and gets their exact pre-slow walk speed back when the slow ends.
  await withPage(server, 'seed=1&skipTo=gameplay&chars=0&nowaves=1&godmode=1', async (g) => {
    await g.step(30);
    const equip = (slot, id, hits) => g.eval(([sl, i, h]) => window.__game.world.players[sl].pickUpWeapon({ weaponId: i, weaponHits: h }), [slot, id, hits]);
    const park = (slot, x, z) => g.eval(([sl, xx, zz]) => { const p = window.__game.world.players[sl]; p.x = xx; p.z = zz; p.facing = 1; }, [slot, x, z]);
    const waitFor = async (pred, max) => { for (let i = 0; i < max; i++) { const v = await pred(); if (v) return v; await g.step(1); } return null; };
    const dropped = (id) => g.eval((i) => window.__game.world.entities.filter((e) => e.kind === 'item' && e.weaponId === i && !e.removeMe)
      .map((e) => ({ hits: e.weaponHits, x: e.x, z: e.z })), id);
    const waitActionable = (slot, max = 90) => waitFor(() => g.eval((sl) => window.__game.world.players[sl].actionable, slot), max);

    await g.eval(() => window.__game.killAllEnemies());
    await g.eval(() => { for (const e of window.__game.world.entities) if (e.kind === 'item' || e.kind === 'projectile') e.removeMe = true; });
    await park(0, 200, 70);
    const foot0 = await g.eval(() => { const e = window.__game.spawnEnemy('typeA', 'grunt', 60, 0); return { hp: e.hp, walk: e.walkSpeed }; });
    await equip(0, 'limerake', 10);
    await g.press(0, { attack: true, right: true }, 2, 0);

    // the thrown lime rake's one hit (pierce: 0) staggers the footman where it lands, and its landing spot -- the
    // SAME spot -- is where landWeapon (throwables.js) drops the lime patch.
    const patch = await waitFor(() => g.eval(() => {
      const e = window.__game.world.entities.find((x) => x.kind === 'projectile' && x.limePatch);
      return e ? { x: e.x, z: e.z } : null;
    }), 90);
    assert(!!patch, 'a thrown lime rake leaves a lime patch (proj.limePatch) at its landing spot');
    const foot1 = await g.eval(() => (window.__game.world.enemies[0] ? window.__game.world.enemies[0].hp : null));
    assert(foot1 !== null && foot1 < foot0.hp, 'the thrown lime rake still damages the staggered footman on the way to landing');

    // The lime rake still lands as an ordinary re-pickable pickup at its patch spot -- the patch/damage checks
    // above never confirm that, only that the projectile stopped existing (review finding 8).
    const rake = await dropped('limerake');
    assert(rake.length === 1 && rake[0].hits === 9, `a thrown lime rake still lands as a pickup with hits - 1 (got ${JSON.stringify(rake)})`);
    // The thrower's own throw anim is still playing out well after the throw resolves; wait for actionable before
    // parking on the pickup or the walk-over press is silently ignored.
    await waitActionable(0);
    await park(0, rake[0].x, rake[0].z);
    await g.step(4);
    const rakeRepicked = (await g.summary()).players[0];
    assert(rakeRepicked.weapon === 'limerake', 'the landed lime rake can be re-picked');
    await g.eval(() => window.__game.world.players[0].clearWeapon());

    // polled: the footman standing in the patch is slowed to the patch's `mult` of its PRE-slow walk speed
    // (THROW_LIMERAKE patch.mult = 0.5, game/weapons.js), status.limed present while it lasts.
    const limed = await waitFor(() => g.eval(() => {
      const e = window.__game.world.enemies[0];
      return e && e.status.limed ? { walk: e.walkSpeed, saved: e.status.limed.savedWalk } : null;
    }), 40);
    assert(!!limed, 'the footman standing in the lime patch is slowed (status.limed applied)');
    assert(limed && Math.abs(limed.saved - foot0.walk) < 1e-6, `the slow saves the PRE-slow walkSpeed, not a re-derived default (got ${JSON.stringify(limed)} vs ${foot0.walk})`);
    assert(limed && Math.abs(limed.walk - limed.saved * 0.5) < 1e-6, `walkSpeed is halved while limed (patch.mult 0.5, got ${JSON.stringify(limed)})`);

    // polled: once the slow's `frames` run out, onEnd restores walkSpeed to the exact saved value.
    const restored = await waitFor(() => g.eval(() => {
      const e = window.__game.world.enemies[0];
      if (!e || e.status.limed) return null;
      return { walk: e.walkSpeed };
    }), 60);
    assert(!!restored && Math.abs(restored.walk - foot0.walk) < 1e-6, `walkSpeed is restored to its exact pre-slow value once the lime slow ends (got ${JSON.stringify(restored)})`);
    await g.eval(() => window.__game.killAllEnemies());
  });

  // Block D (step 21.3, GDD 7 decisions 3-7/14): a liftable prop (bottle, lamp -- stage1 s1) is lifted instead of
  // swung by a bare hand, carried at slow walk with no one-frame lag between the hero and the carried prop, any
  // attack throws it (a prop has no swing, unlike a held weapon), it hits an enemy in its path the same way a
  // thrown weapon does, and it always shatters on landing (Prop.break) whether or not it connected -- unlike a
  // weapon it has no durability, so nothing is ever left behind to walk over and re-collect.
  await withPage(server, 'seed=1&skipTo=gameplay&chars=0&nowaves=1&godmode=1', async (g) => {
    await g.step(30);
    const park = (slot, x, z) => g.eval(([sl, xx, zz]) => { const p = window.__game.world.players[sl]; p.x = xx; p.z = zz; p.facing = 1; }, [slot, x, z]);
    const propState = (type) => g.eval((t) => {
      const p = window.__game.world.entities.find((e) => e.kind === 'prop' && e.type === t && e.state !== 'breaking');
      return p ? { x: p.x, z: p.z, y: p.y, state: p.state, holder: !!p.holder } : null;
    }, type);
    const heroState = () => g.eval(() => { const p = window.__game.world.players[0]; return { state: p.state, anim: p.anim.name, heldProp: !!p.heldProp, x: p.x, z: p.z, facing: p.facing }; });
    const flying = (type) => g.eval((t) => window.__game.world.entities.filter((e) => e.kind === 'projectile' && !e.removeMe && e.thrownProp && e.thrownProp.type === t).map((e) => ({ x: e.x, z: e.z })), type);
    const anyProp = (type) => g.eval((t) => window.__game.world.entities.some((e) => e.kind === 'prop' && e.type === t && !e.removeMe), type);
    const waitFor = async (pred, max) => { for (let i = 0; i < max; i++) { const v = await pred(); if (v) return v; await g.step(1); } return null; };
    // The throw anim keeps the hero in ST.GRAB (thinkGrab, not thinkGround) until it finishes playing out, well
    // after release; a subsequent lift press must wait for `actionable` first or the press is silently ignored
    // (same reason tools/scenarios/thrown.js block A waits between two weapon throws).
    const waitActionable = (slot, max = 90) => waitFor(() => g.eval((sl) => window.__game.world.players[sl].actionable, slot), max);

    await g.eval(() => window.__game.killAllEnemies());
    await g.eval(() => { for (const e of window.__game.world.entities) if (e.kind === 'item') e.removeMe = true; });

    // (a) Bare-handed, standing at a liftable prop (stage1 s1's bottle, GDD 6), attack lifts it instead of
    // swinging: ST.GRAB, grabTarget stays null, heldProp is set, and the prop's own state becomes 'held'.
    const bottle0 = await propState('bottle');
    assert(!!bottle0 && bottle0.state === 'idle', `stage1 s1 has an idle bottle to lift (got ${JSON.stringify(bottle0)})`);
    await park(0, bottle0.x - 20, bottle0.z);
    const cfg = await g.eval(() => ({ walkSpeed: window.__game.world.players[0].walkSpeed }));
    await g.press(0, { attack: true }, 2, 2);
    const s0 = await heroState();
    assert(s0.state === 'GRAB' && s0.heldProp, `a neutral attack next to a liftable prop lifts it (got ${JSON.stringify(s0)})`);
    const held0 = await propState('bottle');
    assert(!!held0 && held0.state === 'held' && held0.holder && held0.y > 0, `the lifted bottle enters state 'held', off the floor (got ${JSON.stringify(held0)})`);
    await g.shot('04d-thrown-prop');

    // (b) Carried at slow walk (THROW.holdWalk 0.7x, constants.js): the carried prop tracks the hero every frame
    // with no one-frame lag (issue #21 decision 6).
    await g.press(0, { right: true }, 10, 0);
    const s1 = await heroState();
    const held1 = await propState('bottle');
    const expected = cfg.walkSpeed * 0.7 * 10;
    assert(Math.abs((s1.x - s0.x) - expected) < 0.05, `holding a prop walks at 0.7x speed (moved ${s1.x - s0.x}, expected ${expected})`);
    assert(!!held1 && Math.abs(held1.x - (s1.x + s1.facing * 14)) < 0.5, `the carried prop tracks the hero with no one-frame lag (hero ${s1.x}, prop ${held1.x})`);

    // (c) Any attack throws it (a prop has no swing, unlike a held weapon): it hits an enemy in its path
    // (Brassbound's throwDamageTakenMult applies to its `hit.body`, same as a thrown weapon), then always
    // shatters on landing -- no pickup is ever left behind, whether or not it connected.
    const foot0 = await g.eval(() => window.__game.spawnEnemy('typeA', 'grunt', 60, 0).hp);
    await g.press(0, { attack: true }, 2, 0);
    const s2 = await heroState();
    // the prop is still held during the windup, exactly like a weapon throw (block A) -- release is timed by
    // updateGrab's throwPending, several frames later.
    assert(s2.state === 'GRAB' && s2.anim === 'throw' && s2.heldProp, `any attack throws the held prop with no direction needed (got ${JSON.stringify(s2)})`);
    assert(await waitFor(async () => (await flying('bottle')).length > 0, 20), 'the thrown bottle releases a projectile');
    assert(await g.eval(() => !window.__game.world.players[0].heldProp), 'the prop leaves the hand at release');
    assert(await waitFor(async () => (await flying('bottle')).length === 0, 60), 'the thrown bottle resolves (hits or reaches its max distance)');
    const foot1 = await g.eval(() => (window.__game.world.enemies[0] ? window.__game.world.enemies[0].hp : null));
    assert(foot1 !== null && foot1 < foot0, `the thrown bottle damages an enemy in its path (${foot0} -> ${foot1})`);
    assert(await waitFor(async () => !(await anyProp('bottle')), 40), 'the thrown bottle always shatters on landing (no pickup left behind)');
    await g.eval(() => window.__game.killAllEnemies());

    // (d) The lamp lifts, carries and throws exactly the same way (both share the same lift/hold/throw/land code).
    assert(await waitActionable(0), 'P1 is actionable again after the bottle throw finishes playing out');
    const lamp0 = await propState('lamp');
    assert(!!lamp0 && lamp0.state === 'idle', `stage1 s1 has an idle lamp to lift (got ${JSON.stringify(lamp0)})`);
    await park(0, lamp0.x - 20, lamp0.z);
    await g.press(0, { attack: true }, 2, 2);
    const held2 = await propState('lamp');
    assert(!!held2 && held2.state === 'held', `the lamp lifts the same way as the bottle (got ${JSON.stringify(held2)})`);
    await g.press(0, { attack: true, right: true }, 2, 0);
    assert(await waitFor(async () => (await flying('lamp')).length > 0, 20), 'the lifted lamp throws the same way as the bottle');
    assert(await waitFor(async () => (await flying('lamp')).length === 0, 60), 'the thrown lamp resolves');
    assert(await waitFor(async () => !(await anyProp('lamp')), 40), 'the thrown lamp always shatters on landing too');
  });

  // Block E (step 21.4, GDD 7 / docs/ARCHITECTURE.md 15): each BOT_STYLES archetype (game/bot.js) carries its own
  // throwChance, and the throwChance branch in botIntent is the ONLY path that makes an armed bot throw on
  // purpose. A defensive bot (throwChance 0.9) reliably throws its held weapon at a grunt it has not closed
  // distance to yet; an aggressive bot (throwChance 0) never throws, whether that grunt is ahead of it (the same
  // shape the defensive case uses) or spawned behind it (dx -60, the turn-guard case block A already covers for
  // an accidental throw -- here it is the deliberate throwChance branch that must stay silent for a whole run).
  await withPage(server, 'seed=1&skipTo=gameplay&chars=0&nowaves=1&godmode=1', async (g) => {
    await g.step(30);
    const equip = (slot, id, hits) => g.eval(([sl, i, h]) => window.__game.world.players[sl].pickUpWeapon({ weaponId: i, weaponHits: h }), [slot, id, hits]);
    const park = (slot, x, z) => g.eval(([sl, xx, zz]) => { const p = window.__game.world.players[sl]; p.x = xx; p.z = zz; p.facing = 1; }, [slot, x, z]);
    const clearItems = () => g.eval(() => { for (const e of window.__game.world.entities) if (e.kind === 'item') e.removeMe = true; });
    const clearProjectiles = () => g.eval(() => { for (const e of window.__game.world.entities) if (e.kind === 'projectile') e.removeMe = true; });
    const thrownAny = () => g.eval(() => window.__game.world.entities.some((e) => e.kind === 'projectile' && !e.removeMe && e.thrownWeapon));
    const setBot = (style) => g.eval((st) => { const p = window.__game.world.players[0]; p.bot = true; p.botStyle = st; }, style);
    const stopBot = () => g.eval(() => { window.__game.world.players[0].bot = false; });
    const runFor = async (frames) => { let saw = false; for (let i = 0; i < frames && !saw; i++) { await g.step(1); saw = await thrownAny(); } return saw; };
    const setUp = async (style, dx) => {
      await g.eval(() => window.__game.killAllEnemies());
      await clearItems(); await clearProjectiles();
      await park(0, 300, 70);
      await equip(0, 'halberd', 12);
      await setBot(style);
      await g.eval((d) => { const e = window.__game.spawnEnemy('typeA', 'grunt', d, 0); e.invuln = 999999; }, dx);
    };

    // (a) defensive (throwChance 0.9): a grunt held 150px ahead sits outside halberd's swinging reach (58 + 8 +
    // spacing 10 = 76, gap threshold reach + 20 = 96) but inside THROW.botRange (200) -- the bot throws at it
    // well before it would ever close that distance on foot.
    await setUp('defensive', 150);
    assert(await runFor(300), 'a defensive bot (throwChance 0.9) throws its held weapon at a target kept out of swinging reach');
    await stopBot();

    // (a2) The same defensive bot still throws when the target starts beyond THROW.botRange (280 > 200): it must
    // close in running first, which used to leave `running` true right through the throw window and dash-attack
    // instead of throwing (game/player.js thinkGround checks `running` before startWeaponThrow) -- review finding 4.
    await setUp('defensive', 280);
    assert(await runFor(300), 'a defensive bot still throws after having to run into range first (started at dx 280)');
    await stopBot();

    // (b) aggressive (throwChance 0) never throws with that same grunt ahead of it -- it always prefers closing
    // the distance to swing instead of spending its weapon at range.
    await setUp('aggressive', 150);
    assert(!(await runFor(300)), 'an aggressive bot (throwChance 0) never throws with the grunt ahead of it');
    await stopBot();

    // (c) aggressive never throws with the grunt spawned behind it (dx -60) either -- the throwChance gate is
    // unconditional on style, so even the turn this forces never becomes a throw.
    await setUp('aggressive', -60);
    assert(!(await runFor(300)), 'an aggressive bot (throwChance 0) never throws with the grunt spawned behind it');
    await stopBot();
    await g.eval(() => window.__game.killAllEnemies());
    await clearItems(); await clearProjectiles();
  });

  // Block F (step 21.6, optional stretch, GDD 7): behind the dev-only `?enemythrow=1` flag, a Scrap Slinger / Soot
  // Cutthroat lifts a nearby throwable prop exactly like a player (game/throwables.js tryEnemyPropThrow /
  // thinkEnemyHeld) and throws it at its target, always shattering on landing; a non-eligible variant standing in
  // the exact same spot never touches it, and neither does an eligible variant while `world.game.net.active` is
  // set (forced off in netplay -- the START packet does not carry the flag).
  await withPage(server, 'seed=1&skipTo=gameplay&chars=0&nowaves=1&godmode=1&enemythrow=1', async (g) => {
    await g.step(30);
    const park = (slot, x, z) => g.eval(([sl, xx, zz]) => { const p = window.__game.world.players[sl]; p.x = xx; p.z = zz; p.facing = 1; }, [slot, x, z]);
    const propState = (type) => g.eval((t) => {
      const p = window.__game.world.entities.find((e) => e.kind === 'prop' && e.type === t && e.state !== 'breaking');
      return p ? { x: p.x, z: p.z, state: p.state, holder: !!p.holder } : null;
    }, type);
    const anyProp = (type) => g.eval((t) => window.__game.world.entities.some((e) => e.kind === 'prop' && e.type === t && !e.removeMe), type);
    const flying = (type) => g.eval((t) => window.__game.world.entities.some((e) => e.kind === 'projectile' && !e.removeMe && e.thrownProp && e.thrownProp.type === t), type);
    const waitFor = async (pred, max) => { for (let i = 0; i < max; i++) { const v = await pred(); if (v) return v; await g.step(1); } return null; };
    const spawnHolder = (type, variant, x, z) => g.eval(([ty, va, xx, zz]) => {
      const e = window.__game.spawnEnemy(ty, va, 0, 0); e.x = xx; e.z = zz; e.facing = 1; e.hp = e.maxHp;
    }, [type, variant, x, z]);
    const holderState = (variant) => g.eval((va) => {
      const e = window.__game.world.enemies.find((x) => x.def.variant === va);
      return e ? { heldProp: !!e.heldProp, x: e.x, z: e.z } : null;
    }, variant);

    await g.eval(() => window.__game.killAllEnemies());
    await g.eval(() => { for (const e of window.__game.world.entities) if (e.kind === 'item') e.removeMe = true; });
    const bottle0 = await propState('bottle');
    assert(!!bottle0 && bottle0.state === 'idle', `stage1 s1 has an idle bottle for the enemy prop-throw stretch (got ${JSON.stringify(bottle0)})`);
    await park(0, bottle0.x - 100, bottle0.z);
    await g.step(10);

    // (a) Forced off in netplay: a cutthroat right next to the bottle never lifts it while world.game.net.active
    // is set, even with the dev flag on.
    await g.eval(() => { window.__game.world.game.net = { active: true }; });
    await spawnHolder('sootborn', 'cutthroat', bottle0.x - 20, bottle0.z);
    for (let i = 0; i < 90; i++) await g.step(1);
    const netHolder = await holderState('cutthroat');
    assert(!!netHolder && !netHolder.heldProp, 'an enemy never lifts a prop while world.game.net.active, even with ?enemythrow=1');
    await g.eval(() => { window.__game.world.game.net = null; window.__game.killAllEnemies(); });

    // (b) Only the eligible variants (Scrap Slinger, Soot Cutthroat) may lift at all: a footman standing in the
    // exact same spot never touches the bottle.
    await spawnHolder('brassbound', 'footman', bottle0.x - 20, bottle0.z);
    for (let i = 0; i < 90; i++) await g.step(1);
    const footmanBottle = await propState('bottle');
    assert(!!footmanBottle && footmanBottle.state === 'idle' && !footmanBottle.holder, 'a non-eligible enemy variant (footman) never lifts a throwable prop');
    await g.eval(() => window.__game.killAllEnemies());

    // (c) A Soot Cutthroat next to the bottle lifts it (spending an attack token, GDD 7), closes on its target
    // and throws it -- it always shatters on landing, exactly like a player's own thrown prop (block D).
    await spawnHolder('sootborn', 'cutthroat', bottle0.x - 20, bottle0.z);
    const lifted = await waitFor(async () => { const s = await holderState('cutthroat'); return s && s.heldProp ? s : null; }, 60);
    assert(!!lifted, 'a Soot Cutthroat lifts a nearby throwable prop behind ?enemythrow=1');
    const heldBottle = await propState('bottle');
    assert(!!heldBottle && heldBottle.state === 'held', `the lifted bottle enters state 'held' (got ${JSON.stringify(heldBottle)})`);
    assert(await waitFor(() => flying('bottle'), 60), 'the Soot Cutthroat throws the lifted bottle at its target');
    assert(await waitFor(async () => !(await flying('bottle')), 90), 'the enemy-thrown bottle resolves (hits or reaches its max distance)');
    assert(await waitFor(async () => !(await anyProp('bottle')), 40), 'the enemy-thrown bottle always shatters on landing, same as a player throw');
    await g.eval(() => window.__game.killAllEnemies());
  });

  // Block F, continued: the SAME setup with the dev flag OFF (default query, no ?enemythrow=1) never lifts at
  // all -- world.options.enemyThrow gates the whole feature off by default.
  await withPage(server, 'seed=1&skipTo=gameplay&chars=0&nowaves=1&godmode=1', async (g) => {
    await g.step(30);
    const park = (slot, x, z) => g.eval(([sl, xx, zz]) => { const p = window.__game.world.players[sl]; p.x = xx; p.z = zz; p.facing = 1; }, [slot, x, z]);
    const propState = (type) => g.eval((t) => {
      const p = window.__game.world.entities.find((e) => e.kind === 'prop' && e.type === t && e.state !== 'breaking');
      return p ? { state: p.state, holder: !!p.holder } : null;
    }, type);

    await g.eval(() => window.__game.killAllEnemies());
    const bottle0 = await g.eval(() => { const p = window.__game.world.entities.find((e) => e.kind === 'prop' && e.type === 'bottle'); return p ? { x: p.x, z: p.z } : null; });
    assert(!!bottle0, 'stage1 s1 has a bottle prop for the off-by-default check');
    await park(0, bottle0.x - 100, bottle0.z);
    await g.eval(([x, z]) => { const e = window.__game.spawnEnemy('sootborn', 'cutthroat', 0, 0); e.x = x; e.z = z; e.facing = 1; }, [bottle0.x - 20, bottle0.z]);
    for (let i = 0; i < 90; i++) await g.step(1);
    const after = await propState('bottle');
    assert(!!after && after.state === 'idle' && !after.holder, 'without ?enemythrow=1 an enemy never lifts a throwable prop (off by default)');
    await g.eval(() => window.__game.killAllEnemies());
  });
}
