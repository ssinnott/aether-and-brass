// WebAudio synth: named SFX + pattern-sequenced music (ARCHITECTURE.md section 3).
// In test mode (`audio.testMode = true` before init) no AudioContext is ever created and every call is a no-op.

const S = { ctx: null, master: null, sfxGain: null, musicGain: null, noise: null, unlocked: false, muted: false, volume: 0.8, musicVolume: 0.5 };
let gestureInstalled = false;

const NOTE_NAMES = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
/** Note name ('A4', 'C#3') or midi number -> frequency in Hz. */
export function noteFreq(n) {
  if (typeof n === 'number') return 440 * Math.pow(2, (n - 69) / 12);
  const m = /^([A-G]#?)(-?\d)$/.exec(n);
  if (!m) return 440;
  const midi = 12 * (Number(m[2]) + 1) + NOTE_NAMES[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function ensureContext() {
  if (S.ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  S.ctx = new AC();
  S.master = S.ctx.createGain();
  S.master.gain.value = S.muted ? 0 : S.volume;
  S.master.connect(S.ctx.destination);
  S.sfxGain = S.ctx.createGain(); S.sfxGain.gain.value = 1; S.sfxGain.connect(S.master);
  S.musicGain = S.ctx.createGain(); S.musicGain.gain.value = S.musicVolume; S.musicGain.connect(S.master);
  const len = S.ctx.sampleRate;
  S.noise = S.ctx.createBuffer(1, len, S.ctx.sampleRate);
  const d = S.noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

// ---- synth primitives (all times in seconds relative to `at`) ----
function tone(dest, { type = 'square', f0 = 440, f1 = f0, dur = 0.1, vol = 0.3, attack = 0.005, at = 0, curve = 'exp', detune = 0 }) {
  const ctx = S.ctx, t0 = ctx.currentTime + at;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(Math.max(20, f0), t0);
  if (f1 !== f0) { if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur); else o.frequency.linearRampToValueAtTime(Math.max(20, f1), t0 + dur); }
  if (detune) o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(dest, { dur = 0.1, vol = 0.3, type = 'lowpass', f0 = 2000, f1 = f0, q = 1, at = 0, attack = 0.002 }) {
  const ctx = S.ctx, t0 = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = S.noise; src.loop = true;
  const flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t0); if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(flt); flt.connect(g); g.connect(dest); src.start(t0); src.stop(t0 + dur + 0.02);
}

/** SFX library: name -> (dest, volume, pitch) => void. Extend freely (GDD section 10 list). */
export const SFX = {
  menu_move: (d, v, p) => tone(d, { type: 'square', f0: 700 * p, f1: 1000 * p, dur: 0.05, vol: 0.15 * v }),
  menu_confirm: (d, v, p) => { tone(d, { type: 'square', f0: 600 * p, dur: 0.07, vol: 0.18 * v }); tone(d, { type: 'square', f0: 900 * p, dur: 0.14, vol: 0.18 * v, at: 0.07 }); },
  menu_back: (d, v, p) => { tone(d, { type: 'square', f0: 500 * p, f1: 300 * p, dur: 0.12, vol: 0.15 * v }); },
  hit_light: (d, v, p) => { noise(d, { dur: 0.07, vol: 0.35 * v, f0: 1800 * p, f1: 500 * p }); tone(d, { type: 'triangle', f0: 180 * p, f1: 80 * p, dur: 0.08, vol: 0.3 * v }); },
  hit_heavy: (d, v, p) => { noise(d, { dur: 0.14, vol: 0.5 * v, f0: 1200 * p, f1: 200 * p }); tone(d, { type: 'sine', f0: 120 * p, f1: 40 * p, dur: 0.18, vol: 0.5 * v }); },
  hit_launch: (d, v, p) => { noise(d, { dur: 0.16, vol: 0.4 * v, type: 'bandpass', f0: 800 * p, f1: 2400 * p, q: 2 }); tone(d, { type: 'sawtooth', f0: 200 * p, f1: 600 * p, dur: 0.16, vol: 0.2 * v }); tone(d, { type: 'sine', f0: 100 * p, f1: 45 * p, dur: 0.16, vol: 0.4 * v }); },
  hit_knockdown: (d, v, p) => { noise(d, { dur: 0.22, vol: 0.5 * v, f0: 900 * p, f1: 120 * p }); tone(d, { type: 'sine', f0: 90 * p, f1: 30 * p, dur: 0.28, vol: 0.6 * v }); },
  hit_grab: (d, v, p) => { noise(d, { dur: 0.09, vol: 0.3 * v, f0: 600 * p, f1: 300 * p }); tone(d, { type: 'triangle', f0: 140 * p, f1: 90 * p, dur: 0.1, vol: 0.3 * v }); },
  whiff: (d, v, p) => noise(d, { dur: 0.12, vol: 0.18 * v, type: 'bandpass', f0: 600 * p, f1: 1800 * p, q: 1.5 }),
  jump: (d, v, p) => tone(d, { type: 'square', f0: 280 * p, f1: 620 * p, dur: 0.12, vol: 0.12 * v }),
  land: (d, v, p) => { noise(d, { dur: 0.06, vol: 0.2 * v, f0: 700 * p, f1: 200 * p }); tone(d, { type: 'sine', f0: 110 * p, f1: 60 * p, dur: 0.08, vol: 0.25 * v }); },
  dodge: (d, v, p) => noise(d, { dur: 0.18, vol: 0.2 * v, type: 'bandpass', f0: 2200 * p, f1: 500 * p, q: 1.2 }),
  pickup: (d, v, p) => { [0, 0.06, 0.12].forEach((at, i) => tone(d, { type: 'triangle', f0: [660, 880, 1320][i] * p, dur: 0.1, vol: 0.18 * v, at })); },
  break: (d, v, p) => { noise(d, { dur: 0.2, vol: 0.45 * v, f0: 2500 * p, f1: 300 * p }); tone(d, { type: 'square', f0: 220 * p, f1: 70 * p, dur: 0.14, vol: 0.2 * v }); },
  steam: (d, v, p) => noise(d, { dur: 0.5, vol: 0.25 * v, type: 'highpass', f0: 1500 * p, f1: 3000 * p, attack: 0.05 }),
  clank: (d, v, p) => { tone(d, { type: 'square', f0: 1400 * p, f1: 900 * p, dur: 0.06, vol: 0.15 * v }); tone(d, { type: 'sine', f0: 2600 * p, dur: 0.12, vol: 0.08 * v }); },
  explosion: (d, v, p) => { noise(d, { dur: 0.5, vol: 0.6 * v, f0: 1500 * p, f1: 80 * p }); tone(d, { type: 'sine', f0: 70 * p, f1: 25 * p, dur: 0.5, vol: 0.6 * v }); },
  roar: (d, v, p) => { tone(d, { type: 'sawtooth', f0: 90 * p, f1: 60 * p, dur: 0.6, vol: 0.3 * v, attack: 0.05 }); noise(d, { dur: 0.6, vol: 0.2 * v, type: 'bandpass', f0: 300 * p, f1: 150 * p, q: 3, attack: 0.05 }); },
  special: (d, v, p) => { tone(d, { type: 'sawtooth', f0: 200 * p, f1: 900 * p, dur: 0.25, vol: 0.2 * v }); noise(d, { dur: 0.25, vol: 0.25 * v, type: 'bandpass', f0: 500 * p, f1: 3000 * p, q: 2 }); },
  super: (d, v, p) => { [0, 0.08, 0.16, 0.24].forEach((at, i) => tone(d, { type: 'square', f0: [330, 440, 660, 880][i] * p, dur: 0.2, vol: 0.18 * v, at })); noise(d, { dur: 0.5, vol: 0.3 * v, f0: 3000 * p, f1: 200 * p }); },
  death: (d, v, p) => { tone(d, { type: 'sawtooth', f0: 300 * p, f1: 50 * p, dur: 0.5, vol: 0.25 * v }); noise(d, { dur: 0.3, vol: 0.3 * v, f0: 1000 * p, f1: 100 * p }); },
  victory: (d, v, p) => { [0, 0.12, 0.24, 0.36, 0.6].forEach((at, i) => tone(d, { type: 'square', f0: [523, 659, 784, 1047, 1319][i] * p, dur: i === 4 ? 0.5 : 0.14, vol: 0.18 * v, at })); },
};

// ---- music sequencer ----
// Track format: { bpm, steps, channels: [ { wave, vol, notes: [ 'C3' | null ... ], len (note length in steps), detune } ] }
// Each channel's `notes` array loops independently (its own length), so long/short patterns can interleave.
export const TRACKS = {
  title: {
    bpm: 96, steps: 16,
    channels: [
      { wave: 'triangle', vol: 0.5, len: 1.8, notes: ['A2', null, null, null, 'A2', null, 'C3', null, 'F2', null, null, null, 'G2', null, 'E2', null] },
      { wave: 'square', vol: 0.12, len: 0.6, notes: ['A4', 'C5', 'E5', 'C5', 'A4', 'C5', 'E5', 'G5', 'F4', 'A4', 'C5', 'A4', 'G4', 'B4', 'D5', 'B4', 'E4', 'G4', 'B4', 'G4', 'E4', 'G4', 'B4', 'D5', 'A4', 'C5', 'E5', 'A5', 'G5', 'E5', 'C5', 'B4'] },
      { wave: 'noise', vol: 0.08, len: 0.2, notes: [null, null, 'X', null, null, null, 'X', null, null, null, 'X', null, null, 'X', 'X', null] },
    ],
  },
};
const M = { track: null, name: '', timer: 0, step: 0, nextTime: 0 };
function scheduleStep(t) {
  const tr = M.track;
  const spb = 60 / tr.bpm / 4; // 16th note
  for (const ch of tr.channels) {
    const n = ch.notes[M.step % ch.notes.length];
    if (!n) continue;
    const dur = (ch.len || 1) * spb;
    if (ch.wave === 'noise') noise(S.musicGain, { dur, vol: ch.vol, type: 'highpass', f0: 6000, at: t - S.ctx.currentTime });
    else tone(S.musicGain, { type: ch.wave, f0: noteFreq(n), dur, vol: ch.vol, attack: 0.01, at: t - S.ctx.currentTime, detune: ch.detune || 0 });
  }
  M.step++;
  return spb;
}
function musicTick() {
  if (!M.track || !S.ctx) return;
  while (M.nextTime < S.ctx.currentTime + 0.15) {
    if (M.nextTime < S.ctx.currentTime - 0.5) M.nextTime = S.ctx.currentTime; // catch up after a tab sleep
    M.nextTime += scheduleStep(M.nextTime);
  }
}
function startSequencer() {
  if (!S.ctx || !M.track || M.timer) return;
  M.step = 0; M.nextTime = S.ctx.currentTime + 0.05;
  M.timer = setInterval(musicTick, 40);
}

/** Audio singleton. Set `audio.testMode = true` before init() in autotest mode. */
export const audio = {
  testMode: false,
  SFX, TRACKS,
  /** Install one-time gesture listeners that create/resume the AudioContext. No-op in test mode. */
  init() {
    if (audio.testMode || gestureInstalled) return;
    gestureInstalled = true;
    const unlock = () => { audio.unlock(); };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('touchstart', unlock);
  },
  /** Create/resume the AudioContext (call from a user gesture). */
  unlock() {
    if (audio.testMode) return;
    if (!ensureContext()) return;
    if (S.ctx.state === 'suspended') S.ctx.resume().catch(() => {});
    S.unlocked = true;
    if (M.track) startSequencer();
  },
  /** Play a named SFX. No-op until unlocked / when muted / in test mode. */
  play(name, { volume = 1, pitch = 1 } = {}) {
    if (audio.testMode || !S.unlocked || S.muted || !S.ctx) return;
    const def = SFX[name];
    if (!def) return;
    try { def(S.sfxGain, volume, pitch); } catch { /* audio must never crash the game */ }
  },
  music: {
    /** Current track name or ''. */
    get current() { return M.name; },
    /** Start (or switch to) a looping track. */
    play(trackName) {
      if (M.name === trackName && M.timer) return;
      audio.music.stop();
      M.name = trackName;
      M.track = TRACKS[trackName] || null;
      if (audio.testMode || !M.track) return;
      if (S.unlocked) startSequencer();
    },
    /** Stop the current track. */
    stop() {
      if (M.timer) clearInterval(M.timer);
      M.timer = 0; M.track = null; M.name = '';
    },
    /** Music volume 0..1. */
    setVolume(v) { S.musicVolume = Math.max(0, Math.min(1, v)); if (S.musicGain) S.musicGain.gain.value = S.musicVolume; },
  },
  get muted() { return S.muted; },
  /** Toggle master mute; returns the new muted state. */
  toggleMute() {
    S.muted = !S.muted;
    if (S.master) S.master.gain.value = S.muted ? 0 : S.volume;
    return S.muted;
  },
  /** Master volume 0..1. */
  setVolume(v) { S.volume = Math.max(0, Math.min(1, v)); if (S.master && !S.muted) S.master.gain.value = S.volume; },
  get unlocked() { return S.unlocked; },
  /** True when a track is playing (or would play once unlocked). */
  get musicPlaying() { return !!M.name; },
};
