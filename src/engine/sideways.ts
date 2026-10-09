// A phone held upright plays the game ON ITS SIDE (ARCHITECTURE.md section 3).
//
// The game is 16:9 and a phone held upright is the other way round. The page used to cover the game with TURN
// YOUR DEVICE SIDEWAYS until it was - and a phone with its rotation lock on never is, however it is held, because
// the page stays upright: for that player the notice WAS the game. Now index.html turns the canvas a quarter turn
// clockwise instead (its `(hover: none) and (orientation: portrait)` rule), as wide as the phone, and the player
// turns the phone anticlockwise - top to the left - to play. A phone whose rotation is unlocked turns the page
// landscape as it goes, the rule stops matching, and the game is the right way up whichever way it was turned. An
// installed copy on Android is locked landscape outright (index.html's head script) and never needs any of this.
//
// This module is the other half: a press on a turned canvas has to be measured THROUGH the turn. The canvas
// library's toInternal maps a client point by the element's bounding rect, which for a turned element is the
// turned box - x and y would come out swapped and one of them backwards. turnSideways() wraps it on the view, so
// engine/touch.js and engine/links.js go on asking the view and get internal 640x360 points either way up.
// Whether the canvas IS turned is read off its computed transform rather than the media query again, so the
// mapping follows what the stylesheet actually did - the quarter turn is the only transform it ever gets.
import { VIEW_W, VIEW_H } from '../constants.ts';
import type { Canvas } from '../lib/engine/canvas.ts';

/**
 * Teach `view.toInternal` the quarter turn. main.js calls this once, straight after createCanvas: the touch and
 * link listeners look the mapping up on the view at every event, so they get the wrapped one.
 */
export function turnSideways(view: Canvas): void {
  const flat = view.toInternal, el = view.displayCanvas;
  if (!el || typeof window === 'undefined') return;
  /** The canvas's on-screen box and whether it is turned, read together and kept until the layout can have moved. */
  let rect: DOMRect | null = null, turned = false;
  const drop = () => { rect = null; };
  window.addEventListener('resize', drop);
  window.addEventListener('orientationchange', drop);
  window.addEventListener('scroll', drop, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', drop);
  view.toInternal = (clientX: number, clientY: number) => {
    if (!rect) { rect = el.getBoundingClientRect(); turned = getComputedStyle(el).transform !== 'none'; }
    if (!turned) return flat(clientX, clientY);
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    // A quarter turn clockwise: the game's top-left corner is the turned box's top-right, the game's x runs DOWN
    // the screen and its y runs right to left across it.
    return { x: (clientY - rect.top) * (VIEW_W / rect.height), y: (rect.right - clientX) * (VIEW_H / rect.width) };
  };
}
