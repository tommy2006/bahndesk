// Weekly "caught vs missed" report for management.
//
// A *problem* is something the data records as having gone wrong on an order: an
// incident, a disruption (car not found, check-in refused, cancelled, delivered late)
// or a high/critical alert from Bahn's own system. For each one we replay the risk
// engine using only what was on record *before* it happened: signals dated earlier,
// plus what was known at planning (route, driver track record, crossings). If those
// alone would have put the order in front of a person or the agent, it was *warned in
// advance*, with the lead time. If not, but the order was in front of a person or the agent
// once the problem was on record, it was *flagged when it happened*. Otherwise it was missed.
import { db, rowsFor, finlandOrders, SNAPSHOT_AT } from './data.mjs';
import { analyseOrder, analyseAll, NEEDS_YOU, WATCH } from './engine.mjs';

const H = 3600e3;
const t2 = (en, fi) => ({ en, fi });

// What went wrong, in plain words, and what would catch it next time.
const PROBLEM = {
  EMPTY_PICKUP: [t2('Car not ready at pickup', 'Auto ei ollut noudettavissa'), t2('Ask the dealer to confirm the car, keys and papers the day before pickup.', 'Pyydä myyjää vahvistamaan auto, avaimet ja paperit noutoa edeltävänä päivänä.')],
  TRAVEL_CAPACITY: [t2('Ferry full', 'Lautta täynnä'), t2('Book the ferry when the driver is assigned, not on the day.', 'Varaa lautta heti kun kuljettaja on valittu, ei lähtöpäivänä.')],
  VEHICLE_WARNING: [t2('Car fault on the way', 'Autoon tuli vika matkalla'), t2('Not predictable from our data. Keep the safety-stop routine and a recovery partner per country.', 'Ei ennustettavissa datastamme. Pidä turvapysähdysohje ja hinauskumppani joka maassa.')],
  POST_DELIVERY_CONDITION_CLAIM: [t2('Damage claim after delivery', 'Vahinkoilmoitus toimituksen jälkeen'), t2('Require the full photo set at pickup and flag missing photos before the car moves.', 'Vaadi täydet kuvat noudossa ja nosta puuttuvat kuvat esiin ennen lähtöä.')],
  CHECK_IN_REFUSED: [t2('Ferry check-in refused', 'Lautalle pääsy evättiin'), t2('Check the booking name and car details against the driver before departure.', 'Tarkista varauksen nimi ja auton tiedot kuljettajan kanssa ennen lähtöä.')],
  LATE: [t2('Delivered late', 'Toimitus myöhästyi'), t2('Compare the driver\'s position with the promise every few hours, not only at the end.', 'Vertaa kuljettajan sijaintia lupaukseen muutaman tunnin välein, ei vasta lopussa.')],
  CANCELLED: [t2('Order cancelled', 'Tilaus peruttiin'), t2('Confirm the car exists and is sold before booking a driver.', 'Varmista auton olemassaolo ja kauppa ennen kuljettajan varaamista.')],
  RELEASE_DOCUMENT_UNCLEAR: [t2('Release papers unclear', 'Luovutuspaperit epäselvät'), t2('Collect the release document when the order is created.', 'Pyydä luovutusasiakirja jo tilausta tehdessä.')],
  DELIVERY_ACCESS_RISK: [t2('No one named to receive the car', 'Vastaanottajaa ei nimetty'), t2('Ask for a named receiver and phone number when the delivery is booked.', 'Pyydä nimetty vastaanottaja ja puhelinnumero toimitusta varatessa.')],
  FERRY_CONNECTION_RISK: [t2('Could miss the ferry', 'Lautta voi jäädä'), t2('Plan at least two hours of slack before ferry check-in.', 'Suunnittele vähintään kaksi tuntia väljyyttä ennen lähtöselvitystä.')],
  FERRY_SOLD_OUT: [t2('Ferry full', 'Lautta täynnä'), t2('Book the ferry when the driver is assigned, not on the day.', 'Varaa lautta heti kun kuljettaja on valittu, ei lähtöpäivänä.')],
  FR_IMPORT_TRAVEL_DECISION: [t2('Driver\'s trip home undecided', 'Kuljettajan paluumatka auki'), t2('Agree the driver\'s return trip when the job is accepted.', 'Sovi kuljettajan paluumatka kun keikka hyväksytään.')],
  SAFETY_STOP: [t2('Driver made a safety stop', 'Kuljettaja teki turvapysähdyksen'), t2('Not predictable from our data. Keep the safety-stop routine.', 'Ei ennustettavissa datastamme. Pidä turvapysähdysohje.')],
  POSITIONING_AT_RISK: [t2('Driver may not reach pickup in time', 'Kuljettaja ei ehkä ehdi noutoon'), t2('Check the driver\'s travel to pickup the evening before.', 'Tarkista kuljettajan matka noutoon edellisenä iltana.')],
  DELIVERY_PROMISE_UNACHIEVABLE: [t2('Delivery promise could not be met', 'Toimituslupausta ei voitu pitää'), t2('Check the promise against drive time and ferries when it is given.', 'Tarkista lupaus ajoaikaa ja lauttoja vasten kun se annetaan.')],
  FERRY_CHECK_IN_RISK: [t2('Ferry check-in at risk', 'Lähtöselvitys vaarassa'), t2('Plan at least two hours of slack before ferry check-in.', 'Suunnittele vähintään kaksi tuntia väljyyttä ennen lähtöselvitystä.')],
};
const EVENT_KIND = {
  'pickup.vehicle_not_found': 'EMPTY_PICKUP', 'pickup.attempted': 'EMPTY_PICKUP',
  'travel.check_in_rejected': 'CHECK_IN_REFUSED', 'travel.rebooked': 'CHECK_IN_REFUSED',
  'delivery.delay_reported': 'LATE', 'delivery.promise_revised': 'LATE', 'delivery.late_outcome_recorded': 'LATE',
  'order.cancelled': 'CANCELLED',
};
const what = (kind) => PROBLEM[kind]?.[0] || t2(kind.toLowerCase().replace(/_/g, ' '), kind.toLowerCase().replace(/_/g, ' '));
const fix = (kind) => PROBLEM[kind]?.[1] || null;

// Every recorded problem on an order, earliest first.
function problemsOf(order) {
  const out = [];
  for (const i of rowsFor('incidents', order.id)) out.push({ kind: i.kind, at: i.opened_at, source: { table: 'incidents', id: i.id } });
  for (const e of rowsFor('operational_events', order.id)) if (EVENT_KIND[e.command]) out.push({ kind: EVENT_KIND[e.command], at: e.recorded_at, source: { table: 'operational_events', id: e.id } });
  for (const a of rowsFor('alerts', order.id)) if (['high', 'critical'].includes(a.severity)) out.push({ kind: a.signal, at: a.triggered_at, source: { table: 'alerts', id: a.id } });
  if (order.status === 'DELIVERED') {
    const done = rowsFor('work_assignments', order.id).map((a) => a.completed_at).filter(Boolean).sort().at(-1);
    const promise = rowsFor('time_windows', order.id).find((w) => w.purpose === 'CUSTOMER_DELIVERY_PROMISE');
    if (done && promise && done > promise.end_at) out.push({ kind: 'LATE', at: done, source: { table: 'time_windows', id: promise.id } });
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : 1));
}

// Signals measured against the snapshot clock ("check-in closes in 45 min", "no position
// for 4 h") or produced after the fact cannot count as advance warnings.
const HINDSIGHT = new Set(['traffic', 'weather', 'stale', 'silent', 'silent_check', 'proposal', 'tight', 'late', 'checkin', 'access', 'readiness', 'energy']);
const HINDSIGHT_TABLES = new Set(['live', 'agent_proposals']);

// Replay: walk the signals that existed before the problem in time order, and find the
// first moment the engine's own rules would have flagged the order.
function replay(analysed, order, at) {
  const t = Date.parse(at);
  const planAt = order.created_at;
  const before = analysed.reasons
    .filter((r) => !HINDSIGHT.has(r.kind) && !HINDSIGHT_TABLES.has(r.source?.table) && !r.group)
    .map((r) => ({ ...r, known: r.source?.at || planAt }))
    .filter((r) => Date.parse(r.known) < t)
    .sort((a, b) => (a.known < b.known ? -1 : 1));
  const seen = [];
  for (const r of before) {
    seen.push(r);
    const human = seen.filter((x) => !x.agentCan);
    const humanConf = 100 * human.reduce((p, x) => p * (1 - x.r), 1);
    const conf = 100 * seen.reduce((p, x) => p * (1 - x.r), 1);
    const who = human.some((x) => x.blocker) || humanConf < NEEDS_YOU ? 'person' : conf < WATCH ? 'agent' : null;
    if (who) {
      const top = [...seen].sort((a, b) => b.r - a.r)[0];
      return { outcome: 'early', who, warnedAt: r.known, leadH: (t - Date.parse(r.known)) / H, signal: top.text, source: top.source };
    }
  }
  return { outcome: null };
}

// Monday 00:00 (Helsinki) of the week containing `iso`, as YYYY-MM-DD.
function weekOf(iso) {
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Europe/Helsinki' }));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toLocaleDateString('en-CA');
}
function isoWeekNo(monday) {
  const d = new Date(`${monday}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3);
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

export function weeklyReport(lanes = null) {
  const scope = finlandOrders();
  const rows = [];
  for (const order of scope) {
    const problems = problemsOf(order);
    if (!problems.length) continue;
    const first = problems[0];
    const analysed = analyseOrder(order);
    const r = replay(analysed, order, first.at);
    // Not warned in advance: was it in front of a person or the agent once on record?
    if (!r.outcome) {
      const flagged = analysed.lane === 'needs_you' || analysed.lane === 'agent';
      const top = analysed.reasons.find((x) => !HINDSIGHT_TABLES.has(x.source?.table) && x.kind !== 'traffic' && x.kind !== 'weather');
      Object.assign(r, flagged ? { outcome: 'onTime', who: analysed.lane === 'needs_you' ? 'person' : 'agent', signal: top?.text, source: top?.source } : { outcome: 'missed' });
    }
    const kinds = [...new Set(problems.map((p) => p.kind))];
    rows.push({
      id: order.id, ref: order.reference, at: first.at, week: weekOf(first.at),
      what: what(first.kind), also: kinds.slice(1).map(what), fix: fix(first.kind), source: first.source,
      from: analysed.from.city, to: analysed.to.city, laneNow: analysed.lane, ...r,
    });
  }

  // Volume per week: deliveries completed, for the rate.
  const delivered = {};
  for (const o of scope) {
    const done = rowsFor('work_assignments', o.id).map((a) => a.completed_at).filter(Boolean).sort().at(-1);
    if (done) delivered[weekOf(done)] = (delivered[weekOf(done)] || 0) + 1;
  }
  const weeks = [...new Set([...rows.map((r) => r.week), ...Object.keys(delivered)])].sort().reverse();
  const summary = (wk) => {
    const list = rows.filter((r) => r.week === wk);
    const early = list.filter((r) => r.outcome === 'early');
    const caught = list.filter((r) => r.outcome !== 'missed');
    const end = new Date(`${wk}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 6);
    return {
      week: wk, weekNo: isoWeekNo(wk), endDay: end.toISOString().slice(0, 10),
      problems: list.length, caught: caught.length, early: early.length, onTime: caught.length - early.length, missed: list.length - caught.length,
      byPerson: caught.filter((r) => r.who === 'person').length, byAgent: caught.filter((r) => r.who === 'agent').length,
      medianLeadH: median(early.map((r) => r.leadH)), delivered: delivered[wk] || 0,
    };
  };

  // Today's queue: how much reaches a person, and how much of it has a recorded problem yet.
  // `lanes` lets the server pass the board as people see it (with their decisions applied).
  const all = lanes || analyseAll().orders;
  const problemIds = new Set(rows.map((r) => r.id));
  const raised = all.filter((o) => o.lane === 'needs_you');
  const current = weekOf(SNAPSHOT_AT);
  return {
    asOf: SNAPSHOT_AT,
    week: summary(current),
    history: weeks.filter((w) => w !== current).map(summary),
    caught: rows.filter((r) => r.week === current && r.outcome !== 'missed').sort((a, b) => (a.outcome === b.outcome ? (b.leadH || 0) - (a.leadH || 0) : a.outcome === 'early' ? -1 : 1)),
    missed: rows.filter((r) => r.week === current && r.outcome === 'missed'),
    earlier: rows.filter((r) => r.week !== current).sort((a, b) => (a.at < b.at ? 1 : -1)),
    scope: scope.length,
    queue: {
      orders: all.length,
      needsYou: raised.length,
      agent: all.filter((o) => o.lane === 'agent').length,
      clear: all.filter((o) => o.lane === 'clear' || o.lane === 'done').length,
      raisedWithoutProblem: raised.filter((o) => !problemIds.has(o.id)).length,
    },
    method: t2(
      'A problem is an incident, a disruption (car not found, check-in refused, cancelled, delivered late) or a serious alert from Bahn\'s own system. Warned in advance: we re-ran the risk rules using only records dated before the problem, plus what was known when the order was planned, and they alone would have sent the order to a person or the agent. Live weather, traffic and countdowns are left out because they describe today. Flagged when it happened: the order was in front of a person or the agent once the problem was on record. Missed: neither.',
      'Ongelma on poikkeama, häiriö (autoa ei löytynyt, lautalle pääsy evättiin, peruttu, myöhässä) tai Bahnin oman järjestelmän vakava hälytys. Varoitettu etukäteen: ajoimme riskisäännöt uudelleen vain ongelmaa edeltävillä tiedoilla ja suunnitteluhetken tiedoilla, ja ne yksin olisivat nostaneet tilauksen ihmiselle tai agentille. Sää, liikenne ja aikalaskurit jätettiin pois, koska ne kuvaavat tätä päivää. Nostettu tapahtuessa: tilaus oli ihmisen tai agentin edessä heti kun ongelma oli kirjattu. Ohi mennyt: ei kumpaakaan.'),
  };
}
