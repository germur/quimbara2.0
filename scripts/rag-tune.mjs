// scripts/rag-tune.mjs
//
// Barre el peso de la fusión léxico:semántico y mide cuál va mejor.
//
//   npm run rag:tune
//
// POR QUÉ EXISTE
// El peso de la fusión es el único parámetro libre del buscador, y elegirlo a
// ojo es adivinar. Este script prueba una rejilla de valores contra las
// preguntas de evaluación y enseña la curva: así el número que acaba en
// PESOS_POR_DEFECTO tiene una razón medida detrás.
//
// Hay que volver a ejecutarlo cuando cambie el contenido de forma apreciable
// (por ejemplo al densificar las fichas de peleador), porque el óptimo depende
// de cuánto se parezcan los chunks entre sí.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { construirIndiceLexico, buscar } from '../src/lib/busqueda.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const req = f => {
  const p = join(ROOT, f);
  if (!existsSync(p)) {
    console.error(`✗ Falta ${f}. Ejecuta antes: npm run rag:chunk -- --write && npm run rag:embed`);
    process.exit(1);
  }
  return p;
};

const chunks = readFileSync(req('.rag/chunks.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const vec = JSON.parse(readFileSync(req('.rag/vectores.json'), 'utf8'));
const { mapa } = JSON.parse(readFileSync(req('.rag/preguntas-vec.json'), 'utf8'));
const { preguntas } = JSON.parse(readFileSync(join(ROOT, 'evaluacion', 'preguntas.json'), 'utf8'));

const motor = {
  indiceLexico: construirIndiceLexico(chunks),
  indiceVectorial: { ids: vec.ids, vectores: vec.vectores },
  chunksPorId: new Map(chunks.map(c => [c.id, c])),
};

const evaluables = preguntas.filter(p => p.espera);

function medir(pesos, usarVectores) {
  let a1 = 0, a3 = 0, mrr = 0;
  const porTipo = {};
  for (const p of evaluables) {
    const res = buscar(motor, p.q, {
      limite: 10,
      vectorConsulta: usarVectores ? mapa[p.q] : null,
      pesos,
    });
    const i = res.findIndex(r => r.id?.startsWith(p.espera));
    if (i === 0) a1++;
    if (i >= 0 && i < 3) a3++;
    mrr += i >= 0 ? 1 / (i + 1) : 0;
    porTipo[p.tipo] ??= { n: 0, a3: 0 };
    porTipo[p.tipo].n++;
    if (i >= 0 && i < 3) porTipo[p.tipo].a3++;
  }
  return { a1, a3, mrr: mrr / evaluables.length, porTipo };
}

const REJILLA = [[1, 1], [2, 1], [3, 1], [5, 1], [8, 1], [10, 1], [12, 1], [15, 1], [20, 1], [30, 1], [50, 1]];

const base = medir(null, false);
const resultados = REJILLA.map(w => ({ w, ...medir(w, true) }));
const mejor = resultados.reduce((a, b) => (b.mrr > a.mrr ? b : a));

console.log(`\n  ${evaluables.length} preguntas · ${chunks.length} chunks · ${vec.modelo}\n`);
console.log('  léxico:semántico   Acierto@1   Acierto@3      MRR');
console.log('  ' + '─'.repeat(52));

const linea = (etiqueta, r, marca = '') => {
  const delta = r.mrr - base.mrr;
  const signo = Math.abs(delta) < 0.0005 ? '  =  ' : (delta > 0 ? `+${(delta * 100).toFixed(1)}%` : `${(delta * 100).toFixed(1)}%`);
  console.log(
    `  ${etiqueta.padEnd(16)}  ${String(r.a1).padStart(2)}/${evaluables.length}      ` +
    `${String(r.a3).padStart(2)}/${evaluables.length}      ${r.mrr.toFixed(4)}  ${signo.padStart(6)} ${marca}`
  );
};

linea('solo léxico', base);
for (const r of resultados) linea(`${r.w[0]}:${r.w[1]}`, r, r === mejor ? '← óptimo' : '');

console.log('  ' + '─'.repeat(52));
console.log(`\n  Mejor: pesos [${mejor.w.join(', ')}] · MRR ${mejor.mrr.toFixed(4)}`);
if (mejor.mrr <= base.mrr + 0.0005) {
  console.log('  ⚠️  Los vectores NO mejoran nada. Con chunks muy parecidos entre sí');
  console.log('      la señal semántica es ruido: usa solo léxico hasta densificar.');
} else {
  console.log(`  Fija esto en PESOS_POR_DEFECTO (src/lib/busqueda.mjs) si difiere.`);
}

const sem = mejor.porTipo.semantica;
if (sem) {
  console.log(`\n  Preguntas semánticas con el óptimo: ${Math.round((sem.a3 / sem.n) * 100)}% @3 (${sem.n})`);
  console.log('  Si sigue bajo, el problema es de CONTENIDO, no de búsqueda:');
  console.log('  los embeddings recuperan significado, no información que no existe.');
}
console.log();
