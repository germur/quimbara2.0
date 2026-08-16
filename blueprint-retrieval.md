# Blueprint: Quimbara y la búsqueda con IA

> Cómo funcionan retrieval, embeddings, RAG, reranking, chunking, entidades y evaluación —
> y qué hacemos con cada uno en Quimbara.
> Agosto 2026 · *actualizado el 15 de agosto con los datos de GSC de tres meses.*

---

## 0-bis. Lo que dijeron los datos del 15 de agosto

Esta sección se añadió después de escribir el plan. Cambia una prioridad y mata una hipótesis.

**Confirmado — los eventos son la mina.** `/eventos/ufc-331-2026-09-19/` es la página con más
clics del sitio: 10 clics, 697 impresiones, **1,43% de CTR en posición 8,6**. Por intención de
búsqueda:

| Intención | Impresiones | Clics | CTR |
|---|---|---|---|
| Biometría | 19.320 | 2 | **0,01%** |
| Eventos y carteleras | 701 | 6 | **0,86%** |
| Blog | 100 | 3 | **3,00%** |

Los eventos convierten **86 veces mejor** que la biometría. Con 27 veces menos impresiones dan
tres veces más clics.

**Refutado — reescribir los titles biométricos no sirvió.** Fue una recomendación de este
documento y los datos dicen que no funcionó:

| Ficha | Julio | Agosto |
|---|---|---|
| Max Holloway | 2.592 imp · 1 clic · 0,04% | 3.119 imp · 1 clic · **0,03%** |
| Justin Gaethje | 2.510 imp · 1 clic · 0,04% | 2.970 imp · 2 clics · 0,07% |

Más impresiones, los mismos clics. Esas queries son **estructuralmente zero-click**: Google
responde "cuánto mide X" en el propio SERP y ningún title lo evita. No era un problema de
redacción. Las fichas biométricas siguen valiendo como activo de entidad y como volumen de
impresiones, pero como fuente de tráfico están agotadas: dejar de invertir ahí.

**Nuevo y grave — Google rastrea las fichas y decide no indexarlas.** 80 fichas de peleador
están en *"Crawled – currently not indexed"*, y no son de relleno:

- `/peleadores/joshua-van/` — **campeón de peso mosca**
- `/peleadores/mike-malott/` — #12 · `/peleadores/jared-cannonier/` — #12 · `/peleadores/david-onama/` — #14

Ese estado significa: *"la he visto, la entiendo, y no me aporta lo suficiente para gastar
índice en ella"*. Es el veredicto de contenido fino, y **sube la densificación de fichas al
primer puesto de prioridades**, por delante de cualquier retoque de metadatos.

**Lo bueno de fondo:** la indexación pasó de 65 páginas (17 de mayo) a **745** (6 de agosto), y
las impresiones de 2.357 en mayo a ~25.000/mes en agosto.

**Dos datos laterales que merecen su propia investigación:** en escritorio la posición media es
**37,3** frente a **10,6** en móvil, con 12.232 impresiones desaprovechadas; y el mercado real
es **España** (16.547 impresiones), no Colombia (1.775).

---

## 0. El resumen, por si no lees el resto

Los datos de GSC de julio decían esto: **31.400 impresiones, 26 clics (0,08% CTR)**. El 70% de
las impresiones son preguntas biométricas — *"cuánto mide Holloway"*, *"estatura de Gaethje"* —
y esas queries las resuelve Google en el propio SERP. El usuario nunca llega.

Ese no es un problema de posiciones. Es que el mercado cambió de sitio: **la respuesta se
consume donde se genera**. Google AI Overviews pasó de cubrir el 34,5% de queries en diciembre
de 2025 a ~48% en marzo de 2026, y alrededor del 93% de las sesiones de AI Mode terminan sin un
solo clic a ninguna web.

Ante eso hay dos partidas distintas, y conviene no confundirlas:

| | Partida A: que te citen | Partida B: tu propio RAG |
|---|---|---|
| **Qué es** | Que ChatGPT/Perplexity/AI Overviews usen Quimbara como fuente | Buscador semántico propio sobre tu contenido |
| **Dónde vive** | En el HTML público | En tu infraestructura |
| **Beneficio** | Marca, autoridad, algo de tráfico | Producto: mejor buscador, comparador, API |
| **Coste** | Horas de código, cero infra | Supabase + API de embeddings (~5-15 €/mes) |
| **Prioridad** | **Alta. Empezar aquí** | Después. Es un feature, no SEO |

La confusión más cara del sector ahora mismo es creer que montar un RAG mejora tu visibilidad
en ChatGPT. **No la mejora.** Tu RAG es tuyo; el de OpenAI es suyo. Lo que sí mueve la aguja en
la partida A es que tu HTML sea trivialmente fácil de trocear, entender y atribuir.

La buena noticia: Quimbara ya hace bastante bien la mitad de esto sin saberlo. `takeaways` en el
frontmatter, FAQs con preguntas como H3, entidades enlazadas en el cuerpo, tablas de datos
físicos. Los huecos son concretos y se cierran en horas, no en meses.

---

## 1. Cómo funciona realmente la búsqueda con IA

Cuando alguien pregunta *"¿por qué perdió Topuria contra Gaethje?"* en ChatGPT, pasa esto:

```
    PREGUNTA
        │
        ▼
 [1] Descomposición  ── la pregunta se parte en sub-consultas
        │                "resultado Topuria Gaethje", "estadísticas pelea", ...
        ▼
 [2] RETRIEVAL       ── se buscan documentos candidatos
        │              (búsqueda por palabras + búsqueda semántica)
        ▼
 [3] CHUNKING        ── cada página se trocea en fragmentos
        │
        ▼
 [4] EMBEDDINGS      ── cada fragmento se convierte en un vector
        │              y se compara con el vector de la pregunta
        ▼
 [5] RERANKING       ── se reordenan los 50 candidatos y se quedan 5
        │
        ▼
 [6] GENERACIÓN      ── el modelo redacta usando SOLO esos fragmentos
        │
        ▼
 [7] CITAS           ── se atribuye cada afirmación a su fragmento
        │
        ▼
    RESPUESTA
```

Ese conjunto (2→6) es lo que se llama **RAG**: *Retrieval-Augmented Generation*. Generación
aumentada por recuperación. El modelo no responde de memoria: primero busca, y luego redacta
con lo que encontró delante.

Vamos concepto por concepto, y en cada uno, qué significa para Quimbara.

---

### 1.1 Retrieval (recuperación)

**Qué es.** La fase de traer documentos candidatos. Hay dos formas y se usan juntas:

- **Léxica** (BM25, la de toda la vida): coincidencia de palabras. Buscas "estatura Holloway",
  encuentra páginas con esas palabras.
- **Semántica / vectorial**: coincidencia de *significado*. "cuánto mide" y "estatura" no
  comparten ni una letra, pero significan lo mismo, y la búsqueda vectorial las une.

Cuando ves "hybrid search" es eso: las dos a la vez, porque cada una falla donde la otra acierta.
La léxica es imbatible con nombres propios y números exactos ("Gaethje", "27-9-0"); la semántica
gana con lenguaje natural y sinónimos.

**Para Quimbara.** Tus 4.570 fichas son un corpus de recuperación cojonudo: cada una responde una
pregunta factual, cerrada y verificable. El problema es que solo ~200 son indexables (`isIndexable`:
rankeado o con foto) y el resto va con `noindex`. Esa decisión fue correcta contra el pSEO de
Google, pero conviene entender su efecto colateral: **una página con `noindex` no entra en el
índice de Google, y por tanto no puede ser citada por AI Overviews**. Los crawlers de OpenAI y
Perplexity sí las leen, pero sin señales de autoridad.

No propongo revertirlo. Propongo densificar las que ya son indexables para que cada una gane
peso, en vez de abrir el grifo de las 4.370 restantes.

---

### 1.2 Chunking (troceado)

**Qué es.** Los modelos no leen tu página entera: la parten en fragmentos de unas 200-500
palabras, normalmente por encabezado o por párrafo. Cada fragmento se indexa por separado y
**compite por separado**.

La consecuencia es la regla de oro de todo esto:

> Un fragmento tiene que entenderse solo, sacado de la página, sin el contexto de alrededor.

Si escribes *"Como vimos antes, su alcance compensa esa desventaja"*, ese chunk aislado no dice
nada: ¿el alcance de quién? ¿qué desventaja? Es un chunk muerto, no lo va a citar nadie.
Si escribes *"Max Holloway tiene un alcance de 175 cm, cinco más que Gaethje"*, ese fragmento
sobrevive solo y es citable.

Los estudios de 2026 apuntan a párrafos de 40-60 palabras autocontenidos, y a que la
optimización puramente estructural sube la tasa de citación en torno a un 17%.

**Para Quimbara.**

Lo que ya haces bien:
- `takeaways` en el frontmatter, renderizados con `KeyTakeaways`. Cinco frases autocontenidas
  con sujeto explícito y cifras. **Esto es, literalmente, chunking servido en bandeja.** Es la
  mejor decisión de contenido que hay en el repo.
- FAQs con la pregunta como H3 y la respuesta debajo. Formato ideal: la pregunta del H3 se
  parece mucho al vector de la pregunta del usuario.
- Los `<h2>` del post de Topuria son descriptivos ("El segundo round que Ilia no supo cerrar"),
  no genéricos ("Análisis").

Lo que falla:
- **Los bloques de estadísticas son `<div>` con números sueltos.** Ese cuadro de "126 / 107 /
  199 / 4:00" es precioso para un humano y opaco para una máquina: al trocearlo queda
  `126 Significativos Topuria 107 Significativos Gaethje`, sin sujeto, sin contexto, sin la
  pelea. Necesita una frase de texto plano al lado, o convertirse en `<table>` con `<caption>`.
- **Pronombres al inicio de sección.** "Su récord actual es de..." → "El récord de Tom Aspinall
  es de...". Cada H2 debería repetir la entidad, aunque suene redundante al leerlo seguido.
  Escribes para dos lectores y el segundo no tiene memoria.

---

### 1.3 Embeddings

**Qué es.** Un embedding convierte un texto en una lista de números (un *vector*, típicamente
de 768 a 3.072 dimensiones) que representa su significado. Textos con significado parecido dan
vectores cercanos en el espacio.

La intuición: imagina un mapa donde cada texto es un punto. "Cuánto mide Holloway" y "estatura
de Max Holloway" caen casi encima. "Cartelera UFC 330" cae lejísimos. Medir la distancia entre
puntos es medir la similitud de significado, y eso lo hace un ordenador en microsegundos sobre
millones de textos.

**Para Quimbara.** Aquí está el matiz importante: **no controlas los embeddings de OpenAI ni de
Google.** Ellos vectorizan tu HTML como les da la gana. Lo que sí controlas es *qué texto* les
das para vectorizar. De ahí que todo lo del punto anterior importe tanto.

Los embeddings los usarás tú en la Partida B (tu propio buscador), no en la A.

---

### 1.4 Búsqueda vectorial

**Qué es.** Buscar los vectores más cercanos a un vector de consulta. Con miles de documentos
es fuerza bruta; con millones se usan índices aproximados (HNSW, IVFFlat) que sacrifican algo
de precisión por velocidad.

**Para Quimbara.** Es el motor de la Partida B. Detalle práctico: con tu volumen
(4.570 fichas + ~40 eventos + 6 posts ≈ 15.000 chunks) **no necesitas nada exótico**. pgvector
sobre Postgres va sobrado. Pinecone, Weaviate y compañía son para tres órdenes de magnitud más.

---

### 1.5 Reranking

**Qué es.** El retrieval trae 50 candidatos rápido y sucio. El reranker los lee con más cuidado
y los reordena, quedándose con los 5 mejores. Es más caro por documento, por eso solo se aplica
a lo ya filtrado.

La razón de que exista: la búsqueda vectorial compara dos vectores calculados por separado, sin
que se "vean". Un reranker (cross-encoder) mira pregunta y documento *juntos*, y capta matices
que la distancia vectorial se pierde.

**Para Quimbara.** En la Partida A no lo controlas. Pero entender que existe explica una cosa
útil: **los rerankers premian la respuesta directa y penalizan el relleno**. Un fragmento que
empieza contestando gana al que da tres párrafos de contexto antes de mojarse. Es un argumento
técnico a favor del estilo que ya tienes ("sin clickbait", "el resultado, sin adornos").

---

### 1.6 Citas

**Qué es.** La atribución de cada afirmación a la fuente de donde salió. El modelo cita el
*chunk*, y la URL del chunk es la de la página. Por eso una página que contesta cinco preguntas
distintas puede ser citada cinco veces, y por eso conviene que cada sección tenga su ancla.

**Para Quimbara.** Dos cosas concretas:
1. **Anclas `id` en cada H2/H3.** Permiten citar `/blog/post/#el-segundo-round` en vez de la
   página entera. Astro no las pone por defecto en MDX.
2. **La fecha visible y en schema.** En un nicho donde el ranking cambia cada semana, un modelo
   prefiere citar lo fechado y reciente. Ya tienes `pubDate`; falta `dateModified` en las
   fichas de peleador, que se actualizan a diario con el pipeline y no lo declaran.

---

### 1.7 Entity retrieval y knowledge graphs

**Qué es.** Un buscador moderno no piensa en palabras sino en **entidades**: cosas del mundo con
identidad propia. "Max Holloway" no es una cadena de texto, es una persona, con atributos
(altura, récord, nacionalidad) y relaciones (peleó contra X, compite en la división Y, pertenece
a UFC). El conjunto de entidades y relaciones es el **grafo de conocimiento**.

Cuando alguien pregunta "¿quién es el campeón de peso ligero?", el sistema no busca esa frase:
resuelve la entidad *división de peso ligero de UFC*, sigue la relación *campeón actual*, y
devuelve la entidad al otro extremo. La cadena que lleva a la citación es:

```
entidad reconocida → grafo de conocimiento → respuesta atribuida a tu marca
```

Si tu marca no está resuelta como entidad, los sistemas no tienen a quién atribuir lo que dices.

**Para Quimbara.** Esta es tu mayor oportunidad, y también tu hueco más grave, por una razón
irónica: **el grafo ya está construido en el frontmatter y no lo estás publicando.**

Mira el post de Topuria:

```yaml
fighters: ["ilia-topuria", "justin-gaethje", "arman-tsarukyan", ...]
relatedEvents: ["ufc-freedom-250"]
```

Eso son aristas de un grafo: *este artículo trata sobre estas 10 entidades y este evento*.
Declaradas explícitamente, a mano, con slugs canónicos. Es exactamente lo que Google pagaría por
saber. Y ahora mismo **no salen en el HTML**: el schema del post no las expone en `about` ni en
`mentions`, y la ficha del peleador, en vez de leer ese campo, hace esto:

```js
const related = allPosts.filter(p => {
  const haystack = `${p.data.title} ${p.data.description}`.toLowerCase();
  return haystack.includes(lastName) || haystack.includes(firstName);
});
```

Busca el apellido dentro del título. Con "Silva" o "Rodriguez" te da falsos positivos; con un
peleador citado en el cuerpo pero no en el título, falso negativo. Y tienes el dato bueno a un
campo de distancia.

El segundo hueco, más simple de arreglar y más caro de tener abierto:

```js
"sameAs": [],   // ← index.astro, línea 59
```

`sameAs` es cómo le dices al grafo "esta entidad soy yo, y estos son mis otros perfiles". Con el
array vacío, Quimbara es una web anónima sin identidad verificable. Tienes X, Instagram y YouTube
en el footer, sin conectar. Es literalmente rellenar un array.

---

### 1.8 Búsqueda semántica

**Qué es.** El paraguas que engloba lo anterior: buscar por significado y no por coincidencia
literal. Incluye la vectorial, la expansión de consultas y la resolución de entidades.

**Para Quimbara.** El caso de uso más claro es interno. Tu buscador actual
(`fighters-index.json`) filtra por substring del nombre: escribes "holoway" mal y no sale nada;
escribes "el campeón hawaiano" y no sale nada. Con búsqueda semántica, ambas cosas funcionan.

---

### 1.9 Evaluación de LLMs

**Qué es.** Medir si el sistema responde bien, con un conjunto fijo de preguntas de prueba y
criterios definidos. Sin esto, "mejorar el SEO para IA" es fe.

Las métricas que importan aquí:
- **Tasa de citación**: de 50 preguntas de tu nicho, ¿en cuántas aparece Quimbara?
- **Cuota de voz**: cuando apareces, ¿con qué competidores compartes cartel?
- **Exactitud atribuida**: cuando te citan, ¿dicen bien lo que dijiste? (Un dato mal copiado es
  peor que no aparecer.)
- **Cobertura de fuente**: ¿qué páginas tuyas se citan? Si siempre es la misma, tienes un
  problema de distribución.

**Para Quimbara.** Esto es lo primero que hay que montar, antes de tocar nada, para tener línea
base. Se hace a mano con 50 preguntas y una hoja de cálculo, o con herramientas de pago
(Otterly, Profound, Semrush One). Yo empezaría a mano: 50 preguntas, una vez al mes, media hora.

---

## 2. Diagnóstico de Quimbara

### Lo que ya está bien (y no hay que tocar)

| Elemento | Por qué importa |
|---|---|
| `takeaways` + `KeyTakeaways` | Chunks autocontenidos servidos en bandeja |
| FAQs con pregunta en H3 | Formato de máxima extracción |
| Schema `Person` en fichas con `QuantitativeValue` métrico | Atributos de entidad legibles |
| `FAQPage` auto-generada en fichas | Cobertura de las queries biométricas |
| H2 descriptivos y específicos | Cada sección es un chunk con tema propio |
| Silos de categoría estrictos (enum en el schema) | Estructura temática coherente |
| Datos actualizados a diario por pipeline | Frescura, que los modelos premian |
| `robots.txt` permitiendo GPTBot/Claude/Perplexity | Sin esto, nada de lo demás importa |

### Los huecos, por gravedad

| # | Hueco | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | `sameAs: []` vacío — sin identidad de entidad | Alto | 10 min |
| 2 | El grafo del frontmatter (`fighters`, `relatedEvents`) no se publica en schema | Alto | 2 h |
| 3 | La ficha busca artículos por substring del apellido en vez de por el campo `fighters` | Alto | 30 min |
| 4 | Autor sin entidad propia (`Person` sin `sameAs` ni página) | Medio-alto | 1 h |
| 5 | Sin `dateModified` en fichas que cambian a diario | Medio | 20 min |
| 6 | Bloques de estadísticas en `<div>` sin texto equivalente | Medio | 1 h |
| 7 | Sin anclas `id` en los encabezados | Medio | 30 min |
| 8 | `llms.txt` desactualizado: apunta a `/peleador` (ruta muerta) y dice "cada lunes" (es diario) | Bajo-medio | 15 min |
| 9 | Sin página "Sobre" que ancle la entidad (*entity home*) | Medio | 2 h |
| 10 | Sin sistema de evaluación: no sabemos si algo de esto funciona | Alto | 2 h |

Sobre el 8, un aviso para que no le dediques más tiempo del que merece: **`llms.txt` no lo lee
casi nadie**. Los datos de 2026 dicen que la adopción es del 8,7% del top 1.000, que GPTBot,
ClaudeBot y PerplexityBot lo ignoran y van directos al HTML, y que Google confirmó que no lo
soporta ni piensa hacerlo. De diez sitios estudiados, ocho no vieron cambio alguno. Lo
arreglamos porque tenerlo mal apuntando a una ruta muerta es peor que no tenerlo, pero no es
palanca de crecimiento. Donde sí sirve es como mapa para agentes de código.

---

## 3. Plan de acción

### Fase 0 — Línea base (antes de tocar nada)

Sin medición no hay plan, hay opiniones.

1. **Redactar 50 preguntas de prueba** que un fan hispanohablante haría de verdad. Mezcla de:
   - Biométricas: *¿cuánto mide Max Holloway?*
   - Factuales: *¿quién es el campeón de peso ligero de UFC?*
   - De evento: *¿cuándo es UFC 330 y quién pelea?*
   - Analíticas: *¿por qué perdió Topuria contra Gaethje?*
   - Comparativas: *¿quién tiene más alcance, Chimaev o Strickland?*
2. **Pasarlas por ChatGPT, Perplexity, Gemini y Google AI Mode.** Anotar en una hoja: ¿aparece
   Quimbara? ¿qué URL? ¿qué competidores salen?
3. Guardar el resultado con fecha. Esa es la línea base contra la que se mide todo.

**Entregable:** hoja de cálculo. **Tiempo:** 2 h.

### Fase 1 — Capa de entidades (la semana 1)

Lo que más mueve por lo poco que cuesta.

1. Rellenar `sameAs` en `Organization` con X, Instagram y YouTube.
2. Publicar el grafo del frontmatter: `about` (entidades principales) y `mentions` (secundarias)
   en el schema del post, apuntando a las URLs canónicas de las fichas.
3. Arreglar el emparejamiento post↔peleador para que use el campo `fighters` en vez del
   substring del apellido.
4. Enlaces bidireccionales reales: si el post declara a Gaethje, la ficha de Gaethje enlaza ese
   post. Grafo navegable en ambos sentidos.
5. `dateModified` en las fichas, tomado del pipeline de datos.
6. Autor como entidad: `Person` con `@id` estable, `sameAs` a tus perfiles y `knowsAbout`.

**Entregable:** código. **Tiempo:** ~4 h.

### Fase 2 — Extractabilidad (semana 2)

1. Anclas `id` automáticas en todos los H2/H3 (plugin `rehype-slug`).
2. Texto equivalente para los bloques de estadísticas: una frase que diga
   *"Topuria conectó 126 golpes significativos frente a los 107 de Gaethje"*.
3. Barrido de pronombres al inicio de sección: sustituir por el nombre de la entidad.
4. Actualizar `llms.txt` (rutas reales, cadencia real, secciones que existen).
5. Página "Sobre Quimbara" como *entity home*: quién escribe, con qué criterio, desde cuándo,
   metodología de los datos. Es la página que un modelo lee para decidir si eres una fuente
   fiable.

**Entregable:** código + una página nueva. **Tiempo:** ~5 h.

### Fase 2-bis — Rescatar las 80 fichas que Google rechazó (PRIORIDAD 1)

*Añadida el 15 de agosto. Adelanta a todo lo demás.*

Google rastreó 80 fichas indexables — campeón de peso mosca incluido — y decidió no indexarlas.
Es contenido fino, y el arreglo no es de metadatos sino de sustancia. Por ficha hacen falta unos
cuantos cientos de palabras que no estén en Wikipedia:

1. **Contexto de la última pelea**: contra quién, cómo terminó, qué significó.
2. **Qué hace distinto a este peleador**: dos o tres frases de estilo real, no genéricas.
3. **Próxima pelea o situación en la división**: por qué importa ahora.
4. **Enlace al análisis** si existe — y si no existe, es candidato a escribirlo.

Empezar por los ~30 rankeados y campeones. Medir a las tres semanas si salen de
*Crawled – currently not indexed*. Si con eso no se indexan, el problema es de autoridad de
dominio y hay que cambiar de palanca.

### Fase 3 — Contenido que ataca lo que sí da clic (mes 1-2)

Del análisis de GSC: las biométricas dan impresiones pero no clics. Lo que convierte son
eventos ("ufc 16/05/2026", 14% CTR) y análisis (post de Topuria, 4,4%). El movimiento
estratégico es usar las biométricas como puerta de entrada y el análisis como destino.

1. **Páginas de comparación** (`/comparar/[par]` ya existe): *"Chimaev vs Strickland: alcance,
   estatura y estilo"*. Atacan la comparativa, que es intención de clic, y son chunks perfectos.
2. **Página de evento publicada 2-3 semanas antes**, con cartelera, horarios por país
   (Colombia, México, España, Argentina — tus cuatro mercados) y dónde ver. *"¿A qué hora es
   UFC 330 en Colombia?"* es una pregunta con clic.
3. **Un análisis técnico por evento grande.** Es lo que te diferencia y lo único que una IA no
   puede sacar de la ficha de Wikipedia.

### Fase 4 — El RAG propio (mes 2-3)

Ver sección 4. Es producto, no SEO. No empezar antes de cerrar las fases 1 y 2.

---

## 4. El RAG propio: arquitectura y coste

**Qué se construye:** un índice semántico de todo el contenido de Quimbara, consultable.

**Para qué sirve de verdad** (siendo honestos, porque aquí es donde se gasta dinero en humo):

| Caso de uso | ¿Merece la pena? |
|---|---|
| Buscador interno que entienda "el campeón hawaiano" | Sí. Mejora real de producto |
| "Preguntas sobre esta pelea" en la ficha de evento | Sí. Retiene al usuario biométrico que hoy rebota |
| Comparador conversacional | Sí, y es diferencial en español |
| API pública para agentes | Interesante, apuesta a futuro |
| **Mejorar tu ranking en ChatGPT** | **No. Cero. No funciona así** |

### 4.1 La arquitectura, después de medir

El plan original decía Supabase + pgvector. **Al medir el corpus real, esa decisión resultó
sobredimensionada** y se cambió. Los números:

```
1.651 chunks × 384 dimensiones
  · en float32 ............ 2,42 MB
  · en int8 (cuantizado) ... 0,60 MB   ← el índice entero
  · texto de los chunks .... 0,71 MB
```

El índice completo pesa menos que una foto de peleador. pgvector empieza a compensar a partir de
~100.000 vectores; estamos dos órdenes de magnitud por debajo. Montar una base de datos para
600 KB es alquilar un camión para traer la compra.

**Arquitectura final — índice estático, cero infraestructura:**

```
  Contenido (fichas, eventos, posts)
        │
        ▼
  scripts/rag-chunk.mjs   ── trocea por estructura, no por longitud
        │                    (+ audita chunks sin sujeto)
        ▼
  scripts/rag-embed.mjs   ── vectoriza en local con transformers.js
        │                    y cuantiza a int8
        ▼
  public/buscador/        ── índice JSON estático servido por Netlify
   indice.json
        │
        ▼
  src/lib/busqueda.mjs    ── BM25 + coseno → fusión RRF
        │                    (corre en el navegador)
        ▼
  UI del sitio            ── resultados enlazados a su página
```

**Decisiones y por qué:**

- **Sin base de datos.** El índice es un archivo estático más. Se despliega con el sitio, se
  cachea en el CDN y no hay nada que mantener, monitorizar ni pagar.
- **Embeddings en local con transformers.js**, no API. Sin clave, sin coste por token, sin
  enviar el contenido a terceros, y reproducible en el CI. El modelo
  (`paraphrase-multilingual-MiniLM-L12-v2`) entiende español, que es el requisito no negociable:
  los modelos solo-inglés fallan justo en "cuánto mide" ≈ "estatura".
- **Cuantización int8.** De 4 bytes por dimensión a 1, dividiendo el peso entre cuatro con
  pérdida despreciable para ordenar resultados.
- **Búsqueda híbrida con RRF.** Los scores de BM25 (0 a ~30, sin techo) y los de coseno (−1 a 1)
  no son comparables; normalizarlos a mano es frágil. RRF fusiona por *posición* en cada ranking,
  ignorando la escala.
- **Degradación elegante.** Sin vectores el buscador funciona igual, solo en modo léxico. Se
  puede desplegar hoy y añadir la capa semántica después.

**Coste mensual: 0 €.** No hay servidor, no hay base de datos, no hay API. Si algún día el corpus
crece un orden de magnitud, se migra a pgvector sin tocar el resto: el pipeline solo espera un
array de números por chunk.

### 4.2 Lo que ya está construido y medido

| Pieza | Estado |
|---|---|
| `scripts/rag-chunk.mjs` | ✅ 1.651 chunks, 40 palabras de media |
| `scripts/rag-embed.mjs` | ✅ escrito — pendiente de ejecutar en tu máquina |
| `src/lib/busqueda.mjs` | ✅ BM25 + sinónimos + coseno + RRF |
| `evaluacion/preguntas.json` | ✅ 50 preguntas, 44 con respuesta esperada |
| `scripts/rag-eval.mjs` | ✅ mide Acierto@1, Acierto@3 y MRR |
| Interfaz de búsqueda en el sitio | ⬜ pendiente |

**Resultado final, con vectores ya generados y peso ajustado:**

```
Acierto@1   37/44   84%
Acierto@3   38/44   86%
MRR         0.856

biometrica  ████████████████████ 100%   evento   ████████████████████ 100%
record      ████████████████████ 100%   entidad  ████████████████████ 100%
analisis    ██████████████████··  89%   compar.  ██████████··········  50%
semantica   ████················  20%   ← los vectores NO lo arreglaron
```

**Lo que pasó al añadir los vectores, contado tal cual.** La expectativa era que la capa
semántica subiera el bloque `semantica` del 20% a >60%. **No ocurrió: se quedó en 20%.** Y con
la fusión a peso 1:1, el sistema entero *empeoró* respecto a usar solo BM25 — de 0,817 a 0,760
de MRR.

El barrido de pesos (`npm run rag:tune`) explica por qué:

| léxico:semántico | Acierto@1 | MRR | vs. solo léxico |
|---|---|---|---|
| solo léxico | 34/44 | 0,8169 | — |
| 1:1 | 31/44 | 0,7599 | **−5,7%** |
| 3:1 | 32/44 | 0,7911 | −2,6% |
| 8:1 | 36/44 | 0,8404 | +2,3% |
| **12:1** | **37/44** | **0,8555** | **+3,9%** ← óptimo |
| 20:1 | 36/44 | 0,8442 | +2,7% |
| 50:1 | 34/44 | 0,8172 | = (converge a léxico) |

La conclusión honesta: **en este corpus los embeddings no sirven para recuperar, solo para
desempatar.** Con 12:1 aportan un +3,9% de MRR y 3 aciertos más en primera posición, pero el
Acierto@3 no se mueve (38/44 con y sin vectores): no encuentran nada nuevo, solo ordenan mejor
lo que BM25 ya había encontrado.

La causa es la misma de la sección anterior: si todos los chunks de ficha son casi el mismo
vector, la similitud semántica no discrimina y se convierte en ruido. Por eso a peso 1:1 hace
daño y hay que ahogarla a 12:1 para que solo actúe en los empates.

Y las cinco preguntas semánticas siguen fallando por una razón que ningún modelo puede
arreglar: **"el campeón hawaiano" no está en los datos**. Las fichas guardan `from: "USA"`;
Hawái no aparece en ningún sitio. Igual que "georgiano" (el dato dice "Georgia") o "brasileña
de jiu-jitsu" (no hay campo de disciplina). Los embeddings recuperan significado, no
información inexistente.

**Qué hacer con esto:**
1. Dejar el peso en 12:1 — está fijado en `PESOS_POR_DEFECTO` y da la mejor cifra medida.
2. **Enriquecer los datos de origen**: ciudad y estado natal, disciplina base, apodos. Eso
   arregla las semánticas mejor que cualquier modelo.
3. Densificar las fichas (Fase 2-bis) y **volver a ejecutar `npm run rag:tune`**: cuando los
   chunks dejen de parecerse, el peso óptimo debería bajar y la semántica empezar a aportar.
4. No dar por hecho que más IA es mejor. Aquí la medición dijo lo contrario, y por eso existe
   la medición.

### 4.2-bis El hallazgo de los vectores: las fichas son intercambiables

Con los embeddings ya generados, se miraron los vecinos más cercanos de cada chunk. El resultado
para la ficha de Max Holloway:

```
▸ Max Holloway — datos físicos
   0.823  Aljamain Sterling — datos físicos
   0.776  Charles Oliveira — datos físicos
   0.765  Lucas Almeida — datos físicos
```

Lo más parecido a la ficha de Holloway no es nada sobre Holloway: son las fichas de otros tres
peleadores cualesquiera. El modelo está capturando **la plantilla** ("X mide N cm, su alcance es
M, compite en la división D") y no al peleador. Todos los chunks biométricos son casi el mismo
vector, y el único elemento que los distingue —el nombre propio— apenas pesa en el promedio.

Esto explica el 20% en preguntas semánticas, y conecta con el hallazgo de GSC de una forma que
merece subrayarse:

> **Google dice "Crawled – currently not indexed" en 80 fichas.
> Los vectores dicen que esas fichas están a 0,82 de distancia unas de otras.
> Son dos formas de medir exactamente el mismo problema.**

Cuando el 100% del contenido de una página sale de rellenar una plantilla con datos de una tabla,
esa página no aporta nada que no aporten las otras 4.569, y tanto el índice de Google como un
espacio vectorial llegan a la misma conclusión por caminos distintos.

La consecuencia para el plan: **la Fase 2-bis (densificar fichas) no es solo SEO, también es lo
que hará funcionar la búsqueda semántica.** Lo que rompe el empate es texto propio y distintivo
por peleador — contexto de la última pelea, estilo real, por qué importa ahora. Sin eso, ningún
modelo de embeddings podrá separarlas, porque la diferencia no está en el texto.

También es la razón de que la búsqueda sea híbrida: mientras las fichas se parezcan tanto, es
BM25 quien salva el día, porque para él "Holloway" es un token raro y decisivo.

### 4.3 Cómo ejecutarlo

```bash
npm i -D @huggingface/transformers   # una vez

npm run rag:chunk -- --write         # trocea el contenido
npm run rag:embed -- --publicar      # vectoriza (1ª vez descarga ~120 MB)
npm run rag:eval                     # mide contra las 50 preguntas
npm run rag:tune                     # busca el mejor peso de la fusión
npm run rag:audit                    # lista chunks sin sujeto claro
```

El objetivo al añadir vectores es subir el bloque `semantica` del 20% a >60% **sin que baje
ninguno de los que ya están al 100%**. Si algo factual empeora, hay que bajar el peso de la
parte semántica en la fusión (`pesos: [1, 1]` en `buscar()`).

---

## 5. Cómo mediremos que funciona

**Mensual, media hora:**
1. Pasar las 50 preguntas de la Fase 0.
2. Anotar: tasa de aparición, URLs citadas, competidores, errores de atribución.
3. Comparar con el mes anterior.

**Objetivos a 90 días** (desde una línea base que asumo cercana a cero):
- Tasa de citación en preguntas de MMA en español: **>20%**
- Al menos **5 URLs distintas** citadas (distribución, no una sola página estrella)
- CTR en GSC: de 0,08% a **>0,5%** (el efecto de los titles nuevos ya debería notarse)
- Cero errores de atribución de datos

**La señal de alarma:** si te citan mal — récord equivocado, altura mal — es problema de datos,
no de SEO, y hay que arreglarlo antes que nada. Un sitio de datos que da datos malos pierde la
condición de fuente y no la recupera fácil.

---

## 6. Lo que NO vamos a hacer

Hay mucho humo en este tema. Para ahorrar tiempo y dinero:

- **Rellenar el sitio de `llms.txt`, `ai.txt` y variantes.** Los datos dicen que los crawlers no
  los piden. Lo mantenemos correcto, no lo convertimos en estrategia.
- **Contenido generado en masa para "cubrir más queries".** Con 4.570 fichas, el riesgo de
  Quimbara es el contenido fino, no la falta de páginas. Los modelos premian densidad de datos
  únicos, no volumen.
- **Pagar herramientas de monitorización de IA desde el día uno.** 50 preguntas a mano dan el
  90% de la señal por 0 €. Cuando el volumen justifique automatizarlo, se automatiza.
- **Montar el RAG esperando que mejore la visibilidad en ChatGPT.** Es un producto. Se justifica
  como producto o no se hace.
- **Perseguir keywords biométricas con más páginas.** Ya tienes 12.000 impresiones ahí y 2
  clics. El techo de esa intención es bajo por naturaleza; sirve para entidad, no para tráfico.

---

## 7. Orden de ejecución recomendado

```
Semana 1   Fase 0 (línea base)  ──►  Fase 1 (entidades)
Semana 2   Fase 2 (extractabilidad)
Semana 3   Primera medición post-cambios + Fase 3 arranca
Mes 2      Fase 3 en marcha (eventos y comparaciones)
Mes 3      Segunda medición  ──►  decidir si el RAG se justifica
```

La decisión del mes 3 es real: si las fases 1-3 no mueven la aguja, el RAG tampoco lo hará, y el
problema está en otro sitio (autoridad de dominio, volumen de contenido, competencia).

---

## Fuentes

- [How LLMs Search for Citations: What They Find (2026 Data)](https://www.getpassionfruit.com/blog/how-llms-search-for-citations-what-they-look-for-and-what-they-actually-find)
- [Extractable Content: How to Structure Pages AI Engines Cite](https://authoritytech.io/blog/extractable-content-structure-ai-citations-2026)
- [How to Structure Content for AI Retrieval (Chunks, Citations & Context)](https://seattleorganicseo.com/how-to-structure-content-for-ai-retrieval-chunks-citations-context/)
- [Entity SEO & Knowledge Graph Optimization Guide 2026](https://www.digitalapplied.com/blog/entity-seo-knowledge-graph-optimization-guide-2026)
- [Structured Data AI Search: Schema Markup Guide (2026)](https://www.stackmatix.com/blog/structured-data-ai-search)
- [Does llms.txt matter? We tracked 10 sites to find out](https://searchengineland.com/does-llms-txt-matter-467740)
- [LLMS.txt Adoption: 8.7% of the Top 1,000 (June 2026)](https://www.rankability.com/data/llms-txt-adoption/)
- [AI Visibility Tools 2026: Track Your Brand Across LLMs](https://www.digitalapplied.com/blog/ai-visibility-tools-2026-track-brand-chatgpt-perplexity-gemini)
