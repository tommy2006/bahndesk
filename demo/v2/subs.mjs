// Builds subtitles.srt from the voice's word timings, using the script text for punctuation.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const PAD = 0.8, MAX = 74;
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const ts = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };

const scenes = JSON.parse(fs.readFileSync(path.join(DIR, 'scenes.json'), 'utf8'));
const cues = []; let offset = 0;
for (const s of scenes) {
  const words = JSON.parse(fs.readFileSync(path.join(DIR, `${s.id}.words.json`), 'utf8'));
  // Give every script token the time span of the spoken words that match it.
  const tokens = s.text.split(/\s+/).map((t) => ({ t, start: null, end: null }));
  let ti = 0, acc = '';
  for (const w of words) {
    const nw = norm(w.w);
    if (!nw) continue;
    while (ti < tokens.length && !norm(tokens[ti].t)) ti++;
    if (ti >= tokens.length) break;
    const tok = tokens[ti];
    tok.start ??= w.start; tok.end = w.end;
    acc += nw;
    if (acc.length >= norm(tok.t).length) { ti++; acc = ''; }
  }
  // Fill any unmatched token times from neighbours.
  tokens.forEach((t, i) => { if (t.start == null) { const p = tokens[i - 1]; t.start = p ? p.end : 0; t.end = t.start; } });
  // Group into cues: break at sentence ends, or at a comma / word boundary when the line gets long.
  let cur = [];
  const flush = () => { if (cur.length) cues.push({ start: offset + cur[0].start, end: offset + cur.at(-1).end, text: cur.map((x) => x.t).join(' ') }); cur = []; };
  for (const t of tokens) {
    const len = cur.map((x) => x.t).join(' ').length;
    if (cur.length && len + t.t.length + 1 > MAX) flush();
    cur.push(t);
    const L = cur.map((x) => x.t).join(' ').length;
    if (/[.?!:]$/.test(t.t) || (/,$/.test(t.t) && L > MAX * 0.55)) flush();
  }
  flush();
  offset += dur(path.join(DIR, `${s.id}.mp3`)) + PAD;
}
// Keep each cue on screen until just before the next one (max +0.6 s), and wrap long cues onto two lines.
const wrap = (s) => { if (s.length <= 42) return s; const mid = s.length / 2; let best = -1;
  for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? s : s.slice(0, best) + '\n' + s.slice(best + 1); };
const srt = cues.map((c, i) => { const next = cues[i + 1]; const end = Math.min(c.end + 0.6, next ? next.start - 0.05 : c.end + 0.6);
  return `${i + 1}\n${ts(c.start)} --> ${ts(Math.max(end, c.start + 0.8))}\n${wrap(c.text)}\n`; }).join('\n');
fs.writeFileSync(path.join(DIR, 'subtitles.srt'), srt, 'utf8');
console.log(cues.length, 'cues');
