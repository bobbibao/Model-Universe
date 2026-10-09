import type { ReactNode } from 'react';

interface CardDataStatsProps {
  title: string;
  total: string;
  rate: string;
  levelUp?: boolean;
  levelDown?: boolean;
  children: ReactNode;
}

export default function CardDataStats({ title, total, rate, levelUp, levelDown, children }: CardDataStatsProps) {
  return (
    <div className="admin-kpi">
      <div className="flex items-center justify-between gap-3">
        <div className="admin-kpi-icon">{children}</div>
        {rate && (
          <span
            className={`admin-kpi-trend flex items-center gap-1 font-medium ${levelUp ? 'text-meta-3' : levelDown ? 'text-meta-5' : ''}`}
          >
            {rate}
            {(levelUp || levelDown) && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d={levelUp ? 'M12 20V4 m-6 6 6-6 6 6' : 'M12 4v16 m-6-6 6 6 6-6'} />
              </svg>
            )}
          </span>
        )}
      </div>
      <div className="mt-5">
        <h4 className="font-bold">{total}</h4>
        <span className="admin-kpi-label">{title}</span>
      </div>
    </div>
  );
}
