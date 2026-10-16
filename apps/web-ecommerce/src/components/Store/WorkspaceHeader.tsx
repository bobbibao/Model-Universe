import type { ReactNode } from 'react';
import AdminIcon from '@/components/Admin/AdminIcon';

export default function WorkspaceHeader({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description?: string;
  icon?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="store-workspace-heading">
      <div className="store-workspace-heading-copy">
        <h1>
          {icon && (
            <span className="store-heading-icon" aria-hidden="true">
              <AdminIcon name={icon} size={22} />
            </span>
          )}
          {title}
        </h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="store-workspace-heading-actions">{actions}</div>}
    </header>
  );
}
