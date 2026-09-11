// Training room scenario for tools/playtest.js (issue #22). Registered from tools/playtest.js, same pattern
// as tools/scenarios/thrown.js and weapons.js: receives the harness helpers so this file shares one browser,
// one assert and one results list with the main harness.
/**
 * @param {object} server
 * @param {{ withPage: Function, assert: Function, CHARACTER_COUNT: number }} h
 */
export async function training(server, h) {
  const { withPage, assert, CHARACTER_COUNT } = h;
  for (let c = 0; c < CHARACTER_COUNT; c++) await withPage(server, `seed=1&skipTo=training&chars=${c}`, async (g, page) => {
    await g.step(60);

    // Move-list coverage (22.4 acceptance 1): every hero anim key that is a move appears on the move list.
    const cover = await g.eval((ci) => {
      const c2 = window.__game.game.characters[ci];
      const has = (n) => (c2.moveList || []).some((m) => (m.anims || [m.anim]).includes(n));
      return window.__game.moveAnims.filter((n) => c2.anims[n] && !has(n));
    }, c);
    assert(cover.length === 0, `hero ${c}: every move animation is on the move list (missing ${cover.join(',')})`);
    assert(await g.eval((ci) => { const t = window.__game.game.characters[ci].trials; return t.length >= 5 && t.length <= 8; }, c), `hero ${c}: 5-8 trials`);

    let s = await g.summary();
    const resetX = s.players[0].x; // the fixed training spot RESET POSITIONS must return to (TRAINING is module-private)
    assert(s.screen === 'training', `hero ${c}: ?skipTo=training lands on the training screen (${s.screen})`);
    assert(s.enemies.length === 1 && s.enemies[0].variant === 'footman', `hero ${c}: one Tin Footman dummy is standing (${JSON.stringify(s.enemies.map((e) => e.variant))})`);
    assert(s.training.mode === 'stand' && s.training.dummies === 1, 'defaults: STAND dummy');
    assert(await g.eval(() => { const w = window.__game.world; return w.entities.every((e) => e.kind !== 'prop' && e.type !== 'rails'); }), 'the arena has no props and no rails zone');
    // TrainingScreen.maxPlayers() caps the room at one, so a "P2: PRESS J TO JOIN" hint that can never be
    // satisfied must not blink (review finding).
    assert(await g.eval(() => window.__game.game.screen.hud.hint === ''), `hero ${c}: no join hint blinks in the single-player training room`);

    // Frame-data readout strip (22.3): hand-checked attack1 startup/active/recovery per hero (see plan Decisions).
    const EXPECT = [[6, 3, 12], [4, 2, 12], [5, 3, 12], [8, 3, 14]];
    for (let i = 0; i < 40; i++) {
      s = await g.summary();
      if (s.enemies[0].x - s.players[0].x <= 60) break;
      await g.press(0, { right: true }, 2, 0);
    }
    await g.press(0, { attack: true }, 2, 4);
    s = await g.summary();
    const fd = s.training.readout;
    assert(fd.state === 'ATTACK' && fd.anim === 'attack1', `hero ${c}: attack1 is playing (${fd.state} ${fd.anim})`);
    assert(fd.startup === EXPECT[c][0] && fd.active === EXPECT[c][1] && fd.recovery === EXPECT[c][2], `hero ${c}: attack1 frame data ${fd.startup}/${fd.active}/${fd.recovery} matches the anim table`);
    await g.step(40);
    const fd2 = (await g.summary()).training.readout;
    assert(fd2.hitDamage > 0 && fd2.hitStun > 0, `hero ${c}: last-hit damage and hitstun read from the sim`);
    if (c === 0) { await g.eval(() => window.__game.setTraining({ hitboxes: true })); await g.shot('91-training-hitboxes'); }

    await g.eval(() => window.__game.setTraining({ mode: 'block' })); await g.step(5);
    assert(await g.eval(() => window.__game.world.enemies[0].armor === true && window.__game.world.enemies[0].traits.weight === 1000), `hero ${c}: BLOCK dummy is armored and pinned`);
    // A BLOCK dummy must not drift under a burst of absorbed hits (review finding: Fighter.takeHit's armored
    // branch applies a flat knockback nudge with no weight divisor, unlike every other reaction path). 59px
    // sits outside every hero's walk-up grab range (<= 58, Pip's Grab Armor) but inside every attack1 hitbox
    // (>= 60), so this always lands an armored strike, never a grab.
    const blockX = (await g.summary()).enemies[0].x;
    for (let i = 0; i < 12; i++) {
      await g.eval(() => { const w = window.__game.world, p = w.players[0], e = w.enemies[0]; p.z = e.z; p.x = e.x - 59; p.facing = 1; p.vx = 0; });
      await g.press(0, { attack: true }, 2, 6);
    }
    assert(await g.eval(() => window.__game.world.enemies[0].hitCount > 0), `hero ${c}: the burst actually landed on the BLOCK dummy`);
    assert((await g.summary()).enemies[0].x === blockX, `hero ${c}: a BLOCK dummy absorbing a burst of hits does not drift`);
    await g.eval(() => window.__game.setTraining({ variant: 'sootborn:hulk', mode: 'stand' })); await g.step(5);
    assert((await g.summary()).enemies[0].variant === 'hulk', 'variant picker respawns the chosen variant');
    await g.eval(() => window.__game.setTraining({ meterLock: 'full' })); await g.step(2);
    assert((await g.summary()).players[0].meter === 300, 'LOCK FULL pins the meter');
    await g.killEnemies(); await g.step(60);
    assert((await g.summary()).enemies.length === 1, 'the dummy respawns after death');
    if (c === 0) await g.shot('90-training');

    // Review findings (issue #22): RESET POSITIONS reviving a dead player, REFILL HEALTH, RESET POSITIONS
    // returning to the fixed spot, METER LOCK EMPTY, the FRAME DATA / HITBOXES toggles round-tripping through
    // summary(), and STAND vs CPU dummy attack behaviour -- none of these had any assertion before, so each
    // could silently regress. Hero 0 only: the plate/mechanics themselves do not vary by hero.
    if (c === 0) {
      const maxHp = await g.eval(() => window.__game.world.players[0].maxHp);

      // RESET POSITIONS must revive a dead-but-idle player, not leave her permanently stuck (finding: forcing
      // ST.IDLE while p.dead stays true makes Player.think bail forever and the respawn path unreachable).
      await g.eval(() => {
        const w = window.__game.world;
        w.players[0].takeHit({ damage: 9999, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 20 }, w.enemies[0]);
      });
      await g.step(5);
      assert((await g.eval(() => window.__game.world.players[0].dead)) === true, 'P1 is dead ahead of the reset check');
      await g.eval(() => window.__game.setTraining({ reset: true }));
      await g.step(2);
      const revived = await g.eval(() => { const p = window.__game.world.players[0]; return { dead: p.dead, out: p.out }; });
      assert(revived.dead === false && revived.out === false, 'RESET POSITIONS revives a dead player');
      const beforeX = (await g.summary()).players[0].x;
      await g.press(0, { right: true }, 2, 30);
      assert((await g.summary()).players[0].x > beforeX, 'the revived player can move again (not stuck idle)');

      // REFILL HEALTH
      await g.eval(() => { window.__game.world.players[0].hp = 10; });
      await g.eval(() => window.__game.setTraining({ refill: true }));
      assert((await g.summary()).players[0].hp === maxHp, 'REFILL HEALTH restores full HP');

      // RESET POSITIONS returns to the fixed training spot
      await g.eval(() => { window.__game.world.players[0].x += 120; });
      await g.eval(() => window.__game.setTraining({ reset: true }));
      assert((await g.summary()).players[0].x === resetX, 'RESET POSITIONS returns the player to the training spot');

      // METER LOCK EMPTY
      await g.eval(() => window.__game.setTraining({ meterLock: 'empty' })); await g.step(2);
      assert((await g.summary()).players[0].meter === 0, 'METER LOCK EMPTY pins the meter at zero');
      await g.eval(() => window.__game.setTraining({ meterLock: 'normal' }));

      // FRAME DATA / HITBOXES toggles round-trip through summary()
      await g.eval(() => window.__game.setTraining({ frameData: false, hitboxes: false }));
      const opts1 = (await g.summary()).training;
      assert(opts1.frameData === false && opts1.hitboxes === false, 'FRAME DATA / HITBOXES toggles are reflected in the summary');
      await g.eval(() => window.__game.setTraining({ frameData: true, hitboxes: false }));

      // Dodge-through readout (review finding): LAST DODGE THROUGH/CLEAN and the 'dodge' log event had no
      // assertion anywhere. Hold dodge until stateTimer reaches dodgeIFrames[0] (arming invuln for the
      // i-frame window), land a manual hit inside that window, and confirm it reads THROUGH and deals no damage.
      await g.press(0, { dodge: true }, 2, 0);
      await g.step(1); // stateTimer now sits at dodgeIFrames[0] (2), so invuln is armed for the i-frame window
      await g.eval(() => {
        const w = window.__game.world;
        w.players[0].takeHit({ damage: 5, type: 'light', kbX: 2, kbY: 0, hitstun: 12 }, w.enemies[0]);
      });
      await g.step(2);
      const dodgeFd = (await g.summary()).training.readout;
      assert(dodgeFd.dodgeThrough === true, 'LAST DODGE reads THROUGH after an invulnerable dodge');
      assert((await g.eval(() => window.__game.world.players[0].hp)) === maxHp, 'a dodge-through hit deals no damage');
      assert(await g.eval(() => window.__game.world.log.some((l) => l.kind === 'dodge')), "the dodge-through hit logs a 'dodge' event");
      await g.step(40); // let the roll, its recovery and the dodge cooldown fully clear
      await g.press(0, { dodge: true }, 2, 5);
      assert((await g.summary()).training.readout.dodgeThrough === false, 'LAST DODGE reads CLEAN after a dodge that took no hit');

      // STAND dummy never attacks; CPU dummy fights back.
      await g.eval(() => window.__game.setTraining({ mode: 'stand', variant: 'brassbound:footman' })); await g.step(5);
      await g.eval(() => { const w = window.__game.world, p = w.players[0], e = w.enemies[0]; p.z = e.z; p.x = e.x - 40; });
      const standAttacked = await g.eval(() => {
        const w = window.__game.world;
        for (let i = 0; i < 300; i++) { window.__game.step(1); if (w.enemies[0] && w.enemies[0].state === 'ATTACK') return true; }
        return false;
      });
      assert(!standAttacked, 'the STAND dummy never attacks');
      assert((await g.summary()).players[0].hp === maxHp, 'the STAND dummy never damages P1');
      await g.eval(() => window.__game.setTraining({ mode: 'cpu' }));
      const cpuAttacked = await g.eval(() => {
        const w = window.__game.world;
        for (let i = 0; i < 300; i++) { window.__game.step(1); if (w.enemies[0] && w.enemies[0].state === 'ATTACK') return true; }
        return false;
      });
      assert(cpuAttacked, 'the CPU dummy fights back (enters ATTACK)');

      // A CPU-mode dummy's own moves can summon ordinary (non-dummy) enemies -- Harvestman's chaff drop is the
      // one exercised here -- and nothing used to clear them on a DUMMY / VARIANT change (review finding).
      await g.eval(() => window.__game.setTraining({ variant: 'gleaning:harvestman', mode: 'cpu' }));
      await g.step(600);
      assert((await g.summary()).enemies.length > 1, 'the Harvestman CPU dummy summoned at least one stray enemy (sanity check)');
      await g.eval(() => window.__game.setTraining({ variant: 'brassbound:footman', mode: 'stand' }));
      await g.step(5);
      assert((await g.summary()).enemies.length === 1, 'switching DUMMY/VARIANT clears any enemies a CPU dummy summoned');

      // Passive dummy (STAND): a content onUpdate hook (chandler.js tallyman's rite is the one offender today)
      // must never move ANY non-boss variant's dummy into ATTACK/SPECIAL on its own (review finding).
      const variants = await g.eval(() => window.__game.enemyList().filter((e) => e.role !== 'boss'));
      for (const v of variants) {
        await g.eval((vv) => window.__game.setTraining({ variant: `${vv.type}:${vv.variant}`, mode: 'stand' }), v);
        const attacked = await g.eval(() => {
          const w = window.__game.world;
          for (let i = 0; i < 200; i++) {
            window.__game.step(1);
            const e = w.enemies[0];
            if (e && (e.state === 'ATTACK' || e.state === 'SPECIAL')) return true;
          }
          return false;
        });
        assert(!attacked, `STAND dummy ${v.type}:${v.variant} never enters ATTACK/SPECIAL on its own`);
      }
      await g.eval(() => window.__game.setTraining({ variant: 'brassbound:footman', mode: 'stand' })); // restore for the plate section below
    }

    // Training pause plate + trials list (22.6): START opens it, TRIALS lists (and picks) a trial, DUMMY /
    // FACING rows cycle from the plate. Hero 0 only -- the plate/list themselves do not vary by hero.
    if (c === 0) {
      await g.press(0, { start: true }, 2, 5);
      assert((await g.screen()) === 'trainpause', 'START opens the training pause plate');
      await g.shot('93-training-pause');
      for (let i = 0; i < 10; i++) await g.press(0, { down: true }, 2, 2); // 10 downs from RESUME (row 0) lands on TRIALS (row 10)
      await g.press(0, { attack: true }, 2, 5);
      assert((await g.screen()) === 'trials', 'TRIALS row opens the trial list');
      // Escape backs out of TRIALS the same as any other overlay (review finding: this one overlay never
      // read globalPressed('pause'), unlike trainpause / moves).
      await page.keyboard.press('Escape');
      await g.step(4);
      assert((await g.screen()) === 'trainpause', 'Escape backs out of the TRIALS list to the training plate');
      await g.press(0, { attack: true }, 2, 5);
      assert((await g.screen()) === 'trials', 'TRIALS row reopens the trial list');
      await g.press(0, { attack: true }, 2, 5);
      s = await g.summary();
      assert(s.screen === 'training' && s.training.trial && s.training.trial.id === 'combo', 'picking a trial resumes with it active');
      await g.press(0, { start: true }, 2, 5);
      await g.press(0, { down: true }, 2, 2);
      await g.press(0, { right: true }, 2, 5);
      assert((await g.summary()).training.userMode === 'block', 'DUMMY row cycles the behaviour');
      await g.press(0, { down: true }, 2, 2);
      await g.press(0, { down: true }, 2, 2);
      await g.press(0, { right: true }, 2, 5);
      assert((await g.summary()).training.faceLock === true, 'FACING row locks the dummy facing');
      await g.press(0, { start: true }, 2, 5);
      assert((await g.screen()) === 'training', 'START resumes');

      // FACING LOCK must actually stop the dummy turning toward the player, not merely echo the plate's own
      // opts.faceLock back (review finding: nothing read enemies[0].facing before this).
      const facing0 = await g.eval(() => {
        const w = window.__game.world, e = w.enemies[0], p = w.players[0];
        p.x = e.x + 100; p.z = e.z;
        return e.facing;
      });
      await g.step(10);
      assert((await g.eval(() => window.__game.world.enemies[0].facing)) === facing0, 'FACING LOCK holds the dummy facing while the player moves to its far side');
      await g.press(0, { start: true }, 2, 5);
      for (let i = 0; i < 3; i++) await g.press(0, { down: true }, 2, 2); // RESUME -> DUMMY -> VARIANT -> FACING
      await g.press(0, { right: true }, 2, 5);
      assert((await g.summary()).training.faceLock === false, 'FACING row toggles back to TRACK');
      await g.press(0, { start: true }, 2, 5);
      await g.step(10);
      assert((await g.eval(() => window.__game.world.enemies[0].facing)) !== facing0, 'unlocked (TRACK), the dummy turns back to face the player');

      // MOVES from the training plate (22.7): 9 downs from RESUME (row 0) lands on MOVES (row 9).
      await g.press(0, { start: true }, 2, 5);
      for (let i = 0; i < 9; i++) await g.press(0, { down: true }, 2, 2);
      await g.press(0, { attack: true }, 2, 5);
      assert((await g.screen()) === 'moves', 'MOVES opens from the training plate');
      await g.press(0, { down: true }, 2, 2);
      await g.press(0, { down: true }, 2, 20);
      const pv = await g.eval(() => window.__game.game.screen.preview());
      const want = await g.eval(() => { const m = window.__game.game.characters[0].moveList[2]; return (m.anims || [m.anim])[0]; });
      assert(pv.row === 2 && pv.anim === want, `the preview plays the highlighted row's animation (${pv.anim} vs ${want})`);
      await g.shot('94-moves');
      await g.press(0, { jump: true }, 2, 5);
      await g.press(0, { start: true }, 2, 5);
      assert((await g.screen()) === 'training', 'back out of MOVES and resume');
    }
  });

  // A walk-up grab (Player.findGrabTarget -> startGrab, distinct from a hitbox-driven 'grab' anim) must log a
  // 'grab' combat-log entry or every grab/throw trial (jumpgrab, throwbody, Pip's crush) can never advance
  // past its first step (review finding). Non-bot page: z-align P1 with the dummy inside grab tolerance
  // (GRAB_Z_TOL 14) but outside the reset spot's own combo-safe lane, grab it, then throw it into the second
  // dummy to prove the whole GRAB -> THROW -> BODY HIT chain (throwBodyTrial) completes.
  await withPage(server, 'seed=1&skipTo=training&chars=0', async (g) => {
    await g.step(30);
    await g.eval(() => window.__game.setTraining({ trial: 'throwbody' }));
    await g.step(10);
    await g.eval(() => {
      const w = window.__game.world, p = w.players[0], e = w.enemies[0];
      p.z = e.z; p.x = e.x - 30; p.facing = 1; p.vx = 0; p.vy = 0;
    });
    await g.press(0, { attack: true }, 2, 6);
    let s = await g.summary();
    assert(s.players[0].state === 'GRAB', `the walk-up grab lands (${s.players[0].state})`);
    assert(await g.eval(() => window.__game.world.log.some((l) => l.kind === 'grab')), "the walk-up grab is logged (kind 'grab')");
    assert(s.training.trial.step === 1, 'the throwbody trial advances past GRAB');
    await g.press(0, { right: true, attack: true }, 10, 60);
    s = await g.summary();
    assert(s.training.trial.done === true, 'GRAB, THROW and BODY HIT complete the throwbody trial');
    const st = await g.eval(() => window.__game.trialState());
    assert(st.heroes.brunhild.includes('throwbody'), 'the completed throwbody trial is ticked for the hero');
  });

  // Part B (22.5): the bot autopilot completes Brunhild's 4-hit combo trial against the pinned STAND dummy,
  // and the tick is persisted. See plan Decisions for why the balanced style reliably finishes this trial.
  await withPage(server, 'seed=3&skipTo=training&chars=0&bot=1&resetprogress=1', async (g) => {
    await g.step(30);
    await g.eval(() => window.__game.setTraining({ trial: 'combo' }));
    let done = false, frames = 0;
    while (!done && frames < 2400) { await g.step(100); frames += 100; done = (await g.summary()).training.trial.done; }
    assert(done, `the bot completes the 4-HIT COMBO trial (${frames} frames)`);
    const st = await g.eval(() => window.__game.trialState());
    assert(st.heroes.brunhild.includes('combo'), 'the completed trial is ticked for the hero');
    assert(typeof st.saved === 'string' && st.saved.includes('combo'), 'the tick is persisted under aetherAndBrass.trials.v1');
    await g.shot('92-training-trial');
    await g.eval(() => window.__game.setTraining({ trial: 'throwbody' })); await g.step(60);
    assert((await g.summary()).enemies.length === 2, 'a two-body trial keeps two dummies standing');
    await g.eval(() => window.__game.setTraining({ mode: 'block', trial: 'armor' })); await g.step(5);
    let t = (await g.summary()).training;
    assert(t.mode === 'cpu' && t.userMode === 'block', 'a trial dummyMode overrides the plate choice');
    await g.eval(() => window.__game.setTraining({ trial: null })); await g.step(5);
    t = (await g.summary()).training;
    assert(t.mode === 'block' && (await g.summary()).enemies.length === 1, 'clearing the trial restores the plate choice and removes the second dummy');
  });

  // Part C (22.6): the title's TRAINING row routes through character select into the training room.
  // TRAINING sits at index I_TRAIN (title.js) directly after ONLINE CO-OP -- 2 downs from START.
  await withPage(server, 'seed=1', async (g) => {
    await g.step(30);
    for (let i = 0; i < 2; i++) await g.press(0, { down: true }, 2, 2);
    await g.press(0, { attack: true }, 2, 40);
    assert((await g.screen()) === 'select', 'TRAINING row goes to character select');
    await g.press(0, { attack: true }, 2, 60);
    assert((await g.screen()) === 'training', 'confirming a hero enters the training room');
  });

  // A P2 drop-in on the title screen must not survive into the single-player training room (review finding):
  // input.joined(1) staying true with no P2 player would let P2's start pause the room and P2's own keys drive
  // the training plate / trials / moves overlays.
  await withPage(server, 'seed=1', async (g) => {
    await g.step(30);
    await g.press(1, { attack: true }, 2, 5);
    assert(await g.eval(() => window.__game.input.joined(1)), 'P2 joins on the title screen');
    for (let i = 0; i < 2; i++) await g.press(0, { down: true }, 2, 2);
    await g.press(0, { attack: true }, 2, 40);
    await g.press(0, { attack: true }, 2, 60);
    assert((await g.screen()) === 'training', 'confirming a hero enters the training room');
    assert((await g.eval(() => window.__game.input.joined(1))) === false, 'the stale P2 title join is released in the training room');
    await g.press(1, { start: true }, 2, 5);
    assert((await g.screen()) === 'training', "P2's own start does not open the training plate (P2 was never actually seated)");
  });

  // Part C continued (22.7): MOVES is also reachable from the NORMAL pause plate on any gameplay board
  // (hidden only in an active online match). pause.js's local ITEMS_LOCAL is
  // ['RESUME', 'MUTE', 'OPTIONS', 'MOVES', 'QUIT TO TITLE'] (#19's OPTIONS row already lands before
  // MOVES), so 3 downs from RESUME reach MOVES, not 2.
  await withPage(server, 'seed=1&skipTo=gameplay&chars=2&nowaves=1', async (g) => {
    await g.step(30);
    await g.press(0, { start: true }, 2, 5);
    for (let i = 0; i < 3; i++) await g.press(0, { down: true }, 2, 2);
    await g.press(0, { attack: true }, 2, 5);
    assert((await g.screen()) === 'moves', 'MOVES opens from the normal pause plate');
    await g.press(0, { jump: true }, 2, 5);
    assert((await g.screen()) === 'pause', 'back out of MOVES returns to pause');
    await g.press(0, { start: true }, 2, 5);
    assert((await g.screen()) === 'gameplay', 'START resumes gameplay');
  });
}
