import type { ReactNode } from 'react';
import AdminIcon from '@/components/Admin/AdminIcon';

export default function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="store-empty-state">
      <span className="store-empty-icon" aria-hidden="true">
        <AdminIcon name={icon} size={32} />
      </span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      <div className="store-empty-actions">{children}</div>
    </div>
  );
}
