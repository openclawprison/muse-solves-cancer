import { readFileSync, statSync } from 'node:fs';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

export function loadSigner({keyFile, secretKey, treasury}) {
  if (Boolean(keyFile) === Boolean(secretKey)) throw new Error('Configure exactly one signer source');
  let bytes;
  try {
    let encoded = secretKey;
    if (keyFile) {
      if (process.platform !== 'win32' && (statSync(keyFile).mode & 0o077)) throw new Error('permissions');
      encoded = readFileSync(keyFile,'utf8');
    }
    const value = encoded.trim();
    if (value.length > 2048) throw new Error('length');
    if (value.startsWith('[')) {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed) || parsed.length !== 64 || parsed.some(b => !Number.isInteger(b) || b < 0 || b > 255)) throw new Error('format');
      bytes = Uint8Array.from(parsed);
    } else {
      bytes = bs58.decode(value);
      if (bytes.length !== 64) throw new Error('length');
    }
    const signer = Keypair.fromSecretKey(Uint8Array.from(bytes));
    if (!signer.publicKey.equals(new PublicKey(treasury))) throw new Error('mismatch');
    return signer;
  } catch {
    // Never surface parser, filesystem or decoder errors containing secret input.
    throw new Error('Signer validation failed: check format, file permissions and treasury address');
  } finally { bytes?.fill(0); }
}
