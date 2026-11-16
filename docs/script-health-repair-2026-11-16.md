# Reparación de actualización de datos — 16 noviembre 2026

## Cambios

- Las estadísticas, medidas, apodos y resultados se unen por ID de UFCStats. Nueve nombres duplicados representan dieciocho personas; el registro de identidades verifica sus combates mediante perfiles oficiales y fechas. Los dos Bruno Silva tienen fichas distintas. Los IDs públicos ya publicados se conservan incluso si cambia el nombre del proveedor.
- Las fotos y enlaces de carteleras usan nombre, ID y división para desambiguar, sin cambiar esquinas ni el significado de pronósticos guardados.
- Se retiraron semillas de rankings. El importador acepta solamente el bloque visible actual de UFC (11 divisiones, 176 filas), resuelve las 176 asignaciones y bloquea fuentes incompletas o ambiguas antes de escribir. El bloque de metadatos de esa página contiene otra clasificación y se excluye.
- Los récords profesionales se obtienen de perfiles oficiales cuya identidad se valida. Se incluyen peleadores de próximos eventos y fichas con foto, además de los indexables. Lotes y caducidad permiten recorrer el catálogo sin descargarlo entero cada día. Mairon Santos: 18-1; Abdul-Rakhman Yakhyaev: 11-0.
- Se detectaron 22 discrepancias donde el récord profesional publicado por UFC es inferior a los resultados UFC verificables. Se conserva la discrepancia con su fuente y se presenta el subconjunto como «Récord UFC». No se inventa un récord profesional completo.
- El validador editorial funciona como ESM y admite nombres de campos actuales, YAML sin comillas y saltos de línea Windows. El antiguo generador editorial ya no reescribe datos históricos: utiliza los overrides actuales y requiere `--write` para aplicar texto.
- Se archivaron textos antiguos generados que permanecían idénticos en cuatro perfiles. Se preservaron las ediciones y análisis tácticos independientes; el archivo de procedencia está en `docs/editorial/`.
- La búsqueda incorpora los seis artículos con saltos Windows, conserva URLs canónicas de eventos y distingue récord profesional de récord UFC. El índice actualizado contiene 5.201 fragmentos, con vectores locales, reutilización de fragmentos sin cambios y comprobación de coherencia del archivo público. El flujo diario lo vuelve a generar con caché.
- Los historiales comunitarios validan fecha de nacimiento cuando está disponible, requieren coincidencia para nombres duplicados, excluyen enlaces ambiguos y asocian eventos por fecha además de título. Se apartaron 23 historiales previamente guardados con fechas contradictorias; permanecen archivados en `revisionIdentidad` para revisión, sin mostrarse como datos confirmados.
- Una barrera anterior al commit exige éxito de identidades, base, rankings, récords, detalles, historiales y fotos. Las auditorías de identidades, imágenes, URLs, esquema y compilación preceden la publicación.

## Validación local

- 4.631 atletas, 4.629 IDs de UFCStats; ningún historial de homónimos pendiente de desambiguación.
- Pruebas de datos, fotografías, identidad, fallos de fuentes, conservación de URLs y migración de pronósticos; 27 casos de puntuación.
- Historiales, detalles, fotos, base y rankings ejecutados contra fuentes públicas. Lote de récords: 98 actualizados, 2 sin fuente verificable, 0 errores de descarga.
- Índice semántico cotejado con todos los fragmentos actuales. Evaluación existente: 30/44 primeros resultados, 35/44 entre los tres primeros (MRR 0,753). Algunas expectativas son antiguas; esta medición no demuestra exactitud de respuestas ni sustituye revisión editorial.

## Fuentes y límites

La base de estadísticas depende del espejo público Greco1899 de UFCStats, con control de frescura de 21 días. Los perfiles, rankings y retratos usan UFC; los historiales ampliados usan Wikipedia. Una fuente puede publicar errores o retrasos; el sistema conserva atribución, alcance y datos anteriores cuando no puede verificar una actualización. Las identidades sin retrato verificable muestran el recurso alternativo del sitio.

Los borradores del directorio original del usuario no se editaron. La reparación se preparó en un checkout independiente.
