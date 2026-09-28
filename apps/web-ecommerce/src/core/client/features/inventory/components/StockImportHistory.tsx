'use client';

import { useCallback, useEffect, useState } from 'react';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import Modal from '@/components/Modal/Modal';
import StockImportApi from '@/core/client/api/StockImport';
import { formatVND } from '@/shared/server/utils/utils';
import type { Pagination } from '@/shared/types/pagination';
import type { StockImport } from '@/shared/types/inventory';

const PAGE_SIZE = 10;

const totalQuantity = (stockImport: StockImport) =>
  (stockImport.items || []).reduce((sum, item) => sum + item.quantity, 0);

// Past goods receipts; `refreshKey` changes after a new import is recorded.
const StockImportHistory = ({ refreshKey }: { refreshKey: number }) => {
  const [imports, setImports] = useState<StockImport[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StockImport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await StockImportApi.getStockImports({ page, per_page: PAGE_SIZE });
    setImports(result?.data || []);
    setPagination(result?.pagination);
    setLoading(false);
  }, [page]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const columns: DataTableColumn<StockImport>[] = [
    { key: 'id', header: 'Mã phiếu', render: (item) => `#${item.id}` },
    { key: 'createdAt', header: 'Ngày nhập', render: (item) => new Date(item.createdAt).toLocaleString('vi-VN') },
    { key: 'supplier', header: 'Nhà cung cấp', render: (item) => item.supplier?.name || '—' },
    {
      key: 'items',
      header: 'Sản phẩm / Số lượng',
      render: (item) => `${item.items?.length || 0} / ${totalQuantity(item)}`,
    },
    { key: 'totalCost', header: 'Tổng giá trị', render: (item) => formatVND(item.totalCost) },
    {
      key: 'creator',
      header: 'Người nhập',
      render: (item) => (item.creator ? `${item.creator.lastName} ${item.creator.firstName}` : '—'),
    },
  ];

  return (
    <>
      <DataTable
        title="Lịch sử nhập kho"
        columns={columns}
        data={imports}
        rowKey={(item) => item.id}
        loading={loading}
        emptyText="Chưa có phiếu nhập kho nào"
        onRowClick={setSelected}
        pagination={pagination}
        onPageChange={setPage}
      />
      <Modal open={!!selected} title={`Phiếu nhập #${selected?.id}`} onClose={() => setSelected(null)} size="lg">
        {selected && (
          <div className="flex flex-col gap-4">
            <p>
              <span className="text-body">Nhà cung cấp:</span> {selected.supplier?.name} ·{' '}
              <span className="text-body">Ngày nhập:</span> {new Date(selected.createdAt).toLocaleString('vi-VN')}
            </p>
            {selected.note && (
              <p>
                <span className="text-body">Ghi chú:</span> {selected.note}
              </p>
            )}
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-stroke text-sm text-body dark:border-strokedark">
                  <th className="py-2">Sản phẩm</th>
                  <th className="py-2">SKU</th>
                  <th className="py-2 text-right">Số lượng</th>
                  <th className="py-2 text-right">Giá nhập</th>
                  <th className="py-2 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {(selected.items || []).map((item) => (
                  <tr key={item.id} className="border-b border-stroke dark:border-strokedark">
                    <td className="py-2 pr-2">{item.product?.name}</td>
                    <td className="py-2 pr-2">{item.product?.sku}</td>
                    <td className="py-2 text-right">{item.quantity}</td>
                    <td className="py-2 text-right">{formatVND(item.importPrice)}</td>
                    <td className="py-2 text-right font-semibold">{formatVND(item.importPrice * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-right text-lg font-bold">Tổng: {formatVND(selected.totalCost)}</p>
          </div>
        )}
      </Modal>
    </>
  );
};

export default StockImportHistory;
