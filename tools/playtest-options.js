// Options / controls scenario for tools/playtest.js. Receives the harness helpers so the two files
// share one browser, one assert and one results list. tools/playtest.js is already close to its
// ~700-line budget, so this scenario lives here instead of growing that file; further scenarios
// should follow the same pattern (their own tools/playtest-<name>.js, registered in playtest.js).
//
// Covers (docs/ARCHITECTURE.md section 13): the OPTIONS overlay from the title, every row (difficulty
// cycle, music/sfx sliders, mute, screen shake -> Camera.shakeScale), the CONTROLS sub-plate (keyboard
// capture, conflict refusals - P2 key, global key, same-layout swap, sibling-layout refusal, Escape
// cancels capture, P2's shared arrows can be rearranged without touching the join set, gamepad capture
// via input.setPadVirtual including the RT refusal), that a reload keeps every persisted setting and
// binding, that the remapped key actually drives the hero in gameplay while the old key no longer does,
// that OPTIONS is reachable from the pause plate (and hidden from it under netplay), RESET TO DEFAULTS,
// that `?difficulty=` is a session-only override that is never written back even once something else
// saves, that the save lives under the documented storage key, that the lobby's controls hint (not
// just the title / HUD / pause ones) follows local bindings, and that a page whose localStorage
// throws (private mode / file:// / blocked embeds) still applies options without throwing or saving.
/**
 * @param {ReturnType<typeof import('./server.js').createServer>} server
 * @param {{ withPage: Function, assert: Function }} deps
 */
export async function options(server, { withPage, assert }) {
  await withPage(server, 'seed=1', async (g, page) => {
    const dn = () => g.press(0, { down: true }, 2, 6);
    const up_ = () => g.press(0, { up: true }, 2, 6);
    const lt = () => g.press(0, { left: true }, 2, 6);
    const rt = () => g.press(0, { right: true }, 2, 6);
    const atk = () => g.press(0, { attack: true }, 2, 10);
    const dg = () => g.press(0, { dodge: true }, 2, 6);
    const strt = () => g.press(0, { start: true }, 2, 6);

    // 1. Title -> OPTIONS (menu is START / ONLINE CO-OP / OPTIONS -- issue #23 dropped START (2P)).
    await g.step(60);
    await dn(); await dn();
    await atk();
    assert((await g.screen()) === 'options', 'attack on OPTIONS pushes the options overlay');
    let s = await g.summary();
    assert(s.panel === 'main' && s.cursor === 0, 'options opens on the main panel, cursor at DIFFICULTY');
    let st = await g.eval(() => window.__game.optionsState());
    assert(st.storage === true, 'localStorage is available in the harness');

    // 2. DIFFICULTY / MUSIC / SFX / SHAKE rows.
    await rt();
    s = await g.summary();
    assert(s.difficulty === 'hard', 'right on DIFFICULTY cycles normal -> hard');
    assert((await g.eval(() => window.__game.game.options.difficulty)) === 'hard', 'game.options.difficulty follows the row');
    await dn(); await lt(); await lt();
    s = await g.summary();
    assert(s.music === 3, 'left x2 on MUSIC steps the slider down from the default 5');
    await dn(); await lt();
    s = await g.summary();
    assert(s.sfx === 9, 'left on SFX steps the slider down from the default 10');
    await dn(); await dn(); await lt();
    s = await g.summary();
    assert(s.shake === 'low', 'left on SCREEN SHAKE cycles full -> low');
    const shakeScale = await g.eval(() => import('/src/engine/camera.js').then((m) => m.Camera.shakeScale));
    assert(shakeScale === 0.5, `SCREEN SHAKE low applies Camera.shakeScale = 0.5 (got ${shakeScale})`);
    await g.shot('90-options');

    // CONTROLS row opens the sub-plate.
    await dn();
    await atk();
    s = await g.summary();
    assert(s.panel === 'controls', 'CONTROLS opens the key/gamepad remapping sub-plate');

    // 3. Grid navigation and capture. row 4 = attack, col 1 = p1 (ACTIONS order in engine/input.js).
    await dn(); await dn(); await dn(); await dn();
    await rt();
    s = await g.summary();
    assert(s.row === 4 && s.col === 1, 'down x4 + right lands on ATTACK / P1');
    await atk();
    s = await g.summary();
    assert(s.capturing === true, 'attack on a cell begins capture');
    await g.shot('91-controls');

    // A key already bound to P2 is refused.
    await page.keyboard.press('KeyJ');
    await g.step(4);
    s = await g.summary();
    st = await g.eval(() => window.__game.optionsState());
    assert(!s.capturing, 'capture ends on a refusal');
    assert(/PLAYER 2/.test(s.controlsNotice), `refusal names the other player (got "${s.controlsNotice}")`);
    assert(s.controlsBad === true, 'the notice is flagged bad');
    assert(st.bindings.keyboard[0].attack.join() === 'KeyF', 'rebinding P1 attack to J is refused: J is a P2 join key');

    // A global key is refused and never toggles mute.
    await atk();
    await page.keyboard.press('KeyM');
    await g.step(4);
    s = await g.summary();
    st = await g.eval(() => window.__game.optionsState());
    assert(s.controlsNotice === 'M IS A GLOBAL KEY', `refusal names the global key (got "${s.controlsNotice}")`);
    assert(st.muted === false, 'a global key refusal does not toggle mute');

    // A free key succeeds.
    await atk();
    await page.keyboard.press('KeyP');
    await g.step(4);
    st = await g.eval(() => window.__game.optionsState());
    assert(st.bindings.keyboard[0].attack.join() === 'KeyP', 'a free key rebinds P1 attack');

    // A same-layout collision swaps: JUMP takes ATTACK's old code (KeyP); ATTACK, displaced, takes
    // JUMP's old code minus whatever the sibling (solo) layout still holds under another action
    // (Space stays on solo's jump, so only KeyG survives the swap).
    await dn(); // row 5 = jump
    await atk();
    await page.keyboard.press('KeyP');
    await g.step(4);
    st = await g.eval(() => window.__game.optionsState());
    assert(st.bindings.keyboard[0].jump.join() === 'KeyP', 'JUMP takes the just-freed KeyP');
    assert(st.bindings.keyboard[0].attack.join() === 'KeyG', 'the displaced ATTACK takes JUMP\'s old KeyG (Space stays with solo\'s jump)');
    await up_(); // back to row 4 = attack
    await atk();
    await page.keyboard.press('KeyP');
    await g.step(4);
    st = await g.eval(() => window.__game.optionsState());
    assert(st.bindings.keyboard[0].attack.join() === 'KeyP', 'ATTACK takes KeyP back');
    assert(st.bindings.keyboard[0].jump.join() === 'KeyG', 'the displaced JUMP takes KeyG (same swap, in reverse)');

    // A key the 1P ARCADE (solo) layout already uses for a different single-key action is refused.
    await dn(); // row 5 = jump
    await atk();
    await page.keyboard.press('KeyZ');
    await g.step(4);
    s = await g.summary();
    st = await g.eval(() => window.__game.optionsState());
    assert(/1P ARCADE'S ATTACK/.test(s.controlsNotice), `refusal names the arcade layout's action (got "${s.controlsNotice}")`);
    assert(st.bindings.keyboard[0].jump.join() === 'KeyG', 'the refused rebind leaves JUMP unchanged');

    // Escape cancels capture without backing out of the panel.
    await atk();
    s = await g.summary();
    assert(s.capturing === true, 'attack begins capture again');
    await page.keyboard.press('Escape');
    await g.step(4);
    s = await g.summary();
    assert(!s.capturing && s.panel === 'controls', 'Escape cancels capture and stays on the CONTROLS panel');

    // P2's shared arrows can be rearranged; the join set is untouched.
    await rt(); // col 2 = p2
    await up_(); await up_(); await up_(); // row 2 = up
    s = await g.summary();
    assert(s.row === 2 && s.col === 2, 'right + up x3 lands on UP / P2');
    await atk();
    await page.keyboard.press('ArrowDown');
    await g.step(4);
    st = await g.eval(() => window.__game.optionsState());
    assert(st.bindings.keyboard[1].up.join() === 'ArrowDown' && st.bindings.keyboard[1].down.join() === 'ArrowUp',
      'P2 up/down swap the shared arrows');
    assert(st.joinHint === 'P2: PRESS J TO JOIN', 'the join hint (and join set) is untouched by rearranging shared arrows');

    // PAD column: RT is refused (gamepadRun), a free button succeeds and a same-layout collision swaps.
    await rt(); // col 3 = pad
    await dn(); await dn(); // row 4 = attack
    s = await g.summary();
    assert(s.row === 4 && s.col === 3, 'right + down x2 lands on ATTACK / PAD');
    await atk();
    await g.eval(() => window.__game.input.setPadVirtual(0, [7]));
    await g.step(3);
    s = await g.summary();
    assert(s.controlsNotice === 'RT IS RUN', `RT is refused as the run button (got "${s.controlsNotice}")`);
    await g.eval(() => window.__game.input.setPadVirtual(0, []));
    await g.step(2);
    await atk();
    await g.eval(() => window.__game.input.setPadVirtual(0, [1]));
    await g.step(3);
    st = await g.eval(() => window.__game.optionsState());
    assert(st.bindings.pad.attack.join() === '1', 'gamepad button 1 rebinds PAD attack');
    assert(st.bindings.pad.jump.join() === '0', 'the displaced PAD jump takes button 0 back');
    await g.eval(() => window.__game.input.setPadVirtual(0, null));

    // dodge backs out of the sub-plate, then out of options entirely.
    await dg();
    s = await g.summary();
    assert(s.panel === 'main', 'dodge backs the CONTROLS sub-plate out to the main panel');
    await dg();
    assert((await g.screen()) === 'title', 'dodge closes the options overlay back to the title');

    // 4. Reload: every persisted setting and binding survives.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
    await g.step(10);
    st = await g.eval(() => window.__game.optionsState());
    assert(st.difficulty === 'hard', `reload keeps difficulty (got ${st.difficulty})`);
    assert(st.music === 3, `reload keeps music (got ${st.music})`);
    assert(st.sfx === 9, `reload keeps sfx (got ${st.sfx})`);
    assert(st.shake === 'low', `reload keeps shake (got ${st.shake})`);
    assert(st.bindings.keyboard[0].attack[0] === 'KeyP', 'reload keeps the P1 attack rebind');
    assert(st.bindings.keyboard[1].up[0] === 'ArrowDown', 'reload keeps the P2 arrow swap');
    assert(st.bindings.pad.attack[0] === 1, 'reload keeps the PAD rebind');
    assert(/P ATTACK/.test(st.legend.p1), `the P1 legend follows the saved binding (got "${st.legend.p1}")`);
    assert(st.saved.includes('"KeyP"'), 'the save actually contains the remapped key');
    assert((await g.eval(() => window.__game.game.options.difficulty)) === 'hard', 'reload keeps game.options.difficulty too');
    // The save lives under the documented storage key, not just whatever KEY constant options.js reads back with.
    assert((await page.evaluate(() => localStorage.getItem('aetherAndBrass.options.v1') || '')).includes('"KeyP"'),
      'the save lives under aetherAndBrass.options.v1');
    // The lobby's controls hint (screens/lobby.js) also follows the local bindings, not just the title/HUD/pause ones.
    const lobbyHint = await g.eval(() => {
      const gm = window.__game.game;
      gm.push('lobby');
      const h = gm.screen.hintRole;
      gm.pop();
      return h;
    });
    assert(/ATTACK \(P\/Z\)/.test(lobbyHint), `the lobby hint names the local attack keys (got "${lobbyHint}")`);

    // 5. The remapped key drives the hero in gameplay; the old key no longer does.
    await page.goto(`http://localhost:${server.port}/index.html?autotest=1&seed=1&skipTo=gameplay&chars=0&nowaves=1&godmode=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
    await g.step(30);
    await g.spawnEnemy('typeA', 'grunt', 40, 0);
    await g.step(2);
    let sum = await g.summary();
    const hp0 = sum.enemies.reduce((a, e) => a + e.hp, 0);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down('KeyP'); await g.step(2); await page.keyboard.up('KeyP'); await g.step(14);
    }
    sum = await g.summary();
    const hp1 = sum.enemies.reduce((a, e) => a + e.hp, 0);
    assert(hp1 < hp0, `the remapped key (P) drives the hero's attack (${hp0} -> ${hp1})`);
    await g.killEnemies();
    await g.spawnEnemy('typeA', 'grunt', 40, 0);
    await g.step(2);
    sum = await g.summary();
    const hp2 = sum.enemies.reduce((a, e) => a + e.hp, 0); // 'hard' difficulty (set earlier) scales enemy hp, so re-read it rather than assume the base 40
    await page.keyboard.down('KeyF'); await g.step(2); await page.keyboard.up('KeyF'); await g.step(30);
    sum = await g.summary();
    assert(sum.enemies.reduce((a, e) => a + e.hp, 0) === hp2, 'the old key (F) no longer attacks');
    assert(sum.players[0].state === 'IDLE', 'the player stays idle on the old key');

    // OPTIONS is reachable from pause and returns to it; netplay's pause plate hides it.
    await strt();
    assert((await g.screen()) === 'pause', 'start opens pause');
    assert((await g.eval(() => window.__game.game.screen.items.length)) === 4, 'local pause has 4 rows including OPTIONS');
    await dn(); await dn();
    await atk();
    assert((await g.screen()) === 'options', 'OPTIONS on the pause plate opens the overlay');
    // The running board already cached 'hard' at enter(); DIFFICULTY must not silently change mid-board.
    s = await g.summary();
    assert(s.cursor === 0 && s.lockDifficulty === true, 'DIFFICULTY is locked when OPTIONS opens from pause mid-board');
    await rt();
    s = await g.summary();
    assert(s.difficulty === 'hard', 'right on the locked DIFFICULTY row does nothing');
    assert((await g.eval(() => window.__game.game.options.difficulty)) === 'hard', 'game.options.difficulty is untouched by the locked row');
    await dg();
    assert((await g.screen()) === 'pause', 'dodge returns to pause');
    await strt();
    assert((await g.screen()) === 'gameplay', 'start resumes gameplay');
    const onlineItems = await g.eval(() => {
      const gm = window.__game.game;
      gm.net = { active: true };
      gm.push('pause');
      const n = gm.screen.items.length;
      gm.pop();
      gm.net = null;
      return n;
    });
    assert(onlineItems === 3, `the pause plate hides OPTIONS under netplay (got ${onlineItems} rows)`);

    // 6. RESET TO DEFAULTS restores everything and clears the save.
    await page.goto(`http://localhost:${server.port}/index.html?autotest=1&seed=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
    await g.step(60);
    await dn(); await dn(); // title -> OPTIONS (menu is START / ONLINE CO-OP / OPTIONS)
    await atk();
    for (let i = 0; i < 6; i++) await dn();
    s = await g.summary();
    assert(s.cursor === 6, 'down x6 from DIFFICULTY lands on RESET TO DEFAULTS');
    await atk();
    await g.step(4);
    st = await g.eval(() => window.__game.optionsState());
    assert(st.difficulty === 'normal', 'RESET restores the default difficulty');
    assert(st.music === 5 && st.sfx === 10, 'RESET restores the default volumes');
    assert(st.shake === 'full', 'RESET restores the default shake');
    assert(st.bindings.keyboard[0].attack[0] === 'KeyF', 'RESET restores the default P1 attack');
    assert(st.bindings.keyboard[1].up[0] === 'ArrowUp', 'RESET restores the default P2 up');
    assert(st.bindings.pad.attack[0] === 0, 'RESET restores the default PAD attack');
    assert(st.storage === true && st.saved === null, 'RESET clears the save entirely');
  });

  // 7. `?difficulty=` is a session-only override, never written back, even once something else saves.
  await withPage(server, 'seed=1&difficulty=easy', async (g) => {
    await g.step(10);
    assert((await g.eval(() => window.__game.game.options.difficulty)) === 'easy', '?difficulty= drives the session difficulty');
    let st = await g.eval(() => window.__game.optionsState());
    assert(st.saved === null, '?difficulty= is session only, never written back');
    const saved = await g.eval(() => {
      window.__game.userOptions.set('music', 4);
      return JSON.parse(window.__game.optionsState().saved);
    });
    assert(saved.difficulty === 'normal', '?difficulty= is not written back even when another option is saved');
    assert((await g.eval(() => window.__game.game.options.difficulty)) === 'easy', 'the session override survives saving another option');
  });

  // 8. Guarded localStorage (private mode / file:// / blocked embeds): options still apply, nothing throws or saves.
  await withPage(server, 'seed=1', async (g, page) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
    const st = await g.eval(() => {
      const gg = window.__game;
      gg.userOptions.set('music', 4);
      gg.input.rebind('p1', 'attack', 'KeyP');
      gg.userOptions.saveBindings();
      gg.userOptions.reset();
      return gg.optionsState();
    });
    assert(st.storage === false && st.saved === null && st.music === 5, 'storage unavailable: options still apply, nothing throws, nothing saved');
  });
}
