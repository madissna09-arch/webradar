// GitHub-Modus: Die Seite liegt auf GitHub Pages, gescannt wird von GitHub Actions.
// Daten: data/leads.json + data/searches.json (schreibt der Scan), data/crm.json (Status,
// Notizen, Merker — schreibt diese Seite ueber die GitHub-API).
// Der Schluessel (Fine-grained Token) liegt nur im localStorage dieses Geraets.

(function () {
  const host = location.hostname;
  const active = host.endsWith('.github.io') || new URLSearchParams(location.search).has('gh');
  if (!active) return;

  const OWNER = host.endsWith('.github.io') ? host.split('.')[0] : 'madissna09-arch';
  const REPO = host.endsWith('.github.io') ? location.pathname.split('/')[1] || 'webradar' : 'webradar';
  const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const KEY = 'webradar.token';

  const token = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
  const setToken = t => { try { t ? localStorage.setItem(KEY, t.trim()) : localStorage.removeItem(KEY); } catch {} };

  async function gh(path, opts = {}) {
    const res = await fetch(path.startsWith('http') ? path : API + path, {
      ...opts,
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(opts.headers || {}) },
      cache: 'no-store',
    });
    if (res.status === 401) throw new Error('GitHub-Schlüssel ungültig oder abgelaufen (Einstellungen).');
    if (res.status === 403 || res.status === 404) {
      const j = await res.json().catch(() => ({}));
      throw Object.assign(new Error(j.message || `GitHub: HTTP ${res.status}`), { status: res.status });
    }
    if (!res.ok && res.status !== 409 && res.status !== 422) throw new Error(`GitHub: HTTP ${res.status}`);
    return res;
  }

  // Mit Schluessel frisch ueber die API, ohne Schluessel die (evtl. ein paar Minuten alte) Pages-Kopie.
  async function readJson(name, fallback) {
    try {
      if (token()) {
        const r = await gh(`/contents/data/${name}?ref=main&t=${Date.now()}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
        if (r.ok) return await r.json();
      }
      const r = await fetch(`data/${name}?t=${Date.now()}`, { cache: 'no-store' });
      return r.ok ? await r.json() : fallback;
    } catch (e) {
      if (/Schlüssel/.test(e.message)) throw e;
      return fallback;
    }
  }

  // ---------- CRM (Status, Notizen) — mit sha-Abgleich, damit zwei Handys sich nicht ueberschreiben
  let crm = {}, crmSha = null, pending = {}, saveTimer = null, saving = null;

  async function loadCrm() {
    if (!token()) { crm = await readJson('crm.json', {}); return; }
    let r;
    try { r = await gh(`/contents/data/crm.json?ref=main&t=${Date.now()}`); }
    catch (e) { if (e.status === 404) { crm = {}; crmSha = null; return; } throw e; }
    if (!r.ok) { crm = {}; crmSha = null; return; }
    const j = await r.json();
    crmSha = j.sha;
    crm = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(j.content.replace(/\n/g, '')), c => c.charCodeAt(0))) || '{}');
  }

  function b64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  async function pushCrm() {
    for (let attempt = 0; attempt < 4; attempt++) {
      const merged = { ...crm };
      for (const [id, v] of Object.entries(pending)) merged[id] = { ...(merged[id] || {}), ...v, socials: { ...(merged[id]?.socials || {}), ...(v.socials || {}) } };
      const r = await gh('/contents/data/crm.json', {
        method: 'PUT',
        body: JSON.stringify({ message: 'Pipeline aktualisiert', content: b64(JSON.stringify(merged, null, 1)), branch: 'main', ...(crmSha ? { sha: crmSha } : {}) }),
      });
      if (r.ok) { const j = await r.json(); crmSha = j.content.sha; crm = merged; pending = {}; return; }
      await loadCrm(); // jemand anderes hat gespeichert — neu laden und eigene Aenderungen oben drauf
    }
    throw new Error('Speichern bei GitHub fehlgeschlagen.');
  }

  function scheduleSave(onError) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saving = pushCrm().catch(onError).finally(() => (saving = null)); }, 1200);
  }

  function applyCrm(lead) {
    const c = { ...(crm[lead.id] || {}), ...(pending[lead.id] || {}) };
    if (c.status) lead.status = c.status;
    if (c.note != null) lead.note = c.note;
    if (c.starred != null) lead.starred = c.starred;
    if (c.socials) lead.socials = { ...(lead.socials || {}), ...c.socials };
    lead.hidden = !!c.hidden;
    return lead;
  }

  // ---------- Scans ueber GitHub Actions
  async function startScan(params) {
    if (!token()) throw new Error('Zum Scannen erst den GitHub-Schlüssel eintragen (Zahnrad oben rechts).');
    const id = 's' + Date.now().toString(36);
    const since = Date.now() - 10000;
    await gh('/actions/workflows/scan.yml/dispatches', {
      method: 'POST',
      body: JSON.stringify({ ref: 'main', inputs: { branche: params.branche, ort: params.ort, tiefe: String(params.tiefe), id } }),
    });
    return { id, since };
  }

  async function findRun(since) {
    const r = await gh('/actions/workflows/scan.yml/runs?event=workflow_dispatch&per_page=10');
    const j = await r.json();
    return (j.workflow_runs || []).filter(x => Date.parse(x.created_at) >= since).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0] || null;
  }

  async function runSteps(runId) {
    const r = await gh(`/actions/runs/${runId}/jobs`);
    const j = await r.json();
    return j.jobs?.[0]?.steps || [];
  }

  async function cancelRun(runId) { await gh(`/actions/runs/${runId}/cancel`, { method: 'POST' }); }

  window.GH = {
    active, OWNER, REPO, token, setToken, readJson, loadCrm, applyCrm, startScan, findRun, runSteps, cancelRun,
    patch(id, body, onError) {
      pending[id] = { ...(pending[id] || {}), ...body, socials: { ...(pending[id]?.socials || {}), ...(body.socials || {}) } };
      scheduleSave(onError);
    },
    get busy() { return !!saving || !!saveTimer; },
    repoUrl: `https://github.com/${OWNER}/${REPO}`,
  };

  // Ungespeicherte Aenderungen nicht beim Schliessen verlieren.
  addEventListener('beforeunload', e => { if (Object.keys(pending).length) { e.preventDefault(); e.returnValue = ''; } });
})();
