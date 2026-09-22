import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderPaperPdf } from '../lib/paper-pdf.mjs';
const id = process.argv[2];
if (!/^\d+$/.test(id || '')) throw Error('Supply a published edition ID');
const response = await fetch(`https://musesolvescancer.com/api/papers/${id}`);
if (!response.ok) throw Error(`Edition read failed: ${response.status}`);
const edition = await response.json();
const directory = path.resolve(process.argv[3] || 'output/pdf');
await mkdir(directory, { recursive: true });
for (const variant of ['scientific','layman']) {
  const bytes = await renderPaperPdf(edition, variant);
  const target = path.join(directory, `muse-${id}-${variant}.pdf`);
  await writeFile(target, bytes);
  console.log(JSON.stringify({variant,bytes:bytes.length,path:target}));
}
