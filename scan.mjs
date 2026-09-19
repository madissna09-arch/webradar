// Scan ohne Server — fuer GitHub Actions oder die Kommandozeile.
//   node scan.mjs "Friseur" "Osnabrück" 3 [such-id]
// Schreibt data/leads.json und data/searches.json.
import { runScan, rescoreAll } from './lib/pipeline.mjs';
import { flush } from './lib/store.mjs';

const [branche, ort, tiefe = '3', id] = process.argv.slice(2);
if (!branche || !ort) {
  console.error('Aufruf: node scan.mjs <Branche> <Ort> [Tiefe 1-6] [Such-ID]');
  process.exit(2);
}

rescoreAll();
const job = {
  id: id || 's' + Date.now().toString(36),
  params: { branche: branche.trim(), ort: ort.trim(), tiefe: Math.max(1, Math.min(6, +tiefe || 3)) },
};

let failed = false;
try {
  await runScan(job, (type, data) => {
    if (type === 'log') console.log(data);
    if (type === 'progress' && data.phase === 'audit' && data.done % 10 === 0) console.log(`  Websites ${data.done}/${data.total}`);
    if (type === 'error') console.error('Fehler:', data);
  });
} catch {
  failed = true;
}
flush();
process.exit(failed ? 1 : 0);
