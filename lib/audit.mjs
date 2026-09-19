// Prueft eine Website und sagt in Klartext, was daran alt oder kaputt ist.
// Jeder Befund hat ein Gewicht; die Summe (max. 100) ist die "Website-Schwaeche".
// Je hoeher, desto groesser die Chance, dass der Betrieb eine neue Seite braucht.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const YEAR = new Date().getFullYear();

// Keine eigene Website, sondern ein Profil auf fremder Plattform.
const SOCIAL_HOSTS = {
  'facebook.com': 'Facebook', 'fb.com': 'Facebook', 'instagram.com': 'Instagram', 'tiktok.com': 'TikTok',
  'linktr.ee': 'Linktree', 'linkin.bio': 'Link-in-Bio', 'beacons.ai': 'Beacons', 'youtube.com': 'YouTube',
  'wa.me': 'WhatsApp', 'x.com': 'X', 'twitter.com': 'X',
};
const PLATFORM_HOSTS = {
  'salonkee.de': 'Salonkee', 'salonkee.com': 'Salonkee', 'planity.com': 'Planity', 'treatwell.de': 'Treatwell',
  'ivof.com': 'Branchenverzeichnis (ivof)', 'wantside.com': 'Branchenverzeichnis (Wantside)', 'booksy.com': 'Booksy',
  'fresha.com': 'Fresha', 'lieferando.de': 'Lieferando', 'wolt.com': 'Wolt', 'ubereats.com': 'Uber Eats',
  'speisekarte.de': 'Speisekarte.de', 'gelbeseiten.de': 'Gelbe Seiten', 'dasoertliche.de': 'Das Örtliche',
  'meinestadt.de': 'meinestadt.de', 'yelp.de': 'Yelp', 'tripadvisor.de': 'Tripadvisor', 'doctolib.de': 'Doctolib',
  'jameda.de': 'Jameda', 'business.site': 'Google-Website (abgeschaltet)', 'sites.google.com': 'Google Sites',
  'restaurantguru.com': 'Restaurant Guru', 'pizza.de': 'pizza.de', 'eatbu.com': 'eatbu', 'shore.com': 'Shore',
  'studiobookr.com': 'Studiobookr', 'terminland.de': 'Terminland', 'etermin.net': 'eTermin', 'foodbooking.com': 'Foodbooking',
  'order.store': 'Bestellplattform', 'dish.co': 'DISH', 'thefork.de': 'TheFork', 'opentable.de': 'OpenTable',
  'wwwcafe.de': 'Branchenverzeichnis (wwwcafe)', 'romantikrestaurants.com': 'Romantik-Restaurants-Verbund', 'golocal.de': 'golocal',
  'cylex.de': 'Cylex', '11880.com': '11880', 'werkenntdenbesten.de': 'WerkenntdenBESTEN', 'branchenbuch.meinestadt.de': 'meinestadt.de',
};
// Eigene Seite, aber auf der Subdomain eines Baukastens oder Gratis-Hosters.
const BUILDER_SUBDOMAINS = {
  'jimdosite.com': 'Jimdo', 'jimdo.com': 'Jimdo', 'jimdofree.com': 'Jimdo', 'wixsite.com': 'Wix', 'webnode.page': 'Webnode',
  'webnode.com': 'Webnode', 'site123.me': 'SITE123', 'weebly.com': 'Weebly', 'wordpress.com': 'WordPress.com',
  'blogspot.com': 'Blogger', 'de.tl': 'Gratis-Hoster (de.tl)', 'npage.de': 'npage', 'beepworld.de': 'Beepworld',
  'homepage.t-online.de': 't-online Homepage', 'strikingly.com': 'Strikingly', 'mystrikingly.com': 'Strikingly',
  'one.com': 'one.com', 'carrd.co': 'Carrd', 'godaddysites.com': 'GoDaddy', 'square.site': 'Square', 'webador.de': 'Webador',
};

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}
function matchHost(host, table) {
  for (const k of Object.keys(table)) if (host === k || host.endsWith('.' + k)) return table[k];
  return null;
}

// Ordnet die Google-Website-Angabe grob ein, bevor wir ueberhaupt laden.
export function classifyUrl(url) {
  if (!url) return { kind: 'none', label: 'Keine Website' };
  const host = hostOf(url);
  const social = matchHost(host, SOCIAL_HOSTS);
  if (social) return { kind: 'social', label: `Nur ${social}`, platform: social };
  const platform = matchHost(host, PLATFORM_HOSTS);
  if (platform) return { kind: 'platform', label: `Nur Plattform: ${platform}`, platform };
  const builder = matchHost(host, BUILDER_SUBDOMAINS);
  return { kind: 'site', builderSubdomain: builder };
}

async function load(url) {
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'de-DE,de;q=0.9' },
    redirect: 'follow', signal: AbortSignal.timeout(15000),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const ms = Date.now() - t0;
  let charset = (res.headers.get('content-type') || '').match(/charset=([\w-]+)/i)?.[1];
  if (!charset) charset = buf.subarray(0, 3000).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  let html;
  try { html = new TextDecoder(charset || 'utf-8').decode(buf); } catch { html = buf.toString('utf8'); }
  return { res, html, ms, bytes: buf.length };
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

// Social-Media-Profile und Kontaktwege aus dem Quelltext ziehen.
export function extractContacts(html, baseUrl = '') {
  const out = { instagram: null, facebook: null, tiktok: null, youtube: null, linkedin: null, whatsapp: null, emails: [] };
  const hrefs = [...html.matchAll(/href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)].map(m => (m[1] || m[2] || m[3]).replace(/&amp;/g, '&'));
  for (const h of hrefs) {
    let m;
    if (!out.instagram && (m = h.match(/instagram\.com\/([A-Za-z0-9_.]{2,30})\/?(?:[?#].*)?$/i)) && !/^(p|reel|explore|accounts|stories|share)$/i.test(m[1])) out.instagram = m[1];
    else if (!out.facebook && (m = h.match(/facebook\.com\/((?:pages\/)?[A-Za-z0-9_.\-/%]{2,80}?)\/?(?:[?#].*)?$/i)) && !/sharer|plugins|dialog|tr\b|share\.php|login/i.test(m[1])) out.facebook = 'https://www.facebook.com/' + m[1];
    else if (!out.tiktok && (m = h.match(/tiktok\.com\/@([A-Za-z0-9_.]{2,30})/i))) out.tiktok = m[1];
    else if (!out.youtube && /youtube\.com\/(channel|c|@|user)/i.test(h)) out.youtube = h;
    else if (!out.linkedin && /linkedin\.com\/(company|in)\//i.test(h)) out.linkedin = h;
    else if (!out.whatsapp && (m = h.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\+?\d{6,15})/i))) out.whatsapp = m[1];
    if ((m = h.match(/^mailto:([^?]+)/i))) {
      const e = decodeURIComponent(m[1]).trim().toLowerCase();
      if (e.includes('@') && !out.emails.includes(e)) out.emails.push(e);
    }
  }
  // Mailadressen, die nur als Text dastehen (haeufig im Impressum-Footer).
  for (const m of stripTags(html).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    const e = m[0].toLowerCase();
    if (!/\.(png|jpe?g|gif|webp|svg)$/.test(e) && !/sentry|wixpress|example\./.test(e) && !out.emails.includes(e)) out.emails.push(e);
  }
  out.emails = out.emails.slice(0, 3);
  return out;
}

function detectTech(html, headers) {
  const tech = [];
  const gen = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']generator["']/i)?.[1];
  if (gen) tech.push(gen.trim());
  if (/wp-content|wp-includes/i.test(html) && !/wordpress/i.test(gen || '')) tech.push('WordPress');
  if (/static\.parastorage|wix\.com/i.test(html) && !tech.some(t => /wix/i.test(t))) tech.push('Wix');
  if (/jimdo/i.test(html) && !tech.some(t => /jimdo/i.test(t))) tech.push('Jimdo');
  if (/squarespace/i.test(html) && !tech.some(t => /squarespace/i.test(t))) tech.push('Squarespace');
  if (/typo3/i.test(html) && !tech.some(t => /typo3/i.test(t))) tech.push('TYPO3');
  if (/\/media\/jui\/|joomla/i.test(html) && !tech.some(t => /joomla/i.test(t))) tech.push('Joomla');
  if (/cdn\.shopify|shopify/i.test(html) && !tech.some(t => /shopify/i.test(t))) tech.push('Shopify');
  if (/webnode/i.test(html)) tech.push('Webnode');
  if (/mywebsite|ionos|1und1|diy\.s-cdn/i.test(html)) tech.push('IONOS-Baukasten');
  if (/strato-editor|strato/i.test(html) && /baukasten|sitebuilder/i.test(html)) tech.push('STRATO-Baukasten');
  const php = headers.get('x-powered-by');
  if (php) tech.push(php);
  return [...new Set(tech)];
}

// Manche Seiten verlinken Impressum/Datenschutz nur per Skript. Bevor wir "fehlt" behaupten,
// die ueblichen Adressen direkt probieren — ein falscher Vorwurf im Gespraech waere peinlich.
async function subpageExists(base, paths, mustContain) {
  for (const p of paths) {
    try {
      const r = await fetch(new URL('/' + p, base), { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(6000) });
      if (r.ok && mustContain.test(await r.text())) return true;
    } catch {}
  }
  return false;
}

// Hauptfunktion. Gibt immer ein Ergebnis zurueck, auch wenn die Seite tot ist.
export async function auditSite(url) {
  const pre = classifyUrl(url);
  if (pre.kind !== 'site') return { status: pre.kind, label: pre.label, weakness: pre.kind === 'none' ? 100 : 90, findings: [], contacts: null };

  const findings = [];
  const add = (weight, key, text, detail) => findings.push({ weight, key, text, detail });

  let r, finalUrl = url;
  try {
    r = await load(url);
    finalUrl = r.res.url || url;
  } catch (e) {
    // http:// probieren, falls https:// an einem kaputten Zertifikat scheitert (oder umgekehrt).
    const alt = url.startsWith('https://') ? url.replace('https://', 'http://') : url.replace('http://', 'https://');
    try {
      r = await load(alt);
      finalUrl = r.res.url || alt;
      if (alt.startsWith('http://')) add(15, 'cert', 'SSL-Zertifikat kaputt', 'Über https:// kommt ein Fehler, nur die unsichere Variante lädt.');
    } catch (e2) {
      const why = /ENOTFOUND|getaddrinfo/i.test(String(e2.cause?.code || e2.cause || e2)) ? 'Domain existiert nicht mehr (DNS)' : /timeout|abort/i.test(String(e2.name + e2.message)) ? 'Seite lädt nicht (Zeitüberschreitung)' : 'Seite nicht erreichbar';
      return { status: 'broken', label: 'Website kaputt', weakness: 100, findings: [{ weight: 100, key: 'down', text: why, detail: String(e2.cause?.code || e2.message).slice(0, 120) }], contacts: null, finalUrl: url };
    }
  }

  // Meta-Refresh-Weiterleitung (altmodisch, aber verbreitet) einmal folgen.
  const refresh = r.html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']?\s*\d+\s*;\s*url=([^"'>\s]+)/i)?.[1];
  if (refresh && stripTags(r.html).length < 500) {
    try {
      const next = new URL(refresh, finalUrl).href;
      r = await load(next);
      finalUrl = r.res.url || next;
    } catch {}
  }

  const { res, html, ms, bytes } = r;
  const text = stripTags(html);

  if (/domain default page|default webpage generated|apache2? (ubuntu|debian)? ?default page|welcome to nginx|it works!|iis windows server|account (has been )?suspended|index of \/|diese domain wurde (soeben )?registriert|webhosting-paket ist aktiviert|dieser webspace ist (noch )?nicht eingerichtet/i.test(`${html.slice(0, 3000)}`) && text.length < 2000) {
    return { status: 'broken', label: 'Nur Server-Platzhalter', weakness: 95, findings: [{ weight: 95, key: 'parked', text: 'Unter der Adresse liegt nur eine Standardseite des Hosters', detail: text.slice(0, 140) }], contacts: null, finalUrl };
  }
  const lower = html.toLowerCase();

  if (res.status >= 400 && new URL(finalUrl).pathname.length > 1) {
    // Google verlinkt oft auf eine Unterseite, die es nicht mehr gibt — dann die Startseite pruefen.
    const root = new URL('/', finalUrl).href;
    try {
      const r2 = await load(root);
      if (r2.res.status < 400) {
        const inner = await auditSite(root);
        inner.findings.unshift({ weight: 20, key: 'deadlink', text: `Google-Eintrag führt auf eine Fehlerseite (HTTP ${res.status})`, detail: finalUrl });
        inner.weakness = Math.min(100, inner.weakness + 20);
        inner.status = inner.weakness >= 45 ? 'outdated' : inner.weakness >= 20 ? 'weak' : 'good';
        inner.label = inner.weakness >= 45 ? 'Veraltete Website' : inner.weakness >= 20 ? 'Website mit Mängeln' : 'Ordentliche Website';
        return inner;
      }
    } catch {}
  }
  if (res.status >= 400) {
    return { status: 'broken', label: 'Website kaputt', weakness: 100, findings: [{ weight: 100, key: 'http', text: `Fehlerseite (HTTP ${res.status})`, detail: finalUrl }], contacts: extractContacts(html), finalUrl };
  }
  if (/domain (is|steht) (for sale|zum verkauf)|diese domain (kaufen|steht)|sedoparking|parkingcrew|bodis\.com|dan\.com|domain parked|this domain may be for sale|hier entsteht (eine neue|in kürze)|under construction|website coming soon|baustelle/i.test(text.slice(0, 4000)) && text.length < 3000) {
    return { status: 'broken', label: 'Nur Platzhalter / geparkt', weakness: 95, findings: [{ weight: 95, key: 'parked', text: 'Domain geparkt oder nur „Baustelle“-Seite', detail: text.slice(0, 140) }], contacts: extractContacts(html), finalUrl };
  }
  const redirectedHost = hostOf(finalUrl);
  const redirSocial = matchHost(redirectedHost, SOCIAL_HOSTS) || matchHost(redirectedHost, PLATFORM_HOSTS);
  if (redirSocial) return { status: 'platform', label: `Domain leitet nur auf ${redirSocial} weiter`, weakness: 90, findings: [], contacts: null, finalUrl };

  // Seiten, die ihren Inhalt erst per JavaScript nachladen (Bestellsysteme, Baukasten-Apps):
  // Impressum, Text und Telefonlink stehen dann nicht im Quelltext — nicht als Mangel werten.
  const jsApp = /ng-app|data-reactroot|href=["']?[^"'>]*\{\{|id=["']?(q-app|app|root|__next|__nuxt|___gatsby|svelte)["'\s>]/i.test(html);
  const spa = /<script[^>]+src=/i.test(html) && ((jsApp && text.length < 3000) || text.length < 150);
  if (spa) add(0, 'spa', 'Inhalt wird per JavaScript geladen', 'Impressum, Texte und Telefonlink konnten nicht geprüft werden – im Browser ansehen.');

  // --- Technik & Mobil
  if (!finalUrl.startsWith('https://')) add(15, 'https', 'Keine verschlüsselte Verbindung', 'Chrome zeigt „Nicht sicher“ neben der Adresse.');
  if (!/<meta[^>]+name=["']?viewport["']?[^>]*width\s*=\s*device-width/i.test(html)) add(25, 'viewport', 'Nicht fürs Handy gebaut', 'Kein Viewport-Tag: auf dem Handy herausgezoomt und winzig.');
  if (/<frameset|<frame\s/i.test(html)) add(15, 'frames', 'Frames-Technik aus den 90ern', null);
  if (/\.swf["'?]|application\/x-shockwave-flash/i.test(html)) add(15, 'flash', 'Flash-Inhalte (laufen seit 2021 nirgends mehr)', null);
  const fontTags = (html.match(/<font[\s>]/gi) || []).length;
  const layoutTables = (html.match(/<table[^>]+(width|bgcolor|cellpadding)=/gi) || []).length;
  if (fontTags > 3 || layoutTables > 2 || /<marquee|<center>/i.test(html)) add(12, 'oldhtml', 'Veralteter Seitenaufbau', `${fontTags ? fontTags + '× <font>' : ''}${layoutTables ? (fontTags ? ', ' : '') + layoutTables + '× Tabellen-Layout' : ''}`.trim() || '<marquee>/<center>');
  const jq = html.match(/jquery[.-]?(\d)\.(\d+)(?:\.\d+)?(?:\.min)?\.js/i);
  if (jq && (+jq[1] < 2 && +jq[2] < 12)) add(5, 'jquery', `Uralte Script-Bibliothek (jQuery ${jq[1]}.${jq[2]})`, null);

  if (/<!doctype html public "-\/\/w3c\/\/dtd (x?html) ([\d.]+)/i.test(html.slice(0, 600))) {
    const m = html.slice(0, 600).match(/dtd (x?html) ([\d.]+)/i);
    add(10, 'doctype', `Alter Seitenstandard (${m[1].toUpperCase()} ${m[2]})`, 'Typisch für Seiten von vor 2012.');
  }
  const tech = detectTech(html, res.headers);
  const php = tech.join(' ').match(/PHP\/(\d)\.(\d+)/i);
  if (php && (+php[1] < 7 || (+php[1] === 7 && +php[2] < 4))) add(8, 'php', `Server-Software veraltet (PHP ${php[1]}.${php[2]})`, 'Bekommt keine Sicherheitsupdates mehr.');
  const wp = tech.join(' ').match(/WordPress (\d+)\.(\d+)/i);
  if (wp && +wp[1] < 5) add(8, 'cms', `WordPress ${wp[1]}.${wp[2]} — seit Jahren ohne Updates`, 'Sicherheitsrisiko.');
  const joomla = tech.join(' ').match(/Joomla!? ?(\d)\.(\d)/i);
  if (joomla && +joomla[1] < 4) add(8, 'cms', `Joomla ${joomla[1]}.${joomla[2]} — nicht mehr unterstützt`, null);

  const pre2 = classifyUrl(finalUrl);
  if (pre2.builderSubdomain || pre.builderSubdomain) add(15, 'subdomain', `Keine eigene Domain (${pre2.builderSubdomain || pre.builderSubdomain})`, redirectedHost);
  else if (tech.some(t => /jimdo|wix|webnode|ionos-baukasten|strato-baukasten|site123|weebly/i.test(t))) add(4, 'builder', `Baukasten-Seite (${tech.find(t => /jimdo|wix|webnode|ionos|strato|site123|weebly/i.test(t))})`, null);

  // --- Alter
  const years = [...text.matchAll(/(?:©|&copy;|copyright|\(c\))\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map(m => +m[1]).filter(y => y <= YEAR);
  const copyrightYear = years.length ? Math.max(...years) : null;
  const lastMod = res.headers.get('last-modified');
  const lastModYear = lastMod ? new Date(lastMod).getFullYear() : null;
  const ageYear = copyrightYear || (lastModYear && lastModYear < YEAR - 1 ? lastModYear : null);
  if (ageYear && ageYear <= YEAR - 4) add(15, 'age', `Seit ${ageYear} nicht mehr aktualisiert`, copyrightYear ? `Copyright-Vermerk © ${copyrightYear}` : `Server meldet letzte Änderung ${lastMod}`);
  else if (ageYear && ageYear <= YEAR - 2) add(6, 'age', `Zuletzt ${ageYear} aktualisiert`, copyrightYear ? `© ${copyrightYear}` : null);

  // --- Tempo & Inhalt
  if (ms > 4000) add(10, 'slow', `Lädt langsam (${(ms / 1000).toFixed(1)} s nur für den Text)`, null);
  if (!spa && text.length < 400) add(8, 'thin', 'Kaum Inhalt auf der Startseite', `${text.length} Zeichen Text`);
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  if (!title || /^(home|startseite|willkommen|index|untitled|neue seite)$/i.test(title)) add(5, 'title', 'Kein aussagekräftiger Seitentitel', title ? `„${title}“` : 'fehlt');
  const desc = html.match(/<meta[^>]+(?:name|property)=["']?description["']?[^>]+content=(?:"([^"]*)"|'([^']*)')/i)?.slice(1).find(Boolean);
  if (!desc || desc.trim().length < 30) add(5, 'desc', 'Keine Google-Beschreibung (Meta-Description)', null);
  if (!spa && !/href=["']?tel:/i.test(html)) add(5, 'tel', 'Telefonnummer nicht antippbar', 'Kein tel:-Link.');
  if (!/application\/ld\+json/i.test(html)) add(3, 'schema', 'Keine strukturierten Daten für Google', null);
  if (/<a[^>]+href=["'][^"']*(speise|karte|menu|preis|leistung)[^"']*\.pdf/i.test(html)) add(5, 'pdf', 'Speisekarte/Preisliste nur als PDF', null);

  // --- Rechtliches (in Deutschland ein echtes Argument)
  if (!spa && !/impressum|imprint/i.test(lower) && !(await subpageExists(finalUrl, ['impressum', 'impressum.html', 'impressum.php', 'imprint'], /impressum|angaben gem|§\s*5/i))) add(12, 'impressum', 'Kein Impressum gefunden', 'Abmahnfähig.');
  if (!spa && !/datenschutz|privacy/i.test(lower) && !(await subpageExists(finalUrl, ['datenschutz', 'datenschutz.html', 'datenschutzerklaerung', 'privacy'], /datenschutz|dsgvo/i))) add(8, 'privacy', 'Keine Datenschutzerklärung gefunden', 'Abmahnfähig.');
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(html)) add(5, 'gfonts', 'Google Fonts extern eingebunden (DSGVO)', 'Dafür wurden Betriebe abgemahnt.');

  const weakness = Math.min(100, findings.reduce((s, f) => s + f.weight, 0));
  findings.sort((a, b) => b.weight - a.weight);
  let label = weakness >= 45 ? 'Veraltete Website' : weakness >= 20 ? 'Website mit Mängeln' : 'Ordentliche Website';

  return {
    status: weakness >= 45 ? 'outdated' : weakness >= 20 ? 'weak' : 'good',
    label, weakness, findings, finalUrl,
    tech, copyrightYear, loadMs: ms, htmlKb: Math.round(bytes / 1024), title,
    contacts: extractContacts(html, finalUrl),
  };
}
