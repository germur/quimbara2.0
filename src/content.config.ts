import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blogCollection = defineCollection({
  loader: glob({ pattern: "*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    titulo: z.string(),
    descripcion: z.string(),
    autor: z.string().default('Ger Mur'),
    fechaPublicacion: z.date(),
    fechaActualizacion: z.date().optional(),
    imagenPortada: z.string().optional(),
    categoria: z.enum(['analisis', 'historias', 'opinion']),
    etiquetas: z.array(z.string()).default([]),
    estado: z.enum(['draft', 'published', 'updated']).default('published'),
    noIndex: z.boolean().default(false),
    relacionados: z.array(z.string()).optional(),
  })
});

export const collections = {
  'blog': blogCollection,
};
