# Próximos combates en el inicio

Fecha de comprobación: 17 de noviembre de 2026. Implementación aislada de los borradores locales del usuario.

## Referencia y adaptación

Se inspeccionó visualmente https://www.ufcespanol.com/. Su portada destaca a Kevin Vallejos contra Aljamain Sterling para el 21 de noviembre y conecta la historia, la cartelera y el perfil en «En la mira». Quimbara adapta esa conexión con tres enfrentamientos y seis perfiles antes del bloque editorial, conservando su diseño. No copia textos, vídeos ni fotos editoriales de la portada UFC.

## Funcionamiento

- Selección cronológica del próximo evento con cartelera verificada, dentro de 42 días; hasta tres combates en orden de cartelera, priorizando la estelar.
- Fuente: los datos de ESPN que ya trae `data:details`, conservando su estado explícito `sourceStatus`. Solo se promocionan combates `STATUS_SCHEDULED` con dos nombres anunciados. No se inventa un horario individual a partir del horario de la transmisión.
- Exclusión de eventos cancelados, aplazados o sin confirmar, combates retirados y nombres TBD/TBA. Identificación con los IDs y el resolvedor existente; un nombre ambiguo no recibe una foto ni un perfil ajeno.
- Récord profesional solamente cuando la ficha declara `recScope: pro`.
- Fecha en Colombia. Se oculta el bloque si la consulta falla o supera 72 horas; también al terminar el día del evento. El navegador oculta un bloque vencido aunque una publicación antigua siga en caché. El siguiente despliegue diario selecciona el siguiente evento.
- La actualización diaria existente ejecuta `data:details` antes de construir y publicar. Las nuevas pruebas quedan incluidas en `test:data`, por lo que también se ejecutan en ese proceso.

## Comprobación de fuentes y automatización

Se volvió a ejecutar `data:details`: cuatro carteleras consultadas sin errores (21 de noviembre, 5 y 12 de diciembre, 16 de enero). La primera devuelve once combates; Vallejos–Sterling figura entre ellos y coincide con la promoción visible en UFC Español. La fecha de enero recién entra en la ventana de 60 días del importador; ESPN incluye allí una entrada TBA, excluida del bloque del inicio.

Última ejecución automática completa observada antes de la publicación de este cambio: https://github.com/germur/quimbara2.0/actions/runs/43970974544, finalizada correctamente el 16 de noviembre. La configuración programa una ejecución diaria a las 12:00 UTC (07:00 en Colombia). Esto verifica esa ejecución y la consulta actual de carteleras; no demuestra que todos los datos históricos de cada peleador sean correctos.

Validación realizada: pruebas de datos y migración de pronósticos; ocho casos adicionales de selección, caducidad, zona horaria, identidades y estados; compilación completa; auditorías de eventos, imágenes y datos estructurados. Revisión visual a 1366 y 390 píxeles, sin desbordamiento horizontal; seis retratos cargados; navegación al perfil de Kevin Vallejos comprobada.

## Discrepancia investigada y corregida

La cabecera de Kevin Vallejos y el perfil visible de UFC Español muestran 17–1, mientras que el historial calcula 18–1. La crónica oficial https://www.ufc.com/news/ufc-fight-night-emmett-vs-vallejos-results-main-card-highlights-winners-interviews confirma explícitamente que quedó 18–1 tras vencer a Emmett. Se corrigió la ficha a 18–1 con esa evidencia. La excepción identifica al atleta por ID, solo sustituye el valor antiguo concreto y exige que siga coincidiendo el tramo UFC; no congela récords posteriores. La importación recurrente aplica la misma regla.

También se corrigió el importador de últimos resultados: antes omitía la estelar, publicada en un bloque separado por Sherdog, y asumía que la columna izquierda era siempre la ganadora. Ahora lee los estados de ambos participantes y diferencia victorias, empates y no contest. La portada incluye Gane–Hokit y presenta Medic–Holland como empate.

El refresco diario del historial ahora incluye participantes recientes/próximos y fichas antiguas fuera del ranking. Para activos o fuentes discrepantes, la caché dura 12 horas, lo que los hace elegibles en cada ejecución diaria; el resto conserva siete días y los lotes rotan por antigüedad. Se ejecutó un lote real de 50 objetivos: 27 historiales actualizados y 23 sin página, sin errores de transporte. El lector omite historiales y desgloses cuyos totales no concuerdan con el récord profesional de la ficha. No sustituye automáticamente un récord con Wikipedia.

`audit:results` registra las diferencias de fuentes en `src/data/result-integrity.json`, comprueba que resultados y procedencia sean explícitos y bloquea contradicciones en resultados o desgloses publicables. Se ejecuta también en la actualización automática. Las discrepancias restantes requieren contraste individual; no son todas errores demostrados de UFC ni de Wikipedia.

La programación de GitHub está activa (`0 12 * * *`, diariamente). Las últimas ejecuciones programadas observadas fueron exitosas del 12 al 15 de noviembre; la del 16 falló y una ejecución manual posterior fue exitosa. La hora del cron es nominal: GitHub registró retrasos en las ejecuciones observadas, por lo que no se garantiza publicación exactamente a las 07:00 en Colombia.
