// scripts/fetch-rankings.mjs
// Scrapea rankings oficiales UFC.com → actualiza rank de fighters.json
// Fuente única de verdad para campeones y top 15 por división.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'data');

// Mapeo división UFC.com (español/inglés) → división interna
const DIV_MAP = {
  'Peso mosca':              'Flyweight',
  'Peso gallo':              'Bantamweight',
  'Peso pluma':              'Featherweight',
  'Peso ligero':             'Lightweight',
  'Ligero':                  'Lightweight',
  'Peso wélter':             'Welterweight',
  'Peso welter':             'Welterweight',
  'Peso medio':              'Middleweight',
  'Peso semipesado':         'Light Heavyweight',
  'Peso pesado':             'Heavyweight',
  'De peso pesado':          'Heavyweight',
  'Peso paja femenino':      "Women's Strawweight",
  'Peso de la mujer':        "Women's Strawweight",
  'Peso mosca femenino':     "Women's Flyweight",
  'Peso gallo femenino':     "Women's Bantamweight",
  'Gallo de las mujeres':    "Women's Bantamweight",
  // Inglés (fallback)
  'Flyweight':               'Flyweight',
  'Bantamweight':             'Bantamweight',
  'Featherweight':            'Featherweight',
  'Lightweight':              'Lightweight',
  'Welterweight':             'Welterweight',
  'Middleweight':             'Middleweight',
  'Light Heavyweight':        'Light Heavyweight',
  'Heavyweight':              'Heavyweight',
  "Women's Strawweight":      "Women's Strawweight",
  "Women's Flyweight":        "Women's Flyweight",
  "Women's Bantamweight":     "Women's Bantamweight",
};

function slugify(name) {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[''']/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

async function fetchRankings() {
  console.log('🏆 Fetching UFC.com rankings…');
  const res = await fetch('https://www.ufc.com/rankings', {
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`UFC.com rankings: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Map slug → rank ('C' o '1'..'15') + división
  const rankBySlug = new Map();
  const divBySlug = new Map();

  $('.view-grouping').each((_, group) => {
    const divRaw = $(group).find('.view-grouping-header').text().trim();
    const div = DIV_MAP[divRaw];
    if (!div) {
      // P4P y otros: skip
      if (!/pound|p4p/i.test(divRaw)) console.log(`   ⚠ división no mapeada: "${divRaw}"`);
      return;
    }

    // Campeón (header)
    const champName = $(group).find('.rankings--athlete--champion h5 a').text().trim()
                   || $(group).find('.info h5 a').first().text().trim();
    if (champName) {
      const s = slugify(champName);
      rankBySlug.set(s, 'C');
      divBySlug.set(s, div);
      console.log(`   [C] ${champName.padEnd(28)} ${div}`);
    }

    // Contenders (tbody)
    $(group).find('tbody tr').each((i, tr) => {
      const tds = $(tr).find('td');
      const rankNum = $(tds[0]).text().trim();
      const name = $(tds[1]).find('a').first().text().trim() || $(tds[1]).text().trim();
      if (!name) return;
      const s = slugify(name);
      if (!rankBySlug.has(s)) {
        rankBySlug.set(s, rankNum);
        divBySlug.set(s, div);
      }
    });
  });

  console.log(`\n✓ ${rankBySlug.size} rankings scrapeados\n`);
  return { rankBySlug, divBySlug };
}

async function main() {
  const { rankBySlug, divBySlug } = await fetchRankings();

  const fightersPath = join(DATA_DIR, 'fighters.json');
  const fighters = JSON.parse(readFileSync(fightersPath, 'utf8'));

  let updated = 0, demoted = 0, divFixed = 0;

  for (const f of fighters) {
    const newRank = rankBySlug.get(f.slug);
    const newDiv = divBySlug.get(f.slug);

    if (newRank !== undefined) {
      if (f.rank !== newRank) { f.rank = newRank; updated++; }
      if (newDiv && f.div !== newDiv) { f.div = newDiv; divFixed++; }
    } else if (f.rank) {
      // Estaba ranqueado, ya no aparece — quitar rank
      delete f.rank;
      demoted++;
    }
  }

  writeFileSync(fightersPath, JSON.stringify(fighters, null, 2) + '\n');
  console.log(`✓ ${updated} ranks asignados/actualizados`);
  console.log(`✓ ${demoted} ranks removidos (ya no en top 15)`);
  console.log(`✓ ${divFixed} divisiones corregidas`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
