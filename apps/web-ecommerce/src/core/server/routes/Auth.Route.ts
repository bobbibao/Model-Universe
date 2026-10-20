// API path prefixes (relative to /api). A prefix matches the path itself and anything below it.

// Require an authenticated user.
export const protectedRoutes: string[] = [
  '/users',
  '/auth/change-password',
  '/auth/step-up',
  '/wishlist',
  '/coupons',
  '/orders',
  '/checkout',
  '/reviews',
  '/returns',
  '/reservations',
  '/loyalty',
  '/buyback',
  '/pawn',
  '/evidence',
  '/partners',
  '/addresses',
  '/notifications',
  '/vouchers',
  '/promotions/checkin',
  '/promotions/wheel',
  '/promotions/missions',
  '/promotions/vouchers',
  '/promotions/perks',
];

// Require an authenticated user with the ADMIN role.
export const adminRoutes: string[] = ['/admin'];
