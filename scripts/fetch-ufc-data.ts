/**
 * Scrapes datos UFC de fuentes públicas y actualiza src/data/*.json:
 *   - events.json      → próximos 3 eventos para el home (Wikipedia)
 *   - events-all.json  → todos los próximos eventos con slug (Wikipedia)
 *   - fighters.json    → campeones actuales con datos físicos (MMAAPI)
 *   - results.json     → últimos 4 resultados del evento más reciente (Sherdog)
 *   - public/fighters/ → fotos de peleadores descargadas desde MMAAPI
 *
 * Run: npx tsx scripts/fetch-ufc-data.ts
 * CI:  .github/workflows/update-data.yml (cron lunes)
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, '..', 'src', 'data');
const IMG_DIR   = join(__dirname, '..', 'public', 'fighters');

const HEADERS = { 'User-Agent': 'QuimbaraBot/1.0 (github.com/quimbara)' };

// ─── MMAAPI ─────────────────────────────────────────────────────────────────
const MMAAPI_KEY  = process.env.MMAAPI_KEY ?? '';
const MMAAPI_BASE = 'https://mmaapi.p.rapidapi.com';
const MMAAPI_HEADERS = {
  'x-rapidapi-host': 'mmaapi.p.rapidapi.com',
  'x-rapidapi-key':  MMAAPI_KEY,
};

async function mmaapiGet<T>(path: string): Promise<T> {
  if (!MMAAPI_KEY) throw new Error('MMAAPI_KEY no definida');
  const res = await fetch(MMAAPI_BASE + path, { headers: MMAAPI_HEADERS });
  if (!res.ok) throw new Error(`MMAAPI ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Paleta Quimbara ────────────────────────────────────────────────────────
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

/** Convierte metros a string "X' Y\"" (pies y pulgadas) */
function mToFeet(m: number): string {
  const totalInches = m * 39.3701;
  const feet   = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${feet}' ${inches}"`;
}

/** Convierte metros a pulgadas */
function mToInches(m: number): string {
  return `${Math.round(m * 39.3701)}"`;
}

/** Convierte kg a libras */
function kgToLbs(kg: number): string {
  return `${Math.round(kg * 2.20462)} lbs`;
}

// ─── EVENTS (Wikipedia) ─────────────────────────────────────────────────────

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

function parseDate(raw: string) {
  const d = new Date(clean(raw));
  if (isNaN(d.getTime())) return { date: raw, dateLabel: raw };
  return {
    date: d.toISOString().slice(0, 10),
    dateLabel: d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', ''),
  };
}

async function fetchFighterPhotoMMAAPI(name: string, slug: string): Promise<string> {
  if (!name || name === 'TBD' || !MMAAPI_KEY) return '';
  try {
    // Buscar ID del peleador
    type SearchResult = { results: { entity: { id: number; name: string }; type: string }[] };
    const data = await mmaapiGet<SearchResult>(`/api/mma/search/${encodeURIComponent(name)}`);
    const fighters = (data.results ?? []).filter(r => r.type === 'team');
    if (!fighters.length) return '';

    const lastName = name.split(' ').slice(-1)[0]?.toLowerCase() ?? '';
    const match = fighters.find(r => r.entity.name.toLowerCase().includes(lastName)) ?? fighters[0];
    if (!match) return '';

    // Descargar imagen
    const imgRes = await fetch(`${MMAAPI_BASE}/api/mma/team/${match.entity.id}/image`, {
      headers: MMAAPI_HEADERS,
    });
    if (!imgRes.ok) return '';

    const buffer = await imgRes.arrayBuffer();
    if (!existsSync(IMG_DIR)) mkdirSync(IMG_DIR, { recursive: true });
    writeFileSync(join(IMG_DIR, `${slug}.png`), Buffer.from(buffer));
    return `/fighters/${slug}.png`;
  } catch { return ''; }
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
    const dateRaw  = clean($(cells[Math.max(iDate, 1)]).text());
    const locCell  = clean($(cells[iLoc >= 0 ? iLoc : iVenue >= 0 ? iVenue : 3]).text());
    const [namePart, ...rest] = fullName.split(':');
    const { date, dateLabel } = parseDate(dateRaw);
    const name = namePart.trim();
    const main = rest.join(':').trim() || 'TBD';
    const [f1, f2] = main !== 'TBD' ? main.split(' vs. ').map(s => s.trim()) : ['TBD', 'TBD'];
    parsed.push({
      slug: makeSlug(name, date), name, main, loc: locCell,
      date, dateLabel,
      f1: f1 ?? '', f1img: '',
      f2: f2 ?? '', f2img: '',
    });
  });

  parsed.sort((a, b) => a.date.localeCompare(b.date));

  // Cargar eventos existentes (incluye pasados que ya no están en Wikipedia)
  const existing: EventRowFull[] = readJson<EventRowFull>('events-all.json');
  const existingMap = Object.fromEntries(existing.map(e => [e.slug, e]));
  const parsedSlugs = new Set(parsed.map(e => e.slug));

  const isLocalImg = (url: string) => url.startsWith('/fighters/');
  const today = new Date().toISOString().slice(0, 10);

  // Marcar status en los nuevos eventos
  for (const e of parsed) {
    e.status = e.date < today ? 'completed' : 'upcoming';
  }

  for (const e of parsed) {
    if (e.main === 'TBD') continue;
    const prev = existingMap[e.slug];

    // Reutilizar fotos, fightCard y espnEventId del caché
    if (prev?.fightCard?.length) e.fightCard = prev.fightCard;
    if (prev?.espnEventId) e.espnEventId = prev.espnEventId;

    // Reutilizar solo si ya son rutas locales (no URLs externas de apis viejas)
    if (prev?.f1img && prev?.f2img && isLocalImg(prev.f1img) && isLocalImg(prev.f2img)) {
      e.f1img = prev.f1img;
      e.f2img = prev.f2img;
      continue;
    }

    console.log(`   → Buscando fotos: ${e.f1} vs ${e.f2}`);
    e.f1img = await fetchFighterPhotoMMAAPI(e.f1, `${e.slug}-f1`);
    await sleep(1500);
    e.f2img = await fetchFighterPhotoMMAAPI(e.f2, `${e.slug}-f2`);
    await sleep(1500);
  }

  // ── MERGE: preservar eventos pasados que Wikipedia ya quitó de "scheduled" ──
  const pastEvents = existing
    .filter(e => !parsedSlugs.has(e.slug))           // no está en los nuevos
    .map(e => ({ ...e, status: 'completed' as const })); // marcar como completado

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

function wikiEventUrl(event: EventRowFull): string {
  // PPV: "UFC 328" → https://en.wikipedia.org/wiki/UFC_328
  if (/^UFC \d+$/.test(event.name)) {
    return `https://en.wikipedia.org/wiki/${event.name.replace(/ /g, '_')}`;
  }
  // Fight Night: "UFC Fight Night" + main "Allen vs. Costa"
  // → https://en.wikipedia.org/wiki/UFC_Fight_Night:_Allen_vs._Costa
  const title = `${event.name}: ${event.main}`.replace(/ /g, '_');
  return `https://en.wikipedia.org/wiki/${title}`;
}

async function scrapeFightCard(event: EventRowFull): Promise<FightCardEntry[]> {
  if (event.main === 'TBD') return [];
  const url = wikiEventUrl(event);
  try {
    const $ = await fetchHtml(url);
    const fights: FightCardEntry[] = [];
    let boutType = 'maincard';
    let order = 0;

    // La tabla de cartelera en Wikipedia usa class="toccolours" (no wikitable)
    $('table.toccolours, table.wikitable').each((_, table) => {
      $(table).find('tr').each((_, tr) => {
        // Detectar cabeceras de sección (Fight card / Preliminary card / Early prelims)
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
        // Col 2 debe ser "vs." para ser una fila de pelea
        if (!$(cells[2]).text().includes('vs')) return;

        const weightClass = clean($(cells[0]).text());
        // Quitar "(c)" de campeones
        const f1 = clean($(cells[1]).text()).replace(/\s*\([cC]\)\s*/g, '').trim();
        const f2 = clean($(cells[3]).text()).replace(/\s*\([cC]\)\s*/g, '').trim();
        if (!f1 || !f2) return;

        const bout = order === 0 ? 'Main Event' : order === 1 ? 'Co-Main Event' : boutType;
        fights.push({ f1, f1Id: '', f2, f2Id: '', weightClass, bout, order });
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

    // Reutilizar si ya tiene cartelera — pero asegurar nombres completos
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
      // Usar nombres completos del main event en vez de solo apellidos
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

// ─── FIGHTERS / CHAMPIONS (Wikipedia + MMAAPI) ──────────────────────────────

type FormEntry = { outcome: 'W' | 'L' | 'D'; winType: string };

type Fighter = {
  slug: string; name: string; nick: string; div: string; rec: string;
  from: string; rank: string; img: string;
  height: string; weight: string; reach: string; stance: string; team: string;
  form: string[];        // últimas 5 peleas: ["W","W","W","L","W"]
  formTypes: FormEntry[]; // detalle: [{outcome:"W",winType:"KO"}, ...]
};

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

// MMAAPI weightClass → División UFC
const WEIGHT_CLASS_TO_DIV: Record<string, string> = {
  'heavy':   'Heavyweight',
  'light_heavy': 'Light Heavyweight',
  'middleweight': 'Middleweight',
  'welter':  'Welterweight',
  'light':   'Lightweight',
  'feather': 'Featherweight',
  'bantam':  'Bantamweight',
  'fly':     'Flyweight',
};

type MMAAPISearchResponse = {
  results: {
    entity: { id: number; name: string; slug: string };
    type: string;
  }[];
};

type MMAAPITeamResponse = {
  team: {
    id: number;
    name: string;
    country: { name: string; alpha2: string };
    playerTeamInfo: {
      nickname?: string;
      height?: number;
      reach?: number;
      weight?: number;
      weightClass?: string;
      fightingStyle?: string;
    };
    teamRankings: {
      rankingTypeName: string;
      weightClass: string;
    }[];
    wdlRecord: { wins: number; draws: number; losses: number };
  };
  pregameForm: {
    form: string[];
    winTypeForm: FormEntry[];
  };
};

// ─── Top 5 contendientes por división (seeds — MMAAPI actualiza stats/fotos) ──
const CONTENDER_SEEDS: { name: string; div: string; rank: number }[] = [
  // Heavyweight
  { name: 'Jon Jones',           div: 'Heavyweight',       rank: 1 },
  { name: 'Curtis Blaydes',      div: 'Heavyweight',       rank: 2 },
  { name: 'Sergei Pavlovich',    div: 'Heavyweight',       rank: 3 },
  { name: 'Ciryl Gane',          div: 'Heavyweight',       rank: 4 },
  { name: 'Alexander Volkov',    div: 'Heavyweight',       rank: 5 },
  // Light Heavyweight
  { name: 'Alex Pereira',        div: 'Light Heavyweight', rank: 1 },
  { name: 'Jiri Prochazka',      div: 'Light Heavyweight', rank: 2 },
  { name: 'Jamahal Hill',        div: 'Light Heavyweight', rank: 3 },
  { name: 'Magomed Ankalaev',    div: 'Light Heavyweight', rank: 4 },
  { name: 'Jan Blachowicz',      div: 'Light Heavyweight', rank: 5 },
  // Middleweight
  { name: 'Sean Strickland',     div: 'Middleweight',      rank: 1 },
  { name: 'Dricus Du Plessis',   div: 'Middleweight',      rank: 2 },
  { name: 'Robert Whittaker',    div: 'Middleweight',      rank: 3 },
  { name: 'Paulo Costa',         div: 'Middleweight',      rank: 4 },
  { name: 'Marvin Vettori',      div: 'Middleweight',      rank: 5 },
  // Welterweight
  { name: 'Shavkat Rakhmonov',   div: 'Welterweight',      rank: 1 },
  { name: 'Belal Muhammad',      div: 'Welterweight',      rank: 2 },
  { name: 'Leon Edwards',        div: 'Welterweight',      rank: 3 },
  { name: 'Colby Covington',     div: 'Welterweight',      rank: 4 },
  { name: 'Gilbert Burns',       div: 'Welterweight',      rank: 5 },
  // Lightweight
  { name: 'Arman Tsarukyan',     div: 'Lightweight',       rank: 1 },
  { name: 'Justin Gaethje',      div: 'Lightweight',       rank: 2 },
  { name: 'Charles Oliveira',    div: 'Lightweight',       rank: 3 },
  { name: 'Beneil Dariush',      div: 'Lightweight',       rank: 4 },
  { name: 'Mateusz Gamrot',      div: 'Lightweight',       rank: 5 },
  // Featherweight
  { name: 'Max Holloway',        div: 'Featherweight',     rank: 1 },
  { name: 'Brian Ortega',        div: 'Featherweight',     rank: 2 },
  { name: 'Yair Rodriguez',      div: 'Featherweight',     rank: 3 },
  { name: 'Arnold Allen',        div: 'Featherweight',     rank: 4 },
  { name: 'Josh Emmett',         div: 'Featherweight',     rank: 5 },
  // Bantamweight
  { name: 'Sean O\'Malley',      div: 'Bantamweight',      rank: 1 },
  { name: 'Merab Dvalishvili',   div: 'Bantamweight',      rank: 2 },
  { name: 'Marlon Vera',         div: 'Bantamweight',      rank: 3 },
  { name: 'Aljamain Sterling',   div: 'Bantamweight',      rank: 4 },
  { name: 'Dominick Cruz',       div: 'Bantamweight',      rank: 5 },
  // Flyweight
  { name: 'Brandon Moreno',      div: 'Flyweight',         rank: 1 },
  { name: 'Alexandre Pantoja',   div: 'Flyweight',         rank: 2 },
  { name: 'Matheus Nicolau',     div: 'Flyweight',         rank: 3 },
  { name: 'Brandon Royval',      div: 'Flyweight',         rank: 4 },
  { name: 'Amir Albazi',         div: 'Flyweight',         rank: 5 },
];

async function enrichFighter(
  name: string,
  div: string,
  rank: string,
  byName: Record<string, Fighter>
): Promise<Fighter> {
  const slug = fighterSlug(name);
  const prev = byName[name.toLowerCase()];

  try {
    // Intentar búsqueda por nombre completo, luego por apellido si falla
    const searchName = name.replace(/'/g, '');  // quitar apóstrofes para la URL
    const searchData = await mmaapiGet<MMAAPISearchResponse>(
      `/api/mma/search/${encodeURIComponent(searchName)}`
    );
    await sleep(1000);

    const teamResults = (searchData.results ?? []).filter(r => r.type === 'team');
    const lastName = name.split(' ').slice(-1)[0]?.toLowerCase().replace(/'/g, '') ?? '';
    const matchResult = teamResults.find(r => r.entity.name.toLowerCase().includes(lastName)) ?? teamResults[0];
    if (!matchResult) throw new Error(`No encontrado: ${name}`);

    const teamId = matchResult.entity.id;
    const teamData = await mmaapiGet<MMAAPITeamResponse>(`/api/mma/team/${teamId}`);
    await sleep(1000);

    const t  = teamData.team;
    const pi = t.playerTeamInfo ?? {};
    const wr = t.wdlRecord ?? { wins: 0, draws: 0, losses: 0 };
    const pf = teamData.pregameForm ?? { form: [], winTypeForm: [] };
    const rec = `${wr.wins}-${wr.losses}-${wr.draws}`;

    let finalDiv = div;
    if (t.teamRankings?.length) {
      const rn = t.teamRankings[0];
      finalDiv = rn.rankingTypeName
        ? rn.rankingTypeName.replace('UFC ', '').replace(' Champion', '')
        : WEIGHT_CLASS_TO_DIV[rn.weightClass] ?? div;
    }

    const height = pi.height ? mToFeet(pi.height) : prev?.height ?? '';
    const reach  = pi.reach  ? mToInches(pi.reach) : prev?.reach  ?? '';
    const weight = pi.weight ? kgToLbs(pi.weight)  : prev?.weight ?? '';

    // Foto — solo descarga si no existe localmente
    if (!existsSync(IMG_DIR)) mkdirSync(IMG_DIR, { recursive: true });
    const localImgPath  = join(IMG_DIR, `${slug}.png`);
    const publicImgPath = `/fighters/${slug}.png`;
    let img = prev?.img ?? '';

    if (!existsSync(localImgPath)) {
      const imgRes = await fetch(`${MMAAPI_BASE}/api/mma/team/${teamId}/image`, { headers: MMAAPI_HEADERS });
      await sleep(500);
      if (imgRes.ok) {
        writeFileSync(localImgPath, Buffer.from(await imgRes.arrayBuffer()));
        img = publicImgPath;
        console.log(`      ✓ Foto: ${slug}.png`);
      }
    } else {
      img = publicImgPath;
    }

    return {
      slug, name, nick: pi.nickname ?? prev?.nick ?? '',
      div: finalDiv, rec, from: t.country?.name ?? prev?.from ?? '',
      rank, img, height, weight, reach,
      stance: prev?.stance ?? '', team: prev?.team ?? '',
      form: pf.form?.slice(0, 5) ?? [],
      formTypes: pf.winTypeForm?.slice(0, 5) ?? [],
    };
  } catch (e) {
    console.warn(`   ⚠ No se pudo enriquecer ${name}: ${(e as Error).message}`);
    return {
      slug, name, nick: prev?.nick ?? '', div, rec: prev?.rec ?? '—',
      from: prev?.from ?? '', rank, img: prev?.img ?? '',
      height: prev?.height ?? '', weight: prev?.weight ?? '',
      reach: prev?.reach ?? '', stance: prev?.stance ?? '', team: prev?.team ?? '',
      form: prev?.form ?? [], formTypes: prev?.formTypes ?? [],
    };
  }
}

async function fetchFighters() {
  const existing: Fighter[] = readJson<Fighter>('fighters.json');
  const byName = Object.fromEntries(existing.map(f => [f.name.toLowerCase(), f]));

  // 1. Obtener lista de campeones actuales de Wikipedia
  const $ = await fetchHtml('https://en.wikipedia.org/wiki/UFC_champions');
  const championNames: { name: string; div: string }[] = [];

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
      championNames.push({ name: nameRaw, div: DIV_ES[divRaw] ?? divRaw });
    });
  });

  if (!championNames.length) throw new Error('Fighters: 0 campeones en Wikipedia');

  // 2. Campeones — enriquecer con MMAAPI
  const champions: Fighter[] = [];
  for (const { name, div } of championNames) {
    console.log(`   [C] ${name}`);
    champions.push(await enrichFighter(name, div, 'C', byName));
  }
  if (!champions.length) throw new Error('Fighters: 0 campeones procesados');

  // 3. Contenders — enriquecer con MMAAPI (solo si no están ya actualizados)
  const contenders: Fighter[] = [];
  for (const { name, div, rank } of CONTENDER_SEEDS) {
    console.log(`   [#${rank}] ${name} (${div})`);
    contenders.push(await enrichFighter(name, div, String(rank), byName));
  }

  const allFighters = [...champions, ...contenders];

  // 4. Aplicar overrides manuales
  const overridesPath = join(DATA_DIR, 'fighters-overrides.json');
  if (existsSync(overridesPath)) {
    const overrides = JSON.parse(readFileSync(overridesPath, 'utf8')) as Record<string, Partial<Fighter>>;
    let applied = 0;
    allFighters.forEach((f, i) => {
      const ov = overrides[f.name];
      if (ov && typeof ov === 'object') {
        allFighters[i] = { ...f, ...ov };
        applied++;
        console.log(`   ★ override: ${f.name} → ${Object.keys(ov).join(', ')}`);
      }
    });
    if (applied) console.log(`   → ${applied} override(s) aplicados`);
  }

  writeJson('fighters.json', allFighters);
  console.log(`✓ fighters.json (${champions.length} campeones + ${contenders.length} contenders = ${allFighters.length} total)`);
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
  const firstRow  = pastTable.find('tr').eq(1);
  const eventPath = firstRow.find('a').first().attr('href');
  const eventName = clean(firstRow.find('a').first().text());
  if (!eventPath) throw new Error('Results: no se encontró enlace al último evento en Sherdog');

  const $ev = await fetchHtml(`https://www.sherdog.com${eventPath}`, UA);

  const results: Result[] = [];
  $ev('table.new_table.result tr').slice(1, 6).each((_, tr) => {
    const cells = $ev(tr).find('td');
    if (cells.length < 5) return;
    const w      = sherdonName($ev, $ev(cells[1]));
    const l      = sherdonName($ev, $ev(cells[3]));
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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const tasks = [
    { name: 'Events',      fn: fetchEvents      },
    { name: 'Fight Cards', fn: fetchFightCards  },
    { name: 'Fighters',    fn: fetchFighters    },
    { name: 'Results',     fn: fetchResults     },
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
