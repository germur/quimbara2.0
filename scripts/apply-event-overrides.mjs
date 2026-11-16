// scripts/apply-event-overrides.mjs
// Aplica events-overrides.json sobre events.json y events-all.json.
// Útil para eventos especiales (ej. UFC en La Casa Blanca) que Wikipedia/Sherdog
// aún no indexan. Mantiene los eventos especiales pinned al inicio si están
// próximos.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Criterio compartido con src/pages/eventos/index.astro
import { dedupeEventos } from '../src/lib/eventos.mjs';

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

function applyOverrides(list, overrides, today) {
  const map = new Map(list.map(e => [e.slug, e]));
  for (const ov of overrides) {
    const override = { ...ov, status: ov.date < today ? 'completed' : 'upcoming' };
    // Never delete other events merely because they share a date.
    // Si ya existe por slug → merge; si no → agregar
    if (map.has(ov.slug)) {
      map.set(ov.slug, { ...map.get(ov.slug), ...override });
    } else {
      map.set(ov.slug, override);
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
  const today = new Date().toISOString().slice(0, 10);

  const all = loadJson('events-all.json', []);
  const mergedAll = applyOverrides(all, ovList, today);
  // ordenar cronológicamente
  mergedAll.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  saveJson('events-all.json', mergedAll);
  console.log(`✓ events-all.json: ${mergedAll.length} eventos (${ovList.length} overrides aplicados)`);

  // events.json (solo próximos 3, orden CRONOLÓGICO estricto)
  const upcoming = dedupeEventos(mergedAll)
    // Solo la fecha decide (igual que en /eventos/): el scraper marca
    // 'completed' eventos futuros, y ese filtro los borraba de la home.
    .filter(e => (e.date || '') >= today && e.status !== 'unconfirmed' && e.main !== 'TBD')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(0, 3)
    .map((e, i) => ({ ...e, ...PALETTES[i % PALETTES.length] }));

  saveJson('events.json', upcoming);
  console.log(`✓ events.json: ${upcoming.length} próximos eventos para el home`);
  upcoming.forEach(e => console.log(`   • ${e.dateLabel.padEnd(15)} ${e.name} — ${e.main}`));
}

main();
