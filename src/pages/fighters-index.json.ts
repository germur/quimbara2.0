// Endpoint estático con índice slim de peleadores para el buscador (lupita en header).
// Solo incluye peleadores que tienen foto o están ranked — coherente con sitemap.
import type { APIRoute } from 'astro';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fighters from '../data/fighters.json';
import {isRanked} from '../lib/indexable.mjs';

export const GET: APIRoute = () => {
  const hasPhoto=(f:any)=>typeof f.img==='string'&&f.img.startsWith('/fighters/')&&!f.img.includes('..')&&existsSync(join(process.cwd(),'public',f.img));

  const list = (fighters as any[])
    .filter((f) => {
      return isRanked(f) || hasPhoto(f);
    })
    .map((f) => ({
      slug: f.slug,
      name: f.name,
      nick: f.nick || '',
      div: f.div || '',
      img: hasPhoto(f)?f.img:'',
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
