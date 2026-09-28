import type { OrderStatus } from './order';

export type TrendMetric = {
  total: number;
  current: number;
  previous: number;
  change: number;
};

export type DashboardSummary = {
  revenue: TrendMetric;
  orders: TrendMetric;
  customers: TrendMetric;
  products: { total: number; outOfStock: number };
  pendingOrders: number;
};

export type MonthlyStats = {
  month: string;
  revenue: number;
  orders: number;
  discount: number;
  newCustomers: number;
  importCost: number;
};

export type CategoryInventory = { id: number; name: string; stock: number; sold: number };

export type GenderRatio = { male: number; female: number; unknown: number };

export type RecentOrder = {
  id: number;
  recipientName: string;
  total: number;
  status: OrderStatus;
  createdAt: string;
  quantity: number;
};

export type TopProduct = { productId: number; name: string; quantity: number; revenue: number };

export type TopCustomer = { userId: number; name: string; email: string; orders: number; spent: number };

export type ChartSlice = { label: string; value: number };

export type Distributions = {
  orderStatus: ChartSlice[];
  categoryShare: ChartSlice[];
  stockAvailability: { inStock: number; outOfStock: number };
  userRoles: ChartSlice[];
};
