/**
 * Scrapes datos UFC de fuentes públicas y actualiza src/data/*.json:
 *   - events.json      → próximos 3 eventos para el home (Wikipedia)
 *   - events-all.json  → todos los próximos eventos con slug (Wikipedia)
 *   - fighters.json    → campeones actuales con datos físicos (Wikipedia + API-Sports)
 *   - results.json     → últimos 4 resultados del evento más reciente (Sherdog)
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

function makeSlug(name: string, date: string) {
  return `${name}-${date}`
    .toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fighterSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

type EventRow = {
  slug: string; name: string; date: string; dateLabel: string;
  loc: string; main: string; bg: string; color: string;
};
type EventRowFull = Omit<EventRow, 'bg' | 'color'> & {
  f1: string; f1img: string;
  f2: string; f2img: string;
};

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

  const parsed: EventRowFull[] = [];
  table.find('tr').slice(1).each((_, tr) => {
    const cells = $(tr).find('td');
    if (!cells.length) return;
    const fullName = clean($(cells[Math.max(iEvent, 0)]).text());
    const dateRaw = clean($(cells[Math.max(iDate, 1)]).text());
    const locCell = clean($(cells[iLoc >= 0 ? iLoc : iVenue >= 0 ? iVenue : 3]).text());
    const [namePart, ...rest] = fullName.split(':');
    const { date, dateLabel } = parseDate(dateRaw);
    const name = namePart.trim();
    const main = rest.join(':').trim() || 'TBD';
    const [f1, f2] = main !== 'TBD' ? main.split(' vs. ').map(s => s.trim()) : ['TBD', 'TBD'];
    parsed.push({ slug: makeSlug(name, date), name, main, loc: locCell, date, dateLabel, f1: f1 ?? '', f2: f2 ?? '', f1img: '', f2img: '' });
  });

  parsed.sort((a, b) => a.date.localeCompare(b.date));

  // Enriquecer con fotos de fighters vía API (solo eventos con main event confirmado)
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  async function fetchFighterPhoto(name: string): Promise<string> {
    if (!name || name === 'TBD' || !API_KEY) return '';
    try {
      const results = await apiGet<ApiSportsFighter>(
        `/fighters?search=${encodeURIComponent(name.split(' ').slice(0, 2).join(' '))}`
      );
      const lastName = name.split(' ').slice(-1)[0]?.toLowerCase() ?? '';
      const match = results.find(f => f.name.toLowerCase().includes(lastName)) ?? results[0];
      return match?.photo ?? '';
    } catch { return ''; }
  }

  // Cargar fotos existentes para no re-fetchear innecesariamente
  const existing: EventRowFull[] = readJson<EventRowFull>('events-all.json');
  const existingMap = Object.fromEntries(existing.map(e => [e.slug, e]));

  for (const e of parsed) {
    if (e.main === 'TBD') continue;
    const prev = existingMap[e.slug];
    // Solo re-fetchear si no tenemos foto ya guardada
    if (prev?.f1img && prev?.f2img) {
      e.f1img = prev.f1img;
      e.f2img = prev.f2img;
      continue;
    }
    console.log(`   → Buscando fotos: ${e.f1} vs ${e.f2}`);
    e.f1img = await fetchFighterPhoto(e.f1);
    await sleep(7000);
    e.f2img = await fetchFighterPhoto(e.f2);
    await sleep(7000);
  }

  // events-all.json: todos los eventos próximos con slug y fotos (para /eventos)
  writeJson('events-all.json', parsed);
  console.log(`✓ events-all.json (${parsed.length} eventos con fotos)`);

  // events.json: top 3 con paleta de color (para el home)
  const events: EventRow[] = parsed.slice(0, 3).map((e, i) => ({ ...e, ...PALETTES[i % PALETTES.length] }));
  writeJson('events.json', events);
  console.log(`✓ events.json (${events.length} para el home)`);
  events.forEach(e => console.log(`   · ${e.name} — ${e.main} (${e.dateLabel})`));
}

// ─── FIGHTERS / CHAMPIONS (Wikipedia lista + API-Sports datos) ──────────────

type Fighter = {
  slug: string; name: string; nick: string; div: string; rec: string;
  from: string; rank: string; img: string;
  height: string; weight: string; reach: string; stance: string; team: string;
};

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
  height: string; weight: string; reach: string; stance: string;
  team: { id: number; name: string } | null;
};
type ApiSportsRecord = {
  fighter: { id: number; name: string; photo: string };
  total: { win: number; loss: number; draw: number };
};

async function fetchFighters() {
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

  // 2. Para cada campeón: buscar en API-Sports (perfil completo + récord)
  const champions: Fighter[] = [];
  for (const { name, div } of championNames) {
    try {
      const results = await apiGet<ApiSportsFighter>(
        `/fighters?search=${encodeURIComponent(name.split(' ').slice(0, 2).join(' '))}`
      );

      const lastName = name.split(' ').slice(-1)[0]?.toLowerCase() ?? '';
      const match = results.find(f => f.name.toLowerCase().includes(lastName)) ?? results[0];

      let rec = '—';
      let nat = '';
      let nick = '';
      let img = '';
      let height = '';
      let weight = '';
      let reach = '';
      let stance = '';
      let team = '';

      if (match) {
        await sleep(7000);
        const recData = await apiGet<ApiSportsRecord>(`/fighters/records?id=${match.id}`);
        if (recData[0]) {
          const r = recData[0].total;
          rec = `${r.win}-${r.loss}-${r.draw}`;
        }
        // Campos de la API
        nick    = match.nickname || byName[name.toLowerCase()]?.nick || '';
        nat     = NAT_ES[match.nationality] ?? match.nationality ?? byName[name.toLowerCase()]?.from ?? '';
        img     = match.photo || byName[name.toLowerCase()]?.img || '';
        height  = match.height  || byName[name.toLowerCase()]?.height || '';
        weight  = match.weight  || byName[name.toLowerCase()]?.weight || '';
        reach   = match.reach   || byName[name.toLowerCase()]?.reach  || '';
        stance  = match.stance  || byName[name.toLowerCase()]?.stance || '';
        team    = match.team?.name || byName[name.toLowerCase()]?.team || '';
      }

      champions.push({ slug: fighterSlug(name), name, nick, div, rec, from: nat, rank: 'C', img, height, weight, reach, stance, team });
      console.log(`   · [${div}] ${name} ${rec} h="${height}" w="${weight}" stance="${stance}" team="${team}"`);
      await sleep(7000);
    } catch (e) {
      console.warn(`   ⚠ No se pudo enriquecer ${name}: ${(e as Error).message}`);
      const prev = byName[name.toLowerCase()];
      champions.push({
        slug: fighterSlug(name), name, nick: prev?.nick || '', div, rec: prev?.rec || '—',
        from: prev?.from || '', rank: 'C', img: prev?.img || '',
        height: prev?.height || '', weight: prev?.weight || '',
        reach: prev?.reach || '', stance: prev?.stance || '', team: prev?.team || '',
      });
      await sleep(7000);
    }
  }

  if (!champions.length) throw new Error('Fighters: 0 campeones procesados');
  writeJson('fighters.json', champions);
  console.log(`✓ fighters.json (${champions.length} campeones con datos físicos via API)`);
}

// ─── RESULTS (Sherdog) ──────────────────────────────────────────────────────

type Result = { w: string; l: string; method: string; round: number; time: string; event: string };

function sherdonName($: cheerio.CheerioAPI, cell: cheerio.Cheerio<cheerio.AnyNode>): string {
  const nameSpan = cell.find('span[itemprop="name"]').first();
  if (nameSpan.length) {
    return nameSpan.html()?.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ?? '';
  }
  return clean(cell.find('a').first().text());
}

async function fetchResults() {
  const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; QuimbaraBot/1.0)' };

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
  $ev('table.new_table.result tr').slice(1, 6).each((_, tr) => {
    const cells = $ev(tr).find('td');
    if (cells.length < 5) return;

    const w = sherdonName($ev, $ev(cells[1]));
    const l = sherdonName($ev, $ev(cells[3]));
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
