// Four-player party scenario for tools/playtest.js (issue #23). Receives the harness helpers so this
// file shares one browser, one assert and one results list with the main harness, exactly like
// tools/scenarios/weapons.js and tools/scenarios/thrown.js. tools/playtest.js is already close to its
// ~700-line budget, so new scenarios live in their own sibling module.
//
// A four-player party is an ONLINE room (constants.js LOCAL_PLAYERS): two people share one keyboard,
// one nine-key block each, and a pad never claims past the second seat. So this file has two jobs --
// prove the four-player SIM still scales (Part A, seated through the `?chars=` debug hook, which is
// the only way to put four heroes on one machine headlessly), and prove couch play really does stop
// at two from every screen that can seat anybody (Parts B-D).
//
// Parts:
//   A - a four-bot party: all four slots fill in order, party-scaled attack tokens and wave clones,
//       everyone stays on screen, at least one wave cleared, and the results plaque shows four stats.
//   B - the couch cap mid-run and from the pause overlay: P2 drops in, a third seat never does.
//   C - pad-claim slot assignment on the title: the first pad takes a local seat, the second finds
//       none, and claims release on title entry.
//   D - two cursors through character select into gameplay, and no third.
//   E - the netplay guard: local slots beyond the online party never reach a match, pads never
//       claim another player's slot.
/**
 * @param {{ withPage: Function, withPair: Function, assert: Function, readyUp: Function }} deps
 * @returns {{ coop4: Function }}
 */
export function coop4Scenarios({ withPage, withPair, assert, readyUp }) {
  return {
    async coop4(server) {
      // Part A: four bots run themselves to the wave-clear/results milestones. `?chars=0,1,2,3` is the
      // debug party hook (screens/gameplay.js enter): couch play can no longer produce four, so this is
      // what stands in for an online room's seating while staying a single headless page.
      await withPage(server, 'seed=3&skipTo=gameplay&chars=0,1,2,3&bot=1&godmode=1', async (g) => {
        await g.step(3000);
        const s = await g.summary();
        assert(s.players.length === 4, `four players present (got ${s.players.length})`);
        assert(s.players.map((p) => p.index).join() === '0,1,2,3', `slots 0..3 filled in order (got ${s.players.map((p) => p.index).join()})`);
        assert(s.wavesCleared >= 1, `four-player bots clear at least one wave (cleared ${s.wavesCleared})`);
        assert((await g.eval(() => window.__game.world.attackTokens.max)) === 4, 'four heroes standing lets four enemies attack at once');
        assert(s.players.every((p) => p.x >= s.cameraX - 40 && p.x <= s.cameraX + 680), 'every hero stays on screen');
        // WAVE_EXTRA_BY_PARTY (stage.js queueSpawns) is a THREE-or-more-hero feature ([0,0,0,1,2]), so
        // this four-player party is the only place in the suite that can see it fire. Nothing else reads
        // runner.pending or a spawn total, so the clone branch would stay green with the concat deleted.
        // Push a 2-spec list straight onto the runner and inspect what actually landed in `pending`, then
        // roll `pending.length` back so nothing is really spawned. An unsided lead spec (no `side`) is
        // mirrored to whichever side its own default alternation is NOT (stage.js: `side: s.side ===
        // 'left' ? 'right' : 'left'`), which for spec index 0 is 'left', so the clone is counted by
        // side === 'left', not 'right'.
        const wp = await g.eval(() => {
          const r = window.__game.game.screen.runner, n0 = r.pending.length;
          r.queueSpawns([{ type: 'a', variant: 'b' }, { type: 'a', variant: 'b', side: 'sky' }]);
          const added = r.pending.slice(n0);
          r.pending.length = n0;
          return { n: added.length, sky: added.filter((e) => e.spec.side === 'sky').length, cloned: added.filter((e) => e.spec.side === 'left').length };
        });
        assert(wp.n === 3 && wp.sky === 1 && wp.cloned === 1, `a four-hero party gets one non-sky clone mirrored to the opposite side, and the sky spec is never cloned (${JSON.stringify(wp)})`);
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

      // Part B: the couch cap (constants.js LOCAL_PLAYERS). P2 still drops in mid-run and the party
      // still scales to two, but no local press from any screen can reach a third seat -- that seat is
      // an online room's to hand out, and there is no second keyboard to hand the person anyway.
      await withPage(server, 'seed=3&skipTo=gameplay&chars=0&nowaves=1&godmode=1', async (g) => {
        const joinedFlags = () => g.eval(() => [0, 1, 2, 3].map((s) => window.__game.input.joined(s)));
        await g.step(30);
        await g.press(2, { attack: true }, 2, 10);
        let s = await g.summary();
        let jf = await joinedFlags();
        assert(s.players.length === 1 && !jf[2], `a third seat cannot drop in, even pressing its own buttons (indices ${s.players.map((p) => p.index).join()})`);
        await g.press(1, { attack: true }, 2, 10);
        s = await g.summary();
        assert(s.players.length === 2 && s.players.some((p) => p.index === 1), `P2 still drops in mid-run (indices ${s.players.map((p) => p.index).join()})`);
        await g.press(2, { attack: true }, 2, 10);
        s = await g.summary();
        assert(s.players.length === 2, `and a third still cannot once the couch is full at two (indices ${s.players.map((p) => p.index).join()})`);
        // The pause overlay does its own drop-in, so it needs the cap independently of the gameplay loop.
        await g.press(0, { start: true }, 2, 5);
        assert((await g.screen()) === 'pause', 'a joined player\'s start button pauses the run');
        await g.press(3, { attack: true }, 2, 5);
        await g.press(0, { start: true }, 2, 10);
        assert((await g.screen()) === 'gameplay', 'resuming from pause returns to gameplay');
        s = await g.summary();
        jf = await joinedFlags();
        assert(s.players.length === 2, `the pause overlay cannot seat a third either (indices ${s.players.map((p) => p.index).join()})`);
        assert(jf[0] && jf[1] && !jf[2] && !jf[3], `slots 0-1 joined, slots 2-3 left for an online room (${JSON.stringify(jf)})`);
        // WAVE_EXTRA_BY_PARTY[2] is 0, so a full couch is still the identity spawn stream -- byte for
        // byte what solo and every pre-#23 two-player run produced, which the checksums depend on.
        const wp = await g.eval(() => {
          const r = window.__game.game.screen.runner, n0 = r.pending.length;
          r.queueSpawns([{ type: 'a', variant: 'b' }, { type: 'a', variant: 'b', side: 'sky' }]);
          const added = r.pending.slice(n0);
          r.pending.length = n0;
          return { n: added.length, cloned: added.filter((e) => e.spec.side === 'left').length };
        });
        assert(wp.n === 2 && wp.cloned === 0, `a full couch gets no wave clones -- identity, byte-for-byte the solo spawn list (${JSON.stringify(wp)})`);
        // One player standing still must not veto the run. Before engine/camera.js grew its leader
        // floor, the mean-follow and the left-edge clamp settled into a standstill the moment the
        // party was a screen apart: the idle hero pinned the left edge, the moving one was stuck
        // against the right, and the camera never advanced again -- on a 6000px stage, from x 132.
        await g.eval(() => window.__game.clearInput(1));
        const camBefore = await g.eval(() => Math.round(window.__game.world.camera.x));
        await g.eval(() => window.__game.setInput(0, { right: true }));
        await g.step(600);
        const walk = await g.eval(() => {
          const ps = window.__game.summary().players;
          const at = (i) => { const p = ps.find((q) => q.index === i); return p ? Math.round(p.x) : null; };
          return { cam: Math.round(window.__game.world.camera.x), lead: at(0), idle: at(1) };
        });
        await g.eval(() => window.__game.clearInput(0));
        assert(walk.cam > camBefore + 400, `one player walking while the other stands still still moves the camera (${camBefore} -> ${walk.cam})`);
        assert(walk.idle > camBefore + 300, `the player standing still is carried along rather than stranding the run (idle at ${walk.idle})`);
        assert(walk.idle >= walk.cam - 8 && walk.lead <= walk.cam + 640, `and both stay on screen (cam ${walk.cam}, lead ${walk.lead}, idle ${walk.idle})`);
        await g.shot('20d-dropin-2p');
      });

      // Part C: pad-claim slot assignment on the title, and the cap on claiming itself. A real key
      // drives P1's steering (the arrows, which are P1's own second movement set); virtual pads
      // (#19's input.setPadVirtual, read through pollGamepads) drive the claims.
      await withPage(server, 'seed=1', async (g, page) => {
        const padState = () => g.eval(() => ({
          padOf0: window.__game.input.padOf(0), padOf1: window.__game.input.padOf(1),
          padOf2: window.__game.input.padOf(2), padOf3: window.__game.input.padOf(3),
          joined1: window.__game.input.joined(1), joined2: window.__game.input.joined(2),
          nextPad: window.__game.input.nextPadSlot(),
        }));
        await g.step(30);
        await page.bringToFront();
        await page.keyboard.press('ArrowRight'); // P1 steering with their own arrows: must not mark slot 1 as used
        await g.step(3);
        await g.eval(() => window.__game.input.setPadVirtual(0, [0]));
        await g.step(2);
        let st = await padState();
        assert(st.padOf1 === 0 && st.joined1, `a pad pressed after P1 steered with their own arrows becomes P2, not P1 (${JSON.stringify(st)})`);
        await g.eval(() => window.__game.input.setPadVirtual(0, []));
        await g.step(2);
        // Slot 1's own key sets its kbSeen. KeyR (P2's SPECIAL) rather than P2's own ATTACK: slot 1
        // already joined above, and the title menu lets any joined slot confirm with ATTACK/START/JUMP
        // -- pressing P2's attack here would double as "START" and leave the title.
        await page.keyboard.press('KeyR');
        await g.step(3);
        await g.eval(() => window.__game.input.setPadVirtual(1, [0]));
        await g.step(2);
        st = await padState();
        assert(st.padOf2 === -1 && st.padOf3 === -1 && !st.joined2,
          `a SECOND pad finds no seat to claim once both couch slots are spoken for (${JSON.stringify(st)})`);
        assert(st.nextPad === -1, `and nextPadSlot() agrees, so no hint can advertise a seat that press cannot reach (${st.nextPad})`);
        await g.eval(() => window.__game.input.setPadVirtual(1, []));
        await g.step(2);
        await g.eval(() => window.__game.input.setPadVirtual(0, [0]));
        await g.step(2);
        st = await padState();
        assert(st.padOf1 === 0, `a claimed pad keeps its slot (${JSON.stringify(st)})`);
        await g.eval(() => window.__game.input.setPadVirtual(0, []));
        await g.shot('01b-title-2p');
        await g.eval(() => window.__game.game.reset('title'));
        await g.step(5);
        st = await padState();
        assert(st.padOf1 === -1 && !st.joined1, `entering the title releases every claim (${JSON.stringify(st)})`);
        await g.eval(() => window.__game.input.setPadVirtual(1, [0]));
        await g.step(2);
        const padOf0 = await g.eval(() => window.__game.input.padOf(0));
        assert(padOf0 === 1, `after the reset the first pad pressed is P1 (got ${padOf0})`);
        // Both keyboard blocks in use: before the cap a pad pressed here skipped past slot 1 to slot 2.
        // Now there is no slot 2 to skip to, so the press claims nothing at all rather than seating a
        // third player nobody has a keyboard for.
        await g.eval(() => window.__game.input.setPadVirtual(1, []));
        await g.eval(() => window.__game.game.reset('title'));
        await g.step(5);
        await page.bringToFront();
        await page.keyboard.press('KeyD'); // P1's own key: kbSeen[0]
        await page.keyboard.press('KeyR'); // P2's own key (SPECIAL): joins slot 1, kbSeen[1]
        await g.step(3);
        await g.eval(() => window.__game.input.setPadVirtual(0, [0]));
        await g.step(2);
        const afterBothKb = await padState();
        assert(afterBothKb.padOf0 === -1 && afterBothKb.padOf1 === -1 && afterBothKb.padOf2 === -1 && !afterBothKb.joined2,
          `a pad pressed after both keyboard blocks are in use claims nothing (${JSON.stringify(afterBothKb)})`);
        // ...and the join hints cannot lie about it: party.js builds every hint out of these two, so
        // with no free seat and no claimable slot there is nothing left for one to advertise.
        const invitable = await g.eval(() => ({ free: window.__game.input.freeSlots(), next: window.__game.input.nextPadSlot() }));
        assert(invitable.free.length === 0 && invitable.next === -1,
          `nothing is left to invite once both couch seats are taken (${JSON.stringify(invitable)})`);
        await g.eval(() => window.__game.input.setPadVirtual(0, null));
        await g.eval(() => window.__game.input.setPadVirtual(1, null));
      });

      // Part D: two cursors through character select into gameplay, and no third. P2 joins on its own
      // edge (never doubling as a confirm), both cursors move independently and end on distinct heroes.
      await withPage(server, 'seed=1', async (g) => {
        await g.step(60);
        await g.press(0, { attack: true }, 2, 20); // title -> board select
        await g.press(0, { attack: true }, 2, 45); // board select -> character select
        await g.press(1, { attack: true }, 2, 6);  // P2 joins (their own keyboard block)
        await g.press(2, { attack: true }, 2, 6);  // a third seat cannot join here either
        await g.press(3, { attack: true }, 2, 6);
        const seated = await g.eval(() => window.__game.game.screen.p.map((ps) => ps.joined));
        assert(seated[0] && seated[1] && !seated[2] && !seated[3],
          `character select seats the two couch players and no more (${JSON.stringify(seated)})`);
        await g.press(1, { right: true }, 2, 8);   // move P2 off P1's card
        await g.shot('02c-select-2p');
        await g.press(0, { attack: true }, 2, 6);
        await g.press(1, { attack: true }, 2, 6);
        await g.step(40);
        const scr = await g.screen();
        assert(scr === 'intro' || scr === 'gameplay', `two cursors confirm into intro/gameplay (got ${scr})`);
        await g.shot('02d-intro-2p');
        await g.step(200);
        await g.press(0, { attack: true }, 2, 30); // skip the intro card if any
        await g.step(30);
        const s = await g.summary();
        assert(s.screen === 'gameplay', `couch select reaches gameplay (got ${s.screen})`);
        assert(s.players.length === 2, `both players present (got ${s.players.length})`);
        assert(new Set(s.players.map((p) => p.id)).size === 2, `two distinct heroes chosen (ids ${s.players.map((p) => p.id).join()})`);
      });

      // Part F: the two select-screen defects the four-player audit turned up, both of which outlive
      // the couch cap because slot 1 can hit them too.
      //   1. a pad press that CLAIMS a slot must not also read as that slot's confirm -- on CHOOSE
      //      YOUR FIGHTER that locks a hero for whoever already holds the seat;
      //   2. a joined player who goes quiet (a pad whose battery died) must not hold the READY gate
      //      shut for everybody with no way out of it.
      await withPage(server, 'seed=1', async (g, page) => {
        await g.step(60);
        await page.bringToFront();
        // Drive P1 on REAL keys, not g.press(): a virtual slot never sets kbSeen, and kbSeen[0] is
        // what makes a pad claim slot 1 rather than settling on P1.
        await page.keyboard.press('KeyZ'); await g.step(25); // title -> board select
        await page.keyboard.press('KeyZ'); await g.step(50); // board select -> character select
        assert((await g.screen()) === 'select', `P1's own keys reach character select (got ${await g.screen()})`);
        const sel = () => g.eval(() => ({
          joined: window.__game.game.screen.p.map((ps) => ps.joined),
          confirmed: window.__game.game.screen.p.map((ps) => ps.confirmed),
          ready: window.__game.game.screen.readyTimer,
          padOf1: window.__game.input.padOf(1),
        }));
        // A pad claims slot 1: P2 joins, and the claiming press is spent on the claim.
        await g.eval(() => window.__game.input.setPadVirtual(0, [0]));
        await g.step(4);
        let st = await sel();
        assert(st.joined[1] && st.padOf1 === 0, `a pad claims slot 1 on character select (${JSON.stringify(st)})`);
        assert(!st.confirmed[1], `the claiming press does not also lock P2's hero (${JSON.stringify(st)})`);
        await g.eval(() => window.__game.input.setPadVirtual(0, []));
        await g.step(3);
        // That pad dies. The seat stays joined but its pad is released, which is exactly the state a
        // fresh pad press used to be swallowed by.
        await g.eval(() => window.__game.input.setPadVirtual(0, null));
        await g.step(3);
        st = await sel();
        assert(st.joined[1] && st.padOf1 === -1, `a disconnected pad releases its slot but not the seat (${JSON.stringify(st)})`);
        await g.eval(() => window.__game.input.setPadVirtual(1, [0]));
        await g.step(4);
        st = await sel();
        assert(st.padOf1 === 1, `a second pad re-claims the orphaned seat (${JSON.stringify(st)})`);
        assert(!st.confirmed[1], `and that claim press still does not lock the hero of whoever holds it (${JSON.stringify(st)})`);
        await g.eval(() => window.__game.input.setPadVirtual(1, null));
        await g.step(3);
        // P1 locks in. The gate must NOT fire: slot 1 is joined and has not confirmed.
        await page.keyboard.press('KeyZ');
        await g.step(30);
        st = await sel();
        assert(st.confirmed[0] && !st.confirmed[1] && st.ready === -1,
          `a joined slot that has not confirmed holds the READY gate shut (${JSON.stringify(st)})`);
        // BACK from that unlocked slot leaves the party, which frees the gate for everybody else.
        await g.press(1, { jump: true }, 2, 8);
        st = await sel();
        assert(!st.joined[1] && !(await g.eval(() => window.__game.input.joined(1))),
          `BACK from an unlocked slot leaves the party (${JSON.stringify(st)})`);
        await g.step(10);
        st = await sel();
        assert(st.ready >= 0, `and the run can start once nobody is holding it (readyTimer ${st.ready})`);
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
          attack: window.__game.input.pollRaw(0).attack === true,
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
