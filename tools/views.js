// Readability views for review sheets (browser module, used by tools/compare.js).
//
// These are diagnostics, not renderers: they answer "how many boundaries does the eye have to parse" and "what
// survives at a glance" objectively, instead of by argument. Both run at 1x on the sprite's own cell BEFORE the
// nearest-neighbour zoom — an edge map computed on an already-zoomed canvas reports edges N px thick, and a squint
// of a zoomed canvas averages zoom pixels rather than sprite pixels.

/** Paint every colour boundary in `src` as a white line on black — the lines the eye has to parse. */
export function edgeMap(src, dst, thresh = 0.10) {
  const w = src.width, h = src.height;
  const a = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = dst.getContext('2d').createImageData(w, h);
  const o = out.data;
  const L = (i) => (0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]) / 255;
  const Cd = (i, j) => (Math.abs(a[i] - a[j]) + Math.abs(a[i + 1] - a[j + 1]) + Math.abs(a[i + 2] - a[j + 2])) / 765;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    let d = 0;
    if (x + 1 < w) d = Math.max(d, Math.max(Math.abs(L(i) - L(i + 4)), Cd(i, i + 4)));
    if (y + 1 < h) d = Math.max(d, Math.max(Math.abs(L(i) - L(i + w * 4)), Cd(i, i + w * 4)));
    const on = d > thresh;
    o[i] = o[i + 1] = o[i + 2] = on ? 255 : 12;
    o[i + 3] = 255;
  }
  dst.getContext('2d').putImageData(out, 0, 0);
}

/** The squint test (ART_STYLE section 0.8): average down `f`x and blow back up, so only what reads at a glance survives. */
export function squint(src, dst, f = 3) {
  const w = src.width, h = src.height;
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(w / f)); t.height = Math.max(1, Math.round(h / f));
  const tc = t.getContext('2d');
  tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = 'high';
  tc.drawImage(src, 0, 0, t.width, t.height);
  const d = dst.getContext('2d');
  d.imageSmoothingEnabled = true; d.imageSmoothingQuality = 'high';
  d.clearRect(0, 0, w, h);
  d.drawImage(t, 0, 0, w, h);
}

/**
 * Discrete flat-colour regions in a rendered cell: connected runs of one exact colour, 4-connected. The pixel-side
 * reading of "too many small objects" — every region is one thing the eye has to resolve.
 * Antialiased edge pixels are each a unique colour and would each count as a region, so colours the renderer never
 * asked for (fewer than 4 pixels) are snapped to the nearest one it did, leaving intended flat shapes.
 * @returns {{regions:number, tiny:number, body:number}} tiny = regions under 6 px of area
 */
export function regionCount(src) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const bg = (d[0] << 16) | (d[1] << 8) | d[2];
  const key = new Int32Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) key[p] = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
  const hist = new Map();
  for (let p = 0; p < key.length; p++) hist.set(key[p], (hist.get(key[p]) || 0) + 1);
  const real = [...hist.entries()].filter(([, n]) => n >= 4).map(([c]) => c);
  if (real.length) {
    const cache = new Map();
    for (const c of real) cache.set(c, c);
    for (let p = 0; p < key.length; p++) {
      const c = key[p];
      let hit = cache.get(c);
      if (hit === undefined) {
        const r = c >> 16, g = (c >> 8) & 255, b = c & 255;
        let best = real[0], bd = Infinity;
        for (const q of real) {
          const dr = (q >> 16) - r, dg = ((q >> 8) & 255) - g, db = (q & 255) - b;
          const dd = dr * dr + dg * dg + db * db;
          if (dd < bd) { bd = dd; best = q; }
        }
        cache.set(c, best); hit = best;
      }
      key[p] = hit;
    }
  }
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let regions = 0, tiny = 0, body = 0;
  for (let p = 0; p < w * h; p++) {
    if (key[p] !== bg) body++;
    if (seen[p] || key[p] === bg) continue;
    const c = key[p];
    let top = 0, area = 0;
    stack[top++] = p; seen[p] = 1;
    while (top) {
      const q = stack[--top];
      area++;
      const x = q % w, y = (q / w) | 0;
      if (x > 0 && !seen[q - 1] && key[q - 1] === c) { seen[q - 1] = 1; stack[top++] = q - 1; }
      if (x < w - 1 && !seen[q + 1] && key[q + 1] === c) { seen[q + 1] = 1; stack[top++] = q + 1; }
      if (y > 0 && !seen[q - w] && key[q - w] === c) { seen[q - w] = 1; stack[top++] = q - w; }
      if (y < h - 1 && !seen[q + w] && key[q + w] === c) { seen[q + w] = 1; stack[top++] = q + w; }
    }
    regions++;
    if (area < 6) tiny++;
  }
  return { regions, tiny, body };
}
