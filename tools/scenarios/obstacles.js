// Solid obstacle scenarios for tools/playtest.js (issue #31). Receives the harness helpers so this file shares one
// browser, one assert and one results list with the main harness — the same pattern as tools/scenarios/thrown.js.
//
// `solid` zones (game/hazards.js) are the first thing in the game that blocks movement, so the assertions here are
// about physics rather than about a rule firing: walking into a gap, clearing it with a jump, throwing a body into
// it, an enemy going OVER a wall it cannot walk round, and a barricade holding a wave lock until it is broken.
//
// The obstacles are the real authored ones rather than test fixtures, so these assertions also prove the content is
// placed sanely: board 1's Funicular roof gap (x 4340..4372, z 20..62) and board 2's Gas-Halls powder barricade.
// no godmode here: a gap costs health through takeHit, which godmode would swallow
const FUNICULAR = 'seed=1&skipTo=gameplay&chars=0&stage=1&section=2&nowaves=1';
const GASHALLS = 'seed=1&skipTo=gameplay&chars=0&stage=2&section=1&nowaves=1&godmode=1';
/** The board 1 roof gap, as authored in src/content/stage/stage1.js. */
const GAP = { x0: 4340, x1: 4372, z0: 20, z1: 62 };

/**
 * @param {object} server
 * @param {{ withPage: Function, assert: Function }} deps
 */
export async function obstacles(server, { withPage, assert }) {
  // ---------------------------------------------------------------- gaps (board 1, the Brass Funicular roof)
  await withPage(server, FUNICULAR, async (g) => {
    await g.step(30);
    // park AND wait until the hero can act again: an earlier assertion may have left them knocked down, and a jump
    // pressed during a get-up is silently dropped (which reads as "the jump did not clear the gap").
    const park = async (x, z) => {
      await g.eval(([xx, zz]) => {
        const p = window.__game.world.players[0];
        p.x = xx; p.z = zz; p.y = 0; p.vx = 0; p.vy = 0; p.vz = 0; p.facing = 1;
        p.hp = p.maxHp; p.hurtTimer = 0; p.invuln = 0; p.busy = 0; p.hitstop = 0; p.setState('IDLE', 'idle');
      }, [x, z]);
      for (let i = 0; i < 120; i++) {
        // `actionable` deliberately ignores hitstop, but Fighter.update early-returns while it is up and every input
        // pressed in that window is simply lost -- so the wait has to watch both.
        if (await g.eval(() => { const q = window.__game.world.players[0]; return q.actionable && q.hitstop <= 0; })) return true;
        await g.step(1);
      }
      return false;
    };
    // `pool` is hp PLUS the hero's regenerating shield (game/shield.js), because that buffer is spent first: a fall
    // worth 8% of max HP is absorbed entirely by a full shield, so watching hp alone reads a real drop as no drop.
    const p1 = () => g.eval(() => {
      const p = window.__game.world.players[0];
      return { x: Math.round(p.x), z: Math.round(p.z), y: Math.round(p.y), hp: p.hp, pool: p.hp + (p.shield || 0), state: p.state };
    });
    const zoneThere = () => g.eval(() => window.__game.world.entities.some((e) => e.isSolid && e.height === 0 && !e.removeMe));
    assert(await zoneThere(), 'the Funicular roof gap exists as a solid zone on the section');

    // (a) walk into it: the floor is not there, so it costs health and footing — not a life (the netGive rule)
    await park(GAP.x0 - 26, 40);
    const before = await p1();
    let knocked = false;
    for (let i = 0; i < 40; i++) {
      await g.press(0, { right: true }, 1, 0);
      const s = await p1();
      if (s.state === 'KNOCKDOWN' || s.pool < before.pool) { knocked = true; break; }
    }
    const fell = await p1();
    assert(knocked, 'walking into a gap drops the player through it');
    assert(fell.pool < before.pool, `and it costs health (pool ${before.pool} -> ${fell.pool})`);
    assert(fell.hp > 0, 'a gap costs health, not a life');
    const inBox = fell.x >= GAP.x0 && fell.x <= GAP.x1 && fell.z >= GAP.z0 && fell.z <= GAP.z1;
    assert(!inBox, `a player who falls in is set back outside the hole (landed at x=${fell.x} z=${fell.z})`);

    // (b) jump it: airborne above `height` (0 for a gap means nothing blocks, so this is about clearing the hole)
    assert(await park(GAP.x0 - 24, 40), 'the hero is on its feet before the jump');
    const pool0 = (await p1()).pool;
    await g.press(0, { right: true, jump: true }, 3, 0);
    for (let i = 0; i < 40; i++) { await g.press(0, { right: true }, 1, 0); if ((await p1()).x > GAP.x1) break; }
    const over = await p1();
    assert(over.x > GAP.x1, `a running jump clears the gap (got x=${over.x}, far lip ${GAP.x1})`);
    assert(over.pool === pool0, 'clearing the gap costs nothing');

    // (c) a body thrown into it is gone: an enemy standing in the hole rings out (+200), it does not just stand there
    await park(GAP.x0 - 60, 40);
    const alive = () => g.eval(() => window.__game.world.entities.filter((e) => e.kind === 'enemy' && !e.removeMe && !e.dead).length);
    await g.eval(([x, z]) => window.__game.world.stage.screen.spawnEnemyAt('brassbound', 'footman', x, z, { facing: -1 }),
      [(GAP.x0 + GAP.x1) / 2, (GAP.z0 + GAP.z1) / 2]);
    await g.step(2);
    assert(await alive() >= 0, 'an enemy can be placed on the gap for the ring-out check');
    let gone = false;
    for (let i = 0; i < 60; i++) { await g.step(1); if (await alive() === 0) { gone = true; break; } }
    assert(gone, 'an enemy standing in the gap rings out rather than standing on nothing');

    // (d) an enemy on the far side comes OVER the obstacle to reach the player. The roof gap has a clear lane in z,
    // so this uses the jump-over rule's other trigger: a wall with no lane, placed across the whole band.
    await g.eval(() => { for (const e of window.__game.world.entities) if (e.kind === 'enemy') e.removeMe = true; });
    await g.eval(() => {
      // a full-band wall between the player and the spawn: laneAroundHazards has nowhere to steer, so the only way is over
      const w = window.__game.world, Zone = w.entities.find((e) => e.isSolid).constructor;
      w.add(new Zone({ type: 'solid', x0: 4180, x1: 4206, z0: 0, z1: 140, height: 40 }));
    });
    await park(4120, 70);
    await g.eval(() => window.__game.world.stage.screen.spawnEnemyAt('brassbound', 'footman', 4300, 70, { facing: -1 }));
    let jumped = false, crossed = false;
    for (let i = 0; i < 400; i++) {
      const e = await g.eval(() => {
        const q = window.__game.world.entities.find((n) => n.kind === 'enemy' && !n.removeMe);
        return q ? { x: Math.round(q.x), y: Math.round(q.y) } : null;
      });
      if (!e) break;
      if (e.y > 4) jumped = true;
      if (e.x < 4180) { crossed = true; break; }
      await g.step(1);
    }
    assert(jumped, 'an enemy walled off from its target leaves the ground to get over');
    assert(crossed, 'and it actually reaches the far side rather than grinding against the wall');

    // (e) A solid is a RECTANGLE, and a fighter walks in z as freely as in x. Stepping into a wall's z band while
    // already inside its x range must stop the body on the z face -- resolving that in x would pick a face from a
    // prevX that is itself between x0 and x1 and eject the body out of the FAR side, through the wall it touched.
    await g.eval(() => { for (const e of window.__game.world.entities) if (e.kind === 'enemy') e.removeMe = true; });
    const wall = await g.eval(() => {
      const w = window.__game.world, Zone = w.entities.find((e) => e.isSolid).constructor;
      const z = new Zone({ type: 'solid', x0: 4240, x1: 4290, z0: 70, z1: 140, height: 40 });
      w.add(z);
      return { x0: z.x0, x1: z.x1, z0: z.z0, z1: z.z1 };
    });
    assert(await park((wall.x0 + wall.x1) / 2, wall.z0 - 20), 'the hero is on its feet inside the wall\'s x range, clear of its z band');
    const zBefore = await p1();
    for (let i = 0; i < 40; i++) await g.press(0, { down: true }, 1, 0);
    const zAfter = await p1();
    assert(Math.abs(zAfter.x - zBefore.x) < 20, `walking into a wall along z does not eject the body in x (${zBefore.x} -> ${zAfter.x})`);
    assert(!(zAfter.z > wall.z0 && zAfter.z < wall.z1), `and it stops on the z face rather than inside the wall (z=${zAfter.z})`);
  });

  // ---------------------------------------------------------------- barricades (board 2, the Gas-Halls)
  await withPage(server, GASHALLS, async (g) => {
    await g.step(30);
    const bar = () => g.eval(() => {
      const z = window.__game.world.entities.find((e) => e.isSolid && e.breakable && !e.removeMe);
      return z ? { blocking: z.blocking, hasProp: !!z.prop, propAlive: !!(z.prop && z.prop.alive), x0: z.x0, x1: z.x1 } : null;
    });
    const holding = () => g.eval(() => window.__game.world.stage.barricadeHolding());

    const b0 = await bar();
    assert(!!b0, 'the Gas-Halls barricade exists as a breakable solid zone');
    assert(b0.hasProp, 'the zone found the `barricade` Prop that holds it up (the Prop owns the hp, so it is hashed)');
    assert(b0.blocking, 'a barricade with its prop standing blocks');

    // the wave lock: while the barricade stands inside a locked camera, the wave does not clear
    await g.eval(([x0, x1]) => {
      const w = window.__game.world;
      w.players[0].x = (x0 + x1) / 2 - 80;
      w.camera.lock(x0 - 200, x1 + 200);
    }, [b0.x0, b0.x1]);
    await g.step(2);
    assert(await holding(), 'a standing barricade inside the camera lock holds the wave open');

    // ...but only WHOLLY inside it. A lock whose edge cuts the barricade leaves the party asked to break something
    // half off the screen they cannot walk past, which reads as a cleared room that never opens (board 3's yard gate
    // sits 6px outside the lock the first Tallow Works wave takes). One that far out belongs to the next wave.
    // (the lock is always at least one screen wide, so each of these is anchored on the edge being tested)
    const mid = Math.round((b0.x0 + b0.x1) / 2);
    await g.eval((m) => window.__game.world.camera.lock(m - 640, m), mid);
    await g.step(2);
    assert(!(await holding()), 'a barricade straddling the right edge of the lock does not hold the wave');
    await g.eval((m) => window.__game.world.camera.lock(m, m + 640), mid);
    await g.step(2);
    assert(!(await holding()), 'nor does one the party has already walked most of the way past');
    await g.eval(([x0, x1]) => {
      const w = window.__game.world;
      w.players[0].x = (x0 + x1) / 2 - 80;
      w.camera.lock(x0 - 200, x1 + 200);
    }, [b0.x0, b0.x1]);
    await g.step(2);
    assert(await holding(), 'and it holds again once the whole gate is back inside the lock');

    // break it: the block lifts, and so does the lock
    await g.eval(() => {
      const z = window.__game.world.entities.find((e) => e.isSolid && e.breakable && !e.removeMe);
      z.prop.hp = 0; z.prop.break(null);
    });
    await g.step(4);
    const b1 = await bar();
    assert(!!b1 && !b1.blocking, 'a broken barricade stops blocking');
    assert(!(await holding()), 'and stops holding the wave open');
    assert(await g.eval(() => {
      const z = window.__game.world.entities.find((e) => e.isSolid && e.breakable && !e.removeMe);
      return z.dangerBox() === null;
    }), 'a broken barricade reports no dangerBox, so enemies stop routing around a wall that is not there');
  });
}
