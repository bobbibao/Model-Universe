'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import Modal from '@/components/Modal/Modal';
import AdminIcon from './AdminIcon';
import { adminDestination } from './navigation';

const Copilot = dynamic(() => import('@/core/client/features/agent-console/pages/Copilot'));

export default function AdminAssistant() {
  const t = useTranslations('adminWorkspace'),
    navigation = useTranslations('adminNavigation');
  const pathname = usePathname(),
    destination = adminDestination(pathname);
  const { user } = useCurrentUser();
  const launcher = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [loaded, setLoaded] = useState(false);
  if (user?.role !== 'ADMIN' || pathname === '/admin/agent/copilot') return null;
  const pageLabel = destination ? navigation(destination.label) : t('workspace');
  const recordId = pathname.match(/^\/admin\/(?:products|orders)\/(\d+)$/)?.[1];
  const context = recordId ? `${pageLabel} #${recordId}` : pageLabel;
  return (
    <>
      <button
        ref={launcher}
        type="button"
        className="admin-assistant-launcher"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        aria-label={t('openAssistant')}
        aria-haspopup="dialog"
      >
        <AdminIcon name="spark" />
        <span>{t('askCopilot')}</span>
      </button>
      <Modal
        open={open}
        keepMounted={loaded}
        returnFocusRef={launcher}
        onClose={() => setOpen(false)}
        title={t('assistantTitle')}
        size="lg"
      >
        <div className="admin-assistant-context">
          <AdminIcon name="box" size={16} />
          <span>{t('workingIn', { page: context })}</span>
        </div>
        {loaded && <Copilot embedded context={context} />}
      </Modal>
    </>
  );
}
