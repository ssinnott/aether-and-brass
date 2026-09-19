// This game's soundtrack (GDD section 10): 27 tracks as data, a key, a chord loop and channels with step
// patterns, played by the library's pattern sequencer (src/lib/audio/sequencer.ts) through engine/audio.ts.
// Every instrument named below is one of the sequencer's; the `harmony: true` channel each track carries is the
// lead the facade mixes at its `intensity`.
//
// The Calderwick motif D-F-A-C (a minor 7 arpeggio) is written out in the leads rather than referenced by the
// sequencer's `mK` tokens, so no track declares a `motif`.
import type { Track } from '../../lib/audio/sequencer.ts';

// The sequencer itself, for tools that walk the tracks without a browser (tools/simtest.js).
export { compileTrack, stepTime, scheduleSteps, renderTrack } from '../../lib/audio/sequencer.ts';
export type { Track, Channel } from '../../lib/audio/sequencer.ts';

// ---- track data ----
const S1_LEAD = `D4:2 F4:2 A4:2 C5:4 A4:2 F4:2 D4:2 | -:4 A4:2 C5:2 D5:6 -:2 |
  D4:2 F4:2 Bb4:2 D5:4 F5:2 D5:2 Bb4:2 | -:4 F5:2 D5:2 C5:6 -:2 |
  G4:2 Bb4:2 D5:2 F5:4 D5:2 Bb4:2 G4:2 | -:4 G4:2 Bb4:2 D5:6 -:2 |
  A4:2 C#5:2 E5:2 G5:4 E5:2 C#5:2 A4:2 | A4:2 C#5:2 E5:2 A5:6 -:4`;
const S2_LEAD = `G4:2 Bb4:2 D5:2 F5:3 Db5:1 D5:2 Bb4:2 -:2 | -:2 F5:1 D5:1 Db5:1 D5:1 Bb4:2 G4:6 -:2 |
  G4:2 Bb4:2 D5:2 F5:3 Db5:1 D5:2 Bb4:2 -:2 | -:2 F5:1 D5:1 Db5:1 D5:1 Bb4:2 G4:6 -:2 |
  G4:2 Bb4:2 Eb5:2 G5:3 F5:1 Eb5:2 Bb4:2 -:2 | -:2 G5:1 F5:1 Eb5:1 D5:1 Bb4:2 G4:6 -:2 |
  D4:2 F#4:2 A4:2 C5:3 -:1 A4:2 F#4:2 -:2 | D5:2 C5:1 A4:1 F#4:2 D4:8 -:2`;
const MB_LEAD = `-:16 | C5:2 Eb5:2 G5:2 Bb5:6 G5:2 Eb5:2 | -:16 | Ab4:2 C5:2 Eb5:2 G5:6 Eb5:2 C5:2 |
  -:16 | Bb4:2 D5:2 F5:2 Ab5:6 F5:2 D5:2 | -:16 | C5:2 Eb5:2 G5:2 C6:6 G5:2 Eb5:2`;
const MB_WHISTLE = `-:4 G5:1 Eb5:1 G5:1 Eb5:1 C5:2 -:2 G5:1 Bb5:1 G5:2 | -:16 |
  -:4 Ab5:1 G5:1 Ab5:1 G5:1 Eb5:2 -:2 C6:1 Bb5:1 Ab5:2 | -:16 |
  -:4 F5:1 D5:1 F5:1 D5:1 Bb4:2 -:2 F5:1 D5:1 Bb5:2 | -:16 |
  -:4 G5:1 Eb5:1 G5:1 Eb5:1 C5:2 -:2 Eb6:1 D6:1 C6:2 | -:16`;
const S3_LEAD = `A5:2 C6:2 E6:2 G6:4 E6:2 C6:2 A5:2 | -:2 G5:2 A5:2 C6:2 E6:6 -:2 |
  F5:2 A5:2 C6:2 E6:4 C6:2 A5:2 F5:2 | -:2 E5:2 F5:2 A5:2 C6:6 -:2 |
  C6:2 E6:2 G6:2 B6:4 G6:2 E6:2 C6:2 | -:2 B5:2 C6:2 E6:2 G6:6 -:2 |
  G5:2 B5:2 D6:2 F6:4 D6:2 B5:2 G5:2 | G5:2 A5:2 B5:2 C6:2 D6:2 E6:2 F6:2 G6:2`;
const S4_HYMN = `E4:4 G4:4 B4:4 D5:4 | B4:8 G4:8 | C4:4 E4:4 G4:4 B4:4 | G4:8 E4:8 |
  D4:4 F#4:4 A4:4 C5:4 | A4:8 F#4:8 | B3:4 D4:4 F#4:4 A4:4 | B4:12 -:4`;
const BOSS1_LEAD = `E5:2 G5:2 B5:2 D6:6 | B5:2 G5:2 E5:8 | F#5:2 A5:2 B5:2 D#6:6 | B5:4 A5:4 F#5:4 |
  E5:2 G5:2 B5:2 D6:6 | E6:4 D6:4 B5:4 | C5:2 E5:2 G5:2 B5:6 | A5:2 G5:2 F#5:2 D#5:6`;
const BOSS2_LEAD = `E5:2 G5:2 B5:2 D6:6 B5:2 G5:2 | E5:2 G5:2 B5:2 E6:4 D6:2 B5:2 G5:2 |
  F#5:2 A5:2 B5:2 D#6:6 B5:2 A5:2 | F#5:2 A5:2 B5:2 F#6:4 D#6:2 B5:2 A5:2 |
  E5:2 G5:2 B5:2 D6:6 B5:2 G5:2 | E5:2 G5:2 B5:2 E6:4 D6:2 B5:2 G5:2 |
  C5:2 E5:2 G5:2 B5:6 G5:2 E5:2 | A5:2 G5:2 F#5:2 D#5:4 B4:2 D#5:2 F#5:2`;
const BOSS3_LEAD = `D4:4 F4:4 A4:4 C5:4 | D5:12 -:4 | D4:4 F4:4 Bb4:4 D5:4 | F5:8 D5:8 |
  G4:4 Bb4:4 D5:4 F5:4 | G5:12 -:4 | A4:4 C#5:4 E5:4 G5:4 | A5:8 C#5:8`;
const FINAL_LEAD = `D4:4 F#4:4 A4:4 C#5:4 | D5:12 -:4 | G4:4 B4:4 D5:4 F#5:4 | G5:8 D5:8 |
  A4:4 C#5:4 E5:4 G5:4 | A5:12 -:4 | D5:4 F#5:4 A5:4 C#6:4 | D6:16`;
const RES_LEAD = `D5:2 F#5:2 A5:2 C#6:6 A5:2 F#5:2 | D5:2 F#5:2 A5:2 D6:8 -:2 |
  G5:2 B5:2 D6:2 F#6:6 D6:2 B5:2 | G5:2 A5:2 B5:2 D6:8 -:2 |
  A5:2 C#6:2 E6:2 G6:6 E6:2 C#6:2 | E6:4 D6:4 C#6:4 B5:4 |
  D5:2 F#5:2 A5:2 D6:6 A5:2 F#5:2 | D6:12 -:4`;
const TITLE_BOX = `D5:2 F5:2 A5:2 C6:6 A5:2 F5:2 -:16 | D5:2 F5:2 A5:2 D6:6 C6:2 A5:2 F5:2 -:14 |
  F5:2 A5:2 C6:2 E6:6 C6:2 A5:2 -:16 | E5:2 G5:2 C6:2 E6:6 D6:2 C6:2 G5:2 -:14`;
const GO_LEAD = `C5:4 A4:4 F4:4 D4:8 -:12 | Bb4:4 G4:4 D4:4 G4:8 -:12 | D5:4 Bb4:4 F4:4 D4:8 -:12 | C#5:4 A4:4 E4:4 A3:8 -:12`;

// Stage 2 (docs/STAGE2.md section 10): the Calderwick motif D-F-A-C carried up into the sky as a shanty — whistle and
// brass over a rolling bass, with the storm in the drums.
const ST1_LEAD = `D5:2 F5:2 A5:2 C6:4 A5:2 F5:2 D5:2 | -:2 A5:2 C6:2 D6:6 C6:2 A5:2 |
  C5:2 E5:2 G5:2 C6:4 G5:2 E5:2 C5:2 | -:2 G5:2 C6:2 E6:6 -:2 |
  Bb4:2 D5:2 F5:2 Bb5:4 F5:2 D5:2 Bb4:2 | -:2 F5:2 Bb5:2 D6:6 -:2 |
  A4:2 C#5:2 E5:2 A5:4 E5:2 C#5:2 A4:2 | A4:2 C#5:2 E5:2 A5:4 C#6:4`;
const ST2_LEAD = `A4:3 C5:3 E5:6 | C5:3 E5:3 A5:6 | E5:3 G5:3 B5:6 | G5:6 E5:6 |
  F4:3 A4:3 C5:6 | A4:3 C5:3 F5:6 | G4:3 B4:3 D5:6 | D5:6 G5:6`;
const ST3_LEAD = `E5:2 G5:2 B5:2 E6:4 B5:2 G5:2 E5:2 | -:2 B5:2 E6:2 G6:6 -:2 |
  C5:2 E5:2 G5:2 C6:4 G5:2 E5:2 C5:2 | -:2 G5:2 C6:2 E6:6 -:2 |
  A4:2 C5:2 E5:2 A5:4 E5:2 C5:2 A4:2 | -:2 E5:2 A5:2 C6:6 -:2 |
  B4:2 D#5:2 F#5:2 B5:4 F#5:2 D#5:2 B4:2 | B4:2 D#5:2 F#5:2 B5:8 -:2`;
const STB_LEAD = `G5:2 Bb5:2 D6:2 G6:4 D6:2 Bb5:2 | G5:2 Bb5:2 D6:2 F6:4 D6:2 Bb5:2 |
  Eb5:2 G5:2 Bb5:2 Eb6:4 Bb5:2 G5:2 | Eb5:2 G5:2 Bb5:2 D6:4 Bb5:2 G5:2 |
  Bb4:2 D5:2 F5:2 Bb5:4 F5:2 D5:2 | Bb4:2 D5:2 F5:2 Ab5:4 F5:2 D5:2 |
  D5:2 F#5:2 A5:2 D6:4 A5:2 F#5:2 | D5:2 F#5:2 A5:2 C6:4 A5:4`;

// ---- Stage 3: The Reckoning of Calderwick (docs/STAGE3.md section 6) ----
// The Calderwick motif D-F-A-C taken down to the ground and played straight: this board is about book-keeping, so
// its three section tracks are the least ornamented in the game and the boss theme is the motif at full weight.
const W1_LEAD = `D4:2 F4:2 A4:3 F4:1 D4:2 A3:2 D4:4 | F4:2 A4:2 C5:3 A4:1 F4:2 C5:2 A4:4 |
  Bb3:2 D4:2 F4:3 D4:1 Bb3:2 F4:2 D4:4 | C4:2 E4:2 G4:3 E4:1 C4:2 G4:2 C5:4`;
const W2_LEAD = `G4:2 Bb4:2 D5:2 Bb4:2 G4:4 -:4 | Bb4:2 D5:2 F5:2 D5:2 Bb4:4 -:4 |
  Eb5:2 D5:2 Bb4:2 G4:2 Eb4:4 -:4 | F4:2 A4:2 C5:2 F5:4 C5:2 A4:2 -:2`;
const W3_LEAD = `C5:2 Eb5:2 G5:2 C6:4 G5:2 Eb5:2 C5:2 | Ab4:2 C5:2 Eb5:2 Ab5:4 Eb5:2 C5:2 Ab4:2 |
  Eb5:2 G5:2 Bb5:2 Eb6:4 Bb5:2 G5:2 Eb5:2 | G4:2 B4:2 D5:2 G5:4 F5:2 D5:2 B4:2`;
const LEDGER_LEAD = `D5:2 F5:2 A5:2 D6:4 A5:2 F5:2 D5:2 | Bb4:2 D5:2 F5:2 Bb5:4 F5:2 D5:2 Bb4:2 |
  G4:2 Bb4:2 D5:2 G5:4 D5:2 Bb4:2 G4:2 | A4:2 C#5:2 E5:2 A5:4 G5:2 E5:2 C#5:2`;
// ---- Stage 4: The Gleaning of Calderwick (docs/STAGE4.md section 6) ----
// The Calderwick motif, finally in a minor key that is not the city's: the guild has no anthem, so its three
// section tracks are the motif being carried away a piece at a time — G1 has it slowed to a field song, G2 has it
// under a windlass tick, G3 has it inside the bag with the harp answering itself. The boss theme is the whole motif
// at speed, and it is the only track in the game that lands on its own tonic instead of resolving somewhere else.
const G1_LEAD = `A4:4 C5:4 E5:6 C5:2 | A4:4 E4:4 A4:8 |
  F4:4 A4:4 C5:6 A4:2 | G4:4 B4:4 D5:8 |
  A4:4 C5:4 E5:4 A5:4 | E5:4 C5:4 A4:8 |
  F4:2 G4:2 A4:4 C5:4 E5:4 | E4:8 A4:8`;
const G2_LEAD = `E5:2 G5:2 B5:2 E6:4 B5:2 G5:2 | E5:2 B4:2 E5:2 G5:4 -:4 |
  C5:2 E5:2 G5:2 C6:4 G5:2 E5:2 | C5:2 G4:2 C5:2 E5:4 -:4 |
  A4:2 C5:2 E5:2 A5:4 E5:2 C5:2 | A4:2 E4:2 A4:2 C5:4 -:4 |
  B4:2 D5:2 F#5:2 B5:4 F#5:2 D5:2 | B4:4 F#5:4 B5:8`;
const G3_LEAD = `B4:2 D5:2 F#5:2 B5:4 F#5:2 D5:2 B4:2 | -:2 F#5:2 B5:2 D6:6 -:2 |
  G4:2 B4:2 D5:2 G5:4 D5:2 B4:2 G4:2 | -:2 D5:2 G5:2 B5:6 -:2 |
  E5:2 G5:2 B5:2 E6:4 B5:2 G5:2 E5:2 | -:2 B5:2 E6:2 G6:6 -:2 |
  F#5:2 A5:2 C#6:2 F#6:4 C#6:2 A5:2 F#5:2 | F#5:2 A5:2 C#6:2 F#6:8 -:2`;
// Stage 3 mid-boss, Yardmaster Marl & the Lime Kiln (docs/STAGE3.md section 6): the works' own track at boss weight.
// Gm like the yard (works2), a harpsichord ledger-tick on every beat with brass under it, and a kiln CLANG on the
// last sixteenth of every bar - a yard boss, not a flag officer, so it shares nothing with the Grubbik theme.
const KILN_LEAD = `G4:2 Bb4:2 D5:2 F5:4 D5:2 Bb4:2 G4:2 | -:4 D5:2 F5:2 G5:6 -:2 |
  Eb5:2 G5:2 Bb5:2 D6:4 Bb5:2 G5:2 Eb5:2 | -:4 Bb5:2 G5:2 Eb5:6 -:2 |
  Bb4:2 D5:2 F5:2 Ab5:4 F5:2 D5:2 Bb4:2 | -:4 F5:2 D5:2 Bb4:6 -:2 |
  F4:2 A4:2 C5:2 Eb5:4 C5:2 A4:2 F4:2 | F4:2 A4:2 C5:2 F5:8 -:2`;
// Stage 4 mid-boss, Reeve Tansy Culm & the Baler (docs/STAGE4.md section 6): the float's Em with the press in the
// drums - a thump on the one and the three (the ram) and the windlass tick running the whole way through.
const BALER_LEAD = `E5:2 G5:2 B5:2 E6:4 B5:2 G5:2 E5:2 | -:2 B5:2 E6:2 G6:6 E6:2 B5:2 |
  C5:2 E5:2 G5:2 C6:4 G5:2 E5:2 C5:2 | -:2 G5:2 C6:2 E6:6 -:4 |
  A4:2 C5:2 E5:2 A5:4 E5:2 C5:2 A4:2 | -:2 E5:2 A5:2 C6:6 A5:2 E5:2 |
  B4:2 D#5:2 F#5:2 B5:4 F#5:2 D#5:2 B4:2 | B4:2 D#5:2 F#5:2 B5:8 -:2`;
const CROP_LEAD = `A5:2 C6:2 E6:2 A6:4 E6:2 C6:2 A5:2 | F5:2 A5:2 C6:2 F6:4 C6:2 A5:2 F5:2 |
  D5:2 F5:2 A5:2 D6:4 A5:2 F5:2 D5:2 | E5:2 G#5:2 B5:2 E6:4 D6:2 B5:2 G#5:2 |
  A5:2 C6:2 E6:2 A6:6 E6:2 C6:2 | F5:2 A5:2 C6:2 F6:6 C6:2 A5:2 |
  D5:2 F5:2 A5:2 D6:4 F6:4 E6:4 | A5:4 E6:4 A6:8`;
const HAT16 = 'HhhhHhhhHhhhHhhh';
export const TRACKS: Record<string, Track> = {
  title: { name: 'title', bpm: 100, key: 'D', chords: ['Dm', 'Bb', 'F', 'C'], channels: [
    { inst: 'pad', oct: 3, vol: 1, pat: 'chord:32', wide: 10 },
    { inst: 'pluck', oct: 5, vol: 0.9, pat: TITLE_BOX },
    { inst: 'bass_tri', oct: 2, vol: 0.5, pat: 'r:6 -:2 r+7:4 -:2 r:2' },
    { inst: 'drums', vol: 0.5, pat: '....h.......h...' },
    { inst: 'pluck', oct: 6, vol: 0.5, harmony: true, pat: TITLE_BOX, transpose: -5 },
  ] },
  section1: { name: 'section1', bpm: 128, key: 'D', chords: ['Dm', 'Bb', 'Gm', 'A'], channels: [
    { inst: 'bass_square', oct: 2, vol: 1, pat: 'r:1 . r:1 . r:1 . r+7:1 . r:1 . r:1 . r+12:1 . r+10:1 .' },
    { inst: 'lead_saw', oct: 4, vol: 1, pat: S1_LEAD },
    { inst: 'lead_pulse', oct: 4, vol: 0.9, harmony: true, pat: S1_LEAD, transpose: 7 },
    { inst: 'pad', oct: 3, vol: 0.6, pat: 'chord:32' },
    { inst: 'drums', vol: 0.9, pat: 'K.hhS.hhK.hhS.hH' },
  ] },
  section2: { name: 'section2', bpm: 140, key: 'G', chords: ['Gm', 'Gm/F#', 'Eb', 'D'], channels: [
    { inst: 'bass_square', oct: 2, vol: 1, pat: 'r:2 r:1 r+7:1 r+10:2 r+12:1 r+10:1 r+7:2 r:1 r+6:1 r+7:2 r:2' },
    { inst: 'lead_saw', oct: 4, vol: 1, pat: S2_LEAD },
    { inst: 'lead_pulse', oct: 4, vol: 0.9, harmony: true, pat: S2_LEAD, transpose: 7 },
    { inst: 'organ', oct: 3, vol: 0.45, pat: 'chord:32' },
    { inst: 'drums', vol: 1, pat: 'K...K...K...K...' },
    { inst: 'drums', vol: 0.9, pat: '....C.......C...' },
    { inst: 'drums', vol: 0.7, pat: 'h.h.h.h.h.h.h.hh' },
  ] },
  midboss: { name: 'midboss', bpm: 150, key: 'C', chords: ['Cm', 'Ab', 'Bb', 'Cm'], channels: [
    { inst: 'bass_tri', oct: 2, vol: 1, pat: 'r:2 . . r+7:2 . . r:2 . . r+7:2 . .' },
    { inst: 'brass', oct: 3, vol: 1, pat: '. . chord:2 . . chord:2 . . chord:2 . . chord:2' },
    { inst: 'whistle', oct: 5, vol: 1, pat: MB_WHISTLE },
    { inst: 'lead_saw', oct: 4, vol: 0.9, pat: MB_LEAD },
    { inst: 'lead_pulse', oct: 4, vol: 0.9, harmony: true, pat: MB_LEAD, transpose: 7 },
    { inst: 'drums', vol: 0.9, pat: 'K.h.S.h.K.h.S.hh' },
  ] },
  midboss2: { name: 'midboss2', bpm: 150, key: 'C', chords: ['Cm', 'Ab', 'Bb', 'Cm'], channels: [
    { inst: 'bass_tri', oct: 2, vol: 0.8, pat: 'r:2 . . r+7:2 . . r:2 . . r+7:2 . .' },
    { inst: 'brass', oct: 3, vol: 1, pat: '. . chord:2 . . chord:2 . . chord:2 . . chord:2' },
    { inst: 'whistle', oct: 5, vol: 1, pat: MB_WHISTLE },
    { inst: 'lead_saw', oct: 4, vol: 0.9, pat: MB_LEAD },
    { inst: 'lead_pulse', oct: 4, vol: 0.9, harmony: true, pat: MB_LEAD, transpose: 7 },
    { inst: 'drums', vol: 0.6, pat: 'K.......S.......' },
    { inst: 'drums', vol: 0.5, pat: 'h.h.h.h.h.h.h.h.' },
  ] },
  section3: { name: 'section3', bpm: 132, key: 'A', chords: ['Am', 'F', 'C', 'G'], channels: [
    { inst: 'bass_square', oct: 2, vol: 1, pat: 'r:2 . r:1 r+7:2 . r:1 r+12:2 . r+7:1 r:2 . r:1' },
    { inst: 'lead_saw', oct: 5, vol: 0.8, pat: S3_LEAD },
    { inst: 'lead_pulse', oct: 5, vol: 0.8, harmony: true, pat: S3_LEAD, transpose: -5 },
    { inst: 'pad', oct: 3, vol: 1, pat: 'chord:32', wide: 14 },
    { inst: 'drums', vol: 0.9, pat: 'K.h.S.h.K.h.S.O.' },
  ] },
  section4: { name: 'section4', bpm: 120, key: 'E', chords: ['Em', 'C', 'D', 'Bm'], channels: [
    { inst: 'organ', oct: 3, vol: 1, pat: 'chord:32' },
    { inst: 'organ', oct: 4, vol: 0.8, pat: S4_HYMN },
    { inst: 'lead_pulse', oct: 4, vol: 0.8, harmony: true, pat: S4_HYMN, transpose: 7 },
    { inst: 'bass_tri', oct: 2, vol: 0.9, pat: 'r:8 r+7:4 r:4' },
    { inst: 'drums', vol: 0.6, pat: HAT16 },
    { inst: 'drums', vol: 0.8, pat: 'K.......K.......' },
  ] },
  boss: { name: 'boss', bpm: 150, beats: 3, key: 'E', chords: ['Em', 'B7', 'Em', 'C'], channels: [
    { inst: 'drums', vol: 1, pat: 'T...t...t...' },
    { inst: 'bass_tri', oct: 2, vol: 1, pat: 'r:4 -:8' },
    { inst: 'harpsi', oct: 3, vol: 0.8, pat: '-:4 chord:3 . chord:3 .' },
    { inst: 'harpsi', oct: 5, vol: 1, pat: BOSS1_LEAD },
    { inst: 'lead_pulse', oct: 5, vol: 0.7, harmony: true, pat: BOSS1_LEAD, transpose: -5 },
    { inst: 'drums', vol: 0.6, pat: 'K...h...h...' },
  ] },
  boss2: { name: 'boss2', bpm: 160, key: 'E', chords: ['Em', 'B7', 'Em', 'C'], channels: [
    { inst: 'drums', vol: 0.8, pat: 'T...T...T...T...' },
    { inst: 'bass_dist', oct: 2, vol: 1, pat: 'r r r+12 r r r r+7 r r r r+12 r r r r+7 r' },
    { inst: 'lead_saw', oct: 5, vol: 0.9, pat: BOSS2_LEAD },
    { inst: 'lead_pulse', oct: 5, vol: 0.8, harmony: true, pat: BOSS2_LEAD, transpose: -5 },
    { inst: 'drums', vol: 1, pat: 'K.K.S.K.K.K.S.K.' },
    { inst: 'drums', vol: 0.6, pat: 'hhhhhhhhhhhhhhhh' },
  ] },
  boss3: { name: 'boss3', bpm: 90, key: 'D', chords: ['Dm', 'Bb', 'Gm', 'A'], channels: [
    { inst: 'pad', oct: 3, vol: 1.2, pat: 'chord:32', wide: 14 },
    { inst: 'lead_saw', oct: 4, vol: 0.9, pat: BOSS3_LEAD },
    { inst: 'lead_pulse', oct: 4, vol: 0.8, harmony: true, pat: BOSS3_LEAD, transpose: 7 },
    { inst: 'drone', oct: 2, vol: 1, pat: 'D2:128', rise: 1 },
    { inst: 'drums', vol: 0.9, pat: 'K.......S.......' },
    { inst: 'drums', vol: 0.4, pat: 'h.h.h.h.h.h.h.h.' },
  ] },
  boss_final: { name: 'boss_final', bpm: 90, key: 'D', chords: ['D', 'G', 'A', 'D'], channels: [
    { inst: 'pad', oct: 3, vol: 1.2, pat: 'chord:32', wide: 14 },
    { inst: 'organ', oct: 4, vol: 0.9, pat: FINAL_LEAD },
    { inst: 'lead_pulse', oct: 4, vol: 0.8, harmony: true, pat: FINAL_LEAD, transpose: 7 },
    { inst: 'drone', oct: 2, vol: 1, pat: 'D2:128' },
    { inst: 'drums', vol: 0.9, pat: 'K.......S.......' },
    { inst: 'drums', vol: 0.5, pat: 'h.h.h.h.h.h.h.h.' },
  ] },
  // ---- Stage 2: The Storm Above Calderwick ----
  storm1: { name: 'storm1', bpm: 136, key: 'D', chords: ['Dm', 'C', 'Bb', 'A'], channels: [
    { inst: 'bass_square', oct: 2, vol: 1, pat: 'r:1 . r:1 . r+7:1 . r:1 . r:1 . r+12:1 . r+7:1 . r+10:1 .' },
    { inst: 'lead_saw', oct: 4, vol: 1, pat: ST1_LEAD },
    { inst: 'whistle', oct: 5, vol: 0.9, harmony: true, pat: ST1_LEAD },
    { inst: 'pad', oct: 3, vol: 0.7, pat: 'chord:32', wide: 12 },
    { inst: 'drums', vol: 0.9, pat: 'K.hhS.hhK.hhS.hH' },
  ] },
  storm2: { name: 'storm2', bpm: 126, beats: 3, key: 'A', chords: ['Am', 'Em', 'F', 'G'], channels: [
    { inst: 'bass_tri', oct: 2, vol: 1, pat: 'r:3 r+7:3 r:3 r+12:3' },
    { inst: 'organ', oct: 3, vol: 0.55, pat: 'chord:24' },
    { inst: 'pluck', oct: 5, vol: 1, pat: ST2_LEAD },
    { inst: 'lead_pulse', oct: 5, vol: 0.7, harmony: true, pat: ST2_LEAD, transpose: 7 },
    { inst: 'drums', vol: 0.8, pat: 'K..h..S..h..' },
  ] },
  storm3: { name: 'storm3', bpm: 144, key: 'E', chords: ['Em', 'C', 'Am', 'B7'], channels: [
    { inst: 'bass_square', oct: 2, vol: 1, pat: 'r:2 r:1 r+7:1 r+12:2 r+7:1 r:1 r:2 r+10:1 r+7:1 r:2 r:2' },
    { inst: 'lead_saw', oct: 5, vol: 0.9, pat: ST3_LEAD },
    { inst: 'brass', oct: 3, vol: 0.8, pat: 'chord:4 . . . chord:4 . . . chord:4 . . . chord:2 . chord:2' },
    { inst: 'lead_pulse', oct: 5, vol: 0.8, harmony: true, pat: ST3_LEAD, transpose: -5 },
    { inst: 'drums', vol: 1, pat: 'K.h.S.hhK.h.S.hO' },
  ] },
  stormboss: { name: 'stormboss', bpm: 158, key: 'G', chords: ['Gm', 'Eb', 'Bb', 'D'], channels: [
    { inst: 'bass_square', oct: 2, vol: 1.1, pat: 'r:1 . r:1 . r:1 . r:1 . r+7:1 . r+7:1 . r+10:1 . r+12:1 .' },
    { inst: 'brass', oct: 3, vol: 1, pat: 'chord:2 . chord:2 . chord:2 . chord:2 .' },
    { inst: 'lead_saw', oct: 5, vol: 1, pat: STB_LEAD },
    { inst: 'lead_pulse', oct: 5, vol: 0.8, harmony: true, pat: STB_LEAD, transpose: 7 },
    { inst: 'drums', vol: 1, pat: 'K.hhS.hhK.hhS.hC' },
    { inst: 'drums', vol: 0.5, pat: 'T...t...T...t...' },
  ] },
  // ---- Stage 3: The Reckoning of Calderwick ----
  works1: { name: 'works1', bpm: 124, key: 'D', chords: ['Dm', 'F', 'Bb', 'C'], channels: [
    { inst: 'bass_tri', oct: 2, vol: 1, pat: 'r:2 r:2 r+7:2 r:2 r+12:2 r+7:2 r:4' },
    { inst: 'pluck', oct: 4, vol: 1, pat: W1_LEAD },
    { inst: 'lead_pulse', oct: 4, vol: 0.7, harmony: true, pat: W1_LEAD, transpose: 7 },
    { inst: 'pad', oct: 3, vol: 0.5, pat: 'chord:32', wide: 8 },
    { inst: 'drums', vol: 0.8, pat: 'K..hS..hK..hS.hh' },
  ] },
  works2: { name: 'works2', bpm: 132, key: 'G', chords: ['Gm', 'Bb', 'Eb', 'F'], channels: [
    { inst: 'bass_square', oct: 2, vol: 1, pat: 'r:1 . r:1 . r+7:1 . r:1 . r:1 . r+10:1 . r+7:1 . r:1 .' },
    { inst: 'lead_saw', oct: 4, vol: 0.9, pat: W2_LEAD },
    { inst: 'organ', oct: 3, vol: 0.5, pat: '. chord:1 . chord:1 . chord:1 . chord:1 . chord:1 . chord:1 . chord:1 . chord:1' },
    { inst: 'lead_pulse', oct: 4, vol: 0.7, harmony: true, pat: W2_LEAD, transpose: -5 },
    { inst: 'drums', vol: 0.9, pat: 'K.hhS.h.K.hhS.hO' },
  ] },
  works3: { name: 'works3', bpm: 138, key: 'C', chords: ['Cm', 'Ab', 'Eb', 'G'], channels: [
    { inst: 'bass_square', oct: 2, vol: 1, pat: 'r:2 r:1 r+7:1 r+12:2 r+7:1 r:1 r:2 r+10:1 r+7:1 r:2 r:2' },
    { inst: 'harpsi', oct: 5, vol: 0.8, pat: 'c0:1 . c1:1 . c2:1 . c1:1 . c0:1 . c1:1 . c2:1 . c1:1 .' },
    { inst: 'lead_saw', oct: 5, vol: 0.9, pat: W3_LEAD },
    { inst: 'brass', oct: 3, vol: 0.7, pat: 'chord:3 . chord:3 . chord:3 . chord:3 .' },
    { inst: 'lead_pulse', oct: 5, vol: 0.7, harmony: true, pat: W3_LEAD, transpose: -5 },
    { inst: 'drums', vol: 1, pat: 'K.h.S.h.K.h.S.hH' },
  ] },
  ledgerboss: { name: 'ledgerboss', bpm: 156, key: 'D', chords: ['Dm', 'Bb', 'Gm', 'A'], channels: [
    { inst: 'bass_dist', oct: 2, vol: 1, pat: 'r r r+12 r r r r+7 r r r r+12 r r r+10 r+7 r' },
    { inst: 'brass', oct: 3, vol: 1, pat: 'chord:3 . chord:3 . chord:3 . chord:3 .' },
    { inst: 'lead_saw', oct: 5, vol: 1, pat: LEDGER_LEAD },
    { inst: 'lead_pulse', oct: 5, vol: 0.8, harmony: true, pat: LEDGER_LEAD, transpose: 7 },
    { inst: 'drums', vol: 1, pat: 'K.hhS.hhK.hhS.hC' },
    { inst: 'drums', vol: 0.5, pat: 'T...t...T...t...' },
  ] },
  // ---- Stage 4: The Gleaning of Calderwick ----
  glean1: { name: 'glean1', bpm: 118, key: 'A', chords: ['Am', 'F', 'G', 'Am'], channels: [
    { inst: 'pad', oct: 3, vol: 0.8, pat: 'chord:32', wide: 12 },
    { inst: 'bass_tri', oct: 2, vol: 0.9, pat: 'r:4 -:2 r+7:2 r:4 r+12:2 r+7:2' },
    { inst: 'pluck', oct: 4, vol: 1, pat: G1_LEAD },
    { inst: 'whistle', oct: 5, vol: 0.6, harmony: true, pat: G1_LEAD, transpose: 12 },
    { inst: 'drums', vol: 0.6, pat: 'K......hS......h' },
  ] },
  glean2: { name: 'glean2', bpm: 130, key: 'E', chords: ['Em', 'C', 'Am', 'B7'], channels: [
    { inst: 'bass_square', oct: 2, vol: 1, pat: 'r:2 r:2 r+7:2 r:2 r+12:2 r+7:2 r:4' },
    { inst: 'lead_saw', oct: 4, vol: 0.9, pat: G2_LEAD },
    { inst: 'organ', oct: 3, vol: 0.45, pat: 'chord:8 . chord:8 .' },
    { inst: 'lead_pulse', oct: 4, vol: 0.7, harmony: true, pat: G2_LEAD, transpose: 7 },
    // the windlass, ticking all the way through: the float is hauling the whole time you are fighting on it
    { inst: 'drums', vol: 0.85, pat: 'K.hhS.h.K.hhS.hO' },
  ] },
  glean3: { name: 'glean3', bpm: 142, key: 'B', chords: ['Bm', 'G', 'Em', 'F#7'], channels: [
    { inst: 'bass_square', oct: 2, vol: 1, pat: 'r:2 r:1 r+7:1 r+12:2 r+7:1 r:1 r:2 r+10:1 r+7:1 r:2 r:2' },
    { inst: 'harpsi', oct: 5, vol: 0.75, pat: 'c0:1 . c1:1 . c2:1 . c1:1 . c0:1 . c1:1 . c2:1 . c1:1 .' },
    { inst: 'lead_saw', oct: 5, vol: 0.9, pat: G3_LEAD },
    { inst: 'pad', oct: 3, vol: 0.5, pat: 'chord:32', wide: 10 },
    { inst: 'lead_pulse', oct: 5, vol: 0.7, harmony: true, pat: G3_LEAD, transpose: -5 },
    { inst: 'drums', vol: 0.95, pat: 'K.h.S.h.K.h.S.hH' },
  ] },
  cropboss: { name: 'cropboss', bpm: 160, key: 'A', chords: ['Am', 'F', 'Dm', 'E'], channels: [
    { inst: 'bass_dist', oct: 2, vol: 1, pat: 'r r r+12 r r r r+7 r r r r+12 r r r+10 r+7 r' },
    { inst: 'brass', oct: 3, vol: 1, pat: 'chord:3 . chord:3 . chord:3 . chord:3 .' },
    { inst: 'lead_saw', oct: 5, vol: 1, pat: CROP_LEAD },
    { inst: 'lead_pulse', oct: 5, vol: 0.8, harmony: true, pat: CROP_LEAD, transpose: 7 },
    { inst: 'drums', vol: 1, pat: 'K.hhS.hhK.hhS.hC' },
    { inst: 'drums', vol: 0.5, pat: 'T...t...T...t...' },
  ] },
  midboss3: { name: 'midboss3', bpm: 146, key: 'G', chords: ['Gm', 'Eb', 'Bb', 'F'], channels: [
    { inst: 'bass_square', oct: 2, vol: 1, pat: 'r:1 . r:1 . r+7:1 . r:1 . r:1 . r+10:1 . r+7:1 . r:1 .' },
    { inst: 'harpsi', oct: 4, vol: 0.85, pat: 'c0:1 . c1:1 . c2:1 . c1:1 . c0:1 . c2:1 . c1:1 . c0:1 .' },
    { inst: 'brass', oct: 3, vol: 0.9, pat: 'chord:2 . . chord:2 . . chord:2 . . chord:2 . .' },
    { inst: 'pluck', oct: 4, vol: 1, pat: KILN_LEAD },
    { inst: 'lead_pulse', oct: 4, vol: 0.8, harmony: true, pat: KILN_LEAD, transpose: 7 },
    { inst: 'drums', vol: 0.95, pat: 'K.hhS.h.K.hhS.hC' },
    { inst: 'drums', vol: 0.5, pat: 'T...t...T...t...' },
  ] },
  midboss4: { name: 'midboss4', bpm: 150, key: 'E', chords: ['Em', 'C', 'Am', 'B7'], channels: [
    { inst: 'bass_tri', oct: 2, vol: 1, pat: 'r:2 . . r+7:2 . . r:2 . . r+12:2 . .' },
    { inst: 'organ', oct: 3, vol: 0.5, pat: 'chord:8 . . . . . . . .' },
    { inst: 'lead_saw', oct: 4, vol: 0.9, pat: BALER_LEAD },
    { inst: 'lead_pulse', oct: 4, vol: 0.75, harmony: true, pat: BALER_LEAD, transpose: -5 },
    // the press: the ram on the one and the three, the windlass ticking underneath the whole fight
    { inst: 'drums', vol: 0.9, pat: 'K.......K...S...' },
    { inst: 'drums', vol: 0.7, pat: 'T.t.T.t.T.t.T.t.' },
    { inst: 'drums', vol: 0.45, pat: 'h.h.h.h.h.h.h.h.' },
  ] },
  results: { name: 'results', bpm: 110, key: 'D', chords: ['D', 'G', 'A', 'D'], channels: [
    { inst: 'brass', oct: 3, vol: 1, pat: 'chord:2 . . chord:2 . . chord:2 . . chord:2 . .' },
    { inst: 'lead_pulse', oct: 5, vol: 1.2, pat: RES_LEAD },
    { inst: 'lead_saw', oct: 4, vol: 0.7, harmony: true, pat: RES_LEAD },
    { inst: 'bass_tri', oct: 2, vol: 1, pat: 'r:2 . r+7:1 r:2 . r+12:1 r+7:2 . r:1 r+7:2 . r+12:1' },
    { inst: 'drums', vol: 0.9, pat: 'K.h.S.h.K.h.S.hh' },
  ] },
  gameover: { name: 'gameover', bpm: 66, key: 'D', chords: ['Dm', 'Gm', 'Bb', 'A'], swing: 0, channels: [
    { inst: 'pad', oct: 3, vol: 1, pat: 'chord:32', wide: 12 },
    { inst: 'pluck', oct: 4, vol: 1, pat: GO_LEAD },
    { inst: 'pluck', oct: 5, vol: 0.5, harmony: true, pat: GO_LEAD, transpose: 3 },
    { inst: 'drone', oct: 2, vol: 0.8, pat: 'D2:64 D2:64' },
    { inst: 'drums', vol: 0.8, pat: 'K...............' },
  ] },
};

/** Canonical track names (RECONCILIATION.md). */
export const CANONICAL_TRACKS: readonly string[] = ['title', 'section1', 'section2', 'midboss', 'section3', 'section4', 'boss', 'results', 'gameover'];
