// Character select (GDD 8/9): up to four 140x200 brass-framed cards with 2.5x rig busts, name, archetype,
// five 5-pip stat bars, hovered card plays its taunt, a cursor per slot (P1 white, P2 cyan, P3 violet, P4
// magenta), attack locks / jump unlocks, any two (or more) may pick the same hero (later copies wear a
// tint), READY state, then the stage intro. P2 drops in on any of their own keys/pad buttons (issue #23);
// the couch stops there (constants.js LOCAL_PLAYERS), so slots 2/3 only ever light up under the four-cursor
// harness -- an online party picks its heroes in the lobby, not here. The cards themselves live in
// screens/charcards.js, shared with that lobby.
import { VIEW_W, VIEW_H, UI, MAX_PLAYERS, PLAYER_COLORS } from '../../constants.ts';
import { Screen } from '../game.ts';
import { drawText, drawTextOutlined, measureText } from '../../engine/text.ts';
import { rrect, gear } from '../../lib/art/shapes.ts';
import { buildCharSlots, tickCharSlots, drawCharCard, cardX, charStrap, CARD_Y } from './charcards.ts';
import { shieldLabel } from '../shield.ts';
import { joinHint } from '../party.ts';
import { input } from '../../engine/input.ts';
import { confirmPressed, cancelPressed, escapePressed, confirmKey, backKey } from '../menuinput.ts';
// Type-only: this screen reaches down for the shapes it works in rather than adding a module edge, the same
// arrangement (and for the same reason) as the block at the top of game/screens/gameplay.ts. `import type` is
// erased by tsc, esbuild and node alike.
import type { Game, ScreenParams, RegistryEntry } from '../game.ts';

const READY_FRAMES = 24;
const SLOT_GAP = 18;

/**
 * One player slot's state on this screen. Held here rather than read back off `input` every frame because the
 * cursor and the lock are this screen's own, and because a slot can be seated in the input layer while this
 * screen refuses it a seat: the TRAINING route (`single`) and the input-less ghosts enter() retires at the door.
 */
export interface SelectSlot {
  joined: boolean;
  /** Index into `chars` / `slots`. */
  cursor: number;
  /** Locked on the hero under the cursor. Every joined slot confirmed is what opens the READY gate. */
  confirmed: boolean;
}

/**
 * One cell of the `cursors` matrix screens/charcards.ts's `drawCharCard` takes: null when that slot's cursor is
 * not on this card. The lobby passes a `label` beside it; this screen keeps the default 'P1'..'P4' numbering, so
 * `confirmed` is the whole of what it writes.
 */
export interface CardCursor {
  confirmed: boolean;
}

/**
 * One name on the joined-slot status line under the cards. Measured and placed once by rebuild() -- which runs
 * only on a join / move / confirm -- so draw() allocates nothing per frame.
 */
export interface SlotLabel {
  text: string;
  color: string;
  /** Measured width of `text` at size 1. */
  w: number;
  /** Centre x. Filled in by rebuild()'s second pass, once the whole row's width is known. */
  x?: number;
}

/** Character select screen. Left/right moves a cursor; CONFIRM (ENTER or attack) locks a hero and BACK
 *  (Escape, jump or dodge) unlocks it -- or, from an unlocked slot, leaves: the screen for P1, the party
 *  for anybody else (game/menuinput.js). */
export class SelectScreen extends Screen {
  // The fields, for the checker only, in the order enter() writes them. `declare` because these are assignments
  // and nothing else: a plain field declaration would emit a class field per name (es2022 defines them before the
  // constructor body runs), which is a runtime change. Same reasoning, and the same wording, as game/entity.ts.
  /** The playable character registry (game.characters). */
  declare chars: RegistryEntry[];
  /** One card per registered character. `ReturnType` rather than a shape of its own: screens/charcards.ts owns
   *  what a slot is, and this tightens by itself the day that file declares it. */
  declare slots: ReturnType<typeof buildCharSlots>;
  /** The TRAINING route (issue #22): one player, and no drop-ins at all. */
  declare single: boolean;
  /** Slot state by SLOT, so `p[2]` is always P3 whether or not P2 ever joined. */
  declare p: SelectSlot[];
  /** Cursors by CARD and then by slot, rebuilt by rebuild(); null where that slot is not on that card. */
  declare cardCursors: Array<Array<CardCursor | null>>;
  /** Something the drawn rows are built from changed this frame; rebuild() consumes and clears it. */
  declare dirty: boolean;
  /** The `joinState()` mask `hint` was built for; -1 until the first build. */
  declare joinKey: number;
  /** The drop-in hint for the still-free slots (#19's long key list for slot 1). */
  declare hint: string;
  declare slotLine: SlotLabel[];
  /** Two or more slots are holding the same hero, which is allowed -- later copies wear a tint. */
  declare sameHero: boolean;
  /** The screen has handed off (READY, or BACK) and stops reading input. */
  declare starting: boolean;
  /** Frames since the party readied up; -1 until they have. */
  declare readyTimer: number;
  declare keysHint: string;

  constructor(game: Game) { super(game, 'select'); }
  override enter(params: ScreenParams): void {
    super.enter(params);
    this.chars = this.game.characters;
    this.slots = buildCharSlots(this.chars);
    // issue #22: the TRAINING route caps the room at one player (TrainingScreen.maxPlayers), so slots 1-3
    // never join here -- a slot already claimed before select (title.js P2 drop-in) is ignored outright,
    // not merely blocked from confirming, or its card cursor and "same hero" bookkeeping would still show it.
    this.single = params.next === 'training';
    // A slot claimed on the title screen (P2 drop-in) must be released here too, or input.joined(1) stays
    // true all the way into the single-player training room with no P2 player: P2's start would pause the
    // room and P2's own keys would drive the training plate, trials and moves overlays (review finding).
    if (this.single) for (let i = 1; i < MAX_PLAYERS; i++) if (this.game.input.joined(i)) this.game.input.setJoined(i, false);
    // A slot only takes a seat here if something can actually DRIVE it. A joined slot with no
    // keyboard block and no pad -- the ghosts an ended online session used to leave behind -- would
    // otherwise hold the READY gate shut with no input in existence that could confirm it or back it
    // out, since BACK is read from that slot's own keys. Retired at the door rather than papered over,
    // so its cursor and "same hero" bookkeeping never appear either (the same reason `single` does).
    const canAct = (i: number) => this.game.input.hasKeyboard(i) || this.game.input.padOf(i) >= 0;
    for (let i = 1; i < MAX_PLAYERS; i++) if (this.game.input.joined(i) && !canAct(i)) this.game.input.setJoined(i, false);
    this.p = Array.from({ length: MAX_PLAYERS }, (_, i) => ({
      joined: i === 0 || (!this.single && this.game.input.joined(i)),
      cursor: Math.min(i, Math.max(0, this.chars.length - 1)),
      confirmed: false,
    }));
    this.cardCursors = this.slots.map(() => new Array(MAX_PLAYERS).fill(null));
    this.dirty = true; this.joinKey = -1; this.hint = ''; this.slotLine = []; this.sameHero = false;
    this.starting = false; this.readyTimer = -1;
    this.keysHint = `LEFT/RIGHT: CHOOSE   ${confirmKey(input)}: LOCK   ${backKey(input)}: UNLOCK / BACK`;
    this.game.audio.music.play('title');
    if (this.slots[0]) this.slots[0].anim.play('taunt', { restart: true, fallback: 'idle' });
  }
  override update(): void {
    super.update();
    const inp = this.game.input, audio = this.game.audio, n = this.chars.length;
    tickCharSlots(this.slots);
    if (!n || this.starting) return;
    if (this.readyTimer >= 0) {
      if (++this.readyTimer >= READY_FRAMES) {
        this.starting = true;
        const chars = this.p.map((ps) => (ps.joined ? ps.cursor : null));
        while (chars.length > 1 && chars[chars.length - 1] == null) chars.pop();
        this.game.options.chars = chars;
        // issue #22: the title's TRAINING row routes here with params.next = 'training'; every other
        // caller (BOARD SELECT) keeps the intro/gameplay default.
        const next = this.params.next || (this.game.factories.intro ? 'intro' : 'gameplay');
        this.game.fadeTo(() => this.game.replace(next, { chars }), 0.1);
      }
      return;
    }
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const ps = this.p[i];
      if (!ps.joined) {
        if (!this.single && inp.joinPressed(i)) { ps.joined = true; inp.setJoined(i, true); audio.play('join'); this.slots[ps.cursor].anim.play('taunt', { restart: true, fallback: 'idle' }); this.dirty = true; }
        continue;
      }
      if (ps.confirmed) {
        if (cancelPressed(inp, i) || (i === 0 && escapePressed(inp))) { ps.confirmed = false; audio.play('menu_back'); this.slots[ps.cursor].anim.play('idle', { restart: true }); this.dirty = true; }
        continue;
      }
      let moved = false;
      if (inp.pressed(i, 'left')) { ps.cursor = (ps.cursor + n - 1) % n; moved = true; }
      if (inp.pressed(i, 'right')) { ps.cursor = (ps.cursor + 1) % n; moved = true; }
      if (moved) { audio.play('menu_move'); this.slots[ps.cursor].anim.play('taunt', { restart: true, fallback: 'idle' }); this.dirty = true; }
      if (confirmPressed(inp, i)) {
        ps.confirmed = true; audio.play('menu_confirm');
        this.slots[ps.cursor].anim.play('win', { restart: true });
        this.dirty = true;
      } else if (i > 0 && cancelPressed(inp, i)) {
        // BACK from an unlocked slot 1+ LEAVES THE PARTY, the same way BACK from an unlocked P1
        // leaves the screen. Without an exit, a slot that joined and then went quiet -- a pad whose
        // battery died mid-screen is the way it happens -- holds the READY gate below shut for
        // everybody (`allReady` wants every joined slot confirmed) with nothing on this screen able
        // to clear it: `input.joined` survives backing out to BOARD SELECT and coming back, and only
        // the title resets it. Rejoining costs one press of any of their own keys.
        ps.joined = false; ps.confirmed = false;
        inp.setJoined(i, false);
        audio.play('menu_back');
        this.dirty = true;
      } else if (i === 0 && (cancelPressed(inp, i) || escapePressed(inp))) {
        audio.play('menu_back');
        this.starting = true;
        // back out to wherever the board was chosen, so P1 can change board without restarting from the title
        // (params.back = 'title' for the TRAINING route: there is no board to return to)
        const back = this.params.back || (this.game.factories.boardselect ? 'boardselect' : 'title');
        this.game.fadeTo(() => this.game.replace(back), 0.08);
        return;
      }
    }
    const allReady = this.p.every((ps) => !ps.joined || ps.confirmed);
    if (allReady && this.p[0].confirmed) { this.readyTimer = 0; audio.play('rank_stamp'); }
    if (this.dirty) { this.rebuild(); this.dirty = false; }
    const k = inp.joinState();
    if (this.single) this.hint = '';
    else if (k !== this.joinKey) {
      this.joinKey = k;
      const h = joinHint(inp);
      // Free slot 1 has its own keyboard half; the composite hint's short form for it is swapped
      // for #19's long "PRESS X/Y/Z OR W" list, which is worth the extra width on this screen alone.
      // Match the stem both phrasings share: party.js rewrites the tail (' TO JOIN' -> ' OR ANY PAD BUTTON')
      // when a spare pad is connected, and matching the whole string then finds nothing and silently drops
      // the long key list.
      this.hint = !inp.joined(1) ? h.replace(inp.joinHint(1).replace(' TO JOIN', ''), inp.joinKeysHint(1).replace(' TO JOIN', '')) : h;
    }
  }
  /** Rebuild the per-card cursor matrix, the joined-slot status line and the same-hero flag.
   *  Called only when `this.dirty` (a join / move / confirm / unconfirm happened this frame). */
  rebuild(): void {
    const n = this.slots.length;
    for (let c = 0; c < n; c++) {
      const col = this.cardCursors[c];
      for (let s = 0; s < MAX_PLAYERS; s++) col[s] = this.p[s].joined && this.p[s].cursor === c ? { confirmed: this.p[s].confirmed } : null;
    }
    const parts: SlotLabel[] = [];
    for (let s = 1; s < MAX_PLAYERS; s++) {
      const ps = this.p[s];
      if (!ps.joined) continue;
      const d = this.chars[ps.cursor];
      const text = `P${s + 1} ${(d && (d.name || d.id)) || '?'}`;
      parts.push({ text, color: PLAYER_COLORS[s], w: measureText(text, 1) });
    }
    let totalW = 0;
    for (const p of parts) totalW += p.w;
    totalW += Math.max(0, parts.length - 1) * SLOT_GAP;
    let x = 320 - totalW / 2;
    for (const p of parts) { p.x = x + p.w / 2; x += p.w + SLOT_GAP; }
    this.slotLine = parts;
    let sameHero = false;
    for (let a = 0; a < MAX_PLAYERS && !sameHero; a++) {
      if (!this.p[a].joined) continue;
      for (let b = a + 1; b < MAX_PLAYERS; b++) if (this.p[b].joined && this.p[b].cursor === this.p[a].cursor) { sameHero = true; break; }
    }
    this.sameHero = sameHero;
  }
  override draw(ctx: CanvasRenderingContext2D): void {
    const f = this.frame;
    ctx.fillStyle = '#1c1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 0.22; gear(ctx, 60, 320, 90, 14, '#3a2a48', null, 0, f * 0.004, 30); gear(ctx, 600, 30, 70, 12, '#3a2a48', null, 0, -f * 0.005, 24); ctx.globalAlpha = 1;
    const heading = this.params.next === 'training' ? 'TRAINING ROOM' : 'CHOOSE YOUR FIGHTER';
    drawTextOutlined(ctx, heading, 320, 8, { size: 2, color: UI.brass, outline: '#3a2010', align: 'center' });
    const n = this.slots.length;
    if (!n) { drawText(ctx, 'NO CHARACTERS REGISTERED', 320, 170, { size: 1, color: UI.red, align: 'center' }); return; }
    const p1 = this.p[0];
    for (let i = 0; i < n; i++) {
      drawCharCard(ctx, this.slots[i], cardX(i, n), CARD_Y, f, { index: i, cursors: this.cardCursors[i] });
    }
    // the shield line sits between the cards and the strapline: it is the one hero stat the five pips do not show
    const sh = shieldLabel(this.chars[p1.cursor]);
    if (sh) drawText(ctx, sh, 320, 238, { size: 1, color: UI.brass, align: 'center' });
    const strap = charStrap(this.chars[p1.cursor]);
    if (strap) drawText(ctx, strap, 320, 248, { size: 1, color: UI.paper, align: 'center' });
    for (const p of this.slotLine) drawText(ctx, p.text, p.x, 262, { size: 1, color: p.color, align: 'center' });
    if (this.hint && (f % 60) < 40) drawText(ctx, this.hint, 320, 276, { size: 1, color: UI.steel, align: 'center' });
    if (this.sameHero) drawText(ctx, 'SAME HERO: LATER COPIES WEAR A TINT', 320, 290, { size: 1, color: UI.steel, align: 'center' });
    if (this.readyTimer >= 0) {
      const k = Math.min(1, this.readyTimer / 6), sc = 5 - Math.round(2 * k), ty = 150 - sc * 3;
      const pw = measureText('READY!', sc) + 48, ph = sc * 7 + 20;
      rrect(ctx, 320 - pw / 2, ty - 10, pw, ph, 6, 'rgba(10,6,14,0.9)', UI.brass, 2);
      drawTextOutlined(ctx, 'READY!', 320, ty, { size: sc, color: UI.brassLight, outline: '#3a2010', thickness: 2, align: 'center' });
    }
    drawText(ctx, this.keysHint, 320, 336, { size: 1, color: UI.steel, align: 'center' });
  }
}
