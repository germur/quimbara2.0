// scripts/fix-records.mjs
// Arregla el récord profesional de TODOS los peleadores INDEXABLES (ranked o con
// foto) usando UFC.com como fuente canónica. El scraper de CSVs solo da récord
// UFC (ufcRec); aquí `rec` pasa a ser el récord pro completo y se marca con
// `recScope: 'pro'` para que la UI/meta pueda etiquetarlo correctamente
// ("Récord profesional" vs "Récord UFC").
//
// Uso: node scripts/fix-records.mjs
//
// Rate limit: 1 req/s — UFC.com está detrás de Cloudflare; 150ms provocaba
// riesgo de IP ban (que rompería fotos + rankings + records a la vez).
// Exit code: 2 si el % de "no encontrado" supera el umbral (datos sospechosos).

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {fetchBounded} from './lib/fetch.mjs';
import {recordHealth} from './lib/health.mjs';
import { isIndexable } from '../src/lib/indexable.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const FIGHTERS_PATH = join(__dir, '..', 'src', 'data', 'fighters.json');

const SLEEP_MS = 1000;          // gentle de verdad (Cloudflare)
const MISSING_THRESHOLD = 0.20; // >20% no encontrados -> exit 2


async function getUfcRecord(slug) {
  try {
    const r = await fetchBounded(`https://www.ufc.com/athlete/${slug}`,{headers:{'User-Agent':'Mozilla/5.0'}});
    const body=await r.text();
    if (r.status !== 200) return null;
    const m = body.match(/<p class="hero-profile__division-body">\s*([0-9]+-[0-9]+-[0-9]+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('Arreglando récords profesionales desde UFC.com\n');
  const fighters = JSON.parse(readFileSync(FIGHTERS_PATH, 'utf8'));

  // Todos los indexables (ranked o con foto) — son los que compiten en el índice
  // y por tanto donde un récord mal etiquetado daña E-E-A-T.
  const targets = fighters.filter(isIndexable);
  console.log(`Total indexables a verificar: ${targets.length} (a ~1 req/s = ~${Math.ceil(targets.length / 60)} min)\n`);

  let fixed = 0, unchanged = 0, missing = 0;
  for (let i = 0; i < targets.length; i++) {
    const f = targets[i];
    const real = await getUfcRecord(f.slug);
    const tag = `[${(i + 1).toString().padStart(4, ' ')}/${targets.length}]`;
    if (!real) {
      console.log(`${tag} X ${f.name.padEnd(30)} -> no encontrado en UFC.com (rec actual: ${f.rec})`);
      missing++;
    } else {
      // mutate the original object in fighters[]
      const orig = fighters.find(x => x.slug === f.slug);
      if (real !== f.rec) {
        console.log(`${tag} ✓ ${f.name.padEnd(30)} ${f.rec.padStart(10)} -> ${real}`);
        orig.rec = real;
        fixed++;
      } else {
        unchanged++;
      }
      orig.recordCheckedAt=new Date().toISOString();
      orig.recordSourceUrl=`https://www.ufc.com/athlete/${f.slug}`;
      orig.recScope = 'pro'; // confirmado: rec es el récord pro completo
    }
    await sleep(SLEEP_MS);
  }

  writeFileSync(FIGHTERS_PATH, JSON.stringify(fighters, null, 2) + '\n', 'utf8');

  const missingPct = targets.length ? missing / targets.length : 0;
  console.log(`\nResumen:`);
  console.log(`   ✓ Corregidos: ${fixed}`);
  console.log(`   = Sin cambios (confirmados pro): ${unchanged}`);
  console.log(`   X No encontrados en UFC.com: ${missing} (${(missingPct * 100).toFixed(1)}%)`);

  recordHealth('records',missingPct<=MISSING_THRESHOLD,{fixed,unchanged,missing});
  if (missingPct > MISSING_THRESHOLD) {
    console.error(`\nERROR: ${(missingPct * 100).toFixed(1)}% de fallos supera el umbral del ${MISSING_THRESHOLD * 100}%.`);
    console.error('   Posibles causas: bloqueo de Cloudflare, cambio de layout en UFC.com, o red caída.');
    console.error('   Los datos se guardaron igualmente, pero revisa antes de publicar.');
    process.exit(2);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
