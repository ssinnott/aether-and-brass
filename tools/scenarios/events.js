// Scripted mid-board event scenarios for tools/playtest.js (issue #33). Receives the harness helpers so this file
// shares one browser, one assert and one results list with the main harness.
//
// The ACTION SEQUENCING is covered in pure Node by tools/simtest.js, which needs no canvas and runs in a second.
// What can only be checked in the browser is the wiring: that `?event=<id>` finds an event and starts the party in
// front of it, that a real authored script actually fires and reaches the world (a hazard forced, a warning patch
// placed, units spawned), and that a hazard override is handed back afterwards rather than stranding a vent open.
const OVERFIRE = 'seed=1&skipTo=gameplay&chars=0&stage=1&godmode=1&event=overfire';
const BROADSIDE = 'seed=1&skipTo=gameplay&chars=0&stage=2&godmode=1&event=broadside';

/**
 * @param {object} server
 * @param {{ withPage: Function, assert: Function }} deps
 */
export async function events(server, { withPage, assert }) {
  const ev = (g) => g.eval(() => (window.__game.summary().event || null));
  const flashes = (g) => g.eval(() => window.__game.world.entities.filter((e) => e.isHazard && e.dangerBox && e.life && e.color && !e.removeMe && e.z === -4).length);
  const forced = (g, name) => g.eval((n) => window.__game.world.entities.filter((e) => e.isHazard && e.name === n && e.forcePhase).length, name);
  const named = (g, name) => g.eval((n) => window.__game.world.entities.filter((e) => e.isHazard && e.name === n).length, name);
  /** Step until `fn` is truthy, up to `max` frames; returns frames spent or -1. */
  const until = async (g, fn, max = 2400) => {
    for (let i = 0; i <= max; i++) { if (await fn()) return i; await g.step(1); }
    return -1;
  };

  // ---------------------------------------------------------------- board 1: the Regent Engine over-fires
  await withPage(server, OVERFIRE, async (g) => {
    await g.step(30);
    const s = await g.summary();
    assert(s.sectionIndex === 3, `?event=overfire starts in the section that owns it (got ${s.sectionIndex})`);
    assert(await named(g, 'daisVents') === 3, 'the three dais vents carry the author key the script addresses them by');

    // Walk the party in and clear the two waves the event waits on, but never past x 5600: board 1's boss trigger is
    // at 5900 and killAllEnemies would take the boss with it, ending the run before the script ever armed.
    let fired = -1;
    for (let i = 0; i < 120 && fired < 0; i++) {
      const px = await g.eval(() => Math.round(window.__game.world.players[0].x));
      if (px < 5600) await g.press(0, { right: true }, 6, 0);
      await g.eval(() => window.__game.killAllEnemies());
      await g.step(24);
      if (await ev(g)) fired = i;
    }
    assert(fired >= 0, 'the over-fire script fires after the section\'s second wave');

    // the warning comes BEFORE anything hurts: a flash patch is on the floor while the vents are still on their cycle
    assert(await flashes(g) > 0, 'a zoneFlash warning is on the floor when the script starts');
    assert(await forced(g, 'daisVents') === 0, 'and nothing is forced yet — the warning leads the hazard');

    // ...then every vent opens at once
    const opened = await until(g, async () => (await forced(g, 'daisVents')) === 3, 900);
    assert(opened >= 0, 'every dais vent is forced open together once the warning has run');

    // ...and it is handed back, rather than leaving the floor lethal for the rest of the board
    const reverted = await until(g, async () => (await ev(g)) === null, 1200);
    assert(reverted >= 0, 'the script finishes');
    assert(await forced(g, 'daisVents') === 0, 'and every vent override is reverted with it');
  });

  // ---------------------------------------------------------------- board 2: the broadside
  await withPage(server, BROADSIDE, async (g) => {
    await g.step(30);
    assert(await named(g, 'aft') === 1 && await named(g, 'forward') === 1, 'both guns carry their own author key');
    let fired = -1;
    for (let i = 0; i < 90 && fired < 0; i++) {
      await g.press(0, { right: true, attack: true }, 6, 0);
      await g.eval(() => window.__game.killAllEnemies());
      await g.step(24);
      if (await ev(g)) fired = i;
    }
    assert(fired >= 0, 'the broadside script fires');
    // the two guns fire one after the other, not together: that is what makes it a question about where you stand
    const aft = await until(g, async () => (await forced(g, 'aft')) === 1, 600);
    assert(aft >= 0, 'the aft gun is forced first');
    const fwd = await until(g, async () => (await forced(g, 'forward')) === 1, 600);
    assert(fwd >= 0, `and the forward gun follows it (${fwd} frames later)`);
    const done = await until(g, async () => (await ev(g)) === null, 1200);
    assert(done >= 0, 'the script finishes');
    assert(await forced(g, 'aft') === 0 && await forced(g, 'forward') === 0, 'and both guns go back on their own cycle');
  });

  // ---------------------------------------------------------------- an unknown id is inert, not a crash
  await withPage(server, 'seed=1&skipTo=gameplay&chars=0&stage=1&godmode=1&nowaves=1&event=nosuchevent', async (g) => {
    await g.step(60);
    assert((await g.summary()).sectionIndex === 0, 'an unknown ?event= id leaves the run at the section start');
    assert((await ev(g)) === null, 'and nothing is armed');
  });
}
