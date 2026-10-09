export const adminNavigation = [
  {
    name: 'overview',
    items: [
      { label: 'dashboard', route: '/admin/dashboard', icon: 'dashboard' },
      {
        label: 'charts',
        route: '/admin/charts/bar',
        icon: 'chart',
        children: [
          { label: 'bar', route: '/admin/charts/bar' },
          { label: 'pie', route: '/admin/charts/pie' },
          { label: 'line', route: '/admin/charts/line' },
        ],
      },
    ],
  },
  {
    name: 'operations',
    items: [
      {
        label: 'products',
        route: '/admin/products',
        icon: 'box',
        children: [
          { label: 'catalog', route: '/admin/products' },
          { label: 'categories', route: '/admin/categories' },
          { label: 'stock', route: '/admin/stock' },
          { label: 'coupons', route: '/admin/coupons' },
        ],
      },
      {
        label: 'orders',
        route: '/admin/orders',
        icon: 'orders',
        children: [
          { label: 'orderList', route: '/admin/orders' },
          { label: 'support', route: '/admin/returns' },
        ],
      },
      {
        label: 'customersContact',
        route: '/admin/customers',
        icon: 'users',
        children: [
          { label: 'customers', route: '/admin/customers' },
          { label: 'contacts', route: '/admin/contacts' },
        ],
      },
      { label: 'membership', route: '/admin/loyalty', icon: 'spark' },
      { label: 'reservations', route: '/admin/reservations', icon: 'calendar' },
      { label: 'buyback', route: '/admin/buyback', icon: 'exchange' },
      { label: 'pawn', route: '/admin/pawn', icon: 'shield' },
      { label: 'partners', route: '/admin/partners', icon: 'users' },
      { label: 'partnerListings', route: '/admin/partner-listings', icon: 'box' },
      { label: 'suppliers', route: '/admin/suppliers', icon: 'truck' },
      { label: 'policies', route: '/admin/commerce/policies', icon: 'shield' },
    ],
  },
  { name: 'marketing', items: [{ label: 'adminCampaigns', route: '/admin/marketing', icon: 'megaphone' }] },
  {
    name: 'agent',
    items: [
      {
        label: 'approvalsWork',
        route: '/admin/agent/inbox',
        icon: 'spark',
        activeRoutes: ['/admin/agent/threads'],
        children: [
          { label: 'inbox', route: '/admin/agent/inbox' },
          { label: 'copilot', route: '/admin/agent/copilot' },
          { label: 'tasks', route: '/admin/agent/tasks' },
          { label: 'activity', route: '/admin/agent/activity' },
        ],
      },
      {
        label: 'growthImpact',
        route: '/admin/agent/growth',
        icon: 'chart',
        children: [
          { label: 'growth', route: '/admin/agent/growth' },
          { label: 'campaigns', route: '/admin/agent/campaigns' },
          { label: 'market', route: '/admin/agent/market' },
          { label: 'impact', route: '/admin/agent/impact' },
        ],
      },
      {
        label: 'knowledgeGovernance',
        route: '/admin/agent/knowledge',
        icon: 'book',
        children: [
          { label: 'knowledge', route: '/admin/agent/knowledge' },
          { label: 'audit', route: '/admin/agent/audit' },
          { label: 'settings', route: '/admin/agent/settings' },
        ],
      },
    ],
  },
];

// The palette and header share destinations with the sidebar, including nested pages.
export const adminDestinations = adminNavigation.flatMap((group) =>
  group.items.flatMap((item) =>
    'children' in item && item.children
      ? item.children.map((child) => ({ ...child, group: group.name }))
      : [{ label: item.label, route: item.route, group: group.name }],
  ),
);

export function adminDestination(pathname: string) {
  return [...adminDestinations]
    .sort((a, b) => b.route.length - a.route.length)
    .find((item) => pathname === item.route || pathname.startsWith(`${item.route}/`));
}
