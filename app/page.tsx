import { SimpleMuseApp } from './simple-muse-app';
import { latestDailyResearchArticle } from '@/lib/daily-article';

export const dynamic = 'force-dynamic';
export default async function Home() {
  let article = null;
  try { article = await latestDailyResearchArticle(); } catch { /* Keep the homepage available during a transient D1 issue. */ }
  return <SimpleMuseApp initialDailyArticle={article} />;
}
