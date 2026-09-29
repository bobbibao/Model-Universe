import { Metadata } from 'next';
import DefaultLayout from '@/components/Layouts/DefaultLayout';
import CaseLibrary from '@/core/client/features/ci-console/pages/CaseLibrary';

export const metadata: Metadata = {
  title: 'Thư viện tình huống - Quản trị Clothing Shop',
};

const CaseLibraryPage = () => {
  return (
    <DefaultLayout>
      <CaseLibrary />
    </DefaultLayout>
  );
};

export default CaseLibraryPage;
