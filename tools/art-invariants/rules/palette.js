// Palette / proportion / build-schema invariants (tier: data). Everything here reads only `buildRig(def.build)` and the
// def's own fields — no drawing, no computeJoints — so it is the cheapest tier and runs first.
//
// Enforces docs/ART_STYLE.md sections 0.1, 0.3, 0.4, 0.5, 1, 2, 3, 4, 5, 6 and 9. Every threshold below was DERIVED by
// measuring the stage-1 reference content (the four heroes, the five Brassbound, the five Sootborn and the four stage-1
// boss rigs); the measured range is quoted next to each number in THRESHOLDS. Rules that the guide states literally but
// that FAIL reference content are shipped in a corrected form with the doc bug recorded in DOC_BUGS — never loosened
// silently, and never tuned so the known-bad Stormcrow control passes.
//
// Colour maths (rec-601 luminance, WCAG relative luminance, relative difference d, HSV hue family) is taken from
// helpers.js when the runner supplies it and falls back to the identical local implementations below; each borrowed
// helper is probed against a known vector first, so a helper with different semantics can never silently re-calibrate
// a threshold.
import { buildRig } from '../../../src/art/rig.js';
import { makeTones } from '../../../src/art/shading.js';
import { farShade } from '../../../src/art/palettes.js';
import { FACE } from '../../../src/art/poses.js';
import { CHARACTERS } from '../../../src/content/characters/index.js';
import { BRASSBOUND, SOOTBORN, STORMCROWS } from '../../../src/content/enemies/index.js';
import { BRASS, SOOT, GOB } from '../../../src/content/enemies/common.js';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TIER = 'data';

/** Repo root, resolved from this module (tools/art-invariants/rules/palette.js). */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
/** Content the source-scanning halves of two rules read; findings are reported on the canonical reference subject. */
const CONTENT_DIR = 'src/content';
/** ART_STYLE section 0 names brunhild.js as the canonical reference; repo-wide source findings are anchored there. */
const ANCHOR_SUBJECT = 'brunhild';

// ---------------------------------------------------------------- derived thresholds (measured range in the comment)
const T = {
  /** section 0.1 sleeve/primary separation. Stage-1 range 0.208 (rook #743434 over #5A2A2A) .. 0.727 (brunhild). */
  sleeveD: 0.18,
  /** section 3 near-black outline. Measured WCAG luminance 0.0090 (vane#2 #191622) .. 0.0128 (brassbound #1A1E24). */
  outlineLum: 0.03,
  /** Outline against the rig's LIGHTEST palette colour. Measured 10.54 .. 15.12 over all 28 subjects. */
  outlineContrast: 6.0,
  /** section 0.5 beard vs the garment under it. Rook is the floor: d 0.194, hue 26 deg. */
  beardD: 0.15, beardHue: 20,
  /** section 4 near-miss reporting radius around #4DF0E0 (Sael's legitimate #8FE3FF sits at RGB distance 74). */
  cyanNear: 40,
  /** section 0.8 within-faction divergence. Reference floor: brassbound halberdier/sapper differ in 2 keys. */
  divergeKeys: 2,
  /** section 0.3 / 0.4 / 1 / 9 shading knobs (null = the engine default). */
  thinR: [3.5, 5.5],   // measured 4 (default) .. 5 (hoister, regent)
  hiMin: [5, 8],       // measured 6 (default) .. 7 (hoister, regent)
  flatR: [2, 3.5],     // no content rig sets it; FLAT_R default 2.5
  contactAlpha: 0.25,  // measured 0.3 everywhere except pip 0.42
  farShade: [0.5, 0.7],  // measured 0.62 everywhere except pip 0.55
  farDesat: [0.2, 0.4],  // measured 0.25 everywhere except pip 0.32
  bulge: [0, 1],       // hard engine constraint: drawLimbSegs goes negative-radius above ~4.5
  /** section 2 proportions. */
  headsSquat: [2.6, 3.3],     // measured 2.75 (sootborn) .. 3.14 (cinder hulk)
  headsStandard: [3.8, 5.4],  // measured 3.95 (rook) .. 5.19 (regent engine)
  footL: [10, 14],            // measured 11 .. 13 over all 19 non-boss variants
  footRatioBoss: [0.12, 0.21],// measured 0.133 (vane#2) .. 0.200 (hoister)
  handRatio: 0.40,            // measured 0.42 (sootborn) .. 0.78 (pip's gauntlets)
  sootHeadR: 11,              // measured 11 (hulk) .. 12 (the other four)
  scale: [0.7, 2.6],          // measured 0.77 (wrangler) .. 2.45 (regent engine)
};

/** Guide statements that measurement contradicts. Printed as detail lines; each is a doc bug, not a failing rig. */
const DOC_BUGS = [
  'section 0.1 "every adjacent pair differs by >= 25 % luminance" fails reference (brunhild skin/sleeve 0.05, sael primary/secondary 0.08, every Sootborn) - shipped as the per-class non-regression baseline below.',
  'section 2 heads-tall table is stale: sael 4.26 (doc 3.5-4), pip 4.72 (doc 3), brassbound 4.35-4.41 (doc 3.5), cinder hulk 3.14 (doc 2.5-3).',
  'section 2 scale table is stale: hoister measures 1.90 (doc 2.0), regent engine 2.45 (doc 2.8).',
  'section 3 outline hexes are a guide, not a contract: pip ships #1B1820 against the documented hero #1E1A22.',
  'A literal "outline contrasts >= 4.0 with palette.primary" fails 6 reference rigs (brunhild 1.54, rook 1.47, warden 1.49, wrangler 1.69, grubbik#2 1.69, vane#2 1.07) - the contrast half is asserted against the rig\'s lightest palette colour instead.',
];

/** The 18 part hooks rig.js dispatches on (drawHead / drawTorso / drawArm / drawLeg / drawAccessories in src/art/rig.js). */
const PART_HOOKS = new Set(['head', 'face', 'beard', 'hair', 'hat', 'neck', 'torso', 'hips', 'back', 'shoulder',
  'armUpper', 'armLower', 'hand', 'legUpper', 'legLower', 'foot', 'weapon', 'smear']);
/** The 7 accessory attach points drawAccessories() understands; anything else falls through to the bare root branch. */
const ACCESSORY_ATTACH = new Set(['head', 'torso', 'back', 'hip', 'handR', 'handL', 'root']);
/** Adjacency implied by rig.js's default part -> palette-key assignment. sleeve<->primary is owned by the hard rule. */
const LADDER_PAIRS = [['skin', 'sleeve'], ['skin', 'primary'], ['skin', 'hair'], ['hair', 'primary'],
  ['primary', 'secondary'], ['secondary', 'dark'], ['dark', 'accent']];
/**
 * Per-class, per-pair NON-REGRESSION baseline: max(0, worst stage-1 value - 0.02 slack). Regenerate only in a reviewed
 * commit (tools/art-invariants/rules/palette.js is the snapshot) - an auto-refresh decays the rule to nothing.
 */
const LADDER_BASELINE = {
  'hero': { 'skin/sleeve': 0.026, 'skin/primary': 0.560, 'skin/hair': 0.033, 'hair/primary': 0.085, 'primary/secondary': 0.059, 'secondary/dark': 0.060, 'dark/accent': 0.522 },
  'human-machine': { 'skin/sleeve': 0.148, 'skin/primary': 0.036, 'skin/hair': 0.286, 'hair/primary': 0.270, 'primary/secondary': 0.331, 'secondary/dark': 0.368, 'dark/accent': 0.194 },
  'organic-mook': { 'skin/sleeve': 0, 'skin/primary': 0, 'skin/hair': 0.358, 'hair/primary': 0.094, 'primary/secondary': 0, 'secondary/dark': 0.106, 'dark/accent': 0.054 },
  'boss': { 'skin/sleeve': 0.213, 'skin/primary': 0, 'skin/hair': 0.220, 'hair/primary': 0.327, 'primary/secondary': 0.525, 'secondary/dark': 0.191, 'dark/accent': 0.645 },
};

// ---------------------------------------------------------------- colour maths (mirrored in helpers.js)
const hx = (c) => String(c).toLowerCase();
const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(c);
function rgbOf(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Rec-601 luma, 0..1. */
function lum601(hex) { const [r, g, b] = rgbOf(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
/** Relative luminance difference |La-Lb| / max(La,Lb) — the guide's "% luminance" measure. */
function relDiff(a, b) { const A = lum601(a), B = lum601(b), m = Math.max(A, B); return m === 0 ? 0 : Math.abs(A - B) / m; }
function linear(c) { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
/** WCAG relative luminance (linearised sRGB). */
function wcagLum(hex) { const [r, g, b] = rgbOf(hex); return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b); }
/** WCAG contrast ratio. */
function contrastRatio(a, b) { const A = wcagLum(a), B = wcagLum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); }
/** HSV of a hex ({ h: 0..360, s: 0..1, v: 0..1 }). */
function hsv(hex) {
  const [r0, g0, b0] = rgbOf(hex), r = r0 / 255, g = g0 / 255, b = b0 / 255;
  const mx = Math.max(r, g, b), c = mx - Math.min(r, g, b);
  let h = 0;
  if (c) { h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s: mx ? c / mx : 0, v: mx };
}
/** Shortest hue distance in degrees. */
function hueDelta(a, b) { const x = Math.abs(hsv(a).h - hsv(b).h); return x > 180 ? 360 - x : x; }
/** A hue-family change: >= 40 deg apart with both colours saturated enough for the hue to read. */
function hueFamilyDiffers(a, b) { return hueDelta(a, b) >= 40 && hsv(a).s >= 0.15 && hsv(b).s >= 0.15; }
/** RGB euclidean distance (near-miss reporting only). */
function rgbDistance(a, b) { const A = rgbOf(a), B = rgbOf(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); }

const LOCAL = { lum601, relDiff, wcagLum, contrastRatio, hsv, hueDelta, hueFamilyDiffers, rgbDistance };
/** helpers.js spells two of these differently; borrow them under either name. */
const HELPER_ALIAS = { hsv: 'rgbToHsv', hueFamilyDiffers: 'differentHueFamily' };
/** Known vectors: a borrowed helper must agree with the local formula or the thresholds below are not calibrated for it. */
const PROBE = {
  lum601: (f) => Math.abs(f('#ffffff') - 1) < 1e-6 && Math.abs(f('#743434') - lum601('#743434')) < 1e-6,
  relDiff: (f) => Math.abs(f('#743434', '#5a2a2a') - 0.2077) < 1e-3 && Math.abs(f('#000000', '#ffffff') - 1) < 1e-6,
  wcagLum: (f) => Math.abs(f('#1e1a22') - wcagLum('#1e1a22')) < 1e-6,
  contrastRatio: (f) => Math.abs(f('#000000', '#ffffff') - 21) < 0.01,
  hsv: (f) => Math.abs(f('#ff0000').h) < 1e-6 && Math.abs(f('#ff0000').s - 1) < 1e-6,
  hueDelta: (f) => Math.abs(f('#ff0000', '#00ff00') - 120) < 1e-6,
  hueFamilyDiffers: (f) => f('#ff0000', '#00ff00') === true && f('#ff0000', '#ff2000') === false,
  rgbDistance: (f) => Math.abs(f('#000000', '#0000ff') - 255) < 1e-6,
};
/**
 * Resolve the shared colour maths: helpers.js first (the harness contract keeps it in one place), local fallback when a
 * helper is missing or fails its probe.
 * @param {object} [helpers] the runner's helpers module
 * @returns {object} { lum601, relDiff, wcagLum, contrastRatio, hsv, hueDelta, hueFamilyDiffers, rgbDistance }
 */
export function colourMaths(helpers) {
  const out = {};
  for (const k of Object.keys(LOCAL)) {
    const name = helpers && typeof helpers[k] === 'function' ? k : HELPER_ALIAS[k];
    const f = helpers && name && typeof helpers[name] === 'function' ? helpers[name] : null;
    let ok = false;
    if (f) { try { ok = PROBE[k](f); } catch { ok = false; } }
    out[k] = ok ? f : LOCAL[k];
  }
  return out;
}

// ---------------------------------------------------------------- subject helpers
/** Faction class a subject's baselines and bands are keyed by; mirrors helpers.classOf(). */
const CLASS_BY_TYPE = { brassbound: 'human-machine', stormcrow: 'human-machine', sootborn: 'organic-mook' };
function classOf(subject, helpers) {
  if (subject.class) return subject.class;
  if (helpers && typeof helpers.classOf === 'function') return helpers.classOf(subject);
  const def = subject.def || {}, t = def.type;
  if (subject.kind === 'character') return 'hero';
  if (subject.kind === 'boss-phase' || def.boss || t === 'midboss' || t === 'boss' || t === 'midboss2' || t === 'boss2') return 'boss';
  return CLASS_BY_TYPE[t] || 'organic-mook';
}
const isBoss = (subject, helpers) => classOf(subject, helpers) === 'boss';
/** Hex-valued palette keys of a built rig. */
const hexKeys = (pal) => Object.keys(pal).filter((k) => isHex(pal[k]));

const groupCache = new Map();
/**
 * The subject's faction roster (heroes count as one faction), rebuilt from the content registries so a rule can compare
 * a variant against its siblings without the runner passing the whole subject list. Boss phases are their own character
 * across phases and get no group.
 * @returns {Array<{id: string, name: string, def: object, build: object, rig: object}>}
 */
function factionGroup(subject, helpers) {
  const cls = classOf(subject, helpers);
  if (cls === 'boss') return [];
  const key = subject.kind === 'character' ? 'hero' : subject.def.type;
  if (!groupCache.has(key)) {
    const defs = key === 'hero' ? CHARACTERS
      : key === 'brassbound' ? BRASSBOUND : key === 'sootborn' ? SOOTBORN : key === 'stormcrow' ? STORMCROWS : [];
    groupCache.set(key, defs.map((d) => ({
      id: d.type ? `${d.type}:${d.variant}` : d.id, name: d.name, def: d, build: d.build, rig: buildRig(d.build),
    })));
  }
  return groupCache.get(key);
}

let sourceCache = null;
/** Every .js file under src/content, read once: [{ path, text }]. */
function contentSources() {
  if (sourceCache) return sourceCache;
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(ROOT + dir).sort()) {
      const rel = `${dir}/${name}`;
      if (statSync(ROOT + rel).isDirectory()) walk(rel);
      else if (name.endsWith('.js')) out.push({ path: rel, text: readFileSync(ROOT + rel, 'utf8') });
    }
  };
  walk(CONTENT_DIR);
  sourceCache = out;
  return out;
}
/** Grep the content sources: [{ path, line, text }]. */
function grepContent(re) {
  const hits = [];
  for (const f of contentSources()) {
    f.text.split('\n').forEach((line, i) => { if (re.test(line)) hits.push({ path: f.path, line: i + 1, text: line.trim() }); });
    re.lastIndex = 0;
  }
  return hits;
}
/** True when this subject is the one repo-wide source findings are reported on (section 0's canonical reference). */
const isAnchor = (subject) => subject.id === ANCHOR_SUBJECT;

/** Shared closed lists: helpers.js owns them (next to a comment pointing at rig.js's dispatch); local copies are the fallback. */
function schemaLists(helpers) {
  const set = (v, fallback) => (Array.isArray(v) && v.length ? new Set(v) : fallback);
  return {
    hooks: set(helpers && helpers.PART_HOOKS, PART_HOOKS),
    attach: set(helpers && helpers.ACCESSORY_ATTACH, ACCESSORY_ATTACH),
    weaponAttach: set(helpers && helpers.WEAPON_ATTACH, new Set(['handR', 'handL'])),
    faces: (helpers && Array.isArray(helpers.FACE_NAMES) && helpers.FACE_NAMES.length) ? helpers.FACE_NAMES : Object.keys(FACE),
  };
}
/** The value-ladder pairs as [a, b] palette keys (helpers.LADDER_PAIRS carries the same list with part-name ids). */
function ladderPairs(helpers) {
  const shared = helpers && helpers.LADDER_PAIRS;
  if (Array.isArray(shared) && shared.length) return shared.map((p) => [p.a, p.b, p.id]);
  return LADDER_PAIRS.map(([a, b]) => [a, b, `${a}/${b}`]);
}

const fmt = (n, d = 3) => Number(n).toFixed(d);
const finding = (message, detail, where) => ({ message, detail, where });

// ---------------------------------------------------------------- rules
export const RULES = [
  {
    id: 'palette/sleeve-vs-primary',
    section: 'ART_STYLE §0.1',
    severity: 'error',
    describe: 'Give the sleeve a colour that separates from the torso primary.',
    check(subject, helpers) {
      const M = colourMaths(helpers), pal = subject.rig.palette;
      const sleeve = hx(pal.sleeve), primary = hx(pal.primary), skin = hx(pal.skin);
      // buildRig defaults palette.sleeve to palette.primary, so read the BUILT rig: an unset sleeve must fail, not skip.
      const bare = sleeve === skin; // the documented bare-arms case (sootborn:hulk paints tunic, arms and body one green)
      const d = M.relDiff(sleeve, primary);
      const detail = `sleeve ${sleeve} vs primary ${primary} (skin ${skin}): d=${fmt(d)}, bound ${T.sleeveD}`
        + `${bare ? '; sleeve === skin (bare arms, exempt by section 0.1)' : ''}`
        + `${subject.build.palette && subject.build.palette.sleeve ? '' : '; build.palette.sleeve is UNSET (buildRig copied primary)'}`;
      if (bare) return [];
      if (sleeve === primary) return [finding('palette.sleeve equals palette.primary — the arms blob into the torso', detail, 'rig.palette.sleeve')];
      if (d < T.sleeveD) return [finding(`sleeve/primary luminance separation ${fmt(d)} is under ${T.sleeveD}`, detail, 'rig.palette.sleeve')];
      return [];
    },
  },
  {
    id: 'palette/outline',
    section: 'ART_STYLE §1, §3',
    severity: 'error',
    describe: 'Outline every rig with a 1 px near-black stroke colour.',
    check(subject, helpers) {
      const M = colourMaths(helpers), rig = subject.rig, out = [];
      const ol = hx(rig.outline), pal = rig.palette;
      const lit = hexKeys(pal).reduce((a, k) => (M.wcagLum(pal[k]) > M.wcagLum(pal[a]) ? k : a), hexKeys(pal)[0]);
      const cr = M.contrastRatio(ol, pal[lit]);
      const detail = `outline ${ol}: width ${rig.ow}, WCAG luminance ${fmt(M.wcagLum(ol), 4)} (bound <= ${T.outlineLum}), `
        + `contrast ${fmt(cr, 2)} against the lightest palette key ${lit} ${hx(pal[lit])} (bound >= ${T.outlineContrast}); `
        + `contrast against primary ${hx(pal.primary)} is ${fmt(M.contrastRatio(ol, pal.primary), 2)} (reported, not asserted — see DOC_BUGS)`;
      if (rig.ow !== 1) out.push(finding(`outline width is ${rig.ow}, not 1 px`, detail, 'build.outlineWidth'));
      else if (subject.build.outlineWidth != null && subject.build.outlineWidth !== 1) out.push(finding(`build.outlineWidth is ${subject.build.outlineWidth}, not 1`, detail, 'build.outlineWidth'));
      if (!isHex(rig.outline)) out.push(finding(`build.outline ${rig.outline} is not a hex colour`, detail, 'build.outline'));
      else {
        if (M.wcagLum(ol) > T.outlineLum) out.push(finding(`outline ${ol} is not near-black (luminance ${fmt(M.wcagLum(ol), 4)} > ${T.outlineLum})`, detail, 'build.outline'));
        if (cr < T.outlineContrast) out.push(finding(`outline ${ol} does not read against the rig's lightest colour (contrast ${fmt(cr, 2)} < ${T.outlineContrast})`, detail, 'build.outline'));
      }
      if (!out.length) return [];
      return out;
    },
  },
  {
    id: 'palette/value-ladder-adjacent',
    section: 'ART_STYLE §0.1, §3',
    severity: 'warn',
    describe: 'Keep adjacent parts separated by value or hue family, and never worse than the reference for that pair.',
    check(subject, helpers) {
      const M = colourMaths(helpers), pal = subject.rig.palette, cls = classOf(subject, helpers);
      const table = LADDER_BASELINE[cls];
      const rows = [], out = [];
      for (const [a, b, id] of ladderPairs(helpers)) {
        const key = `${a}/${b}`;
        if (!isHex(pal[a]) || !isHex(pal[b])) continue;
        const d = M.relDiff(pal[a], pal[b]), hd = M.hueDelta(pal[a], pal[b]), fam = M.hueFamilyDiffers(pal[a], pal[b]);
        // an unclassified faction is held to the most lenient reference baseline for the pair, never to nothing
        const base = table ? table[key] : Math.min(...Object.values(LADDER_BASELINE).map((t) => t[key]));
        rows.push(`${id} (${key}) ${hx(pal[a])}/${hx(pal[b])} d=${fmt(d, 2)} hue=${hd.toFixed(0)}${fam ? '*' : ' '} baseline=${fmt(base, 3)}`);
        if (d < base && !fam) out.push({ key, id, d, base, hd });
      }
      const detail = `class ${cls}${table ? '' : ' (no baseline of its own — held to the most lenient reference baseline per pair)'}\n  ` + rows.join('\n  ');
      return out.map((f) => finding(
        `${f.id} value separation ${fmt(f.d)} is worse than the ${cls} reference baseline ${fmt(f.base)} (hue delta ${f.hd.toFixed(0)} deg, no hue-family change)`,
        detail, `rig.palette.${f.key.split('/')[0]}`));
    },
  },
  {
    id: 'palette/beard-vs-garment',
    section: 'ART_STYLE §0.5, §6',
    severity: 'warn',
    describe: 'Separate a beard\'s colour from the garment beneath it.',
    check(subject, helpers) {
      const M = colourMaths(helpers), parts = subject.build.parts || {}, pal = subject.rig.palette;
      // parts.beard is the documented hook; a face hook whose function name says 'beard' (brunhild's drawFaceBeard) paints
      // one too. Both forms assume the beard is palette.hair — see the note in `detail`.
      const viaBeard = typeof parts.beard === 'function';
      const viaFace = typeof parts.face === 'function' && /beard/i.test(parts.face.name || '');
      if (!viaBeard && !viaFace) return [];
      const d = M.relDiff(pal.hair, pal.primary), hd = M.hueDelta(pal.hair, pal.primary);
      const detail = `beard hook ${viaBeard ? 'parts.beard' : `parts.face (${parts.face.name})`}: hair ${hx(pal.hair)} vs primary ${hx(pal.primary)} `
        + `d=${fmt(d)} (bound ${T.beardD}), hue delta ${hd.toFixed(0)} deg (bound ${T.beardHue}); rook is the calibration floor at d 0.194 / hue 26.\n`
        + '  Note: this assumes the beard hook paints palette.hair. A hook painting a local constant goes unseen here — the geometry '
        + 'recorder would have to read the first non-outline fill inside the wrapped hook.';
      if (d >= T.beardD || hd >= T.beardHue) return [];
      return [finding(`beard colour ${hx(pal.hair)} does not separate from the garment ${hx(pal.primary)} (d ${fmt(d)}, hue ${hd.toFixed(0)} deg)`, detail, 'rig.palette.hair')];
    },
  },
  {
    id: 'palette/faction-signature',
    section: 'ART_STYLE §4',
    severity: 'error',
    describe: 'Require each faction\'s per-variant signature field to be present, a hex, and distinct.',
    check(subject, helpers) {
      const out = [], build = subject.build, type = subject.def && subject.def.type;
      const group = factionGroup(subject, helpers);
      const signature = (field, label) => {
        const v = build[field];
        if (v == null) { out.push(finding(`build.${field} is missing — the ${label} silently falls back to the faction default`, `every ${type} variant must set build.${field}`, `build.${field}`)); return; }
        if (!isHex(v)) { out.push(finding(`build.${field} ${v} is not a #rrggbb hex`, `${label} must be a hex colour`, `build.${field}`)); return; }
        const clash = group.filter((g) => g.id !== subject.id && isHex(g.build[field]) && hx(g.build[field]) === hx(v)).map((g) => g.id);
        const roster = group.map((g) => `${g.id}=${g.build[field] == null ? 'MISSING' : hx(g.build[field])}`).join(', ');
        if (clash.length) out.push(finding(`build.${field} ${hx(v)} is shared with ${clash.join(', ')} — the ${label} no longer identifies the variant`, `faction roster: ${roster}`, `build.${field}`));
      };
      if (type === 'brassbound') {
        signature('stripe', 'regiment stripe');
        // section 4's faction base constants, as an exact regression guard
        const want = { steel: '#7F8C99', darkSteel: '#4A5563', brass: '#C89B3C', lens: '#4DF0E0' };
        for (const k of Object.keys(want)) {
          if (hx(BRASS[k]) !== hx(want[k])) out.push(finding(`BRASS.${k} is ${BRASS[k]}, not the documented ${want[k]}`, 'src/content/enemies/common.js holds the Brassbound base colours (ART_STYLE 4)', `common.js BRASS.${k}`));
        }
      } else if (type === 'sootborn') {
        signature('clan', 'clan colour');
        if (hx(subject.rig.palette.accent) !== '#c89b3c') {
          out.push(finding(`Sootborn accent ${hx(subject.rig.palette.accent)} is not the brass badge #C89B3C`, 'ART_STYLE 4: warm soot + clan colour + the brass badge', 'rig.palette.accent'));
        }
        const want = { skin: '#6BA84F', shade: '#3F6B2E', rags: '#5A4A3A' };
        for (const k of Object.keys(want)) {
          if (hx(SOOT[k]) !== hx(want[k])) out.push(finding(`SOOT.${k} is ${SOOT[k]}, not the documented ${want[k]}`, 'src/content/enemies/common.js holds the Sootborn base colours (ART_STYLE 4)', `common.js SOOT.${k}`));
          if (hx(GOB[k]) !== hx(want[k])) out.push(finding(`GOB.${k} is ${GOB[k]}, not the documented ${want[k]}`, 'src/content/enemies/common.js holds the goblin rig palette (ART_STYLE 4)', `common.js GOB.${k}`));
        }
      } else if (type === 'stormcrow') {
        // the Stormcrows reuse `clan` for their watch colour; distinctness is reported, not asserted, for this faction
        const v = build.clan;
        if (v == null) out.push(finding('build.clan is missing — the watch colour falls back to the faction default', 'every stormcrow variant must set build.clan', 'build.clan'));
        else if (!isHex(v)) out.push(finding(`build.clan ${v} is not a #rrggbb hex`, 'the watch colour must be a hex colour', 'build.clan'));
      }
      return out;
    },
  },
  {
    id: 'palette/aether-cyan-concordat',
    section: 'ART_STYLE §4',
    severity: 'error',
    describe: 'Reserve aether cyan #4DF0E0 for Concordat machinery; heroes never wear it.',
    check(subject, helpers) {
      const M = colourMaths(helpers), out = [], rig = subject.rig, CYAN = '#4df0e0';
      const cls = classOf(subject, helpers), type = subject.def && subject.def.type;
      // (a) data half: expand both palettes through the rig's own ramp and look for the exact string
      const seen = new Map();
      for (const pal of [rig.palette, rig.paletteFar]) {
        for (const k of hexKeys(pal)) {
          for (const [tone, c] of Object.entries(makeTones(pal[k], rig.ramp))) {
            const s = hx(c);
            if (!seen.has(s)) seen.set(s, `${pal === rig.palette ? 'palette' : 'paletteFar'}.${k}.${tone}`);
          }
        }
      }
      const near = [...seen.entries()].filter(([c]) => c !== CYAN && M.rgbDistance(c, CYAN) <= T.cyanNear)
        .map(([c, w]) => `${c} (${w}) at RGB distance ${M.rgbDistance(c, CYAN).toFixed(0)}`);
      const forbidden = cls === 'hero' || type === 'sootborn' || type === 'stormcrow';
      const detail = `${forbidden ? 'non-Concordat subject' : 'Concordat-adjacent subject (cyan permitted)'}; `
        + `near-misses within RGB distance ${T.cyanNear}: ${near.length ? near.join(', ') : 'none'}`;
      if (forbidden && seen.has(CYAN)) out.push(finding(`aether cyan #4DF0E0 appears in this rig (${seen.get(CYAN)}) — it is Concordat-only`, detail, seen.get(CYAN)));
      // (b) source half: every #4DF0E0 under src/content must sit in a Concordat file. Reported on the canonical subject.
      if (isAnchor(subject)) {
        const ALLOWED = ['src/content/enemies/common.js', 'src/content/enemies/brassbound.js', 'src/content/enemies/midboss.js', 'src/content/enemies/boss.js'];
        const hits = grepContent(/#4DF0E0/i);
        const bad = hits.filter((h) => !ALLOWED.includes(h.path));
        const where = hits.map((h) => `${h.path}:${h.line}`).join(', ');
        for (const h of bad) out.push(finding(`#4DF0E0 is used outside Concordat machinery (${h.path}:${h.line})`, `allowed content files: ${ALLOWED.join(', ')}; all hits: ${where}`, `${h.path}:${h.line}`));
      }
      return out;
    },
  },
  {
    id: 'palette/faction-variant-divergence',
    section: 'ART_STYLE §0.8, §4',
    severity: 'warn',
    describe: 'Give each variant in a faction a palette that differs from its siblings.',
    check(subject, helpers) {
      const group = factionGroup(subject, helpers);
      if (group.length < 2) return [];
      const out = [], mine = subject.rig.palette, rows = [];
      for (const other of group) {
        // emit once per pair, from the lexicographically first subject of the two
        if (other.id === subject.id || other.id < subject.id) continue;
        const pal = other.rig.palette;
        const keys = [...new Set([...Object.keys(mine), ...Object.keys(pal)])].filter((k) => isHex(mine[k]) || isHex(pal[k]));
        const diff = keys.filter((k) => hx(mine[k]) !== hx(pal[k]));
        const core = diff.filter((k) => k === 'primary' || k === 'sleeve' || k === 'skin');
        rows.push(`${subject.id} vs ${other.id}: ${diff.length} keys differ [${diff.join(', ')}], core [${core.join(', ') || 'none'}]`);
        if (diff.length < T.divergeKeys) out.push([other.id, `only ${diff.length} palette key(s) differ (bound ${T.divergeKeys})`]);
        else if (!core.length) out.push([other.id, 'no difference in primary, sleeve or skin — the variants read as one paint job']);
      }
      const detail = rows.join('\n  ');
      return out.map(([id, why]) => finding(`palette is too close to ${id}: ${why}`, detail, 'rig.palette'));
    },
  },
  {
    id: 'palette/shading-knobs',
    section: 'ART_STYLE §0.3, §0.4, §1, §9',
    severity: 'error',
    describe: 'Keep the renderer\'s shading and far-limb knobs inside their authored bands.',
    check(subject) {
      const rig = subject.rig, build = subject.build, out = [];
      const band = (label, value, [lo, hi], where) => {
        if (value == null) return;
        if (value < lo || value > hi) out.push(finding(`${label} is ${value}, outside the authored band ${lo}..${hi}`, detail, where));
      };
      const fs = build.farShade != null ? build.farShade : 0.62, fd = build.farDesat != null ? build.farDesat : 0.25;
      const detail = `thinR=${rig.thinR == null ? 'default 4' : rig.thinR} hiMin=${rig.hiMin == null ? 'default 6' : rig.hiMin} `
        + `flatR=${rig.flatR == null ? 'default 2.5' : rig.flatR} shading=${rig.shading} snap=${rig.snap} contactAlpha=${rig.contactAlpha} `
        + `bulge=${rig.p.bulge} farShade=${fs} farDesat=${fd} tones=${rig.tonesN}`;
      band('build.thinR', rig.thinR, T.thinR, 'build.thinR');
      band('build.hiMin', rig.hiMin, T.hiMin, 'build.hiMin');
      band('build.flatR', rig.flatR, T.flatR, 'build.flatR');
      band('build.farShade', fs, T.farShade, 'build.farShade');
      band('build.farDesat', fd, T.farDesat, 'build.farDesat');
      band('proportions.bulge', rig.p.bulge, T.bulge, 'build.proportions.bulge');
      if (rig.shading !== true) out.push(finding('build.shading is false — flat fills are a bench knob, not a shipping rig', detail, 'build.shading'));
      if (rig.snap !== true) out.push(finding('build.snap is false — joints must snap to whole pixels at 1x (section 1)', detail, 'build.snap'));
      if (!(rig.contactAlpha >= T.contactAlpha)) out.push(finding(`contact-shadow alpha ${rig.contactAlpha} is under ${T.contactAlpha} (build.contactShadow)`, detail, 'build.contactShadow'));
      // engine guard: buildRig derives paletteFar; only a def that hand-rolls its own far palette can break this
      for (const k of hexKeys(rig.palette)) {
        const want = farShade(rig.palette[k], fs, fd);
        if (hx(rig.paletteFar[k]) !== hx(want)) out.push(finding(`paletteFar.${k} is ${hx(rig.paletteFar[k])}, not farShade(${hx(rig.palette[k])}, ${fs}, ${fd}) = ${hx(want)}`, detail, `rig.paletteFar.${k}`));
      }
      return out;
    },
  },
  {
    id: 'palette/proportions',
    section: 'ART_STYLE §2',
    severity: 'warn',
    describe: 'Keep rig proportions inside the archetype band the faction belongs to.',
    check(subject, helpers) {
      const rig = subject.rig, p = rig.p, out = [], type = subject.def && subject.def.type;
      const heads = rig.height / (p.headR * 2), boss = isBoss(subject, helpers), ratio = p.footL / rig.height;
      const detail = `height ${fmt(rig.height, 1)} px at scale ${rig.scale}, headR ${p.headR} -> ${fmt(heads, 2)} heads tall; `
        + `footL ${p.footL} (${fmt(ratio, 3)} of height); handR ${p.handR} (${fmt(p.handR / p.headR, 2)} of headR); bulge ${p.bulge}\n  `
        + `bands: squat ${T.headsSquat.join('-')}, standard humanoid ${T.headsStandard.join('-')}; `
        + `${boss ? `boss footL/height ${T.footRatioBoss.join('-')}` : `footL ${T.footL.join('-')}`}; handR/headR >= ${T.handRatio}\n  `
        + `doc note: ${DOC_BUGS[1]} ${DOC_BUGS[2]}`;
      const squat = heads >= T.headsSquat[0] && heads <= T.headsSquat[1];
      const standard = heads >= T.headsStandard[0] && heads <= T.headsStandard[1];
      if (!squat && !standard) {
        const gap = heads > T.headsSquat[1] && heads < T.headsStandard[0];
        if (!gap) out.push(finding(`${fmt(heads, 2)} heads tall is outside both archetype bands (squat ${T.headsSquat.join('-')}, standard ${T.headsStandard.join('-')})`, detail, 'build.proportions.headR'));
        else out.push(finding(`${fmt(heads, 2)} heads tall lands between the archetypes (${T.headsSquat[1]}-${T.headsStandard[0]}) — commit to squat or standard`, detail, 'build.proportions.headR'));
      }
      if (boss) {
        if (ratio < T.footRatioBoss[0] || ratio > T.footRatioBoss[1]) out.push(finding(`footL/height ${fmt(ratio, 3)} is outside the boss band ${T.footRatioBoss.join('-')}`, detail, 'build.proportions.footL'));
      } else if (p.footL < T.footL[0] || p.footL > T.footL[1]) {
        out.push(finding(`footL ${p.footL} is outside ${T.footL.join('-')} (section 2)`, detail, 'build.proportions.footL'));
      }
      if (p.handR / p.headR < T.handRatio) out.push(finding(`handR ${p.handR} is small against headR ${p.headR} (${fmt(p.handR / p.headR, 2)} < ${T.handRatio}) — fists must read from across the screen`, detail, 'build.proportions.handR'));
      if (type === 'sootborn' && p.headR < T.sootHeadR) out.push(finding(`Sootborn headR ${p.headR} is under ${T.sootHeadR} — the big head is faction identity (section 2)`, detail, 'build.proportions.headR'));
      if (rig.scale < T.scale[0] || rig.scale > T.scale[1]) out.push(finding(`build.scale ${rig.scale} is outside ${T.scale.join('-')}`, detail, 'build.scale'));
      // bulge only reaches the canvas through drawLimbSegs, i.e. on rigs that do NOT hook their limb parts; asserting it
      // on a hooked rig (pip, the Brassbound, the boss base builds) would be asserting a dead field.
      const hooks = subject.build.parts || {};
      const limbsHooked = (hooks.armUpper || hooks.armLower) && (hooks.legUpper || hooks.legLower);
      if (type === 'brassbound' && p.bulge !== 0) out.push(finding(`Brassbound bulge ${p.bulge} must be 0 — machine limbs are rigid (section 2)`, detail, 'build.proportions.bulge'));
      if (!limbsHooked && type !== 'brassbound' && !(p.bulge > 0)) out.push(finding(`bulge ${p.bulge} on an engine-tapered rig: organic limbs swell at the joint (section 2)`, detail, 'build.proportions.bulge'));
      return out;
    },
  },
  {
    id: 'palette/build-schema',
    section: 'ART_STYLE §5',
    severity: 'error',
    describe: 'Use only the documented part-hook names, accessory shapes and weapon fields.',
    check(subject, helpers) {
      const L = schemaLists(helpers), build = subject.build, out = [], parts = build.parts || {};
      const detail = `parts [${Object.keys(parts).join(', ')}]; accessories ${(build.accessories || []).length}; `
        + `weapon ${build.weapon ? `{ attach: ${build.weapon.attach}, length: ${build.weapon.length}, headAt: ${build.weapon.headAt} }` : 'none'}\n  `
        + `rig.js dispatches on exactly these hooks: ${[...L.hooks].join(' ')}\n  `
        + `drawAccessories() understands exactly these attach points: ${[...L.attach].join(' ')}`;
      for (const k of Object.keys(parts)) {
        if (!L.hooks.has(k)) out.push(finding(`build.parts.${k} is not a part hook rig.js dispatches on — it renders as the default with no error`, detail, `build.parts.${k}`));
        else if (typeof parts[k] !== 'function') out.push(finding(`build.parts.${k} is ${typeof parts[k]}, not a draw function`, detail, `build.parts.${k}`));
      }
      (build.accessories || []).forEach((a, i) => {
        const at = a.attach || 'torso';
        if (typeof a.draw !== 'function') out.push(finding(`accessory ${i} has no draw function`, detail, `build.accessories[${i}].draw`));
        if (!L.attach.has(at)) out.push(finding(`accessory ${i} attach '${at}' is unrecognised — it falls through to the root branch and renders at the feet`, detail, `build.accessories[${i}].attach`));
        if (a.layer !== undefined && a.layer !== 'back') out.push(finding(`accessory ${i} layer '${a.layer}' is not 'back'`, detail, `build.accessories[${i}].layer`));
      });
      const w = build.weapon;
      if (w) {
        if (!L.weaponAttach.has(w.attach)) out.push(finding(`weapon attach '${w.attach}' must be handR or handL`, detail, 'build.weapon.attach'));
        if (typeof w.length !== 'number' || !(w.length > 0)) out.push(finding(`weapon length ${w.length} must be a positive number — an omitted length silently takes the 30 px default and mis-places FX`, detail, 'build.weapon.length'));
        if (typeof w.draw !== 'function' && typeof parts.weapon !== 'function') out.push(finding('weapon has neither a draw function nor a parts.weapon hook', detail, 'build.weapon.draw'));
        if (w.twoHanded !== undefined && typeof w.twoHanded !== 'boolean') out.push(finding(`weapon twoHanded ${w.twoHanded} must be a boolean`, detail, 'build.weapon.twoHanded'));
        if (w.grip !== undefined && typeof w.grip !== 'number') out.push(finding(`weapon grip ${w.grip} must be a number`, detail, 'build.weapon.grip'));
        if (w.headAt !== undefined && !(typeof w.headAt === 'number' && w.headAt > 0 && w.headAt <= (w.length || 30))) {
          out.push(finding(`weapon headAt ${w.headAt} must be inside (0, length ${w.length}] — the pose audit measures the weapon head from it`, detail, 'build.weapon.headAt'));
        }
      }
      // every authored face resolves to an index P() can keep (a typo collapses to 0 at build time and is invisible)
      const names = L.faces;
      for (const [name, anim] of Object.entries(subject.anims || {})) {
        (anim.frames || []).forEach((f, i) => {
          const v = f.pose && f.pose.face;
          if (v === undefined) return;
          if (!Number.isInteger(v) || v < 0 || v > 7) out.push(finding(`${name}[${i}] pose.face ${JSON.stringify(v)} does not resolve to a FACE index 0..7`, `FACE: ${names.join(', ')}`, `anims.${name}.frames[${i}].pose.face`));
        });
      }
      if (isAnchor(subject)) {
        // Only a KEYFRAME's face is a FACE name. `face` is also a legitimate build-config field elsewhere -- the
        // Chandlery's rig switches on chand.face ('none' | 'bare' | masked) to pick a skull treatment -- and those
        // objects never reach P(), so validating them against the FACE enum is a false positive. A keyframe is
        // recognised by the company it keeps: a pose builder call, or another pose key on the same line.
        const POSE_CONTEXT = /\b(?:K|P|FK)\(|\b(?:legR|legL|armR|armL|torso|head|root|squash|stretch|grip|weapon)\s*:/;
        for (const h of grepContent(/face:\s*'[^']*'/)) {
          if (!POSE_CONTEXT.test(h.text)) continue;
          for (const m of h.text.match(/face:\s*'[^']*'/g) || []) {
            const nm = m.replace(/face:\s*'/, '').replace(/'$/, '');
            if (!names.includes(nm)) out.push(finding(`face: '${nm}' at ${h.path}:${h.line} is not a FACE name (P() collapses it to 0 at build time)`, `FACE: ${names.join(', ')}`, `${h.path}:${h.line}`));
          }
        }
      }
      return out;
    },
  },
];

/** The derived thresholds and the doc bugs behind them, for the runner's --json report and for review. */
export const THRESHOLDS = T;
export { DOC_BUGS, LADDER_BASELINE };
