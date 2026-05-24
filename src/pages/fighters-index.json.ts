// Endpoint estático con índice slim de peleadores para el buscador (lupita en header).
// Solo incluye peleadores que tienen foto o están ranked — coherente con sitemap.
import type { APIRoute } from 'astro';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fighters from '../data/fighters.json';

export const GET: APIRoute = () => {
  const imgDir = join(process.cwd(), 'public', 'fighters');

  const list = (fighters as any[])
    .filter((f) => {
      const ranked = f.rank === 'C' || (!isNaN(Number(f.rank)) && Number(f.rank) <= 15);
      const hasImg = existsSync(join(imgDir, `${f.slug}.png`)) || existsSync(join(imgDir, `${f.slug}.jpg`));
      return ranked || hasImg;
    })
    .map((f) => ({
      slug: f.slug,
      name: f.name,
      nick: f.nick || '',
      div: f.div || '',
      img: f.img || `/fighters/${f.slug}.png`,
      rank: f.rank || '',
    }));

  return new Response(JSON.stringify(list), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
