// Online co-op lobby (docs/MULTIPLAYER.md). Host or join a room, pick a hero, ready up.
//
// Three ways to connect, none of which needs a server we run:
//   ROOM CODE   a public MQTT broker as a rendezvous; the code goes in an invite link
//   THIS PC     BroadcastChannel between two tabs of the same origin
//   CODE SWAP   copy-paste offer/answer codes; no infrastructure at all
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { rrect, rivetLine, gear } from '../../art/shapes.js';
import { makeRoomCode } from '../../net/signal.js';

const MODES = [
  { id: 'mqtt', label: 'ROOM CODE', blurb: 'PLAY OVER THE INTERNET' },
  { id: 'broadcast', label: 'THIS PC', blurb: 'TWO TABS ON THIS MACHINE' },
  { id: 'manual', label: 'CODE SWAP', blurb: 'PASTE CODES - NO SERVER AT ALL' },
];
const CODE_CHARS = /^[A-Z0-9]$/;

/** Netplay lobby. Phases: mode -> role -> code -> connecting -> lobby -> (handed to the match). */
export class LobbyScreen extends Screen {
  constructor(game) { super(game, 'lobby'); }

  enter(params) {
    super.enter(params);
    this.phase = 'mode';
    this.cursor = 0;
    this.mode = 'mqtt';
    this.isHost = true;
    this.typed = '';
    this.status = '';
    this.error = '';
    this.net = null;
    this.localCode = '';
    this.overlay = null;
    this.charCursor = 0;
    this.game.audio.music.play('title');
    // A ?room= invite link drops the guest straight into connecting.
    const opt = this.game.options;
    if (params.autoRoom || opt.room) {
      this.mode = opt.transport || 'mqtt';
      this.isHost = !!opt.host;
      this.typed = opt.room || '';
      if (this.typed || this.isHost) this.begin();
    }
    this.onKey = (e) => this.handleKey(e);
    window.addEventListener('keydown', this.onKey);
  }

  exit() {
    window.removeEventListener('keydown', this.onKey);
    this.killOverlay();
    // Leaving the lobby without starting must tear the session down, or the peer waits forever.
    if (this.net && this.net.state !== 'playing') this.net.end('cancelled');
  }

  /** Raw key capture for the room code; the game bindings cannot type letters. */
  handleKey(e) {
    if (this.phase !== 'code') return;
    const k = (e.key || '').toUpperCase();
    if (k === 'BACKSPACE') { this.typed = this.typed.slice(0, -1); e.preventDefault(); }
    else if (k === 'ENTER') { if (this.typed.length >= 4) this.begin(); e.preventDefault(); }
    else if (CODE_CHARS.test(k) && this.typed.length < 8) { this.typed += k; e.preventDefault(); }
  }

  /** Create the session and start connecting. */
  async begin() {
    this.phase = 'connecting';
    this.status = this.mode === 'manual' ? 'GENERATING CODE' : 'CONTACTING RENDEZVOUS';
    const net = this.game.createNet({
      isHost: this.isHost,
      room: this.isHost && this.mode !== 'manual' ? (this.typed || makeRoomCode()) : this.typed,
      transport: this.mode,
      onState: (s) => this.onNetState(s),
      onLocalCode: (code) => { this.localCode = code; this.showOverlay(); },
    });
    this.net = net;
    net.lobby.myChar = this.charCursor;
    const okStart = await net.connect();
    if (!okStart) { this.phase = 'error'; this.error = net.error || 'could not connect'; }
    else if (this.mode !== 'manual') this.status = this.isHost ? 'WAITING FOR PLAYER 2' : 'CONNECTING';
  }

  onNetState(s) {
    if (s === 'lobby') { this.phase = 'lobby'; this.status = ''; this.killOverlay(); this.game.audio.play('join'); }
    else if (s === 'ended') { this.phase = 'error'; this.error = (this.net && (this.net.error || this.net.endReason)) || 'disconnected'; }
  }

  /**
   * Copy-paste mode needs real text I/O, which a canvas cannot give: the codes are ~1 KB of base64.
   * A DOM overlay on top of the canvas is the honest way to do it.
   */
  showOverlay() {
    this.killOverlay();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;background:rgba(10,6,14,0.92);font:12px monospace;color:#e8dcc8;z-index:50;padding:16px';
    const label = document.createElement('div');
    label.textContent = this.isHost ? '1. SEND THIS CODE TO YOUR FRIEND    2. PASTE THEIR REPLY BELOW' : '1. PASTE THEIR CODE    2. SEND THEM YOUR REPLY';
    const mine = document.createElement('textarea');
    mine.readOnly = true; mine.value = this.localCode;
    mine.style.cssText = 'width:min(560px,90vw);height:90px;background:#1a1226;color:#4DF0E0;border:1px solid #c8964a;padding:6px;font:11px monospace';
    const copy = document.createElement('button');
    copy.textContent = 'COPY MY CODE';
    const theirs = document.createElement('textarea');
    theirs.placeholder = 'paste the other player’s code here';
    theirs.style.cssText = mine.style.cssText;
    const go = document.createElement('button');
    go.textContent = 'CONNECT';
    for (const b of [copy, go]) b.style.cssText = 'background:#c8964a;color:#1a1226;border:0;padding:6px 14px;font:12px monospace;cursor:pointer';
    copy.onclick = () => { mine.select(); try { navigator.clipboard.writeText(this.localCode); } catch { document.execCommand('copy'); } copy.textContent = 'COPIED'; };
    go.onclick = () => { if (this.net && this.net.acceptCode(theirs.value.trim())) { go.textContent = 'CONNECTING...'; } else { go.textContent = 'THAT CODE IS NOT VALID'; } };
    wrap.append(label, mine, copy, theirs, go);
    document.body.appendChild(wrap);
    this.overlay = wrap;
  }

  killOverlay() { if (this.overlay) { this.overlay.remove(); this.overlay = null; } }

  update() {
    super.update();
    const inp = this.game.input, audio = this.game.audio;
    if (this.frame < 4) return;
    const back = () => { audio.play('menu_back'); this.game.fadeTo(() => this.game.replace('title'), 0.08); };

    if (this.phase === 'mode') {
      if (inp.pressed(0, 'up')) { this.cursor = (this.cursor + MODES.length - 1) % MODES.length; audio.play('menu_move'); }
      if (inp.pressed(0, 'down')) { this.cursor = (this.cursor + 1) % MODES.length; audio.play('menu_move'); }
      if (inp.pressed(0, 'attack') || inp.pressed(0, 'start')) { this.mode = MODES[this.cursor].id; this.phase = 'role'; this.cursor = 0; audio.play('menu_confirm'); }
      if (inp.pressed(0, 'dodge')) back();
      return;
    }
    if (this.phase === 'role') {
      if (inp.pressed(0, 'up') || inp.pressed(0, 'down')) { this.cursor ^= 1; audio.play('menu_move'); }
      if (inp.pressed(0, 'attack') || inp.pressed(0, 'start')) {
        this.isHost = this.cursor === 0;
        audio.play('menu_confirm');
        if (this.mode === 'manual') this.begin();
        else if (this.isHost) { this.typed = makeRoomCode(); this.begin(); }
        else { this.phase = 'code'; this.typed = ''; }
      }
      if (inp.pressed(0, 'dodge')) { this.phase = 'mode'; this.cursor = 0; audio.play('menu_back'); }
      return;
    }
    if (this.phase === 'code') {
      if (inp.pressed(0, 'dodge')) { this.phase = 'role'; audio.play('menu_back'); }
      return;
    }
    if (this.phase === 'connecting') {
      if (inp.pressed(0, 'dodge')) { if (this.net) this.net.end('cancelled'); back(); }
      return;
    }
    if (this.phase === 'lobby') {
      const chars = this.game.characters || [];
      if (!this.net.lobby.myReady) {
        if (inp.pressed(0, 'left')) { this.charCursor = (this.charCursor + chars.length - 1) % chars.length; this.net.setChar(this.charCursor); audio.play('menu_move'); }
        if (inp.pressed(0, 'right')) { this.charCursor = (this.charCursor + 1) % chars.length; this.net.setChar(this.charCursor); audio.play('menu_move'); }
        if (inp.pressed(0, 'attack') || inp.pressed(0, 'start')) { this.net.setReady(true); audio.play('menu_confirm'); }
      } else if (inp.pressed(0, 'jump') || inp.pressed(0, 'dodge')) { this.net.setReady(false); audio.play('menu_back'); }
      return;
    }
    if (this.phase === 'error' && (inp.pressed(0, 'attack') || inp.pressed(0, 'start') || inp.pressed(0, 'dodge'))) back();
  }

  draw(ctx) {
    const f = this.frame;
    ctx.fillStyle = '#1c1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 0.22;
    gear(ctx, 70, 300, 90, 14, '#3a2a48', null, 0, f * 0.004, 30);
    gear(ctx, 580, 50, 70, 12, '#3a2a48', null, 0, -f * 0.005, 24);
    ctx.globalAlpha = 1;
    drawTextOutlined(ctx, 'ONLINE CO-OP', 320, 24, { size: 2, color: UI.brass, outline: '#3a2010', align: 'center' });

    const plate = (y, h) => {
      rrect(ctx, 120, y, 400, h, 8, 'rgba(30,20,26,0.9)', UI.brass, 2);
      rivetLine(ctx, 132, y + 8, 508, y + 8, 14, 2, UI.brass);
    };

    if (this.phase === 'mode' || this.phase === 'role') {
      plate(70, 150);
      const items = this.phase === 'mode' ? MODES.map((m) => [m.label, m.blurb]) : [['HOST A GAME', 'YOU ARE PLAYER 1'], ['JOIN A GAME', 'YOU ARE PLAYER 2']];
      drawText(ctx, this.phase === 'mode' ? 'HOW DO YOU WANT TO CONNECT?' : 'HOST OR JOIN?', 320, 88, { size: 1, color: UI.steel, align: 'center' });
      items.forEach(([label, blurb], i) => {
        const sel = i === this.cursor, y = 110 + i * 34;
        if (sel) gear(ctx, 150, y + 6, 6, 6, UI.brass, '#3a2010', 1, f * 0.05, 2);
        drawText(ctx, label, 168, y, { size: 2, color: sel ? UI.white : UI.steel });
        drawText(ctx, blurb, 168, y + 16, { size: 1, color: sel ? UI.brass : UI.brassDark });
      });
      drawText(ctx, 'ATTACK: CHOOSE    DODGE: BACK', 320, 250, { size: 1, color: UI.brassDark, align: 'center' });
      return;
    }

    if (this.phase === 'code') {
      plate(100, 96);
      drawText(ctx, 'TYPE THE ROOM CODE YOUR FRIEND SENT YOU', 320, 118, { size: 1, color: UI.steel, align: 'center' });
      const shown = this.typed + ((f % 60) < 30 ? '_' : '');
      drawTextOutlined(ctx, shown || '_', 320, 142, { size: 4, color: '#4DF0E0', outline: '#0a3a38', align: 'center' });
      drawText(ctx, 'ENTER: CONNECT    BACKSPACE: DELETE    DODGE: BACK', 320, 176, { size: 1, color: UI.brassDark, align: 'center' });
      return;
    }

    if (this.phase === 'connecting') {
      plate(100, 110);
      const dots = '.'.repeat(1 + ((f >> 4) % 3));
      drawText(ctx, this.status + dots, 320, 122, { size: 1, color: UI.paper, align: 'center' });
      if (this.net && this.net.room && this.mode !== 'manual') {
        drawText(ctx, 'ROOM CODE', 320, 142, { size: 1, color: UI.steel, align: 'center' });
        drawTextOutlined(ctx, this.net.room, 320, 156, { size: 4, color: '#4DF0E0', outline: '#0a3a38', align: 'center' });
        if (this.isHost) drawText(ctx, 'SEND YOUR FRIEND THIS CODE, OR THE LINK IN THE ADDRESS BAR', 320, 188, { size: 1, color: UI.brassDark, align: 'center' });
      }
      drawText(ctx, 'DODGE: CANCEL', 320, 250, { size: 1, color: UI.brassDark, align: 'center' });
      return;
    }

    if (this.phase === 'lobby') {
      plate(70, 170);
      const chars = this.game.characters || [];
      const me = chars[this.net.lobby.myChar], them = chars[this.net.lobby.theirChar];
      drawText(ctx, `CONNECTED  -  YOU ARE PLAYER ${this.net.localSlot + 1}`, 320, 88, { size: 1, color: '#4DF0E0', align: 'center' });
      drawText(ctx, `PING ${Math.round(this.net.rtt || 0)}MS    INPUT DELAY ${this.net.delay} FRAMES`, 320, 104, { size: 1, color: UI.steel, align: 'center' });
      const row = (label, name, ready, y, col) => {
        drawText(ctx, label, 160, y, { size: 1, color: col });
        drawText(ctx, (name && (name.name || name.id)) || '?', 250, y, { size: 2, color: UI.paper });
        drawText(ctx, ready ? 'READY' : 'CHOOSING', 400, y, { size: 1, color: ready ? '#7ef07e' : UI.brassDark });
      };
      row('YOU', me, this.net.lobby.myReady, 134, UI.white);
      row('THEM', them, this.net.lobby.theirReady, 160, '#4DF0E0');
      drawText(ctx, this.net.lobby.myReady ? 'JUMP: CHANGE YOUR MIND' : 'LEFT/RIGHT: PICK YOUR HERO    ATTACK: READY', 320, 200, { size: 1, color: UI.brass, align: 'center' });
      if (this.net.lobby.myReady && this.net.lobby.theirReady) drawTextOutlined(ctx, 'STARTING!', 320, 224, { size: 3, color: UI.brassLight, outline: '#3a2010', align: 'center' });
      return;
    }

    plate(110, 84);
    drawText(ctx, 'CONNECTION FAILED', 320, 128, { size: 2, color: UI.red, align: 'center' });
    drawText(ctx, String(this.error || '').toUpperCase().slice(0, 60), 320, 152, { size: 1, color: UI.paper, align: 'center' });
    drawText(ctx, 'ATTACK: BACK TO TITLE', 320, 172, { size: 1, color: UI.brassDark, align: 'center' });
  }
}
