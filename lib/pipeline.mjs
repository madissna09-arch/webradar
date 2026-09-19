// Der eigentliche Scan: Google Maps → Rezensionen → Websites pruefen → Score.
// Wird vom lokalen Server (server.mjs) und von GitHub Actions (scan.mjs) benutzt.
import { search, detail, GoogleBlockedError } from './gmaps.mjs';
import { auditSite, classifyUrl } from './audit.mjs';
import { score } from './score.mjs';
import { db, save } from './store.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function socialsFrom(lead) {
  const s = { ...(lead.socials || {}) };
  const c = lead.web?.contacts;
  if (c) {
    for (const k of ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'whatsapp']) if (!s[k] && c[k]) s[k] = c[k];
    s.emails = [...new Set([...(s.emails || []), ...(c.emails || [])])].slice(0, 3);
  }
  const w = lead.website || '';
  let m;
  if (!s.instagram && (m = w.match(/instagram\.com\/([A-Za-z0-9_.]{2,30})/i))) s.instagram = m[1];
  if (!s.facebook && /facebook\.com\//i.test(w)) s.facebook = w;
  if (!s.tiktok && (m = w.match(/tiktok\.com\/@([A-Za-z0-9_.]{2,30})/i))) s.tiktok = m[1];
  return s;
}

export function refresh(lead) {
  lead.socials = socialsFrom(lead);
  Object.assign(lead, score(lead));
  return lead;
}

export function preWeb(url) {
  const pre = classifyUrl(url);
  return pre.kind === 'site' ? null : { status: pre.kind, label: pre.label, weakness: pre.kind === 'none' ? 100 : 90, findings: [] };
}

function upsert(place, searchId) {
  const old = db.leads[place.placeId];
  const lead = old
    ? { ...old, ...place, status: old.status, note: old.note, socials: old.socials, web: old.web, starred: old.starred }
    : { ...place, id: place.placeId, status: 'neu', note: '', socials: {}, web: null, starred: false, firstSeen: new Date().toISOString() };
  // Wenn Google inzwischen eine andere Website nennt, alte Pruefung verwerfen.
  if (old && old.website !== place.website) lead.web = null;
  if (lead.reviews == null && old?.reviews != null) lead.reviews = old.reviews;
  lead.searches = [...new Set([...(old?.searches || []), searchId])];
  lead.lastSeen = new Date().toISOString();
  if (!lead.web) lead.web = preWeb(lead.website);
  db.leads[lead.id] = refresh(lead);
  return lead;
}

function hostKey(url) {
  if (!url || classifyUrl(url).kind !== 'site') return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

export async function auditLead(l) {
  try { l.web = { ...(await auditSite(l.website)), checkedAt: new Date().toISOString() }; }
  catch (e) { l.web = { status: 'broken', label: 'Prüfung fehlgeschlagen', weakness: 60, findings: [{ weight: 60, key: 'err', text: 'Prüfung fehlgeschlagen', detail: e.message }], checkedAt: new Date().toISOString() }; }
  return refresh(l);
}

// job = { id, params: { branche, ort, tiefe }, cancelled }; emit(type, data) meldet Fortschritt.
export async function runScan(job, emit) {
  const { branche, ort, tiefe } = job.params;
  const query = `${branche} in ${ort}`;
  const found = [];
  if (!db.searches.some(s => s.id === job.id)) db.searches.unshift({ id: job.id, branche, ort, tiefe, at: new Date().toISOString(), status: 'läuft', count: 0 });
  const entry = db.searches.find(s => s.id === job.id);
  try {
    emit('log', `Suche „${query}“ auf Google Maps …`);
    await search(query, tiefe, async (places, page, pages) => {
      for (const p of places) {
        const lead = upsert(p, job.id);
        found.push(lead.id);
        emit('lead', lead);
      }
      emit('progress', { phase: 'maps', page, pages, found: found.length });
      emit('log', `Seite ${page}/${pages}: ${places.length} Betriebe`);
    });
    // Gleiche Website bei mehreren Treffern = Kette mit mehreren Standorten.
    const byHost = {};
    for (const id of found) { const h = hostKey(db.leads[id].website); if (h) (byHost[h] ||= []).push(id); }
    for (const ids of Object.values(byHost)) if (ids.length > 1) for (const id of ids) { db.leads[id].multiSite = true; emit('lead', refresh(db.leads[id])); }
    save();

    // Rezensionen nachladen, wo die Trefferliste sie nicht mitliefert. Langsam, damit Google nicht bremst.
    const missing = found.filter(id => db.leads[id].reviews == null).slice(0, 40);
    if (missing.length) emit('log', `Lade Rezensionszahlen für ${missing.length} Betriebe nach …`);
    let done = 0;
    for (const id of missing) {
      if (job.cancelled) break;
      try {
        const d = await detail(db.leads[id]);
        if (d?.reviews != null) { db.leads[id].reviews = d.reviews; emit('lead', refresh(db.leads[id])); }
      } catch (e) {
        if (e instanceof GoogleBlockedError) { emit('log', 'Google bremst — Rezensionen werden übersprungen.'); break; }
      }
      emit('progress', { phase: 'reviews', done: ++done, total: missing.length });
      await sleep(700 + Math.random() * 600);
    }

    // Websites pruefen (Ergebnis 3 Tage wiederverwenden).
    const toAudit = found.filter(id => { const l = db.leads[id]; return l.website && classifyUrl(l.website).kind === 'site' && !(l.web && l.web.checkedAt && Date.now() - Date.parse(l.web.checkedAt) < 3 * 864e5); });
    emit('log', `Prüfe ${toAudit.length} Websites …`);
    done = 0;
    await pool(toAudit, 5, async id => {
      if (job.cancelled) return;
      emit('lead', await auditLead(db.leads[id]));
      emit('progress', { phase: 'audit', done: ++done, total: toAudit.length });
    });
    entry.count = found.length; entry.status = 'fertig';
    save();
    const n = found.map(id => db.leads[id]);
    emit('log', `Fertig: ${n.filter(l => l.tier === 'hot').length} heiß, ${n.filter(l => ['none', 'social', 'platform'].includes(l.web?.status)).length} ohne eigene Website, ${n.filter(l => ['broken', 'outdated'].includes(l.web?.status)).length} kaputt/veraltet`);
    emit('done', { found: found.length });
    return found.length;
  } catch (e) {
    entry.status = 'fehler'; entry.count = found.length; entry.error = e.message;
    save();
    emit('error', e.message);
    throw e;
  }
}

// Beim Start: Einordnung und Score aller gespeicherten Leads nach aktuellen Regeln.
export function rescoreAll() {
  for (const l of Object.values(db.leads)) {
    const pre = preWeb(l.website);
    if (pre && (l.web?.status !== pre.status || l.web?.label !== pre.label)) l.web = pre;
    refresh(l);
  }
  save();
}
