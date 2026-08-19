/**
 * peleadores.ts — capa de acceso a datos de peleadores.
 *
 * ─── POR QUÉ ESTA CAPA EXISTE ────────────────────────────────────────
 * `fighters.json` guarda las medidas como vienen de UFC.com: imperiales
 * y en string ("5' 7\"", "69\"", "155 lbs"). El comparador, las cartas y
 * el timeline necesitan números en métrico. Esta capa hace esa derivación
 * en un solo lugar, para que ningún componente parsee strings a mano.
 *
 * ─── SOBRE LA "VERIFICACIÓN" ─────────────────────────────────────────
 * El blueprint original pedía un flag `verificado` manual porque su seed
 * traía medidas estimadas a mano. Nuestra data NO es estimada: sale del
 * perfil oficial de UFC.com vía `npm run data:all`, que corre cada lunes.
 * Un flag manual sobre 4.489 peleadores sería teatro, no verificación.
 *
 * Lo que sí protege el dato es lo que hace `esComparable()`:
 *   1. altura y alcance existen y parsean
 *   2. ambos caen en rango fisiológico plausible
 * Si UFC.com publica basura o cambia el formato del HTML, el peleador
 * cae de `comparable` y desaparece del render público solo.
 *
 * REGLA DURA: `getPeleadores()` y `getPeleador()` devuelven SOLO
 * comparables. Para herramientas internas (auditoría) hay que pedir
 * explícitamente `{ soloComparables: false }`.
 * ─────────────────────────────────────────────────────────────────────
 */

import { z } from 'zod';
import FIGHTERS from '../data/fighters.json';
import EDITORIAL from '../data/peleadores-editorial.json';
import { divLabels, divSlugs, slugToDiv, isFemale } from '../data/divisions';
import { getBio } from './peleas';
import { resolverPais, type PaisResuelto } from './paises';

// ─── Rangos de validación ────────────────────────────────────────────
export const RANGO = {
  altura_cm:  { min: 150, max: 210 },
  alcance_cm: { min: 150, max: 220 },
  peso_kg:    { min: 40,  max: 200 },
} as const;

// ─── Tipos ───────────────────────────────────────────────────────────
export type Rareza = 'legendaria' | 'epica' | 'rara' | 'comun';

export interface Peleador {
  slug: string;
  nombre: string;
  apodo: string | null;
  /**
   * País normalizado con bandera. Resuelto con precedencia:
   * override a mano > birth_place de Wikipedia > demónimo. Ver lib/paises.ts.
   * `iso` en null significa que no se pudo determinar con confianza — la
   * carta omite la bandera en vez de mostrar una equivocada.
   */
  pais: PaisResuelto;
  /** Valor crudo de fighters.json. Inconsistente; solo para depurar. */
  paisCrudo: string | null;
  img: string | null;

  /** Nombre interno de división, ej. "Lightweight" */
  division: string;
  /** Etiqueta en español, ej. "Ligero" */
  divisionLabel: string;
  /** Slug de URL, ej. "ligero" */
  divisionSlug: string;
  femenina: boolean;

  /** null (sin ranking) | 1-15 | "C" (campeón) */
  ranking: number | 'C' | null;
  rareza: Rareza;

  fisico: {
    altura_cm: number | null;
    alcance_cm: number | null;
    peso_kg: number | null;
    /** alcance − altura. Positivo = envergadura mayor que estatura. */
    ape_index: number | null;
    postura: string | null;
  };

  record: {
    /** Récord profesional completo, ej. "17-1-0" */
    texto: string | null;
    victorias: number | null;
    derrotas: number | null;
    empates: number | null;
  };

  /** Últimas 5 peleas (lo único de historial que tenemos hoy) */
  forma: Array<{ outcome: string; winType: string }>;

  /** Frase editorial de Quimbara. null si aún no está escrita. */
  arma: string | null;
  armaRevisada: boolean;
  nacimiento: string | null;
  edad: number | null;

  equipo: string | null;
  /** Cumple los requisitos para renderizarse en producto visual */
  comparable: boolean;
}

// ─── Schema Zod ──────────────────────────────────────────────────────
export const PeleadorSchema = z.object({
  slug: z.string().min(1),
  nombre: z.string().min(1),
  division: z.string().min(1),
  ranking: z.union([z.number().int().min(1).max(15), z.literal('C'), z.null()]),
  fisico: z.object({
    altura_cm:  z.number().min(RANGO.altura_cm.min).max(RANGO.altura_cm.max).nullable(),
    alcance_cm: z.number().min(RANGO.alcance_cm.min).max(RANGO.alcance_cm.max).nullable(),
    peso_kg:    z.number().min(RANGO.peso_kg.min).max(RANGO.peso_kg.max).nullable(),
    ape_index:  z.number().nullable(),
    postura:    z.string().nullable(),
  }),
});

// ─── Parsers imperial → métrico ──────────────────────────────────────
/** `5' 7"` → 170 cm */
export function parseAltura(raw?: string | null): number | null {
  if (!raw) return null;
  const m = /(\d+)\s*'\s*(\d+(?:\.\d+)?)?/.exec(raw);
  if (!m) return null;
  const cm = Math.round((Number(m[1]) * 12 + Number(m[2] ?? 0)) * 2.54);
  return Number.isFinite(cm) ? cm : null;
}

/** `69"` → 175 cm */
export function parseAlcance(raw?: string | null): number | null {
  if (!raw) return null;
  const m = /(\d+(?:\.\d+)?)\s*"/.exec(raw);
  if (!m) return null;
  const cm = Math.round(Number(m[1]) * 2.54);
  return Number.isFinite(cm) ? cm : null;
}

/** `155 lbs` → 70 kg */
export function parsePeso(raw?: string | null): number | null {
  if (!raw) return null;
  const m = /(\d+(?:\.\d+)?)\s*lbs?/i.exec(raw);
  if (!m) return null;
  const kg = Math.round(Number(m[1]) * 0.453592);
  return Number.isFinite(kg) ? kg : null;
}

/** `17-1-0` → { victorias:17, derrotas:1, empates:0 } */
export function parseRecord(raw?: string | null) {
  if (!raw) return { texto: null, victorias: null, derrotas: null, empates: null };
  const m = /(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/.exec(raw);
  if (!m) return { texto: raw, victorias: null, derrotas: null, empates: null };
  return {
    texto: raw,
    victorias: Number(m[1]),
    derrotas: Number(m[2]),
    empates: Number(m[3]),
  };
}

function enRango(v: number | null, r: { min: number; max: number }): boolean {
  return v !== null && v >= r.min && v <= r.max;
}

/**
 * Ape index fisiológicamente plausible.
 * El récord real conocido es Jon Jones con +22 cm. Fuera de −15/+25 casi
 * siempre significa que UFC.com publicó mal el dato, no que exista un
 * peleador con esas proporciones.
 */
export function apeIndexPlausible(ape: number | null): boolean {
  return ape === null || (ape >= -15 && ape <= 25);
}

function calcularEdad(nacimiento: string | null): number | null {
  if (!nacimiento) return null;
  const d = new Date(nacimiento);
  if (Number.isNaN(d.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - d.getFullYear();
  const m = hoy.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) edad--;
  return edad >= 15 && edad <= 60 ? edad : null;
}

// ─── Rareza ──────────────────────────────────────────────────────────
/**
 * Se calcula SIEMPRE desde `ranking`, nunca se hardcodea.
 * Cuando el pipeline refresca rankings el lunes, las cartas se
 * recalculan solas sin tocar código.
 */
export function calcularRareza(ranking: number | 'C' | null): Rareza {
  if (ranking === 'C') return 'legendaria';
  if (typeof ranking === 'number') {
    if (ranking >= 1 && ranking <= 5) return 'epica';
    if (ranking <= 15) return 'rara';
  }
  return 'comun';
}

function parseRanking(raw?: string | null): number | 'C' | null {
  if (!raw) return null;
  if (raw === 'C') return 'C';
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 15 ? n : null;
}

// ─── Derivación ──────────────────────────────────────────────────────
type RawFighter = (typeof FIGHTERS)[number];
const EDIT = (EDITORIAL as any).peleadores as Record<
  string,
  { arma: string | null; armaRevisada: boolean; nacimiento: string | null }
>;

function derivar(f: RawFighter): Peleador {
  const altura_cm  = parseAltura((f as any).height);
  const alcance_cm = parseAlcance((f as any).reach);
  const peso_kg    = parsePeso((f as any).weight);

  const ranking = parseRanking((f as any).rank);
  const ed = EDIT[f.slug] ?? { arma: null, armaRevisada: false, nacimiento: null };

  // Edad y país: el override editorial gana, después lo scrapeado de Wikipedia.
  // fighters.json no trae fecha de nacimiento y su campo `from` es inconsistente.
  const bio = getBio(f.slug);
  const nacimiento = ed.nacimiento ?? bio?.nacimiento ?? null;
  const pais = resolverPais({
    override: (ed as any).pais ?? null,
    paisNacimiento: bio?.paisNacimiento ?? null,
    nacionalidad: bio?.nacionalidad ?? null,
    paisUfc: (f as any).from ?? null,
  });

  const div = (f as any).div ?? '';
  const ape = altura_cm !== null && alcance_cm !== null ? alcance_cm - altura_cm : null;

  /**
   * Un peleador solo entra a producto visual si:
   *   · tiene altura y alcance en rango  → el comparador puede dibujarlo
   *   · tiene división                   → comparador y badge la necesitan
   *   · su ape index es plausible        → filtra data corrupta de UFC.com
   * Cualquier dato basura queda fuera del render solo, sin intervención.
   */
  const comparable =
    enRango(altura_cm, RANGO.altura_cm) &&
    enRango(alcance_cm, RANGO.alcance_cm) &&
    div !== '' &&
    apeIndexPlausible(ape);

  return {
    slug: f.slug,
    nombre: f.name,
    apodo: (f as any).nick?.trim() || null,
    pais,
    paisCrudo: (f as any).from || null,
    img: (f as any).img || null,

    division: div,
    divisionLabel: divLabels[div] ?? div,
    divisionSlug: divSlugs[div] ?? '',
    femenina: isFemale(div),

    ranking,
    rareza: calcularRareza(ranking),

    fisico: {
      altura_cm,
      alcance_cm,
      peso_kg,
      ape_index: ape,
      postura: (f as any).stance || null,
    },

    record: parseRecord((f as any).rec),
    forma: ((f as any).formTypes ?? []) as Array<{ outcome: string; winType: string }>,

    arma: ed.arma,
    armaRevisada: ed.armaRevisada,
    nacimiento,
    edad: calcularEdad(nacimiento),

    equipo: (f as any).team || null,
    comparable,
  };
}

/** Índice completo, derivado una sola vez al importar el módulo. */
const TODOS: Peleador[] = (FIGHTERS as RawFighter[]).map(derivar);
const POR_SLUG = new Map(TODOS.map(p => [p.slug, p]));

// ─── API pública ─────────────────────────────────────────────────────

export interface OpcionesPeleadores {
  /** Nombre interno ("Lightweight") o slug ("ligero") */
  division?: string;
  /** REGLA DURA: por defecto true. false solo para auditoría interna. */
  soloComparables?: boolean;
  /** Solo campeón + top 15 */
  conRanking?: boolean;
  /** Solo los que tienen frase editorial escrita */
  conArma?: boolean;
}

export function getPeleadores(opts: OpcionesPeleadores = {}): Peleador[] {
  const { division, soloComparables = true, conRanking = false, conArma = false } = opts;

  let out = TODOS;

  if (soloComparables) out = out.filter(p => p.comparable);
  if (conRanking)      out = out.filter(p => p.ranking !== null);
  if (conArma)         out = out.filter(p => p.arma !== null);

  if (division) {
    const div = slugToDiv[division] ?? division;
    out = out.filter(p => p.division === div);
  }

  return out.sort(ordenarPorRanking);
}

/** Devuelve null si el peleador no es comparable (regla dura). */
export function getPeleador(slug: string, opts: { soloComparables?: boolean } = {}): Peleador | null {
  const { soloComparables = true } = opts;
  const p = POR_SLUG.get(slug);
  if (!p) return null;
  if (soloComparables && !p.comparable) return null;
  return p;
}

/** Campeón primero, luego 1→15, luego sin ranking alfabético. */
export function ordenarPorRanking(a: Peleador, b: Peleador): number {
  const val = (r: number | 'C' | null) => (r === 'C' ? 0 : typeof r === 'number' ? r : 999);
  const d = val(a.ranking) - val(b.ranking);
  return d !== 0 ? d : a.nombre.localeCompare(b.nombre);
}

export interface ParComparable {
  a: Peleador;
  b: Peleador;
  /** Slug canónico del par: orden alfabético. Ver regla de canonicalización. */
  slug: string;
  distanciaRanking: number;
}

/**
 * Pares con sentido deportivo: misma división y ranking cercano.
 *
 * El slug SIEMPRE va en orden alfabético — esa es la URL canónica.
 * El orden visual en pantalla se controla con query param, nunca con
 * la URL, para no generar dos páginas por par.
 */
export function getParesComparables(opts: { maxDistancia?: number; division?: string } = {}): ParComparable[] {
  const { maxDistancia = 5, division } = opts;
  const pool = getPeleadores({ division, conRanking: true });
  const val = (r: number | 'C' | null) => (r === 'C' ? 0 : typeof r === 'number' ? r : 999);

  const pares: ParComparable[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const x = pool[i], y = pool[j];
      if (x.division !== y.division) continue;
      const dist = Math.abs(val(x.ranking) - val(y.ranking));
      if (dist > maxDistancia) continue;

      const [a, b] = x.slug < y.slug ? [x, y] : [y, x];
      pares.push({ a, b, slug: `${a.slug}-vs-${b.slug}`, distanciaRanking: dist });
    }
  }
  return pares.sort((p, q) => p.distanciaRanking - q.distanciaRanking);
}

/** Slug canónico de un par, en orden alfabético. */
export function slugPar(slugA: string, slugB: string): string {
  return slugA < slugB ? `${slugA}-vs-${slugB}` : `${slugB}-vs-${slugA}`;
}

/** Rivales sugeridos para el módulo embebido en la ficha. */
export function getRivalesSugeridos(slug: string, n = 3): Peleador[] {
  const p = getPeleador(slug);
  if (!p) return [];
  const val = (r: number | 'C' | null) => (r === 'C' ? 0 : typeof r === 'number' ? r : 999);
  const base = val(p.ranking);

  return getPeleadores({ division: p.division, conRanking: true })
    .filter(x => x.slug !== slug)
    .sort((x, y) => Math.abs(val(x.ranking) - base) - Math.abs(val(y.ranking) - base))
    .slice(0, n);
}

/** Acceso sin filtros. SOLO para auditoría — nunca para render público. */
export function _todosParaAuditoria(): Peleador[] {
  return TODOS;
}
