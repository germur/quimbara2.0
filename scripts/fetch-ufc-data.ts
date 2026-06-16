/**
 * Pipeline de datos UFC para Quimbara — SIN APIs de pago.
 *
 * Fuentes (cada una usada SOLO para lo que es buena):
 *   - Greco1899/scrape_ufc_stats (CSVs públicos) → fighters base, stats por round,
 *                                                   form (últimas 5 peleas UFC),
 *                                                   ufcRec (peleas UFC contadas)
 *                                                   ⚠ NO usar para `rec` pro: solo tiene UFC
 *   - UFC.com athlete page  → `rec` pro completo (scripts/fix-records.mjs corre después)
 *                              → ranking + campeones (scripts/fetch-rankings.mjs)
 *                              → fotos full-body (scripts/download-images.mjs)
 *   - Wikipedia             → eventos programados, fight cards (fallback record)
 *   - Sherdog               → resultados del último evento
 *
 * Orden del pipeline (npm run data:all):
 *   1. data:update    → este script (CSVs + Wikipedia + Sherdog)
 *   2. data:rankings  → UFC.com rankings
 *   3. data:records   → UFC.com pro records (sobrescribe rec)
 *   4. data:overrides → eventos especiales manuales
 *   5. data:images    → fotos faltantes
 *
 * Genera:
 *   - src/data/fighters.json
 *   - src/data/events.json      (próximos 3, con paleta para el home)
 *   - src/data/events-all.json  (todos, con fightCard)
 *   - src/data/results.json     (últimos 4 resultados)
 *
 * Run: npx tsx scripts/fetch-ufc-data.ts
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, '..', 'src', 'data');
const IMG_DIR   = join(__dirname, '..', 'public', 'fighters');

const HEADERS = { 'User-Agent': 'QuimbaraBot/1.0 (github.com/quimbara)' };

// ─── Paleta Quimbara (eventos home) ─────────────────────────────────────────
const PALETTES = [
  { bg: '#FFD600', color: '#111' },
  { bg: '#E53935', color: '#fff' },
  { bg: '#7B1FA2', color: '#fff' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function clean(text: string) {
  return text.replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[''']/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function makeEventSlug(name: string, date: string) {
  return `${name}-${date}`
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

/**
 * Escritura protegida: si una fuente (Wikipedia/Sherdog/CSV) devuelve vacío o
 * drásticamente menos que lo que ya había, NO sobreescribimos — conservamos lo
 * anterior y avisamos. Evita perder events.json/results.json en silencio cuando
 * un scraper revienta. Override consciente: FORCE_WRITE=1.
 */
function writeJson(filename: string, data: unknown) {
  const p = join(DATA_DIR, filename);

  if (process.env.FORCE_WRITE !== '1' && Array.isArray(data) && existsSync(p)) {
    try {
      const prev = JSON.parse(readFileSync(p, 'utf8'));
      if (Array.isArray(prev) && prev.length > 0) {
        if (data.length === 0) {
          console.error(`⛔ ${filename}: lo nuevo está VACÍO (antes: ${prev.length} filas). Se conserva el archivo anterior. (FORCE_WRITE=1 para forzar)`);
          process.exitCode = 1;
          return;
        }
        if (data.length < prev.length * 0.5) {
          console.error(`⛔ ${filename}: caída drástica ${prev.length} → ${data.length} filas. Se conserva el archivo anterior. (FORCE_WRITE=1 para forzar)`);
          process.exitCode = 1;
          return;
        }
      }
    } catch { /* anterior corrupto/ilegible → escribir normal */ }
  }

  writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function fetchHtml(url: string, extraHeaders?: Record<string, string>): Promise<cheerio.CheerioAPI> {
  const res = await fetch(url, { headers: { ...HEADERS, ...extraHeaders } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return cheerio.load(await res.text());
}

// ─── Wikipedia vía API (no scraping de URLs adivinadas) ─────────────────────
// La MediaWiki API da: títulos canónicos (sigue redirects y renombres) y el
// HTML del contenido (action=parse) sin depender del chrome de la página.

const WIKI_API = 'https://en.wikipedia.org/w/api.php';

async function wikiApi(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const res = await fetch(`${WIKI_API}?${qs}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Wikipedia API → HTTP ${res.status}`);
  return res.json();
}

/** HTML del contenido de un artículo, por título canónico. */
async function fetchWikiHtml(title: string): Promise<cheerio.CheerioAPI> {
  const json = await wikiApi({ action: 'parse', page: title, prop: 'text', redirects: '1' });
  if (json.error) throw new Error(`Wikipedia parse "${title}": ${json.error.info ?? json.error.code}`);
  return cheerio.load(json.parse.text);
}

/**
 * Resuelve el título canónico del artículo de un evento.
 * 1) Intento exacto vía action=query (sigue redirects — cubre renombres).
 * 2) Fallback: list=search, validando que el resultado se parezca de verdad al
 *    evento (empieza por su nombre e incluye a uno de los peleadores del main).
 * Antes esto era una URL construida a mano que reventaba si el título no coincidía.
 */
async function wikiResolveEventTitle(event: EventRowFull): Promise<string | null> {
  const exact = /^UFC \d+$/.test(event.name)
    ? event.name
    : `${event.name}: ${event.main}`;

  const q = await wikiApi({ action: 'query', titles: exact, redirects: '1' });
  const page = (q.query?.pages ?? [])[0];
  if (page && !page.missing && !page.invalid) return page.title;

  // Búsqueda como fallback
  const s = await wikiApi({ action: 'query', list: 'search', srsearch: `${event.name} ${event.main}`, srlimit: '5' });
  const surnames = [event.f1, event.f2]
    .filter(n => n && n !== 'TBD')
    .map(n => n.split(' ').slice(-1)[0].toLowerCase());
  for (const hit of s.query?.search ?? []) {
    const t = (hit.title as string);
    const tl = t.toLowerCase();
    const startsOk = tl.startsWith(event.name.toLowerCase());
    const fighterOk = surnames.length === 0 || surnames.some(sn => tl.includes(sn));
    if (startsOk && fighterOk) return t;
  }
  return null;
}

function colIndexMap($: cheerio.CheerioAPI, table: cheerio.Cheerio<cheerio.AnyNode>) {
  const headers: string[] = [];
  table.find('tr').first().find('th').each((_, el) => {
    headers.push($(el).text().toLowerCase().trim());
  });
  return (needle: string) => headers.findIndex((h) => h.includes(needle));
}

async function downloadCsv(url: string): Promise<string> {
  console.log(`  ⬇  ${url.split('/').pop()}`);
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

// ─── Formatters (formatos exactos de Quimbara) ──────────────────────────────

function formatHeight(s: string): string {
  if (!s || s === '--') return '';
  const m = s.match(/(\d+)'\s*(\d+)/);
  if (!m) return s;
  return `${m[1]}' ${m[2]}"`;
}

function formatWeight(s: string): string {
  if (!s || s === '--') return '';
  const m = s.match(/(\d+)/);
  if (!m) return '';
  return `${m[1]} lbs`;
}

function formatReach(s: string): string {
  if (!s || s === '--') return '';
  const m = s.match(/(\d+)/);
  if (!m) return '';
  return `${m[1]}"`;
}

function formatDivision(wc: string): string {
  if (!wc) return '';
  return wc
    .replace(/^UFC\s+/i, '')
    .replace(/ Title Bout$/, '')
    .replace(/ Bout$/, '')
    .trim();
}

function parseWinType(method: string): string {
  if (!method) return 'UD';
  const m = method.toLowerCase();
  if (m.includes('ko/tko') || m.includes('tko') || m.includes('ko')) return 'TKO';
  if (m.includes('submission')) return 'SUB';
  if (m.includes('split')) return 'SD';
  if (m.includes('majority')) return 'MD';
  if (m.includes('unanimous')) return 'UD';
  if (m.includes('decision')) return 'UD';
  if (m.includes('dq') || m.includes('disqualification')) return 'DQ';
  return 'UD';
}

// ─── Types ──────────────────────────────────────────────────────────────────

type FormEntry = { outcome: string; winType: string };

type Fighter = {
  slug: string; name: string; nick: string; div: string;
  /** Récord pro completo (canónico, viene de UFC.com vía scripts/fix-records.mjs) */
  rec: string;
  /** 'pro' cuando fix-records.mjs confirmó `rec` contra UFC.com — la UI/meta lo usa para etiquetar bien */
  recScope?: string;
  /** Récord UFC-only calculado desde los CSVs de Greco1899 (informacional) */
  ufcRec?: string;
  from: string; img: string;
  height: string; weight: string; reach: string; stance: string; team: string;
  form: string[];
  formTypes: FormEntry[];
  rank?: string;
};

type EventRow = {
  slug: string; name: string; date: string; dateLabel: string;
  loc: string; main: string; bg: string; color: string;
};

type FightCardEntry = {
  f1: string; f1Id: string;
  f2: string; f2Id: string;
  weightClass: string;
  bout: string;
  order: number;
};

type EventRowFull = Omit<EventRow, 'bg' | 'color'> & {
  f1: string; f1img: string;
  f2: string; f2img: string;
  fightCard?: FightCardEntry[];
  espnEventId?: string;
  status?: 'upcoming' | 'completed';
};

// ─── CSV Sources ────────────────────────────────────────────────────────────

const CSV_SOURCES = {
  tott:    'https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/ufc_fighter_tott.csv',
  details: 'https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/ufc_fighter_details.csv',
  fights:  'https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/ufc_fight_results.csv',
  events:  'https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/ufc_event_details.csv',
};

type FightRecord = {
  result: string;
  method: string;
  opponent: string;
  date: string;
  weightClass: string;
};

type CsvData = {
  tottByName: Map<string, Record<string, string>>;
  detailsByName: Map<string, Record<string, string>>;
  fightsByFighter: Map<string, FightRecord[]>;
};

let csvCache: CsvData | null = null;

async function loadCsvData(): Promise<CsvData> {
  if (csvCache) return csvCache;

  console.log('📥 Downloading CSVs from Greco1899/scrape_ufc_stats...');
  const [tottCsv, detailsCsv, fightsCsv, eventsCsv] = await Promise.all([
    downloadCsv(CSV_SOURCES.tott),
    downloadCsv(CSV_SOURCES.details),
    downloadCsv(CSV_SOURCES.fights),
    downloadCsv(CSV_SOURCES.events),
  ]);

  const tott    = parse(tottCsv,    { columns: true, skip_empty_lines: true, relax_quotes: true }) as Record<string, string>[];
  const details = parse(detailsCsv, { columns: true, skip_empty_lines: true, relax_quotes: true }) as Record<string, string>[];
  const fights  = parse(fightsCsv,  { columns: true, skip_empty_lines: true, relax_quotes: true }) as Record<string, string>[];
  const events  = parse(eventsCsv,  { columns: true, skip_empty_lines: true, relax_quotes: true }) as Record<string, string>[];

  console.log(`📊 Loaded: ${tott.length} profiles, ${details.length} details, ${fights.length} fights, ${events.length} events`);

  // Index: FIGHTER name → tott row
  const tottByName = new Map<string, Record<string, string>>();
  for (const t of tott) {
    const name = t.FIGHTER?.trim();
    if (name) tottByName.set(name, t);
  }

  // Index: full name → details row (nickname)
  const detailsByName = new Map<string, Record<string, string>>();
  for (const d of details) {
    const fullName = `${d.FIRST} ${d.LAST}`.trim();
    detailsByName.set(fullName, d);
  }

  // Index: event name → date
  const eventDates = new Map<string, string>();
  for (const e of events) {
    if (e.EVENT && e.DATE) {
      const d = new Date(e.DATE);
      if (!isNaN(d.getTime())) {
        eventDates.set(e.EVENT.trim(), d.toISOString().split('T')[0]);
      }
    }
  }

  // ─── Guard de frescura ────────────────────────────────────────────────────
  // TODA la base (fighters, peleas, form, ufcRec) depende de los CSVs de
  // Greco1899/scrape_ufc_stats. Si ese repo deja de actualizarse, los datos se
  // congelan EN SILENCIO. UFC celebra eventos casi cada semana: si el evento
  // más reciente del CSV tiene >21 días, algo va mal. Override: ALLOW_STALE=1.
  const newestEvent = [...eventDates.values()].sort().pop() ?? '';
  const staleDays = newestEvent
    ? Math.floor((Date.now() - new Date(newestEvent).getTime()) / 86_400_000)
    : Infinity;
  if (staleDays > 21) {
    const msg = `CSVs de Greco1899 posiblemente CONGELADOS: el evento más reciente es de ${newestEvent || 'fecha desconocida'} (hace ${staleDays === Infinity ? '∞' : staleDays} días).`;
    if (process.env.ALLOW_STALE === '1') {
      console.warn(`⚠ ${msg} Continuando por ALLOW_STALE=1.`);
    } else {
      throw new Error(`${msg} Verifica github.com/Greco1899/scrape_ufc_stats o corre con ALLOW_STALE=1.`);
    }
  } else {
    console.log(`✓ Frescura CSV OK: último evento ${newestEvent} (hace ${staleDays} días)`);
  }

  // Index: fighter name → array of fights (sorted by date desc)
  const fightsByFighter = new Map<string, FightRecord[]>();

  for (const fight of fights) {
    const bout = fight.BOUT;
    if (!bout) continue;
    const parts = bout.split(/\s+vs\.?\s+/);
    if (parts.length !== 2) continue;
    const a = parts[0].trim();
    const b = parts[1].trim();
    const eventName = fight.EVENT?.trim() ?? '';
    const date = eventDates.get(eventName) || '';
    const outcome = fight.OUTCOME || '';
    const [firstRes, secondRes] = outcome.split('/');

    for (const [name, isFirst] of [[a, true], [b, false]] as [string, boolean][]) {
      const res = isFirst ? firstRes : secondRes;
      let result: string;
      if (res === 'W') result = 'W';
      else if (res === 'L') result = 'L';
      else if (res === 'NC') result = 'NC';
      else result = 'D';

      if (!fightsByFighter.has(name)) fightsByFighter.set(name, []);
      fightsByFighter.get(name)!.push({
        result,
        method: (fight.METHOD || '').replace(/\s+/g, ' ').trim(),
        opponent: isFirst ? b : a,
        date,
        weightClass: fight.WEIGHTCLASS?.trim() || '',
      });
    }
  }

  // Sort by date descending
  for (const fs of fightsByFighter.values()) {
    fs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  csvCache = { tottByName, detailsByName, fightsByFighter };
  return csvCache;
}

// ─── FIGHTERS ───────────────────────────────────────────────────────────────

function buildFighter(
  name: string,
  csv: CsvData,
  fallback: Map<string, Fighter>,
  rankValue?: string,
): Fighter {
  const slug = slugify(name);
  const prev = fallback.get(slug);
  const tott = csv.tottByName.get(name);
  const detail = csv.detailsByName.get(name);
  const allFights = csv.fightsByFighter.get(name) || [];

  // ⚠ Record: los CSVs de Greco1899 SOLO contienen peleas UFC, no el récord pro completo.
  // Para el récord pro real usamos UFC.com → scripts/fix-records.mjs (corre después).
  // Aquí guardamos:
  //   - ufcRec: lo que sí podemos calcular (peleas UFC contadas en CSV) — informacional
  //   - rec:    preservamos el previo si existe (fix-records.mjs es la fuente canónica);
  //             si no hay previo (fighter nuevo), usamos ufcRec como semilla temporal
  let wins = 0, losses = 0, draws = 0;
  for (const f of allFights) {
    if (f.result === 'W') wins++;
    else if (f.result === 'L') losses++;
    else if (f.result === 'D') draws++;
  }
  const ufcRec = `${wins}-${losses}-${draws}`;
  const rec = prev?.rec && prev.rec !== '0-0-0' ? prev.rec : ufcRec;
  // recScope solo se conserva si `rec` se preservó del previo (si rec se
  // regeneró desde el CSV, vuelve a ser solo-UFC y la marca 'pro' ya no aplica)
  const recScope = rec === prev?.rec ? prev?.recScope : undefined;

  // Division from most recent fight
  const div = allFights.length > 0
    ? formatDivision(allFights[0].weightClass)
    : prev?.div ?? '';

  // Nickname: CSV first, then fallback
  const nick = detail?.NICKNAME?.trim() || prev?.nick || '';

  // Recent form (last 5 fights, already sorted desc)
  const recentFights = allFights.slice(0, 5);
  const form = recentFights.map(f => f.result);
  const formTypes: FormEntry[] = recentFights.map(f => ({
    outcome: f.result,
    winType: parseWinType(f.method),
  }));

  // Image: check existing files
  let img = '';
  if (existsSync(join(IMG_DIR, `${slug}.png`))) img = `/fighters/${slug}.png`;
  else if (existsSync(join(IMG_DIR, `${slug}.jpg`))) img = `/fighters/${slug}.jpg`;
  else if (prev?.img) img = prev.img;

  const fighter: Fighter = {
    slug,
    name,
    nick,
    div,
    rec,
    ...(recScope ? { recScope } : {}),
    ufcRec,
    from: prev?.from ?? '',
    img,
    height: tott ? formatHeight(tott.HEIGHT) : prev?.height ?? '',
    weight: tott ? formatWeight(tott.WEIGHT) : prev?.weight ?? '',
    reach:  tott ? formatReach(tott.REACH)   : prev?.reach  ?? '',
    stance: (tott?.STANCE && tott.STANCE !== '--') ? tott.STANCE : prev?.stance ?? '',
    team:   prev?.team ?? '',
    form,
    formTypes,
  };

  // rank: only add if provided (omit property entirely if not ranked)
  if (rankValue) {
    fighter.rank = rankValue;
  }

  return fighter;
}

// Top 5 contenders by division (seeds — updated from UFC rankings)
const CONTENDER_SEEDS: { name: string; div: string; rank: number }[] = [
  { name: 'Jon Jones',           div: 'Heavyweight',       rank: 1 },
  { name: 'Curtis Blaydes',      div: 'Heavyweight',       rank: 2 },
  { name: 'Sergei Pavlovich',    div: 'Heavyweight',       rank: 3 },
  { name: 'Ciryl Gane',          div: 'Heavyweight',       rank: 4 },
  { name: 'Alexander Volkov',    div: 'Heavyweight',       rank: 5 },
  { name: 'Alex Pereira',        div: 'Light Heavyweight', rank: 1 },
  { name: 'Jiri Prochazka',      div: 'Light Heavyweight', rank: 2 },
  { name: 'Jamahal Hill',        div: 'Light Heavyweight', rank: 3 },
  { name: 'Magomed Ankalaev',    div: 'Light Heavyweight', rank: 4 },
  { name: 'Jan Blachowicz',      div: 'Light Heavyweight', rank: 5 },
  { name: 'Sean Strickland',     div: 'Middleweight',      rank: 1 },
  { name: 'Dricus Du Plessis',   div: 'Middleweight',      rank: 2 },
  { name: 'Robert Whittaker',    div: 'Middleweight',      rank: 3 },
  { name: 'Paulo Costa',         div: 'Middleweight',      rank: 4 },
  { name: 'Marvin Vettori',      div: 'Middleweight',      rank: 5 },
  { name: 'Shavkat Rakhmonov',   div: 'Welterweight',      rank: 1 },
  { name: 'Belal Muhammad',      div: 'Welterweight',      rank: 2 },
  { name: 'Leon Edwards',        div: 'Welterweight',      rank: 3 },
  { name: 'Colby Covington',     div: 'Welterweight',      rank: 4 },
  { name: 'Gilbert Burns',       div: 'Welterweight',      rank: 5 },
  { name: 'Arman Tsarukyan',     div: 'Lightweight',       rank: 1 },
  { name: 'Justin Gaethje',      div: 'Lightweight',       rank: 2 },
  { name: 'Charles Oliveira',    div: 'Lightweight',       rank: 3 },
  { name: 'Beneil Dariush',      div: 'Lightweight',       rank: 4 },
  { name: 'Mateusz Gamrot',      div: 'Lightweight',       rank: 5 },
  { name: 'Max Holloway',        div: 'Featherweight',     rank: 1 },
  { name: 'Brian Ortega',        div: 'Featherweight',     rank: 2 },
  { name: 'Yair Rodriguez',      div: 'Featherweight',     rank: 3 },
  { name: 'Arnold Allen',        div: 'Featherweight',     rank: 4 },
  { name: 'Josh Emmett',         div: 'Featherweight',     rank: 5 },
  { name: "Sean O'Malley",       div: 'Bantamweight',      rank: 1 },
  { name: 'Merab Dvalishvili',   div: 'Bantamweight',      rank: 2 },
  { name: 'Marlon Vera',         div: 'Bantamweight',      rank: 3 },
  { name: 'Aljamain Sterling',   div: 'Bantamweight',      rank: 4 },
  { name: 'Dominick Cruz',       div: 'Bantamweight',      rank: 5 },
  { name: 'Brandon Moreno',      div: 'Flyweight',         rank: 1 },
  { name: 'Alexandre Pantoja',   div: 'Flyweight',         rank: 2 },
  { name: 'Matheus Nicolau',     div: 'Flyweight',         rank: 3 },
  { name: 'Brandon Royval',      div: 'Flyweight',         rank: 4 },
  { name: 'Amir Albazi',         div: 'Flyweight',         rank: 5 },
];

async function fetchFighters() {
  // 1. Load existing data for fallback (from, team, img, nick, etc.)
  const existing: Fighter[] = readJson<Fighter>('fighters.json');
  const fallback = new Map<string, Fighter>(existing.map(f => [f.slug, f]));

  // 2. Load overrides (key can be name OR slug)
  const overridesPath = join(DATA_DIR, 'fighters-overrides.json');
  const overridesRaw: Record<string, Partial<Fighter>> = existsSync(overridesPath)
    ? JSON.parse(readFileSync(overridesPath, 'utf8'))
    : {};

  // 3. Load CSV data
  const csv = await loadCsvData();

  // 4. Get champions from Wikipedia
  const $ = await fetchHtml('https://en.wikipedia.org/wiki/UFC_champions');
  const championNames: { name: string; div: string }[] = [];

  const DIV_MAP: Record<string, string> = {
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

  $('table.wikitable').each((_, table) => {
    const col = colIndexMap($, $(table));
    const iDiv  = Math.max(col('division'), col('weight'), 0);
    const iName = Math.max(col('champion'), col('fighter'), 1);

    $(table).find('tr').slice(1).each((_, tr) => {
      const cells = $(tr).find('td, th');
      if (cells.length < 4 || championNames.length >= 8) return;
      const divRaw  = clean($(cells[iDiv]).text());
      const nameCell = $(cells[iName]);
      const nameRaw  = clean(nameCell.find('a').first().text() || nameCell.text());
      if (!nameRaw || /vacant/i.test(nameRaw)) return;
      championNames.push({ name: nameRaw, div: DIV_MAP[divRaw] ?? divRaw });
    });
  });

  if (!championNames.length) throw new Error('Fighters: 0 campeones en Wikipedia');

  // 5. Build fighters
  const allFighters: Fighter[] = [];

  for (const { name, div } of championNames) {
    console.log(`   [C] ${name}`);
    const f = buildFighter(name, csv, fallback, 'C');
    if (!f.div) f.div = div;
    allFighters.push(f);
  }

  const championSlugs = new Set(allFighters.map(f => f.slug));
  for (const { name, div, rank } of CONTENDER_SEEDS) {
    const s = slugify(name);
    if (championSlugs.has(s)) {
      console.log(`   [#${rank}] ${name} (${div}) — skip (ya es campeón)`);
      continue;
    }
    console.log(`   [#${rank}] ${name} (${div})`);
    const f = buildFighter(name, csv, fallback, String(rank));
    if (!f.div) f.div = div;
    allFighters.push(f);
  }

  // 6. Add ALL remaining fighters from CSV
  const addedSlugs = new Set(allFighters.map(f => f.slug));
  let csvCount = 0;
  for (const name of csv.tottByName.keys()) {
    const slug = slugify(name);
    if (addedSlugs.has(slug)) continue;
    allFighters.push(buildFighter(name, csv, fallback));
    addedSlugs.add(slug);
    csvCount++;
  }
  console.log(`   + ${csvCount} fighters del CSV (roster completo)`);

  // 7. Apply overrides LAST (wins over CSV and fallback)
  let overrideCount = 0;
  for (const f of allFighters) {
    const ov = overridesRaw[f.name] ?? overridesRaw[f.slug];
    if (ov && typeof ov === 'object') {
      Object.assign(f, ov);
      overrideCount++;
      console.log(`   ★ override: ${f.name} → ${Object.keys(ov).join(', ')}`);
    }
  }
  if (overrideCount) console.log(`   → ${overrideCount} override(s) applied`);

  writeJson('fighters.json', allFighters);
  console.log(`✓ fighters.json (${championNames.length} campeones + ${CONTENDER_SEEDS.length} contenders + ${csvCount} CSV = ${allFighters.length} total)`);
}

// ─── EVENTS (Wikipedia) ─────────────────────────────────────────────────────

function parseDate(raw: string) {
  const d = new Date(clean(raw));
  if (isNaN(d.getTime())) return { date: raw, dateLabel: raw };
  return {
    date: d.toISOString().slice(0, 10),
    dateLabel: d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', ''),
  };
}

async function fetchEvents() {
  const $ = await fetchWikiHtml('List_of_UFC_events');

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
    const dateRaw  = clean($(cells[Math.max(iDate, 1)]).text());
    const locCell  = clean($(cells[iLoc >= 0 ? iLoc : iVenue >= 0 ? iVenue : 3]).text());
    const [namePart, ...rest] = fullName.split(':');
    const { date, dateLabel } = parseDate(dateRaw);
    const name = namePart.trim();
    const main = rest.join(':').trim() || 'TBD';
    const [f1, f2] = main !== 'TBD' ? main.split(' vs. ').map(s => s.trim()) : ['TBD', 'TBD'];
    parsed.push({
      slug: makeEventSlug(name, date), name, main, loc: locCell,
      date, dateLabel,
      f1: f1 ?? '', f1img: '',
      f2: f2 ?? '', f2img: '',
    });
  });

  parsed.sort((a, b) => a.date.localeCompare(b.date));

  const existing: EventRowFull[] = readJson<EventRowFull>('events-all.json');
  const existingMap = Object.fromEntries(existing.map(e => [e.slug, e]));
  const parsedSlugs = new Set(parsed.map(e => e.slug));
  const today = new Date().toISOString().slice(0, 10);

  for (const e of parsed) {
    e.status = e.date < today ? 'completed' : 'upcoming';
  }

  for (const e of parsed) {
    if (e.main === 'TBD') continue;
    const prev = existingMap[e.slug];
    if (prev?.fightCard?.length) e.fightCard = prev.fightCard;
    if (prev?.espnEventId) e.espnEventId = prev.espnEventId;
  }

  const pastEvents = existing
    .filter(e => !parsedSlugs.has(e.slug))
    .map(e => ({ ...e, status: 'completed' as const }));

  const allEvents = [...pastEvents, ...parsed];
  allEvents.sort((a, b) => a.date.localeCompare(b.date));

  writeJson('events-all.json', allEvents);
  console.log(`✓ events-all.json (${allEvents.length} eventos: ${pastEvents.length} pasados + ${parsed.length} programados)`);

  const events: EventRow[] = parsed.slice(0, 3).map((e, i) => ({ ...e, ...PALETTES[i % PALETTES.length] }));
  writeJson('events.json', events);
  console.log(`✓ events.json (${events.length} para el home)`);
  events.forEach(e => console.log(`   · ${e.name} — ${e.main} (${e.dateLabel})`));
}

// ─── FIGHT CARDS (Wikipedia individual event pages) ─────────────────────────

async function scrapeFightCard(event: EventRowFull): Promise<FightCardEntry[]> {
  if (event.main === 'TBD') return [];
  try {
    const title = await wikiResolveEventTitle(event);
    if (!title) {
      console.warn(`   ⚠ Wiki ${event.name}: sin artículo todavía (query + search sin resultados)`);
      return [];
    }
    const $ = await fetchWikiHtml(title);
    const fights: FightCardEntry[] = [];
    let boutType = 'maincard';
    let order = 0;

    $('table.toccolours, table.wikitable').each((_, table) => {
      $(table).find('tr').each((_, tr) => {
        const sectionTh = $(tr).find('th[colspan]');
        if (sectionTh.length) {
          const txt = sectionTh.text().toLowerCase();
          if (txt.includes('early')) boutType = 'early_prelim';
          else if (txt.includes('prelim')) boutType = 'prelim';
          else if (txt.includes('fight card') || txt.includes('main card')) boutType = 'maincard';
          return;
        }

        const cells = $(tr).find('td');
        if (cells.length < 4) return;
        if (!$(cells[2]).text().includes('vs')) return;

        const weightClass = clean($(cells[0]).text());
        const f1 = clean($(cells[1]).text()).replace(/\s*\([cC]\)\s*/g, '').trim();
        const f2 = clean($(cells[3]).text()).replace(/\s*\([cC]\)\s*/g, '').trim();
        if (!f1 || !f2) return;

        const bout = order === 0 ? 'Main Event' : order === 1 ? 'Co-Main Event' : boutType;
        fights.push({ f1, f1Id: slugify(f1), f2, f2Id: slugify(f2), weightClass, bout, order });
        order++;
      });
    });

    return fights;
  } catch (err) {
    console.warn(`   ⚠ Wiki ${event.name}: ${(err as Error).message}`);
    return [];
  }
}

async function fetchFightCards() {
  const events: EventRowFull[] = readJson<EventRowFull>('events-all.json');
  if (!events.length) { console.log('  Sin eventos en events-all.json'); return; }

  let enriched = 0;
  for (const event of events) {
    if (event.main === 'TBD') continue;

    if (event.fightCard?.length) {
      const mainFight = event.fightCard.find(f => f.order === 0) ?? event.fightCard[0];
      if (mainFight && event.f1 !== mainFight.f1) {
        event.f1 = mainFight.f1;
        event.f2 = mainFight.f2;
        event.main = `${mainFight.f1} vs. ${mainFight.f2}`;
      }
      console.log(`   · (cached) ${event.name}: ${event.fightCard.length} peleas`);
      continue;
    }

    const card = await scrapeFightCard(event);
    if (card.length) {
      event.fightCard = card;
      const mainFight = card.find(f => f.order === 0) ?? card[0];
      if (mainFight) {
        event.f1 = mainFight.f1;
        event.f2 = mainFight.f2;
        event.main = `${mainFight.f1} vs. ${mainFight.f2}`;
      }
      enriched++;
      console.log(`   ✓ ${event.name}: ${card.length} peleas`);
      card.slice(0, 3).forEach(f => console.log(`      · ${f.f1} vs. ${f.f2} (${f.weightClass})`));
    } else {
      console.log(`   · ${event.name}: sin cartelera en Wikipedia todavía`);
    }
    await sleep(800);
  }

  writeJson('events-all.json', events);
  console.log(`✓ events-all.json enriquecido (${enriched} eventos con cartelera)`);
}

// ─── RESULTS (Sherdog) ──────────────────────────────────────────────────────

type Result = { w: string; l: string; method: string; round: number; time: string; event: string };

function sherdogName($: cheerio.CheerioAPI, cell: cheerio.Cheerio<cheerio.AnyNode>): string {
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
  const firstRow  = pastTable.find('tr').eq(1);
  const eventPath = firstRow.find('a').first().attr('href');
  const eventName = clean(firstRow.find('a').first().text());
  if (!eventPath) throw new Error('Results: no se encontró enlace al último evento en Sherdog');

  const $ev = await fetchHtml(`https://www.sherdog.com${eventPath}`, UA);

  const results: Result[] = [];
  $ev('table.new_table.result tr').slice(1, 6).each((_, tr) => {
    const cells = $ev(tr).find('td');
    if (cells.length < 5) return;
    const w      = sherdogName($ev, $ev(cells[1]));
    const l      = sherdogName($ev, $ev(cells[3]));
    const method = $ev(cells[4]).text().split('\n').map(s => s.trim()).filter(Boolean)[0] ?? '—';
    const round  = parseInt($ev(cells[5]).text().trim()) || 1;
    const time   = $ev(cells[6]).text().trim();
    if (w && l) results.push({ w, l, method, round, time, event: eventName });
  });

  if (!results.length) throw new Error('Results: 0 peleas parseadas de Sherdog');
  writeJson('results.json', results.slice(0, 4));
  console.log(`✓ results.json (${Math.min(results.length, 4)} resultados de "${eventName}")`);
  results.slice(0, 4).forEach(r => console.log(`   · ${r.w} def. ${r.l} · ${r.method} R${r.round}`));
}

// ─── EVENT PHOTOS (match fighters to events) ───────────────────────────────

function assignEventPhotos() {
  const fighters: Fighter[] = readJson<Fighter>('fighters.json');
  const fightersBySlug = new Map(fighters.map(f => [f.slug, f]));
  const allEvts: EventRowFull[] = readJson<EventRowFull>('events-all.json');

  // Build index of ALL photos on disk (not just fighters.json)
  const photosOnDisk = new Map<string, string>();
  if (existsSync(IMG_DIR)) {
    for (const file of readdirSync(IMG_DIR)) {
      if (/\.(png|jpg|webp)$/i.test(file)) {
        const slug = file.replace(/\.(png|jpg|webp)$/i, '');
        photosOnDisk.set(slug, `/fighters/${file}`);
      }
    }
  }

  const findPhoto = (name: string): string => {
    if (!name || name === 'TBD') return '';
    const nameSlug = slugify(name);

    // Exact match in fighters.json
    const exact = fightersBySlug.get(nameSlug);
    if (exact?.img) return exact.img;

    // Exact match on disk
    if (photosOnDisk.has(nameSlug)) return photosOnDisk.get(nameSlug)!;

    // Partial match: "Song" → "song-yadong" (prefix/suffix) — fighters.json
    for (const [slug, f] of fightersBySlug) {
      if (!f.img) continue;
      if (slug.startsWith(nameSlug + '-') || slug.endsWith('-' + nameSlug)) return f.img;
    }

    // Partial match on disk
    for (const [slug, img] of photosOnDisk) {
      if (slug.startsWith(nameSlug + '-') || slug.endsWith('-' + nameSlug)) return img;
    }

    // Last name match with first initial
    const nameLower = name.toLowerCase();
    const lastName = nameLower.split(' ').slice(-1)[0];
    const firstInit = nameLower[0];
    for (const f of fighters) {
      if (!f.img) continue;
      const fn = f.name.toLowerCase();
      if (fn.split(' ').slice(-1)[0] === lastName && fn[0] === firstInit) return f.img;
    }

    return '';
  };

  let matched = 0, unmatched = 0;
  for (const e of allEvts) {
    if (e.main === 'TBD') continue;
    for (const side of ['f1', 'f2'] as const) {
      const name = e[side];
      const imgKey = `${side}img` as 'f1img' | 'f2img';
      const photo = findPhoto(name);
      if (photo && existsSync(join(IMG_DIR, photo.replace('/fighters/', '')))) {
        e[imgKey] = photo;
        matched++;
      } else {
        e[imgKey] = '';
        unmatched++;
      }
    }
  }

  writeJson('events-all.json', allEvts);

  // Update home events too
  const homeEvts = readJson<EventRow & { f1img?: string; f2img?: string }>('events.json');
  for (const he of homeEvts) {
    const full = allEvts.find(ev => ev.slug === (he as any).slug);
    if (full) { he.f1img = full.f1img; he.f2img = full.f2img; }
  }
  writeJson('events.json', homeEvts);

  console.log(`✓ Fotos de eventos: ${matched} matched, ${unmatched} sin foto`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(IMG_DIR)) mkdirSync(IMG_DIR, { recursive: true });

  const tasks = [
    { name: 'Events',       fn: fetchEvents      },
    { name: 'Fight Cards',  fn: fetchFightCards   },
    { name: 'Fighters',     fn: fetchFighters     },
    { name: 'Results',      fn: fetchResults      },
    { name: 'Event Photos', fn: async () => assignEventPhotos() },
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
