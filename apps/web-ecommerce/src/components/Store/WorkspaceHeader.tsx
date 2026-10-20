import type { ReactNode } from 'react';
import AdminIcon from '@/components/Admin/AdminIcon';

// A page title as large stores set it: the title, an optional count chip, one muted line, and actions on the right.
export default function WorkspaceHeader({
  title,
  description,
  icon,
  count,
  actions,
}: {
  title: string;
  description?: string;
  icon?: string;
  count?: string;
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
          {count && <span className="store-heading-count">{count}</span>}
        </h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="store-workspace-heading-actions">{actions}</div>}
    </header>
  );
}
