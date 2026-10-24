// Finnish for text that arrives in English: dataset records (alerts, tasks, events),
// source labels and agent step summaries. Each string is translated once by the model
// and cached in data/i18n-fi.json, which ships with the repo. Messages between people
// are never translated; they stay in the language they were written in.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'i18n-fi.json');
const dict = (() => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } })();
const missing = new Set();

// Finnish for an English string, or null (and remember it for the next translation pass).
export function fiOf(en) {
  if (!en || typeof en !== 'string') return null;
  if (en in dict) return dict[en];
  missing.add(en);
  return null;
}

let running = null;
// Translate what is missing in batches; one pass at a time.
export function translateMissing(translate) {
  if (running || !missing.size) return running;
  running = (async () => {
    try {
      while (missing.size) {
        const batch = [...missing].slice(0, 40);
        batch.forEach((s) => missing.delete(s));
        try {
          const out = await translate(batch);
          batch.forEach((s, i) => { if (out[i]) dict[s] = out[i]; });
          fs.writeFileSync(FILE, JSON.stringify(dict, null, 1));
        } catch (e) {
          console.log(`Translation batch failed: ${e.message.slice(0, 120)}`);
        }
      }
    } finally { running = null; }
  })();
  return running;
}

export const pendingCount = () => missing.size;
