// Shared localStorage probe (ARCHITECTURE.md section 16). Storage is guarded everywhere it is touched:
// private-mode browsers, `file://` pages and storage-blocked embeds throw on read or write. A failure means
// "nothing saved yet" and the game stays fully playable - persistence (progress.js, options.js) is a
// convenience, never a prerequisite.
//
// Safari private mode only throws on WRITE (getItem/removeItem look fine), so the probe writes and removes
// a throwaway key before handing the real localStorage back.

/**
 * localStorage or null when it is unavailable / throws (private mode, file://, blocked embeds).
 * `namespace` names the probe key (`namespace + '.probe'`) so callers with different save keys don't collide.
 * @param {string} namespace
 * @returns {Storage|null}
 */
export function store(namespace) {
  try {
    const s = window.localStorage;
    if (!s) return null;
    const probe = namespace + '.probe';
    s.setItem(probe, '1'); s.removeItem(probe); // Safari private mode only throws on write
    return s;
  } catch (e) { return null; }
}
