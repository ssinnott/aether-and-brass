// Ambient declarations for the two globals the game legitimately touches.
//
// This file is types-only: it is never imported, never bundled, and never loaded by the browser,
// so `src/` stays pure ES modules per ARCHITECTURE.md section 0. It exists so `npm run typecheck`
// does not have to be told to ignore these on every use.

interface Window {
  /** Debug/test hook surface (ARCHITECTURE.md section 12). The only global the game defines. */
  __game?: any;
  /** Safari still ships the prefixed constructors; `engine/audio.js` falls back to them. */
  webkitAudioContext?: typeof AudioContext;
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
}
