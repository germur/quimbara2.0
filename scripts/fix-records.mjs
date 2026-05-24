// scripts/fix-records.mjs
// Arregla el récord profesional de TODOS los peleadores rankeados usando UFC.com
// como fuente canónica. El scraper anterior solo guardaba récord UFC (no pro completo).
//
// Uso: node scripts/fix-records.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dir = dirname(fileURLToPath(import.meta.url));
const FIGHTERS_PATH = join(__dir, '..', 'src', 'data', 'fighters.json');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode)) return fetch(res.headers.location).then(resolve, reject);
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

async function getUfcRecord(slug) {
  try {
    const r = await fetch(`https://www.ufc.com/athlete/${slug}`);
    if (r.status !== 200) return null;
    const m = r.body.match(/<p class="hero-profile__division-body">\s*([0-9]+-[0-9]+-[0-9]+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('🥊 Arreglando récords profesionales desde UFC.com\n');
  const fighters = JSON.parse(readFileSync(FIGHTERS_PATH, 'utf8'));

  const ranked = fighters.filter(f => f.rank === 'C' || (!isNaN(Number(f.rank)) && Number(f.rank) <= 15));
  console.log(`Total rankeados a verificar: ${ranked.length}\n`);

  let fixed = 0, unchanged = 0, missing = 0;
  for (let i = 0; i < ranked.length; i++) {
    const f = ranked[i];
    const real = await getUfcRecord(f.slug);
    const tag = `[${(i + 1).toString().padStart(3, ' ')}/${ranked.length}]`;
    if (!real) {
      console.log(`${tag} ✗ ${f.name.padEnd(30)} → no encontrado en UFC.com (rec actual: ${f.rec})`);
      missing++;
    } else if (real !== f.rec) {
      console.log(`${tag} ✓ ${f.name.padEnd(30)} ${f.rec.padStart(10)} → ${real}`);
      // mutate the original object in fighters[]
      const orig = fighters.find(x => x.slug === f.slug);
      orig.rec = real;
      fixed++;
    } else {
      unchanged++;
    }
    await sleep(150); // gentle rate limit
  }

  writeFileSync(FIGHTERS_PATH, JSON.stringify(fighters, null, 2) + '\n', 'utf8');
  console.log(`\n📊 Resumen:`);
  console.log(`   ✓ Corregidos: ${fixed}`);
  console.log(`   = Sin cambios: ${unchanged}`);
  console.log(`   ✗ No encontrados en UFC.com: ${missing}`);
}

main().catch(e => { console.error(e); process.exit(1); });
