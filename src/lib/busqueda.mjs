/**
 * Motor de búsqueda híbrida de Quimbara.
 *
 *   léxica (BM25)  +  semántica (vectores)  →  fusión RRF  →  resultados
 *
 * POR QUÉ HÍBRIDA Y NO SOLO VECTORIAL
 * En un corpus lleno de nombres propios y cifras exactas ("Bukauskas",
 * "Prochazka", "27-9-0", "UFC 331") la búsqueda léxica es imbatible: esos
 * tokens son raros y por tanto muy informativos. La vectorial gana en lo
 * contrario — cuando el usuario escribe "cuánto mide" y el texto dice
 * "estatura", o busca "el campeón hawaiano" sin nombrar a nadie.
 * Cada una falla justo donde la otra acierta, así que se usan las dos.
 *
 * Funciona sin vectores (solo BM25) y mejora cuando existen. Eso permite
 * desplegar hoy y añadir la capa semántica cuando el índice esté generado.
 */

// ── Normalización ──────────────────────────────────────────────────────────
// Sin quitar acentos, "estatura" y "estátura" son tokens distintos y el
// usuario que escribe rápido en móvil no encuentra nada.
export function normalizar(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palabras vacías del español: aparecen en todo y no discriminan nada. */
const VACIAS = new Set(
  ('de la que el en y a los del se las por un para con no una su al lo como mas pero sus le ya o este si porque esta entre cuando muy sin sobre tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes algunos que unos yo otro otras otra el tanto esa estos mucho quienes nada muchos cual sea poco ella estar haber estas estaba estamos algunas algo nosotros mi mis tu te ti tus ellas nosotras vosotros vosotras os mio mia mios mias tuyo tuya tuyos tuyas suyo suya suyos suyas nuestro nuestra nuestros nuestras vuestro vuestra vuestros vuestras esos esas es son ser fue era ha han hace')
    .split(' ')
);

export function tokenizar(texto) {
  return normalizar(texto).split(' ').filter(t => t.length > 1 && !VACIAS.has(t));
}

/**
 * Expansión de consulta: el puente barato entre lo léxico y lo semántico.
 * Un usuario pregunta "cuánto mide X" y el texto dice "estatura". Sin esto,
 * BM25 no encuentra nada aunque la respuesta esté delante.
 */
const SINONIMOS = {
  mide: ['estatura', 'altura', 'alto'],
  medir: ['estatura', 'altura'],
  estatura: ['altura', 'mide'],
  altura: ['estatura', 'mide'],
  alcance: ['envergadura', 'reach'],
  pesa: ['peso', 'kg', 'libras'],
  peso: ['pesa', 'kg'],
  record: ['victorias', 'derrotas', 'palmares'],
  palmares: ['record', 'victorias'],
  campeon: ['titulo', 'cinturon'],
  campeona: ['titulo', 'cinturon'],
  cinturon: ['campeon', 'titulo'],
  pelea: ['combate', 'evento', 'cartelera'],
  peleas: ['combate', 'evento'],
  combate: ['pelea', 'evento'],
  cartelera: ['evento', 'pelea', 'card'],
  proxima: ['siguiente', 'calendario'],
  cuando: ['fecha', 'calendario'],
  fecha: ['cuando', 'calendario'],
  guardia: ['stance', 'zurdo', 'diestro'],
  zurdo: ['southpaw', 'guardia'],
  edad: ['años', 'nacio'],
};

export function expandir(tokens) {
  const salida = new Set(tokens);
  for (const t of tokens) for (const s of SINONIMOS[t] ?? []) salida.add(s);
  return [...salida];
}

// ── BM25 ───────────────────────────────────────────────────────────────────
/**
 * BM25 es TF-IDF con dos correcciones que importan:
 *   · saturación (k1): la décima repetición de una palabra no vale como la primera
 *   · normalización por longitud (b): un chunk corto que menciona "Holloway" es
 *     más relevante que uno largo donde aparece de pasada
 *
 * @param {Array<{id:string,texto:string}>} chunks
 */
export function construirIndiceLexico(chunks) {
  const docs = chunks.map(c => {
    const tokens = tokenizar(`${c.titulo ?? ''} ${c.texto}`);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { id: c.id, tf, largo: tokens.length };
  });

  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);

  const N = docs.length;
  const largoMedio = docs.reduce((s, d) => s + d.largo, 0) / (N || 1);

  // idf con suavizado: términos en casi todos los docs valen ~0
  const idf = new Map();
  for (const [t, n] of df) idf.set(t, Math.log(1 + (N - n + 0.5) / (n + 0.5)));

  return { docs, idf, largoMedio, N };
}

export function buscarLexico(indice, consulta, limite = 50) {
  const { docs, idf, largoMedio } = indice;
  const k1 = 1.5, b = 0.75;
  const tokens = expandir(tokenizar(consulta));
  if (!tokens.length) return [];

  const puntuados = [];
  for (const d of docs) {
    let score = 0;
    for (const t of tokens) {
      const f = d.tf.get(t);
      if (!f) continue;
      const norm = f * (k1 + 1) / (f + k1 * (1 - b + b * (d.largo / largoMedio)));
      score += (idf.get(t) ?? 0) * norm;
    }
    if (score > 0) puntuados.push({ id: d.id, score });
  }
  return puntuados.sort((a, b) => b.score - a.score).slice(0, limite);
}

// ── Semántica ──────────────────────────────────────────────────────────────
/** Coseno entre vectores ya normalizados = producto escalar. */
export function coseno(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * @param {{vectores: Float32Array[]|number[][], ids: string[]}} indice
 * @param {number[]} vectorConsulta
 */
export function buscarSemantico(indice, vectorConsulta, limite = 50) {
  if (!indice?.vectores?.length || !vectorConsulta) return [];
  const out = indice.vectores.map((v, i) => ({ id: indice.ids[i], score: coseno(v, vectorConsulta) }));
  return out.sort((a, b) => b.score - a.score).slice(0, limite);
}

// ── Fusión ─────────────────────────────────────────────────────────────────
/**
 * Reciprocal Rank Fusion.
 *
 * Combina rankings usando la POSICIÓN, no la puntuación. Es la clave: los
 * scores de BM25 (0 a ~30, sin techo) y los de coseno (-1 a 1) no son
 * comparables, y normalizarlos a mano es frágil. RRF ignora la escala y solo
 * mira quién va delante en cada lista.
 *
 * k=60 es el valor del paper original; amortigua el peso de los primeros
 * puestos para que un único ranking no domine la fusión.
 */
export function fusionarRRF(rankings, { k = 60, pesos = null } = {}) {
  const acc = new Map();
  rankings.forEach((ranking, idx) => {
    const peso = pesos?.[idx] ?? 1;
    ranking.forEach((item, posicion) => {
      const previo = acc.get(item.id) ?? 0;
      acc.set(item.id, previo + peso * (1 / (k + posicion + 1)));
    });
  });
  return [...acc.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Pesos por defecto de la fusión [léxico, semántico].
 *
 * NO son un valor elegido a ojo: salen de barrer el parámetro contra las 44
 * preguntas de evaluacion/preguntas.json (`npm run rag:tune`). La curva medida
 * sobre el corpus real de agosto de 2026:
 *
 *     pesos      Acierto@1   MRR
 *     1:1          31/44    0.760   ← peor que no usar vectores
 *     3:1          32/44    0.791
 *     8:1          36/44    0.840
 *     12:1         37/44    0.856   ← óptimo
 *     20:1         36/44    0.844
 *     100:1        34/44    0.817   ← converge a solo-léxico
 *     solo léxico  34/44    0.817
 *
 * La lectura importante: a peso 1:1 la señal semántica EMPEORA los resultados.
 * En este corpus los chunks de ficha son casi idénticos entre sí (todos salen
 * de la misma plantilla), así que la similitud vectorial aporta más ruido que
 * señal y arrastra hacia abajo aciertos que la parte léxica ya tenía.
 *
 * Con 12:1 la semántica actúa como desempate fino: no cambia QUÉ se recupera
 * (Acierto@3 se queda en 38/44 con y sin vectores) pero sí ordena mejor lo ya
 * recuperado (+3 aciertos en primera posición).
 *
 * Cuando las fichas se densifiquen con texto propio por peleador, este número
 * debería bajar: hay que volver a ejecutar `npm run rag:tune` y reajustarlo.
 */
export const PESOS_POR_DEFECTO = [12, 1];

/**
 * Búsqueda completa. `vectorConsulta` es opcional: sin él funciona en modo
 * solo-léxico, que ya resuelve la mayoría de consultas de este corpus.
 */
export function buscar(
  { indiceLexico, indiceVectorial, chunksPorId },
  consulta,
  { limite = 10, vectorConsulta = null, pesos = PESOS_POR_DEFECTO } = {}
) {
  const lex = buscarLexico(indiceLexico, consulta, 50);
  const sem = vectorConsulta ? buscarSemantico(indiceVectorial, vectorConsulta, 50) : [];

  const rankings = sem.length ? [lex, sem] : [lex];
  const fusion = fusionarRRF(rankings, { pesos: sem.length ? pesos : [1] });

  return fusion.slice(0, limite).map(r => ({ ...chunksPorId.get(r.id), score: r.score }));
}
