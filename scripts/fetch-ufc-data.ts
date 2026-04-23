/**
 * Scrapes datos UFC de fuentes públicas y actualiza src/data/*.json:
 *   - events.json   → próximos 3 eventos (Wikipedia)
 *   - fighters.json → campeones actuales (Wikipedia), merge con datos editoriales
 *   - results.json  → últimos 4 resultados del evento más reciente (ufcstats.com)
 *
 * Run: npx tsx scripts/fetch-ufc-data.ts
 * CI:  .github/workflows/update-data.yml (cron lunes)
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'data');

const HEADERS = { 'User-Agent': 'QuimbaraBot/1.0 (github.com/quimbara)' };

// ─── Paleta Quimbara ────────────────────────────────────────────────────────

const PALETTES = [
  { bg: '#FFD600', color: '#111' },
  { bg: '#E53935', color: '#fff' },
  { bg: '#7B1FA2', color: '#fff' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function clean(text: string) {
  return text.replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
}

function readJson<T>(filename: string): T[] {
  const p = join(DATA_DIR, filename);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
}

function writeJson(filename: string, data: unknown) {
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function fetchHtml(url: string, extraHeaders?: Record<string, string>): Promise<cheerio.CheerioAPI> {
  const res = await fetch(url, { headers: { ...HEADERS, ...extraHeaders } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return cheerio.load(await res.text());
}

function colIndexMap($: cheerio.CheerioAPI, table: cheerio.Cheerio<cheerio.AnyNode>) {
  const headers: string[] = [];
  table.find('tr').first().find('th').each((_, el) => {
    headers.push($(el).text().toLowerCase().trim());
  });
  return (needle: string) => headers.findIndex((h) => h.includes(needle));
}

// ─── EVENTS (Wikipedia) ─────────────────────────────────────────────────────

type EventRow = { name: string; date: string; dateLabel: string; loc: string; main: string; bg: string; color: string };

function parseDate(raw: string) {
  const d = new Date(clean(raw));
  if (isNaN(d.getTime())) return { date: raw, dateLabel: raw };
  return {
    date: d.toISOString().slice(0, 10),
    dateLabel: d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', ''),
  };
}

async function fetchEvents() {
  const $ = await fetchHtml('https://en.wikipedia.org/wiki/List_of_UFC_events');

  const heading = $('h2, h3').filter((_, el) => /scheduled/i.test($(el).text())).first();
  const container = heading.closest('.mw-heading').length ? heading.closest('.mw-heading') : heading;
  const table = container.nextAll('table.wikitable').first();
  if (!table.length) throw new Error('Events: "Scheduled events" table not found');

  const col = colIndexMap($, table);
  const iEvent = col('event'), iDate = col('date'), iVenue = col('venue'), iLoc = col('location');

  const parsed: Omit<EventRow, 'bg' | 'color'>[] = [];
  table.find('tr').slice(1).each((_, tr) => {
    const cells = $(tr).find('td');
    if (!cells.length) return;
    const fullName = clean($(cells[Math.max(iEvent, 0)]).text());
    const dateRaw = clean($(cells[Math.max(iDate, 1)]).text());
    const locCell = clean($(cells[iLoc >= 0 ? iLoc : iVenue >= 0 ? iVenue : 3]).text());
    const [namePart, ...rest] = fullName.split(':');
    parsed.push({ name: namePart.trim(), main: rest.join(':').trim() || 'TBD', loc: locCell, ...parseDate(dateRaw) });
  });

  parsed.sort((a, b) => a.date.localeCompare(b.date));
  const events: EventRow[] = parsed.slice(0, 3).map((e, i) => ({ ...e, ...PALETTES[i % PALETTES.length] }));
  writeJson('events.json', events);
  console.log(`✓ events.json (${events.length})`);
  events.forEach(e => console.log(`   · ${e.name} — ${e.main} (${e.dateLabel})`));
}

// ─── FIGHTERS / CHAMPIONS (Wikipedia) ───────────────────────────────────────

type Fighter = { name: string; nick: string; div: string; rec: string; from: string; rank: string; img: string };

// Mapeo de divisiones EN → ES
const DIV_ES: Record<string, string> = {
  'Heavyweight': 'Heavyweight',
  'Light Heavyweight': 'Light Heavyweight',
  'Middleweight': 'Middleweight',
  'Welterweight': 'Welterweight',
  'Lightweight': 'Lightweight',
  'Featherweight': 'Featherweight',
  'Bantamweight': 'Bantamweight',
  'Flyweight': 'Flyweight',
  "Women's Strawweight": "Strawweight (F)",
  "Women's Flyweight": "Flyweight (F)",
  "Women's Bantamweight": "Bantamweight (F)",
  "Women's Featherweight": "Featherweight (F)",
};

async function fetchFighters() {
  const existing: Fighter[] = readJson<Fighter>('fighters.json');
  const byName = Object.fromEntries(existing.map(f => [f.name.toLowerCase(), f]));

  const $ = await fetchHtml('https://en.wikipedia.org/wiki/UFC_champions');

  // Tabla tiene columnas: Division | Champion | Since | Defenses (sin récord W-L)
  const champions: Fighter[] = [];
  $('table.wikitable').each((_, table) => {
    const col = colIndexMap($, $(table));
    const iDiv = Math.max(col('division'), col('weight'), 0);
    const iName = Math.max(col('champion'), col('fighter'), 1);

    $(table).find('tr').slice(1).each((_, tr) => {
      const cells = $(tr).find('td, th');
      // Filas con <4 celdas son interinos bajo un rowspan de División — se omiten
      if (cells.length < 4 || champions.length >= 6) return;

      const divRaw = clean($(cells[iDiv]).text());
      const div = DIV_ES[divRaw] ?? divRaw;
      // Nombre puede estar en <a> o directo en la celda
      const nameCell = $(cells[iName]);
      const nameRaw = clean(nameCell.find('a').first().text() || nameCell.text());

      if (!nameRaw || /vacant/i.test(nameRaw)) return;

      const prev = byName[nameRaw.toLowerCase()];
      champions.push({
        name: nameRaw,
        nick:  prev?.nick  ?? '',
        div,
        rec:   prev?.rec   ?? '—',    // Wikipedia no tiene W-L; preservamos el existente
        from:  prev?.from  ?? '',
        rank: 'C',
        img:   prev?.img   ?? '',
      });
    });
  });

  if (!champions.length) throw new Error('Fighters: 0 champions parsed');
  writeJson('fighters.json', champions);
  console.log(`✓ fighters.json (${champions.length} campeones)`);
  champions.forEach(f => console.log(`   · [${f.div}] ${f.name}`));
}

// ─── RESULTS (ufcstats.com) ──────────────────────────────────────────────────

type Result = { w: string; l: string; method: string; round: number; time: string; event: string };

function sherdonName($: cheerio.CheerioAPI, cell: cheerio.Cheerio<cheerio.AnyNode>): string {
  // Nombres en Sherdog: <a><span itemprop="name">First<br>Last</span></a>
  // .text() los une sin espacio → usamos el HTML para insertar un espacio donde está el <br>
  const nameSpan = cell.find('span[itemprop="name"]').first();
  if (nameSpan.length) {
    return nameSpan.html()?.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ?? '';
  }
  return clean(cell.find('a').first().text());
}

async function fetchResults() {
  const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; QuimbaraBot/1.0)' };

  // Sherdog recent-events: segunda tabla = eventos completados, fila 1 = más reciente
  const $list = await fetchHtml(
    'https://www.sherdog.com/organizations/Ultimate-Fighting-Championship-UFC-2/recent-events/1',
    UA
  );
  const pastTable = $list('table').eq(1);
  const firstRow = pastTable.find('tr').eq(1);
  const eventPath = firstRow.find('a').first().attr('href');
  const eventName = clean(firstRow.find('a').first().text());
  if (!eventPath) throw new Error('Results: no se encontró enlace al último evento en Sherdog');

  const $ev = await fetchHtml(`https://www.sherdog.com${eventPath}`, UA);

  const results: Result[] = [];
  // table.new_table.result: fila 0 = header, filas 1-N = peleas (main event primero)
  $ev('table.new_table.result tr').slice(1, 6).each((_, tr) => {
    const cells = $ev(tr).find('td');
    if (cells.length < 5) return;

    const w = sherdonName($ev, $ev(cells[1]));
    const l = sherdonName($ev, $ev(cells[3]));
    // Método: primera línea de .winby (la segunda es el árbitro)
    const method = $ev(cells[4]).text().split('\n').map(s => s.trim()).filter(Boolean)[0] ?? '—';
    const round = parseInt($ev(cells[5]).text().trim()) || 1;
    const time = $ev(cells[6]).text().trim();

    if (w && l) results.push({ w, l, method, round, time, event: eventName });
  });

  if (!results.length) throw new Error('Results: 0 peleas parseadas de Sherdog');
  writeJson('results.json', results.slice(0, 4));
  console.log(`✓ results.json (${Math.min(results.length, 4)} resultados de "${eventName}")`);
  results.slice(0, 4).forEach(r => console.log(`   · ${r.w} def. ${r.l} · ${r.method} R${r.round}`));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const tasks = [
    { name: 'Events',   fn: fetchEvents  },
    { name: 'Fighters', fn: fetchFighters },
    { name: 'Results',  fn: fetchResults  },
  ];

  let failed = 0;
  for (const { name, fn } of tasks) {
    try {
      console.log(`\n── ${name} ──`);
      await fn();
    } catch (err) {
      console.error(`✗ ${name} falló:`, (err as Error).message);
      failed++;
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} tarea(s) fallaron. El resto se actualizó.`);
    process.exit(1);
  }
  console.log('\n✓ Todo actualizado.');
}

main().catch(err => { console.error(err); process.exit(1); });
