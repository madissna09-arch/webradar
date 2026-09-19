// Webradar — findet Betriebe ohne oder mit alter Website.
// Start: node server.mjs   → http://localhost:4210
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detail } from './lib/gmaps.mjs';
import { auditSite, classifyUrl } from './lib/audit.mjs';
import { db, save } from './lib/store.mjs';
import { runScan, refresh, preWeb, auditLead, rescoreAll } from './lib/pipeline.mjs';

const PORT = +process.env.PORT || 4210;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');

// ---------- Suchauftraege mit Live-Stream (Server-Sent Events)

const jobs = new Map();

function emit(job, type, data) {
  const ev = { type, data };
  job.events.push(ev);
  for (const res of job.clients) res.write(`data: ${JSON.stringify(ev)}

`);
}

async function runJob(job) {
  try { await runScan(job, (type, data) => emit(job, type, data)); } catch {}
  for (const res of job.clients) res.end();
  job.finished = true;
  setTimeout(() => jobs.delete(job.id), 10 * 60 * 1000);
}

// ---------- CSV (Semikolon + BOM, damit Excel Umlaute und Spalten richtig liest)

function csv(leads) {
  const cols = [
    ['Name', l => l.name], ['Kategorie', l => l.category], ['Score', l => l.score], ['Stufe', l => ({ hot: 'Heiß', warm: 'Warm', cold: 'Kalt' })[l.tier]],
    ['Website-Status', l => l.web?.label || ''], ['Website', l => l.website || ''], ['Mängel', l => (l.web?.findings || []).map(f => f.text).join(' | ')],
    ['Bewertung', l => l.rating != null ? String(l.rating).replace('.', ',') : ''], ['Rezensionen', l => l.reviews ?? ''], ['Telefon', l => l.phone || ''], ['Adresse', l => l.address],
    ['Instagram', l => l.socials?.instagram ? 'https://instagram.com/' + l.socials.instagram : ''], ['Facebook', l => l.socials?.facebook || ''],
    ['TikTok', l => l.socials?.tiktok ? 'https://tiktok.com/@' + l.socials.tiktok : ''], ['E-Mail', l => (l.socials?.emails || []).join(', ')],
    ['Google Maps', l => l.mapsUrl], ['Status', l => l.status], ['Notiz', l => l.note || ''],
  ];
  const esc = v => { const s = String(v ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + [cols.map(c => c[0]).join(';'), ...leads.map(l => cols.map(c => esc(c[1](l))).join(';'))].join('\r\n');
}

// ---------- HTTP

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function json(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
async function body(req) { let b = ''; for await (const c of req) b += c; try { return JSON.parse(b || '{}'); } catch { return {}; } }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/state' && req.method === 'GET') return json(res, 200, { leads: Object.values(db.leads), searches: db.searches });

    if (p === '/api/jobs' && req.method === 'POST') {
      const { branche, ort, tiefe } = await body(req);
      if (!branche?.trim() || !ort?.trim()) return json(res, 400, { error: 'Branche und Ort angeben.' });
      const id = 's' + Date.now().toString(36);
      const job = { id, params: { branche: branche.trim(), ort: ort.trim(), tiefe: Math.max(1, Math.min(6, +tiefe || 3)) }, events: [], clients: new Set(), finished: false };
      jobs.set(id, job);
      runJob(job);
      return json(res, 200, { id });
    }

    let m;
    if ((m = p.match(/^\/api\/jobs\/([\w]+)\/stream$/))) {
      const job = jobs.get(m[1]);
      if (!job) return json(res, 404, { error: 'Auftrag unbekannt' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      for (const ev of job.events) res.write(`data: ${JSON.stringify(ev)}\n\n`);
      if (job.finished) return res.end();
      job.clients.add(res);
      req.on('close', () => job.clients.delete(res));
      return;
    }
    if ((m = p.match(/^\/api\/jobs\/([\w]+)\/cancel$/)) && req.method === 'POST') {
      const job = jobs.get(m[1]); if (job) job.cancelled = true;
      return json(res, 200, { ok: true });
    }

    if ((m = p.match(/^\/api\/leads\/(.+?)(\/rescan)?$/))) {
      const id = decodeURIComponent(m[1]);
      const lead = db.leads[id];
      if (!lead) return json(res, 404, { error: 'Lead unbekannt' });
      if (m[2] && req.method === 'POST') {
        if (lead.website && classifyUrl(lead.website).kind === 'site') await auditLead(lead);
        try { const d = await detail(lead); if (d) { for (const k of ['rating', 'reviews', 'phone', 'hours', 'permanentlyClosed', 'temporarilyClosed']) if (d[k] != null) lead[k] = d[k]; } } catch {}
        refresh(lead); save();
        return json(res, 200, lead);
      }
      if (req.method === 'PATCH') {
        const b = await body(req);
        for (const k of ['status', 'note', 'starred']) if (k in b) lead[k] = b[k];
        if (b.socials) lead.socials = { ...lead.socials, ...b.socials };
        if ('website' in b && b.website !== lead.website) {
          lead.website = b.website || null;
          lead.web = preWeb(lead.website);
          if (!lead.web) await auditLead(lead);
        }
        refresh(lead); save();
        return json(res, 200, lead);
      }
      if (req.method === 'DELETE') { delete db.leads[id]; save(); return json(res, 200, { ok: true }); }
    }

    if (p === '/api/export.csv') {
      const ids = url.searchParams.get('ids');
      const leads = ids ? ids.split(',').map(i => db.leads[i]).filter(Boolean) : Object.values(db.leads);
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="webradar-leads-${new Date().toISOString().slice(0, 10)}.csv"` });
      return res.end(csv(leads.sort((a, b) => b.score - a.score)));
    }

    // Vorschau: fremde Seite ueber uns laden, damit X-Frame-Options das iframe nicht blockiert.
    if (p === '/api/preview') {
      const target = url.searchParams.get('url');
      if (!/^https?:\/\//i.test(target || '')) { res.writeHead(400); return res.end('URL fehlt'); }
      try {
        const r = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36', 'Accept-Language': 'de-DE,de;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
        // Erlaubt die Seite das Einbetten, direkt dorthin weiterleiten — dann laufen ihre Skripte normal.
        const xfo = r.headers.get('x-frame-options');
        const csp = r.headers.get('content-security-policy') || '';
        if (!xfo && !/frame-ancestors/i.test(csp)) {
          r.body?.cancel().catch(() => {});
          res.writeHead(302, { Location: r.url || target, 'Cache-Control': 'no-store' });
          return res.end();
        }
        const buf = Buffer.from(await r.arrayBuffer());
        let cs = (r.headers.get('content-type') || '').match(/charset=([\w-]+)/i)?.[1] || buf.subarray(0, 3000).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8';
        let html; try { html = new TextDecoder(cs).decode(buf); } catch { html = buf.toString('utf8'); }
        const base = `<base href="${(r.url || target).replace(/"/g, '&quot;')}">`;
        html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + base) : base + html;
        html = html.replace(/<meta[^>]+http-equiv=["']?content-security-policy[^>]*>/gi, '');
        // CSP-Sandbox: die fremde Seite laeuft ohne unsere Herkunft und kommt nicht an die API.
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': 'sandbox allow-scripts' });
        return res.end(html);
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<body style="font:14px system-ui;padding:24px;color:#555">Seite lädt nicht: ${String(e.cause?.code || e.message).replace(/</g, '&lt;')}</body>`);
      }
    }

    if (p === '/api/audit' && req.method === 'POST') {
      const { url: u } = await body(req);
      if (!u) return json(res, 400, { error: 'URL fehlt' });
      return json(res, 200, await auditSite(/^https?:\/\//.test(u) ? u : 'https://' + u));
    }

    // Statische Dateien
    const file = path.join(PUBLIC, p === '/' ? 'index.html' : path.normalize(p).replace(/^([\\/])+/, ''));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: e.message });
  }
});

// Bewertungslogik kann sich aendern — beim Start alle gespeicherten Leads neu einstufen.
rescoreAll();

server.listen(PORT, '127.0.0.1', () => console.log(`Webradar läuft auf http://localhost:${PORT}`));
