'use client';

import Link from '@/i18n/navigation';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import { formatVND } from '@/shared/server/utils/utils';
import type { RecentOrder } from '@/shared/types/dashboard';

// Latest orders.
const RecentOrders = ({ data, loading }: { data: RecentOrder[]; loading: boolean }) => (
  <section className="rounded-sm border border-stroke bg-white px-5 pb-5 pt-6 shadow-default dark:border-strokedark dark:bg-boxdark sm:px-7.5">
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-xl font-semibold text-black dark:text-white">Đơn hàng gần đây</h3>
      <Link href="/admin/orders" className="text-sm font-medium text-brand-hover hover:underline">
        Xem tất cả
      </Link>
    </div>
    {loading ? (
      <div className="flex h-40 items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    ) : data.length === 0 ? (
      <p className="py-10 text-center text-body">Chưa có đơn hàng</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-2 text-sm dark:bg-meta-4">
              <th className="px-3 py-3 font-medium">Mã đơn</th>
              <th className="px-3 py-3 font-medium">Khách hàng</th>
              <th className="px-3 py-3 font-medium">Số lượng</th>
              <th className="px-3 py-3 font-medium">Tổng tiền</th>
              <th className="px-3 py-3 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {data.map((order) => (
              <tr key={order.id} className="border-b border-stroke dark:border-strokedark">
                <td className="px-3 py-3">
                  <Link href={`/admin/orders/${order.id}`} className="font-medium text-brand-hover hover:underline">
                    #{order.id}
                  </Link>
                </td>
                <td className="px-3 py-3">{order.recipientName}</td>
                <td className="px-3 py-3">{order.quantity}</td>
                <td className="px-3 py-3">{formatVND(order.total)}</td>
                <td className="px-3 py-3">
                  <OrderStatusBadge status={order.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

export default RecentOrders;
