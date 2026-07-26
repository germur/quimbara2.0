/**
 * peleas.ts — historial de peleas y geometría del Camino del Peleador.
 *
 * Los datos vienen de scripts/fetch-peleas.mjs (Wikipedia). Ver ese archivo
 * para los límites de la fuente.
 *
 * ─── DECISIONES DE LECTURA VISUAL ────────────────────────────────────
 * · La ALTURA del nodo es la importancia de la pelea. Los nodos conectados
 *   dibujan el arco de la carrera: las peleas de título pican hacia arriba,
 *   así que un campeón se ve distinto de un prospecto de un vistazo.
 * · El GROSOR del segmento es la racha activa. Racha de victorias engorda
 *   la línea en tinta; racha de derrotas la adelgaza y la pinta en rojo.
 *   Las cuatro derrotas seguidas de Chito Vera tienen que leerse solas.
 * · El RELLENO del nodo es el resultado: victoria lleno, derrota hueco,
 *   empate mitad y mitad. Es la misma convención que los form-dots que ya
 *   usa el sitio, así que no hay que aprender un código nuevo.
 */

import PELEAS_RAW from '../data/peleadores-peleas.json';

export type ResultadoPelea = 'victoria' | 'derrota' | 'empate' | 'nc';
export type MetodoPelea = 'ko' | 'sub' | 'dec' | 'otro';
export type Importancia = 'titulo' | 'main-event' | 'co-main' | 'main-card' | 'prelim';

export interface Pelea {
  fecha: string | null;
  resultado: ResultadoPelea;
  registro: string;
  rivalNombre: string;
  rivalSlug: string | null;
  metodo: MetodoPelea;
  metodoDetalle: string;
  round: number | null;
  tiempo: string | null;
  evento: string | null;
  eventoSlug: string | null;
  importancia: Importancia;
  importanciaInferida: boolean;
  notas: string | null;
}

export interface DesgloseRecord {
  koVictorias: number;
  subVictorias: number;
  decVictorias: number;
  koDerrotas: number;
  subDerrotas: number;
  decDerrotas: number;
}

export interface HistorialPeleador {
  wikipedia: string;
  actualizado: string;
  recordWiki: string;
  /** null si el desglose de Wikipedia no cuadraba con su propia tabla */
  desglose: DesgloseRecord | null;
  peleas: Pelea[];
}

const TABLA = (PELEAS_RAW as any).peleadores as Record<string, any>;

export interface BioWikipedia {
  nacimiento: string | null;
  paisNacimiento: string | null;
  nacionalidad: string | null;
}

/**
 * Accesor liviano a los datos biográficos, sin arrastrar las 49 peleas.
 * Lo usa peleadores.ts para rellenar edad y país en la carta.
 */
export function getBio(slug: string): BioWikipedia | null {
  return (TABLA[slug]?.bio as BioWikipedia | undefined) ?? null;
}

export function getHistorial(slug: string): HistorialPeleador | null {
  const h = TABLA[slug];
  if (!h || !Array.isArray(h.peleas) || h.peleas.length === 0) return null;
  return {
    wikipedia: h.wikipedia,
    actualizado: h.actualizado,
    recordWiki: h.recordWiki ?? '',
    // Solo se expone el desglose si cuadra. Ver fetch-peleas.mjs.
    desglose: h.desgloseCuadra ? h.desglose : null,
    peleas: h.peleas as Pelea[],
  };
}

// ─── Rachas ──────────────────────────────────────────────────────────

export interface Racha {
  tipo: 'victorias' | 'derrotas' | null;
  largo: number;
}

/** Racha activa al final del historial (la más reciente). */
export function rachaActual(peleas: Pelea[]): Racha {
  if (!peleas.length) return { tipo: null, largo: 0 };
  const ultimo = peleas[peleas.length - 1].resultado;
  if (ultimo !== 'victoria' && ultimo !== 'derrota') return { tipo: null, largo: 0 };

  let largo = 0;
  for (let i = peleas.length - 1; i >= 0; i--) {
    if (peleas[i].resultado !== ultimo) break;
    largo++;
  }
  return { tipo: ultimo === 'victoria' ? 'victorias' : 'derrotas', largo };
}

/** Racha acumulada hasta cada índice. Alimenta el grosor de los segmentos. */
function rachasPorIndice(peleas: Pelea[]): Racha[] {
  const out: Racha[] = [];
  let tipo: Racha['tipo'] = null;
  let largo = 0;

  for (const p of peleas) {
    // Empate y No Contest cortan la racha sin abrir una nueva
    const t: Racha['tipo'] = p.resultado === 'victoria' ? 'victorias'
                           : p.resultado === 'derrota'  ? 'derrotas'
                           : null;
    if (t && t === tipo) largo++;
    else if (t) { tipo = t; largo = 1; }
    else { tipo = null; largo = 0; }
    out.push({ tipo, largo });
  }
  return out;
}

// ─── Geometría del timeline ──────────────────────────────────────────

/** Altura del nodo por importancia. Menor y = más arriba = más importante. */
const NIVEL: Record<Importancia, number> = {
  'titulo': 0,
  'main-event': 1,
  'co-main': 2,
  'main-card': 3,
  'prelim': 4,
};

export interface NodoTimeline {
  i: number;
  x: number;
  y: number;
  pelea: Pelea;
  racha: Racha;
  /** Grosor del segmento que llega a este nodo desde el anterior */
  grosorEntrada: number;
  /** Color del segmento de entrada */
  colorEntrada: string;
}

export interface GeometriaTimeline {
  nodos: NodoTimeline[];
  ancho: number;
  alto: number;
  /** Path del eje que conecta todos los nodos */
  path: string;
  /** Guías horizontales por nivel presente */
  niveles: Array<{ y: number; label: string }>;
  radio: number;
}

const COLOR = {
  victoria: '#0A0A0B',
  derrota: '#E53935',
  neutro: '#C9C3B4',
} as const;

/**
 * Calcula posiciones. El espaciado es FIJO por nodo, no comprimido para
 * caber: con 49 peleas el SVG mide ~1200px y scrollea horizontalmente, que
 * es legible. Comprimir haría los nodos indistinguibles. Con pocas peleas
 * el espaciado crece para que la línea no se vea vacía.
 */
export function calcularTimeline(
  peleas: Pelea[],
  opciones: { anchoDisponible?: number } = {}
): GeometriaTimeline {
  const { anchoDisponible = 860 } = opciones;

  const ESPACIADO_MIN = 22;
  const ESPACIADO_MAX = 74;
  const MARGEN_X = 26;
  const RADIO = 7;

  const n = peleas.length;
  const espacioUtil = anchoDisponible - MARGEN_X * 2;
  const espaciado = n > 1
    ? Math.min(ESPACIADO_MAX, Math.max(ESPACIADO_MIN, espacioUtil / (n - 1)))
    : 0;

  /**
   * El ancho es el que el contenido REALMENTE ocupa, no el disponible.
   * Forzarlo al ancho del contenedor dejaba media caja vacía cuando el
   * peleador tiene pocas peleas —el caso del prospecto que el brief pide
   * que no se vea vacío—. Cuando el SVG queda más angosto que su caja, el
   * componente lo centra con margin-inline:auto; cuando queda más ancho
   * (49 peleas en móvil), la caja scrollea.
   */
  const ancho = Math.max(240, MARGEN_X * 2 + espaciado * Math.max(0, n - 1));

  // Solo se reservan los niveles que realmente aparecen, para que el gráfico
  // no tenga bandas vacías cuando un peleador nunca peleó por el título.
  const nivelesPresentes = [...new Set(peleas.map(p => NIVEL[p.importancia] ?? 3))].sort((a, b) => a - b);
  const ALTO_NIVEL = 34;
  const MARGEN_Y = 22;
  const alto = MARGEN_Y * 2 + Math.max(1, nivelesPresentes.length - 1) * ALTO_NIVEL;

  const yDeNivel = (nivel: number) => {
    const idx = nivelesPresentes.indexOf(nivel);
    return MARGEN_Y + (idx < 0 ? nivelesPresentes.length - 1 : idx) * ALTO_NIVEL;
  };

  const rachas = rachasPorIndice(peleas);

  const nodos: NodoTimeline[] = peleas.map((pelea, i) => {
    const racha = rachas[i];
    // Grosor: 1.5px base, engorda con la racha, tope a 5px
    const grosor = racha.tipo === 'victorias'
      ? Math.min(5, 1.5 + racha.largo * 0.55)
      : racha.tipo === 'derrotas'
        ? Math.max(1, 2.2 - racha.largo * 0.25)
        : 1.5;

    return {
      i,
      x: MARGEN_X + i * espaciado,
      y: yDeNivel(NIVEL[pelea.importancia] ?? 3),
      pelea,
      racha,
      grosorEntrada: Number(grosor.toFixed(2)),
      colorEntrada: racha.tipo === 'derrotas' ? COLOR.derrota
                  : racha.tipo === 'victorias' ? COLOR.victoria
                  : COLOR.neutro,
    };
  });

  const path = nodos.map((nd, i) => `${i === 0 ? 'M' : 'L'} ${nd.x.toFixed(1)} ${nd.y}`).join(' ');

  const LABEL_NIVEL: Record<number, string> = {
    0: 'Título', 1: 'Main event', 2: 'Co-main', 3: 'Cartelera', 4: 'Prelim',
  };
  const niveles = nivelesPresentes.map(nv => ({ y: yDeNivel(nv), label: LABEL_NIVEL[nv] ?? '' }));

  return { nodos, ancho, alto, path, niveles, radio: RADIO };
}

// ─── Texto ───────────────────────────────────────────────────────────

export const METODO_LABEL: Record<MetodoPelea, string> = {
  ko: 'KO/TKO', sub: 'Sumisión', dec: 'Decisión', otro: 'Otro',
};

export const RESULTADO_LABEL: Record<ResultadoPelea, string> = {
  victoria: 'Victoria', derrota: 'Derrota', empate: 'Empate', nc: 'Sin resultado',
};

export function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

/** Resumen en prosa para el bloque de texto indexable. */
export function resumenHistorial(nombre: string, peleas: Pelea[]): string {
  const v = peleas.filter(p => p.resultado === 'victoria').length;
  const d = peleas.filter(p => p.resultado === 'derrota').length;
  const titulos = peleas.filter(p => p.importancia === 'titulo').length;
  const finish = peleas.filter(p => p.resultado === 'victoria' && p.metodo !== 'dec').length;
  const r = rachaActual(peleas);

  const partes = [
    `${nombre} acumula ${peleas.length} peleas profesionales registradas: ` +
    `${v} victorias y ${d} derrotas.`,
  ];
  if (v > 0) {
    const pct = Math.round((finish / v) * 100);
    partes.push(`${finish} de sus ${v} victorias llegaron por finalización (${pct}%).`);
  }
  if (titulos > 0) {
    partes.push(`Ha disputado ${titulos} pelea${titulos === 1 ? '' : 's'} de campeonato.`);
  }
  if (r.tipo && r.largo > 1) {
    partes.push(
      r.tipo === 'victorias'
        ? `Llega con una racha activa de ${r.largo} victorias consecutivas.`
        : `Arrastra ${r.largo} derrotas consecutivas.`
    );
  }
  const primera = peleas.find(p => p.fecha);
  if (primera?.fecha) {
    partes.push(`Su primera pelea registrada es de ${primera.fecha.slice(0, 4)}.`);
  }
  return partes.join(' ');
}
