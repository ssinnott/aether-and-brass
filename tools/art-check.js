// CLI for the executable half of docs/ART_STYLE.md. Runs every art-invariant rule over every rig in the game.
//
//   node tools/art-check.js                       data + geometry tiers over all subjects
//   node tools/art-check.js --render              also the pixel tier (needs headless Chromium:
//                                                 NODE_PATH=/opt/node22/lib/node_modules)
//   node tools/art-check.js --only=palette        only rules whose id starts with 'palette'
//   node tools/art-check.js --subject=sootborn    only the Sootborn rigs
//   node tools/art-check.js --json                the structured report, for CI
//
// Exit code 1 when anything reports an error (exempt findings and warnings do not fail the run).
import { runArtCheck } from './art-invariants/index.js';

const USAGE = `Usage: node tools/art-check.js [--render] [--json] [--only=<ruleId>] [--subject=<id>]

  --render           add the render tier (headless Chromium; NODE_PATH=/opt/node22/lib/node_modules)
  --json             print the structured report instead of the human one
  --only=<ruleId>    run only these rules (comma-separated; a prefix like 'palette' works)
  --subject=<id>     run only these subjects (comma-separated; an id, a faction, a kind or a class)
  --notes            also print the info notes (measured tables rules print pass or fail)
  --quiet            summary and errors only (hide warnings and notes)
  --help             this text

Exit code: 1 if any non-exempt error was reported, 0 otherwise.`;

function parseArgs(argv) {
  const o = { render: false, json: false, only: [], subject: [], quiet: false, notes: false, help: false };
  const bad = [];
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) { bad.push(a); continue; }
    const [, k, v] = m;
    if (k === 'render' || k === 'json' || k === 'quiet' || k === 'notes' || k === 'help') o[k] = true;
    else if (k === 'only' || k === 'subject') o[k].push(...String(v || '').split(',').map((s) => s.trim()).filter(Boolean));
    else bad.push(a);
  }
  o.bad = bad;
  return o;
}

const C = process.stdout.isTTY && !process.env.NO_COLOR
  ? { dim: (s) => `\u001b[2m${s}\u001b[0m`, red: (s) => `\u001b[31m${s}\u001b[0m`, yellow: (s) => `\u001b[33m${s}\u001b[0m`, green: (s) => `\u001b[32m${s}\u001b[0m`, bold: (s) => `\u001b[1m${s}\u001b[0m`, cyan: (s) => `\u001b[36m${s}\u001b[0m` }
  : { dim: (s) => s, red: (s) => s, yellow: (s) => s, green: (s) => s, bold: (s) => s, cyan: (s) => s };

const MARK = { error: () => C.red('ERROR'), warn: () => C.yellow('warn '), info: () => C.cyan('note ') };

function indent(text, pad) {
  return String(text).split('\n').map((l) => pad + l).join('\n');
}

function printReport(report, opts) {
  const { counts } = report;
  console.log(C.bold('ART INVARIANTS') + C.dim(`  ${counts.subjects} subjects, ${counts.rules} rules, ${report.durationMs} ms`));

  const byRule = new Map();
  let hiddenNotes = 0;
  for (const f of report.findings) {
    // Info notes are the measured tables rules print whether they pass or fail. They are the bulk of the output
    // (180+ on a full run), so they are off by default; --notes prints them and --json always carries them.
    if (f.severity === 'info' && !opts.notes) { hiddenNotes++; continue; }
    if (opts.quiet && (f.severity === 'warn' || f.severity === 'info') && !f.exempt) continue;
    if (!byRule.has(f.ruleId)) byRule.set(f.ruleId, []);
    byRule.get(f.ruleId).push(f);
  }
  const ruleMeta = new Map(report.rules.map((r) => [r.id, r]));
  const order = [...byRule.keys()].sort((a, b) => {
    const ra = ruleMeta.get(a), rb = ruleMeta.get(b);
    const sa = ra && ra.severity === 'error' ? 0 : 1, sb = rb && rb.severity === 'error' ? 0 : 1;
    return sa - sb || a.localeCompare(b);
  });

  for (const ruleId of order) {
    const meta = ruleMeta.get(ruleId);
    const list = byRule.get(ruleId);
    const head = meta ? `${C.bold(ruleId)}  ${C.dim(`[${meta.severity}] ${meta.section} - ${meta.describe}`)}` : C.bold(ruleId);
    console.log('\n' + head);
    for (const f of list) {
      const mark = f.exempt ? C.dim('exempt') : MARK[f.severity]();
      console.log(`  ${mark}  ${f.subjectId}${f.where ? C.dim(' @ ' + f.where) : ''}  ${f.message}`);
      if (f.detail) console.log(C.dim(indent(f.detail, '          ')));
      if (f.exempt) console.log(C.dim(indent('exempted: ' + f.exemptReason, '          ')));
    }
  }

  if (hiddenNotes && !opts.quiet) console.log(C.dim(`\n${hiddenNotes} info note(s) hidden - run with --notes to print the measured tables.`));

  if (report.skipped.length) {
    console.log('\n' + C.bold('SKIPPED') + C.dim(' (nothing here was checked)'));
    for (const s of report.skipped) console.log(`  ${s.what}: ${C.dim(s.reason)}`);
  }

  const summary = `${counts.subjects} subjects, ${counts.rules} rules, ${counts.errors} errors, ${counts.warnings} warnings, ${counts.exempt} exempt`;
  console.log('\n' + (counts.errors ? C.red(summary) : C.green(summary)));
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help) { console.log(USAGE); process.exit(0); }
if (opts.bad.length) { console.error(`unknown argument(s): ${opts.bad.join(' ')}\n\n${USAGE}`); process.exit(2); }

const report = await runArtCheck({ subject: opts.subject, only: opts.only, render: opts.render });
if (opts.json) console.log(JSON.stringify(report, null, 2));
else printReport(report, opts);
process.exit(report.ok ? 0 : 1);
