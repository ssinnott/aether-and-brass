// Online co-op BETWEEN boards, for tools/playtest.js (docs/MULTIPLAYER.md). Two pages, one real
// WebRTC mesh, one match played and finished, then the same room playing a second board.
//
// What it is here to prove:
//   A - finishing a board does NOT break the room up: both peers come off lockstep and their session
//       goes back to its lobby state, seats and heroes intact, instead of ending.
//   B - the clear is recorded against the PARTY's campaign (the scope the match was played in), not
//       against whichever save happened to be active once the match screen had gone. Neither
//       player's solo progress is touched.
//   C - dismissing the results plaque puts both players back on CHOOSE YOUR FIGHTER - not on the
//       title screen - with the host's cursor on the board the clear just opened.
//   D - and the room really is reusable: the party readies up again and plays that new board.
/**
 * @param {{ withPair: Function, assert: Function, readyUp: Function }} deps
 * @returns {{ netrematch: Function }}
 */
export function netrematchScenarios({ withPair, assert, readyUp }) {
  const netState = (p) => p.evaluate(() => window.__game.netState());
  const progressOf = (p) => p.evaluate(() => window.__game.progressState());
  const screenOf = (p) => p.evaluate(() => window.__game.screen());
  const waitFor = (p, fn, timeout = 20000) => p.waitForFunction(fn, null, { timeout });

  /**
   * Finish the board the way a victory does, minus the walk to the end of it: the stage runner calls
   * exactly this once the last wave is down (game/screens/gameplay.js onVictory -> showResults).
   * Both peers leave lockstep within a few frames of each other, which is what a real clear does too.
   */
  const finishBoard = (p) => p.evaluate(() => window.__game.game.screen.showResults(false));

  /** Dismiss a plaque / confirm a menu row without stealing focus from the other page: a virtual
   *  press needs no key events, and a backgrounded page would suspend rAF before it saw one. */
  const confirm = async (page) => {
    await page.evaluate(() => window.__game.setInput(0, { attack: true }));
    await page.waitForTimeout(120);
    await page.evaluate(() => window.__game.clearInput(0));
  };

  return {
    async netrematch(server) {
      const ROOM = 'NETRMT';
      await withPair(server, `room=${ROOM}&transport=broadcast&host=1`, `room=${ROOM}&transport=broadcast`,
        async (hostPage, guestPage, H, G) => {
          const pages = [hostPage, guestPage];
          for (const p of pages) await p.evaluate(() => window.__game.startLoop());
          for (const p of pages) await waitFor(p, () => ((window.__game.netState() || {}).state === 'lobby'));
          for (const p of pages) assert(await readyUp(p), 'the page registered its ready press');
          for (const p of pages) await waitFor(p, () => ((window.__game.netState() || {}).state === 'playing'));
          await waitFor(guestPage, () => ((window.__game.netState() || {}).frame || -1) > 30);

          const before = await progressOf(guestPage);
          assert(before.isGroup && before.unlockedCount === 1, `a new group starts with one board open (${before.scope}, ${before.unlockedCount})`);
          const scope = before.scope;

          // ---- A: the board ends, the room does not ----------------------------------------
          for (const p of pages) await finishBoard(p);
          for (const p of pages) await waitFor(p, () => window.__game.screen() === 'results');
          const st = await Promise.all(pages.map(netState));
          assert(st.every((s) => s.state === 'lobby'), `both peers came off lockstep with the room still up (${st.map((s) => s.state).join(', ')})`);
          assert(st.every((s) => s.party.length === 2 && s.party.every((m) => !m.ready)),
            'both seats are still held, and both ready flags cleared for the next board');
          assert(st.every((s) => s.desync === null), 'no desync on the way out of the match');

          // ---- B: the clear belongs to the party ------------------------------------------
          for (const p of pages) {
            const pr = await progressOf(p);
            assert(pr.scope === scope, `the clear was recorded in the group's own campaign (${pr.scope})`);
            assert(pr.unlocked[1] === true, "clearing together opened the group's second board");
            assert(pr.solo[1] === false, "...and left that player's solo progress alone");
            assert(/"g:[0-9a-f]{8}":\{"boards":\{"stage1"/.test(pr.saved || ''), `the group's clear is on disk under its own scope (${pr.saved})`);
          }

          // ---- C: back to CHOOSE YOUR FIGHTER, on the newly opened board -------------------
          await hostPage.waitForTimeout(700);            // the plaque ignores a press for its first 30 frames
          for (const p of pages) await confirm(p);
          for (const p of pages) await waitFor(p, () => window.__game.screen() === 'lobby');
          assert(await screenOf(hostPage) === 'lobby' && await screenOf(guestPage) === 'lobby',
            'the party is back on CHOOSE YOUR FIGHTER rather than on the title screen');
          const stage = await hostPage.evaluate(() => window.__game.game.net.lobby.stage);
          assert(stage === 2, `the host's cursor is on the board the clear just opened (stage ${stage})`);
          await G.shot('24-netplay-between-boards');

          // ---- D: the same room plays the board it opened ---------------------------------
          for (const p of pages) assert(await readyUp(p), 'the party readies up again in the same room');
          for (const p of pages) await waitFor(p, () => ((window.__game.netState() || {}).state === 'playing'));
          await waitFor(guestPage, () => ((window.__game.netState() || {}).frame || -1) > 30);
          const stages = await Promise.all(pages.map((p) => p.evaluate(() => window.__game.game.options.stage)));
          assert(stages[0] === 2 && stages[1] === 2, `the second match runs the board they just opened (host ${stages[0]}, guest ${stages[1]})`);
          const st2 = await Promise.all(pages.map(netState));
          assert(st2.every((s) => s.desync === null && s.frame > 30), 'and the second match is in lockstep like the first');
        });
    },
  };
}
