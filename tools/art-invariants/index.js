// Art-invariant runner: collects subjects, loads the rule modules, runs every tier and returns a structured report.
// See README.md for the harness contract every rule module must match. CLI entry: tools/art-check.js.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import * as helpers from './helpers.js';
import { collectSubjects, filterSubjects, isReference, isControl } from './subjects.js';
import { EXEMPTIONS, validateExemptions, findExemption } from './exemptions.js';

export { helpers, collectSubjects, filterSubjects, isReference, isControl };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

/** Rule modules, in run order. Missing modules are reported as skipped, never as a silent pass. */
export const RULE_MODULES = Object.freeze([
  './rules/palette.js', './rules/animation.js', './rules/geometry.js', './rules/render.js',
]);
/** Tiers in run order: cheapest first. */
export const TIER_ORDER = Object.freeze(['data', 'geometry', 'render']);
const SEVERITIES = new Set(['error', 'warn', 'info']);

// ---------------------------------------------------------------------------
// module loading + contract validation
// ---------------------------------------------------------------------------

function validateRule(rule, tier, spec, problems) {
  const at = `${spec}:${(rule && rule.id) || '<no id>'}`;
  if (!rule || typeof rule !== 'object') { problems.push(`${spec} exports a rule that is not an object`); return false; }
  let ok = true;
  if (typeof rule.id !== 'string' || !/^[a-z0-9-]+\/[a-z0-9-]+$/i.test(rule.id)) { problems.push(`${at} needs a namespaced id like 'palette/sleeve-vs-primary'`); ok = false; }
  if (typeof rule.section !== 'string' || !rule.section) { problems.push(`${at} needs a section string naming the ART_STYLE clause it enforces`); ok = false; }
  if (rule.severity !== 'error' && rule.severity !== 'warn') { problems.push(`${at} severity must be 'error' or 'warn'`); ok = false; }
  if (typeof rule.describe !== 'string' || !rule.describe) { problems.push(`${at} needs a one-line describe, in the imperative`); ok = false; }
  if (tier !== 'render' && typeof rule.check !== 'function') { problems.push(`${at} is a ${tier}-tier rule and must export check(subject, helpers)`); ok = false; }
  return ok;
}

/**
 * Import the rule modules and check them against the harness contract.
 * @param {string[]} [specs] module specifiers relative to this directory
 * @returns {Promise<{modules: object[], skipped: object[], problems: string[]}>}
 */
export async function loadRuleModules(specs = RULE_MODULES) {
  const modules = [], skipped = [], problems = [], seenIds = new Map();
  for (const spec of specs) {
    let mod;
    const url = spec.startsWith('.') ? new URL(spec, import.meta.url).href : pathToFileURL(path.resolve(spec)).href;
    try {
      mod = await import(url);
    } catch (e) {
      const missing = e && (e.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find module/.test(String(e.message)));
      skipped.push({ what: spec, reason: missing ? 'rule module not present yet (its owner is still building it)' : `rule module failed to import: ${e && e.message}` });
      continue;
    }
    const tier = mod.TIER;
    if (!TIER_ORDER.includes(tier)) { problems.push(`${spec} exports TIER ${JSON.stringify(tier)}; expected one of ${TIER_ORDER.join(', ')}`); continue; }
    if (!Array.isArray(mod.RULES)) { problems.push(`${spec} must export a RULES array`); continue; }
    if (tier === 'render' && typeof mod.checkAll !== 'function') { problems.push(`${spec} is the render tier and must export async checkAll(subjects, page, helpers)`); continue; }
    const rules = [];
    for (const rule of mod.RULES) {
      if (!validateRule(rule, tier, spec, problems)) continue;
      if (seenIds.has(rule.id)) { problems.push(`duplicate rule id ${rule.id} (${seenIds.get(rule.id)} and ${spec})`); continue; }
      seenIds.set(rule.id, spec);
      rules.push({ ...rule, tier, module: spec });
    }
    modules.push({ spec, tier, rules, checkAll: mod.checkAll || null });
  }
  return { modules, skipped, problems };
}

// ---------------------------------------------------------------------------
// findings
// ---------------------------------------------------------------------------

/** Normalise whatever a check() returned into finding objects. */
function normaliseFindings(raw, rule, subjectId) {
  if (raw == null || raw === false) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter((f) => f != null && f !== false).map((f) => {
    const o = typeof f === 'string' ? { message: f } : f;
    const severity = SEVERITIES.has(o.severity) ? o.severity : rule.severity;
    return {
      ruleId: rule.id, tier: rule.tier, section: rule.section, severity,
      subjectId, message: String(o.message == null ? '' : o.message),
      detail: o.detail == null ? null : (Array.isArray(o.detail) ? o.detail.join('\n') : String(o.detail)),
      where: o.where == null ? null : String(o.where),
      exempt: false, exemptReason: null,
    };
  });
}

function applyExemptions(findings, list) {
  for (const f of findings) {
    if (f.severity === 'info') continue;
    const ex = findExemption(f.ruleId, f.subjectId, list);
    if (ex) { f.exempt = true; f.exemptReason = ex.reason; }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// render tier (browser lifecycle lives here, never in a rule module)
// ---------------------------------------------------------------------------

const NODE_PATH_HINT = 'run with NODE_PATH=/opt/node22/lib/node_modules (the repo uses the globally installed Playwright, see tools/sheet-capture.js)';

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const c of ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(c); } catch { /* next */ }
  }
  throw new Error(`--render needs Playwright and it is not resolvable: ${NODE_PATH_HINT}`);
}

/**
 * Serve the repo, open one page and hand it to every render module's checkAll().
 * The page carries `baseUrl` and an `artErrors` array (page errors + console errors) collected since the last
 * `clearArtErrors()`; the browser context's baseURL is set, so `page.goto('/tools/sheet.html?...')` works.
 */
async function runRenderTier(modules, subjects, findings, timings, ctx = {}) {
  const { chromium } = loadPlaywright();
  const { createServer } = await import('../server.js');
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  let browser = null;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1600, height: 1200 }, baseURL: base });
    const page = await context.newPage();
    const artErrors = [];
    page.on('pageerror', (e) => artErrors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') artErrors.push('console: ' + m.text()); });
    page.baseUrl = base;
    page.artErrors = artErrors;
    page.clearArtErrors = () => { artErrors.length = 0; };
    // `only` is the runner's --only selection, so a render module can honour it without sniffing process.argv;
    // `skip(what, reason)` is how a render rule announces a part of itself it did not run - it lands in the
    // report's SKIPPED block, which is printed unconditionally, so a skip can never be lost with the notes.
    const api = Object.assign(Object.create(null), helpers, {
      baseUrl: base, repoRoot: REPO,
      only: ctx.only || [],
      skip: (what, reason) => { (ctx.skipped || []).push({ what: String(what), reason: String(reason) }); },
    });
    for (const mod of modules) {
      const byId = new Map(mod.rules.map((r) => [r.id, r]));
      const t0 = Date.now();
      const raw = (await mod.checkAll(subjects, page, api)) || [];
      timings.push({ ruleId: `${mod.spec} (render tier)`, ms: Date.now() - t0 });
      for (const f of raw) {
        const rule = byId.get(f && f.ruleId) || { id: (f && f.ruleId) || mod.spec, tier: 'render', section: '', severity: 'error' };
        findings.push(...normaliseFindings(f, rule, (f && f.subjectId) || '*'));
      }
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

// ---------------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------------

/**
 * Mark census: how many marks each rig paints per keyframe, and where they land. A MEASUREMENT, not a gate —
 * it never reports a finding and never fails a run. It is what the ART_STYLE mark budget is calibrated from, and
 * what a before/after of a readability pass is argued with.
 *
 * It reuses the geometry tier's cached single pass (analyse()), so it costs nothing beyond that walk and can never
 * disagree with the rules that read the same numbers.
 * @param {{ subject?: string[] }} [options]
 * @returns {Promise<object>} { subjects, totals, byClass }
 */
export async function runCensus(options = {}) {
  const t0 = Date.now();
  const all = collectSubjects();
  const subjects = filterSubjects(all, options.subject || []);
  const { analyse } = await import('./rules/geometry.js');
  const rows = subjects.map((s) => {
    const A = analyse(s);
    const f = Math.max(1, A.frames);
    const c = A.census;
    return {
      id: s.id, class: s.class, faction: s.faction, scale: s.rig ? s.rig.scale : null, frames: A.frames,
      marks: { mean: +(c.marks.sum / f).toFixed(1), max: c.marks.max, at: c.marks.at },
      small3: { mean: +(c.small3.sum / f).toFixed(1), max: c.small3.max, at: c.small3.at },
      outlined: { max: c.outlined.max, at: c.outlined.at },
      alphaMarks: +(c.alphaMarks / f).toFixed(1),
      region: Object.fromEntries(Object.entries(c.region).map(([k, v]) => [k, +(v / f).toFixed(1)])),
    };
  });
  const mean = (pick) => (rows.length ? +(rows.reduce((a, r) => a + pick(r), 0) / rows.length).toFixed(1) : 0);
  const byClass = {};
  for (const r of rows) {
    const k = r.class || 'unclassed';
    if (!byClass[k]) byClass[k] = { rigs: 0, maxMarks: 0, at: '-', meanMarks: 0 };
    const b = byClass[k];
    b.rigs++; b.meanMarks += r.marks.mean;
    if (r.marks.max > b.maxMarks) { b.maxMarks = r.marks.max; b.at = `${r.id} ${r.marks.at}`; }
  }
  for (const k of Object.keys(byClass)) byClass[k].meanMarks = +(byClass[k].meanMarks / byClass[k].rigs).toFixed(1);
  return {
    subjects: rows,
    totals: {
      subjects: rows.length, frames: rows.reduce((a, r) => a + r.frames, 0), durationMs: Date.now() - t0,
      meanMarks: mean((r) => r.marks.mean), meanSmall3: mean((r) => r.small3.mean),
      meanLimb: mean((r) => r.region.limb), meanHead: mean((r) => r.region.head), meanDefault: mean((r) => r.region.default),
    },
    byClass,
  };
}

/**
 * Run the suite.
 * @param {{ subject?: string[], only?: string[], render?: boolean, moduleSpecs?: string[], exemptions?: object[] }} [options]
 *   subject/only are already comma-split selector lists; an empty list means "everything".
 * @returns {Promise<object>} report { ok, counts, subjects, rules, findings, skipped, problems, timings }
 */
export async function runArtCheck(options = {}) {
  const t0 = Date.now();
  const selectors = options.subject || [];
  const only = (options.only || []).map((s) => String(s).trim()).filter(Boolean);
  const exemptions = options.exemptions || EXEMPTIONS;
  const all = collectSubjects();
  const subjects = filterSubjects(all, selectors);
  const skipped = [], problems = [], findings = [], timings = [];

  if (selectors.length && !subjects.length) problems.push(`--subject=${selectors.join(',')} matched no subject (try one of: ${all.slice(0, 4).map((s) => s.id).join(', ')}, ...)`);
  for (const s of subjects) {
    if (s.buildError) findings.push(...normaliseFindings({ message: 'buildRig() threw for this subject', detail: s.buildError }, { id: 'runner/build', tier: 'data', section: 'harness', severity: 'error' }, s.id));
  }
  for (const p of validateExemptions(exemptions)) problems.push(p);

  const loaded = await loadRuleModules(options.moduleSpecs || RULE_MODULES);
  skipped.push(...loaded.skipped);
  problems.push(...loaded.problems);

  const matchesOnly = (id) => !only.length || only.some((o) => id === o || id.startsWith(o));
  const modules = loaded.modules.map((m) => ({ ...m, rules: m.rules.filter((r) => matchesOnly(r.id)) }));
  const rules = modules.flatMap((m) => m.rules);
  if (only.length && !rules.length) problems.push(`--only=${only.join(',')} matched no rule`);

  // data + geometry tiers
  for (const tier of ['data', 'geometry']) {
    for (const mod of modules) {
      if (mod.tier !== tier) continue;
      for (const rule of mod.rules) {
        const t = Date.now();
        for (const subject of subjects) {
          if (subject.buildError) continue;
          try {
            findings.push(...normaliseFindings(rule.check(subject, helpers), rule, subject.id));
          } catch (e) {
            findings.push(...normaliseFindings({ message: 'rule threw while checking this subject', detail: String((e && e.stack) || e) },
              { ...rule, severity: 'error' }, subject.id));
          }
        }
        timings.push({ ruleId: rule.id, ms: Date.now() - t });
      }
    }
  }

  // render tier
  const renderModules = modules.filter((m) => m.tier === 'render' && m.rules.length);
  if (renderModules.length) {
    if (!options.render) {
      for (const mod of renderModules) {
        for (const rule of mod.rules) skipped.push({ what: rule.id, reason: 'render tier not run (pass --render; it needs headless Chromium)' });
      }
    } else {
      try {
        await runRenderTier(renderModules, subjects, findings, timings, { only, skipped });
      } catch (e) {
        // loud, never a silent pass: a missing browser must fail the run
        findings.push(...normaliseFindings({ message: 'the render tier could not run', detail: String((e && e.message) || e) },
          { id: 'render/tier', tier: 'render', section: 'ART_STYLE section 10', severity: 'error' }, '*'));
      }
    }
  } else if (options.render) {
    skipped.push({ what: 'render tier', reason: 'no render-tier rules are loaded' });
  }

  applyExemptions(findings, exemptions);
  for (const p of problems) {
    findings.push(...normaliseFindings({ message: p }, { id: 'harness/contract', tier: 'data', section: 'harness contract', severity: 'error' }, '*'));
  }

  const counted = findings.filter((f) => !f.exempt && f.severity !== 'info');
  const counts = {
    subjects: subjects.length,
    rules: rules.length,
    errors: counted.filter((f) => f.severity === 'error').length,
    warnings: counted.filter((f) => f.severity === 'warn').length,
    exempt: findings.filter((f) => f.exempt).length,
    notes: findings.filter((f) => f.severity === 'info').length,
  };
  return {
    ok: counts.errors === 0,
    counts, timings, skipped, problems,
    subjects: subjects.map((s) => ({ id: s.id, kind: s.kind, name: s.name, class: s.class, type: s.type, reference: isReference(s), control: isControl(s) })),
    rules: rules.map((r) => ({ id: r.id, tier: r.tier, section: r.section, severity: r.severity, describe: r.describe, module: r.module })),
    findings,
    durationMs: Date.now() - t0,
  };
}
