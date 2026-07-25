/**
 * puntaje.ts — motor de puntaje de la quiniela.
 *
 * Funciones puras, sin dependencias de DOM ni de storage. Se usan igual en
 * el servidor (para los picks de Quimbara) que en el cliente (para los del
 * usuario), y son las que hay que testear si algún día se disputa un puntaje.
 *
 * ─── REGLAS ──────────────────────────────────────────────────────────
 *   Ganador correcto ................................. 3 pts
 *   Método correcto .................................. +2 pts
 *   Round correcto ................................... +3 pts
 *   Cartelera estelar completa (todos los ganadores) .. +10 pts
 *   Underdog acertado ................................ ×1.5 en esa pelea
 *
 * ─── DECISIONES DE INTERPRETACIÓN ────────────────────────────────────
 * El brief lista método y round con "+", lo que implica que se suman sobre
 * el acierto del ganador. Acá eso se implementa como dependencia dura:
 *
 *   · Método solo puntúa si el ganador es correcto.
 *   · Round solo puntúa si el ganador Y el método son correctos, y el
 *     método no es decisión (una decisión no tiene round de finalización).
 *
 * Sin esa dependencia se podría sumar puntos "adivinando que fue por KO"
 * mientras se falla quién ganó, que no tiene sentido deportivo.
 *
 * El multiplicador de underdog aplica al subtotal completo de la pelea, no
 * solo a los 3 puntos del ganador: premiar el riesgo debe premiar también
 * la precisión con la que se acertó.
 */

import type {
  DesglosePelea,
  Esquina,
  PeleaQuiniela,
  Pick,
  PicksEvento,
  PuntajeEvento,
  Resultado,
  ResultadosEvento,
} from './tipos';

export const PUNTOS = {
  ganador: 3,
  metodo: 2,
  round: 3,
  bonoEstelar: 10,
  multiplicadorUnderdog: 1.5,
} as const;

/**
 * Mínimo de peleas en la estelar para que el bono de +10 exista.
 *
 * Una cartelera estelar real tiene 5 peleas. Pero cuando UFC recién anuncia
 * un evento, `fightCard` puede traer 1 o 2 — y ahí +10 por acertar una sola
 * pelea vale más que la pelea misma (3-8 pts). Con este piso el bono solo
 * aparece cuando hay una cartelera de verdad que acertar.
 */
export const MIN_ESTELARES_PARA_BONO = 3;

/** Rounds válidos para un pick, según el segmento de la pelea. */
export function roundsValidos(esMainEvent: boolean): number[] {
  return esMainEvent ? [1, 2, 3, 4, 5] : [1, 2, 3];
}

/** Un pick está completo si al menos tiene ganador. Método y round son opcionales. */
export function pickCompleto(pick: Pick | undefined | null): boolean {
  return !!pick?.ganador;
}

/**
 * ¿Este pick puede llevar round? Solo si eligió método de finalización.
 * La UI usa esto para habilitar/deshabilitar el selector.
 */
export function admiteRound(pick: Pick | undefined | null): boolean {
  return !!pick?.metodo && pick.metodo !== 'dec';
}

function puntuarPelea(
  pelea: PeleaQuiniela,
  pick: Pick | null,
  resultado: Resultado | null
): DesglosePelea {
  const base: DesglosePelea = {
    peleaId: pelea.id,
    pick,
    resultado,
    ganadorOk: false,
    metodoOk: false,
    roundOk: false,
    subtotal: 0,
    multiplicador: 1,
    puntos: 0,
    underdogAcertado: false,
  };

  // Sin pick, sin resultado, o No Contest → 0 puntos, sin penalización
  if (!pick || !resultado || resultado.ganador === null) return base;

  const ganadorOk = pick.ganador === resultado.ganador;
  if (!ganadorOk) return { ...base, ganadorOk: false };

  let subtotal = PUNTOS.ganador;

  const metodoOk = !!pick.metodo && !!resultado.metodo && pick.metodo === resultado.metodo;
  if (metodoOk) subtotal += PUNTOS.metodo;

  // Round solo cuenta con método de finalización acertado
  const roundOk =
    metodoOk &&
    pick.metodo !== 'dec' &&
    pick.round !== null &&
    resultado.round !== null &&
    pick.round === resultado.round;
  if (roundOk) subtotal += PUNTOS.round;

  const underdogAcertado = pelea.underdog !== null && pick.ganador === pelea.underdog;
  const multiplicador = underdogAcertado ? PUNTOS.multiplicadorUnderdog : 1;

  return {
    peleaId: pelea.id,
    pick,
    resultado,
    ganadorOk: true,
    metodoOk,
    roundOk,
    subtotal,
    multiplicador,
    puntos: Math.round(subtotal * multiplicador),
    underdogAcertado,
  };
}

export function calcularPuntaje(
  eventoSlug: string,
  peleas: PeleaQuiniela[],
  picks: PicksEvento,
  resultados: ResultadosEvento
): PuntajeEvento {
  const desglose = peleas.map(p =>
    puntuarPelea(p, picks[p.id] ?? null, resultados[p.id] ?? null)
  );

  const puntosPeleas = desglose.reduce((n, d) => n + d.puntos, 0);

  // Bono de cartelera estelar: todos los ganadores de la estelar acertados.
  // Requiere que la estelar esté completamente resuelta.
  const estelares = peleas.filter(p => p.segmento === 'estelar');
  const estelaresResueltas = estelares.filter(
    p => resultados[p.id] && resultados[p.id].ganador !== null
  );
  const estelarPerfecta =
    estelares.length >= MIN_ESTELARES_PARA_BONO &&
    estelaresResueltas.length === estelares.length &&
    estelares.every(p => desglose.find(d => d.peleaId === p.id)?.ganadorOk);

  const bonoEstelar = estelarPerfecta ? PUNTOS.bonoEstelar : 0;

  const resueltas = desglose.filter(d => d.resultado && d.resultado.ganador !== null).length;
  const aciertos = desglose.filter(d => d.ganadorOk).length;

  return {
    eventoSlug,
    desglose,
    puntosPeleas,
    bonoEstelar,
    total: puntosPeleas + bonoEstelar,
    aciertos,
    resueltas,
  };
}

/** Máximo teórico alcanzable, para mostrar "23 / 78". */
export function puntajeMaximo(peleas: PeleaQuiniela[]): number {
  const porPelea = PUNTOS.ganador + PUNTOS.metodo + PUNTOS.round;
  const max = peleas.reduce((n, p) => {
    const mult = p.underdog !== null ? PUNTOS.multiplicadorUnderdog : 1;
    return n + Math.round(porPelea * mult);
  }, 0);
  const estelares = peleas.filter(p => p.segmento === 'estelar').length;
  return max + (estelares >= MIN_ESTELARES_PARA_BONO ? PUNTOS.bonoEstelar : 0);
}

/** Racha de eventos consecutivos con puntaje > 0, del más reciente hacia atrás. */
export function calcularRacha(historial: Array<{ total: number }>): number {
  let racha = 0;
  for (const h of historial) {
    if (h.total > 0) racha++;
    else break;
  }
  return racha;
}
