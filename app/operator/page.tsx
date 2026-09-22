import { OperatorDashboard } from './operator-dashboard';
import { requireChatGPTUser, chatGPTSignOutPath } from '@/app/chatgpt-auth';
import { isOperatorUser } from '@/lib/operator-auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Private operator · Muse Solves Cancer', robots: { index: false, follow: false } };

export default async function OperatorPage() {
  await requireChatGPTUser('/operator');
  if (!(await isOperatorUser())) {
    return <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground"><section className="max-w-md rounded-2xl border bg-card p-8"><h1 className="text-2xl font-semibold">Private operator area</h1><p className="mt-4 text-base text-muted-foreground">This ChatGPT account does not have operator access. Sign in with the site owner's account to continue.</p><div className="mt-6 flex flex-wrap gap-5"><a href={chatGPTSignOutPath('/operator')} target="_top" className="text-primary underline">Switch account</a><a href="/" className="underline">Return to Muse</a></div></section></main>;
  }
  return <OperatorDashboard />;
}
