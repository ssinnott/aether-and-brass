// Online co-op lobby (docs/MULTIPLAYER.md). Host or join a room by code, then pick a hero on the
// same brass card row the single-player screen uses (screens/charcards.js) and ready up.
//
// One flavour of connection: a six-character ROOM CODE, rendezvoused through a public MQTT broker
// and shareable as an invite link. (`?transport=broadcast` still reaches two tabs of one origin,
// which is what the end-to-end test drives, but it is not offered here.)
//
// Two to four players share a room. Every seated player's cursor is on the row - P1 is the host's
// white gear ring, P2 cyan, P3 and P4 their own colours, exactly as on the couch. Unlike the couch,
// two of them may NOT land on the same hero - online there is no "that one's me, the darker one" to
// fall back on, so a claimed card is greyed out and the cursor steps over it (net/session.js owns
// the rule, and the host is the one who arbitrates a collision).
//
// The room fills as people arrive: the host holds on the room code until somebody joins, and from
// then on the code stays on the bottom line so the third and fourth player can still be invited.
// The match starts when EVERY seated player is ready, so a party of two never waits on a fourth.
//
// The group's boards run underneath on the same screen: the BOARD SELECT plaques at lobby size
// (screens/boardcards.js), vignette and all, with the ones this pairing has not opened yet still
// wearing their padlock. The host's cursor picks - the session runs on their unlocks - and the
// guest watches it move.
import { VIEW_W, VIEW_H, UI, MAX_PLAYERS, NET_PLAYERS } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined, measureText } from '../../engine/text.js';
import { rrect, rivetLine, gear } from '../../art/shapes.js';
import { makeRoomCode, ROOM_ALPHABET } from '../../net/signal.js';
import { links } from '../../engine/links.js';
import { progress } from '../progress.js';
import { STAGES } from '../../content/stage/index.js';
import { buildCharSlots, tickCharSlots, drawCharCard, cardX, CURSOR_COLORS, P1_CURSOR, P2_CURSOR } from './charcards.js';
import { drawBoardPlaque, rowMetrics, PLAQUE_H } from './boardcards.js';
import { confirmPressed, cancelPressed, escapePressed, confirmPressedOffKeys, cancelPressedOffKeys, confirmKey, backKey } from '../menuinput.js';

const ROLES = [['HOST A GAME', 'YOU ARE PLAYER 1'], ['JOIN A GAME', 'UP TO FOUR PLAY TOGETHER']];
const CODE_CHARS = /^[A-Z0-9]$/;
// Both rows share one screen, so the hero cards sit higher than on the couch screen and the boards
// are the BOARD SELECT plaques at lobby size underneath them.
const HERO_Y = 22, STATUS_Y = 226, BOARD_Y = 236;
const BOARD_ROW = { maxW: 150, gap: 20, pad: 200, minW: 90 };
/** Where each player's line sits: one even column per seat, so a party of three is not lopsided. */
const STATUS_COLS = [[320], [160, 480], [110, 320, 530], [92, 244, 396, 548]];
// The room-code picker: every character a code can hold (net/signal.js ROOM_ALPHABET) in a grid,
// with DELETE and CONNECT on a row of their own underneath. A phone has no keyboard and a pad has no
// letters, so without this the JOIN half of the screen is reachable and then unusable.
const PICK_COLS = 7;
const PICK_ROWS = Math.ceil(ROOM_ALPHABET.length / PICK_COLS);
const PICK_W = 36, PICK_H = 22;
const PICK_X = 320 - (PICK_COLS * PICK_W) / 2, PICK_Y = 120;
/** The row under the letters, and how wide its two cells are. */
const ACTION_ROW = PICK_ROWS, ACTION_GAP = 12;
const ACTION_W = (PICK_COLS * PICK_W - ACTION_GAP) / 2;
const ACTION_Y = PICK_Y + PICK_ROWS * PICK_H + 8;
/** Where the host's invite address is drawn, which is also the rect a tap on it claims. */
const INVITE_Y = 200;
/** How long "LINK COPIED" and friends stay up. */
const NOTICE_FRAMES = 150;

/** Netplay lobby. Phases: role -> code -> connecting -> lobby -> (handed to the match). */
export class LobbyScreen extends Screen {
  constructor(game) { super(game, 'lobby'); }

  enter(params) {
    super.enter(params);
    // Couch pad claims are meaningless in the lobby: any pad should drive the local menu (readUnboundPads
    // covers slot 0 while claiming is off), and claims come back with the next visit to the title screen.
    this.game.input.resetClaims();
    this.game.input.setPadClaiming(false);
    this.phase = 'role';
    this.cursor = 0;
    this.isHost = true;
    this.typed = '';
    this.status = '';
    this.error = '';
    this.net = null;
    this.setInvite('');
    this.zoneUrl = '';                 // the address links.js currently holds a rect for
    this.inviteZone = null;            // ...and the rect itself, in internal px
    this.notice = ''; this.noticeTimer = 0;
    // The picker's cursor. `pickWant` is the column to come back to when a short row has clamped it,
    // so running down the grid and back up does not walk the cursor left.
    this.pickRow = 0; this.pickCol = 0; this.pickWant = 0;
    this.slots = buildCharSlots(this.game.characters || []);
    this.boards = []; this.boardsKey = '';
    this.shownChars = new Array(MAX_PLAYERS).fill(-1);   // last drawn hero per seat, so a change can taunt
    // The local player is always sampled through slot 0's keyboard (net/session.js pollRaw(0))
    // whichever seat they end up owning, so the keys to name are P1's -- the same nine everyone
    // online is using on their own machine.
    const inp = this.game.input;
    const k = (a) => inp.keyText('p1', a);
    // One scheme everywhere (game/menuinput.js): CONFIRM is ENTER or attack, BACK is Escape.
    this.hintRole = `${confirmKey(inp)} OR ATTACK (${k('attack')}): CHOOSE    ${backKey(inp)}: BACK`;
    // Two halves of the room-code screen, because two different people are reading it: whoever has
    // a keyboard types, and whoever has a thumb or a pad works the picker. The picker's line names
    // ACTIONS rather than keys -- it is deliberately deaf to the keyboard, so key names would lie.
    // (Named literally, not through keyText: handleKey reads these three keys raw, so a rebind of
    // the menu keys does not move them.)
    this.hintCodeKeys = 'ENTER: CONNECT    BACKSPACE: DELETE    ESC: BACK';
    this.hintCodePick = 'OR PICK IT BELOW - ATTACK CHOOSES, JUMP GOES BACK';
    this.hintCancel = `${backKey(inp)}: CANCEL`;
    this.hintError = `${confirmKey(inp)}: BACK TO TITLE`;
    this.hintUnready = `${backKey(inp)}: CHANGE YOUR MIND`;
    this.hintLeave = `${backKey(inp)}: LEAVE ROOM`;
    this.hintReadyHost = `LEFT/RIGHT: HERO    UP/DOWN: BOARD    ATTACK (${k('attack')}): READY`;
    this.hintReadyHost1 = `LEFT/RIGHT: HERO    ATTACK (${k('attack')}): READY`;
    this.hintReadyGuest = `LEFT/RIGHT: HERO    ATTACK (${k('attack')}): READY    THE HOST PICKS THE BOARD`;
    this.game.audio.music.play('title');
    // A ?room= invite link drops the guest straight into connecting.
    const opt = this.game.options;
    this.transport = opt.transport || 'mqtt';
    // A finished co-op match comes back to the room it was played in, so take the live session over
    // instead of opening a second one on top of it (`opt.room` below would otherwise have a returning
    // guest re-dial their own invite link).
    if (params.resume && this.game.net && this.game.net.state === 'lobby') this.resume(this.game.net, params);
    else if (params.autoRoom || opt.room) {
      this.isHost = !!opt.host;
      this.typed = opt.room || '';
      if (this.typed || this.isHost) this.begin();
    }
    this.onKey = (e) => this.handleKey(e);
    window.addEventListener('keydown', this.onKey);
  }

  /**
   * Pick a session back up between matches (game/screens/results.js resets here with `resume`).
   *
   * The room outlives the match: everyone keeps their seat, their hero and the group's progress, so
   * there is nothing to host, nothing to type and nobody to wait for - the party is simply choosing
   * again. The state callback is re-pointed at THIS screen, since the one that opened the session
   * left the stack when the match started.
   * @param {object} net the live session, already back in its lobby state
   * @param {{ reveal?: string }} params `reveal` is the board this party's clear just opened
   */
  resume(net, params) {
    this.net = net;
    this.isHost = net.isHost;
    this.typed = net.room;
    this.transport = net.transport || this.transport;
    net.onStateChange((s) => this.onNetState(s));
    this.shownChars = new Array(MAX_PLAYERS).fill(-1);
    // The URL still holds the guest-facing invite link from when the room was opened.
    if (this.isHost && typeof window !== 'undefined' && window.location) this.setInvite(window.location.href);
    if (this.party().length > 1) this.phase = 'lobby';
    else { this.phase = 'connecting'; this.status = 'WAITING FOR PLAYER 2'; }
    // The host's cursor lands on the board this party just opened - which is the whole point of
    // coming back here rather than to the title - and otherwise stays where it was.
    if (this.isHost) {
      const opts = this.boardOptions();
      const opened = params.reveal ? STAGES.findIndex((st) => st.id === params.reveal) : -1;
      const held = (net.lobby.stage || 1) - 1;
      const at = opts.includes(opened) ? opened : (opts.includes(held) ? held : (opts[0] || 0));
      net.setStage(at + 1);
    }
  }

  /**
   * Hold the guest-facing invite address, and the line of it this screen can draw.
   *
   * The 5x7 font is capitals only (engine/text.js), so the drawn label is NOT the address typed out
   * - it is a label for the thing a tap sends. `lowercase` remembers that it was folded, so the
   * screen can say so to anyone about to copy it down by hand.
   * @param {string} url
   */
  setInvite(url) {
    this.inviteUrl = url || '';
    const plain = this.inviteUrl.replace(/^https?:\/\//, '');
    this.inviteLowercase = /[a-z]/.test(plain);
    const shown = plain.toUpperCase();
    // 62 characters is what fits inside the plate at this size; a long dev URL is elided.
    this.inviteLabel = shown.length > 62 ? shown.slice(0, 59) + '...' : shown;
  }

  /**
   * Claim (or release) the tap target over the drawn invite address (engine/links.js).
   *
   * An installed copy on a home screen has no address bar, so this is the host's only way to send
   * the link anywhere at all; in a browser tab it saves a trip to the address bar. The share sheet
   * and the clipboard both need a real gesture, which is why this is a rect and not a menu row.
   */
  syncInviteZone() {
    const live = this.phase === 'connecting' && this.isHost && !!this.inviteUrl;
    if (!live) { if (this.zoneUrl) { links.clearZone(); this.zoneUrl = ''; this.inviteZone = null; } return; }
    if (this.zoneUrl === this.inviteUrl) return;
    this.zoneUrl = this.inviteUrl;
    const w = Math.max(96, measureText(this.inviteLabel, 1)) + 16;
    // Taller than the line it covers: this is a thumb's target, not a cursor's.
    this.inviteZone = { x: 320 - w / 2, y: INVITE_Y - 5, w, h: 17 };
    links.setZone({
      ...this.inviteZone, url: this.inviteUrl, share: true, title: 'Aether & Brass',
      onShare: (how) => {
        this.notice = how === 'shared' ? 'LINK SENT' : how === 'copied' ? 'LINK COPIED' : 'READ THEM THE CODE INSTEAD';
        this.noticeTimer = NOTICE_FRAMES;
      },
    });
  }

  /** How many cells that row of the picker has (the action row holds DELETE and CONNECT). */
  pickRowLen(row) { return row < PICK_ROWS ? Math.min(PICK_COLS, ROOM_ALPHABET.length - row * PICK_COLS) : 2; }

  /** Move the picker's cursor. Both axes wrap, like every other menu in the game. */
  movePick(dx, dy) {
    if (dy) {
      this.pickRow = (this.pickRow + dy + ACTION_ROW + 1) % (ACTION_ROW + 1);
      this.pickCol = Math.min(this.pickWant, this.pickRowLen(this.pickRow) - 1);
    } else {
      const len = this.pickRowLen(this.pickRow);
      this.pickCol = (this.pickCol + dx + len) % len;
      this.pickWant = this.pickCol;
    }
    this.game.audio.play('menu_move');
  }

  /** CONFIRM on the picker: add that character, delete the last one, or dial the code. */
  pickCell() {
    const audio = this.game.audio;
    if (this.pickRow < ACTION_ROW) {
      const ch = ROOM_ALPHABET[this.pickRow * PICK_COLS + this.pickCol];
      // Eight is the cap handleKey types to as well: a code is six, and the field is no bigger.
      if (!ch || this.typed.length >= 8) { audio.play('menu_back'); return; }
      this.typed += ch;
      audio.play('menu_confirm');
      return;
    }
    if (this.pickCol === 0) { this.typed = this.typed.slice(0, -1); audio.play('menu_back'); return; }
    // CONNECT, on the same four-character floor ENTER holds: a shorter code is a typo, and dialling
    // it would sit on a rendezvous nobody is publishing to.
    if (this.typed.length < 4) { audio.play('menu_back'); return; }
    audio.play('menu_confirm');
    this.begin();
  }

  exit() {
    links.clearZone();
    window.removeEventListener('keydown', this.onKey);
    // Leaving the lobby without starting must tear the session down, or the peer waits forever.
    if (this.net && this.net.state !== 'playing') this.net.end('cancelled');
  }

  /**
   * Raw key capture for the room code; the game bindings cannot type letters.
   *
   * While this is up it is the ONLY thing reading the keyboard (see update()). Every letter of the
   * room-code alphabet is also a game key - C X Z are P1's dodge, jump and attack and V B N are P2's -
   * so a code with a C in it used to bounce the player straight back out of the screen mid-typing.
   */
  handleKey(e) {
    if (this.phase !== 'code') return;
    const k = (e.key || '').toUpperCase();
    if (k === 'BACKSPACE') { this.typed = this.typed.slice(0, -1); e.preventDefault(); }
    else if (k === 'ENTER') { if (this.typed.length >= 4) this.begin(); e.preventDefault(); }
    // Escape is the one key here that LEAVES the 'code' phase, so update()'s `phase === 'code'` guard no
    // longer covers its edge: unswallowed, the same press reads as BACK on the role rows that same step and
    // drops the player out of the lobby entirely (screens/controls.js swallows for the same reason).
    else if (k === 'ESCAPE') { this.phase = 'role'; this.game.input.swallowKey(e.code || 'Escape'); this.game.audio.play('menu_back'); e.preventDefault(); }
    else if (CODE_CHARS.test(k) && this.typed.length < 8) { this.typed += k; e.preventDefault(); }
  }

  /** Create the session and start connecting. */
  async begin() {
    this.phase = 'connecting';
    this.status = 'CONTACTING RENDEZVOUS';
    const net = this.game.createNet({
      isHost: this.isHost,
      room: this.isHost ? (this.typed || makeRoomCode()) : this.typed,
      transport: this.transport,
      onState: (s) => this.onNetState(s),
    });
    this.net = net;
    // The link we hand out must be a GUEST-facing one. Sharing our own URL would carry host=1, and
    // two hosts in a room never see each other: signal.js filters by role, so both sit waiting.
    // The address bar gets it too where there is one -- an installed copy on a home screen has
    // none, which is what the tap target over the drawn address is for (syncInviteZone).
    if (this.isHost && typeof history !== 'undefined' && history.replaceState) {
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete('host');
        u.searchParams.set('room', net.room);
        history.replaceState(null, '', u.toString());
        this.setInvite(u.toString());
      } catch { /* non-standard URL: fall back to showing the code alone */ }
    }
    const okStart = await net.connect();
    if (!okStart) { this.phase = 'error'; this.error = net.error || 'could not connect'; }
    else this.status = this.isHost ? 'WAITING FOR PLAYER 2' : 'CONNECTING';
  }

  /**
   * The group's boards, in BOARD SELECT's shape. Rebuilt when the pairing's unlocks change: the
   * scope only switches once the peer's HELLO has landed, a frame or two after this screen opens.
   */
  syncBoards() {
    const key = `${progress.scope}:${progress.unlockedCount()}`;
    if (this.boardsKey === key) return;
    this.boardsKey = key;
    this.boards = STAGES.map((stage, i) => ({
      stage, index: i,
      unlocked: progress.isUnlocked(i),
      record: progress.record(stage.id),
      prev: STAGES[i - 1] || null,      // the board that has to be cleared to open this one
    }));
  }

  /** Board indices this GROUP has unlocked. The host picks; the guest follows. */
  boardOptions() { this.syncBoards(); return this.boards.filter((b) => b.unlocked).map((b) => b.index); }

  cycleBoard(dir) {
    const opts = this.boardOptions();
    if (opts.length < 2) return;
    const at = opts.indexOf((this.net.lobby.stage || 1) - 1);
    this.net.setStage(opts[((at < 0 ? 0 : at) + dir + opts.length) % opts.length] + 1);
    this.game.audio.play('menu_move');
  }

  /** Move the local cursor `dir` cards, stepping over the hero the peer is holding. */
  moveChar(dir) {
    const to = this.net.nextChar(dir);
    if (to === this.net.lobby.myChar || !this.net.setChar(to)) return;
    this.game.audio.play('menu_move');
  }

  /** True once there is somebody to play with; until then the host is still showing its room code. */
  party() { return (this.net && this.net.lobby.members) || []; }

  onNetState(s) {
    if (s === 'lobby') {
      this.status = '';
      // The host reaches 'lobby' the moment its own seat exists, which is before anyone has joined:
      // hold the room-code plate up until the room has someone in it to choose against.
      if (this.party().length > 1) { this.phase = 'lobby'; this.game.audio.play('join'); }
      else this.status = 'WAITING FOR PLAYER 2';
      // Only now are the player ids exchanged, so only now does progress read this PAIRING's
      // unlocks (game/progress.js). A new group starts on board 1 however far either player has got
      // solo; a `?stage=N` link is still a key to that board, so honour it when it is open.
      if (this.isHost) {
        const opts = this.boardOptions();
        const wanted = (this.game.options.stage || 1) - 1;
        this.net.setStage((opts.includes(wanted) ? wanted : opts[0] || 0) + 1);
      }
    }
    else if (s === 'ended') { this.phase = 'error'; this.error = (this.net && (this.net.error || this.net.endReason)) || 'disconnected'; }
  }

  update() {
    super.update();
    const inp = this.game.input, audio = this.game.audio;
    tickCharSlots(this.slots);
    this.syncInviteZone();
    if (this.noticeTimer > 0) this.noticeTimer--;
    if (this.frame < 4) return;
    const back = () => { audio.play('menu_back'); this.game.fadeTo(() => this.game.replace('title'), 0.08); };

    if (this.phase === 'role') {
      if (inp.pressed(0, 'up') || inp.pressed(0, 'down')) { this.cursor ^= 1; audio.play('menu_move'); }
      if (confirmPressed(inp, 0)) {
        this.isHost = this.cursor === 0;
        audio.play('menu_confirm');
        if (this.isHost) { this.typed = makeRoomCode(); this.begin(); }
        else { this.phase = 'code'; this.typed = ''; }
      }
      // Escape is a plain local key here: the fold into the `start` bit only happens once a match is
      // live (net/session.js beforeStep needs net.ls), so BACK is the same on this screen as any other.
      if (cancelPressed(inp, 0) || escapePressed(inp)) back();
      return;
    }
    // Typing a code reads the keyboard raw in handleKey; the action bindings must keep their hands
    // off it, or the letters in the code fire menu moves and back-outs as they are typed. The
    // picker is driven by the devices that have no letters to type WITH -- touch and gamepad - so
    // the two never collide (engine/input.js offKeyPressed). Until it existed this screen read no
    // input at all from them: a phone that chose JOIN A GAME could neither type nor back out, and
    // closing the app was the only way off it.
    if (this.phase === 'code') {
      if (inp.offKeyPressed(0, 'left')) this.movePick(-1, 0);
      if (inp.offKeyPressed(0, 'right')) this.movePick(1, 0);
      if (inp.offKeyPressed(0, 'up')) this.movePick(0, -1);
      if (inp.offKeyPressed(0, 'down')) this.movePick(0, 1);
      if (confirmPressedOffKeys(inp, 0)) this.pickCell();
      else if (cancelPressedOffKeys(inp, 0)) { this.phase = 'role'; audio.play('menu_back'); }
      return;
    }
    if (this.phase === 'connecting') {
      // A host sits here with its room code until the room has somebody else in it.
      if (this.net && this.net.state === 'lobby' && this.party().length > 1) {
        this.phase = 'lobby'; this.status = ''; audio.play('join');
        this.shownChars = new Array(MAX_PLAYERS).fill(-1);
      }
      if (cancelPressed(inp, 0) || escapePressed(inp)) { if (this.net) this.net.end('cancelled'); back(); }
      return;
    }
    if (this.phase === 'lobby') {
      this.syncCardAnims();
      this.syncBoards();
      if (!this.net.lobby.myReady) {
        if (inp.pressed(0, 'left')) this.moveChar(-1);
        if (inp.pressed(0, 'right')) this.moveChar(1);
        // Only the host cycles the board: it is their unlocks the session runs on.
        if (this.isHost && inp.pressed(0, 'up')) this.cycleBoard(-1);
        if (this.isHost && inp.pressed(0, 'down')) this.cycleBoard(1);
        if (confirmPressed(inp, 0)) {
          this.net.setReady(true); audio.play('menu_confirm');
          this.playOn(this.net.lobby.myChar, 'win');
        } else if (cancelPressed(inp, 0) || escapePressed(inp)) {
          // BACK from a room you have not readied in LEAVES it, the same way it does from the
          // 'connecting' phase above. Until this the lobby phase read no back-out at all: the start
          // gate needs every seated player ready (net/session.js partyReady), the disconnect watchdog
          // is not armed until the match starts, so a peer who stops responding without closing the
          // tab is never dropped, and nothing on this screen -- Escape included -- got anybody out.
          // Reloading the page was the only way to leave a room somebody had gone quiet in.
          this.net.end('left the room');
          back();
        }
      } else if (cancelPressed(inp, 0) || escapePressed(inp)) {
        // Ready -> not ready. BACK again then leaves the room, by the branch above.
        this.net.setReady(false); audio.play('menu_back');
        this.playOn(this.net.lobby.myChar, 'idle');
      }
      return;
    }
    if (this.phase === 'error' && (confirmPressed(inp, 0) || cancelPressed(inp, 0) || escapePressed(inp))) back();
  }

  /**
   * A pick changing - anyone's, and everyone else's arrives in a packet rather than a keypress -
   * taunts on the newly hovered card, so the row reacts to the whole room.
   */
  syncCardAnims() {
    const lobby = this.net.lobby;
    for (const m of this.party()) {
      const char = m.local ? lobby.myChar : m.char | 0;
      const ready = m.local ? lobby.myReady : m.ready;
      if (this.shownChars[m.slot] === char) continue;
      if (this.shownChars[m.slot] >= 0 && !ready) this.playOn(char, 'taunt', { fallback: 'idle' });
      this.shownChars[m.slot] = char;
    }
  }

  /** Play an animation on one card, if that character exists. */
  playOn(i, name, o = {}) { const s = this.slots[i]; if (s) s.anim.play(name, { restart: true, ...o }); }

  draw(ctx) {
    const f = this.frame;
    ctx.fillStyle = '#1c1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 0.22;
    gear(ctx, 70, 300, 90, 14, '#3a2a48', null, 0, f * 0.004, 30);
    gear(ctx, 580, 50, 70, 12, '#3a2a48', null, 0, -f * 0.005, 24);
    ctx.globalAlpha = 1;

    if (this.phase === 'lobby') { this.drawLobby(ctx, f); return; }

    drawTextOutlined(ctx, 'ONLINE CO-OP', 320, 24, { size: 2, color: UI.brass, outline: '#3a2010', align: 'center' });
    const plate = (y, h) => {
      rrect(ctx, 120, y, 400, h, 8, 'rgba(30,20,26,0.9)', UI.brass, 2);
      rivetLine(ctx, 132, y + 8, 508, y + 8, 14, 2, UI.brass);
    };

    if (this.phase === 'role') {
      plate(70, 116);
      drawText(ctx, 'HOST OR JOIN?', 320, 88, { size: 1, color: UI.steel, align: 'center' });
      ROLES.forEach(([label, blurb], i) => {
        const sel = i === this.cursor, y = 110 + i * 34;
        if (sel) gear(ctx, 150, y + 6, 6, 6, UI.brass, '#3a2010', 1, f * 0.05, 2);
        drawText(ctx, label, 168, y, { size: 2, color: sel ? UI.white : UI.steel });
        drawText(ctx, blurb, 168, y + 16, { size: 1, color: sel ? UI.brass : UI.brassDark });
      });
      drawText(ctx, 'THE HOST GETS A ROOM CODE TO SEND TO THEIR FRIEND', 320, 214, { size: 1, color: UI.brassDark, align: 'center' });
      drawText(ctx, this.hintRole, 320, 250, { size: 1, color: UI.brassDark, align: 'center' });
      return;
    }

    if (this.phase === 'code') {
      plate(46, 206);
      drawText(ctx, 'THE ROOM CODE YOUR FRIEND SENT YOU', 320, 64, { size: 1, color: UI.steel, align: 'center' });
      const shown = this.typed + ((f % 60) < 30 ? '_' : '');
      drawTextOutlined(ctx, shown || '_', 320, 82, { size: 4, color: P2_CURSOR, outline: '#0a3a38', align: 'center' });
      this.drawPicker(ctx);
      drawText(ctx, this.hintCodeKeys, 320, 258, { size: 1, color: UI.brassDark, align: 'center' });
      drawText(ctx, this.hintCodePick, 320, 270, { size: 1, color: UI.brass, align: 'center' });
      return;
    }

    if (this.phase === 'connecting') {
      plate(100, 132);
      const dots = '.'.repeat(1 + ((f >> 4) % 3));
      drawText(ctx, this.status + dots, 320, 122, { size: 1, color: UI.paper, align: 'center' });
      if (this.net && this.net.room) {
        drawText(ctx, 'ROOM CODE', 320, 142, { size: 1, color: UI.steel, align: 'center' });
        drawTextOutlined(ctx, this.net.room, 320, 156, { size: 4, color: P2_CURSOR, outline: '#0a3a38', align: 'center' });
        if (this.isHost) {
          // The code is the thing to READ OUT (no vowels, no 0/O: it survives a phone call) and the
          // link is the thing to SEND. Tapping it opens the share sheet, or copies it -- an installed
          // copy has no address bar to lift it out of, and the label below is in the font's capitals.
          drawText(ctx, 'READ THEM THIS CODE - OR TAP THE LINK TO SEND IT', 320, 188, { size: 1, color: UI.brassDark, align: 'center' });
          if (this.inviteLabel) {
            drawText(ctx, this.inviteLabel, 320, INVITE_Y, { size: 1, color: links.hot ? UI.brassLight : UI.steel, align: 'center' });
            if (this.inviteLowercase) drawText(ctx, '(THE ADDRESS ITSELF IS ALL LOWERCASE)', 320, INVITE_Y + 10, { size: 1, color: UI.brassDark, align: 'center' });
          }
          if (this.noticeTimer > 0) drawText(ctx, this.notice, 320, INVITE_Y + 22, { size: 1, color: UI.teal, align: 'center' });
        }
      }
      drawText(ctx, this.hintCancel, 320, 250, { size: 1, color: UI.brassDark, align: 'center' });
      return;
    }

    plate(110, 84);
    drawText(ctx, 'CONNECTION FAILED', 320, 128, { size: 2, color: UI.red, align: 'center' });
    drawText(ctx, String(this.error || '').toUpperCase().slice(0, 60), 320, 152, { size: 1, color: UI.paper, align: 'center' });
    drawText(ctx, this.hintError, 320, 172, { size: 1, color: UI.brassDark, align: 'center' });
  }

  /**
   * The room-code picker, under the code being typed.
   *
   * Drawn always, not only on a touchscreen: a pad in a living room cannot type either, and a
   * keyboard player can ignore it - their keys still go straight into the code through handleKey,
   * and the cursor below never moves for them.
   */
  drawPicker(ctx) {
    const cell = (x, y, w, h, sel, label, color) => {
      if (sel) rrect(ctx, x, y, w, h, 4, 'rgba(78,54,32,0.9)', UI.brass, 2);
      drawText(ctx, label, x + w / 2, y + (h - 14) / 2, { size: 2, color: sel ? UI.white : color, align: 'center' });
    };
    for (let i = 0; i < ROOM_ALPHABET.length; i++) {
      const r = (i / PICK_COLS) | 0, c = i % PICK_COLS;
      cell(PICK_X + c * PICK_W, PICK_Y + r * PICK_H, PICK_W, PICK_H,
        this.pickRow === r && this.pickCol === c, ROOM_ALPHABET[i], UI.steel);
    }
    const onAction = this.pickRow === ACTION_ROW;
    cell(PICK_X, ACTION_Y, ACTION_W, PICK_H, onAction && this.pickCol === 0, 'DELETE', this.typed ? UI.steel : UI.brassDark);
    cell(PICK_X + ACTION_W + ACTION_GAP, ACTION_Y, ACTION_W, PICK_H, onAction && this.pickCol === 1, 'CONNECT',
      this.typed.length >= 4 ? UI.brass : UI.brassDark);
  }

  /** Screen state for tools/playtest.js (window.__game.summary(), ARCHITECTURE.md section 12). */
  summary() {
    const cellAt = (row, col) => (row < ACTION_ROW ? ROOM_ALPHABET[row * PICK_COLS + col] : ['DELETE', 'CONNECT'][col]);
    return {
      lobbyPhase: this.phase,
      isHost: this.isHost,
      typed: this.typed,
      pick: cellAt(this.pickRow, this.pickCol),
      invite: this.inviteUrl,
      inviteLabel: this.inviteLabel,
      inviteZone: this.zoneUrl ? this.inviteZone : null,
      notice: this.noticeTimer > 0 ? this.notice : '',
    };
  }

  /**
   * The pick screen: the hero cards on top - the same cards as the couch screen, with the rest of
   * the room driving the other cursors - and the group's boards underneath as BOARD SELECT plaques.
   */
  drawLobby(ctx, f) {
    const chars = this.game.characters || [], n = this.slots.length;
    const lobby = this.net.lobby, party = this.party();

    drawTextOutlined(ctx, 'CHOOSE YOUR FIGHTER', 320, 6, { size: 2, color: UI.brass, outline: '#3a2010', align: 'center' });
    if (!n) { drawText(ctx, 'NO CHARACTERS REGISTERED', 320, 170, { size: 1, color: UI.red, align: 'center' }); return; }
    // A seat's ring colour means the same thing here as it does in the match, so the cursors are
    // indexed by SLOT and not by who is looking at the screen. Our own pick is drawn from the local
    // value rather than the roster's, so the cursor moves the instant the key is pressed.
    const cur = new Array(MAX_PLAYERS).fill(null);
    for (const m of party) {
      cur[m.slot] = {
        confirmed: m.local ? lobby.myReady : !!m.ready,
        label: `P${m.slot + 1}`,
        char: (m.local ? lobby.myChar : m.char) | 0,
        local: !!m.local,
      };
    }
    for (let i = 0; i < n; i++) {
      drawCharCard(ctx, this.slots[i], cardX(i, n), HERO_Y, f, {
        index: i,
        cursors: cur.map((c) => (c && c.char === i ? c : null)),
        taken: this.net.charTaken(i),
      });
    }

    // Who is who, in one column per seat, left to right in slot order.
    const cols = STATUS_COLS[Math.max(0, party.length - 1)] || STATUS_COLS[3];
    party.forEach((m, i) => {
      const c = cur[m.slot], d = chars[c.char];
      const head = `P${m.slot + 1}${c.local ? ' (YOU)' : ''} ${(d && (d.name || d.id)) || '?'} `;
      const state = c.confirmed ? 'READY' : 'CHOOSING';
      const wh = measureText(head, 1), x0 = (cols[i] || 320) - (wh + measureText(state, 1)) / 2;
      drawText(ctx, head, x0, STATUS_Y, { size: 1, color: CURSOR_COLORS[m.slot] || P1_CURSOR });
      drawText(ctx, state, x0 + wh, STATUS_Y, { size: 1, color: c.confirmed ? '#7ef07e' : UI.brassDark });
    });

    // The boards are the GROUP's: co-op progress belongs to the party, so a new group sees board 1
    // open and the rest still sealed however far any of them has got alone. The host's cursor picks
    // (they own the session's unlocks); everyone else watches it move.
    const open = this.boardOptions().length, total = this.boards.length;
    const bi = Math.max(0, (lobby.stage || 1) - 1);
    const m = rowMetrics(total, BOARD_ROW);
    for (let i = 0; i < total; i++) {
      // The cursor is P1's white: the host is always player 1, so it reads as "their pick" on every screen.
      drawBoardPlaque(ctx, this.boards[i], m.x0 + i * (m.w + m.gap), BOARD_Y, m.w, PLAQUE_H, f,
        { sel: i === bi, cursor: i === bi ? P1_CURSOR : null });
    }

    const hint = lobby.myReady ? this.waitingOn() : this.readyHint(open);
    drawText(ctx, hint, 320, BOARD_Y + PLAQUE_H + 4, { size: 1, color: UI.brass, align: 'center' });
    const room = party.length < NET_PLAYERS ? `ROOM ${this.net.room} (SHARE IT)` : `ROOM ${this.net.room}`;
    drawText(ctx, `${room}    PARTY ${party.length}/${NET_PLAYERS}    PING ${Math.round(this.net.rtt || 0)}MS    DELAY ${this.net.delay}F    BOARDS ${open}/${total}`,
      320, BOARD_Y + PLAQUE_H + 14, { size: 1, color: UI.brassDark, align: 'center' });

    if (party.length >= 2 && party.every((p) => (p.local ? lobby.myReady : p.ready))) {
      const pw = measureText('STARTING!', 3) + 48;
      rrect(ctx, 320 - pw / 2, 126, pw, 41, 6, 'rgba(10,6,14,0.9)', UI.brass, 2);
      drawTextOutlined(ctx, 'STARTING!', 320, 138, { size: 3, color: UI.brassLight, outline: '#3a2010', thickness: 2, align: 'center' });
    }
  }

  /** The line under the boards while this player is ready: who the match is still waiting for. */
  waitingOn() {
    const late = this.party().filter((m) => !m.local && !m.ready).map((m) => `P${m.slot + 1}`);
    if (!late.length) return this.hintUnready;
    return `WAITING FOR ${late.join(' AND ')}    ${this.hintUnready}`;
  }

  /** ...and while they are still choosing: what the keys do, plus the invitation if seats are free. */
  readyHint(open) {
    const base = this.isHost ? (open > 1 ? this.hintReadyHost : this.hintReadyHost1) : this.hintReadyGuest;
    const seats = this.party().length < NET_PLAYERS ? `${base}    MORE CAN STILL JOIN` : base;
    return `${seats}    ${this.hintLeave}`;
  }
}
