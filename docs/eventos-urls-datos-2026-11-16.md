# Migración de eventos y reparación de datos — 16/11/2026

## Resultado y decisiones

Las fichas usan direcciones descriptivas: `/eventos/ufc-fight-night-prochazka-vs-stirling-2026/` y `/eventos/ufc-335-oliveira-vs-lopes/`. El registro persistido en `src/data/event-urls.json` separa URL pública, identidad estable y registro de datos preferente.

Una URL publicada se conserva ante cambios de rival. Un identificador de proveedor permite asociar reprogramaciones sin perder la dirección o el identificador de quiniela. La selección inicial agrupa parejas coincidentes del mismo tipo de evento en fechas cercanas; solo asocia un placeholder sin protagonistas cuando hay un único evento nombrado del mismo tipo en esa fecha. No fusiona dos peleas distintas por compartir día. Los registros originales se conservan.

El registro actual contiene 37 identidades y 61 direcciones anteriores con reglas 301 permanentes. Se incluyen variantes con/sin slash y quinielas cuando existe destino. Los enlaces internos, canonical, schema, listados y sitemap utilizan la misma resolución. Los placeholders sin cartelera no son indexables ni aparecen en el sitemap.

## Coherencia de las fichas

- H1 con protagonistas y metadatos que describen información disponible, sin prometer resultados inexistentes.
- Un evento futuro no se presenta como pasado por un estado erróneo del scraper. No se emite el estado inexistente `EventCompleted`.
- Se elimina la FAQ que transformaba estimaciones de horario en respuestas ciertas.
- Los horarios solo se muestran con fuente y consulta registradas. Se distingue el inicio de la programación de la hora de la estelar y de cada combate; no se afirma confirmación oficial de UFC a partir de una inferencia.
- No se publican operadores de emisión genéricos como si estuvieran verificados por país.
- Se normalizan recinto, ciudad y país cuando la fuente los facilita. Se elimina el breadcrumb duplicado.
- Los otros próximos eventos se filtran por fecha y las fichas incluyen última comprobación, fuente, cambios y aviso cuando se conserva una versión anterior por error de extracción.

## Fuentes y actualización

Wikipedia conserva su función de calendario y contraste. El adaptador ESPN consulta un endpoint JSON por fecha y exige coincidencia del combate principal; utiliza nombres normalizados y aliases conservadores, no solo la fecha. Rechaza respuestas vacías, parejas inválidas, peleas duplicadas y caídas bruscas de cobertura. Guarda procedencia, consulta y diferencias antes de sustituir la cartelera.

El endpoint de ESPN no constituye una API contratada ni ofrece un SLA comprobado. Los grupos horarios se identifican como inferidos en los datos; el orden y la distribución pueden cambiar. Una respuesta del proveedor no se presenta como confirmación independiente del organizador.

Las carteleras futuras dejan de conservar caché indefinidamente. La ingesta de calendario ya no interpreta la desaparición de un slug como prueba de finalización ni elimina otros eventos por la fecha de un override.

Los historiales de rankeados se renuevan por caducidad de siete días, con límite de 50 por ejecución diaria y rotación por antigüedad. Para esta reparación se renovaron 193 historiales; la comprobación final no encontró rankeados de nuestra base con historial ausente o anterior al período de caducidad. Los retirados conservados en el archivo no se presentan como parte de esa cobertura.

La cola de fotos prioriza protagonistas próximos y rankeados. Recupera referencias a archivos existentes, registra el motivo de fallo y fecha de reintento, valida tipo/tamaño y detiene intentos ante bloqueos repetidos. Se descargaron 52 fotografías en dos lotes. Dos atletas no publicaron una imagen utilizable en la consulta; se conservan placeholders y reintentos, sin inventar activos. Se regeneraron las cartas OG después de actualizar los datos.

Los rankings tienen un umbral de cobertura antes de retirar puestos. Las peticiones tienen timeout; los errores HTTP de IndexNow producen salida no satisfactoria. La frescura de peleadores usa una consulta satisfactoria registrada, no el mtime del checkout.

## Publicación y alertas

El workflow ejecuta pruebas, ingestas, auditorías y compilación antes de hacer el commit de datos que dispara Netlify. Las ingestas pueden conservar datos válidos si falla una fuente, pero una etapa final refleja los fallos tolerados y produce un resumen de salud; no se oculta una salida 1 bajo un resultado global verde.

Antes de enviar IndexNow se verifica que producción sirva el SHA esperado. La tarea tiene límite de duración y exclusión de ejecuciones simultáneas. Las imágenes pendientes se exponen en el resumen, incluidas las que están esperando reintento.

## Quinielas y cambios pendientes

La URL de la quiniela cambia, pero el ID de almacenamiento permanece. La lectura recupera picks de aliases antiguos y respeta sus cierres. Un guardado vacío explícito no resucita picks anteriores. No se cambia el motor de puntaje.

Se integran las correcciones editoriales pendientes de esta conversación: página de autor/política, fuentes visibles, perfil social coherente y eliminación de fechas artificiales de compilación. El checkout original con otros borradores, analítica y overrides locales queda intacto; esta entrega se preparó en un worktree sobre la rama remota actual.

## Validación y límites

- Seis pruebas de identidad, aliases, reprogramación, estados, horarios, cobertura y cola de imágenes.
- Prueba de migración de picks: lectura antigua, borrado explícito y cierre.
- Los 27 casos existentes del puntaje continúan pasando.
- Auditoría del artefacto: redirecciones, canonical, sitemap, fechas, estados y rutas de quiniela.
- Auditoría JSON-LD ampliada a estados válidos y destinos internos de autor y política.
- Compilación estática y revisión real de la ficha, selector horario, fotografías y navegación a la quiniela.

No se afirma una mejora de tráfico o posiciones, ni presencia en respuestas de IA. No se modifican los datos privados de GSC ni se usa otra propiedad. Para revertir la publicación se revierte el PR y el despliegue correspondiente; los datos originales de quinielas y los registros raw de eventos no se han borrado.
