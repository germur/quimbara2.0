# Primera optimización de rendimiento

## Actualización del 29 de septiembre

La mejora se integró con `a1c2119` (actualización automática del 28 de septiembre), conservando los datos recientes. La revisión visual pendiente se completó: portada a 1.440 y 390 px, y artículo de Strickland–Chimaev a 390 px. Sin desbordamiento horizontal; las imágenes cargan variantes de 800 y 480 px según la pantalla. El canvas se activa en escritorio y permanece desactivado en móvil. La validación de la integración anterior pasó 27 pruebas de quiniela y las auditorías de peleadores y schema. La compilación final sobre la actualización del 28 de septiembre generó correctamente 4.951 páginas en 75,84 segundos.

Se obtuvieron tres informes Lighthouse 12.8.2 por URL antes del despliegue, para portada y artículo, en móvil simulado. Hubo variación importante entre ejecuciones; los resultados se conservan como mediciones de laboratorio y no se presentan como tiempos de usuarios reales. El CLI emitió errores al limpiar perfiles temporales de Chrome en Windows después de guardar informes válidos (`runtimeError: null`). La comparación posterior se registra por separado al verificar la publicación.

Lo que sigue conserva el registro de la primera entrega local del 28 de septiembre.

28 de septiembre de 2026. Cambios locales sobre `d4519e1`; sin commit, push ni despliegue. Los datos deportivos locales siguen siendo los del 2 de septiembre. Esta entrega modifica la carga de recursos, no actualiza esos datos.

## Resultado medido

Tamaños reales de archivos, en bytes. Las versiones de 1.200 px sirven como comparación constante; `srcset` permite al navegador elegir entre 480 px y el máximo disponible según pantalla y densidad.

| Portada | Original | WebP 800 px | WebP 1.200 px |
| --- | ---: | ---: | ---: |
| Corporate MMA | 238.624 | 71.896 | 121.770 |
| Ecuación del octágono | 288.340 | 89.432 | 148.768 |
| Prates–Della Maddalena | 2.206.605 | 75.292 | 129.820 |
| Strickland–Chimaev | 8.708.958 | 78.618 | 138.624 |
| Topuria–Gaethje | 2.395.530 | 87.968 | 172.518 |

La variante de Strickland–Chimaev a 1.200 px pesa un 98,4 % menos. La variante mayor, de 1.920 px, ocupa 270.584 bytes. Es reducción de resolución y compresión con pérdida; no se afirma equivalencia píxel a píxel. Se inspeccionó visualmente el WebP de 1.200 px.

| JavaScript del octágono | Antes | Después |
| --- | ---: | ---: |
| Archivo inicial | 500.342 | 1.879 |
| Archivo inicial comprimido con gzip local | 126.716 | 1.000 |
| Módulo 3D diferido | Incluido arriba | 499.947 |

En móvil y con movimiento reducido, el cargador conserva el SVG y no solicita el módulo 3D. En escritorio lo solicita cuando el bloque entra en pantalla. El tamaño total del código de escritorio no disminuye de forma relevante: cambia el momento y las condiciones de descarga. El gzip local es una referencia reproducible, no una medición de transferencia de Netlify.

## Cambios

- `scripts/optimize-editorial-images.mjs` detecta las portadas del frontmatter y genera 21 variantes WebP de cinco originales. No amplía imágenes pequeñas. Los nombres derivan del contenido y la calidad para evitar reutilizar imágenes anteriores al cambiar una portada.
- `EditorialImage.astro` aplica `srcset`, `sizes`, dimensiones y decodificación asíncrona a tarjetas y portadas de artículos. Las portadas de artículo reciben prioridad alta. Se preservan las clases y los recortes existentes.
- Los originales siguen disponibles para enlaces, RSS y vistas previas sociales. Las ilustraciones dentro del cuerpo MDX quedan fuera de esta primera mejora.
- `OctagonScene.astro` contiene el cargador ligero; `src/lib/octagon-scene.ts` contiene la escena. Los errores de importación o inicialización conservan el fallback estático.
- Sharp se declara explícitamente como dependencia de desarrollo. La generación se ejecuta automáticamente antes de `npm run dev` y `npm run build`; no necesita publicar manualmente archivos generados.

## Verificación

- Compilación base correcta: Astro reportó 4.938 páginas, 71,61 segundos.
- Compilación optimizada correcta: 4.938 páginas, 82,77 segundos de Astro, más la generación previa de imágenes. Son ejecuciones individuales; no constituyen un benchmark de build.
- Auditoría sobre el build nuevo: 9.555 HTML examinados, incluidos redirects; 4.739 bloques JSON-LD y 49 nodos Event. Sin errores del auditor.
- Integridad: 21 variantes decodificadas y comprobadas contra sus dimensiones; 59 apariciones de imágenes responsive en 43 páginas de portada, blog, categorías y etiquetas. Los archivos referenciados existen y las tarjetas/portadas ya no usan los originales.
- HTML de inicio: no contiene precarga ni script directo del módulo 3D diferido.
- Prueba del cargador compilado en un entorno simulado: móvil, movimiento reducido y bloque fuera de pantalla no importan el módulo; escritorio visible lo inicia una vez; fallo de descarga no inicia la escena y se maneja sin propagar el error.
- Vista previa HTTP: la imagen destacada optimizada de Strickland–Chimaev responde 200, `image/webp`, 138.624 bytes. Su Open Graph conserva la URL original.
- Revisión del diff sin errores de espacios.

La revisión visual completa de móvil/escritorio y la ejecución real de WebGL siguen pendientes: el navegador integrado devolvió el contenido inicial y luego se cerró inesperadamente, también con la versión móvil sin WebGL. No se atribuye ese cierre a una causa determinada. No hay puntuaciones Lighthouse, tiempos de carga de usuarios ni Core Web Vitals nuevos. Los ahorros de archivos no equivalen a un porcentaje de mejora en velocidad total.

## Mantenimiento y siguiente paso

```sh
npm ci
npm run build
npm run audit:schema
npm run preview
```

Para regenerar portadas durante una sesión de desarrollo, ejecutar `npm run images:editorial` y reiniciar el servidor. `public/images/editorial/` y `src/data/editorial-images.generated.json` son salidas ignoradas por Git, regeneradas al iniciar/compilar. Los originales permanecen en `public/images/`.

Antes de publicar: integrar estos cambios de código con la rama actualizada de GitHub para conservar los datos recientes; completar revisión visual y medición móvil en un navegador estable. Comparar portada y artículo con condiciones constantes. El despliegue no está incluido en esta entrega.

Referencia de arquitectura: Astro copia los recursos de `public` sin procesarlos, por eso aquí se generan variantes explícitas antes de compilar: https://docs.astro.build/en/basics/project-structure/.
