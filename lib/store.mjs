// Alles liegt lokal in data/*.json. Kein Konto, keine Cloud.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
fs.mkdirSync(DIR, { recursive: true });

function read(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')); } catch { return fallback; }
}

export const db = {
  leads: read('leads.json', {}),
  searches: read('searches.json', []),
};

let timer = null;
export function flush() {
  clearTimeout(timer);
  for (const [name, data] of [['leads.json', db.leads], ['searches.json', db.searches]]) {
    const file = path.join(DIR, name);
    fs.writeFileSync(file + '.tmp', JSON.stringify(data));
    fs.renameSync(file + '.tmp', file);
  }
}
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 400);
}
