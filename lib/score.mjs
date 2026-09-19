// Lead-Score 0-100: Wie lohnend ist es, diesen Betrieb anzusprechen?
//   Bedarf (max 50)       — keine/kaputte/alte Website
//   Substanz (max 30)     — viele Rezensionen + gute Bewertung = laufender Laden mit Budget
//   Erreichbarkeit (20)   — Telefon, Social-Profil, Mail

const CHAINS = /\b(mcdonald|burger king|subway|kfc|starbucks|vapiano|domino|pizza hut|dm-drogerie|rossmann|klier|essanelle|super ?cuts|hairkiller|cut ?& ?color|fielmann|apollo|backwerk|kamps|ditsch|l'osteria|hans im gl|block house|nordsee|edeka|rewe|aldi|lidl|netto|penny|kaufland|tchibo|douglas|thalia|deichmann|kik|takko|mcfit|fitx|clever fit|john reed|holmes place|sixt|europcar|volksbank|sparkasse|commerzbank|deutsche bank|postbank|telekom|vodafone|o2 shop|aral|shell|esso|jet tankstelle|mediamarkt|saturn|ikea|obi|hornbach|bauhaus|toom|hagebau|decathlon|h&m|zara|primark|c&a|tedi|woolworth|nanu-nana|depot|butlers|burgerme)\b/i;

// Websites grosser Ketten/Konzerne. Filialseiten erkennt man ausserdem am Pfad (/filiale/…, /standorte/…).
const CHAIN_HOSTS = /(^|\.)(atu\.de|pitstop\.de|euromaster\.de|vergoelst\.de|boschcarservice\.com|kroschke\.de|allianceautomotive\.de|gutachterdigital\.de|dekra\.de|tuev-nord\.de|tuvsud\.com|gtue\.de|point-s\.de|premio\.de|carglass\.de|autoglas-?\w*\.de|driver-center\.de|reifen\.com|fielmann\.de|apollo\.de|klier\.de|essanelle\.de|mcfit\.com|clever-fit\.com|fitx\.de|dm\.de|rossmann\.de|edeka\.de|rewe\.de|aldi-nord\.de|lidl\.de|netto-online\.de|penny\.de|kaufland\.de|backwerk\.de|mcdonalds\.com|burgerking\.de|subway\.com|kfc\.de|starbucks\.de|dominos\.de|vapiano\.com|sparkasse\.de|volksbank\w*\.de|[\w-]*\.audi|audi[\w-]*\.de|volkswagen\.de|mercedes-benz\.de|bmw\.de|toyota\.de|renault\.de|ford\.de|opel\.de|skoda-auto\.de|seat\.de|hyundai\.de|kia\.com|remax\.de|engelvoelkers\.com|von-poll\.com|allianz\.de|ergo\.de|huk\.de|lvm\.de|provinzial\.de|debeka\.de|signal-iduna\.de|deutsche-vermoegensberatung\.de|ottobock\.de)$/i;
const BRANCH_PATH = /\/(filiale|filialen|standort|standorte|branches?|niederlassung|locations?|haendler|werkstatt\/|stores?|agentur\/|vertretung)/i;

export function isChain(name, website) {
  if (CHAINS.test(name || '')) return true;
  if (!website) return false;
  try {
    const u = new URL(website);
    return CHAIN_HOSTS.test(u.hostname.replace(/^www\./, '')) || BRANCH_PATH.test(u.pathname);
  } catch { return false; }
}

export function score(lead) {
  const w = lead.web || {};
  let need = 0;
  switch (w.status) {
    case 'none': need = 50; break;
    case 'broken': need = 50; break;
    case 'social': need = 46; break;
    case 'platform': need = 42; break;
    case 'outdated': case 'weak': case 'good': need = Math.round((w.weakness || 0) / 2); break;
    default: need = lead.website ? 20 : 50; // noch nicht geprueft
  }
  let sub = 0;
  if (lead.reviews != null) sub += Math.min(20, Math.round(8 * Math.log10(lead.reviews + 1)));
  if (lead.rating != null) sub += lead.rating >= 4.5 ? 10 : lead.rating >= 4.0 ? 6 : lead.rating >= 3.5 ? 3 : 0;
  let reach = 0;
  if (lead.phone) reach += 12;
  const s = lead.socials || {};
  if (s.instagram || s.facebook || s.tiktok) reach += 5;
  if ((s.emails || []).length) reach += 3;

  let total = need + sub + reach;
  const flags = [];
  if (isChain(lead.name, lead.website) || lead.multiSite) { total -= 40; flags.push('Kette/Filiale'); }
  if (lead.permanentlyClosed) { total = 0; flags.push('Dauerhaft geschlossen'); }
  if (lead.temporarilyClosed) { total -= 20; flags.push('Vorübergehend geschlossen'); }
  total = Math.max(0, Math.min(100, total));
  return { score: total, tier: total >= 70 ? 'hot' : total >= 45 ? 'warm' : 'cold', parts: { need, sub, reach }, flags };
}
