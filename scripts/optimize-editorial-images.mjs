import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = resolve(root, 'public');
const outputDir = resolve(publicDir, 'images/editorial');
const contentDir = resolve(root, 'src/content/blog');
const widths = [480, 800, 1200, 1600, 1920];
const quality = 82;
const sources = new Set();

for (const file of (await readdir(contentDir)).sort()) {
  if (!/\.mdx?$/.test(file)) continue;
  const { data } = matter(await readFile(resolve(contentDir, file), 'utf8'));
  if (typeof data.image === 'string' && data.image.startsWith('/images/')) {
    sources.add(data.image);
  }
}

await mkdir(outputDir, { recursive: true });
const manifest = {};
for (const source of [...sources].sort()) {
  if (!/\.(png|jpe?g|webp)$/i.test(extname(source))) continue;
  const inputPath = resolve(publicDir, `.${source}`);
  if (!inputPath.startsWith(publicDir + sep)) throw new Error(`Invalid image path: ${source}`);
  const input = await readFile(inputPath);
  const metadata = await sharp(input).rotate().metadata();
  const rotated = [5, 6, 7, 8].includes(metadata.orientation);
  const originalWidth = rotated ? metadata.height : metadata.width;
  if (!originalWidth) throw new Error(`Missing image dimensions: ${source}`);
  const sizes = [...new Set([...widths.filter(w => w < originalWidth), Math.min(originalWidth, 1920)])].sort((a, b) => a - b);
  const hash = createHash('sha256').update(input).update(`webp:${quality}`).digest('hex').slice(0, 16);
  const variants = [];
  for (const width of sizes) {
    const name = `${hash}-${width}.webp`;
    const { data, info } = await sharp(input).rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality }).toBuffer({ resolveWithObject: true });
    await writeFile(resolve(outputDir, name), data);
    variants.push({ src: `/images/editorial/${name}`, width: info.width, height: info.height, bytes: info.size });
  }
  const fallback = variants.find(v => v.width >= 1200) ?? variants.at(-1);
  manifest[source] = {
    src: fallback.src,
    width: fallback.width,
    height: fallback.height,
    srcset: variants.map(v => `${v.src} ${v.width}w`).join(', '),
    originalBytes: input.length,
    variants,
  };
  console.log(`${source}: ${input.length} → ${fallback.bytes} bytes (${fallback.width}px WebP)`);
}

const manifestPath = resolve(root, 'src/data/editorial-images.generated.json');
await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
