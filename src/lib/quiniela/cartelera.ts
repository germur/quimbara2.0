/**
 * cartelera.ts — normaliza la cartelera de un evento para la quiniela.
 *
 * El campo `bout` de events-all.json viene inconsistente porque sale de
 * scrapear UFC.com: conviven "Main Event", "Co-Main Event", "maincard",
 * "prelim", "early_prelim" y variantes en español como "Ligero Title Bout"
 * o "Peso Gallo Bout". Acá se reduce a dos segmentos, que es lo único que
 * el puntaje necesita saber (el bono de +10 es sobre la estelar).
 */

import EVENTS from '../../data/events-all.json';
import FIGHTERS from '../../data/fighters.json';
import CONFIG from '../../data/quiniela-eventos.json';
import RESULTADOS from '../../data/quiniela-resultados.json';
import type {
  Esquina,
  PeleaQuiniela,
  PicksEvento,
  ResultadosEvento,
  Segmento,
} from './tipos';

const eventos: any[] = Array.isArray(EVENTS) ? EVENTS : (EVENTS as any).events ?? [];

const cfgEventos = (CONFIG as any).eventos as Record<
  string,
  {
    cierre?: string;
    peleas?: Record<string, { underdog?: Esquina | null }>;
    picksQuimbara?: PicksEvento;
  }
>;

const cfgResultados = (RESULTADOS as any).eventos as Record<
  string,
  { publicado?: string; resultados?: ResultadosEvento }
>;

/** Slug consistente con el de fighters.json */
export function slugificar(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const slugPorNombre = new Map<string, string>();
for (const f of FIGHTERS as any[]) {
  slugPorNombre.set(slugificar(f.name), f.slug);
}

/** Id estable de pelea: los dos slugs en orden alfabético. */
export function idPelea(f1: string, f2: string): string {
  const a = slugificar(f1), b = slugificar(f2);
  return a < b ? `${a}-vs-${b}` : `${b}-vs-${a}`;
}

/**
 * Los prelims son claramente identificables; todo lo demás (Main Event,
 * Co-Main, maincard, "X Title Bout", "Peso Y Bout") cuenta como estelar.
 */
function normalizarSegmento(bout: string): Segmento {
  const b = (bout ?? '').toLowerCase();
  if (b.includes('prelim')) return 'preliminar';
  return 'estelar';
}

function esMainEvent(bout: string): boolean {
  const b = (bout ?? '').toLowerCase();
  // "co-main" NO es main event: pelea a 3 rounds salvo que sea de título
  if (b.includes('co-main')) return false;
  return b.includes('main event') || b.includes('title bout');
}

export interface EventoQuiniela {
  slug: string;
  nombre: string;
  fecha: string;
  lugar: string | null;
  peleas: PeleaQuiniela[];
  /** ISO. Cuando se sellan los picks. null = sin configurar. */
  cierre: string | null;
  /** Picks publicados por Quimbara. {} si no hay. */
  picksQuimbara: PicksEvento;
  /** Resultados publicados post-evento. {} si todavía no. */
  resultados: ResultadosEvento;
  resultadosPublicados: boolean;
}

export function getEventoQuiniela(slug: string): EventoQuiniela | null {
  const ev = eventos.find(e => e.slug === slug);
  if (!ev || !Array.isArray(ev.fightCard) || ev.fightCard.length === 0) return null;

  const cfg = cfgEventos[slug] ?? {};
  const res = cfgResultados[slug] ?? {};

  const peleas: PeleaQuiniela[] = ev.fightCard
    .slice()
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
    .map((b: any): PeleaQuiniela => {
      const id = idPelea(b.f1, b.f2);
      return {
        id,
        orden: b.order ?? 0,
        f1: b.f1,
        f2: b.f2,
        f1Slug: slugPorNombre.get(slugificar(b.f1)) ?? null,
        f2Slug: slugPorNombre.get(slugificar(b.f2)) ?? null,
        division: b.weightClass ?? '',
        boutLabel: b.bout ?? '',
        segmento: normalizarSegmento(b.bout),
        esMainEvent: esMainEvent(b.bout),
        underdog: cfg.peleas?.[id]?.underdog ?? null,
      };
    });

  return {
    slug,
    nombre: ev.name,
    fecha: ev.date,
    lugar: ev.loc ?? null,
    peleas,
    cierre: cfg.cierre ?? null,
    picksQuimbara: cfg.picksQuimbara ?? {},
    resultados: res.resultados ?? {},
    resultadosPublicados: !!res.publicado,
  };
}

/** Eventos con cartelera cargada — los que pueden tener quiniela. */
export function getEventosConQuiniela(): EventoQuiniela[] {
  return eventos
    .filter(e => Array.isArray(e.fightCard) && e.fightCard.length > 0)
    .map(e => getEventoQuiniela(e.slug))
    .filter((e): e is EventoQuiniela => e !== null);
}

/** ¿Ya pasó la hora de cierre? Sin cierre configurado, se asume abierto. */
export function estaCerradoPorFecha(cierre: string | null, ahora = new Date()): boolean {
  if (!cierre) return false;
  const t = new Date(cierre).getTime();
  return Number.isFinite(t) && ahora.getTime() >= t;
}
