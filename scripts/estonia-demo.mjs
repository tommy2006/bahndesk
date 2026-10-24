// Generates fictional Finland–Estonia demo orders in the same shape as the Bahn
// snapshot. People, companies, plates and addresses are made up; ferry times follow
// the real published Helsinki–Tallinn timetable (data/external/ferries-fi-ee.json).
// Output: data/demo-ee/*.jsonl. Run: node scripts/estonia-demo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'demo-ee');
const T = {};
const add = (table, row) => (T[table] ||= []).push(row);
// Local Helsinki/Tallinn time on 21–23 Oct 2026 is UTC+3.
const at = (day, hhmm) => `2026-10-${day}T${String(Number(hhmm.slice(0, 2)) - 3).padStart(2, '0')}:${hhmm.slice(3)}:00Z`;

add('customers', { id: 'cus-ee1', name: 'Virumaa Autokeskus OÜ', country: 'EE', account_tier: 'network' });
add('customers', { id: 'cus-ee2', name: 'Läänemere Premium Cars', country: 'EE', account_tier: 'standard' });
for (const [id, name, city] of [['drv-ee1', 'Kertu Saarvel', 'Tallinn'], ['drv-ee2', 'Marten Kuusvere', 'Tartu'], ['drv-ee3', 'Liis Tammeorg', 'Tallinn']]) {
  add('drivers', { id, display_name: name, home_city: city, home_country: 'EE', active: true });
}

function order(o) {
  const id = `ord-0${o.n}`, plan = `plan-ee${o.n}`, item = `item-ee${o.n}`, veh = `veh-ee${o.n}`;
  const pa = `addr-ee${o.n}p`, da = `addr-ee${o.n}d`, pp = `point-ee${o.n}p`, dp = `point-ee${o.n}d`;
  add('addresses', { id: pa, ...o.pickup, address_line1: o.pickup.line, raw_input: `${o.pickup.line}, ${o.pickup.city}`, managed_site_id: null, order_id: id, timezone: o.pickup.country === 'EE' ? 'Europe/Tallinn' : 'Europe/Helsinki', opening_hours: null, access_note: o.pickup.access || null });
  add('addresses', { id: da, ...o.delivery, address_line1: o.delivery.line, raw_input: `${o.delivery.line}, ${o.delivery.city}`, managed_site_id: null, order_id: id, timezone: o.delivery.country === 'EE' ? 'Europe/Tallinn' : 'Europe/Helsinki', opening_hours: { mon_fri: '09:00-18:00', sat: '10:00-15:00', sun: null }, access_note: null });
  add('vehicles', { id: veh, ...o.car, synthetic_vin: `SYNEE${o.n}DEMO000`, registration: o.car.registration || `DEMO-EE-${o.n}` });
  add('order_items', { id: item, order_id: id, role: 'PRIMARY', vehicle_id: veh, cmr_mode: 'NONE' });
  add('orders', { id, reference: `CD-42${o.n}`, customer_id: o.customer, customer_reference: `PO-EE-${o.n}`, status: o.status, readiness_status: o.readiness || 'CONFIRMED',
    route_kind: o.pickup.country === o.delivery.country ? 'DOMESTIC' : (o.delivery.country === 'FI' ? 'IMPORT' : 'EXPORT'), source: 'WEB',
    pickup_address_id: pa, delivery_address_id: da, pickup_site_id: null, delivery_site_id: null, active_plan_id: plan,
    created_at: o.created, updated_at: o.updated || o.created, cancelled_at: null, display_lane: null });
  add('transport_plans', { id: plan, order_id: id, status: o.status === 'NEW' ? 'DRAFT' : 'ACTIVE', source: 'OPS', version: 1, created_at: o.created, activated_at: o.status === 'NEW' ? null : o.created });
  add('transport_points', { id: pp, plan_id: plan, address_id: pa, site_id: null, role: 'PICKUP', order_boundary: 'PICKUP', sequence: 1 });
  add('transport_points', { id: dp, plan_id: plan, address_id: da, site_id: null, role: 'DELIVERY', order_boundary: 'DELIVERY', sequence: 2 });
  add('transport_segments', { id: `seg-ee${o.n}`, plan_id: plan, order_item_id: item, from_point_id: pp, to_point_id: dp, sequence: 1, distance_km: o.km, transport_mode: 'DRIVE_WITH_FERRY', status: o.segStatus });
  if (o.pickupSlot) add('time_windows', { id: `win-ee${o.n}p`, order_id: id, point_id: pp, purpose: 'SELECTED_PICKUP_SLOT', source: 'OPS', is_selected: true, start_at: o.pickupSlot[0], end_at: o.pickupSlot[1], timezone: 'Europe/Tallinn' });
  add('time_windows', { id: `win-ee${o.n}r`, order_id: id, point_id: dp, purpose: 'REQUESTED_DELIVERY_SLOT', source: 'CUSTOMER', is_selected: false, start_at: o.eta[0], end_at: o.eta[1], timezone: 'Europe/Helsinki' });
  add('time_windows', { id: `win-ee${o.n}l`, order_id: id, point_id: dp, purpose: 'CUSTOMER_DELIVERY_PROMISE', source: 'CUSTOMER', is_selected: false, start_at: o.eta[0], end_at: o.lta, timezone: 'Europe/Helsinki' });
  add('order_endpoint_details', { id: `ep-ee${o.n}p`, order_id: id, point_id: pp, address_id: pa, site_id: null, boundary: 'PICKUP', access_status: o.pickupAccess || 'CONFIRMED', contact_status: o.pickupAccess === 'NEEDS_VERIFICATION' ? 'UNCONFIRMED' : 'CONFIRMED', contact_name: o.pickupContact, contact_role: o.pickup.kind === 'PRIVATE_HOME' ? 'seller' : 'site desk', contact_handle: `ee${o.n}@example.test`, access_instruction: o.pickup.access || 'Keys at the sales desk; ask for the order reference.', stated_at: o.created, stated_by: 'CUSTOMER_ORDER_INPUT', last_confirmed_at: o.pickupAccess === 'NEEDS_VERIFICATION' ? null : o.created, last_confirmed_source: o.pickupAccess === 'NEEDS_VERIFICATION' ? null : 'CUSTOMER_ORDER_INPUT' });
  add('order_endpoint_details', { id: `ep-ee${o.n}d`, order_id: id, point_id: dp, address_id: da, site_id: null, boundary: 'DELIVERY', access_status: 'CONFIRMED', contact_status: 'CONFIRMED', contact_name: 'Receiving desk', contact_role: 'site desk', contact_handle: `ee${o.n}d@example.test`, access_instruction: 'Reception receives the keys and signs the handover.', stated_at: o.created, stated_by: 'CUSTOMER_ORDER_INPUT', last_confirmed_at: o.created, last_confirmed_source: 'CUSTOMER_ORDER_INPUT' });
  add('operational_events', { id: `evt-ee${o.n}a`, order_id: id, actor_type: 'customer', actor_id: o.customer, command: 'order.created', source: 'customer_intake', target_type: 'order', target_id: id, from_state: null, to_state: 'NEW', recorded_at: o.created, changes: {} });
  if (o.driver) {
    add('market_offers', { id: `offer-ee${o.n}`, order_id: id, status: 'ACCEPTED', type: 'REGULAR', visibility: 'OPEN', fee_cents: o.fee, currency: 'EUR', published_at: o.created, accepted_at: o.accepted, expires_at: o.lta, segment_ids: [`seg-ee${o.n}`] });
    add('work_assignments', { id: `asg-ee${o.n}`, order_id: id, driver_id: o.driver, status: o.status === 'IN_TRANSIT' ? 'IN_PROGRESS' : 'ASSIGNED', fee_cents: o.fee, currency: 'EUR', accepted_at: o.accepted, started_at: o.status === 'IN_TRANSIT' ? o.started : null, completed_at: null, cancelled_at: null, source_offer_id: `offer-ee${o.n}`, segment_ids: [`seg-ee${o.n}`] });
    add('operational_events', { id: `evt-ee${o.n}b`, order_id: id, actor_type: 'driver', actor_id: o.driver, command: 'assignment.accepted', source: 'driver_app', target_type: 'work_assignment', target_id: `asg-ee${o.n}`, from_state: null, to_state: 'ASSIGNED', recorded_at: o.accepted, changes: {} });
  } else if (o.openOffer) {
    add('market_offers', { id: `offer-ee${o.n}`, order_id: id, status: 'PUBLISHED', type: 'REGULAR', visibility: 'OPEN', fee_cents: o.fee, currency: 'EUR', published_at: o.openOffer, accepted_at: null, expires_at: o.lta, segment_ids: [`seg-ee${o.n}`] });
  }
  if (o.ferry) {
    const f = o.ferry;
    add('travel_reservations', { id: `res-ee${o.n}`, order_id: id, assignment_id: `asg-ee${o.n}`, kind: 'FERRY', status: 'BOOKED', provider: `${f.operator} · ${f.ship}`, booking_reference: `DEMO-${f.operator.split(' ')[0].toUpperCase()}-${o.n}`,
      booked_at: o.accepted, departure_at: f.dep, expected_arrival_at: f.arr, check_in_cutoff_at: f.cutoff, check_in_confirmation: f.checkedIn ? 'CONFIRMED' : 'UNCONFIRMED', boarding_confirmation: 'UNCONFIRMED',
      origin_terminal: f.from, destination_terminal: f.to, origin_terminal_id: null, destination_terminal_id: null, route_label: 'Gulf of Finland crossing',
      schedule_basis: { kind: 'PUBLISHED_TIMETABLE', note: 'Times follow the operator’s published timetable; the booking itself is fictional.', recorded_at: o.accepted } });
  }
  for (const q of o.quotes || []) {
    add('travel_options', { id: `travel-ee${o.n}-${q.ship.replace(/\W/g, '')}`, order_id: id, assignment_id: o.driver ? `asg-ee${o.n}` : null, kind: 'FERRY', provider: `${q.operator} · ${q.ship}`, from_city: q.from, to_city: q.to,
      departure_at: q.dep, arrival_at: q.arr, check_in_cutoff_at: q.cutoff, status: q.status || 'AVAILABLE_QUOTE', quote_cents: q.eur * 100, currency: 'EUR', capacity_note: q.note, checked_at: q.checked, road_time_to_terminal_hours: q.road });
  }
  if (o.track) add('tracking_observations', { id: `track-ee${o.n}`, order_id: id, assignment_id: `asg-ee${o.n}`, segment_id: `seg-ee${o.n}`, observed_at: o.track.at, received_at: o.track.at, source: 'driver_app', location_quality: 'COARSE', progress_fraction: o.track.progress, distance_remaining_km: o.track.left, estimated_delivery_at: o.track.eta });
  for (const m of o.messages || []) {
    add('conversations', { id: `conv-ee${o.n}`, order_id: id, assignment_id: `asg-ee${o.n}`, category: 'on_the_road', channel: 'driver_app', counterparty_type: 'driver', counterparty_id: o.driver, status: 'OPEN', started_at: m.at, updated_at: m.at });
    add('messages', { id: `msg-ee${o.n}-${m.at.slice(11, 16).replace(':', '')}`, order_id: id, conversation_id: `conv-ee${o.n}`, author_type: 'driver', author_id: o.driver, recipient_type: 'operator', recipient_id: 'ops-shift', channel: 'driver_app', visibility: 'INTERNAL', language: 'en', authored_at: m.at, body: m.body });
  }
  for (const a of o.alerts || []) add('alerts', { id: `alert-ee${o.n}`, order_id: id, assignment_id: `asg-ee${o.n}`, conversation_id: `conv-ee${o.n}`, status: 'OPEN', severity: a.severity, signal: a.signal, summary: a.summary, triggered_at: a.at, evidence_refs: [] });
}

// 1. Healthy import: Tallinn dealer → Helsinki, booked on the 16:30 Megastar.
order({ n: '1101', customer: 'cus-001', status: 'WAITING_FOR_PICKUP', segStatus: 'ASSIGNED', created: '2026-10-19T08:10:00Z', accepted: '2026-10-19T14:02:00Z',
  pickup: { city: 'Tallinn', country: 'EE', kind: 'DEALERSHIP', name: 'Virumaa Autokeskus Ülemiste', line: 'Peterburi tee 999' },
  delivery: { city: 'Helsinki', country: 'FI', kind: 'DEALERSHIP', name: 'Velantora Helsinki', line: 'Kuparisaarenkuja 10' },
  car: { make: 'Porsche', model: 'Taycan', model_year: 2022, fuel: 'electric' }, km: 95, driver: 'drv-ee1', fee: 26000,
  pickupSlot: [at('21', '13:00'), at('21', '14:30')], eta: [at('22', '09:00'), at('22', '12:00')], lta: at('22', '16:00'), pickupContact: 'Mart Kivistik',
  ferry: { operator: 'Tallink', ship: 'Megastar', dep: at('21', '16:30'), arr: at('21', '18:30'), cutoff: at('21', '15:45'), from: 'Tallinn Old City Harbour (D)', to: 'Helsinki West Harbour (T2)' } });

// 2. Tartu → Tampere EV: ferry only quoted, few car spaces left.
order({ n: '1102', customer: 'cus-002', status: 'WAITING_FOR_PICKUP', segStatus: 'ASSIGNED', created: '2026-10-20T07:30:00Z', accepted: '2026-10-20T11:15:00Z',
  pickup: { city: 'Tartu', country: 'EE', kind: 'DEALERSHIP', name: 'Läänemere Premium Cars Tartu', line: 'Riia mnt 999' },
  delivery: { city: 'Tampere', country: 'FI', kind: 'DEALERSHIP', name: 'Mervikko Auto Tampere', line: 'Hatanpään valtatie 999' },
  car: { make: 'BMW', model: 'i4', model_year: 2023, fuel: 'electric' }, km: 365, driver: 'drv-ee2', fee: 41000,
  pickupSlot: [at('22', '09:00'), at('22', '11:00')], eta: [at('23', '09:00'), at('23', '12:00')], lta: at('23', '15:00'), pickupContact: 'Siim Pärnaste',
  quotes: [
    { operator: 'Viking Line', ship: 'Viking XPRS', from: 'Tallinn Old City Harbour (A)', to: 'Helsinki Katajanokka', dep: at('22', '15:30'), arr: at('22', '18:00'), cutoff: at('22', '14:45'), eur: 139, note: 'Few car spaces left; quoted, not booked', checked: '2026-10-21T07:40:00Z', road: 2.5 },
    { operator: 'Tallink', ship: 'Megastar', from: 'Tallinn Old City Harbour (D)', to: 'Helsinki West Harbour (T2)', dep: at('22', '16:30'), arr: at('22', '18:30'), cutoff: at('22', '15:45'), eur: 149, note: 'Quoted, not booked', checked: '2026-10-21T07:40:00Z', road: 2.5 },
  ] });

// 3. Export in progress: Helsinki → Tallinn on the 10:30 Viking XPRS (already sailing).
order({ n: '1103', customer: 'cus-ee1', status: 'IN_TRANSIT', segStatus: 'IN_PROGRESS', created: '2026-10-17T10:00:00Z', accepted: '2026-10-18T09:20:00Z', started: at('21', '08:40'),
  pickup: { city: 'Helsinki', country: 'FI', kind: 'DEALERSHIP', name: 'Velantora Helsinki', line: 'Kuparisaarenkuja 10' },
  delivery: { city: 'Tallinn', country: 'EE', kind: 'DEALERSHIP', name: 'Virumaa Autokeskus Ülemiste', line: 'Peterburi tee 999' },
  car: { make: 'Mercedes-Benz', model: 'S-Class', model_year: 2021, fuel: 'hybrid' }, km: 95, driver: 'drv-ee3', fee: 24000,
  pickupSlot: [at('21', '08:30'), at('21', '09:00')], eta: [at('21', '14:00'), at('21', '16:00')], lta: at('21', '18:00'), pickupContact: 'Branch desk',
  ferry: { operator: 'Viking Line', ship: 'Viking XPRS', dep: at('21', '10:30'), arr: at('21', '13:10'), cutoff: at('21', '09:45'), from: 'Helsinki Katajanokka', to: 'Tallinn Old City Harbour (A)', checkedIn: true },
  track: { at: '2026-10-21T08:20:00Z', progress: 0.55, left: 30, eta: at('21', '13:40') } });

// 4. Private seller in Pärnu → Espoo, Ferrari: no driver after 30 h, key holder unconfirmed.
order({ n: '1104', customer: 'cus-ee2', status: 'NEW', readiness: 'CONFIRMED', segStatus: 'OFFERED', created: '2026-10-19T16:00:00Z', openOffer: '2026-10-20T03:00:00Z',
  pickup: { city: 'Pärnu', country: 'EE', kind: 'PRIVATE_HOME', name: 'Private seller', line: 'Rannametsa tee 999', access: 'Seller hands over the keys in person; second key with a relative, not yet confirmed.' },
  delivery: { city: 'Espoo', country: 'FI', kind: 'DEALERSHIP', name: 'Norvessia Autotalot Espoo', line: 'Tekniikantie 999' },
  car: { make: 'Ferrari', model: 'Roma', model_year: 2021, fuel: 'petrol' }, km: 150, fee: 69000, pickupAccess: 'NEEDS_VERIFICATION', pickupContact: 'Private seller',
  pickupSlot: [at('23', '10:00'), at('23', '12:00')], eta: [at('24', '09:00'), at('24', '12:00')], lta: at('24', '16:00'),
  quotes: [{ operator: 'Tallink', ship: 'Megastar', from: 'Tallinn Old City Harbour (D)', to: 'Helsinki West Harbour (T2)', dep: at('23', '16:30'), arr: at('23', '18:30'), cutoff: at('23', '15:45'), eur: 149, note: 'Quoted, not booked', checked: '2026-10-21T06:50:00Z', road: 2 }] });

// 5. Tallinn → Turku: driver will miss the 13:30 MyStar check-in (papers not ready).
order({ n: '1105', customer: 'cus-001', status: 'IN_TRANSIT', segStatus: 'IN_PROGRESS', created: '2026-10-18T12:00:00Z', accepted: '2026-10-19T08:30:00Z', started: at('21', '10:30'),
  pickup: { city: 'Tallinn', country: 'EE', kind: 'DEALERSHIP', name: 'Läänemere Premium Cars Tallinn', line: 'Pärnu mnt 999' },
  delivery: { city: 'Turku', country: 'FI', kind: 'DEALERSHIP', name: 'Velantora Turku', line: 'Ratapihankatu 999' },
  car: { make: 'Volkswagen', model: 'ID.4', model_year: 2023, fuel: 'electric' }, km: 255, driver: 'drv-ee1', fee: 29000,
  pickupSlot: [at('21', '10:00'), at('21', '11:00')], eta: [at('21', '17:00'), at('21', '19:00')], lta: at('21', '21:00'), pickupContact: 'Sales desk',
  ferry: { operator: 'Tallink', ship: 'MyStar', dep: at('21', '13:30'), arr: at('21', '15:30'), cutoff: at('21', '12:45'), from: 'Tallinn Old City Harbour (D)', to: 'Helsinki West Harbour (T2)' },
  messages: [{ at: '2026-10-21T08:50:00Z', body: 'Still at the dealer in Tallinn, the export papers are not ready yet. They say 30–45 min more. I will not make the 12:45 check-in for the 13:30 MyStar.' }],
  alerts: [{ at: '2026-10-21T08:52:00Z', severity: 'high', signal: 'FERRY_CHECK_IN_RISK', summary: 'Driver reports the 12:45 check-in for the 13:30 MyStar will be missed; papers not ready at pickup.' }] });

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const [t, rows] of Object.entries(T)) fs.writeFileSync(path.join(OUT, `${t}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`Wrote ${Object.values(T).flat().length} rows in ${Object.keys(T).length} tables → data/demo-ee`);
