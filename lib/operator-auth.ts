import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { isOwnerIdentity, isSameOriginOperatorAction, isKeeperCredential } from './operator-access.mjs';

export async function isOperatorUser() {
  return isOwnerIdentity(await getChatGPTUser(), env.MUSE_OPERATOR_EMAIL);
}

export async function isOperatorRequest(request: Request) {
  if (!isSameOriginOperatorAction(request)) return false;
  return isOperatorUser();
}

export async function isKeeperRequest(request: Request) {
  return isKeeperCredential(request, env.MUSE_KEEPER_API_KEY);
}
