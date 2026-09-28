'use client';

import Api from './Api';
import { DASHBOARD_API } from './endpoint';
import type {
  CategoryInventory,
  DashboardSummary,
  Distributions,
  GenderRatio,
  MonthlyStats,
  RecentOrder,
  TopCustomer,
  TopProduct,
} from '@/shared/types/dashboard';

const get = async <T>(url: string, params?: object): Promise<T | undefined> => {
  try {
    const response = await Api.get(url, { params });
    return response.data;
  } catch (error) {
    return undefined;
  }
};

export default class DashboardApi {
  static getSummary() {
    return get<DashboardSummary>(DASHBOARD_API.GET_SUMMARY);
  }

  static getMonthly(months: number) {
    return get<MonthlyStats[]>(DASHBOARD_API.GET_MONTHLY, { months });
  }

  static getInventoryByCategory() {
    return get<CategoryInventory[]>(DASHBOARD_API.GET_INVENTORY_BY_CATEGORY);
  }

  static getGenderRatio() {
    return get<GenderRatio>(DASHBOARD_API.GET_GENDER_RATIO);
  }

  static getRecentOrders(limit: number) {
    return get<RecentOrder[]>(DASHBOARD_API.GET_RECENT_ORDERS, { limit });
  }

  static getTopProducts(limit: number) {
    return get<TopProduct[]>(DASHBOARD_API.GET_TOP_PRODUCTS, { limit });
  }

  static getTopCustomers(limit: number) {
    return get<TopCustomer[]>(DASHBOARD_API.GET_TOP_CUSTOMERS, { limit });
  }

  static getDistributions() {
    return get<Distributions>(DASHBOARD_API.GET_DISTRIBUTIONS);
  }
}
