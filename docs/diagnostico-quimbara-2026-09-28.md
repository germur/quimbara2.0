# Quimbara: punto de partida para optimización

Fecha: 28 de septiembre de 2026. Revisión técnica inicial, contenido público y estado de GitHub. No se modificó el código del sitio ni se publicó un despliegue.

Actualización posterior: la primera mejora de imágenes y carga del 3D, junto con una compilación nueva correcta, se documenta en [optimizacion-rendimiento-2026-09-28.md](./optimizacion-rendimiento-2026-09-28.md). Los resultados de abajo conservan la línea base anterior a los cambios.

## Alcance y versiones

- Sitio consultado: https://quimbara.org/.
- Repositorio: https://github.com/germur/quimbara2.0.
- Copia local: `d4519e1f6c1592ef6936217bcd6d1cfad6103759`, 2 de septiembre.
- GitHub: `e8e7bb230544b83a412451cc01cd41d93ea300ba`, 27 de septiembre; 23 commits por delante. La comparación devuelve cambios en datos e imágenes, no en las plantillas revisadas.
- Los resultados del directorio `dist` corresponden al build preexistente. No deben confundirse con mediciones del sitio publicado ni con una compilación nueva.

## Base comprobada

| Indicador | Resultado | Alcance |
| --- | --- | --- |
| Plataforma | Astro 6, MDX, Tailwind 4; salida estática | Código local |
| Artículos publicados | 6 | Portada pública |
| Última publicación | 17 de junio de 2026; la portada indica «hace 102 días» | Texto público observado, calculado al compilar |
| Perfiles contabilizados | 4.616 | Contador público; no implica igual cantidad indexada |
| Pruebas de quiniela | 27/27 correctas | Ejecutadas directamente con Node; el lanzador tsx falló por el entorno |
| Auditoría de eventos estructurados | 9.555 HTML, 4.739 bloques JSON-LD, 49 nodos Event; sin errores del auditor | Build local preexistente; verifica campos concretos y URLs, no todo el SEO |
| Últimas ejecuciones de GitHub | 25, 26 y 27 de septiembre: success | No certifica que todos los pasos tolerantes a errores hayan tenido éxito |
| Compilación nueva | No verificada | Restricciones de acceso y resolución de dependencias en el entorno; intento detenido |
| Core Web Vitals y Lighthouse | Sin medir | No se asigna una puntuación inventada |

La estructura ya incluye canonical, metadescripciones, Open Graph, sitemap, robots, redirecciones, datos estructurados y un criterio compartido de indexabilidad. También existen productos útiles para retención: comparación de peleadores, cartas y quiniela.

## Prioridades

### 1. Reducir recursos costosos y medir su efecto

**Evidencia:** `public/images/strickland-chimaev.png` ocupa 8.708.958 bytes. El bundle preexistente de `OctagonScene` ocupa 500.342 bytes y el CSS general 85.624 bytes. Son tamaños de archivos sin compresión de transporte, no bytes totales descargados por una visita.

`src/components/OctagonScene.astro` importa Three.js de forma estática. Aunque evita montar WebGL en móvil y con movimiento reducido, esa condición no evita por sí misma descargar el módulo. `ArticleCard.astro` usa imágenes normales sin variantes responsive. El layout solicita cuatro familias tipográficas y carga publicidad globalmente.

**Acción propuesta:** generar variantes WebP/AVIF y tamaños responsive para imágenes usadas; cargar Three.js mediante importación dinámica después de comprobar las condiciones; medir fuentes y publicidad antes de ajustar su carga. Mantener la identidad visual y comparar resultados antes/después.

**Aceptación:** registrar bytes transferidos, LCP, CLS y tiempo de bloqueo bajo el mismo dispositivo y conexión; comprobar legibilidad y calidad de imágenes. No prometer un porcentaje de mejora antes de medir.

### 2. Hacer confiable la publicación automática

**Evidencia:** `.github/workflows` tolera fallos de actualización y de auditoría de peleadores mediante `continue-on-error: true`. El commit automático ocurre antes del build y de la auditoría de schema. Además, esperar 90 segundos no comprueba que el despliegue haya terminado correctamente. El auditor de frescura usa la fecha de modificación del archivo, que puede renovarse al hacer checkout sin que cambie el contenido.

**Acción propuesta:** distinguir fuentes opcionales de validaciones obligatorias; comprobar datos y compilación antes de publicar el commit; guardar fecha real de actualización y procedencia por dataset; verificar el despliegue correspondiente antes de avisar a IndexNow.

**Aceptación:** un dataset inválido no se publica; un dato antiguo se detecta incluso después de un checkout; las notificaciones apuntan al despliegue confirmado.

### 3. Corregir el buscador y el acceso por teclado

**Evidencia en `src/components/Header.astro`:** el buscador no define diálogo accesible ni etiqueta explícita del campo; no contiene el foco ni lo devuelve al botón al cerrar. Si la descarga del índice falla, solo escribe en consola. El layout no ofrece enlace para saltar al contenido principal.

**Acción propuesta:** incorporar semántica de diálogo, nombre del campo, gestión del foco, anuncio de resultados, estados de carga/error y enlace de salto.

**Aceptación:** abrir, buscar, recorrer resultados y cerrar usando solo teclado; recuperar el foco inicial; recibir un mensaje útil sin conexión. Falta verificar estas interacciones en navegador: la sesión integrada se cerró inesperadamente después de obtener el contenido de la portada. Esto no demuestra un fallo general del sitio.

### 4. Alinear portada y estrategia editorial

**Evidencia pública:** seis artículos y más de tres meses desde el último. La portada combina análisis técnico con promesas de noticias y cobertura. También mezcla «Fighter Rankings», divisiones en inglés y textos en español; algunas tarjetas muestran país vacío.

**Propuesta editorial:** dar protagonismo a análisis y guías duraderas si esa es la frecuencia real de publicación, y mantener eventos/datos como servicio actualizado. Revisar textos, campos vacíos y enlaces hacia artículos relacionados antes de ampliar el catálogo.

Esto es una hipótesis de producto, no una conclusión sobre tráfico o conversiones: no se consultaron estadísticas de audiencia.

### 5. Ajustar señales SEO específicas

**Evidencia:** el `SearchAction` de la portada anuncia `/blog?q=...`, pero el blog implementa filtros de categoría y no procesa ese parámetro. El sitemap asigna `lastmod: new Date()` globalmente en cada build, aunque muchos contenidos no cambien. El título de inicio repite Quimbara al principio y al final.

**Acción propuesta:** alinear la búsqueda declarada con una función real o retirar esa declaración; usar fechas de modificación reales por contenido u omitir las no fiables; simplificar el título.

**Aceptación:** cada función descrita en metadata existe y las fechas reflejan cambios reales. La auditoría actual de Event debe seguir pasando.

## Medición necesaria para completar la línea base

Tomar portada, un artículo, una ficha de peleador, un evento y un comparador. Ejecutar tres mediciones móviles por URL bajo condiciones constantes y guardar la mediana, fecha, versión, tamaños y resultados. Repetir una muestra en escritorio y verificar navegación por teclado y pantalla estrecha.

Con acceso a GA4 y Search Console, registrar los últimos 28 días y el período anterior: clics, impresiones, CTR, páginas de entrada, sesiones con interacción y retorno. Comprobar si se miden búsquedas, uso del comparador y participación en quiniela; la presencia del código de GA4 no demuestra recepción correcta de eventos.

**Orden recomendado:** completar medición reproducible; optimizar imágenes y carga del 3D; fortalecer publicación; corregir buscador; ajustar SEO y presentación editorial. Comparar después cada cambio con esta base.

## Referencias

- Portada observada: https://quimbara.org/
- Comparación de versiones: https://github.com/germur/quimbara2.0/compare/d4519e1f6c1592ef6936217bcd6d1cfad6103759...e8e7bb230544b83a412451cc01cd41d93ea300ba
- Último proceso consultado: https://github.com/germur/quimbara2.0/actions/runs/36333558218

Limitaciones: sin acceso a métricas privadas, sin Lighthouse, sin auditoría visual completa ni validación exhaustiva de enlaces, accesibilidad, seguridad o exactitud deportiva. Los problemas locales de ejecución se mantienen separados del estado público.
