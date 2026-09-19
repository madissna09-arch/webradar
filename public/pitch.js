// Ansprache-Texte aus dem Befund. Kein KI-Aufruf — Vorlagen, die mit echten Daten gefuellt werden.
// Regeln (siehe TEXTEN.md im Akquise-Ordner): nichts "kostenlos/gratis/unverbindlich" anbieten.
// Das Muster wird gezeigt, nicht verschenkt.

(function () {
  const DU = /friseur|barber|salon|kosmetik|nagel|beauty|tattoo|piercing|café|cafe|bar\b|imbiss|döner|doner|kebab|pizza|burger|restaurant|gastst|kneipe|bistro|bäcker|eis|shisha|lounge|streetfood|grill|sushi|fitness|gym|yoga|boxen|kampfsport|tanz|blumen|hundesalon|tier|spätkauf|kiosk|späti|handy|shop|laden|boutique|mode|second/i;

  const GASTRO = /café|cafe|bar|imbiss|döner|doner|kebab|pizza|burger|restaurant|gastst|kneipe|bistro|bäcker|eis|grill|sushi|lieferservice|küche/i;

  function formal(lead) { return !DU.test(`${lead.category} ${lead.name}`); }

  // Befund → Satz in Alltagssprache (du- und Sie-Form)
  const PHRASE = {
    viewport: ['auf dem Handy wird eure Seite winzig angezeigt, man muss erst reinzoomen', 'auf dem Handy wird Ihre Seite sehr klein angezeigt, man muss erst hineinzoomen'],
    https: ['der Browser zeigt bei eurer Seite „Nicht sicher“ an', 'der Browser zeigt bei Ihrer Seite „Nicht sicher“ an'],
    cert: ['das Sicherheitszertifikat eurer Seite ist abgelaufen', 'das Sicherheitszertifikat Ihrer Seite ist abgelaufen'],
    age: [f => `die Seite wurde seit ${f.text.match(/\d{4}/)?.[0] || 'Jahren'} nicht mehr aktualisiert`, f => `die Seite wurde seit ${f.text.match(/\d{4}/)?.[0] || 'Jahren'} nicht mehr aktualisiert`],
    impressum: ['wir haben kein Impressum gefunden, das kann schnell eine Abmahnung kosten', 'wir haben kein Impressum gefunden, das kann schnell eine Abmahnung nach sich ziehen'],
    privacy: ['eine Datenschutzerklärung fehlt', 'eine Datenschutzerklärung fehlt'],
    slow: ['sie lädt ziemlich lange', 'sie lädt recht lange'],
    oldhtml: ['die Technik dahinter ist sehr alt', 'die Technik dahinter ist sehr alt'],
    frames: ['die Seite ist noch mit Technik aus den 90ern gebaut', 'die Seite ist noch mit Technik aus den 90ern gebaut'],
    flash: ['Teile der Seite laufen noch mit Flash, das zeigt heute kein Browser mehr an', 'Teile der Seite laufen noch mit Flash, das zeigt heute kein Browser mehr an'],
    subdomain: [f => `die Seite läuft ohne eigene Adresse über einen Baukasten (${f.detail || ''})`, f => `die Seite läuft ohne eigene Adresse über einen Baukasten (${f.detail || ''})`],
    tel: ['die Nummer kann man auf dem Handy nicht direkt antippen', 'die Nummer lässt sich auf dem Handy nicht direkt antippen'],
    pdf: ['die Karte gibt es nur als PDF, auf dem Handy nervt das', 'die Preisliste gibt es nur als PDF, auf dem Handy ist das mühsam'],
    gfonts: ['Schriften werden direkt von Google geladen, dafür wurden schon Betriebe abgemahnt', 'Schriften werden direkt von Google geladen, dafür wurden schon Betriebe abgemahnt'],
    thin: ['auf der Startseite steht kaum etwas', 'auf der Startseite steht kaum Inhalt'],
    cms: ['das System dahinter bekommt seit Jahren keine Sicherheitsupdates mehr', 'das System dahinter erhält seit Jahren keine Sicherheitsupdates mehr'],
    deadlink: ['wer bei Google auf „Website“ klickt, landet auf einer Fehlerseite', 'wer bei Google auf „Website“ klickt, landet auf einer Fehlerseite'],
    doctype: ['die Seite ist nach einem Standard von vor über zehn Jahren gebaut', 'die Seite ist nach einem Standard von vor über zehn Jahren gebaut'],
    php: ['die Software auf dem Server bekommt keine Sicherheitsupdates mehr', 'die Software auf dem Server erhält keine Sicherheitsupdates mehr'],
    desc: ['bei Google erscheint keine richtige Beschreibung zu euch', 'bei Google erscheint keine passende Beschreibung zu Ihnen'],
  };

  function phrases(lead, n) {
    const i = formal(lead) ? 1 : 0;
    return (lead.web?.findings || [])
      .filter(f => PHRASE[f.key])
      .slice(0, n)
      .map(f => { const p = PHRASE[f.key][i]; return typeof p === 'function' ? p(f) : p; });
  }

  function list(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' und ' + items[items.length - 1];
  }

  function ratingLine(lead, sie) {
    if (lead.rating == null) return '';
    const r = lead.rating.toFixed(1).replace('.', ',');
    if (lead.reviews >= 30 && lead.rating >= 4.3) return sie ? `${r} Sterne bei ${lead.reviews} Bewertungen – das schaffen nicht viele.` : `${r} Sterne bei ${lead.reviews} Bewertungen – Respekt, das schaffen nicht viele.`;
    if (lead.reviews >= 10) return sie ? `Ihre ${lead.reviews} Google-Bewertungen zeigen, dass die Leute gern zu Ihnen kommen.` : `eure ${lead.reviews} Google-Bewertungen zeigen, dass die Leute gern zu euch kommen.`;
    return '';
  }

  // Kern-Aufhaenger je nach Website-Lage
  function hook(lead, sie) {
    const w = lead.web || {};
    const e = sie ? 'Ihnen' : 'euch', E = sie ? 'Ihre' : 'eure';
    switch (w.status) {
      case 'none': return sie
        ? `Uns ist aufgefallen, dass Sie keine eigene Website haben. Wer Sie googelt, findet nur den Maps-Eintrag – keine Leistungen, keine Preise, keine Bilder.`
        : `Uns ist aufgefallen, dass ihr keine eigene Website habt. Wer euch googelt, findet nur den Maps-Eintrag – ${GASTRO.test(lead.category + ' ' + lead.name) ? 'keine Speisekarte' : 'keine Leistungen'}, keine Preise, keine Bilder.`;
      case 'social': return sie
        ? `Bei Google verweist Ihr Eintrag nur auf ${w.label.replace('Nur ', '')}. Wer dort kein Konto hat oder schnell Preise und Öffnungszeiten sucht, springt ab.`
        : `Bei Google verlinkt ihr nur auf ${w.label.replace('Nur ', '')}. Wer da kein Konto hat oder schnell Preise und Öffnungszeiten sucht, ist weg.`;
      case 'platform': return sie
        ? `Ihr Google-Eintrag führt auf eine fremde Plattform statt auf eine eigene Seite. Dort stehen Sie direkt neben der Konkurrenz.`
        : `euer Google-Eintrag führt auf eine fremde Plattform statt auf eine eigene Seite. Da steht ihr direkt neben der Konkurrenz.`;
      case 'broken': return sie
        ? `Wir wollten uns Ihre Website ansehen, aber sie ist gerade nicht erreichbar (${(w.findings?.[0]?.text || 'Fehler').replace(/^./, c => c.toLowerCase())}). Kunden, die über Google kommen, sehen dasselbe.`
        : `Wir wollten uns eure Website anschauen, aber sie ist gerade nicht erreichbar (${(w.findings?.[0]?.text || 'Fehler').replace(/^./, c => c.toLowerCase())}). Kunden, die über Google kommen, sehen dasselbe.`;
      default: {
        const p = phrases(lead, 3);
        if (!p.length) return sie ? `Wir haben uns Ihre Website angesehen und hätten ein paar Ideen, wie sie mehr Anfragen bringt.` : `Wir haben uns eure Website angeschaut und hätten ein paar Ideen, wie sie mehr Anfragen bringt.`;
        return sie ? `Wir haben uns Ihre Website angesehen: ${list(p)}.` : `Wir haben uns eure Website angeschaut: ${list(p)}.`;
      }
    }
  }

  function settings() {
    try { return JSON.parse(localStorage.getItem('webradar.settings') || '{}'); } catch { return {}; }
  }

  function build(lead, channel) {
    const s = settings();
    const sie = formal(lead);
    const me = s.name || 'Madis und Simon';
    const brand = s.brand ? ` von ${s.brand}` : '';
    const wir = me.includes(' und ') || me.includes('&') ? 'wir' : 'ich';
    const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
    const rl = ratingLine(lead, sie);
    const h = hook(lead, sie);
    const ask = sie
      ? `Dürfen wir kurz vorbeikommen und Ihnen zeigen, wie das bei Ihnen aussehen könnte? Dauert zehn Minuten.`
      : `Sollen wir kurz vorbeischauen und euch zeigen, wie das bei euch aussehen könnte? Dauert zehn Minuten.`;
    const ref = s.ref ? (sie ? `\nSo sieht eine Seite aus, die wir gebaut haben: ${s.ref}` : `\nSo sieht eine Seite aus, die wir gebaut haben: ${s.ref}`) : '';
    const optout = sie ? 'Falls kein Interesse besteht, reicht ein kurzes Nein – dann melden wir uns nicht wieder.' : 'Wenn’s euch nicht interessiert, reicht ein kurzes Nein – dann melden wir uns nicht mehr.';

    if (channel === 'dm') {
      const hi = sie ? 'Guten Tag,' : 'Hey,';
      return `${hi} hier sind ${me}${brand} aus der Gegend.\n\n${rl ? cap(rl) + ' ' : ''}${cap(h)}\n\n${ask}${ref}\n\n${optout}`;
    }
    if (channel === 'mail') {
      const subj = lead.web?.status === 'none' ? `Website für ${lead.name}` : lead.web?.status === 'broken' ? `${lead.name}: Ihre Website ist nicht erreichbar` : `Kurze Beobachtung zur Website von ${lead.name}`;
      const hi = sie ? 'Guten Tag,' : 'Hallo zusammen,';
      return `Betreff: ${subj}\n\n${hi}\n\n${wir === 'wir' ? 'wir sind' : 'ich bin'} ${me}${brand} und bauen Websites für Betriebe hier in der Region.\n\n${rl ? cap(rl) + ' ' : ''}${cap(h)}\n\n${ask}${ref}\n\n${optout}\n\nViele Grüße\n${me}${s.phone ? '\n' + s.phone : ''}`;
    }
    // Anruf-Leitfaden
    const who = sie ? 'Spreche ich mit dem Inhaber oder der Inhaberin?' : 'Bist du der Chef oder die Chefin?';
    const facts = [];
    if (lead.web?.status && !['none', 'social', 'platform'].includes(lead.web.status)) for (const f of (lead.web.findings || []).slice(0, 4)) facts.push(`- ${f.text}${f.detail ? ' (' + f.detail + ')' : ''}`);
    return `ANRUF-LEITFADEN — ${lead.name}\nTel.: ${lead.phone || 'keine Nummer'}\n\n1. Einstieg\n„${sie ? 'Guten Tag' : 'Hi'}, hier ${me}${brand}. ${who}“\n\n2. Aufhänger\n„${rl ? cap(rl) + ' ' : ''}${cap(h)}“\n\n3. Frage stellen, dann zuhören\n„${sie ? 'Wie kommen neue Kunden heute zu Ihnen – eher über Google oder über Empfehlung?' : 'Wie kommen neue Kunden gerade zu euch – eher über Google oder über Empfehlung?'}“\n\n4. Termin\n„${ask}“\n\nEinwand „kein Bedarf“: „${sie ? 'Verstehe. Darf ich Ihnen trotzdem kurz zeigen, was uns aufgefallen ist? Dann entscheiden Sie selbst.' : 'Klar. Darf ich dir trotzdem kurz zeigen, was uns aufgefallen ist? Dann entscheidest du selbst.'}“\nEinwand „zu teuer“: „${sie ? 'Über Geld reden wir, wenn Sie gesehen haben, was es bringt.' : 'Über Geld reden wir, wenn du gesehen hast, was es bringt.'}“${facts.length ? '\n\nFakten für dich (nicht vorlesen):\n' + facts.join('\n') : ''}`;
  }

  window.Pitch = { build, formal, settings };
})();
