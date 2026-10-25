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
const { weeklyReport } = await import('./lib/report.mjs');
const { scoreOrders, COLUMNS } = await import('./lib/score-file.mjs');
const { SAMPLES, sampleList } = await import('./lib/samples.mjs');
const { live, refreshAll } = await import('./lib/live.mjs');
const { runAgent, runs, publicRun, agentAvailable, decideOutcome, provider, agentModel } = await import('./lib/agent.mjs');
const { strikes, savedRoute, coordsOf } = await import('./lib/external.mjs');
const { fiOf, translateMissing, pendingCount } = await import('./lib/i18n.mjs');
const { explain } = await import('./lib/explain.mjs');
const SOURCE_TITLES = {
  live: { en: 'Live conditions', fi: 'Reaaliaikaiset olosuhteet' }, news: { en: 'News item', fi: 'Uutinen' },
  route: { en: 'Saved road route', fi: 'Tallennettu tiereitti' }, timetable: { en: 'Published ferry timetable', fi: 'Julkaistu lautta-aikataulu' },
  crossing: { en: 'Crossing on the route', fi: 'Ylitys reitillä' }, bahn: { en: 'What Bahn told us', fi: 'Mitä Bahn kertoi' },
  rule: { en: 'Rule', fi: 'Sääntö' }, demo: { en: 'Demo data', fi: 'Demodata' },
};
const { translateStrings } = await import('./lib/agent.mjs');

const PORT = Number(process.env.PORT || 3000);
const { readJsonState, writeJsonState, onVercel } = await import('./lib/state.mjs');
const decisions = readJsonState('decisions.json', {});
const saveDecisions = () => writeJsonState('decisions.json', decisions);

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

// ---------- Finnish for English source text (cached translations, see lib/i18n.mjs) ----------
const fiText = (t) => (t && t.en && (!t.fi || t.fi === t.en) ? { en: t.en, fi: fiOf(t.en) || t.en } : t);
const fiSource = (s) => s && { ...s, labelFi: fiOf(s.label) };
const fiReason = (r) => ({ ...r, text: fiText(r.text), source: fiSource(r.source) });
// Translations are filled in the background once Claude is available; until then English shows.
const translateSoon = () => { if (provider() === 'claude') translateMissing(translateStrings); };

function localizeDetail(d) {
  d.reasons = d.reasons.map(fiReason);
  for (const e of [d.from, d.to]) e.nameFi = fiOf(e.name);
  if (d.whyYou) d.whyYou = { ...d.whyYou, text: fiText(d.whyYou.text), source: fiSource(d.whyYou.source) };
  if (d.decision) d.decision = { ...d.decision, text: fiText(d.decision.text) };
  d.agentWork = d.agentWork.map((w) => ({ ...w, source: fiSource(w.source) }));
  // Messages stay as written; everything else gets Finnish.
  d.timeline = d.timeline.map((e) => (e.kind === 'message' ? e : { ...e, textFi: fiOf(e.text) }));
  if (d.run) d.run = { ...d.run, steps: d.run.steps.map((s) => (s.type === 'tool' && s.summary && !s.summary.startsWith('“') ? { ...s, summaryFi: fiOf(s.summary) } : s)) };
  d.alternatives = d.alternatives.map((a) => ({ ...a, whyFi: a.why.map((w) => fiOf(w) || w) }));
  translateSoon();
  return d;
}

function overview() {
  const all = analyseAll();
  setImmediate(translateSoon);
  return {
    snapshotAt: all.snapshotAt,
    live: { status: live.status, weatherAt: live.weatherAt, trafficAt: live.trafficAt, trafficCount: live.traffic.length },
    agentAvailable: agentAvailable(),
    groups: all.groups.map((g) => ({ ...g, decided: decisions[`group:${g.id}`] || null, detail: strikes().find((s) => s.id === g.id)?.detail })),
    orders: all.orders.map(withDecisions).map((o) => ({
      id: o.id, ref: o.ref, status: o.status, lane: o.lane, confidence: o.confidence, value: o.value,
      vehicle: o.vehicle, from: o.from, to: o.to, customer: o.customer, driver: o.driver && { name: o.driver.name },
      headline: fiText(o.reasons.find((r) => !r.agentCan && !r.group)?.text || o.reasons[0]?.text || null),
      whyYou: whyYou(o) && { text: fiText(whyYou(o).text) }, etaPlan: o.etaPlan, eta: o.eta, deadline: o.deadline,
      // The agent's own suggestion replaces the engine's generic decision text in the list.
      decision: runs[o.id]?.outcome?.status === 'PENDING_APPROVAL'
        ? { text: { en: `Agent: ${runs[o.id].outcome.suggestion}`, fi: `Agentti: ${runs[o.id].outcome.fi?.suggestion || runs[o.id].outcome.suggestion}` } }
        : o.decision && { text: fiText(o.decision.text) },
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
  if (d) ev.push({ at: d.at, who: 'person', whoId: d.by, kind: 'decision', text: `${d.label?.en || (d.choice === 'approve' ? 'Approved' : 'Changed')}${d.note ? `: ${d.note}` : ''}` });
  return ev.sort((a, b) => b.at.localeCompare(a.at));
}

function orderDetail(id) {
  const order = db.orders[id];
  if (!order) return null;
  const a = withDecisions(analyseOrder(order));
  if (runs[id]?.outcome?.status === 'PENDING_APPROVAL') a.reasons = a.reasons.map((r) => (r.kind === 'proposal' ? { ...r, superseded: true } : r));
  a.whyYou = whyYou(a);
  return localizeDetail({
    ...a,
    alternatives: ['driver', 'offer'].includes(a.decision?.kind) || !a.driver ? rankDrivers(id, 3) : [],
    timeline: timeline(id),
    run: publicRun(runs[id]),
    agentAvailable: agentAvailable(),
    live: { status: live.status, weatherAt: live.weatherAt },
  });
}

// Map of an order: route legs coloured by risk, plus markers for risks (red/amber),
// opportunities (green) and info (crossings, ports). Lines and points are [lat, lon].
// Show port areas, not the sample data's invented terminal names.
const portName = (s) => s.replace('West Baltic terminal', 'Travemünde port').replace('South Finland terminal', 'Helsinki port');
const RISK = '#b23a22', WARN = '#c8871b', OK = '#165038', SEA = '#2f6db5';
function orderMap(id) {
  const order = db.orders[id];
  if (!order) return null;
  const a = analyseOrder(order);
  const fi = (t) => fiText(t);
  const markers = [];
  const add = (lat, lon, kind, level, text, source) => lat != null && markers.push({ lat, lon, kind, level, text: fi(text), source: source && fiSource(source) });
  const P = coordsOf(a.from.city), D = coordsOf(a.to.city);
  if (P) add(P[0], P[1], 'pickup', 'info', { en: `Pickup: ${a.from.name || a.from.city}`, fi: `Nouto: ${a.from.name || a.from.city}` });
  if (D) add(D[0], D[1], 'delivery', 'info', { en: `Delivery: ${a.to.name || a.to.city}`, fi: `Toimitus: ${a.to.name || a.to.city}` });
  const live = a.reasons.filter((r) => ['traffic', 'crossing', 'travemunde'].includes(r.kind));
  for (const r of live) add(r.point?.[0], r.point?.[1], r.kind, r.kind === 'traffic' ? (r.r >= 0.1 ? 'risk' : 'warn') : r.kind === 'travemunde' ? 'warn' : 'info', r.text, r.source);
  for (const r of a.reasons.filter((x) => x.kind === 'weather')) {
    const city = r.source.id.split(':')[1];
    const c = coordsOf(city);
    if (c) add(c[0], c[1], 'weather', 'warn', r.text, r.source);
  }
  const ferryRisk = a.reasons.some((r) => ['missed_checkin', 'ferry_unbooked', 'ferry_sold_out', 'strike'].includes(r.kind));
  const legs = a.legs.map((l) => {
    if (l.mode === 'ferry') return { mode: 'ferry', line: l.line, color: ferryRisk ? RISK : SEA, label: fi({ en: `Ferry ${l.label}: ${a.ferry ? (a.ferry.provider || 'booked') : 'not booked yet'}`, fi: `Lautta ${l.label}: ${a.ferry ? (a.ferry.provider || 'varattu') : 'ei vielä varattu'}` }) };
    // Red where a live notice sits on this leg, otherwise green.
    const hit = live.some((r) => r.kind === 'traffic' && r.point && l.line.some((p) => Math.abs(p[0] - r.point[0]) < 0.05 && Math.abs(p[1] - r.point[1]) < 0.08));
    return { mode: 'drive', line: l.line, color: hit ? RISK : OK, label: fi({ en: `${portName(l.key).replace('|', ' → ')} · ${Math.round(l.route.km)} km`, fi: `${portName(l.key).replace('|', ' → ')} · ${Math.round(l.route.km)} km` }) };
  });
  // Opportunities: fast chargers for EVs, a few rest areas, and a nearby open job for a waiting driver.
  for (const l of a.legs.filter((x) => x.mode === 'drive')) {
    const stops = l.route.stopsList || [];
    if (a.vehicle?.fuel === 'electric') for (const s of stops.filter((x) => x.kind === 'charging').slice(0, 6)) add(s.lat, s.lon, 'charger', 'good', { en: `Fast charger: ${s.name || 'charger'} (km ${s.kmAlong})`, fi: `Pikalaturi: ${s.name || 'laturi'} (km ${s.kmAlong})` });
    const rest = stops.filter((x) => x.kind === 'rest');
    for (const s of rest.filter((_, i) => i % Math.max(1, Math.ceil(rest.length / 3)) === 0).slice(0, 3)) add(s.lat, s.lon, 'rest', 'good', { en: `Rest area: ${s.name || 'rest area'} (km ${s.kmAlong})`, fi: `Levähdyspaikka: ${s.name || ''} (km ${s.kmAlong})` });
  }
  const job = a.options?.find((o) => o.kind === 'reassign');
  if (job) {
    const ref = job.label.en.match(/CD-\d+/)?.[0];
    const o = Object.values(db.orders).find((x) => x.reference === ref);
    const c = o && coordsOf(db.addresses[o.pickup_address_id]?.city);
    if (c) add(c[0] + 0.01, c[1] + 0.01, 'job', 'good', { en: `Open job nearby: ${ref}`, fi: `Avoin keikka lähellä: ${ref}` });
  }
  return { legs, markers };
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
  if (table === 'bahn') return {
    source: 'Bahn operations, answers to the team at the Prompt Operations Hackathon, 25 Oct 2026',
    said: 'Trouble spots: Germany/Travemünde, and winter tyres once winter comes.',
    used_as: 'A route risk on orders through the Travemünde port area.' };
  if (table === 'rule' && id === 'winter-tyres') return {
    rule: 'Winter tyres',
    finland: 'Required 1 Dec – end of February (general knowledge, verify)',
    estonia: 'Required 1 Dec – 1 March (general knowledge, verify)',
    germany: 'Required in icy or snowy conditions (situational); checked against live weather',
    denmark: 'No legal requirement',
    why: 'Bahn named winter tyres as a trouble spot once winter comes (25 Oct 2026).' };
  if (table === 'crossing') return {
    crossing: { fehmarn: 'Puttgarden–Rødby ferry (Fehmarn Belt)', storebaelt: 'Great Belt bridge (Storebæltsbroen)', oresund: 'Øresund bridge' }[id] || id,
    detected_from: 'The saved OSRM road route passes through this crossing', operator_site: { fehmarn: 'scandlines.com', storebaelt: 'storebaelt.dk', oresund: 'oresundsbron.com' }[id],
    note: 'Prices change by date and vehicle; check the operator before quoting a cost.' };
  if (table === 'demo') return { note: 'Demo data generated for the prototype. In production this comes from Bahn’s driver history and charger APIs.', id };
  return findRecord(table, id);
}

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((ok) => {
  // Vercel may have parsed the body already.
  if (req.body && typeof req.body === 'object') return ok(req.body);
  if (typeof req.body === 'string') { try { return ok(JSON.parse(req.body)); } catch { return ok({}); } }
  let b = '';
  req.on('data', (c) => { b += c; if (b.length > 5e6) req.destroy(); });
  req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({}); } });
});
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };

// One request handler for both: the local server below and the Vercel function (api/index.mjs).
let lastRefresh = 0;
let refreshing = null;
// On Vercel there is no background timer, and work left running after the response is
// frozen, so a request waits for the refresh (about 3 s, capped at 9 s) when live data is
// older than 10 min. Concurrent requests share one refresh.
async function freshLive() {
  if (Date.now() - lastRefresh < 10 * 60e3) return;
  refreshing ||= refreshAll().catch(() => {}).finally(() => { lastRefresh = Date.now(); refreshing = null; });
  await Promise.race([refreshing, new Promise((r) => setTimeout(r, 9000))]);
}
export async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  // Vercel rewrites /api/* to /api/index?path=*; restore the original path.
  const p = url.pathname === '/api/index' && url.searchParams.has('path') ? `/api/${url.searchParams.get('path')}` : url.pathname;
  if (onVercel && p.startsWith('/api/') && p !== '/api/i18n') await freshLive();
  try {
    if (p === '/api/overview') return send(res, 200, overview());
    let m;
    if ((m = p.match(/^\/api\/orders\/([\w-]+)\/map$/))) return send(res, 200, orderMap(m[1]) || { error: 'Not found' });
    if ((m = p.match(/^\/api\/orders\/([\w-]+)$/))) {
      const d = orderDetail(m[1]);
      return d ? send(res, 200, d) : send(res, 404, { error: 'Not found' });
    }
    if ((m = p.match(/^\/api\/source\/(\w+)\/(.+)$/))) {
      const rec = sourceRecord(m[1], decodeURIComponent(m[2]));
      if (!rec) return send(res, 200, { error: 'Not found' });
      // Plain-language explanation first; the raw record (field names in Finnish, values as
      // recorded) stays available as technical detail.
      const keysFi = Object.fromEntries(Object.keys(rec).map((k) => [k, fiOf(k.replace(/_/g, ' '))]));
      const explained = explain(m[1], rec, fiOf);
      if (explained && !explained.title) explained.title = SOURCE_TITLES[m[1]] || { en: 'Source', fi: 'Lähde' };
      translateSoon();
      return send(res, 200, { record: rec, keysFi, explained });
    }
    if (p === '/api/report') return send(res, 200, { ...weeklyReport(analyseAll().orders.map(withDecisions)), decisions: Object.keys(decisions).filter((k) => !k.startsWith('group:')).length });
    if (p === '/api/i18n') return send(res, 200, { pending: pendingCount() });
    // Score a company's own order file (CSV or JSON). Nothing is stored.
    if (req.method === 'POST' && p === '/api/score') {
      const body = await readBody(req);
      try { return send(res, 200, scoreOrders(body.text, body.filename || '')); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (p === '/api/score/columns') return send(res, 200, COLUMNS.map(([key, help, required]) => ({ key, help, required })));
    if (p === '/api/samples') return send(res, 200, sampleList());
    if ((m = p.match(/^\/api\/samples\/([\w.-]+)$/)) && SAMPLES[m[1]]) {
      res.setHeader('Content-Disposition', `attachment; filename="${m[1]}"`);
      return send(res, 200, SAMPLES[m[1]].build(Date.now()), m[1].endsWith('.json') ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8');
    }
    if (req.method === 'POST' && (m = p.match(/^\/api\/orders\/([\w-]+)\/agent$/))) {
      const body = await readBody(req);
      try { return send(res, 200, await runAgent(m[1], body.message || null)); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (req.method === 'POST' && (m = p.match(/^\/api\/orders\/([\w-]+)\/decide$/))) {
      const body = await readBody(req);
      if (!body.choice) { delete decisions[m[1]]; decideOutcome(m[1], null); } // undo
      else {
        // `choice` is approve / change, or an option id (wait, reschedule, reassign, cancel).
        decisions[m[1]] = { choice: body.choice, label: body.label || null, note: body.note || null, effect: body.effect || null, by: 'ops', at: new Date().toISOString() };
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
}

// Local run (npm start): a long-running server with background timers. On Vercel only
// the handler is used.
if (!onVercel) {
  http.createServer(handler).listen(PORT, () => {
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
}
