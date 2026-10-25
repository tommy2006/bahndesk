// Records the demo by driving headless Chrome over the DevTools protocol.
// Each scene runs its actions while frames are captured, then holds until the
// scene's narration ends. Output: frames/ + frames.txt (ffmpeg concat list).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const DIR = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const APP = 'http://localhost:3100';
const W = 1600, H = 1000, FPS = 15, PAD = 0.8;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const scenes = JSON.parse(fs.readFileSync(path.join(DIR, 'scenes.json'), 'utf8'))
  .map((s) => ({ ...s, seconds: dur(path.join(DIR, `${s.id}.mp3`)) + PAD }));

// ---- Chrome + CDP ----
const profile = path.join(DIR, 'chrome-profile');
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9334', `--window-size=${W},${H}`, '--hide-scrollbars',
  '--force-device-scale-factor=1', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch('http://127.0.0.1:9334/json/list')).json()).find((t) => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.delete(id)) rej(new Error(`${method}: timed out`)); }, 8000);
});
const js = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;

await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

// In-page helpers: find by visible text, a visible fake cursor, smooth scrolling.
const HELPERS = `
window.__find = (text, sel = '*') => {
  const all = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent && e.textContent.trim().includes(text));
  return all.filter((e) => ![...e.children].some((c) => all.includes(c)))[0] || all.at(-1) || null;
};
if (!document.getElementById('__cur')) {
  const c = document.createElement('div'); c.id = '__cur';
  c.style.cssText = 'position:fixed;z-index:99999;width:22px;height:22px;border-radius:50%;background:rgba(220,60,40,.35);border:2px solid rgba(220,60,40,.9);left:800px;top:500px;transform:translate(-50%,-50%);transition:left .7s ease,top .7s ease,transform .15s;pointer-events:none';
  document.body.appendChild(c);
}
window.__moveTo = (el) => { const r = el.getBoundingClientRect(); const c = document.getElementById('__cur'); c.style.left = (r.left + Math.min(r.width / 2, 60)) + 'px'; c.style.top = (r.top + r.height / 2) + 'px'; };
window.__press = () => { const c = document.getElementById('__cur'); c.style.transform = 'translate(-50%,-50%) scale(.6)'; setTimeout(() => c.style.transform = 'translate(-50%,-50%)', 180); };
`;
const helpers = () => js(HELPERS);
const q = (s) => JSON.stringify(s);

const act = {
  wait: (ms) => sleep(ms),
  goto: async (hash) => { await cdp('Page.navigate', { url: `${APP}/${hash}` }); await sleep(2500); await helpers(); },
  hash: async (hash) => { await js(`location.hash = ${q(hash)}`); await sleep(1500); await js(`(() => { const d = document.querySelector("#detail"); [d, ...(d ? [...d.querySelectorAll("*")] : []), d?.parentElement, document.scrollingElement].forEach((e) => { if (e && e.scrollTop) e.scrollTop = 0; }); })()`); await sleep(400); await helpers(); },
  scrollTo: async (text, block = 'start') => { await js(`(() => { const e = __find(${q(text)}); if (e) e.scrollIntoView({ behavior: 'smooth', block: ${q(block)} }); })()`); await sleep(1400); },
  point: async (text, sel) => { await js(`(() => { const e = __find(${q(text)}, ${q(sel || '*')}); if (e) __moveTo(e); })()`); await sleep(900); },
  click: async (text, sel = 'button, a, [data-i], li, [role=button], [class*=tab]') => {
    await act.point(text, sel);
    const ok = await js(`(() => { const e = __find(${q(text)}, ${q(sel)}); if (!e) return false; __press(); e.click(); return true; })()`);
    if (!ok) console.warn('  click target not found:', text);
    await sleep(1500); await helpers();
  },
  scrollBy: async (sel, dy) => { await js(`(() => { const e = document.querySelector(${q(sel)}) || document.scrollingElement; e.scrollBy({ top: ${dy}, behavior: 'smooth' }); })()`); await sleep(1300); },
};

// ---- Scene scripts ----
// ---- Scene scripts (overnight-changes demo) ----
// Opens a folded section only if it is closed (the app remembers open sections, so a click could close it).
act.open = async (text) => {
  await act.point(text, 'summary');
  await js(`(() => { const s = __find(${JSON.stringify(text)}, 'summary'); if (!s) return; const d = s.closest('details'); if (d && !d.open) { __press(); s.click(); } })()`);
  await sleep(1000);
};
act.home = async () => { await act.click('Needs you', 'button, a, [class*=tab]'); await js(`document.querySelectorAll('*').forEach((e) => { if (e.scrollTop) e.scrollTo({ top: 0, behavior: 'smooth' }); })`); await sleep(1200); };
const SCRIPT = {
  's01-hook': async () => { await act.wait(3000); await act.point('Orders need you'); await act.wait(5000); await act.point('Needs you', 'button, a, [class*=tab]');
    await act.wait(5000); await act.point('Most urgent first'); await act.wait(2500); await act.point('Do this now'); },
  's02-silent': async () => { await act.click('Phone the driver now', 'li, [data-i], article, button, a'); await act.wait(1500); await act.hash('#CD-421106');
    await act.point('Driver silent since'); await act.wait(5000); await act.point('Car picked up, driver silent'); await act.wait(4500);
    await act.point('Phone the driver now.'); await act.wait(3000); await act.point('If you approve'); },
  's03-gps': async () => { await act.open('What the agent did'); await act.scrollTo('What the agent did', 'center'); await act.wait(5000);
    await act.hash('#CD-420806'); await act.point('No word from the driver'); },
  's04-soft': async () => { await act.hash('#CD-420439'); await act.point('late 43 min'); await act.wait(3500);
    await act.open('Evidence and sources'); await act.scrollTo('first late car', 'center'); await act.point("Torvamelio's first late car"); },
  's05-drivers': async () => { await act.hash('#CD-420452'); await act.point('Agent suggests'); await act.wait(4000);
    await act.open('Driver:'); await act.scrollTo('Damage claims', 'center'); await act.point('On time'); },
  's06-route': async () => { await act.hash('#CD-420299'); await act.point('Travemünde'); await act.wait(3000);
    await act.scrollTo('Clear road', 'center'); await act.point('Risk', 'span, li, div'); await act.wait(2500); await act.point('Opportunity', 'span, li, div');
    await act.open('Route, stops and road conditions'); await act.scrollTo('Travemünde harbour', 'center'); await act.point('Travemünde harbour'); },
  's07-pickup': async () => { await act.hash('#CD-420593'); await act.point('Overdue'); await act.wait(3500); await act.point('Other options');
    await act.point('Wait 1 more hour', 'button'); await act.wait(800); await act.point('Release driver, reschedule pickup', 'button'); await act.wait(800);
    await act.point('CD-420404 instead', 'button'); await act.wait(800); await act.point('Cancel delivery', 'button'); await act.wait(1500); await act.point('If you approve'); },
  's08-evidence': async () => { await act.open('Evidence and sources'); await act.scrollTo('What the agent found', 'start'); await act.point('What the agent found');
    await act.wait(3500); await act.open('History'); await act.scrollTo('History', 'start'); await act.click('Source', 'button, a, span'); await act.wait(4000); await act.point('Show technical details'); },
  's09-live': async () => { await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await act.hash('#CD-420201'); await act.open('Route, stops and road conditions'); await act.scrollTo('Unfall', 'center'); await act.point('Unfall'); await act.wait(3500);
    await act.home(); await act.point('Dockworkers announce'); await act.wait(2500); await act.point('Rebook all', 'button'); await act.wait(1500);
    await act.hash('#CD-421102'); await act.open('Route, stops and road conditions'); await act.scrollTo('Energy, whole trip', 'center'); await act.point('estimate'); },
  's10-close': async () => { await act.hash('#CD-421106'); await act.home(); await act.click('FI', 'button'); await act.wait(5000); await act.click('EN', 'button'); await act.wait(2000); await act.point('Orders need you'); },
};

// ---- Capture loop ----
const FRAMES = path.join(DIR, 'frames');
fs.rmSync(FRAMES, { recursive: true, force: true }); fs.mkdirSync(FRAMES);
const list = []; let n = 0;
async function shoot() {
  const { data } = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  const f = `f${String(n++).padStart(5, '0')}.jpg`;
  fs.writeFileSync(path.join(FRAMES, f), Buffer.from(data, 'base64'));
  return f;
}

await act.goto('');
for (const s of scenes) {
  console.log(`scene ${s.id}: ${s.seconds.toFixed(1)} s`);
  const frames = []; let done = false;
  const t0 = Date.now();
  const actions = SCRIPT[s.id]().catch((e) => console.warn('  action error:', e.message)).finally(() => { done = true; });
  // Capture until both the actions and the narration time are over; frame times are real.
  while (!done || (Date.now() - t0) / 1000 < s.seconds) {
    const at = (Date.now() - t0) / 1000;
    try { frames.push({ f: await shoot(), at }); } catch (e) { console.warn('  frame skipped:', e.message); await sleep(200); continue; }
    const next = t0 + frames.length * (1000 / FPS);
    if (next > Date.now()) await sleep(next - Date.now());
  }
  await actions;
  // Rescale this scene's frame times so it lasts exactly as long as its narration.
  const real = (Date.now() - t0) / 1000;
  const k = s.seconds / real;
  frames.forEach((fr, i) => { const end = i + 1 < frames.length ? frames[i + 1].at : real; list.push({ f: fr.f, d: (end - fr.at) * k }); });
  if (k < 0.95) console.warn(`  scene ran ${real.toFixed(1)} s for ${s.seconds.toFixed(1)} s of narration; sped up ×${(1 / k).toFixed(2)}`);
}
fs.writeFileSync(path.join(DIR, 'frames.txt'),
  list.map((x) => `file 'frames/${x.f}'\nduration ${x.d.toFixed(4)}`).join('\n') + `\nfile 'frames/${list.at(-1).f}'\n`);
console.log(`${list.length} frames, ${list.reduce((a, x) => a + x.d, 0).toFixed(1)} s`);
ws.close(); chrome.kill();
