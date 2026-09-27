// Difficulty select scenario for tools/playtest.js (title -> BOARD SELECT -> DIFFICULTY -> character select). Receives
// the harness helpers so this file shares one browser, one assert and one results list with the main harness -- the
// same pattern as tools/scenarios/stall.js.
//
// Covers: the screen opens on the level in play; its plaques print DIFFICULTY_TUNING; LEFT / RIGHT choose and CONFIRM
// saves the choice exactly as the OPTIONS row would, and survives a reload; confirming the level a `?difficulty=` link
// asked for writes nothing back; BACK walks the run's setup back a step at a time; and the level picked is the level
// the board is played at -- enemy health and damage, a boss's damage through a phase change, the continues, and the
// attack speed an enemy actually swings at.

/** Title -> BOARD SELECT -> DIFFICULTY select, on whatever board the save opens on. */
async function toDifficulty(g) {
  await g.step(60);
  await g.press(0, { attack: true }, 2, 30);   // title -> board select
  await g.press(0, { attack: true }, 2, 45);   // board select -> difficulty select
}

/**
 * Put a Soot Cutthroat beside the (godmode) hero and step until it has swung a few times, sampling the animation speed
 * on every frame of a swing that is neither a wind-up nor a frame boundary -- the speed Enemy.updateTellSpeed set for
 * the active and recovery frames, and nothing else.
 */
function swingSpeeds(g) {
  return g.eval(() => {
    const e = window.__game.game.screen.spawnEnemy('sootborn', 'cutthroat', 50, 0);
    const speeds = new Set();
    let frames = 0;
    for (let i = 0; i < 900 && frames < 40; i++) {
      const a = e.anim, fi = a.frameIndex, inst = a.instance, was = e.state === 'ATTACK' && !a.frame.tell;
      window.__game.step(1);
      if (was && e.state === 'ATTACK' && e.anim.instance === inst && e.anim.frameIndex === fi) { speeds.add(e.anim.speed); frames++; }
    }
    return { speeds: [...speeds], frames };
  });
}

/**
 * @param {object} server
 * @param {{ withPage: Function, assert: Function }} deps
 */
export async function difficulty(server, { withPage, assert }) {
  // 1. A fresh save opens on MEDIUM; the plaques print the tuning; LEFT / RIGHT choose and wrap; CONFIRM saves.
  await withPage(server, 'seed=1', async (g, page) => {
    await toDifficulty(g);
    assert((await g.screen()) === 'difficulty', `confirming a board opens DIFFICULTY select (got ${await g.screen()})`);
    let s = await g.summary();
    assert(s.difficulty === 'medium' && s.cursor === 1, `a fresh save opens on MEDIUM (got ${s.difficulty})`);
    assert(s.levels.map((l) => l.label).join(',') === 'EASY,MEDIUM,HARD', `three plaques: EASY, MEDIUM, HARD (${s.levels.map((l) => l.label)})`);
    const [easy, medium, hard] = s.levels.map((l) => l.stats);
    assert(easy.includes('ENEMY DAMAGE 60%') && easy.includes('ATTACK SPEED 75%'), `EASY prints its damage and attack speed (${easy.join(' | ')})`);
    assert(medium.includes('ENEMY DAMAGE 100%') && medium.includes('ATTACK SPEED 100%'), `MEDIUM prints the board as authored (${medium.join(' | ')})`);
    assert(hard.includes('ENEMY DAMAGE 140%'), `HARD prints its damage (${hard.join(' | ')})`);
    await g.shot('difficulty-01-medium');
    await g.press(0, { left: true }, 2, 6);
    assert((await g.summary()).difficulty === 'easy', 'left moves to EASY');
    await g.press(0, { left: true }, 2, 6);
    assert((await g.summary()).difficulty === 'hard', 'left from EASY wraps round to HARD');
    await g.press(0, { right: true }, 2, 6);
    assert((await g.summary()).difficulty === 'easy', 'right from HARD wraps round to EASY');
    let st = await g.eval(() => window.__game.optionsState());
    assert(st.saved === null, 'moving the cursor saves nothing');
    await g.shot('difficulty-02-easy');
    await g.press(0, { attack: true }, 2, 45);
    assert((await g.screen()) === 'select', `confirming a level goes to character select (got ${await g.screen()})`);
    st = await g.eval(() => window.__game.optionsState());
    assert(st.difficulty === 'easy' && !!st.saved && JSON.parse(st.saved).difficulty === 'easy', 'the level picked is saved, as the OPTIONS row saves it');
    assert((await g.eval(() => window.__game.game.options.difficulty)) === 'easy', 'and it is the level the run will be played at');

    // 2. BACK walks the setup back a step at a time: character select -> DIFFICULTY (on the level just picked) -> BOARD SELECT.
    await g.press(0, { jump: true }, 2, 30);
    assert((await g.screen()) === 'difficulty', `BACK on character select returns to DIFFICULTY select (got ${await g.screen()})`);
    assert((await g.summary()).difficulty === 'easy', 'which opens on the level just picked');
    await g.press(0, { dodge: true }, 2, 30);
    assert((await g.screen()) === 'boardselect', `BACK on DIFFICULTY select returns to BOARD SELECT (got ${await g.screen()})`);

    // 3. The choice survives a reload, and the screen opens on it.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
    await toDifficulty(g);
    s = await g.summary();
    assert(s.screen === 'difficulty' && s.difficulty === 'easy', `after a reload the screen opens on the saved EASY (got ${s.difficulty})`);
  });

  // 4. A `?difficulty=` link: the screen opens on the link's level, and confirming THAT level writes nothing back.
  await withPage(server, 'seed=1&difficulty=hard', async (g) => {
    await toDifficulty(g);
    assert((await g.summary()).difficulty === 'hard', 'a ?difficulty=hard link opens the screen on HARD');
    await g.press(0, { attack: true }, 2, 45);
    assert((await g.screen()) === 'select', 'confirming it goes on to character select');
    const st = await g.eval(() => window.__game.optionsState());
    assert(st.saved === null, 'confirming the level the link asked for writes nothing back');
    assert((await g.eval(() => window.__game.game.options.difficulty)) === 'hard', 'and the run is still played at HARD');
  });

  // 5. The board is played at the level picked. EASY: enemy health and damage scaled at spawn, a boss's damage kept
  //    through a phase change (Fighter.applyDef used to drop it), five continues, and the attack speed the AI reads.
  await withPage(server, 'seed=1&skipTo=gameplay&chars=0&nowaves=1&godmode=1&difficulty=easy', async (g) => {
    await g.step(30);
    const r = await g.eval(() => {
      const gp = window.__game.game.screen, w = window.__game.world;
      const e = gp.spawnEnemy('sootborn', 'cutthroat', 200, 0);
      const b = gp.spawnEnemy('boss', 'vane', 300, 0);
      const phase1 = b.damageMult;
      b.applyPhase(1);
      const out = { attackSpeed: w.options.attackSpeed, hp: e.maxHp, dmg: e.damageMult, phase1, phase2: b.damageMult, continues: gp.continues };
      window.__game.killAllEnemies();
      return out;
    });
    assert(r.attackSpeed === 0.75, `EASY hands the AI attack speed 0.75 (got ${r.attackSpeed})`);
    assert(r.hp === 23 && r.dmg === 0.6, `EASY: a Cutthroat spawns with 75% health and 60% damage (${r.hp} hp, x${r.dmg})`);
    assert(r.phase1 === 0.6 && r.phase2 === 0.6, `EASY: a boss hits at x0.6 before and after a phase change (${r.phase1} -> ${r.phase2})`);
    assert(r.continues === 5, `EASY starts the run with five continues (${r.continues})`);
    const sw = await swingSpeeds(g);
    assert(sw.frames > 0 && sw.speeds.length === 1 && sw.speeds[0] === 0.75, `EASY: an enemy's swing plays at 0.75 (${JSON.stringify(sw)})`);
  });
  await withPage(server, 'seed=1&skipTo=gameplay&chars=0&nowaves=1&godmode=1&difficulty=medium', async (g) => {
    await g.step(30);
    const sw = await swingSpeeds(g);
    assert(sw.frames > 0 && sw.speeds.length === 1 && sw.speeds[0] === 1, `MEDIUM: an enemy's swing plays at full speed (${JSON.stringify(sw)})`);
  });
}
