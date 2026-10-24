// Where the app may write. Locally that is data/ (as before). On Vercel the app folder is
// read-only, so state lives in the temp folder: the shipped file is copied there on first
// use and changes stay for the life of that server instance.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const onVercel = Boolean(process.env.VERCEL);
const STATE_DIR = onVercel ? path.join(os.tmpdir(), 'bahndesk') : DATA_DIR;

export function statePath(name) {
  const p = path.join(STATE_DIR, name);
  if (onVercel && !fs.existsSync(p)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const shipped = path.join(DATA_DIR, name);
    if (fs.existsSync(shipped)) fs.copyFileSync(shipped, p);
  }
  return p;
}

export function readJsonState(name, fallback) {
  try { return JSON.parse(fs.readFileSync(statePath(name), 'utf8')); } catch { return fallback; }
}

export function writeJsonState(name, value) {
  try { fs.writeFileSync(statePath(name), JSON.stringify(value, null, 1)); } catch {}
}
