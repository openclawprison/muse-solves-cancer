import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { z } from 'zod';
import { contentAddress, validatorMessage } from '@/lib/evidence-graph';
import { assertFreshTimestamp, normaliseWallet } from '@/lib/signatures';

const inputSchema = z.object({
  wallet: z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  claimId: z.string().regex(/^[a-f0-9]{64}$/i),
  consensusHash: z.string().regex(/^[a-f0-9]{64}$/i),
  verdict: z.enum(['supported', 'refuted', 'contested', 'insufficient']),
  signature: z.string().trim().min(80).max(120),
  timestamp: z.number().int(),
});

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    assertFreshTimestamp(input.timestamp);
    const wallet = normaliseWallet(input.wallet);
    const registered = await env.DB.prepare('SELECT 1 FROM agents WHERE wallet = ?').bind(wallet).first();
    if (!registered) throw new Error('Register this validator wallet first.');
    const claim = await env.DB.prepare('SELECT extractor_wallet AS extractorWallet FROM claims WHERE id = ?')
      .bind(input.claimId)
      .first<{ extractorWallet: string }>();
    if (!claim) throw new Error('Claim not found.');
    if (claim.extractorWallet === wallet) throw new Error('Claim extractors cannot validate their own claims.');
    const consensus = await env.DB.prepare(
      `SELECT verdict FROM consensus_snapshots WHERE claim_id = ? AND calculation_hash = ?`,
    ).bind(input.claimId, input.consensusHash.toLowerCase()).first<{ verdict: string }>();
    if (!consensus || consensus.verdict !== input.verdict) throw new Error('Attestation does not match a published consensus snapshot.');
    const message = new TextEncoder().encode(validatorMessage(input.claimId, input.consensusHash.toLowerCase(), input.verdict));
    let signature: Uint8Array;
    let publicKey: Uint8Array;
    try {
      signature = bs58.decode(input.signature);
      publicKey = bs58.decode(wallet);
    } catch {
      throw new Error('Signature or validator wallet is not valid base58.');
    }
    if (!nacl.sign.detached.verify(message, signature, publicKey)) throw new Error('Validator signature is invalid.');
    const id = await contentAddress('MUSE_VALIDATOR_ATTESTATION_V1', { ...input, wallet });
    await env.DB.prepare(
      `INSERT INTO validator_attestations
       (id, claim_id, consensus_hash, validator_wallet, verdict, signature, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(claim_id, validator_wallet, consensus_hash) DO NOTHING`,
    ).bind(id, input.claimId, input.consensusHash.toLowerCase(), wallet, input.verdict, input.signature, input.timestamp).run();
    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS value FROM validator_attestations WHERE claim_id = ? AND consensus_hash = ?',
    ).bind(input.claimId, input.consensusHash.toLowerCase()).first<{ value: number }>();
    return NextResponse.json({ ok: true, attestationId: id, validatorCount: count?.value ?? 0, validatorConsensus: (count?.value ?? 0) >= 2 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Validator attestation failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
