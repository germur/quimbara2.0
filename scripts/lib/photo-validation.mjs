import {createHash} from 'node:crypto';
// Visually verified publisher silhouettes, previously mistaken for photographs.
const silhouettes=new Set([
 'dc7394887a4a3feda1282e19b8b8714d28e1943edb26b88234292a8b5a017c8c',
 '39dafbb846876e50a3dc8c4566cb4578c69ab1de00838cb4cf8b571c888ffced',
 'f34feb040e96c95eb33d10acb35e67448ce2d3010c1614bde4ef37be15eed1f7',
]);
export const publisherPlaceholder=bytes=>silhouettes.has(createHash('sha256').update(bytes).digest('hex'));
