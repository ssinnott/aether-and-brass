// The BESTIARY screen (issue #26): the book of everything you have beaten.
//
// A faction tab row across the top, a grid of brass-plate cards for the tab below it, and the selected entry large
// on the right with its rig playing idle -> walk -> attack -> hurt on a loop. Entries the player has never beaten
// are a SILHOUETTE and '? ? ?', the same padlock convention BOARD SELECT uses for a board that has not been opened,
// with one hint: the board and section that enemy first appears in, so a player three entries short knows where to
// go. Counts, unlock state and the codex text all come from game/bestiary.js; nothing on this screen writes.
//
// CONTROLS follow the one menu scheme (game/menuinput.js): LEFT/RIGHT walks the cards, UP/DOWN changes faction tab,
// BACK returns to the title. CONFIRM cycles a BOSS entry through the phases it has reached -- a boss is three
// silhouettes rather than one, and the person inside the machine is a reveal the book must not spoil, so an
// unreached phase is not offered at all.
//
// RIGS ARE BUILT PER TAB, not per book. buildRig() walks a whole part tree and 39 of them at once is the kind of
// hitch the debug gallery already has to live with (screens/gallery.js builds its grid up front because it is a
// developer tool). Here only the visible tab's cards are built, and only the selected entry's animated rig on top
// of that, so changing tabs costs at most eight builds and changing selection costs one.
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { rrect, rivetLine, gear } from '../../art/shapes.js';
import { buildRig, drawRig } from '../../art/rig.js';
import { drawShadowScreen } from '../../art/fx.js';
import { AnimPlayer } from '../animation.js';
import { wrapText } from './boardcards.js';
import { bestiary, entriesOf, FACTIONS } from '../bestiary.js';
import { input } from '../../engine/input.js';
import { confirmPressed, cancelPressed, escapePressed, backKey, confirmKey } from '../menuinput.js';

const HEADER_H = 22;
const TAB_Y = 26, TAB_H = 15;
// Card grid: two columns down the left. Eight entries (the boss tab, the largest) is four rows, which ends at 268
// and leaves the foot of the column for the control hint.
const GRID_X = 8, GRID_Y = 46, CARD_W = 148, CARD_H = 50, CARD_GAP_X = 8, CARD_GAP_Y = 6, COLS = 2;
const CARD_PITCH_Y = CARD_H + CARD_GAP_Y;
// Detail panel down the right.
const PANEL_X = 320, PANEL_Y = 46, PANEL_W = 312, PANEL_H = VIEW_H - PANEL_Y - 8;
const PAD = 10, TEXT_X = PANEL_X + PAD, TEXT_W = PANEL_W - PAD * 2;
const RIG_CX = PANEL_X + 74, RIG_FLOOR = 168;
const STAT_X = PANEL_X + 150;
const STAT_W = PANEL_X + PANEL_W - PAD - STAT_X;
const LINE = 10;
/** The detail rig's animation loop, in order. A rig without one of these simply skips it. */
const LOOP = ['idle', 'walk', 'attack1', 'hurt'];
/** Frames a completed animation holds before the loop moves on. */
const LOOP_HOLD = 24;
/** Silhouette fill for an entry that has never been beaten. */
const SILHOUETTE = '#0d0812';

/** The bestiary. Read-only: it shows the book game/bestiary.js keeps, and never records anything itself. */
export class BestiaryScreen extends Screen {
  constructor(game) { super(game, 'bestiary'); }
  enter(params) {
    super.enter(params);
    this.tab = 0;
    this.cursor = 0;
    this.cards = [];
    this.detail = null;
    this.setHints(input);
    // `?skipTo=bestiary&tab=boss` is how a playtest opens a named tab without walking the row.
    if (params.tab) { const i = FACTIONS.findIndex((f) => f.id === params.tab); if (i >= 0) this.tab = i; }
    this.game.audio.music.play('title');
    this.refreshCounts();
    this.buildTab();
  }
  /**
   * Header and tab counts, built once. Nothing on this screen writes to the book, so they cannot change while it is
   * open -- and `completion()` walks all 39 entries while `entriesOf()` allocates an array per tab, neither of which
   * belongs in a draw that runs 60 times a second.
   */
  refreshCounts() {
    const c = bestiary.completion();
    this.total = `${c.seen} / ${c.total} ENTRIES`;
    this.pct = `${c.pct}%`;
    this.full = bestiary.complete;
    this.tabs = FACTIONS.map((fac) => {
      const list = entriesOf(fac.id);
      let seen = 0;
      for (const e of list) if (bestiary.isSeen(e.id)) seen++;
      return { name: fac.name, count: `${seen}/${list.length}`, done: seen === list.length };
    });
  }
  /**
   * Build the control hints from the live bindings (never per frame in draw -- ARCHITECTURE 16). Two short lines
   * rather than one long one: the hint sits under the CARD COLUMN, which is 304px wide, and a single line naming
   * all three controls runs on under the detail panel.
   */
  setHints(inp) {
    this.hints = [
      'LEFT / RIGHT  ENTRY     UP / DOWN  FACTION',
      `${backKey(inp)}  BACK     ${confirmKey(inp)}  BOSS PHASE`,
    ];
    this.phaseHint = `PHASES   ${confirmKey(inp)} CYCLES`;
    this.hintVersion = inp.bindingsVersion;
  }
  /** Entries of the tab currently open. */
  get entries() { return this.cards.map((c) => c.entry); }
  /** The selected entry, or null when a tab is somehow empty. */
  get entry() { const c = this.cards[this.cursor]; return c ? c.entry : null; }

  /** Build the visible tab's card rigs (and nothing else's), then the detail rig for the first card. */
  buildTab() {
    const list = entriesOf(FACTIONS[this.tab].id);
    this.cards = list.map((entry) => {
      // One AnimPlayer per card, parked on the first frame of `idle` and never ticked: cards are a still row and
      // `anim.pose` is always a full pose, where a def whose idle has no frames would hand back a null one.
      const anim = new AnimPlayer(entry.anims || {});
      anim.play('idle', { fallback: 'idle' });
      return { entry, seen: bestiary.isSeen(entry.id), rig: buildRig(entry.build || {}), pose: anim.pose, stats: bestiary.stats(entry.id) };
    });
    this.cursor = Math.min(this.cursor, Math.max(0, this.cards.length - 1));
    this.buildDetail(0);
  }
  /**
   * Build the animated rig for the selected entry at phase `phase`. A boss phase that has not been REACHED is never
   * built: the book shows the machine the player has actually fought, not the man inside it.
   */
  buildDetail(phase) {
    const e = this.entry;
    if (!e) { this.detail = null; return; }
    const reached = this.reachedPhases(e);
    const p = reached.includes(phase) ? phase : 0;
    const block = p > 0 ? (e.phases.find((x) => x.index === p) || null) : null;
    const build = block ? block.build : e.build, anims = block ? block.anims : e.anims;
    const anim = new AnimPlayer(anims || {});
    const codex = block ? block.codex : e.codex;
    const fs = e.firstSeen;
    this.detail = {
      entry: e, phase: p, block, reached,
      seen: bestiary.isSeen(e.id), stats: bestiary.stats(e.id), top: bestiary.topHero(e.id),
      rig: buildRig(build || {}), anim, loop: 0, hold: 0,
      name: block ? block.name : e.name,
      codex,
      // Everything the panel prints is wrapped ONCE here rather than per frame in draw(): none of it changes until
      // the selection or the phase does, and this is the screen's only real per-frame work otherwise.
      lines: {
        text: codex ? wrapText(codex.text, TEXT_W) : [],
        tells: codex ? wrapText(codex.tells, TEXT_W) : [],
        weakness: codex ? wrapText(codex.weakness, TEXT_W) : [],
        where: fs ? [...wrapText(`BOARD ${fs.board}, SECTION ${fs.section}`, STAT_W), ...wrapText(fs.sectionName, STAT_W)] : [],
      },
      // Phase 0 is the entry itself; the rest are the boss's later silhouettes. Numbered by POSITION IN THE STRIP,
      // not by raw phase index: a phase with no rig of its own is not a card (the Hoister's OVERHEAT is the same
      // machine, angrier), and numbering round it would print "1." then "3." and read as a missing entry. Both
      // labels are built here so the strip costs nothing per frame beyond the lookup that decides their colour.
      phaseRows: [{ index: 0, name: e.name }, ...e.phases].map((ph, i) => ({ index: ph.index, label: `${i + 1}. ${ph.name}`, hidden: `${i + 1}. ? ? ?` })),
    };
    this.playLoop(true);
  }
  /** Phase indices the player has reached for this entry: always 0, plus every boss phase the book has marked. */
  reachedPhases(e) {
    const out = [0];
    for (const p of e.phases || []) if (bestiary.phaseSeen(e.id, p.index)) out.push(p.index);
    return out;
  }
  /** Start (or restart) the current step of the idle -> walk -> attack -> hurt loop. */
  playLoop(restart) {
    const d = this.detail;
    if (!d) return;
    d.anim.play(LOOP[d.loop % LOOP.length], { restart, fallback: 'idle' });
    d.hold = 0;
  }
  /** Move the card cursor by `n`, wrapping inside the tab. */
  moveCursor(n) {
    if (!this.cards.length) return;
    this.cursor = (this.cursor + n + this.cards.length) % this.cards.length;
    this.buildDetail(0);
    this.game.audio.play('menu_move');
  }
  /** Move the faction tab by `n`, wrapping, and rebuild that tab's rigs. */
  moveTab(n) {
    this.tab = (this.tab + n + FACTIONS.length) % FACTIONS.length;
    this.cursor = 0;
    this.buildTab();
    this.game.audio.play('menu_move');
  }
  update() {
    super.update();
    const inp = this.game.input;
    if (this.hintVersion !== inp.bindingsVersion) this.setHints(inp);
    // BACK first: on an entry with nothing to cycle, CONFIRM would otherwise be a dead key, so it closes the book
    // exactly as it does on MOVES and the gallery.
    if (escapePressed(inp) || cancelPressed(inp, 0) || cancelPressed(inp, 1)) { this.close(); return; }
    for (const p of [0, 1]) {
      if (inp.pressed(p, 'right')) this.moveCursor(1);
      if (inp.pressed(p, 'left')) this.moveCursor(-1);
      if (inp.pressed(p, 'down')) this.moveTab(1);
      if (inp.pressed(p, 'up')) this.moveTab(-1);
      if (confirmPressed(inp, p)) { if (!this.cyclePhase()) { this.close(); return; } }
    }
    const d = this.detail;
    if (d) {
      d.anim.tick();
      // Each step of the loop plays out, holds, then hands over to the next one. A looping anim (idle, walk) never
      // reports done, so it is moved on by the hold counter instead.
      if (d.anim.done || ++d.hold > LOOP_HOLD * 3) { d.loop = (d.loop + 1) % LOOP.length; this.playLoop(true); }
    }
  }
  /** CONFIRM on a boss with more than one phase reached: show the next one. @returns {boolean} true when it cycled */
  cyclePhase() {
    const d = this.detail;
    if (!d || d.reached.length < 2) return false;
    const i = d.reached.indexOf(d.phase);
    this.buildDetail(d.reached[(i + 1) % d.reached.length]);
    this.game.audio.play('menu_confirm');
    return true;
  }
  close() { this.game.audio.play('menu_back'); this.game.fadeTo(() => this.game.replace('title'), 0.08); }

  // ---------------------------------------------------------------- draw
  draw(ctx) {
    const f = this.frame;
    ctx.fillStyle = '#1a1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 0.16; gear(ctx, 70, 320, 90, 13, '#3a2a48', null, 0, f * 0.003, 28); gear(ctx, 600, 300, 60, 11, '#3a2a48', null, 0, -f * 0.004, 20); ctx.globalAlpha = 1;
    this.drawHeader(ctx, f);
    this.drawTabs(ctx);
    for (let i = 0; i < this.cards.length; i++) this.drawCard(ctx, this.cards[i], i, f);
    this.drawPanel(ctx, f);
    for (let i = 0; i < this.hints.length; i++) drawText(ctx, this.hints[i], GRID_X, VIEW_H - 26 + i * 11, { size: 1, color: UI.brassDark });
  }
  drawHeader(ctx, f) {
    ctx.fillStyle = '#120c14'; ctx.fillRect(0, 0, VIEW_W, HEADER_H);
    ctx.fillStyle = UI.brassDark; ctx.fillRect(0, HEADER_H - 1, VIEW_W, 1);
    drawTextOutlined(ctx, 'BESTIARY', GRID_X, 6, { size: 1, color: UI.brassLight, outline: '#3a2010', thickness: 1 });
    drawText(ctx, this.total, 110, 6, { size: 1, color: UI.paper });
    drawText(ctx, this.pct, 232, 6, { size: 1, color: this.full ? UI.teal : UI.brass });
    // the completion stamp: the book is finished, and it says so on its own cover
    if (this.full) {
      rrect(ctx, VIEW_W - 132, 3, 124, 16, 3, null, UI.teal, 1);
      drawText(ctx, 'THE BOOK IS FULL', VIEW_W - 70, 7, { size: 1, color: (f % 60) < 40 ? UI.teal : UI.brassLight, align: 'center' });
    }
  }
  drawTabs(ctx) {
    const w = Math.floor((VIEW_W - GRID_X * 2) / FACTIONS.length);
    for (let i = 0; i < this.tabs.length; i++) {
      const t = this.tabs[i], x = GRID_X + i * w, on = i === this.tab;
      rrect(ctx, x, TAB_Y, w - 3, TAB_H, 2, on ? 'rgba(90,60,28,0.95)' : 'rgba(30,22,34,0.9)', on ? UI.brass : UI.brassDark, 1);
      // Name and count share the tab's one line: a second line below it would be drawn over by the card grid,
      // which starts at GRID_Y. 'STORMCROWS 0/7' is 14 glyphs -- 84px inside a 101px tab.
      drawText(ctx, t.name, x + 6, TAB_Y + 4, { size: 1, color: on ? UI.brassLight : UI.steel });
      drawText(ctx, t.count, x + w - 9, TAB_Y + 4, { size: 1, color: t.done ? UI.teal : on ? UI.brass : UI.brassDark, align: 'right' });
    }
  }
  /** One card: a small rig (silhouetted when unseen), the name or '? ? ?', the role, and the defeat count. */
  drawCard(ctx, card, i, f) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = GRID_X + col * (CARD_W + CARD_GAP_X), y = GRID_Y + row * CARD_PITCH_Y;
    const sel = i === this.cursor;
    rrect(ctx, x, y, CARD_W, CARD_H, 3, sel ? 'rgba(80,54,26,0.95)' : 'rgba(34,26,40,0.9)', sel ? UI.brass : UI.brassDark, sel ? 2 : 1);
    if (sel) rivetLine(ctx, x + 5, y + 4, x + CARD_W - 5, y + 4, 8, 1, UI.brass);
    // rig thumbnail, fitted to the card exactly as the gallery fits its cells
    const fx = x + 26, fy = y + CARD_H - 6;
    const fit = Math.min(1, (CARD_H - 12) / ((card.rig.height + 10) * card.rig.scale));
    drawShadowScreen(ctx, fx, fy, 22 * card.rig.scale * fit, 0.4);
    drawRig(ctx, card.rig, card.pose, { x: fx, y: fy, facing: 1, scale: fit, still: true, ...(card.seen ? {} : { tint: SILHOUETTE, tintAlpha: 1 }) });
    const tx = x + 50;
    if (card.seen) {
      drawText(ctx, fitName(card.entry.name, CARD_W - 56), tx, y + 10, { size: 1, color: sel ? UI.brassLight : UI.paper });
      drawText(ctx, card.entry.role.toUpperCase(), tx, y + 22, { size: 1, color: UI.steel });
      drawText(ctx, `BEATEN ${card.stats.n}`, tx, y + 34, { size: 1, color: UI.brass });
    } else {
      drawText(ctx, '? ? ?', tx, y + 16, { size: 1, color: (f % 60) < 40 ? UI.brassDark : UI.steel });
      drawText(ctx, 'NOT YET BEATEN', tx, y + 30, { size: 1, color: UI.brassDark });
    }
  }
  /** The selected entry, large. */
  drawPanel(ctx, f) {
    rrect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 5, 'rgba(60,40,24,0.55)', UI.brass, 2);
    rrect(ctx, PANEL_X + 4, PANEL_Y + 4, PANEL_W - 8, PANEL_H - 8, 3, null, UI.brassDark, 1);
    const d = this.detail;
    if (!d) return;
    // name / subtitle
    drawTextOutlined(ctx, d.seen ? d.name : '? ? ?', PANEL_X + PANEL_W / 2, PANEL_Y + 12, { size: 1, color: UI.brassLight, outline: '#3a2010', thickness: 1, align: 'center' });
    const sub = d.seen ? (d.block ? `PHASE ${d.phase + 1}` : d.entry.subtitle || '') : 'NO ENTRY';
    if (sub) drawText(ctx, sub, PANEL_X + PANEL_W / 2, PANEL_Y + 24, { size: 1, color: UI.steel, align: 'center' });
    // the rig, playing its loop (silhouetted while the entry is locked)
    const fit = Math.min(1, 92 / ((d.rig.height + 16) * d.rig.scale));
    drawShadowScreen(ctx, RIG_CX, RIG_FLOOR, 32 * d.rig.scale * fit, 0.45);
    drawRig(ctx, d.rig, d.anim.pose, { x: RIG_CX, y: RIG_FLOOR, facing: 1, scale: fit, ...(d.seen ? {} : { tint: SILHOUETTE, tintAlpha: 1 }) });
    if (d.seen) drawText(ctx, LOOP[d.loop % LOOP.length].toUpperCase(), RIG_CX, RIG_FLOOR + 6, { size: 1, color: UI.brassDark, align: 'center' });
    this.drawStats(ctx, d);
    this.drawBody(ctx, d, f);
  }
  /** The kill columns, beside the rig. */
  drawStats(ctx, d) {
    let y = PANEL_Y + 44;
    const row = (label, value, color) => { drawText(ctx, label, STAT_X, y, { size: 1, color: UI.steel }); drawText(ctx, value, PANEL_X + PANEL_W - PAD, y, { size: 1, color: color || UI.paper, align: 'right' }); y += LINE + 2; };
    if (!d.seen) {
      // The hunt hint: a locked entry is only useful if it says where to go and find one.
      drawText(ctx, 'WHERE TO FIND IT', STAT_X, y, { size: 1, color: UI.brass }); y += LINE + 2;
      const where = d.lines.where;
      if (!where.length) { drawText(ctx, 'NOT ON ANY BOARD', STAT_X, y, { size: 1, color: UI.brassDark }); return; }
      for (let i = 0; i < where.length; i++) { drawText(ctx, where[i], STAT_X, y, { size: 1, color: i ? UI.brassLight : UI.paper }); y += LINE; }
      return;
    }
    row('DEFEATED', String(d.stats.n));
    row('THROWN', String(d.stats.thrown));
    row('RING-OUTS', String(d.stats.ring));
    const fs = d.entry.firstSeen;
    if (fs) row('FIRST SEEN', `B${fs.board} S${fs.section}`, UI.brass);
    if (d.top) { drawText(ctx, 'BEST HUNTER', STAT_X, y, { size: 1, color: UI.steel }); y += LINE; drawText(ctx, d.top, STAT_X, y, { size: 1, color: UI.brassLight }); }
  }
  /** Codex text, tells, weakness, and the phase strip on a boss. */
  drawBody(ctx, d, f) {
    let y = RIG_FLOOR + 18;
    if (!d.seen) {
      drawText(ctx, 'BEAT ONE TO OPEN THIS ENTRY.', TEXT_X, y, { size: 1, color: UI.brassDark });
      return;
    }
    if (d.codex) {
      for (const line of d.lines.text) { drawText(ctx, line, TEXT_X, y, { size: 1, color: UI.paper }); y += LINE; }
      y += 4;
      y = this.drawField(ctx, 'TELLS', d.lines.tells, y);
      y = this.drawField(ctx, 'WEAKNESS', d.lines.weakness, y, UI.teal);
    }
    if (d.entry.phases.length) this.drawPhases(ctx, d, y, f);
  }
  /** A labelled paragraph, from lines already wrapped by buildDetail. @returns {number} the y the next one starts at */
  drawField(ctx, label, lines, y, color) {
    if (!lines.length) return y;
    drawText(ctx, label, TEXT_X, y, { size: 1, color: UI.brass }); y += LINE;
    for (const line of lines) { drawText(ctx, line, TEXT_X, y, { size: 1, color: color || UI.paper }); y += LINE; }
    return y + 4;
  }
  /** Boss phases: the ones reached are named and selectable, the rest stay '? ? ?'. */
  drawPhases(ctx, d, y, f) {
    drawText(ctx, this.phaseHint, TEXT_X, y, { size: 1, color: UI.brass });
    y += LINE;
    for (const p of d.phaseRows) {
      const reached = p.index === 0 ? d.seen : bestiary.phaseSeen(d.entry.id, p.index);
      const on = p.index === d.phase;
      drawText(ctx, reached ? p.label : p.hidden, TEXT_X + 6, y, { size: 1, color: !reached ? UI.brassDark : on ? ((f % 60) < 40 ? UI.brassLight : UI.brass) : UI.paper });
      y += LINE;
    }
  }
}

/** Trim a name to the width a card has for it, so a long one never runs off the plate. */
function fitName(name, maxW) {
  const max = Math.floor(maxW / 6);          // 5px glyph + 1px spacing at size 1
  return name.length <= max ? name : name.slice(0, Math.max(1, max - 1)) + '.';
}
