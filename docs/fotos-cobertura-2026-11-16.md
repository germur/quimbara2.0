# Fotos: cobertura y actualización

Revisión del 16 de noviembre de 2026. Se conservan los borradores y cambios pendientes del checkout original; la reparación se prepara sobre la rama publicada.

## Resultado

Antes había 815 fichas con una referencia de imagen entre 4.620 registros. La reparación deja 2.551 fichas con foto y dos participantes adicionales con medios propios, sin inventar sus estadísticas ni crear perfiles deportivos.

La auditoría de archivos encuentra cero referencias rotas, cero rankeados sin foto, cero protagonistas de eventos anunciados sin foto y cero nombres identificados de las carteleras guardadas sin foto. La cobertura comprende los 193 rankeados de nuestra base y las 324 variantes de nombre presentes en esas carteleras; no se cuentan los participantes TBD.

Esto no significa que exista un retrato oficial de cada registro histórico: 2.069 fichas siguen sin imagen compatible disponible en la fuente indexada y conservan sus iniciales.

## Causas y correcciones

- Algunas direcciones oficiales difieren del slug local: Mairon Santos usa mairon-santos-alves y Yakhyaev usa abdulrakhman-yakhyaev.
- La cola anterior solo recuperaba rankeados y próximas carteleras. Se incorporó el directorio oficial completo: 3.238 perfiles, 295 páginas, con caché de 30 días y protección ante respuestas vacías o pérdida de cobertura.
- El buscador solo reconocía PNG/JPG y podía construir una dirección PNG inexistente. Ahora utiliza la referencia comprobada, admite WebP y no inventa una foto ausente.
- Eventos, fotos y enlaces comparten un resolvedor que contempla variantes verificadas, orden de nombres y sufijos. Los apellidos ambiguos no eligen arbitrariamente un retrato. Las parejas de la cartelera permiten resolver protagonistas abreviados.
- Los aliases de medios y la procedencia se conservan cuando se actualizan los datos deportivos. Los atletas que solo tienen una foto y no una fila deportiva válida permanecen separados.
- Las siluetas y los avisos ComingSoon del proveedor se excluyen como retratos reales. Se validan dimensiones, formato y decodificación.
- Las fotos recuperadas se convierten a WebP con transparencia; el lote principal pasó de 213.555.925 a 37.863.116 bytes. Se conserva la dirección de la fuente.
- Se corrigió el encuadre superior de los retratos en fichas y buscador.

## Mantenimiento

La tarea diaria sigue ejecutando data:images. La cola amplía paulatinamente la cobertura histórica con un límite habitual de 50 y prioridad de próximos eventos/rankeados. El directorio se renueva cada 30 días; los fallos conservan el último dato válido y el reintento registrado. Dos ejecuciones consecutivas tras la reparación terminaron con cero intentos, cero fallos y cero reintentos pendientes.

audit:images comprueba los archivos reales. Con --dist revisa además las imágenes locales de todas las páginas construidas y las referencias del índice del buscador. La tarea diaria ejecuta esta auditoría antes del commit que dispara la publicación.

Las pruebas incluyen variantes de nombre, apellidos ambiguos, archivos ausentes, sufijos y exclusión de sustitutos genéricos. Continúan aprobadas las pruebas de datos, la migración de quinielas y los 27 casos de puntaje.
