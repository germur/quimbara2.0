import {eventPath} from "./event-routing.mjs";
import {schemaStatus} from "./event-data.mjs";
/**
 * Identidad de entidad de Quimbara — fuente ÚNICA de verdad.
 *
 * Lo usan:
 *   - src/pages/index.astro            → Organization + WebSite
 *   - src/pages/blog/[slug].astro      → publisher, author, about, mentions
 *   - src/pages/peleadores/[slug].astro→ publisher y relaciones
 *
 * Centraliza nombres, perfiles y referencias entre páginas. La coherencia
 * facilita interpretar el sitio; no garantiza reconocimiento ni citas en IA.
 *
 * Regla: los @id son URIs estables y NO deben cambiar. Un @id que cambia rompe
 * la identidad acumulada, igual que cambiar una URL sin redirect.
 */

export const SITE_URL = 'https://quimbara.org';

/** URIs estables de las entidades del sitio. No tocar. */
export const ID = {
  organizacion: `${SITE_URL}/#organizacion`,
  web: `${SITE_URL}/#web`,
  autor: `${SITE_URL}/#roger-murillo`,
};

/**
 * Perfiles enlazados por el proyecto. Footer y metadatos usan esta misma fuente.
 */
export const REDES = {
  x: 'https://x.com/quimbaraufc',
  instagram: 'https://instagram.com/quimbaraufc',
  youtube: 'https://youtube.com/@quimbara',
};
export const PERFILES = Object.values(REDES);
export const TWITTER_SITE = `@${new URL(REDES.x).pathname.slice(1)}`;

/** Temas sobre los que la publicación tiene autoridad declarada. */
export const TEMAS = [
  'MMA',
  'UFC',
  'Artes Marciales Mixtas',
  'Jiu-Jitsu Brasileño',
  'Muay Thai',
  'Wrestling',
  'Boxeo',
  'Análisis técnico de combate',
];

/** La organización. Referenciable desde cualquier página con refOrganizacion(). */
export const organizacion = {
  '@type': 'Organization',
  '@id': ID.organizacion,
  name: 'Quimbara',
  alternateName: 'Quimbara MMA',
  url: SITE_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_URL}/quimbara-mark-black.svg`,
    caption: 'Quimbara',
  },
  image: `${SITE_URL}/default-og.jpg`,
  sameAs: PERFILES,
  description:
    'Publicación editorial independiente de MMA y UFC en español. Análisis técnico de combate, perfiles de peleadores, cobertura de eventos y consulta de rankings.',
  knowsAbout: TEMAS,
  inLanguage: 'es',
  publishingPrinciples: `${SITE_URL}/sobre/#criterio`,
};

/**
 * El autor como entidad propia, no como cadena de texto.
 * No añadir credenciales o perfiles personales sin comprobar su identidad.
 */
export const autor = {
  '@type': 'Person',
  '@id': ID.autor,
  name: 'Roger Murillo',
  url: `${SITE_URL}/sobre/#autor`,
  knowsAbout: TEMAS,
  worksFor: { '@id': ID.organizacion },
  sameAs: [],
};

/** Referencia ligera: se cita el @id en vez de repetir el objeto entero. */
export const refOrganizacion = () => ({ '@id': ID.organizacion });
export const refAutor = () => ({ '@id': ID.autor });

/**
 * Convierte un slug de peleador en una referencia de entidad Person.
 *
 * Sirve para publicar en el HTML el grafo que YA existe en el frontmatter de
 * los posts (`fighters: [...]`, `relatedEvents: [...]`). Esas listas son aristas
 * declaradas a mano con slugs canónicos — justo lo que un motor necesita para
 * saber de quién habla un artículo. Hasta ahora no salían del frontmatter.
 *
 * @param {string} slug
 * @param {string} [nombre] nombre real; si falta, se deriva del slug
 */
export function refPeleador(slug, nombre) {
  return {
    '@type': 'Person',
    '@id': `${SITE_URL}/peleadores/${slug}/#persona`,
    name: nombre || slugANombre(slug),
    url: `${SITE_URL}/peleadores/${slug}/`,
  };
}

/**
 * Convierte un evento en una referencia de entidad SportsEvent.
 *
 * OJO — esto NO puede devolver un nodo pelado con name+url. Google valida
 * CUALQUIER nodo tipado como Event que aparezca en la página, esté anidado
 * donde esté (`about`, `mentions`, `@graph`...), y exige `startDate` y
 * `location`. La versión anterior emitía solo name+url y por eso Search
 * Console reportaba "Missing field location / startDate" en los posts que
 * declaran `relatedEvents` — no en las fichas de evento, que sí los llevan.
 *
 * Los datos salen de events-all.json en build, la misma fuente que alimenta
 * /eventos/<slug>/, así que la referencia no puede desincronizarse de la
 * ficha canónica.
 *
 * Si el evento no está en el dataset devolvemos null y el nodo desaparece:
 * sin fecha no hay Event válido, y un slug que no existe apunta además a un
 * 404. Antes se inventaba el nombre con slugANombre() y se publicaba igual.
 *
 * @param {string} slug
 * @param {{name?:string,date?:string,loc?:string,status?:string}} [evento]
 *   registro de events-all.json
 * @returns {object|null}
 */
export function refEvento(slug, evento) {
  if (!evento?.date || !evento?.loc) return null;
  return {
    '@type': 'SportsEvent',
    '@id': `${SITE_URL}${eventPath(slug)}#evento`,
    name: evento.name || slugANombre(slug),
    url: `${SITE_URL}${eventPath(slug)}`,
    startDate: evento.date,
    location: {
      '@type': 'Place',
      name: evento.loc,
      address: { '@type': 'PostalAddress', addressLocality: evento.loc },
    },
    sport: 'Mixed Martial Arts',
    eventStatus: schemaStatus(evento),
  };
}

/** Fallback: "ilia-topuria" → "Ilia Topuria". Solo si no tenemos el nombre real. */
function slugANombre(slug) {
  return String(slug)
    .split('-')
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}
