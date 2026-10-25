// Risk & confidence engine.
//
// Every signal becomes a *reason*: a risk r between 0 and 1, the factor it belongs
// to, whether the agent can deal with it alone, and the record it came from.
// Confidence that an order goes to plan without a person is the product of
// (1 − r) over all reasons (a noisy-OR). It is cheap, deterministic and explainable,
// so it can run on every order every few minutes; the language model only looks at
// the orders this engine flags.
import { db, rowsFor, finlandOrders, SNAPSHOT_AT } from './data.mjs';
import { coordsOf, valueClass, energyPlan, driverRecord, customerPrice, strikes, savedRoute, nextSailings, CHECK_IN_MIN } from './external.mjs';
import { live, kmFromSegment, weatherLabel } from './live.mjs';
import { fiOf } from './i18n.mjs';

const NOW = Date.parse(SNAPSHOT_AT);
const H = 3600e3;
const hoursFromNow = (iso) => (Date.parse(iso) - NOW) / H;
const eur = (cents) => `€${Math.round(cents / 100)}`;

export const FACTORS = ['readiness', 'schedule', 'route', 'car', 'driver', 'market', 'external'];

// Threshold: below NEEDS_YOU an order goes to a person. One bar for every car: Bahn
// trains every driver for every car and rarely moves cars over €100k, so value stays
// information only.
export const NEEDS_YOU = 55;
export const WATCH = 80;

function reason(factor, r, en, fi, source, opts = {}) {
  return { factor, r, text: { en, fi }, source, agentCan: false, blocker: false, ...opts };
}
const src = (table, rec, label, at) => ({ table, id: rec?.id, label, at: at || null });

function activeSegments(order) {
  return order.active_plan_id ? (db.by.segmentsByPlan[order.active_plan_id] || []) : [];
}

function currentAssignment(orderId) {
  const list = rowsFor('work_assignments', orderId).filter((a) => a.status !== 'CANCELLED');
  return list.find((a) => a.status === 'IN_PROGRESS') || list.find((a) => a.status === 'ASSIGNED') || list.at(-1) || null;
}

function windows(orderId) {
  const w = rowsFor('time_windows', orderId);
  const pick = (purpose) => w.filter((x) => x.purpose === purpose).sort((a, b) => (a.source === 'CUSTOMER' ? -1 : 1))[0];
  return {
    pickupSlot: w.find((x) => x.purpose === 'SELECTED_PICKUP_SLOT' && x.is_selected) || pick('SELECTED_PICKUP_SLOT') || pick('REQUESTED_PICKUP_SLOT'),
    requestedDelivery: pick('REQUESTED_DELIVERY_SLOT') || pick('SELECTED_DELIVERY_SLOT'),
    promise: pick('CUSTOMER_DELIVERY_PROMISE'),
  };
}

// Predicted arrival: live tracking first, then the booked ferry, then the plan.
function predictArrival(order, ctx) {
  const track = rowsFor('tracking_observations', order.id).sort((a, b) => a.observed_at.localeCompare(b.observed_at)).at(-1);
  if (track?.estimated_delivery_at && order.status === 'IN_TRANSIT') {
    return { at: track.estimated_delivery_at, basis: src('tracking_observations', track, 'Driver app estimate', track.observed_at) };
  }
  const ferry = ctx.ferry;
  if (ferry?.expected_arrival_at) {
    const after = ctx.delivery.country === 'EE' ? ctx.eeRoute : ctx.fiRoute;
    const driveH = after ? after.minutes / 60 : (kmBetween('Helsinki', ctx.delivery.city) * 1.25) / 75;
    const at = new Date(Date.parse(ferry.expected_arrival_at) + (1 + driveH) * H).toISOString();
    return { at, basis: src('travel_reservations', ferry, 'Booked ferry arrival + drive from port', ferry.booked_at) };
  }
  // No ferry booked yet for Germany → Finland: drive to the port, then a typical crossing
  // of about 30 h (Travemünde–Helsinki takes roughly 29–31 h), then the drive from Helsinki.
  if (ctx.baltic && ctx.win.pickupSlot) {
    const toPort = (ctx.contRoute?.minutes ?? 600) / 60, fromPort = (ctx.fiRoute?.minutes ?? 120) / 60;
    const at = new Date(Date.parse(ctx.win.pickupSlot.end_at) + (toPort + 2 + 30 + 1 + fromPort) * H).toISOString();
    return { at, basis: src('time_windows', ctx.win.pickupSlot, 'Plan estimate: drive to port + typical 30 h crossing (no ferry booked)', null) };
  }
  if (ctx.win.pickupSlot) {
    const driveH = ctx.driveKm / 75;
    const breaks = Math.floor(driveH / 4.5) * 0.75 + (driveH > 9 ? 9 : 0); // rest rules, overnight if long
    const at = new Date(Date.parse(ctx.win.pickupSlot.end_at) + (driveH + breaks) * H).toISOString();
    return { at, basis: src('time_windows', ctx.win.pickupSlot, 'Pickup slot + planned drive', null) };
  }
  return null;
}

// Ordered legs of the trip: drive legs carry the saved road route (with its line),
// ferry legs a straight line between ports.
const PORTS = { Tallinn: [59.444, 24.770], Helsinki: [60.163, 24.940] };
function buildLegs({ gulf, baltic, fiRoute, eeRoute, contRoute }) {
  const drive = (route) => route && { mode: 'drive', route, key: route.key, line: route.line };
  const ferry = (from, to, label) => ({ mode: 'ferry', key: `${from}|${to}`, label, line: [PORTS[from] || coordsOf(from), PORTS[to] || coordsOf(to)] });
  if (gulf === 'TLL-HEL') return [drive(eeRoute), ferry('Tallinn', 'Helsinki', 'Tallinn → Helsinki'), drive(fiRoute)].filter(Boolean);
  if (gulf === 'HEL-TLL') return [drive(fiRoute), ferry('Helsinki', 'Tallinn', 'Helsinki → Tallinn'), drive(eeRoute)].filter(Boolean);
  if (baltic) {
    // Drawn along the open Baltic (south of Sweden, past Gotland) rather than straight over land.
    const sea = { mode: 'ferry', key: 'West Baltic terminal|South Finland terminal', label: 'Germany → Finland',
      line: [coordsOf('West Baltic terminal'), [54.45, 11.6], [55.0, 13.8], [55.9, 16.6], [57.4, 19.2], [59.0, 21.6], [59.85, 24.2], coordsOf('South Finland terminal')] };
    return [drive(contRoute), sea, drive(fiRoute)].filter(Boolean);
  }
  return [drive(contRoute || fiRoute)].filter(Boolean);
}

// Km from a point to the nearest part of a [lat, lon] polyline.
function kmFromLine(p, line) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, kmFromSegment(p, line[i - 1], line[i]));
  return best;
}

function trafficOnRoute(legs) {
  const lines = legs.filter((l) => l.mode === 'drive' && l.line?.length > 1).map((l) => l.line);
  return live.traffic.filter((t) => lines.some((line) => kmFromLine([t.lat, t.lon], line) < 1.5));
}

// Known crossings on road routes. Prices change, so none are quoted here.
const CROSSINGS = [
  { id: 'fehmarn', box: [54.47, 11.12, 54.70, 11.42], point: [54.57, 11.27], source: 'OSRM route · Scandlines',
    text: { en: 'Route uses the Puttgarden–Rødby ferry (Scandlines, about 45 min, frequent sailings): driver needs a ticket', fi: 'Reitti kulkee Puttgarden–Rødby-lautalla (Scandlines, noin 45 min, tiheät lähdöt): kuljettaja tarvitsee lipun' } },
  { id: 'storebaelt', box: [55.28, 10.85, 55.38, 11.12], point: [55.335, 10.98], source: 'OSRM route · Sund & Bælt',
    text: { en: 'Route crosses the Great Belt bridge: toll per car, reimbursable to the driver', fi: 'Reitti ylittää Ison-Beltin sillan: tietulli autolta, korvataan kuljettajalle' } },
  { id: 'oresund', box: [55.54, 12.70, 55.64, 12.98], point: [55.58, 12.84], source: 'OSRM route · Øresundsbron',
    text: { en: 'Route crosses the Øresund bridge: toll per car, reimbursable to the driver', fi: 'Reitti ylittää Juutinrauman sillan: tietulli autolta, korvataan kuljettajalle' } },
];
function crossingsOn(legs) {
  const pts = legs.filter((l) => l.mode === 'drive').flatMap((l) => {
    const out = [];
    for (let i = 1; i < (l.line || []).length; i++) for (const f of [0, 0.25, 0.5, 0.75]) {
      const [a, b] = [l.line[i - 1], l.line[i]];
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    return out;
  });
  return CROSSINGS.filter((c) => pts.some(([la, lo]) => la >= c.box[0] && la <= c.box[2] && lo >= c.box[1] && lo <= c.box[3]));
}

// Winter tyre rules as general knowledge (to verify): Finland 1 Dec – end of Feb and Estonia
// 1 Dec – 1 Mar by law; Germany whenever there is ice or snow; Denmark none.
function winterTyreRule(countries, whenIso, weathers) {
  if (!whenIso) return null;
  const d = new Date(whenIso), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  if (countries.includes('FI') && (m === 12 || m <= 2)) return { en: 'required in Finland 1 Dec – end of Feb', fi: 'pakolliset Suomessa 1.12. – helmikuun loppuun' };
  if (countries.includes('EE') && (m === 12 || m <= 2 || (m === 3 && day === 1))) return { en: 'required in Estonia 1 Dec – 1 Mar', fi: 'pakolliset Virossa 1.12. – 1.3.' };
  if (countries.includes('DE') && weathers.some((w) => w.tempC <= 3 && (w.precipMm > 0 || w.snowCm > 0))) return { en: 'required in Germany in icy or snowy conditions, and they are forecast now', fi: 'pakolliset Saksassa liukkaalla kelillä, jota nyt ennustetaan' };
  return null;
}

// The customer's deliveries that arrived after their latest acceptable time (from the snapshot).
const lateCache = new Map();
function customerLateDeliveries(customerId, exceptOrderId) {
  if (!lateCache.has(customerId)) {
    const late = Object.values(db.orders).filter((o) => o.customer_id === customerId && o.status === 'DELIVERED').filter((o) => {
      const done = rowsFor('work_assignments', o.id).filter((a) => a.completed_at).map((a) => a.completed_at).sort().at(-1);
      const latest = rowsFor('time_windows', o.id).find((w) => w.purpose === 'CUSTOMER_DELIVERY_PROMISE')?.end_at;
      return done && latest && done > latest;
    }).map((o) => o.reference);
    lateCache.set(customerId, late);
  }
  return lateCache.get(customerId).filter((ref) => ref !== db.orders[exceptOrderId]?.reference);
}

function kmBetween(a, b) {
  const A = coordsOf(a), B = coordsOf(b);
  if (!A || !B) return 0;
  return kmFromSegment(A, B, B);
}

export function analyseOrder(order) {
  const pickup = db.addresses[order.pickup_address_id] || {};
  const delivery = db.addresses[order.delivery_address_id] || {};
  const items = rowsFor('order_items', order.id);
  const primary = items.find((i) => i.role === 'PRIMARY') || items[0];
  const vehicle = primary ? db.vehicles[primary.vehicle_id] : null;
  const segs = activeSegments(order);
  const driveKm = segs.filter((s) => s.transport_mode !== 'FERRY').reduce((n, s) => n + (s.distance_km || 0), 0)
    || Math.round(kmBetween(pickup.city, delivery.city) * 1.25);
  const ferry = rowsFor('travel_reservations', order.id).filter((r) => r.kind === 'FERRY' && r.status === 'BOOKED').at(-1) || null;
  const assignment = currentAssignment(order.id);
  const driver = assignment ? driverRecord(assignment.driver_id) : null;
  const win = windows(order.id);
  const value = valueClass(vehicle);
  const delivered = order.status === 'DELIVERED';
  // Road legs. Finland/Estonia: the Finnish leg plus the Estonian leg via Tallinn harbour.
  // Continent → Finland: drive to the West Baltic terminal, ferry, Helsinki → delivery.
  // Everything else (Germany, Denmark, ...): one road route end to end.
  const NORDIC = ['FI', 'EE'];
  const baltic = delivery.country === 'FI' && !NORDIC.includes(pickup.country);
  const fiRoute = delivery.country === 'EE' ? savedRoute(pickup.city, 'Helsinki')
    : delivery.country === 'FI' ? savedRoute(pickup.country === 'FI' ? pickup.city : 'Helsinki', delivery.city) : null;
  const eeRoute = pickup.country === 'EE' ? savedRoute(pickup.city, 'Tallinn') : delivery.country === 'EE' ? savedRoute('Tallinn', delivery.city) : null;
  const contRoute = baltic ? savedRoute(pickup.city, 'West Baltic terminal')
    : !NORDIC.includes(pickup.country) && !NORDIC.includes(delivery.country) ? savedRoute(pickup.city, delivery.city) : null;
  const gulf = (pickup.country === 'EE') !== (delivery.country === 'EE') ? (pickup.country === 'EE' ? 'TLL-HEL' : 'HEL-TLL') : null;
  const legs = buildLegs({ gulf, baltic, fiRoute, eeRoute, contRoute });
  const ctx = { pickup, delivery, driveKm, ferry, win, fiRoute, eeRoute, contRoute, baltic };
  const reasons = [];

  // ---------- Readiness & open evidence (the snapshot's own signals) ----------
  for (const inc of rowsFor('incidents', order.id).filter((i) => !i.resolved_at)) {
    const needs = ['NEEDS_HUMAN', 'AWAITING_DECISION'].includes(inc.status);
    reasons.push(reason('readiness', needs ? 0.55 : 0.35,
      `Open incident: ${label(inc.kind)}${inc.reported_symptom ? ` — ${inc.reported_symptom}` : ''}`,
      `Avoin poikkeama: ${label(inc.kind, 'fi')}${inc.reported_symptom ? ` — ${fiOf(inc.reported_symptom) || inc.reported_symptom}` : ''}`,
      src('incidents', inc, 'Incident', inc.opened_at), { blocker: needs, kind: 'incident', ref: inc }));
  }
  for (const a of rowsFor('alerts', order.id).filter((x) => x.status === 'OPEN')) {
    const r = { high: 0.4, medium: 0.25, low: 0.12 }[a.severity] || 0.2;
    const agentCan = /TRACKING_GAP/.test(a.signal);
    // A missed Gulf of Finland check-in has a concrete fix from the real timetable.
    if (a.signal === 'FERRY_CHECK_IN_RISK' && gulf) {
      const papersReady = Math.max(NOW, Date.parse(a.triggered_at)) + 60 * 60e3; // driver's estimate + drive to harbour
      const options = nextSailings(gulf, new Date(papersReady).toISOString(), 3).map((s) => {
        const drive = (gulf === 'TLL-HEL' ? fiRoute : eeRoute)?.minutes ?? 60;
        const arrive = new Date(Date.parse(s.arr) + (drive + 20) * 60e3).toISOString();
        return { ...s, arrive, inTime: !win.promise || arrive <= win.promise.end_at };
      });
      reasons.push(reason('route', 0.45, a.summary, a.summary, src('alerts', a, `Alert · ${label(a.signal)}`, a.triggered_at),
        { blocker: true, kind: 'missed_checkin', options }));
      continue;
    }
    reasons.push(reason(agentCan ? 'schedule' : 'readiness', r, a.summary, a.summary,
      src('alerts', a, `Alert · ${label(a.signal)}`, a.triggered_at), { agentCan, kind: 'alert', ref: a }));
  }
  for (const w of rowsFor('work_items', order.id).filter((x) => x.status === 'OPEN')) {
    reasons.push(reason('readiness', w.priority === 'high' ? 0.25 : 0.12, w.summary, w.summary,
      src('work_items', w, `Open task · ${label(w.kind)}`, w.opened_at), { kind: 'work', ref: w }));
  }
  const claims = rowsFor('endpoint_claims', order.id).filter((c) => !c.resolved_at);
  if (claims.length && !delivered) {
    reasons.push(reason('readiness', 0.2, `${claims.length} conflicting statement(s) about the ${claims[0].field.replace(/_/g, ' ')}`,
      `${claims.length} ristiriitaista tietoa: ${claims[0].field.replace(/_/g, ' ')}`,
      src('endpoint_claims', claims[0], 'Conflicting claims', claims[0].recorded_at), { kind: 'claim' }));
  }
  for (const p of rowsFor('agent_proposals', order.id)) {
    if (p.status === 'PENDING_REVIEW') {
      reasons.push(reason('readiness', 0.3, `Agent proposal waiting for review: ${p.summary}`, `Agentin ehdotus odottaa hyväksyntää: ${fiOf(p.summary) || p.summary}`,
        src('agent_proposals', p, 'Agent proposal', p.created_at), { blocker: true, kind: 'proposal', ref: p }));
    }
  }
  if (!delivered && order.status === 'NEW' && order.readiness_status !== 'CONFIRMED') {
    reasons.push(reason('readiness', 0.1, 'Pickup readiness not confirmed yet', 'Noudon valmiutta ei ole vielä vahvistettu',
      src('orders', order, 'Order readiness', order.updated_at), { agentCan: true, kind: 'readiness' }));
  }
  if (!delivered && order.status === 'WAITING_FOR_PICKUP' && win.pickupSlot && hoursFromNow(win.pickupSlot.start_at) < 36) {
    const ep = rowsFor('order_endpoint_details', order.id).find((e) => e.boundary === 'PICKUP');
    if (ep && (ep.access_status !== 'CONFIRMED' || ep.contact_status !== 'CONFIRMED')) {
      reasons.push(reason('readiness', 0.15, 'Pickup access or contact not confirmed, pickup within 36 h', 'Noutopaikan pääsyä tai yhteyshenkilöä ei vahvistettu, nouto 36 h sisällä',
        src('order_endpoint_details', ep, 'Pickup details', ep.stated_at), { agentCan: true, kind: 'access' }));
    }
  }
  for (const c of rowsFor('conversations', order.id).filter((x) => x.status === 'OPEN')) {
    const msgs = rowsFor('messages', order.id).filter((m) => m.conversation_id === c.id).sort((a, b) => a.authored_at.localeCompare(b.authored_at));
    const last = msgs.at(-1);
    if (last && !['operator', 'agent'].includes(last.author_type) && hoursFromNow(last.authored_at) < -2) {
      const customer = c.counterparty_type === 'customer';
      reasons.push(reason('readiness', customer ? 0.2 : 0.12,
        `Unanswered ${c.counterparty_type} message for ${Math.round(-hoursFromNow(last.authored_at))} h`,
        `Vastaamaton viesti (${c.counterparty_type}) ${Math.round(-hoursFromNow(last.authored_at))} h`,
        src('messages', last, `Message from ${c.counterparty_type}`, last.authored_at), { agentCan: !customer, kind: 'message' }));
    }
  }

  // ---------- Schedule: predicted arrival vs. latest time of arrival ----------
  // If the booked ferry is being missed, predict from the sailing we would rebook to.
  const missed = reasons.find((x) => x.kind === 'missed_checkin');
  const rebook = missed && (missed.options.find((o) => o.inTime) || missed.options[0]);
  const predicted = delivered ? null
    : rebook ? { at: rebook.arrive, basis: { table: 'timetable', id: gulf, label: `If rebooked to ${rebook.ship} ${hhmm(rebook.dep)} (published timetable)`, at: null } }
    : predictArrival(order, ctx);
  const lta = win.promise?.end_at || null;
  const eta = win.requestedDelivery?.end_at || win.promise?.start_at || null;
  let slackH = null;
  if (predicted && lta) {
    slackH = (Date.parse(lta) - Date.parse(predicted.at)) / H;
    // A late prediction from live tracking, a booked ferry or the earliest ferry still
    // on offer is solid; one from the plan alone is an estimate, so it weighs less and
    // does not block on its own.
    const solid = predicted.basis.table !== 'time_windows';
    if (slackH < 0) {
      // Bahn: the latest time is soft. One late car is a speed problem; a customer who
      // keeps getting late cars is losing trust, so repeats escalate.
      const prior = customerLateDeliveries(order.customer_id, order.id);
      const cust = db.customers[order.customer_id]?.name || 'this customer';
      if (prior.length) {
        reasons.push(reason('schedule', solid ? 0.55 : 0.3, `Predicted ${fmtH(-slackH)} past the latest time, and ${cust} already had ${prior.length} late deliver${prior.length > 1 ? 'ies' : 'y'} (${prior.join(', ')})`,
          `Ennuste ${fmtH(-slackH)} yli viimeisen ajan, ja asiakkaalla ${cust} on jo ${prior.length} myöhästynyttä toimitusta (${prior.join(', ')})`,
          predicted.basis, { blocker: solid, kind: 'late', repeat: prior.length }));
      } else {
        reasons.push(reason('schedule', solid ? 0.35 : 0.2, `Predicted ${fmtH(-slackH)} past the latest time; first late car for ${cust} in the data, and the time is soft`,
          `Ennuste ${fmtH(-slackH)} yli viimeisen ajan; asiakkaan ${cust} ensimmäinen myöhästyminen aineistossa, ja aika on joustava`,
          predicted.basis, { kind: 'late' }));
      }
    } else if (slackH < 2) {
      reasons.push(reason('schedule', 0.12, `Only ${fmtH(slackH)} of buffer before the latest arrival time`, `Vain ${fmtH(slackH)} pelivaraa viimeiseen saapumisaikaan`,
        predicted.basis, { agentCan: true, kind: 'tight' }));
    }
  }
  // Bahn's worst failure is a car picked up and never delivered; the early sign is a driver
  // going quiet. A GPS gap alone is weak (signal drops in the German countryside), so the
  // driver's last sign of life counts: last app position, last message, or pickup.
  if (order.status === 'IN_TRANSIT') {
    const track = rowsFor('tracking_observations', order.id).sort((a, b) => a.observed_at.localeCompare(b.observed_at)).at(-1);
    const said = rowsFor('messages', order.id).filter((m) => m.author_type === 'driver').sort((a, b) => a.authored_at.localeCompare(b.authored_at)).at(-1);
    const signs = [[track?.observed_at, track && src('tracking_observations', track, 'Last app position', track.observed_at)],
      [said?.authored_at, said && src('messages', said, 'Last driver message', said.authored_at)],
      [assignment?.started_at, assignment && src('work_assignments', assignment, 'Pickup', assignment.started_at)]].filter(([at]) => at).sort((a, b) => b[0].localeCompare(a[0]));
    const [lastAt, lastSrc] = signs[0] || [];
    const silentH = lastAt ? -hoursFromNow(lastAt) : null;
    const pastLatest = lta && Date.parse(lta) < NOW;
    if (silentH != null && (silentH >= 12 || (pastLatest && silentH >= 3))) {
      reasons.push(reason('driver', 0.7, `Car picked up, driver silent for ${fmtH(silentH)}: no app position or message since ${dayHhmm(lastAt)}${pastLatest ? ', and the latest arrival time has passed' : ''}`,
        `Auto noudettu, kuljettaja hiljaa ${fmtH(silentH)}: ei sijaintia eikä viestiä ${dayHhmm(lastAt)} jälkeen${pastLatest ? ', ja viimeinen saapumisaika on ohitettu' : ''}`,
        lastSrc, { blocker: true, kind: 'silent', lastAt }));
    } else if (silentH != null && silentH >= 6) {
      reasons.push(reason('driver', 0.3, `No word from the driver for ${fmtH(silentH)} since ${dayHhmm(lastAt)}; the agent is asking them`,
        `Kuljettajasta ei kuulunut ${fmtH(silentH)} (${dayHhmm(lastAt)} jälkeen); agentti kysyy`, lastSrc, { agentCan: true, kind: 'silent_check' }));
    } else {
      const age = track ? -hoursFromNow(track.observed_at) : null;
      if (age == null || age > 3) {
        reasons.push(reason('schedule', 0.06, age == null ? 'No app position yet; the driver has been in touch recently' : `No app position for ${Math.round(age)} h, often bad signal; the driver has been in touch recently`,
          age == null ? 'Ei vielä sijaintia sovelluksesta; kuljettaja on ollut yhteydessä äskettäin' : `Ei sijaintia ${Math.round(age)} h, usein huono kenttä; kuljettaja on ollut yhteydessä äskettäin`,
          track ? src('tracking_observations', track, 'Last position', track.observed_at) : src('orders', order, 'Order', null), { agentCan: true, kind: 'stale' }));
      }
    }
  }

  // ---------- Route: ferries, live weather, live traffic ----------
  if (!delivered) {
    // Germany/Denmark → Finland with no ferry booked yet: the crossing still has to be bought.
    if (baltic && !ferry && ['NEW', 'WAITING_FOR_PICKUP'].includes(order.status)) {
      reasons.push(reason('route', assignment ? 0.3 : 0.1, 'No ferry booked yet for the crossing to Finland', 'Suomeen ylittävää lauttaa ei ole vielä varattu',
        src('orders', order, 'Order plan: no ferry booking', order.updated_at), { kind: 'baltic_unbooked' }));
    }
    // Gulf of Finland: no ferry booked yet → name the first realistic sailing from the real timetable.
    if (gulf && !ferry && win.pickupSlot && hoursFromNow(win.pickupSlot.start_at) < 48) {
      const toHarbour = (gulf === 'TLL-HEL' ? eeRoute : fiRoute)?.minutes ?? 60;
      const ready = new Date(Date.parse(win.pickupSlot.end_at) + (toHarbour + 15) * 60e3).toISOString();
      const [first] = nextSailings(gulf, ready, 1);
      // Without a driver the ferry is not the next decision yet; the driver offer is.
      if (first) {
        reasons.push(reason('route', assignment ? 0.25 : 0.1,
          `No ferry booked. First sailing the driver can make: ${first.operator} ${first.ship} ${hhmm(first.dep)} (check-in ${hhmm(first.checkIn)})`,
          `Lauttaa ei ole varattu. Ensimmäinen mahdollinen: ${first.operator} ${first.ship} klo ${hhmm(first.dep)} (lähtöselvitys ${hhmm(first.checkIn)})`,
          { table: 'timetable', id: gulf, label: 'Helsinki–Tallinn timetable (published)', at: '2026-10-24T00:00:00Z' },
          { kind: 'ferry_unbooked', sailing: first }));
      }
    }
    if (ferry && ferry.check_in_confirmation !== 'CONFIRMED' && ferry.check_in_cutoff_at) {
      const h = hoursFromNow(ferry.check_in_cutoff_at);
      if (h > -1 && h < 8) {
        reasons.push(reason('route', 0.1, `Ferry check-in closes in ${fmtH(h)}; no check-in confirmed yet`, `Lautan lähtöselvitys sulkeutuu ${fmtH(h)} kuluttua; ei vielä vahvistettu`,
          src('travel_reservations', ferry, 'Ferry booking', ferry.booked_at), { agentCan: true, kind: 'checkin' }));
      }
    }
    const soon = order.status === 'IN_TRANSIT' || (win.pickupSlot && hoursFromNow(win.pickupSlot.start_at) < 48);
    if (soon) {
      // Weather at both ends and at the ports in between.
      const cities = [pickup.city, delivery.city, gulf ? 'Tallinn' : null, gulf || baltic ? 'Helsinki' : null, baltic ? 'West Baltic terminal' : null];
      for (const city of [...new Set(cities.filter(Boolean))]) {
        const w = live.weather[city];
        if (!w) continue;
        const ws = { table: 'live', id: `weather:${city}`, label: `Open-Meteo · ${city}`, at: live.weatherAt };
        const freezing = [56, 57, 66, 67].includes(w.code) || (w.tempC <= 1 && w.precipMm > 0);
        const snow = w.snowCm > 0 || [71, 73, 75, 77, 85, 86].includes(w.code);
        if (freezing) reasons.push(reason('route', 0.22, `Ice risk in ${city}: ${w.tempC.toFixed(0)} °C with precipitation`, `Liukkautta ${city}: ${w.tempC.toFixed(0)} °C ja sadetta`, ws, { agentCan: true, kind: 'weather' }));
        else if (snow) reasons.push(reason('route', 0.18, `Snow in ${city} (${weatherLabel(w.code)})`, `Lumisadetta: ${city} (${weatherLabel(w.code, 'fi')})`, ws, { agentCan: true, kind: 'weather' }));
        if (w.windKmh > 55) reasons.push(reason('route', 0.08, `Strong wind in ${city}: ${Math.round(w.windKmh)} km/h`, `Kova tuuli: ${city} ${Math.round(w.windKmh)} km/h`, ws, { agentCan: true, kind: 'weather' }));
        if (w.visibilityM != null && w.visibilityM < 1000) reasons.push(reason('route', 0.08, `Poor visibility in ${city}`, `Huono näkyvyys: ${city}`, ws, { agentCan: true, kind: 'weather' }));
      }
      // Live road notices within 1.5 km of the road actually driven (Finland: Fintraffic, Germany: Autobahn).
      for (const t of trafficOnRoute(legs).slice(0, 3)) {
        const serious = t.type === 'ACCIDENT_REPORT' || t.type === 'DE_CLOSURE' || /Unfall|Sperrung/i.test(t.title);
        const what = t.type === 'DE_CLOSURE' ? ['Road closed', 'Tie suljettu'] : serious ? ['Accident', 'Onnettomuus'] : ['Traffic notice', 'Liikennetiedote'];
        reasons.push(reason('route', serious ? 0.12 : 0.05, `${what[0]} on the route: ${t.title}`, `${what[1]} reitillä: ${t.title}`,
          { table: 'live', id: `traffic:${t.id}`, label: t.country === 'DE' ? 'Autobahn GmbH (live)' : 'Fintraffic Digitraffic', at: t.at }, { agentCan: true, kind: 'traffic', point: [t.lat, t.lon] }));
      }
    }
    // Bahn names Travemünde (the West Baltic port area) as a recurring trouble spot.
    const TRAVEMUNDE = [53.958, 10.874];
    if (baltic || legs.some((l) => l.mode === 'drive' && l.line?.length > 1 && kmFromLine(TRAVEMUNDE, l.line) < 15)) {
      reasons.push(reason('route', 0.1, 'Route goes via Travemünde, a known trouble spot for Bahn (port access and ferry check-in)', 'Reitti kulkee Travemünden kautta, joka on Bahnille tunnettu ongelmakohta (sataman sisäänajo ja lähtöselvitys)',
        { table: 'bahn', id: 'travemunde', label: 'Bahn operations (25 Oct 2026)', at: null }, { agentCan: true, kind: 'travemunde', point: TRAVEMUNDE }));
    }
    // Winter tyres, seasonal: fixed legal windows in Finland/Estonia, by conditions in Germany.
    const tyres = winterTyreRule([pickup.country, delivery.country, ...(gulf || baltic ? ['FI'] : [])], predicted?.at || lta || win.pickupSlot?.start_at, [pickup.city, delivery.city].map((c) => live.weather[c]).filter(Boolean));
    if (tyres) {
      reasons.push(reason('car', 0.1, `Winter tyres needed: ${tyres.en}; check the car has them`, `Talvirenkaat tarvitaan: ${tyres.fi}; tarkista, että autossa on ne`,
        { table: 'rule', id: 'winter-tyres', label: 'Winter tyre rules (general knowledge, verify)', at: null }, { agentCan: true, kind: 'tyres' }));
    }
    // Crossings on the road route (Fehmarn Belt ferry, Great Belt / Øresund bridge tolls).
    for (const c of crossingsOn(legs)) {
      reasons.push(reason('route', 0.02, c.text.en, c.text.fi, { table: 'crossing', id: c.id, label: c.source, at: null }, { agentCan: true, kind: 'crossing', point: c.point }));
    }
  }

  // ---------- Car: value, energy & charging ----------
  const temp = live.weather[delivery.city]?.tempC ?? null;
  const energy = energyPlan(vehicle, driveKm, temp);
  if (!delivered && energy?.kind === 'electric' && energy.stops >= 1) {
    // Real fast chargers along the driven legs (OpenStreetMap, saved in bahn.db).
    const driven = legs.filter((l) => l.mode === 'drive' && l.route);
    const fast = driven.length ? driven.reduce((n, l) => n + l.route.stops.fastCharging, 0) : null;
    const thin = fast != null && fast < energy.stops * 2;
    if (energy.stops >= 2 || thin) {
      // Bahn has no data on winter range loss, so the cold factor is an estimate and weighs little.
      reasons.push(reason('car', thin ? 0.08 : 0.05,
        `EV needs ${energy.stops} charging stop(s) (about ${energy.rangeKm} km per charge at ${temp ?? '?'} °C, an estimate)${fast != null ? `; ${fast} fast charger(s) along the route` : ''}`,
        `Sähköauto tarvitsee ${energy.stops} latausta (noin ${energy.rangeKm} km latauksella ${temp ?? '?'} °C:ssa, arvio)${fast != null ? `; ${fast} pikalaturia reitin varrella` : ''}`,
        driven.length ? { table: 'route', id: driven[0].route.key, label: 'Chargers: OpenStreetMap · range: estimate, no Bahn winter data', at: driven[0].route.fetchedAt } : { table: 'demo', id: `energy:${vehicle.id}`, label: 'Range estimate (no Bahn winter data)', at: null },
        { agentCan: true, kind: 'energy' }));
    }
  }

  // ---------- Driver: track record (demo history + snapshot assignments) ----------
  if (driver && !delivered) {
    const d = driver.demo;
    const dsrc = { table: 'demo', id: `driver:${driver.id}`, label: `Track record · ${driver.name} (demo data)`, at: null };
    if (d.onTimeRate < 0.88) reasons.push(reason('driver', 0.07, `${driver.name} is on time in ${Math.round(d.onTimeRate * 100)} % of deliveries`, `${driver.name} on ajoissa ${Math.round(d.onTimeRate * 100)} % toimituksista`, dsrc, { kind: 'driver' }));
    // Bahn: every driver is trained for every car, so claims count the same whatever the car.
    if (d.damageClaims12m >= 2) reasons.push(reason('driver', 0.1, `${driver.name} had ${d.damageClaims12m} damage claims in 12 months`, `${driver.name}: ${d.damageClaims12m} vahinkoilmoitusta 12 kk`, dsrc, { kind: 'driver' }));
    // Bahn: drivers dropping out is rare, so a past miss weighs little.
    if (d.noShows12m && order.status === 'WAITING_FOR_PICKUP') reasons.push(reason('driver', 0.06, `${driver.name} missed a pickup in the last 12 months`, `${driver.name} jätti noudon väliin viimeisen 12 kk aikana`, dsrc, { kind: 'driver' }));
    if (driver.snapshot.cancelled) reasons.push(reason('driver', 0.04, `${driver.name} cancelled ${driver.snapshot.cancelled} booking(s) recently`, `${driver.name} perui ${driver.snapshot.cancelled} varausta äskettäin`, src('work_assignments', assignment, 'Assignments', null), { kind: 'driver' }));
  }

  // ---------- Market: an offer nobody takes ----------
  const offer = rowsFor('market_offers', order.id).filter((o) => o.status === 'PUBLISHED').at(-1);
  if (offer && !delivered) {
    const age = -hoursFromNow(offer.published_at);
    const passes = (db.by.signalsByOffer[offer.id] || []).filter((s) => s.action === 'PASS').length;
    if (age > 12) {
      const price = customerPrice(offer.fee_cents);
      const raised = Math.round(offer.fee_cents * 1.12 / 500) * 500;
      reasons.push(reason('market', age > 36 ? 0.35 : 0.2,
        `Offer open ${Math.round(age)} h with no driver${passes ? ` (${passes} passed)` : ''}`,
        `Tarjous auki ${Math.round(age)} h ilman kuljettajaa${passes ? ` (${passes} ohitti)` : ''}`,
        src('market_offers', offer, 'Driver offer', offer.published_at),
        { kind: 'offer', fee: offer.fee_cents, raised, price }));
    }
  }

  // ---------- External: strikes and news ----------
  for (const s of strikes()) {
    if (ferry && s.terminal_id && ferry.destination_terminal_id === s.terminal_id && !delivered) {
      const arr = Date.parse(ferry.expected_arrival_at);
      if (arr >= Date.parse(s.starts_at) && arr <= Date.parse(s.ends_at)) {
        reasons.push(reason('external', 0.35, `${s.title.en}. This car's ferry arrives during the strike.`, `${s.title.fi}. Tämän auton lautta saapuu lakon aikana.`,
          { table: 'news', id: s.id, label: s.source, at: s.published_at }, { kind: 'strike', group: s.id }));
      }
    }
  }

  // ---------- Combine ----------
  reasons.sort((a, b) => b.r - a.r);
  const confidence = Math.round(100 * reasons.reduce((p, x) => p * (1 - x.r), 1));
  const factorRisk = Object.fromEntries(FACTORS.map((f) => [f, Math.round(100 * (1 - reasons.filter((x) => x.factor === f).reduce((p, x) => p * (1 - x.r), 1)))]));
  // Grouped causes (a strike) are decided once, on the banner, not per order.
  const human = reasons.filter((x) => !x.agentCan && !x.group);
  const humanConf = Math.round(100 * human.reduce((p, x) => p * (1 - x.r), 1));
  const threshold = NEEDS_YOU;

  let lane;
  if (delivered && human.length === 0) lane = 'done';
  else if (human.some((x) => x.blocker) || humanConf < threshold) lane = 'needs_you';
  else if (confidence < WATCH) lane = 'agent';
  else lane = 'clear';

  // The dealer cannot produce the car: offer ways out, not only "wait".
  const noCar = !delivered && (rowsFor('incidents', order.id).some((i) => !i.resolved_at && i.kind === 'EMPTY_PICKUP')
    || rowsFor('alerts', order.id).some((a) => a.status !== 'RESOLVED' && /EMPTY_PICKUP/.test(a.signal)));
  const options = noCar ? noCarOptions({ order, driver, assignment, pickup }) : null;

  // The one sentence that says why a person has to look.
  const top = human.find((x) => x.blocker) || human[0] || null;
  const whyYou = lane === 'needs_you' && top ? { text: top.text, kind: top.kind, source: top.source } : null;

  return {
    id: order.id,
    ref: order.reference,
    status: order.status,
    lane,
    whyYou,
    etaPlan: delivered ? null : etaScenarios({ reasons, predicted, gulf, fiRoute, eeRoute, assignment }),
    confidence,
    threshold,
    value,
    vehicle: vehicle && { make: vehicle.make, model: vehicle.model, year: vehicle.model_year, fuel: vehicle.fuel, plate: vehicle.registration },
    customer: db.customers[order.customer_id]?.name,
    from: { city: pickup.city, country: pickup.country, name: pickup.name, kind: pickup.kind },
    to: { city: delivery.city, country: delivery.country, name: delivery.name, kind: delivery.kind },
    routeKind: order.route_kind,
    driveKm,
    fiRoute,
    eeRoute,
    contRoute,
    gulf,
    legs,
    deadline: lane === 'needs_you' ? deadlineFor(reasons, { order, win, lta: win.promise?.end_at, offer, noCar }) : null,
    ferry: ferry && { provider: ferry.provider, departs: ferry.departure_at, arrives: ferry.expected_arrival_at, ref: ferry.booking_reference, checkIn: ferry.check_in_confirmation },
    pickupSlot: win.pickupSlot && { start: win.pickupSlot.start_at, end: win.pickupSlot.end_at },
    eta, lta, predicted: predicted?.at || null, slackH,
    driver: driver && { id: driver.id, name: driver.name, homeCity: driver.homeCity, ...driver.demo, snapshot: driver.snapshot },
    fee: assignment?.fee_cents || offer?.fee_cents || null,
    customerPrice: customerPrice(assignment?.fee_cents || offer?.fee_cents),
    energy,
    reasons,
    factorRisk,
    options,
    decision: lane === 'needs_you' ? nextDecision(reasons.filter((x) => !x.group), { order, driver, vehicle, value }) : null,
    agentWork: reasons.filter((x) => x.agentCan || x.group).map((x) => agentTask(x)),
  };
}

// The moment by which a person must act, from the order's own records: a ferry check-in,
// the driver's stated waiting limit, an offer expiry, a task's due time, a customer
// waiting for a reply. The earliest one wins; the queue is sorted by it.
function deadlineFor(reasons, { order, win, lta, offer, noCar }) {
  const c = [];
  const add = (at, en, fi) => { if (at) c.push({ at, text: { en, fi } }); };
  for (const r of reasons.filter((x) => !x.agentCan && !x.group)) {
    if (r.kind === 'silent') { add(r.lastAt, 'Driver silent since', 'Kuljettaja hiljaa alkaen'); c.at(-1).critical = true; }
    if (r.kind === 'missed_checkin') {
      const b = r.options.find((o) => o.inTime) || r.options[0];
      if (b) add(b.checkIn, `Rebook before the ${b.ship} ${hhmm(b.dep)} check-in closes`, `Varaa ennen kuin ${b.ship} klo ${hhmm(b.dep)} -lähtöselvitys sulkeutuu`);
    }
    if (r.kind === 'ferry_unbooked') add(r.sailing.checkIn, `Book before the ${r.sailing.ship} ${hhmm(r.sailing.dep)} check-in`, `Varaa ennen ${r.sailing.ship} klo ${hhmm(r.sailing.dep)} -lähtöselvitystä`);
    if (r.kind === 'baltic_unbooked' && win.pickupSlot && Date.parse(win.pickupSlot.start_at) > NOW) add(win.pickupSlot.start_at, 'Book the ferry before pickup', 'Varaa lautta ennen noutoa');
    if (r.kind === 'late') add(lta, 'Latest acceptable arrival', 'Viimeinen hyväksytty saapumisaika');
    if (r.kind === 'offer' && offer?.expires_at) add(offer.expires_at, 'Driver offer expires', 'Kuljettajatarjous vanhenee');
    if (r.kind === 'incident' && r.ref.kind === 'VEHICLE_WARNING') add(SNAPSHOT_AT, 'Driver is stopped on the road now', 'Kuljettaja on pysähtynyt tien varteen');
    if (r.kind === 'incident' && r.ref.kind === 'POST_DELIVERY_CONDITION_CLAIM') add(new Date(Date.parse(r.ref.opened_at) + 24 * H).toISOString(), 'Reply to the damage claim (24 h)', 'Vastaa vaurioilmoitukseen (24 h)');
    if (r.kind === 'alert' && /CONDITION_CLAIM|PROOF/.test(r.ref.signal)) add(new Date(Date.parse(r.ref.triggered_at) + 24 * H).toISOString(), 'Reply to the customer’s claim (24 h)', 'Vastaa asiakkaan reklamaatioon (24 h)');
    if (r.kind === 'message' && r.source.at) add(new Date(Date.parse(r.source.at) + 24 * H).toISOString(), 'Customer has waited for a reply (24 h)', 'Asiakas odottaa vastausta (24 h)');
  }
  if (noCar) {
    // The driver usually says how long they can wait ("I can wait another 30 minutes").
    const m = rowsFor('messages', order.id).filter((x) => x.author_type === 'driver').sort((a, b) => a.authored_at.localeCompare(b.authored_at)).at(-1);
    const mins = Number(m?.body.match(/(\d+)\s*min/i)?.[1]);
    if (mins) add(new Date(Date.parse(m.authored_at) + mins * 60e3).toISOString(), 'Driver stops waiting at the pickup site', 'Kuljettaja lopettaa odottamisen noutopaikalla');
  }
  for (const w of rowsFor('work_items', order.id).filter((x) => x.status === 'OPEN' && x.due_at)) add(w.due_at, 'Open task is due', 'Avoin tehtävä erääntyy');
  // Fallbacks only while they still lie ahead of the work (a passed pickup slot is no deadline).
  if (!c.length && win.pickupSlot && ['NEW', 'WAITING_FOR_PICKUP'].includes(order.status) && Date.parse(win.pickupSlot.start_at) > NOW) add(win.pickupSlot.start_at, 'Pickup slot starts', 'Noutoaika alkaa');
  if (!c.length && lta) add(lta, 'Latest acceptable arrival', 'Viimeinen hyväksytty saapumisaika');
  // Bahn's worst case (a silent driver after pickup) always outranks other clocks.
  return c.find((x) => x.critical) || c.sort((a, b) => a.at.localeCompare(b.at))[0] || null;
}

// When the dealer has no matching car, finding it can take days. Besides waiting,
// the person can release the driver and reschedule, give the driver a nearby job,
// or cancel. Anything that reaches the customer is drafted for the person to send.
function noCarOptions({ order, driver, assignment, pickup }) {
  const name = driver?.name || 'the driver';
  const fee = assignment?.fee_cents || 0;
  const callOut = Math.round((fee * 0.3) / 100);
  const opts = [{
    id: 'wait', kind: 'wait',
    label: { en: 'Wait 1 more hour', fi: 'Odota vielä tunti' },
    effect: { en: `${name} waits at the site for up to 1 hour while the agent keeps asking the site. If the car is not found by then, it comes back to you with the other options.`,
      fi: `${name} odottaa paikalla enintään tunnin, ja agentti kysyy paikalta lisää. Jos autoa ei löydy, agentti palaa sinulle muilla vaihtoehdoilla.` },
  }, {
    id: 'reschedule', kind: 'reschedule',
    label: { en: 'Release driver, reschedule pickup', fi: 'Vapauta kuljettaja, siirrä nouto' },
    effect: { en: `The agent releases ${name} now${callOut ? ` with a call-out fee of €${callOut} (demo rule: 30 % of the fee)` : ''}, puts the order on hold and asks the site every morning. When the dealer confirms the right car, the job is republished. A note to the customer is drafted for you to send.`,
      fi: `Agentti vapauttaa kuljettajan ${name} heti${callOut ? ` ja maksaa ${callOut} € käyntimaksun (demosääntö: 30 % palkkiosta)` : ''}, laittaa tilauksen odottamaan ja kysyy paikalta joka aamu. Kun oikea auto vahvistetaan, keikka julkaistaan uudelleen. Viesti asiakkaalle luonnostellaan sinun lähetettäväksesi.` },
  }];
  // An open job near the waiting driver, so the trip is not wasted.
  const here = coordsOf(pickup.city);
  const nearby = finlandOrders()
    .filter((o) => o.id !== order.id && ['NEW', 'WAITING_FOR_PICKUP'].includes(o.status))
    .filter((o) => !rowsFor('work_assignments', o.id).some((w) => ['ASSIGNED', 'IN_PROGRESS'].includes(w.status)))
    .filter((o) => rowsFor('market_offers', o.id).some((m) => m.status === 'PUBLISHED'))
    .map((o) => ({ o, from: db.addresses[o.pickup_address_id], to: db.addresses[o.delivery_address_id] }))
    .filter((x) => here && coordsOf(x.from.city) && kmBetween(pickup.city, x.from.city) < 60)[0];
  if (driver && nearby) {
    opts.push({
      id: 'reassign', kind: 'reassign',
      label: { en: `Give ${name} ${nearby.o.reference} instead`, fi: `Anna kuljettajalle ${nearby.o.reference}` },
      effect: { en: `${name} takes the open job ${nearby.o.reference} (${nearby.from.city} → ${nearby.to.city}) instead, so the trip is not wasted. This order goes on hold until the dealer finds the car; the agent asks the site every morning.`,
        fi: `${name} ottaa avoimen keikan ${nearby.o.reference} (${nearby.from.city} → ${nearby.to.city}), jottei matka mene hukkaan. Tämä tilaus odottaa, kunnes jälleenmyyjä löytää auton; agentti kysyy paikalta joka aamu.` },
    });
  }
  opts.push({
    id: 'cancel', kind: 'cancel', danger: true,
    label: { en: 'Cancel delivery', fi: 'Peru toimitus' },
    effect: { en: `The agent releases ${name}${callOut ? ` (call-out fee €${callOut})` : ''} and closes the order as cancelled: the dealer could not provide the car. A cancellation note to ${db.customers[order.customer_id]?.name || 'the customer'} is drafted for you to send; nothing goes out until you send it.`,
      fi: `Agentti vapauttaa kuljettajan ${name}${callOut ? ` (käyntimaksu ${callOut} €)` : ''} ja sulkee tilauksen peruttuna: jälleenmyyjä ei pystynyt luovuttamaan autoa. Peruutusviesti asiakkaalle ${db.customers[order.customer_id]?.name || ''} luonnostellaan sinun lähetettäväksesi; mitään ei lähetetä ennen kuin lähetät sen.` },
  });
  return opts;
}

// Arrival if nobody acts vs. if the person approves the suggestion.
function etaScenarios({ reasons, predicted, gulf, fiRoute, eeRoute, assignment }) {
  const driveMin = ((gulf === 'HEL-TLL' ? eeRoute : fiRoute)?.minutes ?? 60) + 20;
  const plus = (iso, min) => new Date(Date.parse(iso) + min * 60e3).toISOString();
  const missed = reasons.find((x) => x.kind === 'missed_checkin');
  if (missed) {
    const best = missed.options.find((o) => o.inTime) || missed.options[0];
    return {
      ifNothing: { at: null, en: 'Booked ferry is missed and no other crossing is booked, so the arrival is unknown', fi: 'Varattu lautta menee ohi eikä muuta ylitystä ole varattu, joten saapumisaika on tuntematon' },
      ifApproved: best && { at: best.arrive, en: `Via ${best.operator} ${best.ship} ${hhmm(best.dep)}`, fi: `${best.operator} ${best.ship} klo ${hhmm(best.dep)}` },
    };
  }
  const unbooked = reasons.find((x) => x.kind === 'ferry_unbooked' && x.r >= 0.25);
  if (unbooked) {
    const s = unbooked.sailing;
    const [next] = nextSailings(gulf, plus(s.checkIn, 1), 1);
    return {
      ifNothing: next ? { at: plus(next.arr, driveMin), en: `If ${s.ship} sells out: next is ${next.ship} ${hhmm(next.dep)}`, fi: `Jos ${s.ship} myydään loppuun: seuraava ${next.ship} klo ${hhmm(next.dep)}` } : null,
      ifApproved: { at: plus(s.arr, driveMin), en: `Via ${s.operator} ${s.ship} ${hhmm(s.dep)}`, fi: `${s.operator} ${s.ship} klo ${hhmm(s.dep)}` },
    };
  }
  if (reasons.some((x) => x.kind === 'silent')) {
    return {
      ifNothing: { at: null, en: 'Where the car is and when it arrives is unknown', fi: 'Auton sijainti ja saapumisaika ovat tuntemattomia' },
      ifApproved: null,
    };
  }
  if (reasons.some((x) => x.kind === 'incident' && x.ref.kind === 'EMPTY_PICKUP')) {
    return {
      ifNothing: { at: null, en: 'The car is not released, so it does not move', fi: 'Autoa ei luovuteta, joten se ei liiku' },
      ifApproved: null,
    };
  }
  if (reasons.some((x) => x.kind === 'incident' && x.ref.kind === 'VEHICLE_WARNING')) {
    return {
      ifNothing: { at: null, en: 'The car is stopped with a warning light; it does not move until someone decides', fi: 'Auto on pysähtynyt varoitusvalon takia eikä liiku ennen päätöstä' },
      ifApproved: null,
    };
  }
  if (!assignment && reasons.some((x) => x.kind === 'offer')) {
    return {
      ifNothing: { at: null, en: 'No driver yet, so the car does not move', fi: 'Ei vielä kuljettajaa, joten auto ei liiku' },
      ifApproved: predicted && { at: predicted.at, en: 'Once a driver takes the job', fi: 'Kun kuljettaja ottaa keikan' },
    };
  }
  return { ifNothing: predicted ? { at: predicted.at, en: 'Current plan', fi: 'Nykyinen suunnitelma' } : null, ifApproved: null };
}

// The one decision we bring to a person, with what happens on approve.
function nextDecision(reasons, { order, value }) {
  const top = reasons.find((x) => !x.agentCan && x.blocker) || reasons.find((x) => !x.agentCan) || reasons[0];
  if (!top) return null;
  const d = (en, fi, approve, change, effectEn, effectFi) => ({ text: { en, fi }, approve, change, effect: { en: effectEn, fi: effectFi }, basis: top.source, kind: top.kind });
  switch (top.kind) {
    case 'silent':
      return d('Phone the driver now. If there is no answer within 30 minutes, treat the car as missing: pull the last GPS points, call the driver’s emergency contact, and line up a replacement driver near the last position.',
        'Soita kuljettajalle heti. Jos hän ei vastaa 30 minuutissa, käsittele autoa kadonneena: hae viimeiset GPS-pisteet, soita kuljettajan hätäyhteyshenkilölle ja varaa korvaava kuljettaja viimeisen sijainnin läheltä.',
        { en: 'I’m calling the driver', fi: 'Soitan kuljettajalle' }, { en: 'Other plan', fi: 'Muu suunnitelma' },
        'The agent keeps messaging the driver every 15 minutes, collects the last positions and finds the nearest free drivers. The customer is not told anything until you decide.',
        'Agentti viestii kuljettajalle 15 minuutin välein, kerää viimeiset sijainnit ja etsii lähimmät vapaat kuljettajat. Asiakkaalle ei kerrota mitään ennen päätöstäsi.');
    case 'missed_checkin': {
      const best = top.options.find((o) => o.inTime) || top.options[0];
      if (!best) break;
      const others = top.options.filter((o) => o !== best);
      const rest = (late) => others.map((o) => `${o.ship} ${hhmm(o.dep)}${o.inTime ? '' : ` (${late})`}`).join(', ');
      return d(`Move the car to ${best.operator} ${best.ship} at ${hhmm(best.dep)} (check-in ${hhmm(best.checkIn)}). It reaches the dealer around ${dayHhmm(best.arrive)}${best.inTime ? ', inside the latest arrival time' : ', after the latest arrival time'}.${others.length ? ` Other sailings: ${rest('late')}.` : ''}`,
        `Siirrä auto ${best.operator} ${best.ship} klo ${hhmm(best.dep)} (lähtöselvitys ${hhmm(best.checkIn)}). Perillä noin ${dayHhmm(best.arrive)}${best.inTime ? ', viimeisen saapumisajan sisällä' : ', myöhässä'}.${others.length ? ` Muut: ${rest('myöhässä')}.` : ''}`,
        { en: `Rebook to ${best.ship} ${hhmm(best.dep)}`, fi: `Vaihda: ${best.ship} ${hhmm(best.dep)}` }, { en: 'Other sailing', fi: 'Muu lähtö' },
        `The agent changes the booking (≈ €${best.eur}, indicative), sends the driver the new check-in time and terminal (${best.fromTerminal}), and keeps watching. The dealer is not contacted because the car still arrives in time.`,
        `Agentti muuttaa varauksen (n. ${best.eur} €), lähettää kuljettajalle uuden lähtöselvitysajan ja terminaalin (${best.fromTerminal}) ja seuraa tilannetta. Jälleenmyyjään ei oteta yhteyttä, koska auto ehtii ajallaan.`);
    }
    case 'ferry_unbooked': {
      const s = top.sailing;
      return d(`Book ${s.operator} ${s.ship} ${dayHhmm(s.dep)} → arrives ${hhmm(s.arr)} (≈ €${s.eur} for car and driver, indicative).`,
        `Varaa ${s.operator} ${s.ship} ${dayHhmm(s.dep)} → perillä ${hhmm(s.arr)} (n. ${s.eur} € autolle ja kuljettajalle, suuntaa-antava).`,
        { en: 'Approve booking', fi: 'Hyväksy varaus' }, { en: 'Other sailing', fi: 'Muu lähtö' },
        `The agent books the car space, sends the driver the check-in time (${hhmm(s.checkIn)}) and terminal (${s.fromTerminal}), and logs the cost on the order.`,
        `Agentti varaa autopaikan, lähettää kuljettajalle lähtöselvitysajan (${hhmm(s.checkIn)}) ja terminaalin (${s.fromTerminal}) ja kirjaa kulun tilaukselle.`);
    }
    case 'proposal':
      return d(top.ref.summary, top.ref.summary, { en: 'Approve proposal', fi: 'Hyväksy ehdotus' }, { en: 'Change', fi: 'Muuta' },
        'The agent re-checks the order is unchanged, then carries out the proposal and logs it on the timeline.',
        'Agentti tarkistaa, ettei tilaus ole muuttunut, toteuttaa ehdotuksen ja kirjaa sen aikajanalle.');
    case 'strike':
      return d('Move the ferry to the Southwest Finland terminal (outside the strike), or keep it and warn the dealer of a 1-day delay.',
        'Siirrä lautta Lounais-Suomen terminaaliin (lakon ulkopuolella) tai pidä varaus ja varoita jälleenmyyjää päivän viiveestä.',
        { en: 'Rebook ferry', fi: 'Varaa uusi lautta' }, { en: 'Keep & warn dealer', fi: 'Pidä ja varoita' },
        'The agent requests the new ferry slot (≈ +€15), updates the driver\'s plan and messages the driver. The dealer is not contacted.',
        'Agentti pyytää uuden lauttapaikan (n. +15 €), päivittää kuljettajan suunnitelman ja viestii kuljettajalle. Jälleenmyyjään ei oteta yhteyttä.');
    case 'late':
      return d('This car will miss the latest arrival time. Tell the dealer now, or approve a faster plan.',
        'Auto ei ehdi viimeiseen saapumisaikaan. Kerro jälleenmyyjälle nyt tai hyväksy nopeampi suunnitelma.',
        { en: 'Draft message to dealer', fi: 'Luonnostele viesti' }, { en: 'Find faster plan', fi: 'Etsi nopeampi' },
        'The agent drafts the delay message for you to send. Nothing goes to the customer until you press send.',
        'Agentti luonnostelee viivästysviestin. Asiakkaalle ei lähetetä mitään ennen kuin painat lähetä.');
    case 'baltic_unbooked':
      return d('No ferry is booked for the crossing to Finland yet. Have the agent find the next sailing the driver can reach after pickup and bring it to you for approval.',
        'Suomeen ylittävää lauttaa ei ole vielä varattu. Anna agentin etsiä seuraava lähtö, jonka kuljettaja ehtii noudon jälkeen, ja tuoda se hyväksyttäväksesi.',
        { en: 'Find a sailing', fi: 'Etsi lähtö' }, { en: 'I’ll book it', fi: 'Varaan itse' },
        'The agent checks the operators’ current sailings for the date, then brings you one booking with its price to approve. Nothing is bought before you approve.',
        'Agentti tarkistaa varustamojen lähdöt päivälle ja tuo yhden varauksen hintoineen hyväksyttäväksesi. Mitään ei osteta ennen hyväksyntää.');
    case 'offer':
      return d(`No driver has taken this job. Raise the driver fee from ${eur(top.fee)} to ${eur(top.raised)}? Customer price ${eur(top.price)} — margin stays ${Math.round((1 - top.raised / top.price) * 100)} %.`,
        `Kukaan ei ole ottanut keikkaa. Nostetaanko palkkio ${eur(top.fee)} → ${eur(top.raised)}? Asiakashinta ${eur(top.price)}, kate ${Math.round((1 - top.raised / top.price) * 100)} %.`,
        { en: 'Raise fee', fi: 'Nosta palkkiota' }, { en: 'Offer to a driver directly', fi: 'Tarjoa suoraan' },
        'The agent republishes the offer at the new fee and tells you when a driver accepts.',
        'Agentti julkaisee tarjouksen uudella palkkiolla ja ilmoittaa, kun kuljettaja hyväksyy.');
    case 'driver':
      return d(`The assigned driver's track record has a problem: ${top.text.en}. Keep them, or offer the job to another driver?`,
        `Kuljettajan historiassa on ongelma: ${top.text.fi}. Pidetäänkö kuljettaja vai tarjotaanko keikka toiselle?`,
        { en: 'See other drivers', fi: 'Näytä muut kuljettajat' }, { en: 'Keep driver', fi: 'Pidä kuljettaja' },
        'If you swap, the agent offers the job to the chosen driver and releases the current one with a polite message.',
        'Jos vaihdat, agentti tarjoaa työn valitulle kuljettajalle ja vapauttaa nykyisen kohteliaalla viestillä.');
    case 'incident':
      return d(incidentDecision(top.ref).en, incidentDecision(top.ref).fi, { en: 'Accept', fi: 'Hyväksy' }, { en: 'Change', fi: 'Muuta' },
        'The agent records your decision, updates the driver and keeps watching the case.',
        'Agentti kirjaa päätöksesi, päivittää kuljettajalle ja seuraa tapausta.');
    default:
      return d(top.text.en, top.text.fi, { en: 'Ask the agent to handle', fi: 'Pyydä agenttia hoitamaan' }, { en: 'I\'ll handle it', fi: 'Hoidan itse' },
        'The agent gathers what is missing, then comes back with one concrete proposal.',
        'Agentti selvittää puuttuvat tiedot ja palaa yhdellä konkreettisella ehdotuksella.');
  }
}

function incidentDecision(inc) {
  switch (inc.kind) {
    case 'VEHICLE_WARNING': return { en: 'Car stopped with a warning light, driver safe. Call the dealer: their roadside assistance or a tow? Expect a late delivery.', fi: 'Auto pysähtynyt varoitusvalon takia, kuljettaja turvassa. Soita jälleenmyyjälle: oma tiepalvelu vai hinaus? Toimitus myöhästyy.' };
    case 'EMPTY_PICKUP': return { en: 'The driver found no car at pickup. Hold collection until the site confirms the car and keys.', fi: 'Kuljettaja ei löytänyt autoa noudossa. Pidä nouto, kunnes paikka vahvistaa auton ja avaimet.' };
    case 'TRAVEL_CAPACITY': return { en: 'Ferry capacity problem. Pick the next ferry or a different route.', fi: 'Lauttakapasiteetti loppu. Valitse seuraava lautta tai toinen reitti.' };
    case 'POST_DELIVERY_CONDITION_CLAIM': return { en: 'The dealer reports damage after delivery. Compare pickup and delivery photos, then decide whether to accept the claim.', fi: 'Jälleenmyyjä ilmoittaa vauriosta toimituksen jälkeen. Vertaa nouto- ja toimituskuvia ja päätä korvauksesta.' };
    default: return { en: `Decide on the open ${label(inc.kind)} incident.`, fi: `Päätä avoimesta poikkeamasta: ${label(inc.kind, 'fi')}.` };
  }
}

function agentTask(x) {
  const t = {
    stale: { en: 'Asking the driver for a position update', fi: 'Kysyy kuljettajalta sijaintia' },
    silent_check: { en: 'Asking the driver where they are; flags you if there is no answer', fi: 'Kysyy kuljettajalta sijaintia; ilmoittaa sinulle, jos vastausta ei tule' },
    travemunde: { en: 'Briefing the driver on the Travemünde port and ferry check-in', fi: 'Ohjeistaa kuljettajaa Travemünden satamasta ja lähtöselvityksestä' },
    tyres: { en: 'Asking the site to confirm winter tyres are fitted', fi: 'Pyytää noutopaikkaa vahvistamaan talvirenkaat' },
    late_soft: { en: 'Looking for a faster plan; the latest time is soft for this customer', fi: 'Etsii nopeampaa suunnitelmaa; viimeinen aika on joustava tälle asiakkaalle' },
    tight: { en: 'Watching the arrival time; will flag if it slips', fi: 'Seuraa saapumisaikaa; ilmoittaa, jos se myöhästyy' },
    strike: { en: 'Covered by the strike decision above', fi: 'Katettu yllä olevalla lakkopäätöksellä' },
    access: { en: 'Confirming access and contact with the pickup site', fi: 'Vahvistaa pääsyn ja yhteyshenkilön noutopaikalta' },
    readiness: { en: 'Checking pickup readiness with the site', fi: 'Tarkistaa noudon valmiuden paikalta' },
    weather: { en: 'Sending the driver a weather briefing', fi: 'Lähettää kuljettajalle sääkatsauksen' },
    traffic: { en: 'Sending the driver a route warning', fi: 'Lähettää kuljettajalle reittivaroituksen' },
    energy: { en: 'Planning charging stops for the driver', fi: 'Suunnittelee latauspysähdykset kuljettajalle' },
    checkin: { en: 'Reminding the driver of the ferry check-in', fi: 'Muistuttaa kuljettajaa lautan lähtöselvityksestä' },
    message: { en: 'Replying to the driver or site', fi: 'Vastaa kuljettajalle tai paikalle' },
    driver: { en: 'Sending the driver EV handling notes', fi: 'Lähettää kuljettajalle sähköauto-ohjeet' },
    alert: { en: 'Asking the driver for a position update', fi: 'Kysyy kuljettajalta sijaintia' },
  }[x.kind] || { en: 'Looking into it', fi: 'Selvittää' };
  return { ...t, source: x.source };
}

const LABELS = {
  VEHICLE_WARNING: ['vehicle warning light', 'varoitusvalo'], EMPTY_PICKUP: ['empty pickup', 'tyhjä nouto'],
  TRAVEL_CAPACITY: ['travel capacity', 'matkakapasiteetti'], POST_DELIVERY_CONDITION_CLAIM: ['condition claim after delivery', 'vaurioilmoitus toimituksen jälkeen'],
};
function label(code, lang = 'en') {
  if (LABELS[code]) return LABELS[code][lang === 'fi' ? 1 : 0];
  return String(code || '').toLowerCase().replace(/_/g, ' ');
}
const hhmm = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit' });
const dayHhmm = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Helsinki', weekday: 'short', hour: '2-digit', minute: '2-digit' });
function fmtH(h) {
  const a = Math.abs(h);
  return a < 1 ? `${Math.round(a * 60)} min` : a < 48 ? `${Math.round(a)} h` : `${Math.round(a / 24)} d`;
}

export function analyseAll() {
  // Cancelled orders leave the board; the weekly report still counts them.
  const list = finlandOrders().filter((o) => !o.cancelled_at).map(analyseOrder);
  const order = { needs_you: 0, agent: 1, clear: 2, done: 3 };
  // Needs-you orders: most urgent deadline first. Everything else: lowest confidence first.
  // Bands: due within 3 h or just missed (act now) → long overdue → later. Earliest first in each.
  const due = (o) => (o.deadline ? Date.parse(o.deadline.at) : Infinity);
  const band = (o) => { const m = (due(o) - NOW) / 60e3; return o.deadline?.critical ? -1 : !o.deadline ? 3 : m >= -120 && m <= 180 ? 0 : m < -120 ? 1 : 2; };
  list.sort((a, b) => order[a.lane] - order[b.lane] || (a.lane === 'needs_you' ? band(a) - band(b) || due(a) - due(b) : 0) || a.confidence - b.confidence);
  // Group shared external causes (one strike → one banner, not N alerts).
  const groups = {};
  for (const o of list) for (const r of o.reasons) if (r.group) (groups[r.group] ||= { id: r.group, text: r.text, source: r.source, orders: [] }).orders.push(o.ref);
  return { orders: list, groups: Object.values(groups), snapshotAt: SNAPSHOT_AT };
}

// Rank Finnish drivers for an order: closeness to pickup, track record, fit to the car.
export function rankDrivers(orderId, limit = 3) {
  const a = analyseOrder(db.orders[orderId]);
  const pickupCity = coordsOf(a.from.city) ? a.from.city : 'Helsinki';
  const P = coordsOf(pickupCity);
  return Object.values(db.drivers)
    .filter((d) => d.active && ['FI', 'EE', 'DE', 'DK'].includes(d.home_country) && d.id !== a.driver?.id)
    .map((d) => {
      const r = driverRecord(d.id);
      const C = coordsOf(d.home_city);
      const km = P && C ? Math.round(kmFromSegment(C, P, P)) : 300;
      let score = 100 - km / 8 - (1 - r.demo.onTimeRate) * 150 - r.demo.damageClaims12m * 12 - r.demo.noShows12m * 10 - r.snapshot.active * 15;
      const why = [`${km} km from pickup`, `${Math.round(r.demo.onTimeRate * 100)} % on time`, `${r.demo.deliveries12m} deliveries / 12 mo`];
      if (r.demo.damageClaims12m === 0) why.push('no damage claims');
      if (r.snapshot.active) why.push(`${r.snapshot.active} active job(s)`);
      return { id: d.id, name: d.display_name, homeCity: d.home_city, score: Math.round(score), why };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
