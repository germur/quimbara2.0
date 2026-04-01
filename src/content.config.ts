import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blogCollection = defineCollection({
  loader: glob({ pattern: "*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string().max(100, "El título debe ser corto y directo para SEO."),
    description: z.string().max(160, "La descripción ideal para el snippet de Google."),
    pubDate: z.date(),
    
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
  })
});

export const collections = {
  'blog': blogCollection,
};
