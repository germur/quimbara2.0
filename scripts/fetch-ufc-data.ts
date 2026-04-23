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

// ─── API-Sports MMA ─────────────────────────────────────────────────────────
// Free plan: fighters/records disponibles sin límite de fecha.
// Peleas históricas requieren plan de pago — usamos Wikipedia/Sherdog para eso.
const API_KEY = process.env.API_SPORTS_KEY ?? '';
const API_BASE = 'https://v1.mma.api-sports.io';

async function apiGet<T>(path: string): Promise<T[]> {
  if (!API_KEY) throw new Error('API_SPORTS_KEY no definida');
  const res = await fetch(API_BASE + path, {
    headers: { 'x-apisports-key': API_KEY },
  });
  if (!res.ok) throw new Error(`API-Sports ${path} → HTTP ${res.status}`);
  const json = await res.json() as { response: T[]; errors: unknown };
  if (json.errors && Object.keys(json.errors).length) {
    throw new Error(`API-Sports error: ${JSON.stringify(json.errors)}`);
  }
  return json.response ?? [];
}

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

// ─── FIGHTERS / CHAMPIONS (Wikipedia lista + API-Sports datos) ──────────────

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

// Mapeo de nacionalidad en inglés → español
const NAT_ES: Record<string, string> = {
  'American': 'EE.UU.', 'Brazilian': 'Brasil', 'Russian': 'Rusia',
  'British': 'Reino Unido', 'Australian': 'Australia', 'Georgian': 'Georgia',
  'Swedish': 'Suecia', 'Spanish': 'España', 'New Zealander': 'Nueva Zelanda',
  'Irish': 'Irlanda', 'Dutch': 'Países Bajos', 'Canadian': 'Canadá',
  'South African': 'Sudáfrica', 'Nigerian': 'Nigeria', 'Chinese': 'China',
};

type ApiSportsFighter = {
  id: number; name: string; nickname: string; photo: string;
  nationality: string; category: string;
};
type ApiSportsRecord = {
  fighter: { id: number; name: string; photo: string };
  total: { win: number; loss: number; draw: number };
};

async function fetchFighters() {
  // Cargar JSON existente para preservar campos que la API no devuelve (from, etc.)
  const existing: Fighter[] = readJson<Fighter>('fighters.json');
  const byName = Object.fromEntries(existing.map(f => [f.name.toLowerCase(), f]));

  // 1. Obtener lista de campeones actuales de Wikipedia
  const $ = await fetchHtml('https://en.wikipedia.org/wiki/UFC_champions');
  const championNames: { name: string; div: string }[] = [];

  $('table.wikitable').each((_, table) => {
    const col = colIndexMap($, $(table));
    const iDiv = Math.max(col('division'), col('weight'), 0);
    const iName = Math.max(col('champion'), col('fighter'), 1);

    $(table).find('tr').slice(1).each((_, tr) => {
      const cells = $(tr).find('td, th');
      if (cells.length < 4 || championNames.length >= 6) return;
      const divRaw = clean($(cells[iDiv]).text());
      const nameCell = $(cells[iName]);
      const nameRaw = clean(nameCell.find('a').first().text() || nameCell.text());
      if (!nameRaw || /vacant/i.test(nameRaw)) return;
      championNames.push({ name: nameRaw, div: DIV_ES[divRaw] ?? divRaw });
    });
  });

  if (!championNames.length) throw new Error('Fighters: 0 campeones en Wikipedia');

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // 2. Para cada campeón: buscar en API-Sports (perfil + récord)
  // Rate limit del plan free: 10 req/min → 7s entre llamadas (2 req/fighter)
  const champions: Fighter[] = [];
  for (const { name, div } of championNames) {
    try {
      const results = await apiGet<ApiSportsFighter>(
        `/fighters?search=${encodeURIComponent(name.split(' ').slice(0, 2).join(' '))}`
      );

      // Buscar la mejor coincidencia por apellido
      const lastName = name.split(' ').slice(-1)[0]?.toLowerCase() ?? '';
      const match = results.find(f => f.name.toLowerCase().includes(lastName)) ?? results[0];

      let rec = '—';
      let nat = '';
      let nick = '';
      let img = '';

      if (match) {
        await sleep(7000); // respetar rate limit 10 req/min
        const recData = await apiGet<ApiSportsRecord>(`/fighters/records?id=${match.id}`);
        if (recData[0]) {
          const r = recData[0].total;
          rec = `${r.win}-${r.loss}-${r.draw}`;
        }
        nick = match.nickname || byName[name.toLowerCase()]?.nick || '';
        nat = NAT_ES[match.nationality] ?? match.nationality ?? byName[name.toLowerCase()]?.from ?? '';
        img = match.photo || byName[name.toLowerCase()]?.img || '';
      }

      champions.push({ name, nick, div, rec, from: nat, rank: 'C', img });
      console.log(`   · [${div}] ${name} ${rec} nat="${nat}" nick="${nick}"`);
      await sleep(7000); // pausa antes del siguiente fighter
    } catch (e) {
      console.warn(`   ⚠ No se pudo enriquecer ${name}: ${(e as Error).message}`);
      champions.push({ name, nick: '', div, rec: '—', from: '', rank: 'C', img: '' });
      await sleep(7000);
    }
  }

  if (!champions.length) throw new Error('Fighters: 0 campeones procesados');
  writeJson('fighters.json', champions);
  console.log(`✓ fighters.json (${champions.length} campeones con foto + récord via API)`);
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
