// scripts/apply-event-overrides.mjs
// Aplica events-overrides.json sobre events.json y events-all.json.
// Útil para eventos especiales (ej. UFC en La Casa Blanca) que Wikipedia/Sherdog
// aún no indexan. Mantiene los eventos especiales pinned al inicio si están
// próximos.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, '..', 'src', 'data');

const PALETTES = [
  { bg: '#FFD600', color: '#111' },
  { bg: '#E53935', color: '#fff' },
  { bg: '#7B1FA2', color: '#fff' },
];

function loadJson(file, fallback) {
  const p = join(DATA_DIR, file);
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function saveJson(file, data) {
  writeFileSync(join(DATA_DIR, file), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function applyOverrides(list, overrides) {
  const map = new Map(list.map(e => [e.slug, e]));
  for (const ov of overrides) {
    if (map.has(ov.slug)) {
      // merge campo por campo (override gana)
      map.set(ov.slug, { ...map.get(ov.slug), ...ov });
    } else {
      map.set(ov.slug, ov);
    }
  }
  return Array.from(map.values());
}

function main() {
  console.log('🎯 Aplicando event overrides…\n');

  const overrides = loadJson('events-overrides.json', { events: [] });
  const ovList = overrides.events || [];
  if (!ovList.length) {
    console.log('No hay overrides definidos. Nada que hacer.');
    return;
  }

  // events-all.json (lista completa)
  const all = loadJson('events-all.json', []);
  const mergedAll = applyOverrides(all, ovList);
  // ordenar cronológicamente
  mergedAll.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  saveJson('events-all.json', mergedAll);
  console.log(`✓ events-all.json: ${mergedAll.length} eventos (${ovList.length} overrides aplicados)`);

  // events.json (solo próximos 3 con paleta para el home)
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = mergedAll
    .filter(e => (e.date || '') >= today && e.status !== 'completed')
    .sort((a, b) => {
      // pinear isSpecial primero si está dentro de los próximos 60 días
      const da = new Date(a.date), db = new Date(b.date);
      const aSoon = (da - new Date()) / 86400000 < 90;
      const bSoon = (db - new Date()) / 86400000 < 90;
      if (a.isSpecial && aSoon && !(b.isSpecial && bSoon)) return -1;
      if (b.isSpecial && bSoon && !(a.isSpecial && aSoon)) return 1;
      return (a.date || '').localeCompare(b.date || '');
    })
    .slice(0, 3)
    .map((e, i) => ({ ...e, ...PALETTES[i % PALETTES.length] }));

  saveJson('events.json', upcoming);
  console.log(`✓ events.json: ${upcoming.length} próximos eventos para el home`);
  upcoming.forEach(e => console.log(`   • ${e.dateLabel.padEnd(15)} ${e.name} — ${e.main}`));
}

main();
