// Four-player ONLINE co-op scenario for tools/playtest.js (docs/MULTIPLAYER.md). Four pages in one
// browser context, four real WebRTC meshes over loopback, one lockstep match.
//
// What it is here to prove, none of which the two-player scenarios can:
//   A - four peers take four distinct seats and four distinct heroes, and the room fills as they
//       arrive rather than starting on the first two.
//   B - a full mesh runs a synchronised match: a key press on the fourth player's keyboard moves
//       that player on all four machines, and no peer's checksum ever disagrees.
//   C - the host's RELAY carries a pair that cannot link directly (?netrelay=1 refuses those links,
//       standing in for two players behind symmetric NATs).
//   D - one player leaving does NOT end the match for the rest: the host names a frame, everybody
//       retires that seat on it, the bot takes over, and the survivors stay in lockstep.
//   E - ...until only one is left, who carries on alone with bots, exactly as a pair does today.
/**
 * @param {{ withPeers: Function, assert: Function, readyUp: Function }} deps
 * @returns {{ netquad: Function }}
 */
export function netquadScenarios({ withPeers, assert, readyUp }) {
  const netState = (p) => p.evaluate(() => window.__game.netState());
  const frameOf = async (p) => (await netState(p)).frame;
  /** Wait for every open page to satisfy a predicate on its netState. */
  const waitAll = (pages, fn, timeout = 30000) => Promise.all(pages.filter((p) => !p.isClosed())
    .map((p) => p.waitForFunction(`(${fn.toString()})(window.__game.netState())`, null, { timeout })));

  return {
    async netquad(server) {
      const ROOM = 'NETQD';
      // The fourth player refuses direct links to the other guests, so everything between them and
      // players 2 and 3 has to go through the host. On one machine every link would otherwise form.
      const params = [
        `room=${ROOM}&transport=broadcast&host=1`,
        `room=${ROOM}&transport=broadcast`,
        `room=${ROOM}&transport=broadcast`,
        `room=${ROOM}&transport=broadcast&netrelay=1`,
      ];
      await withPeers(server, params, async (pages) => {
        for (const p of pages) await p.evaluate(() => window.__game.startLoop());

        // ---- A: four seats ----------------------------------------------------------------
        await waitAll(pages, (n) => !!n && n.state === 'lobby' && n.party.length === 4);
        const seated = await Promise.all(pages.map(netState));
        // Three guests race for the room, so seats go in the order the host hears them, not in the
        // order the pages opened. Index by seat from here on.
        const bySlot = [];
        seated.forEach((s, i) => { bySlot[s.slot] = pages[i]; });
        assert(seated.map((s) => s.slot).slice().sort().join() === '0,1,2,3', `the four peers take one seat each (got ${seated.map((s) => s.slot).join()})`);
        assert(seated[0].slot === 0, 'the host keeps seat 0');
        assert(seated.every((s) => s.players === 4), 'every peer knows the party is four strong');
        const roster = seated[0].party;
        assert(new Set(roster.map((m) => m.char)).size === 4, `the host hands every arrival a different hero (${roster.map((m) => m.char).join()})`);
        const agreed = seated.every((s) => JSON.stringify(s.party.map((m) => [m.slot, m.char])) === JSON.stringify(roster.map((m) => [m.slot, m.char])));
        assert(agreed, 'all four peers hold the same roster');
        const taken = await pages[1].evaluate((c) => window.__game.game.net.charTaken(c), roster[0].char);
        assert(taken === true, 'a hero another player is holding is refused to everybody else in the room');
        await pages[0].screenshot({ path: 'tools/screens/24-lobby-four.png' });

        // ---- C: the relayed pair -----------------------------------------------------------
        const relayPage = pages[3], relaySlot = seated[3].slot;
        const relayed = seated[3].party;
        assert(relayed.find((m) => m.slot === 0).direct === true, 'the relaying peer still holds a direct link to the host');
        assert(relayed.filter((m) => !m.local && m.slot !== 0).every((m) => !m.direct),
          'and none to the other two guests, so their traffic has to go through the host');

        // ---- B: a synchronised four-player match -------------------------------------------
        for (const p of pages) assert(await readyUp(p), 'the page registered its ready press');
        await waitAll(pages, (n) => n.state === 'playing');
        assert(true, 'all four peers reached the playing state');
        const counts = await Promise.all(pages.map((p) => p.evaluate(() => (window.__game.world.players || []).filter(Boolean).length)));
        assert(counts.join() === '4,4,4,4', `every machine built all four heroes (got ${counts.join()})`);

        await pages[0].waitForFunction(() => window.__game.netState().frame > 120, null, { timeout: 30000 });
        const running = await Promise.all(pages.map(netState));
        assert(running.every((s) => s.desync === null), `no checksum desync in a four-way match (${JSON.stringify(running.map((s) => s.desync))})`);
        const spread = Math.max(...running.map((s) => s.frame)) - Math.min(...running.map((s) => s.frame));
        assert(spread <= running[0].delay + 2, `all four stay in lockstep (frames ${running.map((s) => s.frame).join()}, delay ${running[0].delay})`);

        // The relaying player's own key press has to reach the two peers it cannot see directly.
        const posOf = (p, slot) => p.evaluate((s) => { const pl = window.__game.summary().players; return pl && pl[s] ? Math.round(pl[s].x) : null; }, slot);
        const before = await Promise.all(pages.map((p) => posOf(p, relaySlot)));
        await relayPage.bringToFront();
        await relayPage.keyboard.down('KeyD');
        await pages[0].waitForFunction((f) => window.__game.netState().frame > f, running[0].frame + 90, { timeout: 30000 });
        await relayPage.keyboard.up('KeyD');
        const after = await Promise.all(pages.map((p) => posOf(p, relaySlot)));
        assert(after.every((x, i) => x !== null && x > before[i]), `the relayed player's key press moved them on every machine (${before.join()} -> ${after.join()})`);
        assert(Math.max(...after) - Math.min(...after) <= 60, `and all four machines agree on where they are (${after.join()})`);
        await pages[0].screenshot({ path: 'tools/screens/25-netquad-host.png' });
        await relayPage.screenshot({ path: 'tools/screens/26-netquad-relayed.png' });

        // ---- D: one player leaves, the other three play on ----------------------------------
        await relayPage.close();
        const rest = pages.filter((p) => p !== relayPage);
        await Promise.all(rest.map((p) => p.waitForFunction((s2) => (window.__game.netState().dropped || []).includes(s2), relaySlot, { timeout: 30000 })));
        const dropped = await Promise.all(rest.map(netState));
        assert(dropped.every((s) => s.state === 'playing'), `losing one of four does NOT end the match (${dropped.map((s) => s.state).join()})`);
        const dropFrames = await Promise.all(rest.map((p) => p.evaluate((s) => window.__game.game.net.ls.dropFrameOf(s), relaySlot)));
        assert(new Set(dropFrames).size === 1 && dropFrames[0] > 0, `every survivor retires the seat on the SAME frame (${dropFrames.join()})`);
        const bots = await Promise.all(rest.map((p) => p.evaluate((s) => !!(window.__game.world.players[s] || {}).bot, relaySlot)));
        assert(bots.every(Boolean), 'the bot takes over the empty seat on every machine');

        const f0 = await frameOf(rest[0]);
        await rest[0].waitForFunction((f) => window.__game.netState().frame > f + 120, f0, { timeout: 30000 });
        const three = await Promise.all(rest.map(netState));
        assert(three.every((s) => s.desync === null), `the three that remain stay identical after the drop (${JSON.stringify(three.map((s) => s.desync))})`);
        assert(three.every((s) => s.state === 'playing'), 'and are all still playing');
        const ownBots = await Promise.all(rest.map((p) => p.evaluate(() => { const n = window.__game.game.net; return !!(window.__game.world.players[n.localSlot] || {}).bot; })));
        assert(ownBots.every((b) => !b), 'nobody lost their own character to the bot');
        await rest[0].screenshot({ path: 'tools/screens/27-netquad-after-drop.png' });

        // ---- E: down to one, who plays on alone ---------------------------------------------
        const nextOut = rest[rest.length - 1], nextSlot = (await netState(nextOut)).slot;
        await nextOut.close();
        const pair = rest.filter((p) => p !== nextOut);
        await Promise.all(pair.map((p) => p.waitForFunction((s) => (window.__game.netState().dropped || []).includes(s), nextSlot, { timeout: 30000 })));
        assert((await netState(pair[0])).state === 'playing', 'a party of four down to two is still a match');
        await pair[1].close();
        await pages[0].waitForFunction(() => window.__game.netState().state === 'ended', null, { timeout: 30000 });
        const alone = await netState(pages[0]);
        assert(alone.state === 'ended', `the last player left ends the session (${alone.reason})`);
        const solo = await pages[0].evaluate(() => ({
          screen: window.__game.screen(),
          bots: (window.__game.world.players || []).map((p) => !!(p && p.bot)),
          errs: window.__game.errors.length,
        }));
        assert(solo.screen === 'gameplay' && solo.errs === 0, 'and they keep playing, with no errors');
        assert(solo.bots[0] === false && solo.bots.slice(1).every(Boolean), `their own hero is still theirs and the other three are bots (${JSON.stringify(solo.bots)})`);
      });
    },
  };
}
