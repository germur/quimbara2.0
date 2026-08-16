// scripts/rag-eval.mjs
//
// Evalúa el buscador contra evaluacion/preguntas.json.
//
//   npm run rag:eval          → informe resumido
//   npm run rag:eval -- -v    → muestra los 3 primeros resultados de cada fallo
//
// MÉTRICAS
//   Acierto@1  — ¿el primer resultado es el correcto?  (lo que ve el usuario)
//   Acierto@3  — ¿está entre los 3 primeros?           (lo que cabe en una respuesta)
//   MRR        — Mean Reciprocal Rank: 1/posición del primer acierto, promediado.
//                Premia estar arriba, no solo estar. Si el correcto sale 1º vale 1;
//                si sale 5º vale 0,2. Es la métrica estándar para esto.
//
// Sin línea base, "mejorar la búsqueda" es una sensación. Con esto es un número.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { construirIndiceLexico, buscar } from '../src/lib/busqueda.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VERBOSE = process.argv.includes('-v');

const rutaChunks = join(ROOT, '.rag', 'chunks.jsonl');
if (!existsSync(rutaChunks)) {
  console.error('✗ Falta .rag/chunks.jsonl — ejecuta antes: npm run rag:chunk -- --write');
  process.exit(1);
}

const chunks = readFileSync(rutaChunks, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const chunksPorId = new Map(chunks.map(c => [c.id, c]));
const { preguntas } = JSON.parse(readFileSync(join(ROOT, 'evaluacion', 'preguntas.json'), 'utf8'));

// Vectores opcionales: si existen, la búsqueda pasa a híbrida.
//
// OJO: no basta con cargar el índice. Hay que vectorizar TAMBIÉN la pregunta,
// con el mismo modelo, porque buscar por significado es comparar el vector de
// la consulta contra los del corpus. Sin esto el índice se carga y no se usa.
let indiceVectorial = null;
let vectorizar = null;
const rutaVec = join(ROOT, '.rag', 'vectores.json');

if (existsSync(rutaVec)) {
  const v = JSON.parse(readFileSync(rutaVec, 'utf8'));
  indiceVectorial = { ids: v.ids, vectores: v.vectores };
  console.log(`· índice vectorial cargado (${v.ids.length} vectores, ${v.modelo})`);
  // Primero, los vectores de preguntas precalculados por rag-embed: es la vía
  // rápida y sin dependencias. El modelo solo se carga si faltan.
  const rutaPregVec = join(ROOT, '.rag', 'preguntas-vec.json');
  if (existsSync(rutaPregVec)) {
    const { mapa } = JSON.parse(readFileSync(rutaPregVec, 'utf8'));
    vectorizar = async texto => mapa[texto] ?? null;
    console.log('· vectores de preguntas precalculados → modo HÍBRIDO\n');
  } else {
    try {
      const { pipeline } = await import('@huggingface/transformers');
      console.log('· cargando el modelo para vectorizar las preguntas…');
      const extraer = await pipeline('feature-extraction', v.modelo, { dtype: 'fp32' });
      vectorizar = async texto => {
        const s = await extraer([texto], { pooling: 'mean', normalize: true });
        return s.tolist()[0];
      };
      console.log('· modo HÍBRIDO (BM25 + semántica)\n');
    } catch (e) {
      console.log(`· no se pudo cargar el modelo (${e.message.slice(0, 55)}…) → solo léxico`);
      console.log('  ejecuta `npm run rag:embed` para precalcular los vectores de preguntas\n');
    }
  }
} else {
  console.log('· sin vectores — evaluando en modo solo-léxico (BM25 + sinónimos)');
  console.log('  genera los vectores con: npm run rag:embed\n');
}

const indiceLexico = construirIndiceLexico(chunks);
const motor = { indiceLexico, indiceVectorial, chunksPorId };

// ── Evaluación ─────────────────────────────────────────────────────────────
const porTipo = {};
let a1 = 0, a3 = 0, mrrTotal = 0, evaluadas = 0;
const fallos = [];

for (const p of preguntas) {
  // Sin `espera` definida no hay respuesta correcta única: son preguntas para
  // la medición manual en LLM, no para el evaluador automático.
  if (!p.espera) continue;
  evaluadas++;

  const vectorConsulta = vectorizar ? await vectorizar(p.q) : null;
  const res = buscar(motor, p.q, { limite: 10, vectorConsulta });
  const pos = res.findIndex(r => r.id?.startsWith(p.espera));

  const acierto1 = pos === 0;
  const acierto3 = pos >= 0 && pos < 3;
  const rr = pos >= 0 ? 1 / (pos + 1) : 0;

  if (acierto1) a1++;
  if (acierto3) a3++;
  mrrTotal += rr;

  porTipo[p.tipo] ??= { n: 0, a1: 0, a3: 0 };
  porTipo[p.tipo].n++;
  if (acierto1) porTipo[p.tipo].a1++;
  if (acierto3) porTipo[p.tipo].a3++;

  if (!acierto3) fallos.push({ p, res });
}

// ── Informe ────────────────────────────────────────────────────────────────
const pct = (n, d) => `${((n / d) * 100).toFixed(0)}%`;
console.log('═'.repeat(58));
console.log(`  EVALUACIÓN · ${evaluadas} preguntas con respuesta esperada`);
console.log('═'.repeat(58));
console.log(`  Acierto@1   ${String(a1).padStart(3)}/${evaluadas}   ${pct(a1, evaluadas)}`);
console.log(`  Acierto@3   ${String(a3).padStart(3)}/${evaluadas}   ${pct(a3, evaluadas)}`);
console.log(`  MRR         ${(mrrTotal / evaluadas).toFixed(3)}`);
console.log('─'.repeat(58));
console.log('  Por tipo de pregunta:');
for (const [t, v] of Object.entries(porTipo).sort((a, b) => b[1].n - a[1].n)) {
  const barra = '█'.repeat(Math.round((v.a3 / v.n) * 20)).padEnd(20, '·');
  console.log(`    ${t.padEnd(12)} ${barra} ${pct(v.a3, v.n).padStart(4)} @3  (${v.n})`);
}

if (fallos.length) {
  console.log('─'.repeat(58));
  console.log(`  ${fallos.length} fallos (el esperado no está en el top 3):\n`);
  for (const { p, res } of fallos.slice(0, VERBOSE ? 99 : 8)) {
    console.log(`   "${p.q}"`);
    console.log(`      esperaba: ${p.espera}*`);
    if (VERBOSE) {
      res.slice(0, 3).forEach((r, i) => console.log(`      ${i + 1}. ${r.id}`));
    } else {
      console.log(`      obtuvo:   ${res[0]?.id ?? '(nada)'}`);
    }
  }
  if (!VERBOSE && fallos.length > 8) console.log(`   … y ${fallos.length - 8} más (usa -v)`);
}
console.log('═'.repeat(58));
