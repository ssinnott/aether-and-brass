// Wave anti-stall scenario for tools/playtest.js. Receives the harness helpers so this file shares one browser, one
// assert and one results list with the main harness — the same pattern as tools/scenarios/obstacles.js.
//
// THE BUG THIS PINS DOWN. A wave holds the camera lock until it is empty, and `mode: 'locked'` sections (board 3's
// cart lane) have no way past it at all: the section ends when its last timed wave clears or never. A ranged variant
// is the one thing that can arrange "never" on its own — Enemy.finishAttack tops the retreat budget back up by 40 on
// every shot it lands, so a Tallyman that lobs, backs off and lobs again never runs it down, and the lob's knockdown
// resets the approach on a cadence the player cannot close through. The room empties except for him and then nothing
// happens, for as long as anyone is willing to keep trying.
//
// StageRunner.checkWaveStall is the answer: nothing hurt and nothing killed in the wave for WAVE_STALL_FRAMES and the
// survivors are pressed in (Enemy.pressIn) — they keep their ranged attack, they just stop buying room for it.
//
// The stage is the real cart lane rather than a fixture, so this also proves the lane still locks the way it does.
const CART_LANE = 'seed=3&skipTo=gameplay&chars=0&stage=3&section=1&godmode=1';
/** StageRunner.WAVE_STALL_FRAMES, plus room for the press to take effect. */
const PRESS_BY = 900;

/**
 * @param {object} server
 * @param {{ withPage: Function, assert: Function }} deps
 */
export async function stall(server, { withPage, assert }) {
  await withPage(server, CART_LANE, async (g) => {
    // let the section's first timed wave finish arriving, then take the room down to one ranged enemy by hand: the
    // stall is about what ONE kiter can do to a lock, and a scripted wave is not a reliable way to end up with one.
    await g.step(240);
    const state = () => g.eval(() => {
      const w = window.__game.world, r = w.stage, p = w.players[0];
      const e = w.waveEnemies[0];
      return {
        locked: w.camera.locked, wave: !!r.activeWave, pressedWave: !!(r.activeWave && r.activeWave.pressed),
        enemies: w.waveEnemies.length, px: Math.round(p.x),
        e: e ? { v: e.def.variant, x: Math.round(e.x), ai: e.aiState, pressed: !!e.pressed, budget: e.retreatBudget } : null,
      };
    });
    await g.eval(() => {
      const w = window.__game.world, r = w.stage, p = w.players[0];
      // the lane's own hazards would keep chipping at the pair, and every hit resets the stall clock (which is the
      // point of measuring it off the wave's hp): this scenario is about the stand-off, so the kiln and the vat go.
      for (const e of w.entities) if (e.isHazard) { e.removeMe = true; e.alive = false; }
      // and so does the timed director: the lane keeps tipping fresh waves in on a clock, and each arrival is a
      // change in the wave the stall clock would restart from. `timedIndex` past the end is how updateTimed idles.
      r.timedIndex = (r.section.timedWaves || []).length;
      p.x = 2120; p.z = 70; p.y = 0; p.vx = p.vy = p.vz = 0; p.hp = p.maxHp;
      // kill and replace WITHOUT a step in between: an empty wave clears itself, and a cleared wave is a new wave
      window.__game.killAllEnemies();
      r.screen.spawnEnemyAt('chandler', 'tallyman', 2320, 70, { entered: true, facing: -1 });
    });
    await g.step(2);

    const s0 = await state();
    assert(s0.wave && s0.locked, 'the cart lane is a locked screen with a wave running');
    assert(s0.enemies === 1 && s0.e && s0.e.v === 'tallyman', 'and the room is down to one ranged enemy');
    assert(!s0.pressedWave, 'the wave has not been pressed in before anything has stalled');

    // nobody presses a button: the hero stands, the Tallyman keeps his distance, and nothing in the wave takes a hit
    let kept = false, pressed = null;
    for (let i = 0; i < PRESS_BY; i++) {
      await g.step(1);
      const s = await state();
      if (!s.e) break;
      if (s.e.ai === 'KEEP_DISTANCE') kept = true;
      if (s.pressedWave) { pressed = { at: i, ...s }; break; }
    }
    assert(kept, 'the Tallyman does keep his distance while the stand-off runs (the behaviour being rescued)');
    assert(!!pressed, `a wave with nothing hurt and nothing killed is pressed in within ${PRESS_BY} frames`);
    if (pressed) {
      assert(pressed.e.pressed, 'and the survivor carries the press');
      assert(pressed.e.ai !== 'KEEP_DISTANCE', `which takes it out of KEEP_DISTANCE (aiState ${pressed.e.ai})`);
      assert(pressed.e.budget === 0, 'the retreat budget is spent and finishAttack no longer refills it');
    }

    // and it is a rescue, not a label: he has to actually arrive in reach, still without the player moving
    let closed = 0;
    for (let i = 0; i < 900; i++) {
      await g.step(1);
      const s = await state();
      if (!s.e) break;
      const gap = Math.abs(s.e.x - s.px);
      if (gap < 60) { closed = gap; break; }
    }
    assert(closed > 0, 'a pressed ranged enemy closes to melee range instead of kiting the lock open forever');
  });
}
