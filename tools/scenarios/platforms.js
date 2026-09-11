// Moving platform scenarios for tools/playtest.js (issue #32). Receives the harness helpers so this file shares one
// browser, one assert and one results list with the main harness — the same pattern as tools/scenarios/thrown.js.
//
// One block per platform kind (game/platforms.js PLATFORM TABLE), each against the real authored section:
//   tilt    board 2's Cold Sovereign banking, and board 4's float dipping on its bladders
//   pallet  board 1's swinging cargo pallet on the Sootfoot Docks
//   hoist   board 3's yard hoist climbing to the kiln head
// The assertions are about what the platform does to BODIES, since that is the whole feature: a grounded fighter
// inherits the floor's motion and an airborne one does not. Plus the regression that matters most — the Brass
// Funicular, the section that has always been a vehicle, declares no platform and is untouched.
const DOCKS = 'seed=1&skipTo=gameplay&chars=0&stage=1&section=0&nowaves=1&godmode=1';
const FUNICULAR = 'seed=1&skipTo=gameplay&chars=0&stage=1&section=2&nowaves=1&godmode=1';
const SOVEREIGN = 'seed=1&skipTo=gameplay&chars=0&stage=2&section=2&nowaves=1&godmode=1';
const WORKS = 'seed=1&skipTo=gameplay&chars=0&stage=3&section=2&nowaves=1&godmode=1';

/**
 * @param {object} server
 * @param {{ withPage: Function, assert: Function }} deps
 */
export async function platforms(server, { withPage, assert }) {
  /** The runner's platform summary: { kind, phase, progress, offset } or null. */
  const plat = (g) => g.eval(() => (window.__game.summary().platform || null));
  const p1 = (g) => g.eval(() => {
    const p = window.__game.world.players[0];
    return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.y.toFixed(2), vy: +p.vy.toFixed(2) };
  });
  const park = (g, x, z) => g.eval(([xx, zz]) => {
    const p = window.__game.world.players[0];
    p.x = xx; p.z = zz; p.y = 0; p.vx = 0; p.vy = 0; p.vz = 0; p.hitstop = 0; p.setState('IDLE', 'idle');
  }, [x, z]);
  /** Step until the platform reports `phase`, up to `max` frames. */
  const untilPhase = async (g, phase, max = 700) => {
    for (let i = 0; i < max; i++) { const q = await plat(g); if (q && q.phase === phase) return i; await g.step(1); }
    return -1;
  };

  // ---------------------------------------------------------------- tilt (board 2, the Cold Sovereign banks)
  await withPage(server, SOVEREIGN, async (g) => {
    await g.step(30);
    const q = await plat(g);
    assert(!!q && q.kind === 'tilt', `the Cold Sovereign declares a tilt platform (got ${q && q.kind})`);
    assert((await untilPhase(g, 'tell')) >= 0, 'the deck tells before it banks (a gale you can hear coming)');
    assert((await untilPhase(g, 'active')) >= 0, 'and then it banks');

    // a fighter ON ITS FEET slides with the deck
    await park(g, 3900, 70);
    const a0 = await p1(g);
    await g.step(6);
    const a1 = await p1(g);
    assert(Math.abs(a1.x - a0.x) > 1, `a grounded body slides with the banking deck (${a0.x} -> ${a1.x})`);

    // a fighter IN THE AIR does not: it is not standing on anything
    await park(g, 3900, 70);
    await g.eval(() => { const p = window.__game.world.players[0]; p.y = 40; p.vy = 4; p.vx = 0; });
    const b0 = await p1(g);
    await g.step(4);
    const b1 = await p1(g);
    assert(b1.y > 0, 'the airborne check is still airborne after 4 frames');
    assert(Math.abs(b1.x - b0.x) < 0.01, `an airborne body is NOT carried by the deck (${b0.x} -> ${b1.x})`);
  });

  await withPage(server, 'seed=1&skipTo=gameplay&chars=0&stage=4&section=1&nowaves=1&godmode=1', async (g) => {
    await g.step(30);
    const q = await plat(g);
    assert(!!q && q.kind === 'tilt', `the Lash-Up float declares a tilt platform (got ${q && q.kind})`);
    // the float is authored slower and gentler than the flagship: a dip, not a bank
    assert(await g.eval(() => window.__game.world.platform.slide < 0.9 && window.__game.world.platform.period > 420),
      'the float dips slower and further than the flagship banks');
  });

  // ---------------------------------------------------------------- pallet (board 1, the Sootfoot Docks crane)
  await withPage(server, DOCKS, async (g) => {
    await g.step(30);
    const q = await plat(g);
    assert(!!q && q.kind === 'pallet', `the Sootfoot Docks declare a pallet platform (got ${q && q.kind})`);
    const box = await g.eval(() => { const p = window.__game.world.platform; return { x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1 }; });

    // standing ON it: carried. The pallet's offset moves every frame, so compare the body's drift against it.
    await park(g, (box.x0 + box.x1) / 2, (box.z0 + box.z1) / 2);
    let carried = false;
    for (let i = 0; i < 120; i++) {
      const before = await p1(g), o0 = (await plat(g)).offset;
      await g.step(1);
      const after = await p1(g), o1 = (await plat(g)).offset;
      if (o1 !== o0 && Math.abs(after.x - before.x) > 0.01) { carried = true; break; }
      if (i > 60) break;
    }
    assert(carried, 'a body standing on the pallet is carried by it');

    // standing OFF it: not carried, however far the pallet swings. The camera has to come along — World.boundsFor
    // clamps a player to the visible screen, so parking one off-camera just snaps it back to the edge (which is how
    // an earlier version of this assertion "failed" against correct code). Far enough left to stay clear of the
    // pallet at the far end of its own swing, too.
    await g.eval(([x]) => { const w = window.__game.world; w.camera.minX = 0; w.camera.snapTo(x - 420); }, [box.x0]);
    await park(g, box.x0 - 140, (box.z0 + box.z1) / 2);
    const c0 = await p1(g);
    await g.step(30);
    const c1 = await p1(g);
    assert(Math.abs(c1.x - c0.x) < 0.01, `a body off the pallet is left behind (${c0.x} -> ${c1.x})`);
  });

  // ---------------------------------------------------------------- hoist (board 3, the yard hoist to the kiln head)
  await withPage(server, WORKS, async (g) => {
    await g.step(30);
    const q = await plat(g);
    assert(!!q && q.kind === 'hoist', `the Tallow Works declares a hoist platform (got ${q && q.kind})`);
    assert(q.progress > 0 && q.progress < 1, `the climb is under way on section entry (progress ${q.progress})`);

    // The feel the issue asks for: a jump on a rising hoist lands sooner than it looks like it should, because the
    // floor is coming up to meet it. Measured as extra downward velocity while climbing — which is the only version
    // that does not make every rider permanently `airborne` (y > 0 || vy > 0) and so unable to act or be grabbed.
    await park(g, 2600, 70);
    await g.eval(() => { const p = window.__game.world.players[0]; p.y = 60; p.vy = 0; });
    const h0 = await p1(g);
    await g.step(1);
    const h1 = await p1(g);
    const gravityOnly = h0.vy - 0.5;
    assert(h1.vy < gravityOnly - 0.001, `a climbing hoist pulls an airborne body down faster than gravity alone (${h1.vy} < ${gravityOnly.toFixed(2)})`);

    // a body on the deck is standing on the thing that is climbing, so nothing happens to it
    await park(g, 2600, 70);
    const g0 = await p1(g);
    await g.step(10);
    const g1 = await p1(g);
    assert(Math.abs(g1.x - g0.x) < 0.01 && g1.y === 0, 'a grounded body is untouched by the climb');
  });

  // ---------------------------------------------------------------- the regression that matters
  await withPage(server, FUNICULAR, async (g) => {
    await g.step(30);
    assert((await plat(g)) === null, 'the Brass Funicular declares NO platform: the original moving section is untouched');
  });
}
