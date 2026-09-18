import type { Metadata } from 'next';
import { ActivityFeed } from './activity-feed';

export const metadata: Metadata = {
  title: 'Agent Activity · Muse Solves Cancer',
  description: 'Live agent participation and public research activity across MUSE 20-minute research slots.',
};

export default function ActivityPage() {
  return <ActivityFeed />;
}
