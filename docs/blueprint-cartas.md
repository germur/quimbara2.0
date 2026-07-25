# Blueprint — Cartas Quimbara

Estado al 25 de julio de 2026. Lo que la carta necesita, qué ya existe, y qué falta.

---

## 1. Anatomía y estado de cada campo

Formato: vertical 2:3, 400px de ancho, exportable a PNG.

| Campo | Fuente | Cobertura (195 rankeados) | Estado |
|---|---|---|---|
| Badge de rareza | `ranking` → automático | 195 / 195 | ✅ listo |
| Silueta | motor D2 paramétrico | 195 / 195 | ✅ listo |
| Nombre + apodo | `fighters.json` | 195 / 195 | ✅ listo |
| Récord V-D-E | UFC.com semanal | 195 / 195 | ✅ listo |
| Desglose KO/SUB/DEC | Wikipedia, validado | 168 / 195 | ✅ listo (omite si no cuadra) |
| Altura · alcance · peso | UFC.com semanal | 195 / 195 | ✅ listo |
| **Edad** | — | **26 / 195** | ⚠️ lo scrapeo yo |
| **Bandera de país** | — | **41 / 195, e inconsistente** | ⚠️ lo scrapeo yo |
| **`arma`** | editorial | **28 / 195** | 🔴 **solo tú** |

### Rareza — ya funciona, no se toca

| Rareza | Criterio | Cuántas hay |
|---|---|---|
| Legendaria | Campeón | 11 |
| Épica | Top 5 | 54 |
| Rara | Top 15 | 126 |
| Común | Resto del roster | 1.823 |

Se calcula desde `ranking` en cada build. Cuando el bot refresca los rankings el lunes, las cartas se recalculan solas. **Nunca hardcodear una rareza.**

---

## 2. Lo que lleno yo (no requiere nada tuyo)

**Edad.** El infobox de Wikipedia trae `birth_date` en formato `{{birth date and age|1993|4|11}}`. Extiendo `fetch-peleas.mjs` para capturarlo en la misma pasada — ya visito esas páginas. Pasa de 26 a ~190.

**País para la bandera.** Hoy `from` está roto: 154 rankeados sin dato, y los que tienen mezclan países con ciudades (*"Safford, Arizona, EE.UU."*) y nomenclaturas (*"USA"* vs *"EE.UU."*). Wikipedia tiene `birth_place` confiable (`[[Hakha]], Chin State, Myanmar`) — el último segmento es el país. Lo normalizo a ISO-3166 para poder pintar banderas.

**Caso que necesita tu criterio:** hay peleadores con doble nacionalidad. Dern nació en Phoenix pero pelea como brasileña-americana; Joshua Van es birmano y americano. Voy a usar `birth_place` por defecto y dejar un override para que corrijas los que quieras.

---

## 3. Lo único que no puedo hacer: el `arma`

> El campo `arma` es lo que hace que la carta sea Quimbara y no una ficha de Wikipedia.

### Especificación

- **Máximo 40 caracteres.** Es un límite de layout, no una sugerencia.
- **Un mecanismo concreto, no un adjetivo.** La carta ya muestra el récord; el `arma` explica *cómo* gana.
- **Sin datos que caducan.** "Invicto" deja de ser cierto cuando pierde. `npm run audit:peleadores` ahora falla si un `arma` dice invicto sobre alguien con derrotas — ya me pasó con Topuria.
- **Sin nombres de gimnasio ni estadísticas.** Eso es información, no voz.

### Calibración con las 30 que ya existen

Estas vinieron del seed. Las clasifico para que tengas referencia de qué funciona:

**Fuertes — mecanismo + carácter:**
| Peleador | Arma | Por qué funciona |
|---|---|---|
| Gaethje | *Camina hacia el fuego y le gusta* | Describe la decisión táctica y la personalidad en una frase |
| Chimaev | *Te abraza y ya no existes* | El mecanismo (clinch) contado como amenaza |
| Pereira | *La izquierda que apaga la luz* | Golpe específico, imagen concreta |
| Holloway | *Volumen imposible, no se cansa nunca* | Nombra su ventaja real |
| Van | *Ritmo de mosca con corazón de pesado* | Tensión entre dos cosas |

**Débiles — hay que reescribirlas:**
| Peleador | Arma | Problema |
|---|---|---|
| Stirling | *City Kickboxing con hambre de prospecto* | Nombra un gimnasio, no un arma |
| Oliveira | *Récord de sumisiones de la UFC* | Es una estadística, no tu voz |
| Hokit | *Luchador de verdad con manos de piedra* | Genérico, le cabe a cincuenta peleadores |
| Evloev | *Invicto porque nadie sabe cómo pararlo* | Caduca cuando pierda |

Las 30 están marcadas `armaRevisada: false` en `src/data/peleadores-editorial.json`. Cuando reescribas una, pon el flag en `true`.

### Prioridad — no necesitas las 146

Ordenado por retorno real. La carta que se comparte es la del campeón, no la del #14:

| Ola | Quiénes | Cuántas faltan | Por qué |
|---|---|---|---|
| **1** | Campeones (legendarias) | **3** | Son las cartas que circulan. Ya tienes 8 de 11 |
| **2** | Top 5 (épicas) | **39** | El grueso de lo que se busca y se comparte |
| 3 | Top 15 (raras) | 121 | Solo si las olas 1 y 2 muestran uso real |

**Con 42 armas escritas (olas 1 y 2) el producto está vivo.** Los del roster común quedan sin `arma` y la carta simplemente omite el bloque — no se rompe.

### Cómo trabajarlas

Editá `src/data/peleadores-editorial.json`:

```json
"tom-aspinall": {
  "arma": "Velocidad de mediano en cuerpo de pesado",
  "armaRevisada": true,
  "nacimiento": "1993-04-11"
}
```

Para ver el progreso y qué falta, ordenado por prioridad:

```bash
npm run audit:peleadores
```

---

## 4. Decisiones que necesito de ti

1. **Desbloqueo.** El blueprint original propone: visitar ficha → carta común; acertar pick en quiniela → carta del ganador; cartelera estelar perfecta → carta especial del evento. ¿Lo mantenemos así? Ya está el store compartido para soportarlo.

2. **Cartas del roster común.** ¿Existen aunque no tengan `arma` (con el bloque omitido), o solo se generan las de rankeados?

3. **`/cartas/{slug}/` indexable.** El blueprint dice que sí, para generar la OG image. Eso son ~195 páginas nuevas con poco texto propio. Mi recomendación: **noindex al principio**, la OG image funciona igual porque se sirve desde el `<meta>` de la ficha del peleador, que ya está indexada. Así no metemos thin content antes de saber si el producto se usa.

4. **Doble nacionalidad** — ¿bandera de nacimiento o de con quién compite? (Dern: EE.UU. o Brasil).

---

## 5. Qué construyo cuando tengas las armas

En este orden:

1. **Scraper extendido** — edad + país normalizado (no depende de ti, lo puedo hacer ya)
2. **`CartaPeleador.astro`** — las 4 variantes de rareza, diferenciadas por marco y badge, mismo layout
3. **Export a PNG** — canvas, misma técnica que ya funciona en el comparador
4. **OG image por peleador** — cuando alguien comparte la ficha, aparece la carta
5. **`/cartas/`** — colección del usuario, sobre el store de la quiniela
6. **Compartir nativo** en móvil

**Restricciones que no se negocian:** sin pagos, sin aleatoriedad, sin loot boxes — es colección por mérito. Y las siluetas son siempre el SVG paramétrico, nunca fotos de peleadores ni frames de transmisión.

---

## Resumen

Todo el cimiento está listo. **El único bloqueo real son 42 frases** (3 campeones + 39 del top 5) de máximo 40 caracteres cada una.

Edad y país los resuelvo yo con el scraper que ya existe.
