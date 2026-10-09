'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from '@/i18n/navigation';
import Modal from '@/components/Modal/Modal';
import AdminIcon from './AdminIcon';
import { adminDestinations } from './navigation';

export default function AdminCommandMenu() {
  const t = useTranslations('adminWorkspace'),
    navigation = useTranslations('adminNavigation');
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const close = () => setOpen(false);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        if (document.querySelector('.admin-workspace-body[inert]')) return;
        if (
          !open &&
          Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).some(
            (dialog) => dialog.getClientRects().length > 0,
          )
        )
          return;
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [open]);
  useEffect(() => {
    if (open) {
      setQuery('');
      input.current?.focus();
    }
  }, [open]);
  const normalized = query
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/[\u0300-\u036f]/g, '');
  const results = adminDestinations.filter((item) =>
    `${navigation(item.label)} ${navigation(item.group)} ${item.route}`
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/đ/g, 'd')
      .replace(/[\u0300-\u036f]/g, '')
      .includes(normalized),
  );
  return (
    <>
      <button
        type="button"
        className="admin-search-trigger"
        onClick={() => setOpen(true)}
        aria-label={t('searchPages')}
      >
        <AdminIcon name="search" size={17} />
        <span>{t('searchPages')}</span>
        <kbd>⌘ / Ctrl K</kbd>
      </button>
      <Modal open={open} onClose={close} title={t('searchPages')}>
        <div className="admin-command">
          <input
            ref={input}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t('searchPages')}
            placeholder={t('searchPlaceholder')}
            className="admin-command-input"
          />
          <p className="admin-command-count" role="status">
            {t('destinations', { count: results.length })}
          </p>
          <ul className="admin-command-results">
            {results.map((item) => (
              <li key={item.route}>
                <Link href={item.route} onClick={close}>
                  <span>
                    <small>{navigation(item.group)}</small>
                    {navigation(item.label)}
                  </span>
                  <AdminIcon name="arrow" size={16} />
                </Link>
              </li>
            ))}
          </ul>
          {!results.length && <p className="admin-command-empty">{t('noPages')}</p>}
        </div>
      </Modal>
    </>
  );
}
