/** @param {{userId: string, email: string} | null} user @param {string | undefined} ownerEmail */
export function isOwnerIdentity(user, ownerEmail) {
  if (!user?.userId?.trim() || !user.email?.trim() || !ownerEmail?.trim()) return false;
  return user.email.trim().toLowerCase() === ownerEmail.trim().toLowerCase();
}

/** @param {Request} request */
export function isSameOriginOperatorAction(request) {
  if (request.headers.get('x-muse-operator') !== '1') return false;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  return Boolean(origin && origin === new URL(request.url).origin);
}

/** @param {Request} request @param {string | undefined} expected */
export async function isKeeperCredential(request, expected) {
  // Machine access cannot restart rounds, read the console, or draft manuscripts.
  const scope = `${request.method} ${new URL(request.url).pathname}`;
  if (!['GET /api/keeper/status', 'POST /api/operator/epoch', 'POST /api/operator/settlement'].includes(scope)) return false;
  if (!expected || expected.length < 32) return false;
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return false;
  const provided = header.slice(7);
  if (!provided || provided.length > 512) return false;
  const hash = async (value) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([hash(expected), hash(provided)]);
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
  return different === 0;
}
