// Writes the synthetic order files to samples/ (dates relative to today).
// The app also serves fresh copies at /api/samples/<name>.
import fs from 'node:fs';
import { SAMPLES } from '../lib/samples.mjs';

fs.mkdirSync('samples', { recursive: true });
for (const [name, s] of Object.entries(SAMPLES)) {
  fs.writeFileSync(`samples/${name}`, s.build(Date.now()));
  console.log(`samples/${name}`);
}
