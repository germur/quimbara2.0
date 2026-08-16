// scripts/rag-embed.mjs
//
// Genera los embeddings de los chunks y escribe el índice vectorial.
//
//   npm run rag:embed                  → .rag/vectores.json (float32, para evaluar)
//   npm run rag:embed -- --publicar    → además public/buscador/indice.json (cuantizado int8)
//
// POR QUÉ EN LOCAL Y NO CON UNA API
// El modelo corre en tu máquina con transformers.js: sin API key, sin coste por
// token, sin enviar el contenido a terceros, y reproducible en CI. Para 1.651
// chunks tarda un par de minutos. Si algún día el corpus crece mucho o la
// calidad se queda corta, se cambia por una API de embeddings sin tocar nada
// más: el resto del pipeline solo espera un array de números por chunk.
//
// POR QUÉ ESTE MODELO
// paraphrase-multilingual-MiniLM-L12-v2 está entrenado en 50 idiomas, incluido
// el español, con 384 dimensiones. Los modelos que solo saben inglés fallan
// justo en lo que nos importa: "cuánto mide" ≈ "estatura".
//
// NOTA: la primera ejecución descarga el modelo (~120 MB) desde huggingface.co
// y lo cachea en ~/.cache. Requiere conexión.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLICAR = process.argv.includes('--publicar');
const MODELO = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

const rutaChunks = join(ROOT, '.rag', 'chunks.jsonl');
if (!existsSync(rutaChunks)) {
  console.error('✗ Falta .rag/chunks.jsonl — ejecuta antes: npm run rag:chunk -- --write');
  process.exit(1);
}

const chunks = readFileSync(rutaChunks, 'utf8').trim().split('\n').map(l => JSON.parse(l));
console.log(`· ${chunks.length} chunks a vectorizar con ${MODELO}`);

let pipeline;
try {
  ({ pipeline } = await import('@huggingface/transformers'));
} catch {
  console.error('\n✗ Falta la dependencia. Instálala con:');
  console.error('    npm i -D @huggingface/transformers\n');
  process.exit(1);
}

console.log('· cargando modelo (la primera vez descarga ~120 MB)…');
const extraer = await pipeline('feature-extraction', MODELO, { dtype: 'fp32' });

// El texto que se vectoriza incluye el título: da contexto al fragmento y
// mejora la recuperación cuando el cuerpo es escueto.
const textos = chunks.map(c => `${c.titulo ?? ''}. ${c.texto}`.trim());

const LOTE = 32;
const vectores = [];
const t0 = Date.now();

for (let i = 0; i < textos.length; i += LOTE) {
  const lote = textos.slice(i, i + LOTE);
  // pooling 'mean' = promedio de los tokens → un vector por texto.
  // normalize = vectores de norma 1, así el coseno es un producto escalar.
  const salida = await extraer(lote, { pooling: 'mean', normalize: true });
  vectores.push(...salida.tolist());

  const hechos = Math.min(i + LOTE, textos.length);
  const seg = (Date.now() - t0) / 1000;
  const eta = (seg / hechos) * (textos.length - hechos);
  process.stdout.write(`\r  ${hechos}/${textos.length} · ${seg.toFixed(0)}s · faltan ~${eta.toFixed(0)}s   `);
}
console.log('\n');

mkdirSync(join(ROOT, '.rag'), { recursive: true });
writeFileSync(
  join(ROOT, '.rag', 'vectores.json'),
  JSON.stringify({ modelo: MODELO, dims: vectores[0].length, ids: chunks.map(c => c.id), vectores })
);
console.log(`✓ .rag/vectores.json — ${vectores.length} vectores de ${vectores[0].length} dims`);

// ── Vectores de las preguntas de evaluación ────────────────────────────────
// Se precalculan aquí para que `npm run rag:eval` no tenga que cargar el
// modelo: la evaluación pasa a ser instantánea, reproducible y ejecutable en
// cualquier entorno (incluido CI) sin descargar 120 MB ni depender de `sharp`.
const rutaPreguntas = join(ROOT, 'evaluacion', 'preguntas.json');
if (existsSync(rutaPreguntas)) {
  const { preguntas } = JSON.parse(readFileSync(rutaPreguntas, 'utf8'));
  const qs = preguntas.map(p => p.q);
  const salida = await extraer(qs, { pooling: 'mean', normalize: true });
  const vecs = salida.tolist();
  const mapa = Object.fromEntries(preguntas.map((p, i) => [p.q, vecs[i]]));
  writeFileSync(join(ROOT, '.rag', 'preguntas-vec.json'), JSON.stringify({ modelo: MODELO, mapa }));
  console.log(`✓ .rag/preguntas-vec.json — ${qs.length} preguntas vectorizadas`);
}

// ── Publicación para el navegador ──────────────────────────────────────────
// Cuantización a int8: cada dimensión pasa de 4 bytes a 1, dividiendo el peso
// entre cuatro con una pérdida de precisión despreciable para buscar. Los
// vectores están normalizados, así que sus valores caen en [-1, 1] y basta
// escalar por 127.
if (PUBLICAR) {
  const cuantizar = v => Array.from(v, x => Math.max(-127, Math.min(127, Math.round(x * 127))));

  const indice = {
    modelo: MODELO,
    dims: vectores[0].length,
    escala: 127,
    generado: new Date().toISOString(),
    // Se publica lo mínimo para pintar un resultado: id, url, título y un
    // extracto. El texto completo ya está en la página de destino.
    docs: chunks.map((c, i) => ({
      i: c.id,
      u: c.url,
      t: c.titulo,
      x: c.texto.slice(0, 180),
      k: c.tipo,
      v: cuantizar(vectores[i]),
    })),
  };

  const dir = join(ROOT, 'public', 'buscador');
  mkdirSync(dir, { recursive: true });
  const ruta = join(dir, 'indice.json');
  writeFileSync(ruta, JSON.stringify(indice));

  const mb = (Buffer.byteLength(JSON.stringify(indice)) / 1024 / 1024).toFixed(2);
  console.log(`✓ public/buscador/indice.json — ${mb} MB (int8)`);
  console.log('  Se sirve estático desde Netlify: sin base de datos, sin backend, sin coste.');
}
