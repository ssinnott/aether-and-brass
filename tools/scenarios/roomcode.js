// Joining and inviting WITHOUT A KEYBOARD, for tools/playtest.js. Receives the harness helpers so
// this file shares one browser, one assert and one results list with it — the same pattern as
// tools/scenarios/stall.js.
//
// THE BUG THIS PINS DOWN. The game installs on a phone's home screen (README "On a phone"), and the
// lobby's JOIN half was the one screen in it that a phone could reach and then not use: the room
// code was read straight off `keydown`, and the update() for that phase returned before any action
// was sampled. So there was nothing to type with, and — because BACK is an action, not a key — no
// way off the screen either. Closing the app was the only exit.
//
// What this covers, in the order it happens to a player:
//   A — the picker: JOIN opens it, a thumb or a pad walks it, ATTACK adds a character, DELETE takes
//       one back, CONNECT refuses a code too short to be one, and JUMP leaves the screen.
//   B — the two input halves stay apart: a typed letter goes into the CODE and never moves the
//       picker's cursor, which is the collision the phase's raw keydown reader exists to avoid.
//   C — the host's invite link: it is guest-facing (no host=1), it is a tap target, and a tap hands
//       it to the share sheet, or to the clipboard where there is no sheet. An installed copy has no
//       address bar, so this is the only way the link gets off that screen.

/** The first three characters of net/signal.js ROOM_ALPHABET, which is what the grid opens on. */
const FIRST = '2', SECOND = '3';

/**
 * @param {object} server
 * @param {{ withPage: Function, assert: Function }} deps
 * @returns {{ roomcode: Function }}
 */
export function roomCodeScenarios({ withPage, assert }) {
  return {
    async roomcode(server) {
      // ---- A + B: joining a room with no keyboard -----------------------------------------
      await withPage(server, 'seed=1&skipTo=lobby', async (g, page) => {
        const sum = () => g.summary();
        const atk = () => g.press(0, { attack: true }, 2, 6);
        const move = (dir) => g.press(0, { [dir]: true }, 2, 6);

        await g.step(10);
        let s = await sum();
        assert(s.lobbyPhase === 'role', `the lobby opens on HOST OR JOIN (got ${s.lobbyPhase})`);

        await move('down');
        await atk();
        s = await sum();
        assert(s.lobbyPhase === 'code' && s.typed === '', `JOIN A GAME opens an empty code screen (got ${s.lobbyPhase}/"${s.typed}")`);
        assert(s.pick === FIRST, `the picker starts on the alphabet's first character (got ${s.pick})`);
        await g.shot('24-roomcode-picker');

        // The whole point: an ATTACK press with no keyboard in the room types a character.
        await atk();
        s = await sum();
        assert(s.typed === FIRST, `ATTACK on the picker types that character (got "${s.typed}")`);

        await move('right');
        s = await sum();
        assert(s.pick === SECOND, `the cursor walks the grid (got ${s.pick})`);
        await atk();
        s = await sum();
        assert(s.typed === FIRST + SECOND, `and each pick appends (got "${s.typed}")`);

        // Four rows of letters down is the DELETE / CONNECT row. The cursor keeps its column, so the
        // one right press above lands it on CONNECT rather than DELETE.
        for (let i = 0; i < 4; i++) await move('down');
        s = await sum();
        assert(s.pick === 'CONNECT', `four rows down reaches the action row (got ${s.pick})`);

        // Two characters is not a room code. Dialling it would sit on a rendezvous nobody publishes
        // to, so CONNECT refuses and the screen stays put rather than pretending to connect.
        await atk();
        s = await sum();
        assert(s.lobbyPhase === 'code' && s.typed === FIRST + SECOND,
          `CONNECT refuses a code shorter than four characters (got ${s.lobbyPhase}/"${s.typed}")`);

        await move('left');
        s = await sum();
        assert(s.pick === 'DELETE', `the action row holds DELETE beside it (got ${s.pick})`);
        await atk();
        s = await sum();
        assert(s.typed === FIRST, `DELETE takes the last character back (got "${s.typed}")`);

        // ---- B: a keyboard still types, and typing NEVER drives the picker -------------------
        const pickBefore = s.pick;
        await page.keyboard.press('KeyC');   // C is also P1's DODGE: the collision this phase guards
        await g.step(2);
        s = await sum();
        assert(s.typed === FIRST + 'C', `a typed letter still goes into the code (got "${s.typed}")`);
        assert(s.pick === pickBefore, `and does not move the picker's cursor (${pickBefore} -> ${s.pick})`);
        assert(s.lobbyPhase === 'code', 'nor does it back out of the screen');

        // ---- A: and there is a way off the screen without a keyboard ------------------------
        await g.press(0, { jump: true }, 2, 6);
        s = await sum();
        assert(s.lobbyPhase === 'role', `JUMP leaves the code screen (got ${s.lobbyPhase})`);
      });

      // ---- C: the host's invite link is sendable from a page with no address bar -----------
      await withPage(server, 'seed=1&host=1&transport=broadcast', async (g, page) => {
        // Both APIs a tap can reach, stubbed: navigator.share is absent on a desktop Chromium and
        // the clipboard refuses a headless one, and neither result is what this is checking.
        await g.eval(() => {
          window.__shared = []; window.__copied = [];
          navigator.share = (d) => { window.__shared.push(d); return Promise.resolve(); };
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } },
          });
        });
        await g.step(30);
        let s = await g.summary();
        assert(s.lobbyPhase === 'connecting' && s.isHost, `?host=1 opens a room and waits in it (got ${s.lobbyPhase})`);
        assert(/[?&]room=/.test(s.invite) && !/[?&]host=/.test(s.invite),
          `the invite link is guest-facing: a room, no host flag (got ${s.invite})`);
        const z = s.inviteZone;
        assert(!!z && z.x >= 0 && z.y >= 0 && z.x + z.w <= 640 && z.y + z.h <= 360,
          `the address is a tap target inside the view (${JSON.stringify(z)})`);
        await g.shot('25-roomcode-invite');

        const tap = async () => {
          const pt = await g.eval(() => {
            const r = document.getElementById('game').getBoundingClientRect();
            const zz = window.__game.summary().inviteZone;
            return { x: r.left + (zz.x + zz.w / 2) * (r.width / 640), y: r.top + (zz.y + zz.h / 2) * (r.height / 360) };
          });
          await page.mouse.click(pt.x, pt.y);
          await g.step(4);
        };

        await tap();
        const shared = await g.eval(() => window.__shared.slice());
        assert(shared.length === 1 && shared[0].url === s.invite, `a tap hands the link to the share sheet (got ${JSON.stringify(shared)})`);
        s = await g.summary();
        assert(s.notice === 'LINK SENT', `and the screen says so (got "${s.notice}")`);

        // No share sheet (every desktop): the clipboard is the fallback, and it says THAT instead.
        await g.eval(() => { delete navigator.share; window.__game.game.screen.noticeTimer = 0; });
        await tap();
        const copied = await g.eval(() => window.__copied.slice());
        assert(copied.length === 1 && copied[0] === s.invite, `without a share sheet the link is copied (got ${JSON.stringify(copied)})`);
        s = await g.summary();
        assert(s.notice === 'LINK COPIED', `and that is what the screen says (got "${s.notice}")`);

        // Leaving the room releases the rect: a tap where the address was shares nothing.
        await g.press(0, { jump: true }, 2, 30);
        await tap().catch(() => { /* the zone is gone, so is the summary's rect */ });
        const after = await g.eval(() => window.__shared.length + window.__copied.length);
        assert(after === 2, `the address stops being a tap target once the room is left (got ${after} sends)`);
      });
    },
  };
}
