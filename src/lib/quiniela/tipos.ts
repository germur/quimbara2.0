/**
 * tipos.ts — contratos de la quiniela.
 *
 * Todo lo que persiste pasa por acá. Si mañana cambiamos localStorage por
 * Supabase, estos tipos no se tocan: solo cambia la implementación de
 * QuinielaStore.
 */

/** Esquina. 'f1' y 'f2' salen tal cual del fightCard del evento. */
export type Esquina = 'f1' | 'f2';

/**
 * Método de victoria. Agrupado a propósito:
 *  · 'ko'  cubre KO y TKO (el usuario no debería tener que adivinar cuál)
 *  · 'sub' sumisión
 *  · 'dec' cualquier decisión (unánime, dividida, mayoritaria)
 */
export type Metodo = 'ko' | 'sub' | 'dec';

export const METODOS: Array<{ valor: Metodo; label: string; corto: string }> = [
  { valor: 'ko',  label: 'KO / TKO',  corto: 'KO'  },
  { valor: 'sub', label: 'Sumisión',  corto: 'SUB' },
  { valor: 'dec', label: 'Decisión',  corto: 'DEC' },
];

/** Segmento de cartelera. Normalizado desde el campo `bout`, que viene sucio. */
export type Segmento = 'estelar' | 'preliminar';

export interface PeleaQuiniela {
  /** Id estable: slugs de los dos peleadores en orden alfabético */
  id: string;
  orden: number;
  f1: string;
  f2: string;
  /** Slug en fighters.json, si existe — para enlazar a la ficha */
  f1Slug: string | null;
  f2Slug: string | null;
  division: string;
  /** Etiqueta original ("Main Event", "prelim", …) para mostrar */
  boutLabel: string;
  segmento: Segmento;
  esMainEvent: boolean;
  /**
   * Esquina marcada como underdog según las odds de apertura.
   * Viene de quiniela-eventos.json, NO se calcula — el brief es explícito.
   * null = sin favorito marcado, no aplica multiplicador.
   */
  underdog: Esquina | null;
}

/** Un pick del usuario para una pelea. */
export interface Pick {
  ganador: Esquina;
  metodo: Metodo | null;
  /** Solo válido si metodo !== 'dec'. 1-5. */
  round: number | null;
}

/** Picks de un evento completo, indexados por PeleaQuiniela.id */
export type PicksEvento = Record<string, Pick>;

/** Resultado real de una pelea. `null` en ganador = No Contest / cancelada. */
export interface Resultado {
  ganador: Esquina | null;
  metodo: Metodo | null;
  round: number | null;
}

export type ResultadosEvento = Record<string, Resultado>;

// ─── Puntaje ─────────────────────────────────────────────────────────

export interface DesglosePelea {
  peleaId: string;
  /** null si el usuario no picó esta pelea */
  pick: Pick | null;
  resultado: Resultado | null;
  ganadorOk: boolean;
  metodoOk: boolean;
  roundOk: boolean;
  /** Puntos antes del multiplicador de underdog */
  subtotal: number;
  /** 1 o 1.5 */
  multiplicador: number;
  /** subtotal × multiplicador, redondeado */
  puntos: number;
  /** true si acertó picando al underdog */
  underdogAcertado: boolean;
}

export interface PuntajeEvento {
  eventoSlug: string;
  desglose: DesglosePelea[];
  /** Suma de puntos por pelea */
  puntosPeleas: number;
  /** +10 si acertó todos los ganadores de la cartelera estelar */
  bonoEstelar: number;
  total: number;
  /** Cuántos ganadores acertó / cuántas peleas con resultado */
  aciertos: number;
  resueltas: number;
}

// ─── Persistencia ────────────────────────────────────────────────────

export interface EntradaHistorial {
  eventoSlug: string;
  eventoNombre: string;
  fecha: string;
  total: number;
  aciertos: number;
  resueltas: number;
}

/**
 * Interfaz de persistencia. La feature entera habla con esto y nunca con
 * localStorage directo, así que migrar a Supabase es escribir una clase
 * nueva y cambiar la línea de `getStore()`.
 *
 * Todos los métodos son async aunque la implementación local sea sincrónica
 * — así el día que haya red no hay que cambiar los llamadores.
 */
export interface QuinielaStore {
  getPicks(eventoSlug: string): Promise<PicksEvento>;
  savePicks(eventoSlug: string, picks: PicksEvento): Promise<void>;
  /** Sella los picks. Después de esto savePicks debe rechazar. */
  cerrarPicks(eventoSlug: string): Promise<void>;
  estanCerrados(eventoSlug: string): Promise<boolean>;
  getHistorial(): Promise<EntradaHistorial[]>;
  guardarEnHistorial(entrada: EntradaHistorial): Promise<void>;
  /** Cartas desbloqueadas — el producto de cartas comparte este store */
  getCartasDesbloqueadas(): Promise<string[]>;
  desbloquearCarta(slug: string): Promise<void>;
}
