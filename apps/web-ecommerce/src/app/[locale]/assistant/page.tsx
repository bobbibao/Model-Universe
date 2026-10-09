'use client';

import Link from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import StoreLayout from '@/components/Layouts/StoreLayout';
import AssistantConversation from '@/components/CustomerAssistant/AssistantConversation';
import { useCustomerAssistant } from '@/shared/client/providers/CustomerAssistantProvider';

export default function AssistantPage() {
  const t = useTranslations('assistant');
  const { epoch, setPrompt, setResearch } = useCustomerAssistant();
  return (
    <StoreLayout>
      <div className="agent-workspace customer-agent">
        <aside className="agent-workspace-intro">
          <span className="agent-eyebrow">{t('workspaceEyebrow')}</span>
          <h1>{t('workspaceTitle')}</h1>
          <p>{t('workspaceDescription')}</p>
          <div className="agent-workspace-features">
            <div>
              <span>01</span>
              <strong>{t('featureFind')}</strong>
              <p>{t('featureFindNote')}</p>
            </div>
            <div>
              <span>02</span>
              <strong>{t('featureCompare')}</strong>
              <p>{t('featureCompareNote')}</p>
            </div>
            <div>
              <span>03</span>
              <strong>{t('featureAct')}</strong>
              <p>{t('featureActNote')}</p>
            </div>
          </div>
          <button
            className="agent-primary"
            onClick={() => {
              setResearch(true);
              setPrompt(t('researchPrompt'));
            }}
          >
            {t('beginResearch')}
          </button>
          <Link className="agent-text-button" href="/shop">
            {t('explore')}
          </Link>
        </aside>
        <section className="agent-workspace-chat" aria-label={t('workspaceLabel')}>
          <header className="agent-panel-header">
            <div className="agent-avatar" aria-hidden="true">
              ✦
            </div>
            <div>
              <h2>{t('name')}</h2>
              <p>{t('workspaceNote')}</p>
            </div>
            <span className="agent-store-badge">{t('storeScope')}</span>
          </header>
          <AssistantConversation full key={epoch} />
        </section>
      </div>
    </StoreLayout>
  );
}
