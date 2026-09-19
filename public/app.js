(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const GH = window.GH?.active ? window.GH : null; // GitHub-Pages-Modus (siehe gh.js)
  const icon = (id, cls = '') => `<svg class="${cls}"><use href="#i-${id}"/></svg>`;

  const BRANCHEN = ['Friseur', 'Barbershop', 'Kosmetikstudio', 'Nagelstudio', 'Tattoostudio', 'Restaurant', 'Café', 'Imbiss', 'Döner', 'Pizzeria', 'Bäckerei', 'Eisdiele', 'Shisha Bar', 'Autowerkstatt', 'Reifenservice', 'Autohändler', 'Fahrschule', 'Elektriker', 'Sanitär Heizung', 'Malerbetrieb', 'Dachdecker', 'Tischlerei', 'Gebäudereinigung', 'Schlüsseldienst', 'Umzugsunternehmen', 'Blumenladen', 'Physiotherapie', 'Zahnarzt', 'Tierarzt', 'Hundesalon', 'Fitnessstudio', 'Yogastudio', 'Kampfsport', 'Hotel', 'Pension', 'Ferienwohnung', 'Optiker', 'Handyreparatur', 'Schneiderei', 'Änderungsschneiderei', 'Fotograf', 'Steuerberater', 'Rechtsanwalt', 'Hausmeisterservice', 'Gartenbau', 'Kiosk', 'Metzgerei', 'Feinkost', 'Juwelier'];
  const STATUS = [['neu', 'Neu'], ['kontaktiert', 'Kontaktiert'], ['interessiert', 'Interessiert'], ['termin', 'Termin'], ['kunde', 'Kunde'], ['kein-interesse', 'Kein Interesse']];
  const STATUS_LABEL = Object.fromEntries(STATUS);
  const WEB_GROUP = { none: 'none', social: 'social', platform: 'social', broken: 'broken', outdated: 'outdated', weak: 'weak', good: 'good' };

  const state = {
    leads: new Map(), searches: [], scope: 'all', web: 'all', tier: 'all', minReviews: 0, status: 'all', hideChains: true,
    q: '', sort: 'score', view: 'list', selected: null, job: null, pitchTab: 'dm', previewMode: 'phone',
  };
  const drafts = { note: {}, pitch: {} }; // ungespeicherte Eingaben ueberleben Live-Aktualisierungen
  try { Object.assign(state, JSON.parse(localStorage.getItem('webradar.ui') || '{}'), { selected: null, job: null, q: '' }); } catch {}
  const persistUi = () => { try { localStorage.setItem('webradar.ui', JSON.stringify({ scope: state.scope, web: state.web, tier: state.tier, minReviews: state.minReviews, status: state.status, hideChains: state.hideChains, sort: state.sort, view: state.view, pitchTab: state.pitchTab, previewMode: state.previewMode })); } catch {} };

  $('#branchen').innerHTML = BRANCHEN.map(b => `<option value="${b}">`).join('');
  $('#statusFilter').innerHTML = '<option value="all">Jeder Status</option>' + STATUS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

  // ---------- API
  const api = async (path, opts = {}) => {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2200);
  }

  async function load() {
    let leads, searches;
    if (GH) {
      await GH.loadCrm();
      const [map, s] = await Promise.all([GH.readJson('leads.json', {}), GH.readJson('searches.json', [])]);
      leads = Object.values(map).map(GH.applyCrm).filter(l => !l.hidden);
      searches = s;
      $('#ghBanner').hidden = !!GH.token();
    } else ({ leads, searches } = await api('/api/state'));
    state.leads = new Map(leads.map(l => [l.id, l]));
    state.searches = searches;
    if (state.scope !== 'all' && !searches.some(s => s.id === state.scope)) state.scope = 'all';
    renderScope(); render();
  }

  // ---------- Filtern
  function visible() {
    const q = state.q.trim().toLowerCase();
    let arr = [...state.leads.values()].filter(l => {
      if (state.scope !== 'all' && !(l.searches || []).includes(state.scope)) return false;
      if (state.web !== 'all' && WEB_GROUP[l.web?.status] !== state.web) return false;
      if (state.tier !== 'all' && l.tier !== state.tier) return false;
      if (state.minReviews && (l.reviews ?? 0) < state.minReviews) return false;
      if (state.status !== 'all' && l.status !== state.status) return false;
      if (state.hideChains && (l.flags || []).some(f => f === 'Kette/Filiale' || f === 'Dauerhaft geschlossen')) return false;
      if (q && !`${l.name} ${l.address} ${l.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const by = {
      score: (a, b) => b.score - a.score || (b.reviews ?? 0) - (a.reviews ?? 0),
      reviews: (a, b) => (b.reviews ?? -1) - (a.reviews ?? -1),
      rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviews ?? 0) - (a.reviews ?? 0),
      name: (a, b) => a.name.localeCompare(b.name, 'de'),
    }[state.sort];
    arr.sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || by(a, b));
    return arr;
  }

  function inScope() {
    return [...state.leads.values()].filter(l => (state.scope === 'all' || (l.searches || []).includes(state.scope)) && !(state.hideChains && (l.flags || []).some(f => f === 'Kette/Filiale' || f === 'Dauerhaft geschlossen')));
  }

  // ---------- Rendering
  function renderScope() {
    const opts = [`<option value="all">Alle Leads (${state.leads.size})</option>`];
    for (const s of state.searches.slice(0, 40)) {
      const d = new Date(s.at);
      opts.push(`<option value="${s.id}">${esc(s.branche)} · ${esc(s.ort)} — ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} (${s.count || 0})</option>`);
    }
    $('#scope').innerHTML = opts.join('');
    $('#scope').value = state.scope;
  }

  function stars(l) {
    if (l.rating == null) return '<span class="muted">—</span>';
    return `<span class="stars">${icon('star')}<b>${l.rating.toFixed(1).replace('.', ',')}</b><span class="cnt">${l.reviews != null ? '(' + l.reviews + ')' : ''}</span></span>`;
  }

  function webCell(l) {
    const w = l.web;
    if (!w) return `<span class="pill pending">Wird geprüft</span><div class="why">${esc(host(l.website))}</div>`;
    const why = w.findings?.length ? w.findings.slice(0, 2).map(f => f.text).join(' · ') : (l.website ? host(l.website) : 'Nur Google-Maps-Eintrag');
    return `<span class="pill ${w.status}" title="${esc(w.label)}"><span class="lbl">${esc(w.label)}</span></span><div class="why">${esc(why)}</div>`;
  }

  // Passt ein Social-Handle zum Betriebsnamen? Handles von Website-Footern gehoeren oft
  // der Dachmarke oder dem Vermieter, nicht dem Laden selbst.
  const norm = t => String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFD').replace(/[^a-z0-9 ]/g, ' ');
  function handleFits(handle, name) {
    if (!handle) return true;
    const h = norm(handle).replace(/\s+/g, '');
    const words = norm(name).split(/\s+/).filter(w => w.length >= 4 && !/^(osnabrueck|restaurant|friseur|salon|studio|gmbh|und|the|bar|cafe)$/.test(w));
    if (!words.length) return true;
    return words.some(w => h.includes(w)) || (h.length >= 5 && norm(name).replace(/\s+/g, '').includes(h.slice(0, 5)));
  }

  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u || ''; } }

  function socialIcons(l) {
    const s = l.socials || {};
    return `<span class="socials">${[['instagram', 'ig'], ['facebook', 'fb'], ['tiktok', 'tt']].map(([k, i]) => `<span class="${s[k] ? 'on' : ''}" title="${s[k] ? k + ': ' + esc(s[k]) : 'kein ' + k}">${icon(i)}</span>`).join('')}${(s.emails || []).length ? `<span class="on" title="${esc(s.emails.join(', '))}">${icon('mail')}</span>` : ''}</span>`;
  }

  function row(l) {
    const flags = (l.flags || []).map(f => `<span class="flag">${esc(f)}</span>`).join(' ');
    return `<tr data-id="${esc(l.id)}" class="${state.selected === l.id ? 'sel' : ''}">
      <td><span class="score ${l.tier}">${l.score}</span></td>
      <td><div class="name">${l.starred ? icon('star', 'star') : ''}${esc(l.name)} ${flags}</div><div class="sub">${esc(l.category)} · ${esc(l.address)}</div></td>
      <td class="web-cell">${webCell(l)}</td>
      <td>${stars(l)}</td>
      <td class="phone">${l.phone ? esc(l.phone) : '<span class="muted">—</span>'}</td>
      <td>${socialIcons(l)}</td>
      <td><span class="status-tag ${l.status}">${STATUS_LABEL[l.status] || l.status}</span></td>
    </tr>`;
  }

  function renderKpis() {
    const all = inScope();
    const noSite = all.filter(l => ['none', 'social', 'platform'].includes(l.web?.status)).length;
    const bad = all.filter(l => ['broken', 'outdated'].includes(l.web?.status)).length;
    const hot = all.filter(l => l.tier === 'hot').length;
    const rated = all.filter(l => l.rating != null);
    const avg = rated.length ? (rated.reduce((s, l) => s + l.rating, 0) / rated.length).toFixed(1).replace('.', ',') : '—';
    $('#kpis').innerHTML = `
      <div class="kpi"><b>${all.length}</b><span>Betriebe gefunden</span></div>
      <div class="kpi hot"><b>${hot}</b><span>Heiße Leads (Score ≥ 70)</span></div>
      <div class="kpi accent"><b>${noSite}</b><span>Ohne eigene Website</span></div>
      <div class="kpi"><b>${bad}</b><span>Website kaputt oder veraltet</span></div>
      <div class="kpi"><b>${avg}</b><span>Ø Google-Bewertung</span></div>`;
    // Zaehler an den Filtertasten
    const cnt = {}; for (const l of all) { const g = WEB_GROUP[l.web?.status]; if (g) cnt[g] = (cnt[g] || 0) + 1; }
    document.querySelectorAll('#webFilter button').forEach(b => {
      const v = b.dataset.v; const n = v === 'all' ? all.length : cnt[v] || 0;
      b.innerHTML = `${b.textContent.replace(/\s*\d+$/, '')} <span class="n">${n}</span>`;
    });
  }

  let rowsCache = '';
  function render() {
    renderKpis();
    const list = visible();
    const html = list.map(row).join('');
    if (html !== rowsCache) { $('#rows').innerHTML = html; rowsCache = html; }
    $('#empty').hidden = state.leads.size > 0;
    if (state.leads.size && !list.length) {
      $('#rows').innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:40px">Kein Treffer mit diesen Filtern.</td></tr>`; rowsCache = '';
    }
    document.querySelectorAll('.seg').forEach(seg => {
      const key = { webFilter: 'web', tierFilter: 'tier', viewToggle: 'view' }[seg.id];
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === state[key]));
    });
    $('#listView').hidden = state.view !== 'list';
    $('#mapView').hidden = state.view !== 'map';
    if (state.view === 'map') renderMap(list);
    if (state.selected) renderDrawer();
  }

  // ---------- Karte
  let map, layer;
  function renderMap(list) {
    if (!window.L) { $('#mapView').innerHTML = '<p class="muted" style="padding:20px">Karte konnte nicht geladen werden (offline?).</p>'; return; }
    if (!map) {
      map = L.map('mapView', { zoomControl: true }).setView([52.27, 8.05], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      layer = L.layerGroup().addTo(map);
    }
    setTimeout(() => map.invalidateSize(), 50);
    layer.clearLayers();
    const pts = [];
    const color = { hot: '#ff6b4a', warm: '#f5b83d', cold: '#6c7a8a' };
    for (const l of list) {
      if (l.lat == null) continue;
      pts.push([l.lat, l.lng]);
      const m = L.circleMarker([l.lat, l.lng], { radius: 7 + Math.min(6, (l.reviews || 0) / 60), color: '#0c0f12', weight: 1.5, fillColor: color[l.tier], fillOpacity: .9 });
      m.bindTooltip(`<b>${esc(l.name)}</b><br>${esc(l.web?.label || '')} · Score ${l.score}`);
      m.on('click', () => select(l.id));
      m.addTo(layer);
    }
    if (pts.length && !renderMap.fitted) { map.fitBounds(pts, { padding: [30, 30], maxZoom: 15 }); renderMap.fitted = true; }
  }

  // ---------- Detail
  function ring(l) {
    const c = { hot: 'var(--hot)', warm: 'var(--warm)', cold: 'var(--cold)' }[l.tier];
    const r = 23, len = 2 * Math.PI * r;
    return `<div class="ring"><svg viewBox="0 0 54 54"><circle cx="27" cy="27" r="${r}" fill="none" stroke="var(--line)" stroke-width="5"/><circle cx="27" cy="27" r="${r}" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${len * l.score / 100} ${len}"/></svg><b style="color:${c}">${l.score}</b></div>`;
  }

  function renderDrawer() {
    const l = state.leads.get(state.selected);
    const d = $('#drawer');
    if (!l) { d.hidden = true; document.querySelector('.layout').classList.remove('open'); return; }
    d.hidden = false; document.querySelector('.layout').classList.add('open');
    const w = l.web || {};
    const s = l.socials || {};
    const nameCity = `${l.name} ${l.city || ''}`.trim();
    const g = q => 'https://www.google.com/search?q=' + encodeURIComponent(q);
    const weakColor = w.weakness >= 70 ? 'var(--red)' : w.weakness >= 45 ? 'var(--amber)' : w.weakness >= 20 ? 'var(--blue)' : 'var(--green)';
    const focus = document.activeElement?.id;

    const top = `
      <div class="d-head">
        <div class="d-top">
          ${ring(l)}
          <div class="d-title"><h2>${esc(l.name)}</h2><div class="sub">${esc(l.categories?.join(' · ') || l.category)}</div>
            ${(l.flags || []).map(f => `<span class="flag">${esc(f)}</span>`).join(' ')}</div>
          <button class="close" data-act="close" title="Schließen">${icon('x')}</button>
        </div>
        <div class="d-actions">
          ${l.phone ? `<a class="btn" href="tel:${esc((l.phoneIntl || l.phone).replace(/\s/g, ''))}">${icon('phone')}Anrufen</a>` : ''}
          <a class="btn" href="${esc(l.mapsUrl)}" target="_blank" rel="noopener">${icon('pin')}Maps</a>
          ${l.website ? `<a class="btn" href="${esc(l.website)}" target="_blank" rel="noopener">${icon('globe')}Website</a>` : ''}
          ${GH ? '' : `<button class="btn" data-act="rescan">${icon('refresh')}Neu prüfen</button>`}
          <button class="btn ${l.starred ? 'on' : ''}" data-act="star" title="Merken">${icon('star')}</button>
          <button class="btn danger" data-act="delete" title="Aus Liste löschen">${icon('trash')}</button>
        </div>
      </div>

      <div class="d-sec">
        <h3>Website-Befund <span class="aside">${w.weakness != null ? 'Schwäche ' + w.weakness + '/100' : ''}</span></h3>
        <div class="big-status"><span class="pill ${w.status || 'pending'}">${esc(w.label || 'Wird geprüft')}</span>${l.website ? `<a href="${esc(l.website)}" target="_blank" rel="noopener" class="sub">${esc(host(w.finalUrl || l.website))}</a>` : ''}</div>
        ${w.weakness != null ? `<div class="meter"><div style="width:${w.weakness}%;background:${weakColor}"></div></div>` : ''}
        ${w.status === 'none' ? `<p class="hint" style="margin-top:0">Google kennt keine Website. Vor dem Anruf kurz gegenchecken: <a href="${g(nameCity)}" target="_blank" rel="noopener">„${esc(nameCity)}“ googeln ${icon('ext')}</a></p>` : ''}
        ${w.findings?.length ? `<ul class="findings">${w.findings.map(f => `<li><span class="w ${f.weight >= 15 ? 'big' : ''}">+${f.weight}</span><div><div class="t">${esc(f.text)}</div>${f.detail ? `<div class="d">${esc(f.detail)}</div>` : ''}</div></li>`).join('')}</ul>` : ''}
        ${w.tech?.length || w.copyrightYear || w.loadMs ? `<div class="tech">${(w.tech || []).map(t => `<span>${esc(t)}</span>`).join('')}${w.copyrightYear ? `<span>© ${w.copyrightYear}</span>` : ''}${w.loadMs ? `<span>${(w.loadMs / 1000).toFixed(1)} s</span>` : ''}${w.htmlKb ? `<span>${w.htmlKb} KB HTML</span>` : ''}</div>` : ''}
      </div>`;

    const rest = `
      <div class="d-sec">
        <h3>Google-Eintrag</h3>
        <dl class="facts">
          <dt>Bewertung</dt><dd>${stars(l)}${l.reviews == null ? ' <span class="muted">Anzahl unbekannt</span>' : ''}</dd>
          <dt>Telefon</dt><dd>${l.phone ? `<a href="tel:${esc(l.phone.replace(/\s/g, ''))}">${esc(l.phone)}</a>` : '<span class="muted">keine</span>'}</dd>
          <dt>Adresse</dt><dd><a href="${esc(l.mapsUrl)}" target="_blank" rel="noopener">${esc(l.address)}</a></dd>
          <dt>Profil</dt><dd>${l.ownerClaimed ? 'vom Inhaber verwaltet' : '<span style="color:var(--amber)">nicht beansprucht</span> – Inhaber pflegt das Profil nicht'}</dd>
          ${l.booking ? `<dt>Buchung</dt><dd><a href="${esc(l.booking)}" target="_blank" rel="noopener">${esc(host(l.booking))}</a></dd>` : ''}
          ${l.hours?.length ? `<dt>Öffnungszeiten</dt><dd><ul class="hours">${l.hours.map(h => `<li>${esc(h)}</li>`).join('')}</ul></dd>` : ''}
        </dl>
      </div>

      <div class="d-sec">
        <h3>Social Media & Kontakt</h3>
        <div class="soc-grid">
          <div class="soc-row">${icon('ig')}<input data-soc="instagram" value="${esc(s.instagram || '')}" placeholder="Instagram-Name">
            ${s.instagram ? `<a class="btn" href="https://www.instagram.com/${esc(s.instagram)}/" target="_blank" rel="noopener">${icon('ext')}</a>` : `<a class="btn" href="${g('site:instagram.com ' + nameCity)}" target="_blank" rel="noopener" title="Bei Google nach dem Instagram-Profil suchen">${icon('search')}Suchen</a>`}</div>
          ${s.instagram && !handleFits(s.instagram, l.name) ? `<p class="hint warn">@${esc(s.instagram)} klingt nicht nach „${esc(l.name)}“ – kann der Dachmarke oder dem Vermieter gehören. Vor dem Anschreiben prüfen.</p>` : ''}
          <div class="soc-row">${icon('fb')}<input data-soc="facebook" value="${esc(s.facebook || '')}" placeholder="Facebook-Link">
            ${s.facebook ? `<a class="btn" href="${esc(s.facebook)}" target="_blank" rel="noopener">${icon('ext')}</a>` : `<a class="btn" href="${g('site:facebook.com ' + nameCity)}" target="_blank" rel="noopener">${icon('search')}Suchen</a>`}</div>
          <div class="soc-row">${icon('tt')}<input data-soc="tiktok" value="${esc(s.tiktok || '')}" placeholder="TikTok-Name">
            ${s.tiktok ? `<a class="btn" href="https://www.tiktok.com/@${esc(s.tiktok)}" target="_blank" rel="noopener">${icon('ext')}</a>` : `<a class="btn" href="${g('site:tiktok.com ' + nameCity)}" target="_blank" rel="noopener">${icon('search')}Suchen</a>`}</div>
          <div class="soc-row">${icon('mail')}<input data-soc="emails" value="${esc((s.emails || []).join(', '))}" placeholder="E-Mail">
            ${(s.emails || [])[0] ? `<a class="btn" href="mailto:${esc(s.emails[0])}">${icon('ext')}</a>` : ''}</div>
          ${s.whatsapp ? `<div class="soc-row">${icon('wa')}<a href="https://wa.me/${esc(s.whatsapp.replace(/\D/g, ''))}" target="_blank" rel="noopener">WhatsApp ${esc(s.whatsapp)}</a></div>` : ''}
        </div>
        <p class="hint">Automatisch gefunden: aus der Website und dem Google-Eintrag. Fehlt etwas, über „Suchen“ nachsehen und eintragen – wird gespeichert.</p>
      </div>

      <div class="d-sec">
        <h3>Pipeline</h3>
        <div class="status-pick">${STATUS.map(([v, lab]) => `<button data-status="${v}" class="${l.status === v ? 'on' : ''}">${lab}</button>`).join('')}</div>
        <textarea id="note" placeholder="Notiz: wer war dran, was wurde gesagt, wann nachfassen …">${esc(drafts.note[l.id] ?? l.note ?? '')}</textarea>
      </div>

      <div class="d-sec">
        <h3>Ansprache <span class="aside">${Pitch.formal(l) ? 'Sie-Form' : 'du-Form'} · aus dem Befund</span></h3>
        <div class="pitch-tabs">${[['dm', 'Instagram / WhatsApp'], ['mail', 'E-Mail'], ['call', 'Anruf-Leitfaden']].map(([v, lab]) => `<button data-pitch="${v}" class="${state.pitchTab === v ? 'on' : ''}">${lab}</button>`).join('')}</div>
        <div class="pitch" id="pitch" contenteditable="true" spellcheck="false">${esc(drafts.pitch[l.id + state.pitchTab] ?? Pitch.build(l, state.pitchTab))}</div>
        <div class="pitch-foot"><span class="muted">Text ist editierbar. Gesendet wird von Hand.</span>${drafts.pitch[l.id + state.pitchTab] != null ? `<button class="btn small ghost" data-act="resetPitch">Zurücksetzen</button>` : ''}<button class="btn small" data-act="copy">${icon('copy')}Kopieren</button></div>
      </div>

      <div class="d-sec">
        <h3>Wie der Score entsteht</h3>
        <div class="breakdown">
          <div><b>${l.parts?.need ?? 0}</b>/50<span>Bedarf (Website-Lage)</span></div>
          <div><b>${l.parts?.sub ?? 0}</b>/30<span>Substanz (Bewertungen)</span></div>
          <div><b>${l.parts?.reach ?? 0}</b>/20<span>Erreichbarkeit</span></div>
        </div>
      </div>`;

    // Kopf + Befund und der Rest werden neu gezeichnet, die Vorschau nur bei Wechsel —
    // sonst wuerde das iframe bei jeder Live-Aktualisierung neu laden.
    if (d.dataset.id !== l.id) { d.innerHTML = '<div id="dTop"></div><div id="dPrev"></div><div id="dRest"></div>'; d.dataset.id = l.id; d.dataset.prev = ''; }
    $('#dTop').innerHTML = top;
    $('#dRest').innerHTML = rest;
    const pu = ['outdated', 'weak', 'good', 'broken'].includes(w.status) ? (w.finalUrl || l.website) : null;
    const key = pu ? pu + '|' + state.previewMode : '';
    if (d.dataset.prev !== key) { d.dataset.prev = key; $('#dPrev').innerHTML = pu ? previewHtml(pu) : ''; }
    if (focus === 'note') { const n = $('#note'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    if (focus === 'pitch') { const p = $('#pitch'); p.focus(); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  }

  function previewHtml(u) {
    const phone = state.previewMode !== 'desktop';
    const W = phone ? 390 : 1280, H = phone ? 780 : 820, scale = phone ? 0.62 : 0.328;
    return `<div class="d-sec">
      <h3>So sieht die Seite aus
        <span class="aside seg small" style="margin-left:auto">${[['phone', 'Handy'], ['desktop', 'Desktop']].map(([v, lab]) => `<button data-pmode="${v}" class="${(phone ? 'phone' : 'desktop') === v ? 'on' : ''}">${lab}</button>`).join('')}</span></h3>
      <div class="preview ${phone ? 'phone' : 'desktop'}" style="width:${Math.round(W * scale) + (phone ? 16 : 2)}px;height:${Math.round(H * scale) + (phone ? 16 : 2)}px">
        <iframe src="${GH ? esc(u.replace(/^http:/, 'https:')) : '/api/preview?url=' + encodeURIComponent(u)}" sandbox="allow-scripts allow-same-origin allow-popups" loading="lazy" referrerpolicy="no-referrer"
          style="width:${W}px;height:${H}px;transform:scale(${scale})"></iframe>
      </div>
      <p class="hint">${GH ? 'Bleibt das Feld leer, verbietet die Seite das Einbetten – dann oben auf „Website“. ' : ''}${phone ? 'Genau so sieht der Inhaber seine Seite auf dem Handy. Gut zum Zeigen beim Besuch.' : 'Desktop-Ansicht, verkleinert.'}</p>
    </div>`;
  }

  function select(id) {
    state.selected = id;
    document.querySelectorAll('#rows tr').forEach(tr => tr.classList.toggle('sel', tr.dataset.id === id));
    renderDrawer();
    $('#drawer').scrollTop = 0;
  }

  async function patch(id, body) {
    if (GH) {
      if (!GH.token()) { toast('Zum Speichern erst den GitHub-Schlüssel eintragen'); throw new Error('kein Schlüssel'); }
      const l = state.leads.get(id);
      const { socials, ...rest } = body;
      Object.assign(l, rest);
      if (socials) l.socials = { ...(l.socials || {}), ...socials };
      GH.patch(id, body, err => toast(err.message));
      return l;
    }
    const l = await api('/api/leads/' + encodeURIComponent(id), { method: 'PATCH', body });
    state.leads.set(id, l);
    return l;
  }

  // ---------- Suche starten + Live-Stream
  $('#searchForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (state.job) return;
    const body = { branche: $('#branche').value, ort: $('#ort').value, tiefe: +$('#tiefe').value };
    try { localStorage.setItem('webradar.last', JSON.stringify(body)); } catch {}
    try {
      if (GH) {
        const { id, since } = await GH.startScan(body);
        const job = { id, since, params: body };
        try { localStorage.setItem('webradar.job', JSON.stringify(job)); } catch {}
        watchRun(job);
        return;
      }
      const { id } = await api('/api/jobs', { method: 'POST', body });
      startStream(id, body);
    } catch (err) { toast(err.message); }
  });

  // GitHub-Modus: Actions-Lauf beobachten, danach Daten neu laden. Uebersteht auch Neuladen der Seite.
  async function watchRun(job) {
    const { id, since, params } = job;
    state.job = id;
    const P = $('#progress'); P.hidden = false; P.className = 'progress';
    $('#progTitle').textContent = `${params.branche} in ${params.ort}`;
    $('#progText').textContent = 'Auftrag an GitHub geschickt …';
    $('#progBar').style.width = '3%';
    $('#log').innerHTML = `<li>Scan läuft auf GitHub. Du kannst die Seite schließen und später wieder öffnen.</li>`;
    $('#scanBtn').disabled = true; $('#cancelBtn').hidden = false;
    const expected = 70 + params.tiefe * 55;
    const finish = (ok, msg) => {
      state.job = null; state.runId = null; $('#scanBtn').disabled = false; $('#cancelBtn').hidden = true;
      try { localStorage.removeItem('webradar.job'); } catch {}
      P.classList.add(ok ? 'done' : 'error'); $('#progTitle').textContent = msg;
    };
    for (;;) {
      await new Promise(r => setTimeout(r, 5000));
      let run;
      try { run = await GH.findRun(since); } catch (err) { $('#progText').textContent = err.message; continue; }
      if (!run) { $('#progText').textContent = 'Warte auf GitHub …'; if (Date.now() - since > 3 * 60e3) return finish(false, 'GitHub hat den Scan nicht gestartet'); continue; }
      state.runId = run.id;
      if (run.status !== 'completed') {
        const secs = Math.max(0, Math.round((Date.now() - Date.parse(run.run_started_at || run.created_at)) / 1000));
        let step = '';
        try { step = (await GH.runSteps(run.id)).find(x => x.status === 'in_progress')?.name || ''; } catch {}
        $('#progText').textContent = run.status === 'queued' ? 'In der Warteschlange bei GitHub …' : `${step || 'läuft'} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} min`;
        $('#progBar').style.width = Math.min(95, 5 + secs / expected * 90) + '%';
        continue;
      }
      if (run.conclusion === 'cancelled') return finish(false, 'Abgebrochen');
      $('#progText').textContent = 'Lade Ergebnisse …';
      await new Promise(r => setTimeout(r, 1500));
      await load();
      const s = state.searches.find(x => x.id === id);
      if (run.conclusion !== 'success' || !s || s.status === 'fehler') {
        $('#log').insertAdjacentHTML('afterbegin', `<li>${esc(s?.error || 'Scan fehlgeschlagen')} — <a href="${esc(run.html_url)}" target="_blank" rel="noopener">Protokoll bei GitHub</a></li>`);
        return finish(false, 'Fehler beim Scan');
      }
      $('#progBar').style.width = '100%';
      state.scope = id; renderMap.fitted = false; persistUi(); renderScope(); render();
      $('#progText').textContent = `${params.branche} in ${params.ort}`;
      return finish(true, `Fertig: ${s.count} Betriebe`);
    }
  }

  function startStream(id, params) {
    state.job = id;
    state.scope = id; renderMap.fitted = false;
    state.searches.unshift({ id, ...params, at: new Date().toISOString(), count: 0 });
    renderScope(); render();
    const P = $('#progress'); P.hidden = false; P.className = 'progress';
    $('#progTitle').textContent = `${params.branche} in ${params.ort}`;
    $('#progText').textContent = 'verbinde …';
    $('#progBar').style.width = '2%';
    $('#log').innerHTML = '';
    $('#scanBtn').disabled = true; $('#cancelBtn').hidden = false;
    let found = 0, pending = false;
    const later = () => { if (!pending) { pending = true; setTimeout(() => { pending = false; render(); }, 120); } };
    const es = new EventSource(`/api/jobs/${id}/stream`);
    es.onmessage = ev => {
      const { type, data } = JSON.parse(ev.data);
      if (type === 'lead') { state.leads.set(data.id, data); later(); }
      else if (type === 'log') $('#log').insertAdjacentHTML('afterbegin', `<li>${esc(new Date().toLocaleTimeString('de-DE'))}  ${esc(data)}</li>`);
      else if (type === 'progress') {
        if (data.phase === 'maps') { found = data.found; $('#progBar').style.width = (data.page / data.pages * 40) + '%'; $('#progText').textContent = `Google Maps: Seite ${data.page}/${data.pages} · ${found} Betriebe`; }
        if (data.phase === 'reviews') { $('#progBar').style.width = 40 + (data.done / data.total * 15) + '%'; $('#progText').textContent = `Rezensionen nachladen ${data.done}/${data.total}`; }
        if (data.phase === 'audit') { $('#progBar').style.width = 55 + (data.done / data.total * 45) + '%'; $('#progText').textContent = `Websites prüfen ${data.done}/${data.total} · ${found} Betriebe`; }
      } else if (type === 'done' || type === 'error') {
        es.close(); state.job = null; $('#scanBtn').disabled = false; $('#cancelBtn').hidden = true;
        if (type === 'done') { P.classList.add('done'); $('#progBar').style.width = '100%'; $('#progTitle').textContent = `Fertig: ${data.found} Betriebe`; $('#progText').textContent = `${params.branche} in ${params.ort}`; }
        else { P.classList.add('error'); $('#progTitle').textContent = 'Fehler'; $('#progText').textContent = data; }
        const s = state.searches.find(x => x.id === id); if (s) s.count = data.found ?? found;
        renderScope(); render();
      }
    };
    es.onerror = () => { if (state.job === id) { es.close(); state.job = null; $('#scanBtn').disabled = false; $('#progText').textContent = 'Verbindung zum Server verloren.'; } };
  }
  $('#cancelBtn').onclick = () => {
    if (!state.job) return;
    if (GH) { if (state.runId) GH.cancelRun(state.runId).then(() => toast('Wird abgebrochen …'), err => toast(err.message)); return; }
    api(`/api/jobs/${state.job}/cancel`, { method: 'POST' });
  };

  // ---------- Bedienung
  function segHandler(id, key) {
    $('#' + id).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state[key] = b.dataset.v; persistUi(); render(); });
  }
  segHandler('webFilter', 'web'); segHandler('tierFilter', 'tier'); segHandler('viewToggle', 'view');
  $('#scope').onchange = e => { state.scope = e.target.value; renderMap.fitted = false; persistUi(); render(); };
  $('#minReviews').oninput = e => { state.minReviews = +e.target.value || 0; persistUi(); render(); };
  $('#statusFilter').onchange = e => { state.status = e.target.value; persistUi(); render(); };
  $('#hideChains').onchange = e => { state.hideChains = e.target.checked; persistUi(); render(); };
  $('#q').oninput = e => { state.q = e.target.value; render(); };
  $('#sort').onchange = e => { state.sort = e.target.value; persistUi(); render(); };
  $('#rows').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) select(tr.dataset.id); });
  $('#exportBtn').onclick = () => {
    const ids = visible().map(l => l.id);
    if (!ids.length) return toast('Keine Leads in der Auswahl');
    const leads = ids.map(id => state.leads.get(id));
    const cols = [
      ['Name', l => l.name], ['Kategorie', l => l.category], ['Score', l => l.score], ['Stufe', l => ({ hot: 'Heiß', warm: 'Warm', cold: 'Kalt' })[l.tier]],
      ['Website-Status', l => l.web?.label || ''], ['Website', l => l.website || ''], ['Mängel', l => (l.web?.findings || []).map(f => f.text).join(' | ')],
      ['Bewertung', l => l.rating != null ? String(l.rating).replace('.', ',') : ''], ['Rezensionen', l => l.reviews ?? ''], ['Telefon', l => l.phone || ''], ['Adresse', l => l.address],
      ['Instagram', l => l.socials?.instagram ? 'https://instagram.com/' + l.socials.instagram : ''], ['Facebook', l => l.socials?.facebook || ''],
      ['TikTok', l => l.socials?.tiktok ? 'https://tiktok.com/@' + l.socials.tiktok : ''], ['E-Mail', l => (l.socials?.emails || []).join(', ')],
      ['Google Maps', l => l.mapsUrl], ['Status', l => STATUS_LABEL[l.status] || l.status], ['Notiz', l => l.note || ''],
    ];
    const cell = v => { const t = String(v ?? ''); return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const text = '\uFEFF' + [cols.map(c => c[0]).join(';'), ...leads.map(l => cols.map(c => cell(c[1](l))).join(';'))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = `webradar-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.selected && !$('#settings').open) { state.selected = null; $('#drawer').hidden = true; document.querySelector('.layout').classList.remove('open'); document.querySelectorAll('#rows tr.sel').forEach(t => t.classList.remove('sel')); }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && state.selected && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
      const list = visible(); const i = list.findIndex(l => l.id === state.selected);
      const n = list[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) { e.preventDefault(); select(n.id); document.querySelector(`#rows tr[data-id="${CSS.escape(n.id)}"]`)?.scrollIntoView({ block: 'nearest' }); }
    }
  });

  const drawer = $('#drawer');
  drawer.addEventListener('click', async e => {
    const l = state.leads.get(state.selected); if (!l) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.status) { await patch(l.id, { status: b.dataset.status }); render(); return; }
    if (b.dataset.pitch) { state.pitchTab = b.dataset.pitch; persistUi(); renderDrawer(); return; }
    if (b.dataset.pmode) { state.previewMode = b.dataset.pmode; persistUi(); renderDrawer(); return; }
    const act = b.dataset.act;
    if (act === 'close') { state.selected = null; drawer.hidden = true; document.querySelector('.layout').classList.remove('open'); render(); }
    if (act === 'star') { await patch(l.id, { starred: !l.starred }); render(); }
    if (act === 'resetPitch') { delete drafts.pitch[l.id + state.pitchTab]; renderDrawer(); return; }
    if (act === 'copy') { await navigator.clipboard.writeText($('#pitch').innerText); toast('Text kopiert'); }
    if (act === 'rescan') {
      b.disabled = true; b.innerHTML = `${icon('refresh')}Prüfe …`;
      try { const n = await api('/api/leads/' + encodeURIComponent(l.id) + '/rescan', { method: 'POST' }); state.leads.set(l.id, n); toast('Neu geprüft'); } catch (err) { toast(err.message); }
      render();
    }
    if (act === 'delete') {
      if (!confirm(`„${l.name}“ aus der Liste löschen?`)) return;
      if (GH) await patch(l.id, { hidden: true });
      else await api('/api/leads/' + encodeURIComponent(l.id), { method: 'DELETE' });
      state.leads.delete(l.id); state.selected = null; drawer.hidden = true; document.querySelector('.layout').classList.remove('open'); render();
    }
  });
  drawer.addEventListener('change', async e => {
    const l = state.leads.get(state.selected); if (!l) return;
    const k = e.target.dataset.soc;
    if (k) {
      let v = e.target.value.trim();
      if (k === 'instagram') v = v.replace(/^@/, '').replace(/.*instagram\.com\//i, '').replace(/[/?#].*$/, '');
      if (k === 'tiktok') v = v.replace(/^@/, '').replace(/.*tiktok\.com\/@?/i, '').replace(/[/?#].*$/, '');
      const val = k === 'emails' ? v.split(/[,\s]+/).filter(Boolean) : v || null;
      await patch(l.id, { socials: { [k]: val } }); render(); toast('Gespeichert');
    }
  });
  let noteTimer;
  drawer.addEventListener('input', e => {
    if (e.target.id === 'pitch') { drafts.pitch[state.selected + state.pitchTab] = e.target.innerText; return; }
    if (e.target.id !== 'note') return;
    const id = state.selected, v = e.target.value;
    drafts.note[id] = v;
    clearTimeout(noteTimer); noteTimer = setTimeout(async () => { const l = await patch(id, { note: v }); state.leads.set(id, l); if (drafts.note[id] === v) delete drafts.note[id]; }, 500);
  });

  // ---------- Einstellungen
  $('#settingsBtn').onclick = () => {
    const s = Pitch.settings();
    if (GH) { $('#ghSettings').hidden = false; $('#setToken').value = GH.token(); $('#repoLink').href = GH.repoUrl; }
    $('#setName').value = s.name || ''; $('#setBrand').value = s.brand || ''; $('#setPhone').value = s.phone || ''; $('#setRef').value = s.ref || '';
    $('#settings').showModal();
  };
  $('#settings').addEventListener('close', () => {
    if ($('#settings').returnValue !== 'ok') return;
    try { localStorage.setItem('webradar.settings', JSON.stringify({ name: $('#setName').value.trim(), brand: $('#setBrand').value.trim(), phone: $('#setPhone').value.trim(), ref: $('#setRef').value.trim() })); } catch {}
    if (GH) { const t = $('#setToken').value.trim(); if (t !== GH.token()) { GH.setToken(t); load().then(() => toast('Schlüssel gespeichert'), err => toast(err.message)); } }
    renderDrawer(); toast('Gespeichert');
  });

  // Letzte Suche vorausfuellen, Filter-Zustand wiederherstellen
  try { const last = JSON.parse(localStorage.getItem('webradar.last') || 'null'); if (last) { $('#branche').value = last.branche; $('#ort').value = last.ort; $('#tiefe').value = last.tiefe; } } catch {}
  if (!$('#ort').value) $('#ort').value = 'Osnabrück';
  $('#minReviews').value = state.minReviews || 0;
  $('#statusFilter').value = state.status;
  $('#hideChains').checked = state.hideChains;
  $('#sort').value = state.sort;

  load().then(() => {
    if (!GH) return;
    try { const job = JSON.parse(localStorage.getItem('webradar.job') || 'null'); if (job && Date.now() - job.since < 45 * 60e3) watchRun(job); } catch {}
  }).catch(err => toast((GH ? '' : 'Server nicht erreichbar: ') + err.message));
})();
