// WebAudio synth facade: named SFX + pattern-sequenced music (ARCHITECTURE.md section 3, GDD section 10).
// In test mode (`audio.testMode = true` before init) no AudioContext is ever created and every call is a no-op.
// All synthesis lives in ./audio/*.js as pure `(ctx, dest, when, opts)` functions so the same code renders
// in-game and inside `audio.selfTest()` (OfflineAudioContext, no user gesture, no init() required).
import { SFX_DEFS, CANONICAL_SFX, JITTERED } from './audio/sfx.js';
import { TRACKS, CANONICAL_TRACKS, compileTrack, stepTime, scheduleSteps, renderTrack } from './audio/music.js';

const LOOKAHEAD = 0.2;      // seconds of music scheduled ahead of ctx.currentTime (rides out ~200ms main-thread stalls)
const TICK_MS = 25;         // scheduler timer period
const XFADE = 0.5;          // music crossfade seconds
const JITTER = 0.04;        // +/- pitch variation on hit-type SFX
const DUCK_WINDOW = 0.08;   // simultaneous-SFX window for volume ducking

const S = { ctx: null, master: null, comp: null, sfxGain: null, musicGain: null, unlocked: false, muted: false, volume: 0.8, musicVolume: 0.5, sfxVolume: 1, recent: [] };
const M = { name: '', voices: [], timer: 0, intensity: 0, transpose: 0 };
let gestureInstalled = false;
const warned = new Set();

const NOTE_NAMES = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
/** Note name ('A4', 'C#3') or midi number -> frequency in Hz. */
export function noteFreq(n) {
  if (typeof n === 'number') return 440 * Math.pow(2, (n - 69) / 12);
  const m = /^([A-G]#?)(-?\d)$/.exec(n);
  if (!m) return 440;
  const midi = 12 * (Number(m[2]) + 1) + NOTE_NAMES[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function debugOn() { try { return !!(window.__game && window.__game.debug); } catch { return false; } }
function warnOnce(msg) { if (warned.has(msg)) return; warned.add(msg); if (debugOn()) console.warn('[audio] ' + msg); }

function ensureContext() {
  if (S.ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  const ctx = S.ctx = new AC();
  // master -> compressor/limiter -> destination: ten simultaneous hits duck instead of clipping
  S.comp = ctx.createDynamicsCompressor();
  S.comp.threshold.value = -14; S.comp.knee.value = 6; S.comp.ratio.value = 10; S.comp.attack.value = 0.002; S.comp.release.value = 0.12;
  S.comp.connect(ctx.destination);
  S.master = ctx.createGain(); S.master.gain.value = S.muted ? 0 : S.volume; S.master.connect(S.comp);
  S.sfxGain = ctx.createGain(); S.sfxGain.gain.value = S.sfxVolume; S.sfxGain.connect(S.master);
  S.musicGain = ctx.createGain(); S.musicGain.gain.value = S.musicVolume; S.musicGain.connect(S.master);
  return true;
}

// ---- realtime music: look-ahead scheduler over ./audio/music.js ----
// Equal-power crossfade (sin/cos, sampled at 4 knots) so the sum stays at unity mid-fade instead of dipping.
const XF_IN = [0, 0.383, 0.707, 0.924, 1];        // sin(pi/2 * x)
const XF_OUT = [1, 0.924, 0.707, 0.383, 0];       // cos(pi/2 * x): in^2 + out^2 = 1 at every knot
/** Ramp `param` from its current value along `shape` (normalized 0..1 knots, scaled to `to`) over XFADE seconds. */
function fadeParam(param, now, shape, scale) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  const n = shape.length - 1;
  for (let i = 1; i <= n; i++) param.linearRampToValueAtTime(shape[i] * scale, now + (XFADE * i) / n);
}
/** Start fading a voice out; it is torn down by musicTick once the fade has finished. */
function fadeOutVoice(v, now) {
  if (v.stopAt) return;
  const cur = Math.max(0, v.gain.gain.value);
  fadeParam(v.gain.gain, now, XF_OUT, cur);
  v.stopAt = now + XFADE + 0.05;
}
function makeVoice(name, fadeIn) {
  const ctx = S.ctx, now = ctx.currentTime;
  const gain = ctx.createGain(); gain.connect(S.musicGain);
  const combat = ctx.createGain(); combat.gain.value = M.intensity; combat.connect(gain);
  if (fadeIn) { gain.gain.value = 0; fadeParam(gain.gain, now, XF_IN, 1); }
  else gain.gain.setValueAtTime(1, now);
  return { name, track: TRACKS[name], start: now + 0.06, next: 0, gain, combat, stopAt: 0 };
}
function musicTick() {
  if (!S.ctx) return;
  const now = S.ctx.currentTime, horizon = now + LOOKAHEAD;
  for (let i = M.voices.length - 1; i >= 0; i--) {
    const v = M.voices[i];
    if (v.stopAt && now > v.stopAt) { try { v.combat.disconnect(); v.gain.disconnect(); } catch { /* already gone */ } M.voices.splice(i, 1); continue; }
    const c = compileTrack(v.track);
    // catch up after a tab sleep: skip to the first step that is not in the past
    if (stepTime(v.track, v.start, v.next) < now - 0.3) v.next = Math.max(v.next, Math.ceil((now - v.start) / c.stepDur));
    let guard = 64;
    while (guard-- > 0 && stepTime(v.track, v.start, v.next) < horizon && (!v.stopAt || stepTime(v.track, v.start, v.next) < v.stopAt)) {
      scheduleSteps(S.ctx, v.gain, v.track, v.start, v.next, v.next + 1, { combatDest: v.combat, transpose: M.transpose });
      v.next++;
    }
  }
  if (!M.voices.length && M.timer) { clearInterval(M.timer); M.timer = 0; }
}
function startVoice(name) {
  const now = S.ctx.currentTime;
  let fading = false;
  for (const v of M.voices) { if (!v.stopAt) { fading = true; fadeOutVoice(v, now); } }
  M.voices.push(makeVoice(name, fading));
  if (!M.timer) M.timer = setInterval(musicTick, TICK_MS);
  musicTick();
}
function activeVoice() { return M.voices.find((v) => !v.stopAt) || null; }

// ---- offline analysis (self-test) ----
function analyse(buf) {
  const d = buf.getChannelData(0);
  let sum = 0, peak = 0, last = -1;
  for (let i = 0; i < d.length; i++) {
    const x = d[i], a = Math.abs(x);
    sum += x * x; if (a > peak) peak = a; if (a > 0.001) last = i;
  }
  return { rms: Math.sqrt(sum / d.length), peak, durationMs: last < 0 ? 0 : Math.round((last / buf.sampleRate) * 1000) };
}
async function renderOffline(seconds, fill) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const sr = 44100;
  const ctx = new OAC(1, Math.ceil(sr * seconds), sr);
  fill(ctx, ctx.destination);
  return ctx.startRendering();
}

/** Audio singleton. Set `audio.testMode = true` before init() in autotest mode. */
export const audio = {
  testMode: false,
  SFX: SFX_DEFS, TRACKS, CANONICAL_SFX, CANONICAL_TRACKS,
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
    if (S.ctx.state !== 'running') S.ctx.resume().catch(() => {}); // 'suspended' (autoplay policy) or iOS 'interrupted' (a call, a route change)
    S.unlocked = true;
    if (M.name && !activeVoice() && TRACKS[M.name]) startVoice(M.name);
  },
  /**
   * Play a named SFX. No-op until unlocked / when muted / in test mode / for unknown names.
   * opts: volume, pitch (multiplier), delay (seconds). Hit-type sounds get +/-4% random pitch.
   */
  play(name, { volume = 1, pitch = 1, delay = 0 } = {}) {
    if (audio.testMode || !S.unlocked || S.muted || !S.ctx) return;
    const def = SFX_DEFS[name];
    if (!def) { warnOnce(`unknown sfx '${name}'`); return; }
    const now = S.ctx.currentTime;
    S.recent = S.recent.filter((t) => t > now - DUCK_WINDOW); S.recent.push(now);
    const n = S.recent.length;
    const duck = n <= 2 ? 1 : Math.sqrt(2 / n);
    const p = pitch * (JITTERED.has(name) ? 1 + (Math.random() * 2 - 1) * JITTER : 1);
    try { def(S.ctx, S.sfxGain, now + Math.max(0, delay), { v: volume * duck, p, vol: volume * duck, pitch: p }); } catch (e) { warnOnce(`sfx '${name}' failed: ${e.message}`); }
  },
  music: {
    /** Current (requested) track name or ''. */
    get current() { return M.name; },
    /** Start (or crossfade to) a looping track. An empty name stops the music; an unknown name is a no-op (warns once in debug). */
    play(trackName) {
      if (!trackName) { audio.music.stop(); return; }
      const track = TRACKS[trackName];
      if (!track) { warnOnce(`unknown track '${trackName}'`); return; }
      const cur = activeVoice();
      if (M.name === trackName && cur) return;
      M.name = trackName;
      if (audio.testMode || !S.unlocked || !S.ctx) return;
      startVoice(trackName);
    },
    /** Fade out and stop the current track. */
    stop() {
      M.name = '';
      if (!S.ctx) { M.voices.length = 0; return; }
      const now = S.ctx.currentTime;
      for (const v of M.voices) fadeOutVoice(v, now);
    },
    /** Music volume 0..1. */
    setVolume(v) { S.musicVolume = Math.max(0, Math.min(1, v)); if (S.musicGain) S.musicGain.gain.value = S.musicVolume; },
    /** Combat intensity 0..1: fades the harmony lead layer in/out (stage runner calls this during wave locks). */
    setIntensity(x) {
      M.intensity = Math.max(0, Math.min(1, x));
      if (!S.ctx) return;
      const now = S.ctx.currentTime;
      for (const v of M.voices) { v.combat.gain.cancelScheduledValues(now); v.combat.gain.setValueAtTime(v.combat.gain.value, now); v.combat.gain.linearRampToValueAtTime(M.intensity, now + 0.3); }
    },
    get intensity() { return M.intensity; },
    /** Transpose all newly scheduled notes by N semitones (section 3 modulates up at each pylon crossbar). */
    setTranspose(semis) { M.transpose = Math.round(semis) || 0; },
    get transpose() { return M.transpose; },
    /** Dip the music to silence for `seconds` (e.g. 2s when Vane appears), then swell back. */
    silence(seconds = 2) {
      if (!S.musicGain || !S.ctx) return;
      const g = S.musicGain.gain, now = S.ctx.currentTime;
      g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now);
      g.exponentialRampToValueAtTime(0.0001, now + 0.08);
      g.setValueAtTime(0.0001, now + seconds);
      g.exponentialRampToValueAtTime(Math.max(0.0001, S.musicVolume), now + seconds + 0.4);
    },
    /** Convenience for the final boss: phase 1 waltz, 2 doubled-kick 4/4, 3 half-time, 4 the D-major last 20%. */
    bossPhase(n) { audio.music.play(['boss', 'boss', 'boss2', 'boss3', 'boss_final'][Math.max(1, Math.min(4, n | 0))]); },
  },
  get muted() { return S.muted; },
  /** Set mute explicitly; returns the new state. */
  setMuted(m) {
    S.muted = !!m;
    if (S.master) S.master.gain.value = S.muted ? 0 : S.volume;
    return S.muted;
  },
  /** Toggle master mute; returns the new muted state. */
  toggleMute() { return audio.setMuted(!S.muted); },
  /** Master volume 0..1. */
  setVolume(v) { S.volume = Math.max(0, Math.min(1, v)); if (S.master && !S.muted) S.master.gain.value = S.volume; },
  /** SFX bus volume 0..1. */
  setSfxVolume(v) { S.sfxVolume = Math.max(0, Math.min(1, v)); if (S.sfxGain) S.sfxGain.gain.value = S.sfxVolume; },
  get sfxVolume() { return S.sfxVolume; },
  get musicVolume() { return S.musicVolume; },
  get unlocked() { return S.unlocked; },
  /** True when a track is playing (or would play once unlocked). */
  get musicPlaying() { return !!M.name; },

  /**
   * Render one SFX (or a music track with `{ music: true }`) into an AudioBuffer via an OfflineAudioContext.
   * Needs neither a user gesture nor init(). Returns the buffer (mono, 44.1kHz).
   */
  render(name, seconds, { music = false, intensity = 0.6, volume = 1, pitch = 1 } = {}) {
    return renderOffline(seconds, (ctx, dest) => {
      if (music) { const tr = TRACKS[name]; if (!tr) throw new Error(`unknown track ${name}`); renderTrack(ctx, dest, tr, seconds, { intensity }); return; }
      const def = SFX_DEFS[name]; if (!def) throw new Error(`unknown sfx ${name}`);
      def(ctx, dest, 0, { v: volume, p: pitch, vol: volume, pitch });
    });
  },
  /**
   * Offline self-test: renders every canonical SFX (1.0s) and every track (2.5s) and measures them.
   * Returns { sfx: [{name, rms, peak, durationMs, error?}], music: [{name, rms, peak, error?}] }.
   */
  async selfTest({ sfxSeconds = 1.0, musicSeconds = 2.5, extraTracks = true } = {}) {
    const report = { sfx: [], music: [] };
    for (const name of CANONICAL_SFX) {
      try {
        const buf = await audio.render(name, sfxSeconds);
        report.sfx.push({ name, ...analyse(buf) });
      } catch (e) { report.sfx.push({ name, rms: 0, peak: 0, durationMs: 0, error: String(e && e.message || e) }); }
    }
    const trackNames = extraTracks ? Object.keys(TRACKS) : CANONICAL_TRACKS;
    for (const name of trackNames) {
      try {
        const buf = await audio.render(name, musicSeconds, { music: true });
        const a = analyse(buf);
        report.music.push({ name, rms: a.rms, peak: a.peak, bpm: TRACKS[name].bpm });
      } catch (e) { report.music.push({ name, rms: 0, peak: 0, error: String(e && e.message || e) }); }
    }
    return report;
  },
};
