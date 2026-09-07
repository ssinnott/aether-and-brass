// Named palettes and colour helpers. Palette shape: { skin, hair, primary, secondary, accent, metal, dark, glow }.

/** Parse '#rgb' / '#rrggbb' to [r,g,b]. */
export function hexToRgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** [r,g,b] to '#rrggbb'. */
export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
/** Multiply a colour's brightness (f < 1 darker, > 1 lighter). */
export function shade(hex, f) { const [r, g, b] = hexToRgb(hex); return rgbToHex(r * f, g * f, b * f); }
/** Mix two colours by t. */
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
/** 'rgba(...)' string with alpha. */
export function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
/** Return a new palette with every colour shaded by f (used for far limbs). */
export function shadePalette(p, f) {
  const o = {};
  for (const k of Object.keys(p)) o[k] = typeof p[k] === 'string' && p[k][0] === '#' ? shade(p[k], f) : p[k];
  return o;
}
/**
 * Darken AND desaturate a colour (far-side limbs): brightness x f, then pulled `desat` (0..1) toward its own grey,
 * with a slight cool cast so far parts sit behind the near ones instead of merging with them.
 */
export function farShade(hex, f, desat = 0.25) {
  const [r, g, b] = hexToRgb(hex);
  const L = (r * 0.3 + g * 0.59 + b * 0.11) * f;
  const rr = r * f, gg = g * f, bb = b * f;
  return rgbToHex(rr + (L - rr) * desat, gg + (L - gg) * desat, bb + (L - bb) * desat + 6);
}
/** Far-limb palette: every colour through farShade (readability pass: far limbs ~35-40 % darker and greyer). */
export function farPalette(p, f = 0.62, desat = 0.25) {
  const o = {};
  for (const k of Object.keys(p)) o[k] = typeof p[k] === 'string' && p[k][0] === '#' ? farShade(p[k], f, desat) : p[k];
  return o;
}

/** Shared named palettes. Characters/enemies may spread their own; these are starting points. */
export const PALETTES = {
  hero: { skin: '#f0c8a0', hair: '#5a2e18', primary: '#8a3a2a', secondary: '#3a4a6a', accent: '#e2b34a', metal: '#b8b0a0', dark: '#3a2820', glow: '#7ae0ff' },
  engineer: { skin: '#e8b890', hair: '#c8a050', primary: '#3f6a4a', secondary: '#5a4030', accent: '#d8a040', metal: '#c0c8c8', dark: '#2a2018', glow: '#ffd060' },
  duelist: { skin: '#d8a888', hair: '#202030', primary: '#5a3a8a', secondary: '#2a2a3a', accent: '#c0d0e0', metal: '#e0e0f0', dark: '#1a1424', glow: '#c090ff' },
  brawler: { skin: '#c89070', hair: '#2a1a10', primary: '#c86a2a', secondary: '#4a3a30', accent: '#ffe090', metal: '#a89880', dark: '#2a1a14', glow: '#ff9040' },
  goblin: { skin: '#7aa848', hair: '#3a4a20', primary: '#6a4a2a', secondary: '#4a3a30', accent: '#c8a050', metal: '#8a8a80', dark: '#2a2a18', glow: '#a0ff60' },
  goblinRed: { skin: '#98a840', hair: '#3a3a20', primary: '#8a3030', secondary: '#4a3a30', accent: '#e0c060', metal: '#9a9a90', dark: '#2a1a18', glow: '#ff6060' },
  brute: { skin: '#a08878', hair: '#3a2a20', primary: '#4a4a58', secondary: '#6a3a28', accent: '#c88030', metal: '#8a8a90', dark: '#241a1c', glow: '#ff8040' },
  automaton: { skin: '#b8a070', hair: '#8a7a50', primary: '#b89050', secondary: '#6a5a40', accent: '#40e0d0', metal: '#d0b070', dark: '#2a2018', glow: '#40ffe0' },
  guard: { skin: '#e0b898', hair: '#4a3020', primary: '#3a3a4a', secondary: '#6a2a2a', accent: '#c8a050', metal: '#a0a8b0', dark: '#1a1a24', glow: '#ff5050' },
  boss: { skin: '#c0a8a0', hair: '#1a1018', primary: '#5a1a2a', secondary: '#2a2030', accent: '#e0b040', metal: '#9a8a70', dark: '#140c14', glow: '#ff3030' },
};
/** Fetch a palette by name (falls back to hero). */
export function getPalette(name) { return PALETTES[name] || PALETTES.hero; }

/** Stage / environment colours. */
export const ENV = {
  skyTop: '#1a1428', skyMid: '#4a2a48', skyHorizon: '#c86a3a', fog: '#7a5a6a',
  brick: '#5a3a38', brickDark: '#3a2426', stone: '#6a6a72', stoneDark: '#44444c', wood: '#7a5230', woodDark: '#4a3018',
  brass: '#c8a050', brassDark: '#7a5a20', copper: '#b86a3a', iron: '#5a5a62', steamWhite: '#e8f0f4', lamp: '#ffd070',
  floorCobble: '#5c5460', floorCobbleDark: '#3e3842', floorPlank: '#6a4a2c', floorMetal: '#4a4e58',
};
