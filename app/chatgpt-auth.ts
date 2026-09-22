import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export type ChatGPTUser = { userId: string; email: string };

// These headers are supplied by the Sites dispatcher after ChatGPT sign-in.
export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get('oai-authenticated-user-id');
  const email = requestHeaders.get('oai-authenticated-user-email');
  return userId && email ? { userId, email } : null;
}

function safeReturnTo(value: string) {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, 'https://app.local');
    if (url.origin !== 'https://app.local' || ['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback'].includes(url.pathname)) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/'; }
}

export function chatGPTSignInPath(returnTo: string) {
  return `/signin-with-chatgpt?return_to=${encodeURIComponent(safeReturnTo(returnTo))}`;
}

export function chatGPTSignOutPath(returnTo = '/') {
  return `/signout-with-chatgpt?return_to=${encodeURIComponent(safeReturnTo(returnTo))}`;
}

export async function requireChatGPTUser(returnTo: string): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;
  redirect(chatGPTSignInPath(returnTo));
}
