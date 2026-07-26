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
| Edad | Wikipedia `birth_date` | 194 / 195 | ✅ resuelto |
| Bandera de país | Wikipedia `birth_place` | 194 / 195 | ✅ resuelto |
| **`arma`** | editorial | **28 / 195** | 🔴 **solo tú — único bloqueo** |

### Rareza — ya funciona, no se toca

| Rareza | Criterio | Cuántas hay |
|---|---|---|
| Legendaria | Campeón | 11 |
| Épica | Top 5 | 54 |
| Rara | Top 15 | 126 |
| Común | Resto del roster | 1.823 |

Se calcula desde `ranking` en cada build. Cuando el bot refresca los rankings el lunes, las cartas se recalculan solas. **Nunca hardcodear una rareza.**

---

## 2. Edad y país — resuelto (25 jul)

Ambos salen del infobox de Wikipedia, capturados en la misma pasada del scraper de peleas.

**Edad:** de 26 a **194 de 195**. `birth_date` viene en formato `{{birth date and age|1993|4|11}}`, consistente.

**País:** de 41 (y roto) a **194 de 195**. La resolución tiene cuatro niveles de precedencia en `src/lib/paises.ts`:

| Nivel | Fuente | Cuántos resuelve |
|---|---|---|
| 1 | Override a mano en `peleadores-editorial.json` | 1 |
| 2 | `birth_place` de Wikipedia | 180 |
| 3 | Demónimo de `nationality` | 7 |
| 4 | Campo `from` de UFC.com, validado | 2 |

**La regla que importa: devuelve `null` antes que adivinar.** Una bandera equivocada en una carta que la gente comparte es peor que no mostrar bandera. Los cuatro problemas que traía la data cruda quedaron cubiertos:

- Estados que ya no existen (*Soviet Union*, *Czechoslovakia*, *FR Yugoslavia* — 9 peleadores nacidos antes de 1991) → resuelven por demónimo
- Paréntesis sin cerrar del wikitext (*"Russia)"*, *"Kyrgyzstan)"*)
- Subdivisiones (*"South Australia"* → Australia)
- Ciudades cuando el `birth_place` no trae país (Evloev) → override a mano

La bandera es emoji, no assets: escala sola y renderiza en todas partes. Las naciones del Reino Unido usan secuencias de tags (🏴󠁧󠁢󠁥󠁮󠁧󠁿) en lugar de indicadores regionales.

**Sin resolver:** Daria Zhelezniakova. No tiene página de Wikipedia y `from` está vacío, así que no le invento nacionalidad. Si sabés cuál es, poné `"pais": "XX"` en su entrada.

**Doble nacionalidad:** usa `birth_place` por defecto (Dern → 🇺🇸 por Phoenix, Van → 🇲🇲 por Hakha). Si querés que compita bajo la otra bandera, el override manda.

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

## 4. Decisiones tomadas (25 jul)

1. **Desbloqueo — confirmado como estaba.** Visitar ficha → carta común; acertar pick en la quiniela → carta del peleador que ganó; cartelera estelar perfecta → carta especial del evento. El store de la quiniela ya expone `getCartasDesbloqueadas()` y `desbloquearCarta()`, y la página de quiniela ya llama a `desbloquearCarta()` por cada ganador acertado. La mecánica está a medio camino construida.

2. **Solo rankeados tienen carta.** 195 cartas, no 4.565. Consecuencias buenas: el `arma` faltante deja de ser un agujero de 4.537 y pasa a ser de 167; la rareza "común" desaparece del catálogo (todos los rankeados son rara o mejor); y `getStaticPaths` filtra por `conRanking: true`.

   Efecto secundario a tener en cuenta: cuando un peleador cae del top 15 el lunes, su carta desaparece. Si alguien la tenía desbloqueada, la colección le va a mostrar un hueco. Lo resuelvo guardando en el store el slug **y** la rareza al momento de desbloquear, así la carta sobrevive a la caída del ranking.

3. **`/cartas/{slug}/` va noindex.** La OG image se sirve desde el `<meta property="og:image">` de la ficha del peleador, que ya está indexada — el compartir funciona igual sin exponer 195 páginas de poco texto. Si el producto muestra uso, se revisa.

4. **Doble nacionalidad:** `birth_place` por defecto, override cuando quieras cambiarlo.

---

## 5. Qué construyo cuando tengas las armas

1. ~~**Scraper extendido** — edad + país~~ ✅ hecho
2. **`CartaPeleador.astro`** — 3 variantes de rareza (legendaria/épica/rara; común queda fuera al ser solo rankeados), diferenciadas por marco y badge, mismo layout
3. **Export a PNG** — canvas, misma técnica que ya funciona en el comparador
4. **OG image por peleador** — cuando alguien comparte la ficha, aparece la carta
5. **`/cartas/`** — colección, sobre el store de la quiniela, guardando rareza al desbloquear
6. **Compartir nativo** en móvil

**Restricciones que no se negocian:** sin pagos, sin aleatoriedad, sin loot boxes — es colección por mérito. Y las siluetas son siempre el SVG paramétrico, nunca fotos de peleadores ni frames de transmisión.

Puedo construir 2, 3 y 4 **ya**, con las 28 armas que existen: las cartas sin `arma` simplemente omiten el bloque. Así ves el producto funcionando y escribís sobre algo concreto en vez de a ciegas.

---

## Resumen

Edad y país resueltos. **El único bloqueo es el `arma`: 42 frases** (3 campeones + 39 del top 5) de máximo 40 caracteres cada una.

Y ni siquiera bloquea empezar — puedo montar el renderizador con las 28 que ya existen.
