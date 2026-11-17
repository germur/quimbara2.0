import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blogCollection = defineCollection({
  loader: glob({ pattern: "*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string().max(100, "El título debe ser corto y directo para SEO."),
    description: z.string().max(160, "La descripción ideal para el snippet de Google."),
    pubDate: z.date(),
    // Solo para revisiones sustanciales del contenido, no para cada despliegue.
    updateDate: z.date().optional(),
    
    // EL NÚCLEO DE LA ESTRATEGIA: Silos estrictos
    category: z.enum([
      'Laboratorio Técnico', 
      'Guía del Insider', 
      'Punto de Vista'
    ]),
    
    // Nodos transversales para cruzar información
    tags: z.array(z.string()).default([]),
    
    image: z.string().optional(), // Ruta de la imagen destacada
    author: z.string().default('Roger Murillo'),
    
    // Para marcar contenido evergreen que debe rotar en la home
    featured: z.boolean().default(false),

    // Vinculación cruzada con entidades de datos
    fighters: z.array(z.string()).default([]),       // slugs de fighters.json
    relatedEvents: z.array(z.string()).default([]),  // slugs de events-all.json

    // GEO/AEO: puntos clave para motores generativos (Perplexity, SGE…)
    takeaways: z.array(z.string()).default([]),
    searchIntent: z.string().min(10).max(200).optional(),
    directAnswer: z.string().min(30).max(600).optional(),
  }).refine(data => !data.updateDate || data.updateDate >= data.pubDate, {
    message: 'La actualización no puede ser anterior a la publicación.',
    path: ['updateDate'],
  })
});

export const collections = {
  'blog': blogCollection,
};
