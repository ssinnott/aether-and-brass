// WebAudio synthesis primitives. Every function is pure with respect to the context:
// `(ctx, dest, when, opts)` schedules nodes on ANY BaseAudioContext (realtime or Offline)
// at absolute time `when` (seconds, in `ctx.currentTime` units) and returns the end time.
// Nothing here touches global state, so the same code renders in selfTest and in-game.

const NOISE = new WeakMap();
const SILENT = new WeakMap();
const FLOOR = 0.0001; // exponential ramps cannot reach zero
let noiseCursor = 0.137; // rotating start offset so back-to-back bursts differ

/** 1.5s deterministic white-noise buffer, cached per context. */
export function noiseBuffer(ctx) {
  let b = NOISE.get(ctx);
  if (!b) {
    const sr = ctx.sampleRate, len = Math.floor(sr * 1.5);
    b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    let x = 0x9e3779b9; // xorshift32: reproducible noise => reproducible self-test numbers
    for (let i = 0; i < len; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; d[i] = ((x >>> 0) / 4294967296) * 2 - 1; }
    NOISE.set(ctx, b);
  }
  return b;
}

export const clampF = (f) => Math.min(20000, Math.max(20, f));

/**
 * Tear a voice down once its source ends: stop() alone leaves the gain/filter chain attached to `dest`
 * until GC notices; disconnecting explicitly keeps long sessions from accumulating dangling nodes.
 */
export function autoDisconnect(src, nodes) {
  src.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch { /* already gone */ } } src.onended = null; };
}

/** One silent sample, cached per context: the clock source behind `releaseAt`. */
function silentBuffer(ctx) {
  let b = SILENT.get(ctx);
  if (!b) { b = ctx.createBuffer(1, 1, ctx.sampleRate); SILENT.set(ctx, b); }
  return b;
}

/**
 * Disconnect `nodes` at `when + life`. A voice is torn down by its own source's `ended` (see autoDisconnect), but a
 * node that OUTLIVES the sources feeding it — an echo tail, a shared waveshaper — has no source to hang that off,
 * and every such node left connected keeps being processed for the life of the context. So give it a clock: a silent
 * one-sample source, looped, whose only job is to end. Using the context rather than setTimeout means this behaves
 * identically on an OfflineAudioContext, and `nodes[0]` is the head of the group (what the clock feeds silence into).
 */
export function releaseAt(ctx, nodes, when, life) {
  const s = ctx.createBufferSource();
  s.buffer = silentBuffer(ctx); s.loop = true;
  s.connect(nodes[0]);
  autoDisconnect(s, [...nodes, s]);
  s.start(when); s.stop(when + Math.max(0, life));
}

/** Attack / hold / exponential decay envelope on an AudioParam. Returns the end time. */
export function env(param, when, { vol = 0.3, attack = 0.003, hold = 0, dur = 0.1, sustain = 0, release = 0 }) {
  const peak = Math.max(FLOOR, vol);
  param.value = FLOOR; // the default (1) would leak the first sample: Chromium starts sources a sample before `when`
  param.setValueAtTime(FLOOR, when);
  param.linearRampToValueAtTime(peak, when + attack);
  if (hold > 0) param.setValueAtTime(peak, when + attack + hold);
  if (sustain > 0 && release > 0) {
    // gated: decay to the sustain level, hold, then release
    const sus = Math.max(FLOOR, peak * sustain);
    param.exponentialRampToValueAtTime(sus, when + attack + hold + Math.max(0.005, (dur - release - attack - hold) * 0.3));
    param.setValueAtTime(sus, when + dur - release);
    param.exponentialRampToValueAtTime(FLOOR, when + dur);
  } else {
    param.exponentialRampToValueAtTime(FLOOR, when + dur);
  }
  return when + dur;
}

function rampFreq(param, when, f0, f1, dur, curve) {
  param.setValueAtTime(clampF(f0), when);
  if (f1 !== f0) {
    if (curve === 'lin') param.linearRampToValueAtTime(clampF(f1), when + dur);
    else param.exponentialRampToValueAtTime(clampF(f1), when + dur);
  }
}

/**
 * Oscillator voice. opts: type, f0, f1 (pitch ramp target), glide (ramp time, default dur), dur, vol,
 * attack, hold, sustain/release, curve ('exp'|'lin'), detune (cents), vib {rate, depth(cents)}, lp (lowpass Hz), hp.
 */
export function osc(ctx, dest, when, o = {}) {
  const { type = 'square', f0 = 440, f1 = f0, dur = 0.1, curve = 'exp', detune = 0, vib = null, lp = 0, hp = 0, q = 1 } = o;
  const glide = o.glide || dur;
  const s = ctx.createOscillator();
  s.type = type;
  rampFreq(s.frequency, when, f0, f1, glide, curve);
  if (detune) s.detune.setValueAtTime(detune, when);
  let lfoNodes = null;
  if (vib) {
    const l = ctx.createOscillator(); l.type = 'sine'; l.frequency.value = vib.rate;
    const lg = ctx.createGain(); lg.gain.value = vib.depth;
    l.connect(lg).connect(s.detune); l.start(when); l.stop(when + dur + 0.05);
    lfoNodes = [l, lg];
  }
  const g = ctx.createGain();
  env(g.gain, when, o);
  let head = s;
  const chain = [s, g];
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = clampF(lp); f.Q.value = q; head.connect(f); head = f; chain.push(f); }
  if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = clampF(hp); head.connect(f); head = f; chain.push(f); }
  head.connect(g).connect(dest);
  if (lfoNodes) chain.push(...lfoNodes);
  autoDisconnect(s, chain);
  s.start(when); s.stop(when + dur + 0.03);
  return when + dur;
}

/** Filtered noise burst. opts: dur, vol, type (biquad type), f0, f1, q, attack, hold, sustain/release, curve. */
export function noise(ctx, dest, when, o = {}) {
  const { dur = 0.1, type = 'lowpass', f0 = 2000, f1 = f0, q = 1, curve = 'exp' } = o;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx); src.loop = true;
  const flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
  rampFreq(flt.frequency, when, f0, f1, o.glide || dur, curve);
  const g = ctx.createGain();
  env(g.gain, when, o);
  src.connect(flt).connect(g).connect(dest);
  autoDisconnect(src, [src, flt, g]);
  noiseCursor = (noiseCursor + 0.173) % 1.2;
  src.start(when, noiseCursor); src.stop(when + dur + 0.03);
  return when + dur;
}

/** Ring modulation (carrier * modulator via a gain whose gain param is driven by the modulator). */
export function ring(ctx, dest, when, o = {}) {
  const { type = 'square', f0 = 180, f1 = f0, modF = 1300, modF1 = modF, modType = 'sine', dur = 0.12, curve = 'exp', lp = 0 } = o;
  const car = ctx.createOscillator(); car.type = type; rampFreq(car.frequency, when, f0, f1, o.glide || dur, curve);
  const mod = ctx.createOscillator(); mod.type = modType; rampFreq(mod.frequency, when, modF, modF1, o.glide || dur, curve);
  const rm = ctx.createGain(); rm.gain.value = 0; // output = carrier * modulator
  mod.connect(rm.gain);
  const g = ctx.createGain(); env(g.gain, when, o);
  let head = rm;
  const chain = [car, mod, rm, g];
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = clampF(lp); head.connect(f); head = f; chain.push(f); }
  car.connect(rm); head.connect(g).connect(dest);
  autoDisconnect(car, chain);
  car.start(when); mod.start(when); car.stop(when + dur + 0.03); mod.stop(when + dur + 0.03);
  return when + dur;
}

/** Amplitude modulation: carrier * (1 - depth/2 + depth/2 * lfo). */
export function am(ctx, dest, when, o = {}) {
  const { type = 'sawtooth', f0 = 2000, f1 = f0, rate = 60, rate1 = rate, depth = 1, dur = 0.07, curve = 'exp', lp = 0 } = o;
  const car = ctx.createOscillator(); car.type = type; rampFreq(car.frequency, when, f0, f1, o.glide || dur, curve);
  const lfo = ctx.createOscillator(); lfo.type = 'sine'; rampFreq(lfo.frequency, when, rate, rate1, dur, 'lin');
  const vca = ctx.createGain(); vca.gain.value = 1 - depth / 2;
  const lg = ctx.createGain(); lg.gain.value = depth / 2;
  lfo.connect(lg).connect(vca.gain);
  const g = ctx.createGain(); env(g.gain, when, o);
  let head = vca;
  const chain = [car, lfo, vca, lg, g];
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = clampF(lp); head.connect(f); head = f; chain.push(f); }
  car.connect(vca); head.connect(g).connect(dest);
  autoDisconnect(car, chain);
  car.start(when); lfo.start(when); car.stop(when + dur + 0.03); lfo.stop(when + dur + 0.03);
  return when + dur;
}

/**
 * Multi-tap echo "reverb-ish" tail (no feedback loop). Returns an input GainNode: dry passes straight to `dest`,
 * taps are delayed, low-passed and attenuated. Pass `when` (the time the caller starts feeding it) and `life` (how
 * long it does); the taps are then released with `releaseAt` instead of living for the rest of the context.
 */
export function echo(ctx, dest, { taps = 3, time = 0.07, decay = 0.5, wet = 0.35, lowpass = 3500, spread = 1.37, when = ctx.currentTime, life = 2 } = {}) {
  const input = ctx.createGain(); input.gain.value = 1;
  input.connect(dest);
  const nodes = [input];
  let t = time, a = wet, longest = 0;
  for (let i = 0; i < taps; i++) {
    const d = ctx.createDelay(2); d.delayTime.value = Math.min(1.99, t);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = clampF(lowpass / (i + 1));
    const g = ctx.createGain(); g.gain.value = a;
    input.connect(d).connect(f).connect(g).connect(dest);
    nodes.push(d, f, g);
    longest = Math.max(longest, d.delayTime.value);
    t *= spread; a *= decay;
  }
  // `life` is how long the caller keeps feeding this echo; the taps are released once the last tap of that has run
  // out. Without it the whole tail stays in the graph forever and a session's worth of hits starves the audio thread.
  releaseAt(ctx, nodes, when, life + longest + 0.05);
  return input;
}

/** Sub-bus with an optional lowpass/highpass and fixed gain: groups several voices under one filter. */
export function bus(ctx, dest, { gain = 1, lp = 0, hp = 0, q = 1 } = {}) {
  const g = ctx.createGain(); g.gain.value = gain;
  let head = g;
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = clampF(lp); f.Q.value = q; head.connect(f); head = f; }
  if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = clampF(hp); head.connect(f); head = f; }
  head.connect(dest);
  return g;
}

/** Glassy "aether" chord: detuned sine pairs with slow tremolo and a long release. */
export function glass(ctx, dest, when, { freqs = [1320, 1980], detune = 6, dur = 0.5, vol = 0.12, trem = 5, attack = 0.01 } = {}) {
  const vca = ctx.createGain(); vca.gain.value = 0.8;
  const lfo = ctx.createOscillator(); lfo.frequency.value = trem;
  const lg = ctx.createGain(); lg.gain.value = 0.2; lfo.connect(lg).connect(vca.gain);
  lfo.start(when); lfo.stop(when + dur + 0.05);
  vca.connect(dest);
  autoDisconnect(lfo, [lfo, lg, vca]);
  for (const f of freqs) {
    osc(ctx, vca, when, { type: 'sine', f0: f, dur, vol, attack, detune: -detune });
    osc(ctx, vca, when, { type: 'sine', f0: f, dur, vol: vol * 0.7, attack, detune: detune });
  }
  return when + dur;
}
