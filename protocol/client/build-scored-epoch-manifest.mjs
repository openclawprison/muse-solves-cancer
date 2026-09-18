import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { allocateEntireBalance } from './allocation.mjs';
import { buildManifest } from './merkle.mjs';

const [epochId, balanceRewardUnits, scoresPath, outputPath] = process.argv.slice(2);
if (!epochId || !balanceRewardUnits || !scoresPath || !outputPath) {
  console.error('Usage: node protocol/client/build-scored-epoch-manifest.mjs <epoch-id> <vault-balance-units> <scores.json> <manifest.json>');
  process.exit(1);
}

const scoredAgents = JSON.parse(await readFile(resolve(scoresPath), 'utf8'));
const payouts = allocateEntireBalance(balanceRewardUnits, scoredAgents);
const manifest = buildManifest(epochId, payouts);
if (manifest.totalRewardUnits !== BigInt(balanceRewardUnits).toString()) {
  throw new Error('manifest does not allocate the complete vault balance');
}
await writeFile(resolve(outputPath), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({
  epochId: manifest.epochId,
  merkleRoot: manifest.merkleRoot,
  manifestHash: manifest.manifestHash,
  totalRewardUnits: manifest.totalRewardUnits,
  leafCount: manifest.payouts.length,
}, null, 2));
