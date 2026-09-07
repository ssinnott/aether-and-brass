// Synthesized SFX library (GDD section 10). Each entry is `(ctx, dest, when, { vol, pitch }) => endTime`,
// pure with respect to the context so the same code drives the game and the OfflineAudioContext self-test.
// Faction conventions: Sootborn = pitchy/organic (triangle/saw, vibrato, upward squeaks);
// Brassbound = metallic/low (square + ring-mod, bandpassed noise clanks); aether = glassy (detuned sines, tremolo).
import { osc, noise, ring, am, echo, bus, glass } from './synth.js';

const N = (m) => 440 * Math.pow(2, (m - 69) / 12); // midi -> Hz
const C5 = N(72), E5 = N(76), G5 = N(79), C6 = N(84), E6 = N(88), G6 = N(91);

// ---- parameterized generators (shared by several names) ----
/** Generic hit: bandpassed noise crack + short square body (+ optional sine kick). */
function hit(c, d, t, { v, p, noiseDur = 0.04, bp = 1200, sq = 220, sqDur = 0.03, kick = 0, kickDur = 0.08, kvol = 0 }) {
  noise(c, d, t, { dur: noiseDur, vol: 0.5 * v, type: 'bandpass', f0: bp * p, f1: bp * 0.5 * p, q: 1.2, attack: 0.001 });
  if (sq) osc(c, d, t, { type: 'square', f0: sq * p, f1: sq * 0.7 * p, dur: sqDur, vol: 0.28 * v, attack: 0.001 });
  if (kick) osc(c, d, t, { type: 'sine', f0: kick * p, f1: 50 * p, dur: kickDur, vol: (kvol || 0.55) * v, attack: 0.002, hold: kickDur * 0.35 }); // hold so the sweep is still audible when it reaches 50Hz
  return t + Math.max(noiseDur, sqDur, kick ? kickDur : 0);
}
/** Brassbound clank: square carrier ring-modulated by a high sine + a noise tick. */
function clank(c, d, t, { v, p, f = 180, mod = 1300, dur = 0.12, vol = 0.3, tick = 2500 }) {
  ring(c, d, t, { type: 'square', f0: f * p, modF: mod * p, dur, vol: vol * v, attack: 0.002 });
  if (tick) noise(c, d, t, { dur: 0.015, vol: 0.25 * v, type: 'bandpass', f0: tick * p, q: 2, attack: 0.0005 });
  return t + dur;
}
/** Sootborn chirp: triangle glide with vibrato. */
function chirp(c, d, t, { v, p, f0 = 600, f1 = 900, dur = 0.12, vol = 0.22, type = 'triangle', depth = 40 }) {
  return osc(c, d, t, { type, f0: f0 * p, f1: f1 * p, dur, vol: vol * v, attack: 0.008, vib: { rate: 28, depth } });
}
/** Rising noise whoosh. */
function whoosh(c, d, t, { v, p, f0 = 300, f1 = 2500, dur = 0.25, vol = 0.45, q = 1.5 }) {
  return noise(c, d, t, { dur, vol: vol * v, type: 'bandpass', f0: f0 * p, f1: f1 * p, q, attack: dur * 0.5, curve: 'exp' });
}
/** Low boom: sine drop + lowpassed rumble. */
function boom(c, d, t, { v, p, f0 = 60, f1 = 20, dur = 0.4, lp = 300, vol = 0.6, click = true }) {
  osc(c, d, t, { type: 'sine', f0: f0 * p, f1: f1 * p, dur, vol: vol * v, attack: 0.003 });
  noise(c, d, t, { dur, vol: vol * 0.9 * v, type: 'lowpass', f0: lp * 4 * p, f1: lp * 0.5 * p, attack: 0.002 });
  if (click) noise(c, d, t, { dur: 0.02, vol: 0.3 * v, type: 'bandpass', f0: 1500 * p, q: 1, attack: 0.0005 });
  return t + dur;
}
/** Music-box / fanfare arpeggio of midi notes. */
function arp(c, d, t, { v, p, notes, gap = 0.06, dur = 0.14, type = 'sine', vol = 0.2, last = dur }) {
  notes.forEach((m, i) => osc(c, d, t + i * gap, { type, f0: N(m) * p, dur: i === notes.length - 1 ? last : dur, vol: vol * v, attack: 0.004 }));
  return t + (notes.length - 1) * gap + last;
}
/** Steam / hydraulic hiss (highpassed or bandpassed noise with a slow attack). */
function hiss(c, d, t, { v, p, dur = 0.5, f0 = 1500, f1 = 3000, vol = 0.22, type = 'highpass', attack = 0.05, q = 1 }) {
  return noise(c, d, t, { dur, vol: vol * v, type, f0: f0 * p, f1: f1 * p, q, attack, curve: 'exp' });
}
/** Super activation: 8 frames of silence, a 30Hz swell with rising noise, then a crash on the freeze. */
function superCharge(c, d, t, { v, p }) {
  const t0 = t + 8 / 60;
  osc(c, d, t0, { type: 'sine', f0: 30 * p, f1: 45 * p, dur: 0.3, vol: 0.5 * v, attack: 0.25, hold: 0.02 });
  noise(c, d, t0, { dur: 0.3, vol: 0.3 * v, type: 'lowpass', f0: 200 * p, f1: 6000 * p, attack: 0.28, curve: 'exp' });
  const tc = t0 + 0.3;
  noise(c, d, tc, { dur: 0.25, vol: 0.42 * v, type: 'lowpass', f0: 8000 * p, f1: 400 * p, attack: 0.001 });
  osc(c, d, tc, { type: 'sine', f0: 110 * p, f1: 40 * p, dur: 0.2, vol: 0.38 * v, attack: 0.002 });
  return tc + 0.25;
}
/** Per-character super tails. */
const TAILS = {
  boiler: (c, d, t, { v, p }) => { // boiler roar
    osc(c, d, t, { type: 'sawtooth', f0: 70 * p, f1: 48 * p, dur: 0.6, vol: 0.28 * v, attack: 0.04, lp: 400, vib: { rate: 9, depth: 30 } });
    noise(c, d, t, { dur: 0.6, vol: 0.35 * v, type: 'lowpass', f0: 500 * p, f1: 200 * p, attack: 0.05 });
    hiss(c, d, t + 0.05, { v, p, dur: 0.5, f0: 2000, f1: 4000, vol: 0.14 });
    return t + 0.6;
  },
  thunder: (c, d, t, { v, p }) => { // thunderclap
    noise(c, d, t, { dur: 0.03, vol: 0.5 * v, type: 'highpass', f0: 3000 * p, attack: 0.0005 });
    noise(c, d, t + 0.01, { dur: 0.55, vol: 0.5 * v, type: 'lowpass', f0: 5000 * p, f1: 150 * p, attack: 0.004 });
    osc(c, d, t + 0.01, { type: 'sine', f0: 65 * p, f1: 28 * p, dur: 0.5, vol: 0.5 * v, attack: 0.005 });
    return t + 0.56;
  },
  cannons: (c, d, t, { v, p }) => { // cannon booms x3
    [0, 0.16, 0.34].forEach((dt, i) => boom(c, d, t + dt, { v: v * (1 - i * 0.15), p: p * (1 + i * 0.05), f0: 85, f1: 28, dur: 0.32, lp: 250, vol: 0.55 }));
    return t + 0.66;
  },
  swing: (c, d, t, { v, p }) => { // swinging whoosh
    noise(c, d, t, { dur: 0.22, vol: 0.3 * v, type: 'bandpass', f0: 300 * p, f1: 1800 * p, q: 1.5, attack: 0.1 });
    noise(c, d, t + 0.22, { dur: 0.25, vol: 0.3 * v, type: 'bandpass', f0: 1800 * p, f1: 300 * p, q: 1.5, attack: 0.01 });
    osc(c, d, t + 0.4, { type: 'square', f0: 70 * p, f1: 55 * p, dur: 0.12, vol: 0.3 * v, attack: 0.002 });
    return t + 0.52;
  },
};
/** Parry / bell: two clean sines. */
function bell(c, d, t, { v, p, f = [1760, 2640], dur = 0.25, vol = 0.18 }) {
  f.forEach((h, i) => osc(c, d, t, { type: 'sine', f0: h * p, dur, vol: vol * (i ? 0.6 : 1) * v, attack: 0.002 }));
  return t + dur;
}
/** Revolver shot: click + low thump + short bandpassed tail. */
function shot(c, d, t, { v, p }) {
  noise(c, d, t, { dur: 0.02, vol: 0.5 * v, type: 'bandpass', f0: 3500 * p, q: 0.8, attack: 0.0005 });
  osc(c, d, t, { type: 'sine', f0: 80 * p, f1: 45 * p, dur: 0.09, vol: 0.5 * v, attack: 0.002 });
  noise(c, d, t + 0.005, { dur: 0.07, vol: 0.22 * v, type: 'bandpass', f0: 900 * p, f1: 300 * p, q: 1, attack: 0.002 });
  return t + 0.09;
}
/** Grinding Brassbound wreck + core pop. */
function brassDeath(c, d, t, { v, p, grind = 0.4, pop = 0.3, popF = 2400 }) {
  noise(c, d, t, { dur: grind, vol: 0.3 * v, type: 'bandpass', f0: 400 * p, f1: 250 * p, q: 3, attack: 0.01, hold: grind * 0.5 });
  osc(c, d, t, { type: 'square', f0: 90 * p, f1: 55 * p, dur: grind, vol: 0.22 * v, attack: 0.01, hold: grind * 0.5, lp: 900, vib: { rate: 18, depth: 60 } });
  ring(c, d, t, { type: 'square', f0: 90 * p, modF: 700 * p, modF1: 300 * p, dur: grind, vol: 0.12 * v, attack: 0.01 });
  const tp = t + grind;
  noise(c, d, tp, { dur: 0.02, vol: 0.3 * v, type: 'highpass', f0: 4000 * p, attack: 0.0005 });
  osc(c, d, tp, { type: 'sine', f0: popF * p, f1: popF * 0.92 * p, dur: pop, vol: 0.25 * v, attack: 0.002 });
  return tp + pop;
}

// ---- the library ----
export const SFX_DEFS = {
  // UI
  menu_move: (c, d, t, o) => osc(c, d, t, { type: 'square', f0: 700 * o.p, f1: 1000 * o.p, dur: 0.05, vol: 0.12 * o.v, attack: 0.002 }),
  menu_confirm: (c, d, t, o) => { osc(c, d, t, { type: 'square', f0: 600 * o.p, dur: 0.07, vol: 0.14 * o.v }); osc(c, d, t + 0.07, { type: 'square', f0: 900 * o.p, dur: 0.14, vol: 0.14 * o.v }); return bell(c, d, t + 0.07, { v: o.v * 0.5, p: o.p, f: [1800], dur: 0.2 }); },
  menu_back: (c, d, t, o) => osc(c, d, t, { type: 'square', f0: 500 * o.p, f1: 300 * o.p, dur: 0.12, vol: 0.12 * o.v }),
  pause: (c, d, t, o) => { noise(c, d, t, { dur: 0.02, vol: 0.25 * o.v, type: 'bandpass', f0: 2000 * o.p, q: 2, attack: 0.0005 }); osc(c, d, t, { type: 'square', f0: 800 * o.p, dur: 0.06, vol: 0.12 * o.v }); return osc(c, d, t + 0.07, { type: 'square', f0: 500 * o.p, dur: 0.1, vol: 0.12 * o.v }); },
  unpause: (c, d, t, o) => { noise(c, d, t, { dur: 0.02, vol: 0.25 * o.v, type: 'bandpass', f0: 2000 * o.p, q: 2, attack: 0.0005 }); osc(c, d, t, { type: 'square', f0: 500 * o.p, dur: 0.06, vol: 0.12 * o.v }); return osc(c, d, t + 0.07, { type: 'square', f0: 800 * o.p, dur: 0.1, vol: 0.12 * o.v }); },
  join: (c, d, t, o) => arp(c, d, t, { v: o.v, p: o.p, notes: [72, 76, 79, 84], gap: 0.05, dur: 0.16, last: 0.3, type: 'triangle', vol: 0.16 }),
  continue_tick: (c, d, t, o) => { noise(c, d, t, { dur: 0.012, vol: 0.3 * o.v, type: 'bandpass', f0: 3000 * o.p, q: 1.5, attack: 0.0005 }); return osc(c, d, t, { type: 'square', f0: 1000 * o.p, dur: 0.03, vol: 0.14 * o.v, attack: 0.001 }); },
  rank_stamp: (c, d, t, o) => { const e = echo(c, d, { time: 0.06, wet: 0.3 }); osc(c, e, t, { type: 'sine', f0: 110 * o.p, f1: 40 * o.p, dur: 0.16, vol: 0.55 * o.v, attack: 0.002 }); noise(c, e, t, { dur: 0.06, vol: 0.45 * o.v, type: 'bandpass', f0: 800 * o.p, f1: 300 * o.p, q: 1, attack: 0.001 }); return clank(c, e, t, { v: o.v, p: o.p, f: 220, mod: 1300, dur: 0.14, vol: 0.2, tick: 0 }); },
  go_arrow: (c, d, t, o) => { whoosh(c, d, t, { v: o.v * 0.6, p: o.p, dur: 0.25, f0: 400, f1: 4000 }); return arp(c, d, t, { v: o.v, p: o.p, notes: [72, 76, 79, 84], gap: 0.055, dur: 0.1, last: 0.25, type: 'square', vol: 0.12 }); },
  stage_clear: (c, d, t, o) => { // motif fanfare D F A C D with square triads
    const e = echo(c, d, { time: 0.11, wet: 0.25, taps: 2 });
    arp(c, e, t, { v: o.v, p: o.p, notes: [74, 77, 81, 84, 86], gap: 0.11, dur: 0.12, last: 0.5, type: 'square', vol: 0.13 });
    arp(c, e, t, { v: o.v, p: o.p, notes: [62, 65, 69, 72, 74], gap: 0.11, dur: 0.12, last: 0.5, type: 'square', vol: 0.09 });
    [62, 66, 69].forEach((m) => osc(c, e, t + 0.44, { type: 'square', f0: N(m) * o.p, dur: 0.55, vol: 0.06 * o.v, attack: 0.02, lp: 2500 }));
    return t + 1.0;
  },
  game_over: (c, d, t, o) => { // falling sawtooth line over a dark pad
    [72, 69, 65, 62].forEach((m, i) => osc(c, d, t + i * 0.28, { type: 'sawtooth', f0: N(m) * o.p, f1: N(m - 1) * o.p, dur: i === 3 ? 0.7 : 0.3, vol: 0.12 * o.v, attack: 0.02, lp: 1500 }));
    [50, 53, 57].forEach((m) => osc(c, d, t, { type: 'triangle', f0: N(m) * o.p, dur: 1.5, vol: 0.09 * o.v, attack: 0.3, detune: (m % 2 ? 7 : -7) }));
    return t + 1.5;
  },

  // Generic combat
  hit_light: (c, d, t, o) => hit(c, d, t, { v: o.v, p: o.p }),
  hit_medium: (c, d, t, o) => hit(c, d, t, { v: o.v, p: o.p, noiseDur: 0.06, bp: 900, sq: 180, sqDur: 0.05, kick: 100, kickDur: 0.07, kvol: 0.35 }),
  hit_heavy: (c, d, t, o) => hit(c, d, t, { v: o.v, p: o.p, noiseDur: 0.08, bp: 600, sq: 0, kick: 120, kickDur: 0.08 }),
  hit_launch: (c, d, t, o) => { hit(c, d, t, { v: o.v, p: o.p, noiseDur: 0.08, bp: 600, sq: 0, kick: 120 }); return osc(c, d, t, { type: 'sawtooth', f0: 200 * o.p, f1: 800 * o.p, dur: 0.12, vol: 0.18 * o.v, attack: 0.005, lp: 3000 }); },
  hit_knockdown: (c, d, t, o) => { hit(c, d, t, { v: o.v, p: o.p, noiseDur: 0.1, bp: 500, sq: 0, kick: 120 }); noise(c, d, t + 0.02, { dur: 0.2, vol: 0.3 * o.v, type: 'lowpass', f0: 500 * o.p, f1: 120 * o.p, attack: 0.005 }); return osc(c, d, t + 0.02, { type: 'sine', f0: 80 * o.p, f1: 30 * o.p, dur: 0.25, vol: 0.45 * o.v, attack: 0.003 }); },
  hit_grab: (c, d, t, o) => { [0, 0.06].forEach((dt) => osc(c, d, t + dt, { type: 'square', f0: 150 * o.p, dur: 0.04, vol: 0.25 * o.v, attack: 0.001 })); return noise(c, d, t, { dur: 0.09, vol: 0.2 * o.v, type: 'lowpass', f0: 600 * o.p, f1: 300 * o.p });
  },
  throw: (c, d, t, o) => whoosh(c, d, t, { v: o.v, p: o.p }),
  whiff: (c, d, t, o) => noise(c, d, t, { dur: 0.12, vol: 0.3 * o.v, type: 'bandpass', f0: 600 * o.p, f1: 1800 * o.p, q: 1.5, attack: 0.03 }),
  parry: (c, d, t, o) => { noise(c, d, t, { dur: 0.015, vol: 0.3 * o.v, type: 'highpass', f0: 3000 * o.p, attack: 0.0005 }); return bell(c, d, t, { v: o.v, p: o.p }); },
  armor: (c, d, t, o) => { osc(c, d, t, { type: 'sine', f0: 120 * o.p, f1: 60 * o.p, dur: 0.07, vol: 0.3 * o.v, attack: 0.002 }); return clank(c, d, t, { v: o.v, p: o.p, f: 300, mod: 1700, dur: 0.07, vol: 0.25, tick: 3000 }); },
  dodge: (c, d, t, o) => { osc(c, d, t, { type: 'triangle', f0: 500 * o.p, f1: 250 * o.p, dur: 0.12, vol: 0.08 * o.v, attack: 0.01 }); return noise(c, d, t, { dur: 0.18, vol: 0.2 * o.v, type: 'bandpass', f0: 2200 * o.p, f1: 500 * o.p, q: 1.2, attack: 0.01 }); },
  jump: (c, d, t, o) => { noise(c, d, t, { dur: 0.08, vol: 0.1 * o.v, type: 'highpass', f0: 2500 * o.p, attack: 0.01 }); return osc(c, d, t, { type: 'square', f0: 280 * o.p, f1: 620 * o.p, dur: 0.12, vol: 0.1 * o.v, attack: 0.005 }); },
  land: (c, d, t, o) => { noise(c, d, t, { dur: 0.06, vol: 0.2 * o.v, type: 'lowpass', f0: 700 * o.p, f1: 200 * o.p }); return osc(c, d, t, { type: 'sine', f0: 110 * o.p, f1: 60 * o.p, dur: 0.08, vol: 0.25 * o.v, attack: 0.002 }); },
  land_heavy: (c, d, t, o) => { osc(c, d, t, { type: 'sine', f0: 90 * o.p, f1: 35 * o.p, dur: 0.2, vol: 0.5 * o.v, attack: 0.002 }); noise(c, d, t, { dur: 0.12, vol: 0.35 * o.v, type: 'lowpass', f0: 800 * o.p, f1: 150 * o.p }); [0.03, 0.07, 0.12].forEach((dt) => noise(c, d, t + dt, { dur: 0.02, vol: 0.12 * o.v, type: 'bandpass', f0: 1500 * o.p, q: 3, attack: 0.001 })); return t + 0.2; },
  getup: (c, d, t, o) => { noise(c, d, t, { dur: 0.15, vol: 0.14 * o.v, type: 'bandpass', f0: 500 * o.p, f1: 1200 * o.p, q: 1, attack: 0.04 }); return osc(c, d, t + 0.05, { type: 'triangle', f0: 200 * o.p, f1: 320 * o.p, dur: 0.12, vol: 0.1 * o.v, attack: 0.02 }); },
  stagger: (c, d, t, o) => { noise(c, d, t, { dur: 0.1, vol: 0.14 * o.v, type: 'lowpass', f0: 900 * o.p, f1: 200 * o.p }); return osc(c, d, t, { type: 'triangle', f0: 400 * o.p, f1: 240 * o.p, dur: 0.2, vol: 0.14 * o.v, attack: 0.005, vib: { rate: 14, depth: 80 } }); },
  gear_slip: (c, d, t, o) => { // ratchet: descending square clicks + scrape
    [900, 780, 680, 590, 520].forEach((f, i) => osc(c, d, t + i * 0.03, { type: 'square', f0: f * o.p, dur: 0.018, vol: 0.14 * o.v, attack: 0.001 }));
    return noise(c, d, t, { dur: 0.16, vol: 0.14 * o.v, type: 'bandpass', f0: 2500 * o.p, f1: 900 * o.p, q: 2, attack: 0.005 });
  },
  meter_full: (c, d, t, o) => { osc(c, d, t, { type: 'sine', f0: C6 * o.p, f1: E6 * o.p, dur: 0.15, vol: 0.14 * o.v, attack: 0.005 }); return glass(c, d, t + 0.05, { freqs: [1320 * o.p, 1980 * o.p], dur: 0.45, vol: 0.09 * o.v, trem: 6 }); },

  // Factions
  brass_hit: (c, d, t, o) => clank(c, d, t, { v: o.v, p: o.p }),
  brass_tell: (c, d, t, o) => { [0, 0.12, 0.24].forEach((dt) => osc(c, d, t + dt, { type: 'square', f0: 1000 * o.p, dur: 0.03, vol: 0.12 * o.v, attack: 0.001 })); return t + 0.27; },
  brass_death: (c, d, t, o) => brassDeath(c, d, t, { v: o.v, p: o.p }),
  soot_hurt: (c, d, t, o) => chirp(c, d, t, { v: o.v, p: o.p }),
  soot_death: (c, d, t, o) => osc(c, d, t, { type: 'sawtooth', f0: 800 * o.p, f1: 200 * o.p, dur: 0.3, vol: 0.18 * o.v, attack: 0.005, lp: 3500, vib: { rate: 22, depth: 50 } }),
  soot_flee: (c, d, t, o) => { [0, 0.09, 0.18].forEach((dt, i) => chirp(c, d, t + dt, { v: o.v * 0.8, p: o.p * (1 + i * 0.08), f0: 500, f1: 1200, dur: 0.08, vol: 0.16, depth: 60 })); return t + 0.27; },

  // Hero weapons
  hammer_swing: (c, d, t, o) => { osc(c, d, t, { type: 'triangle', f0: 120 * o.p, f1: 90 * o.p, dur: 0.12, vol: 0.12 * o.v, attack: 0.03 }); return noise(c, d, t, { dur: 0.13, vol: 0.45 * o.v, type: 'lowpass', f0: 400 * o.p, f1: 1400 * o.p, attack: 0.06 }); },
  hammer_slam: (c, d, t, o) => { ring(c, d, t, { type: 'square', f0: 220 * o.p, modF: 1100 * o.p, dur: 0.09, vol: 0.3 * o.v, attack: 0.002 }); osc(c, d, t, { type: 'sine', f0: 110 * o.p, f1: 40 * o.p, dur: 0.15, vol: 0.5 * o.v, attack: 0.002 }); return noise(c, d, t, { dur: 0.06, vol: 0.4 * o.v, type: 'bandpass', f0: 700 * o.p, f1: 250 * o.p, attack: 0.001 }); },
  rapier: (c, d, t, o) => am(c, d, t, { type: 'sawtooth', f0: 2000 * o.p, f1: 2300 * o.p, rate: 60, dur: 0.07, vol: 0.2 * o.v, attack: 0.003, lp: 6000 }),
  rapier_arc: (c, d, t, o) => { [0, 0.06, 0.12].forEach((dt, i) => am(c, d, t + dt, { type: 'sawtooth', f0: (1800 + i * 300) * o.p, f1: (2100 + i * 300) * o.p, rate: 60, dur: 0.08, vol: 0.18 * o.v, attack: 0.003, lp: 6000 })); return noise(c, d, t, { dur: 0.2, vol: 0.2 * o.v, type: 'bandpass', f0: 1200 * o.p, f1: 4000 * o.p, q: 1.5, attack: 0.05 }); },
  revolver: (c, d, t, o) => shot(c, d, t, { v: o.v, p: o.p }),
  revolver_fan: (c, d, t, o) => { for (let i = 0; i < 6; i++) shot(c, d, t + i * 0.045, { v: o.v * 0.85, p: o.p * (1 + ((i % 3) - 1) * 0.04) }); return t + 0.33; },
  piston: (c, d, t, o) => { hiss(c, d, t, { v: o.v, p: o.p, dur: 0.1, f0: 3000, f1: 5000, vol: 0.2, attack: 0.01 }); return osc(c, d, t + 0.1, { type: 'square', f0: 70 * o.p, f1: 55 * o.p, dur: 0.09, vol: 0.32 * o.v, attack: 0.002, lp: 500 }); },
  grapple: (c, d, t, o) => { for (let i = 0; i < 6; i++) osc(c, d, t + i * 0.03, { type: 'square', f0: 400 * o.p, dur: 0.02, vol: 0.14 * o.v, attack: 0.001 }); return noise(c, d, t, { dur: 0.2, vol: 0.1 * o.v, type: 'bandpass', f0: 2500 * o.p, q: 4, attack: 0.01 }); },
  claw: (c, d, t, o) => { hiss(c, d, t, { v: o.v, p: o.p, dur: 0.2, f0: 1800, f1: 900, vol: 0.22, type: 'bandpass', attack: 0.02, q: 1 }); return clank(c, d, t + 0.17, { v: o.v, p: o.p, f: 250, mod: 1500, dur: 0.05, vol: 0.22, tick: 3500 }); },
  steam_vent: (c, d, t, o) => hiss(c, d, t, { v: o.v, p: o.p, dur: 0.5, f0: 1500, f1: 3000, vol: 0.22 }),

  // Specials / supers
  special_brunhild: (c, d, t, o) => TAILS.boiler(c, d, t, { v: o.v, p: o.p }),
  special_sael: (c, d, t, o) => TAILS.thunder(c, d, t, { v: o.v, p: o.p }),
  special_rook: (c, d, t, o) => { boom(c, d, t, { v: o.v, p: o.p, f0: 90, f1: 30, dur: 0.3, lp: 250, vol: 0.55 }); return boom(c, d, t + 0.18, { v: o.v * 0.9, p: o.p * 1.06, f0: 90, f1: 30, dur: 0.3, lp: 250, vol: 0.55 }); },
  special_pip: (c, d, t, o) => TAILS.swing(c, d, t, { v: o.v, p: o.p }),
  super_charge: (c, d, t, o) => superCharge(c, d, t, { v: o.v, p: o.p }),
  super_brunhild: (c, d, t, o) => TAILS.boiler(c, d, superCharge(c, d, t, { v: o.v, p: o.p }) - 0.1, { v: o.v * 0.8, p: o.p }),
  super_sael: (c, d, t, o) => TAILS.thunder(c, d, superCharge(c, d, t, { v: o.v, p: o.p }) - 0.1, { v: o.v * 0.8, p: o.p }),
  super_rook: (c, d, t, o) => TAILS.cannons(c, d, superCharge(c, d, t, { v: o.v, p: o.p }) - 0.1, { v: o.v * 0.8, p: o.p }),
  super_pip: (c, d, t, o) => TAILS.swing(c, d, superCharge(c, d, t, { v: o.v, p: o.p }) - 0.1, { v: o.v * 0.8, p: o.p }),

  // World
  prop_break: (c, d, t, o) => { [0, 0.05, 0.11].forEach((dt, i) => noise(c, d, t + dt, { dur: 0.06, vol: 0.4 * o.v * (1 - i * 0.2), type: 'bandpass', f0: (800 - i * 150) * o.p, f1: (400 - i * 60) * o.p, q: 1, attack: 0.001 })); return osc(c, d, t, { type: 'square', f0: 150 * o.p, f1: 80 * o.p, dur: 0.1, vol: 0.18 * o.v, attack: 0.002, lp: 700 }); },
  explosion: (c, d, t, o) => boom(c, d, t, { v: o.v, p: o.p }),
  explosion_big: (c, d, t, o) => { const e = echo(c, d, { time: 0.09, wet: 0.35, lowpass: 1500 }); boom(c, e, t, { v: o.v, p: o.p * 0.8, f0: 55, f1: 18, dur: 0.9, lp: 250, vol: 0.6 }); noise(c, e, t + 0.05, { dur: 0.6, vol: 0.2 * o.v, type: 'bandpass', f0: 3000 * o.p, f1: 800 * o.p, q: 0.8, attack: 0.02 }); return boom(c, e, t + 0.25, { v: o.v * 0.6, p: o.p * 0.9, f0: 50, f1: 20, dur: 0.6, lp: 200, vol: 0.5, click: false }); },
  fire: (c, d, t, o) => { noise(c, d, t, { dur: 0.5, vol: 0.3 * o.v, type: 'lowpass', f0: 350 * o.p, attack: 0.05, hold: 0.25 }); for (let i = 0; i < 9; i++) noise(c, d, t + 0.02 + i * 0.053, { dur: 0.035, vol: (0.28 + (i % 3) * 0.1) * o.v, type: 'bandpass', f0: (700 + (i * 137) % 500) * o.p, q: 1.5, attack: 0.002 }); return t + 0.5; },
  burn: (c, d, t, o) => { hiss(c, d, t, { v: o.v, p: o.p, dur: 0.25, f0: 4000, f1: 6000, vol: 0.14, attack: 0.01 }); return chirp(c, d, t, { v: o.v, p: o.p, f0: 500, f1: 340, dur: 0.25, vol: 0.14, depth: 60 }); },
  steam: (c, d, t, o) => hiss(c, d, t, { v: o.v, p: o.p, dur: 0.5, f0: 1500, f1: 3000, vol: 0.22 }),
  vent_tell: (c, d, t, o) => { hiss(c, d, t, { v: o.v, p: o.p, dur: 0.4, f0: 600, f1: 2500, vol: 0.12, attack: 0.3 }); return glass(c, d, t, { freqs: [880 * o.p, 1320 * o.p], dur: 0.4, vol: 0.1 * o.v, trem: 5, attack: 0.05 }); },
  piston_crush: (c, d, t, o) => { osc(c, d, t, { type: 'sine', f0: 100 * o.p, f1: 30 * o.p, dur: 0.2, vol: 0.5 * o.v, attack: 0.002 }); noise(c, d, t, { dur: 0.15, vol: 0.4 * o.v, type: 'lowpass', f0: 1200 * o.p, f1: 200 * o.p, attack: 0.001 }); return ring(c, d, t, { type: 'square', f0: 90 * o.p, modF: 600 * o.p, dur: 0.3, vol: 0.2 * o.v, attack: 0.002, lp: 1800 }); },
  crate_drop: (c, d, t, o) => { osc(c, d, t, { type: 'triangle', f0: 140 * o.p, f1: 70 * o.p, dur: 0.12, vol: 0.35 * o.v, attack: 0.002 }); noise(c, d, t, { dur: 0.08, vol: 0.3 * o.v, type: 'lowpass', f0: 800 * o.p, f1: 200 * o.p, attack: 0.001 }); [0.04, 0.09].forEach((dt) => noise(c, d, t + dt, { dur: 0.03, vol: 0.12 * o.v, type: 'bandpass', f0: 1200 * o.p, q: 2, attack: 0.001 })); return t + 0.14; },
  bomb_fuse: (c, d, t, o) => { am(c, d, t, { type: 'sawtooth', f0: 2200 * o.p, rate: 25, depth: 0.8, dur: 0.5, vol: 0.05 * o.v, attack: 0.02, lp: 4000 }); noise(c, d, t, { dur: 0.5, vol: 0.14 * o.v, type: 'highpass', f0: 5000 * o.p, attack: 0.02, hold: 0.3 }); for (let i = 0; i < 6; i++) osc(c, d, t + 0.03 + i * 0.08, { type: 'square', f0: (2000 + (i * 331) % 900) * o.p, dur: 0.012, vol: 0.06 * o.v, attack: 0.001 }); return t + 0.5; },
  bomb_bat: (c, d, t, o) => { hit(c, d, t, { v: o.v, p: o.p, noiseDur: 0.06, bp: 900, sq: 180, sqDur: 0.05 }); osc(c, d, t, { type: 'square', f0: 300 * o.p, f1: 600 * o.p, dur: 0.12, vol: 0.12 * o.v, attack: 0.005 }); return whoosh(c, d, t + 0.02, { v: o.v * 0.6, p: o.p, dur: 0.2 }); },
  net: (c, d, t, o) => { whoosh(c, d, t, { v: o.v * 0.6, p: o.p, dur: 0.12, f0: 600, f1: 2000 }); osc(c, d, t + 0.08, { type: 'square', f0: 700 * o.p, f1: 200 * o.p, dur: 0.06, vol: 0.12 * o.v, attack: 0.002 }); return noise(c, d, t + 0.08, { dur: 0.1, vol: 0.2 * o.v, type: 'bandpass', f0: 1200 * o.p, f1: 500 * o.p, q: 1.2, attack: 0.002 }); },
  whip: (c, d, t, o) => { noise(c, d, t, { dur: 0.015, vol: 0.5 * o.v, type: 'highpass', f0: 3000 * o.p, attack: 0.0005 }); return noise(c, d, t + 0.005, { dur: 0.08, vol: 0.3 * o.v, type: 'bandpass', f0: 3000 * o.p, f1: 600 * o.p, q: 1.5, attack: 0.001 }); },
  sling: (c, d, t, o) => { am(c, d, t, { type: 'triangle', f0: 300 * o.p, f1: 180 * o.p, rate: 40, rate1: 15, dur: 0.15, vol: 0.2 * o.v, attack: 0.003 }); return whoosh(c, d, t + 0.05, { v: o.v * 0.5, p: o.p, dur: 0.15, f0: 400, f1: 2000 }); },
  bolt: (c, d, t, o) => { osc(c, d, t, { type: 'square', f0: 900 * o.p, dur: 0.012, vol: 0.2 * o.v, attack: 0.001 }); return noise(c, d, t, { dur: 0.12, vol: 0.22 * o.v, type: 'bandpass', f0: 2500 * o.p, f1: 800 * o.p, q: 2, attack: 0.002 }); },
  chime: (c, d, t, o) => { [1320, 1980, 2640].forEach((f, i) => osc(c, d, t + i * 0.01, { type: 'sine', f0: f * o.p, dur: 0.6 - i * 0.1, vol: (0.14 - i * 0.03) * o.v, attack: 0.003, detune: 7 * i })); return t + 0.6; },
  hydraulic: (c, d, t, o) => { osc(c, d, t, { type: 'square', f0: 60 * o.p, dur: 0.2, vol: 0.12 * o.v, attack: 0.02, lp: 300 }); return hiss(c, d, t, { v: o.v, p: o.p, dur: 0.2, f0: 1500, f1: 700, vol: 0.22, type: 'bandpass', attack: 0.01 }); },
  saw_whine: (c, d, t, o) => { // Regent Engine saw sweep tell (GDD): saw 60 -> 240Hz over 36f with a 50Hz AM buzz + rising blade whine
    am(c, d, t, { type: 'sawtooth', f0: 60 * o.p, f1: 240 * o.p, glide: 0.6, curve: 'lin', rate: 50, depth: 0.6, dur: 0.66, vol: 0.2 * o.v, attack: 0.05, hold: 0.5, lp: 1800 });
    osc(c, d, t, { type: 'square', f0: 60 * o.p, f1: 240 * o.p, glide: 0.6, curve: 'lin', dur: 0.66, vol: 0.08 * o.v, attack: 0.05, hold: 0.5, lp: 900 });
    return noise(c, d, t + 0.1, { dur: 0.55, vol: 0.12 * o.v, type: 'bandpass', f0: 1500 * o.p, f1: 4500 * o.p, q: 4, attack: 0.3, hold: 0.15 });
  },
  time_stop_tick: (c, d, t, o) => { // 1kHz tick slowing 8Hz -> 2Hz
    let dt = 0, iv = 1 / 8, end = t;
    for (let i = 0; i < 7; i++) {
      osc(c, d, t + dt, { type: 'square', f0: (1000 - i * 40) * o.p, dur: 0.02, vol: 0.14 * o.v, attack: 0.001 });
      noise(c, d, t + dt, { dur: 0.01, vol: 0.2 * o.v, type: 'bandpass', f0: 2500 * o.p, q: 3, attack: 0.0005 });
      end = t + dt + 0.02; dt += iv; iv = Math.min(0.5, iv * 1.26);
    }
    glass(c, d, t, { freqs: [1760 * o.p, 2637 * o.p], dur: end - t, vol: 0.04 * o.v, trem: 3, attack: 0.3 });
    return end;
  },
  aether_step: (c, d, t, o) => { noise(c, d, t, { dur: 0.03, vol: 0.12 * o.v, type: 'highpass', f0: 6000 * o.p, attack: 0.001 }); return glass(c, d, t, { freqs: [1760 * o.p], detune: 9, dur: 0.09, vol: 0.12 * o.v, trem: 8, attack: 0.002 }); },
  valve_blow: (c, d, t, o) => { noise(c, d, t, { dur: 0.04, vol: 0.5 * o.v, type: 'highpass', f0: 2000 * o.p, attack: 0.001 }); noise(c, d, t + 0.02, { dur: 0.4, vol: 0.3 * o.v, type: 'lowpass', f0: 4000 * o.p, f1: 800 * o.p, attack: 0.01 }); return ring(c, d, t, { type: 'sine', f0: 400 * o.p, modF: 2100 * o.p, dur: 0.25, vol: 0.12 * o.v, attack: 0.001 }); },
  hook_yank: (c, d, t, o) => { for (let i = 0; i < 6; i++) noise(c, d, t + i * 0.015, { dur: 0.012, vol: 0.2 * o.v, type: 'bandpass', f0: (2500 + (i % 2) * 800) * o.p, q: 4, attack: 0.001 }); osc(c, d, t + 0.05, { type: 'square', f0: 200 * o.p, f1: 120 * o.p, dur: 0.12, vol: 0.14 * o.v, attack: 0.01, lp: 1200 }); return osc(c, d, t + 0.14, { type: 'sine', f0: 100 * o.p, f1: 50 * o.p, dur: 0.08, vol: 0.3 * o.v, attack: 0.002 }); },
  cannon: (c, d, t, o) => { const e = echo(c, d, { time: 0.08, wet: 0.3, lowpass: 1200 }); return boom(c, e, t, { v: o.v, p: o.p, f0: 80, f1: 25, dur: 0.35, lp: 200, vol: 0.6 }); },

  // Stormcrows (docs/STAGE2.md 2): people in masks on a windy deck. Voices come through the beak filtered and nasal
  // (bandpassed square + triangle); their machinery is STATIC — crackle and a bright discharge, never a brass clank.
  crow_hurt: (c, d, t, o) => { osc(c, d, t, { type: 'square', f0: 420 * o.p, f1: 300 * o.p, dur: 0.11, vol: 0.13 * o.v, attack: 0.004, lp: 1600, vib: { rate: 18, depth: 25 } }); return noise(c, d, t, { dur: 0.09, vol: 0.18 * o.v, type: 'bandpass', f0: 1400 * o.p, f1: 700 * o.p, q: 2.5, attack: 0.003 }); },
  crow_death: (c, d, t, o) => { osc(c, d, t, { type: 'triangle', f0: 380 * o.p, f1: 130 * o.p, dur: 0.4, vol: 0.16 * o.v, attack: 0.006, lp: 2000, vib: { rate: 12, depth: 40 } }); noise(c, d, t + 0.1, { dur: 0.35, vol: 0.16 * o.v, type: 'bandpass', f0: 900 * o.p, f1: 300 * o.p, q: 1.6, attack: 0.02 }); return whoosh(c, d, t + 0.2, { v: o.v * 0.5, p: o.p, dur: 0.3, f0: 1800, f1: 400 }); },
  crow_call: (c, d, t, o) => { [0, 0.08].forEach((dt, i) => osc(c, d, t + dt, { type: 'square', f0: (740 + i * 180) * o.p, f1: (620 + i * 180) * o.p, dur: 0.07, vol: 0.12 * o.v, attack: 0.003, lp: 2400 })); return noise(c, d, t + 0.02, { dur: 0.14, vol: 0.12 * o.v, type: 'bandpass', f0: 2200 * o.p, q: 3, attack: 0.01 }); },
  harpoon: (c, d, t, o) => { noise(c, d, t, { dur: 0.03, vol: 0.4 * o.v, type: 'bandpass', f0: 1800 * o.p, q: 1.5, attack: 0.001 }); osc(c, d, t, { type: 'square', f0: 260 * o.p, f1: 150 * o.p, dur: 0.07, vol: 0.2 * o.v, attack: 0.001, lp: 1400 }); return whoosh(c, d, t + 0.02, { v: o.v * 0.6, p: o.p, dur: 0.22, f0: 500, f1: 2600 }); },
  gale: (c, d, t, o) => { noise(c, d, t, { dur: 0.45, vol: 0.3 * o.v, type: 'bandpass', f0: 400 * o.p, f1: 2200 * o.p, q: 0.9, attack: 0.14, curve: 'exp' }); return osc(c, d, t, { type: 'triangle', f0: 150 * o.p, f1: 90 * o.p, dur: 0.4, vol: 0.1 * o.v, attack: 0.1, lp: 900 }); },
  coil_charge: (c, d, t, o) => { am(c, d, t, { type: 'sawtooth', f0: 180 * o.p, f1: 900 * o.p, glide: 0.55, curve: 'lin', rate: 34, depth: 0.7, dur: 0.6, vol: 0.15 * o.v, attack: 0.06, hold: 0.42, lp: 2600 }); for (let i = 0; i < 8; i++) noise(c, d, t + 0.05 + i * 0.062, { dur: 0.012, vol: (0.06 + i * 0.014) * o.v, type: 'bandpass', f0: (3000 + (i * 271) % 1800) * o.p, q: 4, attack: 0.001 }); return t + 0.62; },
  thunder_strike: (c, d, t, o) => { const e = echo(c, d, { time: 0.11, wet: 0.32, lowpass: 2400 }); noise(c, e, t, { dur: 0.05, vol: 0.55 * o.v, type: 'highpass', f0: 3000 * o.p, attack: 0.001 }); noise(c, e, t, { dur: 0.5, vol: 0.3 * o.v, type: 'bandpass', f0: 2600 * o.p, f1: 500 * o.p, q: 1.1, attack: 0.004 }); osc(c, e, t, { type: 'square', f0: 900 * o.p, f1: 120 * o.p, dur: 0.16, vol: 0.16 * o.v, attack: 0.001, lp: 3000 }); return boom(c, e, t + 0.04, { v: o.v * 0.9, p: o.p, f0: 70, f1: 24, dur: 0.45, lp: 260, vol: 0.5, click: false }); },

  // Pickups (clean sines)
  pickup_food: (c, d, t, o) => osc(c, d, t, { type: 'sine', f0: C5 * o.p, f1: E5 * o.p, glide: 0.08, dur: 0.22, vol: 0.2 * o.v, attack: 0.005, hold: 0.06 }),
  pickup_score: (c, d, t, o) => { [C6, E6, G6].forEach((f, i) => osc(c, d, t + i * 0.05, { type: 'sine', f0: f * o.p, dur: 0.16, vol: 0.16 * o.v, attack: 0.003, detune: i * 4 })); return t + 0.26; },
  pickup_meter: (c, d, t, o) => { osc(c, d, t, { type: 'sawtooth', f0: 200 * o.p, f1: 800 * o.p, dur: 0.2, vol: 0.1 * o.v, attack: 0.01, lp: 2200 }); return glass(c, d, t + 0.12, { freqs: [1320 * o.p, 1980 * o.p], dur: 0.3, vol: 0.07 * o.v, trem: 6 }); },
  pickup_life: (c, d, t, o) => arp(c, d, t, { v: o.v, p: o.p, notes: [72, 76, 79, 84, 88], gap: 0.06, dur: 0.15, last: 0.35, type: 'sine', vol: 0.16 }),

  // Bosses
  boss_intro: (c, d, t, o) => { const e = echo(c, d, { time: 0.12, wet: 0.35, lowpass: 2000 }); [55, 82.5].forEach((f) => osc(c, e, t, { type: 'sawtooth', f0: f * o.p, dur: 0.9, vol: 0.14 * o.v, attack: 0.4, hold: 0.2, lp: 500 })); noise(c, e, t, { dur: 0.9, vol: 0.2 * o.v, type: 'lowpass', f0: 250 * o.p, attack: 0.3, hold: 0.2 }); ring(c, e, t + 0.5, { type: 'sine', f0: 130 * o.p, modF: 220 * o.p, dur: 1.0, vol: 0.3 * o.v, attack: 0.005 }); noise(c, e, t + 0.5, { dur: 0.05, vol: 0.3 * o.v, type: 'bandpass', f0: 1500 * o.p, attack: 0.001 }); return t + 1.5; },
  boss_phase: (c, d, t, o) => { [440, 660, 440, 660].forEach((f, i) => osc(c, d, t + i * 0.09, { type: 'square', f0: f * o.p, dur: 0.08, vol: 0.12 * o.v, attack: 0.002 })); noise(c, d, t, { dur: 0.6, vol: 0.2 * o.v, type: 'lowpass', f0: 200 * o.p, f1: 600 * o.p, attack: 0.2 }); return glass(c, d, t + 0.3, { freqs: [1320 * o.p, 1980 * o.p, 2640 * o.p], dur: 0.45, vol: 0.06 * o.v, trem: 7, attack: 0.05 }); },
  boss_defeat: (c, d, t, o) => { const e = echo(c, d, { time: 0.1, wet: 0.3, lowpass: 2000 }); brassDeath(c, e, t, { v: o.v, p: o.p * 0.8, grind: 0.7, pop: 0.4, popF: 2400 }); brassDeath(c, e, t + 0.35, { v: o.v * 0.7, p: o.p * 0.6, grind: 0.5, pop: 0.4, popF: 1800 }); boom(c, e, t + 0.9, { v: o.v, p: o.p, f0: 60, f1: 20, dur: 0.6, lp: 300, vol: 0.55 }); osc(c, e, t + 1.3, { type: 'sine', f0: 1200 * o.p, f1: 1100 * o.p, dur: 0.5, vol: 0.15 * o.v, attack: 0.002 }); return t + 1.8; },
  roar: (c, d, t, o) => { osc(c, d, t, { type: 'sawtooth', f0: 90 * o.p, f1: 60 * o.p, dur: 0.6, vol: 0.28 * o.v, attack: 0.05, lp: 700, vib: { rate: 7, depth: 40 } }); return noise(c, d, t, { dur: 0.6, vol: 0.22 * o.v, type: 'bandpass', f0: 300 * o.p, f1: 150 * o.p, q: 3, attack: 0.05 }); },
};

// Legacy names from the first audio.js, kept so nothing that already calls them goes silent.
SFX_DEFS.pickup = SFX_DEFS.pickup_score;
SFX_DEFS.break = SFX_DEFS.prop_break;
SFX_DEFS.clank = SFX_DEFS.armor;
SFX_DEFS.special = SFX_DEFS.special_brunhild;
SFX_DEFS.super = SFX_DEFS.super_charge;
SFX_DEFS.death = SFX_DEFS.soot_death;
SFX_DEFS.victory = SFX_DEFS.stage_clear;

/** Canonical names (RECONCILIATION.md), in that order; used by the self-test. */
export const CANONICAL_SFX = [
  'menu_move', 'menu_confirm', 'menu_back', 'pause', 'unpause', 'join', 'continue_tick', 'rank_stamp', 'go_arrow', 'stage_clear', 'game_over',
  'hit_light', 'hit_medium', 'hit_heavy', 'hit_launch', 'hit_knockdown', 'hit_grab', 'throw', 'whiff', 'parry', 'armor', 'dodge', 'jump', 'land', 'land_heavy', 'getup', 'stagger', 'gear_slip', 'meter_full',
  'brass_hit', 'brass_tell', 'brass_death', 'soot_hurt', 'soot_death', 'soot_flee',
  'hammer_swing', 'hammer_slam', 'rapier', 'rapier_arc', 'revolver', 'revolver_fan', 'piston', 'grapple', 'claw', 'steam_vent',
  'special_brunhild', 'special_sael', 'special_rook', 'special_pip', 'super_charge', 'super_brunhild', 'super_sael', 'super_rook', 'super_pip',
  'prop_break', 'explosion', 'explosion_big', 'fire', 'burn', 'steam', 'vent_tell', 'piston_crush', 'crate_drop', 'bomb_fuse', 'bomb_bat', 'net', 'whip', 'sling', 'bolt', 'chime', 'hydraulic', 'saw_whine', 'time_stop_tick', 'aether_step', 'valve_blow', 'hook_yank', 'cannon',
  'crow_hurt', 'crow_death', 'crow_call', 'harpoon', 'gale', 'coil_charge', 'thunder_strike',
  'pickup_food', 'pickup_score', 'pickup_meter', 'pickup_life',
  'boss_intro', 'boss_phase', 'boss_defeat', 'roar',
];

/** Names that get +/-4% random pitch per play so mashing doesn't sound robotic. */
export const JITTERED = new Set([
  'hit_light', 'hit_medium', 'hit_heavy', 'hit_launch', 'hit_knockdown', 'hit_grab', 'whiff', 'brass_hit', 'soot_hurt', 'soot_death', 'soot_flee',
  'hammer_swing', 'hammer_slam', 'rapier', 'rapier_arc', 'revolver', 'piston', 'claw', 'armor', 'land', 'land_heavy', 'prop_break', 'crate_drop', 'bomb_bat', 'whip', 'bolt', 'sling', 'net', 'stagger', 'throw', 'jump', 'dodge', 'aether_step', 'explosion',
  'crow_hurt', 'crow_death', 'crow_call', 'harpoon', 'thunder_strike',
]);
