/**
 * test-puntaje.ts — verificación del motor de puntaje de la quiniela.
 *
 *   npm run test:puntaje
 *
 * El repo no tiene framework de tests, así que esto sigue el patrón del
 * script de auditoría: asserts explícitos, salida legible, exit != 0 si algo
 * falla. Se corre en el workflow.
 *
 * Es la lógica que decide puntajes de usuarios: un error acá es una disputa.
 * Cada regla del brief tiene su caso.
 */

import { calcularPuntaje, puntajeMaximo, calcularRacha, PUNTOS } from '../src/lib/quiniela/puntaje.ts';
import type { PeleaQuiniela, PicksEvento, ResultadosEvento } from '../src/lib/quiniela/tipos.ts';

let ok = 0;
const fallos: string[] = [];

function chequear(nombre: string, real: unknown, esperado: unknown) {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallos.push(`${nombre}\n      esperado: ${b}\n      real:     ${a}`); console.log(`  ✗ ${nombre}`); }
}

// ─── Fixtures ────────────────────────────────────────────────────────
const pelea = (
  id: string,
  segmento: 'estelar' | 'preliminar' = 'estelar',
  underdog: 'f1' | 'f2' | null = null,
  esMainEvent = false
): PeleaQuiniela => ({
  id, orden: 0, f1: 'A', f2: 'B', f1Slug: null, f2Slug: null,
  division: 'Lightweight', boutLabel: 'x', segmento, esMainEvent, underdog,
});

const puntos = (
  peleas: PeleaQuiniela[], picks: PicksEvento, res: ResultadosEvento
) => calcularPuntaje('ev', peleas, picks, res);

console.log('\n─── PUNTAJE POR PELEA ─────────────────────────────────');

// Ganador solo
chequear('ganador correcto = 3 pts',
  puntos([pelea('p1')], { p1: { ganador: 'f1', metodo: null, round: null } },
    { p1: { ganador: 'f1', metodo: 'ko', round: 1 } }).puntosPeleas,
  PUNTOS.ganador);

chequear('ganador incorrecto = 0 pts',
  puntos([pelea('p1')], { p1: { ganador: 'f2', metodo: 'ko', round: 1 } },
    { p1: { ganador: 'f1', metodo: 'ko', round: 1 } }).puntosPeleas,
  0);

// Método
chequear('ganador + metodo = 5 pts',
  puntos([pelea('p1')], { p1: { ganador: 'f1', metodo: 'ko', round: null } },
    { p1: { ganador: 'f1', metodo: 'ko', round: 1 } }).puntosPeleas,
  PUNTOS.ganador + PUNTOS.metodo);

chequear('metodo NO puntua si el ganador esta mal',
  puntos([pelea('p1')], { p1: { ganador: 'f2', metodo: 'ko', round: 1 } },
    { p1: { ganador: 'f1', metodo: 'ko', round: 1 } }).puntosPeleas,
  0);

// Round
chequear('ganador + metodo + round = 8 pts',
  puntos([pelea('p1')], { p1: { ganador: 'f1', metodo: 'ko', round: 2 } },
    { p1: { ganador: 'f1', metodo: 'ko', round: 2 } }).puntosPeleas,
  PUNTOS.ganador + PUNTOS.metodo + PUNTOS.round);

chequear('round equivocado no resta',
  puntos([pelea('p1')], { p1: { ganador: 'f1', metodo: 'ko', round: 3 } },
    { p1: { ganador: 'f1', metodo: 'ko', round: 2 } }).puntosPeleas,
  PUNTOS.ganador + PUNTOS.metodo);

chequear('round NO puntua con decision (no existe round de finalizacion)',
  puntos([pelea('p1')], { p1: { ganador: 'f1', metodo: 'dec', round: 3 } },
    { p1: { ganador: 'f1', metodo: 'dec', round: 3 } }).puntosPeleas,
  PUNTOS.ganador + PUNTOS.metodo);

chequear('round NO puntua si el metodo esta mal',
  puntos([pelea('p1')], { p1: { ganador: 'f1', metodo: 'sub', round: 2 } },
    { p1: { ganador: 'f1', metodo: 'ko', round: 2 } }).puntosPeleas,
  PUNTOS.ganador);

console.log('\n─── UNDERDOG ──────────────────────────────────────────');

chequear('underdog acertado multiplica x1.5 el subtotal completo',
  puntos([pelea('p1', 'estelar', 'f2')], { p1: { ganador: 'f2', metodo: 'ko', round: 2 } },
    { p1: { ganador: 'f2', metodo: 'ko', round: 2 } }).puntosPeleas,
  Math.round((PUNTOS.ganador + PUNTOS.metodo + PUNTOS.round) * 1.5)); // 8 -> 12

chequear('picar al favorito no multiplica',
  puntos([pelea('p1', 'estelar', 'f2')], { p1: { ganador: 'f1', metodo: null, round: null } },
    { p1: { ganador: 'f1', metodo: 'ko', round: 1 } }).puntosPeleas,
  PUNTOS.ganador);

chequear('sin underdog marcado no hay multiplicador',
  puntos([pelea('p1', 'estelar', null)], { p1: { ganador: 'f1', metodo: null, round: null } },
    { p1: { ganador: 'f1', metodo: 'ko', round: 1 } }).puntosPeleas,
  PUNTOS.ganador);

console.log('\n─── BONO CARTELERA ESTELAR ────────────────────────────');

const tresEstelares = [pelea('e1'), pelea('e2'), pelea('e3')];
const todosF1: PicksEvento = {
  e1: { ganador: 'f1', metodo: null, round: null },
  e2: { ganador: 'f1', metodo: null, round: null },
  e3: { ganador: 'f1', metodo: null, round: null },
};
const ganoF1: ResultadosEvento = {
  e1: { ganador: 'f1', metodo: 'ko', round: 1 },
  e2: { ganador: 'f1', metodo: 'ko', round: 1 },
  e3: { ganador: 'f1', metodo: 'ko', round: 1 },
};

chequear('estelar perfecta suma +10',
  puntos(tresEstelares, todosF1, ganoF1).bonoEstelar, PUNTOS.bonoEstelar);

chequear('un fallo en la estelar = sin bono',
  puntos(tresEstelares, todosF1, { ...ganoF1, e3: { ganador: 'f2', metodo: 'ko', round: 1 } }).bonoEstelar,
  0);

chequear('estelar incompleta (falta un resultado) = sin bono todavia',
  puntos(tresEstelares, todosF1, { e1: ganoF1.e1, e2: ganoF1.e2 }).bonoEstelar, 0);

chequear('menos de 3 estelares = sin bono (cartelera recien anunciada)',
  puntos([pelea('e1'), pelea('e2')],
    { e1: todosF1.e1, e2: todosF1.e2 },
    { e1: ganoF1.e1, e2: ganoF1.e2 }).bonoEstelar,
  0);

chequear('los prelims no afectan el bono de estelar',
  puntos([...tresEstelares, pelea('p9', 'preliminar')], todosF1,
    { ...ganoF1, p9: { ganador: 'f2', metodo: 'dec', round: null } }).bonoEstelar,
  PUNTOS.bonoEstelar);

console.log('\n─── CASOS BORDE ───────────────────────────────────────');

chequear('sin pick no puntua ni penaliza',
  puntos([pelea('p1')], {}, { p1: { ganador: 'f1', metodo: 'ko', round: 1 } }).total, 0);

chequear('No Contest (ganador null) no puntua',
  puntos([pelea('p1')], { p1: { ganador: 'f1', metodo: 'ko', round: 1 } },
    { p1: { ganador: null, metodo: null, round: null } }).total, 0);

chequear('No Contest no cuenta como resuelta',
  puntos([pelea('p1')], { p1: { ganador: 'f1', metodo: null, round: null } },
    { p1: { ganador: null, metodo: null, round: null } }).resueltas, 0);

chequear('pelea sin resultado todavia no puntua',
  puntos([pelea('p1')], { p1: { ganador: 'f1', metodo: 'ko', round: 1 } }, {}).total, 0);

chequear('aciertos cuenta solo ganadores correctos',
  puntos(tresEstelares, todosF1, { ...ganoF1, e2: { ganador: 'f2', metodo: 'ko', round: 1 } }).aciertos, 2);

console.log('\n─── MAXIMO Y RACHA ────────────────────────────────────');

chequear('maximo de 1 pelea estelar = 8, sin bono (no llega al piso)',
  puntajeMaximo([pelea('p1')]), 8);

chequear('maximo de 3 estelares incluye el bono',
  puntajeMaximo([pelea('e1'), pelea('e2'), pelea('e3')]), 8 * 3 + PUNTOS.bonoEstelar);

chequear('maximo con underdog aplica x1.5',
  puntajeMaximo([pelea('p1', 'estelar', 'f1')]), Math.round(8 * 1.5));

chequear('solo prelims: sin bono de estelar en el maximo',
  puntajeMaximo([pelea('p1', 'preliminar')]), 8);

chequear('racha cuenta consecutivos con puntaje > 0',
  calcularRacha([{ total: 5 }, { total: 12 }, { total: 0 }, { total: 8 }]), 2);

chequear('racha 0 si el ultimo evento no puntuo',
  calcularRacha([{ total: 0 }, { total: 12 }]), 0);

// ─── Resumen ─────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(55)}`);
if (fallos.length) {
  console.log(`\n${fallos.length} FALLO(S):\n`);
  fallos.forEach(f => console.log(`  ✗ ${f}\n`));
  console.log(`${ok} pasaron, ${fallos.length} fallaron.\n`);
  process.exit(1);
}
console.log(`\n${ok} casos, todos pasan.\n`);
