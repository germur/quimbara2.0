/**
 * comparar.ts — logica del comparador de peleadores.
 *
 * ─── CANONICALIZACIÓN ────────────────────────────────────────────────
 * Cada par tiene dos URLs posibles (A-vs-B y B-vs-A). La canónica es el
 * orden ALFABÉTICO de los slugs. La inversa hace 301 duro a la canónica
 * —nunca canonical tag— y se genera en public/_redirects vía
 * `npm run gen:redirects`.
 *
 * El orden VISUAL en pantalla se controla con `?a={slug}`, que no se
 * indexa. Así "ver a Topuria a la izquierda" no crea una segunda página.
 *
 * ─── GATE ANTI-THIN-CONTENT ──────────────────────────────────────────
 * Con 195 rankeados hay miles de pares posibles. `getParesPublicados()`
 * devuelve solo los que están en la lista blanca Y tienen editorial
 * escrito. Es lo que consume getStaticPaths, así que un par sin editorial
 * simplemente no existe como página.
 */

import PARES from '../data/pares-publicados.json';
import { getPeleador, slugPar, type Peleador } from './peleadores';

const TABLA = (PARES as any).pares as Record<
  string,
  { editorial: string | null; editorialRevisada?: boolean; ola?: number }
>;

export interface Par {
  /** Slug canónico, orden alfabético */
  slug: string;
  /** Primer peleador en orden alfabético */
  a: Peleador;
  /** Segundo peleador en orden alfabético */
  b: Peleador;
  editorial: string;
  editorialRevisada: boolean;
  ola: number;
}

/**
 * Pares construibles: en lista blanca + con editorial + ambos peleadores
 * comparables. Esto alimenta getStaticPaths.
 */
export function getParesPublicados(): Par[] {
  const out: Par[] = [];

  for (const [slug, meta] of Object.entries(TABLA)) {
    if (!meta.editorial) continue; // gate: sin editorial no se publica

    const [slugA, slugB] = slug.split('-vs-');
    if (!slugA || !slugB) continue;

    const a = getPeleador(slugA);
    const b = getPeleador(slugB);
    if (!a || !b) continue; // uno no existe o no es comparable

    // Defensa: si el slug de la lista no está en orden alfabético, se ignora
    // para no generar una URL no canónica.
    if (slugPar(slugA, slugB) !== slug) continue;

    out.push({
      slug,
      a,
      b,
      editorial: meta.editorial,
      editorialRevisada: meta.editorialRevisada ?? false,
      ola: meta.ola ?? 1,
    });
  }

  return out.sort((x, y) => x.ola - y.ola || x.slug.localeCompare(y.slug));
}

export function getPar(slug: string): Par | null {
  return getParesPublicados().find(p => p.slug === slug) ?? null;
}

/** Todos los slugs de la lista blanca, con y sin editorial. Para auditoría. */
export function getParesEnListaBlanca(): Array<{ slug: string; tieneEditorial: boolean; ola: number }> {
  return Object.entries(TABLA).map(([slug, m]) => ({
    slug,
    tieneEditorial: !!m.editorial,
    ola: m.ola ?? 1,
  }));
}

// ─── Métricas comparativas ───────────────────────────────────────────

export interface Metrica {
  label: string;
  unidad: string;
  valorA: number | null;
  valorB: number | null;
  /** Para dibujar barras proporcionales */
  max: number;
  /** 'a' | 'b' | null (empate o dato faltante) */
  ventaja: 'a' | 'b' | null;
  /** Diferencia absoluta, null si falta un dato */
  diff: number | null;
  /** true si más es mejor (altura, alcance). false para edad. */
  masEsMejor: boolean;
}

function metrica(
  label: string,
  unidad: string,
  vA: number | null,
  vB: number | null,
  masEsMejor = true
): Metrica {
  const max = Math.max(vA ?? 0, vB ?? 0) || 1;
  let ventaja: 'a' | 'b' | null = null;
  let diff: number | null = null;

  if (vA !== null && vB !== null) {
    diff = Math.abs(vA - vB);
    if (diff !== 0) {
      const aGana = masEsMejor ? vA > vB : vA < vB;
      ventaja = aGana ? 'a' : 'b';
    }
  }

  return { label, unidad, valorA: vA, valorB: vB, max, ventaja, diff, masEsMejor };
}

export function metricasComparativas(a: Peleador, b: Peleador): Metrica[] {
  const out: Metrica[] = [
    metrica('Estatura', 'cm', a.fisico.altura_cm, b.fisico.altura_cm),
    metrica('Alcance', 'cm', a.fisico.alcance_cm, b.fisico.alcance_cm),
    metrica('Ape index', 'cm', a.fisico.ape_index, b.fisico.ape_index),
    metrica('Peso', 'kg', a.fisico.peso_kg, b.fisico.peso_kg),
  ];
  // Edad solo si tenemos fecha de nacimiento de ambos (menos es mejor)
  if (a.edad !== null && b.edad !== null) {
    out.push(metrica('Edad', 'años', a.edad, b.edad, false));
  }
  return out;
}

// ─── Texto generado desde datos ──────────────────────────────────────

const nombreCorto = (p: Peleador) => p.nombre.split(' ').slice(-1)[0];
const rankTexto = (p: Peleador) =>
  p.ranking === 'C' ? 'campeón' : p.ranking !== null ? `número ${p.ranking}` : 'del roster';

/**
 * 120-180 palabras derivadas de los datos. Varía según la magnitud real de
 * cada diferencia, así que dos pares distintos no leen igual — no es un
 * template con los nombres cambiados.
 */
export function generarTextoComparativo(a: Peleador, b: Peleador): string[] {
  const parrafos: string[] = [];
  const A = nombreCorto(a), B = nombreCorto(b);
  const div = a.divisionLabel.toLowerCase();

  // ── Párrafo 1: contexto y estatura ──
  const p1: string[] = [];
  p1.push(
    `${a.nombre} y ${b.nombre} comparten la división de ${div} de UFC, ` +
    `donde figuran como ${rankTexto(a)} y ${rankTexto(b)} respectivamente.`
  );

  const hA = a.fisico.altura_cm, hB = b.fisico.altura_cm;
  if (hA !== null && hB !== null) {
    const d = Math.abs(hA - hB);
    const alto = hA > hB ? A : B;
    if (d === 0) {
      p1.push(`Miden exactamente lo mismo: ${hA} cm.`);
    } else if (d <= 2) {
      p1.push(`En estatura están parejos —${hA} cm contra ${hB} cm—, una diferencia de ${d} cm que no decide nada.`);
    } else if (d <= 7) {
      p1.push(`${alto} es ${d} cm más alto (${Math.max(hA, hB)} cm contra ${Math.min(hA, hB)} cm), ventaja real pero manejable.`);
    } else {
      p1.push(`La diferencia de estatura es considerable: ${alto} le saca ${d} cm (${Math.max(hA, hB)} cm contra ${Math.min(hA, hB)} cm).`);
    }
  }
  parrafos.push(p1.join(' '));

  // ── Párrafo 2: alcance y ape index ──
  const p2: string[] = [];
  const rA = a.fisico.alcance_cm, rB = b.fisico.alcance_cm;
  if (rA !== null && rB !== null) {
    const d = Math.abs(rA - rB);
    const largo = rA > rB ? A : B;
    if (d === 0) {
      p2.push(`El alcance también empata en ${rA} cm, así que ninguno pelea desde más lejos que el otro.`);
    } else if (d <= 3) {
      p2.push(`El alcance es casi idéntico: ${rA} cm contra ${rB} cm.`);
    } else {
      p2.push(`En alcance ${largo} tiene ${d} cm de ventaja (${Math.max(rA, rB)} cm contra ${Math.min(rA, rB)} cm), que en la práctica define quién dicta la distancia.`);
    }
  }

  const apeA = a.fisico.ape_index, apeB = b.fisico.ape_index;
  if (apeA !== null && apeB !== null) {
    const fmt = (n: number) => `${n > 0 ? '+' : ''}${n}`;
    p2.push(
      `El ape index —alcance menos estatura, el dato que mide qué tan desproporcionado es un peleador— ` +
      `da ${fmt(apeA)} cm para ${A} y ${fmt(apeB)} cm para ${B}.`
    );
    const maxAbs = Math.max(Math.abs(apeA), Math.abs(apeB));
    if (maxAbs >= 12) {
      const raro = Math.abs(apeA) > Math.abs(apeB) ? A : B;
      p2.push(`${raro} entra en el territorio de los cuerpos atípicos, donde la envergadura cambia por completo cómo se pelea la distancia.`);
    } else if (apeA <= 0 && apeB <= 0) {
      p2.push(`Los dos son de brazos cortos para su estatura, lo que empuja la pelea hacia distancia media.`);
    }
  }
  if (p2.length) parrafos.push(p2.join(' '));

  // ── Párrafo 3: peso y récord ──
  const p3: string[] = [];
  const wA = a.fisico.peso_kg, wB = b.fisico.peso_kg;
  if (wA !== null && wB !== null && Math.abs(wA - wB) > 2) {
    const pesado = wA > wB ? A : B;
    p3.push(`${pesado} entra ${Math.abs(wA - wB)} kg más pesado (${Math.max(wA, wB)} kg contra ${Math.min(wA, wB)} kg).`);
  }

  if (a.record.texto && b.record.texto) {
    p3.push(`Los récords profesionales son ${a.record.texto} para ${A} y ${b.record.texto} para ${B}.`);

    const invictos = [a, b].filter(p => p.record.derrotas === 0);
    if (invictos.length === 1) {
      p3.push(`${nombreCorto(invictos[0])} llega invicto.`);
    } else if (invictos.length === 2) {
      p3.push(`Ninguno de los dos conoce la derrota, algo poco común a este nivel.`);
    }

    const vA = a.record.victorias, vB = b.record.victorias;
    if (vA !== null && vB !== null && Math.abs(vA - vB) >= 8) {
      const veterano = vA > vB ? A : B;
      p3.push(`${veterano} carga bastante más kilometraje, con ${Math.max(vA, vB)} victorias contra ${Math.min(vA, vB)}.`);
    }
  }

  // Forma reciente (últimas 5, lo único de historial que tenemos)
  const rachaTexto = (p: Peleador) => {
    const f = p.forma.slice(0, 5);
    if (f.length < 3) return null;
    const v = f.filter(x => x.outcome === 'W').length;
    if (v === f.length) return `${nombreCorto(p)} llega con ${v} victorias seguidas`;
    if (v === 0) return `${nombreCorto(p)} llega sin ganar en sus últimas ${f.length}`;
    return null;
  };
  const rachas = [rachaTexto(a), rachaTexto(b)].filter(Boolean);
  if (rachas.length) p3.push(`${rachas.join(' y ')}.`);

  if (p3.length) parrafos.push(p3.join(' '));

  // ── Cierre: síntesis desde el diferencial más grande ──
  // Garantiza que el texto llegue al rango de 120-180 palabras incluso
  // cuando los dos peleadores son físicamente muy parecidos y las
  // condicionales de arriba no disparan.
  if (hA !== null && hB !== null && rA !== null && rB !== null) {
    const dh = Math.abs(hA - hB), dr = Math.abs(rA - rB);
    if (dh <= 2 && dr <= 3) {
      parrafos.push(
        `En conjunto no hay ventaja física que destacar: los dos entran con esencialmente ` +
        `el mismo cuerpo, así que la pelea se resuelve en técnica, ritmo y toma de decisiones ` +
        `más que en medidas.`
      );
    } else if (dr > dh) {
      const largo = rA > rB ? A : B;
      parrafos.push(
        `El dato que más pesa es el alcance: ${largo} puede trabajar desde una distancia donde ` +
        `el otro todavía no llega, y eso obliga a ${largo === A ? B : A} a cerrar espacio para ` +
        `existir en la pelea. Ahí es donde se decide.`
      );
    } else {
      const alto = hA > hB ? A : B;
      const bajo = alto === A ? B : A;
      parrafos.push(
        `La diferencia de estatura es el eje del cruce: ${alto} pelea desde arriba y ${bajo} ` +
        `tiene que entrar por debajo, que es más costoso en energía pero también más difícil ` +
        `de leer. Cuál de las dos rutas funciona depende de quién dicte la distancia.`
      );
    }
  }

  return parrafos;
}

// ─── SEO ─────────────────────────────────────────────────────────────

export function seoDelPar(a: Peleador, b: Peleador) {
  const hA = a.fisico.altura_cm, hB = b.fisico.altura_cm;
  return {
    title: `${a.nombre} vs ${b.nombre}: altura, alcance y peso comparados`,
    h1: `${a.nombre} vs ${b.nombre}: quién tiene la ventaja física`,
    description:
      `Compara a ${a.nombre}${hA ? ` (${hA} cm)` : ''} con ${b.nombre}${hB ? ` (${hB} cm)` : ''}. ` +
      `Altura, envergadura, peso, ape index y récord lado a lado, a escala real.`,
  };
}
