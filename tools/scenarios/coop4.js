// Four-player local co-op scenario for tools/playtest.js (issue #23). Receives the harness helpers
// so this file shares one browser, one assert and one results list with the main harness, exactly
// like tools/scenarios/weapons.js and tools/scenarios/thrown.js. tools/playtest.js is already close
// to its ~700-line budget, so new scenarios live in their own sibling module.
//
// Parts (added across steps 23.2-23.5):
//   A - a four-bot run: all four slots fill in order, party-scaled attack tokens, everyone stays on
//       screen, at least one wave cleared, then (23.5) the results plaque shows four stats.
//   B - mid-run and pause drop-in: a pad-only slot (2) drops in before the keyboard's P2 (slot 1),
//       P2 can still drop in after it, and a further drop-in from the pause overlay lands on another
//       pad-only slot (3).
//   C - pad-claim slot assignment on the title (23.4).
//   D - four cursors through character select into gameplay (23.4).
//   E - the netplay guard: local slots beyond the online party never reach a match, pads never
//       claim another player's slot (23.5).
/**
 * @param {{ withPage: Function, withPair: Function, assert: Function, readyUp: Function }} deps
 * @returns {{ coop4: Function }}
 */
export function coop4Scenarios({ withPage, withPair, assert, readyUp }) {
  return {
    async coop4(server) {
      // Part A: four bots run themselves to the wave-clear/results milestones.
      await withPage(server, 'seed=3&skipTo=gameplay&chars=0,1,2,3&bot=1&godmode=1', async (g) => {
        await g.step(3000);
        const s = await g.summary();
        assert(s.players.length === 4, `four players present (got ${s.players.length})`);
        assert(s.players.map((p) => p.index).join() === '0,1,2,3', `slots 0..3 filled in order (got ${s.players.map((p) => p.index).join()})`);
        assert(s.wavesCleared >= 1, `four-player bots clear at least one wave (cleared ${s.wavesCleared})`);
        assert((await g.eval(() => window.__game.world.attackTokens.max)) === 4, 'four heroes standing lets four enemies attack at once');
        assert(s.players.every((p) => p.x >= s.cameraX - 40 && p.x <= s.cameraX + 680), 'every hero stays on screen');
        await g.shot('20b-coop4');
        // The results plaque takes the same four-player summary and lays out four stat columns.
        await g.eval(() => window.__game.game.screen.showResults(false));
        await g.step(240);
        const scr = await g.screen();
        assert(scr === 'results', `showResults moves a four-player run to the results screen (got ${scr})`);
        const statCount = await g.eval(() => window.__game.game.screen.stats.length);
        assert(statCount === 4, `the results plaque carries all four players' stats (got ${statCount})`);
        await g.shot('20c-results-4p');
      });

      // Part B: mid-run drop-in on a pad-only slot before P2, then P2 itself, then a pause-overlay
      // drop-in onto the remaining pad-only slot.
      await withPage(server, 'seed=3&skipTo=gameplay&chars=0&nowaves=1&godmode=1', async (g) => {
        // WAVE_EXTRA_BY_PARTY (stage.js queueSpawns): the only assertion in this whole file of the
        // party-scaled wave-clone count -- nothing else reads runner.pending or a spawn total, so the
        // clone branch would stay green with the concat deleted. Push a 2-spec list straight onto the
        // runner and inspect what actually landed in `pending`, then roll `pending.length` back so
        // nothing is really spawned (nowaves=1 already means updateSpawns never drains it anyway). An
        // unsided lead spec (no `side`) is mirrored to whichever side its own default alternation is
        // NOT (stage.js: `side: s.side === 'left' ? 'right' : 'left'`), which for spec index 0 is
        // 'left', so the clone is counted by side === 'left', not 'right'.
        const wavePendingProbe = () => g.eval(() => {
          const r = window.__game.game.screen.runner, n0 = r.pending.length;
          r.queueSpawns([{ type: 'a', variant: 'b' }, { type: 'a', variant: 'b', side: 'sky' }]);
          const added = r.pending.slice(n0);
          r.pending.length = n0;
          return { n: added.length, sky: added.filter((e) => e.spec.side === 'sky').length, cloned: added.filter((e) => e.spec.side === 'left').length };
        });
        await g.step(30);
        let wp = await wavePendingProbe();
        assert(wp.n === 2, `a solo party gets no wave clones -- identity, byte-for-byte the pre-#23 spawn list (${JSON.stringify(wp)})`);
        await g.press(2, { attack: true }, 2, 10);
        let s = await g.summary();
        assert(s.players.length === 2 && s.players.some((p) => p.index === 2), `a pad-only slot drops in before P2 (indices ${s.players.map((p) => p.index).join()})`);
        await g.press(1, { attack: true }, 2, 10);
        s = await g.summary();
        assert(s.players.length === 3 && s.players.some((p) => p.index === 1), `P2 can still drop in after a pad-only slot (indices ${s.players.map((p) => p.index).join()})`);
        await g.press(0, { start: true }, 2, 5);
        assert((await g.screen()) === 'pause', 'a joined player\'s start button pauses the run');
        await g.press(3, { attack: true }, 2, 5); // the join edge is consumed by the pause overlay, which does its own drop-in
        await g.press(0, { start: true }, 2, 10);
        assert((await g.screen()) === 'gameplay', 'resuming from pause returns to gameplay');
        s = await g.summary();
        assert(s.players.length === 4 && s.players.some((p) => p.index === 3), `drop-in from the pause overlay on a pad slot (indices ${s.players.map((p) => p.index).join()})`);
        assert(await g.eval(() => [1, 2, 3].every((sl) => window.__game.input.joined(sl))), 'slots 1-3 all report joined');
        wp = await wavePendingProbe();
        assert(wp.n === 3 && wp.sky === 1 && wp.cloned === 1, `a four-hero party gets one non-sky clone mirrored to the opposite side, and the sky spec is never cloned (${JSON.stringify(wp)})`);
        await g.shot('20d-dropin-4p');
      });

      // Part C: pad-claim slot assignment on the title. A real key drives P1's steering (the shared
      // arrows); virtual pads (#19's input.setPadVirtual, read through pollGamepads) drive the claims.
      await withPage(server, 'seed=1', async (g, page) => {
        const padState = () => g.eval(() => ({
          padOf1: window.__game.input.padOf(1), padOf2: window.__game.input.padOf(2),
          joined1: window.__game.input.joined(1), joined2: window.__game.input.joined(2),
        }));
        await g.step(30);
        await page.bringToFront();
        await page.keyboard.press('ArrowRight'); // P1 steering with the shared arrows: must not mark slot 1 as used
        await g.step(3);
        await g.eval(() => window.__game.input.setPadVirtual(0, [0]));
        await g.step(2);
        let st = await padState();
        assert(st.padOf1 === 0 && st.joined1, `a pad pressed after P1 steered with the shared arrows becomes P2, not P3 (${JSON.stringify(st)})`);
        await g.eval(() => window.__game.input.setPadVirtual(0, []));
        await g.step(2);
        // Slot 1's own key sets its kbSeen (decision #2). KeyL (P2's SPECIAL) rather than P2's own
        // ATTACK: slot 1 already joined above, and the title menu lets any joined slot confirm with
        // ATTACK/START/JUMP -- pressing P2's attack here would double as "START" and leave the title.
        await page.keyboard.press('KeyL');
        await g.step(3);
        await g.eval(() => window.__game.input.setPadVirtual(1, [0]));
        await g.step(2);
        st = await padState();
        assert(st.padOf2 === 1 && st.joined2, `a second pad claims P3 once P2's keyboard has been used (${JSON.stringify(st)})`);
        await g.eval(() => window.__game.input.setPadVirtual(1, []));
        await g.step(2);
        await g.eval(() => window.__game.input.setPadVirtual(0, [0]));
        await g.step(2);
        st = await padState();
        assert(st.padOf1 === 0 && st.padOf2 === 1, `a claimed pad keeps its slot (${JSON.stringify(st)})`);
        await g.eval(() => window.__game.input.setPadVirtual(0, []));
        await g.shot('01b-title-4p');
        await g.eval(() => window.__game.game.reset('title'));
        await g.step(5);
        st = await padState();
        assert(st.padOf1 === -1 && !st.joined1 && !st.joined2, `entering the title releases every claim (${JSON.stringify(st)})`);
        await g.eval(() => window.__game.input.setPadVirtual(1, [0]));
        await g.step(2);
        const padOf0 = await g.eval(() => window.__game.input.padOf(0));
        assert(padOf0 === 1, `after the reset the first pad pressed is P1 (got ${padOf0})`);
        // The two-keyboard-halves-plus-two-pads case: with BOTH keyboard halves already used (kbSeen
        // set on slots 0 and 1), a pad pressed after them must skip straight past slot 1 to slot 2 --
        // this is the one assertion that actually depends on the kbSeen(1) write inside the join-code
        // edge branch (decision #2); every other coop4 check here would stay green without it, since
        // by the time a pad is pressed slot 1 already holds a pad and `pad < 0` alone rules it out.
        await g.eval(() => window.__game.input.setPadVirtual(1, []));
        await g.eval(() => window.__game.game.reset('title'));
        await g.step(5);
        await page.bringToFront();
        await page.keyboard.press('KeyD'); // P1's own key: kbSeen[0]
        await page.keyboard.press('KeyL'); // P2's own key (SPECIAL): joins slot 1, kbSeen[1]
        await g.step(3);
        await g.eval(() => window.__game.input.setPadVirtual(0, [0]));
        await g.step(2);
        const afterBothKb = await g.eval(() => ({
          padOf1: window.__game.input.padOf(1), padOf2: window.__game.input.padOf(2), joined2: window.__game.input.joined(2),
        }));
        assert(afterBothKb.padOf2 === 0 && afterBothKb.padOf1 === -1 && afterBothKb.joined2, `a pad pressed after both keyboard halves are in use becomes P3, not P2 (${JSON.stringify(afterBothKb)})`);
        await g.eval(() => window.__game.input.setPadVirtual(0, null));
        await g.eval(() => window.__game.input.setPadVirtual(1, null));
      });

      // Part D: four cursors through character select into gameplay. P2-P4 join on their own edge
      // (never doubling as a confirm), move independently and end up on four distinct heroes.
      await withPage(server, 'seed=1', async (g) => {
        await g.step(60);
        await g.press(0, { attack: true }, 2, 20); // title -> board select
        await g.press(0, { attack: true }, 2, 45); // board select -> character select
        await g.press(1, { attack: true }, 2, 6);  // P2 joins (keyboard half)
        await g.press(2, { attack: true }, 2, 6);  // P3 joins (pad-only slot)
        await g.press(3, { attack: true }, 2, 6);  // P4 joins (pad-only slot)
        for (let s = 0; s < 4; s++) for (let m = 0; m < s; m++) await g.press(s, { right: true }, 2, 8);
        await g.shot('02c-select-4p');
        // With four characters, "slot s moves right s times" leaves P1/P3 sharing one card and P2/P4
        // another (2s mod 4 collides for s and s+2) -- exactly the tinted-duplicate overlap the
        // screenshot above shows. One more right-press each spreads P3 and P4 onto their own cards
        // before anyone confirms, so the run that follows gets four distinct heroes.
        await g.press(2, { right: true }, 2, 8);
        await g.press(3, { right: true }, 2, 8);
        for (let s = 0; s < 4; s++) await g.press(s, { attack: true }, 2, 6);
        await g.step(40);
        const scr = await g.screen();
        assert(scr === 'intro' || scr === 'gameplay', `four cursors confirm into intro/gameplay (got ${scr})`);
        await g.shot('02d-intro-4p');
        await g.step(200);
        await g.press(0, { attack: true }, 2, 30); // skip the intro card if any
        await g.step(30);
        const s = await g.summary();
        assert(s.screen === 'gameplay', `four-player select reaches gameplay (got ${s.screen})`);
        assert(s.players.length === 4, `all four players present (got ${s.players.length})`);
        assert(new Set(s.players.map((p) => p.id)).size === 4, `four distinct heroes chosen (ids ${s.players.map((p) => p.id).join()})`);
      });

      // Part E: the netplay guard. Local slots beyond the online party never make it into a match, and a
      // pad pressed mid-match still drives the local player but can never claim the peer's slot.
      await withPair(server, 'room=NET4P&transport=broadcast&host=1', 'room=NET4P&transport=broadcast', async (hostPage, guestPage, H, G) => {
        for (const p of [hostPage, guestPage]) await p.evaluate(() => window.__game.startLoop());
        for (const p of [hostPage, guestPage]) await p.waitForFunction(() => ((window.__game.netState() || {}).state === 'lobby'), null, { timeout: 20000 });
        // Locally join two extra slots on the host before ready-up: beginMatch must still strip them.
        await hostPage.evaluate(() => window.__game.input.setJoined(2, true));
        for (const p of [hostPage, guestPage]) assert(await readyUp(p), 'the page registered its ready press');
        for (const p of [hostPage, guestPage]) await p.waitForFunction(() => ((window.__game.netState() || {}).state === 'playing'), null, { timeout: 20000 });
        await guestPage.waitForFunction(() => ((window.__game.netState() || {}).frame || -1) > 60, null, { timeout: 20000 });
        for (const [p, label] of [[hostPage, 'host'], [guestPage, 'guest']]) {
          const st = await p.evaluate(() => ({ joined2: window.__game.input.joined(2), joined3: window.__game.input.joined(3), players: window.__game.summary().players.length }));
          assert(!st.joined2 && !st.joined3, `${label}: the session un-joins every local slot beyond the two-player party (${JSON.stringify(st)})`);
          assert(st.players === 2, `${label}: the match stays a two-player session (got ${st.players})`);
        }
        // The pad must be held across real frames -- installing and removing it inside one evaluate
        // never lets input.update()/claimPads() (which only run from the game loop between evaluates)
        // see the press at all, so that would pass whether or not claiming was actually off.
        const f0 = await hostPage.evaluate(() => window.__game.netState().frame);
        await hostPage.evaluate(() => window.__game.input.setPadVirtual(0, [0]));
        await hostPage.waitForFunction((f) => (window.__game.netState().frame || 0) > f + 5, f0, { timeout: 10000 });
        const held = await hostPage.evaluate(() => ({
          padOf0: window.__game.input.padOf(0),
          padOf1: window.__game.input.padOf(1),
          joined2: window.__game.input.joined(2),
          attack: window.__game.input.pollRaw(0, { solo: true }).attack === true,
        }));
        await hostPage.evaluate(() => window.__game.input.setPadVirtual(0, null));
        assert(held.attack, 'a pad pressed after the keyboard still drives the local player online');
        assert(held.padOf0 === -1 && held.padOf1 === -1 && !held.joined2, `a pad held across several real frames with claiming off never claims a slot, not even the peer's (${JSON.stringify(held)})`);
        const desyncs = await Promise.all([hostPage, guestPage].map((p) => p.evaluate(() => window.__game.netState().desync)));
        assert(desyncs[0] === null && desyncs[1] === null, `no desync from the extra local join/pad activity (${JSON.stringify(desyncs)})`);
      });
    },
  };
}
