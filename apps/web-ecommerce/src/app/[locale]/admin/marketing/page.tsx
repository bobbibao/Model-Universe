import type { Metadata } from 'next';
import MarketingWorkspace from '@/core/client/features/marketing/pages/MarketingWorkspace';
export const metadata: Metadata = { title: 'Marketing - Quản trị Model Universe' };
export default function MarketingPage() {
  return <MarketingWorkspace />;
}
