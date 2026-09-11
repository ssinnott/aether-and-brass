// Scenery entrance scenarios for tools/playtest.js (issue #34). Receives the harness helpers so this file shares one
// browser, one assert and one results list with the main harness.
//
// `cargo` is a prop carrying spawn specs, and the whole point is that the container is the tell: a unit never simply
// appears next to you, it comes out of something you could see. Checked against the real authored containers —
// board 1's rattling quay crates and its foundry chute, board 2's brig hatch, board 3's yard handcart — because the
// placement is as much the feature as the mechanism.
const DOCKS = 'seed=1&skipTo=gameplay&chars=0&stage=1&section=0&nowaves=1&godmode=1';
const FOUNDRY = 'seed=1&skipTo=gameplay&chars=0&stage=1&section=1&nowaves=1&godmode=1';
const SOVEREIGN = 'seed=1&skipTo=gameplay&chars=0&stage=2&section=2&nowaves=1&godmode=1';
const WORKS = 'seed=1&skipTo=gameplay&chars=0&stage=3&section=2&nowaves=1&godmode=1';

/**
 * @param {object} server
 * @param {{ withPage: Function, assert: Function }} deps
 */
export async function cargo(server, { withPage, assert }) {
  const prop = (g, name) => g.eval((n) => {
    const p = window.__game.world.entities.find((e) => e.kind === 'prop' && e.name === n && !e.removeMe);
    return p ? { x: Math.round(p.x), z: Math.round(p.z), hp: p.hp, alive: p.alive, left: p.cargo ? p.cargo.length : 0,
      on: p.cargoOn, t: p.cargoT, every: p.cargoEvery, held: p.cargoHeld, box: p.dangerBox ? p.dangerBox() : null } : null;
  }, name);
  const mobs = (g) => g.eval(() => window.__game.world.entities.filter((e) => e.kind === 'enemy' && !e.removeMe)
    .map((e) => ({ v: e.def.variant, ai: e.aiState, x: Math.round(e.x), y: Math.round(e.y), pun: !!e.punishable })));
  const items = (g) => g.eval(() => window.__game.world.entities.filter((e) => e.kind === 'item' && !e.removeMe).length);
  const smash = (g, name) => g.eval((n) => {
    const p = window.__game.world.entities.find((e) => e.kind === 'prop' && e.name === n && !e.removeMe);
    p.hp = 0; p.break(window.__game.world.players[0]);
  }, name);
  const until = async (g, fn, max = 900) => {
    for (let i = 0; i <= max; i++) { if (await fn()) return i; await g.step(1); }
    return -1;
  };

  // ---------------------------------------------------------------- break a crate: the cargo climbs out, punishably
  await withPage(server, DOCKS, async (g) => {
    await g.step(30);
    const c = await prop(g, 'quay1');
    assert(!!c && c.left === 1, 'the quay crate is carrying one unit');
    assert(c.on === 'break', 'and it lets them out when it is broken');
    assert(await mobs(g).then((m) => m.length === 0), 'nothing is out yet');

    await smash(g, 'quay1');
    await g.step(2);
    const out = await mobs(g);
    assert(out.length === 1, `breaking the crate tips its cargo out (got ${out.length})`);
    assert(out[0].ai === 'ARRIVING', 'the unit arrives through an entrance rather than simply existing');
    assert(out[0].y === 0, 'a climb-out arrives on its feet, not out of the sky');
    assert(Math.abs(out[0].x - c.x) < 40, 'and it comes out where the crate was standing');

    // the arrival is the punish window: it stands up slowly enough to be collected
    const punished = await until(g, async () => (await mobs(g))[0] && (await mobs(g))[0].pun, 120);
    assert(punished >= 0, 'the climb-out ends in a punishable recovery');
    const done = await until(g, async () => { const m = (await mobs(g))[0]; return m && m.ai !== 'ARRIVING'; }, 200);
    assert(done >= 0, 'and then it joins the fight as an ordinary enemy');
  });

  // ---------------------------------------------------------------- the chute: on a timer, and holdable
  await withPage(server, FOUNDRY, async (g) => {
    await g.step(30);
    const c = await prop(g, 'chute');
    assert(!!c && c.on === 'timer' && c.left === 2, 'the foundry chute is on a timer with two units in it');
    assert(c.box === null, 'a quiet chute is not a threat zone (an enemy must not refuse that lane all board)');

    // park the player well clear, and let the chute run
    await g.eval(([x]) => { const w = window.__game.world; w.camera.minX = 0; w.camera.snapTo(x - 320); const p = w.players[0]; p.x = x - 150; p.z = 30; }, [c.x]);
    const rattled = await until(g, async () => (await prop(g, 'chute')).box !== null, 400);
    assert(rattled >= 0, 'the chute rattles before it opens, and the rattle IS a threat zone the bots can read');
    const opened = await until(g, async () => (await mobs(g)).length > 0, 400);
    assert(opened >= 0, 'and then it lets one out');
    assert((await prop(g, 'chute')).left === 1, 'one at a time, not the whole load');

    // STAND ON IT: the clock stops while somebody is on the lip
    await g.eval(([x, z]) => { const p = window.__game.world.players[0]; p.x = x; p.z = z; p.y = 0; }, [c.x, c.z]);
    await g.step(20);
    const held = await prop(g, 'chute');
    assert(held.held > 0, 'standing on the chute holds it shut');
    const t0 = held.t;
    await g.step(60);
    const still = await prop(g, 'chute');
    assert(still.t === t0, `and its clock does not advance while it is held (${t0} -> ${still.t})`);
    assert(still.left === 1, 'so nothing else comes out');

    // step off and it picks up where it left off rather than resetting: holding buys time, it does not cancel
    await g.eval(([x]) => { const p = window.__game.world.players[0]; p.x = x - 150; }, [c.x]);
    await g.step(20);
    assert((await prop(g, 'chute')).t > t0, 'stepping off lets the clock run on from where it stopped');
  });

  // ---------------------------------------------------------------- smash a timer container: the rest is loot
  await withPage(server, SOVEREIGN, async (g) => {
    await g.step(30);
    const h = await prop(g, 'hatch');
    assert(!!h && h.on === 'timer' && h.left === 2, 'the brig hatch is carrying two');
    const before = await items(g);
    await smash(g, 'hatch');
    await g.step(4);
    assert((await mobs(g)).length === 0, 'smashing a timer container does NOT tip its whole load out at once');
    assert(await items(g) > before, 'the cargo that never came out is loot instead');
  });

  // ---------------------------------------------------------------- a wave that comes out of a named cart
  await withPage(server, WORKS, async (g) => {
    await g.step(30);
    const cart = await prop(g, 'yardcart');
    assert(!!cart, 'the yard handcart is on the section and carries an author key');

    // the wave addresses the cart by name: queue it by hand so this does not depend on walking to the trigger
    await g.eval(() => window.__game.world.stage.queueSpawns([
      { type: 'brassbound', variant: 'footman', delay: 0, entrance: { kind: 'cargo', prop: 'yardcart' } },
    ]));
    await g.step(4);
    const out = await mobs(g);
    assert(out.length === 1, 'the wave entry spawns through the cart');
    assert(Math.abs(out[0].x - cart.x) < 40, `and it comes out AT THE CART rather than at the lock edge (${out[0].x} vs ${cart.x})`);
    assert(out[0].ai === 'ARRIVING', 'through the climb-out entrance');
    // ON ITS FEET. A wave-addressed spec carries `{ kind: 'cargo' }`, and letting that reach entranceFor resolves a
    // `cargo` entrance -- which is not in startArrival's grounded set, so the unit DROPS OUT OF THE SKY instead of
    // climbing out of the box it is standing in. The point of the whole feature is that it comes out of the cart.
    assert(out[0].y === 0, `a cargo unit climbs out of the container, it does not fall from the sky (y=${out[0].y})`);

    // Break the cart first and the same wave entry still delivers. A wave-supplied load is not in the cart until the
    // wave fires, so breaking it early cannot turn those units into loot the way a pre-loaded crate's cargo does --
    // and a wave must never be an enemy short because scenery got smashed. They climb out of the wreck instead.
    await g.eval(() => window.__game.killAllEnemies());
    await smash(g, 'yardcart');
    await g.step(60);                                  // let the break animation finish and the body leave the world
    assert((await prop(g, 'yardcart')) === null, 'the cart is gone');
    await g.eval(() => window.__game.world.stage.queueSpawns([
      { type: 'brassbound', variant: 'footman', z: 70, delay: 0, entrance: { kind: 'cargo', prop: 'yardcart' } },
    ]));
    await g.step(4);
    assert((await mobs(g)).length === 1, 'a cargo spawn whose container is already broken still arrives');
  });
}
