// Online co-op lobby (docs/MULTIPLAYER.md). Host or join a room by code, then pick a hero on the
// same brass card row the single-player screen uses (screens/charcards.js) and ready up.
//
// One flavour of connection: a six-character ROOM CODE, rendezvoused through a public MQTT broker
// and shareable as an invite link. (`?transport=broadcast` still reaches two tabs of one origin,
// which is what the end-to-end test drives, but it is not offered here.)
//
// Both players' cursors are on the row: P1 is the host's white gear ring, P2 the guest's cyan one,
// exactly as on the couch. Unlike the couch, the two may NOT land on the same hero — online there
// is no "that one's me, the darker one" to fall back on, so the peer's card is greyed out and the
// cursor steps over it (net/session.js owns the rule).
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined, measureText } from '../../engine/text.js';
import { rrect, rivetLine, gear } from '../../art/shapes.js';
import { makeRoomCode } from '../../net/signal.js';
import { progress } from '../progress.js';
import { STAGES } from '../../content/stage/index.js';
import { buildCharSlots, tickCharSlots, drawCharCard, cardX, charStrap, CARD_Y, P1_CURSOR, P2_CURSOR } from './charcards.js';

const ROLES = [['HOST A GAME', 'YOU ARE PLAYER 1'], ['JOIN A GAME', 'YOU ARE PLAYER 2']];
const CODE_CHARS = /^[A-Z0-9]$/;

/** Netplay lobby. Phases: role -> code -> connecting -> lobby -> (handed to the match). */
export class LobbyScreen extends Screen {
  constructor(game) { super(game, 'lobby'); }

  enter(params) {
    super.enter(params);
    this.phase = 'role';
    this.cursor = 0;
    this.isHost = true;
    this.typed = '';
    this.status = '';
    this.error = '';
    this.net = null;
    this.inviteUrl = '';
    this.slots = buildCharSlots(this.game.characters || []);
    this.shownChars = [-1, -1];       // last drawn [mine, theirs], so a change can play a taunt
    this.game.audio.music.play('title');
    // A ?room= invite link drops the guest straight into connecting.
    const opt = this.game.options;
    this.transport = opt.transport || 'mqtt';
    if (params.autoRoom || opt.room) {
      this.isHost = !!opt.host;
      this.typed = opt.room || '';
      if (this.typed || this.isHost) this.begin();
    }
    this.onKey = (e) => this.handleKey(e);
    window.addEventListener('keydown', this.onKey);
  }

  exit() {
    window.removeEventListener('keydown', this.onKey);
    // Leaving the lobby without starting must tear the session down, or the peer waits forever.
    if (this.net && this.net.state !== 'playing') this.net.end('cancelled');
  }

  /**
   * Raw key capture for the room code; the game bindings cannot type letters.
   *
   * While this is up it is the ONLY thing reading the keyboard (see update()). Half the room-code
   * alphabet is also a game key - B, C, V, X, Z are P1's solo aliases and C is dodge - so a code
   * with a C in it used to bounce the player straight back out of the screen mid-typing.
   */
  handleKey(e) {
    if (this.phase !== 'code') return;
    const k = (e.key || '').toUpperCase();
    if (k === 'BACKSPACE') { this.typed = this.typed.slice(0, -1); e.preventDefault(); }
    else if (k === 'ENTER') { if (this.typed.length >= 4) this.begin(); e.preventDefault(); }
    else if (k === 'ESCAPE') { this.phase = 'role'; this.game.audio.play('menu_back'); e.preventDefault(); }
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
    // The address bar must hold a GUEST-facing link. Sharing our own URL would carry host=1, and
    // two hosts in a room never see each other: signal.js filters by role, so both sit waiting.
    if (this.isHost && typeof history !== 'undefined' && history.replaceState) {
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete('host');
        u.searchParams.set('room', net.room);
        history.replaceState(null, '', u.toString());
        this.inviteUrl = u.toString();
      } catch { /* non-standard URL: fall back to showing the code alone */ }
    }
    const okStart = await net.connect();
    if (!okStart) { this.phase = 'error'; this.error = net.error || 'could not connect'; }
    else this.status = this.isHost ? 'WAITING FOR PLAYER 2' : 'CONNECTING';
  }

  /** Board indices this GROUP has unlocked. The host picks; the guest follows. */
  boardOptions() { return STAGES.map((_, i) => i).filter((i) => progress.isUnlocked(i)); }

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

  onNetState(s) {
    if (s === 'lobby') {
      this.phase = 'lobby'; this.status = ''; this.game.audio.play('join');
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
    if (this.frame < 4) return;
    const back = () => { audio.play('menu_back'); this.game.fadeTo(() => this.game.replace('title'), 0.08); };

    if (this.phase === 'role') {
      if (inp.pressed(0, 'up') || inp.pressed(0, 'down')) { this.cursor ^= 1; audio.play('menu_move'); }
      if (inp.pressed(0, 'attack') || inp.pressed(0, 'start')) {
        this.isHost = this.cursor === 0;
        audio.play('menu_confirm');
        if (this.isHost) { this.typed = makeRoomCode(); this.begin(); }
        else { this.phase = 'code'; this.typed = ''; }
      }
      if (inp.pressed(0, 'dodge')) back();
      return;
    }
    // Typing a code reads the keyboard raw in handleKey; the action bindings must keep their hands
    // off it, or the letters in the code fire menu moves and back-outs as they are typed.
    if (this.phase === 'code') return;
    if (this.phase === 'connecting') {
      if (inp.pressed(0, 'dodge')) { if (this.net) this.net.end('cancelled'); back(); }
      return;
    }
    if (this.phase === 'lobby') {
      this.syncCardAnims();
      if (!this.net.lobby.myReady) {
        if (inp.pressed(0, 'left')) this.moveChar(-1);
        if (inp.pressed(0, 'right')) this.moveChar(1);
        // Only the host cycles the board: it is their unlocks the session runs on.
        if (this.isHost && inp.pressed(0, 'up')) this.cycleBoard(-1);
        if (this.isHost && inp.pressed(0, 'down')) this.cycleBoard(1);
        if (inp.pressed(0, 'attack') || inp.pressed(0, 'start')) {
          this.net.setReady(true); audio.play('menu_confirm');
          this.playOn(this.net.lobby.myChar, 'win');
        }
      } else if (inp.pressed(0, 'jump') || inp.pressed(0, 'dodge')) {
        this.net.setReady(false); audio.play('menu_back');
        this.playOn(this.net.lobby.myChar, 'idle');
      }
      return;
    }
    if (this.phase === 'error' && (inp.pressed(0, 'attack') || inp.pressed(0, 'start') || inp.pressed(0, 'dodge'))) back();
  }

  /**
   * A pick changing - mine or the peer's, and the peer's arrives in a packet rather than a
   * keypress - taunts on the newly hovered card, so the row reacts to both players.
   */
  syncCardAnims() {
    const { myChar, theirChar, myReady } = this.net.lobby;
    if (this.shownChars[0] !== myChar) {
      if (this.shownChars[0] >= 0 && !myReady) this.playOn(myChar, 'taunt', { fallback: 'idle' });
      this.shownChars[0] = myChar;
    }
    if (this.shownChars[1] !== theirChar) {
      if (this.shownChars[1] >= 0) this.playOn(theirChar, 'taunt', { fallback: 'idle' });
      this.shownChars[1] = theirChar;
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
      drawText(ctx, 'ATTACK: CHOOSE    DODGE: BACK', 320, 250, { size: 1, color: UI.brassDark, align: 'center' });
      return;
    }

    if (this.phase === 'code') {
      plate(100, 96);
      drawText(ctx, 'TYPE THE ROOM CODE YOUR FRIEND SENT YOU', 320, 118, { size: 1, color: UI.steel, align: 'center' });
      const shown = this.typed + ((f % 60) < 30 ? '_' : '');
      drawTextOutlined(ctx, shown || '_', 320, 142, { size: 4, color: P2_CURSOR, outline: '#0a3a38', align: 'center' });
      drawText(ctx, 'ENTER: CONNECT    BACKSPACE: DELETE    ESC: BACK', 320, 176, { size: 1, color: UI.brassDark, align: 'center' });
      return;
    }

    if (this.phase === 'connecting') {
      plate(100, 110);
      const dots = '.'.repeat(1 + ((f >> 4) % 3));
      drawText(ctx, this.status + dots, 320, 122, { size: 1, color: UI.paper, align: 'center' });
      if (this.net && this.net.room) {
        drawText(ctx, 'ROOM CODE', 320, 142, { size: 1, color: UI.steel, align: 'center' });
        drawTextOutlined(ctx, this.net.room, 320, 156, { size: 4, color: P2_CURSOR, outline: '#0a3a38', align: 'center' });
        if (this.isHost) {
          drawText(ctx, 'SEND YOUR FRIEND THIS CODE - OR THE LINK BELOW', 320, 188, { size: 1, color: UI.brassDark, align: 'center' });
          // 62 characters is what fits inside the plate at this size; a long dev URL is elided.
          const url = this.inviteUrl.replace(/^https?:\/\//, '').toUpperCase();
          if (url) drawText(ctx, url.length > 62 ? url.slice(0, 59) + '...' : url, 320, 200, { size: 1, color: UI.steel, align: 'center' });
        }
      }
      drawText(ctx, 'DODGE: CANCEL', 320, 250, { size: 1, color: UI.brassDark, align: 'center' });
      return;
    }

    plate(110, 84);
    drawText(ctx, 'CONNECTION FAILED', 320, 128, { size: 2, color: UI.red, align: 'center' });
    drawText(ctx, String(this.error || '').toUpperCase().slice(0, 60), 320, 152, { size: 1, color: UI.paper, align: 'center' });
    drawText(ctx, 'ATTACK: BACK TO TITLE', 320, 172, { size: 1, color: UI.brassDark, align: 'center' });
  }

  /** The hero row: the same cards as the couch screen, with the peer driving the second cursor. */
  drawLobby(ctx, f) {
    const chars = this.game.characters || [], n = this.slots.length;
    const lobby = this.net.lobby, mySlot = this.net.localSlot;
    const mine = lobby.myChar, theirs = lobby.theirChar;
    drawTextOutlined(ctx, 'CHOOSE YOUR FIGHTER', 320, 8, { size: 2, color: UI.brass, outline: '#3a2010', align: 'center' });
    if (!n) { drawText(ctx, 'NO CHARACTERS REGISTERED', 320, 170, { size: 1, color: UI.red, align: 'center' }); return; }
    // Slot 0 is always the white "1" cursor and slot 1 the cyan "2", whichever of them is local:
    // the ring colours have to mean the same thing here as they do in the match.
    const cur = [null, null];
    cur[mySlot] = { confirmed: lobby.myReady, label: `P${mySlot + 1}`, char: mine };
    cur[this.net.remoteSlot] = { confirmed: lobby.theirReady, label: `P${this.net.remoteSlot + 1}`, char: theirs };
    for (let i = 0; i < n; i++) {
      drawCharCard(ctx, this.slots[i], cardX(i, n), CARD_Y, f, {
        index: i,
        p1: cur[0].char === i ? cur[0] : null,
        p2: cur[1].char === i ? cur[1] : null,
        taken: this.net.charTaken(i),
      });
    }

    // Who is who, on the same side as their cursor: player 1 left, player 2 right.
    const nameOf = (i) => { const d = chars[i]; return (d && (d.name || d.id)) || '?'; };
    for (let s = 0; s < 2; s++) {
      const c = cur[s], you = s === mySlot;
      const col = s === 0 ? P1_CURSOR : P2_CURSOR;
      drawText(ctx, `P${s + 1}${you ? ' (YOU)' : ''}`, 160 + s * 320, 240, { size: 1, color: col, align: 'center' });
      drawText(ctx, nameOf(c.char), 160 + s * 320, 252, { size: 2, color: UI.paper, align: 'center' });
      drawText(ctx, c.confirmed ? 'READY' : 'CHOOSING', 160 + s * 320, 270, { size: 1, color: c.confirmed ? '#7ef07e' : UI.brassDark, align: 'center' });
    }
    const strap = charStrap(chars[mine]);
    if (strap) drawText(ctx, strap, 320, 284, { size: 1, color: UI.paper, align: 'center' });

    // The board is the host's: unlocks are per-player, so the guest plays the host's game and is
    // given a key to that board for this session only.
    const bi = Math.max(0, (lobby.stage || 1) - 1), board = STAGES[bi], opts = this.boardOptions().length;
    // Arrows only when there is somewhere to go: a group with one board open cannot cycle.
    const boardLabel = !this.isHost ? "HOST'S BOARD:" : opts > 1 ? `BOARD  < ${bi + 1} OF ${opts} >` : `BOARD ${bi + 1} OF ${opts}`;
    drawText(ctx, `${boardLabel}  ${board ? board.name : '?'}`, 320, 298, { size: 1, color: UI.brass, align: 'center' });
    // Co-op progress belongs to the pairing, not to either player's solo save.
    drawText(ctx, opts > 1 ? `YOUR GROUP HAS OPENED ${opts} BOARDS TOGETHER` : 'A NEW GROUP STARTS ON BOARD 1 - CLEAR IT TOGETHER TO OPEN THE NEXT',
      320, 310, { size: 1, color: opts > 1 ? '#7ef07e' : UI.steel, align: 'center' });
    const hint = lobby.myReady ? 'JUMP: CHANGE YOUR MIND'
      : this.isHost && opts > 1 ? 'LEFT/RIGHT: HERO    UP/DOWN: BOARD    ATTACK: READY'
        : 'LEFT/RIGHT: HERO    ATTACK: READY';
    drawText(ctx, hint, 320, 324, { size: 1, color: UI.brass, align: 'center' });
    drawText(ctx, `ROOM ${this.net.room}    PING ${Math.round(this.net.rtt || 0)}MS    DELAY ${this.net.delay}F    ONE HERO EACH - THE GREYED CARD IS THEIRS`,
      320, 338, { size: 1, color: UI.brassDark, align: 'center' });

    if (lobby.myReady && lobby.theirReady) {
      const pw = measureText('STARTING!', 3) + 48;
      rrect(ctx, 320 - pw / 2, 140, pw, 41, 6, 'rgba(10,6,14,0.9)', UI.brass, 2);
      drawTextOutlined(ctx, 'STARTING!', 320, 152, { size: 3, color: UI.brassLight, outline: '#3a2010', thickness: 2, align: 'center' });
    }
  }
}
