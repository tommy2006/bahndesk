// Score a company's own order file (CSV or JSON) with the same rules as the control room.
//
// The control room reads Bahn's full snapshot. A dispatcher's export is much thinner: one
// row per order with route, times, car, driver and a few yes/no checks. This module turns
// each row into sourced reasons (the file's own cells, the saved road routes, the real
// Helsinki–Tallinn timetable, live weather and roads, Bahn's rules) and combines them with
// the engine's noisy-OR and thresholds. Uploaded orders are scored against the real clock,
// not the snapshot's. Nothing is stored, booked or sent.
import { NEEDS_YOU, WATCH, trafficOnRoute, crossingsOn, winterTyreRule } from './engine.mjs';
import { coordsOf, savedRoute, nextSailings, strikes, energyPlan, CHECK_IN_MIN } from './external.mjs';
import { live, kmFromSegment, weatherLabel } from './live.mjs';

const H = 3600e3;
const t2 = (en, fi) => ({ en, fi });

// Column names we accept, with the aliases people actually use in exports.
export const COLUMNS = [
  ['ref', 'Order reference', true, ['reference', 'order', 'order_ref', 'id']],
  ['pickup_city', 'Pickup city', true, ['from', 'from_city', 'origin']],
  ['pickup_country', 'Pickup country (FI, EE, DE, DK…)', true, ['from_country', 'origin_country']],
  ['delivery_city', 'Delivery city', true, ['to', 'to_city', 'destination']],
  ['delivery_country', 'Delivery country', true, ['to_country', 'destination_country']],
  ['pickup_at', 'Pickup time (local, e.g. 2026-10-27 09:00)', true, ['pickup', 'pickup_time']],
  ['deliver_by', 'Latest acceptable delivery (local)', true, ['latest_arrival', 'deadline', 'due', 'lta']],
  ['status', 'planned / picked_up / in_transit', false, []],
  ['car', 'Make and model', false, ['vehicle', 'model']],
  ['fuel', 'petrol / diesel / hybrid / electric', false, []],
  ['driver', 'Driver name (empty = none yet)', false, ['driver_name']],
  ['driver_on_time_pct', 'Driver on-time %, last 12 months', false, ['on_time_pct']],
  ['driver_claims_12m', 'Damage claims, last 12 months', false, ['claims_12m']],
  ['last_driver_contact', 'Last message or app ping from the driver (local)', false, ['last_contact']],
  ['ferry_booked', 'yes / no (needed for Tallinn–Helsinki and Germany–Finland)', false, ['ferry']],
  ['pickup_confirmed', 'yes / no: dealer confirmed car, keys and papers', false, ['ready']],
  ['receiver_named', 'yes / no: a named person will sign at delivery', false, ['receiver']],
  ['notes', 'Free text', false, ['note', 'comments']],
];
const ALIAS = Object.fromEntries(COLUMNS.flatMap(([k, , , al]) => [[k, k], ...al.map((a) => [a, k])]));
const norm = (h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// ---------- Parsing ----------
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const keys = head.map((h) => ALIAS[norm(h)] || norm(h));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}
export function parseOrders(text, filename = '') {
  const s = String(text || '').replace(/^﻿/, '').trim();
  if (!s) return [];
  if (/\.json$/i.test(filename) || s.startsWith('[') || s.startsWith('{')) {
    const j = JSON.parse(s);
    const list = Array.isArray(j) ? j : j.orders || [];
    return list.map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [ALIAS[norm(k)] || norm(k), v == null ? '' : String(v)])));
  }
  return parseCsv(s);
}

// Local time in Helsinki/Berlin wall-clock → UTC ms. Accepts ISO with a zone as is.
const tzOff = (ms, tz) => Date.parse(new Date(ms).toLocaleString('sv-SE', { timeZone: tz }).replace(' ', 'T') + 'Z') - ms;
function parseTime(v, country) {
  if (!v) return null;
  const s = String(v).trim().replace(' ', 'T');
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) { const ms = Date.parse(s); return Number.isFinite(ms) ? ms : NaN; }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{1,2}):(\d{2}))?/) || s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:T(\d{1,2})[:.](\d{2}))?/);
  if (!m) return NaN;
  const [y, mo, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
  const guess = Date.UTC(+y, +mo - 1, +d, +(m[4] || 12), +(m[5] || 0));
  const tz = ['DE', 'DK', 'SE', 'NL', 'BE', 'FR'].includes(country) ? 'Europe/Berlin' : 'Europe/Helsinki';
  return guess - tzOff(guess, tz);
}
const yes = (v) => /^(y|yes|true|1|kyllä|k|x)$/i.test(String(v || '').trim());
const no = (v) => /^(n|no|false|0|ei|e)$/i.test(String(v || '').trim());
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));
const fmt = (ms) => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/Helsinki', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtFi = (ms) => new Date(ms).toLocaleString('fi-FI', { timeZone: 'Europe/Helsinki', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const hrs = (h) => (Math.abs(h) < 1 ? `${Math.round(Math.abs(h) * 60)} min` : `${Math.round(Math.abs(h) * 10) / 10} h`);

// Driving time with EU rest rules: 45 min break per 4.5 h, average 80 km/h on estimates.
const driveHours = (km, minutes) => { const h = minutes ? minutes / 60 : km / 80; return h + Math.floor(h / 4.5) * 0.75; };
function haversineKm(a, b) {
  const R = 6371, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b[0] - a[0]), dLon = toR(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ---------- Scoring one row ----------
function scoreRow(o, rowNo, now) {
  const reasons = [];
  const problems = [];
  const cell = (column) => ({ kind: 'file', label: `Your file, row ${rowNo}, ${column}`, labelFi: `Tiedostosi, rivi ${rowNo}, ${column}`, value: o[column] ?? null });
  const add = (r, en, fi, source, opts = {}) => reasons.push({ r, text: t2(en, fi), source, agentCan: false, blocker: false, ...opts });

  const pc = String(o.pickup_country || '').toUpperCase(), dc = String(o.delivery_country || '').toUpperCase();
  for (const k of COLUMNS.filter((c) => c[2]).map((c) => c[0])) if (!o[k]) problems.push(t2(`Missing ${k}`, `Puuttuu ${k}`));
  const pickupAt = parseTime(o.pickup_at, pc), deliverBy = parseTime(o.deliver_by, dc), lastContact = parseTime(o.last_driver_contact, pc);
  if (Number.isNaN(pickupAt)) problems.push(t2(`Pickup time "${o.pickup_at}" is not a date`, `Noutoaika "${o.pickup_at}" ei ole päivämäärä`));
  if (Number.isNaN(deliverBy)) problems.push(t2(`Deliver-by "${o.deliver_by}" is not a date`, `Toimitusaika "${o.deliver_by}" ei ole päivämäärä`));

  // Route: the saved OSRM route when we have it, otherwise straight line × 1.25.
  // Without both countries the route (ferries, borders) would be guessed, so do not route.
  const A = pc && dc ? coordsOf(o.pickup_city) : null, B = pc && dc ? coordsOf(o.delivery_city) : null;
  if (o.pickup_city && !coordsOf(o.pickup_city)) problems.push(t2(`Pickup city "${o.pickup_city}" is not on our map list`, `Noutokaupunki "${o.pickup_city}" ei ole karttalistallamme`));
  if (o.delivery_city && !coordsOf(o.delivery_city)) problems.push(t2(`Delivery city "${o.delivery_city}" is not on our map list`, `Toimituskaupunki "${o.delivery_city}" ei ole karttalistallamme`));
  const gulf = (pc === 'EE') !== (dc === 'EE') && [pc, dc].includes('FI') ? (pc === 'EE' ? 'TLL-HEL' : 'HEL-TLL') : null;
  const baltic = dc === 'FI' && !['FI', 'EE'].includes(pc);
  const legs = [];
  let km = 0, hours = 0, ferryH = 0, routeSource = null;
  const roadLeg = (from, to) => {
    const r = savedRoute(from, to);
    if (r) { legs.push({ mode: 'drive', line: r.line, key: r.key }); km += r.km; hours += driveHours(r.km, r.minutes); routeSource = 'OSRM route (saved)'; return; }
    const a = coordsOf(from), b = coordsOf(to);
    if (a && b) { const k = haversineKm(a, b) * 1.25; legs.push({ mode: 'drive', line: [a, b], key: `${from}|${to}` }); km += k; hours += driveHours(k); routeSource ||= 'estimate: straight line × 1.25, 80 km/h'; }
  };
  if (A && B) {
    if (gulf === 'TLL-HEL') { roadLeg(o.pickup_city, 'Tallinn'); roadLeg('Helsinki', o.delivery_city); ferryH = 2.25 + CHECK_IN_MIN / 60; }
    else if (gulf === 'HEL-TLL') { roadLeg(o.pickup_city, 'Helsinki'); roadLeg('Tallinn', o.delivery_city); ferryH = 2.25 + CHECK_IN_MIN / 60; }
    else if (baltic) { roadLeg(o.pickup_city, 'Travemünde'); roadLeg('Helsinki', o.delivery_city); ferryH = 30 + 2 + 1; }
    else roadLeg(o.pickup_city, o.delivery_city);
  }
  const routeSrc = { kind: 'route', label: routeSource || 'route', labelFi: routeSource?.startsWith('OSRM') ? 'OSRM-reitti (tallennettu)' : 'arvio: linnuntie × 1,25, 80 km/h' };

  // Schedule: from now if the car is moving, else from pickup.
  const status = String(o.status || 'planned').toLowerCase().replace(/\s+/g, '_');
  const moving = /picked|transit|driving|on_route/.test(status);
  let predicted = null;
  if (Number.isFinite(pickupAt) && km) {
    const start = moving ? now : Math.max(pickupAt, now);
    predicted = start + (moving ? hours * 0.5 : hours) * H + ferryH * H;
    if (gulf && !moving) {
      const port = gulf === 'TLL-HEL' ? 'Tallinn' : 'Helsinki';
      const toPort = savedRoute(o.pickup_city, port);
      const atPort = start + driveHours(toPort?.km || 0, toPort?.minutes) * H;
      const sail = nextSailings(gulf, new Date(atPort).toISOString(), 1)[0];
      if (sail) {
        const fromPort = savedRoute(gulf === 'TLL-HEL' ? 'Helsinki' : 'Tallinn', o.delivery_city);
        predicted = Date.parse(sail.arr) + 0.5 * H + driveHours(fromPort?.km || 0, fromPort?.minutes) * H;
      }
    }
  }
  if (Number.isFinite(deliverBy) && predicted) {
    const slack = (deliverBy - predicted) / H;
    if (slack < 0) add(0.55, `Cannot make the deadline: predicted ${fmt(predicted)}, ${hrs(slack)} after the latest acceptable time`, `Määräaika ei toteudu: ennuste ${fmtFi(predicted)}, ${hrs(slack)} myöhässä`, cell('deliver_by'), { blocker: true, kind: 'late' });
    else if (slack < 2) add(0.3, `Only ${hrs(slack)} of buffer before the latest acceptable time`, `Vain ${hrs(slack)} väljyyttä ennen viimeistä aikaa`, routeSrc, { kind: 'tight' });
    else if (slack < 6) add(0.12, `${hrs(slack)} of buffer; the agent watches progress`, `${hrs(slack)} väljyyttä; agentti seuraa etenemistä`, routeSrc, { agentCan: true, kind: 'tight' });
  }
  if (!moving && Number.isFinite(pickupAt) && pickupAt < now - H)
    add(0.4, `Pickup was due ${hrs((now - pickupAt) / H)} ago and the car is not picked up`, `Nouto oli ${hrs((now - pickupAt) / H)} sitten, eikä autoa ole noudettu`, cell('pickup_at'), { blocker: true, kind: 'missed_pickup' });

  // Bahn's top signal: a driver who has the car and has gone quiet.
  if (moving && Number.isFinite(lastContact)) {
    const silentH = (now - lastContact) / H;
    if (silentH >= 12) add(0.7, `Driver has the car and has been silent for ${hrs(silentH)}`, `Kuljettajalla on auto ja hän on ollut hiljaa ${hrs(silentH)}`, cell('last_driver_contact'), { blocker: true, kind: 'silent' });
    else if (silentH >= 6) add(0.3, `No word from the driver for ${hrs(silentH)}; the agent asks first`, `Kuljettajasta ei ole kuulunut ${hrs(silentH)}; agentti kysyy ensin`, cell('last_driver_contact'), { agentCan: true, kind: 'silent_check' });
  }

  // Driver.
  const hoursToPickup = Number.isFinite(pickupAt) ? (pickupAt - now) / H : null;
  if (!o.driver && !moving) {
    if (hoursToPickup != null && hoursToPickup < 24) add(hoursToPickup < 12 ? 0.5 : 0.35, `No driver yet and pickup is in ${hrs(hoursToPickup)}`, `Ei vielä kuljettajaa ja nouto on ${hrs(hoursToPickup)} päästä`, cell('driver'), { kind: 'no_driver', blocker: hoursToPickup < 12 });
    else add(0.1, 'No driver yet; the agent can offer the job', 'Ei vielä kuljettajaa; agentti voi tarjota keikan', cell('driver'), { agentCan: true, kind: 'no_driver' });
  }
  const onTime = num(o.driver_on_time_pct), claims = num(o.driver_claims_12m);
  if (onTime != null && onTime < 85) add(onTime < 75 ? 0.2 : 0.1, `${o.driver || 'Driver'} is on time in ${onTime} % of deliveries`, `${o.driver || 'Kuljettaja'} on ajallaan ${onTime} %:ssa toimituksista`, cell('driver_on_time_pct'), { kind: 'driver' });
  if (claims != null && claims >= 2) add(0.1, `${o.driver || 'Driver'} had ${claims} damage claims in 12 months`, `${o.driver || 'Kuljettaja'}: ${claims} vahinkoilmoitusta 12 kk`, cell('driver_claims_12m'), { kind: 'driver' });

  // Readiness at both ends.
  if (no(o.pickup_confirmed) && hoursToPickup != null && hoursToPickup < 36 && !moving)
    add(0.2, 'Dealer has not confirmed the car, keys and papers; the agent asks today', 'Myyjä ei ole vahvistanut autoa, avaimia ja papereita; agentti kysyy tänään', cell('pickup_confirmed'), { agentCan: true, kind: 'readiness' });
  if (no(o.receiver_named)) add(0.15, 'No named person to receive and sign at delivery', 'Toimitukselle ei ole nimetty vastaanottajaa', cell('receiver_named'), { agentCan: true, kind: 'receiver' });

  // Ferries.
  if ((gulf || baltic) && !yes(o.ferry_booked) && !moving)
    add(baltic ? 0.3 : 0.25, baltic ? 'No ferry booked for the Germany → Finland crossing (about 30 h); a person books it' : `No ferry booked for ${gulf === 'TLL-HEL' ? 'Tallinn → Helsinki' : 'Helsinki → Tallinn'}; next sailings are in the published timetable`,
      baltic ? 'Saksa → Suomi -lauttaa (noin 30 h) ei ole varattu; ihminen varaa sen' : `Lauttaa ${gulf === 'TLL-HEL' ? 'Tallinna → Helsinki' : 'Helsinki → Tallinna'} ei ole varattu; seuraavat lähdöt julkaistussa aikataulussa`,
      cell('ferry_booked'), { kind: 'ferry' });
  if (baltic) add(0.1, 'Route goes via Travemünde, a known trouble spot for Bahn (port access and queues)', 'Reitti kulkee Travemünden kautta, joka on Bahnille tunnettu ongelmakohta', { kind: 'rule', label: "Bahn's answers, 25 Oct", labelFi: 'Bahnin vastaukset 25.10.' }, { agentCan: true, kind: 'travemunde' });
  if (baltic && predicted) for (const s of strikes()) {
    const st = Date.parse(s.starts_at), en = Date.parse(s.ends_at);
    if (predicted >= st && predicted - 30 * H <= en) add(0.35, `${s.title.en}; this car would arrive during it`, `${s.title.fi}; auto saapuisi lakon aikana`, { kind: 'news', label: s.source, labelFi: s.source }, { kind: 'strike' });
  }

  // Live conditions at the ends and on the route.
  const wx = [o.pickup_city, o.delivery_city].map((c) => live.weather[c] && { city: c, ...live.weather[c] }).filter(Boolean);
  for (const w of wx) {
    const bad = w.snowCm > 0 || (w.tempC <= 0 && w.precipMm > 0) || [45, 48, 56, 57, 66, 67, 75].includes(w.code);
    if (bad) add(0.12, `${weatherLabel(w.code)} in ${w.city} now (${Math.round(w.tempC)} °C)`, `${weatherLabel(w.code, 'fi')} nyt: ${w.city} (${Math.round(w.tempC)} °C)`, { kind: 'live', label: 'Open-Meteo, live', labelFi: 'Open-Meteo, reaaliaikainen' }, { agentCan: true, kind: 'weather' });
  }
  const roads = trafficOnRoute(legs).slice(0, 2);
  for (const t of roads) add(0.08, `Road notice on the route: ${t.title}`, `Tiedote reitillä: ${t.title}`, { kind: 'live', label: t.country === 'DE' ? 'Autobahn API, live' : 'Fintraffic, live', labelFi: t.country === 'DE' ? 'Autobahn API, reaaliaikainen' : 'Fintraffic, reaaliaikainen' }, { agentCan: true, kind: 'traffic' });
  for (const c of crossingsOn(legs)) add(0.03, c.text.en, c.text.fi, { kind: 'route', label: c.source, labelFi: c.source }, { agentCan: true, kind: 'crossing' });
  const tyres = winterTyreRule([pc, dc], Number.isFinite(pickupAt) ? new Date(pickupAt).toISOString() : null, wx);
  if (tyres) add(0.15, `Winter tyres ${tyres.en}: confirm the car has them`, `Talvirenkaat ${tyres.fi}: varmista että autossa on ne`, { kind: 'rule', label: 'Winter tyre rules', labelFi: 'Talvirengassäännöt' }, { agentCan: true, kind: 'tyres' });

  // EV range in the cold (estimate; Bahn has no winter range data).
  if (/electric|ev\b|bev/i.test(o.fuel || '') && km) {
    const temp = wx.length ? Math.min(...wx.map((w) => w.tempC)) : null;
    const plan = energyPlan({ id: o.ref, fuel: 'electric', model: String(o.car || '').split(' ').slice(1).join(' ') }, km, temp);
    if (plan?.stops) add(0.05 + Math.min(0.1, plan.stops * 0.03), `About ${plan.stops} charging stop(s) at ~${plan.rangeKm} km per charge (estimate)`, `Noin ${plan.stops} latausta, ~${plan.rangeKm} km / lataus (arvio)`, { kind: 'rule', label: 'EV range estimate', labelFi: 'Sähköauton toimintasäde-arvio' }, { agentCan: true, kind: 'energy' });
  }

  // Free-text notes: words dispatchers write when something is off.
  const note = String(o.notes || '');
  const hit = note.match(/keys?\b|papers?|documents?|not ready|no answer|damage|scratch|dent|late|delay|strike|closed|holiday|warning light|flat|avaim|paperit|ei valmis|vaurio|myöh/i);
  if (hit) add(0.25, `Note says: "${note.slice(0, 90)}"`, `Muistiinpano: "${note.slice(0, 90)}"`, cell('notes'), { kind: 'note' });

  // Combine exactly like the control room.
  reasons.sort((a, b) => b.r - a.r);
  const confidence = Math.round(100 * reasons.reduce((p, x) => p * (1 - x.r), 1));
  const human = reasons.filter((x) => !x.agentCan);
  const humanConf = Math.round(100 * human.reduce((p, x) => p * (1 - x.r), 1));
  const lane = problems.some((p) => /Missing|not a date|not on our map/.test(p.en)) ? 'check_data'
    : human.some((x) => x.blocker) || humanConf < NEEDS_YOU ? 'needs_you' : confidence < WATCH ? 'agent' : 'clear';
  const top = human.find((x) => x.blocker) || human[0] || reasons[0] || null;
  return {
    row: rowNo, ref: o.ref || `row ${rowNo}`, lane, confidence,
    from: { city: o.pickup_city, country: pc }, to: { city: o.delivery_city, country: dc },
    car: o.car || null, fuel: o.fuel || null, driver: o.driver || null, status,
    km: Math.round(km) || null, driveH: hours ? Math.round(hours * 10) / 10 : null, ferry: gulf || (baltic ? 'DE-FI' : null),
    pickupAt: Number.isFinite(pickupAt) ? new Date(pickupAt).toISOString() : null,
    deliverBy: Number.isFinite(deliverBy) ? new Date(deliverBy).toISOString() : null,
    predicted: predicted ? new Date(predicted).toISOString() : null,
    why: top?.text || null, reasons, problems,
  };
}

export function scoreOrders(text, filename = '', now = Date.now()) {
  const rows = parseOrders(text, filename);
  if (!rows.length) throw new Error('No orders found. Expected a CSV with a header row, or a JSON array of orders.');
  if (rows.length > 2000) throw new Error('At most 2,000 orders per file.');
  const seen = new Map();
  const scored = rows.map((o, i) => {
    const s = scoreRow(o, i + 2, now);
    if (o.ref && seen.has(o.ref)) { s.problems.push(t2(`Same reference as row ${seen.get(o.ref)}`, `Sama viite kuin rivillä ${seen.get(o.ref)}`)); s.lane = 'check_data'; }
    if (o.ref) seen.set(o.ref, i + 2);
    return s;
  });
  const order = { needs_you: 0, check_data: 1, agent: 2, clear: 3 };
  scored.sort((a, b) => order[a.lane] - order[b.lane] || a.confidence - b.confidence);
  const count = (l) => scored.filter((s) => s.lane === l).length;
  const unknown = Object.keys(rows[0]).filter((k) => !COLUMNS.some(([c]) => c === k));
  return {
    file: filename || null, scoredAt: new Date(now).toISOString(), thresholds: { needsYou: NEEDS_YOU, watch: WATCH },
    summary: { orders: scored.length, needsYou: count('needs_you'), agent: count('agent'), clear: count('clear'), checkData: count('check_data') },
    ignoredColumns: unknown, live: { status: live.status, at: live.weatherAt },
    orders: scored,
  };
}
