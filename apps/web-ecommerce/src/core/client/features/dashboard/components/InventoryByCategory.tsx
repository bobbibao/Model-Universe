'use client';

import ChartCard from '@/components/Charts/ChartCard';
import { toPercent } from '@/shared/client/utils/ChartUtils';
import type { CategoryInventory } from '@/shared/types/dashboard';

const MAX_ROWS = 8;

// Share of units still in stock (stock / (stock + sold)) per category.
const InventoryByCategory = ({ data, loading }: { data: CategoryInventory[]; loading: boolean }) => {
  const rows = data.filter((category) => category.stock + category.sold > 0).slice(0, MAX_ROWS);
  return (
    <ChartCard
      title="Tồn kho theo danh mục"
      subtitle="Tỷ lệ còn trong kho / (tồn kho + đã bán)"
      loading={loading}
      empty={!loading && rows.length === 0}
    >
      <div className="flex flex-col gap-4">
        {rows.map((category) => {
          const percent = toPercent(category.stock, category.stock + category.sold);
          return (
            <div key={category.id}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium text-black dark:text-white">{category.name}</span>
                <span className="text-body">
                  {category.stock} còn · {category.sold} đã bán · <strong>{percent}%</strong>
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-stroke dark:bg-strokedark">
                <div
                  className={`h-full rounded-full ${percent < 20 ? 'bg-danger' : 'bg-brand-hover'}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
};

export default InventoryByCategory;
