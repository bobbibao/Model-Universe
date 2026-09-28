'use client';

import { useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DonutChart from '@/components/Charts/DonutChart';
import { ORDER_STATUS_LABELS } from '@/components/OrderStatusBadge';
import DashboardApi from '@/core/client/api/Dashboard';
import type { Distributions } from '@/shared/types/dashboard';
import type { OrderStatus } from '@/shared/types/order';

const ROLE_LABELS: Record<string, string> = { ADMIN: 'Quản trị viên', USER: 'Khách hàng' };
const STATUS_COLORS: Record<OrderStatus, string> = {
  PROCESSING: '#FFA70B',
  SHIPPED: '#259AE6',
  DELIVERED: '#10B981',
  CANCELLED: '#FB5454',
};

const PieCharts = () => {
  const [data, setData] = useState<Distributions>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    DashboardApi.getDistributions().then((result) => {
      setData(result);
      setLoading(false);
    });
  }, []);

  const orderStatus = data?.orderStatus || [];

  return (
    <>
      <Breadcrumb pageName="Biểu đồ tròn" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 2xl:gap-7.5">
        <DonutChart
          title="Tỷ lệ trạng thái đơn hàng"
          labels={orderStatus.map((slice) => ORDER_STATUS_LABELS[slice.label as OrderStatus] || slice.label)}
          values={orderStatus.map((slice) => slice.value)}
          colors={orderStatus.map((slice) => STATUS_COLORS[slice.label as OrderStatus] || '#8A99AF')}
          loading={loading}
        />
        <DonutChart
          title="Tỷ lệ sản phẩm theo danh mục"
          subtitle="Sản phẩm đang bán"
          type="pie"
          labels={(data?.categoryShare || []).map((slice) => slice.label)}
          values={(data?.categoryShare || []).map((slice) => slice.value)}
          loading={loading}
        />
        <DonutChart
          title="Tình trạng tồn kho"
          subtitle="Sản phẩm đang bán"
          labels={['Còn hàng', 'Hết hàng']}
          values={data ? [data.stockAvailability.inStock, data.stockAvailability.outOfStock] : []}
          colors={['#10B981', '#FB5454']}
          loading={loading}
        />
        <DonutChart
          title="Quản trị viên và khách hàng"
          labels={(data?.userRoles || []).map((slice) => ROLE_LABELS[slice.label] || slice.label)}
          values={(data?.userRoles || []).map((slice) => slice.value)}
          colors={['#3C50E0', '#F0B90B']}
          loading={loading}
        />
      </div>
    </>
  );
};

export default PieCharts;
