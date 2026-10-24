// Builds data/bahn.db: the Bahn snapshot plus every piece of reference data the app
// uses, fetched once and saved. Re-running only fetches what is missing.
//   npm run build-db             fill in what is missing
//   npm run build-db -- --refresh  re-fetch routes and stops
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, writeTable, meta, DB_PATH } from '../lib/store.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REFRESH = process.argv.includes('--refresh');
const UA = { 'User-Agent': 'bahn-control-room-hack/0.1 (hackathon prototype)' };
const now = () => new Date().toISOString();
const log = (...a) => console.log('·', ...a);

// 1. Bahn snapshot + fictional Estonia demo orders → one table per file
const { readJsonl } = await import('../lib/data.mjs');
const names = new Set(['bahn', 'demo-ee'].flatMap((d) => fs.existsSync(path.join(ROOT, 'data', d)) ? fs.readdirSync(path.join(ROOT, 'data', d)) : [])
  .filter((f) => f.endsWith('.jsonl')).map((f) => f.replace('.jsonl', '')));
for (const name of names) writeTable(name, readJsonl(name));
log(`Bahn snapshot + Estonia demo imported (${names.size} tables)`);

const { CITY } = await import('../lib/external.mjs');
const { kmFromSegment, refreshAll } = await import('../lib/live.mjs');
const db = sql();

// 2. Ferries and news. Only the real published Helsinki–Tallinn timetable; no invented operators.
db.exec('DROP TABLE IF EXISTS ref_ferry_routes');
// Real Helsinki–Tallinn timetable (published times; prices indicative)
const ee = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/external/ferries-fi-ee.json'), 'utf8'));
db.exec('DELETE FROM ref_ferry_sailings');
const sins = db.prepare('INSERT INTO ref_ferry_sailings (direction, operator, ship, dep_local, arr_local, from_terminal, to_terminal, indicative_car_eur, source, source_url, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
for (const s of ee.sailings) sins.run(s.dir, s.operator, s.ship, s.dep, s.arr, s.from_terminal, s.to_terminal, s.car_eur, ee.source, ee.source_urls[s.dir === 'HEL-TLL' ? 0 : 1], '2026-10-24');
log(`Helsinki–Tallinn timetable: ${ee.sailings.length} real sailings saved`);
const news = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/external/strikes.json'), 'utf8'));
db.exec('DELETE FROM ref_news');
const nins = db.prepare('INSERT INTO ref_news VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
for (const s of news) nins.run(s.id, s.kind, s.status, s.title.en, s.title.fi, s.detail.en, s.detail.fi, s.terminal_id || null, s.region || null, s.starts_at, s.ends_at, s.source, s.published_at);
log(`News saved (${news.length})`);

// 3. Fuel, EV charging and rest stops in Finland (OpenStreetMap, © OpenStreetMap contributors, ODbL)
const ALL = (bbox) => `[out:json][timeout:270][bbox:${bbox}];(node[amenity~"^(fuel|charging_station)$"];way[amenity=fuel];node[highway~"^(rest_area|services)$"];way[highway~"^(rest_area|services)$"];);out center tags;`;
// Germany has ~100k chargers; keep fuel, rest areas and fast (CCS/Tesla) chargers only, in four bands.
const DE = (bbox) => `[out:json][timeout:270][bbox:${bbox}];(nwr[amenity=fuel];node[amenity=charging_station]["socket:type2_combo"];node[amenity=charging_station]["socket:tesla_supercharger"];nwr[highway~"^(rest_area|services)$"];);out center tags;`;
const POI_SETS = [
  ['fi', ALL('59.6,19.4,70.1,31.6'), 'Finland'], ['ee', ALL('57.5,21.7,59.8,28.3'), 'Estonia'], ['dk', ALL('54.5,8.0,57.8,15.3'), 'Denmark'],
  ['de1', DE('53.2,5.8,55.1,15.1'), 'Germany (north)'], ['de2', DE('51.5,5.8,53.2,15.1'), 'Germany (north-central)'],
  ['de3', DE('49.5,5.8,51.5,15.1'), 'Germany (south-central)'], ['de4', DE('47.2,5.8,49.5,15.1'), 'Germany (south)'],
];
const havePois = db.prepare('SELECT COUNT(*) n FROM ref_pois').get().n;
const missingFile = POI_SETS.some(([c]) => !fs.existsSync(path.join(ROOT, `data/external/osm-pois-${c}.json`)));
if (!havePois || missingFile || REFRESH) {
  db.exec('DELETE FROM ref_pois');
  for (const [cc, query, country] of POI_SETS) {
  const poiFile = path.join(ROOT, `data/external/osm-pois-${cc}.json`);
  if (!fs.existsSync(poiFile) || REFRESH) {
    log(`Downloading ${country} fuel/charging/rest stops from OpenStreetMap (can take ~2 min)…`);
    // The public Overpass server throttles big back-to-back queries: retry after a pause.
    for (let attempt = 1; ; attempt++) {
      const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(300000) }).catch((e) => ({ ok: false, status: e.message }));
      if (res.ok) { fs.writeFileSync(poiFile, await res.text()); break; }
      if (attempt >= 4) { log(`Overpass kept failing for ${country}; skipping its stops this run`); break; }
      log(`Overpass ${res.status} for ${country}; retrying in 45 s`);
      await new Promise((ok) => setTimeout(ok, 45000));
    }
  }
  if (!fs.existsSync(poiFile)) continue;
  let osm; try { osm = JSON.parse(fs.readFileSync(poiFile, "utf8")); } catch { log(`Bad stops file for ${country}; skipped`); continue; }
  const fetchedAt = osm.osm3s?.timestamp_osm_base || now();
  const pins = db.prepare('INSERT OR REPLACE INTO ref_pois VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  db.exec('BEGIN');
  for (const e of osm.elements) {
    const t = e.tags || {};
    const kind = t.amenity === 'charging_station' ? 'charging' : t.amenity === 'fuel' ? 'fuel' : ['rest_area', 'services'].includes(t.highway) ? 'rest' : null;
    if (!kind) continue;
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat == null) continue;
    const sockets = Object.keys(t).filter((k) => k.startsWith('socket:') && !k.includes(':output')).map((k) => `${k.slice(7)}=${t[k]}`).join(', ') || null;
    pins.run(`${e.type}/${e.id}`, kind, t.name || null, t.brand || t.operator || null, lat, lon, sockets, t.opening_hours || null, JSON.stringify(t), 'OpenStreetMap (© OpenStreetMap contributors, ODbL)', fetchedAt);
  }
  db.exec('COMMIT');
  }
}
log(`${db.prepare('SELECT COUNT(*) n FROM ref_pois').get().n} stops saved`);

// 4. Road routes for every Finnish leg (OSRM over OpenStreetMap)
const orders = db.prepare('SELECT * FROM orders').all();
const addr = Object.fromEntries(db.prepare('SELECT id, city, country FROM addresses').all().map((a) => [a.id, a]));
const legs = new Set();
const NORDIC = ['FI', 'EE'], MAIN = ['DE', 'DK'];
for (const o of orders) {
  const p = addr[o.pickup_address_id], d = addr[o.delivery_address_id];
  if (!p || !d) continue;
  const inScope = (NORDIC.includes(p.country) && NORDIC.includes(d.country)) || MAIN.includes(p.country) || MAIN.includes(d.country);
  if (!inScope) continue;
  // Into Finland from the continent: drive to the West Baltic terminal, ferry to Helsinki.
  if (d.country === 'FI' && !NORDIC.includes(p.country)) legs.add(`${p.city}|West Baltic terminal`);
  // Neither end in Finland/Estonia: one road route end to end.
  if (!NORDIC.includes(p.country) && !NORDIC.includes(d.country)) legs.add(`${p.city}|${d.city}`);
  if (d.country === 'FI') legs.add(`${p.country === 'FI' ? p.city : 'Helsinki'}|${d.city}`);
  // Estonian legs: to / from Tallinn harbour
  if (p.country === 'EE') legs.add(`${p.city}|Tallinn`);
  if (d.country === 'EE') { legs.add(`Tallinn|${d.city}`); if (p.country === 'FI') legs.add(`${p.city}|Helsinki`); }
}
const rins = db.prepare('INSERT OR REPLACE INTO ref_routes VALUES (?,?,?,?,?,?,?,?)');
for (const key of legs) {
  const [from, to] = key.split('|');
  if (!REFRESH && db.prepare('SELECT 1 FROM ref_routes WHERE key = ?').get(key)) continue;
  const A = CITY[from], B = CITY[to];
  if (!A || !B) { log(`no coordinates for ${key}`); continue; }
  if (from === to) { rins.run(key, from, to, 15, 25, JSON.stringify([[A[1], A[0]]]), 'local delivery estimate', now()); continue; }
  const url = `https://router.project-osrm.org/route/v1/driving/${A[1]},${A[0]};${B[1]},${B[0]}?overview=simplified&geometries=geojson`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
  const r = (await res.json()).routes?.[0];
  if (!r) { log(`no route for ${key}`); continue; }
  rins.run(key, from, to, Math.round(r.distance / 100) / 10, Math.round(r.duration / 60), JSON.stringify(r.geometry.coordinates), 'OSRM over OpenStreetMap', now());
  log(`route ${from} → ${to}: ${Math.round(r.distance / 1000)} km`);
  await new Promise((ok) => setTimeout(ok, 1100)); // be polite to the public OSRM server
}

// 5. Which stops lie along each route (within 2 km of the road)
db.exec('DELETE FROM ref_route_pois');
const pois = db.prepare('SELECT id, lat, lon FROM ref_pois').all();
const lins = db.prepare('INSERT INTO ref_route_pois VALUES (?,?,?,?)');
db.exec('BEGIN');
for (const route of db.prepare('SELECT key, geometry FROM ref_routes').all()) {
  const line = JSON.parse(route.geometry).map(([lon, lat]) => [lat, lon]);
  if (line.length < 2) continue;
  const lats = line.map((p) => p[0]), lons = line.map((p) => p[1]);
  const box = [Math.min(...lats) - 0.05, Math.max(...lats) + 0.05, Math.min(...lons) - 0.1, Math.max(...lons) + 0.1];
  for (const p of pois) {
    if (p.lat < box[0] || p.lat > box[1] || p.lon < box[2] || p.lon > box[3]) continue;
    let best = Infinity, along = 0, run = 0, bestAlong = 0;
    for (let i = 1; i < line.length; i++) {
      const d = kmFromSegment([p.lat, p.lon], line[i - 1], line[i]);
      if (d < best) { best = d; bestAlong = along; }
      run = kmFromSegment(line[i - 1], line[i], line[i]);
      along += run;
    }
    if (best <= 2) lins.run(route.key, p.id, Math.round(best * 10) / 10, Math.round(bestAlong));
  }
}
db.exec('COMMIT');
log(`${db.prepare('SELECT COUNT(*) n FROM ref_route_pois').get().n} stops matched to ${db.prepare('SELECT COUNT(*) n FROM ref_routes').get().n} routes`);

// 6. One live snapshot so the database is complete offline
await refreshAll();
meta.set('built_at', now());
log(`Done → ${DB_PATH}`);
