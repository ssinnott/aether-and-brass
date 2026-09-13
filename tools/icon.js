// App icons, drawn in code like everything else (ARCHITECTURE section 0: zero binary assets).
// Nothing here is committed: tools/pwa.js renders these at build time into dist/icons/, and
// tools/server.js renders them on demand in dev, so the repository stays free of image files.
//
// The emblem is a brass cog with an aether core: eight teeth, four spokes, a lit hub, over a dark
// plum ground. It is a field function sampled with 4x4 supersampling rather than a path drawn by a
// rasteriser, because the only drawing surface Node has is arithmetic.
import zlib from 'node:zlib';

/** Palette, kept in step with constants.js UI by eye (this file cannot import an ES module of the game). */
const BRASS = [0xe2, 0xb3, 0x4a];
const AETHER = [0x3f, 0xd0, 0xff];
const CORE_HOT = [0xdf, 0xfa, 0xff];
const GROUND_IN = [0x1b, 0x10, 0x30];
const GROUND_OUT = [0x08, 0x05, 0x0e];

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
/** Linear blend, `t` = how much of `b`. */
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Smooth 0..1 ramp as `x` travels from `edge0` to `edge1`. */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Colour at one point of the emblem.
 * @param {number} nx -1..1 across the emblem (not the image)
 * @param {number} ny -1..1 down the emblem
 * @returns {number[]} [r, g, b], 0..255 floats
 */
function sample(nx, ny) {
  const r = Math.hypot(nx, ny);
  const a = Math.atan2(ny, nx);

  // Ground: a slight lift in the middle so the cog sits on something rather than on flat black.
  let rgb = mix(GROUND_IN, GROUND_OUT, smoothstep(0.1, 1.25, r));

  // Brass body. Eight teeth push the rim out; inside the rim a cross of spokes reaches the hub.
  const rim = Math.cos(8 * a) > 0.35 ? 0.99 : 0.82;
  const onRim = r <= rim && r >= 0.50;
  const onSpoke = r < 0.52 && (Math.abs(nx) < 0.085 || Math.abs(ny) < 0.085);
  const onHub = r < 0.30 && r > 0.17;
  if (onRim || onSpoke || onHub) {
    // Lit from above: the top of every part is brassLight, the bottom brassDark.
    rgb = BRASS.map((c) => c * (1.18 - 0.40 * ((ny + 1) / 2)));
  }

  // Aether core: a glassy glow in the hub, over whatever is underneath it.
  const glow = smoothstep(0.30, 0.04, r);
  if (glow > 0) rgb = mix(rgb, r < 0.07 ? CORE_HOT : AETHER, glow);
  return rgb;
}

/**
 * Render the emblem as raw RGB pixels.
 * @param {number} size edge length in px
 * @param {number} fill emblem diameter as a fraction of the edge (a maskable icon wants ~0.62,
 *                      so the whole emblem survives a circular crop; a plain icon can run wider)
 */
function pixels(size, fill) {
  const out = Buffer.alloc(size * size * 3);
  const half = size / 2;
  const radius = half * fill;
  const SS = 4; // samples per axis
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS - half;
          const py = y + (sy + 0.5) / SS - half;
          const c = sample(px / radius, py / radius);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 3;
      out[i] = clamp255(r / n); out[i + 1] = clamp255(g / n); out[i + 2] = clamp255(b / n);
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (~c) >>> 0;
}

/** One PNG chunk: length, type, data, CRC of type+data. */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * Encode raw RGB pixels as an opaque 8-bit truecolour PNG. Deterministic: the same arguments give
 * byte-identical output on every build, which is what lets the service worker's cache name be a
 * hash of the files it precaches.
 * @param {number} size
 * @param {Buffer} rgb size*size*3 bytes
 */
function encodePng(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour, no alpha
  // 10..12: deflate compression, adaptive filtering, no interlace — all zero.
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * One icon as PNG bytes.
 * @param {number} size edge length in px
 * @param {{maskable?: boolean}} [opts] a maskable icon keeps the emblem inside the safe circle
 */
export function renderIcon(size, opts = {}) {
  return encodePng(size, pixels(size, opts.maskable ? 0.62 : 0.88));
}
