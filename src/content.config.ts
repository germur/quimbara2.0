import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blogCollection = defineCollection({
  loader: glob({ pattern: "*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    pubDate: z.date(),
    category: z.enum(['Análisis', 'Historias', 'Opinión']),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    author: z.string().default('Roger Murillo'),
  })
});

export const collections = {
  'blog': blogCollection,
};
