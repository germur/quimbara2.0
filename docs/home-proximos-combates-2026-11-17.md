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

## Discrepancia encontrada para investigar

La cabecera de Kevin Vallejos y el perfil visible de UFC Español muestran 17–1, mientras que «Camino del peleador» calcula 18–1 a partir de otra colección histórica. No se cambió ninguno de esos resultados sin contrastarlos pelea por pelea. El bloque nuevo usa el récord profesional de la ficha atribuida a UFC, no la suma de ese historial. Es necesario reconciliar ambas fuentes antes de tratar el historial como un total profesional definitivo.
