// Live conditions: Open-Meteo (weather) and Fintraffic Digitraffic (road traffic
// announcements in Finland). Both are free and need no key. Each successful
// fetch is appended to data/bahn.db (live_weather, live_traffic), so there is a
// history, and the app still works offline from the latest saved fetch.
import { CITY } from './external.mjs';
import { sql } from './store.mjs';

export const live = { weather: {}, weatherAt: null, traffic: [], trafficAt: null, status: 'loading', errors: [] };

// Start from the latest saved fetch.
try {
  const db = sql();
  const wAt = db.prepare('SELECT MAX(fetched_at) t FROM live_weather').get().t;
  if (wAt) {
    for (const r of db.prepare('SELECT * FROM live_weather WHERE fetched_at = ?').all(wAt)) {
      live.weather[r.city] = { tempC: r.temp_c, precipMm: r.precip_mm, snowCm: r.snow_cm, windKmh: r.wind_kmh, code: r.weather_code, visibilityM: r.visibility_m };
    }
    live.weatherAt = wAt;
  }
  const tAt = db.prepare('SELECT MAX(fetched_at) t FROM live_traffic').get().t;
  if (tAt) {
    live.traffic = db.prepare('SELECT * FROM live_traffic WHERE fetched_at = ?').all(tAt)
      .map((r) => ({ id: r.id, type: r.type, title: r.title, lat: r.lat, lon: r.lon, at: r.released_at, country: r.type?.startsWith('DE_') ? 'DE' : 'FI' }));
    live.trafficAt = tAt;
  }
  if (wAt || tAt) live.status = 'cached';
} catch (e) {
  live.errors.push(`saved data: ${e.message}`);
}

function save() {
  try {
    const db = sql();
    db.exec('BEGIN');
    const w = db.prepare('INSERT OR IGNORE INTO live_weather VALUES (?,?,?,?,?,?,?,?)');
    for (const [city, x] of Object.entries(live.weather)) w.run(city, live.weatherAt, x.tempC, x.precipMm, x.snowCm, x.windKmh, x.code, x.visibilityM);
    const t = db.prepare('INSERT OR IGNORE INTO live_traffic VALUES (?,?,?,?,?,?,?)');
    for (const x of live.traffic) t.run(x.id, live.trafficAt, x.type, x.title || null, x.lat, x.lon, x.at || null);
    db.exec('COMMIT');
  } catch (e) {
    try { sql().exec('ROLLBACK'); } catch {}
    live.errors.push(`save: ${e.message}`);
  }
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export async function refreshWeather() {
  const names = Object.keys(CITY);
  const lat = names.map((n) => CITY[n][0]).join(',');
  const lon = names.map((n) => CITY[n][1]).join(',');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,precipitation,snowfall,wind_speed_10m,weather_code,visibility&timezone=UTC';
  const data = await getJson(url);
  const list = Array.isArray(data) ? data : [data];
  names.forEach((n, i) => {
    const c = list[i]?.current;
    if (c) live.weather[n] = {
      tempC: c.temperature_2m, precipMm: c.precipitation, snowCm: c.snowfall,
      windKmh: c.wind_speed_10m, code: c.weather_code, visibilityM: c.visibility,
    };
  });
  live.weatherAt = new Date().toISOString();
}

export async function refreshTraffic() {
  const data = await getJson(
    'https://tie.digitraffic.fi/api/traffic-message/v1/messages?inactiveHours=0&includeAreaGeometry=false&situationType=TRAFFIC_ANNOUNCEMENT',
    { 'Digitraffic-User': 'bahn-control-room-hack' },
  );
  const fi = (data.features || [])
    .filter((f) => f.geometry?.type === 'Point')
    .map((f) => {
      const a = f.properties.announcements?.[0] || {};
      return {
        id: f.properties.situationId,
        type: f.properties.trafficAnnouncementType,
        title: a.title?.trim(),
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        at: f.properties.releaseTime,
        country: 'FI',
      };
    });
  live.traffic = [...fi, ...live.traffic.filter((t) => t.country === 'DE')];
  live.trafficAt = new Date().toISOString();
}

// German motorways (Autobahn GmbH, free, no key): live warnings (jams, accidents)
// and closures in force now, for every Autobahn. Fetched a few roads at a time.
let autobahnAt = 0;
export async function refreshAutobahn() {
  if (Date.now() - autobahnAt < 30 * 60e3) return;
  const roads = (await getJson('https://verkehr.autobahn.de/o/autobahn/')).roads.map((r) => r.trim()).filter((r, i, a) => r && a.indexOf(r) === i);
  const out = [];
  const one = async (road, service) => {
    try {
      const j = await getJson(`https://verkehr.autobahn.de/o/autobahn/${encodeURIComponent(road)}/services/${service}`);
      for (const x of j[service] || []) {
        if (!x.coordinate || (service === 'closure' && (x.future || String(x.isBlocked) !== 'true'))) continue;
        const detail = (x.description || []).map((s) => s.trim()).filter(Boolean).find((s) => !/^Beginn|^Die Baustelle/.test(s)) || '';
        out.push({ id: x.identifier, type: service === 'warning' ? 'DE_WARNING' : 'DE_CLOSURE', title: `${x.title.trim()}${detail ? ` — ${detail}` : ''}`,
          lat: Number(x.coordinate.lat), lon: Number(x.coordinate.long), at: new Date().toISOString(), country: 'DE' });
      }
    } catch {}
  };
  const jobs = roads.flatMap((r) => [[r, 'warning'], [r, 'closure']]);
  for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map(([r, s]) => one(r, s)));
  live.traffic = [...live.traffic.filter((t) => t.country !== 'DE'), ...out];
  autobahnAt = Date.now();
}

export async function refreshAll() {
  live.errors = [];
  for (const [name, fn] of [['weather', refreshWeather], ['traffic', refreshTraffic], ['autobahn', refreshAutobahn]]) {
    try { await fn(); } catch (e) { live.errors.push(`${name}: ${e.message}`); }
  }
  live.status = live.errors.length === 0 ? 'live' : live.weatherAt ? 'partial' : 'offline';
  save();
}

// Distance (km) from point p to the straight segment a→b, all [lat, lon].
export function kmFromSegment(p, a, b) {
  const k = 111.32, cos = Math.cos((p[0] * Math.PI) / 180);
  const P = [p[1] * k * cos, p[0] * k], A = [a[1] * k * cos, a[0] * k], B = [b[1] * k * cos, b[0] * k];
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const t = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(P[0] - (A[0] + t * dx), P[1] - (A[1] + t * dy));
}

// WMO weather code → short label.
export function weatherLabel(code, lang = 'en') {
  const en = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Freezing fog',
    51: 'Drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Showers', 81: 'Showers',
    82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
  const fi = { 0: 'Selkeää', 1: 'Enimmäkseen selkeää', 2: 'Puolipilvistä', 3: 'Pilvistä', 45: 'Sumua', 48: 'Jäätävää sumua',
    51: 'Tihkua', 53: 'Tihkua', 55: 'Runsasta tihkua', 56: 'Jäätävää tihkua', 57: 'Jäätävää tihkua',
    61: 'Heikkoa sadetta', 63: 'Sadetta', 65: 'Rankkasadetta', 66: 'Jäätävää sadetta', 67: 'Jäätävää sadetta',
    71: 'Heikkoa lumisadetta', 73: 'Lumisadetta', 75: 'Runsasta lumisadetta', 77: 'Lumijyväsiä', 80: 'Sadekuuroja', 81: 'Sadekuuroja',
    82: 'Rankkoja kuuroja', 85: 'Lumikuuroja', 86: 'Lumikuuroja', 95: 'Ukkosta', 96: 'Ukkosta', 99: 'Ukkosta' };
  return (lang === 'fi' ? fi : en)[code] || (lang === 'fi' ? 'Ei tietoa' : 'Unknown');
}
