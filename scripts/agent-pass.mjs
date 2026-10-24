// One background pass: run the agent on every flagged order that has no outcome yet,
// then add Finnish translations to proposals that lack them. Stop the server first,
// because a running server keeps its own copy of data/runs.json in memory.
//   node --no-warnings scripts/agent-pass.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { analyseAll } = await import('../lib/engine.mjs');
const { runAgent, runs, translateOutcome } = await import('../lib/agent.mjs');

for (const o of analyseAll().orders.filter((x) => x.lane === 'needs_you' && !runs[x.id]?.outcome)) {
  try {
    const r = await runAgent(o.id);
    console.log(`${o.ref}: ${r.outcome?.type || 'no outcome'} — ${(r.outcome?.suggestion || r.outcome?.note || '').slice(0, 110)}`);
  } catch (e) { console.log(`${o.ref}: ${e.message.slice(0, 160)}`); }
}
for (const run of Object.values(runs)) {
  if (run.outcome && !run.outcome.fi) {
    try { await translateOutcome(run.outcome); console.log(`${run.orderId}: Finnish added`); }
    catch (e) { console.log(`${run.orderId}: translation failed — ${e.message.slice(0, 120)}`); }
  }
}
fs.writeFileSync(path.join(ROOT, 'data', 'runs.json'), JSON.stringify(runs, null, 1));
console.log('Saved data/runs.json');
