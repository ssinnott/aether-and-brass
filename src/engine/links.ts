// Outward links: the one module in the build that navigates anywhere, or hands an address to the
// platform. Everything else the game does happens on the canvas, so this exists for the title's
// SOURCE CODE row and the repository address drawn under it (constants.js REPO_URL / REPO_LABEL),
// and for the lobby's invite link.
//
// Two kinds of zone, because the two addresses want different things:
//
//  - an OPEN zone follows the address in a new tab (the title's repository row), and
//  - a SHARE zone hands it to the phone's share sheet, or failing that the clipboard (the host's
//    invite link). A copy of the game on a home screen has no address bar to copy a link out of,
//    which is the only reason this exists: in a browser tab you would just use the address bar.
//
// Both the share sheet and the clipboard demand a real user gesture, so a SHARE zone is reachable
// by a tap as well as a click - the game's own fixed-step menu press is a rAF callback and would be
// refused. `share()` reports what actually happened, asynchronously, because neither API answers
// straight away (and a share sheet the player dismisses must not read as sent).
//
// The repository link has two ways to follow it, because neither alone reaches every player:
//
//  - A menu row calls `open()` from the fixed step, which serves keyboard, gamepad and the on-screen
//    touch buttons alike. That is a rAF callback rather than an event handler, so a browser that
//    insists on a user gesture may refuse the tab; `open()` reports that honestly and the caller
//    falls back to showing the address on screen.
//  - A mouse click on the drawn address goes through the listener below, which IS a gesture, so it
//    always opens. The screen that draws the address claims the rect in `enter()` and releases it in
//    `exit()`; the zone is in internal 640x360 space like everything else on screen.
//
// An OPEN zone is mouse only: engine/touch.js preventDefaults `touchstart`, so a tap never produces
// a synthetic click here, and a touch player follows the menu row instead. A SHARE zone also takes
// `pointerdown` from a finger, since a menu row cannot do its job for it.
/**
 * @typedef {object} LinkZone
 * @property {number} x left edge in internal px
 * @property {number} y top edge in internal px
 * @property {number} w width in internal px
 * @property {number} h height in internal px
 * @property {string} url the address a click on the rect opens (or shares)
 * @property {boolean} [share] hand the address to the share sheet / clipboard instead of opening it
 * @property {string} [title] what the share sheet calls it
 * @property {(opened: boolean) => void} [onOpen] an open zone: told whether the tab actually opened
 * @property {(how: 'shared'|'copied'|'') => void} [onShare] a share zone: told how it went ('' = not at all)
 */

/** @type {{displayCanvas: HTMLCanvasElement, toInternal(x: number, y: number): {x: number, y: number}}|null} */
let view = null;
/** @type {LinkZone|null} */
let zone = null;
let hot = false;
/** Last mouse position in internal px, so a zone claimed under a resting cursor still lights up. */
let mx = -1, my = -1;

/** @param {{x: number, y: number}} p */
function inZone(p) {
  return !!zone && p.x >= zone.x && p.x < zone.x + zone.w && p.y >= zone.y && p.y < zone.y + zone.h;
}

function setHot(next) {
  if (next === hot) return;
  hot = next;
  const el = view && view.displayCanvas;
  if (el && el.style) el.style.cursor = next ? 'pointer' : '';
}

/** Act on a zone a gesture landed in: share it, or open it. @param {LinkZone} z */
function hit(z) {
  if (z.share) { links.share(z.url, z.title, z.onShare); return; }
  const opened = links.open(z.url);
  if (z.onOpen) z.onOpen(opened);
}

/**
 * Put `url` on the clipboard. The last resort of share(), and refused outside a secure context or a
 * gesture - which is reported rather than assumed.
 * @param {string} url
 * @param {(how: 'copied'|'') => void} tell
 */
function copyToClipboard(url, tell) {
  const clip = typeof navigator !== 'undefined' && navigator.clipboard;
  if (!clip || !clip.writeText) { tell(''); return; }
  try { clip.writeText(url).then(() => tell('copied'), () => tell('')); }
  catch { tell(''); }
}

export const links = {
  /** True while a mouse is resting on the claimed zone, so the screen can light the address up. */
  get hot() { return hot; },

  /**
   * Attach the mouse listeners to the display canvas. Called once at boot (src/main.js), beside
   * `touch.init`, which owns every other pointer on the same element.
   * @param {{displayCanvas: HTMLCanvasElement, toInternal(x: number, y: number): {x: number, y: number}}} v
   */
  init(v) {
    view = v;
    const el = v && v.displayCanvas;
    if (!el || !el.addEventListener) return;
    el.addEventListener('mousemove', (e) => {
      const p = v.toInternal(e.clientX, e.clientY);
      mx = p.x; my = p.y;
      setHot(inZone(p));
    });
    el.addEventListener('mouseleave', () => { mx = -1; my = -1; setHot(false); });
    el.addEventListener('click', (e) => {
      if (!zone || e.button !== 0) return;
      if (!inZone(v.toInternal(e.clientX, e.clientY))) return;
      hit(zone);
    });
    // A finger, for a share zone only. touch.js has its own pointerdown listener on this element and
    // preventDefaults there; that stops the browser panning, not this listener, and does not spend
    // the gesture the share sheet and the clipboard both need.
    el.addEventListener('pointerdown', (e) => {
      if (!zone || !zone.share || e.pointerType === 'mouse') return;
      if (!inZone(v.toInternal(e.clientX, e.clientY))) return;
      hit(zone);
    });
  },

  /**
   * Claim the clickable rect. One zone at a time: only the screen on top of the stack draws an
   * address, and it releases the rect on the way out.
   * @param {LinkZone} z
   */
  setZone(z) {
    zone = z && z.url ? z : null;
    // A zone claimed under a cursor that is already sitting there must light up without waiting for
    // the mouse to move, and one that goes away must never leave the pointer cursor behind.
    setHot(inZone({ x: mx, y: my }));
  },

  /** Release the claimed rect (screens call this from `exit()`). */
  clearZone() { links.setZone(null); },

  /**
   * Hand `url` to the platform: the share sheet where there is one (every phone), the clipboard
   * otherwise (every desktop). MUST be called inside a real gesture - the listeners above are, the
   * fixed step is not.
   *
   * A dismissed share sheet is not a failure to fall back from: the player saw the sheet and closed
   * it, so it reports '' and nothing is copied behind their back.
   * @param {string} url
   * @param {string} [title] what the sheet calls it
   * @param {(how: 'shared'|'copied'|'') => void} [done] how it went, once it is known
   */
  share(url, title, done) {
    const tell = (how) => { if (done) done(how); };
    if (!url) { tell(''); return; }
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav && nav.share) {
        nav.share(title ? { title, url } : { url }).then(
          () => tell('shared'),
          (e) => { if (e && e.name === 'AbortError') tell(''); else copyToClipboard(url, tell); },
        );
        return;
      }
      copyToClipboard(url, tell);
    } catch { tell(''); }
  },

  /**
   * Open `url` in a new tab.
   * @param {string} url
   * @returns {boolean} true if a window was actually opened; false if the browser refused it (a
   *   popup blocker, or a context with no `window.open` at all), which is the caller's cue to put
   *   the address on screen instead.
   */
  open(url) {
    try {
      if (typeof window === 'undefined' || !window.open) return false;
      const w = window.open(url, '_blank');
      if (!w) return false;
      // The new tab has no business reaching back into the game. `noopener` as a window feature
      // would do this too, but it makes window.open return null, and then a blocked popup and a
      // successful one look identical from here.
      try { w.opener = null; } catch { /* cross-origin: the tab has already navigated away */ }
      return true;
    } catch { return false; }
  },
};
