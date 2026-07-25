/**
 * store.ts — persistencia de la quiniela.
 *
 * ─── POR QUÉ HAY UNA INTERFAZ PARA GUARDAR EN localStorage ───────────
 * Porque el MVP es local pero la V2 tiene backend. Toda la feature habla
 * con `QuinielaStore` y nunca con `localStorage` directo, así que migrar es
 * escribir `SupabaseStore implements QuinielaStore` y cambiar una línea en
 * `getStore()`. Sin esto, migrar sería reescribir la feature.
 *
 * Los métodos son async aunque la implementación local sea sincrónica: así
 * los llamadores ya están escritos para un mundo con red.
 *
 * ─── LÍMITE CONOCIDO DEL MVP ─────────────────────────────────────────
 * El cierre de picks se valida contra el reloj del CLIENTE, que el usuario
 * puede cambiar. En un MVP sin leaderboard eso da igual: solo se estaría
 * engañando a sí mismo. En V2 el sello tiene que venir con timestamp del
 * servidor o el leaderboard no vale nada.
 */

import type {
  EntradaHistorial,
  PicksEvento,
  QuinielaStore,
} from './tipos';

const PREFIJO = 'quimbara.quiniela.v1';
const K = {
  picks:    (e: string) => `${PREFIJO}.picks.${e}`,
  cerrado:  (e: string) => `${PREFIJO}.cerrado.${e}`,
  historial: `${PREFIJO}.historial`,
  cartas:    `${PREFIJO}.cartas`,
};

/** Lanzado por savePicks cuando los picks ya están sellados. */
export class PicksCerradosError extends Error {
  constructor(eventoSlug: string) {
    super(`Los picks de ${eventoSlug} ya están cerrados`);
    this.name = 'PicksCerradosError';
  }
}

function leer<T>(clave: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(clave);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function escribir(clave: string, valor: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch (e) {
    // Cuota llena o modo privado en Safari. No es fatal: la sesión sigue
    // funcionando en memoria, solo no persiste.
    console.warn('[quiniela] no se pudo persistir:', e);
  }
}

export class LocalStorageStore implements QuinielaStore {
  async getPicks(eventoSlug: string): Promise<PicksEvento> {
    return leer<PicksEvento>(K.picks(eventoSlug), {});
  }

  async savePicks(eventoSlug: string, picks: PicksEvento): Promise<void> {
    if (await this.estanCerrados(eventoSlug)) {
      throw new PicksCerradosError(eventoSlug);
    }
    escribir(K.picks(eventoSlug), picks);
  }

  async cerrarPicks(eventoSlug: string): Promise<void> {
    escribir(K.cerrado(eventoSlug), { cerrado: true, en: new Date().toISOString() });
  }

  async estanCerrados(eventoSlug: string): Promise<boolean> {
    return leer<{ cerrado?: boolean }>(K.cerrado(eventoSlug), {}).cerrado === true;
  }

  async getHistorial(): Promise<EntradaHistorial[]> {
    const h = leer<EntradaHistorial[]>(K.historial, []);
    // Más reciente primero — la racha se calcula en ese orden
    return [...h].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  async guardarEnHistorial(entrada: EntradaHistorial): Promise<void> {
    const h = leer<EntradaHistorial[]>(K.historial, []);
    const i = h.findIndex(x => x.eventoSlug === entrada.eventoSlug);
    if (i >= 0) h[i] = entrada;
    else h.push(entrada);
    escribir(K.historial, h);
  }

  async getCartasDesbloqueadas(): Promise<string[]> {
    return leer<string[]>(K.cartas, []);
  }

  async desbloquearCarta(slug: string): Promise<void> {
    const c = leer<string[]>(K.cartas, []);
    if (!c.includes(slug)) {
      c.push(slug);
      escribir(K.cartas, c);
    }
  }
}

let instancia: QuinielaStore | null = null;

/**
 * Punto único de cambio para la migración a backend.
 * V2: `instancia = new SupabaseStore(cliente)` y nada más se toca.
 */
export function getStore(): QuinielaStore {
  if (!instancia) instancia = new LocalStorageStore();
  return instancia;
}

/** Solo para tests: permite inyectar un store falso. */
export function _setStore(s: QuinielaStore | null): void {
  instancia = s;
}
