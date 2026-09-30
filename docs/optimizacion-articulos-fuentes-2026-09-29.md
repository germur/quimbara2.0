# Quimbara: imágenes internas y fuentes locales

Segunda intervención, sobre la primera optimización publicada en el PR #1.

## Cambios

- Las imágenes internas de tres artículos y las 14 láminas de TacticalSlider usan EditorialImage: WebP adaptativo, dimensiones explícitas y carga diferida. Las portadas siguen cargando con prioridad alta.
- El generador descubre las rutas locales literales de EditorialImage en MDX. La lista del carrusel se comparte con el generador en `src/lib/tactical-images.mjs`. Las nuevas imágenes deben usar ese componente con `src` literal y `sizes` acorde al espacio disponible; las expresiones dinámicas requieren registrar su origen en el generador.
- Se corrige una imagen rota: `octagon_equation.png` no existía; ahora se utiliza `octagon_equation.webp`.
- Big Shoulders Display, Manrope, Newsreader y JetBrains Mono se sirven desde el sitio. Se mantienen los nombres de familia, fuentes de reserva y `font-display: swap`; se precargan las dos fuentes principales. Los archivos latinos incluyen las tildes del español. Las licencias están en `public/fonts/licenses/`.
- Las imágenes originales y el PDF permanecen disponibles. No se cambian anuncios, analítica, contenido editorial ni datos deportivos.

## Ahorro de archivos

Las 14 láminas originales suman 58.980.362 bytes. Sus versiones de 800 píxeles suman 576.330 bytes, aproximadamente un 99% menos. El navegador elige la resolución según pantalla y densidad; este dato no equivale al ahorro de una visita completa ni al tiempo de carga.

## Validación local

- Compilación completa: 4.951 páginas, 74,75 segundos.
- Auditoría de datos estructurados: 9.578 HTML, 4.753 bloques JSON-LD y 51 eventos; sin errores.
- Decodificación y dimensiones verificadas de 95 WebP generados para 23 originales.
- Los cuerpos de los tres artículos contienen 16, 5 y 1 imágenes optimizadas respectivamente, con dimensiones, srcset y carga diferida.
- Revisión visual de portada en escritorio y artículo en móvil de 390 × 844; sin desbordamiento horizontal. El carrusel avanza de página mediante su botón y carga imágenes WebP.

La medición pública se realiza con Lighthouse móvil, tres ejecuciones alternadas por URL antes y después del despliegue. Los informes brutos y el resumen de publicación se conservan como artefactos de esta conversación. Son mediciones de laboratorio, no datos de usuarios reales.

Referencia: [Fontsource: fuentes variables](https://fontsource.org/docs/getting-started/variable) y [font-display](https://fontsource.org/docs/getting-started/display).
