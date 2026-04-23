// scripts/auditor-silos.ts
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { Anthropic } from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

// Cargar variables de entorno (como ANTHROPIC_API_KEY) desde un archivo local .env
dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const contentDir = path.join(process.cwd(), 'src', 'content', 'blog');

async function runAudit() {
  console.log('🔍 [AUDITOR SEO] Iniciando barrido de Silos Semánticos...');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ERROR: No se encontró ANTHROPIC_API_KEY en el .env');
    console.error('💡 Crea un archivo .env en la raíz y pon: ANTHROPIC_API_KEY="sk-ant-..."');
    process.exit(1);
  }

  const files = fs.readdirSync(contentDir).filter(f => f.endsWith('.md') || f.endsWith('.mdx'));
  
  if (files.length < 2) {
    console.log('⚠️ Se necesitan al menos 2 artículos para auditar la estrategia de enlaces cruzados (Interlinking).');
    return;
  }

  console.log(`📦 Se encontraron ${files.length} artículos en la bóveda.`);

  // Construimos el corpus reduciendo el contenido a los primeros 1500 caracteres (aprox 300 palabras) para no quemar tokens innecesarios, manteniendo la riqueza semántica inicial.
  const articlesContext = files.map(filename => {
    const filePath = path.join(contentDir, filename);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const { data, content } = matter(fileContent);
    return `
---
ARCHIVO: ${filename}
TÍTULO: ${data.title}
CATEGORÍA: ${data.category}
ETIQUETAS: ${data.tags?.join(', ') || 'N/A'}
EXTRACTO DE CONTENIDO:
${content.substring(0, 1800)}...
---
`;
  }).join('\n');

  console.log(`🧠 Conectando con la red neuronal de Anthropic (Claude 3.5 Sonnet)...`);

  const systemPrompt = `
Eres el Arquitecto SEO Principal de Quimbara 2.0, una plataforma brutalista de análisis profundo de artes marciales mixtas (MMA).
Tu tarea es auditar los artículos en los "Silos de Contenido" y recomendar enlaces internos (Internal Linking) altamente estratégicos entre ellos.

Reglas:
1. Evalúa la relación jerárquica y semántica entre los artículos. (Por ejemplo, ¿cómo el artículo de negocios de TKO complementa un artículo de técnica de derribos?)
2. No recomiendes enlaces genéricos como "haz clic aquí". Propón el **Anchor Text exacto** que se siente orgánico y periodístico.
3. Presenta los resultados en un reporte limpio, listando los archivos Origen y Destino, el Anchor Text sugerido, y tu justificación SEO.
`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1500,
      temperature: 0.2, // Baja temperatura para generar análisis precisos de data.
      system: systemPrompt,
      messages: [{ role: "user", content: `Analiza el corpus a continuación y genera el reporte de red semántica:\n\n${articlesContext}` }]
    });

    console.log('\n======================================================');
    console.log('🎯 REPORTE DE AUDITORÍA SEMÁNTICA (INTERNAL LINKING)');
    console.log('======================================================\n');
    console.log((response.content[0] as any).text);
    console.log('\n======================================================');
    console.log('💡 Ejecuta las recomendaciones sugeridas directamente en tus MDX.\n');
  } catch (error: any) {
    console.error('❌ Fallo crítico en la IA de Anthropic:', error.message);
  }
}

runAudit();
