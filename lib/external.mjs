// External data the snapshot does not contain. Some of it is live (see live.mjs);
// the rest is clearly labelled demo data, generated deterministically so every run
// shows the same numbers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './data.mjs';

const EXT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'external');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(EXT, f), 'utf8'));

export const CITY = {
  Helsinki: [60.170, 24.938], Espoo: [60.205, 24.656], Vantaa: [60.294, 25.040],
  Tampere: [61.498, 23.761], Turku: [60.452, 22.267], Oulu: [65.012, 25.468],
  Lahti: [60.983, 25.656], 'Seinäjoki': [62.790, 22.840], 'Jyväskylä': [62.242, 25.747],
  Pori: [61.485, 21.797], Kuopio: [62.892, 27.678], Hamburg: [53.551, 9.994],
  Cologne: [50.938, 6.960], Frankfurt: [50.110, 8.682], Leipzig: [51.340, 12.375],
  Munich: [48.137, 11.575], Gothenburg: [57.709, 11.975], 'Malmö': [55.605, 13.004],
  Stockholm: [59.329, 18.069], Lyon: [45.764, 4.836], Marseille: [43.296, 5.370],
  Odense: [55.404, 10.402], Travemünde: [53.960, 10.870],
  Tallinn: [59.437, 24.754], Tartu: [58.378, 26.729], 'Pärnu': [58.385, 24.497],
  Aarhus: [56.157, 10.211], Copenhagen: [55.676, 12.568], Berlin: [52.520, 13.405], 'Düsseldorf': [51.227, 6.773],
  Stuttgart: [48.776, 9.183], Antwerp: [51.219, 4.402], Rotterdam: [51.924, 4.477], Paris: [48.857, 2.352],
  // Ferry ports used on the map and for the Germany → Finland crossing (the dataset's
  // fictional West Baltic / South Finland terminals sit in these port areas).
  'West Baltic terminal': [53.958, 10.874], 'South Finland terminal': [60.212, 25.192],
};
export const coordsOf = (city) => CITY[city] || CITY[city?.normalize('NFC')] || null;

// Small deterministic PRNG so demo values are stable between runs.
function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const PREMIUM = new Set(['Ferrari', 'Bentley', 'Lamborghini', 'Aston Martin']);
const UPPER = new Set(['Porsche', 'Mercedes-Benz', 'BMW', 'Audi', 'Tesla', 'Polestar']);
export function valueClass(vehicle) {
  if (!vehicle) return 'standard';
  if (PREMIUM.has(vehicle.make)) return 'exceptional';
  if (UPPER.has(vehicle.make) && /RS|M4|911|Taycan|Panamera|S-Class|Q8|i5|EQE/.test(vehicle.model)) return 'high';
  return 'standard';
}

// Real-world-ish WLTP ranges in km. Demo data.
const EV_RANGE = {
  Taycan: 450, 'Q8 e-tron': 500, i4: 520, i5: 500, EQE: 600, '2': 480,
  Enyaq: 520, 'Model 3': 550, 'Model Y': 500, 'ID.4': 500,
};

// Charging stops needed on the driven part of the route, given air temperature.
export function energyPlan(vehicle, driveKm, tempC) {
  if (!vehicle) return null;
  if (vehicle.fuel !== 'electric') {
    const tank = vehicle.fuel === 'hybrid' ? 750 : 650;
    return { kind: 'fuel', stops: Math.max(0, Math.ceil(driveKm / tank) - 1), rangeKm: tank };
  }
  const rated = EV_RANGE[vehicle.model] || 450;
  const coldFactor = tempC == null ? 0.85 : tempC < -10 ? 0.6 : tempC < 0 ? 0.7 : tempC < 10 ? 0.85 : 0.95;
  const usable = Math.round(rated * 0.8 * coldFactor); // 10–90 % window
  const stops = Math.max(0, Math.ceil(driveKm / usable) - 1);
  const rnd = seeded(vehicle.id + 'chg');
  const busyChargers = stops > 0 ? Math.round(rnd() * 2) : 0; // demo: stations reporting full
  return { kind: 'electric', stops, rangeKm: usable, ratedKm: rated, coldFactor, busyChargers };
}

// Driver track record: the snapshot only has name + home city, so the history
// is synthesised for the demo and combined with real assignments from the snapshot.
export function driverRecord(driverId) {
  const d = db.drivers[driverId];
  if (!d) return null;
  const rnd = seeded(driverId);
  const deliveries = 15 + Math.floor(rnd() * 320);
  const years = 1 + Math.floor(rnd() * 8);
  const onTime = Math.min(0.995, 0.82 + rnd() * 0.18);
  const damage = rnd() < 0.18 ? 1 + Math.floor(rnd() * 2) : 0;
  const noShows = rnd() < 0.12 ? 1 : 0;
  const assignments = db.by.assignmentsByDriver[driverId] || [];
  return {
    id: driverId,
    name: d.display_name,
    homeCity: d.home_city,
    homeCountry: d.home_country,
    demo: { deliveries12m: deliveries, years, onTimeRate: onTime, damageClaims12m: damage, noShows12m: noShows,
      winterExperience: rnd() > 0.3 },
    snapshot: {
      active: assignments.filter((a) => ['ASSIGNED', 'IN_PROGRESS'].includes(a.status)).length,
      completed: assignments.filter((a) => a.status === 'COMPLETED').length,
      cancelled: assignments.filter((a) => a.status === 'CANCELLED').length,
    },
  };
}

// Customer price: Bahn quotes the dealer, then derives the driver fee from it.
// The snapshot only stores the driver fee, so the customer price is demo data.
export function customerPrice(feeCents) {
  if (!feeCents) return null;
  return Math.round((feeCents * 1.38) / 500) * 500;
}

export const strikes = () => readJson('strikes.json');

// Real Helsinki–Tallinn timetable → concrete sailings after a given moment.
// dir: 'TLL-HEL' or 'HEL-TLL'. Cars must check in ~45 min before departure.
const FI_EE = readJson('ferries-fi-ee.json');
export const CHECK_IN_MIN = 45;
const tzOffsetMin = (ms, tz) => Math.round((Date.parse(new Date(ms).toLocaleString('sv-SE', { timeZone: tz }).replace(' ', 'T') + 'Z') - ms) / 60000);
function localToUtc(dateYmd, hhmm, tz = FI_EE.timezone) {
  const guess = Date.parse(`${dateYmd}T${hhmm}:00Z`);
  return guess - tzOffsetMin(guess, tz) * 60000;
}
export function nextSailings(dir, afterIso, count = 3) {
  const after = Date.parse(afterIso);
  const out = [];
  for (let d = 0; d < 3; d++) {
    const ymd = new Date(after + d * 86400e3).toLocaleString('sv-SE', { timeZone: FI_EE.timezone }).slice(0, 10);
    for (const s of FI_EE.sailings.filter((x) => x.dir === dir)) {
      const dep = localToUtc(ymd, s.dep);
      let arr = localToUtc(ymd, s.arr);
      if (arr < dep) arr += 86400e3;
      const checkIn = dep - CHECK_IN_MIN * 60000;
      if (checkIn >= after) out.push({ operator: s.operator, ship: s.ship, dep: new Date(dep).toISOString(), arr: new Date(arr).toISOString(),
        checkIn: new Date(checkIn).toISOString(), fromTerminal: s.from_terminal, toTerminal: s.to_terminal, eur: s.car_eur, source: FI_EE.source_urls[dir === 'HEL-TLL' ? 0 : 1] });
    }
  }
  return out.sort((a, b) => a.dep.localeCompare(b.dep)).slice(0, count);
}
export const ferryTimetableSource = FI_EE.source;

// Saved road route for a Finnish leg, with the stops along it (from data/bahn.db).
import { sql, dbExists } from './store.mjs';
const routeCache = new Map();
export function savedRoute(from, to) {
  const key = `${from}|${to}`;
  if (routeCache.has(key)) return routeCache.get(key);
  let out = null;
  if (dbExists()) {
    const r = sql().prepare('SELECT key, distance_km, duration_min, geometry, source, fetched_at FROM ref_routes WHERE key = ?').get(key);
    if (r) {
      const stops = sql().prepare(`SELECT p.id, p.kind, p.name, p.brand, p.sockets, p.lat, p.lon, rp.km_along, rp.km_off_route
        FROM ref_route_pois rp JOIN ref_pois p ON p.id = rp.poi_id WHERE rp.route_key = ? ORDER BY rp.km_along`).all(key);
      const count = (k) => stops.filter((s) => s.kind === k).length;
      // Fast chargers: CCS / Tesla sockets. Pick ones roughly mid-route for the briefing.
      const fast = stops.filter((s) => s.kind === 'charging' && /type2_combo|tesla|chademo/i.test(s.sockets || ''));
      // [lat, lon] points of the road route (OSRM, simplified), for the map and for
      // checking which live notices sit on the road actually driven.
      const line = JSON.parse(r.geometry || '[]').map(([lon, lat]) => [lat, lon]);
      out = {
        key, km: r.distance_km, minutes: r.duration_min, source: r.source, fetchedAt: r.fetched_at, line,
        stopsList: stops.filter((s) => s.kind === 'rest' || /type2_combo|tesla|chademo/i.test(s.sockets || '')).map((s) => ({ id: s.id, kind: s.kind, name: s.name || s.brand, kmAlong: s.km_along, lat: s.lat, lon: s.lon })),
        stops: { fuel: count('fuel'), charging: count('charging'), fastCharging: fast.length, rest: count('rest') },
        suggestedChargers: fast.filter((s) => s.km_along > 30 && s.km_along < r.distance_km - 20).slice(0, 3)
          .map((s) => ({ name: s.name || s.brand || 'Charger', kmAlong: s.km_along, sockets: s.sockets })),
        restAreas: stops.filter((s) => s.kind === 'rest' && s.name).slice(0, 3).map((s) => ({ name: s.name, kmAlong: s.km_along })),
      };
    }
  }
  routeCache.set(key, out);
  return out;
}
