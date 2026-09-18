import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildManifest } from './merkle.mjs';

const [epochId, inputPath, outputPath] = process.argv.slice(2);
if (!epochId || !inputPath || !outputPath) {
  console.error('Usage: node protocol/client/build-epoch-manifest.mjs <epoch-id> <payouts.json> <manifest.json>');
  process.exit(1);
}

const payouts = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
if (!Array.isArray(payouts)) throw new Error('input must be a JSON array of payouts');
const manifest = buildManifest(epochId, payouts);
await writeFile(resolve(outputPath), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ epochId: manifest.epochId, merkleRoot: manifest.merkleRoot, manifestHash: manifest.manifestHash, totalRewardUnits: manifest.totalRewardUnits, leafCount: manifest.payouts.length }, null, 2));
