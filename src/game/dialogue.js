// Companion dialogue (issue #25 part 2): the heroes talk to each other while they fight.
//
// Six hero pairings, seven triggers, a plate over the head for about two seconds. The hard part is not the drawing —
// it is that this must never cost the player anything and never disagree between two peers. So:
//
// NEVER BLOCKS INPUT. A plate is drawn and nothing else. Nothing here touches `busy`, `holdPlayers`, `world.freeze`
// or `world.cutscene`, and a line raised mid-combo changes no simulation state whatsoever.
//
// NEVER PILES UP. One plate per hero at a time, a global cooldown between exchanges, and a trigger that fires while
// a plate is already up is DROPPED rather than queued — a queue would spend the cooldown replaying a fight that
// finished ten seconds ago. Ranked triggers break the tie: `partnerDown` outranks `combo20`, because if both land on
// the same frame the one worth hearing is the one about the person who just went out.
//
// NEVER DESYNCS. Which line comes out is `(world.frame + slot * 7) % lines.length` — the frame counter is hashed
// (net/checksum.js) and identical on every peer, so the same trigger on the same frame picks the same line without
// drawing from the rng at all. That matters more than it looks: the rng is a single mulberry32 stream whose DRAW
// COUNT is part of the checksum, so one `rng.pick` behind a peer-local condition — a plate suppressed by a cooldown
// that started a frame earlier on one side — would desync the match. Nothing in this file consumes `rng`, and the
// `?bot=1` / harness gates that skip dialogue entirely are therefore free.
//
// THE BANNER IS NOT THIS. `hud.showBanner` is a single slot already spoken for by waves, boss plates and CONTINUE!,
// so dialogue draws its own plates in world space from StageRunner.draw — above every entity, below all HUD.
import { VIEW_W, FLOOR_TOP, UI } from '../constants.js';
import { drawText, measureText } from '../engine/text.js';
import { rrect } from '../art/shapes.js';
import { clamp } from '../engine/math.js';

/**
 * The triggers, in the order issue #25 lists them, then the two an opening beat raises by hand.
 *
 * `boardOpen` and `boardWalk` are the only two a STAGE fires rather than the game: an opening is eleven seconds of
 * walking with nothing to fight, and what fills that is the party talking about the place they have just arrived in.
 * They are board-specific, which is why `say` takes a `row` (below) — `sectionStart` is written to fit any room in
 * the game, and these two are written about one quay, one gantry, one road and one heap.
 */
export const TRIGGERS = Object.freeze(['sectionStart', 'midbossIntro', 'bossIntro', 'partnerDown', 'partnerContinue', 'combo20', 'results',
  'boardOpen', 'boardWalk']);

/**
 * Priority when two triggers land on one frame. Higher wins; equal keeps the one already speaking. A moment that
 * happens once in a run beats one that happens every section, and both beat one that can fire every few seconds.
 */
const RANK = Object.freeze({ partnerDown: 5, partnerContinue: 4, bossIntro: 3, midbossIntro: 3, results: 2, sectionStart: 1,
  // the opening's own two rank with sectionStart: ambient, and never worth talking over anything that matters
  boardOpen: 1, boardWalk: 1, combo20: 0 });

/** Frames a plate stays up (~2s at 60fps), and the gap before any hero may speak again. */
export const PLATE_LIFE = 120;
export const PLATE_COOLDOWN = 90;
/** The reply of a two-line exchange lands this long after the opening line, so it reads as an answer. */
export const REPLY_DELAY = 45;

const PAD_X = 5, PAD_Y = 3, ROW_H = 13;

/**
 * One speech plate, centred on `cx` with its tail pointing down at the speaker. Shared with the results screen so a
 * line said over a victory pose looks like the same system as a line said mid-fight, rather than a second one.
 *
 * The plate is clamped into the view rather than allowed to run off it: a hero standing at the screen edge is the
 * common case in a beat-em-up, and a line half off the screen is worse than a line that has shifted a few pixels.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx screen x of the speaker
 * @param {number} y screen y of the plate's top edge
 * @param {string} text
 * @param {number} [alpha]
 */
export function drawSpeechPlate(ctx, cx, y, text, alpha = 1) {
  if (!text || alpha <= 0) return;
  const w = measureText(text, 1) + PAD_X * 2, h = ROW_H;
  const x = Math.round(clamp(cx, w / 2 + 3, VIEW_W - w / 2 - 3) - w / 2);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  rrect(ctx, x, y, w, h, 2, 'rgba(18,12,20,0.82)', UI.brassDark, 1);
  // the tail: two steps down toward the speaker's head, kept inside the plate's own x range
  const tailX = Math.round(clamp(cx, x + 4, x + w - 6));
  ctx.fillStyle = 'rgba(18,12,20,0.82)';
  ctx.fillRect(tailX, y + h, 4, 2); ctx.fillRect(tailX + 1, y + h + 2, 2, 2);
  drawText(ctx, text, x + PAD_X, y + PAD_Y, { size: 1, color: UI.paper, shadow: false });
  ctx.restore();
}

/** Canonical pairing key for two hero ids, ordered by their index in CHARACTERS so 'a+b' and 'b+a' are one table. */
export function pairKey(idA, idB, order) {
  const ia = order.indexOf(idA), ib = order.indexOf(idB);
  return ia <= ib ? `${idA}+${idB}` : `${idB}+${idA}`;
}

/**
 * The dialogue bus. One per run, owned by the StageRunner, stepped once per sim frame and drawn from its draw().
 *
 * It holds no content: `tables` is handed in by the caller (content/characters/lines.js merged into the registry),
 * so writing a line never touches engine code — which is the rule issue #25 sets for it.
 */
export class Dialogue {
  /**
   * @param {{ banter: object, solo: object, order: string[] }} tables
   * @param {{ enabled?: boolean }} [o] `enabled: false` is the harness / bot gate: every trigger becomes a no-op.
   */
  constructor(tables, { enabled = true } = {}) {
    this.banter = (tables && tables.banter) || {};
    this.solo = (tables && tables.solo) || {};
    this.order = (tables && tables.order) || [];
    this.enabled = enabled;
    /** Live plates by player slot: { text, t, life, who }. At most one per slot, by construction. */
    /** @type {Array<{ text: string, t: number, life: number, who: object }|null>} */
    this.plates = [];
    /** A queued reply: the second line of an exchange, already chosen, waiting out REPLY_DELAY. */
    this.pending = null;
    /** Frames until anything may speak again, and the rank of whatever is speaking now. */
    this.cool = 0;
    this.rank = -1;
    this.frame = 0;
  }

  /** Clear everything (section change, teardown). */
  reset() { this.plates.length = 0; this.pending = null; this.cool = 0; this.rank = -1; }

  /**
   * Raise an exchange. `speakers` are the live players, in slot order; the first two that have a def with `lines`
   * carry the exchange. Returns true when something was actually said.
   *
   * @param {string} trigger one of TRIGGERS
   * @param {object[]} speakers live players (each needs `.def` and `.index`)
   * @param {number} frame `world.frame` — the deterministic clock the line is picked with
   * @param {{ focus?: object, row?: number|null }} [o] `focus` forces who speaks first (the hero who hit the combo,
   *   the one who went out). `row` names WHICH row of the trigger's table to use instead of letting the frame
   *   choose it: an opening beat is written about its own board, so board 3 must get board 3's exchange and not
   *   whichever one the clock landed on. Everything else leaves it null and keeps the frame-indexed rotation.
   */
  say(trigger, speakers, frame, { focus = null, row = null } = {}) {
    if (!this.enabled) return false;
    const rank = RANK[trigger] != null ? RANK[trigger] : 0;
    // Already speaking, and this is not more important: drop it rather than queue it.
    if ((this.cool > 0 || this.pending) && rank <= this.rank) return false;
    const cast = this.cast(speakers, focus);
    if (!cast.length) return false;
    const [a, b] = cast;
    const line = b ? this.pickBanter(trigger, a, b, frame, row) : this.pickSolo(trigger, a, frame, row);
    if (!line) return false;
    this.plates.length = 0;
    this.pending = null;
    this.plate(a, line.a);
    if (b && line.b) this.pending = { who: b, text: line.b, t: REPLY_DELAY };
    this.cool = PLATE_COOLDOWN + (b && line.b ? REPLY_DELAY : 0);
    this.rank = rank;
    return true;
  }

  /**
   * One line from somebody who is not a hero — a boss entering a phase, or going down. It skips the pairing tables
   * (a boss has its own lines, on its own def) but keeps the same discipline: it takes the floor from a lower-ranked
   * exchange, and it holds it for the cooldown so the heroes do not talk over the Chancellor.
   *
   * @param {object} who any entity with x / z / y / h
   * @param {string} text
   * @param {number} [rank] defaults above every hero trigger: when the boss speaks, the boss speaks
   */
  shout(who, text, rank = 9) {
    if (!this.enabled || !who || !text) return false;
    if ((this.cool > 0 || this.pending) && rank <= this.rank) return false;
    this.plates.length = 0;
    this.pending = null;
    this.plate(who, text);
    this.cool = PLATE_COOLDOWN;
    this.rank = rank;
    return true;
  }

  /**
   * Who is on stage: at most two live heroes, in the pairing's CANONICAL order — the order the content was written
   * in, so `row.a` is always spoken before `row.b`.
   *
   * That is why `focus` does not reorder the cast. An exchange is written as a line and an answer, and playing it
   * back the other way round because the hero who happened to hit the combo sits in slot 2 turns the answer into
   * the opening. `focus` says who the moment is ABOUT (it picks the solo line, and offsets which row is chosen);
   * the pairing decides who speaks first.
   *
   * A hero who is `out` is never a speaker — they have left the field. In a two-player run that is what turns
   * `partnerDown` into a solo line, which is the right thing to hear: there is nobody left to answer.
   */
  cast(speakers, focus) {
    const live = (speakers || []).filter((p) => p && p.def && !p.out);
    if (!live.length) return [];
    if (live.length === 1) return [live[0]];
    const pick = focus && live.includes(focus) ? [focus, live.find((p) => p !== focus)] : [live[0], live[1]];
    return pick.sort((p, q) => this.order.indexOf(p.def.id) - this.order.indexOf(q.def.id));
  }

  /**
   * Pick the exchange. `row.a` belongs to whichever hero sorts first in the pairing key, and `cast` has already put
   * the two speakers in that same order, so the two line up without a flip.
   */
  pickBanter(trigger, a, b, frame, want = null) {
    const key = pairKey(a.def.id, b.def.id, this.order);
    const rows = (this.banter[key] || {})[trigger];
    // Two players on the SAME hero is a legal party (game/screens/select.js allows duplicates) and has no pairing
    // table of its own; they fall back to that hero's solo lines rather than to silence.
    if (!rows || !rows.length) return this.pickSolo(trigger, a, frame, want);
    const row = rows[this.index(rows.length, frame, a, want)];
    return row ? { a: row.a, b: row.b } : null;
  }

  /** A hero alone (or a pairing with nothing written for this trigger) mutters to themselves. */
  pickSolo(trigger, a, frame, want = null) {
    const rows = (this.solo[a.def.id] || {})[trigger];
    if (!rows || !rows.length) return null;
    return { a: rows[this.index(rows.length, frame, a, want)], b: '' };
  }

  /**
   * Which row. `world.frame` is hashed and identical on both peers, and the slot offset keeps two heroes who
   * trigger on the same frame off the same index. No rng: see the determinism note at the top of the file.
   *
   * An AUTHORED row (`want`) wins over both and drops the slot offset with them — an opening beat asking for its
   * own board's exchange must get the same one in every seat, or two players in the same room would watch two
   * different conversations. It is wrapped rather than clamped so a table shorter than the boards still answers.
   */
  index(len, frame, who, want = null) {
    if (len <= 1) return 0;
    if (want != null) return (((want | 0) % len) + len) % len;
    return (((frame | 0) + (who && who.index ? who.index * 7 : 0)) % len + len) % len;
  }

  plate(who, text) { if (text) this.plates.push({ who, text: String(text), t: 0, life: PLATE_LIFE }); }

  /** One sim frame. Ages plates, releases a pending reply, runs the cooldown down. */
  update() {
    this.frame++;
    if (this.pending && --this.pending.t <= 0) { this.plate(this.pending.who, this.pending.text); this.pending = null; }
    let n = 0;
    for (const p of this.plates) { if (++p.t < p.life) this.plates[n++] = p; }
    this.plates.length = n;
    if (this.cool > 0) this.cool--;
    if (!this.plates.length && !this.pending && this.cool <= 0) this.rank = -1;
  }

  /**
   * Draw every live plate over its speaker's head. The geometry is the elite name plate's (game/fighter.js): clamp
   * the plate inside the view so a speaker at the screen edge still reads, and offset alternate slots by a row so
   * two heroes standing on each other do not draw one plate on top of the other.
   */
  draw(ctx, cam) {
    for (const p of this.plates) {
      const who = p.who;
      if (!who || who.out || who.removeMe) continue;
      const sx = cam.toScreenX(who.x);
      const top = Math.round(FLOOR_TOP + who.z - (who.y || 0) + (cam.shakeY || 0) - (who.h || 60) - 12);
      // two speakers standing on each other get different rows, decided by slot so it never flickers
      const y = top - (who.index || 0) % 2 * (ROW_H + 2);
      // the last 12 frames fade out, so a plate leaves rather than vanishing mid-sentence
      const a = p.t > p.life - 12 ? (p.life - p.t) / 12 : Math.min(1, p.t / 4);
      drawSpeechPlate(ctx, sx, y, p.text, Math.max(0, a));
    }
  }

  /** What a playtest scenario reads back (StageRunner.summary). */
  summary() {
    return { speaking: this.plates.length + (this.pending ? 1 : 0), lines: this.plates.map((p) => p.text), cool: this.cool };
  }
}
