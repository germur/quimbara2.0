import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const blog = await getCollection('blog');
  
  // Sort by pubDate descending
  const sortedPosts = blog.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  return rss({
    title: 'Quimbara | La verdad del octágono',
    description: 'Análisis técnico, historias y opinión sin clickbait sobre MMA y UFC.',
    site: context.site || 'https://quimbara.org',
    items: sortedPosts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      // Compute URL using the context.site, or rely on absolute slug mappings
      link: `/blog/${post.id}/`,
    })),
    customData: `<language>es-ES</language>`,
  });
}
