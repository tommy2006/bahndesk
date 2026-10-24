// One SQLite file (data/bahn.db) holds everything: the Bahn snapshot, reference data
// fetched once (routes, fuel/charging/rest stops, ferries, news) and a history of every
// live weather/traffic fetch. It ships with the repo, so nothing has to be fetched again.
// Uses Node's built-in node:sqlite (Node 22.13+), so there is still nothing to install.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const DB_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'bahn.db');
export const dbExists = () => fs.existsSync(DB_PATH);

let conn;
export function sql() {
  if (!conn) {
    conn = new DatabaseSync(DB_PATH);
    conn.exec(`
      PRAGMA journal_mode = DELETE;
      CREATE TABLE IF NOT EXISTS _columns (tbl TEXT, col TEXT, kind TEXT, PRIMARY KEY (tbl, col));
      CREATE TABLE IF NOT EXISTS ref_routes (
        key TEXT PRIMARY KEY, from_city TEXT, to_city TEXT, distance_km REAL, duration_min REAL,
        geometry TEXT, source TEXT, fetched_at TEXT);
      CREATE TABLE IF NOT EXISTS ref_pois (
        id TEXT PRIMARY KEY, kind TEXT, name TEXT, brand TEXT, lat REAL, lon REAL,
        sockets TEXT, opening_hours TEXT, tags TEXT, source TEXT, fetched_at TEXT);
      CREATE TABLE IF NOT EXISTS ref_route_pois (route_key TEXT, poi_id TEXT, km_off_route REAL, km_along REAL,
        PRIMARY KEY (route_key, poi_id));
      CREATE TABLE IF NOT EXISTS ref_ferry_routes (
        id INTEGER PRIMARY KEY, operator TEXT, from_terminal TEXT, to_terminal TEXT, departs_local TEXT,
        hours REAL, vehicle_price_eur REAL, note TEXT, source TEXT);
      CREATE TABLE IF NOT EXISTS ref_ferry_sailings (
        id INTEGER PRIMARY KEY, direction TEXT, operator TEXT, ship TEXT, dep_local TEXT, arr_local TEXT,
        from_terminal TEXT, to_terminal TEXT, indicative_car_eur REAL, source TEXT, source_url TEXT, fetched_at TEXT);
      CREATE TABLE IF NOT EXISTS ref_news (id TEXT PRIMARY KEY, kind TEXT, status TEXT, title_en TEXT, title_fi TEXT,
        detail_en TEXT, detail_fi TEXT, terminal_id TEXT, region TEXT, starts_at TEXT, ends_at TEXT, source TEXT, published_at TEXT);
      CREATE TABLE IF NOT EXISTS live_weather (city TEXT, fetched_at TEXT, temp_c REAL, precip_mm REAL, snow_cm REAL,
        wind_kmh REAL, weather_code INTEGER, visibility_m REAL, PRIMARY KEY (city, fetched_at));
      CREATE TABLE IF NOT EXISTS live_traffic (id TEXT, fetched_at TEXT, type TEXT, title TEXT, lat REAL, lon REAL,
        released_at TEXT, PRIMARY KEY (id, fetched_at));
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    `);
  }
  return conn;
}

// Store a list of JSON records as a real table (one column per key) so the customer
// can browse it in any SQLite tool. Nested values are stored as JSON text.
export function writeTable(name, rows) {
  const db = sql();
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const kinds = Object.fromEntries(cols.map((c) => {
    const v = rows.map((r) => r[c]).find((x) => x !== null && x !== undefined);
    return [c, typeof v === 'boolean' ? 'bool' : typeof v === 'object' ? 'json' : typeof v === 'number' ? 'num' : 'text'];
  }));
  db.exec(`DROP TABLE IF EXISTS "${name}"`);
  db.exec(`CREATE TABLE "${name}" (${cols.map((c) => `"${c}" ${kinds[c] === 'num' || kinds[c] === 'bool' ? 'NUMERIC' : 'TEXT'}${c === 'id' ? ' PRIMARY KEY' : ''}`).join(', ')})`);
  db.prepare('DELETE FROM _columns WHERE tbl = ?').run(name);
  const colStmt = db.prepare('INSERT INTO _columns (tbl, col, kind) VALUES (?, ?, ?)');
  for (const c of cols) colStmt.run(name, c, kinds[c]);
  const ins = db.prepare(`INSERT INTO "${name}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
  db.exec('BEGIN');
  for (const r of rows) ins.run(...cols.map((c) => {
    const v = r[c];
    if (v === undefined || v === null) return null;
    if (kinds[c] === 'json') return JSON.stringify(v);
    if (kinds[c] === 'bool') return v ? 1 : 0;
    return v;
  }));
  db.exec('COMMIT');
}

// Read a table back as the original JSON records.
export function readTable(name) {
  const db = sql();
  const kinds = Object.fromEntries(db.prepare('SELECT col, kind FROM _columns WHERE tbl = ?').all(name).map((r) => [r.col, r.kind]));
  if (!Object.keys(kinds).length) return null;
  return db.prepare(`SELECT * FROM "${name}"`).all().map((row) => {
    const out = {};
    for (const [c, v] of Object.entries(row)) {
      if (v === null) { out[c] = null; continue; }
      out[c] = kinds[c] === 'json' ? JSON.parse(v) : kinds[c] === 'bool' ? Boolean(v) : v;
    }
    return out;
  });
}

export const meta = {
  get: (k) => sql().prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value ?? null,
  set: (k, v) => sql().prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(k, String(v)),
};
