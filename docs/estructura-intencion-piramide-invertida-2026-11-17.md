# Estructura de Quimbara por intención y pirámide invertida

La respuesta principal aparece después del H1; siguen la evidencia, la explicación y el contexto. Es una decisión editorial para facilitar lectura y navegación, no una fórmula de Google ni una garantía de posiciones, fragmentos destacados o citas de asistentes.

## Investigación

- Nielsen Norman Group, «Inverted Pyramid: Writing for Comprehension»: https://www.nngroup.com/articles/inverted-pyramid/ . Recomienda comenzar con lo esencial y permitir entender la idea incluso sin terminar la página.
- Australian Government Style Manual: https://www.stylemanual.gov.au/structuring-content/types-structure/inverted-pyramid-structure . Ordena los detalles según la necesidad del lector y usa títulos descriptivos para facilitar el escaneo.
- Google Search Central: https://developers.google.com/search/docs/fundamentals/creating-helpful-content . Pide utilidad, fiabilidad, originalidad y títulos que describan lo que realmente entrega la página. No prescribe esta técnica como factor de posicionamiento.

## Evidencia propia

GSC vía Windsor.ai, propiedad exacta `https://quimbara.org/`, del 18 de octubre al 14 de noviembre de 2026, sin filtros de país/dispositivo, `include_fresh_data: false`. Resumen del sitio: 17.599 impresiones y 8 clics. Consultas observadas: «cuanto mide ilia topuria», 509 impresiones; «movsar evloev estatura», 488; «ufc 336 cartelera», 214. Las consultas no son una lista exhaustiva del tráfico; no se sumaron para representar el total del sitio. Esta muestra respalda priorizar respuestas físicas y de eventos; no demuestra que la estructura previa causara la caída de tráfico.

## Mapa de intención y página principal

| Ruta | Pregunta principal | Primera respuesta | Evidencia y contexto posteriores |
| --- | --- | --- | --- |
| `/` | Qué puedo consultar hoy en Quimbara | Próximos combates tras una cabecera compacta | Editorial, calendario, rankings y resultados |
| `/eventos/` | Cuáles son los próximos eventos | Calendario cronológico | Archivo de eventos |
| `/eventos/{evento}/` | Cuándo, a qué hora y quién pelea; qué ocurrió si ya pasó | Fecha, sede y programación disponible; resultado cuando existe una coincidencia de evento y estelar | Horarios por país, cartelera, emisión, procedencia y contexto |
| `/peleadores/{peleador}/` | Cuánto mide, alcance, récord y siguiente pelea | Datos disponibles, alcance del récord y pelea anunciada reciente | Ficha física, forma reciente, carrera, biografía, análisis y fuentes |
| `/comparar/{a}-vs-{b}/` | Qué diferencias físicas hay entre dos peleadores | Diferencias medidas en estatura y alcance | Siluetas, métricas, récord con alcance explícito y lectura editorial |
| `/rankings/` | Quiénes son campeones y cómo está cada división | Acceso a divisiones, campeones y fecha de consulta | Clasificación completa por división y fuente |
| `/peleadores/{division}/` | Campeón y clasificación de una categoría | Campeón identificado, primer contendiente, rango de peso y fecha de consulta | Top 15 y directorio histórico disponible |
| `/blog/{articulo}/` | Una explicación o hipótesis editorial concreta | Respuesta escrita por el autor antes de la imagen | Puntos clave, argumentos, gráficos, fuentes del artículo, etiquetas y enlaces relacionados |

Cada entidad conserva su URL principal. Las variantes «altura», «estatura» y «cuánto mide» se responden en una misma ficha. Los horarios por país siguen dentro del evento, sin clonar páginas por cada consulta. El comparador describe diferencias; no presenta un ganador calculado a partir de la altura.

## Aplicación en plantillas y automatización

`AnswerFirst.astro` presenta una respuesta accesible en HTML y enlaces a sus detalles. Los perfiles generan texto solo con medidas disponibles y récord de alcance conocido; la próxima pelea necesita una cartelera reciente y explícitamente programada, identificada contra el participante. Si no existe, el título no la promete. Las fichas históricas mantienen su contexto; la división se expresa como registrada para evitar asegurar actividad actual de peleadores retirados.

En eventos, una hora de programación no se presenta como hora exacta de la estelar. Los resultados disponibles se vinculan por nombre exacto del evento, pareja estelar y fecha de consulta posterior al evento. Cuatro resultados de una fuente no equivalen a una cartelera completa. Una ficha sin resultados no promete entregarlos en el título.

Los seis artículos existentes incorporan `searchIntent` y `directAnswer`. El segundo campo es editorial: no se genera un pronóstico ni se reescribe el argumento con una plantilla. Las previas y columnas se identifican como tales. Se conservan fechas originales; un cambio de plantilla no simula una revisión factual del artículo.

Para futuros artículos: definir primero una pregunta principal; responderla en `directAnswer`; usar `takeaways` para la evidencia; abrir cada sección con su hallazgo; dejar antecedentes y material accesorio después. Los datos automáticos deben tener fuente, fecha, identidad y alcance; los huecos no se rellenan con afirmaciones inventadas. Las nuevas páginas automáticas deben aportar una respuesta distinta que no esté cubierta por una URL existente.

`test:data` verifica alcance del récord, datos ausentes, anuncios vencidos, identificación de resultados y comparaciones sin pronósticos. Después de construir, `audit:intent` comprueba un H1, respuesta antes del contenido de apoyo y destinos de los enlaces de sección. El proceso diario ejecuta ambas comprobaciones.

## Medición

Comparar periodos de igual duración y filtros equivalentes en la misma propiedad. Revisar consultas físicas, de carteleras y de resultados por separado, además de clics y participación dentro del sitio. Registrar fecha real de publicación de esta estructura antes de medir; los cambios de posiciones por sí solos no prueban causalidad. Resolver las discrepancias de datos pendientes sigue siendo un trabajo separado de ordenar mejor el contenido.
