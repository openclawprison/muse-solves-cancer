import { env } from 'cloudflare:workers';

function bearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export async function isOperatorRequest(request: Request) {
  const expected = env.MUSE_OPERATOR_API_KEY;
  const provided = bearerToken(request);
  if (!expected || !provided) return false;
  const [expectedHash, providedHash] = await Promise.all([digest(expected), digest(provided)]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index += 1) difference |= expectedHash[index] ^ providedHash[index];
  return difference === 0;
}
