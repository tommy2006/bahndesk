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

const NOW = Date.parse(SNAPSHOT_AT);
const H = 3600e3;
const hoursFromNow = (iso) => (Date.parse(iso) - NOW) / H;
const eur = (cents) => `€${Math.round(cents / 100)}`;

export const FACTORS = ['readiness', 'schedule', 'route', 'car', 'driver', 'market', 'external'];

// Thresholds: below NEEDS_YOU an order goes to a person. Expensive cars get a
// higher bar because the cost of being wrong is higher.
const NEEDS_YOU = { standard: 55, high: 60, exceptional: 65 };
const WATCH = 80;

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
  // No ferry booked yet: an import still has to cross, so use the earliest crossing
  // that is still on offer. Driving the whole distance would predict an arrival
  // earlier than any ship can bring the car in.
  const quote = earliestFerryQuote(order, ctx);
  if (quote) {
    const driveH = ctx.fiRoute ? ctx.fiRoute.minutes / 60 : (kmBetween('Helsinki', ctx.delivery.city) * 1.25) / 75;
    const at = new Date(Date.parse(quote.arrival_at) + (1 + driveH) * H).toISOString();
    return { at, basis: src('travel_options', quote, 'Earliest ferry on offer (quoted, not booked) + drive from port', quote.checked_at) };
  }
  if (ctx.win.pickupSlot) {
    const driveH = ctx.driveKm / 75;
    const breaks = Math.floor(driveH / 4.5) * 0.75 + (driveH > 9 ? 9 : 0); // rest rules, overnight if long
    const at = new Date(Date.parse(ctx.win.pickupSlot.end_at) + (driveH + breaks) * H).toISOString();
    return { at, basis: src('time_windows', ctx.win.pickupSlot, 'Pickup slot + planned drive', null) };
  }
  return null;
}

// The earliest-arriving ferry quote the driver can still reach after the pickup slot.
function earliestFerryQuote(order, ctx) {
  const readyAt = ctx.win.pickupSlot ? Date.parse(ctx.win.pickupSlot.end_at) : NOW;
  return rowsFor('travel_options', order.id)
    .filter((t) => t.kind === 'FERRY' && t.status !== 'SOLD_OUT' && t.arrival_at)
    .filter((t) => !t.check_in_cutoff_at || Date.parse(t.check_in_cutoff_at) >= readyAt + (t.road_time_to_terminal_hours || 0) * H)
    .sort((a, b) => a.arrival_at.localeCompare(b.arrival_at))[0] || null;
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
  // Road legs: the Finnish part, and for Finland–Estonia orders the Estonian part to/from Tallinn harbour.
  const fiRoute = delivery.country === 'EE'
    ? savedRoute(pickup.city, 'Helsinki')
    : savedRoute(pickup.country === 'FI' ? pickup.city : 'Helsinki', delivery.city);
  const eeRoute = pickup.country === 'EE' ? savedRoute(pickup.city, 'Tallinn') : delivery.country === 'EE' ? savedRoute('Tallinn', delivery.city) : null;
  const gulf = (pickup.country === 'EE') !== (delivery.country === 'EE') ? (pickup.country === 'EE' ? 'TLL-HEL' : 'HEL-TLL') : null;
  const ctx = { pickup, delivery, driveKm, ferry, win, fiRoute, eeRoute };
  const reasons = [];

  // ---------- Readiness & open evidence (the snapshot's own signals) ----------
  for (const inc of rowsFor('incidents', order.id).filter((i) => !i.resolved_at)) {
    const needs = ['NEEDS_HUMAN', 'AWAITING_DECISION'].includes(inc.status);
    reasons.push(reason('readiness', needs ? 0.55 : 0.35,
      `Open incident: ${label(inc.kind)}${inc.reported_symptom ? ` — ${inc.reported_symptom}` : ''}`,
      `Avoin poikkeama: ${label(inc.kind, 'fi')}${inc.reported_symptom ? ` — ${inc.reported_symptom}` : ''}`,
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
      reasons.push(reason('readiness', 0.3, `Agent proposal waiting for review: ${p.summary}`, `Agentin ehdotus odottaa hyväksyntää: ${p.summary}`,
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
      reasons.push(reason('schedule', solid ? 0.6 : 0.3, `Predicted to arrive ${fmtH(-slackH)} after the latest time the customer accepts`,
        `Ennuste: perillä ${fmtH(-slackH)} asiakkaan viimeisen hyväksymän ajan jälkeen`,
        predicted.basis, { blocker: solid, kind: 'late' }));
    } else if (slackH < 2) {
      reasons.push(reason('schedule', 0.12, `Only ${fmtH(slackH)} of buffer before the latest arrival time`, `Vain ${fmtH(slackH)} pelivaraa viimeiseen saapumisaikaan`,
        predicted.basis, { agentCan: true, kind: 'tight' }));
    }
  }
  if (order.status === 'IN_TRANSIT') {
    const track = rowsFor('tracking_observations', order.id).sort((a, b) => a.observed_at.localeCompare(b.observed_at)).at(-1);
    const age = track ? -hoursFromNow(track.observed_at) : null;
    if (age == null || age > 3) {
      reasons.push(reason('schedule', 0.15, age == null ? 'No position from the driver app yet' : `No position from the driver app for ${Math.round(age)} h`,
        age == null ? 'Kuljettajan sovelluksesta ei vielä sijaintia' : `Ei sijaintia kuljettajan sovelluksesta ${Math.round(age)} h`,
        track ? src('tracking_observations', track, 'Last position', track.observed_at) : src('orders', order, 'Order', null), { agentCan: true, kind: 'stale' }));
    }
  }

  // ---------- Route: ferries, live weather, live traffic ----------
  if (!delivered) {
    const sold = rowsFor('travel_options', order.id).filter((t) => t.status === 'SOLD_OUT');
    if (sold.length && !ferry) {
      const alt = rowsFor('travel_options', order.id).find((t) => t.status === 'AVAILABLE_QUOTE');
      reasons.push(reason('route', 0.35, `Ferry sold out${alt ? `; next option ${alt.provider} quoted ${eur(alt.quote_cents)}, not booked` : ''}`,
        `Lautta loppuunmyyty${alt ? `; seuraava vaihtoehto ${alt.provider} ${eur(alt.quote_cents)}, ei varattu` : ''}`,
        src('travel_options', sold[0], 'Ferry check', sold[0].checked_at), { kind: 'ferry_sold_out', alt }));
    }
    // Gulf of Finland: no ferry booked yet → name the first realistic sailing from the real timetable.
    if (gulf && !ferry && win.pickupSlot && hoursFromNow(win.pickupSlot.start_at) < 48) {
      const toHarbour = (gulf === 'TLL-HEL' ? eeRoute : fiRoute)?.minutes ?? 60;
      const ready = new Date(Date.parse(win.pickupSlot.end_at) + (toHarbour + 15) * 60e3).toISOString();
      const [first] = nextSailings(gulf, ready, 1);
      const quote = rowsFor('travel_options', order.id).find((t) => t.status === 'AVAILABLE_QUOTE' && first && t.provider?.includes(first.ship));
      const scarce = /few/i.test(quote?.capacity_note || '') && Boolean(assignment);
      // Without a driver the ferry is not the next decision yet; the driver offer is.
      if (first) {
        reasons.push(reason('route', scarce ? 0.35 : assignment ? 0.25 : 0.1,
          `No ferry booked. First sailing the driver can make: ${first.operator} ${first.ship} ${hhmm(first.dep)} (check-in ${hhmm(first.checkIn)})${scarce ? ' — few car spaces left' : ''}`,
          `Lauttaa ei ole varattu. Ensimmäinen mahdollinen: ${first.operator} ${first.ship} klo ${hhmm(first.dep)} (lähtöselvitys ${hhmm(first.checkIn)})${scarce ? ' — vähän autopaikkoja' : ''}`,
          quote ? src('travel_options', quote, 'Ferry quote', quote.checked_at) : { table: 'timetable', id: gulf, label: 'Helsinki–Tallinn timetable (published)', at: '2026-10-24T00:00:00Z' },
          { blocker: scarce, kind: 'ferry_unbooked', sailing: first, quote }));
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
      const fiStart = pickup.country === 'FI' ? pickup.city : 'Helsinki';
      // Weather on both sides of the Gulf: Estonian pickup/delivery cities and Tallinn harbour too.
      const eeCities = gulf || pickup.country === 'EE' ? [pickup.country === 'EE' ? pickup.city : null, delivery.country === 'EE' ? delivery.city : null, 'Tallinn'] : [];
      for (const city of [...new Set([fiStart, delivery.city, ...eeCities].filter(Boolean))]) {
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
      const A = coordsOf(fiStart), B = coordsOf(delivery.city);
      if (A && B) {
        const near = live.traffic.filter((t) => kmFromSegment([t.lat, t.lon], A, B) < 4).slice(0, 2);
        for (const t of near) {
          const accident = t.type === 'ACCIDENT_REPORT';
          reasons.push(reason('route', accident ? 0.1 : 0.04, `${accident ? 'Accident' : 'Traffic notice'} on the route: ${t.title}`, `${accident ? 'Onnettomuus' : 'Liikennetiedote'} reitillä: ${t.title}`,
            { table: 'live', id: `traffic:${t.id}`, label: 'Fintraffic Digitraffic', at: t.at }, { agentCan: true, kind: 'traffic' }));
        }
      }
    }
  }

  // ---------- Car: value, energy & charging ----------
  const temp = live.weather[delivery.city]?.tempC ?? null;
  const energy = energyPlan(vehicle, driveKm, temp);
  if (!delivered && energy?.kind === 'electric' && energy.stops >= 1) {
    // Real fast chargers along the Finnish leg (OpenStreetMap, saved in bahn.db).
    const fast = fiRoute?.stops.fastCharging ?? null;
    const thin = fast != null && fast < energy.stops * 2;
    if (energy.stops >= 2 || thin) {
      reasons.push(reason('car', thin ? 0.15 : 0.06,
        `EV needs ${energy.stops} charging stop(s) (${energy.rangeKm} km usable at ${temp ?? '?'} °C)${fast != null ? `; ${fast} fast charger(s) along the Finnish route` : ''}`,
        `Sähköauto tarvitsee ${energy.stops} latausta (${energy.rangeKm} km käytettävissä, ${temp ?? '?'} °C)${fast != null ? `; ${fast} pikalaturia reitin varrella` : ''}`,
        fiRoute ? { table: 'route', id: fiRoute.key, label: 'Chargers along route · OpenStreetMap', at: fiRoute.fetchedAt } : { table: 'demo', id: `energy:${vehicle.id}`, label: 'Range model (demo data)', at: null },
        { agentCan: true, kind: 'energy' }));
    }
  }

  // ---------- Driver: track record (demo history + snapshot assignments) ----------
  if (driver && !delivered) {
    const d = driver.demo;
    const dsrc = { table: 'demo', id: `driver:${driver.id}`, label: `Track record · ${driver.name} (demo data)`, at: null };
    if (d.onTimeRate < 0.88) reasons.push(reason('driver', 0.07, `${driver.name} is on time in ${Math.round(d.onTimeRate * 100)} % of deliveries`, `${driver.name} on ajoissa ${Math.round(d.onTimeRate * 100)} % toimituksista`, dsrc, { kind: 'driver' }));
    if (d.damageClaims12m && value !== 'standard') reasons.push(reason('driver', 0.2, `${driver.name} had ${d.damageClaims12m} damage claim(s) in 12 months; this is a ${vehicle.make}`, `${driver.name}: ${d.damageClaims12m} vahinkoilmoitusta 12 kk; auto on ${vehicle.make}`, dsrc, { kind: 'driver' }));
    else if (d.damageClaims12m >= 2) reasons.push(reason('driver', 0.1, `${driver.name} had ${d.damageClaims12m} damage claims in 12 months`, `${driver.name}: ${d.damageClaims12m} vahinkoilmoitusta 12 kk`, dsrc, { kind: 'driver' }));
    if (d.noShows12m && order.status === 'WAITING_FOR_PICKUP') reasons.push(reason('driver', 0.12, `${driver.name} missed a pickup in the last 12 months`, `${driver.name} jätti noudon väliin viimeisen 12 kk aikana`, dsrc, { kind: 'driver' }));
    if (value === 'exceptional' && !d.highValueCleared) reasons.push(reason('driver', 0.15, `${driver.name} is not yet cleared for exceptional-value cars`, `${driver.name} ei ole vielä hyväksytty erittäin arvokkaille autoille`, dsrc, { kind: 'driver' }));
    if (vehicle?.fuel === 'electric' && !d.evExperience) reasons.push(reason('driver', 0.05, `${driver.name} has no recent EV deliveries`, `${driver.name}: ei viimeaikaisia sähköautotoimituksia`, dsrc, { agentCan: true, kind: 'driver' }));
    if (driver.snapshot.cancelled) reasons.push(reason('driver', 0.08, `${driver.name} cancelled ${driver.snapshot.cancelled} booking(s) recently`, `${driver.name} perui ${driver.snapshot.cancelled} varausta äskettäin`, src('work_assignments', assignment, 'Assignments', null), { kind: 'driver' }));
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
  const threshold = NEEDS_YOU[value];

  let lane;
  if (delivered && human.length === 0) lane = 'done';
  else if (human.some((x) => x.blocker) || humanConf < threshold) lane = 'needs_you';
  else if (confidence < WATCH) lane = 'agent';
  else lane = 'clear';

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
    gulf,
    ferry: ferry && { provider: ferry.provider, departs: ferry.departure_at, arrives: ferry.expected_arrival_at, ref: ferry.booking_reference, checkIn: ferry.check_in_confirmation },
    pickupSlot: win.pickupSlot && { start: win.pickupSlot.start_at, end: win.pickupSlot.end_at },
    eta, lta, predicted: predicted?.at || null, slackH,
    driver: driver && { id: driver.id, name: driver.name, homeCity: driver.homeCity, ...driver.demo, snapshot: driver.snapshot },
    fee: assignment?.fee_cents || offer?.fee_cents || null,
    customerPrice: customerPrice(assignment?.fee_cents || offer?.fee_cents),
    energy,
    reasons,
    factorRisk,
    decision: lane === 'needs_you' ? nextDecision(reasons.filter((x) => !x.group), { order, driver, vehicle, value }) : null,
    agentWork: reasons.filter((x) => x.agentCan || x.group).map((x) => agentTask(x)),
  };
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
      return d(`Book ${s.operator} ${s.ship} ${dayHhmm(s.dep)} → arrives ${hhmm(s.arr)}${top.quote ? `, quoted €${Math.round(top.quote.quote_cents / 100)}` : ` (≈ €${s.eur}, indicative)`}. ${/few/i.test(top.quote?.capacity_note || '') ? 'Few car spaces are left, so book now.' : ''}`,
        `Varaa ${s.operator} ${s.ship} ${dayHhmm(s.dep)} → perillä ${hhmm(s.arr)}${top.quote ? `, tarjous ${Math.round(top.quote.quote_cents / 100)} €` : ` (n. ${s.eur} €)`}. ${/few/i.test(top.quote?.capacity_note || '') ? 'Autopaikkoja on vähän, varaa nyt.' : ''}`,
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
    case 'ferry_sold_out':
      return d(`Book the next ferry${top.alt ? ` (${top.alt.provider}, ${eur(top.alt.quote_cents)})` : ''} and add a hotel night if needed.`,
        `Varaa seuraava lautta${top.alt ? ` (${top.alt.provider}, ${eur(top.alt.quote_cents)})` : ''} ja tarvittaessa hotelliyö.`,
        { en: 'Approve booking', fi: 'Hyväksy varaus' }, { en: 'Other option', fi: 'Muu vaihtoehto' },
        'The agent books the quoted slot, checks a hotel near the terminal and tells the driver. Cost is logged against the order.',
        'Agentti varaa tarjotun paikan, tarkistaa hotellin terminaalin läheltä ja ilmoittaa kuljettajalle. Kulu kirjataan tilaukselle.');
    case 'offer':
      return d(`No driver has taken this job. Raise the driver fee from ${eur(top.fee)} to ${eur(top.raised)}? Customer price ${eur(top.price)} — margin stays ${Math.round((1 - top.raised / top.price) * 100)} %.`,
        `Kukaan ei ole ottanut keikkaa. Nostetaanko palkkio ${eur(top.fee)} → ${eur(top.raised)}? Asiakashinta ${eur(top.price)}, kate ${Math.round((1 - top.raised / top.price) * 100)} %.`,
        { en: 'Raise fee', fi: 'Nosta palkkiota' }, { en: 'Offer to a driver directly', fi: 'Tarjoa suoraan' },
        'The agent republishes the offer at the new fee and tells you when a driver accepts.',
        'Agentti julkaisee tarjouksen uudella palkkiolla ja ilmoittaa, kun kuljettaja hyväksyy.');
    case 'driver':
      return d('The assigned driver is a weak match for this car. Keep them, or swap to a better-matched driver?',
        'Kuljettaja sopii huonosti tälle autolle. Pidetäänkö vai vaihdetaanko paremmin sopivaan?',
        { en: 'See better drivers', fi: 'Näytä sopivammat' }, { en: 'Keep driver', fi: 'Pidä kuljettaja' },
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
  const list = finlandOrders().map(analyseOrder);
  const order = { needs_you: 0, agent: 1, clear: 2, done: 3 };
  list.sort((a, b) => order[a.lane] - order[b.lane] || a.confidence - b.confidence);
  // Group shared external causes (one strike → one banner, not N alerts).
  const groups = {};
  for (const o of list) for (const r of o.reasons) if (r.group) (groups[r.group] ||= { id: r.group, text: r.text, source: r.source, orders: [] }).orders.push(o.ref);
  return { orders: list, groups: Object.values(groups), snapshotAt: SNAPSHOT_AT };
}

// Rank Finnish drivers for an order: closeness to pickup, track record, fit to the car.
export function rankDrivers(orderId, limit = 3) {
  const a = analyseOrder(db.orders[orderId]);
  const pickupCity = a.from.country === 'FI' ? a.from.city : 'Helsinki';
  const P = coordsOf(pickupCity);
  return Object.values(db.drivers)
    .filter((d) => d.active && ['FI', 'EE'].includes(d.home_country) && d.id !== a.driver?.id)
    .map((d) => {
      const r = driverRecord(d.id);
      const C = coordsOf(d.home_city);
      const km = P && C ? Math.round(kmFromSegment(C, P, P)) : 300;
      let score = 100 - km / 8 - (1 - r.demo.onTimeRate) * 150 - r.demo.damageClaims12m * 12 - r.demo.noShows12m * 10 - r.snapshot.active * 15;
      if (a.value === 'exceptional' && !r.demo.highValueCleared) score -= 30;
      if (a.vehicle?.fuel === 'electric' && !r.demo.evExperience) score -= 8;
      const why = [`${km} km from pickup`, `${Math.round(r.demo.onTimeRate * 100)} % on time`, `${r.demo.deliveries12m} deliveries / 12 mo`];
      if (r.demo.damageClaims12m === 0) why.push('no damage claims');
      if (r.demo.highValueCleared) why.push('cleared for exceptional-value cars');
      if (r.snapshot.active) why.push(`${r.snapshot.active} active job(s)`);
      return { id: d.id, name: d.display_name, homeCity: d.home_city, score: Math.round(score), why };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
