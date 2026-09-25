// Alles, was der Radar über einen Betrieb weiß, in einem Rutsch — als Text für einen
// Menschen oder als JSON für ein Werkzeug.
//
//   node lead.mjs top                 die besten 10 Leads aus allen Suchen
//   node lead.mjs top 25 --such sXYZ  die besten 25 aus einer bestimmten Suche
//   node lead.mjs "Zum Drehspieß"     Steckbrief eines Betriebs (Name reicht, Teiltreffer)
//   node lead.mjs brief 10            Steckbriefe der besten 10 (für data/top-leads.md)
//   node lead.mjs top --json          maschinenlesbar
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const read = (n, f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, n), 'utf8')); } catch { return f; } };
const leads = Object.values(read('leads.json', {}));
const searches = read('searches.json', []);
const crm = read('crm.json', {});
for (const l of leads) Object.assign(l, crm[l.id] || {}, { socials: { ...(l.socials || {}), ...(crm[l.id]?.socials || {}) } });

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf('--' + n); return i < 0 ? null : args[i + 1]; };
const json = args.includes('--json');
const suchId = flag('such');
const rest = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--such');

const STATUS_TEXT = { neu: 'noch nicht angesprochen', kontaktiert: 'kontaktiert', interessiert: 'interessiert', termin: 'Termin vereinbart', kunde: 'Kunde', 'kein-interesse': 'kein Interesse' };

function pool() {
  let list = leads.filter(l => !l.hidden && !(l.flags || []).some(f => f === 'Kette/Filiale' || f === 'Dauerhaft geschlossen'));
  if (suchId) list = list.filter(l => (l.searches || []).includes(suchId));
  return list;
}

function steckbrief(l) {
  const s = l.socials || {};
  const w = l.web || {};
  const zeilen = [
    `# ${l.name}`,
    '',
    `**Was**: ${(l.categories || [l.category]).filter(Boolean).join(', ')}`,
    `**Adresse**: ${l.address}`,
    `**Telefon**: ${l.phone || 'keins hinterlegt'}${l.phoneIntl ? ` (international ${l.phoneIntl})` : ''}`,
    `**Google**: ${l.rating != null ? `${String(l.rating).replace('.', ',')} Sterne aus ${l.reviews ?? '?'} Bewertungen` : 'keine Bewertung'} — ${l.mapsUrl}`,
    `**Google-Profil**: ${l.ownerClaimed ? 'wird vom Inhaber gepflegt' : 'nicht vom Inhaber beansprucht'}`,
    `**Website laut Google**: ${l.website || 'keine'}`,
    `**Website-Urteil**: ${w.label || 'nicht geprüft'}${w.weakness != null ? ` (Schwäche ${w.weakness}/100)` : ''}`,
  ];
  if (w.findings?.length) {
    zeilen.push('', '**Was an der Seite fehlt oder alt ist**:');
    for (const f of w.findings) zeilen.push(`- ${f.text}${f.detail ? ` — ${f.detail}` : ''}`);
  }
  if (w.tech?.length || w.copyrightYear) zeilen.push('', `**Technik**: ${[...(w.tech || []), w.copyrightYear ? `Copyright ${w.copyrightYear}` : ''].filter(Boolean).join(', ')}`);
  const soc = [
    s.instagram && `Instagram https://www.instagram.com/${s.instagram}/`,
    s.facebook && `Facebook ${s.facebook}`,
    s.tiktok && `TikTok https://www.tiktok.com/@${s.tiktok}`,
    s.youtube && `YouTube ${s.youtube}`,
    s.whatsapp && `WhatsApp https://wa.me/${String(s.whatsapp).replace(/\D/g, '')}`,
    (s.emails || []).length && `E-Mail ${(s.emails || []).join(', ')}`,
  ].filter(Boolean);
  zeilen.push('', `**Social Media und Kontakt**: ${soc.length ? '' : 'nichts gefunden'}`);
  for (const x of soc) zeilen.push(`- ${x}`);
  if (l.booking) zeilen.push(`- Online-Buchung ${l.booking}`);
  if (l.hours?.length) { zeilen.push('', '**Öffnungszeiten**:'); for (const h of l.hours) zeilen.push(`- ${h}`); }
  zeilen.push('', `**Lage**: ${l.lat}, ${l.lng}`, `**Score**: ${l.score}/100 (${l.tier === 'hot' ? 'heiß' : l.tier === 'warm' ? 'warm' : 'kalt'}) — Bedarf ${l.parts?.need}, Substanz ${l.parts?.sub}, Erreichbarkeit ${l.parts?.reach}`, `**Stand bei uns**: ${STATUS_TEXT[l.status] || l.status}${l.note ? ` — Notiz: ${l.note}` : ''}`);
  if ((l.flags || []).length) zeilen.push(`**Achtung**: ${l.flags.join(', ')}`);
  return zeilen.join('\n');
}

if (rest[0] === 'top' || rest.length === 0) {
  const n = +rest[1] || 10;
  const list = pool().sort((a, b) => b.score - a.score || (b.reviews ?? 0) - (a.reviews ?? 0)).slice(0, n);
  if (json) { console.log(JSON.stringify(list, null, 2)); process.exit(0); }
  console.log(`Beste ${list.length} Leads${suchId ? ` aus Suche ${suchId}` : ''} (von ${pool().length} brauchbaren):\n`);
  for (const [i, l] of list.entries()) {
    console.log(`${String(i + 1).padStart(2)}. [${l.score}] ${l.name} — ${l.category}`);
    console.log(`    ${l.web?.label || 'ungeprüft'} · ${l.rating != null ? String(l.rating).replace('.', ',') + ' Sterne (' + (l.reviews ?? '?') + ')' : 'keine Bewertung'} · ${l.phone || 'kein Telefon'} · ${l.address}`);
  }
  console.log(`\nSteckbrief: node lead.mjs "${list[0]?.name}"`);
  console.log(`Suchen: ${searches.slice(0, 8).map(s => `${s.id} (${s.branche}, ${s.ort}, ${s.count})`).join(', ')}`);
  process.exit(0);
}

// Steckbriefe der besten N am Stück — landet nach jedem Scan als data/top-leads.md im Repo,
// damit auch ein Chat ohne Dateizugriff die Daten über den Pages-Link lesen kann.
if (rest[0] === 'brief') {
  const n = +rest[1] || 10;
  const list = pool().sort((a, b) => b.score - a.score || (b.reviews ?? 0) - (a.reviews ?? 0)).slice(0, n);
  console.log(`# Beste ${list.length} Leads — Webradar, Stand ${new Date().toISOString().slice(0, 10)}\n`);
  console.log('Quelle: Google-Maps-Eintrag und Prüfung der Website. Fotos und Texte sind **nicht** enthalten.\n');
  console.log(list.map(steckbrief).join('\n\n---\n\n'));
  process.exit(0);
}

const q = rest.join(' ').toLowerCase();
const treffer = leads.filter(l => l.id === rest[0] || l.name.toLowerCase().includes(q));
if (!treffer.length) { console.error(`Kein Betrieb gefunden für „${rest.join(' ')}“. Liste: node lead.mjs top`); process.exit(1); }
if (treffer.length > 1 && !json) console.log(`(${treffer.length} Treffer — hier alle)\n`);
console.log(json ? JSON.stringify(treffer.length === 1 ? treffer[0] : treffer, null, 2) : treffer.map(steckbrief).join('\n\n---\n\n'));
