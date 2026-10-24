// Records the demo by driving headless Chrome over the DevTools protocol.
// Each scene runs its actions while frames are captured, then holds until the
// scene's narration ends. Output: frames/ + frames.txt (ffmpeg concat list).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const DIR = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const APP = 'http://localhost:3100';
const W = 1600, H = 1000, FPS = 15, PAD = 1.0;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const scenes = JSON.parse(fs.readFileSync(path.join(DIR, 'scenes.json'), 'utf8'))
  .map((s) => ({ ...s, seconds: dur(path.join(DIR, `${s.id}.wav`)) + PAD }));

// ---- Chrome + CDP ----
const profile = path.join(DIR, 'chrome-profile');
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', `--window-size=${W},${H}`, '--hide-scrollbars',
  '--force-device-scale-factor=1', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch('http://127.0.0.1:9333/json/list')).json()).find((t) => t.type === 'page'); } catch {}
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
  hash: async (hash) => { await js(`location.hash = ${q(hash)}`); await sleep(1800); await helpers(); },
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
const SCRIPT = {
  's1-queue': async () => { await act.wait(2500); await act.point('8 orders need you'); await act.wait(3000); await act.point('Open incident: empty pickup'); await act.wait(4000);
    await act.point('Agent handling'); await act.wait(2500); await act.point('On track'); },
  's2-score': async () => { await act.click('Helsinki', 'li, [data-i], article'); await act.wait(1500); await act.point('Confidence'); await act.wait(3500);
    await act.point('Readiness'); await act.wait(5000); await act.point('Why you need to look'); },
  's3-agent': async () => { await act.scrollTo('Agent suggests'); await act.point('Reassign driver'); await act.wait(5000);
    await act.scrollTo('What the agent did'); await act.point('Asked the driver'); await act.wait(3500); await act.point('Asked the pickup site'); await act.wait(3000);
    await act.point('Ranked other drivers'); await act.wait(2500); await act.scrollTo('Agent suggests'); await act.point('customer message is drafted'); },
  's4-driver': async () => { await act.hash('#CD-420452'); await act.point('Why you need to look'); await act.wait(4000);
    await act.scrollTo('Better-matched drivers'); await act.point('Oliver Karvenby'); await act.wait(3000); await act.point('Lucas Enverell'); },
  's5-route': async () => { await act.hash('#CD-421102'); await act.point('No ferry booked'); await act.wait(4500);
    await act.point('If nothing is done'); await act.wait(2500); await act.point('If you approve (new ETA)'); await act.wait(3000);
    await act.scrollTo('Route & road', 'start'); await act.point('Tallinn → Helsinki'); await act.wait(2500); await act.point('Charge at'); },
  's6-approve': async () => { await act.scrollTo('Agent suggests', 'center'); await act.click('Approve', 'button'); await act.wait(3000);
    await act.scrollTo('What happened', 'start'); await act.click('Source', 'button, a, span'); },
  's7-close': async () => { await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); await act.goto('#CD-420593'); await act.click('FI', 'button');
    await act.wait(5000); await act.scrollTo('Agentti', 'center'); await act.wait(4000); await act.click('EN', 'button'); },
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
