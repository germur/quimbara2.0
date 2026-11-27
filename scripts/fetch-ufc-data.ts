import {joinFighterSources} from "./lib/fighter-identity.mjs";
import {preserveRecordScope} from "./lib/record-sanity.mjs";
import {parseSherdogResults} from './lib/recent-results.mjs';
import {safeWriteJson} from "./lib/datasets.mjs";
import {recordHealth} from "./lib/health.mjs";
import {createFighterMedia,resolveBoutPerson,resolveEventPerson} from "../src/lib/fighter-media.mjs";
import {expandAnnouncedNames,fightKey,preserveFightCorners} from "../src/lib/event-data.mjs";
import {namedBouts,sameBout} from './lib/card-coverage.mjs';
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
import { fileURLToPath,pathToFileURL } from 'node:url';
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
function writeJson(filename: string,data: unknown) {
  safeWriteJson(join(DATA_DIR,filename),data,{force:process.env.FORCE_WRITE==='1'});
}

async function fetchHtml(url: string, extraHeaders?: Record<string, string>): Promise<cheerio.CheerioAPI> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { ...HEADERS, ...extraHeaders } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return cheerio.load(await res.text());
}

// ─── Wikipedia vía API (no scraping de URLs adivinadas) ─────────────────────
// La MediaWiki API da: títulos canónicos (sigue redirects y renombres) y el
// HTML del contenido (action=parse) sin depender del chrome de la página.

const WIKI_API = 'https://en.wikipedia.org/w/api.php';

async function wikiApi(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const res = await fetch(`${WIKI_API}?${qs}`, { signal: AbortSignal.timeout(20000), headers: HEADERS });
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
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: HEADERS });
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
  ufcStatsId?:string;ufcStatsUrl?:string;ufcProfileUrl?:string;ufcStatsIncomplete?:boolean;recordUnavailable?:boolean;rankCheckedAt?:string;identityAmbiguousName?:boolean;birthDate?:string;
  /** Récord pro completo (canónico, viene de UFC.com vía scripts/fix-records.mjs) */
  rec: string;
  /** 'pro' cuando fix-records.mjs confirmó `rec` contra UFC.com — la UI/meta lo usa para etiquetar bien */
  recScope?: string;
  recordCheckedAt?: string;
  recordSourceUrl?: string;
  photoSource?: {profileUrl:string;imageUrl:string;checkedAt:string;athleteName?:string;athleteSlug?:string;provider?:string;sourceImages?:string[]};
  photoAliases?: string[];
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

type CsvData = { profiles:any[];tottByName:Map<string,Record<string,string>>;detailsByName:Map<string,Record<string,string>>;fightsByFighter:Map<string,FightRecord[]>;unresolved:Map<string,number> };
let csvCache:CsvData|null=null;
async function loadCsvData():Promise<CsvData>{
 if(csvCache)return csvCache;
 const [tottCsv,detailsCsv,fightsCsv,eventsCsv]=await Promise.all(Object.values(CSV_SOURCES).map(downloadCsv));
 const options={columns:true,skip_empty_lines:true,relax_quotes:true};
 const tott=parse(tottCsv,options),details=parse(detailsCsv,options),fights=parse(fightsCsv,options),events=parse(eventsCsv,options);
 const eventDates=new Map<string,string>();
 for(const event of events){const date=new Date(event.DATE);if(event.EVENT&&Number.isFinite(date.getTime()))eventDates.set(event.EVENT.trim(),date.toISOString().slice(0,10));}
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


 const identityPath=join(DATA_DIR,'fighter-identities.json');
 const registry=existsSync(identityPath)?JSON.parse(readFileSync(identityPath,'utf8')):{profiles:{},fights:{}};
 const joined=joinFighterSources(tott,details,fights,eventDates,registry);
 csvCache={profiles:joined.profiles,tottByName:new Map(joined.profiles.map(p=>[p.id,p.tott])),detailsByName:new Map(joined.profiles.filter(p=>p.detail).map(p=>[p.id,p.detail])),fightsByFighter:joined.history,unresolved:joined.unresolved};
 return csvCache;
}

// ─── FIGHTERS ───────────────────────────────────────────────────────────────

export function buildFighter(profile:any,csv:CsvData,fallback:Map<string,Fighter>):Fighter {
 const {name,id,binding}=profile,byId=[...fallback.values()].find(f=>f.ufcStatsId===id),slug=byId?.slug??profile.slug,prev=byId??fallback.get(slug),tott=profile.tott,detail=profile.detail;
 const allFights=csv.fightsByFighter.get(id)??[],partial=Boolean(csv.unresolved.get(id));
 const wins=allFights.filter(f=>f.result==='W').length,losses=allFights.filter(f=>f.result==='L').length,draws=allFights.filter(f=>f.result==='D').length;
 const mixedLegacy=profile.ambiguous&&!prev?.ufcStatsId;
 const ufcRec=partial?undefined:wins+'-'+losses+'-'+draws;
 const oldProfessional=!mixedLegacy&&prev?.recScope==='pro';
 const rec=binding?.record??(oldProfessional?prev.rec:ufcRec??'0-0-0');
 const recScope=binding?.record||oldProfessional?'pro':partial?'unknown':'ufc';
 const pounds=parseFloat(tott.WEIGHT);
 const weightDiv=({125:'Flyweight',135:'Bantamweight',145:'Featherweight',155:'Lightweight',170:'Welterweight',185:'Middleweight',205:'Light Heavyweight',265:'Heavyweight'} as Record<number,string>)[pounds]??'';
 const div=prev?.rank?prev.div:allFights.length?formatDivision(allFights[0].weightClass):weightDiv||prev?.div||'';
 const photoSafe=!profile.ambiguous||prev?.ufcStatsId===id&&prev?.photoSource?.profileUrl===binding?.ufcProfileUrl||Boolean(binding?.ufcProfileUrl&&(prev?.photoSource?.profileUrl===binding.ufcProfileUrl||!prev?.photoSource&&binding.ufcProfileUrl.split('/').at(-1)===slug));
 let img=photoSafe?prev?.img??'':'';
 if(photoSafe)for(const ext of ['webp','png','jpg'])if(existsSync(join(IMG_DIR,slug+'.'+ext))){img='/fighters/'+slug+'.'+ext;break;}
 return {
  slug,name,ufcStatsId:id,ufcStatsUrl:tott.URL,
  ...(profile.ambiguous?{identityAmbiguousName:true}:{}),
  ...(Number.isFinite(Date.parse(tott.DOB))?{birthDate:new Date(tott.DOB).toISOString().slice(0,10)}:{}),
  ...(binding?.ufcProfileUrl||prev?.ufcProfileUrl?{ufcProfileUrl:binding?.ufcProfileUrl??prev.ufcProfileUrl}:{}),
  ...(partial?{ufcStatsIncomplete:true}:{}),...(partial&&recScope!=='pro'?{recordUnavailable:true}:{}),
  ...(prev?.rank?{rank:prev.rank,rankCheckedAt:prev.rankCheckedAt}:{}),
  nick:detail?.NICKNAME?.trim()||(!mixedLegacy?prev?.nick:'')||'',div,rec,recScope,ufcRec,
  ...(!mixedLegacy?Object.fromEntries(['recordAttemptedAt','recordRetryAfter','recordCheckedAt','recordSourceUrl','recordVerification'].filter(k=>prev?.[k]).map(k=>[k,prev[k]])):{}),
  ...(recScope==='ufc'&&prev?.recordConflict?{recordConflict:prev.recordConflict}:{}),
  ...(recScope==='pro'?{recordSourceUrl:binding?.record?binding.ufcProfileUrl:prev?.recordSourceUrl,recordCheckedAt:binding?.record?binding.checkedAt:prev?.recordCheckedAt}:{}),
  from:prev?.from??'',img,...(photoSafe&&prev?.photoSource?{photoSource:prev.photoSource}:{}),...(photoSafe&&prev?.photoAliases?{photoAliases:prev.photoAliases}:{}),
  height:formatHeight(tott.HEIGHT),weight:formatWeight(tott.WEIGHT),reach:formatReach(tott.REACH),stance:tott.STANCE==='--'?'':tott.STANCE??'',team:prev?.team??'',
  form:allFights.slice(0,5).map(f=>f.result),formTypes:allFights.slice(0,5).map(f=>({outcome:f.result,winType:parseWinType(f.method)}))
 } as Fighter;
}

async function fetchFighters(){
 const existing:Fighter[]=readJson<Fighter>('fighters.json'),fallback=new Map(existing.map(f=>[f.slug,f]));
 const csv=await loadCsvData();
 const overridesPath=join(DATA_DIR,'fighters-overrides.json');
 const overrides=existsSync(overridesPath)?JSON.parse(readFileSync(overridesPath,'utf8')):{};
 const all=csv.profiles.map(profile=>{
  const fighter=buildFighter(profile,csv,fallback);
  const ov=overrides[fighter.slug]??(!profile.ambiguous||fighter.slug===slugify(profile.name)?overrides[fighter.name]:undefined);
  if(ov)Object.assign(fighter,ov);
  preserveRecordScope(fighter);
  return fighter;
 });
 const slugs=new Set(all.map(f=>f.slug));
 if(slugs.size!==all.length)throw new Error('Duplicate public athlete slug; publication blocked');
 // Official profiles added by rankings survive CSV lag without invented bouts.
 for(const previous of existing)if(!slugs.has(previous.slug)&&!previous.ufcStatsId)all.push(previous);
 writeJson('fighters.json',all);
 console.log('Athletes keyed by UFCStats ID:',all.length,'; ambiguous histories pending verification:',csv.unresolved.size);
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
    if (prev) Object.assign(e, { ...prev, ...e });
    if (prev?.fightCard?.length) e.fightCard = prev.fightCard;
    if (prev?.espnEventId) e.espnEventId = prev.espnEventId;
  }

  const pastEvents = existing
    .filter(e => !parsedSlugs.has(e.slug))
    .map(e => ({ ...e, status: e.date < today ? 'completed' as const : 'unconfirmed' as const }));

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

async function scrapeFightCard(event: EventRowFull): Promise<{fights: FightCardEntry[]; sourcePage: string} | null> {
  if (event.main === 'TBD') return null;
  try {
    const title = await wikiResolveEventTitle(event);
    if (!title) {
      console.warn(`   ⚠ Wiki ${event.name}: sin artículo todavía (query + search sin resultados)`);
      return null;
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

    const sourcePage = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replaceAll(' ', '_'));
    return {fights: namedBouts(fights), sourcePage};
  } catch (err) {
    console.warn(`   ⚠ Wiki ${event.name}: ${(err as Error).message}; se conserva la cartelera previa`);
    return null;
  }
}

async function fetchFightCards() {
  const events: EventRowFull[] = readJson<EventRowFull>('events-all.json');
  if (!events.length) { console.log('  Sin eventos en events-all.json'); return; }

  let enriched = 0;
  for (const event of events) {
    if (event.main === 'TBD') continue;

    if (event.date < new Date().toISOString().slice(0,10)) continue;
    if (event.fightCard?.length && (event as any).cardCheckedAt && Date.now()-Date.parse((event as any).cardCheckedAt)<6*3600000) {
      console.log(`   · (cached) ${event.name}: ${event.fightCard.length} peleas`);
      continue;
    }

    const scraped = await scrapeFightCard(event);
    if (scraped?.fights.length) {
      const {fights, sourcePage} = scraped;
      const mainFight = fights.find(f => f.bout === 'Main Event');
      const announced = expandAnnouncedNames({...event, fightCard: fights});
      const unique = new Set(fights.map(fightKey)).size === fights.length;
      if (!mainFight || !sameBout(mainFight, announced) || !unique ||
          fights.length < namedBouts(event.fightCard).length / 2) {
        console.warn(`   ⚠ Wiki ${event.slug}: cartelera incompatible; se conserva la última válida`);
      } else {
        event.fightCard = fights.map(bout => preserveFightCorners(bout, event.fightCard ?? []));
        Object.assign(event, {
          cardCheckedAt: new Date().toISOString(),
          cardSource: 'Wikipedia',
          cardSourceUrl: sourcePage,
          cardSourcePage: sourcePage,
          cardFetchError: null,
        });
        enriched++;
        console.log(`   ✓ ${event.slug}: ${fights.length} peleas en Wikipedia`);
      }
    }
    await sleep(800);
  }

  writeJson('events-all.json', events);
  console.log(`✓ events-all.json enriquecido (${enriched} eventos con cartelera)`);
}

// ─── RESULTS (Sherdog) ──────────────────────────────────────────────────────

export async function fetchResults() {
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

  const results = parseSherdogResults($ev.html(),{event:eventName,sourceUrl:`https://www.sherdog.com${eventPath}`});

  if (!results.length) throw new Error('Results: 0 peleas parseadas de Sherdog');
  writeJson('results.json', results.slice(0, 4));
  recordHealth('Results',true,{completedAt:new Date().toISOString(),count:Math.min(results.length,4),sourceUrl:`https://www.sherdog.com${eventPath}`});
  console.log(`✓ results.json (${Math.min(results.length, 4)} resultados de "${eventName}")`);
  results.slice(0, 4).forEach(r => console.log(`   · ${r.w} / ${r.l} · ${r.outcome} · ${r.method} R${r.round}`));
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

  const extraPath=join(DATA_DIR,'fighter-media-extra.json');
  const extraMedia=existsSync(extraPath)?JSON.parse(readFileSync(extraPath,'utf8')):[];
  const mediaFor=createFighterMedia([...fighters,...extraMedia],photosOnDisk);
  const mediaPeople=[...fighters,...extraMedia];
  for(const event of allEvts)for(const fight of event.fightCard??[])for(const side of ['f1','f2'] as const){
   const person=resolveBoutPerson(fight[side],(fight as any)[side+'StatsId']??fight[side+'Id'],fight.weightClass,mediaPeople);
   if(person){fight[side+'Id']=person.slug;if(person.ufcStatsId)(fight as any)[side+'StatsId']=person.ufcStatsId;}
  }
  const findPhoto=(name:string):string=>mediaFor(name).photo;

  let matched = 0, unmatched = 0;
  for (const e of allEvts) {
    if (e.main === 'TBD') continue;
    for (const side of ['f1', 'f2'] as const) {
      const name = expandAnnouncedNames(e)[side];
      const imgKey = `${side}img` as 'f1img' | 'f2img';
      const photo = resolveEventPerson(e,side,mediaPeople)?.img??'';
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
      recordHealth(name,true, { completedAt:new Date().toISOString() });
    } catch (err) {
      console.error(`✗ ${name} falló:`, (err as Error).message);
      failed++;
      recordHealth(name,false,{error:String((err as Error).message)});
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} tarea(s) fallaron. El resto se actualizó.`);
    process.exit(1);
  }
  console.log('\n✓ Todo actualizado.');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(err => { console.error(err); process.exit(1); });
