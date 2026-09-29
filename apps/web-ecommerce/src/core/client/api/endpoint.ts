'use client';

export const AUTH_API = {
  REQUEST_REGISTER_OTP: '/auth/register/request-otp',
  VERIFY_REGISTER_OTP: '/auth/register/verify-otp',
  REGISTER: '/auth/register',
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  ME: '/auth/me',
  CHANGE_PASSWORD: '/auth/change-password',
};

export const USER_API = {
  UPDATE_ME: '/users/me',
};

export const ADMIN_USER_API = {
  GET_USERS: '/admin/users',
  UPDATE_ROLE: (userId: number) => `/admin/users/${userId}/role`,
  UPDATE_STATUS: (userId: number) => `/admin/users/${userId}/status`,
};

export const PRODUCT_API = {
  GET_PRODUCTS: '/products',
  GET_FILTER_OPTIONS: '/products/filters',
  GET_PRODUCT: (productId: number) => `/products/${productId}`,
  GET_REVIEWS: (productId: number) => `/products/${productId}/reviews`,
};

export const ADMIN_PRODUCT_API = {
  GET_PRODUCTS: '/admin/products',
  GET_PRODUCT: (productId: number) => `/admin/products/${productId}`,
  CREATE_PRODUCT: '/admin/products',
  UPDATE_PRODUCT: (productId: number) => `/admin/products/${productId}`,
  DELETE_PRODUCT: (productId: number) => `/admin/products/${productId}`,
};

export const CATEGORY_API = {
  GET_CATEGORIES: '/categories',
};

export const ADMIN_CATEGORY_API = {
  GET_CATEGORIES: '/admin/categories',
  CREATE_CATEGORY: '/admin/categories',
  UPDATE_CATEGORY: (categoryId: number) => `/admin/categories/${categoryId}`,
  DELETE_CATEGORY: (categoryId: number) => `/admin/categories/${categoryId}`,
};

export const ADMIN_SUPPLIER_API = {
  GET_SUPPLIERS: '/admin/suppliers',
  GET_SUPPLIER_OPTIONS: '/admin/suppliers/options',
  CREATE_SUPPLIER: '/admin/suppliers',
  UPDATE_SUPPLIER: (supplierId: number) => `/admin/suppliers/${supplierId}`,
  DELETE_SUPPLIER: (supplierId: number) => `/admin/suppliers/${supplierId}`,
};

export const UPLOAD_API = {
  UPLOAD_IMAGES: '/admin/uploads/images',
};

export const CART_API = {
  QUOTE: '/cart/quote',
};

export const WISHLIST_API = {
  GET_WISHLIST: '/wishlist',
  ADD_ITEM: '/wishlist',
  REMOVE_ITEM: (itemId: number) => `/wishlist/${itemId}`,
};

export const COUPON_API = {
  VALIDATE: (code: string) => `/coupons/${encodeURIComponent(code)}/validate`,
};

export const ADMIN_COUPON_API = {
  GET_COUPONS: '/admin/coupons',
  CREATE_COUPON: '/admin/coupons',
  UPDATE_COUPON: (couponId: number) => `/admin/coupons/${couponId}`,
  DELETE_COUPON: (couponId: number) => `/admin/coupons/${couponId}`,
};

export const ORDER_API = {
  PLACE_ORDER: '/orders',
  GET_MY_ORDERS: '/orders',
  GET_MY_ORDER: (orderId: number) => `/orders/${orderId}`,
  CANCEL_MY_ORDER: (orderId: number) => `/orders/${orderId}/cancel`,
};

export const ADMIN_ORDER_API = {
  GET_ORDERS: '/admin/orders',
  GET_ORDER: (orderId: number) => `/admin/orders/${orderId}`,
  UPDATE_STATUS: (orderId: number) => `/admin/orders/${orderId}/status`,
};

export const REVIEW_API = {
  GET_ELIGIBILITY: (productId: number) => `/reviews/eligibility/${productId}`,
  CREATE_REVIEW: '/reviews',
};

export const ADMIN_STOCK_IMPORT_API = {
  GET_STOCK_IMPORTS: '/admin/stock-imports',
  GET_STOCK_IMPORT: (stockImportId: number) => `/admin/stock-imports/${stockImportId}`,
  CREATE_STOCK_IMPORT: '/admin/stock-imports',
};

export const DASHBOARD_API = {
  GET_SUMMARY: '/admin/dashboard/summary',
  GET_MONTHLY: '/admin/dashboard/monthly',
  GET_INVENTORY_BY_CATEGORY: '/admin/dashboard/inventory-by-category',
  GET_GENDER_RATIO: '/admin/dashboard/gender-ratio',
  GET_RECENT_ORDERS: '/admin/dashboard/recent-orders',
  GET_TOP_PRODUCTS: '/admin/dashboard/top-products',
  GET_TOP_CUSTOMERS: '/admin/dashboard/top-customers',
  GET_DISTRIBUTIONS: '/admin/dashboard/distributions',
};

export const CONTACT_API = {
  SEND_MESSAGE: '/contact',
};

export const ADMIN_CONTACT_API = {
  GET_MESSAGES: '/admin/contacts',
  UPDATE_STATUS: (messageId: number) => `/admin/contacts/${messageId}/status`,
};

export const ADMIN_CI_API = {
  GET_IMPROVEMENTS: '/admin/ci/improvements',
  GET_IMPROVEMENT: (improvementId: string) => `/admin/ci/improvements/${encodeURIComponent(improvementId)}`,
  DECIDE: (improvementId: string) => `/admin/ci/improvements/${encodeURIComponent(improvementId)}/decision`,
  RUN_NOW: '/admin/ci/runs',
  GET_IMPACT: '/admin/ci/kpi/impact',
  GET_CASES: '/admin/ci/cases',
  GET_NOTIFICATIONS: '/admin/ci/notifications',
  MARK_NOTIFICATIONS_READ: '/admin/ci/notifications/read',
  GET_TASKS: '/admin/ci/tasks',
  UPDATE_TASK_STATUS: (taskId: number) => `/admin/ci/tasks/${taskId}/status`,
};

export const RETURN_API = {
  GET_FOR_ORDER: (orderId: number) => `/returns/orders/${orderId}`,
  CREATE: '/returns',
};

export const ADMIN_RETURN_API = {
  GET_RETURNS: '/admin/returns',
  GET_RETURN: (returnId: number) => `/admin/returns/${returnId}`,
  INTAKE: (returnId: number) => `/admin/returns/${returnId}/intake`,
  RESTOCK: (returnId: number, itemId: number) => `/admin/returns/${returnId}/items/${itemId}/restock`,
};
