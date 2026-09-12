// BESTIARY scenarios for tools/playtest.js (issue #26). Receives the harness helpers so this file shares one
// browser, one assert and one results list with the main harness.
//
// The COUNTING RULES are covered in pure Node by tools/simtest.js, which needs no canvas and runs in a second.
// What can only be checked in a browser is the wiring: that `?skipTo=bestiary` opens a screen that draws without
// errors on a save with nothing in it, that a defeat in the real sim reaches the book through all three of its
// hooks (the death path, a ring-out, a boss phase), that the book survives a page reload, and that a bot run of
// board 1 opens the entries the board actually contains.
const BOOK = 'seed=1&skipTo=bestiary';
const ARENA = 'seed=1&skipTo=gameplay&chars=0&stage=1&godmode=1&nowaves=1';
// Board 2's first section is the Mooring Spine: an `open: true` rails zone with the back edge at z 12, which is
// where an enemy can actually be put over the side (tools/scenarios/thrown.js block B uses the same geometry).
const SPINE = 'seed=1&skipTo=gameplay&chars=0&stage=2&godmode=1&nowaves=1';
/** Mirrors BESTIARY_FLUSH_EVERY in src/game/screens/gameplay.js: how long a run can go before the book is written. */
const BESTIARY_FLUSH_EVERY = 300;

/**
 * @param {object} server
 * @param {{ withPage: Function, assert: Function }} deps
 */
export async function bestiaryScenarios(server, { withPage, assert }) {
  const book = (g) => g.eval(() => window.__game.bestiary());
  const entry = async (g, id) => (await book(g)).entries.find((e) => e.id === id) || null;
  /** Step until `fn` is truthy, up to `max` frames; returns frames spent or -1. */
  const until = async (g, fn, max = 600) => {
    for (let i = 0; i <= max; i++) { if (await fn()) return i; await g.step(1); }
    return -1;
  };
  /**
   * Spawn one enemy in front of P1 on one health and punch it, so the defeat goes down the REAL death path.
   * `killAllEnemies()` is deliberately not used here: it removes entities outright rather than killing them, so it
   * fires no death hook at all -- which is right for a harness sweep and useless for testing what a kill records.
   */
  const killOne = async (g, type, variant, gap = 52) => {
    await g.spawnEnemy(type, variant, 40);
    await g.step(4);
    await g.eval((d) => {
      const w = window.__game.world, p = w.players[0];
      const e = w.entities.filter((x) => x.kind === 'enemy' && !x.dead).pop();
      if (!e) return;
      e.hp = 1; e.x = p.x + d; e.z = p.z; e.facing = -1;
    }, gap);
    await g.press(0, { attack: true }, 3, 20);
  };
  /** Inside grab reach, so the attack button grabs and throws instead of swinging: a genuine throw kill. */
  const GRAB_GAP = 34;

  // ---------------------------------------------------------------- a fresh book is all silhouettes
  await withPage(server, BOOK, async (g) => {
    await g.step(10);
    assert(await g.screen() === 'bestiary', '?skipTo=bestiary opens the book');
    const b = await book(g);
    assert(b.entries.length === 39, `every registered variant and boss has a card (${b.entries.length})`);
    assert(b.seen === 0 && b.pct === 0, `a fresh save has opened nothing (${b.seen}/${b.total}, ${b.pct}%)`);
    assert(b.entries.every((e) => !e.seen), 'so every card is a silhouette');
    assert(b.scope === 'solo', `and the book is on the solo scope (${b.scope})`);
    await g.shot('26-bestiary-locked');

    // walking the screen must not throw: every tab builds its own rigs, and the boss tab builds the most
    for (let i = 0; i < 6; i++) { await g.press(0, { down: true }, 2, 4); }
    assert(await g.screen() === 'bestiary', 'the faction tabs wrap all the way round');
    for (let i = 0; i < 9; i++) { await g.press(0, { right: true }, 2, 4); }
    assert(await g.screen() === 'bestiary', 'and the cards wrap inside a tab');
    await g.shot('26-bestiary-tabs');
  });

  // ---------------------------------------------------------------- a defeat in the real sim opens an entry
  await withPage(server, ARENA, async (g, page) => {
    await g.step(30);
    assert((await book(g)).seen === 0, 'the arena starts with an empty book');
    assert(await g.eval(() => typeof window.__game.world.onEnemyRungOut === 'function'), 'the gameplay screen installs the ring-out hook');

    await killOne(g, 'brassbound', 'footman');
    assert(await until(g, async () => (await entry(g, 'brassbound:footman')).n > 0, 240) >= 0, 'killing a Tin Footman records it');
    const one = await entry(g, 'brassbound:footman');
    assert(one.seen && one.n === 1, `and opens its entry (seen ${one.seen}, beaten ${one.n})`);
    assert((await book(g)).seen === 1, 'exactly one entry, out of the whole book');

    // the NEW ENTRY plate is what tells the player mid-fight, so it has to actually be up
    assert(await g.eval(() => !!(window.__game.game.screen.hud || {}).newEntry), 'a NEW ENTRY plate is on the HUD for it');
    await g.step(20);   // let it finish sliding in, so the screenshot shows the plate rather than its first frame
    assert(await g.eval(() => ((window.__game.game.screen.hud || {}).newEntry || {}).name) === 'TIN FOOTMAN', 'and it names what was just beaten');
    await g.shot('26-bestiary-new-entry');

    assert(one.thrown === 0, `a punched enemy is not recorded as a throw kill (thrown ${one.thrown})`);


    // a second one counts but does not re-open anything -- and this one is thrown, which the book counts apart
    await killOne(g, 'brassbound', 'footman', GRAB_GAP);
    assert(await until(g, async () => (await entry(g, 'brassbound:footman')).n > 1, 240) >= 0, 'a second Tin Footman increments the count');
    assert((await book(g)).seen === 1, 'and the book still holds one entry, not two');
    const two = await entry(g, 'brassbound:footman');
    assert(two.thrown === 1, `a thrown one is recorded as a throw kill and the punched one still is not (thrown ${two.thrown} of ${two.n})`);

    // A modified spawn (game/traits.js SPAWN_MODS) keeps its def id but is RENAMED -- it records under the plain
    // entry, and the plate names the plain entry, not "SOOT CUTTHROAT (SCRIP)".
    await g.eval(() => { window.__game.game.screen.hud.newEntry = null; window.__game.game.screen.hud.newEntryQueue.length = 0; });
    await g.eval(() => {
      const w = window.__game.world, p = w.players[0];
      const scr = window.__game.game.screen;
      scr.spawnEnemyAt('sootborn', 'cutthroat', p.x + 52, p.z, { facing: -1, mods: ['scrip'] });
    });
    await g.step(4);
    await g.eval(() => {
      const w = window.__game.world, p = w.players[0];
      const e = w.entities.filter((x) => x.kind === 'enemy' && !x.dead).pop();
      if (e) { e.hp = 1; e.x = p.x + 52; e.z = p.z; }
    });
    await g.press(0, { attack: true }, 3, 20);
    assert(await until(g, async () => (await entry(g, 'sootborn:cutthroat')).n > 0, 240) >= 0, 'a SCRIP Cutthroat records under the plain Soot Cutthroat entry');
    assert(await g.eval(() => ((window.__game.game.screen.hud || {}).newEntry || {}).name) === 'SOOT CUTTHROAT',
      'and its NEW ENTRY plate names the book entry, not the modified spawn');

    // ...and it survives the trip through localStorage. Navigating away never runs the screen's exit(), so this is
    // specifically the PERIODIC flush being tested -- the path that keeps a closed tab from losing a run's kills.
    await g.step(BESTIARY_FLUSH_EVERY + 20);
    const url = page.url().replace('skipTo=gameplay', 'skipTo=bestiary');
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
    await g.step(10);
    const kept = await entry(g, 'brassbound:footman');
    assert(kept && kept.seen && kept.n === 2, `the book survives a reload (seen ${kept && kept.seen}, beaten ${kept && kept.n})`);
    await g.shot('26-bestiary-open');

    // ...and it is cleared with the rest of the save family, not left behind by it.
    await page.goto(url + '&resetprogress=1', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
    await g.step(10);
    assert((await book(g)).seen === 0, '?resetprogress=1 wipes the book along with the board unlocks and trial ticks');
  });

  // ---------------------------------------------------------------- a ring-out is a defeat too
  // game/items.js ringOut() sets `dead` WITHOUT calling die(), so it never reaches world.onDeath and needs its own
  // hook. That is exactly the kind of wiring a unit test cannot see.
  await withPage(server, SPINE, async (g) => {
    await g.step(30);
    await g.spawnEnemy('stormcrow', 'crimper', 60);
    await g.step(4);
    // Put it over the back rail in the state hazards.js rings out: airborne, knocked down, drifting past the edge.
    await g.eval(() => {
      const w = window.__game.world, e = w.entities.find((x) => x.kind === 'enemy');
      if (!e) return;
      e.lastHitBy = w.players[0];
      e.z = 14; e.vz = -4;
      e.knockDown(6, 0);
    });
    const rung = await until(g, async () => (await entry(g, 'stormcrow:crimper')).ring > 0, 240);
    const c = await entry(g, 'stormcrow:crimper');
    assert(rung >= 0, `an enemy put over the rail is recorded as a ring-out (ring ${c.ring})`);
    assert(c.seen && c.n === 1, `and counts as a defeat as well (seen ${c.seen}, beaten ${c.n})`);
  });

  // ---------------------------------------------------------------- the results plaque names what the run opened
  await withPage(server, ARENA, async (g) => {
    await g.step(30);
    await killOne(g, 'brassbound', 'footman');
    assert(await until(g, async () => (await entry(g, 'brassbound:footman')).n > 0, 240) >= 0, 'the arena run opens an entry before the plaque');
    await killOne(g, 'sootborn', 'cutthroat');
    assert(await until(g, async () => (await entry(g, 'sootborn:cutthroat')).n > 0, 240) >= 0, 'and a second one');
    await g.eval(() => window.__game.game.screen.showResults(false));
    await g.step(400);
    assert(await g.screen() === 'results', 'the run reaches the results plaque');
    const lines = await g.eval(() => window.__game.game.screen.entryLines);
    assert(lines.length > 0 && lines[0].startsWith('NEW BESTIARY ENTRIES'), `the plaque names what the run opened (${JSON.stringify(lines)})`);
    assert(lines.join(' ').includes('2') || lines.join(' ').includes('TIN FOOTMAN'),
      `and says which, or how many when a board unlock has the room (${JSON.stringify(lines)})`);
    await g.shot('26-bestiary-results');
  });

  // ---------------------------------------------------------------- a boss records its phases as it is driven
  // The third hook: reaching a boss phase is not a defeat, but it is what un-hides that phase's codex block, so the
  // book never spoils the person inside a machine the player has only half fought.
  await withPage(server, ARENA, async (g) => {
    await g.step(30);
    await g.eval(() => window.__game.spawnEnemy('midboss', 'grubbik', 90));
    await g.step(60);
    const before = await entry(g, 'midboss');
    assert(before.phases.length === 1 && !before.phases[0].seen, 'the Hoister\'s later phase starts hidden');

    // Drive it down phase by phase: drop it to one health, stand in front of it and hit it, until it is gone.
    for (let i = 0; i < 400; i++) {
      const alive = await g.eval(() => {
        const w = window.__game.world, b = w.boss, p = w.players[0];
        if (!b || !b.alive) return false;
        b.hp = 1; b.invuln = 0; b.transition = 0;
        p.x = b.x - 40; p.z = b.z; p.facing = 1;
        return true;
      });
      if (!alive) break;
      await g.press(0, { attack: true }, 3, 12);
    }
    await g.step(180);
    const after = await entry(g, 'midboss');
    assert(after.seen && after.n === 1, `beating the Hoister opens its entry (seen ${after.seen}, beaten ${after.n})`);
    assert(after.phases[0].seen, `and reaching GRUBBIK on foot un-hides that phase (${after.phases[0].name})`);

    // ...and the book draws it: the boss tab, with the phase strip naming what has been reached.
    await g.eval(() => window.__game.game.replace('bestiary', { tab: 'boss' }));
    await g.step(10);
    assert(await g.screen() === 'bestiary', 'the book opens on the BOSSES tab');
    await g.shot('26-bestiary-boss');
  });

  // ---------------------------------------------------------------- a bot run of board 1 fills board 1's factions
  await withPage(server, 'seed=7&skipTo=gameplay&chars=0&bot=1&godmode=1&stage=1', async (g) => {
    const MAX = 14000, CHUNK = 500;
    let frames = 0;
    const factionSeen = async (f) => (await book(g)).entries.some((e) => e.faction === f && e.seen);
    while (frames < MAX) {
      await g.step(CHUNK); frames += CHUNK;
      if (await factionSeen('brassbound') && await factionSeen('sootborn')) break;
      if (await g.screen() !== 'gameplay') break;   // the run ended (results / game over): stop stepping it
    }
    assert(await factionSeen('sootborn'), `the bot's run of board 1 opened a Sootborn entry within ${frames} frames`);
    assert(await factionSeen('brassbound'), 'and a Brassbound one');
    const b = await book(g);
    assert(b.seen > 0 && b.pct > 0, `the book reports its completion (${b.seen}/${b.total}, ${b.pct}%)`);
    assert(b.entries.filter((e) => e.seen).every((e) => e.n > 0), 'every open entry has at least one defeat behind it');
    await g.shot('26-bestiary-bot-run');
  });
}
