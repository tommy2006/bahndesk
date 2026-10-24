// Loads the Bahn snapshot (JSONL) into memory and indexes it by order.
// Everything is read once at startup; the dataset is a fixed snapshot.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'bahn');

export const SNAPSHOT_AT = '2026-10-21T09:00:00Z';

// Prefer the shipped database (data/bahn.db); fall back to the raw JSONL files.
const store = await import('./store.mjs');
const useDb = store.dbExists();

function load(name) {
  if (useDb) {
    const rows = store.readTable(name);
    if (rows) return rows;
  }
  return readJsonl(name);
}

// The Bahn snapshot plus our fictional Finland–Estonia demo orders (data/demo-ee).
export function readJsonl(name) {
  return [DIR, path.join(DIR, '..', 'demo-ee')].flatMap((dir) => {
    const file = path.join(dir, name + '.jsonl');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  });
}

const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));
const groupBy = (rows, key) => {
  const out = {};
  for (const r of rows) (out[r[key]] ||= []).push(r);
  return out;
};

const T = {};
for (const name of [
  'orders', 'addresses', 'sites', 'customers', 'drivers', 'vehicles', 'order_items',
  'transport_plans', 'transport_points', 'transport_segments', 'time_windows',
  'market_offers', 'market_offer_demand_signals', 'work_assignments', 'travel_reservations',
  'travel_options', 'alerts', 'incidents', 'work_items', 'endpoint_claims',
  'order_endpoint_details', 'conversations', 'messages', 'agent_proposals',
  'operational_events', 'tracking_observations', 'proofs', 'documents', 'operators', 'agents',
]) T[name] = load(name);

export const db = {
  source: useDb ? 'data/bahn.db' : 'data/bahn/*.jsonl',
  raw: T,
  orders: byId(T.orders),
  addresses: byId(T.addresses),
  sites: byId(T.sites),
  customers: byId(T.customers),
  drivers: byId(T.drivers),
  vehicles: byId(T.vehicles),
  segments: byId(T.transport_segments),
  points: byId(T.transport_points),
  by: {},
};

for (const t of [
  'order_items', 'transport_segments', 'time_windows', 'market_offers', 'work_assignments',
  'travel_reservations', 'travel_options', 'alerts', 'incidents', 'work_items', 'endpoint_claims',
  'order_endpoint_details', 'conversations', 'messages', 'agent_proposals', 'operational_events',
  'tracking_observations', 'proofs', 'documents',
]) db.by[t] = groupBy(T[t], 'order_id');
db.by.segmentsByPlan = groupBy(T.transport_segments, 'plan_id');
db.by.assignmentsByDriver = groupBy(T.work_assignments, 'driver_id');
db.by.signalsByOffer = groupBy(T.market_offer_demand_signals, 'offer_id');

// Prototype scope: Bahn's main markets. Gigs within Finland/Estonia, plus every gig
// that starts or ends in Germany or Denmark.
export const SCOPE = ['FI', 'EE'];
export const MAIN = ['DE', 'DK'];
export function finlandOrders() {
  return T.orders.filter((o) => {
    const p = db.addresses[o.pickup_address_id]?.country, d = db.addresses[o.delivery_address_id]?.country;
    return (SCOPE.includes(p) && SCOPE.includes(d)) || MAIN.includes(p) || MAIN.includes(d);
  });
}

export function rowsFor(table, orderId) {
  return db.by[table]?.[orderId] || [];
}

// Look up any record by table + id, used by the "where did this come from" links.
export function findRecord(table, id) {
  const rows = T[table];
  if (!rows) return null;
  return rows.find((r) => r.id === id) || null;
}
