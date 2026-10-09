'use client';

import { Children, useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

export default function OperationPanels({ labels, children }: { labels: string[]; children: ReactNode }) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const t = useTranslations('experience');
  return (
    <section className="studio-operation-panels">
      <div className="studio-operation-switcher" role="group" aria-label={t('formTools')}>
        {labels.map((label, index) => (
          <button
            key={label}
            id={`${id}-${index}`}
            type="button"
            aria-pressed={selected === index}
            aria-controls={`${id}-panel-${index}`}
            onClick={() => setSelected(index)}
          >
            {label}
          </button>
        ))}
      </div>
      {Children.toArray(children).map((child, index) => (
        <div key={index} id={`${id}-panel-${index}`} aria-labelledby={`${id}-${index}`} hidden={selected !== index}>
          {child}
        </div>
      ))}
    </section>
  );
}
