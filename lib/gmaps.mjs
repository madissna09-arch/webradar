// Google-Maps-Suche ohne API-Schluessel.
// Die Maps-Seite laedt ihre Treffer ueber /search?tbm=map&pb=... nach; genau diesen
// Aufruf machen wir nach. Die Antwort ist JSON mit einem )]}'-Praefix davor.
// SOCS=CAI ist die Einstellung "Alle ablehnen" im Cookie-Hinweis von Google.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'de-DE,de;q=0.9', Cookie: 'SOCS=CAI' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

export class GoogleBlockedError extends Error {}

async function get(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000) });
  if (res.status === 429 || res.url.includes('/sorry/')) throw new GoogleBlockedError('Google bremst gerade (zu viele Anfragen). In ein paar Minuten nochmal.');
  if (!res.ok) throw new Error(`Google antwortet mit HTTP ${res.status}`);
  return res.text();
}

// Holt die interne Such-URL, die die Maps-Seite selbst benutzen wuerde.
async function searchUrl(query) {
  const html = await get('https://www.google.com/maps/search/' + encodeURIComponent(query) + '?hl=de');
  const m = html.match(/href="(\/search\?tbm=map[^"]+)"/);
  if (!m) {
    if (html.includes('consent.google')) throw new GoogleBlockedError('Google zeigt eine Einwilligungsseite statt Ergebnissen.');
    throw new Error('Google-Maps-Antwort hat ein unbekanntes Format.');
  }
  return 'https://www.google.com' + m[1].replace(/&amp;/g, '&');
}

function parse(text) {
  return JSON.parse(text.slice(text.indexOf('\n') + 1));
}

// Zieht einen Ort aus dem Roh-Array. Die Indizes sind empirisch ermittelt
// (Stand September 2026) — wenn Google umbaut, ist hier zuerst nachzusehen.
export function toPlace(p) {
  if (!Array.isArray(p) || typeof p[11] !== 'string') return null;
  const raw = JSON.stringify(p);
  const hours = [];
  try {
    for (const d of p[203]?.[0] || []) {
      if (Array.isArray(d) && typeof d[0] === 'string') hours.push(`${d[0]}: ${(d[3] || []).map(x => x[0]).join(', ')}`);
    }
  } catch {}
  let reviews = p[4]?.[8];
  if (typeof reviews !== 'number') reviews = null;
  const cid = p[181]?.[5] || p[227]?.[0]?.[5] || null;
  return {
    placeId: p[78] || p[10],
    fid: p[10] || null,
    cid,
    name: p[11],
    category: (p[13] || [])[0] || '',
    categories: p[13] || [],
    address: p[39] || (p[2] || []).join(', '),
    city: p[166] || '',
    lat: p[9]?.[2] ?? null,
    lng: p[9]?.[3] ?? null,
    rating: typeof p[4]?.[7] === 'number' ? p[4][7] : null,
    reviews,
    website: p[7]?.[0] || null,
    phone: p[178]?.[0]?.[0] || null,
    phoneIntl: p[178]?.[0]?.[1]?.find?.(x => x[1] === 2)?.[0] || null,
    ownerClaimed: !!p[57]?.[1],
    booking: p[75]?.[0]?.[0]?.[5]?.[2]?.[0] || null,
    hours,
    permanentlyClosed: /Dauerhaft geschlossen/.test(raw),
    temporarilyClosed: /Vorübergehend geschlossen/.test(raw),
    mapsUrl: cid ? `https://maps.google.com/?cid=${cid}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p[18] || p[11])}`,
  };
}

// Liefert die Orte seitenweise (20 pro Seite) ueber einen Callback.
export async function search(query, pages, onPage) {
  const base = await searchUrl(query);
  const seen = new Set();
  let empty = 0;
  for (let i = 0; i < pages; i++) {
    const url = i === 0 ? base : base.replace('%217i20', '%217i20%218i' + i * 20);
    let list = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const d = parse(await get(url));
      list = (d[64] || []).map(e => toPlace(e?.[1])).filter(Boolean);
      // Eindeutige Suche (z.B. genauer Name) liefert statt einer Liste einen Einzeltreffer.
      if (!list.length && i === 0) {
        const single = toPlace(d[0]?.[1]?.[0]?.[14]);
        if (single) list = [single];
      }
      if (list.length) break;
      await sleep(1500);
    }
    const fresh = list.filter(p => !seen.has(p.placeId) && seen.add(p.placeId));
    await onPage(fresh, i + 1, pages);
    if (!list.length && ++empty >= 2) break;
    if (list.length && list.length < 20 && i > 0) break;
    await sleep(900 + Math.random() * 700);
  }
}

// Einzelabfrage fuer Felder, die in der Trefferliste fehlen (v.a. Anzahl Rezensionen).
export async function detail(place) {
  const base = await searchUrl(`${place.name}, ${place.address}`);
  const d = parse(await get(base));
  let p = toPlace(d[0]?.[1]?.[0]?.[14]);
  if (!p) p = (d[64] || []).map(e => toPlace(e?.[1])).find(x => x && x.placeId === place.placeId);
  return p;
}
