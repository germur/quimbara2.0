/**
 * silueta.ts — geometría paramétrica de la silueta de peleador.
 *
 * Portado del componente D2 hecho en Claude Design. La matemática es la
 * original; acá vive como función pura para poder testearla y para que el
 * comparador la use sin arrastrar el runtime de Claude Design.
 *
 * ─── EL PUNTO CRÍTICO: ESPACIO DE COORDENADAS EN CENTÍMETROS ─────────
 * El viewBox es `-110 0 220 232`, con el suelo en y=225.5. Es decir:
 * **1 unidad SVG = 1 cm real**, y la figura se ancla al piso, no se
 * centra. Consecuencia: dos siluetas renderizadas en contenedores de la
 * misma altura quedan automáticamente a escala real compartida.
 *
 * No normalizar cada figura a su propio alto es lo único que hace que el
 * comparador signifique algo. Si se toca esto, el producto se cae.
 *
 * ─── ORIGINALIDAD ────────────────────────────────────────────────────
 * Geometría 100% derivada de tres números. No hay trazado de fotos ni
 * frames de transmisión — evita el problema de derechos de imagen y es
 * visualmente más limpio.
 */

export const SUELO = 225.5;
export const VIEWBOX = '-110 0 220 232';

export type MarcaEsquina = 'punta' | 'barra';

export interface SiluetaInput {
  alturaCm: number;
  envergaduraCm?: number;
  pesoKg?: number;
  /** Codificación redundante de esquina (no depende del color) */
  marca?: MarcaEsquina;
}

export interface Guia {
  y: number;
  ty: number;
  label: string;
}

export interface SiluetaGeom {
  // envergadura
  spanX1: number; spanX2: number; spanY: number;
  spanW: number; spanDash: string;
  tickW: number; tickY1: number; tickY2: number; tickCap: 'round' | 'butt';
  // cuerpo
  torso: string; torsoSuavizado: number;
  brazoIzq: string; brazoDer: string; brazoW: number;
  piernaIzq: string; piernaDer: string; piernaW: number;
  cuelloX: number; cuelloY: number; cuelloW: number; cuelloH: number; cuelloR: number;
  cabezaCy: number; cabezaRx: number; cabezaRy: number;
  pieY: number; pieRx: number; pieRy: number; pieIzqX: number; pieDerX: number;
  // referencia
  guias: Guia[];
  baseY: number;
  /** Corpulencia normalizada 0-1 desde IMC. Expuesta para debug. */
  corpulencia: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Guías horizontales cada 20 cm, etiquetadas. Constantes: no dependen del peleador. */
export function guias20cm(): Guia[] {
  const out: Guia[] = [];
  for (let cm = 20; cm <= 200; cm += 20) {
    const y = SUELO - cm;
    out.push({ y: r2(y), ty: r2(y - 1.6), label: `${cm} cm` });
  }
  return out;
}

export function calcularSilueta({
  alturaCm,
  envergaduraCm,
  pesoKg,
  marca = 'punta',
}: SiluetaInput): SiluetaGeom {
  const h = Number(alturaCm) || 180;
  const env = Number(envergaduraCm) || h;
  const kg = Number(pesoKg) || 75;

  const top = SUELO - h;

  /**
   * Corpulencia desde IMC, no desde peso absoluto. Así un pesado de 120 kg
   * a 196 cm se ve distinto de uno de 120 kg a 185 cm, que es lo correcto.
   * Rango: IMC 19.5 (mosca) → 0, IMC 32.5 (pesado) → 1.
   */
  const imc = kg / Math.pow(h / 100, 2);
  const w = Math.max(0, Math.min(1, (imc - 19.5) / 13));

  // Proporciones antropométricas: fracción de la altura, ensanchada por corpulencia
  const sh = h * (0.104 + 0.046 * w);            // medio hombro
  const shY = top + h * 0.172;
  const ch = sh * 0.94, chY = top + h * 0.245;   // pecho
  const wa = h * (0.070 + 0.062 * w), waY = top + h * 0.375;  // cintura
  const hp = h * (0.085 + 0.052 * w), hpY = top + h * 0.505;  // cadera

  const cabezaRy = h * 0.058;
  const cabezaRx = h * (0.040 + 0.008 * w);
  const cabezaCy = top + cabezaRy + h * 0.004;

  const brazoW = h * (0.030 + 0.022 * w);
  const manoY = top + h * 0.495;
  const brazoX = sh - brazoW * 0.22;
  const brazoOut = h * 0.014;
  const codoY = (shY + manoY) / 2;

  const piernaW = h * (0.046 + 0.028 * w);
  const caderaX = hp * 0.48;
  const tobilloX = hp * 0.60;
  const rodillaY = top + h * 0.745;
  const tobilloY = SUELO - h * 0.020;

  const spanY = shY - h * 0.008;
  const esBarra = marca === 'barra';
  const tick = h * 0.052 * (esBarra ? 1.5 : 1);

  return {
    spanX1: r2(-env / 2),
    spanX2: r2(env / 2),
    spanY: r2(spanY),
    spanW: r2(h * 0.008),
    spanDash: esBarra ? `${r2(h * 0.035)} ${r2(h * 0.022)}` : 'none',
    tickW: r2(h * 0.012),
    tickY1: r2(spanY - tick / 2),
    tickY2: r2(spanY + tick / 2),
    tickCap: esBarra ? 'butt' : 'round',

    torso:
      `M ${r2(-sh)} ${r2(shY)} L ${r2(-ch)} ${r2(chY)} L ${r2(-wa)} ${r2(waY)} ` +
      `L ${r2(-hp)} ${r2(hpY)} L ${r2(hp)} ${r2(hpY)} L ${r2(wa)} ${r2(waY)} ` +
      `L ${r2(ch)} ${r2(chY)} L ${r2(sh)} ${r2(shY)} Z`,
    // El stroke sobre el polígono redondea las esquinas: suaviza sin curvas Bézier
    torsoSuavizado: r2(h * 0.026),

    brazoIzq:
      `M ${r2(-brazoX)} ${r2(shY + brazoW * 0.1)} ` +
      `Q ${r2(-brazoX - brazoOut)} ${r2(codoY)} ${r2(-brazoX - brazoOut * 0.4)} ${r2(manoY)}`,
    brazoDer:
      `M ${r2(brazoX)} ${r2(shY + brazoW * 0.1)} ` +
      `Q ${r2(brazoX + brazoOut)} ${r2(codoY)} ${r2(brazoX + brazoOut * 0.4)} ${r2(manoY)}`,
    brazoW: r2(brazoW),

    piernaIzq:
      `M ${r2(-caderaX)} ${r2(hpY - h * 0.01)} ` +
      `Q ${r2(-caderaX - h * 0.006)} ${r2(rodillaY)} ${r2(-tobilloX)} ${r2(tobilloY)}`,
    piernaDer:
      `M ${r2(caderaX)} ${r2(hpY - h * 0.01)} ` +
      `Q ${r2(caderaX + h * 0.006)} ${r2(rodillaY)} ${r2(tobilloX)} ${r2(tobilloY)}`,
    piernaW: r2(piernaW),

    cuelloX: r2(-h * (0.017 + 0.008 * w)),
    cuelloW: r2(h * (0.034 + 0.016 * w)),
    cuelloY: r2(cabezaCy + cabezaRy * 0.7),
    cuelloH: r2(shY - cabezaCy - cabezaRy * 0.7 + h * 0.01),
    cuelloR: r2(h * 0.012),

    cabezaCy: r2(cabezaCy),
    cabezaRx: r2(cabezaRx),
    cabezaRy: r2(cabezaRy),

    pieY: r2(SUELO - h * 0.008),
    pieRx: r2(piernaW * 0.72),
    pieRy: r2(piernaW * 0.38),
    pieIzqX: r2(-tobilloX - piernaW * 0.10),
    pieDerX: r2(tobilloX + piernaW * 0.10),

    guias: guias20cm(),
    baseY: 226.4,
    corpulencia: r2(w),
  };
}
