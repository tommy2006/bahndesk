// Bahn Control Room — zero-dependency Node server. Run: npm start
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (KEY=value lines).
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const { db, rowsFor, findRecord } = await import('./lib/data.mjs');
const { analyseAll, analyseOrder, rankDrivers } = await import('./lib/engine.mjs');
const { live, refreshAll } = await import('./lib/live.mjs');
const { runAgent, runs, publicRun, agentAvailable, decideOutcome, provider, agentModel } = await import('./lib/agent.mjs');
const { strikes, savedRoute } = await import('./lib/external.mjs');

const PORT = Number(process.env.PORT || 3000);
const DECISIONS = path.join(ROOT, 'data', 'decisions.json');
const decisions = (() => { try { return JSON.parse(fs.readFileSync(DECISIONS, 'utf8')); } catch { return {}; } })();
const saveDecisions = () => fs.writeFileSync(DECISIONS, JSON.stringify(decisions, null, 1));

// Overlay people's decisions on the engine's lanes: a decided order leaves the queue.
function withDecisions(a) {
  const d = decisions[a.id] || decisions[`group:${a.reasons.find((r) => r.group)?.group}`];
  const run = runs[a.id];
  const out = { ...a, decided: decisions[a.id] || null, agent: run ? { outcome: run.outcome, steps: run.steps.length } : null };
  if (decisions[a.id] && a.lane === 'needs_you') out.lane = 'agent';
  if (d && !decisions[a.id]) out.groupDecided = d;
  return out;
}

// Why a person must look. Once our agent has a pending proposal, the dataset's older
// proposal is history, not the reason, so the next human reason is shown instead.
function whyYou(o) {
  if (!o.whyYou || o.whyYou.kind !== 'proposal' || runs[o.id]?.outcome?.status !== 'PENDING_APPROVAL') return o.whyYou;
  const next = o.reasons.find((r) => !r.agentCan && !r.group && r.kind !== 'proposal');
  return next ? { text: next.text, kind: next.kind, source: next.source } : o.whyYou;
}

function overview() {
  const all = analyseAll();
  return {
    snapshotAt: all.snapshotAt,
    live: { status: live.status, weatherAt: live.weatherAt, trafficAt: live.trafficAt, trafficCount: live.traffic.length },
    agentAvailable: agentAvailable(),
    groups: all.groups.map((g) => ({ ...g, decided: decisions[`group:${g.id}`] || null, detail: strikes().find((s) => s.id === g.id)?.detail })),
    orders: all.orders.map(withDecisions).map((o) => ({
      id: o.id, ref: o.ref, status: o.status, lane: o.lane, confidence: o.confidence, value: o.value,
      vehicle: o.vehicle, from: o.from, to: o.to, customer: o.customer, driver: o.driver && { name: o.driver.name },
      headline: o.reasons.find((r) => !r.agentCan && !r.group)?.text || o.reasons[0]?.text || null,
      whyYou: whyYou(o) && { text: whyYou(o).text }, etaPlan: o.etaPlan, eta: o.eta,
      // The agent's own suggestion replaces the engine's generic decision text in the list.
      decision: runs[o.id]?.outcome?.status === 'PENDING_APPROVAL'
        ? { text: { en: `Agent: ${runs[o.id].outcome.suggestion}`, fi: `Agentti: ${runs[o.id].outcome.suggestion}` } }
        : o.decision && { text: o.decision.text },
      agentWork: o.agentWork.slice(0, 1),
      decided: o.decided, groupDecided: o.groupDecided || null, agent: o.agent, lta: o.lta, predicted: o.predicted, slackH: o.slackH,
    })),
  };
}

function timeline(orderId) {
  const ev = [];
  for (const e of rowsFor('operational_events', orderId)) ev.push({ at: e.recorded_at, who: e.actor_type, whoId: e.actor_id, kind: 'event', text: e.command.replace(/[._]/g, ' '), source: { table: 'operational_events', id: e.id } });
  for (const m of rowsFor('messages', orderId)) ev.push({ at: m.authored_at, who: m.author_type, whoId: m.author_id, kind: 'message', channel: m.channel, text: m.body, source: { table: 'messages', id: m.id } });
  for (const a of rowsFor('alerts', orderId)) ev.push({ at: a.triggered_at, who: 'system', kind: 'alert', text: a.summary, source: { table: 'alerts', id: a.id } });
  for (const p of rowsFor('agent_proposals', orderId)) ev.push({ at: p.created_at, who: 'agent', whoId: p.proposed_by_agent_id, kind: 'proposal', text: `${p.summary} (${p.status.toLowerCase().replace(/_/g, ' ')})`, source: { table: 'agent_proposals', id: p.id } });
  const d = decisions[orderId];
  if (d) ev.push({ at: d.at, who: 'person', whoId: d.by, kind: 'decision', text: `${d.choice === 'approve' ? 'Approved' : 'Changed'}${d.note ? `: ${d.note}` : ''}` });
  return ev.sort((a, b) => b.at.localeCompare(a.at));
}

function orderDetail(id) {
  const order = db.orders[id];
  if (!order) return null;
  const a = withDecisions(analyseOrder(order));
  if (runs[id]?.outcome?.status === 'PENDING_APPROVAL') a.reasons = a.reasons.map((r) => (r.kind === 'proposal' ? { ...r, superseded: true } : r));
  a.whyYou = whyYou(a);
  return {
    ...a,
    alternatives: ['driver', 'offer'].includes(a.decision?.kind) || !a.driver ? rankDrivers(id, 3) : [],
    timeline: timeline(id),
    run: publicRun(runs[id]),
    agentAvailable: agentAvailable(),
    live: { status: live.status, weatherAt: live.weatherAt },
  };
}

function sourceRecord(table, id) {
  if (table === 'live') {
    const [kind, key] = id.split(':');
    if (kind === 'weather') return { provider: 'Open-Meteo (live)', fetched_at: live.weatherAt, city: key, ...live.weather[key] };
    return { provider: 'Fintraffic Digitraffic (live)', fetched_at: live.trafficAt, ...live.traffic.find((t) => t.id === key) };
  }
  if (table === 'news') return strikes().find((s) => s.id === id);
  if (table === 'timetable') {
    const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/external/ferries-fi-ee.json'), 'utf8'));
    return { route: id === 'TLL-HEL' ? 'Tallinn → Helsinki' : 'Helsinki → Tallinn', source: t.source, url: t.source_urls[id === 'HEL-TLL' ? 0 : 1], note: t.note,
      sailings: t.sailings.filter((s) => s.dir === id).map((s) => `${s.dep}–${s.arr} ${s.operator} ${s.ship}`).join(' · '), stored_in: 'data/bahn.db → ref_ferry_sailings' };
  }
  if (table === 'route') {
    const [from, to] = id.split('|');
    const r = savedRoute(from, to);
    return r && { route: `${from} → ${to}`, distance_km: r.km, drive_time_min: r.minutes, fuel_stations: r.stops.fuel, chargers: r.stops.charging,
      fast_chargers: r.stops.fastCharging, rest_areas: r.stops.rest, suggested_chargers: r.suggestedChargers.map((c) => `${c.name} (km ${c.kmAlong})`).join('; '),
      source: r.source + ' · stops: OpenStreetMap (© OpenStreetMap contributors)', saved_at: r.fetchedAt, stored_in: 'data/bahn.db' };
  }
  if (table === 'demo') return { note: 'Demo data generated for the prototype. In production this comes from Bahn’s driver history and charger APIs.', id };
  return findRecord(table, id);
}

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({}); } }); });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/overview') return send(res, 200, overview());
    let m;
    if ((m = p.match(/^\/api\/orders\/([\w-]+)$/))) {
      const d = orderDetail(m[1]);
      return d ? send(res, 200, d) : send(res, 404, { error: 'Not found' });
    }
    if ((m = p.match(/^\/api\/source\/(\w+)\/(.+)$/))) return send(res, 200, sourceRecord(m[1], decodeURIComponent(m[2])) || { error: 'Not found' });
    if (req.method === 'POST' && (m = p.match(/^\/api\/orders\/([\w-]+)\/agent$/))) {
      const body = await readBody(req);
      try { return send(res, 200, await runAgent(m[1], body.message || null)); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (req.method === 'POST' && (m = p.match(/^\/api\/orders\/([\w-]+)\/decide$/))) {
      const body = await readBody(req);
      if (!body.choice) delete decisions[m[1]]; // undo
      else {
        decisions[m[1]] = { choice: body.choice, note: body.note || null, effect: body.effect || null, by: 'ops', at: new Date().toISOString() };
        decideOutcome(m[1], body.choice, body.note);
      }
      saveDecisions();
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && (m = p.match(/^\/api\/groups\/([\w-]+)\/decide$/))) {
      const body = await readBody(req);
      decisions[`group:${m[1]}`] = { choice: body.choice, note: body.note || null, by: 'ops', at: new Date().toISOString() };
      saveDecisions();
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p === '/api/reset') {
      for (const k of Object.keys(decisions)) delete decisions[k];
      saveDecisions();
      return send(res, 200, { ok: true });
    }
    // Static files
    const file = path.join(ROOT, 'public', p === '/' || !path.extname(p) ? 'index.html' : path.normalize(p).replace(/^([/\\])+/, ''));
    if (!file.startsWith(path.join(ROOT, 'public'))) return send(res, 403, 'Forbidden', 'text/plain');
    fs.readFile(file, (err, buf) => (err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream')));
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`Bahn Control Room → http://localhost:${PORT}`);
  console.log(agentAvailable() ? `Agent: ${provider() === 'claude' ? 'Claude' : 'Groq'} (${agentModel()})` : 'Agent: off (add ANTHROPIC_API_KEY or GROQ_API_KEY to .env)');
});

// Live data now and every 10 minutes; the engine re-reads it on every request.
refreshAll().then(() => console.log(`Live data: ${live.status}`));
setInterval(refreshAll, 10 * 60e3);

// Background pass: the agent works the flagged orders before a person opens them.
if (agentAvailable() && process.env.AUTO_AGENT !== '0') {
  setTimeout(async () => {
    for (const o of analyseAll().orders.filter((x) => x.lane === 'needs_you' && !runs[x.id]?.outcome)) {
      try { await runAgent(o.id); console.log(`Agent finished ${o.ref}`); } catch (e) { console.log(`Agent ${o.ref}: ${e.message}`); }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }, 5000);
}
