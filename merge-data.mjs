// Fuehrt die gerade gescannten Daten mit dem Stand auf GitHub zusammen.
// Git kann JSON nicht mischen: Laeuft ein zweiter Scan, waehrend der erste noch nicht
// gepusht war, gingen dessen Treffer sonst verloren (genau das ist am 25.09. passiert).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const REF = process.argv[2] || 'origin/main';

function fromGit(name) {
  try { return JSON.parse(execFileSync('git', ['show', `${REF}:data/${name}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })); }
  catch { return null; }
}
const readLocal = (name, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')); } catch { return fallback; } };

const time = l => Date.parse(l?.lastSeen || l?.firstSeen || 0) || 0;

// Neuerer Eintrag gewinnt; Felder, die nur der aeltere hat, bleiben erhalten.
function mergeLead(a, b) {
  const [older, newer] = time(a) <= time(b) ? [a, b] : [b, a];
  const out = { ...older, ...newer };
  out.searches = [...new Set([...(a.searches || []), ...(b.searches || [])])];
  if (newer.reviews == null && older.reviews != null) out.reviews = older.reviews;
  const wa = Date.parse(a.web?.checkedAt || 0) || 0, wb = Date.parse(b.web?.checkedAt || 0) || 0;
  out.web = wa >= wb ? (a.web ?? b.web) : (b.web ?? a.web);
  out.note = newer.note || older.note || '';
  out.starred = newer.starred || older.starred || false;
  if (newer.status === 'neu' && older.status && older.status !== 'neu') out.status = older.status;
  out.socials = { ...(older.socials || {}), ...(newer.socials || {}) };
  return out;
}

const leads = readLocal('leads.json', {});
const remoteLeads = fromGit('leads.json');
let added = 0, merged = 0;
if (remoteLeads) {
  for (const [id, r] of Object.entries(remoteLeads)) {
    if (leads[id]) { leads[id] = mergeLead(leads[id], r); merged++; }
    else { leads[id] = r; added++; }
  }
}

const searches = readLocal('searches.json', []);
const remoteSearches = fromGit('searches.json') || [];
const byId = new Map(searches.map(s => [s.id, s]));
for (const s of remoteSearches) if (!byId.has(s.id)) byId.set(s.id, s);
const allSearches = [...byId.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

fs.writeFileSync(path.join(DIR, 'leads.json'), JSON.stringify(leads));
fs.writeFileSync(path.join(DIR, 'searches.json'), JSON.stringify(allSearches));
console.log(`Zusammengeführt mit ${REF}: ${Object.keys(leads).length} Leads (${added} übernommen, ${merged} abgeglichen), ${allSearches.length} Suchen`);
