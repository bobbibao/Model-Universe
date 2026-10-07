import type { Metadata } from 'next';
import MarketingWorkspace from '@/core/client/features/marketing/pages/MarketingWorkspace';
export const metadata: Metadata = { title: 'Marketing - Quản trị Clothing Shop' };
export default function MarketingPage() {
  return <MarketingWorkspace />;
}
