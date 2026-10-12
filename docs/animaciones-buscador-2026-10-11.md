# Quimbara: animaciones y buscador

Intervención sobre `2546361`, conservando las actualizaciones deportivas de GitHub.

## Animaciones

El logo conserva la onda de las letras mediante transformaciones CSS. Se elimina el bucle JavaScript que escribía estilos en cada letra y consultaba sus dimensiones repetidamente. El movimiento empieza después de cargar la página, se pausa fuera de pantalla, en pestañas ocultas, con movimiento reducido y mientras hay un diálogo abierto. Se retiran los aumentos de velocidad/amplitud por desplazamiento y cercanía del cursor.

El cursor del reloj conserva el seguimiento con inercia y los estados de interacción. Ahora se mueve mediante transformaciones de un contenedor independiente, sin modificar `left` y `top` cada fotograma. Solo aparece tras mover el ratón; deja de pedir fotogramas al alcanzar su posición y se reactiva al volver a moverlo. Se cancela al abandonar la página, ocultar la pestaña, abrir un diálogo o cambiar las preferencias de movimiento/puntero.

## Buscador

Se utiliza un diálogo modal nativo con título y etiqueta del campo, foco inmediato, recorrido circular mediante Tab/Shift+Tab, Escape y regreso al elemento que lo abrió. La página de fondo queda inactiva durante la búsqueda. Los controles y resultados tienen indicadores de foco visibles.

La carga del índice, los resultados y los errores se anuncian mediante un estado accesible. Se comprueban la respuesta HTTP y el formato del índice; hay un límite de espera de 15 segundos y un botón para reintentar. Se procesa la consulta más reciente si el usuario escribe durante la descarga. El índice se reutiliza después de cargarlo y las solicitudes concurrentes comparten una sola descarga. Los resultados se construyen con elementos y texto del DOM.

## Comprobación

Pruebas de ciclo de vida ejecutables con `node --test scripts/test-motion.mjs`: el cursor termina su trabajo al detenerse, cancela fotogramas pendientes y respeta movimiento reducido, puntero táctil, pestaña oculta y diálogo; el logo espera la carga y solo anima en las condiciones permitidas.

La revisión de teclado y pantalla se centra en este buscador. No constituye una auditoría completa ni una certificación WCAG del sitio. No se dispone de una prueba con lector de pantalla real.

Validado en navegador: apertura con Enter, Tab/Shift+Tab, cierre con Escape y Ctrl+K, regreso al botón, consulta escrita durante una descarga demorada, búsqueda sin coincidencias y recuperación tras HTTP 503. Pantalla móvil de 390 × 844: diálogo sin desbordamiento, foco visible de 2 píxeles y botón de cierre de 44 píxeles. Las tres wordmarks del fondo se pausan mientras está abierto.

Compilación: 4.959 páginas. Auditoría: 9.590 HTML, 4.765 bloques JSON-LD y 55 eventos, sin errores de los campos comprobados.

Los informes de rendimiento se guardan como artefactos de la conversación: tres pruebas Lighthouse móviles de la portada antes y después del despliegue. El resumen incluye valores individuales, medianas y sus límites.

Referencias: [patrón de diálogo modal de WAI](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) y [diálogo nativo y fondo inactivo](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal).
