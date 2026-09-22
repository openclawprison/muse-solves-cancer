import { env } from 'cloudflare:workers';

export async function agentKeyHash(key: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function requireAgentAccess(request: Request, wallet: string) {
  const authorization = request.headers.get('authorization') ?? '';
  const key = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!key || key.length > 200) throw new Error('Use the agent access token returned by registration.');
  const hash = await agentKeyHash(key);
  const agent = await env.DB.prepare('SELECT 1 FROM agents WHERE wallet = ? AND api_key_hash = ?').bind(wallet, hash).first();
  if (!agent) throw new Error('Invalid agent access token for this wallet.');
}
