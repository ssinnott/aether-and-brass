// Story-beat scenarios for tools/playtest.js (issue #25). Receives the harness helpers so this file shares one
// browser, one assert and one results list with the main harness — the same pattern as scenarios/events.js.
//
// The SEQUENCING is covered in pure Node by tools/simtest.js (suite `beats`), which needs no canvas. What can only
// be checked in a real browser is the part that is wiring rather than logic, and it is the part issue #25 actually
// promises:
//
//   - board 1's intro beat runs from the first frame of the run to its end, with NO enemies in front of the party
//     for the whole of it — that is the difference between a playable beat and a cutscene with a walk animation;
//   - the player keeps control the entire time (this is the one hard rule: netplay's own scenarios press right at
//     section 0 and assert the party moves, so a beat that froze input there would break them);
//   - an opening stages NOBODY: it letters the board's name on real signs and takes them away again when it ends,
//     and it puts no body on the floor at all, because a body in an enemy's rig that cannot be hit is a fight the
//     player is offered and then denied;
//   - the LETTERBOX is in for the whole beat and out again afterwards, which is the only thing on screen that says
//     whether the opening is still running;
//   - the wave director is only HELD, never broken: the first wave arrives normally once the beat is over;
//   - `?bot=1` skips the whole thing, which is what keeps tools/winrate.js seeing the run it saw before.
const BOARD1 = 'seed=1&skipTo=gameplay&chars=0&stage=1&godmode=1';
const BOARD1_BOT = 'seed=1&skipTo=gameplay&chars=0&stage=1&godmode=1&bot=1';
/** Board 1's first wave triggers at x 400 (src/content/stage/stage1.js); the beat holds it until the script ends. */
const FIRST_WAVE_X = 400;
/** Frames into the beat the sign screenshot is taken — early enough that the hoarding is still on camera, and past
 *  the letterbox's own 18-frame slide (game/stage.js CINEMA_SLIDE) so the bars are fully in by then. */
const SIGN_SHOT_AT = 40;
/** Frames allowed for the bars to travel back out once a beat has ended — CINEMA_SLIDE with room to spare. */
const CINEMA_OUT = 30;

/**
 * @param {object} server
 * @param {{ withPage: Function, assert: Function }} deps
 */
export async function beats(server, { withPage, assert }) {
  const beat = (g) => g.eval(() => window.__game.summary().beat || null);
  const ev = (g) => g.eval(() => window.__game.summary().event || null);
  const enemies = (g) => g.eval(() => window.__game.world.enemies.length);
  const signs = (g) => g.eval(() => window.__game.world.entities.filter((e) => e.text != null && e.style && !e.removeMe).length);
  const px = (g) => g.eval(() => Math.round(window.__game.world.players[0].x));

  // ---------------------------------------------------------------- board 1: watch the intro beat to its end
  await withPage(server, BOARD1, async (g) => {
    await g.step(2);
    const armed = await ev(g);
    assert(armed && armed.id === 'intro1', `the board 1 intro beat arms on the first frames (got ${armed && armed.id})`);
    assert((await beat(g)).on === true, 'beats are on for a normal run');

    // The sign is up on the script's opening frame, and nobody is on the floor with the party.
    const staged = await beat(g);
    assert(staged.signs === 1, `the board name is lettered on a sign in the world, not on a title card (got ${staged.signs})`);
    assert(await signs(g) === 1, 'the sign is really in the world, not only counted');
    assert(staged.actors === 0, `the opening stages no bodies at all (got ${staged.actors})`);
    // the board's name as the player actually meets it: lettered on the hoarding at the head of the quay
    await g.step(SIGN_SHOT_AT);
    assert((await beat(g)).letterbox === 1, 'the letterbox is fully in while the beat is running');
    await g.shot('25-intro-sign');

    // Walk the beat to its end, holding right the whole way. Two things are asserted on every step and they are the
    // heart of the issue: the party is MOVING (so nothing took control away) and there is nothing to fight.
    const startX = await px(g);
    // the beat has already been running for the frames spent lining up the screenshot above, and the assertion
    // below is about how long the BEAT lasts, not how long this loop ran
    let maxEnemies = 0, maxActors = 0, maxSigns = 0, frames = SIGN_SHOT_AT, moved = 0;
    while (frames < 1100) {
      await g.press(0, { right: true }, 10, 0);
      frames += 10;
      const e = await enemies(g);
      if (e > maxEnemies) maxEnemies = e;
      const b = await beat(g);
      if (b.actors > maxActors) maxActors = b.actors;
      if (b.signs > maxSigns) maxSigns = b.signs;
      const running = await ev(g);
      if (!running || running.id !== 'intro1') break;
      moved = (await px(g)) - startX;
    }
    assert(frames >= 620 && frames <= 820, `the intro beat lasts ten to thirteen seconds (${frames} frames)`);
    assert(maxEnemies === 0, `no enemy appears during the intro beat (peak ${maxEnemies})`);
    assert(maxActors === 0, `and no body is staged in it either, at any point (peak ${maxActors})`);
    assert(maxSigns === 2, `the second hoarding goes up further along the quay (peak ${maxSigns} signs)`);
    assert(moved > 120, `the player walks the beat under their own control (moved ${moved}px)`);
    assert(await px(g) > FIRST_WAVE_X, 'the party is past the first wave trigger by the time the beat ends');
    await g.shot('25-intro-beat');

    // The lettering is struck when the script ends, and the wave the beat was holding arrives immediately after.
    const struck = await beat(g);
    assert(struck.actors === 0 && struck.signs === 0, `the beat takes its lettering away with it (${struck.actors} actors, ${struck.signs} signs)`);
    // ...and the bars come back out, which is what tells the player the opening is over rather than merely quiet.
    // Stepped on a few frames first: the loop above breaks on a 10-frame press boundary, so the beat may have ended
    // on the very last of those frames and the retract not have had a frame to start in.
    await g.step(4);
    assert((await beat(g)).letterbox < 1, 'the letterbox starts retracting once the beat ends');
    await g.step(CINEMA_OUT);
    assert((await beat(g)).letterbox === 0, 'and it is fully out a third of a second later');
    const waveFrames = await (async () => {
      for (let i = 0; i < 240; i++) { if (await enemies(g) > 0) return i; await g.step(1); }
      return -1;
    })();
    assert(waveFrames >= 0, 'the first wave arrives once the beat has finished holding it');
    assert((await g.summary()).screen === 'gameplay', 'the run is still in gameplay, not a cutscene screen');
  });

  // ---------------------------------------------------------------- outrunning the beat
  // The beat holds the wave director, and with nothing to stop them a player who RUNS covers about 1900px in the
  // eight seconds board 1's opening lasts — section 1 ends at 1800. Without a bound they would cross into Foundry
  // Row having skipped every fight on the quay. The beat holds the section too, and stands down the moment the
  // party reaches the last thing the section had to throw at them.
  await withPage(server, BOARD1, async (g) => {
    await g.step(2);
    assert((await ev(g)).id === 'intro1', 'the beat is running');
    // teleport past the section's last wave trigger (1650) — the same thing a fast run arrives at, without
    // depending on how quickly the harness can drive a hero across 1500px
    await g.eval(() => { const w = window.__game.world; w.players[0].x = 1700; w.camera.x = 1380; });
    await g.step(4);
    const after = await ev(g);
    assert(!after || after.id !== 'intro1', 'the beat stands down once the party has outrun the section');
    const struck = await beat(g);
    assert(struck.actors === 0 && struck.signs === 0, 'and takes its lettering with it');
    // a beat cut off mid-caption has to put the bars away too — this is the case the retract most needs to cover
    await g.step(CINEMA_OUT);
    assert((await beat(g)).letterbox === 0, 'the letterbox retracts on an outrun as well as on a clean end');
    const s = await g.summary();
    assert(s.sectionIndex === 0, `the party is still in section 1 rather than having skipped it (got ${s.sectionIndex})`);
    const waveFrames = await (async () => {
      for (let i = 0; i < 240; i++) { if (await enemies(g) > 0) return i; await g.step(1); }
      return -1;
    })();
    assert(waveFrames >= 0, 'and the section it skipped into plays out normally');
  });

  // ---------------------------------------------------------------- the other three boards open the same way
  // Board 1 is walked end to end above; these check that each remaining board's beat arms, letters its own name on
  // its own kind of board, and stages its cast — the four openings are authored separately and a typo in a def slug
  // or a style name is silent at runtime (a missing actor is simply a body that never appears).
  for (const [stage, id] of [[2, 'intro2'], [3, 'intro3'], [4, 'intro4']]) {
    await withPage(server, `seed=1&skipTo=gameplay&chars=0&stage=${stage}&godmode=1`, async (g) => {
      await g.step(2);
      const armed = await ev(g);
      assert(armed && armed.id === id, `board ${stage} opens on its intro beat (got ${armed && armed.id})`);
      const staged = await beat(g);
      assert(staged.signs === 1, `board ${stage} letters its name on a sign (got ${staged.signs})`);
      assert(staged.actors === 0, `board ${stage} stages no bodies in its opening (got ${staged.actors})`);
      await g.step(SIGN_SHOT_AT);
      assert((await beat(g)).letterbox === 1, `board ${stage} frames its opening in the letterbox`);
      await g.shot(`25-intro-board${stage}`);
      assert(await enemies(g) === 0, `board ${stage} has nothing to fight while its beat runs`);
    });
  }

  // ---------------------------------------------------------------- the harness gate
  await withPage(server, BOARD1_BOT, async (g) => {
    await g.step(2);
    const b = await beat(g);
    assert(b && b.on === false, 'beats are off under ?bot=1');
    const armed = await ev(g);
    assert(!armed || armed.id !== 'intro1', 'the intro beat does not even arm for the bot');
    assert(await signs(g) === 0 && b.actors === 0 && b.signs === 0, 'nothing is staged');
    assert(b.letterbox === 0, 'and the letterbox never comes in, because no beat ever runs');

    // The point of the gate: the bot reaches its first fight on the same frame it always did, because the wave
    // director was never held. A beat that merely staged nothing would still have delayed this by eleven seconds.
    const waveFrames = await (async () => {
      for (let i = 0; i < 1200; i++) { if (await enemies(g) > 0) return i; await g.step(1); }
      return -1;
    })();
    assert(waveFrames >= 0 && waveFrames < 300, `the bot's first wave is not delayed by the beat (${waveFrames} frames)`);
  });
}
